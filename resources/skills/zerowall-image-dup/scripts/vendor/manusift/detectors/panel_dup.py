"""Panel-level hash reuse across figure regions / pages (``panel_dup``).

**Not the same as** ``panel_duplicate`` (``PanelSegmentationDetector``):

| | this module (``panel_dup``) | ``panel_duplicate`` |
|--|----------------------------|---------------------|
| Scope | Cross-region / cross-page panel hashes | Within **one** multi-panel figure |
| Split | Whitespace-gap on page-raster figure regions | Otsu/layout panel segmentation |
| Compare | Panel pHash | Panel SSIM + pHash |

See ``docs/DETECTOR_LAYERS.md``. Keep both; do not merge without a
benchmark plan.

---

R-2026-06-12: The v4 page_raster_dup detector hashed whole figure
regions. Official retractions often cite *panels* within multi-panel
figures (Figure 1C, 2, 3A/3B, 5B), which whole-figure hash misses.

This detector sits **on top of** page_raster_dup and
splits each figure region into its constituent panels
using a deterministic whitespace-gap detector, then
hashes each panel independently.

Algorithm
---------

For each figure region returned by
``page_raster_dup._extract_figure_regions``:

  1. Threshold the region to binary (ink vs. not ink).
  2. Compute the **column ink profile**: for each
     x-column, the fraction of pixels that are ink.
     A "gap" column is one where the profile is near
     zero over a stretch of >= ``_MIN_GAP_PX`` pixels.
  3. Compute the **row ink profile** the same way for
     y-rows.
  4. Find the most significant gap in each profile.
     "Most significant" = the longest gap in the
     interior of the region (excluding the 10% border
     so we don't split on the figure border).
  5. If a significant gap is found, split the region
     into two sub-regions and recurse on each
     sub-region (depth-first panel splitting).
  6. The recursion stops when no significant gap
     remains or when the region is smaller than
     ``_MIN_PANEL_SIDE``.

This is the same approach used by ImageMagick's
``-trim`` + grid-detection in the image.sc community.
It is a heuristic: it does not use ML, and it makes
no assumptions about panel letter labels. The
resulting panel pHashes are the *only* output -- the
detector deliberately does not try to OCR the panel
letter (A, B, C, ...) because that requires EasyOCR
and a separate change.

The detector compares every panel against every other
panel across the whole document using the standard
project-wide ``image_duplicate_hamming_threshold``
setting (default 5 bits of 64).

Honest limits
-------------

  * Panels separated by *content* (e.g. a thin line,
    a coloured background) rather than by whitespace
    are not detected. The Frontiers case_005 figures
    use whitespace gaps, so this works there.
  * Multi-row figures (1x4, 2x3, ...) are split
    depth-first -- first by the dominant axis (whichever
    has the longer gap), then recurse on each half.
  * The detector does not do panel-letter OCR. The
    finding location string is
    ``"Page N region M panel K"`` -- page-relative
    panel index, not letter.
"""
from __future__ import annotations

import os

try:
    import fitz  # type: ignore
    _HAS_FITZ = True
except ImportError:  # pragma: no cover
    _HAS_FITZ = False

import numpy as np
from PIL import Image

try:
    import cv2  # type: ignore
    _HAS_CV2 = True
except ImportError:  # pragma: no cover
    _HAS_CV2 = False

# R-2026-06-19 (P1-C2):
# detect whether
# OpenCV is
# compiled with
# CUDA support.
# When it is,
# the
# ``cv2.dnn``
# module and
# some
# ``cv2.cuda``
# functions are
# available and
# the user can
# opt in to GPU
# acceleration
# via
# ``MANUSIFT_PANEL_DUP_GPU=1``.
# Default
# behaviour
# stays CPU-only
# (cross-platform,
# no CUDA
# runtime
# requirement)
# so this is a
# pure opt-in.
_HAS_CV2_CUDA = False
if _HAS_CV2:
    try:
        _HAS_CV2_CUDA = (
            cv2.cuda.getCudaEnabledDeviceCount() > 0
        )
    except Exception:  # noqa: BLE001
        _HAS_CV2_CUDA = False

# P1-C2: opt-in
# GPU flag
# (defaults to
# False -- CPU is
# the safe path).
_PANEL_DUP_GPU = (
    os.environ.get("MANUSIFT_PANEL_DUP_GPU", "0")
    == "1"
)

import imagehash

