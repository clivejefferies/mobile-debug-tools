export type PlatformArg = 'android' | 'ios'
export type ProjectTypeArg = 'native' | 'kmp' | 'react-native' | 'flutter'
export type WaitForUiMatchArg = { index?: number }
export type WaitForUiRetryArg = { max_attempts?: number, backoff_ms?: number }
export type { ScrollSelector as ScrollSelectorArg } from '../../contracts/target.js'
export type ClassifyNetworkRequestArg = { endpoint: string, status: 'success' | 'failure' | 'retryable' }
export type { VerificationMode, ResponseMode } from '../../contracts/execution-controls.js'
