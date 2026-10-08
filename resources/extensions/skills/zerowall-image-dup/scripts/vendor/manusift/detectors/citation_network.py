"""Citation network detector (Step P2-D1).

Goal: for every reference-shaped phrase in the PDF,
check whether the cited work actually exists. A
reference that does not exist in Crossref is a
strong signal of fabrication.

We deliberately keep this detector small:

  1. **Extraction** is a regex scan for the
     ``[Author Year]`` / ``(Author, Year)`` /
     ``[N]`` patterns. Anything that looks like a
     citation is in scope.
  2. **Lookup** hits the public Crossref REST
     API (``api.crossref.org``). No auth, no key
     needed; polite-pool users pass an email
     (settings.crossref_email) for higher rate
     limits.
  3. **Cache** lives at
     ``data/crossref_cache.json`` so a second run
     over the same PDF does not re-query
     Crossref. The cache is keyed by the query
     string; values are the raw response or a
     short ``{"not_found": true}`` marker.
  4. **Match** is intentionally fuzzy: we ask
     Crossref for the title, year, and first
     author, and require at least two of those
     three to match. A real fabricated paper will
     fail all three; a mis-typed year will pass
     the title/author match. This is the same
     "evidence weighting" pattern the LLM
     enrichment layer uses for findings.
  5. **Failure modes**: any HTTP error, timeout,
     malformed response, or unparseable citation
     becomes a Finding of severity ``info``
     ("could not verify") rather than crashing
     the job. We do not want a flaky network
     connection to mark an entire paper as
     suspicious.
  6. **Offline replay**
     (``MANUSIFT_CROSSREF_OFFLINE=1``): the
     detector never touches the network; cache
     hits are scored as usual (TTL bypassed for
     determinism) and cache misses become
     ``info`` findings of kind ``not_testable``.
     This lets CI replay a pinned
     ``data/crossref_cache.json`` corpus
     reproducibly.

P2-D1 explicitly does **not**:
  * Resolve DOIs (Crossref can do this; we keep
    it simple for now and add DOI resolution
    when the regex catches DOI strings too).
  * Distinguish "honest mis-citation" from
    "fabricated reference" (we report
    "not found"; the LLM enrichment layer
    interprets the rest).
  * Implement a worker pool (one Crossref
    request per second is fine for a single
    PDF; a 100-PDF batch will get the polite
    rate limit).
"""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path

import httpx

from ..config import Settings, get_settings
from ..retry import classify_status, remote_call
from ..contracts import Finding, ParsedDoc
from .base import DetectorResult


NAME = "citation_network"

# R-2026-06-19 (P2-C6):
# cache TTL in seconds.
# ``MANUSIFT_CITATION_CACHE_TTL``
# overrides the
# default (30 days).
# A paper's
# citation
# metadata
# (DOI, journal,
# authors)
# changes
# infrequently
# (a paper
# might get
# an erratum
# or be
# corrected,
# but
# usually
# not
# within
# 30
# days),
# so a
# 30-day
# TTL
# is
# a
# good
# balance
# between
# fresh
# data
# and
# not
# hammering
# Crossref.
# Set
# to
# 0
# to
# always
# re-fetch.
DEFAULT_CITATION_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60


def _get_cache_ttl_seconds() -> int:
    """Return the cache TTL in
    seconds, reading from
    ``MANUSIFT_CITATION_CACHE_TTL``
    if set.

    R-2026-06-19 (P2-C6):
    the value is
    read at call
    time (not at
    import time)
    so tests can
    monkey-patch
    the env var
    and the
    change takes
    effect on
    the next
    cache
    check.
    """
    raw = os.environ.get(
        "MANUSIFT_CITATION_CACHE_TTL", ""
    )
    if not raw:
        return DEFAULT_CITATION_CACHE_TTL_SECONDS
    try:
        v = int(raw)
    except ValueError:
        return DEFAULT_CITATION_CACHE_TTL_SECONDS
    if v < 0:
        return 0  # negative = never cache
    return v


