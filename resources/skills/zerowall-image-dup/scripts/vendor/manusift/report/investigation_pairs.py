"""PRIMARY batch/MCP investigation report (paired findings + location).

Writes investigation_pairs.html / .md / .json. This is the default
offline report surface for manusift screen / MCP jobs.
See docs/REPORT_PATH.md.

"""
from __future__ import annotations

import html
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..contracts import Finding  # noqa: TC001 — runtime
from .finding_aggregation import aggregate_findings

SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2, "info": 3}

# relation labels (zh)
_CHECK_ZH: dict[str, str] = {
    "fixed_offset": "固定差值（两列差恒定）",
    "high_duplicate_rate": "高重复率（两列大量相同）",
    "mirror_symmetry": "镜像对称（两列和恒定）",
    "matching_decimal_tails": "小数尾部相同",
    "integer_shift_decimal_tail_reuse": "整数平移 + 小数尾复用",
    "integer_part_digit_change_decimal_tail_reuse": "整数位改动 + 小数尾复用",
    "cross_table_fixed_offset": "跨表固定差值",
    "cross_table_repeated_values": "跨表重复数值",
    "cross_table_matching_decimal_tails": "跨表小数尾相同",
    "cross_table_terminal_digit_concentration": "跨表末位数字集中",
    "zero_variance": "零方差（一列全相同）",
    "zero_standard_deviation_entries": "标准差为 0 的条目",
    "constant_standard_deviation": "标准差恒定",
    "improbable_repeated_values": "不可能的高重复值",
    "arithmetic_progression": "等差数列",
    "near_perfect_arithmetic_progression": "近乎完美等差",
    "terminal_digit_concentration": "末位数字过于集中",
    "terminal_digit_pair_concentration": "末位数字对集中",
    "ones_decimal_mirror": "个位与第一位小数镜像",
    "multi_column_high_duplicate_rate": "多列高重复",
    "cross_image_sift": "跨图局部特征匹配（SIFT）",
    "panel_sift_match": "拼板面板局部匹配",
    "near_texture_overlap": "近纹理重叠",
    "copy_move": "图内复制移动嫌疑",
    "ela": "误差级分析（压缩不一致）",
    "jpeg_ghost": "JPEG 鬼影（二次压缩）",
    "image_forensics_summary": "图像取证汇总",
}

_KIND_BUCKET = {
    "table_pair": "表格组↔组",
    "table_cross": "跨表组↔组",
    "table_column": "单列/组",
    "image_pair": "图像对",
    "image_panel": "面板对",
    "image_single": "单图信号",
    "other": "其它",
}


def _sev_zh(sev: str) -> str:
    return {
        "high": "高",
        "medium": "中",
        "low": "低",
        "info": "提示",
    }.get(sev, sev)


def _light(sev: str) -> str:
    if sev == "high":
        return "red"
    if sev == "medium":
        return "yellow"
    return "green"


def _s(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, float):
        if v == int(v):
            return str(int(v))
        return f"{v:.4g}"
    return str(v).strip()


def _clean_label(s: str) -> str:
    s = (s or "").strip()
    s = re.sub(r"\s+", " ", s)
    return s


_FIG_RE = re.compile(
    r"(?:Fig\.?\s*S?\d+[a-z]?|Figure\s+S?\d+[a-z]?|Sfig\.?\s*\d+|Table\s*#?\d+|"
    r"表\s*\d+|图\s*S?\d+[a-z]?)",
    re.I,
)
_PAGE_IMG_RE = re.compile(
    r"(?:Page|页)\s*(\d+)\s*/\s*(?:image|图)\s*(\d+)",
    re.I,
)
_PAGE_IMG_ALT_RE = re.compile(
    r"(?:image|图)\s*(\d+)\s+on\s+page\s+(\d+)",
    re.I,
)
_COL_RE = re.compile(
    r"columns?\s+(\d+)(?:\s+and\s+(\d+))?|column\s+(\d+)",
    re.I,
)
_SHEET_RE = re.compile(r"(?:sheet|工作表)\s*[:：]?\s*([^\],;|]+)", re.I)


def _extract_figs(text: str) -> list[str]:
    if not text:
        return []
    seen: list[str] = []
    for m in _FIG_RE.finditer(text):
        lab = _clean_label(m.group(0))
        # normalize spacing
        lab = re.sub(r"(?i)fig\.\s*", "Fig.", lab)
        lab = re.sub(r"(?i)figure\s+", "Figure ", lab)
        if lab not in seen:
            seen.append(lab)
    return seen


def _fmt_image_side(obj: Any) -> str:
    if not isinstance(obj, dict):
        return _s(obj)
    page = obj.get("page")
    idx = obj.get("index")
    path = obj.get("image_path") or obj.get("path") or ""
    parts: list[str] = []
    if page is not None:
        try:
            parts.append(f"Page {int(page) + 1}")
        except (TypeError, ValueError):
            parts.append(f"Page {page}")
    if idx is not None:
        parts.append(f"image {idx}")
    if path and not parts:
        parts.append(Path(str(path)).name)
    return " / ".join(parts) if parts else _s(obj)


def _fmt_panel(obj: Any) -> str:
    if obj is None:
        return ""
    if isinstance(obj, (list, tuple)) and len(obj) >= 4:
        return f"bbox({','.join(_s(x) for x in obj[:4])})"
    if isinstance(obj, dict):
        if "index" in obj:
            return f"panel {_s(obj.get('index'))}"
        if "bbox" in obj:
            return _fmt_panel(obj.get("bbox"))
    return _s(obj)


def _relation_label(raw: dict[str, Any], title: str) -> str:
    check = _s(raw.get("check") or raw.get("kind") or "").lower()
    if check in _CHECK_ZH:
        return _CHECK_ZH[check]
    # soft match
    for key, zh in _CHECK_ZH.items():
        if key in check:
            return zh
    t = (title or "").lower()
    for key, zh in _CHECK_ZH.items():
        if key.replace("_", " ") in t or key.replace("_", "-") in t:
            return zh
    return check or (title[:40] if title else "未命名信号")


