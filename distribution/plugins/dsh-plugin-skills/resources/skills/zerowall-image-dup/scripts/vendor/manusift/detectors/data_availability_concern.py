"""R-2026-06-12: Data-availability-statement concern detector.

The official retractions behind cases 002, 004, and 008 in the
benchmark all cite "raw data no longer available" or "authors
unresponsive to raw data requests" as a contributor to the
decision. None of ManuSift's existing detector surface catches
this directly:

  * ``compliance`` only checks for the *presence* of a
    data-availability statement, not its content.
  * ``supplementary`` only fires when an actual XLSX/CSV
    companion file is uploaded, which is rare for retracted
    papers.
  * ``image_dup`` / ``image_forensics`` are about figures,
    not raw data.

This detector fills the gap by reading the data-availability
section of the paper and flagging when the statement uses a
**red-flag phrase** that is associated with poor data-sharing
practices in the published literature.

The list of red-flag phrases comes from a cross-check of:

  * Gabelica et al. (Nature Scientific Data, 2022) — "Data
    sharing practices and data availability upon request…"
    which concludes that "available upon reasonable request"
    statements are inefficient and should not be allowed.
  * COPE / ICMJE guidelines (2024-2025 revisions) which
    explicitly call out "available upon reasonable request"
    and "available from the corresponding author on request"
    as problematic.
  * The Retraction Watch category "data unavailable /
    authors unresponsive" — present in the benchmark's
    case_002, case_004, and case_008.

The detector emits one finding per red-flag phrase found in
the data-availability section. The finding severity is
``medium`` for vague-but-cited phrases and ``high`` for the
"raw data not available" + "unresponsive authors" combination
that appeared in the benchmark's three relevant retractions.

P2.3 adds optional **link resolution**: when
``MANUSIFT_DAS_RESOLUTION_ENABLED`` is on
(``settings.das_resolution_enabled``, default off), DOI/URL
links found in the statement are resolved against their
repository landing pages (Dryad / Zenodo / Figshare / OSF /
generic HTTPS). A confirmed dead link (404/410 or a repository
soft-404 page) is a ``medium`` finding; any network failure
degrades to ``info`` and never escalates. Offline, the
resolution step is skipped entirely and no network call is
made. Verdicts are cached at ``data/link_check_cache.json``.
"""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path

import httpx

from ..config import Settings, get_settings
from ..contracts import Finding, ParsedDoc
from ..retry import classify_status, remote_call
from .base import DetectorResult
from .references import _DOI_RE

