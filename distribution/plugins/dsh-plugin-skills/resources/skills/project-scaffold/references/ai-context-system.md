# AI Context System

Use this reference when designing `AGENTS.md`, `docs/ai_context/`, and project logs.

## Responsibility Split

Use this layered model:

```text
README.md              # project entrypoint: what this project is
AGENTS.md              # AI operating rules: how agents work here
docs/ai_context/       # engineering handbook: conventions and maps
docs/log/PROJECT_LOG.md # milestone notes: accepted project progress
git                    # actual state history
```

`README.md` should be short and stable. It points to details instead of carrying every convention.

`AGENTS.md` is a contract for AI behavior. Put rules here when the agent must consistently do or avoid something.

`docs/ai_context/` contains project rules and indexes that are too detailed for README.

`docs/log/PROJECT_LOG.md` is not a changelog. It is a compact milestone index that labels accepted progress.

## AGENTS.md Should Control

Include rules for:

- files the AI should read before working;
- whether code or docs may be changed without explicit approval;
- how to handle `README.md`, docs, workflow maps, and data lineage;
- git boundaries and whether AI may commit;
- environment management policy;
- language policy: Chinese first, key English terms preserved;
- project owner authority over stable, exploratory, deprecated, or rejected states.

## docs/ai_context Suggested Files

Use only files that serve the project:

```text
project_structure.md
naming_convention.md
script_style.md
output_figure_policy.md
environment_policy.md
workflow_map.md
data_lineage.md
status_policy.md
```

For analysis-first projects, `script_style.md` should require Chinese navigation comments in scripts: Chinese numbered section titles, block-level purpose notes, parameter/decision rationale, and human review Gates. Variable names, paths, and APIs stay in English. Pair this with the global `code-organization` skill.

Avoid creating a large documentation system before the project needs it. Prefer compact, maintainable files.

For figure export behavior (PDF+PNG, R/Python backend, Illustrator single-panel workflow), agents should use the global skill `bioinfor-figure-export` under `~/.agents/skills/`. Project `output_figure_policy.md` documents repo-specific path overlays and human-readable rules aligned with that skill.

## Log Entry Shape

Use concise milestone entries:

```markdown
## YYYY-MM-DD | Topic

Commit: short-sha or pending

Scope:
- ...

State:
- ...

Next:
- ...
```

Keep logs simple. They should help future AI orient quickly, not recreate every diff.
