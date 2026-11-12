package dev.mobiledebugmcp.tracefixture;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Bundle;
import android.widget.TextView;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import org.json.JSONArray;
import org.json.JSONObject;

public final class TraceActivity extends Activity {
    private static final String HOST = "trace.test";
    private File directory;

    private final BroadcastReceiver trigger = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            PendingResult result = goAsync();
            new Thread(() -> {
                try {
                    result.setResultData(request(intent.getIntExtra("originPort", 0)));
                } catch (Exception error) {
                    result.setResultData(error.getClass().getSimpleName());
                } finally {
                    result.finish();
                }
            }).start();
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        TextView view = new TextView(this);
        view.setText("HTTP trace fixture");
        setContentView(view);
        directory = new File(getFilesDir(), "http-trace");
        try {
            Files.createDirectories(directory.toPath());
            Files.write(new File(directory, "version").toPath(), new byte[] { '1' });
        } catch (IOException error) {
            throw new IllegalStateException(error);
        }
        registerReceiver(trigger, new IntentFilter(getPackageName() + ".REQUEST"), "android.permission.DUMP", null, RECEIVER_EXPORTED);
    }

    @Override public void onDestroy() {
        unregisterReceiver(trigger);
        super.onDestroy();
    }

    private JSONObject configForHost() {
        File[] files = directory.listFiles((parent, name) -> name.matches("[a-z0-9-]{1,64}\\.json"));
        if (files == null) return null;
        JSONObject active = null;
        for (File file : files) {
            try {
                if (file.length() > 16384) return null;
                JSONObject candidate = new JSONObject(new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
                if (candidate.getInt("version") != 1 || !file.getName().equals(candidate.getString("traceId") + ".json")) {
                    return null;
                }
                if (candidate.getLong("expiresAt") <= System.currentTimeMillis()) continue;
                if (active != null) return null;
                active = candidate;
            } catch (Exception error) {
                return null;
            }
        }
        return active;
    }

    private boolean includesHost(JSONArray hosts, String host) throws Exception {
        for (int index = 0; index < hosts.length(); index++) {
            if (host.equals(hosts.getString(index))) return true;
        }
        return false;
    }

    private String request(int originPort) throws Exception {
        if (originPort < 0 || originPort > 65535) return "invalid-origin";
        URL destination = originPort == 0
            ? new URL("https://" + HOST + "/fixture")
            : new URL("https://localhost:" + originPort + "/fixture");
        JSONObject configuration = configForHost();
        if (configuration == null) return "normal-route";
        int port;
        SSLContext tls;
        try {
            if (!"127.0.0.1".equals(configuration.getString("proxyHost"))
                    || !includesHost(configuration.getJSONArray("allowedHosts"), destination.getHost())) return "normal-route";
            port = configuration.getInt("proxyPort");
            if (port < 1 || port > 65535) return "normal-route";
            byte[] pem = configuration.getString("caCertificate").getBytes(StandardCharsets.US_ASCII);
            Certificate certificate = CertificateFactory.getInstance("X.509")
                .generateCertificate(new ByteArrayInputStream(pem));
            KeyStore trust = KeyStore.getInstance(KeyStore.getDefaultType());
            trust.load(null);
            trust.setCertificateEntry("trace-session", certificate);
            TrustManagerFactory manager = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            manager.init(trust);
            tls = SSLContext.getInstance("TLS");
            tls.init(null, manager.getTrustManagers(), null);
        } catch (Exception error) {
            return "normal-route";
        }
        if (getPackageName().endsWith(".socket")) {
            return "trace-status-" + SocketTraceClient.request(destination, port, tls);
        }
        Proxy proxy = new Proxy(Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", port));
        HttpsURLConnection connection = (HttpsURLConnection) destination.openConnection(proxy);
        connection.setSSLSocketFactory(tls.getSocketFactory());
        connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Connection", "close");
        connection.setConnectTimeout(3000);
        connection.setReadTimeout(3000);
        try {
            return "trace-status-" + connection.getResponseCode();
        } finally {
            connection.disconnect();
        }
    }
}
