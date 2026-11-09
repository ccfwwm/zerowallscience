"""Detector-as-tool metadata helpers (R-audit, 2026-06-10).

The project has 31 detector
classes today, but only 8
were exposed as LLM-callable
tools before this audit.
Each of the remaining 23
detectors had a working
``run(doc)`` method but no
LLM-facing wrapper, so the
agent loop could not call
them.

This module closes that
gap by:

  1. Tagging every detector
     with a category
     (image / text / stat /
     metadata / ref /
     compliance / ...)
     so the LLM's tool
     description mentions
     the right context,
     and the system-prompt
     cheat sheet can group
     them.

  2. Building a wrapper
     (``CategorisedDetectorTool``)
     that wraps the
     existing
     ``tool_from_detector``
     adapter and prepends
     the category to the
     description so the
     LLM can see at a
     glance which tool
     belongs to which
     detector family.

  3. Exposing
     ``register_all_detectors()``
     which returns a
     ``Tool`` for every
     detector class
     ``iter_registered_detectors()``
     yields. The
     ``tools/registry.py``
     call site is a
     single line.

A new detector added to
``manusift/detectors/__init__.py``
``__all__`` automatically
becomes a tool, with no
further wiring.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .detector_adapter import DEFAULT_INPUT_SCHEMA, DetectorToolAdapter
from .tool import Tool, ToolContext


# The category map is the
# single source of truth
# for "which detector
# family does this tool
# belong to?". The keys
# are detector ``.name``
# attributes (the snake-
# case identifier the LLM
# sees as the tool name);
# the values are short
# English strings that
# get prepended to the
# tool description so
# the system-prompt cheat
# sheet ends up organised
# even before the LLM
# reads each description.
#
# Detectors not listed
# here get the fallback
# category "general".
DETECTOR_CATEGORY: dict[str, str] = {
    # ---- metadata
    # / file format
    "metadata": "metadata",
    "pdf_metadata": "metadata",
    "supplementary": "metadata",
    # ---- image
    # forensics
    # (visual
    # integrity)
    "image_dup": "image",
    "cross_paper_image": "image",
    "image_forensics": "image",
    "image_ssim": "image",
    "image_sift_copymove": "image",
    "image_statistics": "image",
    "image_noise_inconsistency": "image",
    "panel_duplicate": "image",
    # ---- imagehash
    # (perceptual
    # hashes --
    # auxiliary
    # to image_dup)
    "imagehash_ahash": "imagehash",
    "imagehash_dhash": "imagehash",
    "imagehash_phash": "imagehash",
    "imagehash_whash": "imagehash",
    # ---- AI-generated-figure
    # (R-2026-06-13, P0-AI patch). Detects Midjourney / DALL-E /
    # ComfyUI / C2PA provenance in PDF metadata. Categorised
    # under "image" because the underlying concern is image
    # integrity (the figure is AI-generated, not a real image).
    "ai_generated_figure": "image",
    # ---- paper-mill authorship
    # (R-2026-06-13, P0-PEER patch). Affiliation concentration +
    # tortured-phrase density. Categorised under "metadata" because
    # the underlying signal is the author block + abstract, not
    # the figures themselves.
    "paper_mill_authorship": "metadata",
    # ---- text /
    # language
    "text_patterns": "text",
    "text_tortured_phrases": "text",
    "paper_mill_template": "text",
    # ---- references
    # / citations
    "citation_network": "reference",
    "cited_retraction": "reference",
    "ref_duplicate": "reference",
    "ref_format_anomaly": "reference",
    # ---- statistical
    # consistency
    # (numbers)
    "stat_grim": "statistical",
    "stat_pvalue": "statistical",
    "stat_percent": "statistical",
    "stat_pvalue_pileup": "statistical",
    "stat_sprite": "statistical",
    "stat_corr_psd": "statistical",
    # ---- table /
    # data-source
    # statistics
    "table_benford": "table",
    "table_duplicate_row": "table",
    "table_outlier": "table",
    "table_round_bias": "table",
    "table_relationships": "table",
    "table_near_duplicate_row": "table",
    "table_cross_copy": "table",
    "table_file_metadata": "table",
    "table_forensics": "table",
    # 2026-07 coverage fix: these existed in the registry
    # but had no category mapping.
    "table_highlight_focus": "table",
    "source_data_consistency": "table",
    # ---- charts
    # / figure
    # cross-check
    "chart_data_extract": "chart",
    "figure_table_consistency": "chart",
    "forest_plot": "chart",
    "figure_table_ocr": "chart",
    # ---- metadata
    # about people
    # / compliance
    "author_emails": "compliance",
    "compliance": "compliance",
    # R-2026-06-12: data-availability-concern is a text
    # classification detector that reads the
    # data-availability section for red-flag phrasing.
    # Group it with compliance because it shares the same
    # "policy / journal-required disclosure" theme.
    "data_availability_concern": "compliance",
    # R-2026-06-12: page-raster duplicate detector is
    # a complement to image_dup that handles vector-drawing
    # figures. Group it with image because it shares the
    # "visual integrity" theme.
    "page_raster_dup": "image",
    # R-2026-06-12: panel-duplicate detector is a
    # specialisation of page_raster_dup that splits
    # figure regions into panels. Same category.
    "panel_dup": "image",
    # R-2026-06-12: figure-body stat-text detector
    # uses EasyOCR on figure regions. It is a
    # *text* classification detector so it lives in
    # the text category, not image.
    "figure_stat_text": "text",
    # R-2026-06-12: figure-body GRIM consistency
    # detector reuses the same OCR pass and runs
    # the GRIM test (Brown & Heathers 2016) on every
    # recognised percentage. Statistical category.
    "figure_grim": "statistical",
}


# Human-readable label
# for each category. The
# description prefix uses
# these so the LLM sees
# ``[image]`` /
# ``[statistical]`` /
# ``[table]`` in front of
# every tool, in addition
# to a one-line "when to
# use" hint.
CATEGORY_LABEL: dict[str, str] = {
    "metadata": "[metadata]",
    "image": "[image]",
    "imagehash": "[imagehash]",
    "text": "[text]",
    "reference": "[reference]",
    "statistical": "[statistical]",
    "table": "[table]",
    "chart": "[chart]",
    "compliance": "[compliance]",
    "general": "[general]",
}


# Per-category "when to
# use" hint -- one short
# English line that goes
# into the tool description
# so the LLM does not have
# to discover it by trial
# and error. Lines end
# with no period so the
# concatenation with the
# detector's own
# docstring does not
# double-up.
CATEGORY_HINT: dict[str, str] = {
    "metadata": (
        "Use when the user asks about the PDF's metadata, "
        "embedded files, or file-format-level integrity"
    ),
    "image": (
        "Use when the user asks about figures, image "
        "duplicates, JPEG / ELA artefacts, copy-move, "
        "panels, or visual integrity of the figures"
    ),
    "imagehash": (
        "Auxiliary perceptual-hash view; prefer image_dup "
        "for the canonical hash-based duplicate check"
    ),
    "text": (
        "Use when the user asks about the writing itself: "
        "tortured phrases, paper-mill templates, "
        "copy-paste loops, or language anomalies"
    ),
    "reference": (
        "Use when the user asks about citations, "
        "reference list hygiene, or Crossref-validated "
        "DOIs"
    ),
    "statistical": (
        "Use when the user asks about numeric consistency: "
        "GRIM, p-value distributions, last-digit bias, "
        "divisibility anomalies"
    ),
    "table": (
        "Use when the user asks about tabular data sources "
        "(XLSX / CSV) attached to the paper; runs Benford, "
        "duplicate-row, outlier, and round-bias checks on "
        "the headers + rows parsed by the data-source "
        "ingest"
    ),
    "chart": (
        "Use when the user asks about chart consistency, "
        "data extraction from chart figures, or figure-text "
        "cross-checks"
    ),
    "compliance": (
        "Use when the user asks about author emails, "
        "compliance statements (data availability, "
        "ethics, conflicts of interest), or author "
        "metadata"
    ),
    "general": "Use on user request; output shape is the standard Finding list",
}


DETECTOR_DESCRIPTION: dict[str, str] = {
    "image_dup": (
        "Run the canonical image-duplicate detector for the current paper. "
        "It compares extracted figures and embedded images with perceptual "
        "hashes, especially pHash, and reports suspicious pairs by Hamming "
        "distance. Use it when the user asks whether panels, microscopy "
        "images, plots, photos, or other figure assets have been reused, "
        "near-duplicated, lightly transformed, or copied across pages. The "
        "tool returns standard ManuSift findings with page/location evidence "
        "and hash-distance details so the agent can explain why a pair needs "
        "visual inspection."
    ),
    "image_forensics": (
        "Run image-forensics checks over extracted figures. It looks for "
        "signals such as error-level-analysis anomalies, suspicious editing "
        "traces, and visual regions that deserve manual inspection. Use it "
        "when the user asks whether figures may have been composited, edited, "
        "or manipulated rather than merely duplicated."
    ),
    "text_patterns": (
        "Run the text-pattern dispatcher for the current paper. This tool is "
        "a facade over several text-level checks, including chatbot-style "
        "disclaimers, duplicated passages, suspicious boilerplate, repeated "
        "phrasing, and other language anomalies that can indicate generated "
        "or copied manuscript text. Use it when the user asks about writing "
        "authenticity, AI-like phrases, repeated paragraphs, or paper-mill "
        "style textual artifacts."
    ),
}


@dataclass
class _LazyDetectorAdapter:
    class_name: str
    detector_name: str

    @property
    def name(self) -> str:
        return self.detector_name

    def description(self) -> str:
        return DETECTOR_DESCRIPTION.get(
            self.detector_name,
            (
                f"Run the {self.detector_name} detector for the current "
                "paper. The tool executes one ManuSift detector and returns "
                "standard findings with severity, evidence, location, and "
                "raw details for downstream explanation."
            ),
        )

    def input_schema(self) -> dict[str, Any]:
        return DEFAULT_INPUT_SCHEMA

    def execute(self, input: dict[str, Any], ctx: ToolContext) -> str:
        from ..detectors import load_detector_class
        from .detector_adapter import tool_from_detector

        detector = load_detector_class(self.class_name)()
        return tool_from_detector(detector).execute(input, ctx)


@dataclass
class CategorisedDetectorTool:
    """Wrap a ``tool_from_detector``
    output and prepend the
    category label + hint to
    its description.

    The LLM-facing API stays
    identical (the tool
    name and input schema
    do not change), so
    callers that already
    knew the old tool names
    keep working.

    The ``run(doc, settings=None)``
    signature for
    ``CitationNetworkDetector``
    is the only detector
    with an extra kwarg; we
    handle it by passing
    ``settings=None`` (the
    detector's default
    already calls
    ``get_settings()``).
    """

    adapter: DetectorToolAdapter | _LazyDetectorAdapter
    category: str
    detector_obj: Any

    @property
    def name(self) -> str:
        return self.adapter.name

    def description(self) -> str:
        prefix = CATEGORY_LABEL.get(
            self.category, CATEGORY_LABEL["general"]
        )
        hint = CATEGORY_HINT.get(
            self.category, CATEGORY_HINT["general"]
        )
        # The
        # adapter
        # already
        # asks
        # the
        # detector
        # for
        # its
        # docstring;
        # we
        # only
        # add
        # the
        # category
        # context
        # in
        # front.
        original = self.adapter.description()
        return (
            f"{prefix} {hint}. Detector description: "
            f"{original}"
        )

    def input_schema(self) -> dict[str, Any]:
        return self.adapter.input_schema()

    def execute(
        self,
        input: dict[str, Any],
        ctx: ToolContext,
    ) -> str:
        # If
        # the
        # detector
        # accepts
        # a
        # ``settings``
        # kwarg
        # (currently
        # only
        # CitationNetworkDetector),
        # pass
        # ``None``
        # so
        # it
        # falls
        # back
        # to
        # ``get_settings()``.
        # For
        # all
        # other
        # detectors
        # the
        # adapter's
        # ``execute``
        # calls
        # ``self._detector.run(doc)``
        # with
        # no
        # extras.
        return self.adapter.execute(input, ctx)


def _category_for(detector_name: str) -> str:
    """Return the
    category key for a
    detector name.
    Falls back to
    ``"general"`` for
    detectors added
    later without an
    explicit category.
    """
    return DETECTOR_CATEGORY.get(detector_name, "general")


def register_all_detectors() -> list[Tool]:
    """Wrap every detector
    in ``iter_registered_detectors()``
    as a categorised
    tool.

    Called once by
    ``tools/registry.py``.
    Adding a new detector
    is a one-line change
    in
    ``manusift/detectors/__init__.py``;
    no further wiring is
    needed to surface it
    to the LLM.

    The function is
    deliberately defensive:
    a detector that fails
    to wrap (e.g. because
    its constructor raises)
    is logged and skipped,
    so one buggy detector
    does not break the
    entire agent loop.
    """
    from .. import detectors as det_mod
    from .detector_adapter import tool_from_detector

    tools: list[Tool] = []
    if (
        getattr(det_mod.iter_registered_detectors, "__module__", "")
        == "manusift.detectors"
    ):
        for class_name in det_mod.detector_class_names():
            detector_name = det_mod.detector_name_for_class(class_name)
            adapter = _LazyDetectorAdapter(
                class_name=class_name,
                detector_name=detector_name,
            )
            cat = _category_for(adapter.name)
            tools.append(
                CategorisedDetectorTool(
                    adapter=adapter,
                    category=cat,
                    detector_obj=None,
                )
            )
        return tools

    for detector in det_mod.iter_registered_detectors():
        try:
            adapter = tool_from_detector(detector)
        except Exception:
            # Constructor
            # failed
            # --
            # log
            # and
            # move
            # on.
            import logging

            log = logging.getLogger(__name__)
            log.warning(
                "could not wrap detector as tool",
                extra={
                    "detector": getattr(
                        detector, "name", "?"
                    )
                },
                exc_info=True,
            )
            continue
        cat = _category_for(adapter.name)
        tools.append(
            CategorisedDetectorTool(
                adapter=adapter,
                category=cat,
                detector_obj=detector,
            )
        )
    return tools


def category_counts(
    tools: list[Tool],
) -> dict[str, int]:
    """Group tools by
    their category label
    so the system-prompt
    cheat-sheet builder
    can list them in a
    stable order.

    This is exposed (not
    just a private helper)
    because the test suite
    asserts on the counts
    in
    ``tests/test_detector_tool_coverage.py``.
    """
    counts: dict[str, int] = {}
    for t in tools:
        cat = _category_for(t.name)
        counts[cat] = counts.get(cat, 0) + 1
    return counts