# Red-flag phrases seen in the data-availability statements of
# the retracted cases in this benchmark AND in the published
# data-sharing literature. The order is intentional: more
# specific patterns first so the regex doesn't prematurely
# match a generic one.
#
# (regex, severity, evidence category)
_RED_FLAGS: list[tuple[re.Pattern[str], str, str]] = [
    # HIGH: raw data not available / removed
    (re.compile(
        r"\b(raw data (?:are|is|were) (?:no longer|not) "
        r"(?:longer\s+)?available|raw data (?:are|is|were) "
        r"(?:not|no longer) accessible|raw data (?:have|has) "
        r"been (?:removed|lost|destroyed)|source data (?:are|is) "
        r"not available|underlying data (?:are|is) not available)\b",
        re.IGNORECASE,
    ), "high", "raw_data_unavailable"),
    # HIGH: authors unresponsive
    (re.compile(
        r"\b(authors? (?:have been |were )?unresponsive|"
        r"authors? (?:failed|did not respond) to (?:provide|"
        r"share) (?:the )?raw data|authors? (?:have |has )?"
        r"not responded to (?:multiple )?requests? for "
        r"(?:the )?raw data|authors? did not provide "
        r"(?:the )?raw data)\b",
        re.IGNORECASE,
    ), "high", "authors_unresponsive"),
    # MEDIUM: vague / hedged (Frontiers / PLOS / Elsevier templates)
    (re.compile(
        r"\b(available (?:from |upon )?reasonable request|"
        r"available (?:from |upon )?request|available from the "
        r"corresponding author|are available from the "
        r"corresponding author on request|available on "
        r"request from the (?:corresponding )?author|"
        r"data (?:are|is) available (?:on|upon) (?:a )?"
        r"reasonable request|"
        # Common OA / Frontiers hedges
        r"will be made available (?:upon|on) (?:reasonable )?"
        r"request|"
        r"(?:can|may) be (?:obtained|requested) from the "
        r"(?:corresponding )?author|"
        r"available from the authors? (?:upon|on) request|"
        r"supporting data (?:are|is|will be) available "
        r"(?:upon|on) request|"
        r"datasets? (?:generated|used) (?:during|in) "
        r"(?:the )?(?:current|present) study (?:are|is) "
        r"available from|"
        r"data (?:are|is) available from the corresponding "
        r"author|"
        # Frontiers template: "Further inquiries can be
        # directed to the corresponding author(s)."
        r"further inquiries can be directed to|"
        r"data sharing is not applicable|"
        r"the data that support the findings of this study "
        r"(?:are|is) available from|"
        # Frontiers "will be made available by the authors,
        # without undue reservation" (no repository DOI).
        r"will be made available by the authors?|"
        r"without undue reservation|"
        r"raw data supporting the conclusions of this "
        r"article will be made available)\b",
        re.IGNORECASE,
    ), "medium", "vague_availability"),
    # MEDIUM: restrictions / legal / confidentiality
    (re.compile(
        r"\b(available (?:subject|with) (?:ethical|legal|"
        r"privacy|confidentiality) (?:approval|restrictions|"
        r"constraints)|not publicly available due to "
        r"(?:ethical|legal|privacy|confidentiality) "
        r"(?:reasons|concerns|restrictions)|access (?:is )?"
        r"restricted (?:by|due to) (?:ethical|legal|privacy) "
        r"(?:approval|reasons|restrictions)|"
        r"privacy (?:or|and) ethical restrictions|"
        r"patient (?:privacy|confidentiality) (?:reasons|"
        r"concerns)|cannot be shared (?:publicly )?"
        r"due to)\b",
        re.IGNORECASE,
    ), "medium", "restricted_availability"),
    # LOW: data only "within the manuscript/paper" — no
    # underlying dataset deposited anywhere. Common in
    # retracted papers whose raw data later proved
    # unverifiable (e.g. PLOS "All relevant data are within
    # the manuscript"); also a Gabelica-2022 red-flag class.
    (re.compile(
        r"\b(all (?:relevant |underlying )?data (?:are|is) "
        r"(?:included |presented |reported |shown )?"
        r"(?:with)?in (?:the |this )(?:manuscript|paper|"
        r"article|main text|main manuscript)|"
        r"available only within the (?:paper|manuscript|"
        r"article)|data (?:are|is) available only within|"
        r"results of this study are available only within|"
        r"within the (?:manuscript|paper) and its "
        r"supporting information)\b",
        re.IGNORECASE,
    ), "low", "within_manuscript_only"),
]


# Phrases that indicate the paper has NO data-availability
# statement at all (i.e. the section is missing). This is
# weaker evidence than a red flag but worth flagging.
_MISSING_PHRASES: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"\b(data availability|data sharing|raw data "
        r"availability|data deposition|accession number)\b",
        re.IGNORECASE,
    ),
)


