# ZeroWall Science — Product Requirements

> **Status (v0.1, 2026-07-02).** The runtime is **OpenCode**, bundled as an isolated
> sidecar (one-click, auto-started, does not touch a user's own OpenCode). Built: the
> three-column workbench UI, real multi-session chat with history, a real Skills/Agents
> view, BYOK key config, and a macOS installer. Literature search, provenance/reviewer,
> code-execution backends, and Science Packs below are the target scope, not all shipped.

## 1. Positioning

**ZeroWall Science** is an open-source AI research workbench with macOS /
Windows installers, positioned as an **open-source alternative to Claude Science
style products**.

It is not an ordinary paper-summarization tool. It is a local-first, model-agnostic,
reproducible, auditable research agent workbench that helps researchers do:

- Literature search
- Paper parsing
- Data analysis
- Code execution
- Figure generation
- Report writing
- Citation checking
- Artifact provenance
- Reusable research workflows

Slogan:

> Open-source AI research workbench for reproducible science.

## 2. Goals

### 2.1 Phase 1 goal

Phase 1 must be a genuinely installable desktop app, not a CLI tool.

Required support:

| Platform | Installer | Priority |
| --- | --- | --- |
| macOS Apple Silicon | `.dmg` / `.app` | P0 |
| macOS Intel | `.dmg` / `.app` | P1 |
| Windows x64 | `.exe` NSIS installer | P0 |
| Windows x64 | `.msi` installer | P1 |

Tauri officially supports macOS and Windows and can package `dmg`, `app`, `nsis`,
and `msi` targets; Windows can ship as `.msi` or an NSIS `setup.exe`.

### 2.2 Differentiation

Versus ordinary AI paper tools, ZeroWall Science is different because it is:

1. A research workbench, not a chat box.
2. A generator of traceable artifacts, not just text.
3. Model-agnostic (BYOK / OpenRouter / OpenAI-compatible / local), not tied to one model.
4. Transparent — it keeps code, data, figures, reports, logs, and provenance — not a black box.
5. Multi-domain — expanding from biology to AI4S, materials, chemistry, biology,
   medicine, engineering, and industry.

## 3. Target users

### 3.1 Core users

1. **Researchers** — fast literature reviews; organizing papers, data, figures,
   reports; reproducibility and citation accuracy.
2. **AI4S / AI-for-Science developers** — integrating scientific skills, MCP, and
   database connectors into one workbench; an open-source Claude Science alternative.
3. **Grad / PhD / postdoc students** — topic surveys, paper reading, experiment data
   analysis, submission material prep.
4. **Open-source AI agent users** — already using OpenCode, Codex, Claude Code, Cursor,
   MCP, Agent Skills; want a research-focused desktop product.

### 3.2 Non-target users (Phase 1)

- Complete beginners who cannot configure an API key.
- Users needing clinical diagnosis or medical decisions.
- Institutions needing multi-user collaborative SaaS.
- Teams needing enterprise permissions, audit, or SSO.

## 4. Core product principles

### 4.1 Local-first

Runs on the user's machine by default. Project files, corpora, figures, reports, and
execution logs are stored in a local workspace.

### 4.2 Model-agnostic

No lock-in to Claude, OpenAI, or any single local model. Users can choose OpenRouter,
OpenAI-compatible APIs, the Anthropic API, or local models; Ollama / vLLM / LM Studio
support follows.

### 4.3 Reproducibility-first

Every important artifact must be traceable:

| Artifact | Must trace to |
| --- | --- |
| Figure | generating code, input data, parameters |
| Report | citation sources, data sources, analysis steps |
| Table | raw data, cleaning script |
| Conclusion | citations, data, model output |
| Agent action | time, tool, input, output, status |

### 4.4 Human-in-the-loop

High-risk actions — file writes, command execution, dependency installs, network
access, file deletion, remote compute — require user approval. The bundled OpenCode runtime provides
dangerous-command approval, container isolation, MCP credential filtering, and
cross-session isolation.

## 5. MVP scope

### 5.1 P0 features

#### 5.1.1 Install & first launch

After downloading and first opening, the user enters onboarding:

1. Choose a model provider.
2. Enter an API key.
3. Choose a workspace directory.
4. Detect the local runtime environment.
5. Use the bundled OpenCode runtime (auto-started; no separate install).
6. Create the first research project.

First launch must clearly tell the user: data is stored locally by default; the agent
requests authorization before running commands; the user must supply their own model
API key; research results need human verification and are not final conclusions.

#### 5.1.2 Home

Shows: recent projects, new project, example workflows, current runtime status, model
connection status, local workspace status.

Recommended default examples: Literature Review, Bibliometric Analysis,
Paper-to-Report, Dataset Analysis, Citation Review, Reproducibility Audit.

#### 5.1.3 Research agent workspace

The main work area, in a three-column layout:

```text
Left:   projects / workflows / files
Middle: agent chat + plan + execution progress
Right:  artifacts / citations / review / run logs
```

Core interaction: user submits a task → agent produces a plan → user confirms →
agent runs tools → each step shows status → artifacts land in the Artifact panel →
reviewer checks automatically → user exports the report.

#### 5.1.4 Plan confirmation

For multi-step tasks the agent must produce a plan before executing.

```text
Goal:
Data sources:
Steps:
Expected artifacts:
Risks & limitations:
Actions requiring authorization:
```

User options: Approve · Edit Plan · Run Step by Step · Cancel.

#### 5.1.5 Literature search

v1 sources: arXiv, PubMed, Crossref, OpenAlex, Semantic Scholar (optional API key),
local PDF import.

Features: keyword search; filter by year and source; dedup; export `corpus.csv`; save
search logs; record data-source limits.

#### 5.1.6 Skills library

The Skills page lists the **real** skills and agents the OpenCode runtime has loaded
(built-in + project `.opencode/skill/` + user config) — no hardcoded catalog. Skill
sources, layered:

1. **OpenCode built-in** skills/agents (shipped with the runtime).
2. **Self-authored AI4S skills** — planned: `literature-review`, `reproducible-analysis`,
   `citation-reviewer`, `figure-provenance`, `paper-to-report` (Markdown skills under
   `runtime/skills/core`, loaded from the workspace `.opencode/skill/`).
3. **Third-party scientific skills** — e.g. K-Dense `scientific-agent-skills` (curated
   install, a later feature).

K-Dense `scientific-agent-skills` is a collection for science/research; its README
describes ~148 skills and compatibility with Claude Code, Codex, Cursor, OpenCode, and
other Agent Skills hosts.

#### 5.1.7 Code execution

v1 languages: Python, Shell (R later).

| Mode | Notes |
| --- | --- |
| Local | Run directly in the local workspace |
| Docker | Run in an isolated container |
| SSH | Remote server execution (later) |
| Modal | Cloud execution (later) |
| Jupyter Kernel | Notebook-style persistent kernel (later) |

OpenCode runs tools locally inside the bundled runtime by default; Docker sandbox and
SSH / Modal remote execution are optional advanced backends, so the desktop starts local
and expands later.

#### 5.1.8 Artifact panel

All outputs land here. Types: Markdown reports, CSV tables, PNG / SVG figures, PDFs,
Python scripts, notebooks, JSONL provenance, review reports.

Each artifact shows: filename, type, created time, generating step, input data,
generating code, review status, and export / copy / open actions.

#### 5.1.9 Provenance

Each project auto-generates `provenance.jsonl`, `manifest.json`, and `review.md`.

`provenance.jsonl` records each step, append-only:

```json
{
  "step_id": "step_001",
  "type": "literature_search",
  "tool": "openalex",
  "input": {},
  "output_files": ["data/corpus.csv"],
  "timestamp": "",
  "status": "success"
}
```

#### 5.1.10 Reviewer panel

v1 reviewer does basic checks: citations exist; DOI / PMID / arXiv IDs are
well-formed; figures have generating code; tables have source data; reports include
limitations; no untraced artifacts; no steps the agent claims but never ran.

## 6. UI design requirements

### 6.1 Keywords

Modern, restrained, refined, research feel, tool feel — not flashy, not a traditional
admin panel, not a low-quality AI wrapper. Reference vibes: Linear's simplicity,
Cursor's technical feel, Notion's information structure, Raycast's command palette,
Vercel's cleanliness, Claude's warmth.

### 6.2 Visual style

Light theme (default):

| Use | Suggestion |
| --- | --- |
| Background | warm white / soft gray |
| Primary | deep indigo / blue violet |
| Accent | teal / cyan |
| Success | soft green |
| Warning | amber |
| Error | soft red |
| Text | near black / slate |

Dark theme:

| Use | Suggestion |
| --- | --- |
| Background | near black / deep navy |
| Card | dark slate |
| Primary | blue violet |
| Accent | cyan |
| Text | soft white |

### 6.3 Main layout

```text
┌─────────────────────────────────────────────────────────┐
│ Top Bar: Project / Model / Runtime / Sync / Settings    │
├──────────────┬──────────────────────────┬───────────────┤
│ Sidebar      │ Main Agent Workspace      │ Artifact Dock │
│ Projects     │ Chat / Plan / Execution   │ Files         │
│ Workflows    │ Progress Timeline         │ Figures       │
│ Skills       │ Code Blocks               │ Tables        │
│ Connectors   │ Reports                   │ Citations     │
│ Settings     │                          │ Review        │
└──────────────┴──────────────────────────┴───────────────┘
```

### 6.4 Core pages

- **Home** — welcome card, new project, recent projects, example workflows, runtime status, model status.
- **Project Workspace** — agent chat, execution timeline, plan approval card, tool-call cards, artifact dock, review warnings.
- **Literature** — search, filter, list, abstract preview, PDF status, citation info, add to corpus, export BibTeX / CSV.
- **Data & Code** — file tree, Python scripts, notebook preview, CSV preview, run history, environment dependencies.
- **Artifacts** — figure gallery, report preview, table preview, provenance chain, download / export.
- **Review** — citation check, figure provenance check, data source check, reproducibility check, risk warnings, limitations.
- **Skills** — installed skills, recommended scientific skills, install from GitHub, enable / disable, view `SKILL.md`, check license, check dependencies.
- **Settings** — model provider, API keys, workspace path, runtime backend, security approvals, update settings, appearance theme, data cleanup.

## 7. Key interactions

### 7.1 Plan card

Must be clean and clear. Contains: goal, step list, tools to call, expected artifacts,
risk notes, run buttons. Buttons: Approve & Run · Edit Plan · Run Step-by-step ·
Save as Workflow.

### 7.2 Tool-call card

Shows: tool name, status, input summary, output summary, duration, token / cost
(optional), view details, copy log. Status: Pending · Running · Waiting Approval ·
Success · Warning · Failed.

### 7.3 Approval dialog

For dangerous actions — delete file, overwrite file, install package, run shell,
network access, connect remote server, upload file — a dialog must confirm. Options:
Allow Once · Always Allow for This Project · Deny · View Details.

### 7.4 Command palette

Shortcut: `Cmd + K` (macOS) / `Ctrl + K` (Windows). Quick actions: new project, search
literature, run reviewer, open settings, switch model, install skill, export report.

## 8. MVP example workflow

v1 must ship one complete demo:

```text
2023–2026 brain-computer interface literature trends
```

Outputs: `plan.md`, `data/corpus.csv`, `scripts/analyze.py`, `figures/year_trend.png`,
`figures/topic_clusters.png`, `figures/top_keywords.png`, `report.md`, `review.md`,
`provenance.jsonl`. Used for README, website, screenshots, video, and launch.

## 9. Roadmap

Tracked as GitHub milestones; issue numbers are the source of truth for scope
discussion. Shipped versions are kept here as the delivery record.

### Shipped

- **v0.1.x Desktop MVP → hardening** — macOS / Windows / Linux installers, local
  workspace, bundled OpenCode runtime, model config, agent chat, plan approval,
  Python analysis, artifact panel, `provenance.jsonl`, notebooks (Python + R),
  science MCP connectors, remote compute (SSH / Slurm / Modal), projects,
  searchable model browser, network proxy + mirrors, 7 UI languages.
- **v0.2.0 UI & reliability** — three themes (light / warm / dark) with per-theme
  accents, translucent macOS sidebar, Codex-style settings (section routes +
  sidebar navigation), in-app zoom, provider retry/error surfacing, OAuth
  recovery via the credential store, git-snapshot bloat guards, first Zenodo DOI.

### Planned

- **v0.2.1 Patch** — fixes already on master: traffic-light re-pin on the
  transparent/vibrancy window, session history loading after a hard reload of
  `/live/:id`, theme-aware code highlighting (dark-mode readability).
- **v0.3.0 Research UX** — the "scientist's daily loop" gets first-class
  treatment:
  - LaTeX / math rendering in chat and documents (#22);
  - image upload → multimodal prompts (screenshots of errors, plots, papers) (#22);
  - plan-first workflow: surface OpenCode's plan mode as an explicit
    "plan, review, then execute" loop (#20);
  - adaptive approvals: document and refine the risk tiers between "approve
    dangerous only" and "full access" (#20);
  - system-level notifications when the agent is blocked on a permission or
    question (#21).
- **v0.4.0 Reach & interop (northbound)** — using ZeroWall Science from outside the
  desktop window. These surfaces are **one deliverable, not many**: they all
  drive the same runtime-agnostic `AgentRuntime` seam (#24, base class #36)
  re-exposed as a single **authenticated API gateway** — session management,
  prompt input, streamed results, and workspace/file browsing over HTTP+SSE /
  WebSocket, bearer token in the keychain, loopback-bound by default. Everything
  below is a *client* of that one gateway; the only per-surface work is
  transport + binding + auth scope.
  - the gateway itself — the foundation the rest reuse (the file/workspace API
    is the one gap the current `AgentRuntime` seam still lacks);
  - LAN web UI (phone / second machine on the same network) (#3);
  - CLI client (scripting, headless and CI-style runs);
  - cloud tunnel — reach the same gateway + token over a public URL
    (cloudflared / frp / ngrok), no new API;
  - messaging-platform integrations (Slack / Discord / Telegram / Feishu) — each
    a thin bot client that relays `sendPrompt` → streamed events (#20);
  - ZeroWall Science *as* an ACP server, so external editors/agents drive the
    runtime through the same seam in ACP's dialect (#14).
- **v0.5.0 Pluggable & remote runtimes (southbound)** — the same `AgentRuntime`
  seam consumed in the *other* direction: swap or relocate the execution
  backend behind a pluggable transport (in-process / HTTP / stdio-JSON-RPC /
  SSH). This axis shares the seam and base class (#36) with v0.4.0 — a remote
  runtime is literally the v0.4.0 gateway consumed by a `RemoteRuntime` client,
  the two halves of one pipe.
  - ACP as a *client* transport — one `AcpRuntime` spawns any ACP agent (Codex,
    Gemini CLI, Claude Code, …) instead of a per-agent adapter (#14, #25; Codex
    prototype under verification #28);
  - remote agent runtime — run the runtime on another machine, drive it from the
    desktop over the gateway;
  - remote Jupyter + remote-first execution — connect to an existing remote
    Jupyter server and default suitable work (shell, cells, training) to a
    chosen remote target, building on the shipped SSH / Slurm compute (#35).

Ordering rationale: v0.3.0 items make the core desktop loop better for the
existing research audience (small-to-medium, high frequency-of-use); v0.4.0 and
v0.5.0 open new surfaces (large, security-sensitive) by hardening the one
`AgentRuntime` seam rather than adding entities per feature — the API gateway,
LAN UI, and messaging bridges must not weaken the local-first /
keychain-only-secrets guarantees, and remote execution must never silently fall
back to local (#35).

## 10. Non-functional requirements

### 10.1 Performance

Cold start < 3s (excluding first-time runtime init); no noticeable UI jank; streaming
agent output; live tool-call refresh; paginated large-file preview; lazy-loaded
figures; virtualized log lists.

### 10.2 Security

API keys encrypted locally; workspace sandbox isolation; dangerous-command approval;
no file upload by default; no full-disk access for the agent by default; access limited
to the current project directory; all network access auditable.

### 10.3 Maintainability

Frontend, desktop shell, and agent runtime decoupled; pluggable skills; configurable
MCP servers; extensible model providers; stable artifact schema; versioned workflow
templates.

### 10.4 Open-source friendliness

Clear first-screen README; one-click install; one-click demo; nice screenshots;
complete example results; clear license; separate note for third-party skill licenses.

## 11. One-liner

**ZeroWall Science is an open-source research agent workbench with macOS and
Windows installers that uses OpenCode, MCP, scientific skills, and a reproducible
artifact system to weave literature, code, figures, reports, and review into one
local-first scientific workflow.**
