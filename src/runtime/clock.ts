/** Wall-clock timestamps and delays used by interaction polling services. */
export interface Clock {
  now(): number
  sleep(ms: number): Promise<void>
}
export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms))
}