class DataAvailabilityConcernDetector:
    """Scan the data-availability section for red-flag phrases.

    The detector name (``data_availability_concern``) is short
    enough to fit the tool-list's 32-char name limit, descriptive
    of the category, and matches the existing pattern
    (e.g. ``image_dup``, ``image_forensics``).
    """

    name = "data_availability_concern"

    def run(
        self, doc: ParsedDoc, settings: Settings | None = None
    ) -> DetectorResult:
        text = " ".join(
            getattr(b, "text", "") for b in doc.text_blocks
        )
        if not text:
            return DetectorResult(
                detector=self.name, findings=[], ok=True,
            )

        # Restrict the search to the data-availability section
        # when possible: look for the heading and grab the
        # following 500 words. If we can't find the section,
        # fall back to scanning the whole document.
        section = _extract_data_availability_section(text)
        section_found = section is not None
        if section is None:
            section = text

        findings: list[Finding] = []
        seen_substring: set[str] = set()
        for pat, severity, category in _RED_FLAGS:
            for m in pat.finditer(section):
                snippet = section[max(0, m.start() - 40): m.end() + 40]
                # De-dupe
                # overlapping
                # matches
                # of
                # the
                # same
                # category.
                key = f"{category}::{m.start() // 80}"
                if key in seen_substring:
                    continue
                seen_substring.add(key)
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity=severity,
                        title=(
                            f"Data-availability red flag: {category}"
                        ),
                        location=(
                            "data-availability section"
                            if section is not text
                            else "text"
                        ),
                        evidence=_format_evidence(
                            snippet, category, severity,
                        ),
                    )
                )

        # "Not applicable" as the data-availability answer is a
        # low-severity concern for empirical papers (e.g. a
        # western-blot study whose availability statement is
        # literally "Not applicable"). Checked only near the
        # start of an extracted section to avoid full-text FPs.
        if section_found and re.search(
            r"\bnot applicable\b", section[:250], re.IGNORECASE
        ):
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="low",
                    title="Data availability declared 'not applicable'",
                    location="data-availability section",
                    evidence=_format_evidence(
                        section[:160], "not_applicable", "low",
                    ),
                )
            )

        # If the document has NO data-availability section
        # at all and is a research article (has at least
        # 2000 words), emit one low-severity finding.
        if not section_found and len(text.split()) > 2000:
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="low",
                    title=(
                        "No data-availability section detected"
                    ),
                    location="text",
                    evidence=(
                        "Document does not appear to contain a "
                        "data-availability statement. Many "
                        "biomedical journals (PLOS, Nature, "
                        "Frontiers) require this section."
                    ),
                )
            )

        # P2.3: when the operator opted in
        # (``MANUSIFT_DAS_RESOLUTION_ENABLED``), resolve the
        # DOI/URL links in the data-availability statement
        # against the repository landing pages. Severity
        # discipline: a *confirmed* dead link (404/410, or a
        # landing page that itself says "not found") is a
        # ``medium`` finding -- declared data that does not
        # exist is worse than vague phrasing but is still not
        # proof of fabrication. Any network failure degrades to
        # an ``info`` finding; it never escalates to ``high``.
        # Offline (gate off) the whole block is skipped and no
        # network call is made.
        settings = settings or get_settings()
        if settings.das_resolution_enabled and section_found:
            findings.extend(
                _resolve_statement_links(section, doc, settings)
            )

        return DetectorResult(
            detector=self.name,
            findings=findings,
            ok=True,
        )