def _classify_kind(detector: str, raw: dict[str, Any], location: str) -> str:
    det = (detector or "").lower()
    check = _s(raw.get("check") or raw.get("kind") or "").lower()
    if "image_a" in raw and "image_b" in raw:
        return "image_pair"
    if "panel_a" in raw and "panel_b" in raw:
        return "image_panel"
    if check.startswith("cross_table") or (
        "left_table" in raw and "right_table" in raw
    ):
        return "table_cross"
    if "left_column" in raw or "right_column" in raw:
        return "table_pair"
    if check in (
        "fixed_offset",
        "high_duplicate_rate",
        "mirror_symmetry",
        "matching_decimal_tails",
        "multi_column_high_duplicate_rate",
    ):
        return "table_pair"
    if any(
        x in det
        for x in (
            "image_forensics",
            "image_",
            "panel_",
            "page_raster",
            "sift",
        )
    ):
        if check in ("cross_image_sift", "panel_sift_match", "near_texture_overlap"):
            if "panel" in check:
                return "image_panel"
            return "image_pair"
        if check in ("copy_move", "ela", "jpeg_ghost"):
            return "image_single"
        if "image" in det or "panel" in det:
            return "image_single"
    if any(x in det for x in ("table_", "stat_", "figure_grim", "figure_stat")):
        return "table_column"
    if "column" in (location or "").lower() or _FIG_RE.search(location or ""):
        if "table" in det or "stat" in det:
            return "table_column"
    return "other"


def _side_a_b(
    *,
    kind: str,
    raw: dict[str, Any],
    location: str,
    title: str,
) -> tuple[str, str]:
    """Return (side_a, side_b) localization strings; side_b may be empty."""
    # Image pairs
    if "image_a" in raw or "image_b" in raw:
        return _fmt_image_side(raw.get("image_a")), _fmt_image_side(raw.get("image_b"))
    if "panel_a" in raw or "panel_b" in raw:
        pa = _fmt_panel(raw.get("panel_a"))
        pb = _fmt_panel(raw.get("panel_b"))
        parts: list[str] = []
        page = raw.get("page")
        if page is not None:
            try:
                parts.append(f"Page {int(page) + 1}")
            except (TypeError, ValueError):
                parts.append(f"Page {page}")
        idx = raw.get("index")
        if idx is not None:
            parts.append(f"image {idx}")
        base = " / ".join(parts)
        if base:
            base = base + " · "
        return (base + pa).strip(" ·"), ((base + pb).strip(" ·") if pb else "")

    left_t = _s(raw.get("left_table"))
    right_t = _s(raw.get("right_table"))
    left_c = _s(raw.get("left_column"))
    right_c = _s(raw.get("right_column"))

    if left_t or right_t:
        a = left_t
        b = right_t
        if left_c:
            a = f"{a} · 列「{left_c}」" if a else f"列「{left_c}」"
        if right_c:
            b = f"{b} · 列「{right_c}」" if b else f"列「{right_c}」"
        # if columns empty, try parse location "T1, column X to T2, column Y"
        if not left_c and not right_c:
            m = re.search(
                r"(.+?),\s*column\s+(\d+)\s+to\s+(.+?),\s*column\s+(\d+)",
                location or "",
                re.I,
            )
            if m:
                a = f"{_clean_label(m.group(1))} · col {m.group(2)}"
                b = f"{_clean_label(m.group(3))} · col {m.group(4)}"
        return a, b

    if left_c or right_c:
        # within-table column pair — attach table/fig from location
        figs = _extract_figs(location)
        host = figs[0] if figs else _host_from_location(location)
        a = f"{host} · 列「{left_c}」" if left_c else host
        b = f"{host} · 列「{right_c}」" if right_c else ""
        if not left_c and not right_c:
            # parse "columns X and Y"
            m = re.search(r"columns?\s+(\d+)\s+and\s+(\d+)", location or "", re.I)
            if m:
                a = f"{host} · col {m.group(1)}"
                b = f"{host} · col {m.group(2)}"
        return a, b

    # single-column table findings
    col = _s(raw.get("column"))
    if col:
        host = _host_from_location(location)
        return f"{host} · 列「{col}」" if host else f"列「{col}」", ""

    # page/image from raw
    if raw.get("page") is not None and raw.get("index") is not None:
        try:
            side = f"Page {int(raw['page']) + 1} / image {raw['index']}"
        except (TypeError, ValueError):
            side = f"Page {raw.get('page')} / image {raw.get('index')}"
        return side, ""

    m = _PAGE_IMG_RE.search(location or "")
    if m:
        return f"Page {m.group(1)} / image {m.group(2)}", ""
    m2 = _PAGE_IMG_ALT_RE.search(location or "")
    if m2:
        return f"Page {m2.group(2)} / image {m2.group(1)}", ""

    # "A -> B" locations for image pairs
    if "->" in (location or ""):
        parts = [p.strip() for p in location.split("->", 1)]
        if len(parts) == 2:
            return parts[0], parts[1]

    # columns X and Y without raw headers
    m = re.search(r"columns?\s+(\d+)\s+and\s+(\d+)", location or "", re.I)
    if m:
        host = _host_from_location(location)
        return f"{host} · col {m.group(1)}", f"{host} · col {m.group(2)}"

    m = re.search(r"column\s+(\d+)", location or "", re.I)
    if m:
        host = _host_from_location(location)
        colname = ""
        mq = re.search(r"\('([^']*)'\)", location or "")
        if mq and mq.group(1):
            colname = mq.group(1)
        label = f"col {m.group(1)}" + (f" 「{colname}」" if colname else "")
        return f"{host} · {label}" if host else label, ""

    figs = _extract_figs(location)
    if len(figs) >= 2:
        return figs[0], figs[1]
    if len(figs) == 1:
        return figs[0], ""

    loc = _clean_label(location or "")
    if loc and loc.lower() not in ("pdf", "text", "n/a", "unknown"):
        # avoid dumping absolute paths as "location"
        if re.match(r"^[A-Za-z]:\\|/", loc) or loc.endswith(".pdf"):
            return "（仅文件路径，缺具体图表定位）", ""
        return loc[:120], ""
    return "", ""


def _host_from_location(location: str) -> str:
    loc = location or ""
    # strip trailing ", column..."
    base = re.split(r",\s*columns?\b", loc, maxsplit=1, flags=re.I)[0]
    base = re.split(r",\s*column\b", base, maxsplit=1, flags=re.I)[0]
    base = _clean_label(base)
    if not base or base.lower() in ("pdf", "text"):
        figs = _extract_figs(loc)
        return figs[0] if figs else ""
    return base


