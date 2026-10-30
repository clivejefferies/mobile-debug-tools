import assert from 'node:assert/strict'

// Minimal local protobuf reader for format/content evidence, not trace analysis.
// Field numbers: google/perfetto protos/perfetto/trace/{trace,trace_packet}.proto
// and trace/ftrace/{ftrace_event_bundle,ftrace_event}.proto. Unknown fields skipped.
export function protobufFields(bytes: Buffer): Array<{ field: number; wire: number; value: Buffer | bigint }> {
  let offset = 0
  const result: Array<{ field: number; wire: number; value: Buffer | bigint }> = []
  function varint() {
    let value = 0n
    for (let shift = 0n; shift < 70n; shift += 7n) {
      assert.ok(offset < bytes.length, 'Truncated protobuf varint')
      const byte = bytes[offset++]
      value |= BigInt(byte & 127) << shift
      if (!(byte & 128)) return value
    }
    throw new Error('Oversized protobuf varint')
  }
  while (offset < bytes.length) {
    const key = Number(varint()), field = Math.floor(key / 8), wire = key % 8
    assert.ok(field > 0)
    let value: Buffer | bigint
    if (wire === 0) value = varint()
    else {
      const length = wire === 2 ? Number(varint()) : wire === 1 ? 8 : wire === 5 ? 4 : -1
      assert.ok(Number.isSafeInteger(length) && length >= 0 && length <= bytes.length - offset, 'Invalid protobuf length/wire')
      value = bytes.subarray(offset, offset + length); offset += length
    }
    result.push({ field, wire, value })
  }
  return result
}
export function inspectPerfetto(bytes: Buffer, duration: number) {
  const root = protobufFields(bytes)
  assert.ok(root.length > 0)
  assert.ok(root.every(f => f.field === 1 && f.wire === 2), 'Trace.packet must be repeated length-delimited messages')
  const packets = root.map(f => protobufFields(f.value as Buffer))
  const config = packets.flat().find(f => f.field === 33 && f.wire === 2)
  assert.ok(config, 'Missing TracePacket.trace_config')
  assert.equal(protobufFields(config.value as Buffer).find(f => f.field === 3)?.value, BigInt(duration))
  const bundles = packets.flat().filter(f => f.field === 1 && f.wire === 2).map(f => protobufFields(f.value as Buffer))
  let events = 0, compactBundles = 0
  for (const bundle of bundles) {
    for (const f of bundle) {
      if (f.field === 2 && f.wire === 2) {
        const event = protobufFields(f.value as Buffer)
        assert.ok(event.some(e => e.field === 1 && e.wire === 0), 'FtraceEvent timestamp missing')
        events++
      }
      if (f.field === 4 && f.wire === 2) {
        assert.ok(protobufFields(f.value as Buffer).some(e => [1, 7].includes(e.field) && e.wire === 2))
        compactBundles++
      }
    }
  }
  assert.ok(events + compactBundles > 0, 'No captured kernel/scheduler events')
  return { packets: packets.length, ftrace_bundles: bundles.length, events, compact_sched_bundles: compactBundles,
    validation: 'local protobuf structure, trace config duration and timestamped ftrace/compact scheduler content; not full Perfetto analysis' }
}
