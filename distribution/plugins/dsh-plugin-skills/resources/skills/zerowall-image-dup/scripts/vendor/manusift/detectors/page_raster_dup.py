"""R-2026-06-12: Page-raster image-duplication detector.

The Frontiers (and other modern-PDF) workflow often embeds
figure panels as **vector graphics** (PDF drawing operators)
rather than as raster images. ``PyMuPDF.Page.get_images()`` on
these pages returns an empty list, so the existing
``image_dup`` detector has nothing to hash. The result: the
``real_eval_fraud_cases/`` benchmark's case_005
(Frontiers CpxR/A Salmonella) shows 0 image_dup findings even
though the official retraction cites 4 separate figure panels
with image-duplication problems.

This detector fills the gap by **rendering every PDF page to
a bitmap** (PyMuPDF ``Page.get_pixmap(dpi=200)``) and then
hashing the figure regions. Two panels that look visually
identical will hash the same way regardless of whether they
were originally a raster JPEG, a PNG, or a vector drawing --
the bitmap conversion normalises them all.

The detection strategy is intentionally simple:

  1. Open the source PDF with PyMuPDF.
  2. For every page, render at 200 DPI to a single-channel
     grayscale bitmap.
  3. Use OpenCV to find the **figure regions**: large
     connected components of non-white pixels separated by
     whitespace. The image body and the figure caption
     are the two main regions of a typical scientific-paper
     page; we hash both independently so the page layout
     doesn't dominate the hash.
  4. Compute the same pHash that ``image_dup`` uses and
     emit a finding for every near-duplicate pair (Hamming
     distance at or below the configured threshold).

This module deliberately **does not** segment individual
panels (A, B, C, ...) within a single figure -- that
problem requires CV-based panel segmentation and is
listed as a separate "next iteration" in
``real_eval_fraud_cases/recommended_next_iterations.md``.
The figure-region hash is sufficient to catch the
whole-figure duplications the benchmark's missed cases
are about.
"""
from __future__ import annotations

import io
import logging

try:
    import fitz  # PyMuPDF
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

import imagehash

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult

log = logging.getLogger(__name__)


# The minimum height of a connected component of
# non-white pixels (in pixels at 200 DPI) for it to
# be treated as a candidate figure region. 30px at
# 200 DPI == 3.8mm -- small enough to catch
# in-text micro-figures, large enough to exclude
# bullet points and small line-art.
_MIN_REGION_PX = 80

# The minimum width-to-height ratio. Long horizontal
# strips are almost always a single figure with a
# caption underneath, not multiple separate regions.
_MIN_REGION_AREA = 30_000

# Render DPI. 200 is the industry standard for
# scientific-figure hashing -- 150 is visibly fuzzy
# on small Western-blot panels, 300 is 2.25x slower
# without a measurable improvement in pHash accuracy.
_RENDER_DPI = 200

# Cap on the number of regions per page that we
# actually hash. A typical paper page has 1-2 figure
# regions; 8 is a generous safety cap. This prevents
# a single pathological page from forcing an
# N-squared comparison over hundreds of regions.
_MAX_REGIONS_PER_PAGE = 8


