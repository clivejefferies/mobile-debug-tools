export function summarize(samples: number[]) {
  if (!samples.length) return null
  const sorted = [...samples].sort((a, b) => a - b)
  const percentile = (p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]
  return { count: samples.length, p50: percentile(.5), p95: percentile(.95), min: sorted[0], max: sorted[sorted.length - 1] }
}
