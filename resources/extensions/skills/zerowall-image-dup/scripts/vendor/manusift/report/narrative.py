"""LLM narrative HTML/PDF — secondary enrichment path.

Not the batch default. Primary offline report is investigation_pairs
(docs/REPORT_PATH.md). Narrative runs when LLM enrichment is enabled.

"""
from __future__ import annotations

import html
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

import markdown as md_lib

from ..config import Settings

log = logging.getLogger(__name__)


# Print-friendly CSS. Heavier than the
# flat-dump CSS so that the
# PDF path (weasyprint)
# paginates reasonably: A4
# margins, h1 stays with
# following content, fenced
# code blocks keep
# together.
_NARRATIVE_CSS = """
:root { color-scheme: light dark; }
/* CJK font fallback chain.
   When ``language`` is
   set to ``zh`` /
   ``ja`` / ``ko``, the
   caller patches the
   body font-family via
   inline style (see
   ``build_narrative_report_html``);
   the CJK-aware chain
   here keeps print +
   dark-mode sane even
   for English reports
   because the user's
   browser may still
   serve CJK glyphs
   inside English
   sentences (e.g.
   paper titles). */
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


def _extract_title(markdown_text: str) -> str:
    """Pull the first H1 from
    the markdown so the
    HTML <title> and the
    PDF header are not
    empty.

    Falls back to a
    constant if no H1 is
    present, which the
    skill's spec says
    should never happen
    but the renderer has
    to be defensive about.
    """
    m = re.search(
        r"^\s*#\s+(.+?)\s*$", markdown_text, re.MULTILINE
    )
    if m:
        return m.group(1).strip()
    return "ManuSift integrity report"


def build_narrative_report_html(
    markdown_text: str,
    *,
    trace_id: str = "",
    generated_at: datetime | None = None,
    language: str = "en",
) -> str:
    """Render an LLM-written
    markdown report to a
    styled HTML page.

    The markdown must
    follow the structure in
    ``data/skills/integrity_report.md``
    (Executive Summary,
    Paper Under Review,
    Diagnostic Surface, Key
    Findings, etc.) -- but
    the renderer is lenient
    about ordering and
    headings: any well-
    formed markdown
    produces a valid page.

    ``language`` is a
    BCP-47-ish code
    (``"en"`` / ``"zh"``
    / ``"ja"``). It drives:

      * the ``<html lang=...>``
        attribute so screen
        readers + browser
        font selection kick
        in correctly
      * the verdict-keyword
        regex (English
        ``"high concern"`` vs
        Chinese ``"高关注"``)
      * the file suffix when
        ``save_narrative_report``
        writes the output
        (see that function's
        docstring).

    ``generated_at`` defaults
    to "now in UTC" so the
    LLM does not have to
    write a timestamp.
    """
    if generated_at is None:
        generated_at = datetime.now(timezone.utc)
    title = _extract_title(markdown_text)
    # markdown -> HTML.
    # ``extensions`` we
    # enable:
    #   - ``fenced_code``
    #     so ````` blocks
    #     render as
    #     <pre><code>
    #   - ``tables`` so
    #     pipe tables work
    #   - ``toc`` so the
    #     LLM can put a
    #     short table of
    #     contents at the
    #     top if it wants
    #   - ``sane_lists``
    #     so "1.\n2." is
    #     not glued into
    #     one paragraph.
    html_body = md_lib.markdown(
        markdown_text,
        extensions=[
            "fenced_code",
            "tables",
            "toc",
            "sane_lists",
        ],
        output_format="html5",
    )
    # Inject verdict-
    # colored spans so
    # the LLM can mark
    # verdicts (low/
    # medium / high
    # concern) in the
    # verdict meta line
    # without writing
    # raw HTML. We
    # support both
    # English (high
    # concern) and
    # Chinese (高关注)
    # patterns so a
    # bilingual report
    # works the same
    # way regardless of
    # which language
    # the LLM emitted.
    def _verdict_repl(m: re.Match[str]) -> str:
        level = m.group(2).lower()
        tag = m.group(1)
        # Re-emit the
        # same tag so the
        # visual bold
        # weight is
        # preserved.
        return (
            f'<{tag} class="verdict-{level}">'
            f"{m.group(2)} concern</{tag}>"
        )

    def _verdict_repl_zh(m: re.Match[str]) -> str:
        # Map Chinese
        # severity words
        # to the
        # canonical
        # English class
        # names so the
        # CSS rules
        # (already
        # defined) keep
        # working.
        zh_to_level = {
            "高": "high",
            "中": "medium",
            "低": "low",
        }
        level_word = m.group(2)
        level = zh_to_level.get(level_word, level_word.lower())
        return (
            f'<strong class="verdict-{level}">'
            f"{level_word}关注</strong>"
        )

    html_body = re.sub(
        r"<(strong|b)>\s*(low|medium|high)\s+"
        r"concern\s*</\1>",
        _verdict_repl,
        html_body,
        flags=re.IGNORECASE,
    )
    html_body = re.sub(
        r"<(strong|b)>\s*(高|中|低)\s*关注\s*</\1>",
        _verdict_repl_zh,
        html_body,
    )
    # Footer line: trace
    # id + generation
    # timestamp. The
    # labels are
    # localised so the
    # report footer
    # matches the
    # language of the
    # report body.
    footer_labels = _FOOTER_LABELS.get(language, _FOOTER_LABELS["en"])
    footer_bits: list[str] = []
    if trace_id:
        footer_bits.append(
            f"{footer_labels['trace_id']}: "
            f"<code>{html.escape(trace_id)}</code>"
        )
    footer_bits.append(
        f"{footer_labels['generated']}: "
        f"<code>{html.escape(generated_at.strftime('%Y-%m-%d %H:%M UTC'))}</code>"
    )
    footer_line = " &middot; ".join(footer_bits)
    # Normalise the
    # language code
    # for the
    # <html lang>
    # attribute.
    lang_attr = _HTML_LANG_ATTR.get(language, language)
    # P1.1 (R-2026-06-14): emit a
    # ``<meta name="manusift-report-version"``
    # so a downstream consumer can verify
    # the report was generated by a
    # known schema version without
    # scraping the bundle for
    # ``report.json``.
    from . import REPORT_VERSION
    return f"""<!doctype html>
