"""PDF report rendering (Step P2-A1).

Pre-P2-A1, ``GET /api/jobs/<tid>/report`` returned
HTML only. P2-A1 layers a PDF export on top:

  * ``build_report_pdf`` takes the same arguments
    as ``build_report_html`` and returns the
    rendered PDF as ``bytes``.
  * The implementation is a thin wrapper around
    ``weasyprint.HTML(string=html).write_pdf()``.
  * ``weasyprint`` is imported lazily so the
    minimal install (no PDF) still imports
    ``manusift.report`` cleanly. The
    ``build_report_pdf`` function raises a
    clear ``ImportError`` if the dep is
    missing — the endpoint catches that and
    returns a 501 with a helpful message.

P2-A1 deliberately does **not** add new
templating. The PDF is the HTML rendered onto
A4 with a print stylesheet. Operators who want
a different layout can fork
``build_report_html`` — the PDF path is
content-agnostic.
"""
from __future__ import annotations

import logging
from typing import Iterable

from ..config import Settings
from ..contracts import Finding
from .builder import build_report_html

log = logging.getLogger(__name__)


# Public sentinel so callers can distinguish
# "weasyprint missing" from a real error.
class WeasyprintNotInstalled(ImportError):
    """Raised when the ``weasyprint`` package is
    not installed but a caller asked for the
    PDF endpoint. The HTTP layer maps this to
    a 501 with a helpful ``detail`` field."""


def build_report_pdf(
    trace_id: str,
    findings: Iterable[Finding],
    detectors_run: list[str],
    llm_calls: int,
    settings: Settings,
) -> bytes:
    """Render the same content as
    ``build_report_html`` to a PDF byte string.

    The function imports ``weasyprint`` lazily so
    callers that only want HTML never pay the
    import cost. ``weasyprint`` is the
    recommended Python PDF library for HTML
    input because it honors modern CSS, which
    means the report's existing stylesheet
    carries over to print without modification.

    Raises ``WeasyprintNotInstalled`` if
    ``weasyprint`` is not importable. Raises
    any other exception unchanged (a malformed
    finding title, for example, will surface
    as a 500 from the HTTP layer, not as a
    silent 200 with an empty PDF)."""
    html_str = build_report_html(
        trace_id=trace_id,
        findings=findings,
        detectors_run=detectors_run,
        llm_calls=llm_calls,
        settings=settings,
    )
    try:
        from weasyprint import HTML  # type: ignore
    except (ImportError, OSError) as exc:
        # ``OSError`` covers the Windows-only
        # case where weasyprint imports but
        # cannot load libgobject (the GTK
        # runtime). Treat it the same as
        # ``ImportError`` so the endpoint can
        # surface a clean 501.
        raise WeasyprintNotInstalled(
            "PDF export requires the weasyprint package "
            "and its GTK runtime; run "
            "`pip install weasyprint` and ensure "
            "libgobject is on the system PATH."
        ) from exc
    # ``base_url`` lets the renderer find any
    # referenced local assets (we currently have
    # none, but a future icon set would slot in
    # here without a contract change).
    return HTML(
        string=html_str, base_url="."
    ).write_pdf()
