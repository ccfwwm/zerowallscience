# runtime/mcp

MCP (Model Context Protocol) server configurations and lifecycle management for
the 23 life-science domain servers.

## Who owns the process

The desktop frontend runs in a WebView and cannot spawn processes. Local (stdio)
MCP servers are launched by the **OpenCode sidecar** from its config
(`src-tauri/src/runtime.rs`, `opencode_config.rs`). `MCPServerManager` therefore
manages servers through config writes, not `child_process`:

- **start** — register the server `enabled`, then poll until OpenCode reports it up
- **stop** — register it `disabled`; OpenCode tears the child down
- **restart** — stop, then start, incrementing the attempt counter

It talks to the sidecar through the injected `McpRuntime` port
(`listMcpServers` / `addMcpServer`, implemented by `OpenCodeClient`), so tests
need neither network nor processes.

## Secrets: write-only, injected by Rust

The manager never reads or handles a secret **value**. Only names, and only as
counts when logging.

1. The settings UI writes a key with `set_connector_secret` (P1B).
2. Rust materializes it at sidecar launch — `secret_store::sidecar_secrets()` →
   `sidecar_environment()` → `cmd.env(...)` before spawn.
3. MCP servers are children of the sidecar, so they inherit `process.env`.
4. MCP config may only reference `{env:VAR}` placeholders, never literal values.

P1B registers exactly five secret commands: `set_provider_secret`,
`remove_provider_secret`, `provider_secret_exists`, `set_connector_secret`,
`remove_connector_secret`. **There is no getter, by design** — do not add one.
A read-back path would let credentials into the WebView and from there into
logs, provenance, and exports.

## Files

- `manager.ts` — lifecycle, health checks, restart policy
- `keychain-integration.ts` — the write path (`ConnectorSecretWriter`) plus
  name/count helpers for reporting missing keys
- `packages/shared/src/mcp-config.ts` — `MCPServerConfig` schema, the 23
  templates, and pure helpers (`toMcpConfig`, `validateMCPServerConfig`, …)

## Server configurations

All 23 domain servers are preconfigured in `MCP_SERVER_CONFIGS`, keyed by the
`DOMAIN_GROUPS` ids in `runtime/connectors/schema.ts`. Each one:

- runs as `python -m mcp_<domain>.server` (`python`, not `python3`; resolved to
  the managed interpreter, on Windows `<env>\Scripts\python.exe`)
- declares an API key only where the upstream service actually requires one —
  open APIs such as ClinicalTrials.gov and PubChem declare none
- uses the `on-failure` restart policy, a 30s startup timeout, a 60s health
  interval, and at most 3 restart attempts

## Health checks

`healthCheckMCPServer(id)` reads the server's live status from the runtime,
records latency, and flags `timedOut` when the runtime does not answer in time.
The monitor tick restarts an unhealthy server according to its policy and gives
up once `maxRestartAttempts` is spent, leaving it `failed`.

## Testing

```bash
cd apps/desktop && npx vitest run mcp
```

The desktop vitest config reaches out to `../../runtime/**`, so these run with
the rest of the suite. They need no network and no processes: the sidecar is
replaced by a `FakeRuntime` implementing the `McpRuntime` port, and the clock
and sleep are injected.

## First batch (v0.1)

| MCP | Purpose | Phase |
| --- | --- | --- |
| `filesystem` | Project file read/write | v0.1 |
| `paper-search-mcp` | Literature search | v0.1 |
| `BioMCP` | Biomedical databases | later |
| `Zotero MCP` | Reference library | later |
| `GitHub MCP` | Repos / issues / releases | later |
| `local runtime MCP` | Local execution status | later |

v0.1 ships `filesystem` + paper search; the rest are added incrementally.
MCP servers must stay pluggable and configurable.
