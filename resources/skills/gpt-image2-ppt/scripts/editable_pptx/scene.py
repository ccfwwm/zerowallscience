"""Strict scene model for the editable PPTX POC."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


SUPPORTED_TYPES = {"native_text", "image_layer", "native_shape", "connector"}
SUPPORTED_SHAPES = {"rectangle", "rounded_rectangle", "ellipse", "star_5", "line"}


def _validate_hex_color(value: Any, field_name: str) -> None:
    if value is None:
        return
    normalized = str(value).strip().lstrip("#")
    if len(normalized) != 6 or any(ch not in "0123456789abcdefABCDEF" for ch in normalized):
        raise ValueError(f"{field_name} 颜色不是有效的 6 位十六进制值: {value}")


def _validate_style(element_id: str, element_type: str, style: dict[str, Any]) -> None:
    if element_type == "native_shape":
        shape_name = str(style.get("shape") or "")
        if shape_name not in SUPPORTED_SHAPES:
            raise ValueError(f"{element_id} 不支持的 shape: {shape_name}")
    for key in ("fill", "line", "color"):
        _validate_hex_color(style.get(key), f"{element_id}.{key}")
    for key in ("fill_transparency", "line_transparency"):
        if key in style:
            value = float(style[key])
            if value < 0 or value > 100:
                raise ValueError(f"{element_id}.{key} 必须在 0-100 之间")
    if "line_width_pt" in style and float(style["line_width_pt"]) <= 0:
        raise ValueError(f"{element_id}.line_width_pt 必须为正数")


@dataclass(frozen=True)
class SceneElement:
    id: str
    type: str
    bbox_px: tuple[float, float, float, float]
    z_index: int
    content: str = ""
    style: dict[str, Any] = field(default_factory=dict)
    asset: Path | None = None


@dataclass(frozen=True)
class EditableScene:
    slide_number: int
    canvas_width: int
    canvas_height: int
    clean_plate: Path
    elements: tuple[SceneElement, ...]
    speaker_notes: str = ""
    sources: tuple[str, ...] = ()

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "EditableScene":
        canvas = data.get("canvas") or {}
        width = int(canvas.get("width") or 0)
        height = int(canvas.get("height") or 0)
        if width <= 0 or height <= 0:
            raise ValueError("canvas width/height 必须为正数")

        clean_plate = Path(str(data.get("clean_plate") or ""))
        if not clean_plate.is_file():
            raise ValueError(f"clean_plate 文件不存在: {clean_plate}")

        seen: set[str] = set()
        elements: list[SceneElement] = []
        for raw in data.get("elements") or []:
            element_id = str(raw.get("id") or "").strip()
            if not element_id:
                raise ValueError("元素缺少 id")
            if element_id in seen:
                raise ValueError(f"元素 id 重复: {element_id}")
            seen.add(element_id)

            element_type = str(raw.get("type") or "")
            if element_type not in SUPPORTED_TYPES:
                raise ValueError(f"不支持的元素类型: {element_type}")
            bbox_raw = raw.get("bbox_px")
            if not isinstance(bbox_raw, list) or len(bbox_raw) != 4:
                raise ValueError(f"{element_id} bbox_px 必须是 [x, y, w, h]")
            bbox = tuple(float(value) for value in bbox_raw)
            x, y, box_width, box_height = bbox
            invalid_size = (
                box_width < 0
                or box_height < 0
                or (element_type == "connector" and box_width == 0 and box_height == 0)
                or (element_type != "connector" and (box_width <= 0 or box_height <= 0))
            )
            if x < 0 or y < 0 or invalid_size or x + box_width > width or y + box_height > height:
                raise ValueError(f"{element_id} bbox 超出 canvas: {bbox}")

            style = dict(raw.get("style") or {})
            _validate_style(element_id, element_type, style)

            asset = None
            if element_type == "image_layer":
                asset = Path(str(raw.get("asset") or ""))
                if not asset.is_file():
                    raise ValueError(f"{element_id} asset 文件不存在: {asset}")

            content = str(raw.get("content") or "")
            if element_type == "native_text" and not content:
                raise ValueError(f"{element_id} native_text 缺少 content")

            elements.append(
                SceneElement(
                    id=element_id,
                    type=element_type,
                    bbox_px=bbox,
                    z_index=int(raw.get("z_index") or 0),
                    content=content,
                    style=style,
                    asset=asset,
                )
            )

        return cls(
            slide_number=int(data.get("slide_number") or 1),
            canvas_width=width,
            canvas_height=height,
            clean_plate=clean_plate,
            elements=tuple(elements),
            speaker_notes=str(data.get("speaker_notes") or ""),
            sources=tuple(str(value) for value in data.get("sources") or [] if str(value).strip()),
        )
