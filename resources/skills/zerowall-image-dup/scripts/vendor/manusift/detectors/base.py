"""Detector base + safe runner.

A ``Detector`` is a pure function from ``ParsedDoc`` to a
``DetectorResult``. The result is a typed envelope (modeled on
OpenHands' Action/Observation protocol: every step returns an
explicit status + payload, never just a value) so the pipeline
always knows whether the detector actually ran, how long it took,
and what to record if it crashed. The runner still wraps each call
in a try/except so one broken detector cannot kill the whole job.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Protocol

from ..contracts import Finding, ParsedDoc
from ..trace import get_logger

log = get_logger(__name__)


@dataclass(frozen=True)
class DetectorResult:
    """Typed envelope returned by every detector.

    Borrowing OpenHands' Action/Observation design: the value and
    the status of the action live in the same object, never split
    across a return value and a side channel.

    Fields:
      detector: name of the detector that produced this result
      ok: True if run() completed without raising
      findings: list of Finding objects; empty on failure
      error: exception repr if ok=False, else None
      duration_ms: wall-clock cost of run(), always recorded
        (useful for H5 progress + future checkpoint timing logs)
      stats: per-detector run stats, e.g.
        ``{"figures_scanned": 12, "cells_analyzed": 1200}``.
        The contract is detector-specific: each detector
        documents which keys it writes.  Consumers (TUI
        ``#detector-count`` segment, ``SubagentResult.stats``,
        eval-gate reports) read these keys.  Empty by default
        (the previous contract).  R-2026-06-15 (Phase 3 + P3-6):
        the audit recommended surfacing
        ``figures_scanned`` /
        ``cells_analyzed`` /
        ``tokens_checked`` to the TUI so the user sees
        live progress ("8 figures scanned, 2 dup-pairs")
        rather than just a spinner.  Detectors that
        implement this populate the field in their
        ``run()`` method.
    """

    detector: str
    ok: bool
    findings: list[Finding] = field(default_factory=list)
    error: str | None = None
    duration_ms: int = 0
    stats: dict[str, Any] = field(
        default_factory=dict
    )


class Detector(Protocol):
    name: str

    def run(self, doc: ParsedDoc) -> DetectorResult: ...


def run_detectors(doc: ParsedDoc, detectors: list[Detector]) -> list[DetectorResult]:
    """Run each detector in isolation. Returns one DetectorResult
    per detector, in input order. Findings are not flattened here —
    the caller (pipeline) does that, so it can also see per-detector
    status, error, and timing."""
    results: list[DetectorResult] = []
    for det in detectors:
        t0 = time.time()
        try:
            res = det.run(doc)
        except Exception as exc:  # noqa: BLE001 — isolation is the point
            log.exception("detector crashed", extra={"detector": det.name})
            # Synthesize a "crashed" finding so the user sees the
            # failure in the report, plus a typed result with
            # ok=False so the pipeline can record the error.
            crashed = Finding.make(
                trace_id=doc.trace_id,
                detector=det.name,
                severity="info",
                title=f"{det.name} crashed",
                evidence=f"Detector raised: {type(exc).__name__}: {exc}",
                location="(pipeline)",
                raw={"exception": repr(exc)},
            )
            results.append(
                DetectorResult(
                    detector=det.name,
                    ok=False,
                    findings=[crashed],
                    error=f"{type(exc).__name__}: {exc}",
                    duration_ms=int((time.time() - t0) * 1000),
                )
            )
            continue
        # Detector returned a value — record timing and keep going.
        results.append(
            DetectorResult(
                detector=det.name,
                ok=True,
                findings=list(res.findings),
                duration_ms=int((time.time() - t0) * 1000),
            )
        )
    return results
