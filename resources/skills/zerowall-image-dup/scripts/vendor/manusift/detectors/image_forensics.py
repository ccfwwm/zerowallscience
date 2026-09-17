"""Image forensics detector (within-image + cross-image local matches).

**Owns:** SIFT copy-move, grid aHash secondary, ELA/JPEG ghost, cross-image
SIFT, gel seam, texture overlap, optional backends.

**Does not own** whole-image near-duplicates (`image_dup`) or
within-figure panel SSIM grids (`panel_duplicate`).
See `docs/DETECTOR_LAYERS.md`.

Default analysis order (scientific paper integrity):

1. **SIFT-CMFD + RANSAC** (primary copy-move) — keypoint self-match,
   translation clustering, affine/homography RANSAC confirmation.
   See :mod:manusift.detectors.sift_copymove.

2. **Cross-image SIFT/ORB local match** — region reuse across different
   extracted figures (scale/rotation tolerant).

3. **Panel-segment-then-match** — contour panel boxes, then SIFT match
   between panels inside the same figure.

4. **JPEG ghost** — multi-quality re-encode residual map for native
   JPEG sources (double-compression / splice candidates).

5. **ELA** (secondary) — classic error-level analysis; useful but
   high FP on PNG-like PDF extractions.

6. **Grid aHash copy-move** (secondary / demoted) — N×N cell pHash;
   kept for coverage when OpenCV/SIFT is unavailable and as a weak
   corroborating signal.

7. **Texture overlap + full-file SHA-1** — exact/near local texture
   reuse and whole-image identity.

8. **Vertical gel seam** (P6.1 heuristic) — column-wise edge energy
   peak with gutter / multi-panel FP guards; severity ≤ medium.

9. **Optional backends** — PhotoHolmes-style hooks via
   `MANUSIFT_IMAGE_BACKEND` (:mod:manusift.detectors.image_backends).

All checks need pixel access via `ExtractedImage.image_path`.
Images without a path are skipped.
"""
from __future__ import annotations

import io
import os
from pathlib import Path

import numpy as np
from PIL import Image

from ..config import Settings, get_settings
from ..contracts import ExtractedImage, Finding, ParsedDoc
from ..trace import get_logger
from .base import DetectorResult

log = get_logger(__name__)

# Cap pairwise cross-image SIFT comparisons (O(n^2)).
_CROSS_SIFT_MAX_IMAGES = int(
    os.environ.get("MANUSIFT_CROSS_SIFT_MAX_IMAGES", "24")
)
_CROSS_SIFT_MAX_FINDINGS = int(
    os.environ.get("MANUSIFT_CROSS_SIFT_MAX_FINDINGS", "15")
)
# JPEG ghost
_JPEG_GHOST_QUALITIES = tuple(
    int(x)
    for x in os.environ.get(
        "MANUSIFT_JPEG_GHOST_QUALITIES", "60,70,75,80,85,90,95"
    ).split(",")
    if x.strip().isdigit()
) or (60, 70, 75, 80, 85, 90, 95)
_JPEG_GHOST_MAX_SIDE = int(
    os.environ.get("MANUSIFT_JPEG_GHOST_MAX_SIDE", "512")
)
_JPEG_GHOST_GRID = int(os.environ.get("MANUSIFT_JPEG_GHOST_GRID", "8"))
_JPEG_GHOST_STRENGTH_THR = float(
    os.environ.get("MANUSIFT_JPEG_GHOST_THR", "12.0")
)
# Grid aHash is secondary when SIFT is available.
_GRID_COPYMOVE_SECONDARY = os.environ.get(
    "MANUSIFT_GRID_COPYMOVE_SECONDARY", "1"
).strip().lower() not in {"0", "false", "no", "off"}

# P6.1 vertical gel/blot splice seam heuristic.
_SEAM_MAX_SIDE = int(os.environ.get("MANUSIFT_GEL_SEAM_MAX_SIDE", "640"))
_SEAM_MIN_WIDTH = 80
_SEAM_MIN_HEIGHT = 40
# Raised after negative_controls_v1 (2026-07): multi-panel gutters
# routinely exceed the old 2.8/3.2 gates. Require both metrics.
# Prominence ~4.5 on hard mid-width noise-field joins; 5.5 was too
# strict once AND with ratio is required.
_SEAM_PROMINENCE_THR = float(
    os.environ.get("MANUSIFT_GEL_SEAM_PROMINENCE", "4.2")
)
_SEAM_RATIO_THR = float(os.environ.get("MANUSIFT_GEL_SEAM_RATIO", "4.0"))
# Peak or adjacent columns near pure white/black → multi-panel gutter.
_SEAM_GUTTER_HI = 220.0
_SEAM_GUTTER_LO = 18.0
_SEAM_GUTTER_NEIGHBOR = 4  # columns either side of peak
# Left/right field must differ (noise or mean) for a splice-like seam.
_SEAM_MEAN_JUMP_MIN = 22.0
_SEAM_NOISE_RATIO_MIN = 1.35


# R-2026-06-19 (P1-C1):
# the long-side cap
# for ELA analysis.
# A 1024-px long
# side keeps the
# working set under
# ~6 MB per image
# (1024 * 1024 *
# 3 channels * 2
# numpy copies *
# int16 / 1e6 ~=
# 12 MB peak for
# the reencoded
# image + 6 MB for
# the original =
# 18 MB).  Increase
# via
# ``MANUSIFT_ELA_MAX_PIXELS``
# env var if the
# user's papers
# have tiny fonts
# that need more
# detail.
_MAX_ELA_PIXELS = int(
    os.environ.get("MANUSIFT_ELA_MAX_PIXELS", "1024")
)

# Decorative / icon extraction from PDFs (colour swatches, bullets,
# 1KB PNG chrome) produced many false high texture_overlap hits on
# Nature papers. Skip forensics below these floors.
_MIN_FORENSICS_SIDE_PX = int(
    os.environ.get("MANUSIFT_IMG_FORENSICS_MIN_SIDE", "48")
)
_MIN_FORENSICS_AREA_PX = int(
    os.environ.get("MANUSIFT_IMG_FORENSICS_MIN_AREA", "4096")  # 64×64
)
_MIN_FORENSICS_BYTES = int(
    os.environ.get("MANUSIFT_IMG_FORENSICS_MIN_BYTES", "2048")
)
# Copy-move cells below this luminance std are flat backgrounds /
# multi-panel gutters — ignore for cloning signal.
_COPY_MOVE_MIN_CELL_STD = float(
    os.environ.get("MANUSIFT_COPY_MOVE_MIN_CELL_STD", "8.0")
)


def _image_geometry(img: ExtractedImage) -> tuple[int, int, int]:
    """Return ``(width, height, bytes_size)`` with filesystem fallback."""
    w = int(getattr(img, "width", 0) or 0)
    h = int(getattr(img, "height", 0) or 0)
    b = int(getattr(img, "bytes_size", 0) or 0)
    path = getattr(img, "image_path", None)
    if path and (w <= 0 or h <= 0 or b <= 0):
        try:
            p = Path(path)
            if b <= 0 and p.exists():
                b = p.stat().st_size
            if (w <= 0 or h <= 0) and p.exists():
                with Image.open(p) as im:
                    w, h = im.size
        except Exception:  # noqa: BLE001
            pass
    return w, h, b


