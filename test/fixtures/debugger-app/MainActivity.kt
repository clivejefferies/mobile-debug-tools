package dev.mobiledebugmcp.debugfixture

import android.app.Activity
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
  private lateinit var status: TextView

  override fun onCreate(saved: Bundle?) {
    super.onCreate(saved)
    val layout = LinearLayout(this)
    layout.orientation = LinearLayout.VERTICAL
    layout.setPadding(0, 160, 0, 0)
    status = TextView(this)
    status.text = "Kotlin ready"
    layout.addView(status)
    val button = Button(this)
    button.text = "Kotlin calculate"
    button.setOnClickListener { calculate(7) }
    layout.addView(button)
    setContentView(layout)
  }

  private fun calculate(seed: Int) {
    val known = seed + 35 // BREAK_KOTLIN_BEFORE
    val answer = known + 1 // BREAK_KOTLIN_KNOWN
    status.text = "Kotlin result $answer" // BREAK_KOTLIN_RESULT
  }
}
