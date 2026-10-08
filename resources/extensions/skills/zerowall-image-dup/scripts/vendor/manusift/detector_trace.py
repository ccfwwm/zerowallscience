"""Detector trace instrumentation (R-2026-06-13).

A lightweight wrapper around the pipeline's per-detector loop that
emits structured ``detector.*`` events on the global EventBus so
listeners (the TUI's DetectorTraceBlock widget, the file-webhook
listener, the ``detector_summary.json`` writer, etc.) can surface
the detector lifecycle without needing to be hooked into the
pipeline directly.

Event taxonomy (all carry ``trace_id``, ``detector``, ``ts``):

  * ``detector.started``  -- the detector is about to run.
  * ``detector.progress`` -- a non-terminal mid-run progress update
    (e.g. "scanning figure panels"). Optional; the pipeline may
    choose not to emit these.
  * ``detector.done``     -- the detector finished with ok=True and
    ``findings_count`` findings.
  * ``detector.skipped``  -- the detector was skipped (e.g. no
    eligible integer table for ``stat_grim``). Carries
    ``reason``. We synthesise this when a detector returns zero
    findings AND the pipeline marks it skipped (currently the
    pipeline only marks ok=True/ok=False -- see
    ``should_skip_detector`` for the conservative rule).
  * ``detector.error``    -- the detector raised an exception or
    returned ok=False. Carries ``error``.

Design decisions:

  1. **Do NOT modify the detector classes themselves.** The
     instrumentation is a wrapper around the pipeline's existing
     ``for cls in _pipeline_detector_classes()`` loop. Detectors
     stay untouched (instrumentation wraps the pipeline loop only).
  2. **Event ordering is guaranteed per detector.** A single
     detector cannot interleave its started/done events with
     another detector's events because the pipeline runs them
     serially.
  3. **Listeners are cheap.** The TUI listener just appends to an
     in-memory list; the file-webhook listener writes a JSON line.
     The instrumentation wrapper does NOT block the pipeline.
  4. **Skip vs done-zero-findings.** A detector that returns
     ``DetectorResult(ok=True, findings=[])`` is currently NOT
     considered "skipped" in the pipeline's view -- it ran
     successfully and produced no findings. The wrapper preserves
     this: zero-finding detectors emit ``detector.done`` (not
     ``detector.skipped``). The only way to emit
     ``detector.skipped`` is via the explicit
     ``should_skip_detector`` rule below.

Why per-detector instrumentation vs polling:

  - The pipeline already serializes detector execution. Adding
    pre/post events around each detector invocation costs
    microseconds, well below the slowest detector (OCR ~30 s).
  - Listeners can react synchronously without polling. The TUI
    widget updates immediately when the event fires.

Why not just reuse ``job.step_completed``?

  - The TUI needs *per-detector* lifecycle (started, in progress,
    done) to drive its progress UI. ``job.step_completed`` is
    post-hoc only; the TUI would not know a detector is "running"
    until it had already finished.
  - The ``detector.skipped`` semantic is not expressible in
    ``job.step_completed``. The pipeline only knows ok=True /
    ok=False; skip is a higher-level concept (e.g. "no eligible
    table" -- which is a heuristic the TUI wants to surface
    *before* the detector runs).
"""
from __future__ import annotations

import json
import time
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .events import Event, get_bus
from .trace import get_logger

log = get_logger(__name__)


# --------------------- Event types ---------------------

# Event type constants. Kept module-level so callers do not
# depend on the underlying string layout.
DETECTOR_STARTED = "detector.started"
DETECTOR_PROGRESS = "detector.progress"
DETECTOR_DONE = "detector.done"
DETECTOR_SKIPPED = "detector.skipped"
DETECTOR_ERROR = "detector.error"

ALL_DETECTOR_EVENTS: tuple[str, ...] = (
    DETECTOR_STARTED,
    DETECTOR_PROGRESS,
    DETECTOR_DONE,
    DETECTOR_SKIPPED,
    DETECTOR_ERROR,
)

# Display icons for the expanded view. Mirrors the ToolTraceBlock
# convention so the two blocks look consistent.
_STATUS_ICON: dict[str, str] = {
    DETECTOR_STARTED: "\u2807 ",   # braille dots (running)
    DETECTOR_PROGRESS: "\u2807 ",
    DETECTOR_DONE: "\u2713 ",     # check mark
    DETECTOR_SKIPPED: "\u21b7 ",  # right hook (skipped)
    DETECTOR_ERROR: "\u26a0 ",    # warning
}


