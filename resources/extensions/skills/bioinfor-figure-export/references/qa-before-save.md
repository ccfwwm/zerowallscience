# QA Before Save

Run this checklist before claiming a figure export task is complete.

## Export files

- [ ] Both `.pdf` and `.png` exist for each key figure
- [ ] No `.svg` was produced unless user explicitly overrode this skill
- [ ] Filenames follow `<step>_<brief_description>` without fig/panel prefixes
- [ ] No new `*_summary_*` patchwork/combined figure was added as default output

## Editable PDF

- [ ] R: `device = grDevices::cairo_pdf` (or equivalent TrueType embedding)
- [ ] Python: `pdf.fonttype = 42` and `ps.fonttype = 42` set before save
- [ ] Opened PDF mentally checks: text should remain editable in Illustrator

## Typography

- [ ] Font family Arial (or documented journal override)
- [ ] Base size in **7–9 pt** range at export dimensions
- [ ] Width, height, units, and dpi explicitly written in script

## Rasterization

- [ ] Only dense scatter/UMAP/spatial layers rasterized
- [ ] Axes, titles, tick labels, legends remain vector
- [ ] Whole figure not rasterized

## Data traceability

- [ ] Quantitative figure has matching summary/source table in `result/`
- [ ] Group columns, contrast, and replicate level are documented in script or table
- [ ] Comparison slug in filename/table when multiple contrasts exist

## Backend

- [ ] R used for non-native quant plots
- [ ] Python used only for Scanpy/omicverse native plots or user-approved exception
- [ ] No cross-language preview substitute was generated

## Code style

- [ ] Plot code visible in script; not hidden in opaque helper
- [ ] **No sealed plotting functions** — grouping, colors, limits, labels, sizes, filenames editable inline without opening utils
- [ ] Figure role stated in one sentence near save block or script header
- [ ] `fig_root` / output path traceable to current script id

## Optional project overlay

If `docs/ai_context/output_figure_policy.md` exists in the repo:

- [ ] Path uses project’s `analyses/<module>/figure/...` convention
- [ ] Branch subdirectory used consistently when parallel analysis branches exist
