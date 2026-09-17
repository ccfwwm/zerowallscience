"""R-2026-06-12: Figure-body text-statistics detector.

The case_004 official retraction cites "sample size
issue" and "data interpretation concerns" but
case_004's tables are presented as figures -- the
GRIM / p-value / percentage detectors can only read
the raw numeric tables, not the figure bodies.

This detector runs ``EasyOCR`` (already a transitive
dependency of the project via ``easyocr`` for
text-PDF extraction) on each figure region and
emits a finding for every recognised text fragment
that *looks* like a statistical descriptor:

  * "n=8", "N=12", "n = 6" -- sample size
  * "p<0.05", "p < 0.01", "P = 0.04" -- p-values
  * "mean+/-SD", "mean +/- SD" -- mean +/- SD
  * "n.s.", "**", "*", "***" -- significance
    markers
  * numeric patterns like "0.42", "3.14", "87%" -- any
    number that could plausibly be a statistic

The detector does NOT do statistical consistency
checks itself -- that is what the existing
stat_grim / stat_pvalue / stat_percent detectors
are for. The point is to **surface the figure-body
text** so a downstream detector (or a human reviewer)
can see what statistics the paper is reporting.

Honest limits
-------------

  * EasyOCR is slow (1-15s per region) and not
    always accurate on scientific figures. The
    detector is best-effort: it emits the OCR text
    as a finding, and lets the alignment matrix
    count it as evidence, but it does not pretend
    to validate the numbers.
  * The detector is a *read-only* pass over the
    OCR text. It does not re-render figures or
    cross-reference them with the paper's
    Methods section.
  * The detector is *complementary* to the
    existing figure_text_cross_check detector
    (which reads the paper text for figure
    captions). They do not duplicate effort.

Performance
-----------

A typical scientific paper has 1-3 figure regions
per page and 5-10 figure pages, so the OCR pass
takes 5-30 seconds per case. The detector caches
nothing; the runtime is dominated by EasyOCR
forward passes on the CPU.
"""
from __future__ import annotations

import logging
import re
from importlib.util import find_spec
from typing import Any

_HAS_EASYOCR = find_spec("easyocr") is not None
_HAS_FITZ = find_spec("fitz") is not None

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult

log = logging.getLogger(__name__)


# Patterns that look like a statistical descriptor.
# We keep the regexes tight: a "stat" must be
# adjacent to a number, a comparator, or a
# significance marker.
_STAT_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\b[nN]\s*=\s*\d{1,4}\b"),  # n=8
    re.compile(
        r"\b[pP]\s*[<>≤≥=]\s*0?\.\d+\b"
    ),  # p<0.05
    re.compile(
        r"\bmean\s*[\+\-±±]\s*sd\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bSEM\b|\bSD\b|\bSEM\b|\bCI\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\*\s*\*\s*\*|\*\*|\*",
    ),
    # R-2026-06-12: the n.s. pattern needs
    # re.IGNORECASE so "N.S." and "n.s." both
    # match.
    re.compile(
        r"\bn\.s\.\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b\d+(?:\.\d+)?\s*%",
    ),  # percentages
)

# Cap the number of OCR findings emitted per page
# so a noisy figure does not flood the report.
_MAX_FINDINGS_PER_PAGE = 8

# Cap the number of pages the detector OCRs per
# document. Beyond 6 figure-pages, the marginal
# signal is low and the runtime cost is high.
_MAX_PAGES_TO_OCR = 6


class FigureStatTextDetector:
    """Run EasyOCR over each figure region and emit
    a finding for every recognised text fragment
    that looks like a statistical descriptor.
    """

    name = "figure_stat_text"

    def __init__(self) -> None:
        # Lazy-load the reader the first time
        # ``run()`` is called so the import is
        # cheap and unit tests can patch it.
        self._reader: Any = None

    def _get_reader(self) -> Any:
        if self._reader is None:
            if not _HAS_EASYOCR:
                return None
            try:
                import easyocr  # type: ignore
            except ImportError:  # pragma: no cover
                return None
            try:
                self._reader = easyocr.Reader(
                    ["en"], gpu=False, verbose=False,
                )
            except Exception:  # noqa: BLE001
                return None
        return self._reader

    def run(self, doc: ParsedDoc) -> DetectorResult:
        if not _HAS_FITZ or not _HAS_EASYOCR:
            log.warning(
                "figure_stat_text: PyMuPDF / EasyOCR "
                "missing -- no-op"
            )
            return DetectorResult(
                detector=self.name, findings=[], ok=True,
            )

        try:
            import fitz  # type: ignore

            pdf = fitz.open(doc.source_path)
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "figure_stat_text: failed to open %s: %s",
                doc.source_path, exc,
            )
            return DetectorResult(
                detector=self.name, findings=[], ok=True,
            )

        from .page_raster_dup import _extract_figure_regions

        reader = self._get_reader()
        if reader is None:
            return DetectorResult(
                detector=self.name, findings=[], ok=True,
            )

        findings: list[Finding] = []
        pages_ocrd = 0
        for page_idx in range(len(pdf)):
            if pages_ocrd >= _MAX_PAGES_TO_OCR:
                break
            try:
                page = pdf[page_idx]
            except Exception:  # noqa: BLE001
                continue
            try:
                regions = _extract_figure_regions(page)
            except Exception:  # noqa: BLE001
                continue
            if not regions:
                continue
            pages_ocrd += 1
            page_findings: list[Finding] = []
            for r_idx, (crop, _bbox) in enumerate(regions):
                if len(page_findings) >= _MAX_FINDINGS_PER_PAGE:
                    break
                try:
                    import numpy as np

                    arr = np.array(crop.convert("RGB"))
                    result = reader.readtext(arr)
                except Exception as exc:  # noqa: BLE001
                    log.debug(
                        "OCR failed on page %d region %d: %s",
                        page_idx + 1, r_idx, exc,
                    )
                    continue
                for box, text, conf in result:
                    if conf < 0.40:
                        continue
                    if not _looks_like_stat(text):
                        continue
                    page_findings.append(
                        Finding.make(
                            trace_id=doc.trace_id,
                            detector=self.name,
                            severity="low",
                            title=(
                                "Statistical descriptor "
                                "recognised in figure body"
                            ),
                            evidence=(
                                f"Page {page_idx + 1} "
                                f"figure region: "
                                f"recognised text "
                                f"{text!r} (confidence "
                                f"{conf:.2f})."
                            ),
                            location=(
                                f"Page {page_idx + 1}/"
                                f"region {r_idx}"
                            ),
                            raw={
                                "page": page_idx + 1,
                                "region": r_idx,
                                "text": text,
                                "confidence": conf,
                            },
                        )
                    )
                    if (
                        len(page_findings)
                        >= _MAX_FINDINGS_PER_PAGE
                    ):
                        break
            findings.extend(page_findings)

        return DetectorResult(
            detector=self.name, ok=True, findings=findings,
        )


def _looks_like_stat(text: str) -> bool:
    """Return True if ``text`` matches any of the
    statistical-descriptor patterns."""
    return any(p.search(text) for p in _STAT_PATTERNS)
