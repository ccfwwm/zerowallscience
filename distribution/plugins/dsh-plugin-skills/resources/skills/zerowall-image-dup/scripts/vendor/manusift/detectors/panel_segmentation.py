"""Within-figure panel segmentation + reuse (``panel_duplicate``).

Registry name: ``panel_duplicate`` (class ``PanelSegmentationDetector``).

**Not the same as** ``panel_dup``:

| | this module (``panel_duplicate``) | ``panel_dup`` |
|--|----------------------------------|---------------|
| Scope | Panels **inside one** extracted figure | Across pages / figure regions |
| Split | Otsu / layout segmentation | Whitespace-gap on raster regions |
| Compare | SSIM + pHash between panels | Panel pHash across splits |

See ``docs/DETECTOR_LAYERS.md``.

---

P3.1: Scientific figures often contain multiple *panels* (a, b, c, d).
A common fraud signal is that two panels in the **same** figure are
near-duplicates. Detecting that requires *first* identifying panels,
*then* comparing them. Other panels provide a negative control.

This module layers a panel
*segmenter* and a
panel-vs-panel comparator
on top of the existing
SSIM tool. The segmenter:

  1. Reads the image as
     grayscale.
  2. Thresholds it with
     Otsu's method to
     separate "white"
     panels from a "black"
     background (or vice
     versa, depending on
     the figure).
  3. Calls
     ``cv2.findContours``
     on the binary mask to
     find the panel
     boundaries.
  4. Picks the top-N
     largest contours and
     uses
     ``cv2.boundingRect``
     to recover the
     axis-aligned bounding
     boxes of the panels.

The comparator then runs
the SSIM metric (or the
cheaper pHash Hamming
distance) on every pair of
panels and emits a finding
when two panels are
visually near-duplicates.

The detector is read-only.
It does not save the panel
images to disk; it only
reports the bounding boxes
and the SSIM scores.

Borrowed from the
``findContours`` recipe
in the OpenCV docs and
the panel-segmentation
step in the
``ImageTwin`` service
(Springer 2026).
"""
from __future__ import annotations

import json
from importlib.util import find_spec
from typing import Any

_HAS_NUMPY = find_spec("numpy") is not None
_HAS_CV2 = find_spec("cv2") is not None

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult


# Tunable constants.
MIN_PANEL_AREA_FRACTION: float = 0.01
# The minimum number of
# panels required to flag
# a duplicate. A figure
# with one panel cannot
# contain a duplicate.
MIN_PANEL_COUNT: int = 2
# SSIM threshold below
# which two panels are
# considered different.
# Higher = more
# conservative; we use
# the same 0.85 as the
# image-level SSIM
# detector.
# Slightly below whole-image SSIM (0.85) so panel crops that
# share a gel/blot with mild brightness shift still fire.
SSIM_THRESHOLD: float = 0.78
# pHash Hamming gate as a second metric when SSIM under-scores
# re-encoded SEM / gel crops.
PANEL_PHASH_HAMMING: int = 10
# Maximum number of
# panels to consider per
# image. A figure with
# more than this is
# either a poster or
# anomalously busy.
MAX_PANELS: int = 16


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


