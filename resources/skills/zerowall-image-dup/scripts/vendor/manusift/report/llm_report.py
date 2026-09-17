"""Standalone LLM interpretation report (separate from detector report.html).

After enrichment, the pipeline writes:

  * ``llm_report.html`` — human-readable LLM review list
  * ``llm_report.md``   — same content for agents / markdown viewers
  * ``llm_report.json`` — machine-readable summary stats + rows

The main ``report.html`` stays detector-first; LLM narrative lives here.
"""
from __future__ import annotations

import html
import json
from collections import Counter  # noqa: F401 — used in build_llm_report_payload
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Iterable

if TYPE_CHECKING:
    from pathlib import Path

from ..contracts import Finding

SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2, "info": 3}

_CSS = """
:root { color-scheme: light dark; }
body { font: 14px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
       max-width: 960px; margin: 32px auto; padding: 0 20px; }
h1 { font-size: 22px; margin-bottom: 4px; }
h2 { font-size: 16px; margin-top: 28px; border-bottom: 1px solid #e5e7eb;
     padding-bottom: 4px; }
.meta { color: #6b7280; font-size: 12px; margin-bottom: 20px; }
.stats { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 20px; }
.stat { background: #f3f4f6; border-radius: 8px; padding: 8px 12px;
        font-size: 12px; }
.item { border: 1px solid #d1d5db; border-radius: 8px;
        padding: 12px 16px; margin: 10px 0; }
.sev-high   { border-left: 6px solid #dc2626; }
.sev-medium { border-left: 6px solid #d97706; }
.sev-low    { border-left: 6px solid #2563eb; }
.sev-info   { border-left: 6px solid #6b7280; }
.item h3 { margin: 0 0 6px; font-size: 14px; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px;
         font-size: 11px; background: #e5e7eb; margin-right: 6px; }
.llm { background: #ecfdf5; border: 1px solid #6ee7b7; padding: 10px;
       border-radius: 6px; margin-top: 8px; font-size: 13px; }
.skipped { background: #fef3c7; border: 1px solid #fcd34d; padding: 8px;
           border-radius: 6px; margin-top: 8px; font-size: 12px; color: #92400e; }
.loc { color: #6b7280; font-size: 12px; margin-bottom: 6px; }
.empty { padding: 24px; border: 1px dashed #d1d5db; border-radius: 8px;
         color: #6b7280; text-align: center; }
a { color: #2563eb; }
"""


def _rows(findings: Iterable[Finding]) -> list[dict]:
    rows: list[dict] = []
    for f in findings:
        if f.severity not in ("high", "medium") and not f.llm_verdict:
            continue
        if not f.llm_verdict and not f.llm_skipped and f.severity not in (
            "high",
            "medium",
        ):
            continue
        # Include any finding that was eligible or has a verdict
        if f.severity not in ("high", "medium") and not f.llm_verdict:
            continue
        source = getattr(f, "llm_source", None) or (
            "verdict" if f.llm_verdict else ("skipped" if f.llm_skipped else "none")
        )
        rows.append(
            {
                "finding_id": f.finding_id,
                "detector": f.detector,
                "severity": f.severity,
                "title": f.title,
                "location": f.location,
                "evidence": (f.evidence or "")[:500],
                "llm_verdict": f.llm_verdict,
                "llm_skipped": bool(f.llm_skipped),
                "llm_source": source,
            }
        )
    rows.sort(
        key=lambda r: (
            SEVERITY_ORDER.get(str(r["severity"]), 9),
            str(r["detector"]),
            str(r["title"]),
        )
    )
    return rows


def build_llm_report_payload(
    *,
    trace_id: str,
    findings: list[Finding],
    llm_calls: int,
    language: str = "zh",
) -> dict:
    rows = _rows(findings)
    with_v = [r for r in rows if r.get("llm_verdict")]
    skipped = [r for r in rows if r.get("llm_skipped") and not r.get("llm_verdict")]
    by_source = Counter(str(r.get("llm_source") or "none") for r in with_v)
    by_sev = Counter(str(r.get("severity")) for r in with_v)
    by_det = Counter(str(r.get("detector")) for r in with_v)
    return {
        "schema": "manusift.llm_report.v1",
        "trace_id": trace_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "language": language,
        "llm_calls": llm_calls,
        "stats": {
            "n_eligible_high_medium": sum(
                1 for f in findings if f.severity in ("high", "medium")
            ),
            "n_with_verdict": len(with_v),
            "n_skipped": len(skipped),
            "by_source": dict(by_source),
            "by_severity": dict(by_sev),
            "by_detector": dict(by_det.most_common(30)),
        },
        "items": rows,
    }


