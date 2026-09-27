# Interaction latency benchmark

Commit: d3e6ae720db1ad1da294795790689df5a80b56b0 (working tree candidate). Fixture: 1.0, SHA-256 98244deeeba0a21da7d99a3e4b43c97806d6f8a8787ad7fe38249e5d311a6fb6.

Environment: Pixel_9_Pro, Android 16, API 36. Three warm-ups and ten measured runs per mode. Failed runs excluded.

| Mode | p50 ms | p95 ms | Failures |
|---|---:|---:|---:|
| baseline | 124094.50754200004 | 124597.88916599983 | 0 |
| full | 87262.29954100028 | 88067.6383750001 | 0 |
| light | 51817.59008300025 | 53873.19891700009 | 0 |

First failure by mode: baseline: none; full: none; light: none.

Full p95 gate: true. Light p50 gate: true.

See final.json for requests, timing components, and failure selectors.
