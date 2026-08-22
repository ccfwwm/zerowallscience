# Claude Science Integration

This branch integrates capability metadata and managed MCP lifecycle from the
`claude-science-code` runtime snapshot without copying its 29 Skills. The
existing ZeroWall catalog remains authoritative: the source audit reports one
exact duplicate and 28 already-adapted Skills.

## Managed MCP environment

`bio-tools` and `ketcher-chemistry` are distributed as a separate signed,
versioned Windows x64 environment archive. The Electron main process downloads
the manifest and archive asynchronously after the DSH Host is ready, verifies
HTTPS, Ed25519 signature, size, SHA-256, safe archive paths, and required
entrypoints, then installs atomically under the user data directory.

The application remains usable when initialization fails. Users can retry or
select a previously installed environment containing the required Python and
Node entrypoints. No pip/npm/uv installation script is executed automatically.

The two managed MCP records are seeded idempotently as
`zerowall_managed_bio_tools` and `zerowall_managed_ketcher`. Their logical
commands are resolved to the active environment's absolute paths at runtime;
the database never stores a machine-specific environment path.

## Audit

`tools/integration/audit-claude-science.mjs` produces the source/provenance and
duplicate report at `docs/claude-science-integration-audit.json`.

Research audit reports reuse the existing project `audit_events` table. Each
report derives a SHA-256 event chain, records evidence warnings for successful
Runs without outputs and Artifacts without checksums, and exports JSON or
Markdown through `zerowallResearch.getAuditReport` and
`zerowallResearch.exportAuditReport`.

Audit records contain event summaries and hashes only. Credentials, complete
tool inputs, and unbounded tool outputs remain outside the research database.

## Validation

```text
pnpm audit:claude-science
pnpm test:integration
pnpm --filter @zerowallscience/research-store test
pnpm --filter @zerowallscience/plugin-mcp test
pnpm --filter @zerowallscience/desktop typecheck
```
