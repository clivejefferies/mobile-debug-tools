package dev.mobiledebugmcp.latencyfixture;

import android.app.Activity;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

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
    @Override public void onCreate(Bundle state) { super.onCreate(state); home(); }
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
