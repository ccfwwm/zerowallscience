---
name: figure-provenance
description: Use whenever the user asks whether figures can be traced to code and data — "where did this figure come from", "check my figures", "are the plots up to date", "is this figure reproducible", "regenerate the figures", or before submitting a manuscript or archiving a project. Sweeps every image in the workspace and links it to the script that writes it and the data that script reads, flagging figures with no generator, stale figures, missing inputs, and figures referenced but absent. Reports the trace it could establish; it never judges whether a figure is scientifically right.
---

# Figure provenance

Every figure in a paper should answer three questions without a human guessing:
**which script wrote it, which data that script read, and was it regenerated
after either changed.** This skill establishes that chain for *every* image in
the workspace, deterministically, and reports where the chain breaks.

It is a superset sweep, not a spot check. `traceability-review` looks at the
figures a document happens to reference and asks whether they look stale; this
skill starts from the filesystem, so a figure nobody references and a script
whose output was deleted both surface.

## Run the sweep

```bash
python "$XDG_CONFIG_HOME/opencode/skills/figure-provenance/figure_provenance.py" [dir]
```

It prints one ` ```review ` fenced JSON block. Findings carry `check: "figure"`:

- **figure · orphan** — an image no script writes. Nothing in the workspace
  mentions its filename in a save call, so it cannot be regenerated. An `error`
  for figures a document references, a `warn` otherwise.
- **figure · stale** — the generating script (or an input it reads) has a newer
  provenance timestamp than the figure. The figure on disk is not what the
  current code produces.
- **figure · input** — the generating script reads a data file that does not
  exist, so the figure cannot be regenerated even though its script is present.
- **figure · missing** — a document references a figure that is not on disk.
- **figure · untracked** — the figure exists but has no `.zerowall/provenance.jsonl`
  record, so its history stops at the filesystem mtime.
- **figure · ok** — the full chain resolved: figure ← script ← existing inputs,
  and the figure is the newest of the three. Emitted so a clean sweep is visible
  rather than silent.

## How the chain is inferred

1. **Figures** — every `.png`, `.pdf`, `.svg`, `.jpg`, `.jpeg`, `.eps`, `.tif`
   file outside the skip list.
2. **Generator** — a code file (`.py`, `.R`, `.jl`, `.ipynb`, `.sh`) whose text
   contains the figure's filename. A `savefig("figures/fig1.png")` and an
   f-string `f"{OUT}/fig1.png"` both match on the basename.
3. **Inputs** — string literals in that script that look like data paths
   (`.csv`, `.parquet`, `.nc`, `.json`, `.xlsx`, `.h5`, `.tsv`, `.feather`).
4. **Timestamps** — the newest `ts` per path in `.zerowall/provenance.jsonl`,
   falling back to the filesystem mtime when a path has no record.

Basename matching means a script that writes `fig1.png` in two directories is
credited with both. That is deliberate: over-attributing a generator is a far
smaller error than reporting a real figure as an orphan.

## Reporting

Copy the ` ```review ` block as the **last thing** in your message. When the
sweep is clean, say the figures trace to code and data — not that the figures are
correct. A figure can trace perfectly to a script that plots the wrong column.

## Adding a check

Add a `check_<name>(...)` in `figure_provenance.py` and call it from `run()`;
findings stay on `check: "figure"` so they group together in the UI.
