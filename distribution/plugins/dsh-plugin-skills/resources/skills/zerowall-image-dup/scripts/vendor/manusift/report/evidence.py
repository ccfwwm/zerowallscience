"""Evidence Report schema (R-2026-06-12).

The pre-existing
``manusift.report.builder``
renders a *flat dump* of
``Finding`` objects. The
new evidence report layers
on top of that to add
**visual crops, side-by-side
comparisons, numerical
explanation cards, and a
machine-readable evidence
index**.

This module owns:

  * The dataclasses that
    describe a single piece
    of evidence (one visual
    comparison, one numerical
    finding, one source-data
    link, one metadata
    flag).
  * The provenance labels
    that turn a raw
    ``Finding`` into a
    human-readable
    "Page 7 · Fig. 2A · bbox=..."
    string.
  * The severity/confidence
    mapping the report
    renderer relies on.

The actual evidence
*generation* (cropping
images, computing GRIM
explanations, copying
source images into the
output dir) lives in
``visual_evidence`` and
``data_evidence``. This
module is data + helpers.
"""
from __future__ import annotations

import base64
import html
import json
from dataclasses import asdict, dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any


class Severity(str, Enum):
    """Audit report severity levels.

    The values are
    **intentionally** the
    same strings the
    existing ``Finding``
    schema already uses
    (``info`` / ``low`` /
    ``medium`` / ``high``)
    so we don't have to
    bridge two vocabularies.
    ``critical`` is a new
    top tier reserved for
    cases where an official
    retraction source
    confirms the issue
    (case_005 retraction
    text + multiple high-
    confidence ManuSift
    findings)."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class FindingType(str, Enum):
    """Coarse classification of evidence.

    Used by the evidence map
    to group findings
    visually (Visual /
    Numerical / Metadata /
    Reference / Compliance)."""

    IMAGE_SIMILARITY = "image_similarity"
    NUMERICAL_CONSISTENCY = "numerical_consistency"
    METADATA = "metadata"
    REFERENCE = "reference"
    COMPLIANCE = "compliance"
    TEXT_PATTERN = "text_pattern"
    UNKNOWN = "unknown"


@dataclass
class BoundingBox:
    """A rectangular crop in the source image.

    Coordinates are in the
    source image's native
    pixel space
    (PIL.Image.size
    coordinate system:
    (left, top, right,
    bottom))."""

    x0: int
    y0: int
    x1: int
    y1: int

    def as_tuple(self) -> tuple[int, int, int, int]:
        return (self.x0, self.y0, self.x1, self.y1)


@dataclass
class Location:
    """Provenance label for one side of a visual comparison.

    R-2026-06-12: the user
    spec is explicit that
    every crop must carry
    page, figure, panel,
    bbox, source image path,
    and detector score. We
    keep all of those here
    even if some are
    ``None`` for image-only
    findings that have no
    panel / figure parsing
    yet. Optional fields
    make the schema
    forgiving of detector
    heterogeneity."""

    # 1-based
    # page
    # number
    # as
    # found
    # in
    # the
    # PDF.
    page: int | None = None
    # 0-based
    # index
    # of
    # the
    # image
    # on
    # that
    # page.
    image_index: int | None = None
    # Human-readable
    # figure
    # number
    # ("Fig.
    # 2")
    # if
    # the
    # alignment
    # step
    # parsed
    # it.
    figure: str | None = None
    # Panel
    # letter
    # ("A",
    # "B",
    # "C")
    # if
    # parsed.
    panel: str | None = None
    # Bounding
    # box
    # in
    # the
    # source
    # image.
    bbox: BoundingBox | None = None
    # Absolute
    # path
    # to
    # the
    # source
    # image
    # (the
    # raw
    # extracted
    # image
    # before
    # cropping).
    source_image: str | None = None
    # PyMuPDF
    # image
    # xref
    # when
    # known.
    xref: int | None = None
    # Detector's
    # own
    # score
    # for
    # this
    # side
    # (e.g.
    # pHash
    # distance,
    # SSIM).
    score: float | None = None
    # Detector-specific
    # notes
    # about
    # this
    # side.
    note: str | None = None

    def label(self) -> str:
        """Short provenance label like
        "Page 7 · Fig. 2 · Panel A".

        R-2026-06-12: the user
        spec wants a compact
        provenance label that
        fits above / below
        each crop. The
        ``short`` form omits
        the bbox; the full
        label includes it for
        the audit log."""

        parts: list[str] = []
        if self.page is not None:
            parts.append(f"Page {self.page}")
        if self.figure:
            parts.append(f"Fig. {self.figure}")
        if self.panel:
            parts.append(f"Panel {self.panel}")
        return " · ".join(parts) if parts else "unknown location"

    def full_label(self) -> str:
        base = self.label()
        if self.bbox is not None:
            return f"{base} · bbox=({self.bbox.x0},{self.bbox.y0},{self.bbox.x1},{self.bbox.y1})"
        return base


@dataclass
class VisualFinding:
    """One side-by-side image comparison.

    The two ``Location``
    objects (a and b)
    describe the cropped
    regions; ``metrics``
    carries the detector
    scores; ``assets`` lists
    every file we wrote
    (crop, side-by-side,
    overlay, etc.) so the
    renderer can link them.
    ``reasoning`` and
    ``limitations`` are
    short human-readable
    strings -- the spec is
    explicit that the report
    must explain *why* a
    match is suspicious and
    *what we don't know*
    about it."""

    finding_id: str
    severity: Severity
    confidence: float
    detector: str
    summary: str
    location_a: Location
    location_b: Location
    metrics: dict[str, Any] = field(default_factory=dict)
    assets: dict[str, str] = field(default_factory=dict)
    reasoning: str = ""
    limitations: list[str] = field(default_factory=list)
    manual_review: list[str] = field(default_factory=list)
    # The raw finding object so the audit log can quote it.
    raw_finding: dict[str, Any] | None = None


@dataclass
class NumericalFinding:
    """One data-consistency flag with explanation.

    ``test`` carries the
    exact rule applied
    (GRIM, p-value
    recomputation, sample-
    size / percentage
    consistency, etc.);
    ``values`` is the raw
    input; ``result`` is the
    human-readable category
    (impossible /
    inconsistent /
    unusual / weak / not
    testable); ``severity``
    follows the same scale
    as VisualFinding."""

    finding_id: str
    severity: Severity
    confidence: float
    detector: str
    summary: str
    location: Location
    test_name: str
    test_description: str
    input_values: dict[str, Any] = field(default_factory=dict)
    expected_constraint: str = ""
    observed_value: str = ""
    result: str = ""  # impossible / inconsistent / unusual / weak / not_testable
    reasoning: str = ""
    limitations: list[str] = field(default_factory=list)
    raw_finding: dict[str, Any] | None = None


@dataclass
class MetadataFinding:
    """A non-image, non-numerical flag (reference, compliance, etc.)."""

    finding_id: str
    severity: Severity
    confidence: float
    detector: str
    summary: str
    location: Location
    reasoning: str = ""
    limitations: list[str] = field(default_factory=list)
    raw_finding: dict[str, Any] | None = None


@dataclass
class EvidenceIndex:
    """Top-level container the renderer reads.

    The renderer walks
    ``visual_findings``,
    ``numerical_findings``,
    and ``metadata_findings``
    and groups them by
    severity in the
    Evidence Map. The
    ``summary`` carries the
    count-by-severity
    dict used by the
    Executive Summary."""

    trace_id: str
    paper_id: str
    detectors_run: list[str]
    summary: dict[str, int] = field(default_factory=dict)
    visual_findings: list[VisualFinding] = field(default_factory=list)
    numerical_findings: list[NumericalFinding] = field(default_factory=list)
    metadata_findings: list[MetadataFinding] = field(default_factory=list)
    method_trace: dict[str, Any] = field(default_factory=dict)
    source_map: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Serialise to the JSON shape on disk.

        We ``asdict`` the
        dataclasses and then
        serialise the
        ``Severity`` /
        ``Location`` /
        ``BoundingBox`` enum
        members. We do NOT
        dump raw finding JSON
        inline -- the spec
        explicitly says raw
        trace JSON goes in the
        appendix, not the
        main report."""

        def _encode(o: Any) -> Any:
            if isinstance(o, Severity):
                return o.value
            if isinstance(o, BoundingBox):
                return o.as_tuple()
            if isinstance(o, Location):
                return {
                    "page": o.page,
                    "image_index": o.image_index,
                    "figure": o.figure,
                    "panel": o.panel,
                    "bbox": o.as_tuple() if o.bbox else None,
                    "source_image": o.source_image,
                    "xref": o.xref,
                    "score": o.score,
                    "note": o.note,
                }
            if isinstance(o, (set, frozenset)):
                return list(o)
            if isinstance(o, Path):
                return str(o)
            if hasattr(o, "item"):
                try:
                    return o.item()
                except Exception:  # noqa: BLE001
                    pass
            raise TypeError(f"unsupported: {type(o)}")

        def _normalise_finding(f: Any) -> dict[str, Any]:
            d = asdict(f)
            # The
            # schema
            # says
            # ``expected_constraint``
            # and
            # ``observed_value``
            # are
            # strings,
            # but
            # some
            # explainers
            # leave
            # them
            # as
            # numbers
            # or
            # lists
            # --
            # normalise
            # here
            # so
            # the
            # JSON
            # is
            # always
            # shape-stable.
            for key in ("expected_constraint", "observed_value"):
                val = d.get(key)
                if val is None:
                    continue
                if isinstance(val, list):
                    d[key] = " | ".join(str(x) for x in val)
                elif not isinstance(val, str):
                    d[key] = str(val)
            return d

        return {
            "trace_id": self.trace_id,
            "paper_id": self.paper_id,
            "detectors_run": self.detectors_run,
            "summary": self.summary,
            "visual_findings": [_normalise_finding(f) for f in self.visual_findings],
            "numerical_findings": [_normalise_finding(f) for f in self.numerical_findings],
            "metadata_findings": [_normalise_finding(f) for f in self.metadata_findings],
            "method_trace": self.method_trace,
            "source_map": self.source_map,
        }