def _parse_sheet(location: str, raw: dict[str, Any]) -> str:
    if raw.get("sheet"):
        return _s(raw.get("sheet"))
    if raw.get("sheet_name"):
        return _s(raw.get("sheet_name"))
    m = _SHEET_RE.search(location or "")
    if m:
        return _clean_label(m.group(1))
    # "in Sfig.2" style
    m2 = re.search(r"\bin\s+(Sfig\.?\s*\d+|[A-Za-z0-9_.-]+\.xlsx?)", location or "", re.I)
    if m2:
        return _clean_label(m2.group(1))
    return ""


def _location_sufficient(
    *,
    side_a: str,
    side_b: str,
    kind: str,
    location: str,
    raw: dict[str, Any],
) -> bool:
    """Strict rule: need a concrete place humans can open."""
    bad_markers = (
        "缺具体",
        "仅文件路径",
        "n/a",
        "unknown",
    )
    a = (side_a or "").strip()
    b = (side_b or "").strip()
    if not a and not b:
        return False
    if any(m in a for m in bad_markers):
        return False
    # absolute path alone is insufficient
    if re.match(r"^[A-Za-z]:\\|/", a) and not b:
        return False
    # pair-kinds should ideally have two sides; if only one, still ok for single-column
    if kind in ("image_pair", "image_panel", "table_pair", "table_cross"):
        # allow single side if location string still points to a fig/table/page
        if a and b:
            return True
        if a and (
            _FIG_RE.search(a)
            or re.search(r"page\s*\d+", a, re.I)
            or "col" in a.lower()
            or "列" in a
        ):
            return True
        return bool(a and location and _FIG_RE.search(location))
    # single-side findings
    return bool(
        a
        and (
            _FIG_RE.search(a)
            or re.search(r"page\s*\d+", a, re.I)
            or "col" in a.lower()
            or "列" in a
            or "table" in a.lower()
            or "表" in a
        )
    )


def _metric_bits(raw: dict[str, Any]) -> list[str]:
    bits: list[str] = []
    mapping = [
        ("n", "n"),
        ("offset", "offset"),
        ("matching_pairs", "匹配对数"),
        ("repeat_count", "重复次数"),
        ("repeated_value", "重复值"),
        ("step", "步长"),
        ("match_count", "匹配数"),
        ("inlier_count", "内点数"),
        ("ela_global_std", "ELA σ"),
        ("risk_score", "风险分"),
        ("hamming", "汉明距"),
        ("combined_fraction", "合并占比"),
    ]
    for key, lab in mapping:
        if key in raw and raw[key] is not None:
            bits.append(f"{lab}={_s(raw[key])}")
    return bits[:6]


def _observation(kind: str, relation: str, side_a: str, side_b: str) -> str:
    if side_a and side_b:
        return f"在「{side_a}」与「{side_b}」之间，检测到：{relation}。"
    if side_a:
        return f"在「{side_a}」处，检测到：{relation}。"
    return f"检测到：{relation}（定位信息不足）。"


def _what_to_check(kind: str, side_a: str, side_b: str, sheet: str) -> str:
    where = ""
    if sheet:
        where = f"文件/工作表「{sheet}」中的 "
    if kind.startswith("table") or kind in ("table_pair", "table_cross", "table_column"):
        if side_a and side_b:
            return (
                f"打开原始表格/Source Data，定位到{where}"
                f"「{side_a}」和「{side_b}」，对照两列（或两组）数字是否应相同/成固定差。"
            )
        return f"打开原始表格，定位到{where}「{side_a or '报告位置'}」，核对数值是否异常整齐或重复。"
    if kind in ("image_pair", "image_panel"):
        return (
            f"打开原图/未压缩图，对照「{side_a}」与「{side_b or '另一侧'}」"
            "是否为同一实验区域的重复使用或拼接错误。"
        )
    if kind == "image_single":
        return f"打开「{side_a or '对应图片'}」，放大查看是否有复制粘贴、压缩异常或二次保存痕迹。"
    return f"根据位置「{side_a or side_b or '见索引表'}」回原文件核对。"


def normalize_pair_item(f: Finding, index: int) -> dict[str, Any]:
    raw = f.raw if isinstance(f.raw, dict) else {}
    location = f.location or ""
    kind = _classify_kind(f.detector, raw, location)
    side_a, side_b = _side_a_b(kind=kind, raw=raw, location=location, title=f.title)
    relation = _relation_label(raw, f.title)
    sheet = _parse_sheet(location, raw)
    figs = _extract_figs(location)
    if not figs and side_a:
        figs = _extract_figs(side_a + " " + side_b)
    sufficient = _location_sufficient(
        side_a=side_a,
        side_b=side_b,
        kind=kind,
        location=location,
        raw=raw,
    )
    metrics = _metric_bits(raw)
    check = _s(raw.get("check") or raw.get("kind") or "")
    story = (f.llm_verdict or "").strip()
    # P2 light evidence bits (paths / key numbers already in raw)
    evidence_bits: list[str] = []
    for side_key, lab in (("image_a", "图A"), ("image_b", "图B")):
        obj = raw.get(side_key)
        if isinstance(obj, dict):
            pth = obj.get("image_path") or obj.get("path")
            if pth:
                evidence_bits.append(f"{lab}: {Path(str(pth)).name}")
    if raw.get("image_path"):
        evidence_bits.append(f"图: {Path(str(raw['image_path'])).name}")
    if f.evidence:
        # keep short numeric snippet only
        ev = (f.evidence or "").strip()
        if len(ev) <= 220:
            evidence_bits.append(ev[:220])
    return {
        "index": index,
        "anchor": f"case-{index}",
        "finding_id": f.finding_id,
        "detector": f.detector,
        "severity": f.severity,
        "light": _light(str(f.severity)),
        "kind": kind,
        "kind_label": _KIND_BUCKET.get(kind, kind),
        "relation": relation,
        "check": check,
        "title": f.title,
        "evidence": (f.evidence or "")[:500],
        "evidence_bits": evidence_bits[:4],
        "location_raw": location,
        "side_a": side_a,
        "side_b": side_b,
        "sheet": sheet,
        "figs": figs,
        "metrics": metrics,
        "location_sufficient": sufficient,
        "observation": _observation(kind, relation, side_a, side_b),
        "what_to_check": _what_to_check(kind, side_a, side_b, sheet),
        "llm_verdict": story[:500] if story else "",
        "has_llm": bool(story),
        "is_pair": kind
        in ("table_pair", "table_cross", "image_pair", "image_panel")
        and bool(side_a)
        and bool(side_b),
    }


