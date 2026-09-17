"""Reference-list forensics detectors (P1.2-P1.3).

The reference list at the
end of a paper is one of
the strongest signals of
plagiarism, paper-mill
output, and sloppy
reformatting. Two checks
are especially useful:

  1. **Reference format
     anomaly** -- legitimate
     papers in a single
     journal use one
     reference style
     (Vancouver, APA, etc.)
     and any deviation is
     usually a copy-paste
     error. A paper that
     contains 5+ different
     reference styles is a
     strong fraud signal.
  2. **Duplicate
     reference** -- the same
     DOI, PMID or arXiv ID
     appearing twice with
     *different* author /
     title / year lists is
     a classic paper-mill
     signature (the forger
     cut-and-pasted the
     reference and forgot
     to update the
     metadata). The
     detector matches on
     DOI first (most
     reliable), then PMID,
     then arXiv ID, then
     on a fuzzy title match.

Both detectors run on the
*reference text* that the
pipeline extracts from the
PDF. We do not currently
parse the reference text
into structured fields; the
detector works on the raw
paragraphs and applies a
set of regex-based
heuristics. The quality of
the output is therefore
proportional to the
quality of the reference
extraction.

Borrowed from the
``statcheck`` R package
(reference checks) and the
SAGE journal's author
guidelines on
plagiarism detection.
"""
from __future__ import annotations

import json
import re
from collections import Counter

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult


# Recognise a few common
# reference styles by their
# characteristic
# punctuation. The list is
# not exhaustive; we focus
# on the four most common
# biomedical styles.
_DOI_RE = re.compile(r"\b10\.\d{4,9}/[^\s,;]+")
_PMID_RE = re.compile(r"\bPMID:\s*(\d+)\b", re.IGNORECASE)
_ARXIV_RE = re.compile(r"\barXiv:(\d{4}\.\d{4,5})\b")
_YEAR_RE = re.compile(r"\b((?:19|20)\d{2})\b")
_TITLE_QUOTED = re.compile(r'"([^"]{15,200})"')


def _extract_references(text: str) -> list[str]:
    """Pull the reference
    paragraphs out of the
    document text. Heuristic:
    a paragraph is a
    reference if it starts
    with a digit followed
    by a period or if it
    contains a DOI. We do
    not attempt to recover
    the *exact* reference
    section; we look for
    any line that smells
    like a reference."""
    refs: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        # "1. Smith J, ..." or
        # "[1] Smith J, ..."
        if re.match(r"^(\[\d+\]|\d+[.)])\s+\S", line):
            refs.append(line)
            continue
        if _DOI_RE.search(line):
            refs.append(line)
            continue
        # Catch "Author, A.
        # (2020). Title." style
        # entries by their
        # year in parens.
        if _YEAR_RE.search(line) and len(line) > 30:
            refs.append(line)
            continue
    return refs


def _classify_style(ref: str) -> str:
    """Return a short label for
    the reference style:

      * ``vancouver`` -- "[1]
        Author AB, Author CD.
        Title. Journal. 2020;1:1-10."
      * ``apa`` -- "Author, A.
        (2020). Title. Journal,
        1, 1-10."
      * ``ieee`` -- "[1] A. B.
        Author, "Title," Journal,
        vol. 1, 2020."
      * ``chicago`` -- "Author,
        A. B. \"Title.\" Journal
        1 (2020): 1-10."
      * ``unknown`` -- could
        not classify.

    The classifier uses
    three signals: the
    placement of the year,
    the use of italics /
    quotes for the title,
    and the punctuation
    between the author list
    and the year.
    """
    has_quoted_title = bool(_TITLE_QUOTED.search(ref))
    has_year = bool(_YEAR_RE.search(ref))
    has_doi = bool(_DOI_RE.search(ref))
    has_semicolon = ";" in ref
    if has_quoted_title and "(" in ref and ")" in ref:
        # Chicago-style: year
        # inside parens after
        # the title.
        if not has_semicolon:
            return "chicago"
    if not has_quoted_title and has_year:
        # Vancouver / IEEE:
        # year is a 4-digit
        # number, possibly
        # followed by a
        # semicolon for volume.
        if has_semicolon:
            return "vancouver"
        if has_doi:
            return "ieee"
        return "ieee"
    if has_year and "(" in ref and ")" in ref and not has_quoted_title:
        # APA / Harvard: year
        # inside parens
        # immediately after
        # the author list.
        return "apa"
    if has_year and "," in ref[:20]:
        return "apa"
    return "unknown"


