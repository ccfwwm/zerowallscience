---
name: code-organization
description: Organize codebases, scripts, modules, utilities, entrypoints, and generated outputs around clear engineering boundaries. Use this when asked to study or refactor project code organization, design scripts/src/utils structure, separate workflow scripts from reusable functions, bind scripts to result/figure outputs, map code dependencies, generalize an existing project's organization style, define code structure for a new project, or write analysis scripts with Chinese navigation comments and owner-editable linear flow. This skill is for structure and boundaries, not detailed lint style or package solving.
---

# Code Organization

## ZeroWall execution contract

These host rules override workflow examples below when they differ.

- Use ZeroWall tools by their actual names. Inspect with `read`, `search`, and `grep` before editing; discover optional MCP capabilities with `search_mcp_tools`.
- Use `python` or `r` for short interactive work and `run_in_context` with Run Manager for long-running or high-resource jobs.
- Resolve credentials only through **Settings > Credentials**. Never create, scan, or load project `.env` files and never print secret values.
- Keep network calls, overwrites, and destructive moves approval-gated, and preserve unrelated user changes.
- Do not install runtimes or dependencies automatically. Report the exact missing runtime or package instead.
- Use project-relative paths and cross-platform commands. Gate Unix-only examples behind an explicit WSL, container, or SSH context.

## Overview

Use this skill to design how code is organized. The default language is Chinese, with stable engineering terms preserved in English or paired Chinese-English, such as `scripts`, `utils`, `src`, `entrypoint`, `workflow map`, and `data lineage`.

This skill is intentionally narrower than a full project scaffold. It focuses on code shape: where executable workflows live, where reusable logic lives, how modules relate, and how generated outputs map back to code.

For bioinformatics and other exploratory analysis projects, keep the human analyst as the script owner. Scripts should remain reviewable, editable, and scientifically readable by the project owner; engineering structure must support that, not hide the analysis behind excessive abstraction.

When writing or substantially editing analysis scripts, follow the project's `docs/ai_context/script_style.md` if present. Prefer Chinese navigation comments so the owner can skim the analysis storyline without reading every line of code.

## First Pass

Read the current project before proposing structure. Inspect likely code roots such as `scripts/`, `src/`, `utils/`, notebooks, package manifests, and generated output directories. Use `rg --files` and focused file reads.

Then report:

- current code roots;
- execution entrypoints;
- reusable function locations;
- output or artifact conventions;
- repeated patterns worth preserving;
- structural problems that affect future AI work.

Do not force a template onto a project before learning its local habits.

For bioinformatics projects, study both script organization and script content. Look at how scripts load objects, set parameters, branch analysis logic, save intermediate data, save figures, and reuse helper functions before proposing changes.

## Organization Decision

Choose the dominant project shape:

- Data or analysis workflow: read `references/script-organization.md` and `references/output-binding.md`.
- Software/library/application: read `references/source-organization.md`.
- Mixed project: separate workflow entrypoints from source packages, then use both references.

When generated outputs or dependency maps matter, read `references/workflow-lineage.md`.

## Core Boundaries

Keep these boundaries clear:

- `scripts/` contains executable workflows and ordered procedures.
- `src/` contains importable packages or application code.
- `utils/` contains reusable helpers when the project is script-first and not packaged.
- `tests/` validates source behavior when the project has software components.
- `result/` contains generated data artifacts.
- `figure/` contains generated visual artifacts.
- `tmp/` contains disposable files and should not be formal downstream input.
- `data/` contains external or raw input, not script-generated formal outputs.

Adapt names to the existing project, but preserve the conceptual separation.

## Anti-Overabstraction

Do not equate good organization with extracting many functions. For script-first analysis projects, a readable top-down workflow is often more valuable than compact abstraction.

Keep in the script when the code expresses:

- analysis flow and scientific decisions;
- parameter choices and object selection;
- input/output order;
- one-off transformations that the owner may edit during review;
- figure assembly that is specific to the current result;
- Chinese comments that mark why a step exists, what to review next, and where human judgment is required.

Move to `utils/` or `src/` only when extraction reduces real duplication, names a complex stable concept, creates a reusable boundary, or makes the script easier for the owner to modify.

## Chinese Navigation Comments

For analysis scripts, comments are part of the analysis record, not optional decoration. When this skill is used to write, reorganize, or substantially edit scripts:

- Use Chinese for numbered section titles and for block-level orientation comments.
- Keep variable names, function names, paths, column names, and file names in English.
- At each major block, state in Chinese: purpose, relation to upstream/downstream, and what the analyst should check before the next decision.
- Beside critical parameters or biology decisions, explain why the value/choice is used, or that it is still exploratory and awaiting human Gate.
- Beside checkpoint / skip logic, say what reuse means and when old results should be deleted and recomputed.
- Do not translate syntax line by line, and do not write vague filler such as “进行数据分析”.

Density target: each numbered section and each decision/parameter block should be scannable in Chinese. Long or multi-Gate scripts should also have short rhythm comments between sections (“以上完成 X；接下来做 Y / 等人看图后再定 Z”).

If the project has `script_style.md`, treat its「中文导航注释」section as the authoritative local rule.

## Expensive Checkpoints

For analysis steps that consume substantial compute, memory, GPU time, API quota, or wall-clock time, design the script to save a reusable intermediate result. Treat these as formal checkpoints, not disposable `tmp/` files, when downstream scripts may reuse them.

Checkpoint outputs should live under `result/` with script-bound names, be documented in `workflow_map` or `data_lineage`, and be loaded by downstream scripts instead of recomputing from raw inputs. Do not commit large checkpoint files to git by default; track their provenance in docs.

## Publication-Ready Figures

For analysis scripts that save figures for paper assembly, Adobe Illustrator, or downstream manual editing, make the figure export policy explicit in the script instead of relying on device defaults.

- Use Arial for figure text in both R and Python when the user has not requested another journal font.
- Save editable vector output with embedded TrueType-compatible text where possible: in R prefer `ggsave(..., device = cairo_pdf)`; in Python set `matplotlib.rcParams["pdf.fonttype"] = 42`, `matplotlib.rcParams["ps.fonttype"] = 42`, and `matplotlib.rcParams["font.family"] = "Arial"` before `savefig`.
- Save PNG output with a high-quality raster backend: in R prefer `device = ragg::agg_png`; in Python use `savefig(..., dpi = 300)` or higher.
- For dense UMAP, t-SNE, spatial, or scatter plots with many point elements, rasterize only the point layer while keeping axes, titles, labels, legends, and annotations as vector text. In R, use `ggrastr::geom_point_rast()` or `ggrastr::rasterise()` on the point layer/plot layer; in Python/matplotlib use `rasterized=True` on scatter artists. Avoid rasterizing the entire figure unless the user explicitly wants a flat image.
- Keep this policy near the plot setup section, for example `plot_font_family <- "Arial"` in R or a small `matplotlib.rcParams` block in Python, so the human analyst can quickly audit and change publication settings.

## Output Style

Respond in Chinese by default. Keep code paths, directory names, and stable engineering terms in English. Prefer concise structure over long style guides.

When proposing code organization, include:

- recommended top-level code roots;
- how entrypoints and reusable logic are separated;
- naming rules for scripts/modules;
- generated output binding if relevant;
- what should be documented in `workflow_map` or `data_lineage`;
- migration steps that avoid moving too much at once.
