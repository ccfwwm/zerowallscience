#!/usr/bin/env python
"""Generate every app icon, favicon, and installer bitmap from one source image.

Run after changing `brand/source-lockup.jpg`:

    python scripts/dev/generate-icons.py

Requires Pillow (`python -m pip install pillow`). Outputs are committed, so CI
never runs this — it is a one-shot authoring tool, not a build step.

Two decisions here are load-bearing and were made from measurements of the
source art, not taste:

1. **Icons sit on an opaque tile; the background is NOT keyed to transparency.**
   The Z inside the mark is itself near-white (measured 252,253,255) and is
   contiguous with the page background, so it is legible only *against* white —
   it is drawn by its outline and shadow, not by its own color. A border flood
   fill keyed that Z body down to alpha 28, i.e. it erased the letter. The tile
   is filled with the source's own background color (sampled, not assumed), so
   the pasted art composites seamlessly with no visible seam.

2. **Square icons use a compact crop that drops the left-hand speed lines.**
   The full mark is 544px wide, ~90px of which is faint motion lines. At 32px
   and below those lines become indistinguishable noise while stealing scale
   from the O and the shards, which are what make the mark recognizable. The
   lockup (mark + "ZeroWall Science" wordmark) is only used where there is
   horizontal room — the NSIS header and the WiX banner — because the wordmark
   is unreadable in a square icon.
"""

from __future__ import annotations

import struct
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ModuleNotFoundError:  # pragma: no cover - authoring tool
    sys.exit("Pillow is required: python -m pip install pillow")

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "brand" / "source-lockup.jpg"
ICONS = ROOT / "apps" / "desktop" / "src-tauri" / "icons"
INSTALLER = ROOT / "apps" / "desktop" / "src-tauri" / "installer"
PUBLIC = ROOT / "apps" / "desktop" / "public"
APP_ASSETS = ROOT / "apps" / "desktop" / "src" / "assets"

# The source is a 650x650 lockup: the mark on top, the wordmark below, separated
# by a band of blank rows. Everything below is derived from the ink bounding
# boxes on either side of that split, so re-exporting the art at another size
# still works as long as the stacked layout holds.
LOCKUP_SPLIT_Y = 546          # inside the blank band between mark and wordmark
INK_THRESHOLD = 30            # per-pixel distance from white that counts as ink
SPEED_LINE_TRIM = 0.17        # fraction of mark width dropped from the left

# Corner rounding as a fraction of the icon's side. Applied to the desktop and
# web icons; iOS and the Windows Store logos are left square because those
# platforms mask the artwork themselves and rounding it twice looks wrong.
CORNER_RADIUS = 0.18
# How much of the tile the art fills. The compact mark is taller than it is
# wide, so this governs its height; the width lands near 0.75.
FILL = 0.86
SUPERSAMPLE = 4               # render at NxN then downsample for clean edges


def load_source() -> Image.Image:
    if not SOURCE.is_file():
        sys.exit(f"missing source art: {SOURCE}")
    return Image.open(SOURCE).convert("RGB")


def background_color(img: Image.Image) -> tuple[int, int, int]:
    """The source's own paper color, sampled from its border.

    Using this instead of pure white is what keeps the pasted art from showing
    a faint rectangular seam: the JPEG's "white" is about 254, not 255.
    """
    w, h = img.size
    px = img.load()
    samples = [px[x, 0] for x in range(0, w, 7)] + [px[x, h - 1] for x in range(0, w, 7)]
    samples += [px[0, y] for y in range(0, h, 7)] + [px[w - 1, y] for y in range(0, h, 7)]
    n = len(samples)
    mid = n // 2
    return tuple(sorted(c[i] for c in samples)[mid] for i in range(3))  # type: ignore[return-value]


def ink_bbox(img: Image.Image, top: int, bottom: int) -> tuple[int, int, int, int]:
    """Bounding box of non-background pixels within rows [top, bottom)."""
    px = img.load()
    w, _ = img.size
    x0, y0, x1, y1 = w, bottom, -1, -1
    for y in range(top, bottom):
        for x in range(w):
            r, g, b = px[x, y]
            if 765 - (r + g + b) > INK_THRESHOLD:
                if x < x0:
                    x0 = x
                if x > x1:
                    x1 = x
                if y < y0:
                    y0 = y
                if y > y1:
                    y1 = y
    if x1 < 0:
        sys.exit("found no ink in the requested band; is the source art blank?")
    return x0, y0, x1 + 1, y1 + 1