from ..contracts import Finding, ParsedDoc
from ..trace import get_logger
from .base import DetectorResult

# R-2026-06-19 (P1-C2):
# progress logger
# emits one
# ``INFO``
# event per
# page so the
# TUI / CLI
# can show
# "panel_dup:
# 5/12 pages
# processed"
# without the
# detector
# having to
# know about
# Textual /
# Rich /
# tqdm. The
# log channel
# already goes
# to the trace
# bus, so the
# TUI can
# subscribe to
# ``detector.progress``
# events.
_panel_dup_log = get_logger(__name__)

log = _panel_dup_log


# A horizontal/vertical gap must be at least this many
# pixels of "mostly white" to count as a panel divider.
# At 200 DPI this is 3 mm -- a smaller gap might just be
# the space between characters in a caption.
_MIN_GAP_PX = 20

# A panel must be at least this many pixels on each
# side after splitting, otherwise we stop recursing
# (the split would produce a too-small fragment).
_MIN_PANEL_SIDE = 80

# A "white" column/row has at most this fraction of
# ink pixels. The page background is not 100% white
# after JPEG re-encoding, so a tiny threshold is
# appropriate.
#
# R-2026-06-12: bumped the default from 0.005 to
# 0.04 because Frontiers (and other modern-PDF)
# figures use very light gray dividers between
# panels (not pure white). The previous threshold
# found zero panel dividers in case_005. With
# 0.04, the gap detection finds the panel
# separators as designed. PLOS and other vector-
# drawing PDFs are unaffected (their gap columns
# are even lower density than 0.04).
_WHITE_THRESHOLD = 0.04

# How many "interior" columns/rows on each edge we
# ignore when searching for the dominant gap. This
# prevents the figure border from being mistaken
# for a panel divider.
_BORDER_FRAC = 0.10

# The minimum *length* of the longest gap (in pixels)
# as a fraction of the figure region's shorter side.
# If the longest gap is shorter than this fraction, we
# don't split (the gap isn't a real panel divider).
_MIN_GAP_FRAC = 0.04

# Maximum recursion depth. 4 is enough for 1x2, 2x2,
# 1x3, 2x3, 1x4 grids (4 levels of binary split).
_MAX_DEPTH = 4

# Cap on panels per page. A typical scientific page
# has 1-3 multi-panel figures; 16 is a safety cap.
_MAX_PANELS_PER_PAGE = 16