def _is_cache_entry_stale(
    entry: dict, *, now: float | None = None
) -> bool:
    """Return True if the
    cache entry's age
    exceeds the TTL.

    R-2026-06-19 (P2-C6):
    ``entry`` is a
    ``{"item": ..., "ts": float}``
    dict; the ``ts``
    is the
    Unix epoch
    seconds
    when the
    entry was
    written.
    Entries
    written by
    the *old*
    code path
    (before
    P2-C6) have
    no ``ts`` key;
    we treat
    those as
    **stale**
    so the
    first run
    after
    upgrade
    re-fetches
    everything
    (safer than
    silently
    using
    cache hits
    for an
    unbounded
    age).
    """
    if now is None:
        now = time.time()
    ts = entry.get("ts")
    if ts is None:
        # Pre-P2-C6 entry;
        # force a refresh.
        return True
    ttl = _get_cache_ttl_seconds()
    if ttl == 0:
        return True
    return (now - ts) > ttl

# Citation pattern: looks for ``[Smith 2020]``,
# ``(Smith, 2020)``, ``(Smith and Jones 2020)``,
# ``[1]`` / ``[12]`` numeric references. We keep
# the regex deliberately permissive — false
# positives here are cheap (a real reference is
# checked; a non-reference is reported as
# "not found" and silently ignored by the
# LLM-enrichment layer).
_CITATION_PATTERNS: tuple[re.Pattern[str], ...] = (
    # [Smith 2020], [Smith and Jones 2020], [Smith et al. 2020],
    # [Smith, 2020], (Smith, 2019), (Smith and Jones 2020).
    # Two capture groups: group 1 = author, group 2 = year.
    # The separator between author and year is
    # ``[,\s]?`` (optional comma, optional
    # space) so the regex does not eat the
    # year into the author group.
    re.compile(
        r"\[\s*"
        r"([A-Z][A-Za-z\-']+(?:\s+(?:and|et\s+al\.?)\s+"
        r"[A-Z][A-Za-z\-']+)?)"
        r"(?:,)?(?:\s+(?:et\s+al\.?))?"
        r"[,\s]?\s*"
        r"(\d{4})[a-z]?"
        r"\s*\]"
    ),
    re.compile(
        r"\(\s*"
        r"([A-Z][A-Za-z\-']+(?:\s+(?:and|et\s+al\.?)\s+"
        r"[A-Z][A-Za-z\-']+)?)"
        r"(?:,)?(?:\s+(?:et\s+al\.?))?"
        r"[,\s]?\s*"
        r"(\d{4})[a-z]?"
        r"\s*\)"
    ),
    # [1], [12], [123] — numeric-only references
    re.compile(r"\[(\d{1,3})\]"),
    # R-2026-06-16 (Phase 4 +
    # citation-network
    # numerics): the
    # original numeric
    # pattern only
    # matched *single*
    # numbers in
    # brackets, so
    # ``[1, 2, 3]``,
    # ``[1,2,3]``,
    # ``[1–5]``,
    # ``[1-5]`` (Nature
    # / Cell / Science
    # style
    # bracketed
    # multi-refs)
    # were silently
    # missed and the
    # detector
    # reported 0
    # findings even
    # when a paper had
    # 50+ references.
    # We add a
    # multi-number
    # pattern
    # *without*
    # capture groups
    # (so ``year`` is
    # empty and
    # Crossref is not
    # queried -- the
    # detector treats
    # numerics as
    # "resolvable by
    # bibliography
    # order only")
    # AND a hyphen /
    # en-dash range
    # pattern.  The
    # exact match
    # text is still
    # surfaced as the
    # ``raw`` field so
    # downstream
    # consumers can
    # resolve it via
    # the bibliography
    # (P3 / R-audit
    # 2026-06-14: this
    # is the explicit
    # handoff between
    # the citation
    # extractor and
    # the reference
    # resolver).
    re.compile(
        r"\[\s*\d{1,3}(?:\s*[,\-–—]\s*\d{1,3}){0,9}\s*\]"
    ),
    # Superscript-style
    # multi-refs (some
    # Nature papers
    # render citations
    # as superscript
    # text not
    # wrapped in
    # brackets).  We
    # do not try to
    # match these
    # without brackets
    # -- the false-
    # positive rate is
    # too high.
)


