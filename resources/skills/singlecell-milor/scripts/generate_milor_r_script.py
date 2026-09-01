#!/usr/bin/env python3
"""Generate a readable R/miloR analysis script from an h5ad input."""

from __future__ import annotations

import argparse
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parents[1]
TEMPLATE_FILE = SKILL_DIR / "templates" / "milor_readable_template.R"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a readable R/miloR script.")
    parser.add_argument("--project-dir", required=True)
    parser.add_argument("--input-h5ad", required=True)
    parser.add_argument("--output-script", required=True)
    parser.add_argument("--analysis-name", required=True, help="Short safe name used in output filenames.")
    parser.add_argument("--lineage-col", default="", help="Optional obs column used to subset lineage.")
    parser.add_argument("--lineage-value", default="", help="Optional value in lineage-col to keep.")
    parser.add_argument("--celltype-col", required=True, help="obs column used to annotate neighbourhoods.")
    parser.add_argument("--sample-col", default="sample")
    parser.add_argument("--group-col", default="group")
    parser.add_argument("--control-group", required=True)
    parser.add_argument(
        "--compare-groups",
        default="",
        help="Comma-separated groups compared to control. If omitted, infer all non-control groups from h5ad.",
    )
    parser.add_argument("--reduced-obsm", default="X_scANVI")
    parser.add_argument("--umap-obsm", default="X_umap_scANVI")
    parser.add_argument("--python", default="", help="RETICULATE_PYTHON path. Defaults to project .pixi env.")
    parser.add_argument("--out-root", default="", help="Output root. Defaults to output/milor/<analysis-name>.")
    parser.add_argument("--fig-root", default="", help="Figure root. Defaults to figures/milor/<analysis-name>.")
    return parser.parse_args()


def r_string(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def infer_compare_groups(h5ad: str, group_col: str, control_group: str) -> list[str]:
    import anndata as ad

    adata = ad.read_h5ad(h5ad, backed="r")
    obs = adata.obs
    if group_col not in obs.columns:
        raise SystemExit(f"group column not found in h5ad obs: {group_col}")
    groups = [str(x) for x in obs[group_col].dropna().unique().tolist()]
    return [group for group in groups if group != control_group]


def safe_name(value: str) -> str:
    return value.replace(" ", "_").replace("/", "_").replace("\\", "_")


def comparison_block(group: str, index: int, analysis_name: str) -> str:
    safe = safe_name(group)
    object_name = f"milo_{safe.lower().replace('-', '_')}"
    section = index + 4
    return f'''

# ==============================================================================
# {section}. Milo comparison: {group} vs control
# ==============================================================================

message("Starting {group} vs control Milo analysis")
{object_name} <- load_or_run_milo(
  selected_sce,
  group_test = c(control_group, "{group}"),
  comparison_name = "{safe}"
)
write.csv(
  {object_name}$da_results,
  file.path(out_root, "miloR_DA_{analysis_name}_{safe}.csv"),
  row.names = FALSE
)

p_{object_name}_graph <- plotNhoodGraphDA(
  {object_name}$milo.obj,
  {object_name}$da_results,
  alpha = spatial_fdr_cutoff
) +
  ggtitle("{group} vs control") +
  scale_fill_gradient2(name = "logFC", low = muted("blue"), mid = "white", high = muted("red")) +
  guides(fill = guide_colorbar(title = "logFC")) +
  theme(
    text = element_text(family = plot_font_family),
    legend.position = "right",
    legend.title = element_text(family = plot_font_family),
    legend.text = element_text(family = plot_font_family)
  )

ggsave(
  file.path(fig_root, "miloR_nhood_graph_{analysis_name}_{safe}.png"),
  p_{object_name}_graph,
  device = ragg::agg_png,
  width = 5,
  height = 3.5,
  dpi = 300
)
ggsave(
  file.path(fig_root, "miloR_nhood_graph_{analysis_name}_{safe}.pdf"),
  p_{object_name}_graph,
  device = cairo_pdf,
  width = 5,
  height = 3.5
)

p_{object_name}_beeswarm <- plotDAbeeswarm(
  {object_name}$da_results,
  group.by = celltype_col,
  alpha = spatial_fdr_cutoff
) +
  theme_classic(base_size = 14, base_family = plot_font_family) +
  scale_color_gradient2(name = "logFC", low = muted("blue"), mid = "white", high = muted("red")) +
  guides(colour = guide_colorbar(title = "logFC")) +
  labs(x = NULL, title = "{group} vs control") +
  theme(
    axis.text = element_text(color = "black"),
    legend.position = "right",
    legend.title = element_text(family = plot_font_family),
    legend.text = element_text(family = plot_font_family)
  )

ggsave(
  file.path(fig_root, "miloR_DA_beeswarm_{analysis_name}_{safe}.png"),
  p_{object_name}_beeswarm,
  device = ragg::agg_png,
  width = 8,
  height = 5.5,
  dpi = 300
)
ggsave(
  file.path(fig_root, "miloR_DA_beeswarm_{analysis_name}_{safe}.pdf"),
  p_{object_name}_beeswarm,
  device = cairo_pdf,
  width = 8,
  height = 5.5
)
'''


def main() -> None:
    args = parse_args()
    compare_groups = [x.strip() for x in args.compare_groups.split(",") if x.strip()]
    if not compare_groups:
        compare_groups = infer_compare_groups(args.input_h5ad, args.group_col, args.control_group)
    if not compare_groups:
        raise SystemExit("No comparison groups found. Provide --compare-groups.")

    template = TEMPLATE_FILE.read_text(encoding="utf-8")
    out_root = args.out_root or f"output/milor/{args.analysis_name}"
    fig_root = args.fig_root or f"figures/milor/{args.analysis_name}"
    reticulate_python = args.python or str(Path(args.project_dir) / ".pixi/envs/ov-ljx-3/bin/python")

    replacements = {
        "{{PROJECT_DIR}}": r_string(args.project_dir),
        "{{RETICULATE_PYTHON}}": r_string(reticulate_python),
        "{{INPUT_H5AD}}": r_string(args.input_h5ad),
        "{{ANALYSIS_NAME_R}}": r_string(args.analysis_name),
        "{{LINEAGE_COL}}": r_string(args.lineage_col),
        "{{LINEAGE_VALUE}}": r_string(args.lineage_value),
        "{{CELLTYPE_COL}}": r_string(args.celltype_col),
        "{{SAMPLE_COL}}": r_string(args.sample_col),
        "{{GROUP_COL}}": r_string(args.group_col),
        "{{CONTROL_GROUP}}": r_string(args.control_group),
        "{{REDUCED_OBSM}}": r_string(args.reduced_obsm),
        "{{UMAP_OBSM}}": r_string(args.umap_obsm),
        "{{OUT_ROOT}}": r_string(out_root),
        "{{FIG_ROOT}}": r_string(fig_root),
        "{{ANALYSIS_NAME}}": args.analysis_name,
        "{{COMPARISON_BLOCKS}}": "".join(
            comparison_block(group, i, args.analysis_name) for i, group in enumerate(compare_groups)
        ),
    }
    rendered = template
    for key, value in replacements.items():
        rendered = rendered.replace(key, value)

    output_script = Path(args.output_script)
    output_script.parent.mkdir(parents=True, exist_ok=True)
    output_script.write_text(rendered, encoding="utf-8")
    print(f"Wrote {output_script}")
    print("Comparison groups:", ", ".join(compare_groups))


if __name__ == "__main__":
    main()