# --------------------- Detector entry ---------------------

@dataclass
class DetectorEntry:
    """One detector lifecycle record inside a ``DetectorTrace``.

    Mirrors the ``ToolEntry`` shape from ``manusift.tui.turn_block``
    so the TUI can render both blocks with the same renderer.

    ``status`` is one of the five ``ALL_DETECTOR_EVENTS``.
    ``category`` is the human-readable category label (e.g.
    "PDF / metadata", "Image forensics") from
    ``manusift.tools.detector_catalog.DETECTOR_CATEGORY``. The
    TUI uses this to group detectors in the expanded view.
    ``phase`` is the optional mid-run progress message.
    ``skip_reason`` is set when ``status`` is ``detector.skipped``.
    """
    detector: str
    category: str = "general"
    status: str = DETECTOR_DONE
    duration_ms: int | None = None
    finding_count: int = 0
    phase: str = ""
    skip_reason: str = ""
    error: str = ""


# --------------------- Skip heuristic ---------------------

# A conservative rule that decides whether a detector SHOULD have
# been skipped (and emits ``detector.skipped`` instead of
# ``detector.done`` with zero findings). The check happens BEFORE
# the detector runs and only consults the document shape -- it
# does not touch detector internals.
#
# The skip reasons are coarse on purpose: a real detector may
# still find something the heuristic missed. The TUI surfaces
# "skipped" so the user knows the detector was a no-op for this
# paper; the alignment script handles the rare case where the
# detector still produces findings anyway.
_SKIP_RULES: dict[str, tuple[str, str]] = {
    # detector name -> (heuristic attr, reason string)
    "stat_grim": (
        "no integer table",
        "no eligible integer / percentage table for GRIM test",
    ),
    "stat_pvalue": (
        "no p-value column",
        "no column with p-value-like values to test",
    ),
    "stat_percent": (
        "no percentage column",
        "no column with percentage-like values to test",
    ),
    "stat_consistency": (
        "no numeric table",
        "no numeric table for consistency check",
    ),
    "figure_grim": (
        "no recognised percentage",
        "no percentage recognised in figure body via OCR",
    ),
    "figure_stat_text": (
        "no figure OCR",
        "no figure region recognised for OCR pass",
    ),
    "figure_table_ocr": (
        "no OCR table grid",
        "no table-like numeric grid recovered from figure OCR",
    ),
    "source_data_consistency": (
        "no cross-source numbers",
        "insufficient PDF and/or companion numeric cells to compare",
    ),
    "table_benford": (
        "no numeric column",
        "no numeric column long enough for Benford test",
    ),
    "table_duplicate_row": (
        "no tabular data",
        "no tabular data extracted from PDF or companion files",
    ),
    "table_outlier": (
        "no numeric column",
        "no numeric column long enough for outlier test",
    ),
    "table_round_bias": (
        "no numeric column",
        "no numeric column long enough for round-bias test",
    ),
    "table_near_duplicate_row": (
        "no near-duplicate rows",
        "no near-duplicate row pairs (1–2 cell diffs) found",
    ),
    "table_cross_copy": (
        "no cross-table copies",
        "no identical rows shared across multiple tables",
    ),
    "table_file_metadata": (
        "no companion spreadsheet",
        "no XLSX/CSV companion files with readable metadata",
    ),
    "table_forensics": (
        "no tabular data",
        "no tables available for table-forensics suite",
    ),
    "table_highlight_focus": (
        "no highlighted cells",
        "no spreadsheet cells with visible fills/highlighters",
    ),
    "chart_data_extract": (
        "no chart-like image",
        "no chart-like image extracted from PDF",
    ),
    "supplementary": (
        "no source data",
        "no companion data file (XLSX / CSV) uploaded",
    ),
    "compliance": (
        "no compliance section",
        "no compliance section text extracted",
    ),
    "data_availability_concern": (
        "no source data",
        "no source data / data-availability statement found",
    ),
    "ref_duplicate": (
        "no reference list",
        "no reference list extracted from PDF",
    ),
    "ref_format_anomaly": (
        "no reference list",
        "no reference list extracted from PDF",
    ),
    "citation_network": (
        "no reference list",
        "no reference list extracted from PDF",
    ),
    "cited_retraction": (
        "no reference list",
        "no reference list extracted from PDF",
    ),
    "text_patterns": (
        "no body text",
        "no body text extracted from PDF",
    ),
    "text_tortured_phrases": (
        "no body text",
        "no body text extracted from PDF",
    ),
    "paper_mill_template": (
        "no body text",
        "no body text extracted from PDF",
    ),
    "image_sift_copymove": (
        "no images extracted",
        "no raster images extracted from PDF (figure bodies are "
        "likely vector-only)",
    ),
    "image_ssim": (
        "no images extracted",
        "no raster images extracted from PDF",
    ),
    "image_noise_inconsistency": (
        "no images extracted",
        "no raster images extracted from PDF",
    ),
    "panel_duplicate": (
        "no images extracted",
        "no raster images extracted from PDF",
    ),
    "panel_segmentation": (
        "no images extracted",
        "no raster images extracted from PDF",
    ),
    "page_raster_dup": (
        "no pages",
        "no page bitmaps rendered for raster duplicate check",
    ),
    "image_statistics": (
        "no images extracted",
        "no raster images extracted from PDF",
    ),
    "imagehash_ahash": (
        "no images extracted",
        "no raster images extracted from PDF",
    ),
    "imagehash_dhash": (
        "no images extracted",
        "no raster images extracted from PDF",
    ),
    "imagehash_phash": (
        "no images extracted",
        "no raster images extracted from PDF",
    ),
    "imagehash_whash": (
        "no images extracted",
        "no raster images extracted from PDF",
    ),
    "image_dup": (
        "no images extracted",
        "no raster images extracted from PDF (image-duplication "
        "detector requires >= 2 images)",
    ),
    "ai_generated_figure": (
        "PDF not ingested",
        "PDF metadata + XMP could not be read; cannot run AI probe",
    ),
    "metadata": (
        "PDF not ingested",
        "PDF could not be parsed; no metadata to inspect",
    ),
    "pdf_metadata": (
        "PDF not ingested",
        "PDF could not be parsed; no metadata to inspect",
    ),
}


