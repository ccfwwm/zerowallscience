"""Agent-only single-algorithm imagehash probes (not the batch path).

**Production / offline screen:** use ``image_dup`` (multi-pass pHash +
aHash/dHash + geometric + region + loading-control). These classes are
listed in ``pipeline.PIPELINE_EXCLUDED`` so batch screen does not
double-count.

**Do not add new whole-image duplicate logic here** — extend
``image_dup.py`` instead. See ``docs/DETECTOR_LAYERS.md``.

Historical note (Step T3): thin wrappers around ``imagehash`` for
agent inspection of one algorithm at a time:

  * ``PHashDetector`` — DCT pHash
  * ``AHashDetector`` — average hash
  * ``DHashDetector`` — difference hash
  * ``WHashDetector`` — wavelet hash (costly; agent-only)

Each detector compares every
pair of images in the document
and reports a finding whenever
the Hamming distance falls
below a configurable
threshold. The default is 10
out of 64 bits (~85% similar)
which catches both obvious
duplicates and the more
sneaky "same figure with a
2% crop" attacks that image
manipulation tools produce.

Borrowed from
``imagehash`` (Johannes
Buchner, MIT licensed) and the
conceptual model used in
``PhotoHolmes`` (Springer 2025)
which exposes a single
``Hash`` interface that all
four algorithms implement.
"""
from __future__ import annotations

import json

import imagehash
from PIL import Image

from ..contracts import ExtractedImage, Finding, ParsedDoc
from .base import DetectorResult


def _hamming(hex_a: str, hex_b: str) -> int:
    """Hamming distance between two
    hex strings of equal length.
    Used internally for the
    cross-pair comparison; the
    public API computes hashes
    via the ``imagehash`` library
    directly."""
    if len(hex_a) != len(hex_b):
        # Defensive: a malformed
        # hash (different lengths)
        # cannot be meaningfully
        # compared. We use the
        # combined length as an
        # upper bound so the pair
        # is never flagged.
        return len(hex_a) * 4 + len(hex_b) * 4
    return bin(int(hex_a, 16) ^ int(hex_b, 16)).count("1")


def _compute_hash(algo: str, image_path: str | None) -> str | None:
    """Compute the requested
    ``imagehash`` family over
    the image at ``image_path``.
    Returns the hex string of
    the hash, or None if the
    file cannot be opened or
    decoded. We catch all
    exceptions (PIL raises a
    variety of decode errors) so
    a single corrupted image in
    the PDF does not crash the
    whole detector run.

    The detector reads the
    ``image_path`` attribute
    that the PDF ingest step
    set; if the path is missing
    or no longer valid, we
    return None and the calling
    code skips the pair.
    """
    if not image_path:
        return None
    try:
        img = Image.open(image_path)
    except Exception:  # noqa: BLE001
        return None
    try:
        if algo == "phash":
            h = imagehash.phash(img)
        elif algo == "ahash":
            h = imagehash.average_hash(img)
        elif algo == "dhash":
            h = imagehash.dhash(img)
        elif algo == "whash":
            h = imagehash.whash(img)
        else:
            # Unknown algorithm --
            # fall back to phash.
            h = imagehash.phash(img)
    except Exception:  # noqa: BLE001
        return None
    return str(h)


def _compare_pairs(
    images: list[ExtractedImage],
    threshold: int,
    algo: str,
) -> list[tuple[int, int, int]]:
    """O(N^2) pairwise comparison.

    Returns a list of
    ``(i, j, distance)`` tuples
    for every pair whose Hamming
    distance is at or below
    ``threshold``. We pre-compute
    each image's hash once
    (re-using the hash from
    ``ExtractedImage.phash`` if
    the algorithm matches) so
    the per-pair cost is just a
    Hamming distance between two
    hex strings, not a full
    image decode.

    The O(N^2) cost is fine for
    a typical paper (5 to 30
    images) and avoids pulling
    in a vector index. Step
    T3.5 can swap in faiss if a
    future paper needs to
    compare against a million
    images.
    """
    out: list[tuple[int, int, int]] = []
    hashes: list[str | None] = []
    for img in images:
        # The ``ExtractedImage``
        # already carries a 64-bit
        # pHash string from the
        # PDF parser; reuse it if
        # the algorithm matches
        # so we do not decode the
        # same image twice.
        if algo == "phash" and img.phash:
            hashes.append(img.phash)
        else:
            hashes.append(
                _compute_hash(algo, img.image_path)
            )
    for i in range(len(images)):
        for j in range(i + 1, len(images)):
            hi, hj = hashes[i], hashes[j]
            if hi is None or hj is None:
                continue
            d = _hamming(hi, hj)
            if d <= threshold:
                out.append((i, j, d))
    return out


