"""Evidence Report renderer (R-2026-06-12).

Renders the
``EvidenceIndex``
produced by
``evidence_builder``
into three artefacts:

  1. ``report.md`` --
     Markdown
     with
     image
     links
     (works
     in
     any
     viewer
     that
     supports
     relative
     image
     paths).
  2. ``report.html`` --
     Single-page
     self-contained
     HTML
     with
     embedded
     base64
     images
     (works
     in
     any
     browser,
     no
     network
     needed).
  3. ``report.pdf`` --
     PDF
     via
     the
     pre-existing
     ``weasyprint``
     machinery,
     if
     available.
     Falls
     back
     gracefully
     if
     not.

The report has seven
sections matching the
user spec:

  1. Executive Summary
  2. Evidence Map (compact table)
  3. Visual Similarity findings
  4. Numerical Anomaly findings
  5. Source Data / Supplementary
  6. Method Trace
  7. Appendix (link to raw JSON)

The body never inlines
the raw finding JSON --
the spec is explicit
that the main report
should be readable, and
raw data belongs in the
appendix as a link.

R-2026-06-12: the
language rules in the
user spec are important.
The renderer's text
templates use "suspected",
"flagged", "consistent
with", "requires manual
review", etc. -- never
"fabrication" or
"misconduct"."""
from __future__ import annotations

import base64
import html
import json
from pathlib import Path
from typing import Any

from .evidence import (
    EvidenceIndex,
    MetadataFinding,
    NumericalFinding,
    Severity,
    VisualFinding,
)


# Severity
# colour
# map
# --
# the
# user
# spec
# mandates
# consistent
# colours
# for
# risk
# levels.
SEVERITY_COLORS = {
    "critical": "#991b1b",
    "high": "#dc2626",
    "medium": "#d97706",
    "low": "#2563eb",
    "info": "#6b7280",
}


_CSS = """
:root { color-scheme: light dark; }
body { font: 14px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
       max-width: 1080px; margin: 32px auto; padding: 0 20px;
       color: #1f2937; background: #ffffff; }
h1 { font-size: 26px; margin-bottom: 4px; }
h2 { font-size: 18px; margin-top: 32px; border-bottom: 1px solid #e5e7eb;
     padding-bottom: 4px; }
h3 { font-size: 15px; margin-bottom: 4px; }
.meta { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
.summary-bar { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0 16px; }
.summary-chip { padding: 4px 10px; border-radius: 999px; font-size: 12px;
                color: #ffffff; }
.finding { border: 1px solid #e5e7eb; border-radius: 8px;
           padding: 14px 18px; margin: 14px 0; background: #fafafa; }
.finding h3 { margin: 0 0 4px; }
.finding .loc { color: #6b7280; font-size: 12px; margin-bottom: 6px; }
.finding .badge { display: inline-block; padding: 2px 8px;
                  border-radius: 999px; font-size: 11px;
                  background: #e5e7eb; color: #1f2937; margin-right: 6px; }
.finding .reasoning { background: #fff; padding: 8px 10px;
                      border-left: 3px solid #d1d5db; margin: 8px 0; }
.finding .limitations { font-size: 12px; color: #4b5563; }
.finding .sbs { display: block; max-width: 100%; margin: 8px 0;
                border: 1px solid #d1d5db; }
.finding table { width: 100%; border-collapse: collapse; margin: 8px 0; }
.finding th, .finding td { border: 1px solid #e5e7eb; padding: 4px 8px;
                           text-align: left; font-size: 12px; }
.finding th { background: #f3f4f6; }
table.evidence-map { width: 100%; border-collapse: collapse; font-size: 12px; }
table.evidence-map th, table.evidence-map td {
  border: 1px solid #e5e7eb; padding: 4px 8px; text-align: left; }
table.evidence-map th { background: #f3f4f6; }
.empty { padding: 24px; border: 1px dashed #d1d5db; border-radius: 8px;
        color: #6b7280; text-align: center; }
.disclaimer { background: #fef3c7; border: 1px solid #fbbf24;
              padding: 10px 14px; border-radius: 6px; margin: 12px 0;
              font-size: 13px; }
details { margin-top: 6px; }
pre { background: #f3f4f6; padding: 8px; border-radius: 4px;
      overflow-x: auto; font-size: 12px; }
"""