def _segment_panels(
    gray: Any,
) -> list[tuple[int, int, int, int]]:
    """Return the axis-aligned
    bounding boxes of the
    largest connected
    components in the image.

    The algorithm is:

      1. Threshold the
         grayscale image
         with Otsu's method
         (separates the
         "white" panels from
         the "dark" gutters).
      2. Invert if more than
         half the image is
         white (in case the
         background is
         dark).
      3. Morphological close
         + open to remove
         text and tick marks.
      4. ``cv2.findContours``
         with
         ``RETR_EXTERNAL``
         (outer contours
         only).
      5. Sort by area,
         descend, keep top
         ``MAX_PANELS``.
      6. For each contour,
         ``boundingRect``
         and return as
         ``(x, y, w, h)``.

    Returns a list of
    bounding boxes; an empty
    list if no panel-shaped
    component is found.
    """
    cv2 = _load_cv2()
    np = _load_numpy()
    if cv2 is None or np is None:
        return []
    h, w = gray.shape
    total = h * w
    # Otsu threshold. The
    # panels are the
    # *brighter* region in
    # the typical
    # Western-blot /
    # microscopy /
    # plot figure, so we
    # invert only when the
    # image is
    # *predominantly
    # white* (the panels
    # are dark on a light
    # background, e.g. a
    # black-and-white
    # chart on a white
    # page). When the
    # image is mostly
    # black, the panels
    # are the bright
    # foreground and we do
    # not invert.
    _, binary = cv2.threshold(
        gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
    )
    if np.mean(binary) > 200:
        # Image is mostly
        # white in the
        # binary; invert
        # so the dark
        # panels become
        # the foreground.
        binary = 255 - binary
    # Morphological close to
    # fill small gaps; then
    # open to remove
    # one-pixel noise.
    kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT, (5, 5)
    )
    closed = cv2.morphologyEx(
        binary, cv2.MORPH_CLOSE, kernel
    )
    cleaned = cv2.morphologyEx(
        closed, cv2.MORPH_OPEN, kernel
    )
    contours, _ = cv2.findContours(
        cleaned,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )
    if not contours:
        return []
    # Sort by area, descend.
    boxes_with_area = sorted(
        (
            (cv2.boundingRect(c), cv2.contourArea(c))
            for c in contours
        ),
        key=lambda x: -x[1],
    )
    out: list[tuple[int, int, int, int]] = []
    min_area = total * MIN_PANEL_AREA_FRACTION
    # The whole image is
    # one big "panel"
    # when the image is
    # uniform or only
    # contains a
    # single shape that
    # fills the frame. We
    # skip such boxes.
    max_area_fraction = 0.9
    for (x, y, bw, bh), area in boxes_with_area:
        if area < min_area:
            break
        if area > total * max_area_fraction:
            continue
        out.append((int(x), int(y), int(bw), int(bh)))
        if len(out) >= MAX_PANELS:
            break
    return out


