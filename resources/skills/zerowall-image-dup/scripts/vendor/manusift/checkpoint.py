"""Per-detector step checkpoint I/O (Step H3).

Each detector writes a ``DetectorResult`` JSON file as soon as it
finishes, so a crashed pipeline can be resumed by skipping
detectors whose step file already says ``ok=True``.

The serializer is intentionally trivial — no schema evolution,
no version field, no backward-compat shims. If we change
``DetectorResult`` shape we just delete the stale step files
and start over. Step files are *cache*, not *data*: the source
of truth is always the input PDF.

Two small safety nets:
  * On read, any file that fails to parse is treated as
    "absent" (logged warning) so a partial-write does not block
    resume forever.
  * On write, the file is written to ``<name>.tmp`` first and
    then renamed — atomic on POSIX, "best effort" on Windows.
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
from dataclasses import asdict
from pathlib import Path

from .contracts import Finding
from .detectors.base import DetectorResult

log = logging.getLogger(__name__)


def _result_to_dict(res: DetectorResult) -> dict:
    """Convert a DetectorResult to a JSON-friendly dict.

    Findings are stored as plain dicts (not the frozen dataclass
    form) so the file is human-readable and resilient against
    schema churn."""
    return {
        "detector": res.detector,
        "ok": res.ok,
        "duration_ms": res.duration_ms,
        "error": res.error,
        "findings": [f.__dict__ for f in res.findings],
    }


def _dict_to_result(payload: dict) -> DetectorResult:
    """Reconstruct a DetectorResult from its JSON dict.

    Returns ``None`` from ``read_step`` if any field is missing
    or the JSON is corrupt. The caller treats that as "step
    absent" and reruns the detector."""
    try:
        findings_raw = payload.get("findings", [])
        findings: list[Finding] = []
        for f in findings_raw:
            findings.append(
                Finding(
                    finding_id=f["finding_id"],
                    trace_id=f["trace_id"],
                    detector=f["detector"],
                    severity=f["severity"],
                    title=f["title"],
                    evidence=f["evidence"],
                    location=f["location"],
                    raw=f.get("raw", {}),
                    llm_verdict=f.get("llm_verdict"),
                    llm_skipped=f.get("llm_skipped", False),
                )
            )
        return DetectorResult(
            detector=payload["detector"],
            ok=bool(payload.get("ok", False)),
            findings=findings,
            error=payload.get("error"),
            duration_ms=int(payload.get("duration_ms", 0)),
        )
    except (KeyError, TypeError, ValueError) as exc:
        log.warning(
            "step payload missing/invalid fields",
            extra={"err": str(exc)},
        )
        raise


def write_step(path: Path, res: DetectorResult) -> None:
    """Atomically write a DetectorResult to ``path``.

    The parent directory is created if missing. We write to a
    sibling temp file and rename — this is the standard
    "write-and-rename" idiom that survives a process kill
    mid-write on POSIX. On Windows, ``os.replace`` is atomic
    when both files are on the same volume, which they are by
    construction (same ``steps/`` directory)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = _result_to_dict(res)
    # Use NamedTemporaryFile in the same dir so the rename is
    # guaranteed to be a same-filesystem move.
    fd, tmp_name = tempfile.mkstemp(
        prefix=path.name + ".",
        suffix=".tmp",
        dir=str(path.parent),
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.replace(tmp_name, path)
    except Exception:
        # Clean up the temp file if the rename never happened.
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def read_step(path: Path) -> DetectorResult | None:
    """Read a DetectorResult from ``path``, or None on any failure.

    Caller treats None as "step is not resumable; rerun the
    detector". A warning is logged so the user can see when a
    step file got corrupted."""
    try:
        raw = path.read_text(encoding="utf-8")
        payload = json.loads(raw)
    except (OSError, json.JSONDecodeError) as exc:
        log.warning(
            "step file unreadable; will rerun detector",
            extra={"path": str(path), "err": str(exc)},
        )
        return None
    try:
        return _dict_to_result(payload)
    except (KeyError, TypeError, ValueError) as exc:
        log.warning(
            "step file corrupt; will rerun detector",
            extra={"path": str(path), "err": str(exc)},
        )
        return None


def read_step_silent(path: Path) -> DetectorResult | None:
    """Like ``read_step`` but with no logging. Used by the resume
    logic where missing/corrupt steps are expected, not anomalous."""
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return _dict_to_result(payload)
    except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError):
        return None
