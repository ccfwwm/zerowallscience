#!/usr/bin/env python3
"""Validate a raw single-cell count matrix before scTenifoldKnk."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


def read_matrix(path: Path) -> tuple[list[str], list[list[float]]]:
    delimiter = "\t" if path.suffix.lower() in {".tsv", ".txt"} else ","
    with path.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.reader(handle, delimiter=delimiter))
    if len(rows) < 2 or len(rows[0]) < 2:
        raise ValueError("matrix must have a header and at least one gene and cell")
    genes = [row[0].strip() for row in rows[1:]]
    if any(not gene for gene in genes):
        raise ValueError("matrix contains an empty gene identifier")
    if len(set(genes)) != len(genes):
        raise ValueError("gene identifiers must be unique")
    values: list[list[float]] = []
    width = len(rows[0]) - 1
    for row in rows[1:]:
        if len(row) != width + 1:
            raise ValueError("matrix rows have inconsistent cell counts")
        parsed = [float(value) for value in row[1:]]
        if any(value < 0 or int(value) != value for value in parsed):
            raise ValueError("matrix must contain non-negative integer-like raw counts")
        values.append(parsed)
    return genes, values


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--matrix", required=True, type=Path)
    parser.add_argument("--target", action="append", required=True)
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--sample-column", default="sample")
    parser.add_argument("--condition-column", default="condition")
    parser.add_argument("--cell-type-column", default="cell_type")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    genes, values = read_matrix(args.matrix)
    missing = sorted(set(args.target) - set(genes))
    if missing:
        raise ValueError(f"target genes not found: {', '.join(missing)}")
    cells = len(values[0])
    metadata = {"present": False}
    if args.metadata:
        with args.metadata.open(newline="", encoding="utf-8-sig") as handle:
            rows = list(csv.DictReader(handle, delimiter="\t" if args.metadata.suffix.lower() in {".tsv", ".txt"} else ","))
        if len(rows) != cells:
            raise ValueError(f"metadata rows ({len(rows)}) must equal matrix cells ({cells})")
        metadata = {
            "present": True,
            "rows": len(rows),
            "columns": list(rows[0]) if rows else [],
            "missing_columns": [column for column in (args.sample_column, args.condition_column, args.cell_type_column) if rows and column not in rows[0]],
            "sample_count": len({row.get(args.sample_column, "") for row in rows if row.get(args.sample_column, "")}),
        }
    result = {
        "ok": True,
        "genes": len(genes),
        "cells": cells,
        "targets": args.target,
        "missing_targets": missing,
        "metadata": metadata,
        "raw_counts_required": True,
        "warnings": [] if metadata.get("present") and not metadata.get("missing_columns") else ["metadata sample/condition/cell_type fields are incomplete; report as exploratory"],
    }
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        raise SystemExit(2)
