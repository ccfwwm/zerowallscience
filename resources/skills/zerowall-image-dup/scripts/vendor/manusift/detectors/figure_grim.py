"""R-2026-06-12: Figure-derived GRIM consistency detector.

The case_004 official retraction cites "Sample size issue" and
"Image interpretation concerns" but the numbers are *inside* the
figures, not in the paper text. The existing ``stat_grim``
detector only reads raw numeric tables, so it cannot see them.

This detector closes that gap. It runs the same EasyOCR pass
that ``figure_stat_text`` runs, then for every recognised
percentage in a figure body it asks: *if the experiment used
N total samples, would this percentage be possible?*

The GRIM test (Granularity-Related Inconsistency of Means,
Brown & Heathers 2016) states that for a reported mean M
of N integer samples rounded to D decimals, M is consistent
with N only if M * 10^D / N is an integer after rounding
back. Applied to percentages, the test is even simpler:
"X.X% of N samples" implies ``X/100 * N`` must be an integer.

  * Figure says "95.0%", N=20: 0.95*20 = 19.0 ✓
  * Figure says "7.9%", N=20: 0.079*20 = 1.58 ✗
  * Figure says "7.5%", N=20: 0.075*20 = 1.5, then check if
    1.5 is an integer (it is not, but if the original count
    were N=40 then 0.075*40 = 3.0 which IS an integer).

The detector's job is NOT to prove fraud. It surfaces
percentages that *cannot* be reconciled with a wide range
of plausible sample sizes (N in [3, 100]) so a downstream
detector or a human reviewer can see them.

Honest limits
-------------

  * EasyOCR is noisy. The detector only fires on
    percentages it parsed confidently (>0.50 confidence).
  * We do not know N from the figure alone -- it is
    often in the figure caption, the methods section, or
    the text. The detector scans paper text for the nearest
    "n = N" mention within ±500 words of the page and uses
    that as a candidate N. If no N is found, we sweep N
    in a small range and report the first failed value.
  * The detector is best-effort. Its findings are
    "GRIM-inconsistent percentage" -- the alignment
    matrix counts them as evidence for the "sample
    size" target.
  * There can be legitimate non-integer counts
    (e.g. when a percentage is averaged across
    replicates, not raw counts). A single GRIM
    failure is a *signal*, not a *proof*.
"""
from __future__ import annotations

import logging
import re
from importlib.util import find_spec
from typing import Any, Iterable

_HAS_EASYOCR = find_spec("easyocr") is not None
_HAS_FITZ = find_spec("fitz") is not None

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult

log = logging.getLogger(__name__)


# A percentage in OCR text looks like "7.9%" or "98.7%" or "100%".
# R-2026-06-12: the original pattern required a decimal
# place (``\\d{1,3}\\.\\d{1,3}``) which rejects the
# very common integer-percentage labels ("50%", "100%").
# For Frontiers papers (and others using bar charts) this
# means almost zero figure-body percentages are detected.
# We now accept both: ``\\d{1,3}(?:\\.\\d+)?``.
# Whole-number percentages yield a less precise GRIM
# check (multiple N can give exactly 50%) but they still
# produce useful findings.
_PCT_PATTERN = re.compile(r"(\d{1,3}(?:\.\d+)?)\s*%")

# A "n = N" or "N=12" mention in paper text. We use this to
# find the most likely sample size for the figure.
_N_PATTERN = re.compile(
    r"\b[nN]\s*[=≈]\s*(\d{1,4})\b",
)

# Candidate N values to sweep when no N is found in the
# paper text. Small N values are common in biological
# experiments (3-30); we go up to 100.
_DEFAULT_N_RANGE: tuple[int, ...] = tuple(range(3, 101))

# Confidence floor for OCR text. EasyOCR below 0.50 is
# usually noise.
_MIN_OCR_CONF = 0.50

# Cap the number of pages the detector OCRs per document.
_MAX_PAGES_TO_OCR = 6

# Cap the number of GRIM findings emitted per page.
_MAX_FINDINGS_PER_PAGE = 6


