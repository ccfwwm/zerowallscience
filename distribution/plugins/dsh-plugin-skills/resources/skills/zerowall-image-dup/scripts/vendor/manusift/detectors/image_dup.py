"""Image duplicate detector — **primary** whole-image / strip path.

This is the offline-pipeline owner for cross-figure near-duplicates.
Do **not** add competing whole-image hash logic to ``imagehash_dup``
(agent-only single-algo probes). See ``docs/DETECTOR_LAYERS.md``.

Multi-pass comparison of extracted figures:

1. **Primary pHash** — reuse the precomputed ``ExtractedImage.phash``
   and flag pairs at or below the project Hamming threshold
   (default 8 bits of 64). Near-identical pairs (d ≤ 4) are high
   severity; the rest of the primary band is medium.

2. **Secondary multi-hash** — for pairs that missed the primary
   band, recompute aHash + dHash from the on-disk raster. Flag
   when either algorithm is at or below the secondary threshold
   (default 12). Catches crops, re-encodes, and line-drawing
   figures that DCT pHash under-scores.

3. **Geometric transform pass** (PubPeer Cat II) — pHash after
   H/V flip and 90/180/270° rotation so mirrored or rotated panel
   reuse still matches. Medium/high by Hamming; capped pair budget.

4. **Region / tile bridge** — for remaining pairs, compare a small
   grid of high-variance cell hashes across different images.
   This bridges the common gap where ``image_forensics`` finds
   local texture reuse (gel bands, blot fragments) but whole-image
   pHash never fires. Severity is medium; findings are capped.

5. **Loading-control ROI** — bottom-of-figure strips (typical
   β-actin / GAPDH / tubulin band region on Western blots). Flags
   pairs whose lower strips match even when whole-image hashes do
   not — a classic PubPeer cue for reused loading controls under
   different experimental labels.

Not a substitute for ``panel_dup`` / ``panel_duplicate`` (panel split
scopes differ — see ``docs/DETECTOR_LAYERS.md``).

Step 1 keeps N² over images. With typical figures (5–30) the cost
is trivial; later passes only open rasters when needed.
"""
from __future__ import annotations

import os
from typing import Any, Callable

from ..config import get_settings
from ..contracts import ExtractedImage, Finding, ParsedDoc
from .base import DetectorResult

# Secondary multi-hash band (bits of 64). Softer than primary so
# aHash/dHash can catch re-encoded or slightly cropped figures.
_SECONDARY_HAMMING: int = 12
# High severity when primary Hamming is this tight.
_HIGH_SEVERITY_HAMMING: int = 4

# Geometric transform pass (flip / rotate).
_GEO_HAMMING: int = 10
_GEO_HIGH_HAMMING: int = 4
_MAX_GEO_PAIRS: int = 180
_GEO_TRANSFORM_NAMES: tuple[str, ...] = (
    "hflip",
    "vflip",
    "rot90",
    "rot180",
    "rot270",
    "hflip_rot90",
    "hflip_rot180",
)

# Region / tile bridge (forensics-hit → image_dup recall).
_REGION_GRID: int = 4
_REGION_CELL_MIN: int = 24  # px; skip tiny cells
_REGION_HAMMING: int = 2
_REGION_MIN_STD: float = 18.0  # skip flat / blank tiles
_REGION_MAX_FINDINGS: int = 40
# Cap multi-hash decode work on very large figure sets.
_MAX_SECONDARY_PAIRS: int = 200

# Loading-control bottom-strip pass (PubPeer #5–6).
# y fractions of image height: (y0, y1) inclusive crop.
_LC_STRIPS: tuple[tuple[float, float], ...] = (
    (0.72, 1.0),   # classic bottom loading band
    (0.55, 0.82),  # mid-low strip when multi-row blots stack
)
_LC_HAMMING: int = 5
_LC_HIGH_HAMMING: int = 2
_LC_MIN_STRIP_H: int = 16  # px after crop
_LC_MIN_STD: float = 12.0  # skip blank white bottoms
_LC_MAX_FINDINGS: int = 30
_LC_MAX_PAIRS: int = 200


def _hamming(a: str, b: str) -> int:
    """Hex-string Hamming distance."""
    if len(a) != len(b):
        # Different pHash lengths cannot be compared meaningfully.
        return len(a) * 4 + len(b) * 4
    ai = int(a, 16)
    bi = int(b, 16)
    return bin(ai ^ bi).count("1")


