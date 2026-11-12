import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const traceFixtureAppId = 'dev.mobiledebugmcp.tracefixture'

export const socketTraceFixtureAppId = traceFixtureAppId + '.socket'

export function buildTraceFixture(useSocket = false) {
  const root = dirname(fileURLToPath(import.meta.url))
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(process.env.HOME!, 'Library/Android/sdk')
  const buildTools = join(sdk, 'build-tools', '36.0.0')
  const androidJar = join(sdk, 'platforms', 'android-36', 'android.jar')
  const java = process.env.JAVA_HOME
  const jdk = (name: string) => java ? join(java, 'bin', name) : name
  const directory = mkdtempSync(join(tmpdir(), 'mcp-http-trace-fixture-'))
  const run = (command: string, args: string[]) => execFileSync(command, args, {
    cwd: directory, stdio: 'pipe', timeout: 30000,
  })
  try {
    mkdirSync(join(directory, 'classes'))
    const appId = useSocket ? socketTraceFixtureAppId : traceFixtureAppId
    const inputs = ['TraceActivity.java', 'SocketTraceClient.java', 'AndroidManifest.xml']
    for (const file of inputs) {
      writeFileSync(join(directory, file), readFileSync(join(root, file), 'utf8').replace(traceFixtureAppId, appId))
    }
    run(jdk('javac'), ['--release', '8', '-classpath', androidJar, '-d', 'classes', 'TraceActivity.java', 'SocketTraceClient.java'])
    run(jdk('jar'), ['cf', 'classes.jar', '-C', 'classes', '.'])
    run(join(buildTools, 'd8'), ['--lib', androidJar, '--min-api', '33', '--output', directory, 'classes.jar'])
    run(join(buildTools, 'aapt2'), ['link', '-I', androidJar, '--manifest', 'AndroidManifest.xml', '-o', 'unsigned.apk'])
    run('zip', ['-q', 'unsigned.apk', 'classes.dex'])
    run(join(buildTools, 'zipalign'), ['-f', '4', 'unsigned.apk', 'aligned.apk'])
    run(jdk('keytool'), ['-genkeypair', '-keystore', 'fixture.jks', '-storepass', 'android', '-keypass', 'android',
      '-alias', 'fixture', '-dname', 'CN=HTTP Trace Fixture', '-keyalg', 'RSA', '-validity', '1'])
    const artifact = join(directory, 'fixture.apk')
    run(join(buildTools, 'apksigner'), ['sign', '--ks', 'fixture.jks', '--ks-pass', 'pass:android', '--out', artifact, 'aligned.apk'])
    return { artifact, directory }
  } catch (error) {
    rmSync(directory, { recursive: true, force: true })
    throw error
  }
}
