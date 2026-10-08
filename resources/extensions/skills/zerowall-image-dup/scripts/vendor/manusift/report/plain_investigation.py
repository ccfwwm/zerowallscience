"""简明诚信初筛报告 — formal plain-language investigation report.

Audience: editors, PIs, reviewers, and non-specialist readers who need a
clear formal summary (not a kid-friendly explainer). Layout and CSS match
``report.zh.html`` / narrative report:

  * 执行摘要
  * 任务信息
  * 诊断面板
  * 关键发现
  * 分类发现
  * 建议下一步
  * 相关材料
  * 免责声明

Outputs:
  * ``investigation_plain.html``  (secondary human entry; pairs is primary)
  * ``investigation_plain.md``
  * ``investigation_plain.json``
"""
from __future__ import annotations

import html
import json
import re
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from ..contracts import Finding

SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2, "info": 3}

_ROOM_TABLE = ("table_", "stat_", "figure_grim", "figure_stat", "figure_table")
_ROOM_IMAGE = ("image_", "panel_", "page_raster", "ai_generated")
_ROOM_TEXT = ("text_", "ref_", "tortured", "citation", "compliance")

_ROOM_LABEL = {
    "numbers": "数值与表格",
    "pictures": "图像与面板",
    "words": "文本与合规",
    "other": "元数据与其它",
}

# Same stylesheet family as manusift.report.narrative / report.zh.html
_CSS = """
:root { color-scheme: light dark; }
body { font: 14px/1.6 system-ui, -apple-system, "Segoe UI",
       "PingFang SC", "Microsoft YaHei",
       "Noto Sans CJK SC", "Source Han Sans SC",
       "Hiragino Sans", "Yu Gothic", "Meiryo",
       sans-serif;
       max-width: 820px; margin: 24px auto; padding: 0 18px;
       color: #1f2937; }
@media print {
  body { font: 11pt/1.45 Georgia, "Times New Roman",
         "PingFang SC", "Microsoft YaHei",
         "Noto Sans CJK SC", serif;
         max-width: none; margin: 0; padding: 0; }
  h1, h2, h3 { page-break-after: avoid; }
  pre, table, .callout { page-break-inside: avoid; }
}
h1 { font-size: 26px; margin-bottom: 6px;
     border-bottom: 2px solid #d1d5db; padding-bottom: 8px; }
h2 { font-size: 20px; margin-top: 32px;
     border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
h3 { font-size: 16px; margin-top: 20px; color: #1f2937; }
.meta { color: #6b7280; font-size: 12px;
        margin-bottom: 28px; line-height: 1.5; }
.meta strong { color: #374151; }
p { margin: 12px 0; }
ul, ol { margin: 8px 0 14px 24px; padding: 0; }
li { margin: 4px 0; }
code { background: #f3f4f6; padding: 1px 6px;
       border-radius: 4px; font-family: ui-monospace,
       SFMono-Regular, Menlo, monospace; font-size: 13px; }
pre { background: #f9fafb; border: 1px solid #e5e7eb;
      padding: 12px 14px; border-radius: 6px;
      overflow-x: auto; font-size: 12.5px; line-height: 1.5; }
pre code { background: transparent; padding: 0; font-size: inherit; }
blockquote { margin: 12px 0; padding: 8px 16px;
             border-left: 3px solid #d1d5db;
             color: #4b5563; background: #f9fafb; }
hr { border: none; border-top: 1px solid #e5e7eb;
     margin: 28px 0; }
table { border-collapse: collapse; margin: 12px 0;
        width: 100%; font-size: 13px; }
th, td { border: 1px solid #e5e7eb; padding: 6px 10px;
        text-align: left; }
th { background: #f9fafb; font-weight: 600; }
.callout { background: #eff6ff; border: 1px solid #93c5fd;
           border-left: 6px solid #2563eb;
           padding: 10px 14px; margin: 14px 0;
           border-radius: 6px; font-size: 13px; }
.callout.warn { background: #fef3c7; border-color: #fcd34d;
                border-left-color: #d97706; }
.callout.note { background: #f0fdf4; border-color: #86efac;
                border-left-color: #16a34a; }
strong { font-weight: 600; }
a { color: #2563eb; text-decoration: none; }
a:hover { text-decoration: underline; }
.verdict-low    { color: #16a34a; font-weight: 600; }
.verdict-medium { color: #d97706; font-weight: 600; }
.verdict-high   { color: #dc2626; font-weight: 600; }
"""


def _room_of(detector: str) -> str:
    d = (detector or "").lower()
    if any(d.startswith(p) or p in d for p in _ROOM_TABLE):
        return "numbers"
    if any(d.startswith(p) or p in d for p in _ROOM_IMAGE):
        return "pictures"
    if any(d.startswith(p) or p in d for p in _ROOM_TEXT):
        return "words"
    return "other"


def _light(sev: str) -> str:
    if sev == "high":
        return "red"
    if sev == "medium":
        return "yellow"
    return "green"


def _verdict_class(sev_or_light: str) -> str:
    s = (sev_or_light or "").lower()
    if s in ("high", "red"):
        return "verdict-high"
    if s in ("medium", "yellow"):
        return "verdict-medium"
    return "verdict-low"


def _verdict_label(sev_or_light: str, zh: bool = True) -> str:
    s = (sev_or_light or "").lower()
    if zh:
        if s in ("high", "red"):
            return "高关注"
        if s in ("medium", "yellow"):
            return "中关注"
        return "低关注"
    if s in ("high", "red"):
        return "High concern"
    if s in ("medium", "yellow"):
        return "Medium concern"
    return "Low concern"


