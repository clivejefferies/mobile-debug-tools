package dev.mobiledebugmcp.latencyfixture;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

public final class MainActivity extends Activity {
    private static final class Selectors {
        static final String SAVED_SESSION = "saved-session";
        static final String IDLE_DETAIL = "idle-detail";
        static final String ACTIVE_DETAIL = "active-detail";
        static final String ACTIVATE = "activate";
        static final String DEACTIVATE = "deactivate";
        static final String HOME = "home";
        static final String HOME_SCREEN = "home-screen";
        static final String STOP = "stop";
        static final String STOPPED = "stopped";
    }
    private boolean active = false;
    private LinearLayout layout;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        String networkBaseUrl = getIntent().getStringExtra("networkBaseUrl");
        String networkRunId = getIntent().getStringExtra("networkRunId");
        if (networkBaseUrl != null && networkRunId != null) networkScreen(networkBaseUrl, networkRunId);
        else home();
    }
    private void networkScreen(String baseUrl, String runId) {
        layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(32, 100, 32, 32);
        setContentView(layout);
        TextView loading = new TextView(this);
        loading.setText("Loading");
        loading.setContentDescription("loading");
        layout.addView(loading);
        TextView ready = new TextView(this);
        ready.setText("Ready");
        ready.setContentDescription("ready");
        ready.setVisibility(android.view.View.GONE);
        layout.addView(ready);
        TextView value = new TextView(this);
        value.setContentDescription("value");
        value.setVisibility(android.view.View.GONE);
        layout.addView(value);
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                String encodedRunId = URLEncoder.encode(runId, "UTF-8");
                connection = (HttpURLConnection) new URL(baseUrl + "/data?run_id=" + encodedRunId).openConnection();
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(30000);
                String response;
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream()))) {
                    response = reader.readLine();
                }
                String[] fields = response == null ? new String[0] : response.split("\\|", 2);
                if (fields.length == 2 && runId.equals(fields[0])) {
                    runOnUiThread(() -> {
                        ready.setVisibility(android.view.View.VISIBLE);
                        value.setText(fields[1]);
                        value.setVisibility(android.view.View.VISIBLE);
                    });
                }
            } catch (Exception ignored) {
                // A failed local fixture request leaves the screen in its observable loading state.
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }
    private void screen(String id) {
        layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(32, 100, 32, 32);
        setContentView(layout);
        TextView title = new TextView(this);
        title.setText(id);
        title.setContentDescription(id);
        layout.addView(title);
    }
    private void button(String id, Runnable action) {
        Button button = new Button(this);
        button.setText(id);
        button.setContentDescription(id);
        button.setOnClickListener(v -> action.run());
        layout.addView(button, new LinearLayout.LayoutParams(-1, 120));
    }
    private void home() { screen(Selectors.HOME_SCREEN); button(Selectors.SAVED_SESSION, () -> detail()); }
    private void detail() {
        screen(active ? Selectors.ACTIVE_DETAIL : Selectors.IDLE_DETAIL);
        button(active ? Selectors.DEACTIVATE : Selectors.ACTIVATE, () -> { active = !active; detail(); });
        button(Selectors.HOME, () -> home());
        button(Selectors.STOP, () -> { active = false; screen(Selectors.STOPPED); });
    }
}
