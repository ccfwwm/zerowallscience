"""R-2026-06-19 (P0-A1/C3,
small-image
graceful skip):
shared helper
for the 3
image-based
detectors
(``image_dup``
/
``image_sift_copymove``
/
``image_panel_dup``)
to gracefully
skip images
that are too
small to
analyze
reliably, and
to surface the
skip count in
the detector's
``stats`` so
the LLM (and
the report)
can see *why*
no finding was
emitted.

Background
(R-2026-06-19):
``case_env_005``
showed that a
Frontiers plant-
science paper
had no image
findings even
though the
official gold
expected
"Fig. 4 image
duplication".
The root cause
was: the paper
PDF only had
``~9 KB``
raster images
(small
schematic
diagrams),
and the
image-based
detectors
silently
skipped them
(``phash=None``
or
``arr.shape <
(min_w,
min_h)``) without
any
explanation.
The LLM and
the human
reader then
saw "no image
findings" and
couldn't tell
whether (a) the
paper truly
had no image
duplication or
(b) the
detectors
refused to
look because
the images were
too small.

The fix: each
image-based
detector
computes
``too_small_count``
and surfaces it
in the
returned
``DetectorResult.stats``
field. The
``run_report``
renderer reads
``stats`` and
adds a note to
the report
("5 images too
small for
image_dup
analysis
(< 64x64);
manual
inspection
required")
so the user
isn't confused
by a silent
"no finding"
on a paper
with image-
related
concerns.

This is *not*
a new detector
- it is a
transparency
improvement.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..contracts import ExtractedImage

# Default
# thresholds
# for the
# "too small"
# check. These
# are the
# same cutoffs
# used in
# image_dup
# (phash DCT
# needs at
# least
# 16x16 to
# be
# meaningful)
# and in
# sift_copymove
# (sift
# keypoints
# need at
# least
# ~64x64 to
# find a
# reliable
# set of
# features).
MIN_WIDTH = 64
MIN_HEIGHT = 64
MIN_BYTES = 5 * 1024  # 5 KB -- protects against 0-byte placeholders and 1x1 icons


@dataclass(frozen=True)
class ImageSizeStats:
    """Per-image size classification for an image-based detector.

    R-2026-06-19 (P0-A1/C3):
    returned by
    :func:`classify_image_size`
    and merged
    across the
    document to
    produce a
    ``stats``
    dict that
    the report
    renderer
    surfaces
    alongside
    findings.
    """

    n_total: int
    n_too_small: int
    n_too_small_w: int
    n_too_small_h: int
    n_too_small_bytes: int
    # List of
    # image
    # indexes
    # that
    # were
    # skipped
    # because
    # they
    # were
    # too
    # small.
    # Each
    # entry
    # is
    # ``(page, index, width, height, bytes_size)``
    # so the
    # LLM
    # can
    # point
    # the
    # user
    # to
    # the
    # exact
    # figures
    # that
    # were
    # skipped.
    skipped: list[tuple[int, int, int, int, int]]

    def to_stats_dict(self) -> dict[str, Any]:
        """Convert to a ``DetectorResult.stats`` dict.

        Stable key
        ordering so
        tests can
        assert on
        the shape.
        """
        return {
            "n_images_total": self.n_total,
            "n_images_analyzed": self.n_total - self.n_too_small,
            "n_images_too_small": self.n_too_small,
            "min_width": MIN_WIDTH,
            "min_height": MIN_HEIGHT,
            "min_bytes": MIN_BYTES,
            "skipped_too_small": [
                {
                    "page": p,
                    "index": i,
                    "width": w,
                    "height": h,
                    "bytes_size": b,
                }
                for p, i, w, h, b in self.skipped
            ],
        }


def classify_image_size(
    img: ExtractedImage,
    *,
    min_width: int = MIN_WIDTH,
    min_height: int = MIN_HEIGHT,
    min_bytes: int = MIN_BYTES,
) -> tuple[bool, str | None]:
    """Return ``(is_too_small, reason)`` for an image.

    R-2026-06-19 (P0-A1/C3):
    the unified
    "too small to
    analyze"
    check used by
    all 3
    image-based
    detectors.

    Returns
    ``(True, reason)``
    when the image
    is below any
    of the
    thresholds;
    ``reason`` is a
    short string
    like
    ``"width<64"`` /
    ``"height<64"``
    /
    ``"bytes<5120"``
    so the stats
    can break
    down the
    reasons
    separately.

    Returns
    ``(False, None)``
    when the image
    is large enough
    to analyze.
    """
    if img.width < min_width:
        return True, "width"
    if img.height < min_height:
        return True, "height"
    if img.bytes_size < min_bytes:
        return True, "bytes"
    return False, None


def summarize_image_sizes(
    images: list[ExtractedImage],
    *,
    min_width: int = MIN_WIDTH,
    min_height: int = MIN_HEIGHT,
    min_bytes: int = MIN_BYTES,
) -> ImageSizeStats:
    """Classify all images in the document and aggregate stats.

    R-2026-06-19 (P0-A1/C3):
    used by the 3
    image-based
    detectors'
    ``run()`` to
    build the
    ``stats``
    payload for
    the returned
    ``DetectorResult``.
    The renderer
    reads this
    and adds a
    transparency
    note when
    ``n_images_too_small``
    is non-zero.
    """
    n_total = len(images)
    n_w = n_h = n_b = 0
    skipped: list[tuple[int, int, int, int, int]] = []
    for img in images:
        too_small, reason = classify_image_size(
            img,
            min_width=min_width,
            min_height=min_height,
            min_bytes=min_bytes,
        )
        if not too_small:
            continue
        if reason == "width":
            n_w += 1
        elif reason == "height":
            n_h += 1
        elif reason == "bytes":
            n_b += 1
        skipped.append(
            (img.page + 1, img.index, img.width, img.height, img.bytes_size)
        )
    return ImageSizeStats(
        n_total=n_total,
        n_too_small=len(skipped),
        n_too_small_w=n_w,
        n_too_small_h=n_h,
        n_too_small_bytes=n_b,
        skipped=skipped,
    )
