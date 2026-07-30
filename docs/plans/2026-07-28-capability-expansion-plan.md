# ZeroWall Science — Capability Expansion Plan

Date: 2026-07-28 (Part T + Part O added 2026-07-31)
Status: Plan for review (no code written yet)
Scope: One consolidated plan covering the workstreams evaluated against
wisp-science's capabilities and ZeroWall's real code:

- **Part T — Token / cost / context-window accounting**: capture, persist, and
  display per-turn/session token usage, USD cost, and context-window fill.
- **Part A — Engine internals**: 3-tier context compaction, RoutedProvider tiered
  routing, Reader cross-session retrieval with citations.
- **Part B — Deep computational-biology skills**: AlphaFold2, OpenFold3, ESMFold2,
  Boltz, Chai-1, DiffDock, ProteinMPNN, Evo2, scGPT, scvi-tools, …
- **Part C — ACP external coding agents**: driving Codex / Claude Code / any
  ACP-compliant agent as a switchable second runtime.
- **Part O — Other wisp→ZeroWall fusion candidates**: WSL contexts, turn undo,
  interactive terminals, encrypted project sync, global library.

All findings below are grounded in source (ZeroWall + wisp), not assumed.

---

## 0. The one cross-cutting constraint

ZeroWall delegates the **entire agent loop to OpenCode** (bundled single-binary
sidecar, HTTP + SSE; UI → `packages/sdk` `OpenCodeClient`; AGENTS.md guardrail).
Anything that must happen *inside the loop* (compaction, per-turn routing) has no
insertion point in ZeroWall's own Rust/TS. Anything that sits *beside* the loop on
ZeroWall's data (Reader) or *replaces/adds a runtime* (ACP) is ours to build.
This single fact decides most verdicts below.

---

## 0.1 Unified roadmap (recommended sequence)

| # | Workstream | Verdict | Effort | Touches OpenCode loop? | Priority |
|---|---|---|---|---|---|
| **T** | **Token / cost / context-window accounting** | **Build** | **3–5 d** | No — data already emitted | **1 (do first)** |
| A3 | Reader (retrieval + citations) | **Build** | 2–3 wk | No — native | 3 |
| B1 | Comp-bio: wire existing 15 skills to real compute substrate | **Build, incremental** | 3–4 wk | No | 4 |
| C | ACP external coding agents (desktop) | **Build** | ~4–4.5 wk | Adds a runtime | **2** |
| O | Other fusion candidates (WSL / undo / terminal / sync / library) | **Build, à la carte** | small→large | No | Interleave |
| A2 | Tiered provider routing (thin) | Partial | ~1 wk | Delegated | Slot-in anytime |
| A1 | 3-tier context compaction | **Don't rebuild** | — | Owned by OpenCode | — |
| B2 | Comp-bio: operon-style managed compute daemon | Defer | large | No | After B1 proves value |

Part **T** is the highest-ROI item and comes first: the user asked for it, and the
data is **already produced by OpenCode and currently discarded by ZeroWall** — no
loop control needed. Reader (A3) is fully independent. B1 and C both harden
ZeroWall's subprocess/sandbox layer and can share that work. A1 requires no build.

Chosen execution order: **T → C → (O:WSL, O:turn-undo interleaved) → A3 → rest.**

---

# Part T — Token / cost / context-window accounting ★ do first

## T.0 Why this is the cheapest high-value item

