# ZeroWall Science Technical Architecture

[English](architecture.md) | [简体中文](architecture.zh-CN.md) | [Project README](../README.md)

<div align="center">
  <img src="assets/logo.png" width="132" alt="ZeroWall Science logo" />
</div>

ZeroWall Science is a local-first control plane for agent-assisted scientific research. It integrates conversational reasoning, governed tool use, heterogeneous computation, project-scoped research records, evidence review, publication validation, and presentation generation. The architecture is built to preserve authority boundaries and recoverable state across the whole path from research intent to delivered scientific output.

This document is grounded in the current source tree. It describes enforced controls, persisted state, runtime behavior, known limitations, and the design choices that distinguish ZeroWall Science from a transcript-centric AI desktop.

### How to read this document

Sections 3-6 explain process ownership and plugin boundaries; sections 7-15 describe durable research data, execution, files, images, and review; section 16 follows publication and PPTX delivery; sections 17-22 state security, innovation, build, retention, constraints, and evolution. Statements marked as limitations are deliberate boundaries, not omitted promises. The document describes the shipped 4.3.8 architecture: presentations produce PPTX, while historical PDF records remain loadable for compatibility.

## 1. Product Context

![ZeroWall Science workspace](assets/app-home.png)

The product presents one continuous research workspace:

- project-scoped Agent conversations and searchable session history;
- configurable model providers and account-managed model routes;
- reusable scientific Skills and MCP services;
- local, WSL, and SSH execution contexts;
- durable Runs, logs, progress, cancellation, recovery, and artifact harvesting;
- DataAssets, Artifacts, Papers, Decisions, ResearchEdges, and audit reports;
- scientific file preview, image generation/editing, and offline duplicate-image analysis;
- persistent reviewer findings, publication workflows, and presentation generation.

The UI is intentionally not the authority for security or state correctness. It renders typed Host state and submits requests; ownership checks, path validation, credentials, process control, and persistence are enforced behind the renderer boundary.

## 2. Design Goals and Non-Goals

### 2.1 Design goals

1. **Continuity**: preserve project context from question formulation through computation and delivery.
2. **Explicit execution**: represent environment, command, input, output, log, process identity, and terminal state directly.
3. **Traceable evidence**: link scientific entities with project-scoped, typed relationships and audit events.
4. **Local control**: keep project metadata and credentials inside explicit user-controlled boundaries by default.
5. **Model portability**: prevent model provider choice from defining the security or persistence model.
6. **Method portability**: separate reusable scientific procedures from both models and infrastructure.
7. **Recoverability**: retain enough state to diagnose or resume long-running compute and generated deliverables.
8. **Honest verification**: distinguish checksums, local reproduction, reviewer findings, and human review rather than collapsing them into one claim of correctness.

### 2.2 Non-goals

- ZeroWall is not a hardened sandbox for arbitrary hostile code.
- A successful Run does not establish scientific validity.
- A checksum establishes byte identity, not semantic correctness.
- A reproduction Run does not prove that uncaptured external dependencies were identical.
- AI-generated figures, reviews, text, and slides still require qualified human and domain review.
- Remote SSH hosts, model providers, MCP servers, and web services remain separate trust domains.

## 3. Architectural Overview

![Layered architecture](assets/architecture-overview.png)

The implementation is organized into five cooperating planes.

| Plane | Owned concerns | Source ownership |
| --- | --- | --- |
| Desktop security shell | Electron lifecycle, trusted origin, update flow, native dialogs, clipboard integration, vault | `desktop/src/main`, `desktop/src/preload` |
| Agent and UI kernel | Sessions, tools, Skills, MCP, approvals, goals, subagents, workflows, React shell | `dsh/source` |
| Scientific domain services | Projects, execution, Runs, files, research, review, images, publication, presentation | `plugins/*` |
| Research data foundation | SQLite schema, migrations, domain validation, graph edges, audit chain, snapshots | `store/src` |
| Compute and artifact plane | Local/WSL/SSH processes, project files, logs, generated images, PPTX and exports | project roots, user-data roots, remote hosts |

The key separation is between **conversation state** and **research state**. DSH session persistence captures interaction history. The independent Research Store captures project entities, computation, evidence, delivery state, and audit records. Neither is forced to impersonate the other.

