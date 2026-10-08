"""Supplementary-file scanner (P2.3).

Many journals require the
authors to upload a
*supplementary* file
alongside the PDF: a
spreadsheet of raw data, a
video, a high-resolution
image, a Jupyter notebook
with the analysis code, or
a separate ``.pdf`` with
extended methods. The
presence of a supplementary
file is a *necessary* (not
sufficient) condition for
reproducibility.

The detector inspects the
PDF for embedded files
(``pikepdf`` exposes
``pdf.embfile_count()``
and ``pdf.embfile_iter()``)
and reports:

  * the number of embedded
    files,
  * the type of each file
    (extension, when
    available),
  * a single combined file
    size.

The detector does not parse
the supplementary files
themselves -- the goal is
to *report their existence*
and let the reviewer decide
whether the contents are
appropriate. A high severity
finding is emitted when no
embedded files are found
*and* the paper claims to
have supplementary material
in the text.

The detector is read-only
and works on the raw PDF
file path stored in
``doc.source_path``.
"""
from __future__ import annotations

import json
from typing import Any

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult


# A small list of
# suspicious file types
# that should not appear
# in a scientific paper.
# We flag them as
# medium-severity findings
# because the most likely
# explanation is "this PDF
# was assembled by a paper
# mill and someone forgot
# to remove the template
# executables" rather than
# "the author deliberately
# embedded malware".
_SUSPICIOUS_EXTS = {
    "exe",
    "dll",
    "bat",
    "sh",
    "msi",
    "js",
    "vbs",
    "scr",
}


def _read_embedded_files(path: str) -> list[dict[str, Any]]:
    """Read the embedded-file
    list from a PDF using
    ``pikepdf``. Returns a
    list of dicts with the
    name, size, and the
    extension of each
    embedded file. The
    function is silent on
    failure: an empty list
    is the conservative
    result."""
    if not path:
        return []
    try:
        import pikepdf
    except ImportError:
        return []
    try:
        with pikepdf.open(path) as pdf:
            try:
                count = len(pdf.attachments)
            except Exception:  # noqa: BLE001
                count = 0
            if count == 0:
                return []
            out: list[dict[str, Any]] = []
            for raw_name in list(pdf.attachments.keys()):
                name = str(raw_name)
                size = 0
                try:
                    data = bytes(
                        pdf.attachments[raw_name].get_file()
                    )
                    size = len(data)
                except Exception:  # noqa: BLE001
                    try:
                        data = bytes(pdf.attachments[raw_name])
                        size = len(data)
                    except Exception:  # noqa: BLE001
                        size = 0
                ext = (
                    name.rsplit(".", 1)[-1].lower()
                    if "." in name
                    else ""
                )
                out.append(
                    {
                        "name": name,
                        "size_bytes": size,
                        "ext": ext,
                    }
                )
            return out
    except Exception:  # noqa: BLE001
        return []


def _claims_supplementary(text: str) -> bool:
    """Return True if the
    document claims to have
    supplementary material.
    Used to decide whether
    the *absence* of embedded
    files is suspicious."""
    import re

    pat = re.compile(
        r"\b(supplementary|supplemental|"
        r"supplement|see\s+supplementary|"
        r"in\s+supplement\s+s\d|"
        r"supplementary\s+material)\b",
        re.IGNORECASE,
    )
    return bool(pat.search(text))


class SupplementaryFileDetector:
    """Inspect the PDF for
    embedded files and flag
    cases where the paper
    claims supplementary
    material but provides
    none."""

    name = "supplementary"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        path = doc.source_path
        files = _read_embedded_files(path)
        text = " ".join(
            getattr(b, "text", "") for b in doc.text_blocks
        )
        findings: list[Finding] = []
        if not files:
            # No embedded
            # files. This is
            # fine for many
            # papers but
            # suspicious if
            # the paper claims
            # to have
            # supplementary
            # material.
            if _claims_supplementary(text):
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity="medium",
                        title=(
                            "Paper claims supplementary "
                            "material but PDF carries no "
                            "embedded files"
                        ),
                        location="pdf",
                        evidence=json.dumps(
                            {
                                "embedded_count": 0,
                                "claims_supplementary": True,
                            }
                        ),
                    )
                )
            return DetectorResult(
                detector=self.name,
                findings=findings,
                ok=True,
            )
        # Found at least one
        # embedded file.
        # Summarise.
        total_size = sum(f["size_bytes"] for f in files)
        names = [f["name"] for f in files]
        suspicious = [
            f for f in files if f["ext"] in _SUSPICIOUS_EXTS
        ]
        if suspicious:
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="high",
                    title=(
                        f"PDF contains {len(suspicious)} "
                        f"suspicious embedded file(s)"
                    ),
                    location="pdf",
                    evidence=json.dumps(
                        {
                            "files": suspicious,
                            "all_files": names,
                        }
                    ),
                )
            )
        # Always emit a "low"
        # info finding so the
        # reviewer can see the
        # file list in the
        # report.
        findings.append(
            Finding.make(
                trace_id=doc.trace_id,
                detector=self.name,
                severity="low",
                title=(
                    f"PDF carries {len(files)} embedded "
                    f"file(s) totalling {total_size} bytes"
                ),
                location="pdf",
                evidence=json.dumps(
                    {
                        "files": names,
                        "sizes": [
                            f["size_bytes"] for f in files
                        ],
                        "total_bytes": total_size,
                    }
                ),
            )
        )
        return DetectorResult(
            detector=self.name,
            findings=findings,
            ok=True,
        )