def _plain_title(title: str, detector: str, raw: dict[str, Any]) -> str:
    """Map technical titles to concise formal Chinese summaries."""
    t = (title or "").strip()
    check = str(raw.get("check") or raw.get("kind") or "").lower()
    det = (detector or "").lower()

    rules: list[tuple[str, str]] = [
        ("cross_table_fixed_offset", "跨表固定差值关系"),
        ("cross-table fixed offset", "跨表固定差值关系"),
        ("cross_table_repeated", "跨表重复数值"),
        ("cross-table repeated", "跨表重复数值"),
        ("cross_table_matching_decimal", "跨表小数尾部一致"),
        ("fixed_offset", "列间固定差值"),
        ("fixed offset", "列间固定差值"),
        ("high_duplicate_rate", "列间高重复率"),
        ("duplicate rate", "列间高重复率"),
        ("improbable_repeated", "列内异常高重复"),
        ("repeated values", "列内异常高重复"),
        ("arithmetic_progression", "近似等差数列结构"),
        ("arithmetic progression", "近似等差数列结构"),
        ("near_perfect_arithmetic", "近乎完美等差数列"),
        ("terminal_digit", "末位数字分布异常集中"),
        ("terminal digit", "末位数字分布异常集中"),
        ("mirror_symmetry", "列间镜像对称"),
        ("mirror", "列间镜像对称"),
        ("zero_variance", "列方差为零（数值恒定）"),
        ("zero variance", "列方差为零（数值恒定）"),
        ("standard deviation", "标准差/误差项异常"),
        ("benford", "首位数字分布偏离 Benford 律"),
        ("copy_move", "图内复制–移动嫌疑区域"),
        ("copy-move", "图内复制–移动嫌疑区域"),
        ("cross_image_sift", "跨图局部特征匹配"),
        ("cross-image", "跨图局部高度相似"),
        ("panel_sift_match", "拼板面板局部匹配"),
        ("panel", "多面板近重复"),
        ("near_texture_overlap", "近纹理重叠"),
        ("texture", "纹理/条带疑似复用"),
        ("ela", "JPEG 误差级分析异常"),
        ("jpeg_ghost", "JPEG 二次压缩（鬼影）痕迹"),
        ("jpeg ghost", "JPEG 二次压缩（鬼影）痕迹"),
        ("highlight", "表格高亮单元格标记"),
        ("full_image", "整图文件级重复使用"),
        ("duplicate row", "表格完全重复行"),
        ("ocr recovered", "从图区域 OCR 恢复出类表格数字网格"),
        ("ocr figure", "图内 OCR 表格信号"),
        ("absent from companion", "图/表数字与 Source Data 不一致"),
        ("absent from Source Data", "PDF 数字在 Source Data 中缺失"),
        ("Source Data contains many", "Source Data 含 PDF 未出现的数字"),
        ("source_data", "PDF 与 Source Data 交叉核对"),
    ]
    blob = f"{t} {check} {det}".lower().replace("-", "_")
    for key, formal in rules:
        if key.replace("-", "_") in blob or key in f"{t} {check} {det}".lower():
            return formal
    t2 = re.sub(r"\b(detector|sift|ransac|hamming|phash|ela)\b", "", t, flags=re.I)
    t2 = re.sub(r"\s+", " ", t2).strip()
    return t2[:80] if t2 else "需人工复核的异常信号"


def _plain_why(light: str, room: str) -> str:
    if light == "red":
        if room == "numbers":
            return (
                "真实实验测量值极少呈现完全固定差值、跨表完全复用或零方差等模式；"
                "该信号优先提示应对原始记录与 Source Data 进行核对。"
            )
        if room == "pictures":
            return (
                "不同实验条件的图像若呈现高度一致的局部或整图复用，"
                "可能对应重复使用、错误标注或拼接操作，需对照未压缩原图人工确认。"
            )
        return "该信号严重度较高，建议尽快结合原始材料人工复核。"
    if light == "yellow":
        return (
            "中等关注信号并不等同于学术不端，但足以支持打开原文件进行排除性核查，"
            "以区分系统性模式与误报。"
        )
    return "当前信号优先级较低，可在完成高/中关注条目后再抽查。"


# ---------------------------------------------------------------------------
# Location parsing / summarization (avoid wall-of-table-names)
# ---------------------------------------------------------------------------

_LOC_TO_RE = re.compile(
    r"^\s*(.+?),\s*column\s+(\d+)\s+to\s+(.+?),\s*column\s+(\d+)\s*$",
    re.I,
)
_LOC_COLS_AND_RE = re.compile(
    r"^\s*(.+?),\s*columns?\s+(\d+)\s+and\s+(\d+)\s*$",
    re.I,
)
_LOC_COLS_LIST_RE = re.compile(
    r"^\s*(.+?),\s*columns?\s+([\d,\s]+)\s*$",
    re.I,
)
_LOC_COL_ONE_RE = re.compile(
    r"^\s*(.+?),\s*column\s+(\d+)(?:\s*\((?:'([^']*)')?\))?\s*$",
    re.I,
)
_LOC_PAGE_ARROW_RE = re.compile(
    r"^\s*(Page\s+\d+\s*/\s*image\s+\d+)\s*->\s*(Page\s+\d+\s*/\s*image\s+\d+)\s*$",
    re.I,
)
_IN_BLOCK_RE = re.compile(r"\s+in\s+(.+)$", re.I)


def _short_host(label: str) -> tuple[str, str]:
    """``Fig.S1a in Sfig.2`` → (``Fig.S1a``, ``Sfig.2``)."""
    lab = re.sub(r"\s+", " ", (label or "").strip())
    if not lab:
        return "", ""
    m = _IN_BLOCK_RE.search(lab)
    if m:
        block = m.group(1).strip().rstrip(",")
        head = lab[: m.start()].strip()
        return head or lab, block
    return lab, ""


def _fmt_host(name: str, block: str = "") -> str:
    name = (name or "").strip()
    block = (block or "").strip()
    if name and block and block.lower() not in name.lower():
        return f"{name}（{block}）"
    return name or block or "—"


