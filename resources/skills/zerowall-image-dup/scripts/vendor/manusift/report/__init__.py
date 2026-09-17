"""Report subpackage (P2-A1)."""
from __future__ import annotations

# P1.1 (R-2026-06-14): the schema
# version for every JSON artifact
# the render tool writes
# (``report.json``, ``raw_trace.json``,
# ``tool_summary.json``,
# ``evidence_assets/manifest.json``)
# and the ``<meta
# name="manusift-report-version">`` in
# the HTML. Bump this string when
# adding fields; downstream consumers
# parse it as a literal.
REPORT_VERSION = "manusift.report.v1"

# P2-A1 — the PDF export is imported lazily
# inside ``build_report_pdf`` so the minimal
# install (no weasyprint) still imports
# ``manusift.report`` cleanly. We re-export the
# helper at the top level so callers can do
# ``from manusift.report import build_report_pdf``
# and get a clear error at call time if the
# dependency is missing.
from .builder import build_report_html
from .narrative import (
    build_narrative_report_html,
    build_narrative_report_pdf,
    save_narrative_report,
)
from .pdf import WeasyprintNotInstalled, build_report_pdf

__all__ = [
    "REPORT_VERSION",
    "build_report_html",
    "build_report_pdf",
    "build_narrative_report_html",
    "build_narrative_report_pdf",
    "save_narrative_report",
    "WeasyprintNotInstalled",
]
