"""Forest-plot rule-based checker (v1).

A forest plot is the standard meta-analysis figure: one row per
study, a square marker (point estimate, sized by weight), a
horizontal whisker (confidence interval), and a vertical dashed
*null line* at the no-effect value (x=1 on a log ratio axis, x=0
on a linear difference axis).

No open-source tool extracts forest-plot numbers, but the layout
is highly templated, so a pure rule-based pipeline works well.
The key shortcut: almost every forest plot prints the numeric
column right next to the graphic ("1.23 [0.98, 1.55]"), so the
point estimate and CI come from the *text layer* and the pixels
are only needed for cross-validation.

The detector runs three checks:

  1. ``ci_order_violation`` (high): the printed CI must bracket
     the point estimate (``lo <= est <= hi``). A violation is a
     direct fabrication / copy-paste signal -- no legitimate
     typesetting produces it.
  2. ``ci_asymmetry`` (medium): on a log ratio axis the CI must
     be symmetric around the estimate in log space (the estimate
     is the geometric mean of the bounds). A skewed CI beyond
     tolerance suggests a transcription error. On a linear axis
     the same check runs in linear space.
  3. ``null_line_mismatch`` (medium): geometry-text
     cross-validation. If the text says a row's CI crosses the
     null value (``lo < 1 < hi`` on a ratio axis), the drawn
     whisker must visibly cross the dashed null line, and vice
     versa. A disagreement means the figure and the printed
     numbers tell different stories.

Forest-plot recognition is signal-based (>=2 of): (a) a tall
vertical dashed line in the image, (b) >=3 evenly spaced
horizontal CI segments, (c) forest-plot keywords in the page
text ("odds ratio", "HR", "weight", ...), (d) >=2 numeric
``est [lo, hi]`` triples in the page text. The signals and the
confidence are recorded in the finding ``raw``.

The detector is read-only, needs no OCR and no models. When
numpy / OpenCV are missing it degrades to an empty result
(same ``_load_cv2`` / ``_load_numpy`` pattern as
``chart_data_extract.py``). A summary finding
(``forest_plot_summary``) reports how many forest plots were
detected and how many numeric rows were parsed.
"""
from __future__ import annotations

import json
import math
import os
import re
from importlib.util import find_spec
from typing import Any

from PIL import Image

_HAS_NUMPY = find_spec("numpy") is not None
_HAS_CV2 = find_spec("cv2") is not None

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult


# Tunable constants.
# Minimum fraction of the image height a vertical dashed line
# must cover (in dark pixels) to count as the null line.
NULL_LINE_MIN_COVERAGE: float = 0.35
# The null line must sit away from the image borders (fraction
# of the width) so axis frames are not mistaken for it.
NULL_LINE_EDGE_MARGIN: float = 0.10
# Horizontal CI whiskers are short lines: at least this many
# pixels long, at most this fraction of the image width.
CI_MIN_LENGTH_PX: int = 20
CI_MAX_LENGTH_FRACTION: float = 0.70
# Whisker rows must be roughly evenly spaced: the largest gap
# between consecutive rows may be at most this multiple of the
# smallest gap.
CI_MAX_GAP_RATIO: float = 2.0
# Minimum number of evenly spaced whiskers for signal (b).
MIN_CI_SEGMENTS: int = 3
# Log-space asymmetry tolerance for check 2. Rounding printed
# values to 2 decimals keeps the true deviation well under 0.05;
# 0.20 only fires on genuine skew.
LOG_ASYM_TOLERANCE: float = 0.20
# Linear-space asymmetry tolerance, as a fraction of the CI
# width.
LIN_ASYM_TOLERANCE: float = 0.10
# Pixel slack when deciding whether a drawn whisker crosses the
# null line (anti-aliasing / line width).
CROSS_TOLERANCE_PX: int = 3
# Recognition threshold: at least this many of the 4 signals.
MIN_SIGNALS: int = 2

# Numeric column pattern: "1.23 [0.98, 1.55]" / "1.23 (0.98, 1.55)"
# / "1.23 [0.98 to 1.55]". The estimate itself may be negative
# (linear axes: mean differences, beta coefficients).
_TRIPLE = re.compile(
    r"(-?\d+(?:\.\d+)?)\s*"
    r"[\[\(]\s*"
    r"(-?\d+(?:\.\d+)?)\s*"
    r"(?:[,;]|\bto\b)\s*"
    r"(-?\d+(?:\.\d+)?)\s*"
    r"[\]\)]"
)

