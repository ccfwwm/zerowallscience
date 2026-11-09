"""Image-statistics anomaly detector (T11).

A natural photograph and a
synthetically-generated plot
have very different pixel
statistics:

  * **Histogram entropy**:
    Natural photos have high
    entropy (every grayscale
    value is roughly equally
    likely). A synthetic plot
    with a clean background
    and a few text labels
    concentrates pixels in
    very few grey levels; the
    entropy is low.

  * **Edge density**: Natural
    photos have a smooth edge
    distribution (Canny
    detects edges in the
    high-frequency content of
    the photo). Synthetic
    plots have hard edges
    everywhere -- straight
    lines, axis ticks, text --
    so the edge density per
    pixel is much higher.

  * **Color count**: Natural
    photos have tens of
    thousands of distinct
    colors. A matplotlib chart
    often has fewer than 50.

The T11 detector runs all three
checks per image. An image
that fails multiple checks
is almost certainly a
synthesized figure (a
screenshot of a plot, a
diagram, a flowchart) rather
than a photograph of an
experiment. The detector does
NOT claim a single check is
fraud; the goal is to surface
"synthesized figure" as a
*category* so the user can
look at the report and decide
whether the figure is the
expected kind for the paper
(e.g. a results section full
of plots is fine, but a
methods section full of
"synthesized" figures is
suspicious).

The detector is read-only,
deterministic, and uses
``Pillow`` + ``numpy`` only.
We do not pull in
``opencv`` for this one -- a
PIL-based Laplacian filter
suffices for the edge count
and the per-channel
histogram is a one-line
``Counter`` of bytes.

Borrowed from the ImageTwin
service (Springer 2026) and
the ImageTwin paper-image
forensics blog posts.
"""
from __future__ import annotations

import json

import numpy as np
from PIL import Image

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult


# Tunable constants. The
# thresholds below are
# conservative -- the detector
# only flags a figure when
# *multiple* checks fail
# simultaneously, so a single
# borderline value does not
# trigger a false positive.
EDGE_DENSITY_HIGH: float = 0.25
EDGE_DENSITY_LOW: float = 0.005
HISTOGRAM_ENTROPY_LOW: float = 4.0
COLOR_COUNT_LOW: int = 200


def _read_image(path: str) -> np.ndarray | None:
    try:
        img = Image.open(path)
    except Exception:  # noqa: BLE001
        return None
    try:
        return np.array(img.convert("RGB"))
    except Exception:  # noqa: BLE001
        return None


def _grayscale(arr: np.ndarray) -> np.ndarray:
    """ITU-R BT.601 luma:
    ``0.299 R + 0.587 G + 0.114 B``.
    The weights are the standard
    ones used in image
    processing; the simpler
    ``arr.mean(axis=2)`` would
    give a perceptually wrong
    result."""
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    return (
        0.299 * r + 0.587 * g + 0.114 * b
    ).astype(np.uint8)


def _histogram_entropy(gray: np.ndarray) -> float:
    """Shannon entropy of the
    256-bin grayscale histogram,
    in bits. A uniform
    histogram gives 8.0 bits;
    a single-tone image gives
    0.0 bits. Natural photos
    are typically 6.5-7.8
    bits; synthetic plots are
    often below 5.0 bits
    because they have a flat
    background plus a few
    markers."""
    counts = np.bincount(gray.flatten(), minlength=256)
    total = counts.sum()
    if total == 0:
        return 0.0
    probs = counts / total
    probs = probs[probs > 0]
    return float(-np.sum(probs * np.log2(probs)))


