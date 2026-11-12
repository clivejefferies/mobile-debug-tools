import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('../../../src/observe/http-trace/java/HttpTraceRelay.java', import.meta.url))

export function buildRelay(directory: string): string {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(process.env.HOME!, 'Library/Android/sdk')
  const java = process.env.JAVA_HOME
  const jdk = (name: string) => java ? join(java, 'bin', name) : name
  const run = (command: string, args: string[]) => execFileSync(command, args, {
    cwd: directory, timeout: 30000, stdio: 'pipe',
  })
  run(jdk('javac'), ['--release', '8', '-d', '.', source])
  run(jdk('jar'), ['cf', 'relay.jar', 'HttpTraceRelay.class', 'HttpTraceRelay$Channel.class'])
  run(join(sdk, 'build-tools/36.0.0/d8'), [
    '--lib', join(sdk, 'platforms/android-36/android.jar'), '--min-api', '33', '--output', directory, 'relay.jar',
  ])
  return join(directory, 'classes.dex')
}