# Forest-plot vocabulary. The spelled-out phrases are matched
# case-insensitively; the bare abbreviations are matched
# case-sensitively so the English word "or" does not false-fire.
_KEYWORDS_CI = re.compile(
    r"\b(odds ratio|hazard ratio|risk ratio|relative risk|"
    r"rate ratio|mean difference|forest plot|favou?rs|"
    r"weight|95%\s*ci|confidence interval)\b",
    re.IGNORECASE,
)
_KEYWORDS_CS = re.compile(r"\b(OR|HR|RR|RRR|SMD|WMD|ES)\b")


def _forest_plot_enabled() -> bool:
    """Independent gate (same pattern as
    ``MANUSIFT_CHART_EXTRACT_ENABLED``): eval / CI runners can
    turn the detector off with ``MANUSIFT_FOREST_PLOT_ENABLED=0``
    (default: on). Read at call time so tests can monkeypatch
    the env."""
    raw = (os.environ.get("MANUSIFT_FOREST_PLOT_ENABLED") or "").strip().lower()
    return raw not in {"0", "false", "off", "no"}


def _load_numpy() -> Any | None:
    if not _HAS_NUMPY:
        return None
    import numpy as np

    return np


def _load_cv2() -> Any | None:
    if not _HAS_CV2:
        return None
    import cv2  # type: ignore

    return cv2


def _read_image_gray(path: str) -> Any | None:
    """Read an image as a grayscale numpy array (None on any
    failure)."""
    np = _load_numpy()
    if np is None:
        return None
    try:
        img = Image.open(path)
    except Exception:  # noqa: BLE001
        return None
    try:
        return np.array(img.convert("L"))
    except Exception:  # noqa: BLE001
        return None


def _find_null_line(binary: Any) -> int | None:
    """Return the x pixel of the vertical dashed null line, or
    None. Pixel-column scan: the null line runs the full height
    of the plot, so its column holds far more dark pixels than
    any text or whisker column, even with the dashes."""
    np = _load_numpy()
    if np is None:
        return None
    h, w = binary.shape
    col_dark = (binary > 0).sum(axis=0)
    margin = int(w * NULL_LINE_EDGE_MARGIN)
    if w - 2 * margin <= 0:
        return None
    interior = col_dark[margin : w - margin]
    if interior.size == 0:
        return None
    best_x = int(int(np.argmax(interior)) + margin)
    if int(col_dark[best_x]) < h * NULL_LINE_MIN_COVERAGE:
        return None
    return best_x


def _find_ci_segments(binary: Any) -> list[tuple[int, int, int]]:
    """Return horizontal CI whiskers as ``(x1, x2, y)`` triples
    sorted by y (top row first). Hough transform, then keep only
    short horizontal segments away from the bottom axis, deduped
    by row."""
    cv2 = _load_cv2()
    np = _load_numpy()
    if cv2 is None or np is None:
        return []
    h, w = binary.shape
    edges = cv2.Canny(binary, 50, 150)
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=15,
        minLineLength=CI_MIN_LENGTH_PX,
        # The filled weight square sits *on* the whisker and
        # breaks its Canny edges; a gap this large bridges the
        # square so the whisker is found whole.
        maxLineGap=12,
    )
    if lines is None:
        return []
    segs: list[tuple[int, int, int]] = []
    max_len = w * CI_MAX_LENGTH_FRACTION
    for line in lines:
        x1, y1, x2, y2 = (int(v) for v in line[0])
        if abs(y1 - y2) > 2:
            continue
        length = abs(x2 - x1)
        if length < CI_MIN_LENGTH_PX or length > max_len:
            continue
        y = (y1 + y2) // 2
        # Skip the bottom 5%: that is where the x-axis lives.
        if y > h * 0.95:
            continue
        segs.append((min(x1, x2), max(x1, x2), y))
    # Dedupe rows: two segments within 4 px vertically are the
    # same whisker; keep the longer one.
    segs.sort(key=lambda s: (s[2], -(s[1] - s[0])))
    rows: list[tuple[int, int, int]] = []
    for seg in segs:
        if rows and abs(seg[2] - rows[-1][2]) <= 4:
            continue
        rows.append(seg)
    return rows