def _embimg(path: Path) -> str:
    """Inline a PNG as a base64 data URL.

    R-2026-06-12: the
    user spec asks for a
    report that is
    *usable in HTML and
    Markdown*. Markdown
    works with relative
    paths, but HTML works
    more reliably with
    inlined base64 (no
    broken links when the
    file is opened from
    another directory or
    downloaded)."""

    if not path.exists():
        return ""
    data = path.read_bytes()
    return f"data:image/png;base64,{base64.b64encode(data).decode()}"


def _summary_bar_html(index: EvidenceIndex) -> str:
    chips = []
    for sev in ("critical", "high", "medium", "low", "info"):
        count = index.summary.get(sev, 0)
        if count == 0:
            continue
        chips.append(
            f'<span class="summary-chip" '
            f'style="background:{SEVERITY_COLORS[sev]}">'
            f'{count} {sev}</span>'
        )
    return '<div class="summary-bar">' + "".join(chips) + "</div>"


def _executive_summary_html(index: EvidenceIndex) -> str:
    by_type = {
        "visual": len(index.visual_findings),
        "numerical": len(index.numerical_findings),
        "metadata": len(index.metadata_findings),
    }
    chips = _summary_bar_html(index)
    return f"""
    <h2>1. Executive Summary</h2>
    <div class="disclaimer">
      <b>Note:</b> These are screening signals, not proof of misconduct.
      All findings require manual review. Severities reflect the
      strength of the pattern, not a determination of intent.
    </div>
    <p>
      Total findings: <b>{sum(index.summary.values())}</b> ·
      Visual: <b>{by_type["visual"]}</b> ·
      Numerical / data: <b>{by_type["numerical"]}</b> ·
      Metadata / reference / compliance: <b>{by_type["metadata"]}</b>
    </p>
    {chips}
    <p>Detectors run: {", ".join(index.detectors_run)}</p>
    """


def _evidence_map_html(index: EvidenceIndex) -> str:
    """Compact table the reviewer scans first.

    R-2026-06-12: the
    user spec is explicit
    that the evidence map
    should be a *compact
    table* with finding
    ID, type, severity,
    location, short
    reason, evidence
    asset link, detector,
    confidence, manual
    review needed. We
    build a row per
    finding across all
    three categories."""

    rows: list[str] = []
    for f in index.visual_findings:
        rows.append(
            "<tr>"
            f"<td><code>{html.escape(f.finding_id)}</code></td>"
            f"<td>visual</td>"
            f'<td><span class="summary-chip" '
            f'style="background:{SEVERITY_COLORS[f.severity.value]}">'
            f'{html.escape(f.severity.value)}</span></td>'
            f"<td>{html.escape(f.location_a.label())} ↔ "
            f"{html.escape(f.location_b.label())}</td>"
            f"<td>{html.escape(f.summary[:120])}</td>"
            f"<td>{html.escape(f.detector)}</td>"
            f"<td>{f.confidence:.2f}</td>"
            f'<td>{"yes" if f.manual_review else "no"}</td>'
            "</tr>"
        )
    for f in index.numerical_findings:
        rows.append(
            "<tr>"
            f"<td><code>{html.escape(f.finding_id)}</code></td>"
            f"<td>numerical</td>"
            f'<td><span class="summary-chip" '
            f'style="background:{SEVERITY_COLORS[f.severity.value]}">'
            f'{html.escape(f.severity.value)}</span></td>'
            f"<td>{html.escape(f.location.label())}</td>"
            f"<td>{html.escape(f.summary[:120])}</td>"
            f"<td>{html.escape(f.detector)}</td>"
            f"<td>{f.confidence:.2f}</td>"
            f'<td>{"yes" if f.result in ("impossible", "inconsistent") else "no"}</td>'
            "</tr>"
        )
    for f in index.metadata_findings:
        rows.append(
            "<tr>"
            f"<td><code>{html.escape(f.finding_id)}</code></td>"
            f"<td>metadata</td>"
            f'<td><span class="summary-chip" '
            f'style="background:{SEVERITY_COLORS[f.severity.value]}">'
            f'{html.escape(f.severity.value)}</span></td>'
            f"<td>{html.escape(f.location.label())}</td>"
            f"<td>{html.escape(f.summary[:120])}</td>"
            f"<td>{html.escape(f.detector)}</td>"
            f"<td>{f.confidence:.2f}</td>"
            f"<td>no</td>"
            "</tr>"
        )
    body = "".join(rows) or '<tr><td colspan="8"><i>No findings.</i></td></tr>'
    return f"""
    <h2>2. Evidence Map</h2>
    <table class="evidence-map">
      <thead>
        <tr>
          <th>ID</th><th>Type</th><th>Severity</th>
          <th>Location</th><th>Short reason</th>
          <th>Detector</th><th>Conf.</th><th>Review?</th>
        </tr>
      </thead>
      <tbody>{body}</tbody>
    </table>
    """


