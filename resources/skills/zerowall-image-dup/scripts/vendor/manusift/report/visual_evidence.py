"""Visual evidence asset generation (R-2026-06-12).

The pre-existing
detectors do the heavy
lifting (pHash, copy-move
detection, panel
segmentation). This
module takes their
**findings** and produces
the visual assets a human
reviewer needs to see the
evidence:

  * ``crop_a.png`` /
    ``crop_b.png`` -- the
    two matched regions
    cropped from their
    source images.
  * ``side_by_side.png`` --
    A and B laid out next
    to each other with a
    short label above.
  * ``side_by_side_annotated.png`` --
    same layout but with
    a coloured outline
    around the matched
    region.
  * ``context_a.png`` /
    ``context_b.png`` --
    larger crops (the
    whole figure region)
    so the reviewer can
    see what page
    context the crop is
    from.
  * ``overlay.png`` /
    ``diff_heatmap.png``
    where useful.

R-2026-06-12: the user
spec is explicit that
every crop must be
labelled with the
provenance
("A: Page X · Fig Y ·
Panel Z · bbox=...").
We draw those labels
above each panel using
PIL.ImageDraw so the
output is self-contained
(no HTML/CSS required)."""
from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .evidence import BoundingBox, Location, VisualFinding


# Re-use
# the
# detector's
# own
# constants
# so the
# panel
# crops
# we
# re-extract
# match
# the
# original
# detection.
from ..detectors.page_raster_dup import (
    _RENDER_DPI,
    _extract_figure_regions,
)
from ..detectors.panel_dup import _split_into_panels


# Colours
# (R-2026-06-12):
# The
# user
# spec
# asked
# for
# consistent
# colours
# in
# the
# report:
#   * red:
#     high-risk
#     match
#   * orange:
#     medium-risk
#   * blue/cyan:
#     location
#     marker
#   * gray:
#     context
_COL_RED = (220, 38, 38)
_COL_ORANGE = (217, 119, 6)
_COL_BLUE = (37, 99, 235)
_COL_GRAY = (107, 114, 128)
_COL_WHITE = (255, 255, 255)
_COL_BLACK = (0, 0, 0)


def _load_font(size: int) -> ImageFont.ImageFont:
    """Load a TTF font if available, fall back to PIL default.

    The audit-report style
    wants a clean
    sans-serif label. Most
    systems have DejaVu
    Sans; Windows has
    Arial. We try several
    common paths before
    falling back to
    ``ImageFont.load_default()``
    which is always
    available but small."""

    candidates = [
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\segoeui.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size=size)
            except Exception:  # noqa: BLE001
                continue
    return ImageFont.load_default()


# Cache
# the
# loaded
# font
# so we
# don't
# re-load
# it
# every
# crop.
_FONT_CACHE: dict[int, ImageFont.ImageFont] = {}


def _font(size: int) -> ImageFont.ImageFont:
    if size not in _FONT_CACHE:
        _FONT_CACHE[size] = _load_font(size)
    return _FONT_CACHE[size]


@dataclass
class _AssetPaths:
    """The on-disk paths the renderer needs.

    R-2026-06-12: the spec
    requires the exact
    filenames
    ``crop_a.png``,
    ``crop_b.png``,
    ``side_by_side.png``
    etc. inside each
    finding's directory.
    The path strings are
    *relative to the
    report's evidence/visual
    root* so the JSON
    evidence index can
    resolve them."""

    finding_id: str
    base_dir: Path

    @property
    def crop_a(self) -> str:
        return f"finding_{self.finding_id}/crop_a.png"

    @property
    def crop_b(self) -> str:
        return f"finding_{self.finding_id}/crop_b.png"

    @property
    def side_by_side(self) -> str:
        return f"finding_{self.finding_id}/side_by_side.png"

    @property
    def side_by_side_annotated(self) -> str:
        return f"finding_{self.finding_id}/side_by_side_annotated.png"

    @property
    def overlay(self) -> str:
        return f"finding_{self.finding_id}/overlay.png"

    @property
    def diff_heatmap(self) -> str:
        return f"finding_{self.finding_id}/diff_heatmap.png"

    @property
    def context_a(self) -> str:
        return f"finding_{self.finding_id}/context_a.png"

    @property
    def context_b(self) -> str:
        return f"finding_{self.finding_id}/context_b.png"

    def abs(self, rel: str) -> Path:
        return self.base_dir / rel