# Map
# the
# detector
# name
# to
# the
# coarse
# evidence
# category.
# R-2026-06-12:
# The
# user
# spec
# asks
# the
# report
# to
# separate
# Visual
# /
# Numerical
# /
# Metadata
# /
# Reference
# /
# Compliance
# findings.
# The
# mapping
# here
# is
# based
# on
# the
# detectors
# that
# were
# in
# the
# pipeline
# as
# of
# v9.
DETECTOR_CATEGORY: dict[str, FindingType] = {
    "image_dup": FindingType.IMAGE_SIMILARITY,
    "image_forensics": FindingType.IMAGE_SIMILARITY,
    "image_sift_copymove": FindingType.IMAGE_SIMILARITY,
    "imagehash_dup": FindingType.IMAGE_SIMILARITY,
    "image_noise_inconsistency": FindingType.IMAGE_SIMILARITY,
    "page_raster_dup": FindingType.IMAGE_SIMILARITY,
    "panel_dup": FindingType.IMAGE_SIMILARITY,
    "stat_grim": FindingType.NUMERICAL_CONSISTENCY,
    "stat_pvalue": FindingType.NUMERICAL_CONSISTENCY,
    "stat_percent": FindingType.NUMERICAL_CONSISTENCY,
    "stat_consistency": FindingType.NUMERICAL_CONSISTENCY,
    "figure_grim": FindingType.NUMERICAL_CONSISTENCY,
    "figure_stat_text": FindingType.NUMERICAL_CONSISTENCY,
    "metadata": FindingType.METADATA,
    "table_stats": FindingType.NUMERICAL_CONSISTENCY,
    "author_emails": FindingType.METADATA,
    "citation_network": FindingType.REFERENCE,
    "supplementary": FindingType.REFERENCE,
    "compliance": FindingType.COMPLIANCE,
    "data_availability_concern": FindingType.COMPLIANCE,
    "text_patterns": FindingType.TEXT_PATTERN,
    "paper_mill_template": FindingType.TEXT_PATTERN,
}


