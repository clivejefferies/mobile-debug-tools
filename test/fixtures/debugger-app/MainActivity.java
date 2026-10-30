package dev.mobiledebugmcp.debugfixture;
import android.app.Activity;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
  TextView status;
  @Override public void onCreate(Bundle saved) {
    super.onCreate(saved);
    LinearLayout layout = new LinearLayout(this); layout.setOrientation(1); layout.setPadding(0, 160, 0, 0);
    status = new TextView(this); status.setText("Ready"); layout.addView(status);
    Button button = new Button(this); button.setText("Calculate");
    button.setOnClickListener(v -> calculate(7)); layout.addView(button);
    Button late = new Button(this); late.setText("Late class");
    late.setOnClickListener(v -> {
      try { Class.forName("dev.mobiledebugmcp.debugfixture.LateWork").getDeclaredMethod("work").invoke(null); }
      catch (Exception e) { status.setText("Late failed"); }
    }); layout.addView(late);
    Button noLocals = new Button(this); noLocals.setText("No locals");
    noLocals.setOnClickListener(v -> {
      try { Class.forName("dev.mobiledebugmcp.debugfixture.NoLocals").getDeclaredMethod("work").invoke(null); }
      catch (Exception e) { status.setText("Metadata failed"); }
    }); layout.addView(noLocals);
    setContentView(layout);
  }
  void calculate(int seed) {
    int known = seed + 35;
    String longText = new String(new char[300]).replace('\0', 'x');
    Object object = new Object();
    int answer = increment(known); // BREAK_CALCULATE
    status.setText("Result " + answer); // BREAK_RESULT
  }
  int increment(int value) {
    int result = value + 1; // BREAK_INCREMENT
    return result;
  }
}

class LateWork {
  public static void work() {
    int local = 99; // BREAK_LATE
    android.util.Log.i("DebugFixture", "late " + local);
  }
}
