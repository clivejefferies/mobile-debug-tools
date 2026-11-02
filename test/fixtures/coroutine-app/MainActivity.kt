package dev.mobiledebugmcp.coroutinefixture

import android.app.Activity
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.util.concurrent.Executors
import kotlinx.coroutines.*

class MainActivity : Activity() {
  private val first = Executors.newSingleThreadExecutor { Thread(it, "fixture-first") }.asCoroutineDispatcher()
  private val second = Executors.newSingleThreadExecutor { Thread(it, "fixture-second") }.asCoroutineDispatcher()
  private val scope = CoroutineScope(SupervisorJob() + first)
  private var gate = CompletableDeferred<Unit>()
  private var job: Job? = null
  private lateinit var status: TextView

  override fun onCreate(saved: Bundle?) {
    super.onCreate(saved)
    val layout = LinearLayout(this)
    layout.orientation = LinearLayout.VERTICAL
    layout.setPadding(0, 160, 0, 0)
    status = TextView(this)
    status.text = "Coroutine ready"
    layout.addView(status)
    fun button(label: String, action: () -> Unit) {
      val button = Button(this)
      button.text = label
      button.setOnClickListener { action() }
      layout.addView(button)
    }
    button("Complete run") { start(false) }
    button("Cancellation run") { start(true) }
    button("Release gate") { gate.complete(Unit) }
    button("Cancel job") { job?.cancel() }
    setContentView(layout)
  }

  private fun show(text: String) { runOnUiThread { status.text = text } }

  private fun start(cancel: Boolean) {
    if (job?.isActive == true) { show("Coroutine busy"); return }
    gate = CompletableDeferred()
    job = scope.launch {
      if (cancel) cancelWork() else completeWork()
    }
  }

  private suspend fun completeWork() {
    val firstThread = Thread.currentThread().name
    val known = 42
    check(firstThread == "fixture-first") // BREAK_BEFORE
    // Queued on the same single-thread executor: runs only after gate.await yields.
    first.executor.execute { show("Coroutine waiting") }
    gate.await() // BREAK_SUSPEND
    val after = known + 1 // BREAK_AFTER
    withContext(second) {
      val dispatcherThread = Thread.currentThread().name
      val nested = async { helper(after) } // BREAK_DISPATCH
      check(dispatcherThread == "fixture-second")
      val answer = nested.await()
      show("Coroutine result $answer") // BREAK_RESULT
    }
  }

  private fun helper(value: Int): Int {
    val result = increment(value) // BREAK_HELPER
    return result // BREAK_HELPER_RETURN
  }

  private fun increment(value: Int): Int {
    val result = value + 1 // BREAK_INCREMENT
    return result // BREAK_INCREMENT_RETURN
  }

  private suspend fun cancelWork() = coroutineScope {
    val child = launch(second) {
      try {
        // The child must yield at gate.await before this queued work can run.
        second.executor.execute { show("Cancellation waiting") }
        gate.await()
        error("Cancelled child must not cross gate")
      } finally {
        show("Cancellation finally") // BREAK_CANCEL
      }
    }
    try { child.join() } finally {
      withContext(NonCancellable) { child.cancelAndJoin() }
      show("Coroutine cancelled")
    }
  }

  override fun onDestroy() {
    scope.cancel()
    first.close()
    second.close()
    super.onDestroy()
  }
}
