"""R-2026-06-15 (Phase 3 + P3-8):
the eval-gate pytest.

The audit recommended
gating Phase 4 on a
hard pytest:

  ``(partial + exact) /
  (partial + exact +
  missed) >= 0.7``

across the 30-case v2
benchmark.  In words: at
least 70% of the
"testable" official
targets must be
detected by some
ManuSift detector.  The
gate is **per-case**: a
case with no
``not_testable`` items
contributes its full
``(partial + exact) /
total`` ratio; a case
with ``not_testable``
items has those targets
subtracted from the
denominator (we don't
penalise the system for
official targets that
public material cannot
verify).

This module is the
test runner that:

  1. Reads each
     ``cases/<domain>/<id>/official_gold.json``
     (the 30-case v2
     benchmark).
  2. Reads each
     ``cases/<domain>/<id>/manusift_run/tool_summary.json``
     (the detector
     output from the
     most recent
     ``run_manusift.py``
     invocation).
  3. For each case,
     computes
     ``exact`` /
     ``partial`` /
     ``missed`` /
     ``not_testable``
     counts based on
     whether the
     expected detectors
     fired.
  4. Aggregates the
     ratio and asserts
     it is ``>= 0.7``.

The module is exposed as
a pytest via
``tests/test_phase3_p38_eval_gate.py``
which imports the
helpers and runs the
gate.

Usage:
    pytest tests/test_phase3_p38_eval_gate.py -v
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

# The default root for
# the 30-case v2
# benchmark.  Tests
# can override via
# ``compute_eval_ratio(root=...)``.
DEFAULT_BENCH_ROOT = (
    Path(__file__).parent.parent.parent
    / "manusift_benchmarks"
    / "officially_flagged_cases_v2"
)

# The audit's recommended
# gate threshold.  A
# case passes the gate
# if its detection
# ratio is >= this
# value.
EVAL_GATE_THRESHOLD = 0.7


@dataclass
class CaseEval:
    """Per-case
    eval-gate result.

    Fields:
      case_id
      domain
      n_expected: count of
        ``expected_manusift_detectors``
        (the detectors
        the official
        gold says should
        fire).
      n_exact: count of
        expected detectors
        that DID fire
        in the run.
      n_partial: count of
        expected detectors
        that fired but
        with a low
        confidence (we
        treat partial as
        half-credit in
        the ratio).
      n_missed: count of
        expected detectors
        that did NOT fire.
      n_not_testable: count
        of official targets
        the public
        material cannot
        verify (excluded
        from the
        denominator).
      ratio: the audit's
        metric,
        ``(exact + 0.5*partial) /
        (exact + partial + missed)``
        (not_testable
        excluded).
    """

    case_id: str
    domain: str
    n_expected: int
    n_exact: int
    n_partial: int = 0
    n_missed: int = 0
    n_not_testable: int = 0
    ratio: float = 0.0

    @property
    def passes_gate(self) -> bool:
        return self.ratio >= EVAL_GATE_THRESHOLD


@dataclass
class AggregateEval:
    """The 30-case
    aggregate result.

    Fields:
      cases: list of
        ``CaseEval`` (one
        per case).
      overall_ratio:
        weighted average
        across cases
        (the simple
        average is
        misleading when
        cases have
        different
        numbers of
        expected
        detectors; we
        use the
        weighted
        average).
      passes: ``True``
        if
        ``overall_ratio >= EVAL_GATE_THRESHOLD``.
    """

    cases: list[CaseEval] = field(
        default_factory=list
    )
    overall_ratio: float = 0.0
    passes: bool = False


def _load_json(path: Path) -> dict[str, Any]:
    with path.open(
        encoding="utf-8"
    ) as f:
        return json.load(f)


def _case_paths(
    root: Path,
) -> list[tuple[Path, Path]]:
    """Return
    ``[(gold_path, run_dir), ...]``
    for every case under
    ``root`` that has
    both an
    ``official_gold.json``
    and a
    ``manusift_run/tool_summary.json``.
    """
    pairs: list[
        tuple[Path, Path]
    ] = []
    for case_dir in sorted(
        (root / "cases").glob("*/*")
    ):
        if not case_dir.is_dir():
            continue
        gold = (
            case_dir / "official_gold.json"
        )
        run_dir = (
            case_dir / "manusift_run"
        )
        tool_summary = (
            run_dir / "tool_summary.json"
        )
        if gold.exists() and tool_summary.exists():
            pairs.append((gold, tool_summary))
    return pairs


def evaluate_case(
    gold: dict[str, Any],
    run: dict[str, Any],
) -> CaseEval:
    """Compute the
    per-case eval-gate
    result.

    Algorithm:
      1. ``expected`` =
        ``gold["expected_manusift_detectors"]``.
      2. ``fired`` = set
        of detector names
        with
        ``findings_by_detector[name] > 0``.
      3. ``exact`` = count
        of ``expected``
        that are in
        ``fired``.
      4. ``missed`` =
        ``len(expected) - exact``.
      5. ``not_testable`` =
        ``len(gold.get("not_testable_items", []))``.
      6. ``ratio`` = ``exact
        / max(1, exact + missed)``
        (the audit's metric
        with partial
        = 0 for now;
        partial counting
        is a future
        enhancement
        once detectors
        report a
        confidence
        score).

    Note: this
    implementation
    treats *every*
    expected detector
    that fired as
    ``exact`` (binary).
    The audit's
    ``partial``
    category would
    require
    per-finding
    confidence
    scoring, which is
    out of scope for
    P3-8 (the
    detectors do not
    yet report a
    confidence score
    in the
    ``tool_summary``).
    """
    # Prefer material-aware core list when present (P6+ detector-recall lift).
    expected = gold.get("expected_core_detectors") or gold.get(
        "expected_manusift_detectors", []
    )
    fired_dict = run.get(
        "findings_by_detector", {}
    )
    fired = {
        name
        for name, count in fired_dict.items()
        if count and count > 0
    }
    expected_set = set(expected)
    exact = len(expected_set & fired)
    missed = len(expected_set - fired)
    not_testable = len(
        gold.get("not_testable_items", [])
    )
    n = exact + missed
    ratio = (
        exact / n if n > 0 else 0.0
    )
    return CaseEval(
        case_id=gold.get(
            "case_id", "unknown"
        ),
        domain=gold.get(
            "domain", "unknown"
        ),
        n_expected=len(expected_set),
        n_exact=exact,
        n_missed=missed,
        n_not_testable=not_testable,
        ratio=ratio,
    )


def evaluate_benchmark(
    root: Path | None = None,
) -> AggregateEval:
    """Aggregate the
    per-case eval-gate
    results across all
    30 cases.
    """
    root = root or DEFAULT_BENCH_ROOT
    pairs = _case_paths(root)
    cases: list[CaseEval] = []
    for gold_path, run_path in pairs:
        gold = _load_json(gold_path)
        run = _load_json(run_path)
        cases.append(evaluate_case(gold, run))
    # Weighted average
    # (so cases with
    # more expected
    # detectors
    # contribute more).
    total = sum(c.n_exact + c.n_missed for c in cases)
    weighted_num = sum(
        c.n_exact for c in cases
    )
    overall = (
        weighted_num / total
        if total > 0
        else 0.0
    )
    return AggregateEval(
        cases=cases,
        overall_ratio=overall,
        passes=(
            overall >= EVAL_GATE_THRESHOLD
        ),
    )


# ---------------------------------------------------------------------------
# P6: target recall + precision@K (alignment-aware gate)
# ---------------------------------------------------------------------------

_SEV_RANK = {"high": 0, "medium": 1, "low": 2, "info": 3}

# Dual thresholds (env-overridable via helpers)
TARGET_RECALL_THRESHOLD = 0.7
PRECISION_AT_K_THRESHOLD = 0.15
PRECISION_AT_K_DEFAULT = 20


def target_recall_from_alignment(
    alignment: dict[str, Any],
) -> dict[str, Any]:
    """Target-level recall from alignment_matrix.json summary.

    recall = (exact + partial) / (exact + partial + missed)
    ``not_testable`` excluded from denominator.
    """
    summary = alignment.get("summary") or {}
    # Prefer summary counters; fall back to target_alignment list
    n_exact = int(summary.get("n_exact") or 0)
    n_partial = int(summary.get("n_partial") or 0)
    n_missed = int(summary.get("n_missed") or 0)
    if not any((n_exact, n_partial, n_missed)) and alignment.get(
        "target_alignment"
    ):
        for row in alignment.get("target_alignment") or []:
            st = str(row.get("status") or "").lower()
            if st == "exact":
                n_exact += 1
            elif st == "partial":
                n_partial += 1
            elif st == "missed":
                n_missed += 1
    if alignment.get("missed") and n_missed == 0:
        # some matrices only list missed entries
        n_missed = max(n_missed, len(alignment.get("missed") or []))

    denom = n_exact + n_partial + n_missed
    if denom <= 0:
        return {
            "n_exact": n_exact,
            "n_partial": n_partial,
            "n_missed": n_missed,
            "n_testable": 0,
            "target_recall": None,
            "passes": False,
            "applicable": False,
        }
    recall = (n_exact + n_partial) / denom
    return {
        "n_exact": n_exact,
        "n_partial": n_partial,
        "n_missed": n_missed,
        "n_testable": denom,
        "target_recall": recall,
        "passes": recall >= TARGET_RECALL_THRESHOLD,
        "applicable": True,
    }


def _finding_rank_key(f: dict[str, Any]) -> tuple:
    sev = str(f.get("severity") or "info").lower()
    return (
        _SEV_RANK.get(sev, 9),
        -float(f.get("score") or 0),
        str(f.get("detector") or ""),
    )


def relevant_finding_keys_from_alignment(
    alignment: dict[str, Any],
    *,
    expected_detectors: Iterable[str] | None = None,
) -> set[str]:
    """Keys that count as relevant for precision@K.

    A finding is relevant if:
      * its detector is in gold expected_detectors, OR
      * it appears as matched_finding for a target, OR
      * it is listed under non-incidental matched rows
    """
    keys: set[str] = set()
    exp = set(expected_detectors or alignment.get("expected_detectors") or [])
    for det in exp:
        keys.add(f"det:{det}")

    for row in alignment.get("target_alignment") or []:
        mf = row.get("matched_finding") or {}
        det = str(mf.get("detector") or "")
        title = str(mf.get("title") or "")
        if det:
            keys.add(f"det:{det}")
        if det and title:
            keys.add(f"hit:{det}|{title[:80]}")
    return keys


def precision_at_k(
    findings: list[dict[str, Any]],
    *,
    k: int = PRECISION_AT_K_DEFAULT,
    relevant_detectors: set[str] | None = None,
    relevant_keys: set[str] | None = None,
) -> dict[str, Any]:
    """Precision@K on severity-ranked findings.

    A finding is relevant if:
      * ``detector`` ∈ relevant_detectors, or
      * ``det:{detector}`` or ``hit:{detector}|{title}`` ∈ relevant_keys
    """
    k = max(1, int(k))
    ranked = sorted(findings, key=_finding_rank_key)
    top = ranked[:k]
    if not top:
        return {
            "k": k,
            "n_ranked": 0,
            "n_relevant": 0,
            "precision_at_k": 0.0,
            "passes": False,
        }

    rel_det = set(relevant_detectors or ())
    rel_keys = set(relevant_keys or ())
    n_rel = 0
    for f in top:
        det = str(f.get("detector") or "")
        title = str(f.get("title") or "")
        if det in rel_det or f"det:{det}" in rel_keys:
            n_rel += 1
            continue
        if f"hit:{det}|{title[:80]}" in rel_keys:
            n_rel += 1
    prec = n_rel / len(top)
    return {
        "k": k,
        "n_ranked": len(top),
        "n_relevant": n_rel,
        "precision_at_k": prec,
        "passes": prec >= PRECISION_AT_K_THRESHOLD,
    }


def precision_at_k_from_alignment(
    alignment: dict[str, Any],
    *,
    k: int = PRECISION_AT_K_DEFAULT,
    expected_detectors: Iterable[str] | None = None,
) -> dict[str, Any]:
    """Approx precision@K when only alignment summary is available.

    Constructs a synthetic ranked list:
      * matched target findings first (relevant)
      * then incidental findings (not relevant)
    Counts are taken from summary / lists — not true severity order,
    but stable enough as a regression gate.
    """
    summary = alignment.get("summary") or {}
    findings: list[dict[str, Any]] = []

    for row in alignment.get("target_alignment") or []:
        st = str(row.get("status") or "").lower()
        if st not in {"exact", "partial"}:
            continue
        mf = row.get("matched_finding") or {}
        # Prefer stored severity; exact matches rank as high for P@K
        sev = str(mf.get("severity") or ("high" if st == "exact" else "medium"))
        if st == "exact" and sev not in ("high", "medium"):
            sev = "high"
        findings.append(
            {
                "detector": mf.get("detector") or "unknown",
                "title": mf.get("title") or "",
                "severity": sev,
            }
        )

    for inc in alignment.get("incidental") or []:
        findings.append(
            {
                "detector": inc.get("detector") or "unknown",
                "title": inc.get("title") or "",
                "severity": "low",
            }
        )

    # If lists empty, synthesize from counts
    if not findings:
        n_match = int(summary.get("n_exact") or 0) + int(
            summary.get("n_partial") or 0
        )
        n_inc = int(summary.get("n_incidental") or 0)
        for i in range(n_match):
            findings.append(
                {
                    "detector": "matched",
                    "title": f"t{i}",
                    "severity": "high",
                }
            )
        for i in range(n_inc):
            findings.append(
                {
                    "detector": "incidental",
                    "title": f"i{i}",
                    "severity": "low",
                }
            )

    exp = set(expected_detectors or alignment.get("expected_detectors") or [])
    # matched synthetic detectors + expected
    rel_det = exp | {
        str(f.get("detector"))
        for f in findings
        if str(f.get("severity")) in {"high", "medium"}
        and str(f.get("detector")) not in {"incidental"}
    }
    # For synthetic matched/incidental labels
    if any(f.get("detector") == "matched" for f in findings):
        rel_det.add("matched")

    return precision_at_k(
        findings,
        k=k,
        relevant_detectors=rel_det,
        relevant_keys=relevant_finding_keys_from_alignment(
            alignment, expected_detectors=exp
        ),
    )


@dataclass
class CaseEvalP6:
    """P6 per-case metrics: detector recall + target recall + precision@K."""

    case_id: str
    domain: str
    detector_recall: float
    target_recall: float | None
    precision_at_k: float | None
    k: int
    n_expected_detectors: int
    n_testable_targets: int
    passes_detector_gate: bool
    passes_target_gate: bool
    passes_precision_gate: bool

    @property
    def passes_gate(self) -> bool:
        """Pass if detector OR target recall meets threshold, and precision OK when defined."""
        recall_ok = self.passes_detector_gate or self.passes_target_gate
        if self.precision_at_k is None:
            return recall_ok
        # If no testable targets, don't require precision
        if self.n_testable_targets <= 0 and self.n_expected_detectors <= 0:
            return True
        return recall_ok and self.passes_precision_gate


@dataclass
class AggregateEvalP6:
    cases: list[CaseEvalP6] = field(default_factory=list)
    overall_detector_recall: float = 0.0
    overall_target_recall: float = 0.0
    overall_precision_at_k: float = 0.0
    passes: bool = False
    n_cases: int = 0


def _case_dirs(root: Path) -> list[Path]:
    """Discover case directories under benchmark roots of either layout."""
    cases_root = root / "cases"
    if not cases_root.is_dir():
        return []
    out: list[Path] = []
    # layout A: cases/<domain>/<id>/
    for p in sorted(cases_root.glob("*/*")):
        if p.is_dir() and (p / "official_gold.json").exists():
            out.append(p)
    # layout B: cases/<id>/ (real_eval_fraud_cases)
    if not out:
        for p in sorted(cases_root.glob("*")):
            if p.is_dir() and (p / "official_gold.json").exists():
                out.append(p)
    return out


def evaluate_case_p6(
    gold: dict[str, Any],
    run: dict[str, Any],
    alignment: dict[str, Any] | None = None,
    *,
    k: int = PRECISION_AT_K_DEFAULT,
) -> CaseEvalP6:
    base = evaluate_case(gold, run)
    det_recall = base.ratio
    det_pass = base.passes_gate

    t_recall: float | None = None
    t_pass = False
    n_testable = 0
    p_at_k: float | None = None
    p_pass = True

    if alignment:
        tr = target_recall_from_alignment(alignment)
        # None when case has no testable figure/table targets
        t_recall = tr.get("target_recall")
        if t_recall is not None:
            t_recall = float(t_recall)
        t_pass = bool(tr.get("passes")) and bool(tr.get("applicable"))
        n_testable = int(tr.get("n_testable") or 0)
        if n_testable > 0:
            pk = precision_at_k_from_alignment(
                alignment,
                k=k,
                expected_detectors=gold.get("expected_manusift_detectors") or [],
            )
            p_at_k = float(pk["precision_at_k"])
            p_pass = bool(pk["passes"]) if pk["n_ranked"] > 0 else True
        else:
            p_at_k = None
            p_pass = True
    else:
        # no alignment: precision gate not applied
        t_pass = False
        p_pass = True

    return CaseEvalP6(
        case_id=base.case_id,
        domain=base.domain,
        detector_recall=det_recall,
        target_recall=t_recall,
        precision_at_k=p_at_k,
        k=k,
        n_expected_detectors=base.n_expected,
        n_testable_targets=n_testable,
        passes_detector_gate=det_pass,
        passes_target_gate=t_pass if t_recall is not None else False,
        passes_precision_gate=p_pass,
    )


def evaluate_benchmark_p6(
    root: Path | None = None,
    *,
    k: int = PRECISION_AT_K_DEFAULT,
) -> AggregateEvalP6:
    """P6 aggregate over all cases with gold + tool_summary (+ alignment if present)."""
    root = root or DEFAULT_BENCH_ROOT
    cases: list[CaseEvalP6] = []
    for case_dir in _case_dirs(root):
        gold_path = case_dir / "official_gold.json"
        run_path = case_dir / "manusift_run" / "tool_summary.json"
        if not run_path.exists():
            continue
        gold = _load_json(gold_path)
        run = _load_json(run_path)
        am_path = case_dir / "eval" / "alignment_matrix.json"
        alignment = _load_json(am_path) if am_path.exists() else None
        cases.append(evaluate_case_p6(gold, run, alignment, k=k))

    if not cases:
        return AggregateEvalP6(passes=False, n_cases=0)

    # Weighted detector recall
    # (same as evaluate_benchmark)
    # We don't have n_exact stored on P6; recompute from detector_recall * expected
    det_num = sum(
        c.detector_recall * max(c.n_expected_detectors, 1) for c in cases
    )
    det_den = sum(max(c.n_expected_detectors, 1) for c in cases)
    overall_det = det_num / det_den if det_den else 0.0

    # Only weight cases that actually have testable figure/table targets.
    # Cases with empty specific_targets must not dilute the mean with a
    # fake denominator of 1.
    t_cases = [
        c
        for c in cases
        if c.target_recall is not None and c.n_testable_targets > 0
    ]
    if t_cases:
        t_num = sum(
            (c.target_recall or 0.0) * c.n_testable_targets for c in t_cases
        )
        t_den = sum(c.n_testable_targets for c in t_cases)
        overall_t = t_num / t_den if t_den else 0.0
    else:
        overall_t = 0.0

    p_cases = [c for c in cases if c.precision_at_k is not None]
    overall_p = (
        sum(c.precision_at_k or 0.0 for c in p_cases) / len(p_cases)
        if p_cases
        else 0.0
    )

    # Aggregate pass: overall detector recall OR target recall >= 0.7,
    # and mean precision@K >= threshold when available (only among
    # cases that have ranked findings).
    recall_ok = (
        overall_det >= EVAL_GATE_THRESHOLD
        or overall_t >= TARGET_RECALL_THRESHOLD
    )
    p_scored = [
        c
        for c in cases
        if c.precision_at_k is not None and c.n_testable_targets > 0
    ]
    overall_p = (
        sum(c.precision_at_k or 0.0 for c in p_scored) / len(p_scored)
        if p_scored
        else overall_p
    )
    prec_ok = (
        True
        if not p_scored
        else overall_p >= PRECISION_AT_K_THRESHOLD
    )
    return AggregateEvalP6(
        cases=cases,
        overall_detector_recall=overall_det,
        overall_target_recall=overall_t,
        overall_precision_at_k=overall_p,
        passes=recall_ok and prec_ok,
        n_cases=len(cases),
    )


def evaluate_fixture_expectations(
    expect: dict[str, Any],
    findings: list[dict[str, Any]],
) -> dict[str, Any]:
    """Lightweight gate for evals/cases/*.json style expectations.

    Treats each must_contain filter as a target; recall = fraction of
    must_contain targets with ≥ min_count matches. Precision@K uses
    detectors listed in must_contain as relevant.
    """
    must = list(expect.get("must_contain") or [])
    if not must and "max_findings" in expect:
        n = len(findings)
        max_f = int(expect["max_findings"])
        ok = n <= max_f
        return {
            "target_recall": 1.0 if ok else 0.0,
            "precision_at_k": 1.0 if n == 0 else 0.0,
            "k": PRECISION_AT_K_DEFAULT,
            "n_targets": 0,
            "n_findings": n,
            "passes": ok,
            "kind": "negative_control",
        }

    hits = 0
    rel_det: set[str] = set()
    for spec in must:
        min_c = int(spec.get("min_count", 1))
        det = str(spec.get("detector") or "")
        if det:
            rel_det.add(det)
        matched = 0
        for f in findings:
            if det and f.get("detector") != det:
                continue
            if "severity" in spec and f.get("severity") != spec["severity"]:
                continue
            matched += 1
        if matched >= min_c:
            hits += 1
    n_t = max(1, len(must))
    recall = hits / n_t if must else 1.0
    pk = precision_at_k(
        findings,
        k=int(expect.get("precision_k") or PRECISION_AT_K_DEFAULT),
        relevant_detectors=rel_det,
    )
    passes = recall >= TARGET_RECALL_THRESHOLD and (
        pk["precision_at_k"] >= PRECISION_AT_K_THRESHOLD or not findings
    )
    return {
        "target_recall": recall,
        "precision_at_k": pk["precision_at_k"],
        "k": pk["k"],
        "n_targets": len(must),
        "n_findings": len(findings),
        "passes": passes,
        "kind": "positive_targets",
    }


def main(argv: list[str] | None = None) -> int:
    import argparse
    import sys

    p = argparse.ArgumentParser(
        description="ManuSift P6 eval gate (detector recall + target recall + precision@K)"
    )
    p.add_argument(
        "--root",
        type=Path,
        default=DEFAULT_BENCH_ROOT,
        help="Benchmark root (default: officially_flagged_cases_v2)",
    )
    p.add_argument("--k", type=int, default=PRECISION_AT_K_DEFAULT)
    p.add_argument("--legacy", action="store_true", help="Only P3-8 detector ratio")
    p.add_argument("--json", action="store_true")
    args = p.parse_args(argv)

    if args.legacy:
        agg = evaluate_benchmark(args.root)
        payload = {
            "mode": "legacy_detector_recall",
            "overall_ratio": agg.overall_ratio,
            "passes": agg.passes,
            "n_cases": len(agg.cases),
            "threshold": EVAL_GATE_THRESHOLD,
        }
    else:
        agg6 = evaluate_benchmark_p6(args.root, k=args.k)
        payload = {
            "mode": "p6",
            "n_cases": agg6.n_cases,
            "overall_detector_recall": agg6.overall_detector_recall,
            "overall_target_recall": agg6.overall_target_recall,
            "overall_precision_at_k": agg6.overall_precision_at_k,
            "k": args.k,
            "thresholds": {
                "detector_recall": EVAL_GATE_THRESHOLD,
                "target_recall": TARGET_RECALL_THRESHOLD,
                "precision_at_k": PRECISION_AT_K_THRESHOLD,
            },
            "passes": agg6.passes,
            "cases": [
                {
                    "case_id": c.case_id,
                    "domain": c.domain,
                    "detector_recall": c.detector_recall,
                    "target_recall": c.target_recall,
                    "precision_at_k": c.precision_at_k,
                    "passes": c.passes_gate,
                }
                for c in agg6.cases
            ],
        }

    text = json.dumps(payload, ensure_ascii=False, indent=2)
    print(text)
    return 0 if payload.get("passes") else 1


if __name__ == "__main__":
    raise SystemExit(main())