def _parse_location(loc: str, raw: dict[str, Any] | None = None) -> dict[str, Any]:
    """Parse finding location into structured A/B sides."""
    raw = raw if isinstance(raw, dict) else {}
    loc = re.sub(r"\s+", " ", (loc or "").strip())

    left_t = str(raw.get("left_table") or "").strip()
    right_t = str(raw.get("right_table") or "").strip()
    left_c = str(raw.get("left_column") or "").strip()
    right_c = str(raw.get("right_column") or "").strip()
    col = str(raw.get("column") or "").strip()

    if left_t or right_t:
        ha, ba = _short_host(left_t)
        hb, bb = _short_host(right_t)
        side_a = _fmt_host(ha, ba) if (ha or ba) else "—"
        side_b = _fmt_host(hb, bb) if (hb or bb) else "—"
        if not left_c or not right_c:
            m_to = _LOC_TO_RE.match(loc)
            if m_to:
                left_c = left_c or m_to.group(2)
                right_c = right_c or m_to.group(4)
        if left_c or right_c:
            display = (
                f"{side_a} · {left_c or '?'}  ↔  {side_b} · {right_c or '?'}"
            )
        else:
            display = f"{side_a}  ↔  {side_b}"
        return {
            "kind": "pair",
            "side_a": side_a,
            "side_b": side_b,
            "col_a": left_c,
            "col_b": right_c,
            "group_key": f"{side_a}||{side_b}",
            "display_short": display,
            "raw": loc,
        }

    if left_c and right_c:
        host, block = _short_host(loc.split(",")[0] if loc else "")
        side = _fmt_host(host, block) if host else "同表"
        return {
            "kind": "pair",
            "side_a": side,
            "side_b": side,
            "col_a": left_c,
            "col_b": right_c,
            "group_key": f"{side}||{side}",
            "display_short": f"{side}：{left_c} ↔ {right_c}",
            "raw": loc,
        }

    m = _LOC_TO_RE.match(loc)
    if m:
        ha, ba = _short_host(m.group(1))
        hb, bb = _short_host(m.group(3))
        ca, cb = m.group(2), m.group(4)
        side_a, side_b = _fmt_host(ha, ba), _fmt_host(hb, bb)
        return {
            "kind": "pair",
            "side_a": side_a,
            "side_b": side_b,
            "col_a": ca,
            "col_b": cb,
            "group_key": f"{side_a}||{side_b}",
            "display_short": f"{side_a} · col{ca}  ↔  {side_b} · col{cb}",
            "raw": loc,
        }

    m = _LOC_PAGE_ARROW_RE.match(loc)
    if m:
        a, b = m.group(1).strip(), m.group(2).strip()
        return {
            "kind": "pair",
            "side_a": a,
            "side_b": b,
            "col_a": "",
            "col_b": "",
            "group_key": f"{a}||{b}",
            "display_short": f"{a}  ↔  {b}",
            "raw": loc,
        }

    m = _LOC_COLS_AND_RE.match(loc)
    if m:
        host, block = _short_host(m.group(1))
        side = _fmt_host(host, block)
        ca, cb = m.group(2), m.group(3)
        return {
            "kind": "pair",
            "side_a": side,
            "side_b": side,
            "col_a": ca,
            "col_b": cb,
            "group_key": f"{side}||{side}",
            "display_short": f"{side}：col{ca} ↔ col{cb}",
            "raw": loc,
        }

    m = _LOC_COLS_LIST_RE.match(loc)
    if m:
        host, block = _short_host(m.group(1))
        side = _fmt_host(host, block)
        cols = re.findall(r"\d+", m.group(2))
        return {
            "kind": "multi_col",
            "side_a": side,
            "side_b": "",
            "col_a": ",".join(cols),
            "col_b": "",
            "group_key": f"{side}||",
            "display_short": f"{side} · 列 {', '.join(cols)}",
            "raw": loc,
        }

    m = _LOC_COL_ONE_RE.match(loc)
    if m:
        host, block = _short_host(m.group(1))
        side = _fmt_host(host, block)
        cname = (m.group(3) or col or "").strip()
        col_n = m.group(2)
        label = f"col{col_n}" + (f"「{cname}」" if cname else "")
        return {
            "kind": "single",
            "side_a": side,
            "side_b": "",
            "col_a": cname or col_n,
            "col_b": "",
            "group_key": f"{side}||",
            "display_short": f"{side} · {label}",
            "raw": loc,
        }

    if col:
        host, block = _short_host(loc.split(",")[0] if loc else "")
        side = _fmt_host(host, block) if host else ""
        return {
            "kind": "single",
            "side_a": side or "—",
            "side_b": "",
            "col_a": col,
            "col_b": "",
            "group_key": f"{side}||",
            "display_short": f"{side} · 「{col}」" if side else f"列「{col}」",
            "raw": loc,
        }

    if loc:
        if re.match(r"^[A-Za-z]:\\|/", loc) or loc.lower() in ("pdf", "text"):
            return {
                "kind": "weak",
                "side_a": "（定位不足）",
                "side_b": "",
                "col_a": "",
                "col_b": "",
                "group_key": "||",
                "display_short": "（定位不足）",
                "raw": loc,
            }
        ha, ba = _short_host(loc)
        side = _fmt_host(ha, ba)
        return {
            "kind": "single",
            "side_a": side,
            "side_b": "",
            "col_a": "",
            "col_b": "",
            "group_key": f"{side}||",
            "display_short": side,
            "raw": loc,
        }

    return {
        "kind": "weak",
        "side_a": "—",
        "side_b": "",
        "col_a": "",
        "col_b": "",
        "group_key": "||",
        "display_short": "—",
        "raw": loc,
    }


def _clean_story(story: str, location: str = "") -> str:
    """Strip redundant ``At <long location>,`` prefixes from LLM text."""
    s = (story or "").strip()
    if not s:
        return s
    # Exact location prefix (common LLM template)
    if location:
        loc = location.strip()
        for prefix in (f"At {loc}, ", f"At {loc},", f"at {loc}, ", f"在 {loc}，", f"在{loc}，"):
            if s.startswith(prefix):
                s = s[len(prefix) :].lstrip()
                break
        if loc in s and len(loc) > 12:
            s = s.replace(loc, "该配对")
    # Structured English lead-ins (dots in Fig.S1a break naive [^.])
    patterns = (
        r"^At\s+.+?,\s*column\s+\d+\s+to\s+.+?,\s*column\s+\d+,\s*",
        r"^At\s+.+?,\s*columns?\s+\d+\s+and\s+\d+,\s*",
        r"^At\s+.+?,\s*columns?\s+[\d,\s]+,\s*",
        r"^At\s+.+?,\s*column\s+\d+(?:\s*\([^)]*\))?,\s*",
        r"^At\s+(?:Page|页)\s+\d+[^\n,]{0,80},\s*",
    )
    for pat in patterns:
        s2 = re.sub(pat, "", s, count=1, flags=re.I | re.S)
        if s2 != s:
            s = s2
            break
    # If still starts with leftover "column N to ...", drop until narrative verb
    s = re.sub(
        r"^(?:column\s+\d+\s+to\s+.+?,\s*column\s+\d+,\s*)",
        "",
        s,
        count=1,
        flags=re.I,
    )
    # Soft-translate frequent English templates for zh readability
    replacements = (
        (
            r"^values are repeated at an improbable rate\s*\(n=(\d+)\)\.\s*"
            r"Review whether rows/columns were copied or relabelled\.?",
            r"数值以不合理高频率重复（n=\1）。请核查行/列是否被复制或重新标注。",
        ),
        (
            r"^'([^']+)'\s+vs\s+'([^']+)'\s+show a fixed numeric offset of\s+([-\d.]+)\s+"
            r"across n=(\d+) rows\.\s*Perfect constant offsets are uncommon in independent experiments\.?",
            r"「\1」与「\2」在 n=\4 行上呈固定差值 \3。独立实验中完美恒定差值并不常见。",
        ),
        (
            r"^show a fixed numeric offset of\s+([-\d.]+)\s+across n=(\d+) rows\.?",
            r"在 n=\2 行上呈固定差值 \1。",
        ),
    )
    for pat, rep in replacements:
        s2 = re.sub(pat, rep, s, count=1, flags=re.I)
        if s2 != s:
            s = s2
            break
    s = re.sub(r"\s+", " ", s).strip()
    return s[:420]


def _headline_for_pairs(
    top_hosts: list[str], total_count: int, n_groups: int
) -> str:
    if not top_hosts:
        return f"共 {total_count} 条同类信号。"
    if len(top_hosts) <= 4:
        host_s = "、".join(top_hosts)
    else:
        host_s = "、".join(top_hosts[:4]) + f" 等 {len(top_hosts)} 个组/表"
    return (
        f"共 {total_count} 条同类信号，涉及 {n_groups} 组配对关系；"
        f"主要出现在 {host_s}。"
    )