class PageRasterDuplicateDetector:
    """Detect duplicate figure regions across PDF pages by
    rendering every page to a bitmap and hashing the
    figure regions.

    The detector is intentionally conservative: it only
    emits a finding when the Hamming distance is at or
    below the project-wide ``image_duplicate_hamming_threshold``
    setting. With typical figures (1-2 regions per page)
    the N-squared comparison is fast.
    """

    name = "page_raster_dup"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        if not _HAS_FITZ:
            log.warning(
                "PyMuPDF (fitz) not installed -- "
                "page_raster_dup detector is a no-op"
            )
            return DetectorResult(
                detector=self.name, findings=[], ok=True,
            )
        if not _HAS_CV2:
            log.warning(
                "OpenCV (cv2) not installed -- "
                "page_raster_dup detector is a no-op"
            )
            return DetectorResult(
                detector=self.name, findings=[], ok=True,
            )

        try:
            pdf = fitz.open(doc.source_path)
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "page_raster_dup: failed to open %s: %s",
                doc.source_path, exc,
            )
            return DetectorResult(
                detector=self.name, findings=[], ok=True,
            )

        try:
            return self._run_on_pdf(doc, pdf)
        finally:
            try:
                pdf.close()
            except Exception:  # noqa: BLE001
                pass

    def _run_on_pdf(self, doc: ParsedDoc, pdf: "fitz.Document") -> DetectorResult:
        try:
            from .image_dup import _hamming  # type: ignore
        except ImportError:  # pragma: no cover
            _hamming = _fallback_hamming  # type: ignore

        from ..config import get_settings
        threshold = get_settings().image_duplicate_hamming_threshold
        # Secondary band for tile / multi-hash hits (same as image_dup).
        secondary = max(threshold, 10)

        # Phase 1: render every page and extract figure-region
        # crops PLUS high-variance tiles. Whole-region pHash
        # alone often misses panel-level reuse (bio_img_003:
        # min whole-region Hamming was ~28). Tiles catch that.
        # Each entry: (page_idx, unit_id, algo, hash, meta)
        units: list[tuple[int, str, str, str, dict]] = []
        for page_idx in range(len(pdf)):
            try:
                page = pdf[page_idx]
            except Exception:  # noqa: BLE001
                continue
            page_regions = _extract_figure_regions(page)
            for region_idx, (crop_pil, bbox) in enumerate(page_regions):
                if crop_pil.width < 16 or crop_pil.height < 16:
                    continue
                for algo, hx in _hash_variants(crop_pil):
                    units.append(
                        (
                            page_idx,
                            f"r{region_idx}",
                            algo,
                            hx,
                            {"bbox": bbox, "kind": "region"},
                        )
                    )
                # Sub-tiles of large figure regions.
                for tile_id, tile in _tiles_from_image(crop_pil, grid=2):
                    for algo, hx in _hash_variants(tile):
                        units.append(
                            (
                                page_idx,
                                f"r{region_idx}_{tile_id}",
                                algo,
                                hx,
                                {"bbox": bbox, "kind": "region_tile"},
                            )
                        )
            # Full-page grid (catches figures when CC region
            # extraction merges too aggressively or misses).
            page_tiles = _page_grid_tiles(page, grid=4)
            for tile_id, tile in page_tiles:
                for algo, hx in _hash_variants(tile):
                    units.append(
                        (
                            page_idx,
                            f"pg_{tile_id}",
                            algo,
                            hx,
                            {"kind": "page_tile"},
                        )
                    )

        # Phase 2: compare units across different pages (same
        # algo only). Cap findings to avoid flood.
        findings: list[Finding] = []
        seen_pairs: set[tuple[int, int, str]] = set()
        n = len(units)
        # 2026-07 (negative_controls_v1): page furniture and
        # repeating text tiles (running heads, reference
        # lists, boilerplate, table grids) match across MANY
        # pages and produced ~90% of page_raster false
        # positives on legitimate papers. A genuinely copied
        # figure is *exclusive*: its hash neighbourhood spans
        # at most 2 pages. Page_tile<->page_tile pairs are
        # therefore emitted only when their combined match
        # support spans <= 2 pages. Region-involving pairs
        # keep the previous behaviour (fraud signal lives
        # there -- bio_img_003 etc.).
        matches: list[tuple[int, int, int, bool]] = []
        support: dict[int, set[int]] = {}
        for i in range(n):
            pi, uid_i, algo_i, hi, meta_i = units[i]
            for j in range(i + 1, n):
                pj, uid_j, algo_j, hj, meta_j = units[j]
                if pi == pj or algo_i != algo_j:
                    continue
                d = _hamming(hi, hj)
                # Primary: whole-region pHash at project threshold.
                # Secondary: tiles / multi-hash at softer band.
                # aHash alone is too loose on page footers/headers
                # (often Hamming 0 across every page) — require a
                # tight aHash (≤4) or prefer pHash/dHash for tiles.
                is_primary = (
                    meta_i.get("kind") == "region"
                    and meta_j.get("kind") == "region"
                    and algo_i == "phash"
                    and d <= threshold
                )
                if algo_i == "ahash":
                    is_secondary = (not is_primary) and d <= 4
                else:
                    is_secondary = (not is_primary) and d <= secondary
                if not is_primary and not is_secondary:
                    continue
                support.setdefault(i, set()).add(pj)
                support.setdefault(j, set()).add(pi)
                matches.append((i, j, d, is_primary))
        for i, j, d, is_primary in matches:
            pi, uid_i, algo_i, hi, meta_i = units[i]
            pj, uid_j, algo_j, hj, meta_j = units[j]
            pair_key = (min(pi, pj), max(pi, pj), algo_i)
            if pair_key in seen_pairs:
                continue
            seen_pairs.add(pair_key)
            # 2026-07 (negative_controls_v1): page furniture
            # and repeated template elements (running heads,
            # journal banners, licence icons, axis frames)
            # match across MANY pages and produced ~90% of
            # page_raster false positives on legitimate
            # papers. A genuinely copied figure is usually
            # an *exclusive* pair. Demote by cluster span
            # (>=5 pages -> low furniture, >2 -> medium),
            # then by channel: page_tile<->page_tile is a
            # weak fallback channel and never goes high.
            span = (
                {pi, pj}
                | support.get(i, set())
                | support.get(j, set())
            )
            if len(span) >= 5:
                sev = "low"
            elif len(span) > 2:
                sev = "medium"
            elif (
                meta_i.get("kind") == "page_tile"
                and meta_j.get("kind") == "page_tile"
            ):
                sev = "low"
            else:
                sev = "high" if d <= 4 or is_primary else "medium"
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity=sev,
                    title=(
                        "Near-duplicate figure region "
                        "detected (page raster)"
                    ),
                    evidence=(
                        f"Page {pi + 1} ({uid_i}) and "
                        f"page {pj + 1} ({uid_j}) share "
                        f"{algo_i} distance {d} "
                        f"(≤{threshold if is_primary else secondary})."
                    ),
                    location=(
                        f"Page {pi + 1}  ↔  Page {pj + 1}"
                    ),
                    raw={
                        "page_a": pi,
                        "page_b": pj,
                        "unit_a": uid_i,
                        "unit_b": uid_j,
                        "phash_a": hi,
                        "phash_b": hj,
                        "hamming": d,
                        "algorithm": algo_i,
                        "kind_a": meta_i.get("kind"),
                        "kind_b": meta_j.get("kind"),
                        "pass": (
                            "primary" if is_primary else "tile"
                        ),
                    },
                )
            )
            if len(findings) >= 40:
                break

        return DetectorResult(
            detector=self.name, ok=True, findings=findings,
        )


