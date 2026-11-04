import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
export const iosDebuggerAppId = 'dev.mobiledebug.iosfixture'
export const iosDebuggerSource = fileURLToPath(new URL('./Main.swift', import.meta.url))
export function buildIOSDebuggerFixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'mobile-debug-ios-fixture-'))
  const app = path.join(directory, 'DebuggerFixture.app')
  try {
    execFileSync('/bin/mkdir', ['-p', app])
    const sdk = execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' }).trim()
    execFileSync('xcrun', ['swiftc', '-g', '-module-cache-path', path.join(directory, 'modules'), '-Onone', '-parse-as-library', '-sdk', sdk, '-target', `${os.arch() === 'arm64' ? 'arm64' : 'x86_64'}-apple-ios18.0-simulator`, '-module-name', 'DebuggerFixture', iosDebuggerSource, '-o', path.join(app, 'DebuggerFixture')], { timeout: 120000, stdio: 'pipe' })
    writeFileSync(path.join(app, 'Info.plist'), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${iosDebuggerAppId}</string><key>CFBundleExecutable</key><string>DebuggerFixture</string><key>CFBundleName</key><string>DebuggerFixture</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1</string><key>CFBundleShortVersionString</key><string>1.0</string><key>LSRequiresIPhoneOS</key><true/><key>UILaunchScreen</key><dict/></dict></plist>`)
    return { app, directory }
  } catch (error) {
    rmSync(directory, { recursive: true, force: true })
    throw error
  }
}