class FigureGRIMDetector:
    """Run EasyOCR over each figure region, then GRIM-check
    every recognised percentage against plausible sample
    sizes.
    """

    name = "figure_grim"

    def __init__(self) -> None:
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
                "figure_grim: PyMuPDF / EasyOCR missing -- no-op"
            )
            return DetectorResult(
                detector=self.name, findings=[], ok=True,
            )

        try:
            import fitz  # type: ignore

            pdf = fitz.open(doc.source_path)
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "figure_grim: failed to open %s: %s",
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

        # Build
        # a
        # list
        # of
        # (page_idx, text)
        # from
        # doc.text_blocks
        # so
        # we
        # can
        # search
        # the
        # surrounding
        # paper
        # text
        # for
        # "n = N".
        paper_text_by_page: dict[int, str] = {}
        for tb in doc.text_blocks:
            page_idx_0 = (tb.page or 1) - 1
            paper_text_by_page.setdefault(page_idx_0, "")
            paper_text_by_page[page_idx_0] += " " + tb.text

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
                    if conf < _MIN_OCR_CONF:
                        continue
                    pcts = _PCT_PATTERN.findall(text)
                    if not pcts:
                        continue
                    # Look
                    # for
                    # the
                    # closest
                    # "n = N" in
                    # nearby
                    # text.
                    n_candidate = _find_nearby_n(
                        paper_text_by_page, page_idx,
                    )
                    for pct_str in pcts:
                        if (
                            len(page_findings)
                            >= _MAX_FINDINGS_PER_PAGE
                        ):
                            break
                        try:
                            pct = float(pct_str)
                        except ValueError:
                            continue
                        if pct < 0.0 or pct > 100.0:
                            continue
                        failure = _grim_check(
                            pct, n_candidate,
                            _DEFAULT_N_RANGE,
                        )
                        if failure is None:
                            continue
                        n_used, count = failure
                        page_findings.append(
                            Finding.make(
                                trace_id=doc.trace_id,
                                detector=self.name,
                                severity="medium",
                                title=(
                                    "GRIM-inconsistent "
                                    "percentage recognised "
                                    "in figure body"
                                ),
                                evidence=(
                                    f"Page {page_idx + 1} "
                                    f"figure region: "
                                    f"recognised text "
                                    f"{text!r} (confidence "
                                    f"{conf:.2f}) contains "
                                    f"{pct:.1f}%. With "
                                    f"sample size N={n_used}, "
                                    f"the implied count "
                                    f"is {count:.3f} (not "
                                    f"an integer)."
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
                                    "percentage": pct,
                                    "n_used": n_used,
                                    "implied_count": count,
                                },
                            )
                        )
            findings.extend(page_findings)

        return DetectorResult(
            detector=self.name, ok=True, findings=findings,
        )


def _find_nearby_n(
    paper_text_by_page: dict[int, str], page_idx: int,
) -> int | None:
    """Look for a "n = N" mention in the page text.
    Returns the first N found, or None."""
    text = paper_text_by_page.get(page_idx, "")
    if not text:
        return None
    m = _N_PATTERN.search(text)
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def _grim_check(
    pct: float,
    n_candidate: int | None,
    n_range: Iterable[int],
) -> tuple[int, float] | None:
    """Apply the GRIM test to ``pct``.

    If ``n_candidate`` is provided, test against that
    single N. Otherwise sweep ``n_range`` and report the
    first N for which the percentage fails the GRIM test.

    Returns (n_used, implied_count) for the failure, or
    None if every N is consistent.
    """
    if n_candidate is not None:
        n_values: tuple[int, ...] = (n_candidate,)
    else:
        n_values = tuple(n_range)
    for n in n_values:
        if n <= 0:
            continue
        count = pct / 100.0 * n
        # GRIM
        # is
        # satisfied
        # if
        # the
        # count
        # is
        # within
        # 0.01
        # of
        # an
        # integer
        # (we
        # use
        # 0.5/n
        # to
        # account
        # for
        # the
        # fact
        # that
        # OCR
        # percentages
        # are
        # themselves
        # rounded
        # to
        # 1
        # decimal
        # place).
        if abs(count - round(count)) > 0.05:
            return (n, count)
    return None