def _summarize_parsed_pairs(
    parsed_list: list[dict[str, Any]],
    *,
    total_count: int,
    max_rows: int = 8,
) -> dict[str, Any]:
    """Group many pair locations into readable summary rows."""
    groups: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    hosts: Counter[str] = Counter()

    for p in parsed_list:
        gk = p.get("group_key") or "||"
        if gk not in groups:
            groups[gk] = {
                "side_a": p.get("side_a") or "—",
                "side_b": p.get("side_b") or "",
                "col_pairs": Counter(),
                "singles": Counter(),
                "n": 0,
                "kind": p.get("kind") or "single",
            }
            order.append(gk)
        g = groups[gk]
        g["n"] += 1
        ca, cb = str(p.get("col_a") or ""), str(p.get("col_b") or "")
        if ca and cb:
            key = f"col{ca}↔col{cb}" if ca.isdigit() and cb.isdigit() else f"{ca}↔{cb}"
            g["col_pairs"][key] += 1
        elif ca:
            g["singles"][f"col{ca}" if ca.isdigit() else ca] += 1
        for side in (p.get("side_a"), p.get("side_b")):
            if side and side not in ("—", "（定位不足）", "同表"):
                base = re.sub(r"\s*·\s*.+$", "", str(side)).strip()
                if base:
                    hosts[base] += 1

    order.sort(key=lambda k: -groups[k]["n"])
    rows: list[dict[str, Any]] = []
    for gk in order[:max_rows]:
        g = groups[gk]
        col_bits = [k for k, _ in g["col_pairs"].most_common(6)]
        if not col_bits:
            col_bits = [k for k, _ in g["singles"].most_common(6)]
        n_pair_types = len(g["col_pairs"]) + len(g["singles"])
        extra = f" 等 {n_pair_types} 种列组合" if n_pair_types > 6 else ""
        rows.append(
            {
                "side_a": g["side_a"],
                "side_b": g["side_b"],
                "cols": ("、".join(col_bits) + extra) if col_bits else "—",
                "n": g["n"],
                "kind": g["kind"],
            }
        )

    top_hosts = [h for h, _ in hosts.most_common(8)]
    more = max(0, len(order) - max_rows)
    return {
        "rows": rows,
        "top_hosts": top_hosts,
        "n_group_pairs": len(order),
        "more_groups": more,
        "total_count": total_count,
        "headline": _headline_for_pairs(top_hosts, total_count, len(order)),
    }


def _plain_next(room: str, location_short: str) -> str:
    loc = (location_short or "").strip() or "报告所列位置"
    if room == "numbers":
        return (
            f"打开原始表格或 Source Data，按配对表定位至「{loc}」及相关列，"
            "核对数值是否与实验记录一致，并确认是否存在合理的计算派生关系。"
        )
    if room == "pictures":
        return (
            f"打开论文图片及源文件，定位至「{loc}」，"
            "进行视觉对照（必要时叠加/放大），确认是否为同一区域的重复使用或拼接。"
        )
    return f"依据「{loc}」回查原文件；如无法判断，请连同技术报告提交领域专家复核。"


def _normalize_item(f: Finding) -> dict[str, Any] | None:
    if f.severity not in ("high", "medium"):
        return None
    raw = f.raw if isinstance(f.raw, dict) else {}
    room = _room_of(f.detector)
    light = _light(str(f.severity))
    plain_title = _plain_title(f.title, f.detector, raw)
    loc = f.location or ""
    parsed = _parse_location(loc, raw)
    story = _clean_story((f.llm_verdict or "").strip(), loc)
    if not story:
        if f.llm_skipped:
            story = "模型解读未生成；检测器已给出量化/定位信号，需直接依据证据字段复核。"
        else:
            story = "检测器在该位置标记了统计或感知层面的异常信号。"
    return {
        "finding_id": f.finding_id,
        "detector": f.detector,
        "severity": f.severity,
        "light": light,
        "room": room,
        "title_tech": f.title,
        "title_plain": plain_title,
        "location": loc,
        "location_short": parsed.get("display_short") or loc,
        "parsed": parsed,
        "story": story[:420],
        "why": _plain_why(light, room),
        "next": _plain_next(room, str(parsed.get("display_short") or loc)),
        "llm_verdict": f.llm_verdict,
        "has_llm": bool(f.llm_verdict),
    }


def _pattern_key(item: dict) -> str:
    t = re.sub(r"\d+", "N", (item.get("title_plain") or "").lower())
    return f"{item.get('room')}|{item.get('light')}|{t[:70]}"


def _merge_patterns(items: list[dict], limit: int = 50) -> list[dict]:
    buckets: dict[str, dict] = {}
    order: list[str] = []
    for it in items:
        key = _pattern_key(it)
        if key not in buckets:
            buckets[key] = {
                "sample": it,
                "count": 0,
                "locs": [],
                "parsed_list": [],
                "detectors": set(),
            }
            order.append(key)
        b = buckets[key]
        b["count"] += 1
        loc = it.get("location") or ""
        if loc and loc not in b["locs"] and len(b["locs"]) < 40:
            b["locs"].append(loc)
        parsed = it.get("parsed")
        if isinstance(parsed, dict):
            b["parsed_list"].append(parsed)
        elif loc:
            b["parsed_list"].append(_parse_location(loc, {}))
        b["detectors"].add(it.get("detector") or "")
    groups = []
    for k in order:
        b = buckets[k]
        b["detectors"] = sorted(x for x in b["detectors"] if x)
        b["location_summary"] = _summarize_parsed_pairs(
            b["parsed_list"],
            total_count=b["count"],
            max_rows=8,
        )
        short_locs: list[str] = []
        for row in (b["location_summary"].get("rows") or [])[:6]:
            a, bb = row.get("side_a") or "", row.get("side_b") or ""
            if a and bb and a != bb:
                short_locs.append(f"{a} ↔ {bb}")
            elif a:
                short_locs.append(str(a))
        b["locs_short"] = short_locs
        groups.append(b)
    groups.sort(
        key=lambda g: (
            0 if g["sample"]["light"] == "red" else 1,
            -g["count"],
        )
    )
    return groups[:limit]


def build_plain_investigation_payload(
    *,
    trace_id: str,
    findings: list[Finding],
    llm_calls: int = 0,
    language: str = "zh",
    source_name: str = "",
) -> dict[str, Any]:
    items = []
    for f in findings:
        it = _normalize_item(f)
        if it:
            items.append(it)
    red = [i for i in items if i["light"] == "red"]
    yellow = [i for i in items if i["light"] == "yellow"]
    green_n = sum(1 for f in findings if f.severity in ("low", "info"))

    if len(red) >= 30:
        overall = "red"
        overall_zh = "高关注"
        overall_tip = (
            "高关注信号数量较多，建议系统核对 Source Data、未压缩原图与实验记录，"
            "并优先处理本报告「关键发现」中的条目。"
        )
    elif len(red) >= 5:
        overall = "yellow"
        overall_zh = "中关注（含若干高关注项）"
        overall_tip = (
            "存在需要重点核实的高关注条目；中关注信号可能为误报，"
            "但应结合原始材料进行排除性核查。"
        )
    elif len(red) >= 1 or len(yellow) >= 10:
        overall = "yellow"
        overall_zh = "中关注"
        overall_tip = (
            "已出现需人工确认的异常信号。请按严重度顺序打开原文件核对，"
            "并参考配对定位报告获取精确位置。"
        )
    else:
        overall = "green"
        overall_zh = "低关注"
        overall_tip = (
            "当前未观察到突出的高关注聚类；仍建议对关键图表与 Source Data 做抽查，"
            "自动化工具存在漏报可能。"
        )

    by_room = Counter(i["room"] for i in items)
    by_detector = Counter(i["detector"] for i in items)
    return {
        "schema": "manusift.investigation_plain.v1",
        "trace_id": trace_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "language": language,
        "source_name": source_name,
        "llm_calls": llm_calls,
        "overall": overall,
        "overall_label": overall_zh,
        "overall_tip": overall_tip,
        "counts": {
            "red": len(red),
            "yellow": len(yellow),
            "green_low_info": green_n,
            "total_findings": len(findings),
            "eligible": len(items),
            "with_story": sum(1 for i in items if i.get("has_llm")),
        },
        "by_room": dict(by_room),
        "by_detector": dict(by_detector.most_common(20)),
        "priority": _merge_patterns(red if red else yellow, limit=10),
        "rooms": {
            "numbers": _merge_patterns(
                [i for i in items if i["room"] == "numbers"], limit=12
            ),
            "pictures": _merge_patterns(
                [i for i in items if i["room"] == "pictures"], limit=12
            ),
            "words": _merge_patterns(
                [i for i in items if i["room"] == "words"], limit=8
            ),
            "other": _merge_patterns(
                [i for i in items if i["room"] == "other"], limit=8
            ),
        },
        "items": items,
    }


