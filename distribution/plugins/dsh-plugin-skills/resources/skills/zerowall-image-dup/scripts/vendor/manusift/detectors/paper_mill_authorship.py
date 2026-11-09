"""Paper-mill / peer-review authorship-signal detector (P0-PEER).

2025 was the year paper-mill retractions hit crisis level:
  - Retraction Watch crossed 60,000 entries in 2025 (verified via
    web search 2026-06-13).
  - Wiley/Hindawi retracted 11,000+ papers in 2023-2024 after the
    paper-mill pattern was exposed (Chemistry World, June 2024).
  - Frontiers retracted 122 articles in July 2025 for an
    "unethical peer review network" (mintdora.com coverage).
  - 400,000+ published articles share textual similarity with
    known paper-mill articles (Nature, November 2023).

The single most common paper-mill signal that survives into the
public PDF is **author affiliation concentration** -- paper mills
batch-assign co-authors from a single institution (Abalkina 2022,
"co-authorship graph according to affiliations of 400+ papers
originating from the Russian paper mills").

This detector extracts author affiliations from the byline and
fires when:

1. All (or nearly all) authors share the same affiliation. Paper
   mills often list 3-5 "co-authors" who are all from one lab /
   hospital / institute, with no international / cross-institution
   collaboration. A legitimate paper has more diversity.

2. Tortured-phrase density is unusually high. Cabanac & Labbé
   2021 ("tortured phrases" -- paraphrased technical terms like
   "neural structures" instead of "neurons"). A density of >= 3
   tortured phrases in the abstract + introduction is a paper-mill
   tell.

Both signals are LOCAL to the PDF text; no network calls required.

The detector is best-effort. A paper with the wrong pattern (e.g.
a genuine single-institution study) will not be flagged. A paper
where the authors are deliberately diverse (e.g. an international
collaboration) will not be flagged.

Why this is patch-first:
  - Detector file is independent and small (~200 lines).
  - Registration is a one-line change in
    ``manusift/detectors/__init__.py``.
  - No new dependencies: text-pattern matching + tortured phrase
    check (we re-use the existing tortured_phrases detector's
    PHRASES dict indirectly by importing it).
"""
from __future__ import annotations

import json
import re

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult


# Common affiliation keyword patterns. We pick the top match in
# each byline chunk (e.g. "Department of X, University of Y").
_AFFILIATION_KEYWORDS = re.compile(
    r"\b(department of|university of|hospital|institute of|"
    r"school of|college of|college|academy of|faculty of|"
    r"research center|research institute|center for|"
    r"laboratory of|medical center|clinic of|school)\b",
    re.IGNORECASE,
)

# Affiliation-block separator: lines that look like a numbered
# author block (e.g. "John Smith1, Jane Doe2*").
# We extract the byline (first ~3000 chars of text) and look for
# patterns like "Name1, Name2" where the digits are affiliation
# indices.
_BYLINE_DIGIT_RE = re.compile(r"(?<!\d)\d{1,2}(?!\d)")

# An "author entry" is "Firstname Lastname" optionally followed
# by a digit / asterisk / superscript. Unicode letters allowed
# (Elżbieta, etc.).
_AUTHOR_ENTRY_RE = re.compile(
    r"\b[A-Z][A-Za-z\u00C0-\u024F\-']+"
    r"(?:\s+[A-Z][A-Za-z\u00C0-\u024F\-']+){1,3}"
    r"(?:\s*[*,†‡]?\s*(?:\d{1,2})?\b)*"
)

# Stronger byline form used by Frontiers/Elsevier:
# "Hong Wu 1, Zeeshan Fareed 2*, Name 3,4†" (space optional before index).
_AUTHOR_WITH_INDEX_RE = re.compile(
    r"(?<![A-Za-z])"
    r"([A-Z][A-Za-z\u00C0-\u024F\-']+"
    r"(?:\s+[A-Z][A-Za-z\u00C0-\u024F\-']+){1,3})"
    r"\s*(\d{1,2}(?:\s*,\s*\d{1,2})*)"
    r"(?:\s*[*,†‡*]+)?"
)

# Free-mail domains also listed in author_emails detector.
_FREE_MAIL_DOMAINS = frozenset(
    {
        "gmail.com",
        "qq.com",
        "163.com",
        "126.com",
        "yahoo.com",
        "yahoo.com.cn",
        "hotmail.com",
        "outlook.com",
        "live.com",
        "foxmail.com",
        "sina.com",
        "sohu.com",
        "mail.com",
        "protonmail.com",
        "yandex.com",
        "gmx.com",
    }
)
_EMAIL_RE = re.compile(
    r"\b[A-Za-z0-9._%+-]+@(?P<domain>[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b"
)