def _get_category(detector_name: str) -> str:
    """Return the human-readable category for a detector name.

    Falls back to ``"general"`` for unrecognised names.
    """
    try:
        from .tools.detector_catalog import DETECTOR_CATEGORY
    except Exception:  # noqa: BLE001
        return "general"
    cat = DETECTOR_CATEGORY.get(detector_name, "general")
    # Human-readable label per category. Kept here (not in
    # detector_catalog) so the catalog stays a pure data dict.
    return {
        "metadata": "PDF / metadata",
        "image": "Image forensics",
        "imagehash": "Image forensics",
        "text": "Text / references",
        "reference": "Text / references",
        "statistical": "Tables / statistics",
        "table": "Tables / statistics",
        "chart": "Tables / statistics",
        "compliance": "Reporting",
        "general": "Reporting",
    }.get(cat, "Reporting")


def should_skip_detector(
    detector_name: str,
    doc: Any,
    *,
    is_builtin: bool = True,
) -> tuple[bool, str]:
    """Decide whether a detector should be skipped for this paper.

    Returns ``(True, reason)`` if the detector is a known no-op for
    this paper's shape, ``(False, "")`` otherwise.

    The heuristic is deliberately *conservative*: when in doubt
    we DO run the detector. The skip rules cover the most common
    paper shapes (e.g. a pure-text paper will skip all image
    detectors; a paper with no tables will skip table_* detectors).

    Plugin (third-party entry-point) detectors are never pre-skipped
    by this heuristic -- the user explicitly installed them, so
    the heuristic should not second-guess their intent. A plugin
    that turns out to be a no-op for this paper's shape will just
    return zero findings, which is fine.
    """
    if not is_builtin:
        return False, ""
    rule = _SKIP_RULES.get(detector_name)
    if rule is None:
        return False, ""
    code, reason = rule
    # The actual decision logic. We keep it inline (rather than a
    # dispatch dict) because each detector's skip condition is
    # tiny and the explicit ``if/elif`` reads better than 30+
    # one-liners.
    if code == "no eligible integer table":
        # stat_grim -- needs an integer / percentage column.
        tables = getattr(doc, "tables", None) or []
        if not tables:
            return True, reason
    if code == "no p-value column":
        # stat_pvalue -- need a column with values in [0, 1].
        tables = getattr(doc, "tables", None) or []
        if not tables:
            return True, reason
    if code == "no percentage column":
        # stat_percent -- need a column with values 0..100.
        tables = getattr(doc, "tables", None) or []
        if not tables:
            return True, reason
    if code == "no numeric table":
        # stat_consistency -- needs a numeric column.
        tables = getattr(doc, "tables", None) or []
        if not tables:
            return True, reason
    if code == "no recognised percentage":
        # figure_grim -- needs OCR'd percentages.
        # We cannot know what OCR will find without running it.
        # Conservative: do not pre-skip.
        return False, ""
    if code == "no figure OCR":
        # figure_stat_text -- needs at least one image region.
        images = getattr(doc, "images", None) or []
        if not images:
            return True, reason
    if code == "no numeric column":
        # table_* detectors -- need at least one table.
        tables = getattr(doc, "tables", None) or []
        if not tables:
            return True, reason
    if code == "no tabular data":
        # table_duplicate_row -- same as above.
        tables = getattr(doc, "tables", None) or []
        if not tables:
            return True, reason
    if code == "no chart-like image":
        # chart_data_extract -- needs at least one image region.
        images = getattr(doc, "images", None) or []
        if not images:
            return True, reason
    if code == "no source data":
        # supplementary / data_availability_concern.
        # The detector reads doc.metadata["data_sources"] if set.
        # Heuristic: if no companion files were ingested (the
        # pipeline would set data_sources to []). We check the
        # doc.text_blocks for "Data Availability" header as a
        # fallback.
        tables = getattr(doc, "tables", None) or []
        if not tables:
            text_blocks = getattr(doc, "text_blocks", None) or []
            full_text = " ".join(
                getattr(b, "text", "") for b in text_blocks
            ).lower()
            if "data availability" not in full_text:
                return True, reason
    if code == "no compliance section":
        text_blocks = getattr(doc, "text_blocks", None) or []
        full_text = " ".join(
            getattr(b, "text", "") for b in text_blocks
        ).lower()
        if not any(
            kw in full_text for kw in (
                "ethics", "irb", "iacuc", "approval",
                "data availability", "conflict of interest",
                "funding", "trial registration",
            )
        ):
            return True, reason
    if code == "no reference list":
        # Heuristic: look for a "References" header in body text.
        text_blocks = getattr(doc, "text_blocks", None) or []
        full_text = " ".join(
            getattr(b, "text", "") for b in text_blocks
        ).lower()
        if "references" not in full_text and "bibliography" not in full_text:
            return True, reason
    if code == "no body text":
        text_blocks = getattr(doc, "text_blocks", None) or []
        if not any(
            getattr(b, "text", "").strip() for b in text_blocks
        ):
            return True, reason
    if code == "no images extracted":
        images = getattr(doc, "images", None) or []
        if not images:
            return True, reason
    if code == "no pages":
        text_blocks = getattr(doc, "text_blocks", None) or []
        if not text_blocks:
            return True, reason
    if code == "PDF not ingested":
        # The detector will crash if source_path is empty. Check.
        if not getattr(doc, "source_path", ""):
            return True, reason
    return False, ""