### 3.1 Request and data flow

```text
Researcher
   -> DSH React renderer (low privilege)
   -> typed remote DTO / Typert codec
   -> DSH Host plugin service
      -> policy, ownership, path, approval, and credential checks
      -> Research Store transaction and/or managed execution adapter
      -> project file or durable attachment
      -> Artifact / AuditEvent / progress event
   <- redacted typed result and UI refresh
```

The arrow direction is important. The renderer can initiate a request, but it cannot turn a hidden UI action into authority. A successful response is the result of Host validation plus the domain operation; it is not evidence that the model's original instruction was correct. Binary outputs follow the same path: bytes are written inside an authorized project or attachment root, hashed, and only then exposed as a typed reference.

## 4. Runtime Processes and Trust Boundaries

![Process and trust boundaries](assets/process-trust-boundaries.png)

### 4.1 Electron main process

The main process is the operating-system authority. It:

- creates the `BrowserWindow` with sandboxing, context isolation, disabled Node integration, and web security;
- starts, observes, and terminates the DSH Host child process;
- owns the encrypted credential vault backed by Electron `safeStorage`;
- provides the narrow preload bridge for desktop integrations;
- handles native directory dialogs, clipboard file materialization, tray state, updates, and managed MCP environments;
- limits navigation to the trusted application origin and opens ordinary external links in the system browser;
- denies webviews and grants only the explicitly handled sanitized clipboard permission.

Relevant source: `desktop/src/main/index.ts`, `security.ts`, `security-policy.ts`, `credentials/vault.ts`, and `credentials/broker.ts`.

### 4.2 DSH Host child process

Electron starts DSH in embedded web mode with:

```text
web --patch <zerowall patch> --host 127.0.0.1 --port <selected port> --no-open
```

The port is selected from a valid unprivileged range. When `portPath` is configured, a previously recorded port is preferred so the renderer origin can remain stable across restarts; if unavailable, another free port is selected and persisted. Readiness is checked over loopback before the application is treated as usable.

The Host receives explicit roots and configuration through environment variables, including DSH home, bundled and user Skills, the research database, brand assets, and telemetry disablement. Electron supervises graceful and forced shutdown.

Relevant source: `desktop/src/main/runtime/harness-runtime.ts`.

### 4.3 Sandboxed renderer

The renderer is a reduced-privilege React client. It uses DSH's conversation shell and ZeroWall Client plugins. It does not receive general filesystem, process, Node.js, or credential authority. Typed remote services carry requests to the Host; security checks are not delegated to conditional UI rendering.

### 4.4 External trust domains

The following remain outside the local application trust boundary:

- model-provider APIs;
- MCP HTTP services and MCP stdio child processes;
- SSH hosts and their filesystems;
- package registries and downloaded environments;
- web resources and scientific databases.

ZeroWall centralizes configuration, credential references, approvals, and auditability, but it does not convert external systems into locally trusted components.

![End-to-end research lifecycle](assets/research-lifecycle.png)

The lifecycle view above connects the process architecture to the scientific workflow: research questions enter Agent orchestration, computation runs through governed environments, outputs become research records, and delivery artifacts remain linked to evidence and audit state.

## 5. Startup and Runtime Supervision

The startup path is a controlled sequence rather than a static Electron page:

1. Electron resolves the channel-specific identity and user-data directory.
2. Required product directories and legacy-compatible data locations are prepared.
3. `CredentialVault`, credential broker, updater, tray, and MCP environment controller are initialized.
4. The desktop resolves packaged or development paths for DSH, plugins, Skills, runtimes, brand assets, and the research database.
5. `HarnessRuntime` selects the preferred/free loopback port and launches DSH as a child process.
6. DSH loads the ZeroWall patch, Host plugins, generated Typert codecs, tool registry, Skills, MCP clients, and React client composition.
7. Electron waits for loopback readiness, then loads the trusted origin in the sandboxed renderer.
8. Domain services recover unfinished state, including dynamic MCP clients, durable Runs, and presentation generation status.
9. Shutdown first requests cooperative Host termination, then escalates to process-tree termination if required.

This separation makes Electron responsible for native authority and DSH responsible for Agent/product runtime composition.

