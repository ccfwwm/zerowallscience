"""Paper-mill template detector (P2.4).

A paper mill produces
hundreds of papers from a
small set of templates.
The most visible trace is
the *section structure*:
a paper-mill paper often
uses non-standard section
headings that match
across many papers. Common
examples include:

  * "Introduction and
    Background" instead of
    "Introduction"
  * "Materials and Methods"
    instead of "Methods"
  * "Results and Discussion"
    instead of separate
    "Results" and
    "Discussion" sections
  * "Conclusion and
    Discussion" instead of
    "Conclusion"

The detector extracts the
section headings (lines that
look like "1. Introduction"
or "Methods") and counts
how many of them fall into
each non-standard bucket.
A paper that contains 2+
non-standard headings from
a curated list is flagged.

The detector is read-only
and string-based. The
heuristic is rough -- a
proper implementation
would use a *cross-paper*
database of templates --
but for the *intra-paper*
test a simple count is
enough.

Borrowed from the
"tortured templates"
pattern in COPE / COPEflow
publications and the
"PubPeer template
detection" methodology.
"""
from __future__ import annotations

import json
import re
from typing import Any

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult


# Curated list of
# non-standard section
# headings commonly seen
# in paper-mill output.
# The keys are the
# *normalised* lowercase
# phrase; the values are
# short explanations of
# the conventional
# heading the author
# likely meant.
_NON_STANDARD: dict[str, str] = {
    "introduction and background": "Introduction",
    "background and introduction": "Introduction",
    "background of the study": "Introduction",
    "study background": "Introduction",
    "materials and methods": "Methods",
    "material and methods": "Methods",
    "methodology and methods": "Methods",
    "research methodology": "Methods",
    "experimental section": "Methods",
    "experimental procedure": "Methods",
    "results and discussion": "Results + Discussion",
    "results and analysis": "Results + Analysis",
    "discussion and results": "Discussion",
    "discussion and conclusion": "Discussion",
    "discussion section": "Discussion",
    "conclusion and discussion": "Conclusion",
    "conclusions and discussion": "Conclusion",
    "concluding remarks": "Conclusion",
    "summary and conclusion": "Conclusion",
    "conclusion section": "Conclusion",
    "literature review": "Introduction",
    "theoretical framework": "Introduction",
    "theoretical background": "Introduction",
    # CS paper-mill headings (fraud_web_v1 web_sci_01,
    # retracted over non-standard terminology).
    "associated works": "Related work",
}


# Regex to match a section
# heading. The pattern is
# deliberately permissive:
# "1. Introduction", "I.
# Introduction", "Introduction",
# or "INTRODUCTION".
_HEADING = re.compile(
    r"^\s*(?:\d+\.|\d+\)|\([a-z]\)|[ivx]+\.)?\s*"
    r"([A-Z][A-Za-z][A-Za-z \-]{1,80}[A-Za-z])\s*$"
)


def _normalise_heading(s: str) -> str:
    """Lowercase, collapse
    spaces, strip the
    trailing colon. We do
    *not* strip common
    auxiliary words ("of",
    "the", "and") because
    those are part of the
    template signal."""
    s = s.strip().rstrip(":")
    s = re.sub(r"\s+", " ", s)
    return s.lower()


def _extract_headings(
    text: str, max_headings: int = 50
) -> list[str]:
    """Pull the section
    headings from the
    document text. A heading
    is a short line (< 80
    characters) that starts
    with a capital letter
    and contains no terminal
    punctuation. We do not
    attempt to extract the
    *content* of the
    section -- only the
    heading line.

    The output is
    deduplicated: the same
    heading appearing twice
    (e.g. a TOC entry and
    the body heading) is
    reported only once.
    """
    out: list[str] = []
    seen: set[str] = set()
    for line in text.splitlines():
        line = line.strip()
        if not line or len(line) > 100:
            continue
        m = _HEADING.match(line)
        if not m:
            continue
        heading = m.group(1).strip()
        norm = _normalise_heading(heading)
        if norm in seen:
            continue
        seen.add(norm)
        out.append(heading)
        if len(out) >= max_headings:
            break
    return out


class PaperMillTemplateDetector:
    """Scan the document for
    non-standard section
    headings."""

    name = "paper_mill_template"

    HIGH_SEVERITY_THRESHOLD = 3

    def run(self, doc: ParsedDoc) -> DetectorResult:
        # Join with newlines, NOT spaces: heading extraction
        # is line-based (``_extract_headings`` uses
        # ``splitlines``), and a space join collapses every
        # block onto one giant line, silently hiding headings
        # that live in their own text block (e.g. PLOS
        # "Material and methods"). Regression from
        # fraud_web_v1 (web_plos_02 / web_sci_01).
        text = "\n".join(
            getattr(b, "text", "") for b in doc.text_blocks
        )
        if not text:
            return DetectorResult(
                detector=self.name, findings=[], ok=True
            )
        headings = _extract_headings(text)
        flagged: list[dict[str, Any]] = []
        for h in headings:
            norm = _normalise_heading(h)
            if norm in _NON_STANDARD:
                flagged.append(
                    {
                        "heading": h,
                        "intended": _NON_STANDARD[norm],
                    }
                )
        if not flagged:
            return DetectorResult(
                detector=self.name, findings=[], ok=True
            )
        severity = (
            "high"
            if len(flagged) >= self.HIGH_SEVERITY_THRESHOLD
            else "medium"
        )
        finding = Finding.make(
            trace_id=doc.trace_id,
            detector=self.name,
            severity=severity,
            title=(
                f"Document uses {len(flagged)} "
                f"non-standard section heading(s) "
                f"common in paper-mill output"
            ),
            location="text",
            evidence=json.dumps(
                {
                    "flagged_headings": flagged,
                    "total_headings": len(headings),
                }
            ),
        )
        return DetectorResult(
            detector=self.name,
            findings=[finding],
            ok=True,
        )
