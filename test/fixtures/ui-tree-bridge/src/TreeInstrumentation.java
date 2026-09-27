package dev.mobiledebugmcp.treebridge;

import android.app.Instrumentation;
import android.app.UiAutomation;
import android.graphics.Rect;
import android.os.Bundle;
import android.util.Xml;
import android.util.Log;
import android.view.accessibility.AccessibilityNodeInfo;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.StringWriter;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import org.xmlpull.v1.XmlSerializer;

/** Benchmark-only bridge: one live accessibility acquisition per TREE request. */
public final class TreeInstrumentation extends Instrumentation {
  private static final int PORT = 39019;

  @Override public void onCreate(Bundle arguments) {
    super.onCreate(arguments);
    start();
  }

  @Override public void onStart() {
    try (ServerSocket server = new ServerSocket(PORT, 1, InetAddress.getByName("127.0.0.1"))) {
      UiAutomation automation = getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES);
      while (true) {
        try (Socket socket = server.accept()) {
          socket.setSoTimeout(10000);
          BufferedReader input = new BufferedReader(new InputStreamReader(socket.getInputStream(), "UTF-8"));
          OutputStreamWriter output = new OutputStreamWriter(socket.getOutputStream(), "UTF-8");
          String command = input.readLine();
          if ("STOP".equals(command)) {
            output.write("OK\n");
            output.flush();
            break;
          }
          if ("PING".equals(command)) {
            output.write("OK\n");
            output.flush();
            continue;
          }
          if (!"TREE".equals(command)) {
            output.write("ERROR invalid_command\n");
          } else {
            AccessibilityNodeInfo root = automation.getRootInActiveWindow();
            if (root == null) {
              output.write("ERROR null_root\n");
            } else {
              output.write("OK\n");
              output.write(serialize(root));
              root.recycle();
            }
          }
          output.flush();
        } catch (Exception error) {
          // A failed client request cannot make a later acquisition reuse its tree.
          Log.e("TreeBridge", "request failed", error);
        }
      }
    } catch (Exception error) {
      // The host-side probe detects failure to start or connect.
      Log.e("TreeBridge", "bridge failed", error);
    }
    finish(0, new Bundle());
  }

  private static String serialize(AccessibilityNodeInfo root) throws Exception {
    StringWriter writer = new StringWriter();
    XmlSerializer xml = Xml.newSerializer();
    xml.setOutput(writer);
    xml.startDocument("UTF-8", true);
    xml.startTag("", "hierarchy");
    writeNode(xml, root, 0);
    xml.endTag("", "hierarchy");
    xml.endDocument();
    return writer.toString();
  }

  private static void writeNode(XmlSerializer xml, AccessibilityNodeInfo node, int index) throws Exception {
    Rect bounds = new Rect();
    node.getBoundsInScreen(bounds);
    xml.startTag("", "node");
    xml.attribute("", "index", Integer.toString(index));
    xml.attribute("", "class", value(node.getClassName()));
    xml.attribute("", "package", value(node.getPackageName()));
    xml.attribute("", "text", value(node.getText()));
    xml.attribute("", "content-desc", value(node.getContentDescription()));
    xml.attribute("", "resource-id", value(node.getViewIdResourceName()));
    xml.attribute("", "checkable", Boolean.toString(node.isCheckable()));
    xml.attribute("", "checked", Boolean.toString(node.isChecked()));
    xml.attribute("", "clickable", Boolean.toString(node.isClickable()));
    xml.attribute("", "enabled", Boolean.toString(node.isEnabled()));
    xml.attribute("", "focusable", Boolean.toString(node.isFocusable()));
    xml.attribute("", "focused", Boolean.toString(node.isFocused()));
    xml.attribute("", "scrollable", Boolean.toString(node.isScrollable()));
    xml.attribute("", "long-clickable", Boolean.toString(node.isLongClickable()));
    xml.attribute("", "password", Boolean.toString(node.isPassword()));
    xml.attribute("", "selected", Boolean.toString(node.isSelected()));
    xml.attribute("", "visible-to-user", Boolean.toString(node.isVisibleToUser()));
    xml.attribute("", "bounds", bounds.toShortString());
    for (int childIndex = 0; childIndex < node.getChildCount(); childIndex++) {
      AccessibilityNodeInfo child = node.getChild(childIndex);
      if (child != null && child.isVisibleToUser()) {
        writeNode(xml, child, childIndex);
      }
      if (child != null) child.recycle();
    }
    xml.endTag("", "node");
  }

  private static String value(CharSequence input) {
    return input == null ? "" : input.toString();
  }
}