## 6. Plugin System and Domain Ownership

The repository contains 22 first-party domain plugin packages. The internal presentation runtime is a separate library consumed by `plugin-presentations`, not a second independently loaded product plugin. The table therefore lists 22 plugin domains plus one runtime component. Plugins may provide a Host service, Client UI, shared contracts, Agent tools, and tests.

| Plugin domain | Principal responsibility |
| --- | --- |
| `base` | Brand surface, update affordances, common Client/Host helpers |
| `desktop-compat` | Desktop profile and compatibility integration |
| `account` | AI Cloud account, gateway failover, balance, orders, managed model discovery |
| `ai-cloud` | Model-provider integration surface |
| `secrets` | Host-side secret broker client and credential references |
| `projects` | Project CRUD, recent/open state, preferences, session archive and project-bundle import/export |
| `execution` | Local/WSL/SSH contexts, capability reporting, probing, bounded command execution |
| `environment` | Configured scientific runtime/environment state |
| `runs` | Durable Run lifecycle, process adapter, heartbeat, lease, recovery, cancellation and harvest |
| `files` | Authorized upload storage, SHA-256 content addressing, parsing and bounded reads |
| `research` | Research entities, edges, audit report, snapshots and scientific previews |
| `skills` | User Skill creation/import/copy/removal and source inventory |
| `mcp` | Persisted MCP configuration, secret resolution, dynamic client lifecycle and reconnect |
| `python` | Signed local Python execution entry point |
| `web-search` | Current web discovery tool integration |
| `images` | Managed AI image generation/editing and attachment persistence |
| `image-dup` | Local/offline perceptual duplicate scanning and reports |
| `reviewer` | Persisted reviewer mode, findings, coverage and remediation UI |
| `publications` | Publication lifecycle, frozen snapshot, reproduction and export |
| `presentations` | Project-facing presentation records, tools, preview and export |
| `presentations-runtime` | Pinned internal slide generation and PPT assembly runtime |
| `wechat` | Optional WeChat channel/session integration |
| `opencode` | Optional OpenCode integration |

Host/Client calls use generated Typert codecs and typed DTOs. A plugin's Client surface never substitutes for Host authorization. Domain persistence is either delegated to Research Store or kept in a domain-specific controlled store.

## 7. Research Data Foundation

### 7.1 SQLite behavior

`ResearchStore` uses Node's SQLite binding and enables:

- `PRAGMA journal_mode = WAL`;
- `PRAGMA foreign_keys = ON`;
- a bounded busy timeout;
- ordered schema migrations;
- transactional updates and optimistic record versions.

### 7.2 Seven schema migrations

| Migration | Introduced state |
| --- | --- |
| 1 | Projects and updated-time index |
| 2 | Persisted MCP servers, transport, secret references, timeout and reconnect policy |
| 3 | Research nodes, execution contexts, data assets, Runs, artifacts, papers, decisions, edges, audit events |
| 4 | Publications and presentations |
| 5 | Project preferences, Run inputs/deadlines, publication reproduction linkage |
| 6 | Presentation artifacts and quality state |
| 7 | Presentation generation state and revision history |

The migration history reflects the architectural direction: the system evolved from project storage into a durable research execution and delivery substrate.

## 8. Research Object Graph and Provenance

![Research object graph](assets/research-object-graph.png)

The first-class domain objects are:

| Object | Key semantics |
| --- | --- |
| `Project` | Project identity, root path, description, timestamps and preferences |
| `ExecutionContext` | `local`, `wsl`, or `ssh`, versioned configuration and project ownership |
| `DataAsset` | URI, location class, media type, size, checksum, and provenance object |
| `Run` | Command, working directory, state, progress, process identity, lease, heartbeat, deadline, log, inputs and outputs |
| `Artifact` | Project output with URI, media type, checksum, metadata and optional producing Run |
| `Paper` | Title, DOI, URI, citation object and notes |
| `Decision` | Rationale plus proposed/accepted/rejected/superseded lifecycle |
| `ResearchEdge` | Explicit project-scoped directional relation with metadata |
| `Publication` | Frozen research snapshot, validation, reproduction linkage and export state |
| `Presentation` | Outline, slide state, visual provenance, revision history, quality and exported artifacts |
| `AuditEvent` | Project action, optional entity, details and timestamp |

