"""Score a completed workspace against a Biomni-style task rubric.

A task states a research goal in natural language; the rubric states what
evidence must exist for that goal to count as achieved. This script grades the
evidence, not the prose.

Grading contract (the part that matters)
---------------------------------------
Every criterion in a rubric is always in the denominator. There is no "skip"
status and no way to shrink the denominator:

  * a missing, empty, or unparseable artifact scores 0 for its criterion;
  * a criterion that cannot be evaluated at all -- bad JSON, unreadable file,
    a missing pointer, an unexpected exception -- scores 0, never a pass;
  * an unknown criterion kind scores 0 (a typo in a rubric must not become
    free credit);
  * numeric claims in the report are checked against the value the run itself
    produced, so a label with a made-up number next to it fails.

An empty workspace therefore scores 0/N for every task by construction, and
`--self-test` asserts exactly that on synthetic fixtures.

Determinism
-----------
No wall-clock values, no RNG, sorted iteration wherever output is produced.
Re-running on the same workspace prints the same bytes.

Usage
-----
  python evaluate.py --list
  python evaluate.py --task <task-id> --workspace <dir> [--workspace <dir> ...]
  python evaluate.py --suite <root>          # scores <root>/<task-id> for every task
  python evaluate.py --self-test

Options:
  --json <file>       write the full machine-readable report
  --markdown <file>   write the comparison report as Markdown
  --min-score <frac>  exit 1 if any submission scores below this fraction

Exit codes: 0 success, 1 a submission fell below --min-score (or a self-test
expectation broke), 2 a usage error.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import pathlib
import re
import struct
import sys
import tempfile
import zlib

TASKS_DIR = pathlib.Path(__file__).resolve().parent / "tasks"

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

# Matches 12, -0.5, 1,240, 3.8e-07. Thousands separators are consumed as part of
# the number so "1,240" reads as 1240 rather than as 12 followed by 40.
NUMBER_RE = re.compile(r"[-+]?\d+(?:,\d{3})*(?:\.\d+)?(?:[eE][-+]?\d+)?")

KINDS = (
    "artifact",
    "json_value",
    "json_number",
    "report_number",
    "evidence_link",
    "report_contains",
)

# Criteria that tie a claim to a file that was actually produced. The derived
# evidence-coverage statistic is computed over these kinds only.
EVIDENCE_KINDS = ("report_number", "evidence_link")


class UsageError(Exception):
    """Bad command line or unloadable task file."""


# --------------------------------------------------------------------------
# task loading
# --------------------------------------------------------------------------


def load_task(path: pathlib.Path) -> dict:
    """Load and structurally validate one task file."""
    try:
        task = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise UsageError(f"{path.name}: cannot be read as JSON ({exc})") from exc
    for field in ("id", "prompt", "example", "rubric"):
        if field not in task:
            raise UsageError(f"{path.name}: missing required field '{field}'")
    if task["id"] != path.stem:
        raise UsageError(f"{path.name}: id {task['id']!r} does not match the file name")
    if not isinstance(task.get("data_is_simulated"), bool):
        raise UsageError(f"{path.name}: 'data_is_simulated' must be true or false")
    criteria = task["rubric"].get("criteria")
    if not isinstance(criteria, list) or not criteria:
        raise UsageError(f"{path.name}: rubric.criteria must be a non-empty list")
    seen: set[str] = set()
    for index, criterion in enumerate(criteria):
        cid = criterion.get("id")
        if not cid:
            raise UsageError(f"{path.name}: criterion {index} has no id")
        if cid in seen:
            raise UsageError(f"{path.name}: duplicate criterion id {cid!r}")
        seen.add(cid)
        if criterion.get("kind") not in KINDS:
            raise UsageError(
                f"{path.name}: criterion {cid!r} has unknown kind {criterion.get('kind')!r}"
            )
    return task


def load_all_tasks(tasks_dir: pathlib.Path = TASKS_DIR) -> list[dict]:
    if not tasks_dir.is_dir():
        raise UsageError(f"no tasks directory at {tasks_dir}")
    paths = sorted(tasks_dir.glob("*.json"), key=lambda p: p.name)
    if not paths:
        raise UsageError(f"no task files in {tasks_dir}")
    return [load_task(p) for p in paths]


def find_task(task_id: str, tasks_dir: pathlib.Path = TASKS_DIR) -> dict:
    path = tasks_dir / f"{task_id}.json"
    if not path.is_file():
        known = ", ".join(t["id"] for t in load_all_tasks(tasks_dir))
        raise UsageError(f"unknown task {task_id!r}; known tasks: {known}")
    return load_task(path)


# --------------------------------------------------------------------------
# workspace access
# --------------------------------------------------------------------------


class Workspace:
    """Reads a submitted workspace. Every accessor returns (value, error).

    An error string is never None when the value is None, so a caller cannot
    mistake "could not read" for "read an empty thing".
    """

    def __init__(self, root: pathlib.Path) -> None:
        self.root = root
        self._text: dict[str, tuple[str | None, str | None]] = {}
        self._json: dict[str, tuple[object | None, str | None]] = {}
        self._csv: dict[str, tuple[dict | None, str | None]] = {}

    def resolve(self, rel: str) -> pathlib.Path:
        return self.root / rel

    def stat_file(self, rel: str) -> tuple[int | None, str | None]:
        target = self.resolve(rel)
        if not target.exists():
            return None, f"{rel}: missing"
        if not target.is_file():
            return None, f"{rel}: not a regular file"
        try:
            size = target.stat().st_size
        except OSError as exc:
            return None, f"{rel}: cannot stat ({exc})"
        return size, None

    def text(self, rel: str) -> tuple[str | None, str | None]:
        if rel not in self._text:
            size, error = self.stat_file(rel)
            if error is not None:
                self._text[rel] = (None, error)
            elif size == 0:
                self._text[rel] = (None, f"{rel}: empty file")
            else:
                try:
                    self._text[rel] = (self.resolve(rel).read_text(encoding="utf-8"), None)
                except (OSError, UnicodeDecodeError) as exc:
                    self._text[rel] = (None, f"{rel}: cannot read as UTF-8 text ({exc})")
        return self._text[rel]

    def json(self, rel: str) -> tuple[object | None, str | None]:
        if rel not in self._json:
            raw, error = self.text(rel)
            if error is not None:
                self._json[rel] = (None, error)
            else:
                try:
                    self._json[rel] = (json.loads(raw), None)
                except ValueError as exc:
                    self._json[rel] = (None, f"{rel}: invalid JSON ({exc})")
        return self._json[rel]

    def csv_table(self, rel: str) -> tuple[dict | None, str | None]:
        """Parse a CSV into {'columns': [...], 'rows': [dict, ...]}."""
        if rel not in self._csv:
            raw, error = self.text(rel)
            if error is not None:
                self._csv[rel] = (None, error)
            else:
                try:
                    reader = csv.DictReader(io.StringIO(raw))
                    rows = list(reader)
                    columns = list(reader.fieldnames or [])
                except (csv.Error, ValueError) as exc:
                    self._csv[rel] = (None, f"{rel}: invalid CSV ({exc})")
                else:
                    if not columns:
                        self._csv[rel] = (None, f"{rel}: CSV has no header row")
                    else:
                        self._csv[rel] = ({"columns": columns, "rows": rows}, None)
        return self._csv[rel]

    def png(self, rel: str) -> tuple[int | None, str | None]:
        """Check the PNG signature and terminator; return the byte size."""
        size, error = self.stat_file(rel)
        if error is not None:
            return None, error
        try:
            blob = self.resolve(rel).read_bytes()
        except OSError as exc:
            return None, f"{rel}: cannot read ({exc})"
        if not blob.startswith(PNG_SIGNATURE):
            return None, f"{rel}: not a PNG (bad signature)"
        if b"IEND" not in blob:
            return None, f"{rel}: truncated PNG (no IEND chunk)"
        return size, None


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


POINTER_STEP_RE = re.compile(r"([^.\[\]]+)|\[(\d+)\]")


def resolve_pointer(obj: object, pointer: str) -> tuple[object | None, str | None]:
    """Resolve a dotted pointer such as `results.top[0].gene`."""
    if not pointer:
        return None, "empty pointer"
    current = obj
    walked = ""
    for match in POINTER_STEP_RE.finditer(pointer):
        key, index = match.group(1), match.group(2)
        if key is not None:
            walked = f"{walked}.{key}" if walked else key
            if not isinstance(current, dict):
                return None, f"{walked}: parent is {type(current).__name__}, not an object"
            if key not in current:
                return None, f"{walked}: not present"
            current = current[key]
        else:
            walked = f"{walked}[{index}]"
            if not isinstance(current, list):
                return None, f"{walked}: parent is {type(current).__name__}, not a list"
            position = int(index)
            if position >= len(current):
                return None, f"{walked}: index out of range (length {len(current)})"
            current = current[position]
    return current, None


def as_number(value: object) -> tuple[float | None, str | None]:
    """Accept ints and floats only. Booleans are not numbers here."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None, f"expected a number, got {type(value).__name__} ({value!r})"
    number = float(value)
    if number != number or number in (float("inf"), float("-inf")):
        return None, f"value is not finite ({value!r})"
    return number, None