def _evenly_spaced(segments: list[tuple[int, int, int]]) -> bool:
    """True when the whisker rows are roughly evenly spaced --
    the signature of a forest plot's one-row-per-study grid."""
    if len(segments) < MIN_CI_SEGMENTS:
        return False
    ys = [s[2] for s in segments]
    gaps = [b - a for a, b in zip(ys, ys[1:]) if b - a > 0]
    if len(gaps) < MIN_CI_SEGMENTS - 1:
        return False
    return max(gaps) <= CI_MAX_GAP_RATIO * min(gaps)


def _parse_triples(text: str) -> list[tuple[float, float, float]]:
    """Extract ``(estimate, lo, hi)`` triples from the numeric
    column pattern in reading order."""
    out: list[tuple[float, float, float]] = []
    for m in _TRIPLE.finditer(text):
        try:
            est = float(m.group(1))
            lo = float(m.group(2))
            hi = float(m.group(3))
        except ValueError:
            continue
        out.append((est, lo, hi))
    return out


def _has_keywords(text: str) -> bool:
    return bool(_KEYWORDS_CI.search(text) or _KEYWORDS_CS.search(text))


def _is_log_axis(page_text: str, triples: list[tuple[float, float, float]]) -> bool:
    """Decide whether the plot uses a log ratio axis (OR/HR/RR,
    null at 1) or a linear axis (mean difference, null at 0).
    Ratio keywords or an all-positive numeric column imply log;
    any non-positive value forces linear."""
    if _KEYWORDS_CI.search(page_text) or re.search(
        r"\b(OR|HR|RR|RRR)\b", page_text
    ):
        return True
    if triples and all(v > 0 for t in triples for v in t):
        return True
    return False


def _analyze_geometry(
    path: str,
) -> tuple[int | None, list[tuple[int, int, int]]]:
    """Run the image half of the pipeline. Returns
    ``(null_line_x, ci_segments)``; both empty/None on any
    failure."""
    cv2 = _load_cv2()
    if cv2 is None or not _HAS_NUMPY:
        return None, []
    gray = _read_image_gray(path)
    if gray is None:
        return None, []
    try:
        _, binary = cv2.threshold(
            gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
        )
    except Exception:  # noqa: BLE001
        return None, []
    null_x = _find_null_line(binary)
    segments = _find_ci_segments(binary)
    return null_x, segments