`research_nodes` provides a common identity layer for graph-capable entities. Foreign keys and project checks prevent cross-project edges. The graph is explicit: relationships are not inferred from filename similarity or transcript wording.

### 8.1 Audit-chain integrity

Audit reports contain the ordered event list, a deterministic hash for each event, a final chain hash, and a `chainValid` result. Each event hash incorporates canonical event content and the preceding chain state. This can detect accidental or unauthorized reordering or mutation of the exported event sequence.

The chain proves consistency of the recorded sequence, not completeness of all real-world actions. Activities outside instrumented services are not magically captured.

### 8.2 Snapshot and project portability

Research snapshots export the project and all first-class research collections in a versioned structure. Project bundles can include project metadata plus verified DSH session archives. Imports validate format/version, session headers, hashes, paths, and collisions before publishing new session files.

## 9. Agent and Scientific Capability Orchestration

![Agent orchestration](assets/agent-orchestration.png)

DSH provides the orchestration kernel. ZeroWall composes six capability paths around it:

1. **Native tools** for project, file, image, execution, presentation, and other product actions.
2. **Skills** for reusable scientific methods and task-specific operating procedures.
3. **MCP services** for standard external tool connectivity.
4. **Subagents** for context-isolated, focused work with a result returned to the parent.
5. **Structured workflows** for bounded parallel or pipelined multi-agent orchestration.
6. **Continuable goals** for long-running objectives across same-session continuation rounds.

The reasoning path is separated from privileged execution. Tools may be visible to the Agent, but Host policy, approval, project ownership, path constraints, and credential resolution remain authoritative.

### 9.1 Skills catalog

Skills can be discovered from:

- bundled read-only Skills;
- project-local `.zerowall/skills`;
- user-global Skills;
- configured extra paths;
- plugin-provided Skills.

The effective catalog records precedence, shadowing, parse errors, enabled state, scope, and path. Reloading does not require restarting the desktop; idle Agents consume the refreshed index on their next turn.

### 9.2 MCP lifecycle

MCP configurations persist:

- unique server name;
- `stdio` or streamable HTTP transport;
- command/arguments/cwd or URL;
- environment/header secret references;
- tool-call timeout;
- fail-on-startup policy;
- reconnect enablement, delays, and attempt limits.

`ZeroWallMcpService` serializes mutations, resolves secret references at runtime, maintains one Fiber per active client, records runtime errors and missing environment references, reconciles create/update/delete state, and periodically refreshes when the environment signature changes.

## 10. Execution Contexts

### 10.1 Local

Local commands use PowerShell on Windows and `/bin/sh` on Unix-like systems. Output is bounded to avoid unbounded Host memory growth. Commands have an explicit timeout.

### 10.2 WSL

WSL contexts are available only on Windows. Configuration selects a distribution, user, and optional environment. Commands are routed through `wsl.exe` with explicit arguments.

### 10.3 SSH

SSH contexts use registered host, port, user, key or agent settings, connection timeout, and optional remote environment. Execution uses non-interactive OpenSSH options and validated context ownership.

### 10.4 Capability probes

A probe verifies current connectivity and gathers a bounded capability snapshot. It is time-local evidence, not a permanent assertion that the environment will remain unchanged.

## 11. Durable Run Manager

![Durable Run lifecycle](assets/durable-run-lifecycle.png)

### 11.1 Persisted lifecycle

Run states are:

```text
draft -> submitted -> running -> succeeded | failed | timed_out
                              -> paused -> running
                              -> cancelling -> cancelled
```

Run records include PID, remote PID, log URI, progress, lease owner, lease expiry, heartbeat, timeout deadline, inputs, outputs, and error state.

### 11.2 Heartbeats and leases

The manager owns a random lease identity. By default it renews active state on a 10-second heartbeat and uses a 30-second lease duration. Leases make process ownership and staleness explicit across recovery boundaries.

### 11.3 Startup recovery

On startup, the manager inspects Runs in `submitted`, `running`, `paused`, or `cancelling` state:

1. Determine the project execution context.
2. Recover a remote PID from the record or persisted log marker when available.
3. Test whether the local process or remote process remains alive.
4. If alive, renew ownership and monitor it.
5. If not alive, read a persisted exit-code marker.
6. Convert a zero exit into success and harvest outputs; convert a non-zero or unknowable exit into explicit failure.

The system does not silently leave a dead task marked as running.

### 11.4 Control behavior

- Windows cancellation uses `taskkill.exe /T /F` for the process tree.
- Unix-like local pause/resume uses `SIGSTOP`/`SIGCONT`.
- Windows local pause/resume is explicitly unsupported.
- Remote cancel/pause/resume uses `kill` against the remote PID.
- Timeouts are bounded between 1 millisecond and 30 days.

### 11.5 Artifact harvesting

When a Run succeeds, declared output URIs can be harvested into Artifact records. The producing Run ID is retained, converting ephemeral output paths into project-visible research objects.

## 12. Managed Transfer Architecture

Managed transfer avoids free-form Agent-generated remote copy commands.

- Local-to-SSH, SSH-to-local, and SSH-to-SSH routes require exact paths.
- Existing destinations are rejected rather than silently overwritten.
- A direct SSH-to-SSH path requires a verified directed trust edge.
- Without direct trust, a private local staging relay can use each host's separately configured credentials.
- Partial local downloads are staged and renamed only after completion.
- Transfers are persisted as Runs for cancellation, timeout, progress, and audit.

A→B trust and B→A trust are distinct. Installing trust is an approved operation, and the generated private key remains on the source host.

## 13. Scientific File and Attachment Architecture

Uploaded files are not handed to the model as arbitrary paths.

1. The Host receives canonical base64 and validates declared media information.
2. SHA-256 creates a content-addressed object identity.
3. Source bytes, parsed text, and metadata are stored under the DSH attachment root.
4. PDF, DOCX, PPTX, XLSX, JSON, delimited text, and ordinary text receive bounded parsers/previews.
5. Reads are capped by character limits.
6. Materialization requires an active session and verifies that the attachment is authorized for that session.
7. Re-read bytes are checked against the recorded SHA-256 before return.

Current upload size and preview caps prevent single attachments from exhausting the conversation or Host memory. These are operational safeguards, not substitutes for malware scanning.

## 14. Image Generation and Duplicate Analysis

### 14.1 Managed image generation

The image plugin resolves an account-managed image model and records:

- provider, group, and model identity;
- requested and actual quality;
- requested size and actual dimensions;
- revised prompt when returned by the provider;
- output bytes and durable attachment reference.

Outputs are written inside the authorized project workspace and then persisted through the attachment store. Editing accepts bounded reference images and can preserve a requested composition.

### 14.2 Local duplicate analysis

The duplicate-image service is local and offline. It:

- scans authorized attachments or workspace-relative directories;
- uses a bounded Hamming threshold;
- supports recursive, copy/move, and cross-image analysis options;
- delegates computation to a pinned worker;
- produces checksummed report artifacts through atomic writes;
- records algorithm identity/version and generation time.

It identifies perceptual similarity candidates; it does not establish scientific misconduct or authorship.

## 15. Reviewer and Evidence Quality

Reviewer results are persisted as conversation events and rendered as first-class nodes. Reports include:

- overall review status;
- model, effort, and backend identity;
- findings with claim, reported evidence, verified evidence, fix, verdict, severity, and resolution status;
- evidence and optional citation coverage;
- unverified-evidence flags and coverage gaps;
- correction and re-review state.

This makes critique inspectable and revisable. Reviewer output remains an analytical aid, not an independent certification of scientific correctness.

## 16. Publication and Presentation Delivery

![Research delivery pipeline](assets/research-delivery-pipeline.png)

### 16.1 Publication state machine

Publication states are `draft`, `frozen`, `validating`, `ready`, and `failed`.

- **Draft** stores an editable manifest.
- **Freeze** captures a `ResearchProjectSnapshotV1` rather than relying on later live project state.
- **Validate** evaluates the stored publication state.
- **Reproduce** submits a command to the durable Run Manager and persists the reproduction Run ID.
- **Refresh** maps the terminal Run outcome into publication validation state.
- **Export** is allowed only when the publication is ready.

The frozen snapshot prevents silent drift between evidence selection and later validation.

### 16.2 Presentation state machine