def _esc(s: Any) -> str:
    return html.escape("" if s is None else str(s))


def _location_table_html(summary: dict[str, Any], *, zh: bool) -> str:
    """Render grouped A↔B location summary as a compact table."""
    rows = summary.get("rows") or []
    if not rows:
        return (
            f"<p>{_esc(summary.get('headline') or ('（位置信息有限）' if zh else '(no location)'))}</p>"
        )
    more = int(summary.get("more_groups") or 0)
    head = (
        "<thead><tr><th>组 / 表 A</th><th></th><th>组 / 表 B</th>"
        "<th>列关系（归并）</th><th>条数</th></tr></thead>"
        if zh
        else "<thead><tr><th>Side A</th><th></th><th>Side B</th>"
        "<th>Columns</th><th>n</th></tr></thead>"
    )
    body_rows: list[str] = []
    for r in rows:
        a = _esc(r.get("side_a") or "—")
        b = r.get("side_b") or ""
        arrow = "↔" if b and b != r.get("side_a") else "·"
        b_disp = _esc(b) if b else ("（单侧）" if zh else "(single)")
        body_rows.append(
            "<tr>"
            f"<td><strong>{a}</strong></td>"
            f'<td style="text-align:center;color:#6b7280">{arrow}</td>'
            f"<td><strong>{b_disp}</strong></td>"
            f"<td>{_esc(r.get('cols') or '—')}</td>"
            f"<td>{int(r.get('n') or 0)}</td>"
            "</tr>"
        )
    foot = ""
    if more > 0:
        foot = (
            f"<p class=\"meta\">另有 {more} 组配对未全部展开；"
            f"完整清单见 <a href=\"investigation_pairs.html\">investigation_pairs.html</a>。"
            f"</p>"
            if zh
            else f"<p class=\"meta\">+{more} more groups; see pairs report.</p>"
        )
    return (
        f"<p>{_esc(summary.get('headline') or '')}</p>\n"
        f"<table>\n{head}\n<tbody>\n{''.join(body_rows)}\n</tbody>\n</table>\n"
        f"{foot}"
    )


def _pairs_kind_href(sample: dict[str, Any]) -> str:
    """Deep-link into investigation_pairs.html kind section."""
    title = str(sample.get("title_plain") or sample.get("title_tech") or "")
    det = str(sample.get("detector") or "").lower()
    room = str(sample.get("room") or "")
    blob = f"{title} {det}".lower()
    if "跨表" in title or "cross_table" in blob:
        kind = "table_cross"
    elif any(k in blob for k in ("列间", "fixed_offset", "duplicate_rate", "mirror")):
        kind = "table_pair"
    elif any(k in blob for k in ("跨图", "cross_image", "texture", "panel_sift")):
        kind = "image_pair" if "panel" not in blob else "image_panel"
    elif any(k in blob for k in ("copy", "ela", "jpeg", "图内")):
        kind = "image_single"
    elif room == "pictures":
        kind = "image_single"
    elif room == "numbers":
        kind = "table_column"
    else:
        kind = "other"
    return f"investigation_pairs.html#kind-{kind}"


def _finding_section_html(
    g: dict,
    *,
    index: int,
    zh: bool,
) -> str:
    s = g["sample"]
    light = s.get("light") or "green"
    vcls = _verdict_class(str(light))
    vlab = _verdict_label(str(light), zh=zh)
    cnt = int(g.get("count") or 1)
    title = s.get("title_plain") or s.get("title_tech") or ""
    det = s.get("detector") or ""
    dets = g.get("detectors") or ([det] if det else [])
    det_str = ", ".join(dets[:4])
    summary = g.get("location_summary") or {}
    if not summary and g.get("parsed_list"):
        summary = _summarize_parsed_pairs(
            list(g.get("parsed_list") or []),
            total_count=cnt,
        )
    if not summary:
        # fallback single location
        short = s.get("location_short") or s.get("location") or ""
        summary = {
            "headline": f"共 {cnt} 条同类信号。" if zh else f"{cnt} signals.",
            "rows": [
                {
                    "side_a": short or "—",
                    "side_b": "",
                    "cols": "—",
                    "n": cnt,
                }
            ]
            if short
            else [],
            "more_groups": 0,
        }
    count_note = f"（同类信号 {cnt} 条）" if cnt > 1 and zh else (
        f" ({cnt} similar)" if cnt > 1 else ""
    )
    story = s.get("story") or ""
    why = s.get("why") or ""
    # next: prefer first short pair, not long raw location
    locs_short = g.get("locs_short") or []
    nxt_base = s.get("next") or ""
    if locs_short and zh:
        nxt = (
            f"优先核对配对表中的高频组（如「{locs_short[0]}」）；"
            "打开 Source Data / 原图对照，并在配对定位报告中查看全部列级明细。"
        )
    else:
        nxt = nxt_base
    tech = s.get("title_tech") or ""

    head = (
        f"发现 {index}：{_esc(title)}（{_esc(det_str)}）— "
        f'<strong class="{vcls}">{_esc(vlab)}</strong>'
    ) if zh else (
        f"Finding {index}: {_esc(title)} ({_esc(det_str)}) — "
        f'<strong class="{vcls}">{_esc(vlab)}</strong>'
    )

    loc_block = _location_table_html(summary, zh=zh)
    paras: list[str] = []
    pairs_href = _pairs_kind_href(s)
    if zh:
        paras.append(
            f"<p>检测器标记了「{_esc(title)}」模式{count_note}。"
            f"{_esc(story)}</p>"
        )
        paras.append(f"<p><strong>位置（归并后）：</strong></p>\n{loc_block}")
        paras.append(f"<p><strong>解读要点：</strong>{_esc(why)}</p>")
        paras.append(f"<p><strong>建议复核：</strong>{_esc(nxt)}</p>")
        paras.append(
            f'<p><a href="{_esc(pairs_href)}">'
            f"→ 在配对定位报告中查看本类全部条目（含列级明细）</a></p>"
        )
        if tech and tech != title:
            paras.append(
                f"<p class=\"meta\">技术标题：{_esc(tech)} · "
                f"示例 finding_id：<code>{_esc(s.get('finding_id'))}</code></p>"
            )
    else:
        paras.append(
            f"<p>Detector flagged “{_esc(title)}”{count_note}. {_esc(story)}</p>"
        )
        paras.append(f"<p><strong>Locations (grouped):</strong></p>\n{loc_block}")
        paras.append(f"<p><strong>Why it matters:</strong> {_esc(why)}</p>")
        paras.append(f"<p><strong>Suggested check:</strong> {_esc(nxt)}</p>")
        paras.append(
            f'<p><a href="{_esc(pairs_href)}">→ Open pairs report for this class</a></p>'
        )

    return f"<h3 id=\"f{index}\">{head}</h3>\n" + "\n".join(paras)