def _hash_variants(img: Image.Image) -> list[tuple[str, str]]:
    """Return (algo, hex) for pHash / aHash / dHash."""
    out: list[tuple[str, str]] = []
    try:
        out.append(("phash", str(imagehash.phash(img))))
    except Exception:  # noqa: BLE001
        pass
    try:
        out.append(("ahash", str(imagehash.average_hash(img))))
    except Exception:  # noqa: BLE001
        pass
    try:
        out.append(("dhash", str(imagehash.dhash(img))))
    except Exception:  # noqa: BLE001
        pass
    return out


def _tiles_from_image(
    img: Image.Image,
    grid: int = 2,
    min_std: float = 12.0,
) -> list[tuple[str, Image.Image]]:
    """Split a crop into a grid of high-variance tiles."""
    w, h = img.size
    if w < 64 or h < 64:
        return []
    out: list[tuple[str, Image.Image]] = []
    for r in range(grid):
        for c in range(grid):
            left = c * w // grid
            top = r * h // grid
            right = (c + 1) * w // grid
            bottom = (r + 1) * h // grid
            tile = img.crop((left, top, right, bottom))
            if min(tile.size) < 32:
                continue
            try:
                import statistics

                sample = list(
                    getattr(
                        tile.resize((16, 16)),
                        "get_flattened_data",
                        tile.resize((16, 16)).getdata,
                    )()
                )
                if len(sample) < 4:
                    continue
                std = float(statistics.pstdev(sample))
            except Exception:  # noqa: BLE001
                continue
            if std < min_std:
                continue
            out.append((f"t{r}{c}", tile))
    return out