def _safe_open(path: str | Path | None) -> Image.Image | None:
    """Open a PNG/JPEG and convert to RGB.

    Returns ``None`` if the
    file doesn't exist or
    fails to decode -- the
    evidence report should
    never crash because a
    side-image is missing.
    R-2026-06-12: the spec
    says every crop must
    exist; we degrade
    gracefully when the
    source image is missing
    by returning ``None`` and
    letting the renderer
    show a placeholder."""

    if path is None:
        return None
    p = Path(path)
    if not p.exists():
        return None
    try:
        return Image.open(p).convert("RGB")
    except Exception:  # noqa: BLE001
        return None


def _draw_label(
    draw: ImageDraw.ImageDraw,
    text: str,
    y: int,
    width: int,
    *,
    color: tuple[int, int, int] = _COL_BLACK,
    bg: tuple[int, int, int] = _COL_WHITE,
) -> None:
    """Render a one-line label strip.

    R-2026-06-12: the spec
    wants "A: Page X · Fig
    Y · Panel Z ·
    bbox=(x0,y0,x1,y1)"
    *above* each crop. We
    draw a thin white
    background strip with
    the text in dark gray
    for legibility."""

    font = _font(14)
    bbox = draw.textbbox((0, 0), text, font=font)
    text_h = bbox[3] - bbox[1]
    # Background
    # strip.
    draw.rectangle([(0, y), (width, y + text_h + 6)], fill=bg)
    # Text.
    draw.text((6, y + 3), text, fill=color, font=font)


def _re_extract_panel(
    pdf_path: str | Path,
    page_1based: int,
    region_idx: int,
    panel_idx: int,
) -> tuple[Image.Image, tuple[int, int, int, int]] | None:
    """Re-derive a panel image from a PDF page.

    R-2026-06-12: the
    panel_dup detector
    doesn't persist the
    panel images -- it
    only saves their
    pHashes. The
    evidence report
    needs the pixel
    data, so we
    re-derive it here
    by re-running the
    same figure-region
    extraction +
    whitespace-gap
    panel split.

    ``region_idx`` and
    ``panel_idx`` come
    from the
    ``region_idx * 100 +
    panel_idx`` index
    the detector
    stored as
    ``panel_a`` /
    ``panel_b``.

    Returns
    ``(panel_image,
    bbox)`` where bbox
    is in the rendered
    page's pixel
    coordinates."""

    if not Path(pdf_path).exists():
        return None
    try:
        doc = fitz.open(str(pdf_path))
        if page_1based < 1 or page_1based > len(doc):
            return None
        page = doc[page_1based - 1]
        regions = _extract_figure_regions(page)
        # Match
        # the
        # detector's
        # region
        # indexing
        # --
        # it
        # uses
        # ``region_idx
        # *
        # 100
        # +
        # panel_idx``
        # so
        # the
        # region
        # is
        # ``panel_idx
        # //
        # 100``
        # and
        # the
        # panel
        # within
        # that
        # region
        # is
        # ``panel_idx
        # %
        # 100``.
        target_region = region_idx // 100
        target_panel = region_idx % 100
        if target_region >= len(regions):
            return None
        crop, _bbox = regions[target_region]
        panels = _split_into_panels(crop)
        if target_panel >= len(panels):
            return None
        return panels[target_panel], _bbox
    except Exception:  # noqa: BLE001
        return None


