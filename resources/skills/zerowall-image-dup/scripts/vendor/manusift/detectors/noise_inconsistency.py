"""Noise-level inconsistency detector for image splicing (T9).

A spliced image is composed of
two or more regions that
came from different sources.
A natural camera captures an
image with a roughly uniform
sensor-noise pattern; a
spliced image combines two
patterns, so different
regions have visibly
different noise levels. The
Yao 2016 algorithm in
``Multimedia Tools and
Applications`` exploits this:

  1. Tile the image into small
     blocks (default 64x64).
  2. For each block, estimate
     the noise level by running
     a high-pass filter
     (Laplacian) and computing
     the variance of the
     filtered image. The
     variance is a robust proxy
     for noise energy because
     natural textures contribute
     a slowly varying signal
     while sensor noise
     contributes the high-
     frequency energy.
  3. Build the per-block noise
     map.
  4. Report any block whose
     noise level differs from
     the median by more than
     3 standard deviations.
     Spliced regions look like
     isolated outliers in the
     noise map.

The detector is fast (single
pass per image, no
external dependencies
beyond numpy and Pillow) and
is a useful complement to the
existing ``image_forensics``
ELA detector. ELA catches
JPEG-compression
inconsistencies; noise
inconsistency catches sensor
fingerprint inconsistencies
even on uncompressed images.

The detector does not require
the paper to be from a known
camera. It flags *any*
region whose noise level is
suspiciously different from
its neighbours.

Borrowed from Yao 2016,
"Detecting Image Splicing
Based on Noise Level
Inconsistency", Multimedia
Tools and Applications.
"""
from __future__ import annotations

import json

import numpy as np
from PIL import Image

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult


# Tunable constants. The
# 64x64 block size matches the
# value used in the original
# Yao paper. The 3-sigma
# threshold is conservative;
# raise to 4-sigma to reduce
# false positives, lower to
# 2-sigma to catch subtler
# splices.
BLOCK_SIZE: int = 64
SIGMA_THRESHOLD: float = 3.0


def _read_image(path: str) -> np.ndarray | None:
    """Read an image as a
    ``uint8`` numpy array. The
    noise estimator wants a
    single-channel image; we
    convert to grayscale at the
    call site."""
    try:
        img = Image.open(path)
    except Exception:  # noqa: BLE001
        return None
    try:
        return np.array(img.convert("L"))
    except Exception:  # noqa: BLE001
        return None


def _laplacian_variance(block: np.ndarray) -> float:
    """Estimate the noise level
    of a single block by
    computing the variance of
    the Laplacian response.

    The Laplacian is a high-pass
    filter that suppresses
    natural textures (which
    are smooth in the spatial
    domain) and preserves
    sensor noise (which is
    high-frequency). The
    variance of the filtered
    image is therefore a good
    proxy for the noise energy.

    A 3x3 Laplacian kernel
    suffices; we do not need a
    Gaussian pre-smoothing step
    because the natural image
    is already smooth in the
    block size we work with.
    """
    # 3x3 Laplacian, no
    # diagonal terms. The
    # kernel sums to zero, so
    # the response to a flat
    # region is zero; only
    # noise and edges
    # contribute.
    kernel = np.array(
        [[0, -1, 0], [-1, 4, -1], [0, -1, 0]],
        dtype=np.float32,
    )
    # Convolve manually so we
    # don't pull in scipy just
    # for this.
    h, w = block.shape
    out = np.zeros((h - 2, w - 2), dtype=np.float32)
    for i in range(h - 2):
        for j in range(w - 2):
            out[i, j] = (
                kernel[0, 0] * block[i, j]
                + kernel[0, 1] * block[i, j + 1]
                + kernel[0, 2] * block[i, j + 2]
                + kernel[1, 0] * block[i + 1, j]
                + kernel[1, 1] * block[i + 1, j + 1]
                + kernel[1, 2] * block[i + 1, j + 2]
                + kernel[2, 0] * block[i + 2, j]
                + kernel[2, 1] * block[i + 2, j + 1]
                + kernel[2, 2] * block[i + 2, j + 2]
            )
    return float(np.var(out))


def _noise_map(
    img: np.ndarray,
    block: int = BLOCK_SIZE,
) -> tuple[np.ndarray, int, int]:
    """Tile the image into
    ``block x block`` squares
    and return a 2-D noise map
    (rows, cols) where each
    entry is the noise level of
    that tile. The number of
    rows and cols is returned
    alongside so the caller can
    reason about geometry."""
    h, w = img.shape
    rows = h // block
    cols = w // block
    if rows < 2 or cols < 2:
        # Too small to analyse.
        return np.empty((0, 0), dtype=np.float32), 0, 0
    out = np.zeros((rows, cols), dtype=np.float32)
    for r in range(rows):
        for c in range(cols):
            tile = img[
                r * block : (r + 1) * block,
                c * block : (c + 1) * block,
            ]
            out[r, c] = _laplacian_variance(tile)
    return out, rows, cols


