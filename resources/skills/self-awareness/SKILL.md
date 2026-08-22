---
name: self-awareness
description: ZeroWall-science's actual agent tool surface and runtime boundaries. Load this when deciding which ZeroWall tool can perform a task, checking whether Python can reach agent or desktop capabilities, choosing between interactive analysis and persisted Runs, or answering questions about delegation, images, skills, memory, artifacts, lineage, credentials, session history, and other self-introspection capabilities.
license: Apache-2.0
---

# Self-awareness — ZeroWall's actual capabilities

Use only tools advertised in the current conversation. ZeroWall exposes agent and
desktop capabilities as explicit tools; do not assume that an SDK documented by
another application also exists here. Some tools are conditional on the desktop
session, project settings, execution context, or capability grants. If a tool is
not advertised, treat it as unavailable.

## Python and R boundary

Use `python` for persistent Python analysis and `r` for persistent R analysis.
Their variables and imports persist per project and execution context. Pass a
`context_id` such as `local`, `ssh:<alias>`, or `wsl:<distro>` when the work must
run somewhere other than the default local context.

The Python worker initializes an ordinary namespace with common standard-library
modules and any available convenience packages. It does **not** inject a ZeroWall
control-plane object. Code executed with `python` therefore cannot directly call
the agent model, spawn Agents, submit or monitor Runs, inspect ZeroWall credentials,
or query internal project/session metadata. Leave the Python cell and call the
corresponding ZeroWall tool instead.

## Capability reference

| Need | ZeroWall interface | Availability and boundary |
|---|---|---|
| Read, create, or patch project files | `read`, `write`, `edit` | Operate on normal filesystem paths within the granted workspace. |
| Find files or text | `search`, `grep` | Use before broad manual inspection. |
| Run a short command | `shell` | Use for bounded foreground commands, not as a long-running job manager. |
| Interactive Python or R analysis | `python`, `r` | Persistent per project and execution context; no injected control-plane SDK. |
| Inspect a local image | `view_image` | Explicit tool call for a supported local image; this is not a Python method. |
| Track a multi-step plan | `update_plan` | Update task progress when a plan materially helps. |
| Present the completed result | `attempt_completion` | ZeroWall's normal completion path; there is no separate structured-output submission SDK. |
| Audit configured workflow guidance | `list_skill_catalog` | Page through discovered/effective records and use its explicit counts. |
| Discover and load workflow guidance | `search_skills`, `use_skill` | Search by task/domain, then load the exact returned skill name. |
| Search or save durable notes | `search_memory`, `append_memory` | Available only when project memory is enabled; memory is not a transcript or telemetry database. |
| Delegate multi-file codebase reading | `explore` | Read-only sub-Agent with its own context and `read`/`grep`/`search` access. |
| Delegate general bounded tasks | `delegate_tasks` | Desktop-only and capability-gated. Use it only when its schema is advertised; it is not callable from Python. |
| Read a truncated delegated result | `get_delegated_result` | Desktop-only and available with delegation. Use only when the compact result lacks necessary detail. |
| Submit long-running work | `run_in_context` | Persist a Run in `local`, `ssh:<alias>`, or `wsl:<distro>`. Prefer this over extending `shell` timeouts. |
| Read one Run snapshot | `get_run` | Call once for an immediate status check; never poll it in a loop. |
| Wait for a Run | `monitor_run` | Call exactly once with the Run id. ZeroWall waits without repeated model calls. |
| Cancel a Run | `cancel_run` | Request cancellation through the persisted Run lifecycle. |
| Record project research objects | `research_graph` | Desktop-only. Record data assets, papers, or decisions and link existing graph nodes; it is not a generic artifact browser. |
| Create a specialist | `save_specialist` | Desktop-only and create-only. Editing and deletion remain in Settings. |
| Make an extra model call from Python | Not available | Continue through the normal agent turn. For bounded delegated work, use `explore` or advertised `delegate_tasks`. |
| Resolve artifact ids to paths, list a generic artifact store, or inspect lineage | Not available | Use ordinary project paths plus `read`/`search`/`grep`. Do not invent artifact ids, version ids, or lineage records. Run output registration is limited to the explicit `output_specs` contract of `run_in_context`. |
| Read credentials from Python or an agent tool | Not available | ZeroWall keeps secrets outside SQLite in its keyring path; no credential accessor is exposed to the agent. |
| Query frames, token/cost accounting, tool-call history, or the internal metadata DB | Not available | Use only conversation context and tool results already provided. Do not claim access to hidden session tables or telemetry. |

## Choosing the right execution path

1. Use `python` or `r` for interactive analysis whose next step depends on the
   computed result.
2. Use `run_in_context` for persisted, recoverable, or long-running work. Use
   `monitor_run` once when the result is needed in the current task, or return
   the Run id for fire-and-forget work.
3. Use `explore` when codebase understanding requires more than a couple of
   reads. Use `delegate_tasks` only when desktop delegation is currently
   advertised and the work benefits from independent or parallel Agents.
4. Use ordinary project files for inputs and outputs. Never fabricate an
   artifact registry, lineage API, credential API, session database, or
   Python-side bridge for a capability that is not present.

For SSH-direct details, load `remote-compute-ssh`; its Run workflow and current
limitations are the authoritative ZeroWall contract.
