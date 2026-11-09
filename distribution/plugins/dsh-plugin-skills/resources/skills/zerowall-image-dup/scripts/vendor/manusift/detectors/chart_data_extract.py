"""Bar-chart data extractor (P3.2).

A bar chart in a paper is
*image data* -- the
reviewer can see the bars
but cannot query the
underlying numbers. The
detector reverses the
process: it finds the
axis-aligned bars in the
image, measures each bar's
height, and produces a
JSON list of (label,
value) pairs.

The algorithm is a
textbook computer-vision
pipeline:

  1. Read the image as
     grayscale.
  2. Threshold with Otsu's
     method.
  3. Find the *baseline* of
     the chart: the longest
     horizontal line in
     the lower half of the
     image. We use
     ``cv2.HoughLinesP``
     with a strong vote
     threshold.
  4. Find the *bars*: tall,
     thin rectangles that
     sit on the baseline.
     We look for the
     contours whose
     bounding rectangle is
     tall (height > 5% of
     the image) and narrow
     (width < 10% of the
     image).
  5. For each bar, read the
     ``y``-coordinate of
     its top edge and
     convert to a value:
     ``value = (baseline_y
     - top_y) / scale``,
     where ``scale`` is the
     pixel-to-value ratio.
     We compute the scale
     from the y-axis ticks:
     the height of the
     image in pixels divided
     by the maximum value
     on the y-axis (or, if
     the y-axis is not
     visible, we report
     values in pixel units
     and let the reviewer
     convert manually).

The output is a JSON
object with the bar values
and the baseline position.
A chart with no bars
(e.g. a line chart, a
scatter plot) yields an
empty list -- the user
should fall back to a
different tool for those.

The detector is read-only.
It does not require axis
labels; the output is the
*pixel-relative* bar
heights. A future revision
will add OCR for the tick
labels.

Borrowed from the
"chart-to-data" recipe in
the OpenCV tutorials and
the DataThief Java tool.
"""
from __future__ import annotations

import json
import os
from importlib.util import find_spec
from typing import Any

from PIL import Image

_HAS_NUMPY = find_spec("numpy") is not None
_HAS_CV2 = find_spec("cv2") is not None

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult


# Tunable constants.
MIN_BAR_HEIGHT_FRACTION: float = 0.05
MAX_BAR_WIDTH_FRACTION: float = 0.10
MIN_BAR_PIXELS: int = 30


def _chart_extract_enabled() -> bool:
    """P4 (2026-07-18,
    figure_text_v1):
    independent gate for
    the chart extractor now
    that it runs in the
    offline pipeline. The
    CV path needs
    numpy + OpenCV; when
    either is missing the
    extractor already
    degrades to an empty
    result, but eval / CI
    runners can also turn
    the detector off
    entirely with
    ``MANUSIFT_CHART_EXTRACT_ENABLED=0``
    (default: on). Read at
    call time so tests can
    monkeypatch the env."""
    raw = (
        os.environ.get(
            "MANUSIFT_CHART_EXTRACT_ENABLED"
        )
        or ""
    ).strip().lower()
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
    """Read an image as a
    grayscale numpy array."""
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


