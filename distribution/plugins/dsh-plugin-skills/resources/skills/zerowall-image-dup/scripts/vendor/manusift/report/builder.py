"""Secondary HTML report builder (early findings dump).

**Not** the batch/MCP primary report path. Prefer
`investigation_pairs.write_investigation_pairs` (see
`docs/REPORT_PATH.md`). Kept for formatters / legacy callers.

Original module purpose: HTML report of findings for TUI/formatters.
"""
from __future__ import annotations

import html
import json
from typing import Iterable

from ..config import Settings
from ..contracts import Finding

SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2, "info": 3}

_CSS = """
:root { color-scheme: light dark; }
body { font: 14px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
       max-width: 920px; margin: 32px auto; padding: 0 20px; }
h1 { font-size: 22px; margin-bottom: 4px; }
.meta { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
.finding { border: 1px solid #d1d5db; border-radius: 8px;
           padding: 12px 16px; margin: 12px 0; }
.sev-high   { border-left: 6px solid #dc2626; }
.sev-medium { border-left: 6px solid #d97706; }
.sev-low    { border-left: 6px solid #2563eb; }
.sev-info   { border-left: 6px solid #6b7280; }
.finding h3 { margin: 0 0 4px; font-size: 15px; }
.finding .loc { color: #6b7280; font-size: 12px; }
.finding pre { background: #f3f4f6; padding: 8px; border-radius: 4px;
               overflow-x: auto; font-size: 12px; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px;
         font-size: 11px; background: #e5e7eb; margin-right: 6px; }
.llm { background: #ecfdf5; border: 1px solid #6ee7b7; padding: 8px;
       border-radius: 4px; margin-top: 8px; font-size: 13px; }
.empty { padding: 24px; border: 1px dashed #d1d5db; border-radius: 8px;
         color: #6b7280; text-align: center; }
.issues-block { margin: 16px 0 24px; }
table.issues { border-collapse: collapse; width: 100%; font-size: 13px; }
table.issues th, table.issues td { border: 1px solid #d1d5db;
         padding: 6px 10px; text-align: left; vertical-align: top; }
table.issues th { background: #f3f4f6; }
"""


def _render_finding(f: Finding) -> str:
    sev = f.severity
    # Full LLM narratives live in standalone llm_report.html; main report
    # only shows a short pointer when a verdict exists.
    verdict_html = ""
    if f.llm_verdict:
        short = f.llm_verdict if len(f.llm_verdict) <= 160 else (
            f.llm_verdict[:157] + "..."
        )
        verdict_html = (
            f'<div class="llm"><b>LLM:</b> {html.escape(short)} '
            f'<i>(full text → llm_report.html)</i></div>'
        )

    raw_repr = json.dumps(f.raw, ensure_ascii=False, indent=2)
    return f"""
    <div class="finding sev-{sev}" id="{f.finding_id}">
      <h3>{html.escape(f.title)}</h3>
      <div class="loc">
        <span class="badge">{html.escape(sev)}</span>
        <span class="badge">{html.escape(f.detector)}</span>
        {html.escape(f.location)}
      </div>
      <p>{html.escape(f.evidence)}</p>
      {verdict_html}
      <details><summary>raw</summary><pre>{html.escape(raw_repr)}</pre></details>
    </div>
    """


def _render_issues(issues: list) -> str:
    """Render the aggregated issues block (P1.1).

    One row per issue: severity, kind, title, contributing detectors and
    member count. The member finding ids link to the finding cards below,
    which remain the authoritative detail view.
    """
    if not issues:
        return ""
    rows: list[str] = []
    for i in issues:
        first = i.finding_ids[0] if i.finding_ids else ""
        link = (
            f'<a href="#{html.escape(first)}">first finding</a>'
            if first
            else ""
        )
        rows.append(
            f'<tr><td><span class="badge">{html.escape(str(i.severity))}</span></td>'
            f"<td>{html.escape(str(i.kind))}</td>"
            f"<td>{html.escape(i.title)}</td>"
            f"<td>{html.escape(', '.join(i.detectors))}</td>"
            f"<td>{i.member_count}</td>"
            f"<td>{link}</td></tr>"
        )
    return (
        '<div class="issues-block">'
        f"<h2>Issues ({len(issues)})</h2>"
        '<p class="meta">Aggregated view: findings pointing at the same '
        "evidence object are grouped into one issue. The flat findings "
        "list below is unchanged.</p>"
        '<table class="issues"><thead><tr>'
        "<th>severity</th><th>kind</th><th>title</th>"
        "<th>detectors</th><th>members</th><th></th>"
        "</tr></thead><tbody>"
        + "".join(rows)
        + "</tbody></table></div>"
    )


