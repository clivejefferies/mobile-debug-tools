package dev.mobiledebugmcp.tracefixture;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;

final class SocketTraceClient {
    private SocketTraceClient() {}

    static int request(URL destination, int proxyPort, SSLContext context) throws IOException {
        int port = destination.getPort() == -1 ? 443 : destination.getPort();
        String authority = destination.getHost() + ":" + port;
        try (Socket tunnel = new Socket()) {
            tunnel.connect(new InetSocketAddress("127.0.0.1", proxyPort), 3000);
            tunnel.setSoTimeout(3000);
            send(tunnel, "CONNECT " + authority + " HTTP/1.1\r\nHost: " + authority + "\r\n\r\n");
            int connected = status(tunnel.getInputStream());
            if (connected != 200) throw new IOException("Proxy rejected CONNECT");
            try (SSLSocket client = (SSLSocket) context.getSocketFactory().createSocket(
                    tunnel, destination.getHost(), port, true)) {
                SSLParameters settings = client.getSSLParameters();
                settings.setEndpointIdentificationAlgorithm("HTTPS");
                client.setSSLParameters(settings);
                client.startHandshake();
                send(client, "GET " + destination.getFile() + " HTTP/1.1\r\nHost: " + authority
                    + "\r\nConnection: close\r\n\r\n");
                return status(client.getInputStream());
            }
        }
    }

    private static void send(Socket socket, String message) throws IOException {
        socket.getOutputStream().write(message.getBytes(StandardCharsets.US_ASCII));
    }

    private static int status(InputStream input) throws IOException {
        StringBuilder headers = new StringBuilder();
        while (headers.length() < 8192) {
            int next = input.read();
            if (next == -1) break;
            headers.append((char) next);
            int end = headers.length();
            if (end >= 4 && headers.substring(end - 4).equals("\r\n\r\n")) {
                String[] firstLine = headers.substring(0, headers.indexOf("\r\n")).split(" ", 3);
                if (firstLine.length < 2 || !firstLine[1].matches("[1-5][0-9]{2}")) break;
                return Integer.parseInt(firstLine[1]);
            }
        }
        throw new IOException("Invalid response");
    }
}