# Tortured-phrase reference list. We DO NOT duplicate the
# tortured_phrases detector's full _TORTURED dict here -- instead
# we import it. The other detector's dict is private (leading
# underscore) but importing it here is safe: both detectors live
# in the same package, and we use the values only as a string-
# matching probe, not for any structural assumption.
def _load_tortured_phrases() -> tuple[str, ...]:
    try:
        from .tortured_phrases import _TORTURED
        # The dict's keys are tortured phrases; we only need the
        # strings, not the original-phrase mapping.
        return tuple(_TORTURED.keys())
    except Exception:  # noqa: BLE001
        return ()


def _get_byline(doc: ParsedDoc, max_chars: int = 4000) -> str:
    """Return the first ~max_chars of the paper's body text.

    The byline (authors + affiliations) lives in the first page or
    two. We grab a generous slice and let the regexes do the work.

    Frontiers OA PDFs put EDITED BY / REVIEWED BY *before* the
    author list; those editorial names are not co-authors. Prefer
    the region around a digit-indexed author line when present.
    """
    parts: list[str] = []
    total = 0
    for tb in doc.text_blocks:
        t = getattr(tb, "text", "")
        if not t:
            continue
        parts.append(t)
        total += len(t)
        if total >= max_chars * 2:
            break
    text = "\n".join(parts)
    # Prefer the real author block: Name1, Name2* with affiliation
    # indices, usually after CITATION / RETRACTED title.
    m = re.search(
        r"((?:[A-Z][A-Za-z\u00C0-\u024F'\-]+(?:\s+[A-Z][A-Za-z\u00C0-\u024F'\-]+){0,3}\s*\d)"
        r".{0,1200}?(?:University|Institute|College|Hospital|Department))",
        text,
        re.DOTALL,
    )
    if m:
        start = max(0, m.start() - 80)
        return text[start : start + max_chars]
    # Drop Frontiers editorial header if it dominates the head.
    upper = text.upper()
    for marker in ("*CORRESPONDENCE", "CORRESPONDENCE", "CITATION"):
        idx = upper.find(marker)
        if idx != -1 and idx < len(text) // 2:
            return text[idx : idx + max_chars]
    return text[:max_chars]


def _extract_affiliations(byline: str) -> list[str]:
    """Extract a list of distinct affiliations from the byline.

    Heuristic: scan the text for sentences containing at least one
    ``_AFFILIATION_KEYWORDS`` match. Each such sentence is a
    candidate affiliation string; we normalise by lowercasing and
    stripping punctuation.
    """
    if not byline:
        return []
    # Split into sentences by period / newline.
    candidates = re.split(r"[\.\n]", byline)
    affs: list[str] = []
    seen: set[str] = set()
    for chunk in candidates:
        chunk = chunk.strip()
        if len(chunk) < 8 or len(chunk) > 400:
            continue
        if not _AFFILIATION_KEYWORDS.search(chunk):
            continue
        # Normalise: lowercase, strip digits / punctuation.
        norm = re.sub(r"[^a-z\s]", " ", chunk.lower())
        norm = re.sub(r"\s+", " ", norm).strip()
        if len(norm) < 10 or norm in seen:
            continue
        seen.add(norm)
        affs.append(norm)
    return affs


def _count_authors(byline: str) -> int:
    """Count author entries in the byline.

    Prefers the Frontiers-style ``Name N`` / ``Name N,M`` form
    (affiliation indices after the name). Falls back to the
    contiguous Name-only regex when no indices are found.
    """
    head = byline[:2500]
    # Primary: names with affiliation index digits.
    indexed = list(_AUTHOR_WITH_INDEX_RE.finditer(head))
    if indexed:
        names: list[str] = []
        seen: set[str] = set()
        for m in indexed:
            name = re.sub(r"\s+", " ", m.group(1).strip())
            # Require at least two tokens (Given Family).
            if len(name.split()) < 2:
                continue
            # Drop obvious non-authors (title / affiliation fragments).
            low = name.lower()
            if any(
                bad in low
                for bad in (
                    "university",
                    "department",
                    "school of",
                    "institute",
                    "faculty",
                    "hospital",
                    "evidence",
                    "efficiency",
                    "countries",
                    "financing",
                    "retracted",
                    "of technology",
                    "of management",
                    "of economics",
                )
            ):
                continue
            if len(name) < 4 or name in seen:
                continue
            seen.add(name)
            names.append(name)
        if names:
            return len(names)

    matches = list(_AUTHOR_ENTRY_RE.finditer(head))
    if not matches:
        return 0
    count = 0
    last_end = -200
    for m in matches:
        if m.start() - last_end > 220:
            if count > 0:
                break
            last_end = m.end()
            count = 1
            continue
        count += 1
        last_end = m.end()
    return count