def _is_decorative_or_too_small(img: ExtractedImage) -> bool:
    """True for icons / swatches / separators that inflate forensics FPs.

    Pixel geometry is the primary gate. Byte size alone is *not* used
    when width/height are known — a 256×256 PNG can compress below 2KB
    and is still a real panel. Bytes are only a fallback when geometry
    is missing (or an absolute floor of 64 bytes).
    """
    w, h, b = _image_geometry(img)
    if w > 0 and h > 0:
        if w < _MIN_FORENSICS_SIDE_PX or h < _MIN_FORENSICS_SIDE_PX:
            return True
        if w * h < _MIN_FORENSICS_AREA_PX:
            return True
        return False
    if b > 0 and b < _MIN_FORENSICS_BYTES:
        return True
    if b > 0 and b < 64:
        return True
    return False


def _source_format(path: Path) -> str:
    return path.suffix.lower().lstrip(".") or "unknown"


def _downgrade_severity(sev: str, steps: int = 1) -> str:
    order = ["low", "medium", "high", "critical"]
    try:
        i = order.index(sev)
    except ValueError:
        return "low"
    return order[max(0, i - steps)]


# ---------------------------------------------------------------------------
# ELA
# ---------------------------------------------------------------------------

def _ela_std(path: Path, quality: int) -> tuple[float, float]:
    """Return ``(global_std, max_local_block_std)`` of the per-pixel ELA error.

    A small pasted patch only changes a few percent of the pixels, so
    the *global* std is often tiny even when the patch region itself
    is very different. We also compute the per-block std on an
    eight-by-eight grid of blocks and return the maximum. The maximum
    is the discriminant that catches splices: a uniform re-encoded
    image has small local block std; an image with a high-frequency
    spliced region has at least one block with notably larger std.

    R-2026-06-19 (P1-C1):
    the previous
    implementation held
    two full PIL images
    (original + reencoded)
    and two numpy int16
    arrays in memory
    simultaneously. For a
    50 MB JPEG (e.g.
    8000x6000 px), that's
    4 copies ~= 800 MB per
    image -> 24 GB for 30
    images -> OOM. The
    fix: downscale images
    larger than
    ``_MAX_ELA_PIXELS`` on
    the long side BEFORE
    re-encoding so the
    working set stays
    under 50 MB / image.
    ELA statistics are
    scale-invariant (re-
    encoding at JPEG
    q=N produces a
    similar local/global
    std ratio at any
    resolution) so the
    downscale does not
    change the
    discriminative power.

    Returns ``(nan, nan)`` if the image cannot be opened.
    """
    try:
        with Image.open(path) as original_raw:
            # Downscale *before* ``.convert("RGB")``
            # so the convert pipeline also
            # runs on the smaller image.
            # PIL's ``thumbnail`` is in-place
            # and preserves aspect ratio.
            if max(original_raw.size) > _MAX_ELA_PIXELS:
                original_raw.thumbnail(
                    (_MAX_ELA_PIXELS, _MAX_ELA_PIXELS),
                    Image.Resampling.LANCZOS,
                )
            original = original_raw.convert("RGB")
            # Release the raw PIL image so
            # only one RGB image is in memory.
            del original_raw
            buf = io.BytesIO()
            original.save(buf, format="JPEG", quality=quality)
            buf.seek(0)
            reencoded = Image.open(buf).convert("RGB")
            # The buffer's JPEG is small
            # (~50 KB), so we can close it
            # now to free the bytes.
            buf.close()
    except Exception as exc:  # noqa: BLE001
        log.warning("ELA decode failed", extra={"path": str(path), "err": str(exc)})
        return float("nan"), float("nan")

    a = np.asarray(original, dtype=np.int16)
    # Free the original PIL image; the
    # numpy copy is the only one we need
    # for the diff computation.
    del original
    b = np.asarray(reencoded, dtype=np.int16)
    del reencoded
    diff = a - b
    del a, b
    global_std = float(diff.std())

    # Eight-by-eight block grid max-std.
    h, w = diff.shape[0], diff.shape[1]
    bh, bw = max(1, h // 8), max(1, w // 8)
    max_local = 0.0
    for r in range(8):
        for c in range(8):
            block = diff[
                r * bh : (r + 1) * bh,
                c * bw : (c + 1) * bw,
            ]
            if block.size == 0:
                continue
            s = float(block.std())
            if s > max_local:
                max_local = s
    return global_std, max_local


def _ela_check(
    img: ExtractedImage,
    settings: Settings,
) -> tuple[str, str, str, str, dict] | None:
    """Compute ELA. Returns ``(severity, title, evidence, location, raw)`` or
    ``None`` if the image should be skipped."""
    if img.image_path is None:
        return None
    path = Path(img.image_path)
    if not path.exists():
        return None
    if _is_decorative_or_too_small(img):
        return None

    std, max_local = _ela_std(path, settings.ela_quality)
    if np.isnan(std):
        return None

    thr = float(settings.ela_std_threshold)
    fmt = _source_format(path)
    # PNG/TIFF never lived as JPEG: re-encoding at q=N invents large
    # residuals. Require higher absolute error for high severity.
    png_like = fmt in {"png", "tif", "tiff", "bmp", "gif", "webp"}
    high_mult = 4.0 if png_like else 2.5
    med_mult = 2.5 if png_like else 1.5

    # Use max-local-block-std as the trigger. A uniformly-edited
    # image has both stds low; a spliced image has max_local much
    # higher than global.
    if max_local < thr:
        return None

    if max_local >= thr * high_mult:
        severity = "high"
    elif max_local >= thr * med_mult:
        severity = "medium"
    else:
        severity = "low"

    # Even with high residual, pure raster sources are often "format
    # artefact" not splice — demote one step unless extremely high.
    flags: list[str] = []
    if png_like:
        flags.append("png_like_source")
        if severity == "high" and max_local < thr * 5.0:
            severity = "medium"
            flags.append("png_ela_capped")

    title = "Image has anomalously high JPEG re-encoding error"
    evidence = (
        f"ELA global std = {std:.2f}; max local block std = {max_local:.2f} "
        f"(threshold {thr:.1f}, format={fmt}). A small pasted or "
        "spliced region usually only moves a few percent of pixels, so the "
        "global std can stay low; the *max local* std is the more reliable "
        "discriminator. Inspect the high-error block manually before drawing "
        "conclusions."
    )
    if png_like:
        evidence += (
            " Source is PNG-like (not a native JPEG); elevated ELA is "
            "common after forced JPEG re-encode and may be a format artefact."
        )
    location = f"Page {img.page + 1} / image {img.index}"
    raw = {
        "kind": "ela",
        "page": img.page,
        "index": img.index,
        "ela_global_std": std,
        "ela_max_local_std": max_local,
        "ela_quality": settings.ela_quality,
        "threshold": thr,
        "source_format": fmt,
        "flags": flags,
        "image_path": str(path),
    }
    return severity, title, evidence, location, raw


# ---------------------------------------------------------------------------
# Copy-move
# ---------------------------------------------------------------------------

def _cell_phash(cell: Image.Image) -> str:
    """Eight-by-eight average-hash on a single cell, 16-hex-char output."""
    g = cell.convert("L").resize((8, 8))
    get_flattened_data = getattr(g, "get_flattened_data", None)
    pixels = tuple(
        get_flattened_data()
        if get_flattened_data is not None
        else g.getdata()
    )
    avg = sum(pixels) / len(pixels)
    bits = "".join("1" if p > avg else "0" for p in pixels)
    return f"{int(bits, 2):016x}"


def _copy_move_pairs(
    img: ExtractedImage,
    settings: Settings,
) -> list[tuple[int, int, int, int, int]]:
    """Return list of ``(row_a, col_a, row_b, col_b, hamming)`` matches."""
    if img.image_path is None:
        return []
    if _is_decorative_or_too_small(img):
        return []
    path = Path(img.image_path)
    if not path.exists():
        return []
    try:
        with Image.open(path) as im:
            im = im.convert("RGB")
            w, h = im.size
            if w < 32 or h < 32:
                return []
            grid = settings.copy_move_grid
            cell_w = w // grid
            cell_h = h // grid
            if cell_w < 8 or cell_h < 8:
                return []
            # (r, c, phash, cell_std)
            hashes: list[tuple[int, int, str, float]] = []
            for r in range(grid):
                for c in range(grid):
                    box = (c * cell_w, r * cell_h, (c + 1) * cell_w, (r + 1) * cell_h)
                    cell = im.crop(box)
                    gray = np.asarray(cell.convert("L"), dtype=np.float32)
                    cell_std = float(gray.std()) if gray.size else 0.0
                    # Skip flat gutter / background cells — common
                    # multi-panel figure false positives.
                    if cell_std < _COPY_MOVE_MIN_CELL_STD:
                        continue
                    hashes.append((r, c, _cell_phash(cell), cell_std))
    except Exception as exc:  # noqa: BLE001
        log.warning("copy-move decode failed", extra={"path": str(path), "err": str(exc)})
        return []

    matches: list[tuple[int, int, int, int, int]] = []
    for i in range(len(hashes)):
        for j in range(i + 1, len(hashes)):
            r1, c1, h1, _s1 = hashes[i]
            r2, c2, h2, _s2 = hashes[j]
            # Only flag *spatially separated* cells — adjacent cells match
            # trivially because they share content. We require either
            # different row or a column gap of >= 2.
            if abs(r1 - r2) < 1 and abs(c1 - c2) < 2:
                continue
            ai = int(h1, 16)
            bi = int(h2, 16)
            d = bin(ai ^ bi).count("1")
            if d <= settings.copy_move_hamming_threshold:
                matches.append((r1, c1, r2, c2, d))
    return matches


def _copy_move_layout_flags(
    matches: list[tuple[int, int, int, int, int]],
) -> list[str]:
    """Detect multi-panel / strip layout patterns that inflate match counts."""
    if not matches:
        return []
    flags: list[str] = []
    n = len(matches)
    # Same-row pairs that are *actually separated* in column (not
    # synthetic (0,0)↔(0,0) unit-test stubs).
    h_seps = [
        abs(c1 - c2)
        for r1, c1, r2, c2, _d in matches
        if r1 == r2 and abs(c1 - c2) >= 2
    ]
    v_seps = [
        abs(r1 - r2)
        for r1, c1, r2, c2, _d in matches
        if c1 == c2 and abs(r1 - r2) >= 2
    ]
    if n >= 8 and len(h_seps) / n >= 0.6:
        flags.append("multipanel_horizontal")
    if n >= 8 and len(v_seps) / n >= 0.6:
        flags.append("multipanel_vertical")
    # Even column strides on same row (0↔2, 1↔3, …) → panel gutters
    even_stride = 0
    for r1, c1, r2, c2, _d in matches:
        if r1 == r2 and abs(c1 - c2) >= 2 and abs(c1 - c2) % 2 == 0:
            even_stride += 1
    if n >= 8 and even_stride / n >= 0.5:
        flags.append("regular_panel_stride")
    return flags


def _copy_move_check(
    img: ExtractedImage,
    settings: Settings,
    *,
    secondary: bool = False,
    sift_already_flagged: bool = False,
) -> tuple[str, str, str, str, dict] | None:
    """Run grid aHash copy-move (secondary path when SIFT available).

    Returns ``(severity, title, evidence, location, raw)`` or ``None``.
    """
    matches = _copy_move_pairs(img, settings)
    if not matches:
        return None

    matches.sort(key=lambda m: m[4])
    best = matches[0]
    # R-2026-06-15 (Phase 6 + #6):
    #   >= 15 matches => high
    #   >=  5 matches => medium
    #   >=  1 match   => low
    if len(matches) >= 15:
        severity = "high"
    elif len(matches) >= 5:
        severity = "medium"
    else:
        severity = "low"

    layout_flags = _copy_move_layout_flags(matches)
    # Multi-panel scientific figures often yield hundreds of same-row
    # background matches — demote unless hamming is exact (0) AND
    # match cloud is not purely structural.
    if layout_flags:
        if severity == "high":
            severity = _downgrade_severity(severity, 1)
        # Pure structural pattern with no zero-hamming clone: demote again
        if all(m[4] > 0 for m in matches[:10]) and severity != "low":
            severity = _downgrade_severity(severity, 1)

    flags = list(layout_flags)
    # P0: when SIFT already flagged the same image, grid is corroboration
    # only — demote so primary SIFT findings dominate the report.
    if secondary:
        flags.append("secondary_to_sift")
    if secondary and sift_already_flagged:
        severity = _downgrade_severity(severity, 1)
        flags.append("corroboration_only")

    title = "Possible copy-move region inside this image"
    if secondary:
        title = "Possible copy-move region (grid hash, secondary)"
    evidence = (
        f"Found {len(matches)} near-duplicate grid-cell pair(s) "
        f"within the same image. The strongest match (hamming="
        f"{best[4]}) is between cell ({best[0]},{best[1]}) and "
        f"cell ({best[2]},{best[3]}). Often indicates a small "
        "region was cloned to cover something up."
    )
    if secondary:
        evidence += (
            " This is the secondary grid-aHash path; prefer SIFT-CMFD "
            "findings (kind=sift_copy_move) when both fire."
        )
    if layout_flags:
        evidence += (
            f" Layout flags={layout_flags}: may be multi-panel figure "
            "structure / shared backgrounds rather than true cloning."
        )
    location = f"Page {img.page + 1} / image {img.index}"
    raw = {
        "kind": "copy_move",
        "page": img.page,
        "index": img.index,
        "grid": settings.copy_move_grid,
        "match_count": len(matches),
        "best": {
            "cell_a": [best[0], best[1]],
            "cell_b": [best[2], best[3]],
            "hamming": best[4],
        },
        "flags": flags,
        "secondary": secondary,
        "image_path": img.image_path,
    }
    return severity, title, evidence, location, raw


# ---------------------------------------------------------------------------
# P0: SIFT-CMFD primary copy-move
# ---------------------------------------------------------------------------

def _sift_copy_move_check(
    img: ExtractedImage,
) -> tuple[str, str, str, str, dict] | None:
    """Primary copy-move via SIFT + RANSAC (see sift_copymove)."""
    if img.image_path is None:
        return None
    if _is_decorative_or_too_small(img):
        return None
    try:
        from .sift_copymove import analyze_copymove_path, available
    except Exception:  # noqa: BLE001
        return None
    if not available():
        return None
    analysis = analyze_copymove_path(img.image_path)
    if not analysis.ok or not analysis.flagged:
        return None
    title = (
        "SIFT copy-move (RANSAC-confirmed) inside this image"
        if analysis.ransac_inliers
        else "SIFT copy-move cluster inside this image"
    )
    evidence = (
        f"SIFT/ORB self-match found a translation cluster of "
        f"{analysis.largest_cluster} pairs "
        f"({analysis.ransac_inliers} RANSAC inliers, "
        f"model={analysis.ransac_model or 'none'}, "
        f"backend={analysis.backend}). "
        f"Keypoints={analysis.keypoint_count}, "
        f"raw matches={analysis.match_count}. "
        "Consistent with a region cloned within the same figure."
    )
    location = f"Page {img.page + 1} / image {img.index}"
    raw = {
        "kind": "sift_copy_move",
        "page": img.page,
        "index": img.index,
        "keypoint_count": analysis.keypoint_count,
        "match_count": analysis.match_count,
        "largest_cluster": analysis.largest_cluster,
        "ransac_inliers": analysis.ransac_inliers,
        "ransac_model": analysis.ransac_model,
        "backend": analysis.backend,
        "width": analysis.width,
        "height": analysis.height,
        "image_path": img.image_path,
        "primary": True,
    }
    return analysis.severity, title, evidence, location, raw


# ---------------------------------------------------------------------------
# P0: JPEG ghost (native JPEG sources)
# ---------------------------------------------------------------------------

def _jpeg_ghost_metrics(path: Path) -> tuple[float, float, dict]:
    """Return ``(ghost_strength, preferred_q_entropy, detail)``.

    Multi-quality re-encode residuals (Farid-style JPEG ghost
    simplification): for each block, residual varies with quality;
    spliced / double-compressed regions often show a different
    preferred quality or larger residual swing than the background.
    """
    try:
        with Image.open(path) as im_raw:
            if max(im_raw.size) > _JPEG_GHOST_MAX_SIDE:
                im_raw = im_raw.copy()
                im_raw.thumbnail(
                    (_JPEG_GHOST_MAX_SIDE, _JPEG_GHOST_MAX_SIDE),
                    Image.Resampling.LANCZOS,
                )
            original = im_raw.convert("RGB")
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "jpeg-ghost decode failed",
            extra={"path": str(path), "err": str(exc)},
        )
        return 0.0, 0.0, {"error": str(exc)}

    arr = np.asarray(original, dtype=np.int16)
    h, w = arr.shape[0], arr.shape[1]
    g = _JPEG_GHOST_GRID
    bh, bw = max(1, h // g), max(1, w // g)
    qualities = list(_JPEG_GHOST_QUALITIES)
    # residuals[q_idx, r, c]
    residuals = np.zeros((len(qualities), g, g), dtype=np.float32)
    for qi, quality in enumerate(qualities):
        buf = io.BytesIO()
        try:
            original.save(buf, format="JPEG", quality=int(quality))
            buf.seek(0)
            reenc = Image.open(buf).convert("RGB")
            b = np.asarray(reenc, dtype=np.int16)
        except Exception:  # noqa: BLE001
            continue
        finally:
            buf.close()
        diff = np.abs(arr - b).mean(axis=2)
        for r in range(g):
            for c in range(g):
                block = diff[r * bh : (r + 1) * bh, c * bw : (c + 1) * bw]
                if block.size:
                    residuals[qi, r, c] = float(block.mean())

    # Per-block residual swing across quality
    swing = residuals.max(axis=0) - residuals.min(axis=0)
    ghost_strength = float(swing.max()) if swing.size else 0.0
    # Preferred quality index per block
    pref = residuals.argmin(axis=0)
    # Normalized entropy of preferred-Q histogram (0..1-ish)
    hist = np.bincount(pref.ravel(), minlength=len(qualities)).astype(
        np.float64
    )
    hist = hist / max(1.0, hist.sum())
    nz = hist[hist > 0]
    entropy = float(-(nz * np.log2(nz)).sum()) if nz.size else 0.0
    detail = {
        "qualities": qualities,
        "ghost_strength": ghost_strength,
        "preferred_q_entropy": entropy,
        "max_swing_block": [
            int(x) for x in np.unravel_index(int(swing.argmax()), swing.shape)
        ]
        if swing.size
        else [],
        "grid": g,
    }
    return ghost_strength, entropy, detail


def _jpeg_ghost_check(
    img: ExtractedImage,
) -> tuple[str, str, str, str, dict] | None:
    """JPEG ghost only for native JPEG extractions."""
    if img.image_path is None:
        return None
    if _is_decorative_or_too_small(img):
        return None
    path = Path(img.image_path)
    if not path.exists():
        return None
    fmt = _source_format(path)
    if fmt not in {"jpg", "jpeg", "jpe"}:
        return None

    strength, entropy, detail = _jpeg_ghost_metrics(path)
    thr = _JPEG_GHOST_STRENGTH_THR
    # Need residual swing OR multimodal preferred-Q
    if strength < thr and entropy < 1.2:
        return None

    if strength >= thr * 2.0 or entropy >= 2.0:
        severity = "high"
    elif strength >= thr * 1.3 or entropy >= 1.5:
        severity = "medium"
    else:
        severity = "low"

    title = "JPEG ghost / double-compression residual anomaly"
    evidence = (
        f"Multi-quality JPEG re-encode residual swing max="
        f"{strength:.2f} (threshold {thr:.1f}); preferred-quality "
        f"map entropy={entropy:.2f}. Spatially inconsistent "
        "compression fingerprints can indicate splicing or "
        "re-saved composite regions. Confirm visually."
    )
    location = f"Page {img.page + 1} / image {img.index}"
    raw = {
        "kind": "jpeg_ghost",
        "page": img.page,
        "index": img.index,
        "source_format": fmt,
        "image_path": str(path),
        **detail,
    }
    return severity, title, evidence, location, raw


# ---------------------------------------------------------------------------
# P6.1: Vertical gel/blot splice seam heuristic
# ---------------------------------------------------------------------------

def _vertical_gel_seam_check(
    img: ExtractedImage,
) -> tuple[str, str, str, str, dict] | None:
    """Flag a strong vertical discontinuity (common gel-lane splice cue).

    Computes column-wise mean absolute horizontal gradient, finds a
    thin peak away from left/right margins, and scores prominence
    vs local baseline.

    Negative-controls hardening (2026-07):
    * reject pure white/black multi-panel gutters
    * require left/right intensity or texture asymmetry
    * require prominence **and** median-ratio gates
    * severity capped at **medium** (single-image heuristic ≠ high)
    """
    if not img.image_path:
        return None
    path = Path(img.image_path)
    if not path.exists():
        return None
    try:
        with Image.open(path) as pil:
            gray = pil.convert("L")
            w, h = gray.size
            if w < _SEAM_MIN_WIDTH or h < _SEAM_MIN_HEIGHT:
                return None
            long_side = max(w, h)
            if long_side > _SEAM_MAX_SIDE:
                scale = _SEAM_MAX_SIDE / float(long_side)
                nw = max(32, int(w * scale))
                nh = max(32, int(h * scale))
                gray = gray.resize((nw, nh))
                w, h = gray.size
            arr = np.asarray(gray, dtype=np.float32)
    except Exception:  # noqa: BLE001
        return None

    # Column gradient energy: mean |dI/dx| over rows.
    dx = np.abs(np.diff(arr, axis=1))
    col_energy = dx.mean(axis=0)
    if col_energy.size < 16:
        return None
    # Light smooth
    kernel = np.array([0.25, 0.5, 0.25], dtype=np.float32)
    padded = np.pad(col_energy, (1, 1), mode="edge")
    smooth = np.convolve(padded, kernel, mode="valid")
    med = float(np.median(smooth)) + 1e-6
    # Exclude outer 12% margins (figure borders / page crop edges).
    margin = max(4, int(0.12 * smooth.size))
    interior = smooth[margin : smooth.size - margin]
    if interior.size < 8:
        return None
    peak_idx_rel = int(np.argmax(interior))
    peak_idx = peak_idx_rel + margin
    peak = float(smooth[peak_idx])
    # Local baseline: median of neighborhoods excluding ±2 around peak.
    left = smooth[max(margin, peak_idx - 12) : max(margin, peak_idx - 2)]
    right = smooth[
        min(smooth.size - margin, peak_idx + 3) : min(
            smooth.size - margin, peak_idx + 13
        )
    ]
    neigh = (
        np.concatenate([left, right])
        if left.size + right.size > 0
        else smooth
    )
    baseline = float(np.median(neigh)) + 1e-6
    prominence = peak / baseline
    ratio_med = peak / med
    # Both gates required — OR was flooding multi-panel figures.
    if prominence < _SEAM_PROMINENCE_THR or ratio_med < _SEAM_RATIO_THR:
        return None
    # Thin peak: neighbors should drop
    left_v = float(smooth[peak_idx - 1]) if peak_idx > 0 else peak
    right_v = (
        float(smooth[peak_idx + 1]) if peak_idx + 1 < smooth.size else peak
    )
    if min(left_v, right_v) > peak * 0.92:
        return None  # plateau / soft gradient, not a seam

    # Map peak from energy domain (w-1) back to image column index.
    col_i = min(arr.shape[1] - 1, max(0, peak_idx))
    peak_col_mean = float(arr[:, col_i].mean())
    # Energy peaks sit on the *edge* of a white/black gutter, so check
    # a neighborhood — not only the peak column itself.
    gutter_hit = False
    for dc in range(-_SEAM_GUTTER_NEIGHBOR, _SEAM_GUTTER_NEIGHBOR + 1):
        c = col_i + dc
        if 0 <= c < arr.shape[1]:
            m = float(arr[:, c].mean())
            if m >= _SEAM_GUTTER_HI or m <= _SEAM_GUTTER_LO:
                gutter_hit = True
                break
    if gutter_hit:
        return None  # multi-panel white/black gutter

    # ≥2 similar interior peaks → multi-panel grid, not a single splice.
    thr_multi = max(peak * 0.55, float(np.median(interior)) * 3.0)
    n_strong = int(np.sum(interior >= thr_multi))
    if n_strong >= 3:
        return None

    # Left/right fields around the seam must differ (true gel splice cue).
    lo = max(0, col_i - 10)
    mid_l = max(0, col_i - 1)
    mid_r = min(arr.shape[1], col_i + 2)
    hi = min(arr.shape[1], col_i + 11)
    left_band = arr[:, lo:mid_l] if mid_l > lo else arr[:, lo : lo + 1]
    right_band = arr[:, mid_r:hi] if hi > mid_r else arr[:, hi - 1 : hi]
    left_mean = float(left_band.mean())
    right_mean = float(right_band.mean())
    left_std = float(left_band.std()) + 1e-6
    right_std = float(right_band.std()) + 1e-6
    mean_jump = abs(left_mean - right_mean)
    noise_ratio = max(left_std, right_std) / min(left_std, right_std)
    if mean_jump < _SEAM_MEAN_JUMP_MIN and noise_ratio < _SEAM_NOISE_RATIO_MIN:
        return None

    # Cap at medium: single-image edge peak is a screening note, not
    # actionable high on its own (negative_controls_v1: 58 high FPs).
    severity = "medium"
    if (
        prominence < _SEAM_PROMINENCE_THR * 1.25
        and ratio_med < _SEAM_RATIO_THR * 1.25
    ):
        severity = "low"

    frac = (peak_idx + 0.5) / float(smooth.size)
    title = "Possible vertical splice seam (gel/blot heuristic)"
    evidence = (
        f"Column-wise edge energy peaks at relative x={frac:.2f} with "
        f"prominence {prominence:.2f}× local baseline "
        f"(median-normalized {ratio_med:.2f}); left/right mean jump "
        f"{mean_jump:.1f}, noise ratio {noise_ratio:.2f}. Thin vertical "
        f"discontinuities are a common gel-lane splice cue on PubPeer; "
        f"confirm against uncropped original gels."
    )
    location = f"Page {img.page + 1} / image {img.index}"
    raw = {
        "kind": "vertical_gel_seam",
        "check": "vertical_gel_seam",
        "page": img.page,
        "index": img.index,
        "prominence": round(prominence, 4),
        "ratio_to_median": round(ratio_med, 4),
        "seam_x_fraction": round(frac, 4),
        "peak_col_mean": round(peak_col_mean, 2),
        "mean_jump": round(mean_jump, 2),
        "noise_ratio": round(noise_ratio, 3),
        "n_strong_peaks": n_strong,
        "image_path": str(path),
        "pubpeer_pattern": "image_splice_or_clone",
    }
    return severity, title, evidence, location, raw


# ---------------------------------------------------------------------------
# P0: Cross-image SIFT/ORB local match
# ---------------------------------------------------------------------------

def _cross_image_sift_findings(doc: ParsedDoc) -> list[Finding]:
    """Keypoint match across different extracted images."""
    try:
        from .sift_copymove import available, match_two_images
    except Exception:  # noqa: BLE001
        return []
    if not available():
        return []

    candidates: list[ExtractedImage] = []
    for img in doc.images or []:
        if _is_decorative_or_too_small(img):
            continue
        if not img.image_path or not Path(img.image_path).exists():
            continue
        candidates.append(img)
        if len(candidates) >= _CROSS_SIFT_MAX_IMAGES:
            break

    # Precompute file sizes and SHA1 hashes once per image to avoid
    # redundant stat()/hash calls inside the O(n²) pair loop.
    _sizes: dict[str, int] = {}
    _sha1s: dict[str, str | None] = {}
    for img in candidates:
        p = Path(img.image_path)
        try:
            _sizes[img.image_path] = p.stat().st_size
        except OSError:
            _sizes[img.image_path] = -1
        _sha1s[img.image_path] = _file_sha1(p)

    findings: list[Finding] = []
    for i in range(len(candidates)):
        for j in range(i + 1, len(candidates)):
            a, b = candidates[i], candidates[j]
            if (a.page, a.index) == (b.page, b.index):
                continue
            # Skip obvious same-byte pairs (handled by full_image_duplicate)
            if _sizes.get(a.image_path, -1) == _sizes.get(b.image_path, -2):
                ha = _sha1s.get(a.image_path)
                hb = _sha1s.get(b.image_path)
                if ha and hb and ha == hb:
                    continue

            result = match_two_images(a.image_path, b.image_path)
            if not result.ok or not result.flagged:
                continue
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=ImageForensicsDetector.name,
                    severity=result.severity,
                    title=(
                        "Cross-image local feature match "
                        f"({result.inlier_count} RANSAC inliers)"
                    ),
                    evidence=(
                        f"SIFT/ORB matched two different extractions with "
                        f"{result.match_count} Lowe-filtered matches and "
                        f"{result.inlier_count} RANSAC inliers "
                        f"(model={result.ransac_model or 'none'}, "
                        f"backend={result.backend}). Consistent with "
                        "reused panels/regions across figures after "
                        "scale or mild rotation."
                    ),
                    location=(
                        f"Page {a.page + 1} / image {a.index} -> "
                        f"Page {b.page + 1} / image {b.index}"
                    ),
                    raw={
                        "kind": "cross_image_sift",
                        "image_a": {
                            "page": a.page,
                            "index": a.index,
                            "image_path": a.image_path,
                        },
                        "image_b": {
                            "page": b.page,
                            "index": b.index,
                            "image_path": b.image_path,
                        },
                        "match_count": result.match_count,
                        "inlier_count": result.inlier_count,
                        "ransac_model": result.ransac_model,
                        "backend": result.backend,
                    },
                )
            )
            if len(findings) >= _CROSS_SIFT_MAX_FINDINGS:
                return findings
    return findings