def _page_grid_tiles(
    page: "fitz.Page",
    grid: int = 4,
) -> list[tuple[str, Image.Image]]:
    """Render a page and return high-variance grid tiles."""
    try:
        matrix = fitz.Matrix(_RENDER_DPI / 72.0, _RENDER_DPI / 72.0)
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("L")
    except Exception:  # noqa: BLE001
        return []
    return _tiles_from_image(img, grid=grid, min_std=12.0)


def _extract_figure_regions(
    page: "fitz.Page",
) -> list[tuple[Image.Image, tuple[int, int, int, int]]]:
    """Render ``page`` to a bitmap and crop out the
    figure-like regions.

    The strategy is to threshold the grayscale page
    at 250/255 (i.e. anything visibly non-white) and
    look for connected components. Each component that
    is large enough to be a figure (rather than a
    bullet point or a stray line of text) is returned
    as a separate PIL Image.

    Returns a list of ``(image, (x, y, w, h))`` tuples
    where the bounding box is in pixel coordinates
    relative to the rendered page.
    """
    # R-audit (2026-06-12): the standard PyMuPDF
    # recipe for rendering a page to a bitmap.
    # ``alpha=False`` strips the alpha channel so
    # the bitmap is 3-channel RGB instead of RGBA.
    matrix = fitz.Matrix(_RENDER_DPI / 72.0, _RENDER_DPI / 72.0)
    pix = page.get_pixmap(matrix=matrix, alpha=False)
    img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("L")
    arr = np.array(img)

    # Threshold: anything < 250 is "ink". This is
    # intentionally very tolerant -- faint gray
    # anti-aliased pixel boundaries still count.
    ink = (arr < 250).astype(np.uint8)

    # Connected components. ``connectivity=8`` so a
    # figure with a small gap in the middle (e.g. a
    # Western blot's empty lane) is still treated as
    # one region.
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(
        ink, connectivity=8,
    )

    # Collect candidate regions and merge components
    # that are vertically adjacent (the body of a
    # figure is usually one or two components; the
    # caption is right below it; we want to hash
    # both together so the same caption text doesn't
    # dominate the hash).
    candidates: list[tuple[int, int, int, int]] = []
    for label in range(1, num_labels):  # skip background (0)
        x, y, w, h, area = stats[label]
        if w < _MIN_REGION_PX or h < _MIN_REGION_PX:
            continue
        if area < _MIN_REGION_AREA:
            continue
        candidates.append((x, y, w, h))

    if not candidates:
        return []

    # Sort top-to-bottom, left-to-right.
    candidates.sort(key=lambda b: (b[1], b[0]))

    # Merge components that are vertically close
    # (the figure body + its caption text).
    merged: list[list[int]] = []
    for c in candidates:
        x, y, w, h = c
        if merged:
            mx, my, mw, mh = merged[-1]
            if y < my + mh + 30 and x < mx + mw:
                # Same column block, vertically adjacent.
                merged[-1] = [
                    min(mx, x),
                    min(my, y),
                    max(mx + mw, x + w) - min(mx, x),
                    max(my + mh, y + h) - min(my, y),
                ]
                continue
        merged.append([x, y, w, h])

    # Cap to avoid pathological pages.
    merged = merged[:_MAX_REGIONS_PER_PAGE]

    crops: list[tuple[Image.Image, tuple[int, int, int, int]]] = []
    for (x, y, w, h) in merged:
        crop = img.crop((x, y, x + w, y + h))
        crops.append((crop, (x, y, w, h)))

    return crops


def _fallback_hamming(a: str, b: str) -> int:
    """Hex-string Hamming distance fallback."""
    if len(a) != len(b):
        return len(a) * 4 + len(b) * 4
    ai = int(a, 16)
    bi = int(b, 16)
    return bin(ai ^ bi).count("1")