def build_investigation_pairs_payload(
    *,
    trace_id: str,
    findings: list[Finding],
    llm_calls: int = 0,
    language: str = "zh",
    source_name: str = "",
) -> dict[str, Any]:
    # sort: severity → pair-first → sufficient location first → original order
    indexed = list(enumerate(findings, start=1))
    items = [normalize_pair_item(f, i) for i, f in indexed]

    def sort_key(it: dict) -> tuple:
        return (
            SEVERITY_ORDER.get(str(it.get("severity")), 9),
            0 if it.get("is_pair") else 1,
            0 if it.get("location_sufficient") else 1,
            int(it.get("index") or 0),
        )

    items_sorted = sorted(items, key=sort_key)
    # re-number display order while keeping finding_id
    seen_kinds: set[str] = set()
    for display_i, it in enumerate(items_sorted, start=1):
        it["display_index"] = display_i
        it["anchor"] = f"case-{display_i}"
        kind = str(it.get("kind") or "other")
        it["kind_anchor"] = f"kind-{kind}"
        # First item of each kind also carries the kind section flag
        if kind not in seen_kinds:
            it["is_kind_head"] = True
            seen_kinds.add(kind)
        else:
            it["is_kind_head"] = False

    by_sev = Counter(str(i.get("severity")) for i in items_sorted)
    by_kind = Counter(str(i.get("kind")) for i in items_sorted)
    n_pair = sum(1 for i in items_sorted if i.get("is_pair"))
    n_insufficient = sum(1 for i in items_sorted if not i.get("location_sufficient"))
    n_high = by_sev.get("high", 0)

    if n_high >= 30:
        overall = "red"
        overall_label = "组↔组 / 图对信号较多，建议系统核对"
        overall_tip = "先用索引表筛「高」严重度与「表格组↔组 / 图像对」，再点进个案卡片。"
    elif n_high >= 5 or n_pair >= 20:
        overall = "yellow"
        overall_label = "存在若干需定位核对的配对关系"
        overall_tip = "按索引表从高到低打开个案；定位不足的条目单独放在文末。"
    elif n_high >= 1 or n_pair >= 1:
        overall = "yellow"
        overall_label = "有配对或定位线索，需人工确认"
        overall_tip = "电脑只做观察提示，请对照原始表格与原图。"
    else:
        overall = "green"
        overall_label = "暂未看到突出的组↔组 / 图对信号"
        overall_tip = "仍建议抽查关键图和 Source Data；程序也会漏报。"

    # group anchors by primary fig for nav
    fig_groups: dict[str, list[str]] = {}
    for it in items_sorted:
        if not it.get("location_sufficient"):
            continue
        keys = list(it.get("figs") or [])
        if not keys:
            # try side labels
            for side in (it.get("side_a"), it.get("side_b")):
                keys.extend(_extract_figs(side or ""))
        if not keys:
            keys = ["（未归入 Fig）"]
        primary = keys[0]
        fig_groups.setdefault(primary, []).append(it["anchor"])

    return {
        "schema": "manusift.investigation_pairs.v1",
        "trace_id": trace_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "language": language,
        "source_name": source_name,
        "llm_calls": llm_calls,
        "overall": overall,
        "overall_label": overall_label,
        "overall_tip": overall_tip,
        "counts": {
            "total": len(items_sorted),
            "high": by_sev.get("high", 0),
            "medium": by_sev.get("medium", 0),
            "low": by_sev.get("low", 0),
            "info": by_sev.get("info", 0),
            "pairs": n_pair,
            "location_insufficient": n_insufficient,
            "with_llm": sum(1 for i in items_sorted if i.get("has_llm")),
            "by_kind": dict(by_kind),
        },
        "fig_groups": {k: v for k, v in list(fig_groups.items())[:80]},
        "items": items_sorted,
        # P1.1: aggregated issue view (findings unchanged, view only).
        "issues": [
            i.to_dict() for i in aggregate_findings(findings)
        ],
        # P6.3: taxonomy groups from finding.raw.pubpeer_pattern
        "pubpeer_pattern_groups": _pubpeer_pattern_groups(findings),
    }


def _pubpeer_pattern_groups(findings: list[Finding]) -> list[dict[str, Any]]:
    """Cluster findings by raw.pubpeer_pattern for report navigation."""
    buckets: dict[str, list[Finding]] = {}
    for f in findings:
        raw = f.raw if isinstance(f.raw, dict) else {}
        pat = str(raw.get("pubpeer_pattern") or "").strip()
        if not pat:
            continue
        buckets.setdefault(pat, []).append(f)
    out: list[dict[str, Any]] = []
    for pat, members in buckets.items():
        sevs = [str(m.severity) for m in members]
        max_sev = "info"
        for s in ("high", "medium", "low", "info"):
            if s in sevs:
                max_sev = s
                break
        sample = sorted(
            members,
            key=lambda m: SEVERITY_ORDER.get(str(m.severity), 9),
        )[0]
        out.append(
            {
                "pattern": pat,
                "count": len(members),
                "max_severity": max_sev,
                "sample_title": sample.title or "",
            }
        )
    out.sort(
        key=lambda g: (
            SEVERITY_ORDER.get(str(g.get("max_severity")), 9),
            -int(g.get("count") or 0),
            str(g.get("pattern") or ""),
        )
    )
    return out


# ---------------------------------------------------------------------------
# HTML / Markdown
# ---------------------------------------------------------------------------

