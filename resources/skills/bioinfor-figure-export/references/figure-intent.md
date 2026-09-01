# Figure Intent (Lite Contract)

Use before writing plotting code. Adapted from nature-figure’s figure contract, simplified for exploratory bioinformatics scripts that export **single panels** for Illustrator assembly.

## Minimum fields

Fill these in working notes or the script header:

```text
Figure role:        discovery | comparison | validation | QC review | mechanism support
Core message:       one sentence with a verb (what changed / what differs / what was found)
Backend:            R | Python (Scanpy native — reason required)
Input:              object or table path
Grouping / contrast: explicit column names and levels
Assay / layer:      e.g. RNA counts, full counts, normalized X
Output files:       <step>_<brief_description>.pdf + .png
Source table:       <step>_* summary tsv to save alongside
```

## What to skip in exploratory analysis

- Full multi-panel letter map (a/b/c) — assigned in Illustrator
- SVG export
- Script-side patchwork composition
- Mandatory semantic palette file — choose colors in script, stay consistent across related exports

## What to keep from Nature thinking

- **One figure, one message** — if the sentence needs “and also”, consider a second file
- **No redundant panels** — do not save two files that answer the same question with the same slice of data
- **Plot code stays inline** — analyst must be able to edit aesthetics and export without unwrapping sealed helpers
- **Statistics belong to the figure job** — `n`, test, and comparison must be knowable from script + result table
- **Chart serves logic** — polish is subordinate to clarity

## Backend decision tree

```text
Is it sc.pl.* / omicverse native visualization?
  yes → Python allowed if user workflow already in Python notebook
  no  → R default

Is plot input already a summary tsv from Python?
  yes → R ggplot2 / Seurat

Is plot input still in h5ad and not native sc.pl?
  prefer → export table or text checkpoint first, then R
```

## Illustrator handoff note

Each exported PDF should open cleanly in Illustrator with selectable text. Panel labels (a, b, c) are added during manual layout, not in the analysis script filename.
