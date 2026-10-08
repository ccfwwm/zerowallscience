"""Shared dataclasses that flow between ManuSift layers.

All cross-layer values are frozen dataclasses carrying a ``trace_id``.
No ``dict[str, Any]`` is allowed to live in long-lived state — boundary
payloads are isolated in ``raw`` fields and only typed facts survive
into the report.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

Severity = Literal["info", "low", "medium", "high"]
JobStatus = Literal["queued", "running", "done", "failed"]


def _new_finding_id() -> str:
    """Short id used as an anchor in the HTML report."""
    return uuid.uuid4().hex[:10]


@dataclass(frozen=True)
class Finding:
    """One suspicion raised by a detector (or by the LLM enricher)."""

    finding_id: str
    trace_id: str
    detector: str
    severity: Severity
    title: str
    evidence: str
    location: str
    raw: dict[str, Any] = field(default_factory=dict)
    llm_verdict: str | None = None
    llm_skipped: bool = False

    @staticmethod
    def make(
        trace_id: str,
        detector: str,
        severity: Severity,
        title: str,
        evidence: str,
        location: str,
        raw: dict[str, Any] | None = None,
    ) -> "Finding":
        return Finding(
            finding_id=_new_finding_id(),
            trace_id=trace_id,
            detector=detector,
            severity=severity,
            title=title,
            evidence=evidence,
            location=location,
            raw=raw or {},
        )


@dataclass(frozen=True)
class TextBlock:
    page: int
    bbox: tuple[float, float, float, float]
    text: str


@dataclass(frozen=True)
class ExtractedImage:
    page: int
    index: int  # position on the page (0-based)
    xref: int
    # 16-char hex perceptual
    # hash (imagehash.phash,
    # DCT-based, 64-bit).
    # ``None`` means the
    # image was *degenerate*
    # (too small / solid-
    # color / decode
    # failure) and the
    # detector should skip
    # it. The previous
    # implementation always
    # returned a 16-char
    # string -- an all-zero
    # hash for solid-white
    # icons -- which caused
    # the duplicate detector
    # to flag every pair of
    # blank icons as a
    # duplicate. ``None``
    # is a sentinel, not a
    # valid hash; downstream
    # code must treat None
    # and ``""`` identically
    # (both falsy).
    phash: str | None
    width: int
    height: int
    bytes_size: int
    exif: dict[str, Any] = field(default_factory=dict)
    # Path on disk to the extracted raster. Set by ingest so detectors
    # that need pixel access (ELA, copy-move) don't have to re-decode.
    # Optional for backward compat with synthetic/test records.
    image_path: str | None = None


@dataclass(frozen=True)
class ExtractedTable:
    """A tabular data source extracted from the PDF or one of its
    companion data files (XLSX, CSV, TSV).

    The four table-statistics detectors
    (``BenfordDetector``,
    ``DuplicateRowDetector``,
    ``OutlierDetector``,
    ``RoundBiasDetector``)
    consume this shape -- they
    do NOT parse XLSX
    themselves. The
    `ingest/xlsx.py` module
    is the source of truth for
    turning a real spreadsheet
    into one or more
    ``ExtractedTable`` records.

    ``source_kind`` distinguishes
    the file the table came
    from:

      * ``"pdf_native"`` --
        PyMuPDF extracted a
        vector table from the
        PDF body
      * ``"xlsx"`` -- a
        companion spreadsheet
        delivered alongside
        the PDF
      * ``"csv"`` -- a
        companion CSV/TSV
        file
      * ``"ocr"`` -- a
        screenshot of a
        table inside the PDF
        (extracted via the
        ``extract_table_from_image``
        tool)

    ``source_path`` is the
    absolute path to the file
    the table came from so the
    renderer can quote it back
    to the user.
    """

    # Stable identifier
    # so tools can
    # quote a
    # specific table.
    table_id: str
    # ``"pdf_native"``
    # / ``"xlsx"``
    # / ``"csv"``
    # / ``"ocr"``.
    source_kind: str
    source_path: str
    # Sheet name
    # when the
    # source has
    # multiple
    # sheets;
    # empty
    # string
    # otherwise.
    sheet_name: str
    # 0-based
    # position
    # within the
    # file. For
    # XLSX this
    # is the
    # 0-based
    # sheet index;
    # for a
    # PDF-native
    # table this
    # is the
    # 0-based
    # page where
    # the table
    # was
    # found.
    source_index: int
    headers: list[str]
    # Each row
    # is a list
    # of cells
    # stored as
    # strings.
    # Numeric
    # coercion
    # happens in
    # the
    # detector.
    rows: list[list[str]]
    # R-2026-06-19 (Phase
    # C,
    # per-fig
    # xlsx):
    # if this
    # table
    # comes
    # from a
    # multi-fig
    # sheet
    # (very
    # common
    # in
    # Nature
    # /
    # Science
    # SI
    # data),
    # the
    # ``fig_name``
    # carries
    # the
    # matched
    # header
    # text
    # (e.g.
    # ``"Fig.S1a"``)
    # so the
    # detector
    # title
    # and
    # the
    # renderer
    # can
    # tell
    # the
    # user
    # *which*
    # fig
    # a
    # finding
    # belongs
    # to.
    # ``""``
    # for
    # single-table
    # sheets
    # (no
    # fig
    # headers
    # found).
    fig_name: str = ""
    # R-2026-06-19 (Phase
    # C):
    # the
    # fig-boundary
    # detector's
    # bbox
    # so the
    # user
    # can
    # see
    # exactly
    # which
    # rows
    # /
    # cols
    # in the
    # source
    # sheet
    # this
    # table
    # covers
    # (e.g.
    # ``{"top": 0, "bottom": 5, "left": 0, "right": 2}``
    # for
    # a
    # fig
    # that
    # spans
    # rows
    # 1-6
    # and
    # cols
    # 1-3
    # in
    # 1-indexed
    # terms).
    # ``None``
    # for
    # legacy
    # /
    # non-fig
    # tables
    # (CSV,
    # PDF-native,
    # text-stat).
    bbox: dict[str, int] | None = None
    # Cells visibly marked in the source spreadsheet
    # (for example a yellow fill/highlight). Coordinates are
    # 0-based relative to ``rows`` / ``headers`` plus 1-based
    # source spreadsheet coordinates for audit traceability.
    highlighted_cells: list[dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class ParsedDoc:
    """A PDF plus any companion figures, normalized for detectors."""

    trace_id: str
    source_path: str
    text_blocks: list[TextBlock]
    images: list[ExtractedImage]
    metadata: dict[str, Any]
    # Tabular data
    # extracted from
    # the PDF body
    # AND from
    # companion
    # files (XLSX,
    # CSV) the user
    # uploaded
    # alongside the
    # PDF. The
    # table-
    # statistics
    # detectors
    # (``BenfordDetector``,
    # ``DuplicateRowDetector``,
    # ``OutlierDetector``,
    # ``RoundBiasDetector``)
    # iterate this
    # list. ``[]``
    # means no tables
    # were extracted
    # (legacy
    # callers keep
    # working
    # because the
    # field has a
    # default).
    tables: list[ExtractedTable] = field(
        default_factory=list
    )

    @property
    def page_count(self) -> int:
        if not self.text_blocks:
            return 0
        return max(b.page for b in self.text_blocks) + 1


@dataclass(frozen=True)
class AnalysisResult:
    trace_id: str
    findings: list[Finding]
    detectors_run: list[str]
    llm_calls: int
    duration_ms: int


# ---------- chat transcript DTO ----------
#
# Shared message shape for workspace TUI / session logs.
# The conversational ``chat_app`` TUI was removed (product B+C only);
# do not reintroduce imports from a deleted ``manusift.tui.chat_app``.
@dataclass
class ChatMessage:
    """One line in a transcript.

    ``role`` is ``"user"`` / ``"assistant"`` / ``"system"`` / ``"tool"``.
    Mutable so callers can fill ``timestamp`` after construction.
    """
    role: str
    content: str
    tool_name: str | None = None  # for "tool" rows
    timestamp: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "role": self.role,
            "content": self.content,
            "tool_name": self.tool_name,
            "timestamp": self.timestamp,
        }

    @classmethod
    def from_dict(
        cls, d: dict[str, Any]
    ) -> "ChatMessage":
        return cls(
            role=d["role"],
            content=d["content"],
            tool_name=d.get("tool_name"),
            timestamp=float(
                d.get("timestamp", 0.0)
            ),
        )


@dataclass
class JobState:
    """In-memory job record. Reset on process restart (Step 1 ok)."""

    trace_id: str
    status: JobStatus
    created_at: float = field(default_factory=time.time)
    finished_at: float | None = None
    error: str | None = None
    source_filename: str = ""
    detectors_run: list[str] = field(default_factory=list)
    finding_count: int = 0
    duration_ms: int = 0
    # Step H5: live progress (incremented as detectors finish).
    # ``completed`` mirrors the names in ``detectors_run`` so the
    # progress endpoint can answer "X out of N done" without
    # scanning the steps/ directory.
    completed_steps: list[str] = field(default_factory=list)
    current_step: str | None = None
    failed_steps: list[str] = field(default_factory=list)
    # P1-A — owner of the job. Default empty string
    # because the multi-user work (P1-B / JWT) is
    # deferred. The column is here so the SQLite
    # schema is forward-compatible: when JWT
    # auth lands, we just start writing
    # ``user_id`` into this slot.
    user_id: str = ""
    # P1-A — last time this row was touched. The
    # SQLite store stamps this on every ``set()``
    # so a future ``/api/jobs`` listing can sort by
    # "recently active" instead of "created_at".
    updated_at: float = 0.0
