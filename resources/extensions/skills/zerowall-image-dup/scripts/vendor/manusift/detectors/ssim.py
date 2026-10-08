"""SSIM-based image duplicate detector (P1.4).

The four imagehash
detectors (pHash / aHash /
dHash / wHash) are fast and
robust to small
perturbations, but they
miss a class of duplicates
that SSIM catches: images
that have been *cropped
and re-saved at a different
size*. A pHash comparison
of two such images will
often disagree because the
hash is computed on the
8x8 DCT of the image and a
slight scale change can
flip several bits. SSIM
compares the two images
*per-pixel* after a common
resize, and is therefore
much more sensitive to
resampling.

The detector runs the
standard SSIM algorithm
(Wang et al. 2004) on
every pair of images in
the document. The SSIM
score is in [-1, 1] where
1 means identical and
values below 0.95 indicate
a meaningful perceptual
difference. We use 0.85
as the duplication
threshold: two images with
SSIM >= 0.85 are visually
"the same" to a human
reviewer; below that they
are distinct figures.

The implementation uses
``skimage.metrics.struct
ural_similarity`` with the
default parameters (7x7
Gaussian window,
``sigma=1.5``, ``K1=0.01``,
``K2=0.03``,
``L=255``). We convert
images to grayscale
before comparing because
SSIM is a luminance-only
metric in the original
formulation; the colour
channels add noise.

The detector is O(N^2) in
the number of images. We
cap the search at the
first 32 images (more than
that is rare in a typical
paper) to keep the cost
manageable.

Borrowed from Wang et al.
(2004), "Image Quality
Assessment: From Error
Visibility to Structural
Similarity", IEEE Trans.
Image Processing.
"""
from __future__ import annotations

import json

import numpy as np
from PIL import Image

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult


# Tunable constants.
SSIM_THRESHOLD: float = 0.85
MAX_IMAGES: int = 32
SSIM_WIN_SIZE: int = 7


def _read_image_gray(path: str) -> np.ndarray | None:
    """Read an image and
    convert to a uint8
    grayscale array."""
    try:
        img = Image.open(path)
    except Exception:  # noqa: BLE001
        return None
    try:
        return np.array(img.convert("L"))
    except Exception:  # noqa: BLE001
        return None


def _ssim_one_pair(
    a: np.ndarray, b: np.ndarray
) -> float:
    """Compute the SSIM score
    between two equal-size
    grayscale arrays. We
    resize the larger image
    to the smaller one's
    dimensions before
    comparing so a 200x200
    image can be compared
    against a 100x100 crop
    of itself.
    """
    from skimage.metrics import structural_similarity
    # skimage's default win_size is 7; comparing images
    # smaller than that raises ValueError (seen on a
    # sliver panel in fraud_web_v1 web_frontiers_01,
    # which crashed the whole panel_duplicate detector).
    # Degenerate slivers carry no similarity evidence.
    if min(a.shape[0], a.shape[1], b.shape[0], b.shape[1]) < 7:
        return 0.0
    if a.shape != b.shape:
        # Resize the larger
        # to the smaller.
        h = min(a.shape[0], b.shape[0])
        w = min(a.shape[1], b.shape[1])
        a_img = Image.fromarray(a).resize(
            (w, h), Image.LANCZOS
        )
        b_img = Image.fromarray(b).resize(
            (w, h), Image.LANCZOS
        )
        a = np.array(a_img)
        b = np.array(b_img)
    return float(
        structural_similarity(
            a,
            b,
            win_size=SSIM_WIN_SIZE,
        )
    )


class SsimDuplicateDetector:
    """Per-pair SSIM check on
    the images in the
    document.

    The detector is
    O(N^2); we cap the
    search at ``MAX_IMAGES``
    images to keep the
    cost manageable. If a
    document has more than
    ``MAX_IMAGES`` images,
    the detector emits a
    finding noting that the
    search was truncated.
    """

    name = "image_ssim"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        findings: list[Finding] = []
        images = list(doc.images)
        truncated = len(images) > MAX_IMAGES
        images = images[:MAX_IMAGES]
        # Read all images
        # once, in parallel-
        # friendly form. The
        # ``_read_image_gray``
        # helper returns
        # ``None`` for failed
        # reads; we skip those
        # silently.
        arrays: list[np.ndarray | None] = []
        for img in images:
            arrays.append(
                _read_image_gray(img.image_path or "")
            )
        for i in range(len(arrays)):
            if arrays[i] is None:
                continue
            for j in range(i + 1, len(arrays)):
                if arrays[j] is None:
                    continue
                score = _ssim_one_pair(
                    arrays[i], arrays[j]
                )
                if score < SSIM_THRESHOLD:
                    continue
                severity = (
                    "high" if score >= 0.97 else "medium"
                )
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity=severity,
                        title=(
                            f"Images {i + 1} and "
                            f"{j + 1} are visually "
                            f"near-duplicates "
                            f"(SSIM={score:.3f})"
                        ),
                        location=(
                            f"image {i + 1} on page "
                            f"{images[i].page} vs "
                            f"image {j + 1} on page "
                            f"{images[j].page}"
                        ),
                        evidence=json.dumps(
                            {
                                "image_index_a": i,
                                "image_index_b": j,
                                "page_a": images[i].page,
                                "page_b": images[j].page,
                                "ssim_score": float(score),
                            }
                        ),
                    )
                )
        if truncated:
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="low",
                    title=(
                        f"SSIM search truncated to the "
                        f"first {MAX_IMAGES} of "
                        f"{len(doc.images)} images"
                    ),
                    location="all images",
                    evidence=json.dumps(
                        {
                            "truncated": True,
                            "max_images": MAX_IMAGES,
                            "total_images": len(doc.images),
                        }
                    ),
                )
            )
        return DetectorResult(
            detector=self.name, findings=findings, ok=True
        )
