import assert from 'assert'
import { execFileSync } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { ToolsNetwork } from '../../../src/network/index.js'

async function run() {
  console.log('Starting network certificate tests...')
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-network-certificate-'))
  const adbPath = path.join(tmpDir, 'adb')
  const mitmdumpPath = path.join(tmpDir, 'mitmdump')
  const captureFile = path.join(tmpDir, 'capture.ndjson')
  const certificateFile = path.join(tmpDir, 'mitmproxy-ca-cert.cer')
  const commandLog = path.join(tmpDir, 'adb-commands.log')
  const originalAdbPath = process.env.ADB_PATH
  const originalMitmdumpPath = process.env.MITMDUMP_PATH

  try {
    await fs.writeFile(adbPath, `#!/bin/sh
printf '%s\\n' "$@" >> "$ADB_COMMAND_LOG"
if [ "$1" = "-s" ]; then
  shift 2
fi
if [ "$1" = "shell" ] && [ "$2" = "pm" ] && [ "$3" = "path" ] && [ "$4" = "com.android.certinstaller" ]; then
  printf '%s' 'package:/system/priv-app/Settings/Settings.apk'
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "pm" ] && [ "$3" = "path" ] && [ "$4" = "com.android.settings" ]; then
  printf '%s' 'package:/system/app/CertInstaller/CertInstaller.apk'
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "cmd" ] && [ "$3" = "lock_settings" ] && [ "$4" = "get-disabled" ]; then
  printf '%s' "\${ADB_LOCK_DISABLED:-true}"
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "cmd" ] && [ "$3" = "lock_settings" ] && [ "$4" = "set-pin" ]; then
  printf '%s' "Pin set"
  exit 0
fi
if [ "$1" = "push" ]; then
  printf '%s' "1 file pushed"
  exit 0
fi
if [ "$1" = "shell" ] && [ "$2" = "am" ] && [ "$3" = "start" ]; then
  printf '%s' "Starting: Intent"
  exit 0
fi
printf '%s' "OK"
exit 0
`, { mode: 0o755 })

    await fs.writeFile(mitmdumpPath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "Mitmproxy: 10.0.0"
  exit 0
fi
trap "exit 0" TERM INT
while true; do
  sleep 1
done
`, { mode: 0o755 })

    execFileSync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-keyout',
      path.join(tmpDir, 'key.pem'),
      '-out',
      certificateFile,
      '-days',
      '1',
      '-nodes',
      '-subj',
      '/CN=mitmproxy/O=mitmproxy'
    ])

    process.env.ADB_PATH = adbPath
    process.env.MITMDUMP_PATH = mitmdumpPath
    process.env.ADB_COMMAND_LOG = commandLog
    process.env.ADB_LOCK_DISABLED = 'true'

    ;(ToolsNetwork as any)._resetForTests()
    ;(ToolsNetwork as any)._setCertificatePathForTests(certificateFile)

    const started = await ToolsNetwork.startNetworkCaptureHandler({ captureFile, port: 9090 })
    assert.strictEqual(started.success, true)

    const initialStatus = await ToolsNetwork.getNetworkCaptureStatusHandler()
    assert(initialStatus.logFile, 'network capture status should expose the log file path')
    await fs.writeFile(initialStatus.logFile!, `[07:53:01.873][127.0.0.1:53453] Client TLS handshake failed. The client does not trust the proxy's certificate for api.example.com (OpenSSL Error([('SSL routines', '', 'sslv3 alert certificate unknown')]))\n`, 'utf8')

    const captureStatus = await ToolsNetwork.getNetworkCaptureStatusHandler()
    assert.deepStrictEqual(captureStatus.recentTlsFailureHosts, ['api.example.com'])
    assert(captureStatus.issues.some((issue) => issue.includes('does not trust the proxy certificate')))

    const certificateStatus = await ToolsNetwork.getNetworkCertificateStatusHandler({ deviceId: 'emulator-5554' })
    assert.strictEqual(certificateStatus.certificateFileAvailable, true)
    assert.strictEqual(certificateStatus.certInstallerAvailable, true)
    assert.strictEqual(certificateStatus.lockScreenDisabled, true)
    assert.deepStrictEqual(certificateStatus.recentTlsFailureHosts, ['api.example.com'])

    const prepared = await ToolsNetwork.prepareNetworkCertificateInstallHandler({ deviceId: 'emulator-5554', pin: '1234' })
    assert.strictEqual(prepared.success, true)
    assert.strictEqual(prepared.launched, true)
    assert.strictEqual(prepared.manualStepRequired, true)
    assert.strictEqual(prepared.lockScreenConfigured, true)
    assert.strictEqual(prepared.devicePath, '/data/local/tmp/mitmproxy-ca-cert-der.cer')

    const loggedCommands = await fs.readFile(commandLog, 'utf8')
    assert(loggedCommands.includes('cmd\nlock_settings\nset-pin\n1234'))
    assert(loggedCommands.includes('push'))
    assert(loggedCommands.includes('chmod\n644\n/data/local/tmp/mitmproxy-ca-cert-der.cer'))
    assert(loggedCommands.includes('com.android.settings/.security.CredentialStorage'))

    const stopped = await ToolsNetwork.stopNetworkCaptureHandler()
    assert.strictEqual(stopped.success, true)

    console.log('network certificate tests passed')
  } finally {
    process.env.ADB_PATH = originalAdbPath
    process.env.MITMDUMP_PATH = originalMitmdumpPath
    delete process.env.ADB_COMMAND_LOG
    delete process.env.ADB_LOCK_DISABLED
    ;(ToolsNetwork as any)._resetForTests()
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