# ---------------------------------------------------------------------------
# P1: Panel-segment-then-match (SIFT on panel crops)
# ---------------------------------------------------------------------------

def _panel_then_match_findings(doc: ParsedDoc) -> list[Finding]:
    """Segment multipanel figures, then SIFT-match panel pairs."""
    try:
        from .panel_segmentation import _segment_panels
        from .sift_copymove import (
            _load_cv2,
            _read_image,
            available,
            match_two_arrays,
        )
    except Exception:  # noqa: BLE001
        return []
    if not available():
        return []
    cv2 = _load_cv2()
    if cv2 is None:
        return []

    findings: list[Finding] = []
    for img in doc.images or []:
        if _is_decorative_or_too_small(img):
            continue
        if not img.image_path:
            continue
        arr = _read_image(img.image_path)
        if arr is None:
            continue
        h, w = arr.shape[:2]
        if h < 128 or w < 128:
            continue
        gray = cv2.cvtColor(arr, cv2.COLOR_BGR2GRAY)
        boxes = _segment_panels(gray)
        if len(boxes) < 2:
            continue
        # Limit pairs: at most 8 panels
        boxes = boxes[:8]
        crops = []
        for x, y, bw, bh in boxes:
            if bw < 40 or bh < 40:
                crops.append(None)
                continue
            crops.append(arr[y : y + bh, x : x + bw])

        for i in range(len(crops)):
            for j in range(i + 1, len(crops)):
                if crops[i] is None or crops[j] is None:
                    continue
                # Skip heavily overlapping boxes (same panel split)
                xa, ya, wa, ha = boxes[i]
                xb, yb, wb, hb = boxes[j]
                inter_x = max(
                    0, min(xa + wa, xb + wb) - max(xa, xb)
                )
                inter_y = max(
                    0, min(ya + ha, yb + hb) - max(ya, yb)
                )
                inter = inter_x * inter_y
                union = wa * ha + wb * hb - inter
                if union > 0 and inter / union > 0.4:
                    continue
                m = match_two_arrays(crops[i], crops[j])
                if not m.ok or not m.flagged:
                    continue
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=ImageForensicsDetector.name,
                        severity=m.severity,
                        title=(
                            f"Panel-to-panel SIFT match "
                            f"({m.inlier_count} inliers)"
                        ),
                        evidence=(
                            f"After panel segmentation, panels "
                            f"{i + 1} and {j + 1} share "
                            f"{m.inlier_count} RANSAC-confirmed "
                            f"local features (matches={m.match_count}, "
                            f"backend={m.backend}). Suggests reused "
                            "panel content inside a multipanel figure."
                        ),
                        location=(
                            f"Page {img.page + 1} / image {img.index} "
                            f"panels {boxes[i]} vs {boxes[j]}"
                        ),
                        raw={
                            "kind": "panel_sift_match",
                            "page": img.page,
                            "index": img.index,
                            "panel_a": list(boxes[i]),
                            "panel_b": list(boxes[j]),
                            "match_count": m.match_count,
                            "inlier_count": m.inlier_count,
                            "ransac_model": m.ransac_model,
                            "backend": m.backend,
                            "image_path": img.image_path,
                        },
                    )
                )
                if len(findings) >= 12:
                    return findings
    return findings