def build_report_html(
    trace_id: str,
    findings: Iterable[Finding],
    detectors_run: list[str],
    llm_calls: int,
    settings: Settings,
    detector_summary: dict | None = None,
    issues: list | None = None,
) -> str:
    """Build the HTML report for one pipeline run.

    R-2026-06-13: accepts an optional ``detector_summary``
    dict (the shape written to ``detector_summary.json`` by
    the detector-trace layer). When present, the report
    shows a per-detector summary block (collapsed by
    default, expandable) just under the meta line. When
    absent (older runs / non-pipeline callers), the report
    still renders -- the meta line lists the detector
    names, which is the v0 behaviour.

    P1.1: ``issues`` is the aggregated issue view from
    ``finding_aggregation.aggregate_findings``. When ``None``
    it is computed from ``findings``; an empty list omits the
    block.
    """
    findings_list = sorted(
        findings, key=lambda f: SEVERITY_ORDER.get(f.severity, 99)
    )
    if issues is None:
        from .finding_aggregation import aggregate_findings

        issues = aggregate_findings(findings_list)
    body = (
        "\n".join(_render_finding(f) for f in findings_list)
        if findings_list
        else '<div class="empty">No suspicious patterns detected. ✓</div>'
    )
    summary_block = _render_detector_summary(
        detector_summary, detectors_run
    ) if detector_summary else ""
    issues_block = _render_issues(list(issues))
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>ManuSift report — {html.escape(trace_id)}</title>
  <style>{_CSS}</style>
</head>
<body>
  <h1>ManuSift report</h1>
  <div class="meta">
    trace_id: <code>{html.escape(trace_id)}</code> ·
    detectors: {html.escape(", ".join(detectors_run))} ·
    llm_calls: {llm_calls} ·
    settings.hash_threshold: {settings.image_duplicate_hamming_threshold}
  </div>
  {summary_block}
  {issues_block}
  {body}
</body>
</html>
"""


def _render_detector_summary(
    summary: dict,
    detectors_run: list[str],
) -> str:
    """Render the per-detector summary block.

    Format: a header line with the headline counts
    (``detectors 38/38 done · 5 findings · 7 skipped · 0
    errors``) followed by a table of per-detector rows.
    Each row shows the detector name, status icon, duration,
    finding count, and (for skipped detectors) the reason.

    The block uses Catppuccin Mocha colours (matches the
    rest of the report CSS) and the same icon glyphs as
    the TUI's DetectorTraceBlock.
    """
    if not summary:
        return ""
    total = summary.get("total") or len(detectors_run)
    completed = summary.get("completed", 0)
    skipped = summary.get("skipped", 0)
    error = summary.get("error", 0)
    findings_total = summary.get("findings_total", 0)
    # Headline line.
    parts: list[str] = [f"detectors {completed}/{total} done"]
    if skipped:
        parts.append(f"{skipped} skipped")
    if error:
        parts.append(f"{error} errors")
    if findings_total:
        parts.append(f"{findings_total} findings")
    headline = " · ".join(parts)
    # Per-detector rows.
    detectors = summary.get("detectors") or []
    rows: list[str] = []
    rows.append(
        "<table class=\"detector-summary\"><thead><tr>"
        "<th>status</th><th>detector</th><th>category</th>"
        "<th>duration</th><th>findings</th><th>notes</th>"
        "</tr></thead><tbody>"
    )
    for d in detectors:
        status = d.get("status", "detector.done")
        # Pick the icon and CSS class per status.
        if status == "detector.done":
            icon, klass = "\u2713", "ok"
        elif status == "detector.skipped":
            icon, klass = "\u21b7", "skipped"
        elif status == "detector.error":
            icon, klass = "\u26a0", "error"
        else:  # detector.started / progress
            icon, klass = "\u2807", "running"
        notes = ""
        if status == "detector.skipped" and d.get("skip_reason"):
            notes = html.escape(d["skip_reason"])
        elif status == "detector.error" and d.get("error"):
            notes = html.escape(d["error"])
        elif status in ("detector.started", "detector.progress"):
            notes = html.escape(d.get("phase", "") or "running")
        dur = d.get("duration_ms") or 0
        rows.append(
            f"<tr class=\"detector-row detector-row-{klass}\">"
            f"<td class=\"detector-icon\">{icon}</td>"
            f"<td>{html.escape(d.get('detector', '?'))}</td>"
            f"<td>{html.escape(d.get('category', 'general'))}</td>"
            f"<td>{dur}ms</td>"
            f"<td>{d.get('finding_count', 0)}</td>"
            f"<td>{notes}</td></tr>"
        )
    rows.append("</tbody></table>")
    return (
        f'<div class="detector-summary-block">'
        f'<h2>Detector summary</h2>'
        f'<p class="detector-summary-headline">'
        f'{html.escape(headline)}</p>'
        f'{"".join(rows)}'
        f'</div>'
    )
