# RFC: Agent runtime abstraction

Status: **Accepted** · Owner: ZeroWall Science · Last updated: 2026-07-31

## Problem

`AGENTS.md` mandates that the UI never calls the agent runtime directly — it
goes through `packages/sdk`. Until now there was exactly one runtime
(OpenCode), reached via `OpenCodeClient`. We want a **second** runtime: external
[Agent Client Protocol](https://agentclientprotocol.com) (ACP) agents — Codex,
Claude Code — spawned as local child processes over stdio JSON-RPC. The UI must
stay agnostic to which runtime is active.

## Decision

`packages/sdk/src/runtime.ts` defines `AgentRuntime`: the runtime-agnostic seam
between the app UI and whatever drives the model. It covers only what a generic
runtime must expose — lifecycle, sessions, capability discovery, model
selection, interactive requests (permissions/questions), shell/command exec, and
revert/unrevert. Provider / MCP / OAuth configuration is deliberately **out of
scope**: those configure a specific runtime, not "a runtime" in general.

Two implementations:

- **`OpenCodeClient`** (default) — talks to the bundled OpenCode sidecar over
  HTTP + SSE. Safety (approval gating, workspace-only) lives inside OpenCode's
  config.
- **`AcpRuntime`** (new) — bridges external ACP agents through the Tauri host.
  The Rust side (`crates/zerowall-acp` + `acp_consumer.rs`) owns the subprocess
  lifecycle, injects API keys from the OS keychain into the spawn env (never
  logged), and — because ACP agents are client-hosted — routes every filesystem
  and terminal request back through **ZeroWall's own** approval gating,
  workspace sandbox (fail-closed, project-scoped), and `provenance.jsonl`. An
  external agent inherits none of OpenCode's safety, so we enforce it at our
  handlers instead.

Both runtimes converge on one usage table: `AcpRuntime` emits the same
`UsageEvent` (token/cost accounting, Part T) from the ACP `UsageUpdate`
`{used, size, cost}` stream, so accounting is unified across runtimes.

## Licensing

`crates/zerowall-acp` is an **original, clean-room** implementation — not
derived from any other ACP client. It links the Apache-2.0
`agent-client-protocol` SDK as a normal dependency. Apache-2.0 is
MIT-compatible and imposes no copyleft on this MIT project. See `NOTICE`.

## Non-goals

- No per-vendor adapters. An agent is a generic `{id, label, command, args, env}`
  profile; Codex and Claude Code ship as presets, nothing more.
- ACP is **desktop-only**. Spawning local child processes cannot work over the
  gateway web client, so every ACP control is hidden behind `isGatewayWeb`.
- OpenCode is not being replaced. It remains the default; ACP is opt-in per
  session via a runtime switcher.
