"""Mask normalization and pixel-locked image compositing."""

from __future__ import annotations

from PIL import Image, ImageChops


def _validate_sizes(original: Image.Image, edited: Image.Image, mask: Image.Image) -> None:
    if original.size != edited.size or original.size != mask.size:
        raise ValueError(
            f"图片与 mask 尺寸必须一致: original={original.size}, edited={edited.size}, mask={mask.size}"
        )


def composite_masked_edit(
    original: Image.Image,
    edited: Image.Image,
    internal_mask: Image.Image,
) -> Image.Image:
    """Use edited pixels only where the internal mask is white."""
    _validate_sizes(original, edited, internal_mask)
    base = original.convert("RGBA") if original.mode == "RGBA" else original.convert("RGB")
    candidate = edited.convert(base.mode)
    return Image.composite(candidate, base, internal_mask.convert("L"))


def make_api_edit_mask(internal_mask: Image.Image) -> Image.Image:
    """Convert 0=preserve/255=replace into an OpenAI-style alpha mask."""
    replace = internal_mask.convert("L")
    alpha = ImageChops.invert(replace)
    api_mask = Image.new("RGBA", replace.size, (255, 255, 255, 255))
    api_mask.putalpha(alpha)
    return api_mask


def changed_outside_mask(
    original: Image.Image,
    result: Image.Image,
    internal_mask: Image.Image,
) -> int:
    """Count changed pixels in the preserve region."""
    _validate_sizes(original, result, internal_mask)
    left = original.convert("RGBA")
    right = result.convert("RGBA")
    difference = ImageChops.difference(left, right).convert("L")
    preserve = internal_mask.convert("L").point(lambda value: 255 if value == 0 else 0)
    outside_difference = ImageChops.multiply(difference, preserve)
    return sum(1 for value in outside_difference.getdata() if value != 0)


def prepare_letterboxed_edit(
    image: Image.Image,
    internal_mask: Image.Image,
    target_size: tuple[int, int],
) -> tuple[Image.Image, Image.Image, tuple[int, int, int, int]]:
    """Fit a slide and mask into a supported API canvas without distortion."""
    if image.size != internal_mask.size:
        raise ValueError("原图与 internal mask 尺寸必须一致")
    target_width, target_height = target_size
    if target_width <= 0 or target_height <= 0:
        raise ValueError("target_size 必须为正数")

    scale = min(target_width / image.width, target_height / image.height)
    content_width = max(1, round(image.width * scale))
    content_height = max(1, round(image.height * scale))
    left = (target_width - content_width) // 2
    top = (target_height - content_height) // 2

    canvas = Image.new("RGB", target_size, (0, 0, 0))
    resized_image = image.convert("RGB").resize((content_width, content_height), Image.Resampling.LANCZOS)
    canvas.paste(resized_image, (left, top))

    canvas_mask = Image.new("L", target_size, 0)
    resized_mask = internal_mask.convert("L").resize(
        (content_width, content_height), Image.Resampling.NEAREST
    )
    canvas_mask.paste(resized_mask, (left, top))
    return canvas, canvas_mask, (left, top, content_width, content_height)


def restore_letterboxed_edit(
    edited_canvas: Image.Image,
    content_box: tuple[int, int, int, int],
    original_size: tuple[int, int],
) -> Image.Image:
    """Crop the slide region from an API canvas and restore its original size."""
    left, top, width, height = content_box
    if left < 0 or top < 0 or width <= 0 or height <= 0:
        raise ValueError(f"无效 content_box: {content_box}")
    if left + width > edited_canvas.width or top + height > edited_canvas.height:
        raise ValueError(f"content_box 超出 edited canvas: {content_box}")
    crop = edited_canvas.crop((left, top, left + width, top + height))
    return crop.resize(original_size, Image.Resampling.LANCZOS)