_CSS = """
:root {
  --bg: #fafaf9; --ink: #1c1917; --muted: #57534e;
  --line: #e7e5e4; --card: #ffffff;
  --red: #dc2626; --yellow: #d97706; --green: #16a34a; --sky: #0284c7;
  --hi: #fef2f2; --mid: #fffbeb; --lo: #f0fdf4;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.6 "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif;
}
.page { max-width: 1100px; margin: 0 auto; padding: 28px 18px 80px; }
.banner {
  background: linear-gradient(135deg, #ecfeff, #fff7ed);
  border: 2px solid var(--ink); border-radius: 16px;
  padding: 20px 18px; margin-bottom: 18px;
}
.banner .tag {
  display: inline-block; font-size: 11px; letter-spacing: .08em;
  background: #fff; border: 1px solid var(--line); border-radius: 999px;
  padding: 2px 10px; color: var(--muted); margin-bottom: 8px;
}
.banner h1 { margin: 0 0 6px; font-size: 24px; line-height: 1.25; }
.banner .sub { color: var(--muted); font-size: 12px; }
.warn {
  margin-top: 12px; background: #fef3c7; border: 1px solid #fcd34d;
  border-radius: 10px; padding: 10px 12px; font-size: 13px;
}
.stats {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;
  margin: 16px 0;
}
@media (max-width: 800px) { .stats { grid-template-columns: repeat(2, 1fr); } }
.stat {
  background: var(--card); border: 1px solid var(--line); border-radius: 12px;
  padding: 12px 10px; text-align: center;
}
.stat b { display: block; font-size: 22px; }
.stat span { font-size: 12px; color: var(--muted); }
.stat.red { background: var(--hi); border-color: #fecaca; }
.stat.yellow { background: var(--mid); border-color: #fde68a; }
.stat.green { background: var(--lo); border-color: #bbf7d0; }
.verdict {
  background: var(--card); border: 2px solid var(--ink); border-radius: 14px;
  padding: 14px 16px; margin-bottom: 20px;
}
.verdict h2 { margin: 0 0 6px; font-size: 16px; }
.verdict .big { font-size: 20px; font-weight: 700; margin: 0 0 6px; }
.verdict.red .big { color: var(--red); }
.verdict.yellow .big { color: var(--yellow); }
.verdict.green .big { color: var(--green); }
h2.sec {
  font-size: 18px; margin: 28px 0 8px; padding-bottom: 6px;
  border-bottom: 2px dashed var(--line);
}
.hint { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.toc a {
  display: inline-block; margin: 3px 6px 3px 0; padding: 4px 10px;
  background: #fff; border: 1px solid var(--line); border-radius: 999px;
  text-decoration: none; color: var(--sky); font-size: 12px;
}
.table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; }
table.index {
  width: 100%; border-collapse: collapse; background: var(--card); font-size: 13px;
}
table.index th, table.index td {
  border-bottom: 1px solid var(--line); padding: 7px 8px; text-align: left; vertical-align: top;
}
table.index th {
  background: #f5f5f4; position: sticky; top: 0; font-size: 12px; color: var(--muted);
}
table.index tr:hover td { background: #f8fafc; }
table.index a { color: var(--sky); text-decoration: none; font-weight: 600; }
.pill {
  display: inline-block; font-size: 11px; border-radius: 999px;
  padding: 1px 8px; font-weight: 600;
}
.pill.red { background: #fee2e2; color: var(--red); }
.pill.yellow { background: #ffedd5; color: var(--yellow); }
.pill.green { background: #dcfce7; color: var(--green); }
.pill.kind { background: #e0f2fe; color: #0369a1; font-weight: 500; }
.pill.bad { background: #fce7f3; color: #9d174d; }
.card {
  background: var(--card); border: 1px solid var(--line); border-radius: 12px;
  padding: 14px 16px; margin: 0 0 12px; scroll-margin-top: 12px;
}
.card.red { border-left: 5px solid var(--red); }
.card.yellow { border-left: 5px solid var(--yellow); }
.card.green { border-left: 5px solid var(--green); }
.card h3 { margin: 0 0 8px; font-size: 16px; }
.kv { margin: 0 0 6px; font-size: 14px; }
.kv .k { color: var(--muted); font-size: 12px; margin-right: 6px; }
.pair-box {
  display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center;
  margin: 10px 0; padding: 10px; background: #f8fafc; border-radius: 10px;
  border: 1px dashed #cbd5e1;
}
@media (max-width: 640px) {
  .pair-box { grid-template-columns: 1fr; }
  .pair-box .arrow { transform: rotate(90deg); text-align: center; }
}
.side {
  background: #fff; border: 1px solid var(--line); border-radius: 8px;
  padding: 8px 10px; font-size: 13px; word-break: break-word;
}
.side .lab { font-size: 11px; color: var(--muted); display: block; margin-bottom: 2px; }
.arrow { font-weight: 700; color: var(--sky); text-align: center; }
.story {
  background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px;
  padding: 8px 10px; font-size: 13px; margin: 8px 0;
}
.metrics { font-size: 12px; color: var(--muted); }
.links a {
  display: inline-block; margin: 4px 8px 4px 0; padding: 7px 12px;
  background: #fff; border: 1px solid var(--line); border-radius: 999px;
  text-decoration: none; color: var(--sky); font-size: 13px;
}
.foot {
  margin-top: 32px; padding-top: 12px; border-top: 1px solid var(--line);
  font-size: 12px; color: var(--muted);
}
.filters { margin: 8px 0 12px; font-size: 13px; color: var(--muted); }
@media print {
  body { background: #fff; }
  .card, .banner, .verdict { break-inside: avoid; }
  table.index th { position: static; }
}
"""


def _esc(s: Any) -> str:
    return html.escape(_s(s))


def _render_index_rows(items: list[dict], *, only_insufficient: bool = False) -> str:
    rows: list[str] = []
    for it in items:
        if only_insufficient and it.get("location_sufficient"):
            continue
        if not only_insufficient and not it.get("location_sufficient"):
            continue
        light = _esc(it.get("light") or "green")
        sev = _esc(_sev_zh(str(it.get("severity") or "")))
        kind = _esc(it.get("kind_label") or "")
        a = _esc(it.get("side_a") or "—")
        b = _esc(it.get("side_b") or "—")
        rel = _esc(it.get("relation") or "")
        di = int(it.get("display_index") or 0)
        anchor = _esc(it.get("anchor") or f"case-{di}")
        pair_mark = "↔" if it.get("is_pair") else "·"
        loc_flag = "" if it.get("location_sufficient") else ' <span class="pill bad">定位不足</span>'
        rows.append(
            f"<tr>"
            f'<td><a href="#{anchor}">#{di}</a></td>'
            f'<td><span class="pill {light}">{sev}</span></td>'
            f'<td><span class="pill kind">{kind}</span>{loc_flag}</td>'
            f"<td>{a}</td>"
            f'<td style="text-align:center">{pair_mark}</td>'
            f"<td>{b}</td>"
            f"<td>{rel}</td>"
            f"</tr>"
        )
    if not rows:
        return '<tr><td colspan="7">（无）</td></tr>'
    return "\n".join(rows)