<html lang="{html.escape(lang_attr)}">
<head>
  <meta charset="utf-8">
  <meta name="manusift-report-version" content="{html.escape(REPORT_VERSION)}">
  <title>{html.escape(title)}</title>
  <style>{_NARRATIVE_CSS}</style>
</head>
<body>
{html_body}
<hr>
<div class="meta">{footer_line}</div>
</body>
</html>
"""


# Per-language footer
# labels. A non-CJK
# language falls back
# to English (the keys
# always exist).
_FOOTER_LABELS: dict[str, dict[str, str]] = {
    "en": {
        "trace_id": "trace_id",
        "generated": "generated",
    },
    "zh": {
        "trace_id": "追踪 ID",
        "generated": "生成时间",
    },
    "ja": {
        "trace_id": "トレース ID",
        "generated": "生成日時",
    },
}


# Map a short language
# code to the BCP-47
# tag the browser
# uses for font
# selection +
# ``<html lang>``.
_HTML_LANG_ATTR: dict[str, str] = {
    "en": "en",
    "zh": "zh-Hans",
    "ja": "ja",
    "ko": "ko",
}


def build_narrative_report_pdf(
    markdown_text: str,
    *,
    trace_id: str = "",
    generated_at: datetime | None = None,
    language: str = "en",
) -> bytes:
    """Render the markdown
    report to PDF bytes via
    the same weasyprint
    path as the flat-dump
    PDF renderer.

    Raises
    ``manusift.report.pdf.WeasyprintNotInstalled``
    if the runtime is
    unavailable (Windows
    without GTK, missing
    pip dep, etc.). The
    HTTP / tool layer
    catches that and
    surfaces a 501 / JSON
    error.
    """
    # Imported lazily so
    # this module loads
    # cleanly on systems
    # without weasyprint.
    from .pdf import WeasyprintNotInstalled
    html_str = build_narrative_report_html(
        markdown_text,
        trace_id=trace_id,
        generated_at=generated_at,
        language=language,
    )
    try:
        from weasyprint import HTML  # type: ignore
    except (ImportError, OSError) as exc:
        raise WeasyprintNotInstalled(
            "PDF export requires weasyprint + GTK runtime"
        ) from exc
    return HTML(
        string=html_str, base_url="."
    ).write_pdf()


def save_narrative_report(
    markdown_text: str,
    *,
    out_dir: Path,
    trace_id: str = "",
    include_pdf: bool = True,
    language: str = "en",
) -> dict[str, str | None]:
    """Write the markdown,
    HTML, and (optionally)
    PDF to ``out_dir``.

    Returns a dict of
    ``{"md": "...", "html":
    "...", "pdf": "..." or
    None}`` so the tool
    layer can show the
    user the absolute
    paths to all generated
    files.

    The caller passes
    ``include_pdf=False``
    if the runtime cannot
    produce PDFs (Windows
    without GTK) -- the
    dict will then have
    ``"pdf": None`` and the
    .md + .html still get
    written so the user is
    never left empty-
    handed.

    ``language`` controls
    the file suffix:
    English reports use
    ``report.md`` /
    ``report.html``;
    Chinese uses
    ``report.zh.md`` /
    ``report.zh.html``.
    This way a single job
    can hold both
    versions without
    overwriting the
    other. The matching
    endpoints
    (``/report.md`` and
    ``/report.zh.md``)
    serve the correct
    file based on the
    suffix.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    suffix = _LANG_FILE_SUFFIX.get(language, "")
    md_path = out_dir / f"report{suffix}.md"
    html_path = out_dir / f"report{suffix}.html"
    md_path.write_text(
        markdown_text, encoding="utf-8"
    )
    html_str = build_narrative_report_html(
        markdown_text,
        trace_id=trace_id,
        language=language,
    )
    html_path.write_text(
        html_str, encoding="utf-8"
    )
    out: dict[str, str | None] = {
        "md": str(md_path),
        "html": str(html_path),
        "pdf": None,
    }
    if include_pdf:
        try:
            pdf_bytes = build_narrative_report_pdf(
                markdown_text,
                trace_id=trace_id,
                language=language,
            )
            pdf_path = out_dir / f"report{suffix}.pdf"
            pdf_path.write_bytes(pdf_bytes)
            out["pdf"] = str(pdf_path)
        except Exception as exc:  # noqa: BLE001
            log.info(
                "PDF export skipped (%s)",
                exc,
            )
    return out


# Suffix used in the
# on-disk file name so
# English + Chinese
# reports can coexist
# in the same job dir.
_LANG_FILE_SUFFIX: dict[str, str] = {
    "en": "",
    "zh": ".zh",
    "ja": ".ja",
    "ko": ".ko",
}