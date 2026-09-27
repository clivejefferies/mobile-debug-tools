import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function buildBridge() {
  const root = path.dirname(fileURLToPath(import.meta.url))
  const out = path.join(root, 'build')
  const sdk = process.env.ANDROID_HOME ?? path.join(process.env.HOME!, 'Library/Android/sdk')
  const buildTools = path.join(sdk, 'build-tools', '36.0.0')
  const androidJar = path.join(sdk, 'platforms', 'android-36', 'android.jar')
  const java = process.env.JAVA_HOME
  const tool = (name: string) => java ? path.join(java, 'bin', name) : name
  const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: out, stdio: 'pipe' })
  mkdirSync(path.join(out, 'classes'), { recursive: true })
  run(tool('javac'), ['--release', '8', '-classpath', androidJar, '-d', 'classes', path.join(root, 'src/TreeInstrumentation.java')])
  run(tool('jar'), ['cf', 'classes.jar', '-C', 'classes', '.'])
  run(path.join(buildTools, 'd8'), ['--lib', androidJar, '--output', out, 'classes.jar'])
  run(path.join(buildTools, 'aapt2'), ['link', '-I', androidJar, '--manifest', path.join(root, 'AndroidManifest.xml'), '-o', 'unsigned.apk'])
  run('zip', ['-q', 'unsigned.apk', 'classes.dex'])
  run(path.join(buildTools, 'zipalign'), ['-f', '4', 'unsigned.apk', 'aligned.apk'])
  try { run(tool('keytool'), ['-genkeypair', '-keystore', 'fixture.jks', '-storepass', 'android', '-keypass', 'android', '-alias', 'fixture', '-dname', 'CN=UI Tree Bridge', '-keyalg', 'RSA', '-validity', '3650']) } catch { /* Existing local fixture key. */ }
  run(path.join(buildTools, 'apksigner'), ['sign', '--ks', 'fixture.jks', '--ks-pass', 'pass:android', '--out', 'bridge.apk', 'aligned.apk'])
  return path.join(out, 'bridge.apk')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(buildBridge())
}