def _make_side_by_side(
    a: Image.Image,
    b: Image.Image,
    label_a: str,
    label_b: str,
    *,
    color_a: tuple[int, int, int],
    color_b: tuple[int, int, int],
    annotate: bool = False,
) -> Image.Image:
    """Lay out two images side by side with labels.

    R-2026-06-12: the spec
    says "Normalize display
    size for side-by-side
    comparison without
    distorting aspect
    ratio". We resize each
    side to a fixed target
    height (preserving
    aspect) and pad the
    shorter one to a
    common width with
    white. The result is
    a single PNG the
    HTML / Markdown report
    can embed directly."""

    target_h = 320
    def _fit(img: Image.Image) -> Image.Image:
        ratio = target_h / img.height
        new_w = int(img.width * ratio)
        return img.resize((new_w, target_h), Image.LANCZOS)
    a_fit = _fit(a)
    b_fit = _fit(b)
    pad = 16
    label_h = 28
    out_w = a_fit.width + b_fit.width + pad * 3
    out_h = target_h + label_h + pad * 2
    out = Image.new("RGB", (out_w, out_h), _COL_WHITE)
    draw = ImageDraw.Draw(out)
    # Labels
    _draw_label(draw, f"A: {label_a}", pad, a_fit.width + pad * 2, color=color_a)
    _draw_label(
        draw, f"B: {label_b}", pad, a_fit.width + pad * 2,
    ) if not annotate else _draw_label(
        draw, f"B: {label_b}", pad, a_fit.width + pad * 2, color=color_b
    )
    # Paste
    # images
    # below
    # the
    # labels.
    a_y = label_h + pad
    b_y = label_h + pad
    out.paste(a_fit, (pad, a_y))
    out.paste(b_fit, (a_fit.width + pad * 2, b_y))
    if annotate:
        # Draw
        # colored
        # border
        # around
        # each.
        draw.rectangle(
            [(pad - 1, a_y - 1), (pad + a_fit.width, a_y + target_h)],
            outline=color_a, width=4,
        )
        draw.rectangle(
            [(a_fit.width + pad * 2 - 1, b_y - 1),
             (a_fit.width + pad * 2 + b_fit.width, b_y + target_h)],
            outline=color_b, width=4,
        )
    return out


def _severity_color(severity: Any) -> tuple[int, int, int]:
    s = severity.value if hasattr(severity, "value") else str(severity)
    if s == "critical" or s == "high":
        return _COL_RED
    if s == "medium":
        return _COL_ORANGE
    if s == "low":
        return _COL_BLUE
    return _COL_GRAY