def _extract_citations(
    text: str,
) -> list[dict[str, str]]:
    """Return a list of ``{raw, author, year}``
    dicts for every citation-shaped phrase in
    ``text``. ``year`` may be empty for
    numeric-only references; ``author`` may be
    empty too. The detector uses the populated
    ones to query Crossref.
    """
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for pat in _CITATION_PATTERNS:
        for m in pat.finditer(text):
            raw = m.group(0)
            if raw in seen:
                continue
            seen.add(raw)
            # Numeric refs do not have a year in
            # the matched group; in that case the
            # year group is the same digit string
            # that already appears in the citation
            # text. We detect this by checking
            # whether group 2 is a 4-digit number
            # in the 1900-2099 range.
            # R-2026-06-16
            # (Phase 4 +
            # citation-network
            # numerics): the
            # new
            # multi-number
            # pattern
            # (``[1,2,3]``
            # / ``[1-5]``)
            # has *no*
            # capture
            # groups
            # because
            # numerics
            # cannot be
            # resolved
            # against
            # Crossref
            # without
            # bibliography
            # order. We
            # handle this
            # explicitly
            # here.
            if not m.groups():
                # No capture
                # groups --
                # this is the
                # multi-number
                # pattern.
                # We still
                # surface the
                # raw match so
                # downstream
                # consumers
                # can see the
                # citation
                # exists, but
                # ``author`` /
                # ``year`` are
                # empty so the
                # detector
                # skips the
                # Crossref
                # query.
                out.append(
                    {
                        "raw": raw,
                        "author": "",
                        "year": "",
                    }
                )
                continue
            g1 = m.group(1)
            year = ""
            author = g1
            if len(m.groups()) >= 2:
                g2 = m.group(2)
                if g2 and g2.isdigit() and 1900 <= int(g2) <= 2099:
                    year = g2
            out.append({"raw": raw, "author": author, "year": year})
    return out


def _cache_path(settings: Settings) -> Path:
    """The on-disk cache lives next to the
    workspace, not under ``data/jobs/<tid>``,
    because the cache is shared across jobs.
    A second run on the same PDF gets free
    lookups."""
    from ..workspace import cache_dir

    return cache_dir(settings.workspace_dir) / "crossref_cache.json"


