# Android HTTP trace fixture

This disposable debug app reads version 1 trace configuration from its private
`files/http-trace/` directory. Starting `.TraceActivity` creates the opt-in
`version` marker. A shell-only test broadcast requests
`https://trace.test/fixture` through the selected trace proxy. The receiver
requires Android's `DUMP` permission. The smoke test passes `originPort` to
select the fixed `https://localhost:<port>/fixture` test origin.

The smoke installs two package variants. The default uses
`HttpsURLConnection`; the `.socket` package uses HTTP CONNECT and a JSSE
`SSLSocket` with HTTPS endpoint identification. Both use the same opt-in
configuration format and separate Android private storage.

Build with JDK 17 or 21, Android SDK platform 36, and build-tools 36.0.0.
From the repository root:

```sh
node --import tsx --input-type=module -e 'import {buildTraceFixture} from "./test/fixtures/http-trace-app/build.ts"; console.log(buildTraceFixture())'
```

Install the resulting APK on a selected emulator and start the activity:

```sh
adb -s "$ANDROID_TRACE_TARGET" install "$TRACE_FIXTURE_APK"
adb -s "$ANDROID_TRACE_TARGET" shell am start -W -n dev.mobiledebugmcp.tracefixture/.TraceActivity
adb -s "$ANDROID_TRACE_TARGET" shell -T run-as dev.mobiledebugmcp.tracefixture cat files/http-trace/version
```

After starting the loopback relay and private backend, publish a JSON file named
`<traceId>.json` by staging and renaming it within the private directory.
Use a version of `1`, the matching `traceId`, `proxyHost` of `127.0.0.1`,
the relay's integer `proxyPort`, an `allowedHosts` array containing
`trace.test`, the PEM `caCertificate`, and an `expiresAt` Unix timestamp in
milliseconds. The fixture reads this file fresh for each request. Trigger a
request with:

```sh
adb -s "$ANDROID_TRACE_TARGET" shell am broadcast \
  -a dev.mobiledebugmcp.tracefixture.REQUEST -p dev.mobiledebugmcp.tracefixture
```

A usable session returns `trace-status-<HTTP status>`. Missing, invalid,
expired, or ambiguous configuration returns `normal-route`, a routing
selection marker. The fixture does not make a direct external request for
this marker. An invalid certificate chain or hostname fails the trace
request. The fixture does not implement an application pin set.

Stop the relay, remove the session file, uninstall this fixture, and remove
its temporary build directory when done. See the
[implementation plan](../../../docs/specs/038-android-http-trace/plan.md)
for the private backend prototype and device evidence.
