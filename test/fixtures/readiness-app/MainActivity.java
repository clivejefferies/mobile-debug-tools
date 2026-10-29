package tools.mobiledebug.readinessfixture;
import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.widget.*;
import android.view.View;
public class MainActivity extends Activity {
  private int generation = 0;
  public void onCreate(Bundle state) {
    super.onCreate(state);
    LinearLayout layout = new LinearLayout(this);
    layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(32, 120, 32, 32);
    TextView ready = new TextView(this); ready.setText("Ready"); ready.setContentDescription("ready"); layout.addView(ready);
    TextView status = new TextView(this); status.setText("Idle"); layout.addView(status);
    ProgressBar loader = new ProgressBar(this); loader.setVisibility(View.GONE); layout.addView(loader);
    Button start = new Button(this); start.setText("Show loader"); start.setContentDescription("show-loader"); layout.addView(start);
    start.setOnClickListener(view -> {
      int current = ++generation; loader.setVisibility(View.VISIBLE); status.setText("Loading");
      new Handler(getMainLooper()).postDelayed(() -> { if (current == generation) { loader.setVisibility(View.GONE); status.setText("Done"); } }, 12000);
    });
    setContentView(layout);
  }
}
