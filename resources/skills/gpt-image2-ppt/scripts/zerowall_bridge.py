#!/usr/bin/env python3
"""JSON stdin/stdout bridge for the desktop-managed PPT Skill runtime."""

from __future__ import annotations

import json
import sys
from contextlib import redirect_stdout
from pathlib import Path
from typing import Any

from generate_ppt import (
    apply_spec_updates,
    compile_runtime_slide_prompt,
    construct_edit_prompt,
)
from editable_pptx.provider import OpenAIImageProvider
from editable_pptx.renderer import render_editable_deck
from editable_pptx.workflow import (
    discover_scene_files,
    inventory_scenes,
    load_scene_file,
    render_editable_preview,
)


def _configure_protocol_streams() -> None:
    """Keep the desktop bridge stdout as UTF-8 JSON and nothing else."""
    for stream, errors in ((sys.stdin, "strict"), (sys.stdout, "strict"), (sys.stderr, "backslashreplace")):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors=errors)


def _profile(value: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(value)
    for source, target in (
        ("runtimeProfileVersion", "runtime_profile_version"),
        ("sourceKind", "source_kind"),
        ("sourceHash", "source_hash"),
        ("promptStrategy", "prompt_strategy"),
        ("globalStyle", "global_style"),
        ("profilePath", "profile_path"),
    ):
        if source in normalized and target not in normalized:
            normalized[target] = normalized[source]
    return normalized


def _slide(value: dict[str, Any], number: int, layout: dict[str, Any] | None = None) -> dict[str, Any]:
    # Keep the plan title authoritative.  The upstream coercer treats the
    # first content line as a title when no explicit fields are supplied;
    # passing keyPoints as content therefore silently replaced real titles.
    title = str(value.get("title") or "").strip()
    key_points = value.get("keyPoints", value.get("key_points", []))
    if isinstance(key_points, str):
        key_points = [key_points]
    if not isinstance(key_points, list):
        key_points = []
    key_points = [str(item).strip() for item in key_points if str(item).strip()]
    content = value.get("content", key_points)
    if isinstance(content, list):
        content = "\n".join(str(item).strip() for item in content if str(item).strip())
    elif not isinstance(content, str):
        content = json.dumps(content, ensure_ascii=False)
    fields: dict[str, Any] = {}
    properties = ((layout or {}).get("json_schema") or {}).get("properties", {})
    if isinstance(properties, dict):
        if "title" in properties:
            fields["title"] = title
        for key in ("subtitle", "tagline", "visual_intent", "visualIntent", "body", "description", "text"):
            if key in properties and value.get(key) not in (None, ""):
                fields[key] = value[key]
        array_key = next((key for key, prop in properties.items() if isinstance(prop, dict) and prop.get("type") == "array"), None)
        if array_key and key_points:
            item_schema = properties[array_key].get("items") or {}
            item_props = item_schema.get("properties") if isinstance(item_schema, dict) else {}
            if isinstance(item_props, dict) and item_props:
                fields[array_key] = [
                    {key: (point if key in ("name", "label", "title", "key", "description", "text") else point)
                     for key in item_props}
                    for point in key_points
                ]
            else:
                fields[array_key] = key_points
        elif key_points:
            for key in ("body", "description", "content", "text"):
                if key in properties:
                    fields[key] = "\n".join(key_points)
                    break
    return {
        **value,
        "slide_number": number,
        "page_type": value.get("pageType", value.get("page_type", "content")),
        "title": value.get("title", ""),
        "content": content,
        "visual_intent": value.get("visualIntent", value.get("visual_intent", "")),
        "fields": fields,
    }


def compile_deck(payload: dict[str, Any]) -> dict[str, Any]:
    profile = _profile(payload["profile"])
    layouts = profile.get("layouts") or []
    by_id = {str(layout.get("id")): layout for layout in layouts}
    assignments = payload.get("assignments") or []
    slides = payload.get("slides") or []
    if len(assignments) != len(slides):
        raise ValueError("layout assignment is incomplete")

    compiled = []
    for index, raw_slide in enumerate(slides, start=1):
        assignment = assignments[index - 1]
        layout_id = str(assignment.get("layoutId") or assignment.get("layout_id") or "")
        layout = by_id.get(layout_id)
        if layout is None:
            raise ValueError(f"layout '{layout_id}' is not available")
        slide = _slide(raw_slide, index, layout)
        # The upstream Skill prints non-fatal schema diagnostics. They are
        # useful for troubleshooting but must never corrupt the JSON protocol.
        with redirect_stdout(sys.stderr):
            prompt = compile_runtime_slide_prompt(profile, layout, slide)
        prompt += "\n\n[Editable PowerPoint visual master]\n"
        prompt += (
            "Build a complete visual master with a clear editorial hierarchy for the supplied title and key points. "
            "Keep exact scientific values, citations, tables, charts, logos, screenshots and protected source figures "
            "as native PowerPoint objects that will be overlaid later; do not invent or rewrite those assets. "
            "Leave the declared safe zones readable for the native editable layer.\n"
            "这是可编辑 PowerPoint 的视觉母版：围绕标题和要点建立清晰层级；精确数值、引用、表格、图表、Logo、截图和受保护科研图片由后续原生对象叠加，"
            "不要擅自编造或改写这些素材，并为原生可编辑层保留清晰安全区。"
        )
        strict = (
            profile.get("source_kind") == "template-clone"
            and bool((profile.get("capabilities") or {}).get("templateStrict"))
        )
        compiled.append(
            {
                "slideNumber": index,
                "layoutId": layout_id,
                "prompt": prompt,
                "model": payload["model"],
                "referenceImage": layout.get("reference_image") if strict else None,
                "assetReferenceImage": None,
                "slideSpec": raw_slide,
            }
        )
    return {"slides": compiled, "promptStrategy": "layout-fields", "model": payload["model"]}


def compile_edit(payload: dict[str, Any]) -> dict[str, Any]:
    current_spec = payload.get("currentSpec") or {}
    element_updates = payload.get("elementUpdates") or {}
    if not isinstance(current_spec, dict):
        raise ValueError("compile-edit currentSpec must be an object")
    if not isinstance(element_updates, dict):
        raise ValueError("compile-edit elementUpdates must be an object")

    updated_spec = apply_spec_updates(current_spec, element_updates)
    instruction = str(payload.get("editInstruction") or "").strip()
    if element_updates:
        prompt = construct_edit_prompt(current_spec, element_updates)
    elif instruction:
        prompt = "在当前页面基础上执行以下修改，其他内容、布局和视觉系统保持不变："
    else:
        raise ValueError("compile-edit requires elementUpdates or editInstruction")
    if instruction:
        prompt += f"\n{instruction}"
    prompt += (
        "\n必须保留未指定修改的标题、正文、数值、引用、图表、科研图片、配色和版式。"
        "只调整明确指定的元素，并把当前页面作为唯一视觉参考。"
    )
    return {
        "prompt": prompt,
        "slideSpec": updated_spec,
        "referenceImage": payload.get("referenceImage"),
    }


def assemble_editable(payload: dict[str, Any]) -> dict[str, Any]:
    scene_dir = Path(str(payload["sceneDir"])).resolve()
    output_dir = Path(str(payload["outputDir"])).resolve()
    output_path = Path(str(payload["outputPath"])).resolve()
    slide_numbers = [int(value) for value in payload.get("slideNumbers") or []]
    _ = str(payload.get("title") or "presentation")
    scene_files = discover_scene_files(scene_dir, slide_numbers)
    scenes = tuple(load_scene_file(path) for path in scene_files)
    declared = [scene.slide_number for scene in scenes]
    if len(declared) != len(set(declared)):
        raise ValueError(f"editable scene 的 slide_number 重复: {declared}")
    for path, scene in zip(scene_files, scenes):
        expected_number = int(path.stem.removeprefix("slide-").removesuffix(".scene"))
        if expected_number != scene.slide_number:
            raise ValueError(
                f"editable scene 文件名与 slide_number 不一致: {path.name} -> {scene.slide_number}"
            )
    with redirect_stdout(sys.stderr):
        render_editable_deck(scenes, output_path)
    return {
        "pptxPath": str(output_path),
        "sceneFiles": [str(path) for path in scene_files],
        "inventory": inventory_scenes(scenes),
    }


def render_editable(payload: dict[str, Any]) -> dict[str, Any]:
    scene_dir = Path(str(payload["sceneDir"])).resolve()
    output_dir = Path(str(payload["outputDir"])).resolve()
    output_path = Path(str(payload["outputPath"])).resolve()
    slide_numbers = [int(value) for value in payload.get("slideNumbers") or []]
    scene_files = discover_scene_files(scene_dir, slide_numbers)
    scenes = tuple(load_scene_file(path) for path in scene_files)
    with redirect_stdout(sys.stderr):
        render_dir = render_editable_preview(output_path, output_dir, len(scenes))
    report = {
        "status": "rendered_pending_manual_review",
        "mode": "editable",
        "slide_count": len(scenes),
        **inventory_scenes(scenes),
        "picture_count": len(scenes) + sum(
            1 for scene in scenes for element in scene.elements if element.type == "image_layer"
        ),
        "scene_files": [str(path) for path in scene_files],
        "pptx": str(output_path),
        "render_dir": str(render_dir),
        "rendered_pages": [str(path) for path in sorted(render_dir.glob("page-*.png"))],
        "manual_visual_review_required": True,
    }
    report_path = output_dir / "editable-quality-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    return {
        "pptxPath": str(output_path),
        "reportPath": str(report_path),
        "renderDir": str(render_dir),
        "sceneFiles": [str(path) for path in scene_files],
        "report": report,
    }