def _severity_for_primary(d: int) -> str:
    if d <= _HIGH_SEVERITY_HAMMING:
        return "high"
    return "medium"


def _compute_algo_hash(algo: str, image_path: str | None) -> str | None:
    """Compute aHash / dHash / pHash for a path; None on failure."""
    if not image_path:
        return None
    try:
        import imagehash
        from PIL import Image

        with Image.open(image_path) as img:
            if algo == "ahash":
                h = imagehash.average_hash(img)
            elif algo == "dhash":
                h = imagehash.dhash(img)
            else:
                h = imagehash.phash(img)
        return str(h)
    except Exception:  # noqa: BLE001 — skip corrupt rasters
        return None


def _pil_transforms() -> list[tuple[str, Callable[[Any], Any]]]:
    """Named geometry transforms used for Cat-II reuse matching."""
    from PIL import Image as PILImage

    return [
        ("hflip", lambda im: im.transpose(PILImage.FLIP_LEFT_RIGHT)),
        ("vflip", lambda im: im.transpose(PILImage.FLIP_TOP_BOTTOM)),
        ("rot90", lambda im: im.transpose(PILImage.ROTATE_90)),
        ("rot180", lambda im: im.transpose(PILImage.ROTATE_180)),
        ("rot270", lambda im: im.transpose(PILImage.ROTATE_270)),
        (
            "hflip_rot90",
            lambda im: im.transpose(PILImage.FLIP_LEFT_RIGHT).transpose(
                PILImage.ROTATE_90
            ),
        ),
        (
            "hflip_rot180",
            lambda im: im.transpose(PILImage.FLIP_LEFT_RIGHT).transpose(
                PILImage.ROTATE_180
            ),
        ),
    ]


def _compute_transform_phashes(
    image_path: str | None,
) -> dict[str, str]:
    """pHash for identity + flip/rotate views of one raster."""
    if not image_path:
        return {}
    try:
        import imagehash
        from PIL import Image
    except Exception:  # noqa: BLE001
        return {}
    out: dict[str, str] = {}
    try:
        with Image.open(image_path) as img:
            base = img.convert("RGB")
            try:
                out["identity"] = str(imagehash.phash(base))
            except Exception:  # noqa: BLE001
                pass
            for name, fn in _pil_transforms():
                try:
                    transformed = fn(base)
                    out[name] = str(imagehash.phash(transformed))
                except Exception:  # noqa: BLE001
                    continue
    except Exception:  # noqa: BLE001
        return {}
    return out


def _best_geo_match(
    hashes_a: dict[str, str],
    hashes_b: dict[str, str],
) -> tuple[str, str, int] | None:
    """Best (transform_on_a, transform_on_b, hamming) under geo gate.

    Compares non-identity transforms of A to identity of B and
    identity of A to non-identity transforms of B (covers either
    side being the flipped/rotated reuse).
    """
    best: tuple[str, str, int] | None = None
    best_d = _GEO_HAMMING + 1
    id_a = hashes_a.get("identity")
    id_b = hashes_b.get("identity")
    if id_b:
        for tname, ha in hashes_a.items():
            if tname == "identity" or not ha:
                continue
            if len(ha) != len(id_b):
                continue
            d = _hamming(ha, id_b)
            if d < best_d:
                best_d = d
                best = (tname, "identity", d)
    if id_a:
        for tname, hb in hashes_b.items():
            if tname == "identity" or not hb:
                continue
            if len(id_a) != len(hb):
                continue
            d = _hamming(id_a, hb)
            if d < best_d:
                best_d = d
                best = ("identity", tname, d)
    if best is None or best[2] > _GEO_HAMMING:
        return None
    return best


def _loading_control_enabled() -> bool:
    raw = (os.environ.get("MANUSIFT_LOADING_CONTROL_ROI") or "1").strip().lower()
    return raw not in {"0", "false", "off", "no"}


def _looks_blot_like(img: ExtractedImage) -> bool:
    """Cheap gate: wide-enough raster, not a tiny icon."""
    w = int(img.width or 0)
    h = int(img.height or 0)
    if w < 80 or h < 60:
        return False
    if int(img.bytes_size or 0) < 8 * 1024:
        return False
    # Prefer landscape or square-ish (gels); still allow tall multi-panel
    return True


