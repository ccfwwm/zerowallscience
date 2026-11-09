"""CLI entry point for the evidence report (R-2026-06-12).

Renders the evidence
report bundle (HTML /
Markdown / PDF / per-
finding JSON) from a
ManuSift ``findings.json``.

Usage::

    python -m manusift.report.evidence_cli \
        --findings real_eval_fraud_cases/cases/case_005_frontiers_cpxra_salmonella_hild/manusift_run/findings.json \
        --out      real_eval_fraud_cases/cases/case_005_frontiers_cpxra_salmonella_hild/evidence_report \
        --paper-id case_005 \
        --pdf      real_eval_fraud_cases/cases/case_005_frontiers_cpxra_salmonella_hild/paper.pdf

If the ``--pdf`` argument
is omitted, the
evidence report can
still render image-only
findings (the source
images live on disk)
but ``panel_dup`` will
not be able to re-
derive the panel
images."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .orchestrator import build_evidence_report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="manusift-evidence-report",
        description=(
            "Render the evidence report bundle "
            "(report.md / report.html / report.pdf / "
            "evidence/evidence_index.json / "
            "evidence/visual/ + evidence/data/ + "
            "evidence/provenance/) from a "
            "ManuSift findings.json."
        ),
    )
    parser.add_argument(
        "--findings",
        type=Path,
        required=True,
        help="Path to findings.json produced by a ManuSift run.",
    )
    parser.add_argument(
        "--out",
        type=Path,
        required=True,
        help="Output directory. Will be created if missing.",
    )
    parser.add_argument(
        "--paper-id",
        type=str,
        default="",
        help="Human-readable paper id used in the report header.",
    )
    parser.add_argument(
        "--pdf",
        type=Path,
        default=None,
        help=(
            "Optional path to the source PDF. "
            "Required for panel_dup findings so the panel "
            "crops can be re-derived."
        ),
    )
    parser.add_argument(
        "--no-pdf",
        action="store_true",
        help="Skip the PDF export (skip weasyprint).",
    )
    args = parser.parse_args(argv)

    if not args.findings.exists():
        parser.error(f"findings file not found: {args.findings}")

    out = build_evidence_report(
        findings_path=args.findings,
        out_dir=args.out,
        paper_id=args.paper_id or args.findings.stem,
        pdf_path=args.pdf,
        write_pdf=not args.no_pdf,
    )
    print(f"wrote {out}")
    print(f"  report.html:   {out / 'report.html'}")
    print(f"  report.md:     {out / 'report.md'}")
    if (out / "report.pdf").exists():
        print(f"  report.pdf:    {out / 'report.pdf'}")
    print(f"  evidence/:     {out / 'evidence'}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