def _extract_data_availability_section(
    text: str,
) -> str | None:
    """Try to extract just the data-availability section.

    The detection is intentionally permissive: any of the
    following headings count as the start of a data-availability
    section:

      * "Data Availability"
      * "Data Availability Statement"
      * "Data Sharing"
      * "Data deposition"
      * "Availability of data"
      * "Data and materials availability"

    We then take 800 words from that point (or up to the next
    section heading) as the section. If no heading is found,
    we return None and the caller falls back to scanning the
    full document.
    """
    # Section-heading patterns: 1-2 line headings with optional
    # numbering ("1.", "1.1", etc.). Word-boundary aware.
    #
    # The leading boundary is permissive: a section heading can
    # be either at the start of a line OR follow a sentence-
    # ending punctuation (".", "?"). This is needed because
    # some PDFs put the data-availability section in the same
    # paragraph as the rest of the paper, separated only by
    # a period.
    #
    # We also accept a single space or 2+ spaces before the
    # heading, because ``manusift.ingest.pdf`` joins text
    # blocks with spaces rather than preserving newlines.
    # This is a real edge case for PLOS papers where the
    # data-availability section appears as a separate
    # paragraph but loses its leading newline when the
    # text_blocks are joined.
    #
    # The trailing boundary is also permissive: a heading can
    # be followed by ":", ".", "\n", " " (mid-sentence case
    # like "Data availability statement The original..."), or
    # even end-of-string. Word-boundary rules apply to the
    # heading itself so we don't match a sub-string of a longer
    # phrase like "data-availability-statement" with a hyphen.
    heading = re.compile(
        r"(?:^|\n|\.\s+|\?\s+| {1,})(?<![A-Za-z0-9])"
        r"(?:\d+(?:\.\d+)?\.?\s+)?"
        r"(data availability(?:\s+statement)?|data "
        r"sharing|data deposition|availability of data|"
        r"data and materials availability|availability "
        r"of materials|raw data availability|"
        r"availability of data and materials|"
        r"data availability statement|"
        r"open research|"
        r"resource availability|"
        r"code and data availability)(?=[:\.\n\s]|$)",
        re.IGNORECASE,
    )
    m = heading.search(text)
    if not m:
        return None
    start = m.end()
    # Take the next 800 words or until the next all-caps / numbered
    # section heading.
    chunk = text[start:start + 8000]
    # Stop at a section boundary that looks like a major heading.
    next_heading = re.search(
        r"\n\s*(?:[A-Z][A-Z\s]{4,}|\d+\.\s+[A-Z][a-z]+)",
        chunk,
    )
    if next_heading:
        chunk = chunk[:next_heading.start()]
    # Trim to 800 words.
    words = chunk.split()
    if len(words) > 800:
        words = words[:800]
    return " ".join(words)


def _format_evidence(
    snippet: str, category: str, severity: str,
) -> str:
    """Format the JSON evidence block for the finding."""
    return (
        '{'
        f'"category": "{category}", '
        f'"severity_class": "{severity}", '
        f'"snippet": {repr(snippet.strip())[:400]}'
        '}'
    )


# ------------------------------------------------------------------
# P2.3: data-availability-statement link resolution
#
# The phrase checks above only read the *wording* of the
# data-availability statement. This block verifies the *links*:
# a statement that points at a repository DOI whose landing page
# is a confirmed 404 is stronger evidence than vague phrasing
# (the declared data does not exist), while a link we simply
# could not reach is kept at ``info`` -- link rot is common and
# is not misconduct.
# ------------------------------------------------------------------

# URLs in the statement. Trailing sentence punctuation is
# stripped in ``_extract_statement_links`` because the regex
# happily swallows the final "." of a sentence.
_URL_RE = re.compile(r"https?://[^\s)>\]\"']+", re.IGNORECASE)

# Hosts of the common data repositories. Only for these do we
# scan the landing-page body for explicit "not found" markers --
# on arbitrary hosts such markers are too easy to false-positive
# (a "Page Not Found" nav link, a JS placeholder, ...).
_REPO_HOST_MARKERS: tuple[str, ...] = (
    "datadryad.org",
    "dryad.",
    "zenodo.org",
    "figshare.com",
    "osf.io",
    "dataverse",
    "mendeley.com",
    "doi.org",
)

# Explicit dead-page markers, checked case-insensitively against
# the first ``_BODY_SCAN_BYTES`` of the landing page. Kept
# deliberately specific: we only downgrade a 200 response when
# the page itself states the record is gone.
_DEAD_PAGE_MARKERS: tuple[str, ...] = (
    "dataset not found",
    "record not found",
    "resource not found",
    "page not found",
    "doi not found",
    "item not found",
    "this page does not exist",
    "no longer available",
)

_BODY_SCAN_BYTES = 65536

# Upper bound on links resolved per statement. A statement with
# more than a handful of links is unusual; bounding the count
# keeps worst-case added latency small.
_MAX_LINKS_PER_STATEMENT = 5

# Cache TTL in seconds for link checks (default 7 days -- links
# rot and heal faster than citation metadata).
# ``MANUSIFT_LINK_CHECK_CACHE_TTL`` overrides; 0 = always
# re-fetch, negative = never cache.
DEFAULT_LINK_CHECK_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60


