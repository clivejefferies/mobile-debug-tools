# Readiness fixture

[Contributing](../../../CONTRIBUTING.md) · [Documentation](../../../docs/README.md)

Offline native Android/iOS simulator apps used only for explicit readiness
verification. Ready stays visible while Show loader starts a 12-second loader;
completion hides the loader and changes its status to Done. No permissions,
accounts, networking, or persistence are used. These are test apps, not hierarchy
inspection helpers.

The manual helper builds them in a temporary directory with Android SDK 36 /
build-tools 36.0.0 and the installed JDK, or the installed iOS simulator SDK and
Clang. It installs only on an explicitly selected simulator and cleans up its
own app and temporary artifacts afterward.
