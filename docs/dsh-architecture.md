# ZeroWall Science 4.1 Architecture

```text
Electron main
  - BrowserWindow, updater, logs, directory selection
  - safeStorage credential vault and private child IPC
  - fixed Node and DSH Host lifecycle
          |
          v
DSH Host on random 127.0.0.1 port
  - Agent, Session, Tools, Skills, MCP, approvals, sub-Agents
  - ZeroWall Host plugins and generated Typert codecs
          |
          +-- DSH session persistence
          +-- zerowall-research.sqlite
          |
          v
React Renderer
  - DSH conversation shell
  - ZeroWall Account and Research workbench surfaces
  - no Node integration, no secret API, no iframe
```

## Startup and locale

Electron starts the product with `zh-CN` as its browser language, so a fresh
ZeroWall installation opens in Chinese. DSH still performs normal browser
language detection and a saved language preference takes precedence; this is a
ZeroWall product default rather than a global fork of the DSH locale service.
The General settings page exposes the two supported display languages,
`中文` and `English`, and persists the selection for the next launch.

The first account surface offers login, registration, and an explicit skip.
Successful login or registration stores the login material only in the
Electron `safeStorage` vault. On later starts the Host restores the account
without sending the password to the renderer. Logout removes the saved login,
session token, and every account-managed model key.

## Model routing and availability

AI Cloud discovery registers account-managed routes outside the user-editable
DSH model settings. If the current route is unavailable, a signed-in account
automatically selects the first managed DeepSeek model. A working
user-configured model is preserved and is never overwritten by account login.

Every provider exposes a cheap availability check. Missing credentials and
invalid configuration remain visible in the model catalog with a reason, but
their rows and `/model` command entries are disabled and styled as unavailable.
The Host repeats the availability check in `session.selectModel`, and the
composer is blocked when the current route is not routable, so client styling
is not the security or correctness boundary.

Before Pi-AI sends tool definitions, JSON Schema object nodes are normalized
recursively so `required` is always an array, including nested objects and
objects inside arrays. This fixes providers that reject omitted `required`
values as `null`, including the reported `get_goal` failure, without a
function-name special case.

## Domain services

- `zerowall.account`: account lifecycle, balance, orders, recharge, managed models.
- `zerowall.projects`: project and 3.x import/export operations.
- `zerowall.execution`: Local, WSL, SSH contexts and probes.
- `zerowall.runs`: durable lifecycle, logs, cancellation, pause/resume, recovery, harvest.
- `zerowall.research`: assets, artifacts, papers, decisions, library, graph, preview reads.
- `zerowall.publication`: freeze, validation, reproduction metadata, export state.
- `zerowall.presentation`: outline, visual plan, assets, persistent generation and export state.

## Security boundaries

Renderer requests are codec-validated and receive redacted DTOs. The Host listens only on loopback. Electron rejects navigation outside the current Host origin and sends external links to the system browser. Credentials are decrypted only in Electron and resolved by the Host over private child-process IPC.

3.0 uses a new data root and never reads, changes, or automatically migrates 2.x SQLite, sessions, settings, or credentials.