# ---------------------------------------------------------------------------
# P1: Optional PhotoHolmes-style backends
# ---------------------------------------------------------------------------

def _optional_backend_findings(doc: ParsedDoc) -> list[Finding]:
    try:
        from .image_backends import run_backends_on_path
    except Exception:  # noqa: BLE001
        return []
    findings: list[Finding] = []
    for img in doc.images or []:
        if _is_decorative_or_too_small(img):
            continue
        if not img.image_path or not Path(img.image_path).exists():
            continue
        hits = run_backends_on_path(
            img.image_path,
            context={
                "page": img.page,
                "index": img.index,
                "trace_id": doc.trace_id,
            },
        )
        for hit in hits:
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=ImageForensicsDetector.name,
                    severity=hit.severity,
                    title=hit.title,
                    evidence=hit.evidence
                    or f"Optional backend {hit.backend} signal",
                    location=f"Page {img.page + 1} / image {img.index}",
                    raw={
                        "kind": "optional_backend",
                        "backend": hit.backend,
                        "backend_kind": hit.kind,
                        "page": img.page,
                        "index": img.index,
                        "image_path": img.image_path,
                        **hit.raw,
                    },
                )
            )
            if len(findings) >= 20:
                return findings
    return findings


# ---------------------------------------------------------------------------
# Detector
# ---------------------------------------------------------------------------