def _visual_finding_html(f: VisualFinding, base_dir: Path) -> str:
    """Render a single visual finding card.

    R-2026-06-12: the
    spec requires the
    card to include the
    side-by-side image,
    the two location
    blocks (page, fig,
    panel, bbox, source
    image, score), the
    metrics block, the
    plain-language
    reasoning, the
    limitations, and the
    manual-review
    suggestions."""

    sbs = base_dir / f.assets.get("side_by_side", "") if f.assets else None
    sbs_html = (
        f'<img class="sbs" alt="side-by-side {f.finding_id}" '
        f'src="{_embimg(sbs)}">'
        if sbs is not None and sbs.exists() else
        '<div class="empty">No side-by-side image could be rendered '
        '(source image missing or panel detection failed).</div>'
    )
    metrics_rows = "".join(
        f"<tr><th>{html.escape(str(k))}</th><td>{html.escape(str(v))}</td></tr>"
        for k, v in f.metrics.items()
    )
    limitations = (
        "<ul>" + "".join(f"<li>{html.escape(l)}</li>" for l in f.limitations) + "</ul>"
        if f.limitations else ""
    )
    manual = (
        "<ul>" + "".join(f"<li>{html.escape(m)}</li>" for m in f.manual_review) + "</ul>"
        if f.manual_review else ""
    )
    return f"""
    <div class="finding" id="{f.finding_id}">
      <h3>{html.escape(f.summary)}</h3>
      <div class="loc">
        <span class="badge"
          style="background:{SEVERITY_COLORS[f.severity.value]};
                 color:#ffffff">{html.escape(f.severity.value)}</span>
        <span class="badge">{html.escape(f.detector)}</span>
        confidence: {f.confidence:.2f}
      </div>
      {sbs_html}
      <table>
        <thead><tr><th>Field</th><th>A</th><th>B</th></tr></thead>
        <tbody>
          <tr>
            <th>Page</th>
            <td>{f.location_a.page or '?'}</td>
            <td>{f.location_b.page or '?'}</td>
          </tr>
          <tr>
            <th>Figure / Panel</th>
            <td>{html.escape(f.location_a.figure or '-') }
                / {html.escape(f.location_a.panel or '-')}</td>
            <td>{html.escape(f.location_b.figure or '-') }
                / {html.escape(f.location_b.panel or '-')}</td>
          </tr>
          <tr>
            <th>BBox</th>
            <td><code>{f.location_a.bbox.as_tuple() if f.location_a.bbox else '-'}</code></td>
            <td><code>{f.location_b.bbox.as_tuple() if f.location_b.bbox else '-'}</code></td>
          </tr>
          <tr>
            <th>Source image</th>
            <td><code>{html.escape(str(f.location_a.source_image or '-'))}</code></td>
            <td><code>{html.escape(str(f.location_b.source_image or '-'))}</code></td>
          </tr>
          <tr>
            <th>Detector score</th>
            <td>{f.location_a.score or '-'}</td>
            <td>{f.location_b.score or '-'}</td>
          </tr>
        </tbody>
      </table>
      <h4>Similarity metrics</h4>
      <table>{metrics_rows or '<tr><td><i>none</i></td></tr>'}</table>
      <h4>Why flagged</h4>
      <div class="reasoning">{html.escape(f.reasoning)}</div>
      <h4>Limitations</h4>
      <div class="limitations">{limitations}</div>
      <h4>Recommended manual review</h4>
      <div>{manual}</div>
    </div>
    """


