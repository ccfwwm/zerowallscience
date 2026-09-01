---
name: bioinfor-figure-export
description: >-
  Publication-oriented bioinformatics figure export for R+Python mixed workflows.
  Use whenever the user asks to create, revise, audit, or export scientific figures,
  ggsave/savefig, PDF+PNG export, Illustrator-ready panels, ggplot2/Seurat plots,
  Scanpy UMAP/dotplot figures, beeswarm/bar/proportion plots, or mentions 出图、作图、
  画图、论文图、投稿图、Illustrator 拼版、figure export—even without saying "Nature".
  Enforces single-panel script output (no patchwork summary figures), editable PDF text,
  7–9 pt Arial at export size, R-default plotting with Python handoff, and source-data
  tables alongside quantitative panels. Not for dashboards, interactive Plotly, or
  AI-generated schematic illustrations unless the user explicitly requests those routes.
---

# Bioinformatics Figure Export

## ZeroWall execution contract

These host rules override workflow examples below when they differ.

- Use ZeroWall tools by their actual names and discover optional MCP capabilities with `search_mcp_tools`; do not assume a connector is installed.
- Use `python` or `r` for short interactive work and `run_in_context` with Run Manager for long-running or high-resource jobs.
- Resolve credentials only through **Settings > Credentials**. Never create, scan, or load project `.env` files and never print secret values.
- Keep network calls, large transfers, overwrites, and destructive changes approval-gated. Start with read-only inspection or a dry-run plan.
- Do not install runtimes or dependencies automatically. Report the exact missing runtime or package instead.
- Use project-relative paths and cross-platform commands. Gate Unix-only examples behind an explicit WSL, container, or SSH context.

## Overview

