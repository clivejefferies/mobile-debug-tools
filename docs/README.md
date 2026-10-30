# Documentation

Mobile Debug MCP provides tools for building, controlling, and inspecting Android
and iOS apps. Start with the [project README](../README.md) for requirements,
installation, and client configuration.

## Choose a starting point

- **New to the server?** Follow [Getting started](../README.md#getting-started) for a device
  check, app launch, and verified UI interaction.
- **Looking up a tool?** Use the [tool reference](tools/TOOLS.md) for inputs,
  responses, examples, and shared interaction principles.
- **Troubleshooting setup?** Check [environment diagnostics](tools/system.md) and
  the [tool path settings](../README.md#environment-setup).
- **Investigating an app failure?** Start with [observations](tools/observe.md)
  and [evidence correlation](tools/correlated-evidence.md). For deeper Android
  investigation, use [system traces](tools/system-traces.md) or the
  [runtime debugger](tools/debugger.md).
- **Installing a client plugin?** See [client installation](../README.md#agent-plugin)
  and the [plugin guide](../agent-plugin/README.md) for packaging and versioning.

## Contributing

- [Contribution guide](../CONTRIBUTING.md): local setup, validation, and documentation conventions.
- [Development process](specs/process.md): maintenance and feature workflows.
- [Agent entrypoint](../AGENTS.md) and [repository skills](../.agents/skills/README.md).

## Design and evidence

- [Design records](specs/): feature intent, specifications, and dated verification
  records, grouped by feature.
- [Changelog](CHANGELOG.md): release history.
- [Benchmark index](benchmarks/README.md): reproducible performance checks and recorded limits.

The tool reference describes the current checkout. Specifications record design
intent and may contain earlier contracts; approval alone does not establish that
a feature shipped. Verification records describe the named build and environment,
not every supported platform or the currently published npm package.
