"""Independent FlowJo/FCS compatibility fixture using FlowKit.

This script is deliberately outside the product runtime. It provides a pinned
reference for the later Host implementation and does not upload data or run a
scientific analysis.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path

import flowio
import flowkit
from flowkit._models.dimension import Dimension
from flowkit._models.gates import RectangleGate
from flowkit._models.gating_strategy import GatingStrategy
from flowkit._utils.wsp_utils import export_flowjo_wsp, parse_wsp


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def create_fcs(path: Path, seed: int) -> None:
    # Flat event data is required by flowio.create_fcs (not a 2-D NumPy array).
    events = []
    for index in range(8):
        events.extend((seed + index, seed + 2 * index, seed + 3 * index))
    with path.open("wb") as handle:
        flowio.create_fcs(handle, events, ["FSC-A", "SSC-A", "CD3"])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    fcs_paths = [args.output / "sample-1.fcs", args.output / "sample-2.fcs"]
    for index, path in enumerate(fcs_paths, start=1):
        create_fcs(path, index)

    samples = [
        flowkit.Sample(str(path), sample_id=path.stem, use_flowjo_labels=True)
        for path in fcs_paths
    ]
    strategy = GatingStrategy()
    strategy.add_gate(
        RectangleGate(
            "Cells",
            [
                Dimension("FSC-A", range_min=0, range_max=20),
                Dimension("SSC-A", range_min=0, range_max=20),
            ],
        ),
        ("root",),
    )
    workspace = args.output / "fixture.wsp"
    with workspace.open("wb") as handle:
        export_flowjo_wsp(strategy, "All Samples", samples, handle)

    parsed = parse_wsp(str(workspace))
    sample_rows = []
    for sample_id, sample_data in parsed["samples"].items():
        sample_strategy = sample_data["gating_strategy"]
        sample_rows.append(
            {
                "sampleId": sample_id,
                "sampleUri": sample_data["sample_uri"],
                "channels": [row["pnn"] for row in flowkit.Sample(
                    str(args.output / f"{sample_id}.fcs"), use_flowjo_labels=True
                ).channels.to_dict("records")],
                "hasCompensation": sample_data["compensation"] is not None,
                "transformCount": len(sample_data["transforms"]),
                "gatePaths": [list(path) for _, path in sample_strategy.get_gate_ids()],
            }
        )

    result = {
        "reference": {
            "flowkit": importlib.metadata.version("flowkit"),
            "flowio": importlib.metadata.version("flowio"),
            "python": ".".join(map(str, __import__("sys").version_info[:3])),
        },
        "workspace": {
            "path": workspace.name,
            "sha256": sha256(workspace),
            "groups": parsed["groups"],
            "samples": sample_rows,
        },
        "artifacts": [{"path": path.name, "sha256": sha256(path)} for path in [*fcs_paths, workspace]],
        "synthetic": True,
    }
    (args.output / "reference.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
