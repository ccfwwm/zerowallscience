#!/usr/bin/env python3
"""Per-sample scRNA QC metric calculation (scanpy).

Human-in-the-loop tool: computes metrics and writes metadata.tsv.
Does NOT apply filtering thresholds. Run filter scripts only after
the analyst reviews diagnosis outputs and confirms cutoffs.

Bundled with singlecell-qc skill.

Example:
  python calculate_metrics.py \\
    --matrix-dir data/cellranger/SAMPLE/outs/raw_feature_bc_matrix \\
    --sample-id SAMPLE \\
    --species human \\
    --output-dir result/01-qc/01-calculate_metrics/SAMPLE
"""

from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path

import numpy as np
import pandas as pd
import scanpy as sc
from scipy import sparse


SKILL_ROOT = Path(__file__).resolve().parents[1]
GENE_SETS = SKILL_ROOT / "assets" / "gene_sets"


def read_gene_list(path: Path) -> list[str]:
    genes = []
    for line in path.read_text().splitlines():
        g = line.strip()
        if g and not g.startswith("#"):
            genes.append(g)
    return genes


def fraction_score(adata, genes: list[str], denom: np.ndarray) -> np.ndarray:
    if not genes:
        return np.zeros(adata.n_obs, dtype=float)
    sub = adata[:, genes].X
    if sparse.issparse(sub):
        num = np.asarray(sub.sum(axis=1)).ravel()
    else:
        num = sub.sum(axis=1)
    with np.errstate(divide="ignore", invalid="ignore"):
        out = num / denom
    out[~np.isfinite(out)] = 0.0
    return out


def load_10x(matrix_dir: Path, min_genes: int = 50) -> sc.AnnData:
    adata = sc.read_10x_mtx(
        str(matrix_dir),
        var_names="gene_symbols",
        make_unique=True,
    )
    if min_genes > 0:
        sc.pp.filter_cells(adata, min_genes=min_genes)
    return adata


def compute_metrics(
    adata: sc.AnnData,
    species: str,
    hq_n_genes: int,
    run_scrublet: bool,
    expected_doublet_rate: float,
) -> pd.DataFrame:
    mt_prefix = "MT-" if species == "human" else "mt-"
    adata.var["mt"] = adata.var_names.str.startswith(mt_prefix)
    adata.var["rb"] = adata.var_names.str.startswith(("RPS", "RPL"))

    sc.pp.calculate_qc_metrics(
        adata,
        qc_vars=["mt", "rb"],
        percent_top=None,
        log1p=False,
        inplace=True,
    )

    obs = adata.obs.copy()
    obs["n_genes"] = obs["n_genes_by_counts"].astype(int)
    obs["n_UMIs"] = obs["total_counts"].astype(float)
    obs["mito_frac"] = obs["pct_counts_mt"].astype(float) / 100.0
    obs["pct_counts_rb"] = obs["pct_counts_rb"].astype(float)
    obs["is_HQ"] = obs["n_genes"] >= hq_n_genes

    hbb_file = GENE_SETS / f"hbb_genes_{species}.txt"
    if hbb_file.exists():
        hbb = [g for g in read_gene_list(hbb_file) if g in adata.var_names]
        obs["hbb_score"] = fraction_score(adata, hbb, obs["n_UMIs"].to_numpy())

    if species == "human":
        chry_file = GENE_SETS / "chrY_genes_human.txt"
        if chry_file.exists():
            chry = [g for g in read_gene_list(chry_file) if g in adata.var_names]
            obs["chrY_frac"] = fraction_score(adata, chry, obs["n_UMIs"].to_numpy())

    obs["doublet_score"] = np.nan
    obs["predicted_doublet"] = False

    if run_scrublet and obs["is_HQ"].sum() >= 100:
        import scrublet as scr

        hq_idx = obs.index[obs["is_HQ"]]
        hq = adata[hq_idx]
        x = hq.X.toarray() if hasattr(hq.X, "toarray") else np.asarray(hq.X)
        scrub = scr.Scrublet(x, expected_doublet_rate=expected_doublet_rate)
        scores, preds = scrub.scrub_doublets(
            min_counts=2,
            min_cells=3,
            min_gene_variability_pctl=85,
            n_prin_comps=min(30, hq.n_obs - 1, hq.n_vars - 1),
        )
        obs.loc[hq_idx, "doublet_score"] = scores
        obs.loc[hq_idx, "predicted_doublet"] = preds

    return obs


def write_metadata(obs: pd.DataFrame, out_dir: Path, sample_id: str) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    obs = obs.copy()
    obs.insert(0, "barcode", obs.index.astype(str))
    obs.insert(0, "sample_id", sample_id)

    tsv = out_dir / "metadata.tsv"
    obs.to_csv(tsv, sep="\t")

    with gzip.open(out_dir / "metadata.tsv.gz", "wt") as fh:
        obs.to_csv(fh, sep="\t")

    summary = {
        "sample_id": sample_id,
        "n_cells": int(obs.shape[0]),
        "median_n_genes": float(np.median(obs["n_genes"])),
        "median_n_UMIs": float(np.median(obs["n_UMIs"])),
        "median_mito_frac": float(np.median(obs["mito_frac"])),
        "n_HQ": int(obs["is_HQ"].sum()),
        "n_predicted_doublet": int(obs["predicted_doublet"].sum()),
    }
    (out_dir / "metrics_summary.json").write_text(json.dumps(summary, indent=2))


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Per-sample scRNA QC metrics (scanpy)")
    p.add_argument("--matrix-dir", required=True, type=Path, help="10x matrix directory")
    p.add_argument("--sample-id", required=True, help="Sample identifier")
    p.add_argument("--species", choices=["human", "mouse"], default="human")
    p.add_argument("--output-dir", required=True, type=Path)
    p.add_argument("--min-genes", type=int, default=50, help="Pre-filter min genes")
    p.add_argument("--hq-n-genes", type=int, default=500, help="HQ gate for Scrublet")
    p.add_argument("--run-scrublet", action="store_true", help="Run Scrublet on HQ cells")
    p.add_argument("--expected-doublet-rate", type=float, default=0.06)
    p.add_argument("--save-h5ad", action="store_true", help="Save AnnData with obs metrics")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    adata = load_10x(args.matrix_dir, min_genes=args.min_genes)
    obs = compute_metrics(
        adata,
        species=args.species,
        hq_n_genes=args.hq_n_genes,
        run_scrublet=args.run_scrublet,
        expected_doublet_rate=args.expected_doublet_rate,
    )
    adata.obs = obs
    write_metadata(obs, args.output_dir, args.sample_id)
    if args.save_h5ad:
        adata.write_h5ad(args.output_dir / "with_metrics.h5ad", compression="gzip")
    print(f"Wrote metrics for {args.sample_id}: {obs.shape[0]} cells -> {args.output_dir}")


if __name__ == "__main__":
    main()
