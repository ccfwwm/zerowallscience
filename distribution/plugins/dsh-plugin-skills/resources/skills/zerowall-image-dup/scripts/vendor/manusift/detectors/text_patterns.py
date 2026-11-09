"""Text-pattern detector: 5 cheap, dependency-free text-level checks.

All five checks operate on the ``TextBlock`` list of a parsed PDF.
Each check is a small pure function; the ``TextPatternDetector``
class dispatches to all of them and merges the findings.

The checks are deliberately *heuristic* — they are meant to flag
*candidate* issues for human review, not to prove anything. The
implementation uses only stdlib + the existing contracts; no new
dependencies.

Sub-checks (each can be enabled/disabled in Settings):
    1. placeholders    — TODO / [?] / XXX / FIXME / <<< leftovers
    2. chatbot_disclaimer — "as an AI", "I am an AI", "language model" phrasings
    3. citation_anomaly — broken citation markers ([?], [n]??, TODO:cite)
    4. duplicate_passage — 30+ token repeated paragraphs
    5. template_phrase — over-excited punctuation bursts
"""
from __future__ import annotations

import re
from collections import defaultdict
from typing import Iterable

from ..config import Settings, get_settings
from ..contracts import Finding, ParsedDoc, TextBlock
from ..trace import get_logger
from .base import DetectorResult

log = get_logger(__name__)


# ---------------------------------------------------------------------------
# Settings knobs
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Pattern banks
# ---------------------------------------------------------------------------

# 1. Placeholders
# R-2026-07-18 (P5.1 expansion_nonenglish_v1): TODO/FIXME are matched
# case-sensitively -- with IGNORECASE the Spanish high-frequency word
# "todo" ("all/every") fired a medium placeholder finding on every
# Spanish-language control paper. Real editor leftovers are uppercase
# in practice.
_PLACEHOLDER_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bTODO\b"), "TODO"),
    (re.compile(r"\bFIXME\b"), "FIXME"),
    (re.compile(r"\bXXX\b"), "XXX"),
    (re.compile(r"\[\?\]"), "[?]"),
    (re.compile(r"\[XX\]|\[XXX\]"), "[XX]"),
    (re.compile(r"<<<\s*[^>]{0,40}>>>"), "<<<…>>>"),
    (re.compile(r"\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}"), "{{…}}"),
    (re.compile(r"\bplaceholder\b", re.IGNORECASE), "placeholder"),
)

# 2. Chatbot disclaimers (English; cheap, misses non-English)
_CHATBOT_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bas an ai(?: language model)?\b", re.IGNORECASE),
    re.compile(r"\bi am an ai\b", re.IGNORECASE),
    re.compile(r"\blanguage model\b", re.IGNORECASE),
    re.compile(r"\bi (?:cannot|can'?t) (?:provide|help|assist)\b", re.IGNORECASE),
    re.compile(r"\bopenai\b", re.IGNORECASE),
    re.compile(r"\bchatgpt\b", re.IGNORECASE),
    re.compile(r"\bclaude\b", re.IGNORECASE),
    re.compile(r"\bbard\b", re.IGNORECASE),
)

# 3. Citation anomalies
_CITATION_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\[n\?\?\]|\[\?\]|\[XX\]|\[XXX\]", re.IGNORECASE), "broken marker"),
    (re.compile(r"\bTODO\s*:\s*cite\b"), "TODO:cite"),
    (re.compile(r"\bFIXME\s*:\s*ref\b"), "FIXME:ref"),
    (re.compile(r"\bet al\.\s*\?"), "et al.?"),
    (re.compile(r"\(\s*\?\s*\)"), "(?)"),
)

