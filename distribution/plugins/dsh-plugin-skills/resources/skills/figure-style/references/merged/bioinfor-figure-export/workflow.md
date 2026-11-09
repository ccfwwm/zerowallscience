# Bioinformatics Figure Export


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
