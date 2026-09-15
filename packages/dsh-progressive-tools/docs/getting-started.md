# Getting started

## Prerequisites

- Host runtime `0.1.5-rc.1`.
- Node.js `^22.19.0` or `>=24.0.0` and pnpm 11 for source builds.
- A working host profile with the tools you want to discover already installed.

The plugin searches registered tools; it does not install tools or establish
connections to external services. Follow the tagged installation command in
the [overview](../README.md#install), then inspect the same profile:

```sh
dsh --profile web --dump-config
```

Confirm a single `progressive-tools` row exists. Other profiles have separate
compositions. Avoid composing another plugin that registers `tool_search`
under the same name. If needed, customize both discovery names consistently.

## First successful use

1. Start a fresh session after installation.
2. Invoke `tool_search` with `{"action":"status"}` to inspect deferred families.
3. Choose an actual listed name and search with `{"query":"<exact name>"}`.
4. Invoke `tool_dispatch` with that name and arguments matching its returned schema.
5. Confirm the actual tool ran and its usual approval policy was applied.

Status is browse-only by default. A successful search opens its matched
families, including siblings whose full schemas were not returned. Load a
sibling's schema explicitly before supplying unfamiliar arguments.

## Presentation modes

In native presentation, call the search and dispatch tools directly. In host
PTC presentation, invoke their bindings inside `run_code`. The host's
`native`/`ptc`/`both` setting is different from this plugin's
`stable-proxy`/`dynamic` setting. Keep `stable-proxy` for stable discovery.

No service credentials are configured in this plugin. Tool providers retain
their existing credentials, approval requirements, and connection setup.
See [troubleshooting](troubleshooting.md) if the catalog is empty or execution fails.
