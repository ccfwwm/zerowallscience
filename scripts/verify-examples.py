"""Verify the reproducible example projects.

For each example this script:
  1. reruns `generate_data.py` into a temp dir and asserts every generated file
     is byte-identical to the committed `data/` — that is what proves the seed,
     not the generator's docstring;
  2. runs `workflow.py` into a temp dir;
  3. compares its `results` against `baseline/results.json` within tolerance;
  4. asserts the declared artifacts exist and are non-empty;
  5. prints a PASS/FAIL table and exits non-zero if anything failed.

Numeric tolerance
-----------------
Floats are compared as  abs(a - b) <= ABS_TOL + REL_TOL * abs(b), with
ABS_TOL = 1e-9 and REL_TOL = 1e-6. Bit-exact float equality across platforms,
BLAS builds, and library versions is not a promise anyone can keep — different
LAPACK backends reorder reductions — so the baselines are held to ~6 significant
figures instead. Integers, strings, and booleans must match exactly; a changed
hit count or a changed strain name is a real regression, not float drift.

Byte-identity of `data/` IS required. Those files come from a seeded generator
writing fixed-precision text, so any difference means the seed stopped pinning
the data.

Usage:  python scripts/verify-examples.py [example ...]
"""

from __future__ import annotations

import filecmp
import json
import pathlib
import subprocess
import sys
import tempfile
import time

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
EXAMPLES_DIR = REPO_ROOT / "examples"

EXAMPLES = ["crispr-screen", "enzyme-engineering", "extremophile", "immunotherapy"]

ABS_TOL = 1e-9
REL_TOL = 1e-6
PER_EXAMPLE_TIMEOUT_S = 300


class Failure(Exception):
    """A verification step failed for one example."""


def check_coverage() -> list[str]:
    """Assert EXAMPLES covers every example that ships a `workflow.py`.

    EXAMPLES is hand-maintained, so without this check a newly added example
    would simply never be verified — and a silent skip reads exactly like a
    pass. Examples with no `workflow.py` (the agent does the analysis itself,
    as in climate-trends) have nothing deterministic to reproduce and are
    correctly absent.
    """
    if not EXAMPLES_DIR.is_dir():
        return [f"missing examples directory: {EXAMPLES_DIR}"]
    on_disk = {p.name for p in EXAMPLES_DIR.iterdir() if (p / "workflow.py").is_file()}
    listed = set(EXAMPLES)
    problems = [
        f"{name}: ships workflow.py but is not in EXAMPLES, so it is never verified"
        for name in sorted(on_disk - listed)
    ]
    problems += [
        f"{name}: listed in EXAMPLES but ships no workflow.py"
        for name in sorted(listed - on_disk)
    ]
    return problems


def run_script(script: pathlib.Path, out_dir: pathlib.Path) -> None:
    proc = subprocess.run(
        [sys.executable, str(script), str(out_dir)],
        cwd=str(script.parent),
        capture_output=True,
        text=True,
        timeout=PER_EXAMPLE_TIMEOUT_S,
    )
    if proc.returncode != 0:
        raise Failure(f"{script.name} exited {proc.returncode}: {proc.stderr.strip()[-500:]}")


def compare_trees(committed: pathlib.Path, regenerated: pathlib.Path) -> None:
    expected = sorted(p.name for p in committed.iterdir() if p.is_file())
    actual = sorted(p.name for p in regenerated.iterdir() if p.is_file())
    if expected != actual:
        raise Failure(f"data/ file list changed: committed {expected}, regenerated {actual}")
    for name in expected:
        a, b = committed / name, regenerated / name
        if not filecmp.cmp(a, b, shallow=False):
            size_a, size_b = a.stat().st_size, b.stat().st_size
            raise Failure(
                f"data/{name} is not byte-identical after regeneration "
                f"({size_a} vs {size_b} bytes) - the seed no longer pins the data"
            )


def compare_values(path: str, actual: object, expected: object) -> list[str]:
    """Recursively diff a results tree; returns human-readable mismatches."""
    problems: list[str] = []
    if isinstance(expected, dict):
        if not isinstance(actual, dict):
            return [f"{path}: expected an object, got {type(actual).__name__}"]
        for key in sorted(set(expected) | set(actual)):
            if key not in actual:
                problems.append(f"{path}.{key}: missing from results")
            elif key not in expected:
                problems.append(f"{path}.{key}: not in baseline")
            else:
                problems += compare_values(f"{path}.{key}", actual[key], expected[key])
        return problems
    if isinstance(expected, list):
        if not isinstance(actual, list):
            return [f"{path}: expected a list, got {type(actual).__name__}"]
        if len(actual) != len(expected):
            return [f"{path}: length {len(actual)} != baseline {len(expected)}"]
        for i, (a, e) in enumerate(zip(actual, expected)):
            problems += compare_values(f"{path}[{i}]", a, e)
        return problems
    if isinstance(expected, bool) or isinstance(actual, bool):
        if actual is not expected:
            problems.append(f"{path}: {actual!r} != baseline {expected!r}")
        return problems
    if isinstance(expected, int) and isinstance(actual, int):
        if actual != expected:
            problems.append(f"{path}: {actual} != baseline {expected}")
        return problems
    if isinstance(expected, (int, float)) and isinstance(actual, (int, float)):
        if abs(actual - expected) > ABS_TOL + REL_TOL * abs(expected):
            problems.append(f"{path}: {actual} != baseline {expected} (outside tolerance)")
        return problems
    if actual != expected:
        problems.append(f"{path}: {actual!r} != baseline {expected!r}")
    return problems


