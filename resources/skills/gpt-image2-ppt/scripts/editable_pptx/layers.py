"""Raster layer extraction and overlap strategy routing."""

from __future__ import annotations

from dataclasses import dataclass

from PIL import Image


@dataclass(frozen=True)
class LayerMetrics:
    mask_confidence: float
    edge_contamination: float
    occlusion_ratio: float

    def __post_init__(self) -> None:
        for name, value in (
            ("mask_confidence", self.mask_confidence),
            ("edge_contamination", self.edge_contamination),
            ("occlusion_ratio", self.occlusion_ratio),
        ):
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{name} 必须在 0 到 1 之间")


def extract_rgba_layer(source: Image.Image, mask: Image.Image) -> Image.Image:
    if source.size != mask.size:
        raise ValueError("源图与 layer mask 尺寸必须一致")
    layer = source.convert("RGBA")
    layer.putalpha(mask.convert("L"))
    return layer


def paste_layer(background: Image.Image, layer: Image.Image, position: tuple[int, int]) -> Image.Image:
    result = background.convert("RGBA").copy()
    result.alpha_composite(layer.convert("RGBA"), dest=position)
    return result


def choose_layer_strategy(metrics: LayerMetrics, design_mode: bool = False) -> str:
    if design_mode:
        return "ai_regenerate"
    if metrics.mask_confidence < 0.90 or metrics.edge_contamination > 0.08:
        return "ai_regenerate"
    if metrics.occlusion_ratio > 0.20:
        return "occlusion_complete"
    return "direct_extract"


def build_ai_separation_prompt(object_description: str, scene_context: str) -> str:
    return (
        f"从参考幻灯片中分离并重建单个对象：{object_description}。"
        f"原位置与遮挡关系：{scene_context}。"
        "保持对象的身份、轮廓、透视、材质、颜色、相对尺寸与光线方向；"
        "补全被遮挡部分，但不要重新设计，不要添加其他对象，不要生成文字、数字或 Logo。"
        "输出适合后续透明抠图的单对象画面。"
    )
