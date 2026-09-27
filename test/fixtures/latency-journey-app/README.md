# Interaction latency fixture

An offline native Android fixture, version 1.0. It requires Android SDK platform 36,
build-tools 36.0.0 and JDK 21. The harness builds and signs it using those installed
tools; no Gradle dependency download is needed.

Selectors are accessibility IDs: `saved-session`, `idle-detail`, `activate`,
`active-detail`, `home`, `home-screen`, `deactivate`, `stop`, and `stopped`.
The app keeps control state only in memory. Clearing data and relaunching restores
Home with an inactive control. It requests no permissions and has no network code.
