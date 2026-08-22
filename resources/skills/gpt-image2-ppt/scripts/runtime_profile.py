#!/usr/bin/env python3
"""Normalize every PPT visual source into one runtime profile contract.

The generator accepts two authoring inputs:

- a strict/template-derived profile, optionally carrying reference images;
- a distilled style Markdown plus ``.layouts.json`` sidecar;

Both adapters expose one shape to layout assignment, prompt compilation,
metadata, and later editing. Markdown-only styles are intentionally rejected at
the loader boundary so an obsolete prompt path cannot run silently.
"""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any, Dict, Optional


RUNTIME_PROFILE_VERSION = "1"
VALID_PAGE_TYPES = (
    "cover",
    "agenda",
    "section",
    "content",
    "data",
    "quote",
    "closing",
    "other",
)

DEFAULT_JSON_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "minLength": 1, "maxLength": 40},
        "body": {"type": "string", "minLength": 0, "maxLength": 600},
    },
    "required": ["title"],
    "additionalProperties": True,
}


def _string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _normalize_layout(
    layout: Dict[str, Any],
    index: int,
    profile_path: Optional[str] = None,
) -> Dict[str, Any]:
    normalized = copy.deepcopy(layout)
    normalized.setdefault("id", f"layout-{index + 1:02d}")
    normalized.setdefault("page_index", index)
    if normalized.get("page_type") not in VALID_PAGE_TYPES:
        normalized["page_type"] = "content"
    normalized["summary"] = str(normalized.get("summary") or "").strip()
    normalized["visual_signature"] = str(
        normalized.get("visual_signature") or ""
    ).strip()

    capacity = normalized.get("content_capacity")
    normalized["content_capacity"] = (
        capacity if isinstance(capacity, (dict, list, str)) else {}
    )
    for key in ("best_for", "avoid_for", "variation_tags"):
        normalized[key] = _string_list(normalized.get(key))
    normalized["routing"] = (
        normalized.get("routing")
        if isinstance(normalized.get("routing"), dict)
        else {}
    )
    normalized["evidence_pages"] = _string_list(normalized.get("evidence_pages"))
    normalized["external_image_slots"] = (
        normalized.get("external_image_slots")
        if isinstance(normalized.get("external_image_slots"), list)
        else []
    )
    normalized.setdefault("reuse_friendly", normalized.get("page_type") != "cover")
    normalized.setdefault("reuse_reason", "")
    normalized["json_schema"] = (
        normalized.get("json_schema")
        if isinstance(normalized.get("json_schema"), dict)
        else copy.deepcopy(DEFAULT_JSON_SCHEMA)
    )

    reference = normalized.get("reference_image") or None
    if reference and profile_path and not Path(str(reference)).is_absolute():
        candidate = (Path(profile_path).resolve().parent / str(reference)).resolve()
        if candidate.exists():
            reference = str(candidate)
    normalized["reference_image"] = reference
    return normalized


def normalize_runtime_profile(
    profile: Dict[str, Any],
    *,
    source_kind: str,
    global_style: str = "",
    profile_path: Optional[str] = None,
    style_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Return a defensive, TemplateProfile-compatible runtime profile."""
    if not isinstance(profile, dict):
        raise ValueError("Runtime profile input must be a JSON object")

    normalized = copy.deepcopy(profile)
    raw_layouts = normalized.get("layouts")
    if raw_layouts is None:
        raw_layouts = []
    if not isinstance(raw_layouts, list):
        raise ValueError("Runtime profile layouts must be a list")
    if any(not isinstance(layout, dict) for layout in raw_layouts):
        raise ValueError("Every runtime profile layout must be a JSON object")

    normalized["layouts"] = [
        _normalize_layout(layout, index, profile_path)
        for index, layout in enumerate(raw_layouts)
    ]
    normalized.setdefault("version", "2")
    normalized.setdefault(
        "source",
        Path(profile_path).name if profile_path else source_kind,
    )
    normalized.setdefault("source_hash", "")
    normalized.setdefault("theme", {})
    if style_id:
        normalized.setdefault("style_id", style_id)

    existing_style = str(normalized.get("global_style") or "").strip()
    supplied_style = str(global_style or "").strip()
    if supplied_style and existing_style and supplied_style != existing_style:
        summary_label = (
            "【内置 layout bank 风格摘要】"
            if source_kind == "distilled-style"
            else "【RuntimeProfile 风格摘要】"
        )
        normalized["global_style"] = (
            f"{supplied_style}\n\n{summary_label}\n{existing_style}"
        )
    elif supplied_style:
        normalized["global_style"] = supplied_style
    else:
        normalized["global_style"] = existing_style

    layouts = normalized["layouts"]
    capabilities = {
        "content_routing": any(bool(layout.get("routing")) for layout in layouts),
        "source_evidence": any(bool(layout.get("evidence_pages")) for layout in layouts),
        "reference_images": any(bool(layout.get("reference_image")) for layout in layouts),
        "portable_without_references": not any(
            bool(layout.get("reference_image")) for layout in layouts
        ),
    }
    normalized["runtime_profile_version"] = RUNTIME_PROFILE_VERSION
    normalized["source_kind"] = source_kind
    normalized["prompt_strategy"] = "layout-fields"
    normalized["capabilities"] = capabilities
    normalized["is_runtime_profile"] = True
    normalized["is_style_layout_bank"] = source_kind == "distilled-style"
    return normalized


def runtime_profile_summary(profile: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not profile:
        return {}
    return {
        "runtime_profile_version": profile.get("runtime_profile_version"),
        "source_kind": profile.get("source_kind"),
        "source": profile.get("source"),
        "source_hash": profile.get("source_hash"),
        "prompt_strategy": profile.get("prompt_strategy"),
        "layout_count": len(profile.get("layouts") or []),
        "capabilities": copy.deepcopy(profile.get("capabilities") or {}),
    }