def _render_case_card(it: dict) -> str:
    light = _esc(it.get("light") or "green")
    sev = _esc(_sev_zh(str(it.get("severity") or "")))
    kind = _esc(it.get("kind_label") or "")
    di = int(it.get("display_index") or 0)
    anchor = _esc(it.get("anchor") or f"case-{di}")
    kind_anchor = _esc(it.get("kind_anchor") or "")
    rel = _esc(it.get("relation") or "")
    a = _esc(it.get("side_a") or "（未知）")
    b = it.get("side_b") or ""
    sheet = _esc(it.get("sheet") or "")
    metrics = " · ".join(_esc(m) for m in (it.get("metrics") or []))
    fid = _esc(it.get("finding_id") or "")
    det = _esc(it.get("detector") or "")
    loc_raw = _esc(it.get("location_raw") or "")
    obs = _esc(it.get("observation") or "")
    nxt = _esc(it.get("what_to_check") or "")
    story = _esc(it.get("llm_verdict") or "")
    title = _esc(it.get("title") or rel)

    pair_html = f"""
    <div class="pair-box">
      <div class="side"><span class="lab">A 侧（组 / 图）</span>{a}</div>
      <div class="arrow">{"↔" if b else "·"}</div>
      <div class="side"><span class="lab">B 侧（组 / 图）</span>{_esc(b) if b else "（单侧信号）"}</div>
    </div>
    """
    story_html = (
        f'<div class="story"><span class="k">电脑补充说明</span><br/>{story}</div>'
        if story
        else ""
    )
    sheet_html = (
        f'<p class="kv"><span class="k">工作表/来源块</span>{sheet}</p>' if sheet else ""
    )
    met_html = (
        f'<p class="metrics">指标：{metrics}</p>' if metrics else ""
    )
    bits = it.get("evidence_bits") or []
    bits_html = ""
    if bits:
        lis = "".join(f"<li>{_esc(b)}</li>" for b in bits)
        bits_html = (
            f'<div class="story" style="background:#fff7ed;border-color:#fdba74">'
            f"<span class=\"k\">证据摘要</span><ul style=\"margin:6px 0 0;padding-left:1.2em\">{lis}</ul>"
            f"</div>"
        )
    insuff = (
        ""
        if it.get("location_sufficient")
        else '<span class="pill bad">定位不足 · 需结合 raw/原文件</span> '
    )
    # Kind section head (stable target for plain report deep-links)
    kind_head = ""
    if it.get("is_kind_head") and kind_anchor:
        kind_head = (
            f'<h3 id="{kind_anchor}" style="margin-top:28px;border-bottom:1px solid #e5e7eb;'
            f'padding-bottom:4px">{kind}</h3>\n'
            f'<p class="hint" style="margin-top:0">类型锚点：'
            f'<code>#{kind_anchor}</code> · '
            f'<a href="investigation_plain.html">返回简明报告</a></p>\n'
        )

    return f"""
    {kind_head}
    <article class="card {light}" id="{anchor}">
      <h3>#{di} {insuff}<span class="pill {light}">{sev}</span>
        <span class="pill kind">{kind}</span> {rel}</h3>
      <p class="kv"><span class="k">观察（非指控）</span>{obs}</p>
      {pair_html}
      {sheet_html}
      <p class="kv"><span class="k">建议核对</span>{nxt}</p>
      {bits_html}
      {story_html}
      {met_html}
      <p class="metrics">技术标题：{title} · 检测器：{det} · id：{fid}</p>
      <p class="metrics">原始 location：{loc_raw}</p>
    </article>
    """


def build_investigation_pairs_html(payload: dict) -> str:
    zh = str(payload.get("language") or "zh").startswith("zh")
    c = payload.get("counts") or {}
    overall = payload.get("overall") or "yellow"
    items: list[dict] = list(payload.get("items") or [])
    title = "配对定位调查报告" if zh else "Pairs Localization Report"
    source = payload.get("source_name") or ""

    disclaimer = (
        "⚠️ <b>重要：</b>本页列出电脑自动发现的「组↔组 / 图对」与定位线索，"
        "用语是<strong>观察</strong>而非<strong>指控</strong>。"
        "不能单独作为学术不端认定依据；请用原始表格与原图人工核实。"
    ) if zh else (
        "⚠️ Automated pair/localization hints only — not a misconduct verdict."
    )

    # kind + fig toc
    by_kind = (payload.get("counts") or {}).get("by_kind") or {}
    kind_links = []
    for kind, n in sorted(by_kind.items(), key=lambda x: -x[1]):
        lab = _KIND_BUCKET.get(kind, kind)
        kind_links.append(
            f'<a href="#kind-{_esc(kind)}">{_esc(lab)} ×{int(n)}</a>'
        )
    fig_groups = payload.get("fig_groups") or {}
    toc_links = []
    for fig, anchors in list(fig_groups.items())[:24]:
        if anchors:
            toc_links.append(
                f'<a href="#{_esc(anchors[0])}">{_esc(fig)} ×{len(anchors)}</a>'
            )
    toc_html = ""
    if kind_links or toc_links:
        toc_html = '<div class="toc">'
        if kind_links:
            toc_html += (
                '<div style="margin-bottom:6px"><b>按类型：</b>'
                + "".join(kind_links)
                + "</div>"
            )
        if toc_links:
            toc_html += (
                '<div><b>按图/表：</b>' + "".join(toc_links) + "</div>"
            )
        toc_html += "</div>"

    index_ok = _render_index_rows(items, only_insufficient=False)
    index_bad = _render_index_rows(items, only_insufficient=True)

    # cards: all, but sectioned — kind section heads only on first
    # *located* card of each kind so plain deep-links land in the main list.
    def _with_kind_heads(seq: list[dict], *, reset: bool = True) -> list[dict]:
        seen: set[str] = set()
        out_seq: list[dict] = []
        for it in seq:
            it2 = dict(it)
            k = str(it.get("kind") or "other")
            if k not in seen:
                it2["is_kind_head"] = True
                seen.add(k)
            else:
                it2["is_kind_head"] = False
            out_seq.append(it2)
        return out_seq

    ok_items = _with_kind_heads(
        [it for it in items if it.get("location_sufficient")]
    )
    bad_items = [
        {**it, "is_kind_head": False}
        for it in items
        if not it.get("location_sufficient")
    ]
    ok_cards = "".join(_render_case_card(it) for it in ok_items)
    bad_cards = "".join(_render_case_card(it) for it in bad_items)
    if not ok_cards:
        ok_cards = '<p class="hint">暂无已严格定位的个案。</p>'
    if not bad_cards:
        bad_cards = '<p class="hint">没有定位不足的条目。</p>'

    by_kind = c.get("by_kind") or {}
    kind_bits = " · ".join(
        f"{_KIND_BUCKET.get(k, k)} {v}" for k, v in sorted(by_kind.items(), key=lambda x: -x[1])
    )

    # P1.1: aggregated issues block (view only; findings list unchanged).
    issues: list[dict] = list(payload.get("issues") or [])
    issues_html = ""
    if issues:
        rows = "".join(
            "<tr>"
            f'<td><span class="pill {_esc(_light(str(i.get("severity") or "")))}">'
            f'{_esc(_sev_zh(str(i.get("severity") or "")))}</span></td>'
            f"<td>{_esc(str(i.get('kind') or ''))}</td>"
            f"<td>{_esc(str(i.get('title') or ''))}</td>"
            f"<td>{_esc(', '.join(i.get('detectors') or []))}</td>"
            f"<td>{int(i.get('member_count') or 0)}</td>"
            "</tr>"
            for i in issues
        )
        issues_html = f"""
    <h2 class="sec">Issues 聚合视图（{len(issues)}）</h2>
    <p class="hint">同一证据对象（图 / 表 / 检测器族）的多通道命中合并为一条 issue；仅视图聚合，findings 明细不变。</p>
    <div class="table-wrap">
      <table class="index">
        <thead>
          <tr><th>严重度</th><th>类别</th><th>摘要</th><th>检测器</th><th>成员数</th></tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
"""

    # P6.3: group findings by pubpeer_pattern taxonomy tags
    pattern_rows = payload.get("pubpeer_pattern_groups") or []
    pattern_html = ""
    if pattern_rows:
        prow = "".join(
            "<tr>"
            f"<td>{_esc(str(g.get('pattern') or ''))}</td>"
            f"<td>{int(g.get('count') or 0)}</td>"
            f'<td><span class="pill {_esc(_light(str(g.get("max_severity") or "")))}">'
            f'{_esc(_sev_zh(str(g.get("max_severity") or "")))}</span></td>'
            f"<td>{_esc(str(g.get('sample_title') or '')[:120])}</td>"
            "</tr>"
            for g in pattern_rows
        )
        pattern_html = f"""
    <h2 class="sec">PubPeer 模式分组（{len(pattern_rows)}）</h2>
    <p class="hint">按 finding.raw.pubpeer_pattern 聚类（如 Source Data 块粘贴、跨论文图复用）；便于对照 100 条手法清单。</p>
    <div class="table-wrap">
      <table class="index">
        <thead>
          <tr><th>模式</th><th>条数</th><th>最高严重度</th><th>样例</th></tr>
        </thead>
        <tbody>{prow}</tbody>
      </table>
    </div>
"""

    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>{_esc(title)}</title>
  <style>{_CSS}</style>