def generate_clean_plate(payload: dict[str, Any]) -> dict[str, Any]:
    source_path = Path(str(payload["sourcePath"])).resolve()
    output_path = Path(str(payload["outputPath"])).resolve()
    prompt = str(payload.get("prompt") or "").strip()
    if not source_path.is_file():
        raise ValueError(f"clean-plate source is missing: {source_path}")
    if not prompt:
        raise ValueError("clean-plate prompt is empty")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()
    upload_path = output_path.with_name(f"{output_path.stem}.upload.jpg")
    from PIL import Image
    with Image.open(source_path) as source:
        source.convert("RGB").resize((1536, 864), Image.Resampling.LANCZOS).save(
            upload_path, format="JPEG", quality=92, optimize=True
        )
    try:
        with redirect_stdout(sys.stderr):
            provider = OpenAIImageProvider.from_env()
            provider.edit(upload_path, None, prompt, output_path, size="1536x1024")
    finally:
        upload_path.unlink(missing_ok=True)
    if not output_path.is_file() or output_path.stat().st_size == 0:
        raise RuntimeError("gpt-image-2 did not produce a clean plate")
    return {"outputPath": str(output_path), "sizeBytes": output_path.stat().st_size}


def main() -> None:
    _configure_protocol_streams()
    payload = json.load(sys.stdin)
    operation = payload.get("operation")
    if operation in {"compile-deck", "compile-prompts"}:
        result = compile_deck(payload)
    elif operation == "compile-edit":
        result = compile_edit(payload)
    elif operation == "generate-clean-plate":
        result = generate_clean_plate(payload)
    elif operation == "assemble-editable":
        result = assemble_editable(payload)
    elif operation == "render-editable":
        result = render_editable(payload)
    else:
        raise ValueError("unsupported ZeroWall PPT Skill bridge operation")
    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        json.dump({"error": str(error)}, sys.stdout, ensure_ascii=False)
        sys.exit(1)