def size_fill(size: int, base: float = FILL) -> float:
    """Grow the art toward the tile edge as the icon shrinks.

    A fixed margin that looks like breathing room at 256px is simply thrown-away
    resolution at 24px — and 16/24/32 are exactly the sizes Windows uses for the
    title bar, the taskbar, and Explorer. Below 48px the margin is nearly closed;
    the rounded corner still keeps it from looking like a bare square.
    """
    if size >= 128:
        return base
    if size >= 64:
        return min(0.995, base + 0.04)
    return min(0.995, base + 0.09)


def tile(
    art: Image.Image,
    size: int,
    bg: tuple[int, int, int],
    *,
    radius: float = CORNER_RADIUS,
    fill: float | None = None,
    shape: str = "rounded",
    opaque: bool = False,
) -> Image.Image:
    """Center `art` on a `size`x`size` tile of `bg`.

    `shape` is "rounded", "square", or "circle". With `opaque` the tile has no
    alpha channel at all, which iOS requires of its app icons.
    """
    if fill is None:
        fill = size_fill(size)
    s = size * SUPERSAMPLE
    if shape == "square":
        mask = Image.new("L", (s, s), 255)
    else:
        mask = Image.new("L", (s, s), 0)
        d = ImageDraw.Draw(mask)
        if shape == "circle":
            d.ellipse([0, 0, s - 1, s - 1], fill=255)
        else:
            d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * radius), fill=255)

    canvas = Image.new("RGB", (s, s), bg)
    aw, ah = art.size
    scale = (s * fill) / max(aw, ah)
    resized = art.resize((max(1, round(aw * scale)), max(1, round(ah * scale))), Image.LANCZOS)
    canvas.paste(resized, ((s - resized.width) // 2, (s - resized.height) // 2))

    out = canvas.resize((size, size), Image.LANCZOS)
    if opaque:
        return out
    rgba = out.convert("RGBA")
    rgba.putalpha(mask.resize((size, size), Image.LANCZOS))
    return rgba


def banner(art: Image.Image, size: tuple[int, int], bg: tuple[int, int, int], pad: float = 0.10) -> Image.Image:
    """Left-aligned art on a wide opaque strip, for installer bitmaps.

    BMP carries no alpha, so these are flattened onto the paper color.
    """
    w, h = size
    canvas = Image.new("RGB", (w, h), bg)
    inner = max(1, int(h * (1 - 2 * pad)))
    scale = inner / art.height
    resized = art.resize((max(1, round(art.width * scale)), inner), Image.LANCZOS)
    if resized.width > w - 2 * int(h * pad):
        scale = (w - 2 * int(h * pad)) / art.width
        resized = art.resize(
            (max(1, round(art.width * scale)), max(1, round(art.height * scale))), Image.LANCZOS
        )
    canvas.paste(resized, (int(h * pad), (h - resized.height) // 2))
    return canvas


def horizontal_lockup(
    mark: Image.Image,
    wordmark: Image.Image,
    size: tuple[int, int],
    bg: tuple[int, int, int],
    *,
    pad: float = 0.14,
    word_height: float = 0.44,
    gap: float = 0.18,
) -> Image.Image:
    """Mark and wordmark side by side, for the wide installer strips.

    The source lockup stacks them, and stacked art fitted into a 58px-tall strip
    leaves the wordmark about 8px tall — present but unreadable. Setting them
    beside each other spends the strip's width instead of its height, so the
    wordmark stays legible at the size the installer actually shows.
    """
    w, h = size
    canvas = Image.new("RGB", (w, h), bg)
    inner = max(1, int(h * (1 - 2 * pad)))

    ms = inner / mark.height
    m = mark.resize((max(1, round(mark.width * ms)), inner), Image.LANCZOS)
    wh = max(1, int(h * word_height))
    ws = wh / wordmark.height
    wm = wordmark.resize((max(1, round(wordmark.width * ws)), wh), Image.LANCZOS)

    x = int(h * pad)
    total = m.width + int(h * gap) + wm.width
    avail = w - 2 * x
    if total > avail:                      # shrink both together, keep proportions
        k = avail / total
        m = m.resize((max(1, round(m.width * k)), max(1, round(m.height * k))), Image.LANCZOS)
        wm = wm.resize((max(1, round(wm.width * k)), max(1, round(wm.height * k))), Image.LANCZOS)

    canvas.paste(m, (x, (h - m.height) // 2))
    # Optically align the wordmark on its own centerline rather than the strip's.
    canvas.paste(wm, (x + m.width + int(h * gap), (h - wm.height) // 2))
    return canvas


def centered(art: Image.Image, size: tuple[int, int], bg: tuple[int, int, int], fill: float = 0.62) -> Image.Image:
    """Art centered on an opaque panel, for the installer sidebar and dialog."""
    w, h = size
    canvas = Image.new("RGB", (w, h), bg)
    scale = (min(w, h) * fill) / max(art.size)
    resized = art.resize(
        (max(1, round(art.width * scale)), max(1, round(art.height * scale))), Image.LANCZOS
    )
    canvas.paste(resized, ((w - resized.width) // 2, (h - resized.height) // 2))
    return canvas


def write_icns(path: Path, art: Image.Image, bg: tuple[int, int, int]) -> None:
    """Write a minimal ICNS container of PNG entries.

    ICNS is a flat list of (4-byte type, big-endian length, payload) records
    after an 8-byte header, and modern macOS reads PNG payloads directly — so
    no external tooling is needed. macOS is out of scope for this build, so
    this file is generated for completeness but has not been verified on macOS.
    """
    entries = [
        (b"icp4", 16),
        (b"icp5", 32),
        (b"ic11", 32),
        (b"ic12", 64),
        (b"ic07", 128),
        (b"ic13", 256),
        (b"ic08", 256),
        (b"ic14", 512),
        (b"ic09", 512),
    ]
    blobs = []
    for kind, size in entries:
        import io

        buf = io.BytesIO()
        tile(art, size, bg).save(buf, format="PNG")
        payload = buf.getvalue()
        blobs.append(kind + struct.pack(">I", len(payload) + 8) + payload)
    body = b"".join(blobs)
    path.write_bytes(b"icns" + struct.pack(">I", len(body) + 8) + body)


def main() -> int:
    src = load_source()
    bg = background_color(src)

    mx0, my0, mx1, my1 = ink_bbox(src, 0, LOCKUP_SPLIT_Y)
    full_mark = src.crop((mx0, my0, mx1, my1))
    # Drop the faint speed lines on the left for the square icons.
    trim = int((mx1 - mx0) * SPEED_LINE_TRIM)
    mark = src.crop((mx0 + trim, my0, mx1, my1))

    wx0, wy0, wx1, wy1 = ink_bbox(src, LOCKUP_SPLIT_Y, src.height)
    wordmark = src.crop((wx0, wy0, wx1, wy1))
    lockup = src.crop((min(mx0, wx0), my0, max(mx1, wx1), wy1))

    print(f"background {bg}  mark {full_mark.size} -> compact {mark.size}  lockup {lockup.size}")

    ICONS.mkdir(parents=True, exist_ok=True)
    INSTALLER.mkdir(parents=True, exist_ok=True)

    # --- Tauri desktop icons ------------------------------------------------
    for name, size in [
        ("32x32.png", 32),
        ("64x64.png", 64),
        ("128x128.png", 128),
        ("128x128@2x.png", 256),
        ("icon.png", 512),
    ]:
        tile(mark, size, bg).save(ICONS / name)

    ico_sizes = [16, 24, 32, 48, 64, 256]
    base = tile(mark, 256, bg)
    base.save(ICONS / "icon.ico", sizes=[(s, s) for s in ico_sizes])
    write_icns(ICONS / "icon.icns", mark, bg)

    # --- Windows Store logos (square: the Store frames them itself) ---------
    for name, size in [
        ("Square30x30Logo.png", 30),
        ("Square44x44Logo.png", 44),
        ("Square71x71Logo.png", 71),
        ("Square89x89Logo.png", 89),
        ("Square107x107Logo.png", 107),
        ("Square142x142Logo.png", 142),
        ("Square150x150Logo.png", 150),
        ("Square284x284Logo.png", 284),
        ("Square310x310Logo.png", 310),
        ("StoreLogo.png", 50),
    ]:
        tile(mark, size, bg, shape="square").save(ICONS / name)

    # --- Android (kept in sync even though it is not a shipped target) ------
    for bucket, launcher, foreground in [
        ("mdpi", 48, 108),
        ("hdpi", 49, 162),
        ("xhdpi", 96, 216),
        ("xxhdpi", 144, 324),
        ("xxxhdpi", 192, 432),
    ]:
        d = ICONS / "android" / f"mipmap-{bucket}"
        d.mkdir(parents=True, exist_ok=True)
        tile(mark, launcher, bg).save(d / "ic_launcher.png")
        tile(mark, launcher, bg, shape="circle").save(d / "ic_launcher_round.png")
        # Adaptive-icon foreground: Android crops the outer ~1/3, so the art is
        # held inside the safe zone and the layer itself stays a tile (the Z
        # needs its light backing to read at all).
        tile(mark, foreground, bg, fill=FILL * 0.66, radius=CORNER_RADIUS * 0.66).save(
            d / "ic_launcher_foreground.png"
        )


    # --- iOS (opaque: the App Store rejects icons with an alpha channel) ----
    ios = ICONS / "ios"
    ios.mkdir(parents=True, exist_ok=True)
    for name, size in [
        ("AppIcon-20x20@1x.png", 20),
        ("AppIcon-20x20@2x.png", 40),
        ("AppIcon-20x20@2x-1.png", 40),
        ("AppIcon-20x20@3x.png", 60),
        ("AppIcon-29x29@1x.png", 29),
        ("AppIcon-29x29@2x.png", 58),
        ("AppIcon-29x29@2x-1.png", 58),
        ("AppIcon-29x29@3x.png", 87),
        ("AppIcon-40x40@1x.png", 40),
        ("AppIcon-40x40@2x.png", 80),
        ("AppIcon-40x40@2x-1.png", 80),
        ("AppIcon-40x40@3x.png", 120),
        ("AppIcon-60x60@2x.png", 120),
        ("AppIcon-60x60@3x.png", 180),
        ("AppIcon-76x76@1x.png", 76),
        ("AppIcon-76x76@2x.png", 152),
        ("AppIcon-83.5x83.5@2x.png", 167),
        ("AppIcon-512@2x.png", 1024),
    ]:
        tile(mark, size, bg, shape="square", opaque=True).save(ios / name)

    # --- Web client favicons ------------------------------------------------
    PUBLIC.mkdir(parents=True, exist_ok=True)
    tile(mark, 256, bg).save(PUBLIC / "favicon.ico", sizes=[(s, s) for s in ico_sizes])
    tile(mark, 32, bg).save(PUBLIC / "favicon-32x32.png")
    tile(mark, 180, bg, shape="square", opaque=True).save(PUBLIC / "apple-touch-icon.png")

    # --- In-app sidebar logo ------------------------------------------------
    APP_ASSETS.mkdir(parents=True, exist_ok=True)
    tile(mark, 512, bg).save(APP_ASSETS / "logo.webp", format="WEBP", quality=92, method=6)

    # --- Windows installer bitmaps (24-bit BMP; no alpha) -------------------
    # The 150px header is too narrow for mark + wordmark, so it carries the mark
    # alone; the 493px banner has room for both side by side.
    banner(mark, (150, 57), bg, pad=0.08).save(INSTALLER / "nsis-header.bmp")
    centered(mark, (164, 314), bg).save(INSTALLER / "nsis-sidebar.bmp")
    horizontal_lockup(mark, wordmark, (493, 58), bg).save(INSTALLER / "wix-banner.bmp")
    centered(lockup, (493, 312), bg, fill=0.62).save(INSTALLER / "wix-dialog.bmp")

    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