def _diagnostic_table_html(payload: dict, zh: bool) -> str:
    c = payload.get("counts") or {}
    by_room = payload.get("by_room") or {}
    rows: list[str] = []

    # overall row
    overall = payload.get("overall") or "yellow"
    vcls = _verdict_class(str(overall))
    vlab = _esc(payload.get("overall_label") or _verdict_label(str(overall), zh))
    if zh:
        rows.append(
            "<tr>"
            f"<td>汇总</td><td>整体判定</td>"
            f'<td><strong class="{vcls}">{vlab}</strong> — '
            f"高关注 {int(c.get('red') or 0)} · 中关注 {int(c.get('yellow') or 0)} · "
            f"低/提示 {int(c.get('green_low_info') or 0)} "
            f"（全部信号 {int(c.get('total_findings') or 0)}）</td>"
            "</tr>"
        )
    else:
        rows.append(
            "<tr><td>Summary</td><td>Overall</td>"
            f'<td><strong class="{vcls}">{vlab}</strong></td></tr>'
        )

    room_order = ("numbers", "pictures", "words", "other")
    for key in room_order:
        n = int(by_room.get(key) or 0)
        if n <= 0:
            continue
        groups = (payload.get("rooms") or {}).get(key) or []
        n_high = sum(
            1 for g in groups if (g.get("sample") or {}).get("light") == "red"
        )
        if n_high >= 3 or (key in ("numbers", "pictures") and n >= 20):
            sev, vcls_r, lab = "high", "verdict-high", "高关注" if zh else "High"
        elif n_high >= 1 or n >= 5:
            sev, vcls_r, lab = "medium", "verdict-medium", "中关注" if zh else "Medium"
        else:
            sev, vcls_r, lab = "low", "verdict-low", "低关注" if zh else "Low"
        cat = _ROOM_LABEL.get(key, key) if zh else key
        detail = (
            f"合并后 {len(groups)} 类模式 · 条目 {n}"
            if zh
            else f"{len(groups)} pattern groups · {n} items"
        )
        rows.append(
            "<tr>"
            f"<td>{_esc(cat)}</td>"
            f"<td>{_esc(key)}</td>"
            f'<td><strong class="{vcls_r}">{_esc(lab)}</strong> — {_esc(detail)}</td>'
            "</tr>"
        )

    # top detectors
    for det, n in list((payload.get("by_detector") or {}).items())[:8]:
        room = _room_of(str(det))
        cat = _ROOM_LABEL.get(room, room) if zh else room
        if n >= 50:
            vcls_d, lab = "verdict-high", "高关注" if zh else "High"
        elif n >= 10:
            vcls_d, lab = "verdict-medium", "中关注" if zh else "Medium"
        else:
            vcls_d, lab = "verdict-low", "低关注" if zh else "Low"
        rows.append(
            "<tr>"
            f"<td>{_esc(cat)}</td>"
            f"<td><code>{_esc(det)}</code></td>"
            f'<td><strong class="{vcls_d}">{_esc(lab)}</strong> — '
            f"{'信号数' if zh else 'signals'} {n}</td>"
            "</tr>"
        )

    if not rows:
        return "<p>（无诊断行）</p>" if zh else "<p>(empty)</p>"

    head = (
        "<thead><tr><th>检测器类别</th><th>检测器 / 维度</th><th>结果</th></tr></thead>"
        if zh
        else "<thead><tr><th>Category</th><th>Detector</th><th>Result</th></tr></thead>"
    )
    return f"<table>\n{head}\n<tbody>\n{''.join(rows)}\n</tbody>\n</table>"