def build_llm_report_markdown(payload: dict) -> str:
    lang = payload.get("language") or "zh"
    stats = payload.get("stats") or {}
    zh = lang.startswith("zh")
    lines: list[str] = []
    if zh:
        lines.append(f"# LLM 解读报告")
        lines.append("")
        lines.append(f"- **trace_id**: `{payload.get('trace_id')}`")
        lines.append(f"- **生成时间**: {payload.get('generated_at')}")
        lines.append(f"- **LLM API 调用**: {payload.get('llm_calls')}")
        lines.append(
            f"- **有解读**: {stats.get('n_with_verdict')} / "
            f"候选 high+medium {stats.get('n_eligible_high_medium')}"
        )
        lines.append(f"- **跳过**: {stats.get('n_skipped')}")
        lines.append(f"- **来源分布**: `{json.dumps(stats.get('by_source') or {}, ensure_ascii=False)}`")
        lines.append("")
        lines.append("## 解读条目（按严重度）")
    else:
        lines.append("# LLM interpretation report")
        lines.append("")
        lines.append(f"- **trace_id**: `{payload.get('trace_id')}`")
        lines.append(f"- **generated_at**: {payload.get('generated_at')}")
        lines.append(f"- **llm_calls**: {payload.get('llm_calls')}")
        lines.append(
            f"- **with_verdict**: {stats.get('n_with_verdict')} / "
            f"eligible {stats.get('n_eligible_high_medium')}"
        )
        lines.append(f"- **skipped**: {stats.get('n_skipped')}")
        lines.append("")
        lines.append("## Items")

    items = payload.get("items") or []
    enriched = [r for r in items if r.get("llm_verdict")]
    if not enriched:
        lines.append("")
        lines.append("_No LLM verdicts were produced._" if not zh else "_本次未产生 LLM 解读。_")
        return "\n".join(lines) + "\n"

    for r in enriched:
        lines.append("")
        lines.append(f"### [{r.get('severity')}] {r.get('title')}")
        lines.append(
            f"- detector: `{r.get('detector')}` · "
            f"id: `{r.get('finding_id')}` · "
            f"source: `{r.get('llm_source')}`"
        )
        lines.append(f"- location: {r.get('location')}")
        lines.append(f"- **LLM**: {r.get('llm_verdict')}")
    return "\n".join(lines) + "\n"