class ForestPlotDetector:
    """Detect forest plots and cross-check their printed numeric
    column against basic invariants (CI brackets the estimate,
    CI is symmetric on the plot's axis, and the drawn whiskers
    agree with the printed numbers about crossing the null
    line). See the module docstring for the exact checks and
    recognition signals."""

    name = "forest_plot"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        findings: list[Finding] = []
        if not _forest_plot_enabled():
            return DetectorResult(detector=self.name, findings=[], ok=True)
        # Graceful degradation: the geometry half needs
        # numpy + OpenCV; without them the detector is a
        # silent no-op (same contract as chart_data_extract).
        if _load_cv2() is None or _load_numpy() is None:
            return DetectorResult(detector=self.name, findings=[], ok=True)

        # Group the text layer by page so each figure is matched
        # against the text printed next to it.
        text_by_page: dict[int, str] = {}
        for block in doc.text_blocks:
            text_by_page.setdefault(block.page, "")
            text_by_page[block.page] += block.text + "\n"

        # Candidate pages: every page with an image, plus pages
        # whose text alone already looks like a forest plot
        # (the numeric column may be the only machine-readable
        # part if the graphic is a vector drawing with no
        # extracted raster).
        images_by_page: dict[int, Any] = {}
        for img in doc.images:
            if img.image_path and img.page not in images_by_page:
                images_by_page[img.page] = img

        pages = sorted(set(images_by_page) | set(text_by_page))
        plots_found = 0
        rows_parsed = 0

        for page in pages:
            page_text = text_by_page.get(page, "")
            triples = _parse_triples(page_text)
            signals: dict[str, bool] = {
                "null_line": False,
                "ci_segments": False,
                "keywords": _has_keywords(page_text),
                "numeric_column": len(triples) >= 2,
            }
            null_x: int | None = None
            segments: list[tuple[int, int, int]] = []

            img = images_by_page.get(page)
            if img is not None:
                null_x, segments = _analyze_geometry(img.image_path)
                signals["null_line"] = null_x is not None
                signals["ci_segments"] = _evenly_spaced(segments)

            score = sum(1 for v in signals.values() if v)
            if score < MIN_SIGNALS:
                continue

            plots_found += 1
            rows_parsed += len(triples)
            confidence = round(score / len(signals), 2)
            log_axis = _is_log_axis(page_text, triples)
            location = f"page {page}"

            findings.extend(
                self._check_order(doc, triples, page, signals, confidence)
            )
            findings.extend(
                self._check_asymmetry(
                    doc, triples, page, log_axis, signals, confidence
                )
            )
            mismatch = self._check_null_line(
                doc, triples, segments, null_x, page, log_axis,
                signals, confidence,
            )
            if mismatch is not None:
                findings.append(mismatch)

            # Per-plot recognition record, so the reviewer can
            # see *why* the page was classified as a forest
            # plot and with what confidence.
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="info",
                    title=(
                        f"Forest plot detected on page {page} "
                        f"(confidence {confidence}, "
                        f"{len(triples)} numeric row(s))"
                    ),
                    location=location,
                    evidence=json.dumps(
                        {
                            "page": page,
                            "confidence": confidence,
                            "signals": signals,
                            "log_axis": log_axis,
                            "null_line_x": null_x,
                            "ci_segment_count": len(segments),
                            "triples": [list(t) for t in triples],
                        }
                    ),
                    raw={
                        "kind": "forest_plot_detected",
                        "page": page,
                        "confidence": confidence,
                        "signals": signals,
                    },
                )
            )

        if plots_found:
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="info",
                    title=(
                        f"Forest-plot scan: {plots_found} plot(s) "
                        f"detected, {rows_parsed} numeric row(s) "
                        f"parsed"
                    ),
                    location="(document)",
                    evidence=json.dumps(
                        {
                            "forest_plots_detected": plots_found,
                            "numeric_rows_parsed": rows_parsed,
                        }
                    ),
                    raw={
                        "kind": "forest_plot_summary",
                        "forest_plots_detected": plots_found,
                        "numeric_rows_parsed": rows_parsed,
                    },
                )
            )

        return DetectorResult(
            detector=self.name,
            findings=findings,
            ok=True,
            stats={
                "forest_plots_detected": plots_found,
                "numeric_rows_parsed": rows_parsed,
            },
        )

    # ---------- checks ----------

    def _base_raw(
        self,
        kind: str,
        page: int,
        signals: dict[str, bool],
        confidence: float,
    ) -> dict[str, Any]:
        return {
            "kind": kind,
            "page": page,
            "confidence": confidence,
            "signals": signals,
        }

    def _check_order(
        self,
        doc: ParsedDoc,
        triples: list[tuple[float, float, float]],
        page: int,
        signals: dict[str, bool],
        confidence: float,
    ) -> list[Finding]:
        """Check 1: the printed CI must bracket the estimate.
        A violation cannot be produced by honest typesetting, so
        it is a ``high`` finding."""
        out: list[Finding] = []
        for i, (est, lo, hi) in enumerate(triples):
            if lo <= est <= hi and lo <= hi:
                continue
            out.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="high",
                    title=(
                        f"Forest plot row {i + 1} on page {page}: "
                        f"estimate {est} outside printed CI "
                        f"[{lo}, {hi}]"
                    ),
                    location=f"page {page}, numeric column row {i + 1}",
                    evidence=json.dumps(
                        {
                            "row": i + 1,
                            "estimate": est,
                            "ci_lo": lo,
                            "ci_hi": hi,
                        }
                    ),
                    raw={
                        **self._base_raw(
                            "ci_order_violation", page, signals, confidence
                        ),
                        "row": i + 1,
                        "estimate": est,
                        "ci_lo": lo,
                        "ci_hi": hi,
                    },
                )
            )
        return out

    def _check_asymmetry(
        self,
        doc: ParsedDoc,
        triples: list[tuple[float, float, float]],
        page: int,
        log_axis: bool,
        signals: dict[str, bool],
        confidence: float,
    ) -> list[Finding]:
        """Check 2: the CI must be symmetric around the estimate
        in the plot's native space (log space for ratio axes --
        the estimate is the geometric mean of the bounds). A
        skewed CI beyond tolerance is a transcription-error
        signal (``medium``)."""
        out: list[Finding] = []
        for i, (est, lo, hi) in enumerate(triples):
            # Skip rows already flagged by the order check; the
            # asymmetry of a broken row is meaningless.
            if not (lo <= est <= hi and lo < hi):
                continue
            if log_axis:
                if lo <= 0 or est <= 0 or hi <= 0:
                    continue
                dev = abs(
                    math.log(est)
                    - (math.log(lo) + math.log(hi)) / 2.0
                )
                tol = LOG_ASYM_TOLERANCE
            else:
                dev = abs(est - (lo + hi) / 2.0) / (hi - lo)
                tol = LIN_ASYM_TOLERANCE
            if dev <= tol:
                continue
            out.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="medium",
                    title=(
                        f"Forest plot row {i + 1} on page {page}: "
                        f"CI [{lo}, {hi}] asymmetric around "
                        f"estimate {est} ({'log' if log_axis else 'linear'} "
                        f"deviation {dev:.3f} > {tol})"
                    ),
                    location=f"page {page}, numeric column row {i + 1}",
                    evidence=json.dumps(
                        {
                            "row": i + 1,
                            "estimate": est,
                            "ci_lo": lo,
                            "ci_hi": hi,
                            "axis": "log" if log_axis else "linear",
                            "deviation": round(dev, 4),
                            "tolerance": tol,
                        }
                    ),
                    raw={
                        **self._base_raw(
                            "ci_asymmetry", page, signals, confidence
                        ),
                        "row": i + 1,
                        "estimate": est,
                        "ci_lo": lo,
                        "ci_hi": hi,
                        "axis": "log" if log_axis else "linear",
                        "deviation": round(dev, 4),
                    },
                )
            )
        return out

    def _check_null_line(
        self,
        doc: ParsedDoc,
        triples: list[tuple[float, float, float]],
        segments: list[tuple[int, int, int]],
        null_x: int | None,
        page: int,
        log_axis: bool,
        signals: dict[str, bool],
        confidence: float,
    ) -> Finding | None:
        """Check 3 (lightweight geometry-text cross-validation):
        a row whose printed CI crosses the null value must have
        its drawn whisker cross the dashed null line, and vice
        versa. Rows are matched to whiskers by vertical order,
        so the check only runs when the counts agree and there
        are at least 2 of each."""
        if null_x is None:
            return None
        if len(triples) < 2 or len(triples) != len(segments):
            return None
        null_value = 1.0 if log_axis else 0.0
        mismatched_rows: list[int] = []
        for i, ((est, lo, hi), (x1, x2, _y)) in enumerate(
            zip(triples, segments)
        ):
            if not (lo <= est <= hi and lo <= hi):
                # Broken row already reported by check 1.
                continue
            expected_cross = lo < null_value < hi
            observed_cross = (
                x1 - CROSS_TOLERANCE_PX
                <= null_x
                <= x2 + CROSS_TOLERANCE_PX
            )
            if expected_cross != observed_cross:
                mismatched_rows.append(i + 1)
        if not mismatched_rows:
            return None
        return Finding.make(
            trace_id=doc.trace_id,
            detector=self.name,
            severity="medium",
            title=(
                f"Forest plot on page {page}: drawn whiskers "
                f"disagree with printed CIs about crossing the "
                f"null line (row(s) {mismatched_rows})"
            ),
            location=f"page {page}",
            evidence=json.dumps(
                {
                    "mismatched_rows": mismatched_rows,
                    "null_line_x": null_x,
                    "null_value": null_value,
                }
            ),
            raw={
                **self._base_raw(
                    "null_line_mismatch", page, signals, confidence
                ),
                "mismatched_rows": mismatched_rows,
                "null_line_x": null_x,
                "null_value": null_value,
            },
        )
