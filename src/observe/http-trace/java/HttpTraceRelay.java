import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.EOFException;
import java.io.FileDescriptor;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.BindException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

public final class HttpTraceRelay {
    private static final int OPEN = -1;
    private static final int CLOSE = -2;
    private static final int FIN = -3;
    private static final int MAX_FRAME = 8192;
    private static final int MAX_CONNECTIONS = 8;
    private static final int LOOPBACK_PORT = 48165;
    private static final int IDLE_TIMEOUT_MS = 30000;

    private static final DataOutputStream OUTPUT = new DataOutputStream(
        new BufferedOutputStream(new FileOutputStream(FileDescriptor.out)));
    private static final ConcurrentHashMap<Integer, Channel> CHANNELS = new ConcurrentHashMap<>();
    private static final Semaphore SLOTS = new Semaphore(MAX_CONNECTIONS);

    private static synchronized void send(int id, int size, byte[] bytes) throws IOException {
        OUTPUT.writeInt(id);
        OUTPUT.writeInt(size);
        if (bytes != null) OUTPUT.write(bytes, 0, size);
        OUTPUT.flush();
    }

    private static final class Channel {
        private static final byte[] END = new byte[0];
        private final int id;
        private final Socket socket;
        private final ArrayBlockingQueue<byte[]> incoming = new ArrayBlockingQueue<>(8);
        private final Thread reader;
        private final Thread writer;
        private boolean closed;
        private int completedDirections;

        Channel(int id, Socket socket) {
            this.id = id;
            this.socket = socket;
            reader = new Thread(this::read, "trace-read");
            writer = new Thread(this::write, "trace-write");
        }

        void start() {
            reader.start();
            writer.start();
        }

        private void read() {
            byte[] buffer = new byte[MAX_FRAME];
            try {
                InputStream input = socket.getInputStream();
                int count;
                while ((count = input.read(buffer)) > 0) send(id, count, buffer);
                send(id, FIN, null);
                directionFinished();
            } catch (IOException error) {
                close(true);
            }
        }

        private void write() {
            try {
                while (true) {
                    byte[] bytes = incoming.take();
                    if (bytes == END) break;
                    socket.getOutputStream().write(bytes);
                }
                socket.shutdownOutput();
                directionFinished();
            } catch (IOException error) {
                close(true);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }

        private synchronized void directionFinished() {
            if (++completedDirections == 2) close(true);
        }

        void enqueue(byte[] bytes) {
            try {
                if (!incoming.offer(bytes, 5, TimeUnit.SECONDS)) close(true);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                close(true);
            }
        }

        void finishOutput() {
            enqueue(END);
        }

        synchronized void close(boolean notifyHost) {
            if (closed) return;
            closed = true;
            CHANNELS.remove(id);
            try {
                socket.close();
            } catch (IOException ignored) {
                // The relay owns the socket and has no other user of it.
            }
            writer.interrupt();
            incoming.clear();
            SLOTS.release();
            if (notifyHost) {
                try {
                    send(id, CLOSE, null);
                } catch (IOException error) {
                    System.exit(1);
                }
            }
        }
    }

    private static void accept(ServerSocket listener) {
        int next = 0;
        try {
            while (true) {
                Socket socket = listener.accept();
                if (!SLOTS.tryAcquire()) {
                    socket.close();
                    continue;
                }
                socket.setSoTimeout(IDLE_TIMEOUT_MS);
                int id = ++next;
                Channel channel = new Channel(id, socket);
                CHANNELS.put(id, channel);
                send(id, OPEN, null);
                channel.start();
            }
        } catch (IOException error) {
            if (!listener.isClosed()) {
                System.err.println("HTTP trace relay accept failed: " + error.getClass().getSimpleName());
                System.exit(1);
            }
        }
    }

    private static void pump(DataInputStream input) throws IOException {
        while (true) {
            int id;
            try {
                id = input.readInt();
            } catch (EOFException end) {
                return;
            }
            int size = input.readInt();
            if (id <= 0 || (size <= 0 && size != FIN && size != CLOSE) || size > MAX_FRAME) {
                throw new IOException("invalid relay frame");
            }
            Channel channel = CHANNELS.get(id);
            if (size == CLOSE) {
                if (channel != null) channel.close(false);
            } else if (size == FIN) {
                if (channel != null) channel.finishOutput();
            } else {
                byte[] data = new byte[size];
                input.readFully(data);
                if (channel != null) channel.enqueue(data);
            }
        }
    }

    public static void main(String[] args) {
        int status = 0;
        try (ServerSocket listener = new ServerSocket()) {
            listener.setReuseAddress(true);
            listener.bind(new InetSocketAddress("127.0.0.1", LOOPBACK_PORT));
            send(0, listener.getLocalPort(), null);
            new Thread(() -> accept(listener), "trace-accept").start();
            pump(new DataInputStream(new BufferedInputStream(new FileInputStream(FileDescriptor.in))));
        } catch (BindException error) {
            try { send(0, 0, null); } catch (IOException ignored) { /* The host will observe EOF. */ }
            status = 1;
        } catch (IOException error) {
            System.err.println("HTTP trace relay failed: " + error.getClass().getSimpleName());
            status = 1;
        } finally {
            for (Channel channel : CHANNELS.values()) channel.close(false);
        }
        System.exit(status);
    }
}