Presentation states are `draft`, `outlining`, `designing`, `generating`, `paused`, `ready`, `failed`, and `cancelled`.

A presentation record can retain:

- structured sections, content points, style, and reference assets;
- page records, page visual URIs, prompts, model identity, dimensions, quality, and checksums;
- generation ID, stage, progress, timestamps, and errors;
- exported artifact records;
- quality assessment;
- revision history.

The worker uses bounded visual concurrency, writes temporary files before replacement, records progress per slide, and assembles PPTX artifacts only from the current project boundary. A single slide can be regenerated and the PPTX rebuilt without regenerating every unrelated page. Historical PDF artifacts remain readable in the store, but the current presentation worker does not create or update PDFs. On application restart, an incomplete legacy generation is made explicitly recoverable/restartable rather than being left in an ambiguous active state.

## 17. Security Model

### 17.1 Enforced controls

- renderer sandbox, context isolation, disabled Node integration, and web security;
- stable loopback Host origin, with navigation restricted to trusted application URLs;
- webview denial and narrow permission policy;
- typed and codec-validated remote requests;
- project ownership checks on research and execution objects;
- exact-path containment checks for project files and presentation previews;
- operating-system-backed encryption for credential values;
- private child-process IPC for credential resolution;
- redacted DTOs and secret references instead of raw keys;
- explicit approval around side-effecting operations;
- immutable or checksummed capture where supported.

### 17.2 Threat assumptions

The design assumes the local operating-system account and packaged first-party application are trusted. It does not assume model outputs, web content, MCP services, remote hosts, uploaded documents, or user-supplied code are trustworthy.

### 17.3 Residual risks

- A user-approved command can damage data available to its OS account.
- A compromised remote host can falsify remote results.
- A model or MCP service can return misleading content.
- A parser can have vulnerabilities despite size bounds and format checks.
- Incomplete declared inputs/outputs create incomplete provenance.
- Human review can miss scientific or ethical problems.

High-sensitivity projects should add OS account separation, containers or VMs, network egress control, verified dependencies, encrypted disks, institutional backup, and domain-specific governance.

## 18. Innovation Analysis

The innovations below are architectural properties, not marketing labels. Each item names the mechanism that makes it possible and the boundary that keeps the claim honest. The strongest differentiator is the combination: durable research facts, governed execution, and deliverable artifacts share project ownership without collapsing into one opaque Agent transcript.

### 18.1 Research state as a parallel durable substrate

**Mechanism:** DSH session persistence and Research Store are independent but linked through project/session association.

**Innovation:** Agent memory is not forced to serve as the scientific system of record. Research objects survive transcript compaction and can be queried without reconstructing facts from prose.

**Boundary:** The link is only as accurate as project/session association and recorded domain actions.

### 18.2 Unified provenance from intent to delivery

**Mechanism:** Agent tools create or update Runs, Artifacts, Papers, Decisions, edges, Publication, Presentation, and AuditEvents.

**Innovation:** Computational provenance and scientific communication share one project graph. The path does not end at a generated file; the exported artifact retains a project record and checksum.

**Boundary:** External manual actions remain outside the graph unless imported or recorded.

### 18.3 Durable heterogeneous execution

**Mechanism:** One Run abstraction spans Local, WSL, and SSH contexts with heartbeat, lease, process identity, recovery, timeout, cancellation, pause/resume where supported, and output harvest.

**Innovation:** Long-running compute becomes a recoverable product primitive inside the Agent workspace rather than an opaque terminal side effect.

**Boundary:** Recovery depends on OS/SSH observability and persisted markers; it is not distributed consensus.

### 18.4 Model-independent authority

**Mechanism:** credentials, approvals, path constraints, state transitions, and process control live in Electron/Host code rather than model instructions.

**Innovation:** Model replacement does not replace the security model. The model proposes; the controlled runtime disposes.

**Boundary:** A user can still approve unsafe work, and Host code itself must remain secure.

### 18.5 Hash-linked auditability

**Mechanism:** canonical audit events produce per-event hashes and a final chain hash.

**Innovation:** Project history can be checked for internal sequence integrity rather than accepted as an unstructured log dump.

**Boundary:** The chain cannot prove that an uninstrumented event never occurred.