</head>
<body>
  <div class="page">
    <header class="banner">
      <div class="tag">主入口 · 配对与严格定位 · investigation_pairs</div>
      <h1>{_esc(title)}</h1>
      <div class="sub">
        编号: <code>{_esc(payload.get("trace_id"))}</code>
        · {_esc(str(payload.get("generated_at") or "")[:19])}
        {(" · " + _esc(source)) if source else ""}
        · LLM calls: {_esc(payload.get("llm_calls"))}
      </div>
      <div class="warn">{disclaimer}</div>
    </header>

    <div class="stats" aria-label="counts">
      <div class="stat red"><b>{int(c.get("high") or 0)}</b><span>高</span></div>
      <div class="stat yellow"><b>{int(c.get("medium") or 0)}</b><span>中</span></div>
      <div class="stat green"><b>{int(c.get("low") or 0) + int(c.get("info") or 0)}</b><span>低/提示</span></div>
      <div class="stat"><b>{int(c.get("pairs") or 0)}</b><span>双侧配对</span></div>
      <div class="stat"><b>{int(c.get("total") or 0)}</b><span>全部（含全部严重度）</span></div>
    </div>

    <section class="verdict { _esc(overall) }">
      <h2>1. 总览</h2>
      <p class="big">{_esc(payload.get("overall_label"))}</p>
      <p>{_esc(payload.get("overall_tip"))}</p>
      <p class="hint">分类：{_esc(kind_bits)} · 定位不足：{int(c.get("location_insufficient") or 0)} 条</p>
    </section>

    <h2 class="sec">2. 怎么读这一页</h2>
    <div class="hint">
      <ol style="margin:6px 0 0;padding-left:1.3em">
        <li>先看索引总表：严重度、A/B 两侧、关系类型。</li>
        <li>点序号跳到个案卡片：观察说明 + 建议核对动作。</li>
        <li>表格组↔组 / 跨表 / 图像对优先；定位不足条目在文末单独区。</li>
        <li>需要白话总览可看 <a href="investigation_plain.html">investigation_plain.html</a>；技术细节看 report.html。</li>
      </ol>
    </div>
    {f'<p class="hint">按图/表快速跳转：</p>{toc_html}' if toc_html else ""}

    <h2 class="sec">3. 索引总表（已定位）</h2>
    <p class="hint">全部严重度；按严重度与是否配对排序。点击 # 跳转个案。</p>
    <div class="table-wrap">
      <table class="index">
        <thead>
          <tr>
            <th>#</th><th>严重度</th><th>类型</th>
            <th>A 侧（组/图）</th><th></th><th>B 侧（组/图）</th><th>关系</th>
          </tr>
        </thead>
        <tbody>
          {index_ok}
        </tbody>
      </table>
    </div>

    <h2 class="sec">4. 个案卡片（已定位）</h2>
    <p class="hint">每条含：观察、A↔B、建议核对、可选 LLM 说明。非法律结论。</p>
    {ok_cards}

    <h2 class="sec">5. 定位不足（需补查）</h2>
    <p class="hint">严格模式下无法给出可靠 Fig/列/页图定位的条目；仍列出供技术排查。</p>
    <div class="table-wrap">
      <table class="index">
        <thead>
          <tr>
            <th>#</th><th>严重度</th><th>类型</th>
            <th>A 侧</th><th></th><th>B 侧</th><th>关系</th>
          </tr>
        </thead>
        <tbody>
          {index_bad}
        </tbody>
      </table>
    </div>
    {bad_cards}
    {issues_html}
    {pattern_html}

    <h2 class="sec">6. 其它报告</h2>
    <div class="links">
      <a href="investigation_plain.html">简明初筛报告</a>
      <a href="llm_briefing.html">审阅简报</a>
      <a href="llm_report.html">LLM 完整列表</a>
      <a href="report.html">技术检测报告</a>
      <a href="findings.json">findings.json</a>
      <a href="investigation_pairs.json">本报告 JSON</a>
    </div>

    <footer class="foot">
      ManuSift · investigation_pairs.html · 主入口 · 观察报告 · 非最终结论
    </footer>
  </div>