def _get_link_cache_ttl_seconds() -> int:
    """Read ``MANUSIFT_LINK_CHECK_CACHE_TTL`` at call time so
    tests can monkey-patch it."""
    raw = os.environ.get("MANUSIFT_LINK_CHECK_CACHE_TTL", "")
    if not raw:
        return DEFAULT_LINK_CHECK_CACHE_TTL_SECONDS
    try:
        v = int(raw)
    except ValueError:
        return DEFAULT_LINK_CHECK_CACHE_TTL_SECONDS
    if v < 0:
        return 0
    return v


def _is_link_cache_entry_stale(
    entry: dict, *, now: float | None = None
) -> bool:
    """Same ``{"item": ..., "ts": float}`` contract as the
    citation-network / openalex caches; entries without ``ts``
    are treated as stale."""
    if now is None:
        now = time.time()
    ts = entry.get("ts")
    if ts is None:
        return True
    ttl = _get_link_cache_ttl_seconds()
    if ttl == 0:
        return True
    return (now - ts) > ttl


def _link_cache_path(settings: Settings) -> Path:
    """The cache lives next to the workspace, shared across
    jobs, like ``crossref_cache.json``."""
    from ..workspace import cache_dir

    return cache_dir(settings.workspace_dir) / "link_check_cache.json"


