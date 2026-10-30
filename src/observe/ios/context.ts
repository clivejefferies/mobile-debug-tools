import { execCommand } from "../../utils/ios/utils.js"
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export let iosExecCommand = execCommand

export function _setIOSExecCommandForTests(fn: typeof execCommand) {
  iosExecCommand = fn
}

export function _resetIOSExecCommandForTests() {
  iosExecCommand = execCommand
}

export const iosActiveLogStreams: Map<string, { proc: Pick<import('node:child_process').ChildProcess, 'kill'>, file: string, device?: { platform: 'android' | 'ios'; id: string } }> = new Map()

export function _setIOSActiveLogStream(sessionId: string, file: string, device?: { platform: 'android' | 'ios'; id: string }) {
  iosActiveLogStreams.set(sessionId, { proc: { kill: () => false }, file, device })
}

export function _clearIOSActiveLogStream(sessionId: string) {
  iosActiveLogStreams.delete(sessionId)
}