</body>
</html>
"""


def build_investigation_pairs_markdown(payload: dict) -> str:
    c = payload.get("counts") or {}
    items: list[dict] = list(payload.get("items") or [])
    lines = [
        "# 配对定位调查报告（investigation_pairs）",
        "",
        f"- 编号: `{payload.get('trace_id')}`",
        f"- 生成: {str(payload.get('generated_at') or '')[:19]}",
        f"- 全部: {c.get('total')} · 高 {c.get('high')} · 中 {c.get('medium')} · 低/提示 {int(c.get('low') or 0)+int(c.get('info') or 0)}",
        f"- 双侧配对: {c.get('pairs')} · 定位不足: {c.get('location_insufficient')}",
        "",
        f"**总览：** {payload.get('overall_label')}",
    ]
    # continue building after optional pattern section
    _pattern_md_lines: list[str] = []
    groups = payload.get("pubpeer_pattern_groups") or []
    if groups:
        _pattern_md_lines.extend(
            [
                "",
                "## PubPeer 模式分组",
                "",
                "| 模式 | 条数 | 最高严重度 | 样例 |",
                "|------|------|------------|------|",
            ]
        )
        for g in groups:
            _pattern_md_lines.append(
                f"| {g.get('pattern')} | {g.get('count')} | "
                f"{g.get('max_severity')} | "
                f"{str(g.get('sample_title') or '')[:80]} |"
            )
    lines = lines + _pattern_md_lines + [
        "",
        f"{payload.get('overall_tip')}",
        "",
        "> 本报告为计算机观察提示，不是学术不端认定。",
        "",
        "## 索引总表",
        "",
        "| # | 严重度 | 类型 | A 侧 | B 侧 | 关系 | 定位 |",
        "|---|--------|------|------|------|------|------|",
    ]
    for it in items:
        lines.append(
            "| {di} | {sev} | {kind} | {a} | {b} | {rel} | {ok} |".format(
                di=it.get("display_index"),
                sev=_sev_zh(str(it.get("severity") or "")),
                kind=it.get("kind_label") or "",
                a=(it.get("side_a") or "—").replace("|", "/"),
                b=(it.get("side_b") or "—").replace("|", "/"),
                rel=(it.get("relation") or "").replace("|", "/"),
                ok="OK" if it.get("location_sufficient") else "不足",
            )
        )
    lines += ["", "## 个案", ""]
    for it in items:
        lines.append(
            f"### #{it.get('display_index')} [{_sev_zh(str(it.get('severity')))}] "
            f"{it.get('relation')}"
        )
        lines.append("")
        lines.append(f"- **类型**: {it.get('kind_label')}")
        lines.append(f"- **A**: {it.get('side_a') or '—'}")
        lines.append(f"- **B**: {it.get('side_b') or '—'}")
        if it.get("sheet"):
            lines.append(f"- **来源块**: {it.get('sheet')}")
        lines.append(f"- **观察**: {it.get('observation')}")
        lines.append(f"- **建议核对**: {it.get('what_to_check')}")
        if it.get("llm_verdict"):
            lines.append(f"- **电脑说明**: {it.get('llm_verdict')}")
        if it.get("metrics"):
            lines.append(f"- **指标**: {', '.join(it.get('metrics') or [])}")
        lines.append(
            f"- id: `{it.get('finding_id')}` · detector: `{it.get('detector')}`"
        )
        lines.append("")
    lines += [
        "## 其它报告",
        "",
        "- [白话版](investigation_plain.html)",
        "- [审阅简报](llm_briefing.html)",
        "- [技术报告](report.html)",
        "",
    ]
    return "\n".join(lines) + "\n"


def write_investigation_pairs(
    *,
    root_dir: str | Path,
    trace_id: str,
    findings: list[Finding],
    llm_calls: int = 0,
    language: str = "zh",
    source_name: str = "",
) -> dict[str, str]:
    root = Path(root_dir)
    root.mkdir(parents=True, exist_ok=True)
    payload = build_investigation_pairs_payload(
        trace_id=trace_id,
        findings=findings,
        llm_calls=llm_calls,
        language=language,
        source_name=source_name,
    )
    paths = {
        "pairs_html": root / "investigation_pairs.html",
        "pairs_md": root / "investigation_pairs.md",
        "pairs_json": root / "investigation_pairs.json",
    }
    paths["pairs_json"].write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    paths["pairs_html"].write_text(
        build_investigation_pairs_html(payload), encoding="utf-8"
    )
    paths["pairs_md"].write_text(
        build_investigation_pairs_markdown(payload), encoding="utf-8"
    )
    return {k: str(v.resolve()) for k, v in paths.items()}


def findings_from_json(path: str | Path) -> tuple[str, list[Finding], int]:
    """Load findings.json → (trace_id, findings, llm_calls)."""
    import uuid

    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(data, list):
        raw_items = data
        trace_id = ""
        llm_calls = 0
    else:
        raw_items = data.get("findings") or []
        trace_id = str(data.get("trace_id") or "")
        llm_calls = int(data.get("llm_calls") or 0)
    findings: list[Finding] = []
    for it in raw_items:
        if not isinstance(it, dict):
            continue
        sev = str(it.get("severity") or "info")
        if sev not in ("info", "low", "medium", "high"):
            sev = "info"
        fid = str(it.get("finding_id") or "").strip() or uuid.uuid4().hex[:10]
        f = Finding(
            finding_id=fid,
            trace_id=str(it.get("trace_id") or trace_id or ""),
            detector=str(it.get("detector") or "unknown"),
            severity=sev,  # type: ignore[arg-type]
            title=str(it.get("title") or ""),
            evidence=str(it.get("evidence") or ""),
            location=str(it.get("location") or ""),
            raw=it.get("raw") if isinstance(it.get("raw"), dict) else {},
            llm_verdict=it.get("llm_verdict"),
            llm_skipped=bool(it.get("llm_skipped")),
        )
        findings.append(f)
        if not trace_id and f.trace_id:
            trace_id = f.trace_id
    return trace_id, findings, llm_calls