_TEXTURE_GRID = 4
_TEXTURE_CELL_SIDE = 32
_TEXTURE_MIN_STD = 12.0
_TEXTURE_MAX_FINDINGS = 20
_TEXTURE_NEAR_HASH_DISTANCE = 4


def _rotated_cell_hashes(cell: Image.Image) -> dict[int, str]:
    """Average-hash variants for right-angle rotations of a texture cell."""
    # ponytail: right-angle rotations cover common copied-panel rotation
    # mistakes; upgrade path is keypoint matching for arbitrary angles/scale.
    return {
        degrees: _cell_phash(cell.rotate(degrees))
        for degrees in (90, 180, 270)
    }


def _texture_cells(
    img: ExtractedImage,
) -> list[tuple[int, int, bytes, str, dict[int, str], float]]:
    """Return high-information grid-cell fingerprints for one image."""
    if img.image_path is None:
        return []
    if _is_decorative_or_too_small(img):
        return []
    path = Path(img.image_path)
    if not path.exists():
        return []
    try:
        with Image.open(path) as im:
            im = im.convert("L").resize((256, 256))
            w, h = im.size
            cell_w = w // _TEXTURE_GRID
            cell_h = h // _TEXTURE_GRID
            cells: list[tuple[int, int, bytes, str, dict[int, str], float]] = []
            for r in range(_TEXTURE_GRID):
                for c in range(_TEXTURE_GRID):
                    cell = im.crop(
                        (
                            c * cell_w,
                            r * cell_h,
                            (c + 1) * cell_w,
                            (r + 1) * cell_h,
                        )
                    ).resize(
                        (
                            _TEXTURE_CELL_SIDE,
                            _TEXTURE_CELL_SIDE,
                        )
                    )
                    arr = np.asarray(cell, dtype=np.uint8)
                    std = float(arr.std())
                    if std < _TEXTURE_MIN_STD:
                        continue
                    cells.append(
                        (
                            r,
                            c,
                            arr.tobytes(),
                            _cell_phash(cell),
                            _rotated_cell_hashes(cell),
                            std,
                        )
                    )
            return cells
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "texture-overlap decode failed",
            extra={"path": str(path), "err": str(exc)},
        )
        return []