def _grid_panel_boxes(
    gray: Any,
) -> list[tuple[int, int, int, int]]:
    """Fallback: fixed 1×2 / 2×1 / 2×2 grids when contours fail.

    Scientific multi-panel figures often lack a clean white
    gutter that Otsu can split; a coarse grid still yields
    comparable crops for SSIM / pHash.
    """
    h, w = gray.shape[:2]
    if h < 64 or w < 64:
        return []
    candidates: list[list[tuple[int, int, int, int]]] = [
        # 1×2 horizontal
        [(0, 0, w // 2, h), (w // 2, 0, w - w // 2, h)],
        # 2×1 vertical
        [(0, 0, w, h // 2), (0, h // 2, w, h - h // 2)],
        # 2×2
        [
            (0, 0, w // 2, h // 2),
            (w // 2, 0, w - w // 2, h // 2),
            (0, h // 2, w // 2, h - h // 2),
            (w // 2, h // 2, w - w // 2, h - h // 2),
        ],
    ]
    # Prefer the grid whose cells have the most balanced
    # non-empty variance (not blank gutters).
    best: list[tuple[int, int, int, int]] = []
    best_score = -1.0
    np = _load_numpy()
    if np is None:
        return candidates[0]
    for boxes in candidates:
        vars_: list[float] = []
        ok = True
        for x, y, bw, bh in boxes:
            if bw < 32 or bh < 32:
                ok = False
                break
            cell = gray[y : y + bh, x : x + bw]
            vars_.append(float(np.std(cell)))
        if not ok or not vars_:
            continue
        # Penalize blank cells; reward balanced texture.
        if min(vars_) < 5.0:
            continue
        score = float(min(vars_) * (sum(vars_) / len(vars_)))
        if score > best_score:
            best_score = score
            best = boxes
    return best


def _panel_phash_distance(a: Any, b: Any) -> int | None:
    """Hamming distance between pHashes of two grayscale crops."""
    try:
        import imagehash
        from PIL import Image
        import numpy as np

        def _to_pil(arr: Any) -> Image.Image:
            if hasattr(arr, "dtype"):
                a2 = np.asarray(arr)
                if a2.ndim == 2:
                    return Image.fromarray(a2.astype("uint8"), mode="L")
                return Image.fromarray(a2.astype("uint8"))
            return Image.fromarray(arr)

        ha = str(imagehash.phash(_to_pil(a)))
        hb = str(imagehash.phash(_to_pil(b)))
        if len(ha) != len(hb):
            return None
        return bin(int(ha, 16) ^ int(hb, 16)).count("1")
    except Exception:  # noqa: BLE001
        return None


class PanelSegmentationDetector:
    """For every image in the document, segment panels and
    compare pairs via SSIM + pHash (contour or grid)."""

    name = "panel_duplicate"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        if not _HAS_NUMPY:
            return DetectorResult(
                detector=self.name,
                findings=[],
                ok=True,
            )
        from .ssim import _read_image_gray, _ssim_one_pair

        findings: list[Finding] = []
        for i, img in enumerate(doc.images):
            path = img.image_path
            if not path:
                continue
            gray = _read_image_gray(path)
            if gray is None:
                continue
            boxes = _segment_panels(gray)
            method = "contour"
            if len(boxes) < MIN_PANEL_COUNT:
                boxes = _grid_panel_boxes(gray)
                method = "grid"
            if len(boxes) < MIN_PANEL_COUNT:
                continue
            # Crop each panel and compare.
            panels: list[Any] = []
            for x, y, w, h in boxes:
                panels.append(gray[y : y + h, x : x + w])
            for a in range(len(panels)):
                for b in range(a + 1, len(panels)):
                    if panels[a].size == 0 or panels[b].size == 0:
                        continue
                    score = _ssim_one_pair(panels[a], panels[b])
                    ph_d = _panel_phash_distance(panels[a], panels[b])
                    ssim_hit = score >= SSIM_THRESHOLD
                    phash_hit = (
                        ph_d is not None and ph_d <= PANEL_PHASH_HAMMING
                    )
                    if not ssim_hit and not phash_hit:
                        continue
                    # 2026-07 (negative_controls_v1): white
                    # backgrounds inflate SSIM between *distinct*
                    # same-layout panels (SSIM 0.97 with pHash 28
                    # was common on legit papers). "high" now
                    # requires corroboration: extreme SSIM with a
                    # compatible pHash, or a tight pHash alone.
                    if (
                        ssim_hit
                        and score >= 0.97
                        and (ph_d is None or ph_d <= 16)
                    ):
                        severity = "high"
                    elif phash_hit and ph_d is not None and ph_d <= 4:
                        severity = "high"
                    else:
                        severity = "medium"
                    findings.append(
                        Finding.make(
                            trace_id=doc.trace_id,
                            detector=self.name,
                            severity=severity,
                            title=(
                                f"Panels {a + 1} and "
                                f"{b + 1} in image {i + 1} "
                                f"on page {img.page} are "
                                f"near-duplicates "
                                f"(SSIM={score:.3f}"
                                f"{'' if ph_d is None else f', pHash={ph_d}'})"
                            ),
                            location=(
                                f"image {i + 1} on page "
                                f"{img.page}, panels "
                                f"({boxes[a]}, {boxes[b]})"
                            ),
                            evidence=json.dumps(
                                {
                                    "image_index": i,
                                    "page": img.page,
                                    "panel_a": list(boxes[a]),
                                    "panel_b": list(boxes[b]),
                                    "ssim_score": float(score),
                                    "phash_hamming": ph_d,
                                    "segment_method": method,
                                }
                            ),
                        )
                    )
        return DetectorResult(
            detector=self.name, findings=findings, ok=True
        )