def _loading_control_strip_hashes(
    image_path: str | None,
) -> list[dict[str, Any]]:
    """Hash bottom/mid-low horizontal strips (loading-control ROI).

    Returns list of ``{strip_id, y0, y1, ahash, std}``.
    """
    if not image_path:
        return []
    try:
        import imagehash
        import statistics
        from PIL import Image
    except Exception:  # noqa: BLE001
        return []
    out: list[dict[str, Any]] = []
    try:
        with Image.open(image_path) as img:
            gray = img.convert("L")
            w, h = gray.size
            if h < 40 or w < 40:
                return []
            for si, (yf0, yf1) in enumerate(_LC_STRIPS):
                y0 = max(0, int(h * yf0))
                y1 = min(h, int(h * yf1))
                if y1 - y0 < _LC_MIN_STRIP_H:
                    continue
                strip = gray.crop((0, y0, w, y1))
                tiny = strip.resize((32, max(8, strip.size[1] // 4 or 8)))
                try:
                    sample = list(
                        getattr(tiny, "get_flattened_data", tiny.getdata)()
                    )
                    std = float(statistics.pstdev(sample)) if len(sample) > 4 else 0.0
                except statistics.StatisticsError:
                    std = 0.0
                if std < _LC_MIN_STD:
                    continue
                try:
                    hx = str(imagehash.average_hash(strip))
                except Exception:  # noqa: BLE001
                    continue
                out.append(
                    {
                        "strip_id": si,
                        "y0": y0,
                        "y1": y1,
                        "y0_frac": round(yf0, 3),
                        "y1_frac": round(yf1, 3),
                        "ahash": hx,
                        "std": round(std, 2),
                    }
                )
    except Exception:  # noqa: BLE001
        return []
    return out


def _best_loading_control_match(
    strips_a: list[dict[str, Any]],
    strips_b: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any], int] | None:
    """Best (strip_a, strip_b, hamming) under loading-control gate."""
    best: tuple[dict[str, Any], dict[str, Any], int] | None = None
    best_d = _LC_HAMMING + 1
    for sa in strips_a:
        ha = sa.get("ahash") or ""
        for sb in strips_b:
            hb = sb.get("ahash") or ""
            if not ha or not hb or len(ha) != len(hb):
                continue
            d = _hamming(ha, hb)
            if d < best_d:
                best_d = d
                best = (sa, sb, d)
                if d == 0:
                    return best
    if best is None or best[2] > _LC_HAMMING:
        return None
    return best


def _region_cell_hashes(
    image_path: str | None,
) -> list[tuple[int, int, str, float]]:
    """Return (row, col, ahash_hex, cell_std) for high-variance tiles.

    Uses a fixed grid so cell coordinates are stable across pairs.
    Flat tiles (icons, white margins) are dropped so we do not
    flag blank gutters as texture reuse.
    """
    if not image_path:
        return []
    try:
        from PIL import Image
        import imagehash
        import statistics
    except Exception:  # noqa: BLE001
        return []
    try:
        with Image.open(image_path) as img:
            img = img.convert("L")
            w, h = img.size
            if w < _REGION_CELL_MIN * 2 or h < _REGION_CELL_MIN * 2:
                return []
            cw = max(_REGION_CELL_MIN, w // _REGION_GRID)
            ch = max(_REGION_CELL_MIN, h // _REGION_GRID)
            out: list[tuple[int, int, str, float]] = []
            for r in range(_REGION_GRID):
                for c in range(_REGION_GRID):
                    left = min(c * cw, max(0, w - cw))
                    top = min(r * ch, max(0, h - ch))
                    cell = img.crop((left, top, left + cw, top + ch))
                    # Sample luminance for variance gate.
                    tiny = cell.resize((16, 16))
                    try:
                        sample = list(
                            getattr(tiny, "get_flattened_data", tiny.getdata)()
                        )
                    except Exception:  # noqa: BLE001
                        continue
                    if len(sample) < 4:
                        continue
                    try:
                        std = float(statistics.pstdev(sample))
                    except statistics.StatisticsError:
                        continue
                    if std < _REGION_MIN_STD:
                        continue
                    try:
                        hx = str(imagehash.average_hash(cell))
                    except Exception:  # noqa: BLE001
                        continue
                    out.append((r, c, hx, std))
            return out
    except Exception:  # noqa: BLE001
        return []


class ImageDuplicateDetector:
    """Detect near-duplicate images inside the PDF.

    Primary pHash + secondary multi-hash + region tile bridge.
    See module docstring. Size gates still skip decorative icons.
    """

    name = "image_dup"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        settings = get_settings()
        threshold = settings.image_duplicate_hamming_threshold
        images: list[ExtractedImage] = doc.images
        findings: list[Finding] = []

        # R-2026-06-19 (P0-A1/C3): classify images by size BEFORE the
        # N^2 pair loop so we can (a) skip pairs where EITHER image is
        # too small and (b) surface the skip count in stats.
        from ._image_size import summarize_image_sizes

        size_stats = summarize_image_sizes(images)
        # R-2026-06-21 (CDE-DETER): explicit sorted list (not a set)
        # so iteration order is deterministic across Python versions /
        # PYTHONHASHSEED settings.
        eligible_indexes = sorted(
            i
            for i, img in enumerate(images)
            if img.width >= 64
            and img.height >= 64
            and img.bytes_size >= 5 * 1024
        )

        # Track pairs already reported so secondary/region passes
        # do not double-count the same (i, j).
        flagged_pairs: set[tuple[int, int]] = set()
        # Whole-image-level hits only (primary / secondary / geo).
        # Region tile hits do NOT go here — loading-control still
        # needs to fire when only the bottom strip matches.
        whole_flagged: set[tuple[int, int]] = set()
        n_primary = 0
        n_secondary = 0
        n_geo = 0
        n_region = 0
        n_loading = 0

        # ----- Pass 1: primary pHash -----
        # 2026-07 (negative_controls_v1): collect matches first,
        # then demote *furniture* pairs. A logo / license icon /
        # author photo repeats across MANY images in a legitimate
        # paper; a fraudulently reused figure is typically an
        # exclusive pair. Pairs whose combined match support
        # spans > 2 images are demoted to low (not dropped, so
        # recall on 3x-duplicated fraud panels still counts).
        primary_matches: list[tuple[int, int, int]] = []
        support: dict[int, set[int]] = {}
        for i in eligible_indexes:
            for j in eligible_indexes:
                if j <= i:
                    continue
                a, b = images[i], images[j]
                pa = a.phash
                pb = b.phash
                if not pa or not pb:
                    continue
                d = _hamming(pa, pb)
                if d <= threshold:
                    primary_matches.append((i, j, d))
                    support.setdefault(i, set()).add(j)
                    support.setdefault(j, set()).add(i)
        for i, j, d in primary_matches:
            a, b = images[i], images[j]
            span = {i, j} | support.get(i, set()) | support.get(j, set())
            if len(span) >= 5:
                # True furniture: a logo / icon / author photo
                # on nearly every page.
                sev = "low"
            elif len(span) > 2:
                # Small cluster: could be a 3x-duplicated fraud
                # panel -- keep visible but not high.
                sev = "medium"
            else:
                sev = _severity_for_primary(d)
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity=sev,
                    title="Near-duplicate image detected",
                    evidence=(
                        f"Image p{i} (page {a.page + 1}) and p{j} "
                        f"(page {b.page + 1}) share pHash distance "
                        f"{d} (≤{threshold})."
                    ),
                    location=(
                        f"Page {a.page + 1} / image {a.index}  ↔  "
                        f"Page {b.page + 1} / image {b.index}"
                    ),
                    raw={
                        "image_a": {
                            "page": a.page,
                            "index": a.index,
                            "phash": a.phash,
                        },
                        "image_b": {
                            "page": b.page,
                            "index": b.index,
                            "phash": b.phash,
                        },
                        "hamming": d,
                        "algorithm": "phash",
                        "pass": "primary",
                    },
                )
            )
            flagged_pairs.add((i, j))
            whole_flagged.add((i, j))
            n_primary += 1

        # ----- Pass 2: secondary multi-hash (aHash / dHash) -----
        secondary_pairs = [
            (i, j)
            for i in eligible_indexes
            for j in eligible_indexes
            if j > i and (i, j) not in flagged_pairs
        ]
        # Prefer pairs that already look somewhat close on pHash so we
        # do not decode every distant pair on large papers.
        def _phash_hint(pair: tuple[int, int]) -> int:
            i, j = pair
            pa, pb = images[i].phash, images[j].phash
            if pa and pb and len(pa) == len(pb):
                return _hamming(pa, pb)
            return 64

        secondary_pairs.sort(key=_phash_hint)
        secondary_pairs = secondary_pairs[:_MAX_SECONDARY_PAIRS]

        # Cache secondary hashes per image index.
        ahash_cache: dict[int, str | None] = {}
        dhash_cache: dict[int, str | None] = {}

        def _get_ahash(idx: int) -> str | None:
            if idx not in ahash_cache:
                ahash_cache[idx] = _compute_algo_hash(
                    "ahash", images[idx].image_path
                )
            return ahash_cache[idx]

        def _get_dhash(idx: int) -> str | None:
            if idx not in dhash_cache:
                dhash_cache[idx] = _compute_algo_hash(
                    "dhash", images[idx].image_path
                )
            return dhash_cache[idx]

        for i, j in secondary_pairs:
            a, b = images[i], images[j]
            best_algo: str | None = None
            best_d = 64
            for algo, getter in (
                ("ahash", _get_ahash),
                ("dhash", _get_dhash),
            ):
                ha = getter(i)
                hb = getter(j)
                if not ha or not hb:
                    continue
                d = _hamming(ha, hb)
                if d < best_d:
                    best_d = d
                    best_algo = algo
            if best_algo is None or best_d > _SECONDARY_HAMMING:
                continue
            sev = "high" if best_d <= _HIGH_SEVERITY_HAMMING else "medium"
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity=sev,
                    title=(
                        f"Near-duplicate image detected "
                        f"({best_algo} secondary)"
                    ),
                    evidence=(
                        f"Image p{i} (page {a.page + 1}) and p{j} "
                        f"(page {b.page + 1}) share {best_algo} distance "
                        f"{best_d} (≤{_SECONDARY_HAMMING} secondary band)."
                    ),
                    location=(
                        f"Page {a.page + 1} / image {a.index}  ↔  "
                        f"Page {b.page + 1} / image {b.index}"
                    ),
                    raw={
                        "image_a": {
                            "page": a.page,
                            "index": a.index,
                            "phash": a.phash,
                        },
                        "image_b": {
                            "page": b.page,
                            "index": b.index,
                            "phash": b.phash,
                        },
                        "hamming": best_d,
                        "algorithm": best_algo,
                        "pass": "secondary",
                    },
                )
            )
            flagged_pairs.add((i, j))
            whole_flagged.add((i, j))
            n_secondary += 1

        # ----- Pass 2.5: geometric transform (flip / rotate) -----
        # PubPeer Cat II: same panel reused after H/V flip or 90° k rot.
        geo_pairs = [
            (i, j)
            for i in eligible_indexes
            for j in eligible_indexes
            if j > i
            and (i, j) not in flagged_pairs
            and images[i].image_path
            and images[j].image_path
        ]
        geo_pairs.sort(key=_phash_hint)
        geo_pairs = geo_pairs[:_MAX_GEO_PAIRS]
        geo_cache: dict[int, dict[str, str]] = {}

        def _get_geo(idx: int) -> dict[str, str]:
            if idx not in geo_cache:
                geo_cache[idx] = _compute_transform_phashes(
                    images[idx].image_path
                )
            return geo_cache[idx]

        for i, j in geo_pairs:
            ha = _get_geo(i)
            hb = _get_geo(j)
            if not ha or not hb:
                continue
            hit = _best_geo_match(ha, hb)
            if hit is None:
                continue
            t_a, t_b, d = hit
            a, b = images[i], images[j]
            sev = "high" if d <= _GEO_HIGH_HAMMING else "medium"
            transform_label = (
                t_a if t_a != "identity" else t_b
            )
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity=sev,
                    title=(
                        f"Near-duplicate after {transform_label} "
                        f"(geometric pass)"
                    ),
                    evidence=(
                        f"Image p{i} (page {a.page + 1}) and p{j} "
                        f"(page {b.page + 1}) match at pHash distance "
                        f"{d} after geometric transform "
                        f"(A:{t_a} vs B:{t_b}; ≤{_GEO_HAMMING}). "
                        f"Consistent with flipped/rotated panel reuse."
                    ),
                    location=(
                        f"Page {a.page + 1} / image {a.index}  ↔  "
                        f"Page {b.page + 1} / image {b.index}"
                    ),
                    raw={
                        "image_a": {
                            "page": a.page,
                            "index": a.index,
                            "transform": t_a,
                        },
                        "image_b": {
                            "page": b.page,
                            "index": b.index,
                            "transform": t_b,
                        },
                        "hamming": d,
                        "algorithm": "phash_geometric",
                        "pass": "geometric",
                        "transform": transform_label,
                        "pubpeer_pattern": "image_repositioned_reuse",
                        "check": "geometric_transform_dup",
                    },
                )
            )
            flagged_pairs.add((i, j))
            whole_flagged.add((i, j))
            n_geo += 1

        # ----- Pass 3: region / tile bridge -----
        # Only compare images that still have no whole-image hit.
        region_indexes = [
            i
            for i in eligible_indexes
            if images[i].image_path
        ]
        cell_cache: dict[int, list[tuple[int, int, str, float]]] = {}

        def _cells(idx: int) -> list[tuple[int, int, str, float]]:
            if idx not in cell_cache:
                cell_cache[idx] = _region_cell_hashes(images[idx].image_path)
            return cell_cache[idx]

        for pos_a, i in enumerate(region_indexes):
            if n_region >= _REGION_MAX_FINDINGS:
                break
            cells_a = _cells(i)
            if not cells_a:
                continue
            for j in region_indexes[pos_a + 1 :]:
                if n_region >= _REGION_MAX_FINDINGS:
                    break
                if (i, j) in flagged_pairs:
                    continue
                cells_b = _cells(j)
                if not cells_b:
                    continue
                match = _best_region_match(cells_a, cells_b)
                if match is None:
                    continue
                (ra, ca, rb, cb, d, std_a, std_b) = match
                a, b = images[i], images[j]
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity="medium",
                        title=(
                            "Local region reuse across images "
                            "(tile bridge)"
                        ),
                        evidence=(
                            f"Image p{i} (page {a.page + 1}) cell "
                            f"({ra},{ca}) and p{j} (page {b.page + 1}) "
                            f"cell ({rb},{cb}) share tile aHash distance "
                            f"{d} (≤{_REGION_HAMMING}). Consistent with "
                            f"reused panel/gel/texture fragments that "
                            f"whole-image pHash misses."
                        ),
                        location=(
                            f"Page {a.page + 1} / image {a.index} "
                            f"cell ({ra},{ca})  ↔  "
                            f"Page {b.page + 1} / image {b.index} "
                            f"cell ({rb},{cb})"
                        ),
                        raw={
                            "image_a": {
                                "page": a.page,
                                "index": a.index,
                                "cell": [ra, ca],
                            },
                            "image_b": {
                                "page": b.page,
                                "index": b.index,
                                "cell": [rb, cb],
                            },
                            "hamming": d,
                            "std_a": std_a,
                            "std_b": std_b,
                            "algorithm": "tile_ahash",
                            "pass": "region",
                            "grid": _REGION_GRID,
                        },
                    )
                )
                flagged_pairs.add((i, j))
                n_region += 1

        # ----- Pass 4: loading-control bottom-strip ROI -----
        # Whole-image mismatch + matching lower strip → classic reused
        # actin/GAPDH under different experimental labels (PubPeer).
        if _loading_control_enabled():
            lc_indexes = [
                i
                for i in eligible_indexes
                if images[i].image_path and _looks_blot_like(images[i])
            ]
            lc_cache: dict[int, list[dict[str, Any]]] = {}

            def _lc_strips(idx: int) -> list[dict[str, Any]]:
                if idx not in lc_cache:
                    lc_cache[idx] = _loading_control_strip_hashes(
                        images[idx].image_path
                    )
                return lc_cache[idx]

            # Skip only whole-image-level pairs; region tile hits
            # (e.g. shared bottom band) must still reach LC pass.
            lc_pairs = [
                (i, j)
                for pos, i in enumerate(lc_indexes)
                for j in lc_indexes[pos + 1 :]
                if (i, j) not in whole_flagged
            ]
            # Prefer pairs not already close on primary pHash
            def _lc_phash_hint(pair: tuple[int, int]) -> int:
                i, j = pair
                pa, pb = images[i].phash, images[j].phash
                if pa and pb and len(pa) == len(pb):
                    return -_hamming(pa, pb)  # prefer distant first
                return 0

            lc_pairs.sort(key=_lc_phash_hint)
            lc_pairs = lc_pairs[:_LC_MAX_PAIRS]
            for i, j in lc_pairs:
                if n_loading >= _LC_MAX_FINDINGS:
                    break
                strips_a = _lc_strips(i)
                strips_b = _lc_strips(j)
                if not strips_a or not strips_b:
                    continue
                hit = _best_loading_control_match(strips_a, strips_b)
                if hit is None:
                    continue
                sa, sb, d = hit
                # If whole-image primary already near-identical, skip —
                # already reported as figure reuse, not specifically LC.
                pa, pb = images[i].phash, images[j].phash
                whole_close = bool(
                    pa
                    and pb
                    and len(pa) == len(pb)
                    and _hamming(pa, pb) <= threshold
                )
                if whole_close:
                    continue
                a, b = images[i], images[j]
                sev = "high" if d <= _LC_HIGH_HAMMING else "medium"
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity=sev,
                        title=(
                            "Possible loading-control band reuse "
                            "(bottom-strip ROI)"
                        ),
                        evidence=(
                            f"Lower-figure strip on p{i} "
                            f"(page {a.page + 1}, y={sa['y0_frac']}-"
                            f"{sa['y1_frac']}) matches p{j} "
                            f"(page {b.page + 1}, y={sb['y0_frac']}-"
                            f"{sb['y1_frac']}) at aHash distance {d} "
                            f"(≤{_LC_HAMMING}). Whole-image hashes differ "
                            f"or were not already flagged as identical — "
                            f"consistent with a reused β-actin/GAPDH-style "
                            f"loading control under different labels."
                        ),
                        location=(
                            f"Page {a.page + 1} / image {a.index} "
                            f"strip[{sa['strip_id']}]  ↔  "
                            f"Page {b.page + 1} / image {b.index} "
                            f"strip[{sb['strip_id']}]"
                        ),
                        raw={
                            "check": "loading_control_roi_dup",
                            "pass": "loading_control",
                            "hamming": d,
                            "algorithm": "strip_ahash",
                            "pubpeer_pattern": "image_loading_control_reuse",
                            "strip_a": {
                                "y0_frac": sa["y0_frac"],
                                "y1_frac": sa["y1_frac"],
                                "std": sa["std"],
                            },
                            "strip_b": {
                                "y0_frac": sb["y0_frac"],
                                "y1_frac": sb["y1_frac"],
                                "std": sb["std"],
                            },
                            "image_a": {
                                "page": a.page,
                                "index": a.index,
                            },
                            "image_b": {
                                "page": b.page,
                                "index": b.index,
                            },
                        },
                    )
                )
                # Do not add to flagged_pairs: whole-image still free
                # for other passes; LC is a specialized signal.
                n_loading += 1

        stats: dict[str, Any] = size_stats.to_stats_dict()
        stats.update(
            {
                "n_primary_hits": n_primary,
                "n_secondary_hits": n_secondary,
                "n_geometric_hits": n_geo,
                "n_region_hits": n_region,
                "n_loading_control_hits": n_loading,
                "primary_threshold": threshold,
                "secondary_threshold": _SECONDARY_HAMMING,
                "geometric_threshold": _GEO_HAMMING,
                "loading_control_threshold": _LC_HAMMING,
            }
        )
        return DetectorResult(
            detector=self.name,
            ok=True,
            findings=findings,
            stats=stats,
        )


def _best_region_match(
    cells_a: list[tuple[int, int, str, float]],
    cells_b: list[tuple[int, int, str, float]],
) -> tuple[int, int, int, int, int, float, float] | None:
    """Return best (ra, ca, rb, cb, d, std_a, std_b) under Hamming gate."""
    best: tuple[int, int, int, int, int, float, float] | None = None
    best_d = _REGION_HAMMING + 1
    for ra, ca, ha, std_a in cells_a:
        for rb, cb, hb, std_b in cells_b:
            if len(ha) != len(hb):
                continue
            d = _hamming(ha, hb)
            if d > _REGION_HAMMING:
                continue
            if d < best_d:
                best_d = d
                best = (ra, ca, rb, cb, d, std_a, std_b)
                if d == 0:
                    return best
    return best