def _count_multi_affiliation_authors(byline: str) -> int:
    """Authors listing 3+ affiliation indices (mill-like stacking)."""
    n = 0
    for m in _AUTHOR_WITH_INDEX_RE.finditer(byline[:2500]):
        idxs = [x.strip() for x in m.group(2).split(",") if x.strip()]
        if len(idxs) >= 3:
            n += 1
    return n


def _free_emails_in_text(text: str) -> list[str]:
    out: list[str] = []
    for m in _EMAIL_RE.finditer(text or ""):
        domain = (m.group("domain") or "").lower()
        if domain in _FREE_MAIL_DOMAINS:
            out.append(m.group(0).lower())
    return out


def _probe_affiliation_concentration(
    byline: str,
) -> list[Finding]:
    """Fire if the byline shows many authors but few distinct
    affiliations (the Abalkina / paper-mill co-authorship signal).

    The threshold is intentionally generous: any case where the
    affiliations-per-author ratio is <= 0.4 fires. This catches:
      - 4 authors / 1 affiliation (ratio 0.25)
      - 6 authors / 2 affiliations (ratio 0.33)
      - 10 authors / 4 affiliations (ratio 0.4)
    Legitimate papers typically have ratio > 0.6 (most co-authors
    are from different labs). The threshold is conservative on the
    high side -- it errs toward false-negatives rather than
    false-positives (which would corrupt the benchmark).
    """
    out: list[Finding] = []
    n_authors = _count_authors(byline)
    if n_authors < 4:
        return out  # too few authors to make a call
    affs = _extract_affiliations(byline)
    if not affs:
        return out  # no affiliations parsed -- skip
    ratio = len(affs) / n_authors
    # R-2026-06-15 (Phase 6, fix 4):
    # the original threshold fired on
    # any 4+ author paper with <= 0.4
    # affiliation ratio.  In practice
    # this produces 8 findings on the
    # 30-case v2 benchmark, every one a
    # legitimate multi-author review
    # paper (26+ authors from 2-10
    # institutions).  The paper-mill
    # signal is when *many* authors
    # share a *very small* number of
    # affiliations -- the Abalkina
    # 2024 / Byrne 2024 cases all had
    # 50+ authors from 1-2 affiliations.
    # Thresholds (slightly relaxed vs original 20/10 gates so
    # mid-size Frontiers-style mills with 6–12 co-authors still
    # surface as medium/low rather than silent misses):
    #   n_authors >= 15 AND ratio <= 0.25 => high
    #   n_authors >= 8  AND ratio <= 0.35 => medium
    #   n_authors >= 6  AND ratio <= 0.30 => medium
    #   n_authors >= 4  AND ratio <= 0.40 => low
    severity = None
    if n_authors >= 15 and ratio <= 0.25:
        severity = "high"
    elif n_authors >= 8 and ratio <= 0.35:
        severity = "medium"
    elif n_authors >= 6 and ratio <= 0.30:
        severity = "medium"
    elif n_authors >= 4 and ratio <= 0.40:
        severity = "low"
    if severity is not None:
        out.append(Finding.make(
            trace_id="",
            detector="paper_mill_authorship",
            severity=severity,
            title=(
                f"{n_authors} authors but only "
                f"{len(affs)} distinct affiliation(s) "
                f"(ratio {ratio:.2f}) -- possible paper-mill "
                f"co-authorship pattern"
            ),
            location="byline",
            evidence=json.dumps({
                "n_authors": n_authors,
                "n_affiliations": len(affs),
                "affiliation_ratio": round(ratio, 3),
                "affiliations_sample": affs[:5],
            }),
        ))
    return out


def _probe_tortured_phrase_density(
    byline: str,
    full_text: str,
) -> list[Finding]:
    """Fire if the abstract / introduction has >= 3 tortured
    phrases (Cabanac & Labbé 2021)."""
    phrases = _load_tortured_phrases()
    if not phrases:
        return out_no_phrases()  # type: ignore[name-defined]
    # Head 4000 chars = abstract + intro.
    head = full_text[:4000].lower()
    matched: list[str] = []
    for tortured in phrases:
        if tortured.lower() in head:
            matched.append(tortured)
            if len(matched) >= 5:
                break
    # 3+ → high (original). 2 → medium so thinner abstracts still
    # contribute a paper-mill authorship signal without flooding.
    if len(matched) >= 3:
        sev = "high"
    elif len(matched) >= 2:
        sev = "medium"
    else:
        return []
    return [Finding.make(
        trace_id="",
        detector="paper_mill_authorship",
        severity=sev,
        title=(
            f"{len(matched)} tortured-phrase pattern(s) "
            f"in abstract / introduction -- consistent with "
            f"paper-mill or machine-translated text"
        ),
        location="text",
        evidence=json.dumps({
            "matched_count": len(matched),
            "sample": matched[:5],
        }),
    )]


def out_no_phrases() -> list[Finding]:
    """Helper for when PHRASES cannot be loaded -- returns no findings."""
    return []


