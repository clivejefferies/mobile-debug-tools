package dev.mobiledebugmcp.debugfixture;
public class NoLocals {
  public static void work() {
    int hidden = 5; // BREAK_NO_LOCALS
    android.util.Log.i("DebugFixture", "metadata " + hidden);
  }
}
