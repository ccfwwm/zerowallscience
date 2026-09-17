"""Cited-retraction detector (Step P2.2).

Goal: for every DOI in the paper's reference list, ask OpenAlex
whether the cited work has been retracted. Citing a retracted
paper is an independent, strong integrity signal -- the author
built on work the community has formally withdrawn.

Scope boundary (read before extending):

  * This detector does **not** build or query a local Retraction
    Watch database, and it does **not** do full-text comparison
    between this paper and a retraction corpus. That is the
    registered "cross-paper evidence comparison" follow-up item.
    What we do here is a *citation-level* online lookup only.
  * The data-access layer (the OpenAlex client ``_query_openalex``
    plus the on-disk cache ``data/openalex_cache.json``) is
    deliberately generic -- keyed by DOI, storing the raw work
    record -- so the future Retraction Watch integration can
    reuse it instead of growing a second client.

Design (mirrors ``citation_network``):

  1. **Extraction** reuses the reference-list heuristic from
     ``references.py`` (``_extract_references``) and pulls DOI
     strings out of the reference paragraphs with its
     ``_DOI_RE``. References without a DOI are out of scope --
     title-based retraction matching is too fuzzy for a
     lightweight pass.
  2. **Lookup** hits ``api.openalex.org/works/doi:<doi>`` and
     reads the ``is_retracted`` field. OpenAlex needs no auth;
     passing a ``mailto`` puts us in the polite pool (we reuse
     ``settings.crossref_email`` as the contact address rather
     than adding a second config knob).
  3. **Cache** lives at ``data/openalex_cache.json``, keyed by
     the normalized (lowercased) DOI. A cache hit never touches
     the network. Entries carry a ``ts`` and expire after
     ``MANUSIFT_OPENALEX_CACHE_TTL`` seconds (default 30 days;
     retraction status can change, so entries do expire).
  4. **Gate**: the detector is opt-IN via
     ``MANUSIFT_OPENALEX_ENABLED`` (``settings.openalex_enabled``,
     default off) so eval / benchmark runs stay fully offline.
  5. **Failure modes**: any HTTP error, timeout, or malformed
     response yields *no finding* for that DOI -- a flaky network
     must never manufacture a retraction signal. A 404 from
     OpenAlex means the work is not indexed there; that is
     cached as a miss and is also not a finding (the
     ``citation_network`` detector already covers
     "reference does not exist" via Crossref).
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

import httpx

from ..config import Settings, get_settings
from ..contracts import Finding, ParsedDoc
from ..retry import classify_status, remote_call
from .base import DetectorResult
from .references import _DOI_RE, _extract_references

NAME = "cited_retraction"

# Upper bound on how many DOIs we look up per document. A
# thesis-length bibliography can carry 200+ DOIs; 50 lookups at
# one request each is already generous for a screening pass and
# keeps the worst-case added latency bounded.
_MAX_DOIS_PER_DOC = 50

# Cache TTL in seconds. ``MANUSIFT_OPENALEX_CACHE_TTL``
# overrides the default (30 days). Retraction status changes
# infrequently but does change (a work can be retracted months
# after publication), so entries expire rather than living
# forever. Set to 0 to always re-fetch.
DEFAULT_OPENALEX_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60


def _get_cache_ttl_seconds() -> int:
    """Return the cache TTL in seconds, reading from
    ``MANUSIFT_OPENALEX_CACHE_TTL`` if set. Read at call time
    (not import time) so tests can monkey-patch the env var."""
    raw = os.environ.get("MANUSIFT_OPENALEX_CACHE_TTL", "")
    if not raw:
        return DEFAULT_OPENALEX_CACHE_TTL_SECONDS
    try:
        v = int(raw)
    except ValueError:
        return DEFAULT_OPENALEX_CACHE_TTL_SECONDS
    if v < 0:
        return 0  # negative = never cache
    return v


def _is_cache_entry_stale(
    entry: dict, *, now: float | None = None
) -> bool:
    """Same contract as the citation-network cache: entries are
    ``{"item": ..., "ts": float}``; a missing ``ts`` means the
    entry predates TTL support and is treated as stale."""
    if now is None:
        now = time.time()
    ts = entry.get("ts")
    if ts is None:
        return True
    ttl = _get_cache_ttl_seconds()
    if ttl == 0:
        return True
    return (now - ts) > ttl


def _normalize_doi(raw: str) -> str:
    """Normalize a DOI extracted from prose: strip a leading
    ``doi:`` / URL prefix, drop trailing punctuation the regex
    tends to swallow (``10.1234/foo.`` at the end of a
    sentence), and lowercase (DOIs are case-insensitive)."""
    doi = raw.strip()
    lowered = doi.lower()
    for prefix in ("https://doi.org/", "http://doi.org/", "doi:"):
        if lowered.startswith(prefix):
            doi = doi[len(prefix):]
            break
    return doi.rstrip(".,;:)]}").lower()


def _extract_dois(text: str) -> list[str]:
    """Return the deduped, normalized DOIs found in the
    reference-shaped lines of ``text`` (first
    ``_MAX_DOIS_PER_DOC``). Only reference paragraphs are
    scanned so the paper's *own* DOI in a header line is far
    less likely to be picked up."""
    out: list[str] = []
    seen: set[str] = set()
    for ref in _extract_references(text):
        for m in _DOI_RE.finditer(ref):
            doi = _normalize_doi(m.group(0))
            if not doi or doi in seen:
                continue
            seen.add(doi)
            out.append(doi)
            if len(out) >= _MAX_DOIS_PER_DOC:
                return out
    return out


def _cache_path(settings: Settings) -> Path:
    """The cache lives next to the workspace, not under
    ``data/jobs/<tid>``, because it is shared across jobs."""
    from ..workspace import cache_dir

    return cache_dir(settings.workspace_dir) / "openalex_cache.json"


def _load_cache(settings: Settings) -> dict[str, dict]:
    """Read the on-disk cache, returning an empty dict if the
    file is missing or malformed. We never raise from the cache
    -- a bad cache means a fresh fetch, not a crash."""
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
    """Persist the cache atomically (write to ``.tmp`` then
    ``replace``). Best-effort: a failed write simply means the
    next run re-queries OpenAlex."""
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
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass


@remote_call("openalex", max_attempts=2, multiplier=1.0)
def _query_openalex(
    doi: str,
    settings: Settings,
    client: httpx.Client | None = None,
) -> dict | None:
    """Hit ``api.openalex.org/works/doi:<doi>``.

    Returns the work record (a dict) when OpenAlex knows the
    DOI, ``{"not_found": true}`` when OpenAlex answers 404 (the
    work is not indexed -- *not* a finding), and ``None`` on any
    network error, timeout, or malformed response. The caller
    treats ``None`` as "unknown, emit nothing".

    The ``client`` parameter exists for tests that want to
    monkeypatch the HTTP layer.
    """
    headers = {"User-Agent": "ManuSift/0.1 (cited retraction check)"}
    params = {}
    if settings.crossref_email:
        # OpenAlex's polite pool mirrors Crossref's convention:
        # pass a contact email via ``mailto``.
        params["mailto"] = settings.crossref_email
    own = False
    try:
        if client is None:
            client = httpx.Client(timeout=5.0)
            own = True
        resp = client.get(
            f"https://api.openalex.org/works/doi:{doi}",
            params=params,
            headers=headers,
        )
        if resp.status_code == 404:
            return {"not_found": True}
        if resp.status_code != 200:
            # Same G5 pattern as the Crossref client: surface
            # non-200 as a ``ServerError_`` so ``remote_call``
            # can retry it instead of mistaking an outage for
            # a genuine miss.
            raise classify_status(resp.status_code)(
                f"OpenAlex {resp.status_code} for doi:{doi}"
            )
        return resp.json()
    except (httpx.HTTPError, ValueError):
        return None
    finally:
        if own and client is not None:
            client.close()


class CitedRetractionDetector:
    """P2.2 detector. Flags references whose DOI resolves to an
    OpenAlex work record with ``is_retracted: true``."""

    name = NAME

    def run(
        self, doc: ParsedDoc, settings: Settings | None = None
    ) -> DetectorResult:
        t0 = time.time()
        settings = settings or get_settings()
        # Cheap check first: the detector is network-dependent
        # and opt-in. When the gate is off we make zero network
        # calls and emit zero findings.
        if not settings.openalex_enabled:
            return DetectorResult(
                detector=self.name,
                ok=True,
                findings=[],
                duration_ms=int((time.time() - t0) * 1000),
            )
        text = "\n".join(
            getattr(b, "text", "") for b in doc.text_blocks
        )
        dois = _extract_dois(text)
        if not dois:
            return DetectorResult(
                detector=self.name,
                ok=True,
                findings=[],
                duration_ms=int((time.time() - t0) * 1000),
            )
        cache = _load_cache(settings)
        findings: list[Finding] = []
        for doi in dois:
            if doi in cache and not _is_cache_entry_stale(
                cache[doi]
            ):
                item = cache[doi].get("item")
                cache_hit = True
            else:
                item = _query_openalex(doi, settings)
                cache[doi] = {"item": item, "ts": time.time()}
                cache_hit = False
            if item is None or item.get("not_found"):
                # Network failure or DOI not indexed in OpenAlex.
                # Neither is evidence of anything; stay silent.
                continue
            if not item.get("is_retracted"):
                continue
            title = (item.get("title") or "").strip()
            findings.append(Finding.make(
                trace_id=doc.trace_id,
                detector=self.name,
                severity="high",
                title=(
                    f"Reference cites a retracted work "
                    f"(DOI {doi})"
                ),
                evidence=(
                    f"OpenAlex reports is_retracted=true for "
                    f"doi:{doi}"
                    + (f" ('{title[:80]}')." if title else ".")
                    + " The paper builds on work that has been "
                    "formally retracted; verify whether the "
                    "citation is load-bearing."
                ),
                location="references",
                raw={
                    "doi": doi,
                    "openalex_title": title,
                    "openalex_id": item.get("id", ""),
                    "cache_hit": cache_hit,
                },
            ))
        _save_cache(settings, cache)
        return DetectorResult(
            detector=self.name,
            ok=True,
            findings=findings,
            duration_ms=int((time.time() - t0) * 1000),
        )