def build_plain_investigation_html(payload: dict) -> str:
    zh = str(payload.get("language") or "zh").startswith("zh")
    c = payload.get("counts") or {}
    overall = payload.get("overall") or "yellow"
    vcls = _verdict_class(str(overall))
    source = payload.get("source_name") or ""
    title = "论文诚信初筛报告" if zh else "Paper Integrity Screening Report"
    subtitle = "（简明版）" if zh else " (Concise)"
    gen = str(payload.get("generated_at") or "")
    gen_short = gen[:19].replace("T", " ")
    if gen.endswith("+00:00") or gen.endswith("Z") or "T" in gen:
        if "UTC" not in gen_short:
            gen_short = gen_short + " UTC"

    priority = payload.get("priority") or []
    rooms = payload.get("rooms") or {}

    # Executive summary paragraphs
    if zh:
        exec_p1 = (
            f'<p><strong>整体判定：'
            f'<span class="{vcls}">{_esc(payload.get("overall_label"))}</span>'
            f"</strong></p>"
        )
        src_bit = (
            f"针对材料 <em>{_esc(source)}</em> 的"
            if source
            else "针对当前送检材料的"
        )
        exec_p2 = (
            f"<p>本文件为 ManuSift 自动生成的{src_bit}诚信初筛<strong>简明报告</strong>。"
            f"筛查共标记 <strong>{int(c.get('total_findings') or 0)}</strong> 条检测信号，"
            f"其中高关注 <strong>{int(c.get('red') or 0)}</strong>、"
            f"中关注 <strong>{int(c.get('yellow') or 0)}</strong>、"
            f"低关注/提示 <strong>{int(c.get('green_low_info') or 0)}</strong>；"
            f"本页对中高关注信号进行归类综述。"
            f"{'模型解读调用 ' + str(payload.get('llm_calls') or 0) + ' 次。' if payload.get('llm_calls') else ''}"
            f"</p>"
        )
        exec_p3 = f"<p>{_esc(payload.get('overall_tip'))}</p>"
        callout = (
            '<div class="callout warn">'
            "<strong>阅读说明：</strong>本报告仅提供初步筛查信号与定位线索，"
            "不构成对学术不端行为的最终认定。正式判定应由期刊编辑部或研究机构"
            "在全面调查后作出。配对级精确定位请参阅 "
            '<a href="investigation_pairs.html">investigation_pairs.html</a>；'
            "完整技术证据见 "
            '<a href="report.html">report.html</a>。'
            "</div>"
        )
    else:
        exec_p1 = (
            f'<p><strong>Overall: '
            f'<span class="{vcls}">{_esc(payload.get("overall_label"))}</span>'
            f"</strong></p>"
        )
        exec_p2 = (
            f"<p>Automated concise integrity screen. "
            f"Total signals: {int(c.get('total_findings') or 0)} "
            f"(high {int(c.get('red') or 0)}, medium {int(c.get('yellow') or 0)}).</p>"
        )
        exec_p3 = f"<p>{_esc(payload.get('overall_tip'))}</p>"
        callout = (
            '<div class="callout warn">'
            "<strong>Note:</strong> Automated hints only — not a final misconduct verdict. "
            'See <a href="investigation_pairs.html">pairs report</a> and '
            '<a href="report.html">technical report</a>.'
            "</div>"
        )

    # Task info
    if zh:
        info_items = [
            f"<li><strong>追踪 ID</strong>: <code>{_esc(payload.get('trace_id'))}</code></li>",
            f"<li><strong>生成时间</strong>: <code>{_esc(gen_short)}</code></li>",
        ]
        if source:
            info_items.append(f"<li><strong>材料标识</strong>: {_esc(source)}</li>")
        info_items += [
            f"<li><strong>信号总数</strong>: {int(c.get('total_findings') or 0)}</li>",
            f"<li><strong>本页综述条目</strong>: 高关注 {int(c.get('red') or 0)} · "
            f"中关注 {int(c.get('yellow') or 0)}（归类后展示）</li>",
            f"<li><strong>含模型解读</strong>: {int(c.get('with_story') or 0)} 条 · "
            f"LLM 调用 {int(payload.get('llm_calls') or 0)} 次</li>",
        ]
        info_html = "<ul>\n" + "\n".join(info_items) + "\n</ul>"
    else:
        info_html = (
            "<ul>"
            f"<li><strong>Trace ID</strong>: <code>{_esc(payload.get('trace_id'))}</code></li>"
            f"<li><strong>Generated</strong>: <code>{_esc(gen_short)}</code></li>"
            f"<li><strong>Total signals</strong>: {int(c.get('total_findings') or 0)}</li>"
            "</ul>"
        )

    diag = _diagnostic_table_html(payload, zh)

    # Key findings
    finding_parts: list[str] = []
    for i, g in enumerate(priority, start=1):
        finding_parts.append(_finding_section_html(g, index=i, zh=zh))
    if not finding_parts:
        finding_parts.append(
            "<p>当前无需要优先列出的中高关注聚类。</p>"
            if zh
            else "<p>No priority clusters.</p>"
        )

    # Category findings
    cat_parts: list[str] = []
    for key in ("numbers", "pictures", "words", "other"):
        groups = rooms.get(key) or []
        if not groups:
            continue
        lab = _ROOM_LABEL.get(key, key) if zh else key
        cat_parts.append(f"<h3 id=\"cat-{key}\">{_esc(lab)}</h3>")
        cat_parts.append("<ul>")
        for g in groups:
            s = g["sample"]
            vcls_i = _verdict_class(str(s.get("light") or ""))
            vlab_i = _verdict_label(str(s.get("light") or ""), zh=zh)
            cnt = int(g.get("count") or 1)
            summary = g.get("location_summary") or {}
            headline = summary.get("headline") or ""
            shorts = g.get("locs_short") or []
            if shorts:
                loc_bit = "；".join(shorts[:3])
                if len(shorts) > 3:
                    loc_bit += f" 等 {len(shorts)} 组"
            else:
                loc_bit = s.get("location_short") or s.get("location") or ""
            suffix = f"（×{cnt}）" if cnt > 1 else ""
            cat_parts.append(
                "<li>"
                f'<strong class="{vcls_i}">{_esc(vlab_i)}</strong> — '
                f"{_esc(s.get('title_plain'))}{suffix}"
                f"：{_esc((s.get('story') or '')[:160])} "
                f"<em>[{_esc(loc_bit)[:100]}]</em>"
                f"{(' · ' + _esc(headline)) if headline and cnt > 3 else ''}"
                "</li>"
            )
        cat_parts.append("</ul>")
    if not cat_parts:
        cat_parts.append("<p>（无分类条目）</p>" if zh else "<p>(none)</p>")

    # Next steps
    if zh:
        next_html = """
<ol>
<li><strong>人工核对高关注项</strong>：按「关键发现」顺序，对照 Source Data 与未压缩原图逐条确认或排除。</li>
<li><strong>使用配对定位报告</strong>：打开 <a href="investigation_pairs.html">investigation_pairs.html</a>，获取组↔组 / 图对级精确位置。</li>
<li><strong>查阅技术证据</strong>：在 <a href="report.html">report.html</a> 中查看检测器原始输出与证据链。</li>
<li><strong>必要时提交机构复核</strong>：将本报告与原始材料一并交由具备管辖权的编辑部或研究诚信机构处理。</li>
</ol>
"""
        related = """
<ul>
<li><a href="investigation_pairs.html">配对定位调查报告</a>（主入口，组↔组 / 图对）</li>
<li><a href="llm_briefing.html">LLM 审阅简报</a></li>
<li><a href="llm_report.html">LLM 完整解读列表</a></li>
<li><a href="report.html">技术检测报告</a></li>
<li><a href="findings.json">findings.json</a></li>
</ul>
"""
        disclaimer = (
            "<p>本报告由 ManuSift 论文诚信初筛助手自动生成，仅提供"
            "<strong>初步筛查信号</strong>，不构成对学术不端行为的最终认定。"
            "所有检测器输出均为统计或感知层面的异常标记，需要领域专家结合原始数据、"
            "实验记录和机构调查进行人工复核。正式的不端行为判定应由具备管辖权的机构"
            "（如期刊编辑部、研究机构伦理委员会）在全面调查后做出。"
            "本工具仅标记「需要人工确认的异常信号」。</p>"
        )
        h_exec = "执行摘要"
        h_info = "任务信息"
        h_diag = "诊断面板"
        h_key = "关键发现"
        h_cat = "分类发现"
        h_next = "建议下一步"
        h_rel = "相关材料"
        h_dis = "免责声明"
    else:
        next_html = (
            "<ol>"
            "<li>Review high-concern items against source data.</li>"
            '<li>Open <a href="investigation_pairs.html">pairs report</a> for localization.</li>'
            '<li>See <a href="report.html">technical report</a> for evidence.</li>'
            "</ol>"
        )
        related = (
            "<ul>"
            '<li><a href="investigation_pairs.html">Pairs report</a></li>'
            '<li><a href="report.html">Technical report</a></li>'
            "</ul>"
        )
        disclaimer = (
            "<p>Automated screening signals only — not a final misconduct determination. "
            "Human review with source materials is required.</p>"
        )
        h_exec, h_info, h_diag = "Executive summary", "Job info", "Diagnostic panel"
        h_key, h_cat = "Key findings", "Findings by category"
        h_next, h_rel, h_dis = "Recommended next steps", "Related materials", "Disclaimer"

    return f"""<!doctype html>
<html lang="{'zh-Hans' if zh else 'en'}">
<head>
  <meta charset="utf-8">
  <meta name="manusift-report-version" content="manusift.investigation_plain.v1">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{_esc(title)}{_esc(subtitle)}</title>
  <style>{_CSS}</style>
</head>
<body>
<h1 id="title">{_esc(title)}{_esc(subtitle)}</h1>
{callout}
<h2 id="exec">{_esc(h_exec)}</h2>
{exec_p1}
{exec_p2}
{exec_p3}
<h2 id="info">{_esc(h_info)}</h2>
{info_html}
<h2 id="diag">{_esc(h_diag)}</h2>
{diag}
<h2 id="key">{_esc(h_key)}</h2>
{''.join(finding_parts)}
<h2 id="cat">{_esc(h_cat)}</h2>
{''.join(cat_parts)}
<h2 id="next">{_esc(h_next)}</h2>
{next_html}
<h2 id="rel">{_esc(h_rel)}</h2>
{related}
<h2 id="dis">{_esc(h_dis)}</h2>
{disclaimer}
<hr>
<div class="meta">追踪 ID: <code>{_esc(payload.get('trace_id'))}</code> &middot; 生成时间: <code>{_esc(gen_short)}</code> &middot; investigation_plain.html</div>
</body>
</html>
"""