# --------------------- DetectorTrace state ---------------------

@dataclass
class DetectorTrace:
    """In-memory trace of a single pipeline run.

    Listeners subscribe to ``detector.*`` events on the EventBus
    and call ``record_started`` / ``record_progress`` /
    ``record_done`` / ``record_skipped`` / ``record_error``.

    The trace is *deterministic*: the order of records equals
    the order of detector invocations, which the pipeline
    guarantees is serial.

    The trace is also thread-safe: every method takes a lock
    so a worker thread can update it without race conditions.
    """

    trace_id: str
    total: int = 0
    records: list[DetectorEntry] = field(default_factory=list)
    _by_detector: dict[str, DetectorEntry] = field(default_factory=dict)
    _lock: Any = field(default=None, repr=False)

    def __post_init__(self) -> None:
        # Lazy import so the module can be imported without textual.
        import threading
        self._lock = threading.Lock()

    # ----- lifecycle -----

    def record_started(
        self, detector: str, phase: str = ""
    ) -> DetectorEntry:
        with self._lock:
            entry = DetectorEntry(
                detector=detector,
                category=_get_category(detector),
                status=DETECTOR_STARTED,
                phase=phase,
            )
            self._by_detector[detector] = entry
            self.records.append(entry)
            return entry

    def record_progress(
        self, detector: str, phase: str
    ) -> None:
        with self._lock:
            entry = self._by_detector.get(detector)
            if entry is None:
                return
            entry.phase = phase

    def record_done(
        self,
        detector: str,
        duration_ms: int,
        finding_count: int,
    ) -> None:
        with self._lock:
            entry = self._by_detector.get(detector)
            if entry is None:
                # No prior ``started`` event (e.g. listener
                # bridge fed only the done half of a resumed
                # step). Create a fresh entry so the UI shows
                # it.
                entry = DetectorEntry(
                    detector=detector,
                    category=_get_category(detector),
                )
                self._by_detector[detector] = entry
                self.records.append(entry)
            entry.status = DETECTOR_DONE
            entry.duration_ms = duration_ms
            entry.finding_count = finding_count
            entry.phase = ""

    def record_skipped(
        self, detector: str, reason: str
    ) -> None:
        with self._lock:
            entry = self._by_detector.get(detector)
            if entry is None:
                # No prior ``started`` event (e.g. the pipeline
                # pre-skip decided before invoking the detector).
                # Create a fresh entry so the UI shows it.
                entry = DetectorEntry(
                    detector=detector,
                    category=_get_category(detector),
                )
                self._by_detector[detector] = entry
                self.records.append(entry)
            entry.status = DETECTOR_SKIPPED
            entry.skip_reason = reason
            entry.phase = ""

    def record_error(
        self, detector: str, error: str, duration_ms: int
    ) -> None:
        with self._lock:
            entry = self._by_detector.get(detector)
            if entry is None:
                entry = DetectorEntry(
                    detector=detector,
                    category=_get_category(detector),
                )
                self._by_detector[detector] = entry
                self.records.append(entry)
            entry.status = DETECTOR_ERROR
            entry.error = error
            entry.duration_ms = duration_ms
            entry.phase = ""

    # ----- queries -----

    def counts(self) -> dict[str, int]:
        with self._lock:
            c: Counter[str] = Counter()
            for r in self.records:
                c[r.status] += 1
            return dict(c)

    def findings_total(self) -> int:
        with self._lock:
            return sum(r.finding_count for r in self.records)

    def running(self) -> DetectorEntry | None:
        with self._lock:
            for r in reversed(self.records):
                if r.status in (DETECTOR_STARTED, DETECTOR_PROGRESS):
                    return r
            return None

    def done(self) -> bool:
        """True when no detector is still running and the trace has
        at least one record."""
        return self.running() is None and bool(self.records)

    # ----- serialisation -----

    def to_summary(self) -> dict[str, Any]:
        """Serialise to the dict shape written to
        ``detector_summary.json`` and consumed by the report.

        Note on locking: we acquire the lock ONCE and compute every
        value inside the critical section. We MUST NOT call other
        ``with self._lock`` methods (e.g. ``findings_total``) from
        here -- ``threading.Lock`` is not re-entrant and the
        re-acquire would deadlock the worker thread.
        """
        with self._lock:
            # Pre-compute every aggregate BEFORE building the
            # dict, so we do not re-enter the lock.
            n_done = 0
            n_running = 0
            n_skipped = 0
            n_error = 0
            total_findings = 0
            for r in self.records:
                total_findings += r.finding_count
                if r.status == DETECTOR_DONE:
                    n_done += 1
                elif r.status in (
                    DETECTOR_STARTED, DETECTOR_PROGRESS
                ):
                    n_running += 1
                elif r.status == DETECTOR_SKIPPED:
                    n_skipped += 1
                elif r.status == DETECTOR_ERROR:
                    n_error += 1
            return {
                "trace_id": self.trace_id,
                "total": self.total,
                "completed": n_done,
                "running": n_running,
                "skipped": n_skipped,
                "error": n_error,
                "findings_total": total_findings,
                "detectors": [
                    {
                        "detector": r.detector,
                        "category": r.category,
                        "status": r.status,
                        "duration_ms": r.duration_ms,
                        "finding_count": r.finding_count,
                        "phase": r.phase,
                        "skip_reason": r.skip_reason,
                        "error": r.error,
                    }
                    for r in self.records
                ],
            }


