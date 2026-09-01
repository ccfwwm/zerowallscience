#!/usr/bin/env python3
"""Summarize per-sample QC metadata.tsv files."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd


CORE_COLS = ["n_genes", "n_UMIs", "mito_frac", "pct_counts_rb", "hbb_score", "is_HQ", "predicted_doublet"]


def load_metadata(path: Path) -> pd.DataFrame:
    if path.suffix == ".gz":
        df = pd.read_csv(path, sep="\t", index_col=0)
    else:
        df = pd.read_csv(path, sep="\t", index_col=0)
    return df


def summarize_sample(df: pd.DataFrame, sample_id: str) -> dict:
    out = {"sample_id": sample_id, "n_cells": int(df.shape[0])}
    for col in CORE_COLS:
        if col in df.columns:
            if df[col].dtype == bool or col in {"is_HQ", "predicted_doublet"}:
                out[f"n_{col}"] = int(df[col].sum())
            else:
                out[f"median_{col}"] = float(np.median(df[col]))
                out[f"p95_{col}"] = float(np.percentile(df[col], 95))
    return out


def find_metadata_files(root: Path) -> list[Path]:
    files = list(root.rglob("metadata.tsv")) + list(root.rglob("metadata.tsv.gz"))
    # prefer deepest sample-level paths
    return sorted(set(files))


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Summarize QC metadata.tsv files")
    p.add_argument("--input-dir", required=True, type=Path, help="Root with per-sample metadata")
    p.add_argument("--output", type=Path, default=None, help="QC_summary.tsv path")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    files = find_metadata_files(args.input_dir)
    if not files:
        raise SystemExit(f"No metadata.tsv found under {args.input_dir}")

    rows = []
    for f in files:
        df = load_metadata(f)
        sample_id = df["sample_id"].iloc[0] if "sample_id" in df.columns else f.parent.name
        rows.append(summarize_sample(df, str(sample_id)))

    summary = pd.DataFrame(rows).sort_values("sample_id")
    out = args.output or (args.input_dir / "QC_summary.tsv")
    summary.to_csv(out, sep="\t", index=False)
    print(summary.to_string(index=False))
    print(f"\nWrote {out}")


if __name__ == "__main__":
    main()