class PanelDuplicateDetector:
    """Detect duplicate panels within PDF figures.

    Sits on top of ``page_raster_dup._extract_figure_regions``
    and re-uses the same region extraction so the two
    detectors can co-exist. The detection logic itself
    is independent (panel splitting + cross-panel pHash).
    """

    name = "panel_dup"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        # R-2026-06-19 (P1-C2):
        # if the user set
        # ``MANUSIFT_PANEL_DUP_GPU=1``
        # but the
        # installed
        # OpenCV is not
        # compiled with
        # CUDA, log a
        # warning and
        # fall back to
        # CPU. The user
        # will see
        # "GPU requested
        # but
        # unavailable"
        # in the trace
        # log so they
        # know the
        # env-var is
        # being honored
        # but the
        # hardware
        # is not.
        if _PANEL_DUP_GPU and not _HAS_CV2_CUDA:
            log.warning(
                "panel_dup: GPU requested via "
                "MANUSIFT_PANEL_DUP_GPU=1 but OpenCV is "
                "not built with CUDA -- falling back to CPU. "
                "Install opencv-python (not opencv-python-headless) "
                "compiled with -DWITH_CUDA=ON to enable GPU."
            )
        if not _HAS_FITZ or not _HAS_CV2:
            log.warning(
                "panel_dup: PyMuPDF / OpenCV missing -- no-op"
            )
            return DetectorResult(
                detector=self.name, findings=[], ok=True,
            )

        try:
            pdf = fitz.open(doc.source_path)
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "panel_dup: failed to open %s: %s",
                doc.source_path, exc,
            )
            return DetectorResult(
                detector=self.name, findings=[], ok=True,
            )

        try:
            from .image_dup import _hamming  # type: ignore
        except ImportError:  # pragma: no cover
            _hamming = _fallback_hamming  # type: ignore

        from .page_raster_dup import _extract_figure_regions

        from ..config import get_settings
        threshold = get_settings().image_duplicate_hamming_threshold

        # Phase 1: render every page, extract figure
        # regions, split each region into panels.
        panels: list[tuple[int, int, str]] = []
        # Tuple = (page_idx_1based, panel_index_on_page,
        # pHash).
        # R-2026-06-19 (P0-A1/C3):
        # track per-panel size
        # stats so the report
        # renderer can show
        # "panels too small
        # for panel_dup"
        # instead of a
        # silent "no
        # finding" when
        # the paper's
        # panels are
        # schematic /
        # low-res.
        # R-2026-06-19 (P1-C2):
        # also track per-page
        # progress so the
        # TUI / CLI can
        # show "5/12 pages
        # processed" for
        # long-running PDFs
        # (panel_dup is the
        # slowest detector
        # because it
        # re-renders every
        # page and runs an
        # N^2 panel
        # comparison).
        n_panels_total = 0
        n_panels_too_small = 0
        n_panels_decoded = 0
        _PROGRESS_EVERY = max(1, len(pdf) // 10)  # 10 events max
        for page_idx in range(len(pdf)):
            # R-2026-06-19 (P1-C2):
            # emit one progress
            # log per
            # ``_PROGRESS_EVERY``
            # pages (capped at
            # 10 events per
            # document) so
            # the TUI status
            # bar can show
            # "panel_dup
            # 7/24 pages" in
            # real time.
            # The
            # ``detector.progress``
            # event channel
            # is consumed by
            # the TUI
            # ``ToolCallCard``
            # status line and
            # the CLI
            # ``--verbose``
            # mode.
            if (
                page_idx % _PROGRESS_EVERY == 0
                and len(pdf) > 1
            ):
                _panel_dup_log.info(
                    "panel_dup progress",
                    extra={
                        "event": "detector.progress",
                        "detector": self.name,
                        "page_idx": page_idx + 1,
                        "page_count": len(pdf),
                        "panels_so_far": len(panels),
                    },
                )
            try:
                page = pdf[page_idx]
            except Exception:  # noqa: BLE001
                continue
            try:
                regions = _extract_figure_regions(page)
            except Exception:  # noqa: BLE001
                continue
            for region_idx, (crop, _bbox) in enumerate(regions):
                sub_panels = _split_into_panels(crop)
                for panel_idx, panel_img in enumerate(sub_panels):
                    n_panels_total += 1
                    if (
                        panel_img.width < 16
                        or panel_img.height < 16
                    ):
                        n_panels_too_small += 1
                        continue
                    try:
                        h = str(imagehash.phash(panel_img))
                    except Exception:  # noqa: BLE001
                        continue
                    n_panels_decoded += 1
                    panels.append(
                        (page_idx + 1, region_idx * 100 + panel_idx, h)
                    )
            # Apply the cap.
            panels_on_page = [p for p in panels if p[0] == page_idx + 1]
            if len(panels_on_page) > _MAX_PANELS_PER_PAGE:
                # Truncate.
                panels = [
                    p for p in panels
                    if p[0] != page_idx + 1
                    or panels_on_page.index(p) < _MAX_PANELS_PER_PAGE
                ]

        # Phase 2: cross-panel comparison. We compare
        # panels ACROSS pages AND within a page, so the
        # detection finds:
        #   - within-page panel duplications
        #     (e.g. Figure 1A and Figure 1B are the same);
        #   - between-page panel duplications
        #     (e.g. Figure 1A on page 7 == Figure 3A on
        #     page 9).
        findings: list[Finding] = []
        n = len(panels)
        # 2026-07 (negative_controls_v1): every pair used to
        # be emitted at HIGH, which flooded legit multi-panel
        # papers (same-style axes/lanes match everywhere).
        # Now: tight d<=4 is high only for *exclusive* pairs;
        # small clusters are medium, big clusters (furniture:
        # axis frames, lane boxes) are low.
        matches: list[tuple[int, int, int]] = []
        support: dict[int, set[int]] = {}
        for i in range(n):
            for j in range(i + 1, n):
                p1, idx1, h1 = panels[i]
                p2, idx2, h2 = panels[j]
                # Skip within-same-region same-panel
                # comparisons -- they are by definition
                # identical (the recursion can produce
                # the same crop if no split happened).
                if p1 == p2 and idx1 == idx2:
                    continue
                d = _hamming(h1, h2)
                if d <= threshold:
                    matches.append((i, j, d))
                    support.setdefault(i, set()).add(j)
                    support.setdefault(j, set()).add(i)
        for i, j, d in matches:
            p1, idx1, h1 = panels[i]
            p2, idx2, h2 = panels[j]
            span = {i, j} | support.get(i, set()) | support.get(j, set())
            if len(span) >= 5:
                sev = "low"
            elif len(span) > 2:
                sev = "medium"
            else:
                sev = "high" if d <= 4 else "medium"
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity=sev,
                    title=(
                        "Near-duplicate panel detected"
                    ),
                    evidence=(
                        f"Page {p1} panel {idx1} and "
                        f"page {p2} panel {idx2} share "
                        f"pHash distance {d} (≤ "
                        f"{threshold})."
                    ),
                    location=(
                        f"Page {p1}/panel {idx1}  ↔  "
                        f"Page {p2}/panel {idx2}"
                    ),
                    raw={
                        "page_a": p1,
                        "panel_a": idx1,
                        "phash_a": h1,
                        "page_b": p2,
                        "panel_b": idx2,
                        "phash_b": h2,
                        "hamming": d,
                    },
                )
            )

        # R-2026-06-19 (P0-A1/C3):
        # emit size stats so
        # the report
        # renderer can
        # show the user
        # *why* no
        # panel-level
        # duplication
        # was found (most
        # likely: panels
        # were too small
        # to analyze).
        # R-2026-06-19 (P1-C2):
        # emit a final
        # progress event
        # so the TUI
        # status bar can
        # show "panel_dup
        # done: N panels,
        # M findings"
        # after the
        # detector
        # returns.
        _panel_dup_log.info(
            "panel_dup done",
            extra={
                "event": "detector.progress",
                "detector": self.name,
                "page_idx": len(pdf),
                "page_count": len(pdf),
                "panels_so_far": len(panels),
                "findings": len(findings),
            },
        )
        return DetectorResult(
            detector=self.name,
            ok=True,
            findings=findings,
            stats={
                "n_panels_total": n_panels_total,
                "n_panels_too_small": n_panels_too_small,
                "n_panels_decoded": n_panels_decoded,
                "n_panels_analyzed": len(panels),
                "min_panel_size": 16,
            },
        )