# --------------------- Event-bus bridge ---------------------

class DetectorTraceListener:
    """An EventBus listener that updates a DetectorTrace.

    Subscribe one of these per pipeline run. The listener is
    idempotent for ``detector.done`` / ``detector.error``: if the
    same detector fires ``done`` twice (which can happen if a
    detector is wrapped twice), the second call overwrites the
    first. This is intentional -- the trace should reflect the
    final state, not every intermediate state.

    Why a class and not a closure? Because the listener may be
    registered on a process-global EventBus and outlive the
    pipeline.run_pipeline call. A class instance can be cleaned
    up by the caller.
    """

    name = "detector_trace"

    def __init__(self, trace: DetectorTrace) -> None:
        self._trace = trace

    def on_event(self, event: Event) -> None:
        p = event.payload
        if event.type == DETECTOR_STARTED:
            phase = p.get("phase", "")
            self._trace.record_started(p["detector"], phase)
        elif event.type == DETECTOR_PROGRESS:
            self._trace.record_progress(p["detector"], p.get("phase", ""))
        elif event.type == DETECTOR_DONE:
            self._trace.record_done(
                p["detector"],
                int(p.get("duration_ms", 0) or 0),
                int(p.get("findings_count", 0) or 0),
            )
        elif event.type == DETECTOR_SKIPPED:
            self._trace.record_skipped(
                p["detector"], p.get("reason", "")
            )
        elif event.type == DETECTOR_ERROR:
            self._trace.record_error(
                p["detector"],
                p.get("error", ""),
                int(p.get("duration_ms", 0) or 0),
            )


