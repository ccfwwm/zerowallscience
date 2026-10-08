#!/usr/bin/env python3
"""Inspect an h5ad file before generating an R/miloR workflow."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable

import pandas as pd


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inspect h5ad obs/group structure for MiloR.")
    parser.add_argument("--h5ad", required=True, help="Input .h5ad file.")
    parser.add_argument("--output-dir", required=True, help="Directory for preflight CSV/JSON outputs.")
    parser.add_argument("--sample-col", default="sample", help="Sample column in adata.obs.")
    parser.add_argument("--group-col", default="group", help="Group column in adata.obs.")
    parser.add_argument(
        "--celltype-cols",
        default="",
        help="Comma-separated candidate celltype columns to summarize. If omitted, likely columns are inferred.",
    )
    return parser.parse_args()


def stringify_series(series: pd.Series) -> pd.Series:
    return series.astype("string").fillna("NA").astype(str)


def infer_celltype_columns(columns: Iterable[str]) -> list[str]:
    keywords = ("anno", "celltype", "cell_type", "cluster", "leiden", "subtype")
    return [col for col in columns if any(key in col.lower() for key in keywords)]


def sample_level_metadata(obs: pd.DataFrame, sample_col: str) -> pd.DataFrame:
    records: list[dict[str, str]] = []
    for sample, frame in obs.groupby(sample_col, dropna=False, observed=False):
        row: dict[str, str] = {sample_col: str(sample), "n_cells": str(len(frame))}
        for col in obs.columns:
            if col == sample_col:
                continue
            values = sorted(stringify_series(frame[col]).unique().tolist())
            if len(values) <= 5:
                row[col] = "|".join(values)
            else:
                row[col] = f"{len(values)} unique"
        records.append(row)
    return pd.DataFrame(records)


def main() -> None:
    args = parse_args()
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    import anndata as ad

    adata = ad.read_h5ad(args.h5ad, backed="r")
    obs = adata.obs.copy()
    obs.index = obs.index.astype(str)

    obs_columns = pd.DataFrame(
        {
            "column": obs.columns.astype(str),
            "dtype": [str(obs[col].dtype) for col in obs.columns],
            "n_unique": [int(obs[col].nunique(dropna=False)) for col in obs.columns],
            "n_missing": [int(obs[col].isna().sum()) for col in obs.columns],
        }
    )
    obs_columns.to_csv(out_dir / "obs_columns.csv", index=False)

    summary = {
        "h5ad": str(Path(args.h5ad)),
        "n_obs": int(adata.n_obs),
        "n_vars": int(adata.n_vars),
        "obs_columns": list(map(str, obs.columns)),
        "obsm_keys": list(map(str, adata.obsm.keys())),
        "sample_col": args.sample_col,
        "group_col": args.group_col,
    }

    if args.group_col in obs.columns:
        group_distribution = (
            stringify_series(obs[args.group_col])
            .value_counts(dropna=False)
            .rename_axis(args.group_col)
            .reset_index(name="n_cells")
        )
        group_distribution.to_csv(out_dir / "group_distribution.csv", index=False)
        summary["group_levels"] = group_distribution[args.group_col].tolist()
    else:
        summary["group_levels"] = []

    if args.sample_col in obs.columns and args.group_col in obs.columns:
        sample_group_counts = (
            obs.assign(
                **{
                    args.sample_col: stringify_series(obs[args.sample_col]),
                    args.group_col: stringify_series(obs[args.group_col]),
                }
            )
            .groupby([args.sample_col, args.group_col], dropna=False)
            .size()
            .reset_index(name="n_cells")
        )
        sample_group_counts.to_csv(out_dir / "sample_group_counts.csv", index=False)
        sample_meta = sample_level_metadata(obs, args.sample_col)
        sample_meta.to_csv(out_dir / "sample_level_metadata.csv", index=False)

    if args.celltype_cols:
        celltype_cols = [col.strip() for col in args.celltype_cols.split(",") if col.strip()]
    else:
        celltype_cols = infer_celltype_columns(obs.columns)

    celltype_summary = {}
    for col in celltype_cols:
        if col not in obs.columns:
            continue
        table = stringify_series(obs[col]).value_counts(dropna=False).rename_axis(col).reset_index(name="n_cells")
        table.to_csv(out_dir / f"celltype_distribution__{col}.csv", index=False)
        celltype_summary[col] = table.head(30).to_dict(orient="records")
    summary["celltype_candidate_columns"] = list(celltype_summary.keys())

    with (out_dir / "summary.json").open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2, ensure_ascii=False)

    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