def close_enough(actual: float, expected: float, abs_tol: float, rel_tol: float) -> bool:
    """Same shape as scripts/verify-examples.py: abs + relative allowance."""
    return abs(actual - expected) <= abs_tol + rel_tol * abs(expected)


def format_number(value: float) -> str:
    text = f"{value:.6g}"
    return text


def numbers_on_matching_lines(report: str, label: str) -> tuple[list[float], int]:
    """Numbers that appear on a line containing `label` (case-insensitive).

    Returns (numbers, matching_line_count). Keeping the label and its value on
    one line is what makes a claim checkable, so the rubric requires it and the
    task prompt says so.
    """
    needle = label.lower()
    found: list[float] = []
    matching = 0
    for line in report.splitlines():
        if needle not in line.lower():
            continue
        matching += 1
        for match in NUMBER_RE.finditer(line):
            try:
                found.append(float(match.group(0).replace(",", "")))
            except ValueError:  # pragma: no cover - regex already constrains this
                continue
    return found, matching


# --------------------------------------------------------------------------
# criterion evaluation
# --------------------------------------------------------------------------


def _check_artifact(criterion: dict, workspace: Workspace) -> tuple[bool, str]:
    rel = criterion["path"]
    parse = criterion.get("parse", "text")
    min_bytes = int(criterion.get("min_bytes", 1))

    if parse == "png":
        size, error = workspace.png(rel)
        if error is not None:
            return False, error
        if size < min_bytes:
            return False, f"{rel}: {size} bytes, below the {min_bytes}-byte minimum"
        return True, f"{rel}: valid PNG, {size} bytes"

    size, error = workspace.stat_file(rel)
    if error is not None:
        return False, error
    if size < min_bytes:
        return False, f"{rel}: {size} bytes, below the {min_bytes}-byte minimum"

    if parse == "json":
        payload, error = workspace.json(rel)
        if error is not None:
            return False, error
        if criterion.get("require_object", True) and not isinstance(payload, dict):
            return False, f"{rel}: top level is {type(payload).__name__}, expected an object"
        return True, f"{rel}: parses as JSON, {size} bytes"

    if parse == "csv":
        table, error = workspace.csv_table(rel)
        if error is not None:
            return False, error
        required = list(criterion.get("required_columns", []))
        missing = [c for c in required if c not in table["columns"]]
        if missing:
            return False, f"{rel}: missing column(s) {', '.join(sorted(missing))}"
        min_rows = int(criterion.get("min_rows", 1))
        if len(table["rows"]) < min_rows:
            return False, f"{rel}: {len(table['rows'])} data rows, need at least {min_rows}"
        return True, f"{rel}: {len(table['rows'])} rows, {len(table['columns'])} columns"

    if parse == "text":
        _, error = workspace.text(rel)
        if error is not None:
            return False, error
        return True, f"{rel}: readable text, {size} bytes"

    return False, f"{rel}: unsupported parse mode {parse!r}"


def _check_json_value(criterion: dict, workspace: Workspace) -> tuple[bool, str]:
    rel, pointer = criterion["path"], criterion["pointer"]
    payload, error = workspace.json(rel)
    if error is not None:
        return False, error
    value, error = resolve_pointer(payload, pointer)
    if error is not None:
        return False, f"{rel}: {error}"
    expected = criterion["expected"]
    if isinstance(expected, bool) or isinstance(value, bool):
        if value is not expected:
            return False, f"{rel}:{pointer} is {value!r}, expected {expected!r}"
    elif value != expected:
        return False, f"{rel}:{pointer} is {value!r}, expected {expected!r}"
    return True, f"{rel}:{pointer} == {expected!r}"


def _check_json_number(criterion: dict, workspace: Workspace) -> tuple[bool, str]:
    rel, pointer = criterion["path"], criterion["pointer"]
    payload, error = workspace.json(rel)
    if error is not None:
        return False, error
    raw, error = resolve_pointer(payload, pointer)
    if error is not None:
        return False, f"{rel}: {error}"
    actual, error = as_number(raw)
    if error is not None:
        return False, f"{rel}:{pointer}: {error}"
    expected, error = as_number(criterion["expected"])
    if error is not None:
        return False, f"rubric expected value for {criterion['id']}: {error}"
    abs_tol = float(criterion.get("tolerance", 0.0))
    rel_tol = float(criterion.get("relative_tolerance", 0.0))
    if not close_enough(actual, expected, abs_tol, rel_tol):
        return False, (
            f"{rel}:{pointer} is {format_number(actual)}, outside "
            f"{format_number(expected)} +/- (abs {abs_tol}, rel {rel_tol})"
        )
    return True, f"{rel}:{pointer} = {format_number(actual)} matches {format_number(expected)}"