def _file_sha1(path: Path, max_bytes: int = 8_000_000) -> str | None:
    """SHA-1 of file contents (capped) for full-image identity."""
    import hashlib

    try:
        h = hashlib.sha1()
        with path.open("rb") as f:
            remaining = max_bytes
            while remaining > 0:
                chunk = f.read(min(65536, remaining))
                if not chunk:
                    break
                h.update(chunk)
                remaining -= len(chunk)
        return h.hexdigest()
    except Exception:  # noqa: BLE001
        return None


def _full_image_duplicate_findings(doc: ParsedDoc) -> list[Finding]:
    """Exact whole-image reuse across extractions (non-decorative only)."""
    by_hash: dict[str, list[ExtractedImage]] = {}
    for img in doc.images:
        if _is_decorative_or_too_small(img):
            continue
        path = img.image_path
        if not path:
            continue
        p = Path(path)
        if not p.exists():
            continue
        digest = _file_sha1(p)
        if not digest:
            continue
        by_hash.setdefault(digest, []).append(img)

    findings: list[Finding] = []
    for digest, imgs in by_hash.items():
        if len(imgs) < 2:
            continue
        # Distinct page/index pairs
        keys = {(im.page, im.index) for im in imgs}
        if len(keys) < 2:
            continue
        a, b = imgs[0], imgs[1]
        wa, ha, ba = _image_geometry(a)
        findings.append(
            Finding.make(
                trace_id=doc.trace_id,
                detector=ImageForensicsDetector.name,
                severity="high",
                title=(
                    f"Identical image file reused {len(imgs)} times "
                    f"across extractions"
                ),
                evidence=(
                    "Two or more extracted images share the same file "
                    "bytes (SHA-1). For scientific figures this can mean "
                    "the same panel was embedded multiple times or a "
                    "panel was substituted. Tiny decorative icons are "
                    "excluded by size gates."
                ),
                location=(
                    f"Page {a.page + 1} / image {a.index} -> "
                    f"Page {b.page + 1} / image {b.index}"
                    + (f" (+{len(imgs) - 2} more)" if len(imgs) > 2 else "")
                ),
                raw={
                    "kind": "full_image_duplicate",
                    "sha1": digest,
                    "count": len(imgs),
                    "images": [
                        {
                            "page": im.page,
                            "index": im.index,
                            "image_path": im.image_path,
                            "width": getattr(im, "width", 0),
                            "height": getattr(im, "height", 0),
                            "bytes_size": getattr(im, "bytes_size", 0),
                        }
                        for im in imgs[:12]
                    ],
                    "geometry_a": {"w": wa, "h": ha, "bytes": ba},
                },
            )
        )
        if len(findings) >= 10:
            break
    return findings


