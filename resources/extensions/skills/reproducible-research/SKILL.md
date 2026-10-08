---
name: reproducible-research
description: Use when the user asks to set up, standardize, clean up, or check the reproducibility of a project or workspace — "is this reproducible", "can someone else rerun this", "organize this project", "package this for a reviewer", "prepare this for submission", or before archiving/sharing a workspace. Enforces a standard layout (data / scripts / figures / report), a pinned environment, machine-independent paths, and a provenance record for every generated artifact. Flags specific reproducibility gaps; never certifies that a project reproduces.
license: MIT
zerowall:
  schema_version: 1
  domains: [general]
  research_stages: [analysis, validation]
  roles: [planner, critic, validator]
  evidence_types: [project-data, computational]
  outputs: [validation-plan, risk-map]
  side_effects: code_execution
---

# Reproducible research

A project reproduces when a stranger on a different machine can rerun it and get
the same artifacts. That needs four things, and this skill checks exactly those:

1. **A standard layout** so files are findable — `data/` (inputs, read-only),
   `scripts/` or `src/` (code), `figures/` or `outputs/` (generated), and a
   report at the top.
2. **A pinned environment** — `requirements.txt`, `environment.yml`,
   `pyproject.toml`, or `renv.lock` with versions, not bare package names.
3. **Machine-independent paths** — relative paths only. An absolute
   `C:\Users\…` or `/Users/…` path is the single most common reason a shared
   project dies on the first run.
4. **A provenance record** for every generated artifact, so a figure or table can
   be traced back to the script that produced it.

## Run the gate

The deterministic gate ships beside this SKILL.md. Run it on the workspace before
you tell the user the project is ready to share:

After `use_skill`, run the absolute `repro_check.py` path listed under
`Bundled Resources`:

```text
python "<absolute path to repro_check.py>" [dir]
```

It prints one ` ```review ` fenced JSON block covering:

- **repro · layout** — no place for inputs, code, or outputs; or generated files
  sitting loose in the workspace root.
- **repro · environment** — no dependency manifest at all, or one that lists
  packages without versions (`pandas` instead of `pandas==2.2.1`).
- **repro · paths** — an absolute or home-relative path inside a script.
- **repro · provenance** — after the offline gate inventories generated
  artifacts, call `inspect_project_provenance` on their workspace-relative
  paths. Report `untracked` as a gap and `unknown` as insufficient evidence.
- **repro · seed** is deliberately NOT checked here — `stats-integrity` owns it.

## Setting a project up

When the user asks for structure rather than a check, create only what the work
needs — an empty `notebooks/` nobody uses is clutter, not rigor:

```text
data/           raw inputs, never edited in place
scripts/        analysis code, run top to bottom
figures/        generated — safe to delete and regenerate
report.md       the writeup
requirements.txt  pinned versions
README.md       one paragraph: what this is, how to rerun it
```

Write the rerun instructions as literal commands, not prose. "Run the analysis"
is not reproducible; `python scripts/01_clean.py && python scripts/02_model.py`
is.

## Reading provenance

Use `inspect_project_provenance(paths, limit)` with project-relative paths. It
is a bounded, project-isolated view over ArtifactVersion, Run, and execution
provenance. Do not inspect internal databases or infer provenance from a file's
existence. Preserve `unknown` whenever the stored evidence is insufficient.

## Reporting

Copy the ` ```review ` block as the **last thing** in your message — the app
renders it as dismissible reviewer cards. Never tell the user the project "is
reproducible" or "will reproduce": the gate checks these four gaps only, and a
project can clear all of them and still fail on an unpinned system library.

## Adding a check

Add a `check_<name>(...)` function in `repro_check.py` and call it from `run()`;
each finding carries its own `tag`, so the app needs no change.