def _find_outliers(
    noise: np.ndarray,
    sigma: float = SIGMA_THRESHOLD,
) -> list[tuple[int, int, float, float]]:
    """Find blocks whose noise
    level deviates from the
    median by more than
    ``sigma`` median-absolute-
    deviations (MAD). Returns
    a list of
    ``(row, col, value, deviation)``
    tuples for every outlier."""
    if noise.size == 0:
        return []
    median = float(np.median(noise))
    mad = float(
        np.median(np.abs(noise - median))
    )
    if mad == 0:
        # All blocks have the
        # same noise level; the
        # image is either
        # synthetic or
        # thoroughly
        # denoised. Either way,
        # there is no signal
        # to detect.
        return []
    outliers: list[tuple[int, int, float, float]] = []
    rows, cols = noise.shape
    for r in range(rows):
        for c in range(cols):
            deviation = abs(noise[r, c] - median) / mad
            if deviation > sigma:
                outliers.append(
                    (r, c, float(noise[r, c]), deviation)
                )
    return outliers


class NoiseInconsistencyDetector:
    """Run the noise-level
    inconsistency algorithm on
    every image. One finding per
    image that contains at
    least one outlier block.
    Severity is "high" for
    >= 3 outlier blocks,
    "medium" for 1-2."""

    name = "image_noise_inconsistency"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        findings: list[Finding] = []
        for i, img in enumerate(doc.images):
            path = img.image_path
            if not path:
                continue
            arr = _read_image(path)
            if arr is None:
                continue
            h, w = arr.shape
            if h < BLOCK_SIZE * 2 or w < BLOCK_SIZE * 2:
                continue
            noise, rows, cols = _noise_map(arr)
            if noise.size == 0:
                continue
            outliers = _find_outliers(noise)
            if not outliers:
                continue
            severity = (
                # R-2026-06-15 (Phase 6, fix 3):
                # the threshold was previously
                # 3+ blocks => high, which fired
                # on 30% of figures with < 50
                # blocks -- the noise detector
                # is too sensitive for small
                # figures (a single JPEG
                # compression artefact can
                # create 5-10 outlier blocks).
                # The v2 30-case benchmark shows
                # 30% of all findings have < 50
                # blocks (trivially noisy), 45%
                # have 50-200 (suspicious), 24%
                # have >= 200 (real signal).
                # New thresholds:
                #   >= 200 blocks => high
                #   >= 50 blocks  => medium
                #   <  50 blocks  => low
                "high"
                if len(outliers) >= 200
                else "medium"
                if len(outliers) >= 50
                else "low"
            )
            # Build a small ASCII
            # heatmap so the user
            # can see *which* block
            # the detector flagged.
            heatmap = _ascii_heatmap(noise, outliers)
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity=severity,
                    title=(
                        f"Image {i + 1} on page "
                        f"{img.page} has "
                        f"{len(outliers)} block(s) with "
                        f"anomalous noise level"
                    ),
                    location=(
                        f"image {i + 1} on page "
                        f"{img.page}, blocks: "
                        f"{', '.join(f'({r},{c})' for r, c, _, _ in outliers[:5])}"
                    ),
                    evidence=json.dumps(
                        {
                            "image_index": i,
                            "page": img.page,
                            "block_size": BLOCK_SIZE,
                            "grid_rows": rows,
                            "grid_cols": cols,
                            "outlier_count": len(outliers),
                            "outliers": [
                                {
                                    "row": int(r),
                                    "col": int(c),
                                    "value": float(v),
                                    "deviation_mad": float(d),
                                }
                                for r, c, v, d in outliers
                            ],
                            "heatmap": heatmap,
                        }
                    ),
                )
            )
        return DetectorResult(
            detector=self.name, findings=findings, ok=True
        )


def _ascii_heatmap(
    noise: np.ndarray,
    outliers: list[tuple[int, int, float, float]],
) -> str:
    """Render a small ASCII
    heatmap of the noise level
    so the user can see the
    outliers in context. Each
    cell is one of:

      * ``.`` -- below median
      * ``:`` -- near median
      * ``#`` -- above median
      * ``*`` -- flagged outlier

    The grid is rendered with
    one row per text line; the
    block-coordinates are
    aligned to the right so the
    user can locate the
    outliers in the original
    image."""
    if noise.size == 0:
        return ""
    median = float(np.median(noise))
    mad = float(np.median(np.abs(noise - median))) or 1.0
    rows, cols = noise.shape
    out: list[str] = []
    for r in range(rows):
        line = []
        for c in range(cols):
            deviation = abs(noise[r, c] - median) / mad
            if (r, c) in {(o[0], o[1]) for o in outliers}:
                line.append("*")
            elif deviation > 1.0:
                line.append("#")
            elif deviation > 0.5:
                line.append(":")
            else:
                line.append(".")
        out.append("".join(line))
    return "\n".join(out)