This skill defines how to **draw and export** scientific figures in bioinformatics analysis projects. It absorbs core ideas from [nature-figure](https://github.com/Yuan1z0825/nature-skills/tree/main/skills/nature-figure)—figure as visual argument, editable vector text, restrained typography, scatter-only rasterization—while matching a **practical exploratory-to-submission workflow**:

- **Single panel per file** in scripts; final multi-panel layout in **Adobe Illustrator** (open PDF directly).
- **PDF + PNG** for every key figure; **no SVG** (editable PDF is sufficient).
- **R default** for plotting; **Python** only for Scanpy/omicverse native plots or analysis with handoff to R.
- Plotting code stays **inline in analysis scripts**, not hidden in wrappers.

Default language: **Chinese** for explanations; file paths, column names, and code remain English.

If a project also has `docs/ai_context/output_figure_policy.md`, treat it as a **project overlay** for path prefixes (`analyses/<module>/…`) and local conventions. **This skill remains the canonical export behavior** when both exist.

Route path-binding questions to `code-organization`. Route script structure and checkpoints to the project’s `script_style.md` when present.

---

## When To Use

- Writing or editing `ggsave()`, `savefig()`, DimPlot, ggplot, beeswarm, bar, dotplot export blocks
- “帮我出图”“export figure”“改成 Illustrator 能改的 PDF”
- Reviewing scripts for patchwork/summary figures that should be split
- Python analysis finished → need R figures or handoff design
- Auditing font size, dpi, or editable-text settings before submission prep

**Do not use** for: Plotly/Altair dashboards, Illustrator-first infographic design, or nature-skills OpenRouter AI schematic generation (unless user explicitly asks).

---

## Operating Protocol

Follow this order every time.

### 1. Lite figure intent (before code)

A figure is a **visual argument**, not decoration. Before plotting, state briefly:

```text
Figure role:     discovery | comparison | validation | QC review | mechanism support
Core message:    one sentence — what should the reader conclude?
Backend:         R (default) | Python (Scanpy native only — state reason)
Export:          PDF + PNG; single panel; Illustrator assembly later
Source data:     which table backs this panel (or will be saved alongside)
```

You do **not** need a full Nature panel map or archetype essay for exploratory scripts. You **do** need a clear role and backend choice.

### 2. Resolve backend (blocking for mixed projects)

| Situation | Backend |
|-----------|---------|
| ggplot2, Seurat, stats bars, beeswarm, proportion plots | **R** |
| Scanpy/omicverse `sc.pl.umap`, `sc.pl.dotplot`, similar native plots | **Python** allowed |
| Python analysis → publication-style quant plot | Export **table or text checkpoint** → **R** plots |
| User explicitly chose R or Python | Honor choice for entire figure job |

Once selected, use that backend for draw, preview, and export. **Do not cross-render** (no Python preview for an R figure or vice versa).

If the selected runtime or packages are missing, stop and report the blocker; provide install hints but do not silently switch language.

### 3. Write inline plot + export code

Keep inputs, aesthetics, dimensions, filenames, and export devices visible in the script section that saves the figure.

### 4. QA before claiming done

Run `references/qa-before-save.md` mentally or explicitly before finishing.

---

## Export Contract (Hard Rules)

| Rule | Requirement |
|------|-------------|
| Formats | **PDF + PNG** for each key figure |
| SVG | **Do not use** |
| PDF text | Editable: R `cairo_pdf`; Python `pdf.fonttype=42`, `ps.fonttype=42` |
| PNG | ≥ **300 dpi**; explicit `dpi=` |
| Font | **Arial** / sans-serif stack unless journal override |
| Font size at export | **7–9 pt** body/tick/legend — not screen-preview sizes |
| Dimensions | Width/height **explicit** in mm or inches near `ggsave`/`savefig` |
| Panels | **One panel per file** — no `patchwork`/`cowplot`/`grid.arrange` summary deliverables |
| Assembly | User composes in **Illustrator** from individual PDFs |
| Rasterization | **Scatter/dense points only**; axes, labels, legends stay vector |
| Quantitative panels | Save matching **summary/source table** under `result/` |
| Naming | `<step>_<brief_description>.pdf` and same stem `.png` |
| Fig/panel letters | **Not** in filenames — assigned in Illustrator |

### Forbidden defaults

- `*_summary_*` patchwork figures as standard script output
- Whole-figure rasterization
- Python matplotlib for complex stats plots when R + table handoff is straightforward
- **Sealed plotting functions** — see next section

---

## Human-Reviewable Plot Code (Hard Rule)

Plotting code must stay **open, linear, and editable by the analyst** in the script itself. Figures are part of the analysis record; the owner must be able to review and tweak grouping, colors, limits, labels, and export settings **without opening a helper library**.

### Required

- `ggplot()`, `DimPlot()`, `sc.pl.*`, `ggsave()`, `savefig()` blocks live **in the main script** near the analysis step they illustrate
- Every aesthetic and export parameter that affects the figure is **visible in that block** or in variables defined immediately above it
- If a variable holds a plot object (`p <- ggplot(...)`), the full construction must be readable above `ggsave()`

### Forbidden in exploratory / analysis scripts

- `plot_umap(seu, "group")`, `make_figure_2()`, `export_all_figures()` or any wrapper that hides group columns, assay/layer, colors, sizes, or filenames
- Moving **figure logic** into `utils/` unless the user explicitly promoted it as a stable, fully-parameterized tool — and even then, the script must pass every biological and visual argument explicitly
- Auto-figure pipelines that generate plots from config alone without inspectable code in the script
- AI-generated “helper functions” that replace inline ggplot/Seurat/Scanpy calls for key deliverable figures

### Allowed narrow exceptions

- **Technical-only** helpers that do not encode biological or visual decisions, e.g.:
  - `dir.create(fig_root)`
  - rasterize scatter layers (`utils/rasterize_plots.py`)
  - shared **font/rcParams setup** copied or sourced once, with script still showing dimensions and filenames at save time
- Stable project utilities already approved by the owner, used with **all** tuning parameters passed at the call site

When in doubt: **inline the plot.** Prefer ten extra readable lines over one opaque function call.

---

## Output Path Binding

Generated figures must trace to the script that created them.

Generic pattern (adapt to project root):

```text
scripts/<stage>/<script-id>.R
  → result/<stage>/<script-id>/
  → figure/<stage>/<script-id>/
```

Optional branch between stage and script-id:

```text
scripts/<stage>/<branch>/<script-id>.R
  → figure/<stage>/<branch>/<script-id>/
```

Notebook: use notebook stem as `<script-id>`.

---

## R / Python Handoff

Two handoff patterns are both valid; declare in script header `Input`:

1. **Text checkpoint** — counts, metadata, embeddings as MatrixMarket/tsv; R reads and plots.
2. **Summary table** — Python keeps h5ad; writes plot-ready tsv; R reads table only.

Python export of non-native plots is an exception: document `backend: Python` and reason in script header.

---

## R Export Template

Theme choice is flexible; **export parameters are not**.

```r
library(ggplot2)

plot_font_family <- "Arial"
plot_base_size <- 8L   # target 7–9 pt at final size

theme_set(theme_bw(base_family = plot_font_family, base_size = plot_base_size))

p <- DimPlot(
  seurat_obj,
  reduction = "umap",
  group.by = "celltype",
  label = TRUE,
  raster = TRUE
)

fig_path <- file.path(fig_root, "02_umap_celltype")

ggsave(
  filename = paste0(fig_path, ".pdf"),
  plot = p,
  width = 89,
  height = 89,
  units = "mm",
  device = grDevices::cairo_pdf
)

ggsave(
  filename = paste0(fig_path, ".png"),
  plot = p,
  width = 89,
  height = 89,
  units = "mm",
  device = ragg::agg_png,
  dpi = 300
)
```

Pure ggplot2: same `cairo_pdf` + `ragg::agg_png` pair. Dense ggplot scatter: consider `ggrastr::rasterise()`.

---

## Python Export Template (Scanpy / omicverse native only)

```python
import matplotlib.pyplot as plt

# from utils.rasterize_plots import rasterize_figure_scatter_collections  # if available

plt.rcParams.update({
    "font.family": "Arial",
    "font.size": 8,
    "pdf.fonttype": 42,
    "ps.fonttype": 42,
})

sc.pl.umap(
    adata,
    color="celltype",
    frameon=False,
    legend_loc="right margin",
    show=False,
)

# rasterize_figure_scatter_collections(plt.gcf())

fig_path = fig_root / "02_umap_celltype"
plt.savefig(f"{fig_path}.pdf", bbox_inches="tight")
plt.savefig(f"{fig_path}.png", dpi=300, bbox_inches="tight")
plt.close()
```

If the project provides `utils/rasterize_plots.py`, use it for UMAP/scatter layers.

For bar plots, beeswarm, or test annotations → export data to tsv and plot in R.

---

## Typography & Layout (from Nature practice, adapted)

- Prefer **direct labels** over huge legends when categories are spatially stable.
- Do not use rainbow colormaps for sequential data.
- Tighten axis limits to data range; avoid lazy 0–100 scales when values sit in a narrow band.
- White background for ordinary plots; black background **only** inside microscopy/image plates.
- One restrained palette per figure session; keep the same condition color across related panels (even when panels are separate files).

Full intent worksheet: `references/figure-intent.md`. Pre-save QA: `references/qa-before-save.md`.

---

## Source Data Alongside Figures

For every **quantitative** panel, save under the same script’s `result/` directory:

- plot input table (group summaries, statistics, comparison slug if applicable)
- when relevant: `n` definition, test name, replicate level

The figure is presentation; the table is audit trail.

---

## Refactoring Legacy Scripts

When auditing existing code:

1. Split patchwork/summary outputs into separate `ggsave`/`savefig` calls.
2. Add missing PNG or PDF twin.
3. Replace non-`cairo_pdf` PDF devices in R.
4. Set `pdf.fonttype=42` in Python rcParams before save.
5. Downsize export-time font to 7–9 pt range.
6. Move non-Scanpy Python plots to R + table handoff when practical.

Do not delete old exploratory combined figures unless the user asks; stop **generating** new ones.

---

## Relationship to Other Skills

| Skill / doc | Role |
|-------------|------|
| **This skill** | How to plot and export; backend; PDF+PNG; Illustrator workflow |
| `code-organization` | Script/result/figure directory binding |
| `project-scaffold` | New projects should include human-readable `output_figure_policy.md` aligned with this skill |
| Project `script_style.md` | Linear script structure, Chinese navigation comments, checkpoints, biology decisions |
| nature-figure (external) | Optional deep panel logic / journal QA at writing stage—not the default export pipeline here |