def build_plain_investigation_markdown(payload: dict) -> str:
    zh = str(payload.get("language") or "zh").startswith("zh")
    c = payload.get("counts") or {}
    overall = payload.get("overall_label") or ""
    gen = str(payload.get("generated_at") or "")[:19].replace("T", " ")
    lines: list[str] = []

    if zh:
        lines += [
            "# 论文诚信初筛报告（简明版）",
            "",
            f"**整体判定：{overall}**",
            "",
            str(payload.get("overall_tip") or ""),
            "",
            f"> 本报告仅提供初步筛查信号，不构成学术不端最终认定。",
            "",
            "## 任务信息",
            "",
            f"- **追踪 ID**: `{payload.get('trace_id')}`",
            f"- **生成时间**: `{gen}`",
        ]
        if payload.get("source_name"):
            lines.append(f"- **材料标识**: {payload.get('source_name')}")
        lines += [
            f"- **信号总数**: {c.get('total_findings')}",
            f"- **高关注 / 中关注 / 低关注**: {c.get('red')} / {c.get('yellow')} / {c.get('green_low_info')}",
            f"- **LLM 调用**: {payload.get('llm_calls')}",
            "",
            "## 诊断面板",
            "",
            "| 检测器类别 | 维度 | 结果 |",
            "|-----------|------|------|",
            f"| 汇总 | 整体判定 | **{overall}** — 高 {c.get('red')} · 中 {c.get('yellow')} · 低 {c.get('green_low_info')} |",
        ]
        for key in ("numbers", "pictures", "words", "other"):
            n = (payload.get("by_room") or {}).get(key) or 0
            if n:
                lines.append(
                    f"| {_ROOM_LABEL.get(key, key)} | {key} | 条目 {n} |"
                )
        lines += ["", "## 关键发现", ""]
    else:
        lines += [
            "# Paper Integrity Screening Report (Concise)",
            "",
            f"**Overall: {overall}**",
            "",
            "## Key findings",
            "",
        ]

    for i, g in enumerate(payload.get("priority") or [], start=1):
        s = g["sample"]
        cnt = g["count"]
        vlab = _verdict_label(str(s.get("light") or ""), zh=zh)
        suffix = f"（同类 ×{cnt}）" if cnt > 1 else ""
        lines.append(
            f"### 发现 {i}：{s.get('title_plain')}{suffix} — **{vlab}**"
        )
        lines.append("")
        summary = g.get("location_summary") or {}
        if summary.get("headline"):
            lines.append(f"- **位置概要**: {summary.get('headline')}")
        rows = summary.get("rows") or []
        if rows:
            lines.append("")
            lines.append("| 组/表 A | 组/表 B | 列关系 | 条数 |")
            lines.append("|---------|---------|--------|------|")
            for r in rows:
                lines.append(
                    f"| {r.get('side_a') or '—'} | {r.get('side_b') or '—'} | "
                    f"{r.get('cols') or '—'} | {r.get('n') or 0} |"
                )
            lines.append("")
        else:
            shorts = g.get("locs_short") or [s.get("location_short") or s.get("location") or ""]
            lines.append(f"- **位置**: {'; '.join(shorts[:6])}")
        lines.append(f"- **检测器**: `{s.get('detector')}`")
        lines.append(f"- **说明**: {s.get('story')}")
        lines.append(f"- **解读要点**: {s.get('why')}")
        lines.append(f"- **建议复核**: {s.get('next')}")
        lines.append("")

    lines.append("## 分类发现" if zh else "## By category")
    lines.append("")
    for key, name in _ROOM_LABEL.items():
        groups = (payload.get("rooms") or {}).get(key) or []
        if not groups:
            continue
        lines.append(f"### {name if zh else key}")
        lines.append("")
        for g in groups:
            s = g["sample"]
            cnt = g["count"]
            vlab = _verdict_label(str(s.get("light") or ""), zh=zh)
            suffix = f" ×{cnt}" if cnt > 1 else ""
            shorts = g.get("locs_short") or []
            loc_bit = "；".join(shorts[:3]) if shorts else (
                s.get("location_short") or ""
            )
            headline = (g.get("location_summary") or {}).get("headline") or ""
            lines.append(
                f"- **{vlab}** — {s.get('title_plain')}{suffix}: "
                f"{(s.get('story') or '')[:140]}"
                f"{(' 〔' + loc_bit + '〕') if loc_bit else ''}"
                f"{(' · ' + headline) if headline and cnt > 3 else ''}"
            )
        lines.append("")

    if zh:
        lines += [
            "## 建议下一步",
            "",
            "1. 人工核对高关注项（对照 Source Data / 原图）。",
            "2. 打开 `investigation_pairs.html` 获取组↔组与图对定位。",
            "3. 查阅 `report.html` 技术证据链。",
            "4. 必要时提交编辑部或机构诚信调查。",
            "",
            "## 相关材料",
            "",
            "- [配对定位报告](investigation_pairs.html)",
            "- [LLM 审阅简报](llm_briefing.html)",
            "- [技术检测报告](report.html)",
            "- [findings.json](findings.json)",
            "",
            "## 免责声明",
            "",
            "本报告由 ManuSift 自动生成，仅提供初步筛查信号，"
            "不构成对学术不端行为的最终认定。正式判定应由具备管辖权的机构作出。",
            "",
            "---",
            f"追踪 ID: `{payload.get('trace_id')}` · 生成时间: `{gen}`",
        ]
    else:
        lines += [
            "## Next steps",
            "",
            "1. Review high-concern items.",
            "2. Open investigation_pairs.html.",
            "3. See report.html.",
            "",
            "## Disclaimer",
            "",
            "Automated signals only — not a final misconduct determination.",
        ]
    return "\n".join(lines) + "\n"


def write_plain_investigation(
    *,
    root_dir: str | Any,
    trace_id: str,
    findings: list[Finding],
    llm_calls: int = 0,
    language: str = "zh",
    source_name: str = "",
) -> dict[str, str]:
    from pathlib import Path

    root = Path(root_dir)
    root.mkdir(parents=True, exist_ok=True)
    payload = build_plain_investigation_payload(
        trace_id=trace_id,
        findings=findings,
        llm_calls=llm_calls,
        language=language,
        source_name=source_name,
    )
    paths = {
        "plain_html": root / "investigation_plain.html",
        "plain_md": root / "investigation_plain.md",
        "plain_json": root / "investigation_plain.json",
    }
    paths["plain_json"].write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    paths["plain_html"].write_text(
        build_plain_investigation_html(payload), encoding="utf-8"
    )
    paths["plain_md"].write_text(
        build_plain_investigation_markdown(payload), encoding="utf-8"
    )
    return {k: str(v.resolve()) for k, v in paths.items()}