def build_visual_assets(
    *,
    finding: VisualFinding,
    out_dir: Path,
    pdf_path: str | Path | None = None,
) -> VisualFinding:
    """Generate crops, side-by-side, and overlay for one finding.

    R-2026-06-12: the
    spec requires the
    evidence report to
    write a directory
    per visual finding
    under
    ``evidence/visual/finding_img_NNN/``
    with a fixed set of
    filenames. We
    populate as many as
    we can; missing
    assets become
    ``None`` paths in
    the finding's
    ``assets`` dict so
    the renderer can
    show a placeholder."""

    finding_dir = out_dir / f"finding_{finding.finding_id}"
    finding_dir.mkdir(parents=True, exist_ok=True)

    # Resolve
    # the
    # source
    # image
    # for
    # each
    # side.
    # For
    # image_dup
    # /
    # page_raster_dup
    # /
    # image_forensics
    # the
    # source
    # is
    # the
    # raw
    # extracted
    # image
    # (already
    # on
    # disk).
    # For
    # panel_dup
    # we
    # have
    # to
    # re-derive
    # the
    # panel
    # from
    # the
    # PDF
    # page.
    a_src = _safe_open(finding.location_a.source_image)
    b_src = _safe_open(finding.location_b.source_image)
    if a_src is None or b_src is None:
        # Try
        # re-extracting
        # from
        # PDF
        # if
        # the
        # detector
        # uses
        # panel/page
        # indices.
        if pdf_path and finding.detector == "panel_dup":
            if finding.location_a.page is not None:
                re_a = _re_extract_panel(
                    pdf_path,
                    finding.location_a.page,
                    finding.location_a.image_index or 0,
                    0,
                )
                if re_a is not None:
                    a_src = re_a[0]
                    # Update
                    # location
                    # with
                    # bbox
                    # if
                    # we
                    # have
                    # it.
                    if finding.location_a.bbox is None and re_a[1]:
                        x, y, w, h = re_a[1]
                        finding.location_a.bbox = BoundingBox(x, y, x + w, y + h)
            if finding.location_b.page is not None:
                re_b = _re_extract_panel(
                    pdf_path,
                    finding.location_b.page,
                    finding.location_b.image_index or 0,
                    0,
                )
                if re_b is not None:
                    b_src = re_b[0]
                    if finding.location_b.bbox is None and re_b[1]:
                        x, y, w, h = re_b[1]
                        finding.location_b.bbox = BoundingBox(x, y, x + w, y + h)

    if a_src is None or b_src is None:
        # Nothing
        # to
        # render.
        # Return
        # the
        # finding
        # with
        # empty
        # assets.
        finding.assets = {}
        return finding

    # Crop
    # the
    # matched
    # region
    # from
    # each
    # side.
    a_crop = a_src
    b_crop = b_src
    if finding.location_a.bbox is not None:
        bb = finding.location_a.bbox
        a_crop = a_src.crop((bb.x0, bb.y0, bb.x1, bb.y1))
    if finding.location_b.bbox is not None:
        bb = finding.location_b.bbox
        b_crop = b_src.crop((bb.x0, bb.y0, bb.x1, bb.y1))

    # Save
    # the
    # individual
    # crops.
    (finding_dir / "crop_a.png").parent.mkdir(parents=True, exist_ok=True)
    a_crop.save(finding_dir / "crop_a.png")
    b_crop.save(finding_dir / "crop_b.png")
    # Save
    # the
    # context
    # (full
    # source
    # image).
    a_src.save(finding_dir / "context_a.png")
    b_src.save(finding_dir / "context_b.png")

    # Side-by-side
    # (plain
    # and
    # annotated).
    color = _severity_color(finding.severity)
    label_a = finding.location_a.full_label()
    label_b = finding.location_b.full_label()
    sbs = _make_side_by_side(a_crop, b_crop, label_a, label_b, color_a=color, color_b=color)
    sbs.save(finding_dir / "side_by_side.png")
    sbs_ann = _make_side_by_side(
        a_crop, b_crop, label_a, label_b,
        color_a=color, color_b=color, annotate=True,
    )
    sbs_ann.save(finding_dir / "side_by_side_annotated.png")

    # Overlay
    # (best-effort
    # alpha-blend
    # of
    # A
    # on
    # top
    # of
    # B).
    try:
        a_resized = a_crop.resize(b_crop.size, Image.LANCZOS)
        overlay = Image.blend(b_crop.convert("RGB"), a_resized.convert("RGB"), 0.5)
        overlay.save(finding_dir / "overlay.png")
        # Diff
        # heatmap
        # --
        # absolute
        # difference
        # of
        # the
        # two
        # crops,
        # remapped
        # to
        # a
        # perceptually
        # friendly
        # red
        # gradient.
        a_arr = np.array(a_resized.convert("L"), dtype=np.int16)
        b_arr = np.array(b_crop.convert("L"), dtype=np.int16)
        diff = np.abs(a_arr - b_arr).astype(np.float32)
        # Stretch
        # to
        # 0..255
        # for
        # visibility.
        if diff.max() > 0:
            diff = (diff / diff.max() * 255).astype(np.uint8)
        else:
            diff = diff.astype(np.uint8)
        # Build
        # a
        # red
        # heatmap
        # (R=diff,
        # G=0,
        # B=0)
        # on
        # a
        # grayscale
        # base.
        base = np.array(b_crop.convert("L"))
        heat = np.zeros((base.shape[0], base.shape[1], 3), dtype=np.uint8)
        heat[..., 0] = diff
        heat[..., 1] = (base * 0.3).astype(np.uint8)
        heat[..., 2] = (base * 0.3).astype(np.uint8)
        Image.fromarray(heat).save(finding_dir / "diff_heatmap.png")
    except Exception:  # noqa: BLE001
        # Overlay
        # is
        # best-effort.
        pass

    # Update
    # the
    # finding's
    # asset
    # map
    # with
    # *paths
    # relative
    # to
    # the
    # evidence
    # root*
    # so the
    # renderer
    # can
    # embed
    # them
    # no
    # matter
    # which
    # subdirectory
    # it
    # is
    # rooted
    # at.
    # R-2026-06-12:
    # the
    # asset
    # paths
    # are
    # always
    # rooted
    # at
    # ``out_dir/visual/``,
    # so
    # we
    # include
    # the
    # ``visual/``
    # prefix
    # so
    # the
    # renderer
    # can
    # resolve
    # them
    # from
    # the
    # evidence
    # root.
    finding.assets = {
        "crop_a": f"visual/finding_{finding.finding_id}/crop_a.png",
        "crop_b": f"visual/finding_{finding.finding_id}/crop_b.png",
        "side_by_side": f"visual/finding_{finding.finding_id}/side_by_side.png",
        "annotated": f"visual/finding_{finding.finding_id}/side_by_side_annotated.png",
        "context_a": f"visual/finding_{finding.finding_id}/context_a.png",
        "context_b": f"visual/finding_{finding.finding_id}/context_b.png",
        "overlay": f"visual/finding_{finding.finding_id}/overlay.png",
        "diff_heatmap": f"visual/finding_{finding.finding_id}/diff_heatmap.png",
    }
    return finding