def _check_report_number(criterion: dict, workspace: Workspace) -> tuple[bool, str]:
    """Three checks in one, all of which must hold.

    1. the report has a line carrying `label`;
    2. a number on that line matches the value the run actually produced at
       `path:pointer` -- the label alone is never enough;
    3. that produced value is itself within tolerance of the known truth, when
       the rubric states one.
    """
    report_rel = criterion.get("report", "report.md")
    rel, pointer = criterion["path"], criterion["pointer"]
    label = criterion["label"]

    report, error = workspace.text(report_rel)
    if error is not None:
        return False, error

    payload, error = workspace.json(rel)
    if error is not None:
        return False, f"cannot corroborate {label!r}: {error}"
    raw, error = resolve_pointer(payload, pointer)
    if error is not None:
        return False, f"cannot corroborate {label!r}: {rel}: {error}"
    produced, error = as_number(raw)
    if error is not None:
        return False, f"cannot corroborate {label!r}: {rel}:{pointer}: {error}"

    if "expected" in criterion:
        truth, error = as_number(criterion["expected"])
        if error is not None:
            return False, f"rubric expected value for {criterion['id']}: {error}"
        truth_abs = float(criterion.get("truth_tolerance", 0.0))
        truth_rel = float(criterion.get("truth_relative_tolerance", 0.0))
        if not close_enough(produced, truth, truth_abs, truth_rel):
            return False, (
                f"{rel}:{pointer} = {format_number(produced)} is outside the accepted range "
                f"for {label!r} ({format_number(truth)} +/- abs {truth_abs}, rel {truth_rel}), "
                f"so the reported number cannot be credited"
            )

    numbers, matching_lines = numbers_on_matching_lines(report, label)
    if matching_lines == 0:
        return False, f"{report_rel}: no line mentions {label!r}"
    if not numbers:
        return False, f"{report_rel}: {label!r} appears but no number is on that line"

    abs_tol = float(criterion.get("tolerance", 0.0))
    rel_tol = float(criterion.get("relative_tolerance", 0.0))
    if not any(close_enough(n, produced, abs_tol, rel_tol) for n in numbers):
        shown = ", ".join(format_number(n) for n in numbers[:6])
        return False, (
            f"{report_rel}: {label!r} is stated as [{shown}] but {rel}:{pointer} "
            f"is {format_number(produced)}"
        )
    return True, (
        f"{report_rel}: {label!r} matches {rel}:{pointer} = {format_number(produced)}"
    )


def _check_evidence_link(criterion: dict, workspace: Workspace) -> tuple[bool, str]:
    """The report must cite each artifact, and each cited artifact must exist."""
    report_rel = criterion.get("report", "report.md")
    report, error = workspace.text(report_rel)
    if error is not None:
        return False, error
    problems: list[str] = []
    cited = 0
    for rel in sorted(criterion["mentions"]):
        variants = {rel, rel.replace("/", "\\"), pathlib.PurePosixPath(rel).name}
        if not any(v in report for v in variants):
            problems.append(f"{rel}: not referenced by {report_rel}")
            continue
        size, file_error = workspace.stat_file(rel)
        if file_error is not None:
            problems.append(f"{rel}: referenced but {file_error.split(': ', 1)[-1]}")
        elif size == 0:
            problems.append(f"{rel}: referenced but empty")
        else:
            cited += 1
    if problems:
        return False, "; ".join(problems)
    return True, f"{report_rel} links {cited} artifact(s) that exist and are non-empty"


def _check_report_contains(criterion: dict, workspace: Workspace) -> tuple[bool, str]:
    """A provenance statement must be present.

    Used only for data-provenance wording ("this data is simulated", the
    dataset citation). Numeric claims never go through this check.
    """
    report_rel = criterion.get("report", "report.md")
    report, error = workspace.text(report_rel)
    if error is not None:
        return False, error
    haystack = report.lower()
    phrases = [str(p) for p in criterion["any_of"]]
    hit = next((p for p in phrases if p.lower() in haystack), None)
    if hit is None:
        return False, f"{report_rel}: none of {phrases} appears"
    forbidden = [str(p) for p in criterion.get("none_of", [])]
    banned = sorted(p for p in forbidden if p.lower() in haystack)
    if banned:
        return False, f"{report_rel}: contains disallowed wording {banned}"
    return True, f"{report_rel}: states {hit!r}"


CHECKS = {
    "artifact": _check_artifact,
    "json_value": _check_json_value,
    "json_number": _check_json_number,
    "report_number": _check_report_number,
    "evidence_link": _check_evidence_link,
    "report_contains": _check_report_contains,
}


def evaluate_criterion(criterion: dict, workspace: Workspace) -> dict:
    """Score one criterion. Any failure to evaluate is a failure to pass."""
    kind = criterion.get("kind")
    check = CHECKS.get(kind)
    if check is None:
        passed, detail = False, f"unknown criterion kind {kind!r}"
    else:
        try:
            passed, detail = check(criterion, workspace)
        except Exception as exc:  # noqa: BLE001 - an unevaluable criterion fails
            passed = False
            detail = f"could not be evaluated: {type(exc).__name__}: {exc}"
    return {
        "id": criterion.get("id", "<unnamed>"),
        "kind": kind,
        "description": criterion.get("description", ""),
        "passed": bool(passed),
        "detail": detail,
    }


def evaluate_task(task: dict, workspace_dir: pathlib.Path) -> dict:
    """Score a whole task. The denominator is always len(rubric.criteria)."""
    workspace = Workspace(pathlib.Path(workspace_dir))
    criteria = task["rubric"]["criteria"]
    outcomes = [evaluate_criterion(c, workspace) for c in criteria]

    total = len(criteria)
    passed = sum(1 for o in outcomes if o["passed"])

    by_kind: dict[str, dict[str, int]] = {}
    for outcome in outcomes:
        bucket = by_kind.setdefault(str(outcome["kind"]), {"passed": 0, "total": 0})
        bucket["total"] += 1
        bucket["passed"] += 1 if outcome["passed"] else 0

    evidence_total = sum(1 for o in outcomes if o["kind"] in EVIDENCE_KINDS)
    evidence_passed = sum(
        1 for o in outcomes if o["kind"] in EVIDENCE_KINDS and o["passed"]
    )
    integrity_total = sum(1 for o in outcomes if o["kind"] == "artifact")
    integrity_passed = sum(1 for o in outcomes if o["kind"] == "artifact" and o["passed"])

    return {
        "task": task["id"],
        "example": task["example"],
        "data_is_simulated": task["data_is_simulated"],
        "workspace": str(pathlib.Path(workspace_dir)),
        "workspace_exists": pathlib.Path(workspace_dir).is_dir(),
        "passed": passed,
        "total": total,
        "score": round(passed / total, 6) if total else 0.0,
        "artifact_integrity": {"passed": integrity_passed, "total": integrity_total},
        "evidence_coverage": {"passed": evidence_passed, "total": evidence_total},
        "criteria": outcomes,
        "by_kind": {k: by_kind[k] for k in sorted(by_kind)},
    }