def _find_baseline(
    binary: Any,
) -> int | None:
    """Return the y-coordinate
    of the chart baseline (a
    long horizontal line).
    We use the Hough Line
    Transform and pick the
    longest line in the
    lower half of the
    image. The return value
    is in pixel units from
    the top of the image
    (so y increases
    downward)."""
    cv2 = _load_cv2()
    np = _load_numpy()
    if cv2 is None or np is None:
        return None
    h, w = binary.shape
    edges = cv2.Canny(binary, 50, 150)
    # Restrict the search to
    # the lower 2/3 of the
    # image: the baseline
    # is below the bars.
    mask = np.zeros_like(edges)
    mask[h // 3 :, :] = 255
    masked = cv2.bitwise_and(edges, mask)
    lines = cv2.HoughLinesP(
        masked,
        rho=1,
        theta=np.pi / 180,
        threshold=20,
        minLineLength=max(40, w // 8),
        maxLineGap=20,
    )
    if lines is None:
        return None
    # Pick the line with
    # the longest horizontal
    # extent *and* the
    # largest y (closest to
    # the bottom of the
    # image).
    best_y: int | None = None
    best_length = 0
    for line in lines:
        x1, y1, x2, y2 = line[0]
        if abs(y1 - y2) > 5:
            # Not a horizontal
            # line.
            continue
        y = int((y1 + y2) // 2)
        length = abs(x2 - x1)
        if best_y is None or y > best_y:
            best_y = y
            best_length = length
        elif y == best_y and length > best_length:
            best_length = length
    return best_y


def _find_bars(
    binary: Any, baseline_y: int
) -> list[tuple[int, int]]:
    """Find the bars in the
    chart. Returns a list
    of ``(top_y, bottom_y)``
    pairs (pixel coordinates
    from the top of the
    image). The bottom of
    every bar must sit on
    the baseline."""
    cv2 = _load_cv2()
    if cv2 is None:
        return []
    h, w = binary.shape
    # Erode to break the
    # connection between
    # the bars and the
    # baseline; the bars
    # are 30 pixels wide
    # so an erosion of 3
    # pixels is enough to
    # disconnect them
    # without making them
    # disappear.
    kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT, (3, 3)
    )
    eroded = cv2.erode(binary, kernel, iterations=1)
    contours, _ = cv2.findContours(
        eroded,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )
    out: list[tuple[int, int]] = []
    min_h = h * MIN_BAR_HEIGHT_FRACTION
    max_w = w * MAX_BAR_WIDTH_FRACTION
    for c in contours:
        x, y, bw, bh = cv2.boundingRect(c)
        if bh < min_h:
            continue
        if bw > max_w:
            # Too wide; this is
            # probably the
            # chart background
            # or the legend.
            continue
        if bh < MIN_BAR_PIXELS:
            continue
        # The bottom of the
        # bar must be on the
        # baseline (within 10
        # pixels).
        if abs(y + bh - baseline_y) > 10:
            continue
        out.append((int(y), int(y + bh)))
    # Sort left-to-right.
    out.sort()
    return out


def _extract_chart(path: str) -> dict[str, Any]:
    """Run the bar-extraction
    pipeline on a single
    image. Returns a dict
    with the bar count,
    baseline position, and
    the bar values in pixel
    units (height of the
    bar in pixels above the
    baseline)."""
    cv2 = _load_cv2()
    if cv2 is None or not _HAS_NUMPY:
        return {"bars": [], "baseline": None}
    gray = _read_image_gray(path)
    if gray is None:
        return {"bars": [], "baseline": None}
    h, w = gray.shape
    _, binary = cv2.threshold(
        gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
    )
    baseline_y = _find_baseline(binary)
    if baseline_y is None:
        # No clear baseline:
        # the image may be
        # a line chart or a
        # scatter plot. We
        # return an empty
        # bar list.
        return {"bars": [], "baseline": None}
    bars = _find_bars(binary, baseline_y)
    # Convert bar
    # coordinates to
    # "value" units: the
    # height of the bar
    # above the baseline.
    values: list[float] = []
    for top_y, bottom_y in bars:
        height_px = bottom_y - top_y
        # Pixel values are in
        # [0, baseline_y]
        # where the baseline
        # is at the bottom.
        values.append(float(height_px))
    return {
        "bars": values,
        "baseline": int(baseline_y),
        "image_height": int(h),
    }


class ChartDataExtractorDetector:
    """For every image in the
    document, attempt to
    extract the bar-chart
    data. A finding is
    emitted per image that
    yields one or more
    bars.

    R-2026-06-19 (P2-C4):
    the detector now also
    computes two
    cross-validation
    statistics that the
    LLM can compare
    against the paper's
    text claims:

      * ``bars_pct``:
        each bar's height
        as a fraction of
        the chart's
        image height
        (0.0 - 1.0).
      * ``bars_pct_normalized``:
        each bar's height
        as a fraction of
        the *tallest* bar
        (so the tallest
        bar is 1.0; this
        matches how
        papers usually
        normalize a
        "100%" bar to
        the maximum).
      * ``bars_max_pct``:
        the tallest bar
        as a fraction of
        image height
        (so the LLM can
        check "the paper
        says the largest
        effect is 60%,
        does the chart
        show a bar at
        ~60% of the
        chart area?").

    These are pure
    computations on
    the existing
    ``_extract_chart``
    output; no new
    text-mining
    required.  The
    actual claim
    matching
    (chart
    percentages
    vs paper-text
    numbers)
    is left to
    the LLM /
    the cross-detector
    stat-consistency
    check
    because the
    natural-language
    claim is
    domain-specific
    ("60%
    reduction"
    vs
    "p<0.05"
    vs
    "0.42
    effect
    size")
    and a
    heuristic
    regex
    would
    produce
    too many
    FPs.
    """

    name = "chart_data_extract"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        findings: list[Finding] = []
        if not _chart_extract_enabled():
            # Gated off
            # (eval / CI):
            # silent no-op,
            # pipeline keeps
            # running.
            return DetectorResult(
                detector=self.name,
                findings=findings,
                ok=True,
            )
        for i, img in enumerate(doc.images):
            path = img.image_path
            if not path:
                continue
            data = _extract_chart(path)
            # Normalize bars to a plain list of floats. OpenCV /
            # numpy may return a 0-d or scalar int32 for empty /
            # single detections; iterating a numpy scalar raises
            # TypeError ("int32 object is not iterable").
            raw_bars = data.get("bars") or []
            try:
                bars = [float(b) for b in list(raw_bars)]
            except TypeError:
                try:
                    bars = [float(raw_bars)]
                except (TypeError, ValueError):
                    bars = []
            if not bars:
                continue
            # P2-C4:
            # cross-validation
            # stats.
            img_h = max(1, int(data["image_height"]))
            bars_pct = [
                round(b / img_h, 4) for b in bars
            ]
            max_bar = max(bars) if bars else 1.0
            max_bar = max(1.0, float(max_bar))
            bars_pct_normalized = [
                round(b / max_bar, 4) for b in bars
            ]
            bars_max_pct = (
                round(max(bars) / img_h, 4)
                if bars
                else 0.0
            )
            severity = "low"
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity=severity,
                    title=(
                        f"Image {i + 1} on page "
                        f"{img.page} contains "
                        f"{len(bars)} bar(s) "
                        f"with extracted heights"
                    ),
                    location=(
                        f"image {i + 1} on page "
                        f"{img.page}"
                    ),
                    evidence=json.dumps(
                        {
                            "image_index": i,
                            "page": img.page,
                            "baseline": data["baseline"],
                            "image_height": data[
                                "image_height"
                            ],
                            "bars": bars,
                            "bars_pct": bars_pct,
                            "bars_pct_normalized":
                                bars_pct_normalized,
                            "bars_max_pct": bars_max_pct,
                        }
                    ),
                )
            )
        return DetectorResult(
            detector=self.name, findings=findings, ok=True
        )