The user asked for token-usage statistics. Unlike wisp — which had to parse each
provider's raw usage JSON inside its own Rust agent loop (`crates/wisp-llm/src/
message.rs:226` `Usage`, per-provider parsing in `openai.rs`/`anthropic.rs`/
`responses.rs`) — **ZeroWall gets the numbers for free from OpenCode and currently
throws them away.** OpenCode stamps every assistant message's `info` object with
`tokens {input, output, reasoning, cache:{read,write}}` and `cost` (USD), delivered
both live (SSE `message.updated`) and historically (`GET /session/{id}/message`).

Grounded gaps in ZeroWall today:
- `OpenCodeClient.normalize` `message.updated` branch (`packages/sdk/src/
  OpenCodeClient.ts:1169`) reads only `info.id/role/sessionID/agent` — `tokens`/
  `cost` are dropped.
- `OpenCodeClient.getMessages` (`packages/sdk/src/OpenCodeClient.ts:378`) types
  `info` with only `id/role/time/error/agent` — `tokens`/`cost` never surface.
- No token/cost/context-fill display anywhere in the thread UI (verified: every
  `token` hit in the app is an auth token). Only static per-model context-window
  **discovery** exists (`src-tauri/src/model_probe.rs`) for the Settings form.

**ZeroWall advantages over wisp's design:**
- **Real USD cost, no pricing table.** wisp shows no per-session cost and has no
  model price data; OpenCode reports `cost` directly, so we get dollars with zero
  maintenance.
- **Accurate context %.** wisp estimates context fill as `len/4`
  (`crates/wisp-core/src/context.rs:244`); we use OpenCode's real input-token count
  ÷ the model's true window (already probed in `model_probe.rs`).

## T.1 Design (reuse the M006 review pattern: emit event → persist → aggregate)

The Review subsystem already established the idiom "structured signal folded in the
thread + persisted to SQLite + read back by an aggregate query." Token accounting
follows the same shape; **no OpenCode loop insertion needed.**

**1. SDK — capture (`packages/sdk/src/OpenCodeClient.ts`, `types.ts`)**
- Extend the `message.updated` `info` read to also pull `tokens` and `cost`; emit a
  new `UsageEvent { type:"usage", sessionId, messageID, input, output, reasoning,
  cacheRead, cacheWrite, cost }`. Emit only when tokens are present (final assistant
  info), not on every partial.
- Extend `getMessages` `info` typing + `HistoryMessage` to carry `tokens`/`cost` so
  history rebuild backfills the same rows.
- Add `UsageEvent` to the event union in `types.ts`.

**2. Frontend fold (`apps/desktop/src/lib/runtime.ts`)**
- `foldEvent` handles `"usage"`: sum all steps within the current turn into one
  "this reply" usage record floated to the reply tail — mirror how `groupToolBlocks`
  folds multi-step reasoning into one card. Live status also updates from it.
- `historyToThread` reconstructs per-reply usage from `getMessages` info.

**3. Persist + aggregate (Rust)**
- Migration `M009__usage.sql`: `usage_events(session_id, message_id PRIMARY KEY,
  input, output, reasoning, cache_read, cache_write, cost_usd REAL, created_at)`.
  `message_id` PK makes re-recording idempotent (history reload upserts, never
  double-counts).
- `ZeroWallClient.recordTurn` (or a sibling `recordUsage`) writes the row.
- Read-only Tauri command `usage_by_session` → `SUM(...) GROUP BY session`, plus a
  grand-total roll-up. Mirrors wisp's `token_usage_by_session`
  (`crates/wisp-store/src/sessions.rs:1342`) but adds `cost_usd`.

**4. UI — three surfaces (borrow wisp's proven shapes)**
- **Live status bar**: `{in} in / {out} out · ctx {pct}%` where `pct = input ÷
  window` (window from `model_probe`). wisp equivalent: `ui/src/main.rs:2080`.
- **Per-reply tail line**: `123 in · 456 out · $0.0021` (append `· {n} cached` /
  `· {n} reasoning` only when non-zero). wisp equivalent: `ui/src/main.rs:12996`.
- **Settings → Usage tab**: cumulative summary tiles (input/output/reasoning/cached/
  **cost**) + per-session table. wisp equivalent: `ui/src/settings_view.rs:1252`.

**5. Web/gateway**: pure display — works over the gateway; **not** hidden by
`isGatewayWeb`. Phone-width: usage tab collapses tiles to a stacked list.

**6. i18n**: add a `usage` namespace across the 7 selectable locales (parity gate).

## T.2 Edge cases (fail honestly, per AGENTS.md)

- **Provider returns no `cost`** (e.g. the sub2api gateway may omit it): show tokens,
  render cost as `—`. Never fabricate a price. If `tokens` is also absent, show no
  usage row rather than zeros.
- **Cache fields absent**: treat as 0, omit the `cached` suffix.
- **Context window unknown for a model** (probe failed): omit the `ctx %` segment,
  keep in/out counts.
- **Subagent turns**: attribute usage to the child session; the Settings roll-up
  folds sub-sessions to their root (as wisp does via `root_frame_id`).
- **ACP runtime (Part C)**: `AcpRuntime` emits the same `UsageEvent` from the ACP
  `AcpUsageUpdate {used, size, cost}` (`crates/wisp-acp/src/lib.rs:818`), USD cost —
  same table, unified display across both runtimes.

## T.3 Verification

- Vitest: `OpenCodeClient` emits `usage` with the right fields from a mock
  `message.updated`; drops it when tokens absent; `getMessages` backfills.
- Vitest: `foldEvent` folds multi-step usage into one per-reply record; cost `—`
  path; context-% omitted when window unknown.
- cargo: `usage_by_session` sums correctly and is idempotent on re-insert of the
  same `message_id`.
- i18n parity test (7 locales × new `usage` keys).

## T.4 Milestone

Send a prompt on a paid provider → live status shows `in/out · ctx%`, the reply
carries a `… · $x.xxxx` line, and Settings → Usage lists the session with a running
cumulative cost. On the sub2api gateway (no cost), tokens show and cost reads `—`.

---

# Part A — Engine internals

**Constraint recap:** OpenCode owns the loop (see §0).

## A1. 3-tier context compaction — DON'T REBUILD

- Grounded: OpenCode produces the summaries. ZeroWall's `memory_store.rs`
  (`compaction_archives` table, `record_compaction_archive`) is a **passive sink** —
  it receives an already-compacted span as a parameter and archives it. No
  summarization model call exists in ZeroWall.
- Verdict: rebuilding a wisp-style 3-tier compactor means seizing loop control or
  forking the sidecar — violates the "pin & bundle OpenCode" guardrail.
- Action: keep delegating to OpenCode; keep archiving spans for provenance. If
  OpenCode exposes tiered-compaction config, drive it via config only.

## A2. RoutedProvider tiered routing — THIN LAYER ONLY

- Grounded: absent in ZeroWall. Model selection is OpenCode's. `runtime/agents/*.json`
  carry only a **static** `modelBinding {primary, fallback, reasoning}`
  (`schema-v1.json`), consumed by `ZeroWallClient.agentForRole`.
- Verdict: true per-turn low/med/high routing needs loop control we don't own.
- Action (~1 wk): surface a "task-class → agent/model profile" mapping in ZeroWall
  config; delegate actual switching to OpenCode agent profiles. Partial capability,
  low cost. Do not attempt in-loop routing.

## A3. Reader (cross-session retrieval with citations) — BUILD ★ highest ROI

- Grounded: the **substrate already exists** in ZeroWall Rust — `provenance.rs`
  (append-only `.zerowall/provenance.jsonl`, lineage per file write),
  `memory_store.rs` (recallable notes, `content_ref` SHA-256), `science_db.rs`
  (~40 tables, content-addressed store), `research_graph.rs` (derived read-only
  node/edge projection), `annotation_store.rs`, `review_store.rs` (claims). There is
  **no retrieval/citation engine** over any of it yet.
- Verdict: most native and highest-value of the three engine items; does not touch
  the OpenCode boundary.

**Phased plan (2–3 wk):**
1. Retrieval index over provenance + memories + science-db + claims/annotations.
   Start with BM25/keyword + structured filters (content-addressed hashes make every
   result natively citable); vector search as an optional later increment.
2. Citation assembly: every answer returns source refs (artifact version /
   provenance record id / memory id) that resolve back through the content store.
3. Surface through `research_graph.rs`'s read-only projection.
4. Milestone: a cross-session query returns "answer + clickable provenance."

---

# Part B — Deep computational-biology skills

## B.0 The reframe (important)

The question was "can we port wisp's comp-bio skills." The honest answer changes the
problem:

1. **ZeroWall already ships these skills.** `runtime/skills/life-science/` has 16
   skills; 15 model runners (AlphaFold2, Boltz, ESMFold, ProteinMPNN, …) already
   exist as SKILL.md but are `enabled: false` in `runtime/packs/life-science/manifest.yaml`
   with **no execution backend**.
2. **Skill text is not the bottleneck.** wisp skills are pure SKILL.md (only
   `scvi-tools/kernel.py`, a stdlib helper, carries code). Porting is mechanical.
3. **The bottleneck is compute dispatch.** wisp skills assume wisp's Rust **Run
   lifecycle** (`run_in_context`/`monitor_run`/`get_run`/`cancel_run` + `ssh:`/`wsl:`
   contexts + interactive `python` kernel). ZeroWall's equivalent ("operon" daemon:
   `compute_provider`/`list_compute`/`submit_job`, `provider.py` importing
   `operon_compute_provider`) is **roadmap/absent — imports a package that doesn't
   exist in the repo.**

**ZeroWall's REAL compute substrate** (verified implemented): local Python/R kernels
(`kernel.rs`), managed Jupyter env (`jupyter.rs`), `uv` isolated venvs (`uv.rs`,
installs gated by approve mode via `DANGEROUS_BASH`), agent-driven `ssh`/`sbatch`/`modal`
CLI backed by real Rust probe/status (`compute.rs`, `modal.rs`), and the 247-tool bio
MCP registry (`runtime/connectors/`, minus legally-gated tools).

## B.1 Licensing (verified from each SKILL.md frontmatter)

- All skill **prose** is Apache-2.0 → compatible with MIT (retain notices).
- Weights: 10 of 14 are MIT/Apache-2.0. Flags:
  - **AlphaFold2**: params CC-BY-4.0 + "DeepMind terms of use" (commercial OK w/ attribution; user downloads).
  - **borzoi**: ported weights CC-BY-4.0 (attribution).
  - **scGPT**: weights license **UNKNOWN** — Google-Drive checkpoints, unlabeled → **legal-review item before shipping.**
- **Do NOT port the `bear-*` literature skills** (CC BY-NC-SA 4.0, non-commercial) even though they share the `skills/` dir.
- ColabFold MSA server (`api.colabfold.com`) has no published ToS; user sequence leaves the machine when MSA-server mode is on (default for some co-folders) — surface this to the user.

## B.2 Phased plan

**B1 — Wire existing skills to the real substrate (3–4 wk, incremental) ★**
- Rewrite each skill's "Wisp execution" / "Remote compute" section (the ~10-line
  wisp-tool boilerplate) to ZeroWall's idiom: local kernel + `uv` env + agent-driven
  `ssh`/`sbatch`/`modal` CLI. (ZeroWall's own 15 skills need the same rewrite.)
- Enable skills by compute need, one at a time, each verified end-to-end on real data:
  - CPU-friendly first (ProteinMPNN, small DiffDock) → local/uv env.
  - GPU next (AlphaFold2/Boltz/ESMFold) → agent-driven remote SSH/Slurm to the
    user's own GPU box.
- For any ported wisp skill: strip the wisp-tool section, keep the portable
  "Running it" content, inline `scvi-tools`'s `h5ad_safe_obs` helper.

**B2 — operon-style managed compute daemon (defer, large)**
- Only if managed endpoints / BYOC job lifecycle are needed. This is a real Rust
  effort (adapting wisp's Apache-2.0 compute layer, coupled to its 11-crate arch).
  Re-evaluate after B1 proves value.

**Legal (before any GPU skill ships):** park scGPT; add attribution for AF2/borzoi;
exclude bear-*.

---

# Part C — ACP external coding agents

## C.0 Locked decisions (product owner)

| Topic | Decision |
|---|---|
| Role | ZeroWall is the **ACP client**; spawns external agents as local child processes and drives them. |
| vs OpenCode | **Coexist, switchable** — OpenCode stays default; external agent is a selectable second runtime. |
| Target | **Generic ACP client**; **Codex + Claude Code** shipped as presets. |
| **Auth** | **ZeroWall injects the API key** from its keychain into the agent's spawn environment (NOT the agent's own CLI login). Never into provenance/logs/exports. |
| **Web** | **Desktop only. No web client.** Hide all controls via `isGatewayWeb`; no gateway-proxy work. |
| **Filesystem/terminal** | **Expose client-hosted filesystem + terminal** to the external agent, so all file ops and shell commands route through ZeroWall. |
| **Provenance** | **Record external-agent file writes** in `provenance.jsonl`, same as OpenCode's. |

### Why the fs/terminal decision is architecturally good
Implementing ACP's **client-hosted filesystem + terminal** means the agent asks
ZeroWall to read/write files and run commands, rather than touching the disk itself.
Every operation then passes through ZeroWall's own handlers, so **workspace
sandboxing, approval gating, and provenance recording all happen in one place** and
compose naturally (satisfies the C-fs, C-provenance, and safety requirements
together). It is more protocol surface than wisp's v1 (wisp deferred client fs/
terminal), so we implement these handlers fresh against the `agent-client-protocol`
SDK.

## C.1 Grounded findings

- **`wisp-acp` is directly reusable**: Apache-2.0, **zero wisp-internal deps**; only
  `agent-client-protocol =1.2.0` (Zed SDK, Apache-2.0, from crates.io) + generic libs.
  Copy the crate as-is. Near-complete ACP v1 client over **stdio JSON-RPC**. All wisp
  coupling lives in the consumer layer (`src-tauri/src/acp.rs`, `delegation_runtime.rs`)
  — that's what we re-write. Note: wisp's client fs/terminal methods are **not**
  implemented (deferred), so those we build ourselves.
- **No per-vendor adapters**: an agent is a generic `{id,label,command,args}` profile.
  Codex = `codex-acp`, Claude Code = `npx @zed-industries/claude-code-acp` — user
  commands, shipped as presets.
- **ZeroWall has the seam, nothing behind it**: `AgentRuntime` (`packages/sdk/src/runtime.ts`)
  + `BaseAgentRuntime` (`base-runtime.ts`) exist; but `lib/runtime.ts` hardcodes
  `new OpenCodeClient(...)`, there's no factory/selector, and the `CodexRuntime`
  class + `docs/AGENT_INTEGRATION.md`/RFC files referenced in comments **do not exist**
  (fiction). Agent schema has **no `runtime`/`backend` field**.
- **Reusable subprocess infra**: lifecycle `Mutex` (anti double-spawn), `free_port`,
  per-launch password, **PID-file + orphan-kill** (`jupyter.rs`), `quiet_command()`
  (mandatory on Windows to avoid console flash), `kill_child` on `RunEvent::ExitRequested|Exit`.
- **Safety does NOT come free**: ZeroWall's approval gating lives **inside OpenCode**
  (`opencode_config.rs` writes `"ask"` rules for `DANGEROUS_BASH`; workspace-only =
  sidecar `current_dir(workspace)`). An external agent inherits none of it — but with
  client-hosted fs/terminal we gate at our own handlers (see C.0).
- **Auth injection mechanism exists**: ZeroWall already materializes keychain secrets
  into a sidecar's spawn env (`OPENCODE_AUTH_CONTENT` + per-connector vars, `runtime.rs`).
  The same path injects the external agent's key (e.g. `OPENAI_API_KEY` for codex,
  `ANTHROPIC_API_KEY` for claude-code) at spawn.

## C.2 Target architecture

Home = **Rust** (Apache-2.0 crate, zero internal deps, already tested vs real
`codex-acp`; spawning belongs in the Tauri host).

```
UI (React) — runtime switcher: "OpenCode" | "External agent: <profile>"  [desktop only]
packages/sdk
  ├─ OpenCodeClient implements AgentRuntime   (existing — HTTP/SSE)
  └─ AcpRuntime     implements AgentRuntime    (NEW — bridge over Tauri IPC)
apps/desktop/src-tauri/src
  ├─ acp_consumer.rs (NEW): sessions, key injection at spawn, permission gating,
  │     client-hosted fs/terminal handlers (→ workspace sandbox + approval + provenance),
  │     transcript persistence via science_store/provenance, Tauri events
  └─ crate zerowall-acp (ported wisp-acp, Apache-2.0) + client fs/terminal (NEW)
        └─ dep: agent-client-protocol =1.2.0 (Apache-2.0)
external agent (stdio JSON-RPC): codex-acp | claude-code-acp | any ACP agent
```

## C.3 Phased plan (~4–4.5 wk, desktop v1)

- **Phase 0 — Spec + licensing (0.5–1 d):** write the real RFC (`docs/rfc/agent-runtime.md`);
  Apache-2.0 NOTICE for the ported crate + SDK.
- **Phase 1 — Port protocol crate (2–3 d):** copy `wisp-acp` → `zerowall-acp` verbatim,
  bring its fake-agent integration test, `cargo test` green cross-platform.
- **Phase 2 — Consumer + lifecycle (3–4 d):** launch profiles via ZeroWall's subprocess
  toolkit (`quiet_command`, lifecycle `Mutex`, PID + orphan-kill, kill-on-exit);
  session↔workspace binding; Tauri commands + events.
- **Phase 3 — Client-hosted fs + terminal + safety (5–7 d, critical path):** implement
  ACP client fs/terminal handlers; enforce workspace-only (project-scoped, fail-closed),
  approval gating on exec/delete/install/remote via the existing interactive-request UI,
  unknown requests rejected; default mode approve, never `off`; **record writes to
  `provenance.jsonl`.**
- **Phase 4 — Key injection (1–2 d):** keychain → spawn env (`OPENAI_API_KEY` /
  `ANTHROPIC_API_KEY` / generic), reusing the `runtime.rs` secret-materialization path;
  never logged.
- **Phase 5 — Runtime factory + `AcpRuntime` (3–4 d):** replace hardcoded `OpenCodeClient`
  with a selector; implement `AcpRuntime`; UI runtime switcher. `AcpRuntime` also
  emits Part T's `UsageEvent` from the ACP `AcpUsageUpdate {used, size, cost}`
  (`crates/wisp-acp/src/lib.rs:818`, USD) so token/cost accounting is unified across
  both runtimes on one table and one UI.
- **Phase 6 — Config surface + presets (2–3 d):** Settings pane for profiles
  (`command`/`args`) following the `proxy.txt`/`mirrors.txt` file pattern; keychain for
  keys; Codex + Claude Code presets.
- **Phase 7 — Web gating (0.5 d):** hide every ACP control via `isGatewayWeb` (desktop
  only; explicitly not proxied to web).
- **Phase 8 — Conformance tests (2–3 d):** fake-agent lifecycle test + opt-in real-binary
  tests for `codex-acp` / `claude-code-acp` (handshake, prompt streaming, permission
  round-trip, fs/terminal round-trip, cancellation, clean exit).

---

---

# Part O — Other wisp→ZeroWall fusion candidates

Features wisp ships and ZeroWall lacks, worth fusing à la carte. None touch the
OpenCode loop. Ordered by ROI; interleave the small ones with T/C.

## O.1 WSL execution contexts — small, high Windows value ★
- **Gap:** ZeroWall has SSH + Slurm + Modal (`src-tauri/src/compute.rs`, `modal.rs`)
  but **no WSL** (verified: no `wsl` refs in the Rust backend). wisp models WSL as a
  first-class execution context (`src-tauri/src/wsl_contexts.rs`).
- **Build:** discover distros via `wsl -l -v`; add a `wsl:` context alongside the
  SSH host registry; route the existing remote-compute skill through `wsl.exe`.
  Reuse `compute.rs`'s probe/status framing. Windows-only; hidden elsewhere.
- **Effort:** small–medium.

## O.2 Turn undo (preview + rollback) — small, high safety value ★
- **Gap:** ZeroWall has best-effort git snapshots (`src-tauri/src/git_snapshot.rs`)
  but no user-facing "undo this turn." wisp's `turn_undo.rs` previews exactly which
  files/artifacts a turn wrote, then restores text files and removes artifacts owned
  by that turn.
- **Build:** wrap `git_snapshot` + `provenance.jsonl` (which already attributes each
  file write to its turn) into a "preview → confirm → rollback" command; add an Undo
  action beside Copy on the latest assistant reply.
- **Effort:** small.

## O.3 Interactive terminals (PTY/ConPTY) — medium
- **Gap:** none in ZeroWall. wisp has `src-tauri/src/terminal_sessions.rs` (PTY on
  Unix, ConPTY on Windows) for local/WSL/SSH shells.
- **Build:** a Tauri PTY bridge + xterm.js pane. Composes with O.1 (WSL) and SSH.
  Desktop-only (gate via `isGatewayWeb`).
- **Effort:** medium.

## O.4 Encrypted project sync / project export ZIP — large
- **Gap:** none in ZeroWall. wisp has cross-OS export/import ZIP
  (`project_transfer.rs`) and encrypted incremental sync via self-hosted relay or a
  Baidu/Nutstore folder (`crates/wisp-sync`, `project_sync.rs`), foreground-only,
  refuses to run mid-task.
- **Build:** start with export/import ZIP (self-contained, no server); defer the
  encrypted relay sync until there's demand. Respect AGENTS.md "never set a remote or
  push" — this is out-of-band sync, not git remotes.
- **Effort:** ZIP small–medium; relay sync large. **Defer relay.**

## O.5 Global library (cross-project reuse) — medium
- **Gap:** none in ZeroWall. wisp's `library_commands.rs` keeps immutable copies of
  code cells and image artifacts reusable across projects.
- **Build:** a content-addressed library table over the existing artifact store;
  "save to library" / "insert from library" actions. Lower priority than T/C/O.1/O.2.
- **Effort:** medium.

## O.6 Tiered provider routing (= Part A2) — thin, optional
- Cross-reference A2: surface a "task-class → agent/model profile" map in config,
  delegate actual switching to OpenCode agent profiles. Do not attempt in-loop
  routing. ~1 wk, slot in anytime.

**Deliberately NOT fused** (already present, or out of scope): Plan mode, Review
(M006), MCP connectors, Skills+Packs, subagent/specialist catalog (M004), SSH+Slurm+
Modal, provenance, research graph, gateway remote access, real-browser control, local
Jupyter kernels, command palette, i18n — all verified present in ZeroWall. wisp's
IM channels (Feishu/WeChat), StickS3 device bridge, and desktop pet are product
choices out of ZeroWall's research-workbench scope.

---

## D. Cross-cutting risks

- **Safety is the critical path** for both B (compute dispatch) and C (external agent),
  not the protocol/skill text. Fail-closed everywhere; default approve; never ship `off`.
- **Secrets**: keys injected into agent spawn env must never reach provenance, logs,
  crash reports, git, or exports (AGENTS.md non-negotiable).
- **scGPT weights license unknown** — legal review before shipping any scGPT feature.
- **ColabFold MSA server** exfiltrates the user's sequence when enabled — surface to user.
- **Windows**: every direct subprocess spawn must use `quiet_command()`.
- **Web parity intentionally dropped** — external agents and (as today) local kernels
  are desktop-only.

## E. Remaining open items (non-blocking)

- ACP transport is **stdio only** (matches wisp); remote agents out of scope.
- Whether Reader (A3) later adds vector search vs staying BM25 — decide after v1.
- Whether B2 (operon daemon) is ever needed — decide after B1.
- Part T: whether to also expose a **budget cap** (warn/stop at $ or token threshold)
  — wisp only does this for delegated sub-agents; decide after the display ships.
- Part O: relay-based encrypted sync (O.4) and global library (O.5) are demand-gated.