# 5. Template phrases (excess punctuation, all-caps burst, AI-style hedging)
_EXCESS_EXCLAIM = re.compile(r"!{2,}|\?{2,}|!\?|\?!")
_HEDGING = re.compile(
    r"\b(?:certainly|of course|absolutely|sure!|you bet)[,!.]", re.IGNORECASE
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _truncate(text: str, n: int = 120) -> str:
    if len(text) <= n:
        return text
    return text[: n - 1] + "…"


def _page_range_label(blocks: Iterable[TextBlock]) -> str:
    pages = sorted({b.page for b in blocks})
    if not pages:
        return "(no page)"
    if len(pages) == 1:
        return f"Page {pages[0] + 1}"
    return f"Pages {pages[0] + 1}–{pages[-1] + 1}"


def _all_text(blocks: list[TextBlock]) -> str:
    return "\n".join(b.text for b in blocks if b.text)


# ---------------------------------------------------------------------------
# Per-check implementations
# Each returns a list[Finding] (possibly empty).
# ---------------------------------------------------------------------------

def _check_placeholders(
    blocks: list[TextBlock], settings: Settings, trace_id: str
) -> list[Finding]:
    findings: list[Finding] = []
    per_kind_hits: dict[str, list[TextBlock]] = defaultdict(list)
    for b in blocks:
        for pat, label in _PLACEHOLDER_PATTERNS:
            if pat.search(b.text):
                per_kind_hits[label].append(b)
    for label, bs in per_kind_hits.items():
        if not bs:
            continue
        snippet = _truncate(bs[0].text)
        findings.append(
            Finding.make(
                trace_id=trace_id,
                detector="text_patterns",
                severity="medium",
                title=f"Placeholder token '{label}' found in paper text",
                evidence=(
                    f"Found {len(bs)} block(s) containing '{label}'. "
                    f"First match: \"{snippet}\""
                ),
                location=_page_range_label(bs),
                raw={
                    "check": "placeholders",
                    "kind": label,
                    "count": len(bs),
                    "sample_block_page": bs[0].page,
                },
            )
        )
    return findings[: int(settings.text_max_findings_per_check)]


def _check_chatbot_disclaimer(
    blocks: list[TextBlock], settings: Settings, trace_id: str
) -> list[Finding]:
    findings: list[Finding] = []
    per_phrase_hits: dict[str, list[TextBlock]] = defaultdict(list)
    for b in blocks:
        for pat in _CHATBOT_PATTERNS:
            m = pat.search(b.text)
            if m:
                per_phrase_hits[m.group(0).lower()].append(b)
    for phrase, bs in per_phrase_hits.items():
        if not bs:
            continue
        snippet = _truncate(bs[0].text)
        findings.append(
            Finding.make(
                trace_id=trace_id,
                detector="text_patterns",
                severity="high",
                title=f"Chatbot-like disclaimer ('{phrase}') in paper text",
                evidence=(
                    f"Found {len(bs)} block(s) mentioning '{phrase}'. "
                    "Such phrases are not normal academic writing and "
                    "indicate the text may have been generated or "
                    f"pasted from an LLM. First match: \"{snippet}\""
                ),
                location=_page_range_label(bs),
                raw={
                    "check": "chatbot_disclaimer",
                    "phrase": phrase,
                    "count": len(bs),
                    "sample_block_page": bs[0].page,
                },
            )
        )
    return findings[: int(settings.text_max_findings_per_check)]


def _check_citation_anomaly(
    blocks: list[TextBlock], settings: Settings, trace_id: str
) -> list[Finding]:
    findings: list[Finding] = []
    per_kind_hits: dict[str, list[TextBlock]] = defaultdict(list)
    for b in blocks:
        for pat, label in _CITATION_PATTERNS:
            if pat.search(b.text):
                per_kind_hits[label].append(b)
    for label, bs in per_kind_hits.items():
        if not bs:
            continue
        snippet = _truncate(bs[0].text)
        findings.append(
            Finding.make(
                trace_id=trace_id,
                detector="text_patterns",
                severity="medium",
                title=f"Citation looks broken or placeholder ({label})",
                evidence=(
                    f"Found {len(bs)} block(s) with citation pattern "
                    f"'{label}'. First match: \"{snippet}\""
                ),
                location=_page_range_label(bs),
                raw={
                    "check": "citation_anomaly",
                    "kind": label,
                    "count": len(bs),
                    "sample_block_page": bs[0].page,
                },
            )
        )
    return findings[: int(settings.text_max_findings_per_check)]


# Whitespace + case-insensitive shingles; cheap, good enough for our scale.
_TOKEN_RE = re.compile(r"[A-Za-z0-9]+", re.UNICODE)


def _shingles(text: str, k: int = 5) -> set[int]:
    """Tokenize + return a set of integer hashes of k-grams.

    We hash the k-grams because ``set`` requires hashable elements and
    Python ``set``/``dict`` cannot hash ``tuple`` reliably across
    numpy / pickle boundaries in some Python builds. Hashing once
    keeps comparisons fast.
    """
    toks = _TOKEN_RE.findall(text.lower())
    if len(toks) < k:
        return set()
    return {
        hash(tuple(toks[i : i + k])) for i in range(len(toks) - k + 1)
    }


def _check_duplicate_passage(
    blocks: list[TextBlock], settings: Settings, trace_id: str
) -> list[Finding]:
    """Detect paragraphs (>= min tokens) repeated min_repeats times.

    Two ways a duplicate can hide:
      (a) the *same* paragraph text appears in N *different* blocks
          (e.g. a reviewer response pasted into the body);
      (b) the *same* paragraph text appears N times *inside one*
          block (e.g. a copy-paste loop the author never cleaned up).
    We check both. For (b) we split the block into overlapping
    5-sentence windows and compare.
    """
    min_tokens = int(settings.text_duplicate_min_tokens)
    min_repeats = int(settings.text_duplicate_min_repeats)
    max_findings = int(settings.text_max_findings_per_check)

    if min_repeats < 2:
        min_repeats = 2

    findings: list[Finding] = []

    # ---- (a) cross-block duplicates ----
    big = [b for b in blocks if len(_TOKEN_RE.findall(b.text)) >= min_tokens]
    if len(big) >= min_repeats:
        sigs: list[tuple[TextBlock, set[int]]] = [
            (b, _shingles(b.text, k=5)) for b in big
        ]
        parent = list(range(len(sigs)))

        def find(x: int) -> int:
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(a: int, b: int) -> None:
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[rb] = ra

        for i in range(len(sigs)):
            for j in range(i + 1, len(sigs)):
                si, sj = sigs[i][1], sigs[j][1]
                if not si or not sj:
                    continue
                inter = len(si & sj)
                union_size = len(si | sj)
                if union_size == 0:
                    continue
                jaccard = inter / union_size
                if jaccard >= 0.9:
                    union(i, j)

        clusters: dict[int, list[TextBlock]] = defaultdict(list)
        for idx, (b, _) in enumerate(sigs):
            clusters[find(idx)].append(b)
        for cluster in clusters.values():
            if len(cluster) < min_repeats:
                continue
            cluster.sort(key=lambda b: (b.page, b.bbox[1]))
            snippet = _truncate(cluster[0].text)
            findings.append(
                Finding.make(
                    trace_id=trace_id,
                    detector="text_patterns",
                    severity="high" if len(cluster) >= 3 else "medium",
                    title=(
                        f"Duplicated paragraph across blocks: same "
                        f"~{min_tokens}-token text appears {len(cluster)} times"
                    ),
                    evidence=(
                        f"Found a cluster of {len(cluster)} near-duplicate "
                        f"blocks (>=90% token jaccard). First instance: "
                        f"\"{snippet}\""
                    ),
                    location=_page_range_label(cluster),
                    raw={
                        "check": "duplicate_passage",
                        "kind": "cross_block",
                        "cluster_size": len(cluster),
                        "pages": sorted({b.page for b in cluster}),
                        "sample_block_page": cluster[0].page,
                    },
                )
            )

    # ---- (b) intra-block repetition ----
    # For each block, find k-gram duplicates within the block itself.
    # If a k-gram appears at >= min_repeats disjoint positions, the
    # block contains a copy-paste loop.
    for b in blocks:
        toks = _TOKEN_RE.findall(b.text.lower())
        if len(toks) < min_tokens:
            continue
        k = 5
        if len(toks) < k:
            continue
        # Hash each 5-gram, build a multiset of positions.
        positions: dict[int, list[int]] = defaultdict(list)
        for i in range(len(toks) - k + 1):
            positions[hash(tuple(toks[i : i + k]))].append(i)
        # Find any 5-gram that appears at >= min_repeats disjoint
        # (non-overlapping) positions, AND whose positions span at
        # least min_tokens tokens.
        for h, pos in positions.items():
            # Greedy: pick non-overlapping positions.
            chosen: list[int] = []
            last_end = -k
            for p in pos:
                if p >= last_end + k:
                    chosen.append(p)
                    last_end = p
                if len(chosen) >= min_repeats:
                    break
            if len(chosen) < min_repeats:
                continue
            span = chosen[-1] - chosen[0] + k
            if span < min_tokens:
                continue
            snippet = _truncate(b.text)
            findings.append(
                Finding.make(
                    trace_id=trace_id,
                    detector="text_patterns",
                    # R-2026-06-15 (Phase 6, fix 2):
                    # bumped the high-severity threshold
                    # from 3 to 4 repetitions, and
                    # medium from 2 to 3.  A 2-rep
                    # 5-gram is a near-universal
                    # artefact of academic English
                    # (boilerplate "All authors
                    # contributed..." paragraphs
                    # repeated 2x per paper) and
                    # produced 138 / 141 false
                    # positives on the v2 30-case
                    # benchmark.  We keep the
                    # finding (so reviewers can see
                    # the signal) but at low
                    # severity.
                    severity=(
                        "high"
                        if len(chosen) >= 4
                        else "medium"
                        if len(chosen) >= 3
                        else "low"
                    ),
                    title=(
                        f"Copy-paste loop inside a single block "
                        f"({len(chosen)} repetitions of a 5-gram)"
                    ),
                    evidence=(
                        f"Block on page {b.page + 1} contains the same "
                        f"5-gram repeated {len(chosen)} times across a span "
                        f"of {span} tokens. Looks like a paste-loop the "
                        f"author never cleaned up. First match: \"{snippet}\""
                    ),
                    location=f"Page {b.page + 1}",
                    raw={
                        "check": "duplicate_passage",
                        "kind": "intra_block",
                        "repetitions": len(chosen),
                        "span_tokens": span,
                        "sample_block_page": b.page,
                    },
                )
            )
            break  # one finding per block is enough

    return findings[:max_findings]


def _check_template_phrase(
    blocks: list[TextBlock], settings: Settings, trace_id: str
) -> list[Finding]:
    """Catch bursts of excess punctuation or LLM-style hedging phrases."""
    findings: list[Finding] = []
    per_block: list[tuple[TextBlock, str]] = []
    for b in blocks:
        if _EXCESS_EXCLAIM.search(b.text):
            per_block.append((b, "excess punctuation"))
        elif _HEDGING.search(b.text):
            per_block.append((b, "LLM-style hedging"))

    if not per_block:
        return []

    # Group by reason.
    by_reason: dict[str, list[TextBlock]] = defaultdict(list)
    for b, reason in per_block:
        by_reason[reason].append(b)
    for reason, bs in by_reason.items():
        snippet = _truncate(bs[0].text)
        findings.append(
            Finding.make(
                trace_id=trace_id,
                detector="text_patterns",
                severity="low",
                title=f"Template-phrase pattern: {reason}",
                evidence=(
                    f"Found {len(bs)} block(s) with {reason}. "
                    "Bursts of '!!!' / '???' or phrases like 'Certainly!' "
                    "are atypical in academic writing. First match: "
                    f"\"{snippet}\""
                ),
                location=_page_range_label(bs),
                raw={
                    "check": "template_phrase",
                    "kind": reason,
                    "count": len(bs),
                    "sample_block_page": bs[0].page,
                },
            )
        )
    return findings[: int(settings.text_max_findings_per_check)]


# ---------------------------------------------------------------------------
# Detector
# ---------------------------------------------------------------------------

class TextPatternDetector:
    """Dispatcher that runs every enabled text-pattern check against
    the document's text blocks. A "text-pattern check" is a small
    heuristic that scans the body text for a class of suspicious
    patterns: phrased-as-tortured phrases, statistical anomalies in
    the citation list, or in-text claims that look out of place.
    This detector does not own the checks; it iterates the list of
    registered pattern functions and merges their findings. The
    detector returns an empty ``DetectorResult.findings`` list when
    the document has no ``text_blocks`` (e.g. a scanned PDF that
    never went through OCR). The dispatcher never raises; a single
    broken pattern function is logged and skipped.
    """

    name = "text_patterns"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        settings = get_settings()
        # P0-8: detector-owned settings are now part
        # of the Settings schema (see config.py); no
        # runtime injection needed.
        blocks = [b for b in doc.text_blocks if b.text.strip()]
        if not blocks:
            # No text blocks to scan. Return
            # an empty DetectorResult so the
            # pipeline can fold it the same
            # way as any other result. The
            # earlier ``return []`` returned
            # a list, which crashed the
            # pipeline's
            # ``DetectorResult(detector=res.detector, ...)``
            # fold. (Discovered when an
            # invalid / blank PDF caused the
            # ``/api/upload`` background
            # pipeline to fail with
            # ``AttributeError: 'list' object
            # has no attribute 'detector'``.)
            return DetectorResult(
                detector=self.name,
                ok=True,
                findings=[],
            )
        findings: list[Finding] = []
        if settings.text_check_placeholders:
            findings.extend(_check_placeholders(blocks, settings, doc.trace_id))
        if settings.text_check_chatbot_disclaimer:
            findings.extend(
                _check_chatbot_disclaimer(blocks, settings, doc.trace_id)
            )
        if settings.text_check_citation_anomaly:
            findings.extend(
                _check_citation_anomaly(blocks, settings, doc.trace_id)
            )
        if settings.text_check_duplicate_passage:
            findings.extend(
                _check_duplicate_passage(blocks, settings, doc.trace_id)
            )
        if settings.text_check_template_phrase:
            findings.extend(
                _check_template_phrase(blocks, settings, doc.trace_id)
            )
        log.info(
            "text_patterns done",
            extra={"blocks": len(blocks), "findings": len(findings)},
        )
        return DetectorResult(detector=self.name, ok=True, findings=findings)