# --------------------------------------------------------------------------
# reporting
# --------------------------------------------------------------------------


def render_detail(report: dict) -> str:
    lines = [
        f"task      {report['task']}",
        f"example   {report['example']}"
        + ("  (SIMULATED data)" if report["data_is_simulated"] else "  (real data)"),
        f"workspace {report['workspace']}"
        + ("" if report["workspace_exists"] else "  [directory does not exist]"),
        "",
    ]
    width = max((len(c["id"]) for c in report["criteria"]), default=8)
    lines.append(f"{'criterion'.ljust(width)}  result  kind             detail")
    lines.append(f"{'-' * width}  ------  ---------------  ------")
    for outcome in report["criteria"]:
        mark = "PASS" if outcome["passed"] else "FAIL"
        lines.append(
            f"{outcome['id'].ljust(width)}  {mark:<6}  {str(outcome['kind']):<15}  "
            f"{outcome['detail']}"
        )
    integrity = report["artifact_integrity"]
    evidence = report["evidence_coverage"]
    lines += [
        "",
        f"score {report['passed']}/{report['total']} "
        f"({report['score'] * 100:.1f}%)  "
        f"artifact integrity {integrity['passed']}/{integrity['total']}  "
        f"evidence coverage {evidence['passed']}/{evidence['total']}",
    ]
    return "\n".join(lines)


def render_comparison(reports: list[dict], key: str) -> str:
    """A comparison table across submissions (key='workspace') or tasks."""
    header_label = {"workspace": "submission", "task": "task"}[key]
    rows = []
    for report in reports:
        name = report[key]
        if key == "workspace":
            name = pathlib.Path(name).name or name
        rows.append(
            (
                name,
                f"{report['passed']}/{report['total']}",
                f"{report['score'] * 100:.1f}%",
                f"{report['artifact_integrity']['passed']}/{report['artifact_integrity']['total']}",
                f"{report['evidence_coverage']['passed']}/{report['evidence_coverage']['total']}",
                ", ".join(c["id"] for c in report["criteria"] if not c["passed"]) or "-",
            )
        )
    headers = (header_label, "score", "pct", "artifacts", "evidence", "failed criteria")
    widths = [
        max(len(headers[i]), max((len(r[i]) for r in rows), default=0)) for i in range(6)
    ]
    out = ["  ".join(headers[i].ljust(widths[i]) for i in range(6)).rstrip()]
    out.append("  ".join("-" * widths[i] for i in range(6)))
    for row in rows:
        out.append("  ".join(row[i].ljust(widths[i]) for i in range(6)).rstrip())
    total_passed = sum(r["passed"] for r in reports)
    total_criteria = sum(r["total"] for r in reports)
    pct = (total_passed / total_criteria * 100) if total_criteria else 0.0
    out.append("")
    out.append(f"overall {total_passed}/{total_criteria} criteria passed ({pct:.1f}%)")
    return "\n".join(out)