def _load_link_cache(settings: Settings) -> dict[str, dict]:
    """Best-effort cache read; a missing or malformed file is an
    empty cache, never an exception."""
    path = _link_cache_path(settings)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _save_link_cache(
    settings: Settings, cache: dict[str, dict]
) -> None:
    """Atomic best-effort write (``.tmp`` then ``replace``)."""
    path = _link_cache_path(settings)
    tmp = path.with_suffix(path.suffix + ".tmp")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(
            json.dumps(cache, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        tmp.replace(path)
    except OSError:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass


def _extract_statement_links(section: str) -> list[str]:
    """Pull the resolvable links out of a data-availability
    statement: explicit ``http(s)://`` URLs plus bare DOIs
    (``doi:10.xxxx/...`` or ``10.xxxx/...``), the latter
    rewritten to ``https://doi.org/<doi>``. Deduped, capped at
    ``_MAX_LINKS_PER_STATEMENT``."""
    out: list[str] = []
    seen: set[str] = set()

    def _push(url: str) -> None:
        url = url.rstrip(".,;:)]}")
        if not url or url in seen:
            return
        seen.add(url)
        out.append(url)

    for m in _URL_RE.finditer(section):
        _push(m.group(0))
        if len(out) >= _MAX_LINKS_PER_STATEMENT:
            return out
    for m in _DOI_RE.finditer(section):
        doi = m.group(0).rstrip(".,;:)]}")
        # Skip DOIs already covered by an explicit
        # ``https://doi.org/...`` URL above.
        if any(doi.lower() in u.lower() for u in out):
            continue
        _push(f"https://doi.org/{doi}")
        if len(out) >= _MAX_LINKS_PER_STATEMENT:
            return out
    return out


def _is_repo_host(url: str) -> bool:
    lowered = url.lower()
    return any(marker in lowered for marker in _REPO_HOST_MARKERS)


@remote_call("das_link_check", max_attempts=2, multiplier=1.0)
def _verify_link(
    url: str,
    settings: Settings,
    client: httpx.Client | None = None,
) -> dict:
    """Resolve one statement link.

    Returns a small verdict dict::

      {"status": "ok" | "not_found" | "dead_page" | "unknown"
                 | "error",
       "code": <http status or None>,
       "final_url": <url after redirects, if known>}

    Semantics:

      * ``ok`` -- 2xx (after redirects) and, for known
        repository hosts, no explicit dead-page marker in the
        body.
      * ``dead_page`` -- 2xx but the landing page itself says
        the record is gone (repository soft-404).
      * ``not_found`` -- a confirmed 404 / 410.
      * ``unknown`` -- another 4xx (401/403 are usually bot
        blocking; we must not read them as dead links).
      * ``error`` -- network error, timeout, or malformed
        response. Always degrades to an ``info`` finding.

    5xx / 429 responses are raised through
    ``classify_status`` so the ``remote_call`` wrapper retries
    them; a persistent 5xx surfaces as ``error`` here because
    the caller converts the ``RemoteServiceError``.
    """
    headers = {"User-Agent": "ManuSift/0.1 (data availability check)"}
    own = False
    try:
        if client is None:
            client = httpx.Client(timeout=5.0, follow_redirects=True)
            own = True
        resp = client.get(url, headers=headers)
        code = resp.status_code
        if 500 <= code < 600 or code == 429:
            raise classify_status(code)(
                f"link check {code} for {url!r}"
            )
        if code in (404, 410):
            return {"status": "not_found", "code": code,
                    "final_url": url}
        if 400 <= code < 500:
            return {"status": "unknown", "code": code,
                    "final_url": url}
        if 200 <= code < 400:
            if _is_repo_host(url):
                try:
                    body = resp.text[:_BODY_SCAN_BYTES].lower()
                except Exception:  # noqa: BLE001 -- binary body
                    body = ""
                if any(marker in body for marker in _DEAD_PAGE_MARKERS):
                    return {"status": "dead_page", "code": code,
                            "final_url": url}
            return {"status": "ok", "code": code, "final_url": url}
        return {"status": "unknown", "code": code, "final_url": url}
    except (httpx.HTTPError, ValueError):
        return {"status": "error", "code": None, "final_url": url}
    finally:
        if own and client is not None:
            client.close()


def _resolve_statement_links(
    section: str, doc: ParsedDoc, settings: Settings
) -> list[Finding]:
    """Verify every link in the data-availability statement and
    turn the verdicts into findings. Never raises: per-link
    failures are ``info`` findings at worst, and the cache is
    best-effort."""
    links = _extract_statement_links(section)
    if not links:
        return []
    cache = _load_link_cache(settings)
    findings: list[Finding] = []
    for url in links:
        if url in cache and not _is_link_cache_entry_stale(
            cache[url]
        ):
            verdict = cache[url].get("item") or {}
            cache_hit = True
        else:
            try:
                verdict = _verify_link(url, settings)
            except Exception:  # noqa: BLE001 -- retries exhausted
                verdict = {"status": "error", "code": None,
                           "final_url": url}
            cache[url] = {"item": verdict, "ts": time.time()}
            cache_hit = False
        status = verdict.get("status", "error")
        raw = {
            "url": url,
            "verdict": verdict,
            "cache_hit": cache_hit,
        }
        if status in ("not_found", "dead_page"):
            findings.append(Finding.make(
                trace_id=doc.trace_id,
                detector="data_availability_concern",
                severity="medium",
                title=(
                    "Data-availability link does not resolve "
                    "(confirmed dead)"
                ),
                evidence=(
                    f"The data-availability statement links to "
                    f"{url} but the repository reports it as "
                    f"missing (status={status}, "
                    f"http={verdict.get('code')}). Declared data "
                    f"that does not exist is worse than vague "
                    f"phrasing, though still not proof of "
                    f"fabrication (the deposit may have moved)."
                ),
                location="data-availability section",
                raw=raw,
            ))
        elif status in ("error", "unknown"):
            findings.append(Finding.make(
                trace_id=doc.trace_id,
                detector="data_availability_concern",
                severity="info",
                title=(
                    "Data-availability link could not be verified"
                ),
                evidence=(
                    f"Could not verify {url} "
                    f"(status={status}, http={verdict.get('code')}). "
                    f"A network failure or bot-blocking is not "
                    f"evidence of misconduct; re-run later for a "
                    f"sharper verdict."
                ),
                location="data-availability section",
                raw=raw,
            ))
        # "ok" -- no finding.
    _save_link_cache(settings, cache)
    return findings