def _texture_overlap_findings(
    doc: ParsedDoc,
) -> list[Finding]:
    """Find exact high-texture cell reuse across different images."""
    seen: dict[bytes, tuple[ExtractedImage, int, int, str, dict[int, str], float]] = {}
    near_seen: list[tuple[ExtractedImage, int, int, str, dict[int, str], float]] = []
    findings: list[Finding] = []
    for img in doc.images:
        if _is_decorative_or_too_small(img):
            continue
        for row, col, fp, ahash, rotated_hashes, std in _texture_cells(img):
            prev = seen.get(fp)
            if prev is None:
                seen[fp] = (img, row, col, ahash, rotated_hashes, std)
            else:
                other, other_row, other_col, _other_hash, _other_rotated_hashes, other_std = prev
                if (other.page, other.index) == (img.page, img.index):
                    continue
                # If both images are full-file identical, the cell match is
                # redundant with full_image_duplicate — keep one high hit.
                sev = "high"
                flags: list[str] = []
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=ImageForensicsDetector.name,
                        severity=sev,
                        title=(
                            "Near-identical local image texture reused "
                            "across images"
                        ),
                        evidence=(
                            "Two different extracted images contain an "
                            "identical high-variance local texture block. "
                            "This is consistent with reused gel/band, "
                            "shadow, or defect texture and warrants manual "
                            "inspection of the source panels."
                        ),
                        location=(
                            f"Page {other.page + 1} / image {other.index} "
                            f"cell ({other_row},{other_col}) -> "
                            f"Page {img.page + 1} / image {img.index} "
                            f"cell ({row},{col})"
                        ),
                        raw={
                            "kind": "texture_overlap",
                            "image_a": {
                                "page": other.page,
                                "index": other.index,
                                "image_path": other.image_path,
                            },
                            "image_b": {
                                "page": img.page,
                                "index": img.index,
                                "image_path": img.image_path,
                            },
                            "cell_a": [other_row, other_col],
                            "cell_b": [row, col],
                            "grid": _TEXTURE_GRID,
                            "cell_side": _TEXTURE_CELL_SIDE,
                            "std_a": other_std,
                            "std_b": std,
                            "flags": flags,
                        },
                    )
                )
                if len(findings) >= _TEXTURE_MAX_FINDINGS:
                    return findings
                continue
            for (
                other,
                other_row,
                other_col,
                other_hash,
                other_rotated_hashes,
                other_std,
            ) in near_seen:
                if (other.page, other.index) == (img.page, img.index):
                    continue
                rotation_match = next(
                    (
                        degrees
                        for degrees, rotated_hash in other_rotated_hashes.items()
                        if rotated_hash == ahash
                    ),
                    None,
                )
                if rotation_match is None:
                    rotation_match = next(
                        (
                            degrees
                            for degrees, rotated_hash in rotated_hashes.items()
                            if rotated_hash == other_hash
                        ),
                        None,
                    )
                if rotation_match is not None:
                    findings.append(
                        Finding.make(
                            trace_id=doc.trace_id,
                            detector=ImageForensicsDetector.name,
                            severity="medium",
                            title=(
                                "Rotated local image texture reused across images"
                            ),
                            evidence=(
                                "Two different extracted images contain a "
                                "matching high-variance local texture block "
                                "after a right-angle rotation. This can match "
                                "reused gel/band, shadow, or defect texture "
                                "and warrants manual inspection."
                            ),
                            location=(
                                f"Page {other.page + 1} / image {other.index} "
                                f"cell ({other_row},{other_col}) -> "
                                f"Page {img.page + 1} / image {img.index} "
                                f"cell ({row},{col})"
                            ),
                            raw={
                                "kind": "rotated_texture_overlap",
                                "image_a": {
                                    "page": other.page,
                                    "index": other.index,
                                    "image_path": other.image_path,
                                },
                                "image_b": {
                                    "page": img.page,
                                    "index": img.index,
                                    "image_path": img.image_path,
                                },
                                "cell_a": [other_row, other_col],
                                "cell_b": [row, col],
                                "grid": _TEXTURE_GRID,
                                "cell_side": _TEXTURE_CELL_SIDE,
                                "rotation_degrees": rotation_match,
                                "std_a": other_std,
                                "std_b": std,
                            },
                        )
                    )
                    if len(findings) >= _TEXTURE_MAX_FINDINGS:
                        return findings
                    break
                distance = bin(int(ahash, 16) ^ int(other_hash, 16)).count("1")
                if distance > _TEXTURE_NEAR_HASH_DISTANCE:
                    continue
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=ImageForensicsDetector.name,
                        severity="medium",
                        title=(
                            "Similar local image texture reused across images"
                        ),
                        evidence=(
                            "Two different extracted images contain highly "
                            "similar high-variance local texture. This can "
                            "match reused gel/band, shadow, or defect texture "
                            "after brightness or compression changes and "
                            "warrants manual inspection."
                        ),
                        location=(
                            f"Page {other.page + 1} / image {other.index} "
                            f"cell ({other_row},{other_col}) -> "
                            f"Page {img.page + 1} / image {img.index} "
                            f"cell ({row},{col})"
                        ),
                        raw={
                            "kind": "near_texture_overlap",
                            "image_a": {
                                "page": other.page,
                                "index": other.index,
                                "image_path": other.image_path,
                            },
                            "image_b": {
                                "page": img.page,
                                "index": img.index,
                                "image_path": img.image_path,
                            },
                            "cell_a": [other_row, other_col],
                            "cell_b": [row, col],
                            "grid": _TEXTURE_GRID,
                            "cell_side": _TEXTURE_CELL_SIDE,
                            "hash_distance": distance,
                            "std_a": other_std,
                            "std_b": std,
                        },
                    )
                )
                if len(findings) >= _TEXTURE_MAX_FINDINGS:
                    return findings
                break
            # ponytail: keep a flat list of prior high-texture cells; upgrade
            # path is bucketing by hash prefix if large image sets make this
            # O(n^2) comparison too slow.
            near_seen.append((img, row, col, ahash, rotated_hashes, std))
    return findings

