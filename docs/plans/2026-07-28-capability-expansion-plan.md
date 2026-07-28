# ZeroWall Science — Capability Expansion Plan

Date: 2026-07-28
Status: Plan for review (no code written yet)
Scope: One consolidated plan covering three workstreams evaluated against
wisp-science's capabilities and ZeroWall's real code:

- **Part A — Engine internals**: 3-tier context compaction, RoutedProvider tiered
  routing, Reader cross-session retrieval with citations.
- **Part B — Deep computational-biology skills**: AlphaFold2, OpenFold3, ESMFold2,
  Boltz, Chai-1, DiffDock, ProteinMPNN, Evo2, scGPT, scvi-tools, …
- **Part C — ACP external coding agents**: driving Codex / Claude Code / any
  ACP-compliant agent as a switchable second runtime.

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
| A3 | Reader (retrieval + citations) | **Build** | 2–3 wk | No — native | **1 (highest value/effort)** |
| B1 | Comp-bio: wire existing 15 skills to real compute substrate | **Build, incremental** | 3–4 wk | No | **2** |
| C | ACP external coding agents (desktop) | **Build** | ~4–4.5 wk | Adds a runtime | **3** |
| A2 | Tiered provider routing (thin) | Partial | ~1 wk | Delegated | Slot-in anytime |
| A1 | 3-tier context compaction | **Don't rebuild** | — | Owned by OpenCode | — |
| B2 | Comp-bio: operon-style managed compute daemon | Defer | large | No | After B1 proves value |

Reader (A3) is fully independent and can start immediately. B1 and C both harden
ZeroWall's subprocess/sandbox layer and can share that work. A1 requires no build.

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
  with a selector; implement `AcpRuntime`; UI runtime switcher.
- **Phase 6 — Config surface + presets (2–3 d):** Settings pane for profiles
  (`command`/`args`) following the `proxy.txt`/`mirrors.txt` file pattern; keychain for
  keys; Codex + Claude Code presets.
- **Phase 7 — Web gating (0.5 d):** hide every ACP control via `isGatewayWeb` (desktop
  only; explicitly not proxied to web).
- **Phase 8 — Conformance tests (2–3 d):** fake-agent lifecycle test + opt-in real-binary
  tests for `codex-acp` / `claude-code-acp` (handshake, prompt streaming, permission
  round-trip, fs/terminal round-trip, cancellation, clean exit).

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