def emit_started(trace_id: str, detector: str, phase: str = "") -> None:
    """Helper: emit ``detector.started``."""
    try:
        get_bus().emit(Event(
            DETECTOR_STARTED,
            {
                "trace_id": trace_id,
                "detector": detector,
                "phase": phase,
            },
        ))
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "detector.started emit failed",
            extra={"err": str(exc), "detector": detector},
        )


def emit_progress(trace_id: str, detector: str, phase: str) -> None:
    """Helper: emit ``detector.progress``."""
    try:
        get_bus().emit(Event(
            DETECTOR_PROGRESS,
            {
                "trace_id": trace_id,
                "detector": detector,
                "phase": phase,
            },
        ))
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "detector.progress emit failed",
            extra={"err": str(exc), "detector": detector},
        )


def emit_done(
    trace_id: str,
    detector: str,
    duration_ms: int,
    findings_count: int,
) -> None:
    """Helper: emit ``detector.done``."""
    try:
        get_bus().emit(Event(
            DETECTOR_DONE,
            {
                "trace_id": trace_id,
                "detector": detector,
                "duration_ms": duration_ms,
                "findings_count": findings_count,
            },
        ))
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "detector.done emit failed",
            extra={"err": str(exc), "detector": detector},
        )


def emit_skipped(trace_id: str, detector: str, reason: str) -> None:
    """Helper: emit ``detector.skipped``."""
    try:
        get_bus().emit(Event(
            DETECTOR_SKIPPED,
            {
                "trace_id": trace_id,
                "detector": detector,
                "reason": reason,
            },
        ))
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "detector.skipped emit failed",
            extra={"err": str(exc), "detector": detector},
        )


def emit_error(
    trace_id: str,
    detector: str,
    error: str,
    duration_ms: int,
) -> None:
    """Helper: emit ``detector.error``."""
    try:
        get_bus().emit(Event(
            DETECTOR_ERROR,
            {
                "trace_id": trace_id,
                "detector": detector,
                "error": error,
                "duration_ms": duration_ms,
            },
        ))
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "detector.error emit failed",
            extra={"err": str(exc), "detector": detector},
        )


def write_summary(
    path: Path,
    trace: DetectorTrace,
) -> None:
    """Write the trace summary to ``detector_summary.json``.

    This is the artifact that the HTML report loader picks up to
    render the final detector summary block. Format mirrors the
    ``tool_summary.json`` shape so a single renderer can consume
    both.
    """
    payload = trace.to_summary()
    payload["written_at"] = time.time()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, default=str),
        encoding="utf-8",
    )