def _load_cache(settings: Settings) -> dict[str, dict]:
    """Read the on-disk cache, returning an empty
    dict if the file is missing or malformed.
    We never raise from the cache — a bad
    cache means a fresh fetch, not a crash."""
    path = _cache_path(settings)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _save_cache(
    settings: Settings, cache: dict[str, dict]
) -> None:
    """Persist the cache atomically (write to
    ``.tmp`` then ``replace``) so a crash mid-write
    does not corrupt the cache. The cache is a
    small file (a few KB even for hundreds of
    lookups) so we just rewrite it in full.
    """
    path = _cache_path(settings)
    tmp = path.with_suffix(path.suffix + ".tmp")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(
            json.dumps(cache, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        tmp.replace(path)
    except OSError:
        # Cache is best-effort; a failed write
        # simply means the next run re-queries
        # Crossref. We deliberately do not raise.
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass


def _crossref_offline() -> bool:
    """Return True when offline replay mode is on
    (``MANUSIFT_CROSSREF_OFFLINE=1``).

    R-2026-07-18 (P2.1): in offline mode the
    detector **never** touches the network. A
    cache hit (TTL check bypassed, so replays
    stay deterministic regardless of wall
    clock) is scored normally; a cache miss is
    recorded as an ``info`` finding of kind
    ``not_testable`` instead of querying
    Crossref. This makes CI reruns of the
    benchmark corpus reproducible against a
    pinned ``data/crossref_cache.json``. The
    value is read at call time so tests can
    monkey-patch the env var.
    """
    return os.environ.get("MANUSIFT_CROSSREF_OFFLINE", "0") == "1"


@remote_call("crossref", max_attempts=2, multiplier=1.0)
def _query_crossref(
    query: str,
    settings: Settings,
    client: httpx.Client | None = None,
) -> dict | None:
    """Hit ``api.crossref.org/works`` for ``query``.
    Returns the first item of ``message.items``
    or ``None`` if no match. A network error
    returns ``None``; the caller decides whether
    that is a "not found" finding or a
    "could not verify" finding.

    The ``client`` parameter exists for tests
    that want to monkeypatch the HTTP layer.
    """
    headers = {"User-Agent": "ManuSift/0.1 (citation check)"}
    if settings.crossref_email:
        # Crossref's polite-pool gets faster,
        # higher-rate-limit responses when we
        # pass a contact email. The convention
        # is to put it in the User-Agent or in
        # the ``mailto`` query string.
        params = {"query": query, "rows": 3, "mailto": settings.crossref_email}
    else:
        params = {"query": query, "rows": 3}
    try:
        if client is None:
            client = httpx.Client(timeout=5.0)
            own = True
        else:
            own = False
        resp = client.get(
            "https://api.crossref.org/works",
            params=params,
            headers=headers,
        )
        # G5: surface non-200 as a
        # ``ServerError_`` so the
        # ``remote_call`` decorator can
        # retry it. The pre-G5 code
        # silently returned ``None``,
        # which is indistinguishable
        # from a genuine Crossref miss
        # — a 500 from the Crossref API
        # looked the same as a paper
        # that simply has no Crossref
        # record. G5 separates the two
        # cases: a real 5xx is retried;
        # a 200-with-empty-items is a
        # genuine miss.
        if resp.status_code != 200:
            raise classify_status(resp.status_code)(
                f"Crossref {resp.status_code} for {query!r}"
            )
        body = resp.json()
        items = body.get("message", {}).get("items", [])
        return items[0] if items else None
    except (httpx.HTTPError, ValueError):
        return None
    finally:
        if own and client is not None:
            client.close()


def _match_score(
    citation: dict[str, str], crossref_item: dict
) -> int:
    """Return 0..3: how many of the title, year,
    and first author line up between the
    citation in the PDF and the Crossref
    record. 2 or 3 is a "match"; 0 or 1 is a
    "fabricated or unverified" signal.
    """
    score = 0
    title = (crossref_item.get("title") or [""])[0]
    year = ""
    issued = crossref_item.get("issued", {})
    if issued and "date-parts" in issued:
        year = str(issued["date-parts"][0][0])
    authors = crossref_item.get("author", [])
    # R-2026-07-18 (P2.1) FP attribution from the
    # negative_controls_v1 Crossref measurement:
    # the pre-P2.1 author check compared the
    # citation surname case-*sensitively*
    # against the *first* author only, so real
    # citations like ``(Goodwin-gill and
    # Mcadam, 2017)`` (Crossref family name
    # ``Goodwin-Gill``) scored 0 and raised a
    # false ``high``. We now compare
    # case-insensitively against **all** listed
    # authors (the citing surname is normally
    # the first author, but Crossref author
    # order for books/edited volumes is not
    # reliable enough to depend on).
    if citation["author"]:
        last_name = citation["author"].split()[0].lower()
        family_names = [
            (a.get("family", "") or a.get("name", "")).lower()
            for a in authors
        ]
        if last_name and any(last_name in fam for fam in family_names):
            score += 1
    # Year: exact match, or +/- 1 to absorb the
    # preprint-vs-published-version year drift
    # (P2.1 FP attribution: a citation written
    # against a preprint can differ from the
    # Crossref ``issued`` year of the version of
    # record by one year; that difference alone
    # is not a fabrication signal).
    if citation["year"] and year:
        try:
            if abs(int(citation["year"]) - int(year)) <= 1:
                score += 1
        except ValueError:
            pass
    # Title contains any meaningful word from
    # the raw citation: skip if no usable
    # token is available.
    raw_tokens = [
        t for t in re.findall(r"[A-Za-z]+", citation["raw"])
        if len(t) > 4
    ]
    if raw_tokens and any(t.lower() in title.lower() for t in raw_tokens):
        score += 1
    return score


class CitationNetworkDetector:
    """P2-D1 detector. The ``name`` attribute
    matches the module-level ``NAME`` constant
    so ``__init__`` can import the class without
    knowing it is ``CitationNetworkDetector``."""

    name = NAME

    def run(
        self, doc: ParsedDoc, settings: Settings | None = None
    ) -> DetectorResult:
        t0 = time.time()
        settings = settings or get_settings()
        # Cheap check: this detector is
        # network-dependent and the operator
        # may want to turn it off.
        if not settings.crossref_enabled:
            return DetectorResult(
                detector=self.name,
                ok=True,
                findings=[],
                duration_ms=int((time.time() - t0) * 1000),
            )
        cache = _load_cache(settings)
        findings: list[Finding] = []
        # Collect candidate citations from all
        # text blocks; dedupe by raw text.
        seen: set[str] = set()
        candidates: list[dict[str, str]] = []
        for block in doc.text_blocks:
            for c in _extract_citations(block.text):
                if c["raw"] in seen:
                    continue
                seen.add(c["raw"])
                candidates.append(c)
        # Only fetch Crossref for citations that
        # have a year (numeric-only ``[1]``
        # references cannot be matched without
        # resolving the bibliography order, which
        # is a separate problem P3 will tackle).
        verifiable = [c for c in candidates if c.get("year")]
        offline = _crossref_offline()
        for c in verifiable:
            query = f"{c['author']} {c['year']}"
            cache_key = query.lower().strip()
            if offline:
                # R-2026-07-18 (P2.1) offline replay:
                # never hit the network. Any cache
                # entry is used as-is (TTL bypassed
                # so a pinned cache replays
                # deterministically over time); a
                # miss is "not testable" (info).
                if cache_key in cache:
                    item = cache[cache_key].get("item")
                else:
                    findings.append(Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity="info",
                        title="Citation not testable (offline mode)",
                        evidence=(
                            f"'{c['raw']}' has no entry in the local "
                            f"Crossref cache (query='{query}') and "
                            f"MANUSIFT_CROSSREF_OFFLINE=1 forbids "
                            f"network lookups. Re-run online to verify."
                        ),
                        location="(citation_network)",
                        raw={
                            "citation": c,
                            "query": query,
                            "cache_hit": False,
                            "offline": True,
                            "kind": "not_testable",
                        },
                    ))
                    continue
            elif cache_key in cache and not _is_cache_entry_stale(
                cache[cache_key]
            ):
                item = cache[cache_key].get("item")
            else:
                item = _query_crossref(query, settings)
                # R-2026-06-19 (P2-C6):
                # stamp the entry with
                # the current time so
                # the TTL check above
                # can decide whether
                # to re-fetch on the
                # next run.  Pre-P2-C6
                # entries had no
                # ``ts`` and are
                # always treated as
                # stale (see
                # ``_is_cache_entry_stale``).
                cache[cache_key] = {
                    "item": item,
                    "ts": time.time(),
                }
            if item is None:
                # Network error or genuine miss.
                # We do not know which, so we
                # emit an ``info`` finding rather
                # than a ``high`` one. Operators
                # can re-run later to get a
                # sharper verdict.
                findings.append(Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="info",
                    title=f"Citation could not be verified",
                    evidence=(
                        f"'{c['raw']}' did not return a Crossref match "
                        f"(query='{query}'). The reference may be "
                        f"fabricated, or Crossref may be unreachable."
                    ),
                    location="(citation_network)",
                    raw={
                        "citation": c,
                        "query": query,
                        "cache_hit": cache_key in cache,
                    },
                ))
                continue
            # R-2026-07-18 (P2.1) FP attribution:
            # the fraud_web_v1 Crossref measurement
            # flagged ``(FAO1998)`` as ``high``
            # (score 1/3; Crossref's top hit was an
            # unrelated paper that merely shared the
            # year). Institutional grey literature —
            # FAO/WHO/IPCC/OECD-style reports — is
            # not indexed by Crossref, so a low match
            # score against the top hit carries **no**
            # fabrication signal for this class, while
            # legitimate papers cite such reports
            # constantly (a false-positive storm on
            # the negative controls). Downgrade this
            # class to ``info`` ("could not verify"),
            # the same verdict an unreachable-Crossref
            # run produces. Detect it by an all-caps
            # author token (``FAO``, ``WHO``, ``IPCC``
            # ...); personal surnames are never
            # all-caps in the extraction regex's
            # ``[A-Z][A-Za-z\-']+`` shape.
            first_token = (c["author"] or "").split()[0] if c["author"] else ""
            if first_token and re.fullmatch(r"[A-Z]{2,}", first_token):
                findings.append(Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="info",
                    title="Citation could not be verified (grey literature)",
                    evidence=(
                        f"'{c['raw']}' looks like an institutional "
                        f"report (author='{c['author']}'); Crossref does "
                        f"not index this class of grey literature, so "
                        f"the match score is uninformative."
                    ),
                    location="(citation_network)",
                    raw={
                        "citation": c,
                        "query": query,
                        "cache_hit": cache_key in cache,
                        "kind": "grey_literature",
                    },
                ))
                continue
            score = _match_score(c, item)
            if score < 2:
                # R-2026-07-18 (P2.1) FP attribution:
                # the benchmark measurement showed
                # this branch firing on **legit**
                # papers almost as often as on
                # retracted ones (negative
                # controls: 13 residual cases after
                # the scoring fixes; fraud_web: 11).
                # Root cause: the detector only sees
                # Crossref's *top-1* hit for a bare
                # ``"Author Year"`` query, so a real
                # citation whose true record ranks
                # lower is scored against an
                # unrelated work — indistinguishable
                # from a genuinely fabricated
                # reference at this evidence level
                # (Crossref relevance scores overlap
                # between the two classes). A signal
                # that cannot separate fabrication
                # from retrieval noise must not be
                # ``high``: downgrade to ``medium``
                # until the resolver checks DOIs or
                # scores best-of-N retrieval (P3).
                findings.append(Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="medium",
                    title=(
                        f"Citation '...{c['raw'][:30]}' does not "
                        f"match the top Crossref hit"
                    ),
                    evidence=(
                        f"Crossref match score: {score}/3 against the "
                        f"top-1 retrieval (top-1-only evidence; see "
                        f"R-2026-07-18 P2.1 note). Closest title: "
                        f"'{(item.get('title') or [''])[0][:80]}'."
                    ),
                    location="(citation_network)",
                    raw={
                        "citation": c,
                        "query": query,
                        "score": score,
                        "cache_hit": cache_key in cache,
                        "crossref": {
                            "title": (item.get("title") or [""])[0],
                            "doi": item.get("DOI", ""),
                        },
                    },
                ))
        _save_cache(settings, cache)
        return DetectorResult(
            detector=self.name,
            ok=True,
            findings=findings,
            duration_ms=int((time.time() - t0) * 1000),
        )