def verify(name: str) -> tuple[float, str]:
    """Run every check for one example. Returns (duration, detail) or raises."""
    example_dir = EXAMPLES_DIR / name
    if not example_dir.is_dir():
        raise Failure("example directory missing")
    for required in ("README.md", "workflow.py", "generate_data.py", "baseline/results.json"):
        if not (example_dir / required).exists():
            raise Failure(f"missing {required}")

    baseline = json.loads((example_dir / "baseline" / "results.json").read_text(encoding="utf-8"))
    started = time.perf_counter()

    with tempfile.TemporaryDirectory(prefix=f"zerowall-verify-{name}-") as tmp:
        tmp_path = pathlib.Path(tmp)

        # 1. Data regeneration must be byte-identical.
        gen_dir = tmp_path / "regen"
        gen_dir.mkdir()
        run_script(example_dir / "generate_data.py", gen_dir)
        if not (gen_dir / "data").is_dir():
            raise Failure("generate_data.py produced no data/ directory")
        compare_trees(example_dir / "data", gen_dir / "data")

        # 2. Run the workflow somewhere disposable.
        run_dir = tmp_path / "run"
        run_dir.mkdir()
        run_script(example_dir / "workflow.py", run_dir)

        results_path = run_dir / "results" / "results.json"
        if not results_path.exists():
            raise Failure("workflow.py wrote no results/results.json")
        produced = json.loads(results_path.read_text(encoding="utf-8"))

        # 3. Golden-number comparison.
        problems = compare_values("results", produced.get("results"), baseline.get("results"))
        for field in ("example", "seed", "data_is_simulated"):
            if produced.get(field) != baseline.get(field):
                problems.append(f"{field}: {produced.get(field)!r} != baseline {baseline.get(field)!r}")
        metrics = produced.get("metrics") or {}
        if metrics.get("cost_usd") != 0.0:
            problems.append(f"metrics.cost_usd: expected 0.0, got {metrics.get('cost_usd')!r}")
        if not metrics.get("cost_note"):
            problems.append("metrics.cost_note: missing")
        if not isinstance(metrics.get("duration_seconds"), (int, float)):
            problems.append("metrics.duration_seconds: missing or not a number")

        # 4. Completion check: declared artifacts exist and are non-empty.
        artifacts = baseline.get("artifacts") or []
        if not artifacts:
            problems.append("baseline declares no artifacts")
        for rel in artifacts:
            target = run_dir / rel
            if not target.exists():
                problems.append(f"artifact missing: {rel}")
            elif target.stat().st_size == 0:
                problems.append(f"artifact empty: {rel}")

        if problems:
            raise Failure("; ".join(problems[:8]) + (" ..." if len(problems) > 8 else ""))

        duration = time.perf_counter() - started
        baseline_duration = (baseline.get("metrics") or {}).get("duration_seconds")
        detail = (
            f"workflow {metrics['duration_seconds']:.3f}s "
            f"(baseline {baseline_duration}s), cost ${metrics['cost_usd']:.2f}"
        )
        return duration, detail


def main(argv: list[str]) -> int:
    selected = argv or EXAMPLES
    unknown = [n for n in selected if n not in EXAMPLES]
    if unknown:
        print(f"unknown example(s): {', '.join(unknown)}", file=sys.stderr)
        print(f"known: {', '.join(EXAMPLES)}", file=sys.stderr)
        return 2

    gaps = check_coverage()
    if gaps:
        print("example coverage is out of sync with examples/:", file=sys.stderr)
        for gap in gaps:
            print(f"  {gap}", file=sys.stderr)
        return 2

    print(f"Verifying {len(selected)} example(s) with tolerance abs={ABS_TOL} rel={REL_TOL}\n")
    rows: list[tuple[str, str, float, str]] = []
    failures = 0
    overall = time.perf_counter()

    for name in selected:
        try:
            duration, detail = verify(name)
            rows.append((name, "PASS", duration, detail))
        except Failure as exc:
            failures += 1
            rows.append((name, "FAIL", 0.0, str(exc)))
        except subprocess.TimeoutExpired:
            failures += 1
            rows.append((name, "FAIL", 0.0, f"timed out after {PER_EXAMPLE_TIMEOUT_S}s"))

    width = max(len(r[0]) for r in rows)
    print(f"{'example'.ljust(width)}  status  verify(s)  detail")
    print(f"{'-' * width}  ------  ---------  ------")
    for name, status, duration, detail in rows:
        print(f"{name.ljust(width)}  {status:<6}  {duration:>9.2f}  {detail}")

    total = time.perf_counter() - overall
    print(f"\n{len(rows) - failures}/{len(rows)} passed in {total:.2f}s wall clock")
    if failures:
        print(f"{failures} example(s) FAILED", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