def render_comparison_markdown(reports: list[dict], key: str) -> str:
    header_label = {"workspace": "Submission", "task": "Task"}[key]
    lines = [
        "# Biomni-style benchmark comparison",
        "",
        f"| {header_label} | Score | Pct | Artifact integrity | Evidence coverage | Failed criteria |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for report in reports:
        name = report[key]
        if key == "workspace":
            name = pathlib.Path(name).name or name
        failed = ", ".join(c["id"] for c in report["criteria"] if not c["passed"]) or "-"
        lines.append(
            f"| {name} | {report['passed']}/{report['total']} | "
            f"{report['score'] * 100:.1f}% | "
            f"{report['artifact_integrity']['passed']}/{report['artifact_integrity']['total']} | "
            f"{report['evidence_coverage']['passed']}/{report['evidence_coverage']['total']} | "
            f"{failed} |"
        )
    total_passed = sum(r["passed"] for r in reports)
    total_criteria = sum(r["total"] for r in reports)
    pct = (total_passed / total_criteria * 100) if total_criteria else 0.0
    lines += ["", f"Overall: {total_passed}/{total_criteria} criteria passed ({pct:.1f}%)."]
    return "\n".join(lines) + "\n"


def write_text(path: pathlib.Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)


# --------------------------------------------------------------------------
# self-test
# --------------------------------------------------------------------------


def _tiny_png() -> bytes:
    """A valid 1x1 greyscale PNG, built deterministically without matplotlib."""

    def chunk(tag: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + tag
            + payload
            + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 0, 0, 0, 0)
    idat = zlib.compress(b"\x00\x00", 9)
    return PNG_SIGNATURE + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


SYNTHETIC_TASK = {
    "id": "synthetic-selftest",
    "example": "synthetic",
    "data_is_simulated": True,
    "prompt": "Synthetic task used only by --self-test.",
    "rubric": {
        "criteria": [
            {
                "id": "results-json",
                "kind": "artifact",
                "description": "results/results.json exists and parses",
                "path": "results/results.json",
                "parse": "json",
            },
            {
                "id": "table-csv",
                "kind": "artifact",
                "description": "results/table.csv has the required columns",
                "path": "results/table.csv",
                "parse": "csv",
                "required_columns": ["name", "value"],
                "min_rows": 2,
            },
            {
                "id": "figure-png",
                "kind": "artifact",
                "description": "figures/plot.png is a real PNG",
                "path": "figures/plot.png",
                "parse": "png",
            },
            {
                "id": "simulated-flag",
                "kind": "json_value",
                "description": "the run records that the data is simulated",
                "path": "results/results.json",
                "pointer": "data_is_simulated",
                "expected": True,
            },
            {
                "id": "count-value",
                "kind": "json_number",
                "description": "n_items matches the known truth exactly",
                "path": "results/results.json",
                "pointer": "results.n_items",
                "expected": 42,
                "tolerance": 0,
            },
            {
                "id": "nested-value",
                "kind": "json_number",
                "description": "a nested list pointer resolves",
                "path": "results/results.json",
                "pointer": "results.top[0].score",
                "expected": 0.5,
                "tolerance": 0.01,
            },
            {
                "id": "reported-count",
                "kind": "report_number",
                "description": "the report states the item count the run produced",
                "report": "report.md",
                "label": "items",
                "path": "results/results.json",
                "pointer": "results.n_items",
                "expected": 42,
                "truth_tolerance": 0,
                "tolerance": 0.5,
            },
            {
                "id": "reported-threshold",
                "kind": "report_number",
                "description": "the report states the threshold the run used",
                "report": "report.md",
                "label": "threshold",
                "path": "results/results.json",
                "pointer": "threshold",
                "expected": 0.05,
                "truth_tolerance": 0,
                "tolerance": 0.0001,
            },
            {
                "id": "evidence-links",
                "kind": "evidence_link",
                "description": "the report cites the artifacts it draws on",
                "report": "report.md",
                "mentions": ["results/table.csv", "figures/plot.png"],
            },
            {
                "id": "simulated-disclosure",
                "kind": "report_contains",
                "description": "the report says the data is simulated",
                "report": "report.md",
                "any_of": ["simulated"],
            },
        ]
    },
}


def _write_synthetic_workspace(root: pathlib.Path) -> None:
    """A workspace that satisfies every criterion of SYNTHETIC_TASK."""
    (root / "results").mkdir(parents=True, exist_ok=True)
    (root / "figures").mkdir(parents=True, exist_ok=True)
    payload = {
        "example": "synthetic",
        "data_is_simulated": True,
        "threshold": 0.05,
        "results": {"n_items": 42, "top": [{"name": "a", "score": 0.5}]},
    }
    write_text(root / "results" / "results.json", json.dumps(payload, indent=2) + "\n")
    write_text(root / "results" / "table.csv", "name,value\na,0.5\nb,0.25\n")
    with open(root / "figures" / "plot.png", "wb") as handle:
        handle.write(_tiny_png())
    write_text(
        root / "report.md",
        "# Synthetic report\n\n"
        "The data is simulated, not experimental.\n\n"
        "- items analyzed: 42\n"
        "- significance threshold: 0.05\n"
        "- top score: 0.5\n\n"
        "Evidence: results/table.csv and figures/plot.png.\n",
    )


class _SelfTest:
    """Collects expectations so every failure is reported, not just the first."""

    def __init__(self) -> None:
        self.failures: list[str] = []
        self.checks = 0

    def expect(self, condition: bool, message: str) -> None:
        self.checks += 1
        if not condition:
            self.failures.append(message)

    def report(self, name: str, condition: bool, message: str) -> None:
        self.expect(condition, message)
        print(f"  {'ok  ' if condition else 'FAIL'}  {name}" + ("" if condition else f" -- {message}"))


def _mutate_json(path: pathlib.Path, pointer: str, value: object) -> None:
    payload = json.loads(path.read_text(encoding="utf-8"))
    steps = [m.group(1) or m.group(2) for m in POINTER_STEP_RE.finditer(pointer)]
    cursor = payload
    for step in steps[:-1]:
        cursor = cursor[int(step)] if step.isdigit() else cursor[step]
    last = steps[-1]
    if last.isdigit():
        cursor[int(last)] = value
    else:
        cursor[last] = value
    write_text(path, json.dumps(payload, indent=2) + "\n")


def _selftest_mechanics(check: _SelfTest, tmp: pathlib.Path) -> None:
    task = SYNTHETIC_TASK
    total = len(task["rubric"]["criteria"])
    print("mechanics (synthetic task, synthetic workspaces)")

    empty = tmp / "empty"
    empty.mkdir()
    result = evaluate_task(task, empty)
    check.report(
        "empty workspace scores 0",
        result["passed"] == 0 and result["score"] == 0.0,
        f"expected 0/{total}, got {result['passed']}/{result['total']}",
    )
    check.report(
        "empty workspace keeps the full denominator",
        result["total"] == total,
        f"denominator shrank to {result['total']}, expected {total}",
    )

    missing = tmp / "does-not-exist-at-all"
    result = evaluate_task(task, missing)
    check.report(
        "absent workspace directory scores 0",
        result["passed"] == 0 and result["total"] == total,
        f"expected 0/{total}, got {result['passed']}/{result['total']}",
    )

    complete = tmp / "complete"
    complete.mkdir()
    _write_synthetic_workspace(complete)
    full = evaluate_task(task, complete)
    check.report(
        "complete workspace scores full marks",
        full["passed"] == total,
        "failed: "
        + "; ".join(f"{c['id']}: {c['detail']}" for c in full["criteria"] if not c["passed"]),
    )

    deleted = tmp / "deleted-artifact"
    deleted.mkdir()
    _write_synthetic_workspace(deleted)
    (deleted / "results" / "table.csv").unlink()
    result = evaluate_task(task, deleted)
    check.report(
        "deleting a required artifact scores strictly less",
        result["passed"] < total and result["total"] == total,
        f"expected fewer than {total} passes with an intact denominator, "
        f"got {result['passed']}/{result['total']}",
    )
    csv_outcome = next(c for c in result["criteria"] if c["id"] == "table-csv")
    link_outcome = next(c for c in result["criteria"] if c["id"] == "evidence-links")
    check.report(
        "the deleted artifact's own criterion fails",
        not csv_outcome["passed"] and not link_outcome["passed"],
        f"table-csv passed={csv_outcome['passed']}, evidence-links passed={link_outcome['passed']}",
    )

    emptied = tmp / "empty-artifact"
    emptied.mkdir()
    _write_synthetic_workspace(emptied)
    write_text(emptied / "results" / "table.csv", "")
    result = evaluate_task(task, emptied)
    check.report(
        "a zero-byte artifact scores strictly less",
        result["passed"] < total,
        f"expected fewer than {total} passes, got {result['passed']}",
    )

    altered = tmp / "altered-number"
    altered.mkdir()
    _write_synthetic_workspace(altered)
    _mutate_json(altered / "results" / "results.json", "results.n_items", 999)
    result = evaluate_task(task, altered)
    altered_ids = {c["id"] for c in result["criteria"] if not c["passed"]}
    check.report(
        "altering a checked number scores strictly less",
        result["passed"] < total and "count-value" in altered_ids,
        f"expected count-value to fail, failures were {sorted(altered_ids)}",
    )

    fabricated = tmp / "fabricated-number"
    fabricated.mkdir()
    _write_synthetic_workspace(fabricated)
    write_text(
        fabricated / "report.md",
        "# Synthetic report\n\nThe data is simulated, not experimental.\n\n"
        "- items analyzed: 1000\n"
        "- significance threshold: 0.05\n\n"
        "Evidence: results/table.csv and figures/plot.png.\n",
    )
    result = evaluate_task(task, fabricated)
    reported = next(c for c in result["criteria"] if c["id"] == "reported-count")
    check.report(
        "a report number that contradicts the run fails",
        not reported["passed"] and result["passed"] < total,
        f"reported-count passed={reported['passed']} ({reported['detail']})",
    )

    label_only = tmp / "label-without-number"
    label_only.mkdir()
    _write_synthetic_workspace(label_only)
    write_text(
        label_only / "report.md",
        "# Synthetic report\n\nThe data is simulated.\n\n"
        "- items analyzed: 42\n"
        "- we controlled the false discovery rate at the usual threshold\n\n"
        "Evidence: results/table.csv and figures/plot.png.\n",
    )
    result = evaluate_task(task, label_only)
    threshold = next(c for c in result["criteria"] if c["id"] == "reported-threshold")
    check.report(
        "a keyword with no number fails",
        not threshold["passed"],
        f"reported-threshold passed on keyword presence alone ({threshold['detail']})",
    )

    corrupt = tmp / "corrupt-json"
    corrupt.mkdir()
    _write_synthetic_workspace(corrupt)
    write_text(corrupt / "results" / "results.json", "{ this is not json")
    result = evaluate_task(task, corrupt)
    json_dependent = {
        "results-json",
        "simulated-flag",
        "count-value",
        "nested-value",
        "reported-count",
        "reported-threshold",
    }
    failed = {c["id"] for c in result["criteria"] if not c["passed"]}
    check.report(
        "unparseable JSON fails every criterion that depends on it",
        json_dependent <= failed and result["total"] == total,
        f"expected {sorted(json_dependent)} to fail, failures were {sorted(failed)}",
    )

    pointer_gone = tmp / "missing-pointer"
    pointer_gone.mkdir()
    _write_synthetic_workspace(pointer_gone)
    payload = json.loads((pointer_gone / "results" / "results.json").read_text(encoding="utf-8"))
    del payload["results"]["n_items"]
    write_text(
        pointer_gone / "results" / "results.json", json.dumps(payload, indent=2) + "\n"
    )
    result = evaluate_task(task, pointer_gone)
    failed = {c["id"] for c in result["criteria"] if not c["passed"]}
    check.report(
        "a missing JSON pointer fails rather than passes",
        {"count-value", "reported-count"} <= failed,
        f"failures were {sorted(failed)}",
    )

    wrong_type = tmp / "wrong-type"
    wrong_type.mkdir()
    _write_synthetic_workspace(wrong_type)
    _mutate_json(wrong_type / "results" / "results.json", "results.n_items", "forty-two")
    result = evaluate_task(task, wrong_type)
    failed = {c["id"] for c in result["criteria"] if not c["passed"]}
    check.report(
        "a non-numeric value where a number is required fails",
        {"count-value", "reported-count"} <= failed,
        f"failures were {sorted(failed)}",
    )

    fake_png = tmp / "fake-png"
    fake_png.mkdir()
    _write_synthetic_workspace(fake_png)
    write_text(fake_png / "figures" / "plot.png", "this is not a png\n")
    result = evaluate_task(task, fake_png)
    figure = next(c for c in result["criteria"] if c["id"] == "figure-png")
    check.report(
        "a non-PNG file named .png fails",
        not figure["passed"],
        f"figure-png passed={figure['passed']} ({figure['detail']})",
    )

    short_csv = tmp / "short-csv"
    short_csv.mkdir()
    _write_synthetic_workspace(short_csv)
    write_text(short_csv / "results" / "table.csv", "name,value\na,0.5\n")
    result = evaluate_task(task, short_csv)
    table = next(c for c in result["criteria"] if c["id"] == "table-csv")
    check.report(
        "a CSV with too few rows fails",
        not table["passed"],
        f"table-csv passed={table['passed']} ({table['detail']})",
    )

    unknown_kind = tmp / "unknown-kind"
    unknown_kind.mkdir()
    _write_synthetic_workspace(unknown_kind)
    broken_task = json.loads(json.dumps(task))
    broken_task["rubric"]["criteria"].append(
        {"id": "bogus", "kind": "vibes", "description": "not a real kind"}
    )
    result = evaluate_task(broken_task, unknown_kind)
    bogus = next(c for c in result["criteria"] if c["id"] == "bogus")
    check.report(
        "an unknown criterion kind fails and stays in the denominator",
        not bogus["passed"] and result["total"] == total + 1,
        f"bogus passed={bogus['passed']}, denominator {result['total']}",
    )

    malformed = tmp / "malformed-criterion"
    malformed.mkdir()
    _write_synthetic_workspace(malformed)
    broken_task = json.loads(json.dumps(task))
    broken_task["rubric"]["criteria"].append(
        {"id": "no-path", "kind": "artifact", "description": "path key omitted on purpose"}
    )
    result = evaluate_task(broken_task, malformed)
    no_path = next(c for c in result["criteria"] if c["id"] == "no-path")
    check.report(
        "a criterion that raises is a failure, not a pass",
        not no_path["passed"] and "could not be evaluated" in no_path["detail"],
        f"no-path passed={no_path['passed']} ({no_path['detail']})",
    )

    determinism_a = render_detail(evaluate_task(task, complete))
    determinism_b = render_detail(evaluate_task(task, complete))
    check.report(
        "scoring the same workspace twice prints identical output",
        determinism_a == determinism_b,
        "two runs of the same workspace produced different text",
    )


def _least_squares_slope(xs: list[float], ys: list[float]) -> float:
    n = len(xs)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    den = sum((x - mean_x) ** 2 for x in xs)
    return num / den


def _gistemp_annual(repo_root: pathlib.Path) -> list[tuple[int, float]]:
    """Read the committed GISTEMP annual (J-D) series with the stdlib only."""
    path = repo_root / "examples" / "climate-trends" / "data" / "gistemp_global_means.csv"
    raw = path.read_text(encoding="utf-8").splitlines()
    reader = csv.DictReader(raw[1:])  # line 1 is a title, the header is line 2
    series: list[tuple[int, float]] = []
    for row in reader:
        year, value = row.get("Year"), row.get("J-D")
        if not year or not value or "*" in value:
            continue
        series.append((int(year), float(value)))
    return sorted(series)


def _fixture_from_baseline(
    task: dict, repo_root: pathlib.Path, root: pathlib.Path
) -> str | None:
    """Build a full-marks workspace for a real task from an independent source.

    For the four simulated examples the source is the example's committed
    `baseline/results.json` -- not the rubric -- so a wrong expected value in a
    task file shows up here as a failing fixture. For climate-trends the source
    is the committed GISTEMP CSV, recomputed here with the standard library.

    Returns None on success or a reason string when the source is unavailable.
    """
    example = task["example"]
    results_dir = root / "results"
    figures_dir = root / "figures"
    results_dir.mkdir(parents=True, exist_ok=True)
    figures_dir.mkdir(parents=True, exist_ok=True)

    csv_bodies = {
        "crispr-screen": (
            "results/gene_scores.csv",
            "gene,gene_lfc,p_value,fdr,true_class,true_log2_fold_change,call",
            lambda i: f"SIMG{i:04d},-0.5,0.001,0.01,neutral,0.0,none",
            300,
        ),
        "enzyme-engineering": (
            "results/designs.csv",
            "variant,predicted_log2_activity,true_log2_activity",
            lambda i: f"A{i}B+C{i}D,1.5,1.4",
            70,
        ),
        "immunotherapy": (
            "results/response_model.csv",
            "term,coefficient,odds_ratio,true_value",
            lambda i: f"term_{i},0.1,1.1,0.1",
            7,
        ),
    }

    if example == "climate-trends":
        try:
            series = _gistemp_annual(repo_root)
        except (OSError, ValueError) as exc:
            return f"cannot read the GISTEMP data ({exc})"
        if not series:
            return "the GISTEMP series parsed to zero rows"
        years = [float(y) for y, _ in series]
        values = [v for _, v in series]
        full_slope = _least_squares_slope(years, values) * 10.0
        recent = [(y, v) for y, v in series if y >= 1975]
        recent_slope = (
                _least_squares_slope([float(y) for y, _ in recent], [v for _, v in recent]) * 10.0
            )

        def decade_mean(start: int) -> float:
            window = [v for y, v in series if start <= y <= start + 9]
            return sum(window) / len(window)

        payload = {
            "example": "climate-trends",
            "data_is_simulated": False,
            "source": "NASA GISTEMP v4 Land-Ocean Temperature Index, global means",
            "results": {
                "n_years": len(series),
                "first_year": series[0][0],
                "last_year": series[-1][0],
                "warming_rate_c_per_decade_full_record": round(full_slope, 6),
                "warming_rate_c_per_decade_since_1975": round(recent_slope, 6),
                "decade_means_c": {
                    "1880s": round(decade_mean(1880), 6),
                    "1990s": round(decade_mean(1990), 6),
                    "2010s": round(decade_mean(2010), 6),
                },
            },
        }
        write_text(results_dir / "climate_trends.json", json.dumps(payload, indent=2) + "\n")
        rows = ["year,anomaly_c"] + [f"{y},{v}" for y, v in series]
        write_text(results_dir / "annual_means.csv", "\n".join(rows) + "\n")
        with open(figures_dir / "temperature_trend.png", "wb") as handle:
            handle.write(_tiny_png())
        r = payload["results"]
        write_text(
            root / "report.md",
            "# Global surface temperature trend\n\n"
            "Data: NASA GISTEMP v4 Land-Ocean Temperature Index (real observational "
            "data, public domain), anomalies in degrees C against the 1951-1980 mean.\n\n"
            f"- record length: {r['n_years']} annual means\n"
            f"- warming rate over the full record: "
            f"{r['warming_rate_c_per_decade_full_record']:.4f} C per decade\n"
            f"- warming rate since 1975: "
            f"{r['warming_rate_c_per_decade_since_1975']:.4f} C per decade\n"
            f"- 1880s decade mean: {r['decade_means_c']['1880s']:.4f} C\n"
            f"- 2010s decade mean: {r['decade_means_c']['2010s']:.4f} C\n\n"
            "Evidence: results/climate_trends.json, results/annual_means.csv, "
            "figures/temperature_trend.png.\n",
        )
        return None

    baseline_path = repo_root / "examples" / example / "baseline" / "results.json"
    try:
        baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return f"cannot read {baseline_path.name} for {example} ({exc})"

    write_text(results_dir / "results.json", json.dumps(baseline, indent=2) + "\n")

    if example == "extremophile":
        write_text(
            results_dir / "growth_rate_fits.csv",
            "strain,temperature_c,replicate,capacity_od,mu_max_per_h,od0,fit_r2\n"
            + "".join(f"ZW-THERM-01,{60 + i % 5},1,0.5,0.5,0.02,0.99\n" for i in range(54)),
        )
        write_text(
            results_dir / "mu_by_temperature.csv",
            "strain,temperature_c,mu_max_mean,mu_max_sd,n_replicates\n"
            + "".join(f"ZW-THERM-01,{50 + i},0.5,0.01,3\n" for i in range(18)),
        )
    elif example in csv_bodies:
        rel, header, make_row, count = csv_bodies[example]
        write_text(
            results_dir / pathlib.PurePosixPath(rel).name,
            header + "\n" + "".join(make_row(i) + "\n" for i in range(count)),
        )

    figure_names = {
        "crispr-screen": "volcano.png",
        "enzyme-engineering": "model_and_designs.png",
        "extremophile": "growth_and_cardinal.png",
        "immunotherapy": "response_and_survival.png",
    }
    with open(figures_dir / figure_names[example], "wb") as handle:
        handle.write(_tiny_png())

    # The report states every number the rubric asks about, read out of the
    # baseline payload rather than out of the rubric.
    lines = [
        f"# {example} report",
        "",
        "The data in this analysis is SIMULATED, produced by a seeded generator. "
        "It is not experimental data and it is not evidence about any real system.",
        "",
    ]
    for criterion in task["rubric"]["criteria"]:
        if criterion["kind"] != "report_number":
            continue
        value, error = resolve_pointer(baseline, criterion["pointer"])
        if error is not None:
            return f"{example}: rubric pointer {criterion['pointer']} is absent from the baseline"
        number, error = as_number(value)
        if error is not None:
            return f"{example}: baseline {criterion['pointer']}: {error}"
        lines.append(f"- {criterion['label']}: {number:.6g}")
    lines.append("")
    # Satisfy each provenance statement using a phrase the rubric itself accepts,
    # one per line so no digit lands on a numeric claim's line.
    for criterion in task["rubric"]["criteria"]:
        if criterion["kind"] != "report_contains":
            continue
        phrases = [str(p) for p in criterion["any_of"]]
        if not phrases:
            return f"{example}: criterion {criterion['id']} lists no accepted phrase"
        lines.append(f"Provenance: {phrases[0]}.")
    lines.append("")
    mentioned = sorted(
        {
            rel
            for criterion in task["rubric"]["criteria"]
            if criterion["kind"] == "evidence_link"
            for rel in criterion["mentions"]
        }
    )
    lines.append("Evidence: " + ", ".join(mentioned) + ".")
    lines.append("")
    write_text(root / "report.md", "\n".join(lines))
    return None


def _selftest_real_tasks(check: _SelfTest, tmp: pathlib.Path) -> None:
    """Every shipped task: empty scores 0, a baseline-built fixture scores full."""
    repo_root = pathlib.Path(__file__).resolve().parents[2]
    try:
        tasks = load_all_tasks()
    except UsageError as exc:
        check.report("task files load", False, str(exc))
        return
    check.report("task files load and validate", True, "")

    print("shipped tasks")
    for task in tasks:
        total = len(task["rubric"]["criteria"])
        empty = tmp / f"{task['id']}-empty"
        empty.mkdir()
        result = evaluate_task(task, empty)
        check.report(
            f"{task['id']}: empty workspace scores 0/{total}",
            result["passed"] == 0 and result["total"] == total,
            f"got {result['passed']}/{result['total']}",
        )

        fixture = tmp / f"{task['id']}-full"
        fixture.mkdir()
        reason = _fixture_from_baseline(task, repo_root, fixture)
        if reason is not None:
            check.report(f"{task['id']}: fixture could be built", False, reason)
            continue
        full = evaluate_task(task, fixture)
        check.report(
            f"{task['id']}: reference-output fixture scores {total}/{total}",
            full["passed"] == total,
            "failed: "
            + "; ".join(
                f"{c['id']}: {c['detail']}" for c in full["criteria"] if not c["passed"]
            ),
        )

        # Deleting the first required artifact must cost marks.
        artifact = next(
            (c for c in task["rubric"]["criteria"] if c["kind"] == "artifact"), None
        )
        if artifact is not None:
            damaged = tmp / f"{task['id']}-deleted"
            damaged.mkdir()
            if _fixture_from_baseline(task, repo_root, damaged) is None:
                target = damaged / artifact["path"]
                if target.exists():
                    target.unlink()
                result = evaluate_task(task, damaged)
                check.report(
                    f"{task['id']}: deleting {artifact['path']} scores below full",
                    result["passed"] < total and result["total"] == total,
                    f"got {result['passed']}/{result['total']}",
                )

        # Perturbing a checked number must cost marks.
        numeric = next(
            (c for c in task["rubric"]["criteria"] if c["kind"] == "json_number"), None
        )
        if numeric is not None:
            tampered = tmp / f"{task['id']}-tampered"
            tampered.mkdir()
            if _fixture_from_baseline(task, repo_root, tampered) is None:
                original, _ = resolve_pointer(
                    json.loads((tampered / numeric["path"]).read_text(encoding="utf-8")),
                    numeric["pointer"],
                )
                bogus = float(original) * 3.0 + 17.0 if isinstance(original, (int, float)) else 0
                _mutate_json(tampered / numeric["path"], numeric["pointer"], bogus)
                result = evaluate_task(task, tampered)
                failed = {c["id"] for c in result["criteria"] if not c["passed"]}
                check.report(
                    f"{task['id']}: altering {numeric['pointer']} scores below full",
                    result["passed"] < total and numeric["id"] in failed,
                    f"got {result['passed']}/{total}, failures {sorted(failed)}",
                )


def self_test() -> int:
    check = _SelfTest()
    with tempfile.TemporaryDirectory(prefix="biomni-selftest-") as tmp_name:
        tmp = pathlib.Path(tmp_name)
        _selftest_mechanics(check, tmp)
        print()
        _selftest_real_tasks(check, tmp)
        fixtures_root = str(tmp)
    print()
    print(f"fixtures were created under {fixtures_root} and removed on exit")
    if check.failures:
        print(f"\nSELF-TEST FAILED: {len(check.failures)} of {check.checks} expectations broke")
        for failure in check.failures:
            print(f"  - {failure}", file=sys.stderr)
        return 1
    print(f"\nself-test passed: {check.checks} expectations held")
    return 0


# --------------------------------------------------------------------------
# command line
# --------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Score a workspace against a Biomni-style task rubric."
    )
    parser.add_argument("--task", help="task id (see --list)")
    parser.add_argument(
        "--workspace",
        action="append",
        default=[],
        metavar="DIR",
        help="a submitted workspace; repeat to compare submissions",
    )
    parser.add_argument(
        "--suite",
        metavar="ROOT",
        help="score every task, taking each workspace from ROOT/<task-id>",
    )
    parser.add_argument("--list", action="store_true", help="list the tasks and exit")
    parser.add_argument("--self-test", action="store_true", help="run the scorer's own tests")
    parser.add_argument("--json", metavar="FILE", help="write the full report as JSON")
    parser.add_argument("--markdown", metavar="FILE", help="write the comparison as Markdown")
    parser.add_argument(
        "--min-score",
        type=float,
        metavar="FRAC",
        help="exit 1 if any submission scores below this fraction (0-1)",
    )
    return parser