def _numerical_finding_html(f: NumericalFinding) -> str:
    """Render a single numerical finding card.

    R-2026-06-12: the
    spec requires the
    card to include the
    location, the
    extracted values,
    the test applied,
    the expected
    constraint, the
    observed value, the
    result category
    (impossible /
    inconsistent /
    unusual / weak /
    not testable), the
    reasoning, and the
    limitations. We do
    not label the
    finding as
    'constructed' --
    the most we say is
    'arithmetically
    impossible under
    the stated sample
    size'."""

    inputs = "".join(
        f"<tr><th>{html.escape(str(k))}</th>"
        f"<td><code>{html.escape(str(v))}</code></td></tr>"
        for k, v in f.input_values.items()
    )
    limitations = (
        "<ul>" + "".join(f"<li>{html.escape(l)}</li>" for l in f.limitations) + "</ul>"
        if f.limitations else ""
    )
    # The
    # schema
    # says
    # these
    # fields
    # are
    # strings,
    # but
    # explainers
    # occasionally
    # leave
    # them
    # as
    # numbers
    # or
    # lists
    # (e.g.
    # figure_grim
    # sweeps
    # through
    # a
    # range
    # of
    # n
    # values).
    # Defensive
    # str()
    # so the
    # HTML
    # never
    # crashes.
    expected = str(f.expected_constraint) if f.expected_constraint is not None else "n/a"
    observed = str(f.observed_value) if f.observed_value is not None else "n/a"
    return f"""
    <div class="finding" id="{f.finding_id}">
      <h3>{html.escape(f.summary)}</h3>
      <div class="loc">
        <span class="badge"
          style="background:{SEVERITY_COLORS[f.severity.value]};
                 color:#ffffff">{html.escape(f.severity.value)}</span>
        <span class="badge">{html.escape(f.detector)}</span>
        confidence: {f.confidence:.2f} ·
        page {f.location.page or '?'}
      </div>
      <h4>Test applied</h4>
      <p><b>{html.escape(f.test_name)}</b> — {html.escape(f.test_description)}</p>
      <h4>Extracted values</h4>
      <table>{inputs or '<tr><td><i>none</i></td></tr>'}</table>
      <h4>Expected constraint</h4>
      <p><code>{html.escape(expected)}</code></p>
      <h4>Observed value</h4>
      <p><code>{html.escape(observed)}</code></p>
      <h4>Result</h4>
      <p><b>{html.escape(f.result or 'n/a')}</b></p>
      <h4>Why suspicious</h4>
      <div class="reasoning">{html.escape(f.reasoning)}</div>
      <h4>Limitations</h4>
      <div class="limitations">{limitations}</div>
    </div>
    """


def _metadata_finding_html(f: MetadataFinding) -> str:
    limitations = (
        "<ul>" + "".join(f"<li>{html.escape(l)}</li>" for l in f.limitations) + "</ul>"
        if f.limitations else ""
    )
    return f"""
    <div class="finding" id="{f.finding_id}">
      <h3>{html.escape(f.summary)}</h3>
      <div class="loc">
        <span class="badge"
          style="background:{SEVERITY_COLORS[f.severity.value]};
                 color:#ffffff">{html.escape(f.severity.value)}</span>
        <span class="badge">{html.escape(f.detector)}</span>
        confidence: {f.confidence:.2f}
      </div>
      <div class="reasoning">{html.escape(f.reasoning)}</div>
      <h4>Limitations</h4>
      <div class="limitations">{limitations}</div>
    </div>
    """


def render_html(index: EvidenceIndex, base_dir: Path) -> str:
    """Render the evidence report as a single self-contained HTML page.

    R-2026-06-12: the
    spec requires the
    report to be usable
    in HTML. We
    base64-embed every
    visual asset so the
    file is portable."""

    visual_cards = "".join(
        _visual_finding_html(f, base_dir) for f in index.visual_findings
    ) or '<div class="empty">No visual findings.</div>'
    numerical_cards = "".join(
        _numerical_finding_html(f) for f in index.numerical_findings
    ) or '<div class="empty">No numerical findings.</div>'
    metadata_cards = "".join(
        _metadata_finding_html(f) for f in index.metadata_findings
    ) or '<div class="empty">No metadata findings.</div>'

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>ManuSift evidence report — {html.escape(index.paper_id)}</title>
  <style>{_CSS}</style>
