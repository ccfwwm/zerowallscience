"""Independent NumPy/FlowIO synthetic reference, never a FlowJo compatibility claim."""
import argparse
import hashlib
import importlib.metadata
import json
import platform
import time
from pathlib import Path

import numpy as np
import psutil
from flowio import FlowData


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def generate(root, count):
    root.mkdir(parents=True, exist_ok=False)
    rng = np.random.default_rng(700022)
    channels = ["FSC-A", "SSC-A", "FL1-A", "FL2-A"]
    truth = np.column_stack((rng.uniform(10, 1000, count), rng.uniform(5, 700, count), rng.normal(100, 50, count), rng.normal(65, 40, count)))
    spillover = np.array([[1., .2], [.05, 1.]])
    observed = truth.copy()
    observed[:, 2:] = truth[:, 2:] @ spillover
    observed = observed.astype("<f4")
    fields = {"$TOT": str(count), "$PAR": "4", "$MODE": "L", "$NEXTDATA": "0", "$DATATYPE": "F", "$BYTEORD": "1,2,3,4", "$SPILLOVER": "2,FL1-A,FL2-A,1,0.2,0.05,1"}
    for index, name in enumerate(channels, 1):
        fields.update({f"$P{index}N": name, f"$P{index}B": "32", f"$P{index}R": "262144", f"$P{index}E": "0,0"})
    fields.update({"$BEGINDATA": "00000000", "$ENDDATA": "00000000", "$BEGINANALYSIS": "0", "$ENDANALYSIS": "0", "$BEGINSTEXT": "0", "$ENDSTEXT": "0"})
    text = ("|" + "|".join(item for pair in fields.items() for item in pair) + "|").encode()
    begin = 58 + len(text)
    fields["$BEGINDATA"] = str(begin).zfill(8)
    fields["$ENDDATA"] = str(begin + observed.nbytes - 1).zfill(8)
    text = ("|" + "|".join(item for pair in fields.items() for item in pair) + "|").encode()
    header = bytearray(b" " * 58)
    header[:6] = b"FCS3.0"
    for offset, value in [(10, 58), (18, begin - 1), (26, begin), (34, begin + observed.nbytes - 1), (42, 0), (50, 0)]:
        header[offset:offset + 8] = str(value).rjust(8).encode()
    path = root / "million-events.fcs"
    with path.open("wb") as handle:
        handle.write(header); handle.write(text); handle.write(observed.tobytes())
    parsed = FlowData(str(path))
    independent = np.asarray(parsed.events, dtype=np.float64).reshape(count, 4)
    np.testing.assert_array_equal(independent, observed.astype(np.float64))
    # In FCS spillover convention each ROW describes the spill from one source
    # into detectors: measured row = true row @ spillover. Solve, do not invert.
    corrected = independent.copy()
    corrected[:, 2:] = np.linalg.solve(spillover.T, independent[:, 2:].T).T
    transformed = np.arcsinh(corrected / 5.)
    raw_gates = [
        {"id": "rectangle", "name": "Rectangle", "x": {"channel": "FSC-A", "min": 200, "max": 800}, "y": {"channel": "SSC-A", "min": 100, "max": 600}},
        {"id": "polygon", "name": "Triangle", "parentId": "rectangle", "x": {"channel": "FSC-A", "min": 250, "max": 750}, "y": {"channel": "SSC-A", "min": 120, "max": 580}, "polygon": [[250, 120], [750, 120], [500, 580]]},
        {"id": "child", "name": "Fluorescence child", "parentId": "polygon", "x": {"channel": "FL1-A", "min": 40, "max": 160}, "y": {"channel": "FL2-A", "min": 25, "max": 100}},
        {"id": "empty", "name": "Empty", "parentId": "child", "x": {"channel": "FL1-A", "min": 2000, "max": 3000}},
    ]
    transformed_gates = json.loads(json.dumps(raw_gates))
    for gate in transformed_gates:
        for dimension in ("x", "y"):
            if dimension in gate:
                for bound in ("min", "max"):
                    gate[dimension][bound] = float(np.arcsinh(gate[dimension][bound] / 5.))
        if "polygon" in gate:
            gate["polygon"] = np.arcsinh(np.array(gate["polygon"]) / 5.).tolist()

    def reference(events, gates):
        masks = {}; results = []
        for gate in gates:
            parent = masks[gate["parentId"]] if "parentId" in gate else np.ones(count, dtype=bool)
            mask = parent.copy()
            for dim in ("x", "y"):
                if dim in gate:
                    dimension = gate[dim]; values = events[:, channels.index(dimension["channel"])]
                    mask &= (values >= dimension["min"]) & (values <= dimension["max"])
            if "polygon" in gate:
                # All fixture polygons are counterclockwise convex triangles;
                # independent half-plane intersection instead of JS ray casting.
                points = np.array(gate["polygon"])
                x = events[:, channels.index(gate["x"]["channel"])]; y = events[:, channels.index(gate["y"]["channel"])]
                for start, end in zip(points, np.roll(points, -1, axis=0)):
                    mask &= (end[0] - start[0]) * (y - start[1]) - (end[1] - start[1]) * (x - start[0]) > 0
            masks[gate["id"]] = mask
            n = int(mask.sum()); parent_n = int(parent.sum())
            selected = events[mask]
            stats = {name: {"mean": float(selected[:, i].mean()) if n else None, "median": float(np.median(selected[:, i])) if n else None} for i, name in enumerate(channels)}
            results.append({"id": gate["id"], "count": n, "fractionOfTotal": n / count, "fractionOfParent": n / parent_n if parent_n else 0, "statistics": stats})
        return {"gates": results, "preview": [dict(zip(channels, map(float, row))) for row in events[:100]], "allStatistics": {name: {"mean": float(events[:, i].mean()), "median": float(np.median(events[:, i]))} for i, name in enumerate(channels)}}

    cases = [
        {"name": "raw", "parameters": {"transform": "none", "applyCompensation": False, "cofactor": 5, "gates": raw_gates, "previewLimit": 100}, "reference": reference(independent, raw_gates)},
        {"name": "compensated-arcsinh", "parameters": {"transform": "arcsinh", "applyCompensation": True, "cofactor": 5, "gates": transformed_gates, "previewLimit": 100}, "reference": reference(transformed, transformed_gates)},
    ]
    report = {"scope": "Synthetic numerical reference, not FlowJo/clinical compatibility", "seed": 700022, "count": count, "channels": channels, "spillover": spillover.tolist(), "file": {"path": str(path), "bytes": path.stat().st_size, "sha256": sha(path)}, "referenceRuntime": {"python": platform.python_version(), "numpy": np.__version__, "flowio": importlib.metadata.version("flowio"), "psutil": psutil.__version__}, "tolerances": {"previewAbsolute": 1e-10, "countAbsolute": 0, "fractionAbsolute": 1e-12, "meanAbsolute": 1e-8, "medianAbsolute": 1e-10}, "cases": cases}
    (root / "reference.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"reference": str(root / "reference.json"), "sha256": sha(path), "count": count}))


def monitor(pid, destination, stop):
    process = psutil.Process(pid); samples = []; peak = 0
    while not stop.exists():
        try:
            info = process.memory_info(); peak = max(peak, getattr(info, "peak_wset", info.rss)); samples.append(info.rss)
        except psutil.NoSuchProcess:
            break
        time.sleep(.02)
    destination.write_text(json.dumps({"pid": pid, "sampleIntervalMs": 20, "samples": len(samples), "sampledPeakRssBytes": max(samples, default=0), "osPeakWorkingSetBytes": peak, "includesBrowser": False}), encoding="utf-8")


parser = argparse.ArgumentParser()
parser.add_argument("mode", choices=["generate", "monitor"])
parser.add_argument("root", type=Path)
parser.add_argument("--count", type=int, default=1_000_000)
parser.add_argument("--pid", type=int)
args = parser.parse_args()
if args.mode == "generate":
    generate(args.root, args.count)
else:
    monitor(args.pid, args.root / "memory.json", args.root / "monitor.stop")
