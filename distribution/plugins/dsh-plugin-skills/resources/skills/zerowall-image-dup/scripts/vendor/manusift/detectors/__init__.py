"""Lightweight detector registry.

The public API still supports ``from manusift.detectors import
MetadataDetector`` and ``iter_registered_detectors()``, but importing this
package no longer imports every detector implementation. Several image/OCR
detectors pull in numpy, OpenCV, EasyOCR, or Torch; importing them during
pytest collection made a plain ``python -m pytest -q`` consume gigabytes of
memory before most tests had even started.

Detector metadata lives in ``_DETECTOR_SPECS``. Class objects are imported
only when a caller asks for a specific detector or iterates the full registry.
"""
from __future__ import annotations

from dataclasses import dataclass
from importlib import import_module
from typing import Iterable

from .base import Detector, DetectorResult, run_detectors
from .registry import entry_point_names, iter_entrypoint_detectors


@dataclass(frozen=True)
class DetectorSpec:
    class_name: str
    module: str
    detector_name: str


_DETECTOR_SPECS: tuple[DetectorSpec, ...] = (
    DetectorSpec("AIGeneratedFigureDetector", "ai_generated_figure", "ai_generated_figure"),
    DetectorSpec("AHashDetector", "imagehash_dup", "imagehash_ahash"),
    DetectorSpec("PaperMillAuthorshipDetector", "paper_mill_authorship", "paper_mill_authorship"),
    DetectorSpec("AuthorEmailAnalyzer", "author_emails", "author_emails"),
    DetectorSpec("BenfordDetector", "table_stats", "table_benford"),
    DetectorSpec("ChartDataExtractorDetector", "chart_data_extract", "chart_data_extract"),
    DetectorSpec("CitationNetworkDetector", "citation_network", "citation_network"),
    DetectorSpec("CitedRetractionDetector", "cited_retraction", "cited_retraction"),
    DetectorSpec("ComplianceStatementDetector", "compliance", "compliance"),
    DetectorSpec("DHashDetector", "imagehash_dup", "imagehash_dhash"),
    DetectorSpec("DataAvailabilityConcernDetector", "data_availability_concern", "data_availability_concern"),
    DetectorSpec("DuplicateReferenceDetector", "references", "ref_duplicate"),
    DetectorSpec("DuplicateRowDetector", "table_stats", "table_duplicate_row"),
    DetectorSpec("FigureGRIMDetector", "figure_grim", "figure_grim"),
    DetectorSpec("FigureStatTextDetector", "figure_stat_text", "figure_stat_text"),
    DetectorSpec("FigureTableOCRDetector", "figure_table_ocr", "figure_table_ocr"),
    DetectorSpec("FigureTextCrossCheckDetector", "figure_table_consistency", "figure_table_consistency"),
    DetectorSpec("ForestPlotDetector", "forest_plot", "forest_plot"),
    DetectorSpec(
        "SourceDataConsistencyDetector",
        "source_data_consistency",
        "source_data_consistency",
    ),
    DetectorSpec("GrimTestDetector", "stat_consistency", "stat_grim"),
    DetectorSpec(
        "PValuePileupDetector", "stat_extra", "stat_pvalue_pileup"
    ),
    DetectorSpec("SpriteLiteDetector", "stat_extra", "stat_sprite"),
    DetectorSpec(
        "CorrelationMatrixPSDDetector", "stat_extra", "stat_corr_psd"
    ),
    DetectorSpec("ImageDuplicateDetector", "image_dup", "image_dup"),
    DetectorSpec(
        "CrossPaperImageDetector", "cross_paper_image", "cross_paper_image"
    ),
    DetectorSpec("ImageForensicsDetector", "image_forensics", "image_forensics"),
    DetectorSpec("ImageStatisticsDetector", "image_statistics", "image_statistics"),
    DetectorSpec("MetadataDetector", "metadata", "metadata"),
    DetectorSpec("NoiseInconsistencyDetector", "noise_inconsistency", "image_noise_inconsistency"),
    DetectorSpec("OutlierDetector", "table_stats", "table_outlier"),
    DetectorSpec("PHashDetector", "imagehash_dup", "imagehash_phash"),
    DetectorSpec("PValueConsistencyDetector", "stat_consistency", "stat_pvalue"),
    DetectorSpec("PageRasterDuplicateDetector", "page_raster_dup", "page_raster_dup"),
    DetectorSpec("PanelDuplicateDetector", "panel_dup", "panel_dup"),
    DetectorSpec("PanelSegmentationDetector", "panel_segmentation", "panel_duplicate"),
    DetectorSpec("PaperMillTemplateDetector", "paper_mill_template", "paper_mill_template"),
    DetectorSpec("PdfMetadataDetector", "pdf_metadata", "pdf_metadata"),
    DetectorSpec("PercentDivisibilityDetector", "stat_consistency", "stat_percent"),
    DetectorSpec("ReferenceFormatAnomalyDetector", "references", "ref_format_anomaly"),
    DetectorSpec("RoundBiasDetector", "table_stats", "table_round_bias"),
    DetectorSpec("SiftCopyMoveDetector", "sift_copymove", "image_sift_copymove"),
    DetectorSpec("SsimDuplicateDetector", "ssim", "image_ssim"),
    DetectorSpec("SupplementaryFileDetector", "supplementary", "supplementary"),
    DetectorSpec("TableRelationshipDetector", "table_relationships", "table_relationships"),
    DetectorSpec("NearDuplicateRowDetector", "table_forensics", "table_near_duplicate_row"),
    DetectorSpec("CrossTableCopyDetector", "table_forensics", "table_cross_copy"),
    DetectorSpec("TableFileMetadataDetector", "table_forensics", "table_file_metadata"),
    DetectorSpec("TableForensicsDetector", "table_forensics", "table_forensics"),
    DetectorSpec("TableHighlightFocusDetector", "table_highlight", "table_highlight_focus"),
    DetectorSpec("TextPatternDetector", "text_patterns", "text_patterns"),
    DetectorSpec("TorturedPhrasesDetector", "tortured_phrases", "text_tortured_phrases"),
    DetectorSpec("WHashDetector", "imagehash_dup", "imagehash_whash"),
)