def _split_into_panels(
    region: Image.Image,
) -> list[Image.Image]:
    """Recursively split a figure region into panels
    using whitespace-gap detection.

    Returns a list of PIL Images. A region that has no
    internal gap is returned as a single-element list
    (the whole region is treated as one panel).
    """
    return _recurse_split(region, depth=0)


def _recurse_split(
    region: Image.Image, depth: int,
) -> list[Image.Image]:
    if depth >= _MAX_DEPTH:
        return [region]
    w, h = region.size
    if w < _MIN_PANEL_SIDE or h < _MIN_PANEL_SIDE:
        return [region]
    if w < 2 * _MIN_PANEL_SIDE and h < 2 * _MIN_PANEL_SIDE:
        return [region]

    arr = np.array(region.convert("L"))
    ink = (arr < 250).astype(np.float32)
    if ink.sum() < 100:
        # Region is too sparse -- probably a
        # borderline figure-region detection.
        # Don't split further.
        return [region]

    # Compute row / column ink profiles (mean ink
    # density per row / column).
    row_profile = ink.mean(axis=1)  # shape (h,)
    col_profile = ink.mean(axis=0)  # shape (w,)

    # R-2026-06-12: only attempt to split if the
    # region is large enough to contain a meaningful
    # panel grid. The minimum is 2x2 panels of
    # ``_MIN_PANEL_SIDE`` each plus inter-panel
    # dividers. Without this guard the recursion
    # happily splits a 95x108 strip into 9
    # 9-wide / 26-wide sub-fragments.
    if w < 3 * _MIN_PANEL_SIDE and h < 3 * _MIN_PANEL_SIDE:
        return [region]

    # Find the longest white run in each profile,
    # ignoring the outer border.
    h_border = int(h * _BORDER_FRAC)
    w_border = int(w * _BORDER_FRAC)
    row_gap = _longest_white_run(
        row_profile[h_border:h - h_border]
        if h > 2 * h_border else row_profile,
        _WHITE_THRESHOLD,
    )
    col_gap = _longest_white_run(
        col_profile[w_border:w - w_border]
        if w > 2 * w_border else col_profile,
        _WHITE_THRESHOLD,
    )

    # Decide which axis to split on. The longer gap
    # wins; ties go to the vertical split (column gap)
    # because figures more often split horizontally
    # (panels side by side).
    candidates: list[tuple[str, int, int]] = []
    if row_gap[1] >= _MIN_GAP_PX and row_gap[1] >= h * _MIN_GAP_FRAC:
        candidates.append(("row", row_gap[0] + h_border, row_gap[1]))
    if col_gap[1] >= _MIN_GAP_PX and col_gap[1] >= w * _MIN_GAP_FRAC:
        candidates.append(("col", col_gap[0] + w_border, col_gap[1]))
    if not candidates:
        return [region]
    # Pick the longest gap.
    candidates.sort(key=lambda c: c[2], reverse=True)
    axis, offset, length = candidates[0]

    if axis == "row":
        # Horizontal gap -- split top / bottom.
        # R-2026-06-12: clamp the split location so the
        # resulting sub-regions are at least
        # ``_MIN_PANEL_SIDE`` wide. Without the clamp,
        # a gap detected at offset=0 produced a
        # 0-width sub-region and infinite recursion
        # (down to 1-row-wide panels).
        gap_center = offset
        if gap_center < _MIN_PANEL_SIDE:
            gap_center = _MIN_PANEL_SIDE
        if gap_center > h - _MIN_PANEL_SIDE:
            gap_center = h - _MIN_PANEL_SIDE
        y0 = max(0, gap_center - length // 2)
        y1 = min(h, gap_center + length // 2)
        # If
        # the
        # split
        # would
        # produce
        # a
        # degenerate
        # sub-region,
        # give
        # up.
        if y0 <= 0 or y1 >= h or y0 >= y1:
            return [region]
        top = region.crop((0, 0, w, y0))
        bot = region.crop((0, y1, w, h))
        results: list[Image.Image] = []
        for sub in (top, bot):
            if sub.size[0] == 0 or sub.size[1] == 0:
                continue
            if (
                sub.width >= _MIN_PANEL_SIDE
                and sub.height >= _MIN_PANEL_SIDE
            ):
                results.extend(_recurse_split(sub, depth + 1))
            else:
                # Don't
                # recurse
                # into
                # a
                # degenerate
                # region;
                # just
                # append
                # it.
                results.append(sub)
        return results
    else:
        # Vertical gap -- split left / right. Same
        # clamp logic as above.
        gap_center = offset
        if gap_center < _MIN_PANEL_SIDE:
            gap_center = _MIN_PANEL_SIDE
        if gap_center > w - _MIN_PANEL_SIDE:
            gap_center = w - _MIN_PANEL_SIDE
        x0 = max(0, gap_center - length // 2)
        x1 = min(w, gap_center + length // 2)
        if x0 <= 0 or x1 >= w or x0 >= x1:
            return [region]
        left = region.crop((0, 0, x0, h))
        right = region.crop((x1, 0, w, h))
        results = []
        for sub in (left, right):
            if sub.size[0] == 0 or sub.size[1] == 0:
                continue
            if (
                sub.width >= _MIN_PANEL_SIDE
                and sub.height >= _MIN_PANEL_SIDE
            ):
                results.extend(_recurse_split(sub, depth + 1))
            else:
                results.append(sub)
        return results


def _longest_white_run(
    profile: np.ndarray, threshold: float,
) -> tuple[int, int]:
    """Return (start_index, length) of the longest
    contiguous run of values below ``threshold`` in
    ``profile``.

    ``threshold`` is the maximum ink density for a
    "white" cell. A column/row whose mean ink density
    is below this is considered a whitespace gap.
    """
    is_white = profile < threshold
    best_start = 0
    best_len = 0
    cur_start = -1
    for i, w in enumerate(is_white):
        if w:
            if cur_start < 0:
                cur_start = i
        else:
            if cur_start >= 0:
                run_len = i - cur_start
                if run_len > best_len:
                    best_len = run_len
                    best_start = cur_start
                cur_start = -1
    if cur_start >= 0:
        run_len = len(is_white) - cur_start
        if run_len > best_len:
            best_len = run_len
            best_start = cur_start
    return (best_start, best_len)


def _fallback_hamming(a: str, b: str) -> int:
    """Hex-string Hamming distance fallback."""
    if len(a) != len(b):
        return len(a) * 4 + len(b) * 4
    ai = int(a, 16)
    bi = int(b, 16)
    return bin(ai ^ bi).count("1")