def main(argv: list[str]) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.self_test:
        return self_test()

    try:
        if args.list:
            tasks = load_all_tasks()
            print(f"{len(tasks)} task(s) in {TASKS_DIR}\n")
            for task in tasks:
                kind = "SIMULATED data" if task["data_is_simulated"] else "real data"
                print(
                    f"{task['id']}\n"
                    f"  example   {task['example']} ({kind})\n"
                    f"  criteria  {len(task['rubric']['criteria'])}\n"
                    f"  title     {task.get('title', '')}"
                )
            return 0

        if args.suite:
            if args.task or args.workspace:
                raise UsageError("--suite cannot be combined with --task or --workspace")
            root = pathlib.Path(args.suite)
            reports = [
                evaluate_task(task, root / task["id"]) for task in load_all_tasks()
            ]
            comparison_key = "task"
        else:
            if not args.task or not args.workspace:
                raise UsageError("give --task and at least one --workspace, or use --suite")
            task = find_task(args.task)
            reports = [evaluate_task(task, pathlib.Path(w)) for w in args.workspace]
            comparison_key = "workspace"
    except UsageError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    for report in reports:
        print(render_detail(report))
        print()

    if len(reports) > 1:
        print(render_comparison(reports, comparison_key))

    if args.json:
        payload = {
            "tasks_dir": str(TASKS_DIR),
            "comparison_key": comparison_key,
            "submissions": reports,
            "totals": {
                "passed": sum(r["passed"] for r in reports),
                "total": sum(r["total"] for r in reports),
            },
        }
        write_text(pathlib.Path(args.json), json.dumps(payload, indent=2, sort_keys=True) + "\n")
        print(f"wrote {args.json}")

    if args.markdown:
        write_text(
            pathlib.Path(args.markdown), render_comparison_markdown(reports, comparison_key)
        )
        print(f"wrote {args.markdown}")

    if args.min_score is not None:
        below = [r for r in reports if r["score"] < args.min_score]
        if below:
            names = ", ".join(f"{r['task']}@{pathlib.Path(r['workspace']).name}" for r in below)
            print(
                f"\n{len(below)} submission(s) below --min-score {args.min_score}: {names}",
                file=sys.stderr,
            )
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
