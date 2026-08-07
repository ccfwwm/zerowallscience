# packages/sdk

`AcpHostClient` — the single boundary between the app and agent runtimes.

The desktop UI never calls a vendor transport directly. It invokes the local
ZeroWall ACP Host, which owns Codex, Claude Code, and OpenCode drivers. The
legacy `OpenCodeClient` remains only for the Gateway Web compatibility path.

The Host client provides:

- ACP v1 session lifecycle (`initialize`, `new`, `load`, `resume`, `prompt`,
  `cancel`, permission/question responses, and close).
- Immutable engine/model/provider bindings plus MCP and Skills snapshots.
- One vendor-neutral `AgentEvent` stream for text, thought, tool, plan,
  permission, usage, artifact, and error updates.

The compatibility transport still supports the existing Gateway Web protocol:

- Talks to a running `opencode serve` over its HTTP + SSE API:
  - `POST /session` (create), `POST /session/:id/prompt_async` (send prompt).
  - `GET /event` (SSE) — `message.part.updated` (text / tool parts), `session.idle`, `session.error`.
- Normalizes OpenCode's idempotent "updated" events into a small app-facing event union
  (`text.updated`, `tool.updated`, `session.idle`, `error`) so the UI upserts by part/call id.
- Pins the supported OpenCode version (`OPENCODE_VERSION`).

`mock-server.ts` provides an OpenCode-protocol server for Gateway Web tests and
local development.