### 18.6 Recoverable communication artifacts

**Mechanism:** publication and presentation are persisted state machines with snapshots, generation IDs, revisions, quality metadata, model metadata, checksums, and exported artifacts. In 4.3.8, presentation quality metadata is informational and does not block PPTX completion; historical quality records remain readable.

**Innovation:** Papers and slide decks are connected to the same research substrate as computation and evidence. Page-level regeneration is a controlled revision, not a detached file edit.

**Boundary:** Visual and narrative quality still require human judgment.

### 18.7 Method/infrastructure/model decoupling

**Mechanism:** Skills contain procedures, MCP connects services, plugins own domains, execution contexts own compute, and model routes remain replaceable.

**Innovation:** A scientific method can move between models and execution environments without being rewritten as one monolithic prompt or provider-specific agent.

**Boundary:** Practical portability still depends on tool availability and compatible environments.

### 18.8 Evidence-aware review as persisted data

**Mechanism:** reviewer findings carry evidence status, coverage, severity, fixes, resolution, and re-review state.

**Innovation:** Critique becomes a trackable research artifact rather than ephemeral prose at the end of a model response.

**Boundary:** The reviewer evaluates supplied evidence and cannot validate omitted information.

## 19. Build and Supply-Chain Architecture

The root build orchestrates:

1. plugin workspace generation;
2. profile generation/checking;
3. pinned DSH verification;
4. DSH Host and Client builds;
5. Research Store bundling;
6. plugin codec and bundle generation;
7. runtime dependency-closure verification;
8. native runtime rebuilding;
9. Skills, scientific runtimes, brand, and license preparation;
10. Electron build and package verification.

Tests cover contracts, security policy, store migration and behavior, plugin services, desktop lifecycle, updater, runtime paths, DSH composition, MCP environment integration, packaging, and Electron smoke behavior. Automated tests avoid requiring real remote infrastructure or credentials.

## 20. Data Locations and Retention

Major persisted locations include:

- channel-specific Electron user-data root;
- DSH home for configuration, sessions, attachments, and runtime state;
- `research/zerowall-research.sqlite` for project research records;
- encrypted credential vault material protected by `safeStorage`;
- application-managed Run logs;
- project-local `.zerowall/artifacts`, including presentation visuals and exports.

Backups should coordinate the Research Store with project roots and required DSH session/attachment state. Deleting a transcript does not automatically delete Research Store records. Deleting a project must respect database ownership and external artifacts.

## 21. Known Constraints

- WSL is Windows-only.
- Local pause/resume is unavailable on Windows.
- SSH execution and transfer inherit remote-host availability and security.
- Process-level reproduction is weaker than a fully pinned container or VM.
- File preview parsers are bounded but are not malware scanners.
- Perceptual duplicate detection generates candidates, not misconduct conclusions.
- Generated images and slides can contain visual or textual errors.
- Provenance completeness depends on declared inputs, outputs, checksums, environment facts, and edges.
- Audit-chain validity proves sequence consistency, not full event capture.
- Reviewer coverage is limited to available evidence.

## 22. Evolution Principles

Future development should preserve the following invariants:

- privileged logic stays outside the renderer;
- credentials remain references outside the vault boundary;
- research state remains independent from transcript text;
- state-machine transitions are validated in Host/store code;
- generated artifacts retain project ownership, provenance, and checksums;
- new execution backends implement the Run contract rather than bypassing it;
- stronger reproduction adds environment capture without weakening current evidence labels;
- new domain features arrive as plugins or Research Store extensions, not renderer-only state.

Potential extensions include container-backed Runs, richer environment manifests, remote artifact stores, policy-driven retention, graph queries, institutional identity, signed export manifests, and discipline-specific project schemas.

## 23. Architecture Summary

ZeroWall Science combines four systems that are commonly disconnected:

1. an Agent workspace for reasoning and capability orchestration;
2. a durable execution plane for local and remote scientific computation;
3. a research object graph for data, evidence, decisions, and audit;
4. a recoverable delivery plane for publication and presentation.

Its principal innovation is architectural rather than cosmetic: the system treats AI reasoning as one participant in a governed research process, while authority, evidence, computation, and delivery remain explicit, persistent, and reviewable.