# Severity
# promotion
# based
# on
# the
# detector
# signal.
# R-2026-06-12:
# The
# user
# spec
# defines
# the
# 5-level
# audit
# severity
# (critical/high/medium/low/info)
# and
# also
# says
# "if
# an
# official
# source
# confirms
# the
# issue
# we
# can
# promote
# to
# critical".
# We
# don't
# have
# the
# official
# gold
# inside
# the
# report
# layer
# (it's
# only
# used
# by
# the
# alignment
# script
# to
# compute
# coverage),
# so
# the
# promotion
# happens
# via
# the
# ``_promote_severity`` helper
# below
# --
# callers
# can
# pass
# in
# a
# confirmed_official
# flag.
SEVERITY_RANK = {
    Severity.INFO: 0,
    Severity.LOW: 1,
    Severity.MEDIUM: 2,
    Severity.HIGH: 3,
    Severity.CRITICAL: 4,
}


def promote_severity(
    base: Severity,
    *,
    hamming: int | None = None,
    impossible: bool = False,
    confirmed_official: bool = False,
) -> Severity:
    """Promote a finding's severity based on signal strength.

    The user's spec lists
    the audit severity
    levels and the
    rationale. We
    implement a small set
    of promotion rules:

      * ``impossible=True``
        promotes
        medium
        ->
        high
        (e.g.
        GRIM
        "no
        integer
        k
        produces
        this
        percentage
        with
        this
        n").
      * ``hamming<=2``
        promotes
        medium
        ->
        high
        (a
        near-
        exact
        pHash
        match).
      * ``confirmed_official=True``
        promotes
        high
        ->
        critical."""

    rank = SEVERITY_RANK[base]
    if impossible and rank < SEVERITY_RANK[Severity.HIGH]:
        rank = SEVERITY_RANK[Severity.HIGH]
    if hamming is not None and hamming <= 2 and rank < SEVERITY_RANK[Severity.HIGH]:
        rank = SEVERITY_RANK[Severity.HIGH]
    if confirmed_official and rank < SEVERITY_RANK[Severity.CRITICAL]:
        rank = SEVERITY_RANK[Severity.CRITICAL]
    # Map
    # rank
    # back
    # to
    # enum
    for sev, r in SEVERITY_RANK.items():
        if r == rank:
            return sev
    return base


def write_evidence_index(index: EvidenceIndex, out_path: Any) -> None:
    """Serialise an evidence index to a JSON file.

    R-2026-06-12: the user
    spec wants
    ``evidence/evidence_index.json``
    to be the machine-
    readable entry point.
    We write it
    pretty-printed with
    UTF-8 so the HTML
    report can fetch and
    embed it."""

    out_path.write_text(
        json.dumps(
            index.to_dict(),
            indent=2,
            ensure_ascii=False,
            default=_json_default,
        ),
        encoding="utf-8",
    )


def _json_default(o: Any) -> Any:
    """JSON encoder fallback for numpy / Path / set.

    R-2026-06-12: when
    writing evidence JSON
    some fields (e.g. cell
    coords from
    image_forensics) are
    numpy intc. ``json``
    can't serialise them
    directly."""

    if hasattr(o, "item"):
        try:
            return o.item()
        except Exception:  # noqa: BLE001
            pass
    if isinstance(o, (set, frozenset)):
        return list(o)
    if isinstance(o, Path):
        return str(o)
    raise TypeError(f"not serialisable: {type(o)}")
