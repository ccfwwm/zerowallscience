"""Evidence report orchestrator — secondary deep-forensic bundle.

Primary batch/MCP screen path: investigation_pairs (docs/REPORT_PATH.md).
Use build_evidence_report for visual/numerical evidence packs only.

"""
from __future__ import annotations

import shutil
from dataclasses import asdict
from pathlib import Path
from typing import Any

from .evidence import write_evidence_index
from .evidence_builder import build_evidence_index
from .evidence_report import render_html, render_markdown


def _copy_stylesheet(out_dir: Path) -> None:
    """Copy the audit-report CSS into ``assets/styles.css``.

    R-2026-06-12: the spec
    asks for an
    ``assets/styles.css``
    that the HTML report
    can load. We write
    a minimal one that
    mirrors the inline
    style we use for the
    rendered HTML, so
    future custom branding
    can replace the file
    in-place without
    touching the renderer.
    """

    assets_dir = out_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    if not (assets_dir / "styles.css").exists():
        (assets_dir / "styles.css").write_text(
            "/* R-2026-06-12: minimal audit-report styles.\n"
            "   Replace this file with your own branding. */\n"
            "body { font-family: system-ui, sans-serif; max-width: 1080px; "
            "margin: 32px auto; padding: 0 20px; }\n"
            ".summary-chip { padding: 4px 10px; border-radius: 999px; "
            "color: white; }\n",
            encoding="utf-8",
        )


def _maybe_write_pdf(html_path: Path, out_dir: Path) -> Path | None:
    """Render the HTML to PDF via weasyprint if available.

    R-2026-06-12: the
    user spec says
    "if PDF export is
    already supported".
    ``manusift.report.pdf``
    already uses
    weasyprint for the
    legacy flat-dump
    report, so we just
    call weasyprint
    directly here with
    our evidence-report
    HTML.

    Returns the PDF path
    on success, or
    ``None`` when
    weasyprint is not
    installed / GTK
    runtime missing / any
    other failure.
    """

    pdf_path = out_dir / "report.pdf"
    try:
        from weasyprint import HTML  # type: ignore
    except (ImportError, OSError):
        return None
    try:
        HTML(string=html_path.read_text(encoding="utf-8"), base_url=str(out_dir)).write_pdf(
            target=str(pdf_path)
        )
        return pdf_path
    except Exception:  # noqa: BLE001
        return None


def build_evidence_report(
    *,
    findings_path: Path,
    out_dir: Path,
    paper_id: str,
    pdf_path: Path | None = None,
    write_pdf: bool = True,
) -> Path:
    """Build the full evidence report bundle.

    Returns the path to
    ``out_dir`` (the
    directory that
    contains
    ``report.md`` /
    ``report.html`` /
    ``report.pdf`` /
    ``evidence/``)."""

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    evidence_dir = out_dir / "evidence"
    evidence_dir.mkdir(parents=True, exist_ok=True)

    # 1. Build
    # the
    # evidence
    # index
    # (also
    # writes
    # per-finding
    # assets
    # and
    # JSON).
    index = build_evidence_index(
        findings_path=findings_path,
        out_dir=evidence_dir,
        paper_id=paper_id,
        pdf_path=pdf_path,
    )

    # 2. Write
    # the
    # evidence
    # index
    # JSON.
    write_evidence_index(index, evidence_dir / "evidence_index.json")

    # 3. Render
    # Markdown
    # and
    # HTML.
    md_text = render_markdown(index, evidence_dir)
    (out_dir / "report.md").write_text(md_text, encoding="utf-8")

    html_text = render_html(index, evidence_dir)
    html_path = out_dir / "report.html"
    html_path.write_text(html_text, encoding="utf-8")

    # 4. PDF
    # if
    # we
    # can.
    if write_pdf:
        pdf_path = _maybe_write_pdf(html_path, out_dir)
        if pdf_path is None:
            # weasyprint
            # not
            # available
            # or
            # failed.
            # The
            # spec
            # says
            # "if
            # PDF
            # export
            # is
            # already
            # supported".
            # We
            # silently
            # skip
            # when
            # not.
            pass

    # 5. Copy
    # stylesheet.
    _copy_stylesheet(out_dir)

    return out_dir
