#!/usr/bin/env python3
"""Create a deterministic, human-reviewable knockout run plan."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True, type=Path)
    parser.add_argument("--input", required=True)
    parser.add_argument("--targets", nargs="+", required=True)
    parser.add_argument("--cell-type", default="all")
    parser.add_argument("--seeds", nargs="+", type=int, default=[123, 456])
    parser.add_argument("--n-net", type=int, default=10)
    parser.add_argument("--n-cells", type=int, default=500)
    parser.add_argument("--fdr", type=float, default=0.05)
    parser.add_argument("--execution", choices=["r-mcp", "local-r", "remote-run", "auto"], default="r-mcp")
    args = parser.parse_args()
    if args.n_net < 1 or args.n_cells < 10 or not 0 < args.fdr < 1:
        raise ValueError("n-net, n-cells, and fdr are out of range")
    project = args.project.resolve()
    plan = {
        "schema": 1,
        "method": "scTenifoldKnk",
        "input": args.input,
        "targets": args.targets,
        "cell_type": args.cell_type,
        "seeds": args.seeds,
        "parameters": {"nc_nNet": args.n_net, "nc_nCells": args.n_cells, "fdr": args.fdr},
        "execution": args.execution,
        "status": "requires_human_review",
        "computational_only": True,
        "created_by": "sc-tenifold-knockout/create_plan.py",
    }
    encoded = json.dumps(plan, sort_keys=True).encode("utf-8")
    plan["plan_sha256"] = hashlib.sha256(encoded).hexdigest()
    project.mkdir(parents=True, exist_ok=True)
    (project / "plan.json").write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(plan, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        raise SystemExit(2)
