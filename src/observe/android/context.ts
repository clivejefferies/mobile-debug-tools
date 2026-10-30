export const activeLogStreams: Map<string, { proc: import('node:child_process').ChildProcess, file: string, device?: { platform: 'android' | 'ios'; id: string } }> = new Map()