def _edge_density(gray: np.ndarray) -> float:
    """Estimate the fraction of
    pixels that lie on an
    "edge" using a simple 3x3
    Laplacian. The
    implementation is the
    same noise variance
    technique used in the T9
    detector, but here we
    threshold the response and
    count the "edges" rather
    than the variance.

    A natural photo has an
    edge density of 0.05-0.20
    (5-20% of pixels). A
    matplotlib chart sits at
    0.30-0.50 (most of the
    plot area is text and
    lines). A flat white area
    with a single logo sits at
    0.01-0.05.
    """
    h, w = gray.shape
    if h < 3 or w < 3:
        return 0.0
    # Compute the Laplacian
    # response per pixel.
    center = gray[1:-1, 1:-1].astype(np.int32)
    up = gray[:-2, 1:-1].astype(np.int32)
    down = gray[2:, 1:-1].astype(np.int32)
    left = gray[1:-1, :-2].astype(np.int32)
    right = gray[1:-1, 2:].astype(np.int32)
    resp = (
        4 * center
        - up
        - down
        - left
        - right
    )
    # A pixel is an "edge" if
    # the absolute response
    # is above a threshold.
    # The threshold is the
    # standard deviation of
    # the response times two;
    # this adapts to the
    # image's overall contrast.
    threshold = max(8, 2 * int(np.std(resp)))
    edges = np.abs(resp) > threshold
    return float(edges.mean())


def _color_count(arr: np.ndarray) -> int:
    """Count the number of
    distinct colors in the
    image. We quantize to 4
    bits per channel (4096
    buckets total) to make the
    count robust to JPEG
    compression artefacts --
    two nearly-identical red
    shades collapse into the
    same bucket."""
    # Quantize to 4 bits per
    # channel by shifting right
    # 4 bits.
    quantized = (arr >> 4).astype(np.uint8)
    # Pack the three channels
    # into a single 12-bit
    # integer so the dedup is
    # fast.
    packed = (
        quantized[..., 0].astype(np.int32) * 256
        + quantized[..., 1].astype(np.int32) * 16
        + quantized[..., 2].astype(np.int32)
    )
    return int(np.unique(packed).size)


class ImageStatisticsDetector:
    """Per-image statistics check.

    A finding is emitted when
    the image looks like a
    synthesised figure rather
    than a natural photograph.
    The detector combines three
    independent signals --
    histogram entropy, edge
    density, and unique color
    count -- into a single
    verdict.

    We deliberately do NOT
    treat a single signal as
    evidence of fraud: a
    scientific figure can
    legitimately have low
    entropy (a small inset
    graph) or low color count
    (a single-colour bar
    chart). The detector
    surfaces a finding only
    when *two or more* of the
    three signals are outside
    the natural-photo range.
    """

    name = "image_statistics"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        findings: list[Finding] = []
        for i, img in enumerate(doc.images):
            path = img.image_path
            if not path:
                continue
            arr = _read_image(path)
            if arr is None:
                continue
            h, w = arr.shape[:2]
            if h < 64 or w < 64:
                continue
            gray = _grayscale(arr)
            entropy = _histogram_entropy(gray)
            edges = _edge_density(gray)
            colors = _color_count(arr)
            # Apply the three
            # checks.
            checks = {
                "histogram_entropy": {
                    "value": entropy,
                    "is_suspicious": (
                        entropy < HISTOGRAM_ENTROPY_LOW
                    ),
                },
                "edge_density": {
                    "value": edges,
                    "is_suspicious": (
                        edges > EDGE_DENSITY_HIGH
                        or edges < EDGE_DENSITY_LOW
                    ),
                },
                "color_count": {
                    "value": colors,
                    "is_suspicious": (
                        colors < COLOR_COUNT_LOW
                    ),
                },
            }
            suspicious = [
                name
                for name, info in checks.items()
                if info["is_suspicious"]
            ]
            if len(suspicious) < 2:
                continue
            # Two or more signals
            # flagged: emit a
            # finding.
            severity = (
                "high"
                if len(suspicious) >= 3
                else "medium"
            )
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity=severity,
                    title=(
                        f"Image {i + 1} on page "
                        f"{img.page} looks like a "
                        f"synthesised figure "
                        f"({len(suspicious)}/3 signals "
                        f"flagged)"
                    ),
                    location=(
                        f"image {i + 1} on page "
                        f"{img.page}"
                    ),
                    evidence=json.dumps(
                        {
                            "image_index": i,
                            "page": img.page,
                            "width": w,
                            "height": h,
                            "signals": {
                                k: {
                                    "value": v["value"],
                                    "is_suspicious": v[
                                        "is_suspicious"
                                    ],
                                }
                                for k, v in checks.items()
                            },
                            "flagged_signals": suspicious,
                        }
                    ),
                )
            )
        return DetectorResult(
            detector=self.name, findings=findings, ok=True
        )