</head>
<body>
  <h1>ManuSift evidence report</h1>
  <div class="meta">
    Paper: <code>{html.escape(index.paper_id)}</code> ·
    Trace: <code>{html.escape(index.trace_id)}</code>
  </div>
  {_executive_summary_html(index)}
  {_evidence_map_html(index)}
  <h2>3. Visual Similarity / Image Integrity</h2>
  {visual_cards}
  <h2>4. Data / Numerical Anomaly</h2>
  {numerical_cards}
  <h2>5. Source Data / Supplementary</h2>
  {_source_data_html(index)}
  <h2>6. Method Trace</h2>
  {_method_trace_html(index)}
  <h2>7. Appendix</h2>
  <p>
    Full evidence index: <code>evidence/evidence_index.json</code><br>
    Per-finding raw JSON: see <code>evidence/data/finding_data_*.json</code>
    and <code>evidence/visual/visual_findings.json</code>.<br>
    Page snapshots and source image maps: <code>evidence/provenance/</code>.
  </p>
</body>
</html>
"""


def _source_data_html(index: EvidenceIndex) -> str:
    has_supplementary = any(
        "supplementary" in d for d in index.detectors_run
    )
    has_dac = any(
        "data_availability_concern" in d for d in index.detectors_run
    )
    bits: list[str] = []
    if has_dac:
        bits.append(
            "<p>ManuSift ran a data-availability audit: it looked for a "
            "dedicated data-availability section in the manuscript. "
            "If no section was found or the section used vague language, "
            "this is recorded as a <i>compliance flag</i> (low severity), "
            "not a determination of misconduct.</p>"
        )
    if has_supplementary:
        bits.append("<p>Supplementary material was located and indexed; "
                    "see the provenance appendix.</p>")
    if not bits:
        bits.append("<p>No source-data or supplementary tools were run on "
                    "this paper.</p>")
    return "".join(bits)


def _method_trace_html(index: EvidenceIndex) -> str:
    """Compact detector summary -- not the full JSON dump.

    R-2026-06-12: the
    spec says the method
    trace should be
    compact, and raw
    JSON belongs in the
    appendix, not inline
    in the main report."""

    items = "".join(
        f"<li><code>{html.escape(d)}</code></li>" for d in index.detectors_run
    )
    return f"<ul>{items}</ul>"


def render_markdown(index: EvidenceIndex, base_dir: Path) -> str:
    """Render the evidence report as Markdown.

    R-2026-06-12: the
    spec says the report
    should be usable in
    Markdown. We use
    relative image paths
    so any Markdown
    viewer (VS Code,
    GitHub, Obsidian) can
    display the side-by-
    side images."""

    lines: list[str] = []
    lines.append(f"# ManuSift evidence report — {index.paper_id}")
    lines.append("")
    lines.append(f"Trace: `{index.trace_id}`")
    lines.append("")
    lines.append("## 1. Executive Summary")
    lines.append("")
    lines.append(
        "> **Note:** These are screening signals, not proof of misconduct. "
        "All findings require manual review."
    )
    lines.append("")
    lines.append(
        f"Total findings: **{sum(index.summary.values())}** "
        f"(visual: {len(index.visual_findings)}, "
        f"numerical: {len(index.numerical_findings)}, "
        f"metadata: {len(index.metadata_findings)})"
    )
    lines.append("")
    for sev in ("critical", "high", "medium", "low", "info"):
        c = index.summary.get(sev, 0)
        if c:
            lines.append(f"- **{c}** {sev}")
    lines.append("")

    # Evidence map
    lines.append("## 2. Evidence Map")
    lines.append("")
    lines.append("| ID | Type | Severity | Location | Reason | Detector | Conf. | Review? |")
    lines.append("|---|---|---|---|---|---|---|---|")
    for f in index.visual_findings:
        lines.append(
            f"| `{f.finding_id}` | visual | {f.severity.value} | "
            f"{f.location_a.label()} ↔ {f.location_b.label()} | "
            f"{f.summary[:80]} | {f.detector} | {f.confidence:.2f} | "
            f"{'yes' if f.manual_review else 'no'} |"
        )
    for f in index.numerical_findings:
        lines.append(
            f"| `{f.finding_id}` | numerical | {f.severity.value} | "
            f"{f.location.label()} | {f.summary[:80]} | {f.detector} | "
            f"{f.confidence:.2f} | "
            f"{'yes' if f.result in ('impossible', 'inconsistent') else 'no'} |"
        )
    for f in index.metadata_findings:
        lines.append(
            f"| `{f.finding_id}` | metadata | {f.severity.value} | "
            f"{f.location.label()} | {f.summary[:80]} | {f.detector} | "
            f"{f.confidence:.2f} | no |"
        )
    lines.append("")

    # Visual findings
    lines.append("## 3. Visual Similarity / Image Integrity")
    lines.append("")
    if not index.visual_findings:
        lines.append("*No visual findings.*")
    for f in index.visual_findings:
        lines.append(f"### `{f.finding_id}` — {f.summary}")
        lines.append("")
        lines.append(
            f"**Severity:** {f.severity.value} · "
            f"**Detector:** {f.detector} · "
            f"**Confidence:** {f.confidence:.2f}"
        )
        lines.append("")
        sbs_rel = f.assets.get("side_by_side")
        if sbs_rel:
            sbs_abs = base_dir / sbs_rel
            rel = Path(sbs_rel).as_posix()
            if sbs_abs.exists():
                lines.append(f"![side-by-side]({rel})")
                lines.append("")
        lines.append("**Location A:** " + f.location_a.full_label())
        lines.append("")
        lines.append("**Location B:** " + f.location_b.full_label())
        lines.append("")
        if f.metrics:
            lines.append("**Metrics:**")
            for k, v in f.metrics.items():
                lines.append(f"- {k}: `{v}`")
            lines.append("")
        lines.append(f"**Why flagged:** {f.reasoning}")
        lines.append("")
        if f.limitations:
            lines.append("**Limitations:**")
            for l in f.limitations:
                lines.append(f"- {l}")
            lines.append("")
        if f.manual_review:
            lines.append("**Recommended manual review:**")
            for m in f.manual_review:
                lines.append(f"- {m}")
            lines.append("")

    # Numerical findings
    lines.append("## 4. Data / Numerical Anomaly")
    lines.append("")
    if not index.numerical_findings:
        lines.append("*No numerical findings.*")
    for f in index.numerical_findings:
        lines.append(f"### `{f.finding_id}` — {f.summary}")
        lines.append("")
        lines.append(
            f"**Severity:** {f.severity.value} · "
            f"**Detector:** {f.detector} · "
            f"**Result:** `{f.result}`"
        )
        lines.append("")
        lines.append(f"**Test:** {f.test_name} — {f.test_description}")
        lines.append("")
        if f.input_values:
            lines.append("**Input values:**")
            for k, v in f.input_values.items():
                lines.append(f"- {k}: `{v}`")
            lines.append("")
        expected = str(f.expected_constraint) if f.expected_constraint is not None else "n/a"
        observed = str(f.observed_value) if f.observed_value is not None else "n/a"
        lines.append(f"**Expected:** {expected}")
        lines.append("")
        lines.append(f"**Observed:** {observed}")
        lines.append("")
        lines.append(f"**Reasoning:** {f.reasoning}")
        lines.append("")
        if f.limitations:
            lines.append("**Limitations:**")
            for l in f.limitations:
                lines.append(f"- {l}")
            lines.append("")

    # Source data
    lines.append("## 5. Source Data / Supplementary")
    lines.append("")
    lines.append(
        "See the `data_availability_concern` finding (if any) for the "
        "manuscript's data-availability statement status. Missing or "
        "unavailable source data is listed as a limitation, not "
        "automatically as misconduct."
    )
    lines.append("")

    # Method trace
    lines.append("## 6. Method Trace")
    lines.append("")
    lines.append("Detectors run:")
    for d in index.detectors_run:
        lines.append(f"- `{d}`")
    lines.append("")

    # Appendix
    lines.append("## 7. Appendix")
    lines.append("")
    lines.append("- Full evidence index: `evidence/evidence_index.json`")
    lines.append("- Visual findings: `evidence/visual/visual_findings.json`")
    lines.append("- Per-finding raw JSON: `evidence/data/finding_data_*.json`")
    lines.append("- Source map: `evidence/provenance/source_map.json`")
    lines.append("")

    return "\n".join(lines)
