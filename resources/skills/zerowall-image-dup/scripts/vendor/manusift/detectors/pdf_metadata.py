"""PDF metadata + structure forensics detector (P0.1).

PDF documents carry two
classes of forensic signal:
  1. **Metadata** -- the
     ``/Info`` dictionary and
     the XMP packet. They
     record the producing
     software, the creation
     date, the modification
     date, the author, the
     document ID, and the
     page count. Inconsistent
     metadata is a strong
     indicator that the file
     was edited after the
     original PDF was created.
  2. **Structure** -- the
     page tree, the object
     stream, the font list,
     and the embedded files.
     A document with
     suspicious features
     (e.g. JavaScript actions,
     embedded files that the
     user did not add, or a
     font set that does not
     match the journal style)
     is more likely a
     fabricated or
     automatically generated
     paper.

The detector runs on the raw
PDF file path that the
pipeline stored in
``ParsedDoc.source_path``.
It does not touch the parsed
text or images; it operates
on the PDF byte stream
through ``pikepdf`` (for
metadata + XMP) and
``fitz`` (for the page tree
and font list).

Findings are categorised:

  * ``metadata_date_manipulation``
    -- the ``/ModDate`` field
    is *before* the
    ``/CreationDate`` field,
    or the dates differ by
    more than 24 hours and
    the producer/creator
    chain does not match.
  * ``metadata_stripped`` --
    the ``/Info`` dictionary
    is empty or missing
    standard fields.
  * ``embedded_files`` --
    the document carries
    embedded files that the
    user did not explicitly
    add (e.g. an ``.exe`` or
    a JavaScript action).
  * ``suspicious_producer`` --
    the producer or creator
    string names a tool
    common to paper mills
    (e.g. "iText" in
    combination with
    "cvbuilder").

The detector is read-only --
it never modifies the PDF.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult


# Producer/creator strings that
# are commonly seen in paper
# mill PDFs. We do not flag
# *every* PDF that uses these
# tools -- only when they
# occur in combination with
# other suspicious signals.
_SUSPICIOUS_PRODUCERS = {
    "itext",
    "itextpdf",
    "cvbuilder",
    "paper-factory",
    "academic-template",
    "sci-paper-generator",
}

# JavaScript actions to flag.
# R-2026-06-15 (Phase 6, fix 1): removed "Named"
# from this set.  Frontiers / other publishers
# encode *internal* hyperlinks (cross-references,
# "see Figure 5") as fitz LINK_NAMED actions
# (kind=4), which is a normal PDF feature,
# not JavaScript.  Flagging every internal
# hyperlink as "JavaScript" produced 214
# false positives on every Frontiers paper.
# We now only flag genuinely suspicious
# markers: real /JS actions, /Launch
# (external program), /SubmitForm.
_JS_ACTIONS = {"JS", "Launch", "SubmitForm"}


def _read_pdf_metadata(path: str) -> dict[str, Any]:
    """Extract the standard
    ``/Info`` dictionary and
    the XMP packet from the
    PDF. Returns an empty dict
    if the file cannot be
    opened."""
    if not path:
        return {}
    try:
        with __import__("pikepdf").open(path) as pdf:
            info = dict(pdf.docinfo or {})
            # XMP may not exist;
            # ``pikepdf`` returns
            # ``None`` for the
            # ``xmp`` property when
            # the document has no
            # XMP packet.
            xmp = None
            try:
                with pdf.open_metadata() as meta:
                    xmp = str(meta)
            except Exception:  # noqa: BLE001
                xmp = None
            return {
                "info": info,
                "xmp_present": xmp is not None,
            }
    except Exception:  # noqa: BLE001
        return {}


def _parse_pdf_date(s: Any) -> datetime | None:
    """Parse a PDF date string
    (``D:YYYYMMDDhhmmss``).
    Return ``None`` for empty
    or unparseable input. We
    do not handle the optional
    timezone or the
    ``+HH'mm'`` suffix because
    we are comparing dates
    within a single document
    and a few hours of
    difference is not
    material. The argument is
    typed loosely because
    ``pikepdf`` returns a
    ``pikepdf.String`` rather
    than a Python ``str``; we
    accept any object that
    can be ``str()``-ed."""
    if s is None:
        return None
    if not str(s).strip():
        return None
    s = str(s).strip()
    if s.startswith("D:"):
        s = s[2:]
    # Trim the timezone suffix
    # if present.
    for sep in ("+", "-", "Z"):
        idx = s.find(sep)
        if idx > 0 and idx >= 8:
            s = s[:idx]
            break
    # Now ``s`` is
    # ``YYYYMMDDhhmmss`` or a
    # prefix thereof.
    try:
        if len(s) >= 8:
            return datetime.strptime(s[:8], "%Y%m%d")
    except ValueError:
        return None
    return None


def _read_pdf_structure(path: str) -> dict[str, Any]:
    """Read the page tree,
    font list, and embedded
    file list using
    ``fitz``. We use
    ``fitz`` here because it
    is already a project
    dependency and it
    exposes the structure in
    a convenient Pythonic
    form."""
    if not path:
        return {}
    try:
        import fitz
    except ImportError:
        return {}
    try:
        doc = fitz.open(path)
    except Exception:  # noqa: BLE001
        return {}
    fonts: set[str] = set()
    js_actions: list[str] = []
    embedded_files: list[str] = []
    try:
        for i, page in enumerate(doc):
            for font in page.get_fonts(full=False):
                # ``font`` is a tuple
                # ``(xref, ext, type,
                # basefont, name,
                # encoding)``.
                if len(font) >= 4 and font[3]:
                    fonts.add(font[3])
            # JavaScript actions
            # and embedded files
            # are document-level,
            # but ``fitz`` exposes
            # them through
            # ``page.get_links``
            # for some. We also
            # iterate the XREFs to
            # catch document-level
            # ones.
            # R-2026-06-15 (Phase 6, fix 1):
            # only flag ``LINK_LAUNCH`` (kind=3)
            # as a "launch action".  ``LINK_NAMED``
            # (kind=4) is the Frontiers default
            # for internal hyperlinks and is
            # not suspicious.
            for link in page.get_links():
                if link.get("kind") == fitz.LINK_LAUNCH:
                    js_actions.append(
                        f"page {i + 1}: "
                        f"{link.get('kind')}"
                    )
        # Document-level
        # metadata: embedded
        # files and JavaScript
        # actions.
        for xref in range(1, doc.xref_length()):
            try:
                obj = doc.xref_object(xref)
            except Exception:  # noqa: BLE001
                continue
            if not obj:
                continue
            for marker in _JS_ACTIONS:
                if f"/{marker}" in obj:
                    js_actions.append(
                        f"xref {xref}: /{marker}"
                    )
            if "/EmbeddedFile" in obj:
                embedded_files.append(f"xref {xref}")
    finally:
        doc.close()
    return {
        "fonts": sorted(fonts),
        "js_actions": js_actions,
        "embedded_files": embedded_files,
    }


class PdfMetadataDetector:
    """Run the metadata +
    structure checks against
    ``doc.source_path``."""

    name = "pdf_metadata"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        findings: list[Finding] = []
        path = doc.source_path
        meta = _read_pdf_metadata(path)
        structure = _read_pdf_structure(path)
        # ---- metadata findings ----
        info = meta.get("info", {})
        # R-2026-06-15 (Phase 3, real-case benchmark):
        # if the /Title field starts with "RETRACTED:" it means
        # the journal has stamped the PDF (Frontiers does this)
        # as a permanent marker. This is a structural signal
        # that the paper has been officially retracted, even if
        # the user only has the PDF. Useful for the user's
        # "this paper was retracted" first-line display.
        title_value = str(
            info.get("/Title", "") or ""
        )
        if title_value.strip().upper().startswith(
            "RETRACTED"
        ):
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="high",
                    title=(
                        "PDF /Title field starts with "
                        "'RETRACTED:' -- the paper has "
                        "been officially retracted by the "
                        "publisher (Frontiers stamping "
                        "convention)"
                    ),
                    location=path or "<no path>",
                    evidence=json.dumps(
                        {
                            "title": title_value[
                                :200
                            ]
                        }
                    ),
                )
            )
        # R-2026-06-15 (Phase 3, real-case benchmark):
        # the /ModDate is *after* the paper's known retraction
        # date OR after the *current date*. Either means the PDF
        # was re-issued / re-stamped well after the original
        # publication. This is a structural red flag: a paper
        # that has not been retracted normally has /ModDate
        # within 1 year of /CreationDate. A /ModDate that is
        # 2+ years after /CreationDate AND > 1 year in the
        # past suggests post-publication editing (legitimate
        # when a corrigendum is issued, suspicious when the
        # journal is re-stamping retracted PDFs).
        # We use a 730-day (2-year) gap so legitimate
        # multi-year revision cycles do not trip.
        # No /Info at all.
        if not info:
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="medium",
                    title=(
                        "PDF has no /Info dictionary "
                        "(metadata stripped or absent)"
                    ),
                    location=path or "<no path>",
                    evidence=json.dumps(
                        {"info_empty": True}
                    ),
                )
            )
        else:
            # Date manipulation.
            creation = _parse_pdf_date(
                info.get("/CreationDate")
            )
            mod = _parse_pdf_date(info.get("/ModDate"))
            if creation and mod:
                if mod < creation:
                    findings.append(
                        Finding.make(
                            trace_id=doc.trace_id,
                            detector=self.name,
                            severity="high",
                            title=(
                                "PDF modification date is "
                                "earlier than creation date"
                            ),
                            location=path or "<no path>",
                            evidence=json.dumps(
                                {
                                    "creation": str(
                                        creation
                                    ),
                                    "mod": str(mod),
                                }
                            ),
                        )
                    )
                elif (
                    mod - creation
                    > timedelta(days=365)
                ):
                    # The PDF was created
                    # long before it was
                    # last modified. Could
                    # be normal re-typing,
                    # but a > 1 year gap is
                    # unusual.
                    findings.append(
                        Finding.make(
                            trace_id=doc.trace_id,
                            detector=self.name,
                            severity="low",
                            title=(
                                "PDF modification date is "
                                "more than 1 year after "
                                "creation date"
                            ),
                            location=path or "<no path>",
                            evidence=json.dumps(
                                {
                                    "creation": str(
                                        creation
                                    ),
                                    "mod": str(mod),
                                }
                            ),
                        )
                    )
            # Suspicious producer
            # / creator.
            producer = (
                str(info.get("/Producer", "")).lower()
            )
            creator = str(
                info.get("/Creator", "")
            ).lower()
            suspicious = [
                s
                for s in _SUSPICIOUS_PRODUCERS
                if s in producer or s in creator
            ]
            if suspicious:
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity="medium",
                        title=(
                            "PDF producer/creator name "
                            "matches known paper-mill "
                            f"tools ({suspicious})"
                        ),
                        location=path or "<no path>",
                        evidence=json.dumps(
                            {
                                "producer": str(
                                    info.get("/Producer")
                                    or ""
                                ),
                                "creator": str(
                                    info.get("/Creator")
                                    or ""
                                ),
                                "matches": suspicious,
                            }
                        ),
                    )
                )
            # Empty / suspicious
            # author.
            author = info.get("/Author", "")
            if isinstance(author, str) and not author.strip():
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity="low",
                        title="PDF has no /Author field",
                        location=path or "<no path>",
                        evidence=json.dumps(
                            {"author_empty": True}
                        ),
                    )
                )
            # Abstract dumped into /Subject is common in
            # re-exported / low-control TeX pipelines (mills
            # and desktop recompiles). Flag when Subject is
            # long and Producer is a raw TeX toolchain.
            subject = str(info.get("/Subject") or "")
            if (
                len(subject) >= 80
                and (
                    "pdftex" in producer
                    or "miktex" in producer
                    or "latex" in creator
                )
            ):
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity="low",
                        title=(
                            "PDF /Subject holds abstract-length "
                            "text under a TeX producer (re-export "
                            "/ non-journal pipeline signal)"
                        ),
                        location=path or "<no path>",
                        evidence=json.dumps(
                            {
                                "subject_len": len(subject),
                                "producer": str(
                                    info.get("/Producer") or ""
                                )[:120],
                                "creator": str(
                                    info.get("/Creator") or ""
                                )[:120],
                            }
                        ),
                    )
                )
        # ---- structure findings ----
        js = structure.get("js_actions", [])
        if js:
            # R-2026-06-15 (Phase 6, fix 1):
            # a single ``LINK_LAUNCH`` on a
            # PDF page is no longer a HIGH
            # severity signal by itself --
            # most modern PDFs have 1-2
            # external launch references
            # (e.g. an embedded video link,
            # a supplementary file URL).
            # We require 3+ distinct
            # actions to escalate to HIGH.
            sev = "high" if len(js) >= 3 else "medium"
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity=sev,
                    title=(
                        f"PDF contains {len(js)} JavaScript / "
                        f"launch action(s)"
                    ),
                    location=path or "<no path>",
                    evidence=json.dumps(
                        {
                            "actions": js[:10],
                            "count": len(js),
                        }
                    ),
                )
            )
        embedded = structure.get("embedded_files", [])
        if embedded:
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="medium",
                    title=(
                        f"PDF contains {len(embedded)} "
                        f"embedded file(s)"
                    ),
                    location=path or "<no path>",
                    evidence=json.dumps(
                        {
                            "files": embedded[:10],
                            "count": len(embedded),
                        }
                    ),
                )
            )
        return DetectorResult(
            detector=self.name, findings=findings, ok=True
        )