class ReferenceFormatAnomalyDetector:
    """Emit a single finding
    when the reference list
    contains 3+ distinct
    styles."""

    name = "ref_format_anomaly"

    STYLE_THRESHOLD = 3

    def run(self, doc: ParsedDoc) -> DetectorResult:
        text = " ".join(
            getattr(b, "text", "") for b in doc.text_blocks
        )
        if not text:
            return DetectorResult(
                detector=self.name, findings=[], ok=True
            )
        refs = _extract_references(text)
        if len(refs) < self.STYLE_THRESHOLD:
            return DetectorResult(
                detector=self.name, findings=[], ok=True
            )
        styles = Counter(_classify_style(r) for r in refs)
        # Drop "unknown" -- a
        # paper with one unknown
        # reference is not
        # suspicious.
        distinct = {
            s for s, count in styles.items() if count > 0
        }
        # We only flag when
        # *multiple* styles
        # (excluding
        # "unknown") are
        # present.
        real = distinct - {"unknown"}
        if len(real) < self.STYLE_THRESHOLD:
            return DetectorResult(
                detector=self.name, findings=[], ok=True
            )
        finding = Finding.make(
            trace_id=doc.trace_id,
            detector=self.name,
            severity="medium",
            title=(
                f"Reference list mixes {len(real)} "
                f"distinct styles ({sorted(real)})"
            ),
            location="references",
            evidence=json.dumps(
                {
                    "distinct_styles": sorted(real),
                    "style_counts": dict(styles),
                    "reference_count": len(refs),
                }
            ),
        )
        return DetectorResult(
            detector=self.name,
            findings=[finding],
            ok=True,
        )


class DuplicateReferenceDetector:
    """Emit a finding per pair
    of references that share
    a DOI, PMID or arXiv ID
    but disagree on at least
    one of (year, first-author
    surname, title)."""

    name = "ref_duplicate"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        text = " ".join(
            getattr(b, "text", "") for b in doc.text_blocks
        )
        if not text:
            return DetectorResult(
                detector=self.name, findings=[], ok=True
            )
        refs = _extract_references(text)
        if len(refs) < 2:
            return DetectorResult(
                detector=self.name, findings=[], ok=True
            )
        # Build a per-id index.
        # We key on DOI first,
        # then PMID, then arXiv
        # ID.
        id_to_ref: dict[str, list[str]] = {}
        for r in refs:
            for m in _DOI_RE.finditer(r):
                key = "doi:" + m.group(0).rstrip(".,;")
                id_to_ref.setdefault(key, []).append(r)
            for m in _PMID_RE.finditer(r):
                key = "pmid:" + m.group(1)
                id_to_ref.setdefault(key, []).append(r)
            for m in _ARXIV_RE.finditer(r):
                key = "arxiv:" + m.group(1)
                id_to_ref.setdefault(key, []).append(r)
        findings: list[Finding] = []
        for key, group in id_to_ref.items():
            if len(group) < 2:
                continue
            # Compare pairwise --
            # we only flag the
            # first conflicting
            # pair per ID to keep
            # the evidence list
            # short.
            base = group[0]
            for other in group[1:]:
                conflict = _references_conflict(base, other)
                if conflict:
                    findings.append(
                        Finding.make(
                            trace_id=doc.trace_id,
                            detector=self.name,
                            severity=(
                                "low" if conflict == "title" else "high"
                            ),
                            title=(
                                f"Duplicate reference: "
                                f"{key} appears with "
                                f"conflicting metadata ({conflict})"
                            ),
                            location="references",
                            evidence=json.dumps(
                                {
                                    "id": key,
                                    "conflict": conflict,
                                    "ref_a": base[:200],
                                    "ref_b": other[:200],
                                }
                            ),
                        )
                    )
                    break
        return DetectorResult(
            detector=self.name,
            findings=findings,
            ok=True,
        )


def _references_conflict(a: str, b: str) -> str | None:
    """Return the conflict kind when two references with the
    same DOI/PMID/arXiv ID disagree: ``"year"``,
    ``"surname"``, or ``"title"`` -- None when they are
    consistent.

    2026-07 (negative_controls_v1): the fuzzy title check
    fires on perfectly legitimate formatting variance (one
    entry full title, one truncated), which made the
    detector cry "high" on every control paper. Callers now
    map the kind to severity: year/surname conflicts are
    strong (high), title-only variance is low.
    """
    years_a = _YEAR_RE.findall(a)
    years_b = _YEAR_RE.findall(b)
    if years_a and years_b and years_a != years_b:
        return "year"
    # First author surname:
    # the first token that
    # contains a capital
    # letter and is not a
    # number.
    surname_a = _first_surname(a)
    surname_b = _first_surname(b)
    if (
        surname_a
        and surname_b
        and surname_a.lower() != surname_b.lower()
    ):
        return "surname"
    # Title (first 30 chars
    # after the author
    # list). We do not
    # attempt to strip
    # punctuation because
    # that is journal-style
    # dependent.
    title_a = _first_30_after_year(a)
    title_b = _first_30_after_year(b)
    if title_a and title_b and title_a != title_b:
        return "title"
    return None


def _first_surname(ref: str) -> str:
    """Pull the first
    surname from a
    reference paragraph.

    The surname is the
    first token that is at
    least 2 characters and
    contains at least one
    capital letter. We do
    not handle every
    surname format (some
    journals use lowercase
    surnames, some use
    "van Der Berg") but
    the simple heuristic
    catches the common
    case."""
    tokens = re.split(r"[\s,;]+", ref)
    for tok in tokens:
        tok = tok.strip(".,;:'\"()[]")
        if len(tok) >= 2 and any(
            c.isupper() for c in tok
        ):
            return tok
    return ""


def _first_30_after_year(ref: str) -> str:
    """Return the first 30
    characters of the
    text *after* the first
    four-digit year in the
    reference, lowercased
    and stripped of
    punctuation."""
    m = _YEAR_RE.search(ref)
    if not m:
        return ""
    after = ref[m.end() :]
    after = re.sub(r"[^a-z0-9]+", " ", after.lower())
    return after[:30].strip()
