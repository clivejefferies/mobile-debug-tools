import { once } from 'node:events'
import { createConnection, type Socket } from 'node:net'
import type { Readable, Writable } from 'node:stream'

const frameSize = 8192
const connectionLimit = 8
const writeLimit = 128 * 1024
const ioTimeout = 5000
const OPEN = -1
const CLOSE = -2
const FIN = -3

type Frame = { id: number; size: number; data: Buffer }

async function* decodeFrames(input: Readable): AsyncGenerator<Frame> {
  let buffer = Buffer.alloc(0)
  for await (const chunk of input) {
    buffer = Buffer.concat([buffer, chunk as Buffer])
    while (buffer.length >= 8) {
      const id = buffer.readInt32BE(0)
      const size = buffer.readInt32BE(4)
      if (id < 0 || (id === 0 && (size < 0 || size > 65535)) ||
          (id > 0 && (size < FIN || size === 0 || size > frameSize))) {
        throw new Error('Invalid HTTP trace relay frame')
      }
      const end = 8 + (id > 0 && size > 0 ? size : 0)
      if (buffer.length < end) break
      yield { id, size, data: buffer.subarray(8, end) }
      buffer = buffer.subarray(end)
    }
  }
  if (buffer.length) throw new Error('Incomplete HTTP trace relay frame')
}

/** Bridges the selected ADB process's streams to the trace-owned host socket. */
export class HttpTraceRelay {
  private readonly sockets = new Map<number, Socket>()
  private readonly controller = new AbortController()
  private paused = false
  private lastId = 0
  readonly port: Promise<number>
  readonly closed: Promise<void>

  constructor(private readonly input: Readable, private readonly output: Writable, private readonly socketPath: string) {
    let ready!: (port: number) => void
    let unavailable!: (error: Error) => void
    this.port = new Promise<number>((resolve, reject) => {
      ready = resolve
      unavailable = reject
    })
    output.once('error', () => this.close())
    output.on('drain', () => this.resume())
    this.closed = this.run(input, ready)
      .catch((error: unknown) => {
        if (!this.controller.signal.aborted) {
          if (error instanceof Error && error.message === 'HTTP_TRACE_CONFLICT') unavailable(error)
          throw error
        }
      })
      .finally(() => {
        unavailable(new Error('HTTP trace relay closed before readiness'))
        this.close()
      })
  }

  close(): void {
    if (this.controller.signal.aborted) return
    this.controller.abort()
    this.output.end()
    this.input.destroy()
    for (const socket of this.sockets.values()) socket.destroy()
    this.sockets.clear()
  }

  private resume(): void {
    this.paused = false
    for (const socket of this.sockets.values()) socket.resume()
  }

  private send(id: number, size: number, data?: Buffer): void {
    if (this.controller.signal.aborted) return
    const frame = Buffer.allocUnsafe(8 + (data?.length ?? 0))
    frame.writeInt32BE(id, 0)
    frame.writeInt32BE(size, 4)
    data?.copy(frame, 8)
    if (this.output.writableLength + frame.length > writeLimit) {
      this.close()
      return
    }
    if (!this.output.write(frame) && !this.paused) {
      this.paused = true
      for (const socket of this.sockets.values()) socket.pause()
    }
  }

  private open(id: number): void {
    if (id <= this.lastId) throw new Error('Invalid HTTP trace relay connection ID')
    this.lastId = id
    if (this.sockets.size >= connectionLimit) {
      this.send(id, CLOSE)
      return
    }
    const socket = createConnection({ path: this.socketPath, allowHalfOpen: true })
    this.sockets.set(id, socket)
    socket.on('error', () => socket.destroy())
    socket.setTimeout(30000, () => socket.destroy())
    socket.on('data', (data: Buffer) => {
      for (let offset = 0; offset < data.length; offset += frameSize) {
        const part = data.subarray(offset, offset + frameSize)
        this.send(id, part.length, part)
      }
    })
    socket.once('end', () => this.send(id, FIN))
    socket.once('close', () => {
      if (this.sockets.delete(id)) this.send(id, CLOSE)
    })
    if (this.paused) socket.pause()
  }

  private async handle({ id, size, data }: Frame): Promise<void> {
    if (size === OPEN) {
      this.open(id)
      return
    }
    const socket = this.sockets.get(id)
    if (!socket) return
    if (size === CLOSE) {
      this.sockets.delete(id)
      socket.destroy()
    } else if (size === FIN) {
      socket.end()
    } else if (!socket.writableEnded && !socket.write(data)) {
      const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(ioTimeout)])
      const wait = new AbortController()
      const writeSignal = AbortSignal.any([signal, wait.signal])
      try {
        await Promise.race([once(socket, 'drain', { signal: writeSignal }), once(socket, 'close', { signal: writeSignal })])
      } catch (error) {
        if (!socket.destroyed) throw error
      } finally {
        wait.abort()
      }
    }
  }

  private async run(input: Readable, ready: (port: number) => void): Promise<void> {
    let started = false
    for await (const frame of decodeFrames(input)) {
      if (this.controller.signal.aborted) break
      if (frame.id === 0 && !started) {
        if (frame.size === 0) throw new Error('HTTP_TRACE_CONFLICT')
        ready(frame.size)
        started = true
      } else if (frame.id > 0 && started) {
        await this.handle(frame)
      } else {
        throw new Error('Unexpected HTTP trace relay handshake')
      }
    }
  }
}
