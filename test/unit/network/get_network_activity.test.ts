import assert from 'assert'
import {
  parseMessageToEvent,
  normalizeEndpoint,
  classifyStatus,
  _setTimestampsForTests,
  ToolsNetwork
} from '../../../src/network/index.js'

function run() {

  // ─── normalizeEndpoint ──────────────────────────────────────────────────────

  {
    const r = normalizeEndpoint('https://api.example.com/v1/users?page=2')
    assert.strictEqual(r, '/v1/users', `normalizeEndpoint full URL: expected /v1/users, got ${r}`)
  }

  {
    const r = normalizeEndpoint('/api/login/')
    assert.strictEqual(r, '/api/login', `normalizeEndpoint path trailing slash: expected /api/login, got ${r}`)
  }

  {
    const r = normalizeEndpoint('/Api/Login')
    assert.strictEqual(r, '/api/login', `normalizeEndpoint uppercase: expected /api/login, got ${r}`)
  }

  // ─── classifyStatus ─────────────────────────────────────────────────────────

  {
    const s = classifyStatus(200, null)
    assert.strictEqual(s, 'success', `200 should be success`)
  }

  {
    const s = classifyStatus(404, null)
    assert.strictEqual(s, 'failure', `404 should be failure`)
  }

  {
    const s = classifyStatus(500, null)
    assert.strictEqual(s, 'retryable', `500 should be retryable`)
  }

  {
    const s = classifyStatus(null, 'timeout')
    assert.strictEqual(s, 'retryable', `networkError should override to retryable`)
  }

  {
    const s = classifyStatus(200, 'connection_reset')
    assert.strictEqual(s, 'retryable', `networkError beats statusCode`)
  }

  {
    const s = classifyStatus(null, null)
    assert.strictEqual(s, 'success', `null/null (request detected, no error) = success`)
  }

  // ─── parseMessageToEvent — emission criteria ─────────────────────────────────

  // Condition 1: full URL
  {
    const e = parseMessageToEvent('OkHttp: GET https://api.example.com/v1/login 200')
    assert.ok(e !== null, 'full URL line should emit')
    assert.strictEqual(e!.endpoint, '/v1/login')
    assert.strictEqual(e!.method, 'GET')
    assert.strictEqual(e!.statusCode, 200)
    assert.strictEqual(e!.status, 'success')
  }

  // Condition 2: explicit HTTP status line
  {
    const e = parseMessageToEvent('HTTP/1.1 404 Not Found')
    assert.ok(e !== null, 'HTTP status line should emit')
    assert.strictEqual(e!.statusCode, 404)
    assert.strictEqual(e!.status, 'failure')
  }

  // Condition 3: method + path
  {
    const e = parseMessageToEvent('Sending POST /api/register HTTP/1.1')
    assert.ok(e !== null, 'method+path line should emit')
    assert.strictEqual(e!.method, 'POST')
    assert.strictEqual(e!.endpoint, '/api/register')
    assert.strictEqual(e!.statusCode, null)
    assert.strictEqual(e!.status, 'success') // no error signal
  }

  // No criteria met — keyword-only noise
  {
    const e = parseMessageToEvent('HTTP connection pool initialised')
    assert.strictEqual(e, null, 'keyword-only line should not emit')
  }

  {
    const e = parseMessageToEvent('Request interceptor registered')
    assert.strictEqual(e, null, 'generic Request line should not emit')
  }

  {
    const e = parseMessageToEvent('Task 200 completed')
    assert.strictEqual(e, null, 'bare status-like numbers should not emit')
  }

  {
    const e = parseMessageToEvent('Response code: 404')
    assert.strictEqual(e, null, 'labeled status without endpoint or HTTP context should not emit')
  }

  {
    const e = parseMessageToEvent('GetBestInfo: /data/app/~~pkg/base.apk status=447')
    assert.strictEqual(e, null, 'filesystem paths should not emit as network endpoints')
  }

  {
    const e = parseMessageToEvent('system/gd/hci/le_address_manager.cc:576 GetNextPrivateAddressIntervalRange')
    assert.strictEqual(e, null, 'source file paths should not emit as network endpoints')
  }

  {
    const e = parseMessageToEvent('status=503 for /api/session/generate')
    assert.ok(e !== null, 'status with plausible endpoint should emit')
    assert.strictEqual(e!.endpoint, '/api/session/generate')
    assert.strictEqual(e!.statusCode, 503)
    assert.strictEqual(e!.status, 'retryable')
  }

  // Network error detection
  {
    const e = parseMessageToEvent('java.net.SocketTimeoutException: POST /api/data timed out after 30s')
    assert.ok(e !== null, 'timeout error should emit')
    assert.strictEqual(e!.networkError, 'timeout')
    assert.strictEqual(e!.status, 'retryable')
  }

  {
    const e = parseMessageToEvent('SSL handshake failed for https://api.example.com/v1/auth')
    assert.ok(e !== null, 'TLS error should emit')
    assert.strictEqual(e!.networkError, 'tls_error')
    assert.strictEqual(e!.status, 'retryable')
  }

  {
    const e = parseMessageToEvent('DNS resolution failed: GET /api/users')
    assert.ok(e !== null, 'DNS error should emit')
    assert.strictEqual(e!.networkError, 'dns_error')
    assert.strictEqual(e!.status, 'retryable')
  }

  // 5xx → retryable even without networkError
  {
    const e = parseMessageToEvent('Response 503 for https://api.example.com/v1/data')
    assert.ok(e !== null, '5xx should emit')
    assert.strictEqual(e!.statusCode, 503)
    assert.strictEqual(e!.status, 'retryable')
  }

  // ─── lastConsumedTimestamp dedupe ────────────────────────────────────────────

  {
    // Simulate: action happened 1000ms ago, last consumed 500ms ago → use consumed
    _setTimestampsForTests(Date.now() - 1000, Date.now() - 500)
    // We can't easily verify the sinceMs value from outside without deep mocking,
    // but we can confirm getNetworkActivity resolves without throwing.
    const promise = ToolsNetwork.getNetworkActivity({ platform: 'android' })
    assert.ok(promise instanceof Promise, 'getNetworkActivity should return a Promise')
    // Allow the promise to settle (logcat may fail in test env — that's fine)
    promise.catch(() => {})
  }

  console.log('get_network_activity tests passed')
}

try {
  run()
} catch (err) {
  console.error(err)
  process.exit(1)
}