class _ImageHashDetectorBase:
    """Common logic for the four
    ``imagehash`` detectors. Each
    subclass sets ``algo`` and
    ``display_name``. We do not
    inherit from a base class
    in ``manusift.detectors.base``
    so the existing pipeline
    can pick up the subclasses
    via the same Plugin
    registration mechanism.

    The detector returns a
    ``DetectorResult`` with one
    finding per duplicate pair.
    The severity is "high" for
    Hamming distance <= 4
    (near-identical), "medium"
    for <= 8, and "low" for the
    rest. The exact cutoff can
    be tuned via the
    ``MANUSIFT_DUP_SEVERITY_HIGH``
    env var in a future revision;
    today the constants are
    hard-coded.
    """

    algo: str = "phash"
    display_name: str = "pHash"
    name: str = "imagehash_phash"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        from ..config import get_settings
        settings = get_settings()
        threshold = settings.image_duplicate_hamming_threshold
        images = doc.images
        findings: list[Finding] = []
        for i, j, d in _compare_pairs(
            images, threshold, self.algo
        ):
            a = images[i]
            b = images[j]
            if d <= 4:
                sev = "high"
            elif d <= 8:
                sev = "medium"
            else:
                sev = "low"
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity=sev,
                    title=(
                        f"Cross-page {self.display_name} "
                        f"duplicate (Hamming {d})"
                    ),
                    location=(
                        f"page {a.page} <-> page {b.page}"
                    ),
                    evidence=json.dumps(
                        {
                            "image_a": {
                                "page": a.page,
                                "phash": a.phash,
                                "width": a.width,
                                "height": a.height,
                            },
                            "image_b": {
                                "page": b.page,
                                "phash": b.phash,
                                "width": b.width,
                                "height": b.height,
                            },
                            "hamming": d,
                            "algorithm": self.algo,
                            "description": (
                                f"Image on page {a.page} and "
                                f"image on page {b.page} have "
                                f"Hamming distance {d} under the "
                                f"{self.display_name} perceptual "
                                f"hash."
                            ),
                            "suggested_action": (
                                "Visually compare the two images "
                                "side by side."
                            ),
                        }
                    ),
                )
            )
        return DetectorResult(
            detector=self.name,
            findings=findings,
            ok=True,
        )


class PHashDetector(_ImageHashDetectorBase):
    """Classic DCT-based perceptual
    hash. The most common
    starting point for image
    duplicate detection. Good
    for natural photographs."""

    algo = "phash"
    display_name = "pHash"
    name = "imagehash_phash"


class AHashDetector(_ImageHashDetectorBase):
    """Average hash. Fastest of the
    four, robust to scaling,
    weaker on rotation. Useful
    as a fast first pass when
    the document has hundreds
    of small thumbnail-style
    images."""

    algo = "ahash"
    display_name = "aHash"
    name = "imagehash_ahash"


class DHashDetector(_ImageHashDetectorBase):
    """Difference hash. Strong on
    line drawings, screenshots,
    and high-contrast figures
    (the kind of figure most
    common in CS / statistics
    papers)."""

    algo = "dhash"
    display_name = "dHash"
    name = "imagehash_dhash"


class WHashDetector(_ImageHashDetectorBase):
    """Wavelet hash. Slowest but
    most accurate on JPEG
    photographs that have been
    re-encoded multiple times.
    Use when the paper has
    figures that look like
    stock photos (the typical
    case for biomedical
    papers)."""

    algo = "whash"
    display_name = "wHash"
    name = "imagehash_whash"