def build_llm_report_html(payload: dict) -> str:
    lang = payload.get("language") or "zh"
    zh = str(lang).startswith("zh")
    stats = payload.get("stats") or {}
    title = "LLM 解读报告" if zh else "LLM interpretation report"
    items = [r for r in (payload.get("items") or []) if r.get("llm_verdict")]
    skipped_n = int(stats.get("n_skipped") or 0)

    body_parts: list[str] = []
    if not items:
        body_parts.append(
            '<div class="empty">'
            + ("本次未产生 LLM 解读。" if zh else "No LLM verdicts.")
            + "</div>"
        )
    else:
        for r in items:
            sev = html.escape(str(r.get("severity") or "info"))
            body_parts.append(
                f'<div class="item sev-{sev}" id="{html.escape(str(r.get("finding_id") or ""))}">'
                f"<h3>{html.escape(str(r.get('title') or ''))}</h3>"
                f'<div class="loc">'
                f'<span class="badge">{sev}</span>'
                f'<span class="badge">{html.escape(str(r.get("detector") or ""))}</span>'
                f'<span class="badge">{html.escape(str(r.get("llm_source") or ""))}</span>'
                f"{html.escape(str(r.get('location') or ''))}"
                f"</div>"
                f'<div class="llm"><b>{"解读" if zh else "LLM"}:</b> '
                f"{html.escape(str(r.get('llm_verdict') or ''))}</div>"
                f"</div>"
            )

    skip_note = ""
    if skipped_n:
        skip_note = (
            f'<p class="meta">{"另有" if zh else "Also"} '
            f"{skipped_n} "
            f'{"条 high/medium 未生成解读（跳过/失败）。" if zh else "high/medium items skipped."}'
            f"</p>"
        )

    return f"""<!doctype html>
<html lang="{html.escape(str(lang)[:5])}">
<head>
  <meta charset="utf-8"/>
  <title>{html.escape(title)} — {html.escape(str(payload.get("trace_id") or ""))}</title>
  <style>{_CSS}</style>
</head>
<body>
  <h1>{html.escape(title)}</h1>
  <div class="meta">
    trace_id=<code>{html.escape(str(payload.get("trace_id") or ""))}</code>
    · {html.escape(str(payload.get("generated_at") or ""))}
    · llm_calls={payload.get("llm_calls")}
  </div>
  <div class="stats">
    <div class="stat">{"有解读" if zh else "with verdict"}: <b>{stats.get("n_with_verdict")}</b></div>
    <div class="stat">{"候选 high+medium" if zh else "eligible"}: <b>{stats.get("n_eligible_high_medium")}</b></div>
    <div class="stat">{"跳过" if zh else "skipped"}: <b>{stats.get("n_skipped")}</b></div>
    <div class="stat">sources: <code>{html.escape(json.dumps(stats.get("by_source") or {}, ensure_ascii=False))}</code></div>
  </div>
  {skip_note}
  <h2>{"解读列表" if zh else "Interpretations"}</h2>
  {"".join(body_parts)}
  <p class="meta">{"主检测报告见" if zh else "Detector report:"} <code>report.html</code></p>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Human briefing report (审阅简报) — for people, not agents
# ---------------------------------------------------------------------------

_THEME_MAP_ZH = (
    ("表格数据", ("table_", "stat_", "figure_grim", "figure_stat", "figure_table")),
    ("图像取证", ("image_", "panel_", "page_raster", "ai_generated")),
    ("文本与引用", ("text_", "ref_", "tortured", "citation", "compliance")),
    ("元数据与数据可用性", ("metadata", "pdf_metadata", "supplementary", "data_availability")),
)


def _theme_of(detector: str, zh: bool = True) -> str:
    d = (detector or "").lower()
    for name_zh, prefixes in _THEME_MAP_ZH:
        if any(d.startswith(p) or p in d for p in prefixes):
            if zh:
                return name_zh
            return {
                "表格数据": "Tables & stats",
                "图像取证": "Image forensics",
                "文本与引用": "Text & references",
                "元数据与数据可用性": "Metadata & data availability",
            }.get(name_zh, name_zh)
    return "其他" if zh else "Other"


def _pattern_key(row: dict) -> str:
    """Collapse near-duplicate titles for briefing cards."""
    import re

    title = re.sub(r"\d+", "N", (row.get("title") or "").lower())
    title = re.sub(r"\s+", " ", title).strip()[:80]
    det = row.get("detector") or ""
    src = row.get("llm_source") or ""
    return f"{det}|{src}|{title}"


def _group_patterns(items: list[dict], *, limit_groups: int = 40) -> list[dict]:
    """Group identical patterns; keep one sample verdict + count."""
    buckets: dict[str, dict] = {}
    order: list[str] = []
    for r in items:
        if not r.get("llm_verdict"):
            continue
        key = _pattern_key(r)
        if key not in buckets:
            buckets[key] = {
                "sample": r,
                "count": 0,
                "severities": Counter(),
                "locations": [],
            }
            order.append(key)
        b = buckets[key]
        b["count"] += 1
        b["severities"][str(r.get("severity"))] += 1
        loc = str(r.get("location") or "")
        if loc and loc not in b["locations"] and len(b["locations"]) < 6:
            b["locations"].append(loc)
    groups = [buckets[k] for k in order]
    groups.sort(
        key=lambda g: (
            SEVERITY_ORDER.get(str(g["sample"].get("severity")), 9),
            -g["count"],
        )
    )
    return groups[:limit_groups]


_BRIEF_CSS = """
:root {
  --ink: #1a1a1a; --muted: #5c5c5c; --line: #e8e4dc;
  --paper: #faf8f5; --card: #ffffff; --high: #b91c1c;
  --med: #b45309; --accent: #0f766e; --chip: #f0ebe3;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--paper); color: var(--ink);
  font: 15px/1.65 "Source Han Sans SC", "Noto Sans SC", "PingFang SC",
        "Microsoft YaHei", system-ui, sans-serif;
}
.wrap { max-width: 880px; margin: 0 auto; padding: 40px 28px 80px; }
.cover {
  border-bottom: 2px solid var(--ink); padding-bottom: 20px; margin-bottom: 28px;
}
.cover .kicker {
  letter-spacing: 0.12em; text-transform: uppercase; font-size: 11px;
  color: var(--muted); margin-bottom: 8px;
}
.cover h1 { font-size: 28px; line-height: 1.25; margin: 0 0 10px; font-weight: 700; }
.cover .sub { color: var(--muted); font-size: 13px; }
.hero {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
  margin: 22px 0 28px;
}
@media (max-width: 720px) { .hero { grid-template-columns: repeat(2, 1fr); } }
.hero .n {
  background: var(--card); border: 1px solid var(--line); border-radius: 12px;
  padding: 14px 12px; text-align: center;
}
.hero .n b { display: block; font-size: 26px; font-weight: 700; }
.hero .n span { font-size: 11px; color: var(--muted); }
.hero .n.danger b { color: var(--high); }
.hero .n.warn b { color: var(--med); }
.hero .n.ok b { color: var(--accent); }
.exec {
  background: var(--card); border: 1px solid var(--line); border-radius: 14px;
  padding: 18px 20px; margin-bottom: 28px;
}
.exec h2 { margin: 0 0 10px; font-size: 16px; }
.exec p { margin: 0 0 8px; color: #333; }
.exec ul { margin: 8px 0 0; padding-left: 1.2em; }
.toc {
  background: var(--chip); border-radius: 12px; padding: 14px 18px;
  margin-bottom: 28px; font-size: 13px;
}
.toc a { color: var(--accent); text-decoration: none; margin-right: 14px; }
.toc a:hover { text-decoration: underline; }
section { margin-bottom: 36px; }
section > h2 {
  font-size: 18px; margin: 0 0 6px; padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
}
section > .hint { color: var(--muted); font-size: 12px; margin: 0 0 14px; }
.card {
  background: var(--card); border: 1px solid var(--line); border-radius: 12px;
  padding: 14px 16px; margin: 0 0 12px; position: relative;
}
.card.high { border-left: 5px solid var(--high); }
.card.medium { border-left: 5px solid var(--med); }
.card .top {
  display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  margin-bottom: 6px;
}
.chip {
  font-size: 11px; background: var(--chip); border-radius: 999px;
  padding: 2px 8px; color: #444;
}
.chip.sev-high { background: #fee2e2; color: var(--high); }
.chip.sev-medium { background: #ffedd5; color: var(--med); }
.card h3 { margin: 4px 0 8px; font-size: 15px; font-weight: 600; }
.card .verdict {
  background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px;
  padding: 10px 12px; font-size: 14px; line-height: 1.6;
}
.card .meta-line { font-size: 12px; color: var(--muted); margin-top: 8px; }
.count-pill {
  margin-left: auto; font-size: 12px; font-weight: 600; color: var(--accent);
}
.theme-block { margin-bottom: 22px; }
.theme-block h3 {
  font-size: 14px; margin: 0 0 10px; color: var(--muted);
  letter-spacing: 0.04em;
}
.foot {
  margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--line);
  font-size: 12px; color: var(--muted);
}
.foot a { color: var(--accent); }
@media print {
  body { background: #fff; }
  .card, .exec, .hero .n { break-inside: avoid; }
  .toc { display: none; }
}
"""


def build_llm_briefing_html(payload: dict) -> str:
    """Editorial briefing page for human reviewers (Chinese-first)."""
    lang = str(payload.get("language") or "zh")
    zh = lang.startswith("zh")
    stats = payload.get("stats") or {}
    items = [r for r in (payload.get("items") or []) if r.get("llm_verdict")]
    high = [r for r in items if r.get("severity") == "high"]
    medium = [r for r in items if r.get("severity") == "medium"]
    n_v = int(stats.get("n_with_verdict") or len(items))
    n_el = int(stats.get("n_eligible_high_medium") or 0)
    n_skip = int(stats.get("n_skipped") or 0)
    by_src = stats.get("by_source") or {}
    n_tpl = int(by_src.get("template") or 0)
    n_llm = int(by_src.get("cluster_batch") or 0) + int(
        by_src.get("cap") or 0
    ) + int(by_src.get("verdict") or 0)

    # Executive narrative
    if zh:
        if n_v == 0:
            exec_p = "本次未生成可用的 LLM 解读。请先查看主检测报告 report.html。"
        else:
            risk = "偏高" if len(high) >= 20 else ("中等" if len(high) >= 5 else "可控")
            exec_p = (
                f"本简报汇总人工优先阅读内容。共 {n_el} 条 high/medium 信号中，"
                f"{n_v} 条已有解读（模板 {n_tpl} + 模型 {n_llm}），跳过 {n_skip}。"
                f"其中 high {len(high)}、medium {len(medium)}；综合风险观感：{risk}。"
                "请先看「优先关注」，再按主题浏览；完整条目见 llm_report.html。"
            )
        title = "诚信审阅简报 · LLM 解读"
        kicker = "ManuSift integrity briefing"
        h_exec = "一句话结论"
        h_pri = "优先关注（建议先看）"
        h_theme = "按主题浏览"
        h_note = "阅读说明"
        note_body = (
            "• 主检测报告（证据与原始信号）：report.html<br/>"
            "• 完整 LLM 条目列表：llm_report.html / llm_report.md<br/>"
            "• 本页将重复模式合并为卡片，便于人类扫读；数字 N 表示同类条数。"
        )
        empty = "暂无解读内容。"
        label_high, label_med, label_done, label_api = (
            "高优先级",
            "中优先级",
            "已解读",
            "API 调用",
        )
        same_n = "同类"
        loc_label = "位置"
        more_groups = "更多模式已折叠进完整列表"
    else:
        exec_p = (
            f"{n_v} of {n_el} high/medium findings have interpretations "
            f"({n_tpl} template, {n_llm} model; {n_skip} skipped). "
            f"High={len(high)}, medium={len(medium)}. Start with Priority."
        )
        title = "Integrity briefing · LLM review"
        kicker = "ManuSift"
        h_exec, h_pri, h_theme, h_note = (
            "Executive summary",
            "Priority items",
            "By theme",
            "Notes",
        )
        note_body = (
            "• Detector report: report.html<br/>"
            "• Full LLM list: llm_report.html<br/>"
            "• This page merges repeated patterns for human scanning."
        )
        empty = "No interpretations."
        label_high, label_med, label_done, label_api = (
            "High",
            "Medium",
            "Interpreted",
            "API calls",
        )
        same_n = "similar"
        loc_label = "Where"
        more_groups = "More patterns in the full list"

    # Priority: top high patterns (not raw 700 items)
    pri_groups = _group_patterns(high, limit_groups=12)
    if len(pri_groups) < 8:
        # fill with medium patterns
        for g in _group_patterns(medium, limit_groups=8):
            if len(pri_groups) >= 12:
                break
            pri_groups.append(g)

    def render_card(g: dict, *, show_count: bool = True) -> str:
        r = g["sample"]
        sev = str(r.get("severity") or "medium")
        cnt = int(g["count"])
        count_html = (
            f'<span class="count-pill">×{cnt} {html.escape(same_n)}</span>'
            if show_count and cnt > 1
            else ""
        )
        locs = g.get("locations") or []
        loc_line = ""
        if locs:
            loc_line = (
                f'<div class="meta-line">{html.escape(loc_label)}: '
                f"{html.escape(' · '.join(locs[:4]))}"
                + (" …" if len(locs) > 4 else "")
                + "</div>"
            )
        return (
            f'<article class="card {html.escape(sev)}">'
            f'<div class="top">'
            f'<span class="chip sev-{html.escape(sev)}">{html.escape(sev)}</span>'
            f'<span class="chip">{html.escape(str(r.get("detector") or ""))}</span>'
            f'<span class="chip">{html.escape(str(r.get("llm_source") or ""))}</span>'
            f"{count_html}"
            f"</div>"
            f"<h3>{html.escape(str(r.get('title') or ''))}</h3>"
            f'<div class="verdict">{html.escape(str(r.get("llm_verdict") or ""))}</div>'
            f"{loc_line}"
            f"</article>"
        )

    # Theme sections: group all interpreted items by theme, then pattern
    by_theme: dict[str, list[dict]] = {}
    for r in items:
        th = _theme_of(str(r.get("detector") or ""), zh=zh)
        by_theme.setdefault(th, []).append(r)

    theme_html_parts: list[str] = []
    theme_order = (
        ["表格数据", "图像取证", "文本与引用", "元数据与数据可用性", "其他"]
        if zh
        else [
            "Tables & stats",
            "Image forensics",
            "Text & references",
            "Metadata & data availability",
            "Other",
        ]
    )
    for th in theme_order:
        rows_t = by_theme.get(th) or []
        if not rows_t:
            continue
        groups = _group_patterns(rows_t, limit_groups=15)
        cards = "".join(render_card(g) for g in groups)
        extra = ""
        total = len(rows_t)
        shown = sum(g["count"] for g in groups)
        if total > shown:
            extra = (
                f'<p class="hint">{html.escape(more_groups)} '
                f"({shown}/{total})</p>"
            )
        theme_html_parts.append(
            f'<div class="theme-block" id="theme-{html.escape(th)}">'
            f"<h3>{html.escape(th)} · {total}</h3>"
            f"{cards}{extra}</div>"
        )

    pri_html = (
        "".join(render_card(g) for g in pri_groups)
        if pri_groups
        else f'<div class="empty">{html.escape(empty)}</div>'
    )

    return f"""<!doctype html>
<html lang="{html.escape(lang[:5])}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>{html.escape(title)} — {html.escape(str(payload.get("trace_id") or ""))}</title>
  <style>{_BRIEF_CSS}</style>
</head>
<body>
  <div class="wrap">
    <header class="cover">
      <div class="kicker">{html.escape(kicker)}</div>
      <h1>{html.escape(title)}</h1>
      <div class="sub">
        trace_id <code>{html.escape(str(payload.get("trace_id") or ""))}</code>
        · {html.escape(str(payload.get("generated_at") or ""))}
      </div>
    </header>

    <div class="hero">
      <div class="n danger"><b>{len(high)}</b><span>{html.escape(label_high)}</span></div>
      <div class="n warn"><b>{len(medium)}</b><span>{html.escape(label_med)}</span></div>
      <div class="n ok"><b>{n_v}</b><span>{html.escape(label_done)}</span></div>
      <div class="n"><b>{payload.get("llm_calls") or 0}</b><span>{html.escape(label_api)}</span></div>
    </div>

    <div class="exec" id="exec">
      <h2>{html.escape(h_exec)}</h2>
      <p>{html.escape(exec_p)}</p>
    </div>

    <nav class="toc">
      <a href="#priority">{html.escape(h_pri)}</a>
      <a href="#themes">{html.escape(h_theme)}</a>
      <a href="#notes">{html.escape(h_note)}</a>
      <a href="llm_report.html">{"完整列表" if zh else "Full list"}</a>
      <a href="report.html">{"检测报告" if zh else "Detector report"}</a>
    </nav>

    <section id="priority">
      <h2>{html.escape(h_pri)}</h2>
      <p class="hint">
        {"按模式合并后的高优先级卡片，不是 1000+ 条流水账。" if zh else "Pattern-merged priority cards."}
      </p>
      {pri_html}
    </section>

    <section id="themes">
      <h2>{html.escape(h_theme)}</h2>
      <p class="hint">
        {"表格 / 图像 / 文本等分栏；同类信号合并计数。" if zh else "Grouped by theme; duplicates counted."}
      </p>
      {"".join(theme_html_parts) if theme_html_parts else f'<div class="empty">{html.escape(empty)}</div>'}
    </section>

    <section id="notes">
      <h2>{html.escape(h_note)}</h2>
      <div class="exec"><p>{note_body}</p></div>
    </section>

    <footer class="foot">
      ManuSift · llm_briefing.html
      · <a href="llm_report.html">llm_report.html</a>
      · <a href="report.html">report.html</a>
      · <a href="findings.json">findings.json</a>
    </footer>
  </div>
</body>
</html>
"""


def build_llm_briefing_markdown(payload: dict) -> str:
    """Markdown twin of the human briefing (for email / Obsidian)."""
    lang = str(payload.get("language") or "zh")
    zh = lang.startswith("zh")
    stats = payload.get("stats") or {}
    items = [r for r in (payload.get("items") or []) if r.get("llm_verdict")]
    high = [r for r in items if r.get("severity") == "high"]
    medium = [r for r in items if r.get("severity") == "medium"]
    lines: list[str] = []
    if zh:
        lines += [
            "# 诚信审阅简报 · LLM 解读",
            "",
            f"- trace_id: `{payload.get('trace_id')}`",
            f"- 生成: {payload.get('generated_at')}",
            f"- high / medium / 已解读: **{len(high)}** / **{len(medium)}** / **{stats.get('n_with_verdict')}**",
            f"- API 调用: {payload.get('llm_calls')} · 来源: `{json.dumps(stats.get('by_source') or {}, ensure_ascii=False)}`",
            "",
            "## 优先关注",
            "",
        ]
    else:
        lines += [
            "# Integrity briefing · LLM review",
            "",
            f"- trace_id: `{payload.get('trace_id')}`",
            f"- high/medium/interpreted: {len(high)}/{len(medium)}/{stats.get('n_with_verdict')}",
            "",
            "## Priority",
            "",
        ]

    for g in _group_patterns(high, limit_groups=12):
        r = g["sample"]
        cnt = g["count"]
        suffix = f" (×{cnt})" if cnt > 1 else ""
        lines.append(f"### [{r.get('severity')}] {r.get('title')}{suffix}")
        lines.append(f"- {r.get('detector')} · {r.get('llm_source')}")
        lines.append(f"- {r.get('llm_verdict')}")
        lines.append("")

    lines.append("## " + ("按主题" if zh else "By theme"))
    lines.append("")
    by_theme: dict[str, list[dict]] = {}
    for r in items:
        by_theme.setdefault(_theme_of(str(r.get("detector") or ""), zh=zh), []).append(
            r
        )
    for th, rows_t in by_theme.items():
        lines.append(f"### {th} ({len(rows_t)})")
        for g in _group_patterns(rows_t, limit_groups=8):
            r = g["sample"]
            cnt = g["count"]
            suffix = f" ×{cnt}" if cnt > 1 else ""
            lines.append(f"- **{r.get('title')}**{suffix}: {r.get('llm_verdict')}")
        lines.append("")

    lines.append("---")
    lines.append(
        "完整列表: `llm_report.html` · 检测报告: `report.html`"
        if zh
        else "Full list: `llm_report.html` · Detectors: `report.html`"
    )
    return "\n".join(lines) + "\n"


def write_llm_reports(
    *,
    root_dir: str | "Path",
    trace_id: str,
    findings: list[Finding],
    llm_calls: int,
    language: str = "zh",
) -> dict[str, str]:
    """Write llm_report + human briefing under job root. Returns paths."""
    from pathlib import Path

    root = Path(root_dir)
    root.mkdir(parents=True, exist_ok=True)
    payload = build_llm_report_payload(
        trace_id=trace_id,
        findings=findings,
        llm_calls=llm_calls,
        language=language,
    )
    paths = {
        "json": root / "llm_report.json",
        "md": root / "llm_report.md",
        "html": root / "llm_report.html",
        "briefing_html": root / "llm_briefing.html",
        "briefing_md": root / "llm_briefing.md",
    }
    paths["json"].write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    paths["md"].write_text(build_llm_report_markdown(payload), encoding="utf-8")
    paths["html"].write_text(build_llm_report_html(payload), encoding="utf-8")
    paths["briefing_html"].write_text(
        build_llm_briefing_html(payload), encoding="utf-8"
    )
    paths["briefing_md"].write_text(
        build_llm_briefing_markdown(payload), encoding="utf-8"
    )
    # Plain-language investigation report (secondary human entry)
    try:
        from .plain_investigation import write_plain_investigation

        plain_paths = write_plain_investigation(
            root_dir=root,
            trace_id=trace_id,
            findings=findings,
            llm_calls=llm_calls,
            language=language,
        )
        # plain_paths values are already absolute path strings
        for k, v in plain_paths.items():
            paths[k] = Path(v)
    except Exception:
        # Non-fatal: detector + llm reports still usable
        pass
    # Pairs-localization report (primary human entry)
    try:
        from .investigation_pairs import write_investigation_pairs

        pairs_paths = write_investigation_pairs(
            root_dir=root,
            trace_id=trace_id,
            findings=findings,
            llm_calls=llm_calls,
            language=language,
        )
        for k, v in pairs_paths.items():
            paths[k] = Path(v)
    except Exception:
        pass
    out: dict[str, str] = {}
    for k, v in paths.items():
        out[k] = str(v.resolve()) if hasattr(v, "resolve") else str(v)
    return out