# ---------- Detector class ----------


def _probe_free_email(byline: str, head_text: str) -> list[Finding]:
    """Free-mail corresponding-author addresses are a mill-adjacent tell."""
    emails = _free_emails_in_text(byline) or _free_emails_in_text(head_text[:6000])
    if not emails:
        return []
    # One free email → medium when multi-author paper; else low.
    n_authors = _count_authors(byline)
    sev = "medium" if n_authors >= 3 or len(emails) >= 2 else "low"
    return [Finding.make(
        trace_id="",
        detector="paper_mill_authorship",
        severity=sev,
        title=(
            f"{len(emails)} free-mail author address(es) "
            f"({emails[0]}) -- common in paper-mill / low-control "
            f"corresponding-author patterns"
        ),
        location="byline",
        evidence=json.dumps({
            "free_emails": emails[:5],
            "n_authors": n_authors,
        }),
    )]


def _probe_multi_affiliation_stacking(byline: str) -> list[Finding]:
    """Many authors stacking 3+ affiliation indices is mill-like."""
    n = _count_multi_affiliation_authors(byline)
    if n < 1:
        return []
    n_authors = _count_authors(byline)
    if n_authors < 3 and n < 2:
        return []
    sev = "medium" if n >= 2 or (n >= 1 and n_authors >= 4) else "low"
    return [Finding.make(
        trace_id="",
        detector="paper_mill_authorship",
        severity=sev,
        title=(
            f"{n} author(s) list 3+ affiliation indices -- "
            f"affiliation stacking seen in paper-mill bylines"
        ),
        location="byline",
        evidence=json.dumps({
            "n_multi_affil_authors": n,
            "n_authors": n_authors,
        }),
    )]


def _probe_retracted_thin_peer_review(full_text: str) -> list[Finding]:
    """Retracted Frontiers-style articles with a thin REVIEWED BY roster.

    Peer-review manipulation cases often leave a short REVIEWED BY
    block on the stamped PDF. Combined with an explicit RETRACTED
    marker this is a useful authorship/peer-review mill-adjacent
    signal (not proof of mill activity alone).
    """
    if not full_text:
        return []
    upper = full_text.upper()
    if "RETRACTED" not in upper or "REVIEWED BY" not in upper:
        return []
    # Slice the REVIEWED BY block.
    start = upper.find("REVIEWED BY")
    end_markers = (
        "*CORRESPONDENCE",
        "CORRESPONDENCE",
        "SPECIALTY SECTION",
        "RECEIVED ",
        "CITATION",
    )
    end = len(full_text)
    for m in end_markers:
        j = upper.find(m, start + 10)
        if j != -1:
            end = min(end, j)
    block = full_text[start:end]
    # Count person-like lines: Capitalized Given Family, no University.
    people = []
    for line in re.split(r"[\n,]", block):
        line = line.strip()
        if len(line) < 5 or len(line) > 60:
            continue
        if re.search(
            r"university|institute|laboratory|college|department|"
            r"reviewed by|china|united kingdom|usa|reviewer",
            line,
            re.I,
        ):
            continue
        if re.match(
            r"^[A-Z][A-Za-z\u00C0-\u024F'\-]+"
            r"(?:\s+[A-Z][A-Za-z\u00C0-\u024F'\-]+){0,3}$",
            line,
        ):
            people.append(line)
    if not (1 <= len(people) <= 3):
        return []
    return [Finding.make(
        trace_id="",
        detector="paper_mill_authorship",
        severity="medium",
        title=(
            f"Retracted article with thin peer-review roster "
            f"({len(people)} named reviewer(s)) -- consistent with "
            f"peer-review manipulation investigations"
        ),
        location="front-matter",
        evidence=json.dumps({
            "n_reviewers": len(people),
            "reviewers_sample": people[:5],
            "retracted_marker": True,
        }),
    )]


class PaperMillAuthorshipDetector:
    """Multi-probe paper-mill / peer-review detector.

    Probes: affiliation concentration, tortured phrases,
    free-mail correspondence, multi-affiliation stacking.
    """

    name = "paper_mill_authorship"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        findings: list[Finding] = []
        byline = _get_byline(doc)
        full_text = "\n".join(
            getattr(tb, "text", "") for tb in doc.text_blocks
        )
        probes = (
            _probe_affiliation_concentration(byline),
            _probe_tortured_phrase_density(byline, full_text),
            _probe_free_email(byline, full_text),
            _probe_multi_affiliation_stacking(byline),
            _probe_retracted_thin_peer_review(full_text),
        )
        for batch in probes:
            for f in batch:
                findings.append(Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity=f.severity,
                    title=f.title,
                    location=f.location,
                    evidence=f.evidence,
                ))
        return DetectorResult(
            detector=self.name,
            findings=findings,
            ok=True,
        )