class ImageForensicsDetector:
    """Unified image forensics (P0/P1).

    Primary path: SIFT-CMFD + RANSAC, cross-image local match,
    panel-then-match, JPEG ghost. Secondary: ELA + grid aHash
    copy-move (demoted when SIFT is available). Plus texture
    overlap, full-file identity, optional PhotoHolmes backends.

    FP controls: decorative size gates, PNG ELA caps, multipanel
    grid demotion, summary risk score.
    """

    name = "image_forensics"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        settings = get_settings()
        findings: list[Finding] = []
        n_images = len(doc.images or [])
        n_skipped = 0

        # Detect whether SIFT path is live — demotes grid aHash.
        sift_live = False
        try:
            from .sift_copymove import available as _sift_available

            sift_live = bool(_sift_available())
        except Exception:  # noqa: BLE001
            sift_live = False
        grid_secondary = bool(_GRID_COPYMOVE_SECONDARY and sift_live)

        for img in doc.images:
            if _is_decorative_or_too_small(img):
                n_skipped += 1
                continue

            # P0 primary: SIFT-CMFD
            sift_cm = _sift_copy_move_check(img)
            sift_flagged = False
            if sift_cm is not None:
                sift_flagged = True
                sev, title, ev, loc, raw = sift_cm
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity=sev,
                        title=title,
                        evidence=ev,
                        location=loc,
                        raw=raw,
                    )
                )

            # P0: JPEG ghost (JPEG only)
            ghost = _jpeg_ghost_check(img)
            if ghost is not None:
                sev, title, ev, loc, raw = ghost
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity=sev,
                        title=title,
                        evidence=ev,
                        location=loc,
                        raw=raw,
                    )
                )

            # Secondary: ELA
            ela = _ela_check(img, settings)
            if ela is not None:
                sev, title, ev, loc, raw = ela
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity=sev,
                        title=title,
                        evidence=ev,
                        location=loc,
                        raw=raw,
                    )
                )

            # Secondary: grid aHash (label secondary; demote if SIFT already hit)
            cm = _copy_move_check(
                img,
                settings,
                secondary=grid_secondary,
                sift_already_flagged=sift_flagged,
            )
            if cm is not None:
                sev, title, ev, loc, raw = cm
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity=sev,
                        title=title,
                        evidence=ev,
                        location=loc,
                        raw=raw,
                    )
                )

            # P6.1: vertical gel/blot splice seam (screening-level)
            seam = _vertical_gel_seam_check(img)
            if seam is not None:
                sev, title, ev, loc, raw = seam
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity=sev,
                        title=title,
                        evidence=ev,
                        location=loc,
                        raw=raw,
                    )
                )

        findings.extend(_full_image_duplicate_findings(doc))
        findings.extend(_texture_overlap_findings(doc))
        # P0 cross-image SIFT
        findings.extend(_cross_image_sift_findings(doc))
        # P1 panel-then-match
        findings.extend(_panel_then_match_findings(doc))
        # P1 optional backends
        findings.extend(_optional_backend_findings(doc))

        # Summary only when something was actually analyzable or we
        # already have component findings. Empty docs / path-less
        # stubs stay empty (legacy tests).
        # Count path-present non-decorative that we attempted.
        attempted = 0
        for img in doc.images or []:
            if _is_decorative_or_too_small(img):
                continue
            p = img.image_path
            if p and Path(p).exists():
                attempted += 1
        if n_images == 0 or (attempted == 0 and not findings):
            return DetectorResult(
                detector=self.name, ok=True, findings=findings
            )

        # Aggregate risk summary (similar spirit to table_forensics).
        by_kind: dict[str, int] = {}
        by_sev: dict[str, int] = {}
        score = 0.0
        for f in findings:
            kind = str((f.raw or {}).get("kind") or "other")
            by_kind[kind] = by_kind.get(kind, 0) + 1
            sev = str(f.severity)
            by_sev[sev] = by_sev.get(sev, 0) + 1
            # Weight primary local-feature signals slightly higher
            weight = 0.03
            if sev == "high":
                weight = 0.24 if kind in {
                    "sift_copy_move",
                    "cross_image_sift",
                    "panel_sift_match",
                    "full_image_duplicate",
                    "jpeg_ghost",
                } else 0.20
            elif sev == "medium":
                weight = 0.12 if kind in {
                    "sift_copy_move",
                    "cross_image_sift",
                    "panel_sift_match",
                    "jpeg_ghost",
                } else 0.09
            score += weight
        score = min(1.0, score)
        if score >= 0.55 or by_sev.get("high", 0) >= 2:
            sum_sev = "high"
        elif score >= 0.25 or by_sev.get("medium", 0) >= 2:
            sum_sev = "medium"
        else:
            sum_sev = "low"
        summary = Finding.make(
            trace_id=doc.trace_id,
            detector=self.name,
            severity=sum_sev,
            title=(
                f"image forensics: {len(findings)} signal(s) across "
                f"{n_images - n_skipped}/{n_images} images; "
                f"risk={score:.2f}"
            ),
            evidence=(
                "Aggregate of SIFT-CMFD (primary), cross-image local "
                "match, panel-then-match, JPEG ghost, ELA, secondary "
                "grid copy-move, vertical gel seam, full-image "
                "identity, and texture overlap. Decorative/tiny "
                "extractions excluded. "
                f"SIFT path={'on' if sift_live else 'off'}."
            ),
            location="image_forensics",
            raw={
                "kind": "image_forensics_summary",
                "risk_score": round(score, 3),
                "n_images": n_images,
                "n_skipped_decorative": n_skipped,
                "n_signals": len(findings),
                "by_kind": by_kind,
                "by_severity": by_sev,
                "sift_primary": sift_live,
                "grid_secondary": grid_secondary,
            },
        )
        return DetectorResult(
            detector=self.name,
            ok=True,
            findings=[summary, *findings],
        )
