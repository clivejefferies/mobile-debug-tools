import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
export const debuggerAppId = 'dev.mobiledebugmcp.debugfixture'
export function buildDebuggerFixture() {
  const source = path.dirname(fileURLToPath(import.meta.url))
  const directory = mkdtempSync(path.join(tmpdir(), 'mcp-debugger-fixture-'))
  const java = process.env.JAVA_HOME ?? (existsSync('/Applications/Android Studio.app/Contents/jbr/Contents/Home') ? '/Applications/Android Studio.app/Contents/jbr/Contents/Home' : undefined)
  const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: directory, encoding: 'utf8', stdio: 'pipe' })
  const sdk = process.env.ANDROID_HOME ?? path.join(process.env.HOME!, 'Library/Android/sdk')
  const tools = path.join(sdk, 'build-tools/36.0.0')
  const androidJar = path.join(sdk, 'platforms/android-36/android.jar')
  const jdk = (name: string) => java ? path.join(java, 'bin', name) : name
  mkdirSync(path.join(directory, 'classes'))
  writeFileSync(path.join(directory, 'AndroidManifest.xml'), `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${debuggerAppId}" android:versionCode="1" android:versionName="1.0"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36"/><application android:debuggable="true" android:label="Debugger fixture" android:theme="@android:style/Theme.Material.Light.NoActionBar"><activity android:name=".MainActivity" android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>`)
  run(jdk('javac'), ['-g', '--release', '8', '-classpath', androidJar, '-d', 'classes', path.join(source, 'MainActivity.java')])
  run(jdk('javac'), ['-g:source,lines', '--release', '8', '-classpath', androidJar, '-d', 'classes', path.join(source, 'NoLocals.java')])
  run(jdk('jar'), ['cf', 'classes.jar', '-C', 'classes', '.'])
  run(path.join(tools, 'd8'), ['--lib', androidJar, '--output', directory, 'classes.jar'])
  run(path.join(tools, 'aapt2'), ['link', '-I', androidJar, '--manifest', 'AndroidManifest.xml', '-o', 'unsigned.apk'])
  run('zip', ['-q', 'unsigned.apk', 'classes.dex'])
  run(path.join(tools, 'zipalign'), ['-f', '4', 'unsigned.apk', 'aligned.apk'])
  run(jdk('keytool'), ['-genkeypair', '-keystore', 'fixture.jks', '-storepass', 'android', '-keypass', 'android', '-alias', 'fixture', '-dname', 'CN=Readiness Fixture', '-keyalg', 'RSA', '-validity', '365'])
  const artifact = path.join(directory, 'Debugger.apk')
  run(path.join(tools, 'apksigner'), ['sign', '--ks', 'fixture.jks', '--ks-pass', 'pass:android', '--out', artifact, 'aligned.apk'])
  return { artifact, directory }
}