_SPECS_BY_CLASS = {spec.class_name: spec for spec in _DETECTOR_SPECS}


def detector_class_names() -> list[str]:
    return [spec.class_name for spec in _DETECTOR_SPECS]


def detector_name_for_class(class_name: str) -> str:
    return _SPECS_BY_CLASS[class_name].detector_name


def load_detector_class(class_name: str) -> type:
    spec = _SPECS_BY_CLASS[class_name]
    module = import_module(f"{__name__}.{spec.module}")
    cls = getattr(module, spec.class_name)
    globals()[class_name] = cls
    return cls


def __getattr__(name: str) -> object:
    if name in _SPECS_BY_CLASS:
        return load_detector_class(name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def iter_registered_detectors() -> Iterable[Detector]:
    """Yield every built-in detector instance in canonical order."""
    for spec in _DETECTOR_SPECS:
        yield load_detector_class(spec.class_name)()


def detector_names() -> list[str]:
    """Return built-in detector names without importing implementations."""
    return [spec.detector_name for spec in _DETECTOR_SPECS]


def _parse_allowlist_env() -> set[str] | None:
    """Parse the
    ``MANUSIFT_DETECTORS``
    environment variable
    into a detector
    allowlist set.

    R-2026-06-15 (Phase 3 + P3-9):
    the audit's recommended
    detector allowlist.
    Format:
    ``MANUSIFT_DETECTORS="image_dup,image_forensics,..."``
    (comma-separated,
    whitespace
    ignored).  Empty
    string or unset
    means "all
    detectors" (no
    filtering).  Unknown
    names in the
    allowlist are
    silently ignored
    (the user can
    mistype without
    crashing; the
    actual filter
    happens in
    ``iter_allowed_detectors``).

    Returns:
      ``None`` for "no
      allowlist" (run
      all detectors), or
      a ``set`` of
      detector names to
      keep.
    """
    import os

    raw = os.environ.get("MANUSIFT_DETECTORS", "")
    raw = raw.strip()
    if not raw:
        return None
    names = {
        n.strip()
        for n in raw.split(",")
        if n.strip()
    }
    return names or None


def iter_allowed_detectors() -> Iterable[Detector]:
    """Yield only the
    detectors enabled
    by the
    ``MANUSIFT_DETECTORS``
    allowlist env var.

    R-2026-06-15 (Phase 3 + P3-9):
    the audit's
    recommended filter
    for CI / per-pipeline
    subsets.  The
    pipeline runner
    (``run_manusift.py``)
    should switch to
    this function in
    P3-9 follow-up;
    the change here is
    the helper itself.
    """
    allow = _parse_allowlist_env()
    if allow is None:
        yield from iter_registered_detectors()
        return
    for det in iter_registered_detectors():
        if getattr(det, "name", "") in allow:
            yield det


__all__ = sorted(
    {
        "Detector",
        "DetectorResult",
        "DetectorSpec",
        "run_detectors",
        "iter_registered_detectors",
        "detector_names",
        "detector_class_names",
        "detector_name_for_class",
        "load_detector_class",
        "entry_point_names",
        "iter_entrypoint_detectors",
        *detector_class_names(),
    }
)
