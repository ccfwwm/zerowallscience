# packages/sdk

`OpenCodeClient` — the single boundary between the app and the agent runtime.

The UI never calls OpenCode directly. This package wraps the transport so the runtime
can change without touching the frontend:

- Talks to a running `opencode serve` over its HTTP + SSE API:
  - `POST /session` (create), `POST /session/:id/prompt_async` (send prompt).
  - `GET /event` (SSE) — `message.part.updated` (text / tool parts), `session.idle`, `session.error`.
- Normalizes OpenCode's idempotent "updated" events into a small app-facing event union
  (`text.updated`, `tool.updated`, `session.idle`, `error`) so the UI upserts by part/call id.
- Pins the supported OpenCode version (`OPENCODE_VERSION`).

`mock-server.ts` provides an OpenCode-protocol server for tests and local dev.
