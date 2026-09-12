"""Reproducible, title-driven literature acquisition and citation audit CLI.

The script is deliberately deterministic at the network/data boundary: every
provider response is recorded in the source ledger, every task is resumable,
and generated reports never contain credentials or complete PDF contents.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import json
import mimetypes
import os
import re
import shutil
import sys
import tempfile
import subprocess
import threading
import time
import html as html_lib
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qsl, quote, urlencode, urlparse, urlunparse

import requests


CROSSREF = "https://api.crossref.org/works"
OPENALEX = "https://api.openalex.org/works"
EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest"
EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
S2_GRAPH = "https://api.semanticscholar.org/graph/v1"
UNPAYWALL = "https://api.unpaywall.org/v2"


def _load_local_credentials() -> dict[str, str]:
    """Read optional provider credentials from a machine-local file.

    This is only a FALLBACK.  ZeroWall Science stores provider credentials as
    Environment custom variables (Settings -> Environment) and hydrates them
    into the Host process environment, which every skill subprocess inherits.
    That environment therefore always wins.  The file fallback exists for
    plain CLI use outside the ZeroWall Host:

        1. process environment (ZeroWall Environment variables land here)
        2. ``ZEROWALL_LITERATURE_CREDENTIALS`` pointing at a JSON file
        3. ``<ZEROWALL_USER_DATA_DIR>/literature_credentials.json``
        4. ``~/.zerowall/literature_credentials.json``

    The file is a flat ``{"OPENALEX_API_KEY": "...", ...}`` JSON object.
    Values are only used to authenticate outbound provider calls; they are
    never written to task state, receipts, reports or logs.
    """
    candidates: list[Path] = []
    override = os.getenv("ZEROWALL_LITERATURE_CREDENTIALS", "").strip()
    if override:
        candidates.append(Path(override))
    user_data = os.getenv("ZEROWALL_USER_DATA_DIR", "").strip()
    if user_data:
        candidates.append(Path(user_data) / "literature_credentials.json")
    candidates.append(Path.home() / ".zerowall" / "literature_credentials.json")
    for path in candidates:
        try:
            if not path.is_file():
                continue
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(data, dict):
            return {str(k): str(v).strip() for k, v in data.items() if str(v).strip()}
    return {}


_CREDENTIALS = _load_local_credentials()


def credential(name: str, default: str = "") -> str:
    """Resolve one provider credential.

    The ZeroWall Host environment always wins; the case-insensitive sweep
    tolerates Windows launch environments that alter variable casing.
    """
    value = os.getenv(name, "").strip()
    if value:
        return value
    upper = name.upper()
    for key, raw in os.environ.items():
        if key.upper() == upper and raw.strip():
            return raw.strip()
    return _CREDENTIALS.get(name, default).strip()


def credential_source(name: str) -> str:
    """Report where a credential came from, without revealing its value."""
    if os.getenv(name, "").strip():
        return "zerowall_environment"
    upper = name.upper()
    if any(k.upper() == upper and v.strip() for k, v in os.environ.items()):
        return "zerowall_environment"
    if _CREDENTIALS.get(name, "").strip():
        return "local_credentials_file"
    return "missing"


# OpenAlex serves anonymous traffic from a heavily throttled shared pool.  An
# API key (premium) or a contact address (free polite pool) both move requests
# into a far higher rate budget, which is what keeps cited-by expansion from
# collapsing into HTTP 429 on a cold run.
OPENALEX_API_KEY = credential("OPENALEX_API_KEY")
OPENALEX_MAILTO = credential("OPENALEX_MAILTO", "zerowall-science@users.noreply.github.com")
# Minimum seconds between two consecutive requests to the same provider, and
# the maximum number of in-flight requests per provider.  Both are deliberately
# conservative: correctness of the citation graph matters far more than raw
# throughput, and a 429 silently truncates results.
PROVIDER_MIN_INTERVAL = {
    "openalex": 0.12 if OPENALEX_API_KEY else 0.25,
    "crossref": 0.25,
    "europepmc": 0.25,
    "pubmed_cited_in": 0.40,
    "pubmed": 0.40,
    "semantic_scholar": 1.10,
    "orcid": 0.30,
}
PROVIDER_MAX_CONCURRENCY = {
    "openalex": 4 if OPENALEX_API_KEY else 2,
    "crossref": 2,
    "europepmc": 2,
    "pubmed_cited_in": 1,
    "pubmed": 1,
    "semantic_scholar": 1,
    "orcid": 2,
}
DEFAULT_MIN_INTERVAL = float(os.getenv("LITERATURE_PROVIDER_MIN_INTERVAL", "0.20"))
DEFAULT_MAX_CONCURRENCY = int(os.getenv("LITERATURE_PROVIDER_CONCURRENCY", "2"))
USER_AGENT = "ZeroWall-Science-literature/1.1 (research workflow)"
DEFAULT_MAX_PDF_BYTES = 120 * 1024 * 1024
RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}
# A retry budget is shared by every acquisition/provider boundary.  The value
# means retries *after* the first attempt, so a failing operation can be tried
# at most six times in total.  Keeping this in one place prevents the old
# per-provider "3 attempts" behaviour from silently returning.
DEFAULT_RETRIES = 5
MAX_ATTEMPTS = DEFAULT_RETRIES + 1
RETRY_ATTEMPTS = DEFAULT_RETRIES
ACQUISITION_TERMINAL = {
    "downloaded", "downloaded_authorized",
    "downloaded_open_access", "downloaded_paper_download", "downloaded_tsg",
    "downloaded_europepmc", "downloaded_pmc", "downloaded_pubmed",
    "downloaded_authorized_adapter", "already_present", "unavailable_no_authorized_source",
    "blocked_ambiguous_match", "blocked_identity_mismatch", "blocked_provider_rate_limit",
    "provided_pdf",
}
WORKFLOW_MODE = "cited_by_metadata"
WEB_SEARCH_TOOLS = {"web_search", "advanced_search"}
# One query is issued against ONE engine at a time.  The tuple is a fallback
# chain in priority order, not a fan-out set: the executor only advances to the
# next engine when the current one returns nothing usable.  Enqueuing the same
# query once per engine multiplies cost without adding information, because the
# engines overwhelmingly return the same top pages.
PRIMARY_SEARCH_ENGINES = ("deepseek-official", "bing", "exa", "tavily")
FALLBACK_SEARCH_ENGINES = ("anysearch", "ddg")
SEARCH_ENGINE_CHAIN = PRIMARY_SEARCH_ENGINES + FALLBACK_SEARCH_ENGINES
FREE_SEARCH_ENGINES = PRIMARY_SEARCH_ENGINES
STATE_SCHEMA_VERSION = 4
REPORT_SCHEMA_VERSION = 3
QUEUE_TERMINAL = {"succeeded", "failed", "not_found_after_search", "ambiguous_identity", "blocked_provider"}
SENSITIVE_QUERY_KEYS = {"token", "query", "key", "api_key", "apikey", "mailto", "cookie", "authorization", "jsessionid", "signature", "sig", "iv"}
DOI_RE = re.compile(r"10\.\d{4,9}/[-._;()/:A-Z0-9]+", re.I)
PMID_RE = re.compile(r"(?:pubmed\.ncbi\.nlm\.nih\.gov/|pmid[:\s]*)?(\d{5,9})$", re.I)

# How many top-ranked authors (by citation count) get a paid author search.
# The remaining authors skip the advanced_search step to control Tavily cost.
# Override via env var LITERATURE_AUTHOR_SEARCH_LIMIT (0 = all authors).
_DEFAULT_AUTHOR_SEARCH_LIMIT = int(os.getenv("LITERATURE_AUTHOR_SEARCH_LIMIT", "20"))

# Placeholder substituted by the request executor with the author's OpenAlex
# canonical display name.  The name cannot be inlined at queue-build time: the
# citing record persisted in state.papers[].raw keeps only the PubMed-style
# abbreviation, and the canonical name lives behind an OpenAlex API call.
CANONICAL_NAME_TOKEN = "{{CANONICAL_NAME}}"

_SCRIPT_DIR = Path(__file__).parent


def load_verified_data(task_root: Path | None = None) -> dict:
    """Load verified_data.json with a two-level lookup.

    Priority (highest first):
    1. <task_root>/analysis/verified_data.json  — task-specific overrides
    2. <script_dir>/verified_data.json          — skill-level shared defaults

    Both files are deep-merged (task file wins on conflict).  Either or both
    may be absent; the pipeline always works without them.
    """
    def _load(path: Path) -> dict:
        if path.is_file():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    return data
            except (OSError, ValueError):
                pass
        return {}

    skill_data = _load(_SCRIPT_DIR / "verified_data.json")

    task_data: dict = {}
    if task_root is not None:
        task_data = _load(Path(task_root) / "analysis" / "verified_data.json")

    if not task_data:
        return skill_data or {"jif": {}, "authors": {}}
    if not skill_data:
        return task_data

    # Deep-merge: task_data wins; skill_data fills gaps
    merged: dict = {}
    for key in set(list(skill_data.keys()) + list(task_data.keys())):
        sv = skill_data.get(key, {})
        tv = task_data.get(key, {})
        if isinstance(sv, dict) and isinstance(tv, dict):
            merged[key] = {**sv, **tv}   # task keys overwrite skill keys
        else:
            merged[key] = tv if tv else sv
    return merged


def _jif_key(s: str) -> str:
    """Normalise a journal name to a lookup key: NFKD, lowercase, strip punctuation."""
    import unicodedata
    s = unicodedata.normalize("NFKD", s or "").lower()
    s = re.sub(r"['\u2019\u2018\u00ad\-\u2013\u2014]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


# ── Shared honor-extraction utilities ────────────────────────────────────────
# Used in simplified_report and apply_facts_to_state.
_HONOR_RESCUE_PATTERNS = [
    # Named fellowship with Society/Academy/Institute qualifier
    re.compile(
        r"(?:elected\s+)?(?:fellow|member)\s+of\s+(?:the\s+)?[A-Z][A-Za-z\s&]{3,55}"
        r"(?:Academy|Society|Association|Institute|Royal|National|Academiae|Europaea|Sciences)",
        re.I),
    # Well-known acronym fellowships
    re.compile(
        r"\bIEEE\s+Fellow\b|\bAAAS\s+Fellow\b|\bFACC\b|\bFAHA\b|\bFAPS\b"
        r"|\bFASN\b|\bFARVO\b|\bFRS\b|\bFMedSci\b|\bFACR\b",
        re.I),
    # Named award/prize/medal: require proper-noun prefix (capital letter, ≥3 chars)
    re.compile(
        r"\b(?:[A-Z][A-Za-z\-]{2,35}\s+){1,5}"
        r"(?:Award|Prize|Medal|Lectureship?|Fellowship)"
        r"(?:\s+(?:of|for|in|from)\s+[A-Za-z\s]{2,40})?",
        re.I),
    # Award/Prize/Medal of/for ...
    re.compile(r"(?:Award|Prize|Medal)\s+(?:of|for|in|from)\s+[A-Z][^.;,|\n]{0,60}", re.I),
    # Academician / Academy membership
    re.compile(r"academician\s+(?:of\s+)?[A-Z][^.;,|\n]{0,55}", re.I),
    re.compile(r"(?:elected\s+)?member\s+of\s+(?:the\s+)?(?:US\s+)?National\s+Academy[^.;,|\n]{0,50}", re.I),
    re.compile(r"elected\s+(?:member|fellow)\s+(?:of\s+)?[A-Z][^.;,|\n]{0,55}", re.I),
    # Chinese honours
    re.compile(r"院士|杰青|长江学者|优青|千人计划|万人计划|国家自然科学奖|国家科技进步奖"),
    # Prestigious foundation fellowships/grants
    re.compile(
        r"(?:Alfred\s+P\.\s+)?Sloan\s+(?:Research\s+)?Fellow"
        r"|Wellcome\s+(?:Trust\s+)?(?:Senior\s+)?(?:Research\s+)?Fellow"
        r"|Howard\s+Hughes\s+(?:Medical\s+)?(?:Institute\s+)?(?:Investigator|Scholar|Fellow)"
        r"|HHMI\s+(?:Investigator|Fellow|Scholar)"
        r"|Fulbright\s+(?:Research\s+)?(?:Scholar|Fellow)"
        r"|Alexander\s+von\s+Humboldt\s+(?:Fellow|Award)"
        r"|Guggenheim\s+Fellow",
        re.I),
]

_HONOR_NOISE_RX = re.compile(
    r"h-index\s*[&|,]|publications\s*[&|,]|cited\s+by\s+\d|"
    r"read\s+\d+\s+publication|research\.com\b.*overview|"
    r"researchgate\.net|google\s+scholar|back\s+to\s+top|"
    r"home\s*>|faculty\s+profile\s+page\s*$|"
    r"n/a\s+certif|certif\w*\s+n/a|quantitative\s+market|"
    r"structural\s+econom|teaching\s+assistant\b|taiwan\b|"
    r"^\s*honors[,\s]*awards\s+and\s+grants\s*$|"
    r"^\s*awards\s+and\s+grants\s*$|"
    r"\[\s*\.\.\.\s*\]",
    re.I,
)

# Discard short generic fragments rescued from snippets
_RESCUE_DISCARD_RX = re.compile(
    r"^(?:the\s+\w{1,20}|awards?\s*(?:and\s*grants?)?|grants?\s*)$",
    re.I,
)


def _rescue_honors_from_text(text: str, max_results: int = 8) -> list[str]:
    """Extract named awards/fellowships from a noisy text blob.
    Returns ≤max_results distinct clean items, each ≤100 chars.
    """
    found: list[str] = []
    for rx in _HONOR_RESCUE_PATTERNS:
        for m in rx.finditer(text):
            raw = re.sub(r"\s+", " ", m.group(0)).strip()
            # Trim trailing noise at first pipe/bracket/paren
            raw = re.sub(r"\s*[|({].*$", "", raw).strip()
            # Strip leading conjunctions / partial words left by snippet truncation
            raw = re.sub(r"^(?:and|or|,|;|\s|[a-z]{1,3})\s+", "", raw).strip()
            # Must start with a capital letter or Chinese char
            raw = re.sub(r"^[^A-Z\u4e00-\u9fff]+", "", raw).strip()
            if not raw or len(raw) < 8:
                continue
            if _HONOR_NOISE_RX.search(raw) or _RESCUE_DISCARD_RX.match(raw):
                continue
            # Reject overly generic single-word matches
            if re.match(r"^(?:numerous|several|many|various)\s+\w+\s*$", raw, re.I):
                continue
            s = raw[:100]
            # Deduplicate: skip if an existing entry is a prefix/suffix of this one
            dominated = False
            new_found = []
            for existing in found:
                if existing in s or s in existing:
                    # Keep the longer one
                    if len(s) > len(existing):
                        continue  # drop existing, keep s
                    else:
                        dominated = True
                        new_found.append(existing)
                else:
                    new_found.append(existing)
            if dominated:
                found = new_found
                continue
            found = new_found
            found.append(s)
        if len(found) >= max_results:
            break
    return found[:max_results]


def clean_honor_entry(raw: Any) -> list[str]:
    """Clean one honor/appointment entry → return 0–N short clean strings.

    1. Strip markdown links, bare URLs, leading [PageTitle] prefixes.
    2. If ≤100 chars and not noise → return as-is.
    3. If long/noisy → rescue named awards from within.
    4. Discard if nothing usable.
    """
    s = re.sub(r"\s+", " ", str(raw or "")).strip()
    s = re.sub(r"\[([^\]]{1,80})\]\(http[^\)]+\)", r"\1", s)
    s = re.sub(r"https?://\S+", "", s).strip()
    s = re.sub(r"^\[[^\]]{1,150}\]\s*", "", s).strip()
    s = re.sub(r"^\[[^\]]{1,150}\]\s*", "", s).strip()
    s = re.sub(r"[\[\]]", "", s).strip()
    s = re.sub(r"\s+", " ", s).strip()
    if not s:
        return []
    # Navigation headings and generic section labels are not personal honours.
    # Example observed in P004: "Our award" from a university site's menu.
    if re.fullmatch(
        r"(?:(?:our|the|my|his|her|their)\s+)?(?:award|awards|honou?rs?|"
        r"prizes?|medals?|recognition|achievements?|news|events?)",
        s, flags=re.I,
    ):
        return []
    if len(s) <= 100 and not _HONOR_NOISE_RX.search(s) and not _RESCUE_DISCARD_RX.match(s):
        return [s]
    return _rescue_honors_from_text(s)


@contextmanager
def file_mutex(path: Path, *, wait: bool = True):
    """OS-owned lock: released even when a worker is killed; no stale PID lock."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as handle:
        handle.seek(0, 2)
        if handle.tell() == 0:
            handle.write(b"0"); handle.flush()
        while True:
            try:
                handle.seek(0)
                if os.name == "nt":
                    import msvcrt
                    msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError:
                if not wait:
                    yield False
                    return
                time.sleep(0.05)
        try:
            yield True
        finally:
            handle.seek(0)
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


_PROCESS_LOCKS_GUARD = threading.Lock()
_PROCESS_LOCKS: dict[str, threading.RLock] = {}


def atomic_write_text(path: Path, payload: str) -> None:
    """Replace one text file atomically without sharing a predictable temp name."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.{threading.get_ident()}.{time.time_ns()}.tmp")
    try:
        for attempt in range(8):
            try:
                tmp.write_text(payload, encoding="utf-8")
                tmp.replace(path)
                return
            except PermissionError:
                if attempt == 7:
                    raise
                time.sleep(0.15 * (attempt + 1))
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass


class TaskLedgerLock:
    def __init__(self, root: Path):
        key = str(root.resolve()).lower()
        with _PROCESS_LOCKS_GUARD:
            self.thread_lock = _PROCESS_LOCKS.setdefault(key, threading.RLock())
        self.lock_path = root / "analysis" / ".locks" / "shared-ledger.lock"
        self.file_lock = None

    def __enter__(self):
        self.thread_lock.acquire()
        self.file_lock = file_mutex(self.lock_path)
        self.file_lock.__enter__()
        return True

    def __exit__(self, *args):
        try:
            if self.file_lock is not None:
                self.file_lock.__exit__(*args)
        finally:
            self.thread_lock.release()
        return False


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def clean_journal_abbreviation(journal: Any, abbreviation: Any) -> str:
    """Reject provider 'short titles' that merely repeat the full name."""
    full = clean_text(journal)
    short = clean_text(abbreviation)
    if not short:
        return ""
    normalize = lambda value: re.sub(r"[^a-z0-9]+", "", value.lower())
    return "" if full and normalize(full) == normalize(short) else short


def unique_items(values: Iterable[Any]) -> list[Any]:
    """Stable deduplication for scalar and structured provider values."""
    unique: dict[str, Any] = {}
    for value in values:
        try:
            key = json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)
        except TypeError:
            key = clean_text(value)
        if key:
            unique.setdefault(key, value)
    return list(unique.values())


def safe_name(value: str, limit: int = 120) -> str:
    value = re.sub(r"[<>:\"/\\|?*\x00-\x1f]", "_", clean_text(value)).strip(" .")
    return (value or "paper")[:limit]


def article_slug(value: str) -> str:
    """Create a stable, filesystem-safe directory name for one main article."""
    ascii_part = re.sub(r"[^a-z0-9]+", "-", clean_text(value).lower()).strip("-")
    digest = hashlib.sha1(clean_text(value).encode("utf-8")).hexdigest()[:8]
    return f"{(ascii_part or 'article')[:72]}-{digest}"


def article_identity(paper: "Paper") -> str:
    """Use a provider identifier when available, otherwise normalized title."""
    if paper.doi:
        return f"doi:{normalize_doi(paper.doi)}"
    if paper.pmid:
        return f"pmid:{clean_text(paper.pmid)}"
    return f"title:{clean_text(paper.title).lower()}"


def redact_url(value: str) -> str:
    """Keep provenance useful without persisting bearer/query credentials."""
    try:
        parsed = urlparse(value)
        query = [(key, "[REDACTED]" if key.lower() in SENSITIVE_QUERY_KEYS else val) for key, val in parse_qsl(parsed.query, keep_blank_values=True)]
        return urlunparse(parsed._replace(query=urlencode(query)))
    except ValueError:
        return "[invalid-url]"


def title_tokens(value: str) -> set[str]:
    return {x for x in re.findall(r"[a-z0-9]+", value.lower()) if len(x) > 2}


def title_score(left: str, right: str) -> float:
    a, b = title_tokens(left), title_tokens(right)
    overlap = len(a & b) / max(len(a | b), 1)
    return round(0.55 * overlap + 0.45 * SequenceMatcher(None, clean_text(left).lower(), clean_text(right).lower()).ratio(), 4)


def normalize_publication_type(value: Any, subtype: Any = "") -> str:
    """Map provider-specific publication types to the report's Chinese schema."""
    text = clean_text(value or subtype).lower().replace("_", "-")
    if any(token in text for token in ("guideline", "practice-guideline", "recommendation")):
        return "指南"
    if any(token in text for token in ("consensus", "position-statement", "consensus-statement")):
        return "共识"
    if any(token in text for token in ("book", "monograph", "reference-entry", "book-chapter")):
        return "著作"
    if any(token in text for token in ("news", "blog", "magazine", "posted-content", "media")):
        return "媒体"
    if text in {"", "journal-article", "article", "research-article", "review", "letter", "short-communication", "case-report", "clinical-trial"}:
        return "文章"
    return clean_text(value or subtype) or "文章"


@dataclass
class Paper:
    key: str
    title: str
    doi: str = ""
    pmid: str = ""
    year: str = ""
    journal: str = ""
    authors: list[str] = field(default_factory=list)
    corresponding_authors: list[str] = field(default_factory=list)
    affiliations: list[str] = field(default_factory=list)
    abstract: str = ""
    source: str = ""
    direction: str = "target"
    cited_by_counts: dict[str, int] = field(default_factory=dict)
    oa_urls: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)
    pdf_path: str = ""
    pdf_source: str = ""
    pdf_sha256: str = ""
    pdf_status: str = "not_attempted"
    parse_status: str = "not_attempted"
    parsed_text_path: str = ""
    parser_api: str = ""
    parser_task_id: str = ""
    parser_artifacts: list[dict[str, Any]] = field(default_factory=list)
    mineru_snapshot_dir: str = ""
    mineru_manifest_path: str = ""
    mineru_broken_links: list[str] = field(default_factory=list)
    mineru_file_counts: dict[str, int] = field(default_factory=dict)
    citation_contexts: list[dict[str, Any]] = field(default_factory=list)
    author_profiles: list[dict[str, Any]] = field(default_factory=list)
    acquisition_state: str = "candidate"
    acquisition_attempts: list[dict[str, Any]] = field(default_factory=list)
    countries: list[str] = field(default_factory=list)
    institutions: list[str] = field(default_factory=list)
    dedup_keys: list[str] = field(default_factory=list)
    openalex_id: str = ""
    semantic_scholar_id: str = ""
    journal_abbrev: str = ""
    publisher: str = ""
    issn: list[str] = field(default_factory=list)
    volume: str = ""
    issue: str = ""
    pages: str = ""
    journal_metric: dict[str, Any] = field(default_factory=dict)
    publication_type: str = ""
    book_authors: list[str] = field(default_factory=list)
    book_editors: list[str] = field(default_factory=list)
    group_authors: list[str] = field(default_factory=list)
    author_records: list[dict[str, Any]] = field(default_factory=list)
    citation_relation: dict[str, Any] = field(default_factory=dict)
    citation_sources: list[dict[str, Any]] = field(default_factory=list)
    provider_counts: dict[str, Any] = field(default_factory=dict)


class Task:
    def __init__(self, root: Path):
        root = root.resolve()
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        (root / "downloads").mkdir(exist_ok=True)
        analysis = root / "analysis"
        analysis.mkdir(exist_ok=True)
        # Preserve resumability for tasks created before 5.16.0, while keeping
        # all internal state out of the user-facing root for new tasks.
        def internal_or_legacy(name: str) -> Path:
            legacy = root / name
            return legacy if legacy.is_file() else analysis / name
        self.state_path = internal_or_legacy("state.json")
        self.ledger_path = internal_or_legacy("source_ledger.json")
        self.mcp_receipts_path = internal_or_legacy("mcp_receipts.jsonl")
        self.web_search_receipts_path = internal_or_legacy("web_search_receipts.jsonl")
        self.skill_receipts_path = internal_or_legacy("skill_receipts.jsonl")
        self.provider_requests_path = analysis / "provider_requests.jsonl"
        self.pdf_jobs_path = analysis / "pdf_jobs.jsonl"
        self.pdf_worker_path = analysis / "pdf_worker.json"
        self._ledger_lock = TaskLedgerLock(root)
        # Cache for provider_requests(): (mtime, size) → parsed result.
        # Avoids re-parsing 2500+ JSONL lines on every call during ingest-evidence.
        self._pr_cache: tuple[float, int, list] | None = None

    def load(self) -> dict[str, Any]:
        try:
            return json.loads(self.state_path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return {"schema": STATE_SCHEMA_VERSION, "state_revision": 0, "created_at": now(), "stage": "initialized", "single_article": True, "papers": [], "phase_status": {}}

    def save(self, state: dict[str, Any]) -> None:
        with file_mutex(self.root / "analysis" / ".locks" / "state.lock"):
            current_revision = 0
            try:
                current_revision = int(json.loads(self.state_path.read_text(encoding="utf-8")).get("state_revision") or 0)
            except (OSError, json.JSONDecodeError, TypeError, ValueError):
                pass
            state["schema"] = STATE_SCHEMA_VERSION
            state["state_revision"] = max(current_revision, int(state.get("state_revision") or 0)) + 1
            state["updated_at"] = now()
            atomic_write_text(self.state_path, json.dumps(state, ensure_ascii=False, indent=2))

    def ledger(self) -> list[dict[str, Any]]:
        try:
            return json.loads(self.ledger_path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return []

    def record(self, provider: str, url: str, status: str, **meta: Any) -> None:
        item = {"provider": provider, "url": redact_url(url), "status": status, "at": now()}
        item.update({k: v for k, v in meta.items() if v is not None})
        with self._ledger_lock:
            rows = self.ledger()
            rows.append(item)
            atomic_write_text(self.ledger_path, json.dumps(rows, ensure_ascii=False, indent=2))

    def record_mcp(self, provider: str, tool: str, status: str, **meta: Any) -> None:
        """Append a redacted receipt for an actual MCP/skill invocation."""
        item = {"provider": clean_text(provider), "tool": clean_text(tool), "status": clean_text(status), "at": now()}
        item.update({k: v for k, v in meta.items() if v is not None})
        with self._ledger_lock:
            with self.mcp_receipts_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(item, ensure_ascii=False) + "\n")

    def mcp_receipts(self) -> list[dict[str, Any]]:
        try:
            return [json.loads(line) for line in self.mcp_receipts_path.read_text(encoding="utf-8").splitlines() if line.strip()]
        except (FileNotFoundError, json.JSONDecodeError):
            return []

    def record_web_search(self, query: str, status: str, **meta: Any) -> None:
        item = {"provider": "web_search", "query": clean_text(query), "status": clean_text(status), "at": now()}
        item.update({k: v for k, v in meta.items() if v is not None})
        with self._ledger_lock:
            with self.web_search_receipts_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(item, ensure_ascii=False) + "\n")

    def web_search_receipts(self) -> list[dict[str, Any]]:
        try:
            return [json.loads(line) for line in self.web_search_receipts_path.read_text(encoding="utf-8").splitlines() if line.strip()]
        except (FileNotFoundError, json.JSONDecodeError):
            return []

    def record_skill(self, skill: str, status: str, **meta: Any) -> None:
        item = {"skill": clean_text(skill), "status": clean_text(status), "at": now()}
        item.update({k: v for k, v in meta.items() if v is not None})
        with self._ledger_lock:
            with self.skill_receipts_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(item, ensure_ascii=False) + "\n")

    def skill_receipts(self) -> list[dict[str, Any]]:
        try:
            return [json.loads(line) for line in self.skill_receipts_path.read_text(encoding="utf-8").splitlines() if line.strip()]
        except (FileNotFoundError, json.JSONDecodeError):
            return []

    def provider_requests(self) -> list[dict[str, Any]]:
        """Return the latest state for each queued capability request.

        The queue is append-only so a killed process cannot leave a partially
        rewritten file.  Consumers see one logical row per request, while the
        JSONL file retains the full state transition history.

        Result is cached by (mtime, size) so repeated calls during a single
        ingest-evidence run (which may call this thousands of times) do not
        re-parse 2500+ lines every time.
        """
        try:
            stat = self.provider_requests_path.stat()
            cache_key = (stat.st_mtime, stat.st_size)
        except OSError:
            return []
        if self._pr_cache and self._pr_cache[0] == cache_key[0] and self._pr_cache[1] == cache_key[1]:
            return list(self._pr_cache[2])
        try:
            rows = []
            for line in self.provider_requests_path.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(row, dict):
                    rows.append(row)
        except OSError:
            return []
        latest: dict[str, dict[str, Any]] = {}
        order: list[str] = []
        for row in rows:
            request_id = clean_text(row.get("request_id"))
            if not request_id:
                continue
            if request_id not in latest:
                order.append(request_id)
            latest[request_id] = row
        result = [latest[key] for key in order]
        self._pr_cache = (cache_key[0], cache_key[1], result)
        return result

    def invalidate_pr_cache(self) -> None:
        """Invalidate provider_requests cache after writing to the file."""
        self._pr_cache = None

    # Bookkeeping fields that legitimately change after a request is queued;
    # everything else is the request's CONTENT.
    _REQUEST_META_KEYS = ("status", "attempts", "created_at", "updated_at",
                          "result_path", "reason", "error", "started_at",
                          "finished_at", "provider_used", "sources", "notes")

    def enqueue_request(self, request: dict[str, Any]) -> dict[str, Any]:
        """Add one deterministic request, refreshing it when its content changed.

        Deduplication used to key on ``request_id`` alone and return the old row
        untouched.  Because ``request_id`` hashes only ``args``, any later
        improvement to a request's payload (adding the identity block, raising
        ``fetch_pages``, correcting the query) was silently discarded: a rebuild
        reported the same request count while the queue still held the old
        shape.  We therefore compare content as well; when it differs, an
        updated row with the same ``request_id`` is appended, and the
        last-row-wins reader picks it up.
        """
        request_id = clean_text(request.get("request_id"))
        if not request_id:
            raise ValueError("provider request requires request_id")
        existing = next((row for row in self.provider_requests() if row.get("request_id") == request_id), None)
        if existing:
            incoming = {key: value for key, value in request.items()
                        if key not in self._REQUEST_META_KEYS}
            current = {key: value for key, value in existing.items()
                       if key not in self._REQUEST_META_KEYS}
            if incoming == current:
                return existing
            # Content changed.  The row must be refreshed, but a refresh must not
            # resurrect work that is already done: an earlier bug appended a
            # fresh "pending" row over an already-succeeded request, so every
            # rebuild silently re-opened completed author lookups (P002 showed
            # pending -> succeeded -> pending for the same request_id, and 100
            # finished requests were counted as outstanding).
            if clean_text(existing.get("status")) in QUEUE_TERMINAL:
                carried = {key: existing.get(key) for key in
                           ("status", "attempts", "updated_at", "result_status",
                            "result_received_at", "actual_engine", "reason", "error")
                           if existing.get(key) not in (None, "")}
                item = {"request_id": request_id, "status": "pending", "attempts": 0,
                        "created_at": now(), **request, **carried}
                self.provider_requests_path.parent.mkdir(parents=True, exist_ok=True)
                with self._ledger_lock:
                    with self.provider_requests_path.open("a", encoding="utf-8") as handle:
                        handle.write(json.dumps(item, ensure_ascii=False) + "\n")
                self.invalidate_pr_cache()
                return item
        item = {"request_id": request_id, "status": "pending", "attempts": 0,
                "created_at": now(), **request}
        self.provider_requests_path.parent.mkdir(parents=True, exist_ok=True)
        with self._ledger_lock:
            with self.provider_requests_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(item, ensure_ascii=False) + "\n")
        self.invalidate_pr_cache()
        return item

    def update_request(self, request_id: str, status: str, **meta: Any) -> dict[str, Any]:
        """Append a request state transition and return the updated row."""
        current = next((row for row in self.provider_requests() if row.get("request_id") == request_id), None)
        if current is None:
            raise ValueError(f"unknown provider request: {request_id}")
        updated = dict(current)
        updated.update({"status": clean_text(status), "updated_at": now(), **meta})
        self.provider_requests_path.parent.mkdir(parents=True, exist_ok=True)
        with self._ledger_lock:
            with self.provider_requests_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(updated, ensure_ascii=False) + "\n")
        self.invalidate_pr_cache()
        return updated

    def append_pdf_job(self, row: dict[str, Any]) -> None:
        """Append one per-paper PDF worker transition.

        PDF workers never rewrite state.json.  This append-only journal keeps a
        killed worker resumable and prevents concurrent downloads from losing
        each other's paper metadata.
        """
        self.pdf_jobs_path.parent.mkdir(parents=True, exist_ok=True)
        with self._ledger_lock:
            with self.pdf_jobs_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps({"updated_at": now(), **row}, ensure_ascii=False) + "\n")

    def pdf_jobs(self) -> list[dict[str, Any]]:
        try:
            rows = []
            for line in self.pdf_jobs_path.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    try:
                        item = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if isinstance(item, dict):
                        rows.append(item)
        except OSError:
            return []
        latest: dict[str, dict[str, Any]] = {}
        order: list[str] = []
        for row in rows:
            key = clean_text(row.get("paper_key"))
            if not key:
                continue
            if key not in latest:
                order.append(key)
            latest[key] = row
        return [latest[key] for key in order]


class Client:
    def __init__(self, task: Task, timeout: float = 30.0):
        self.task, self.timeout = task, timeout
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
        self._json_cache: dict[str, dict[str, Any]] = {}
        self._provider_backoff: dict[str, float] = {}
        self._provider_lock = threading.Lock()
        # Per-provider pacing state.  A semaphore caps concurrent in-flight
        # requests and a monotonic timestamp enforces a minimum gap between
        # two consecutive requests, so a burst of parallel enrichment cannot
        # trip provider rate limits and silently truncate the citation graph.
        self._provider_gate: dict[str, threading.Semaphore] = {}
        self._provider_next_at: dict[str, float] = {}
        self._pace_lock = threading.Lock()

    def _gate(self, provider: str) -> threading.Semaphore:
        with self._pace_lock:
            gate = self._provider_gate.get(provider)
            if gate is None:
                limit = max(1, PROVIDER_MAX_CONCURRENCY.get(provider, DEFAULT_MAX_CONCURRENCY))
                gate = threading.Semaphore(limit)
                self._provider_gate[provider] = gate
            return gate

    def _pace(self, provider: str) -> None:
        """Block until this provider's minimum request interval has elapsed."""
        interval = PROVIDER_MIN_INTERVAL.get(provider, DEFAULT_MIN_INTERVAL)
        if interval <= 0:
            return
        while True:
            with self._pace_lock:
                now_monotonic = time.monotonic()
                ready_at = self._provider_next_at.get(provider, 0.0)
                if ready_at <= now_monotonic:
                    self._provider_next_at[provider] = now_monotonic + interval
                    return
                wait = ready_at - now_monotonic
            time.sleep(min(wait, 5.0))

    def get_json(self, provider: str, url: str, **kwargs: Any) -> dict[str, Any]:
        params = dict(kwargs.get("params") or {})
        headers = dict(kwargs.get("headers") or {})
        # OpenAlex: an API key (premium) or a contact address (free polite
        # pool) both grant a far higher rate budget than anonymous traffic.
        # Without either, a cold cited-by expansion is routinely answered with
        # HTTP 429 and silently yields zero citing papers.
        if provider == "openalex":
            # An API key and a polite-pool mailto are alternative identities.
            # Send exactly one: mixing them offers no extra budget and makes
            # the effective rate tier ambiguous.
            if OPENALEX_API_KEY:
                params.setdefault("api_key", OPENALEX_API_KEY)
            elif OPENALEX_MAILTO:
                params.setdefault("mailto", OPENALEX_MAILTO)
            kwargs["params"] = params
        if provider in {"pubmed", "pubmed_cited_in"}:
            ncbi_key = credential("NCBI_API_KEY")
            if ncbi_key and "api_key" not in params:
                params["api_key"] = ncbi_key
                kwargs["params"] = params
        if headers:
            kwargs["headers"] = headers
        # The cache key deliberately omits credentials so a key rotation does
        # not invalidate an otherwise valid in-process cache entry.
        cacheable_params = sorted(
            (str(k), str(v)) for k, v in params.items() if k not in {"api_key", "mailto"}
        )
        cache_key = json.dumps([provider, url, cacheable_params], ensure_ascii=False)
        if cache_key in self._json_cache:
            self.task.record_mcp(provider, f"json:{provider}", "cache_hit", url=url)
            return self._json_cache[cache_key]
        for attempt in range(1, MAX_ATTEMPTS + 1):
            with self._provider_lock:
                delay_until = self._provider_backoff.get(provider, 0.0)
            if delay_until > time.monotonic():
                time.sleep(min(delay_until - time.monotonic(), 8.0))
            response = None
            try:
                with self._gate(provider):
                    self._pace(provider)
                    response = self.session.get(url, timeout=self.timeout, **kwargs)
                self.task.record(provider, response.url, str(response.status_code), attempt=attempt)
                self.task.record_mcp(provider, f"json:{provider}", str(response.status_code), url=redact_url(response.url), attempt=attempt)
                if response.status_code == 429:
                    retry_after = float(response.headers.get("retry-after") or min(2 ** attempt, 8))
                    with self._provider_lock:
                        self._provider_backoff[provider] = time.monotonic() + retry_after
                    # Permanently slow this provider down for the rest of the
                    # run; one 429 means the current pacing is too aggressive.
                    with self._pace_lock:
                        current = PROVIDER_MIN_INTERVAL.get(provider, DEFAULT_MIN_INTERVAL)
                        PROVIDER_MIN_INTERVAL[provider] = min(current * 2 or 0.25, 5.0)
                    if attempt < MAX_ATTEMPTS:
                        time.sleep(min(retry_after, 8.0))
                        continue
                    return {}
                response.raise_for_status()
                data = response.json()
                self._json_cache[cache_key] = data
                return data
            except Exception as exc:
                self.task.record(provider, url, "error", error=type(exc).__name__, attempt=attempt)
                self.task.record_mcp(provider, f"json:{provider}", "error", url=redact_url(url), error=type(exc).__name__, attempt=attempt)
                status = getattr(locals().get("response"), "status_code", None)
                # Provider errors, HTTP 4xx/5xx responses and transport/read
                # exceptions are all retryable at this orchestration layer.
                # Authentication/identity decisions are made by the provider
                # skill after the budget is exhausted; they must not short
                # circuit the fallback chain here.
                if attempt < MAX_ATTEMPTS:
                    time.sleep(min(2 ** (attempt - 1), 4))
                    continue
                return {}

    def resolve(self, value: str) -> tuple[Paper | None, list[dict[str, Any]]]:
        raw = value.strip()
        doi_match = DOI_RE.search(raw)
        if doi_match:
            doi = doi_match.group(0).rstrip(".,;)")
            paper = self.by_doi(doi)
            return paper, []
        pmid_match = PMID_RE.search(raw)
        if pmid_match and (raw.isdigit() or "pubmed" in raw.lower() or "pmid" in raw.lower()):
            paper = self.by_pmid(pmid_match.group(1))
            return paper, []
        if Path(raw).is_file():
            return self.from_local(Path(raw)), []
        candidates = self.search_title(raw)
        if not candidates or candidates[0].raw.get("match_score", 0) < 0.65:
            return None, [{"title": p.title, "doi": p.doi, "pmid": p.pmid, "score": title_score(raw, p.title)} for p in candidates]
        return candidates[0], [{"title": p.title, "doi": p.doi, "pmid": p.pmid, "score": title_score(raw, p.title)} for p in candidates]

    def by_doi(self, doi: str) -> Paper | None:
        data = self.get_json("crossref", f"{CROSSREF}/{quote(doi, safe='')}").get("message") or {}
        if not data:
            return None
        return self.crossref_paper(data, "target")

    def by_pmid(self, pmid: str) -> Paper | None:
        data = self.get_json("europepmc", f"{EPMC}/search", params={"query": f"EXT_ID:{pmid}", "format": "json", "resultType": "core"})
        rows = (data.get("resultList") or {}).get("result") or []
        return self.epmc_paper(rows[0], "target") if rows else None

    def search_title(self, title: str) -> list[Paper]:
        cr = self.get_json("crossref", CROSSREF, params={"query.title": title, "rows": 8}).get("message", {}).get("items", [])
        ep = self.get_json("europepmc", f"{EPMC}/search", params={"query": f'TITLE:"{title}"', "format": "json", "pageSize": 8, "resultType": "core"})
        candidates = [self.crossref_paper(x, "target") for x in cr] + [self.epmc_paper(x, "target") for x in (ep.get("resultList", {}).get("result") or [])]
        unique: dict[str, Paper] = {}
        for paper in candidates:
            paper.raw["match_score"] = title_score(title, paper.title)
            key = paper.doi.lower() or paper.pmid or paper.title.lower()
            if key and (key not in unique or paper.raw["match_score"] > unique[key].raw.get("match_score", 0)):
                unique[key] = paper
        return sorted(unique.values(), key=lambda p: p.raw.get("match_score", 0), reverse=True)

    def from_local(self, path: Path) -> Paper:
        source = "local"
        titles: list[str] = []
        if path.suffix.lower() in (".xlsx", ".xlsm"):
            try:
                from openpyxl import load_workbook  # type: ignore
                book = load_workbook(path, read_only=True, data_only=True)
                titles = []
                for sheet in book.worksheets:
                    titles.extend(self._local_titles([list(row) for row in sheet.iter_rows(values_only=True)]))
                titles = self._unique_titles(titles)
                source = "local_excel"
            except Exception:
                titles = []
        elif path.suffix.lower() == ".csv":
            try:
                with path.open(encoding="utf-8-sig", newline="") as handle:
                    titles = self._local_titles(list(csv.reader(handle)))
                source = "local_csv"
            except Exception:
                titles = []
        if titles:
            if len(titles) > 1:
                preview = "；".join(titles[:3])
                raise ValueError(f"输入文件包含多个主文章标题（{len(titles)} 个）：{preview}。一次任务只能处理一篇主文章，请拆分为独立工作目录后重试。")
            return Paper(key=f"local:{path.resolve()}", title=titles[0], source=source, raw={"path": str(path.resolve()), "local_titles": titles})
        # A local PDF is intentionally not text-extracted here.  MinerU is the
        # only target-document parser in the new workflow; until it runs we
        # keep a conservative filename title and let the parsed heading replace
        # it during ingest.
        title = path.stem if path.suffix.lower() == ".pdf" else path.stem
        return Paper(key=f"local:{path.resolve()}", title=title, source="local", raw={"path": str(path.resolve())})

    @staticmethod
    def _local_titles(rows: list[list[Any]]) -> list[str]:
        """Extract distinct article titles and reject batch-style inputs."""
        if not rows:
            return []
        header = [clean_text(value).lower() for value in rows[0]]
        title_columns = [index for index, value in enumerate(header) if re.search(r"(?:^|[ _-])(title|article|paper|标题|文章)(?:$|[ _-])", value)]
        candidates: list[str] = []
        for row in rows[1:] if title_columns else rows:
            values = [row[index] for index in title_columns if index < len(row)] if title_columns else row
            for value in values:
                text = clean_text(value)
                lower = text.lower()
                if len(text) < 20 or lower in {"doi", "title", "article", "paper", "nan", "none"} or DOI_RE.fullmatch(text):
                    continue
                if re.fullmatch(r"\d{4}[-/]\d{1,2}[-/]\d{1,2}", text):
                    continue
                candidates.append(text)
        return Client._unique_titles(candidates)

    @staticmethod
    def _unique_titles(candidates: Iterable[str]) -> list[str]:
        unique: list[str] = []
        for value in candidates:
            if not any(title_score(value, existing) >= 0.94 for existing in unique):
                unique.append(value)
        return unique

    @staticmethod
    def crossref_paper(item: dict[str, Any], direction: str) -> Paper:
        doi = clean_text(item.get("DOI")).lower()
        contributors = item.get("author", []) or []
        authors = [clean_text(a.get("name") or f"{a.get('given', '')} {a.get('family', '')}") for a in contributors if clean_text(a.get("name") or f"{a.get('given', '')} {a.get('family', '')}")]
        group_authors = [clean_text(a.get("name")) for a in contributors if clean_text(a.get("name")) and not (a.get("given") or a.get("family"))]
        editors = [clean_text(a.get("name") or f"{a.get('given', '')} {a.get('family', '')}") for a in (item.get("editor", []) or []) if clean_text(a.get("name") or f"{a.get('given', '')} {a.get('family', '')}")]
        year = ((item.get("published-print") or item.get("published-online") or item.get("issued") or {}).get("date-parts") or [[""]])[0][0]
        oa = [clean_text(x.get("URL")) for x in item.get("link", []) if x.get("URL")]
        affiliations = [clean_text(a.get("name")) for author in item.get("author", []) for a in author.get("affiliation", []) if a.get("name")]
        corresponding = [clean_text(f"{a.get('given', '')} {a.get('family', '')}") for a in item.get("author", []) if a.get("role") and any(r.get("role") == "editor" for r in a.get("role", []))]
        publication_type = normalize_publication_type(item.get("type"), item.get("subtype"))
        journal = clean_text((item.get("container-title") or [""])[0])
        journal_abbrev = clean_journal_abbreviation(journal, (item.get("short-container-title") or [""])[0])
        return Paper(key=f"doi:{doi}" if doi else f"title:{clean_text((item.get('title') or [''])[0]).lower()}", title=clean_text((item.get("title") or [""])[0]), doi=doi, year=str(year), journal=journal, journal_abbrev=journal_abbrev, authors=authors, book_authors=authors if publication_type == "著作" else [], book_editors=editors, group_authors=group_authors, publication_type=publication_type, affiliations=affiliations, corresponding_authors=corresponding, oa_urls=oa, source="crossref", direction=direction, raw=item, publisher=clean_text(item.get("publisher")), issn=list(dict.fromkeys(clean_text(x) for x in item.get("ISSN", []) if clean_text(x))), volume=clean_text(item.get("volume")), issue=clean_text(item.get("issue")), pages=clean_text(item.get("page")))

    @staticmethod
    def epmc_paper(item: dict[str, Any], direction: str) -> Paper:
        doi = clean_text(item.get("doi")).lower()
        pmid = clean_text(item.get("pmid"))
        raw_authors = (item.get("authorList") or {}).get("author", [])
        authors = [clean_text(a.get("fullName") or f"{a.get('firstName', '')} {a.get('lastName', '')}") for a in raw_authors]
        group_authors = [clean_text(a.get("collectiveName")) for a in raw_authors if clean_text(a.get("collectiveName"))]
        publication_type = normalize_publication_type(clean_text(item.get("pubType") or item.get("publicationType")))
        journal = clean_text(item.get("journalTitle"))
        return Paper(key=f"doi:{doi}" if doi else f"pmid:{pmid}", title=clean_text(item.get("title")), doi=doi, pmid=pmid, year=clean_text(item.get("pubYear")), journal=journal, authors=authors, group_authors=group_authors, publication_type=publication_type, abstract=clean_text(item.get("abstractText")), source="europepmc", direction=direction, raw=item, journal_abbrev=clean_journal_abbreviation(journal, item.get("journalAbbreviation")), volume=clean_text(item.get("journalVolume")), issue=clean_text(item.get("issue")), pages=clean_text(item.get("pageInfo")))

    def enrich(self, paper: Paper) -> Paper:
        if paper.doi:
            ep = self.get_json("europepmc", f"{EPMC}/search", params={"query": f'DOI:"{paper.doi}"', "format": "json", "resultType": "core"})
            rows = (ep.get("resultList") or {}).get("result") or []
            if rows:
                other = self.epmc_paper(rows[0], paper.direction)
                paper.pmid, paper.abstract = paper.pmid or other.pmid, paper.abstract or other.abstract
                paper.authors = paper.authors or other.authors
                for attr in ("journal", "journal_abbrev", "volume", "issue", "pages"):
                    if not getattr(paper, attr) and getattr(other, attr):
                        setattr(paper, attr, getattr(other, attr))
            cr_data = self.get_json("crossref", f"{CROSSREF}/{quote(paper.doi, safe='')}").get("message") or {}
            if cr_data:
                crossref = self.crossref_paper(cr_data, paper.direction)
                for attr in ("journal", "journal_abbrev", "publisher", "volume", "issue", "pages"):
                    if not getattr(paper, attr) and getattr(crossref, attr):
                        setattr(paper, attr, getattr(crossref, attr))
                paper.issn = list(dict.fromkeys((paper.issn or []) + (crossref.issn or [])))
                paper.raw.setdefault("crossref", cr_data)
                if cr_data.get("is-referenced-by-count") is not None:
                    paper.cited_by_counts["crossref"] = int(cr_data.get("is-referenced-by-count") or 0)
                # The workflow is cited-by only. Do not retain the target's
                # bibliography in task state or expose it in reports.
        if paper.doi:
            oa = self.get_json("openalex", f"{OPENALEX}/https://doi.org/{quote(paper.doi, safe='')}")
            if oa:
                paper.cited_by_counts["openalex"] = int(oa.get("cited_by_count") or 0)
                paper.raw["openalex"] = slim_openalex(oa)
                loc = oa.get("best_oa_location") or {}
                if loc.get("pdf_url"):
                    paper.oa_urls.append(loc["pdf_url"])
                paper.raw["openalex_id"] = oa.get("id")
                paper.openalex_id = clean_text(oa.get("id"))
                paper.institutions = list(dict.fromkeys(clean_text(x.get("institution", {}).get("display_name")) for a in oa.get("authorships", []) for x in a.get("institutions", []) if clean_text(x.get("institution", {}).get("display_name"))))
                paper.countries = list(dict.fromkeys(clean_text(x.get("country_code")) for a in oa.get("authorships", []) for x in a.get("institutions", []) if clean_text(x.get("country_code"))))
            cr = paper.raw if paper.source == "crossref" else {}
            if cr.get("is-referenced-by-count") is not None:
                paper.cited_by_counts["crossref"] = int(cr.get("is-referenced-by-count") or 0)
            s2_key = os.getenv("S2_API_KEY", "").strip()
            headers = {"x-api-key": s2_key} if s2_key else {}
            s2 = self.get_json("semantic_scholar", f"https://api.semanticscholar.org/graph/v1/paper/DOI:{quote(paper.doi, safe='')}", headers=headers, params={"fields": "citationCount,authors"})
            if s2.get("citationCount") is not None:
                paper.cited_by_counts["semantic_scholar"] = int(s2.get("citationCount") or 0)
            paper.semantic_scholar_id = paper.semantic_scholar_id or clean_text(s2.get("paperId"))
            # ORCID public records are optional and only used for explicit, verified claims.
            orcid_profiles = paper.raw.setdefault("orcid_profiles", {})
            for author in paper.raw.get("author", []) or []:
                oid = clean_text(author.get("ORCID") or author.get("orcid"))
                if not oid or oid in orcid_profiles: continue
                oid = oid.rstrip("/").rsplit("/", 1)[-1]
                profile = self.get_json("orcid", f"https://pub.orcid.org/v3.0/{oid}/record", headers={"Accept": "application/json"})
                if profile:
                    summary = (profile.get("activities-summary") or {})
                    employments = ((summary.get("employments") or {}).get("affiliation-group") or [])
                    roles = []
                    for group in employments:
                        for item in group.get("summaries", []) or []:
                            org = ((item.get("employment-summary") or {}).get("organization") or {}).get("name")
                            role_name = (item.get("employment-summary") or {}).get("role-title")
                            if org or role_name: roles.append({"organization": clean_text(org), "role": clean_text(role_name)})
                    distinctions = ((summary.get("fundings") or {}).get("group") or [])
                    orcid_profiles[oid] = {"url": f"https://orcid.org/{oid}", "employments": roles, "distinctions": distinctions}
        return dedupe_urls(paper)

    def cited_by_openalex(self, target: Paper, max_papers: int | None) -> list[dict[str, Any]]:
        """Return citing OpenAlex work RECORDS (not just ids) for the target.

        The ``cites:`` listing already carries every field the pipeline needs
        (title, DOI, year, authorships, institutions, source, OA location), so
        whole records are returned.  Re-fetching each work individually would
        cost one extra request per citing paper for no new information.
        """
        oa = target.raw.get("openalex") or {}
        oa_id = clean_text(oa.get("id")) or clean_text(getattr(target, "openalex_id", ""))
        if not oa_id:
            return []
        records: list[dict[str, Any]] = []
        cursor = "*"
        while len(records) < (max_papers or 100000):
            page = self.get_json("openalex", OPENALEX, params={
                "filter": f"cites:{oa_id.split('/')[-1]}",
                "per-page": min(200, max_papers or 200),
                "cursor": cursor,
            })
            rows = page.get("results") or []
            records.extend(row for row in rows if isinstance(row, dict) and row.get("id"))
            cursor = (page.get("meta") or {}).get("next_cursor")
            if not rows or not cursor:
                break
        return records[:max_papers] if max_papers else records

    def cited_by_pubmed(self, target: Paper) -> list[str]:
        """Collect citing PMIDs from the NCBI pubmed_pubmed_citedin link set."""
        pmid = clean_text(target.pmid)
        if not pmid:
            return []
        data = self.get_json("pubmed_cited_in", f"{EUTILS}/elink.fcgi", params={
            "dbfrom": "pubmed", "db": "pubmed",
            "linkname": "pubmed_pubmed_citedin", "id": pmid, "retmode": "json",
        })
        pmids: list[str] = []
        for linkset in data.get("linksets") or []:
            for db in linkset.get("linksetdbs") or []:
                if clean_text(db.get("linkname")) != "pubmed_pubmed_citedin":
                    continue
                pmids.extend(clean_text(x) for x in (db.get("links") or []) if clean_text(x))
        return list(dict.fromkeys(pmids))

    def cited_by_europepmc(self, target: Paper) -> list[dict[str, str]]:
        """Collect citing records from the Europe PMC citations endpoint."""
        pmid = clean_text(target.pmid)
        if not pmid:
            return []
        rows: list[dict[str, str]] = []
        page = 1
        while page <= 20:
            data = self.get_json("europepmc", f"{EPMC}/MED/{pmid}/citations", params={
                "format": "json", "pageSize": 500, "page": page,
            })
            items = (data.get("citationList") or {}).get("citation") or []
            if not items:
                break
            for item in items:
                rows.append({
                    "pmid": clean_text(item.get("id")),
                    "doi": normalize_doi(clean_text(item.get("doi"))),
                    "title": clean_text(item.get("title")),
                })
            if len(items) < 500:
                break
            page += 1
        return rows

    def cited_by_semantic_scholar(self, target: Paper) -> list[str]:
        """Collect citing DOIs from the Semantic Scholar citation graph."""
        ident = ""
        if clean_text(target.doi):
            ident = f"DOI:{quote(clean_text(target.doi), safe='')}"
        elif clean_text(target.pmid):
            ident = f"PMID:{clean_text(target.pmid)}"
        if not ident:
            return []
        key = os.getenv("S2_API_KEY", "").strip()
        headers = {"x-api-key": key} if key else {}
        dois: list[str] = []
        offset = 0
        while offset < 2000:
            data = self.get_json("semantic_scholar", f"{S2_GRAPH}/paper/{ident}/citations",
                                 headers=headers,
                                 params={"fields": "externalIds,title", "limit": 100, "offset": offset})
            items = data.get("data") or []
            if not items:
                break
            for item in items:
                external = (item.get("citingPaper") or {}).get("externalIds") or {}
                doi = normalize_doi(clean_text(external.get("DOI")))
                if doi:
                    dois.append(doi)
            if len(items) < 100:
                break
            offset += 100
        return list(dict.fromkeys(dois))

    def expand_openalex(self, target: Paper, direction: str, max_papers: int | None) -> list[Paper]:
        """Expand the citation graph of the target.

        For ``cited-by`` the providers form a SEQUENTIAL FALLBACK CHAIN, not a
        fan-out.  OpenAlex is the primary source; once it returns a usable
        cited-by set the chain stops and no other provider is queried.  The
        remaining providers (PubMed cited-in, Europe PMC, Semantic Scholar) are
        only consulted when every earlier provider yielded nothing, so a single
        provider outage cannot empty the result while a healthy primary never
        costs redundant requests.
        """
        oa = target.raw.get("openalex") or {}
        if direction == "references":
            ids = list(oa.get("referenced_works") or [])
            # Crossref is the authoritative fallback when OpenAlex has an incomplete graph.
            for ref in target.raw.get("reference", []) or []:
                doi = clean_text(ref.get("DOI") or ref.get("doi")).lower()
                if doi:
                    ids.append(f"doi:{doi}")
            return self._papers_from_openalex_ids(ids, direction, max_papers)

        attempted: list[str] = []

        # 1) OpenAlex - primary. A non-empty result ends the chain.
        attempted.append("openalex")
        openalex_records = self.cited_by_openalex(target, max_papers)
        if openalex_records:
            papers = self._papers_from_openalex_records(openalex_records, direction, max_papers)
            if papers:
                self._record_cited_by_source(target, "openalex", attempted, len(papers))
                return papers

        # 2) PubMed cited-in - first fallback.
        attempted.append("pubmed_cited_in")
        pubmed_ids = self.cited_by_pubmed(target)
        if pubmed_ids:
            papers = self._papers_from_pmids(pubmed_ids, direction, max_papers)
            if papers:
                self._record_cited_by_source(target, "pubmed_cited_in", attempted, len(papers))
                return papers

        # 3) Europe PMC - second fallback.
        attempted.append("europepmc")
        epmc_rows = self.cited_by_europepmc(target)
        if epmc_rows:
            papers = self._papers_from_mixed_rows(epmc_rows, direction, max_papers, "Europe PMC")
            if papers:
                self._record_cited_by_source(target, "europepmc", attempted, len(papers))
                return papers

        # 4) Semantic Scholar - last fallback.
        attempted.append("semantic_scholar")
        s2_dois = self.cited_by_semantic_scholar(target)
        if s2_dois:
            papers = self._papers_from_dois(s2_dois, direction, max_papers, "Semantic Scholar")
            if papers:
                self._record_cited_by_source(target, "semantic_scholar", attempted, len(papers))
                return papers

        self._record_cited_by_source(target, "none", attempted, 0)
        return []

    def _record_cited_by_source(self, target: Paper, winner: str, attempted: list[str], count: int) -> None:
        """Record which provider actually supplied the cited-by set."""
        target.raw["cited_by_source"] = winner
        target.raw["cited_by_providers_attempted"] = attempted
        self.task.record_mcp("citation_graph", "cited_by_chain", "resolved",
                             source=winner, attempted=",".join(attempted), retrieved=count)

    def _papers_from_pmids(self, pmids: list[str], direction: str, max_papers: int | None) -> list[Paper]:
        papers: list[Paper] = []
        seen: set[str] = set()
        for pmid in pmids:
            if max_papers and len(papers) >= max_papers:
                break
            resolved = self.by_pmid(pmid)
            if resolved is None:
                continue
            resolved.direction = direction
            resolved.raw.setdefault("citation_source", "PubMed")
            keys = identity_keys(resolved)
            if any(key in seen for key in keys):
                continue
            seen.update(keys)
            papers.append(self.enrich(resolved))
        return papers

    def _papers_from_dois(self, dois: list[str], direction: str, max_papers: int | None,
                          citation_source: str) -> list[Paper]:
        papers: list[Paper] = []
        seen: set[str] = set()
        for doi in dois:
            if max_papers and len(papers) >= max_papers:
                break
            resolved = self.by_doi(doi)
            if resolved is None:
                continue
            resolved.direction = direction
            resolved.raw.setdefault("citation_source", citation_source)
            keys = identity_keys(resolved)
            if any(key in seen for key in keys):
                continue
            seen.update(keys)
            papers.append(self.enrich(resolved))
        return papers

    def _papers_from_mixed_rows(self, rows: list[dict[str, str]], direction: str,
                                max_papers: int | None, citation_source: str) -> list[Paper]:
        papers: list[Paper] = []
        seen: set[str] = set()
        for row in rows:
            if max_papers and len(papers) >= max_papers:
                break
            resolved = None
            if row.get("doi"):
                resolved = self.by_doi(row["doi"])
            if resolved is None and row.get("pmid"):
                resolved = self.by_pmid(row["pmid"])
            if resolved is None:
                continue
            resolved.direction = direction
            resolved.raw.setdefault("citation_source", citation_source)
            keys = identity_keys(resolved)
            if any(key in seen for key in keys):
                continue
            seen.update(keys)
            papers.append(self.enrich(resolved))
        return papers

    def paper_from_openalex_record(self, item: dict[str, Any], direction: str,
                                   index: int | None = None) -> Paper:
        """Build a Paper from one complete OpenAlex work record (no request)."""
        doi = clean_text(item.get("doi")).replace("https://doi.org/", "").lower()
        authors = [clean_text(a.get("author", {}).get("display_name", "")) for a in item.get("authorships", [])]
        authors = [name for name in authors if name]
        source = (item.get("primary_location") or {}).get("source") or {}
        source_issn = source.get("issn") or []
        if isinstance(source_issn, str):
            source_issn = [source_issn]
        source_issn = list(dict.fromkeys(
            clean_text(value) for value in ([source.get("issn_l")] + list(source_issn))
            if clean_text(value)
        ))
        source_name = clean_text(source.get("display_name"))
        paper = Paper(
            key=f"doi:{doi}" if doi else f"openalex:{item.get('id')}",
            title=clean_text(item.get("title") or item.get("display_name")),
            doi=doi, year=str(item.get("publication_year") or ""),
            journal=source_name,
            journal_abbrev=clean_journal_abbreviation(source_name, source.get("abbreviated_title")),
            publisher=clean_text(source.get("host_organization_name")),
            authors=authors, source="openalex", direction=direction,
            publication_type=normalize_publication_type(item.get("type"), item.get("subtype")),
            cited_by_counts={"openalex": int(item.get("cited_by_count") or 0)},
            raw={"openalex": slim_openalex(item),
                 "reference_index": index if direction == "references" else None,
                 "citation_source": "OpenAlex" if direction == "cited-by" else ""},
            openalex_id=clean_text(item.get("id")), issn=source_issn,
        )
        paper.institutions = list(dict.fromkeys(
            clean_text(a.get("institutions", [{}])[0].get("display_name"))
            for a in item.get("authorships", [])
            if a.get("institutions") and clean_text(a.get("institutions", [{}])[0].get("display_name"))
        ))
        paper.countries = list(dict.fromkeys(
            clean_text(i.get("country_code")) for a in item.get("authorships", [])
            for i in a.get("institutions", []) if clean_text(i.get("country_code"))
        ))
        loc = item.get("best_oa_location") or {}
        if loc.get("pdf_url"):
            paper.oa_urls.append(loc["pdf_url"])
        pmid = clean_text((item.get("ids") or {}).get("pmid"))
        if pmid:
            paper.pmid = pmid.rsplit("/", 1)[-1]
        return dedupe_urls(paper)

    def _papers_from_openalex_records(self, records: list[dict[str, Any]], direction: str,
                                      max_papers: int | None) -> list[Paper]:
        """Build papers from complete OpenAlex records already in hand.

        Each paper is enriched only for the fields OpenAlex does not provide,
        which keeps cited-by expansion to roughly one extra request per paper
        instead of five.
        """
        papers: list[Paper] = []
        seen: set[str] = set()
        for index, item in enumerate(records, 1):
            if max_papers and len(papers) >= max_papers:
                break
            paper = self.paper_from_openalex_record(item, direction, index)
            keys = identity_keys(paper)
            if any(key in seen for key in keys):
                continue
            seen.update(keys)
            papers.append(self.enrich_light(paper))
        return papers

    def enrich_light(self, paper: Paper) -> Paper:
        """Fill only the gaps OpenAlex left, using at most one extra request.

        Crossref/Europe PMC/S2/ORCID round trips are skipped when OpenAlex
        already supplied title, journal, year and authors, because a cited-by
        listing normally carries all of them.  This is what keeps a 50-paper
        expansion inside a normal command timeout.
        """
        needs_identity = not clean_text(paper.pmid)
        needs_bibliographic = not (clean_text(paper.journal) and clean_text(paper.year) and paper.authors)
        if not (needs_identity or needs_bibliographic):
            return dedupe_urls(paper)
        if clean_text(paper.doi):
            ep = self.get_json("europepmc", f"{EPMC}/search", params={
                "query": f'DOI:"{paper.doi}"', "format": "json", "resultType": "core"})
            rows = (ep.get("resultList") or {}).get("result") or []
            if rows:
                other = self.epmc_paper(rows[0], paper.direction)
                paper.pmid = paper.pmid or other.pmid
                paper.abstract = paper.abstract or other.abstract
                paper.authors = paper.authors or other.authors
                for attr in ("journal", "journal_abbrev", "volume", "issue", "pages"):
                    if not getattr(paper, attr) and getattr(other, attr):
                        setattr(paper, attr, getattr(other, attr))
        return dedupe_urls(paper)

    def _papers_from_openalex_ids(self, ids: list[str], direction: str, max_papers: int | None) -> list[Paper]:
        papers: list[Paper] = []
        seen = set()
        for index, ident in enumerate(ids[:max_papers] if max_papers else ids, 1):
            if ident in seen: continue
            seen.add(ident)
            if ident.startswith("doi:"):
                resolved = self.by_doi(ident[4:])
                if resolved:
                    resolved.direction = direction; resolved.raw["reference_index"] = index; papers.append(self.enrich(resolved))
                continue
            api_ident = ident.replace("https://openalex.org/", f"{OPENALEX}/") if ident.startswith("https://openalex.org/") else ident
            item = self.get_json("openalex", api_ident)
            if not item: continue
            doi = clean_text(item.get("doi")).replace("https://doi.org/", "").lower()
            authors = [clean_text(f"{a.get('author', {}).get('display_name', '')}") for a in item.get("authorships", [])]
            source = (item.get("primary_location") or {}).get("source") or {}
            source_issn = source.get("issn") or []
            if isinstance(source_issn, str):
                source_issn = [source_issn]
            source_issn = list(dict.fromkeys(
                clean_text(value) for value in ([source.get("issn_l")] + list(source_issn))
                if clean_text(value)
            ))
            source_name = clean_text(source.get("display_name"))
            paper = Paper(key=f"doi:{doi}" if doi else f"openalex:{item.get('id')}", title=clean_text(item.get("title")), doi=doi, year=str(item.get("publication_year") or ""), journal=source_name, journal_abbrev=clean_journal_abbreviation(source_name, source.get("abbreviated_title")), publisher=clean_text(source.get("host_organization_name")), authors=authors, source="openalex", direction=direction, publication_type=normalize_publication_type(item.get("type"), item.get("subtype")), cited_by_counts={"openalex": int(item.get("cited_by_count") or 0)}, raw={"openalex": slim_openalex(item), "reference_index": index if direction == "references" else None, "citation_source": "OpenAlex" if direction == "cited-by" else ""}, openalex_id=clean_text(item.get("id")), issn=source_issn)
            paper.institutions = list(dict.fromkeys(clean_text(a.get("institutions", [{}])[0].get("display_name")) for a in item.get("authorships", []) if a.get("institutions") and clean_text(a.get("institutions", [{}])[0].get("display_name"))))
            paper.countries = list(dict.fromkeys(clean_text(i.get("country_code")) for a in item.get("authorships", []) for i in a.get("institutions", []) if clean_text(i.get("country_code"))))
            loc = item.get("best_oa_location") or {}
            if loc.get("pdf_url"): paper.oa_urls.append(loc["pdf_url"])
            papers.append(self.enrich(paper))
        return papers


def dedupe_urls(paper: Paper) -> Paper:
    paper.oa_urls = list(dict.fromkeys(x for x in paper.oa_urls if x.startswith(("http://", "https://"))))
    return paper


def normalize_doi(value: str) -> str:
    return clean_text(value).lower().removeprefix("https://doi.org/").removeprefix("http://doi.org/").rstrip(".,;)")


def identity_keys(paper: Paper) -> list[str]:
    keys = []
    if paper.doi: keys.append(f"doi:{normalize_doi(paper.doi)}")
    if paper.pmid: keys.append(f"pmid:{clean_text(paper.pmid)}")
    if paper.openalex_id: keys.append(f"openalex:{paper.openalex_id.rsplit('/', 1)[-1].lower()}")
    if paper.semantic_scholar_id: keys.append(f"s2:{clean_text(paper.semantic_scholar_id).lower()}")
    if paper.title:
        token = " ".join(sorted(title_tokens(paper.title)))
        keys.append(f"title:{token}:{paper.year}")
    return list(dict.fromkeys(keys))


def merge_paper(existing: Paper, incoming: Paper) -> Paper:
    for attr in ("doi", "pmid", "year", "journal", "journal_abbrev", "publisher", "volume", "issue", "pages", "abstract", "pdf_path", "pdf_source", "pdf_sha256", "openalex_id", "semantic_scholar_id", "publication_type"):
        if not getattr(existing, attr) and getattr(incoming, attr): setattr(existing, attr, getattr(incoming, attr))
    for attr in ("authors", "book_authors", "book_editors", "group_authors", "affiliations", "oa_urls", "countries", "institutions", "issn"):
        setattr(existing, attr, list(dict.fromkeys((getattr(existing, attr) or []) + (getattr(incoming, attr) or []))))
    if incoming.journal_metric:
        existing.journal_metric = {**existing.journal_metric, **incoming.journal_metric}
    existing.cited_by_counts.update(incoming.cited_by_counts)
    existing.raw.update({k: v for k, v in incoming.raw.items() if v not in (None, "", [], {})})
    existing.dedup_keys = identity_keys(existing)
    return existing


def deduplicate_papers(papers: list[Paper]) -> tuple[list[Paper], list[dict[str, Any]]]:
    by_key: dict[str, Paper] = {}
    aliases: list[dict[str, Any]] = []
    for paper in papers:
        keys = identity_keys(paper); paper.dedup_keys = keys
        found = next((by_key[k] for k in keys if k in by_key), None)
        if found:
            aliases.append({"duplicate": paper.key, "canonical": found.key, "keys": keys})
            merge_paper(found, paper)
        else:
            by_key[keys[0] if keys else paper.key] = paper
            for key in keys: by_key.setdefault(key, paper)
    unique = []
    seen_ids = set()
    for paper in by_key.values():
        if id(paper) not in seen_ids:
            seen_ids.add(id(paper)); unique.append(paper)
    return unique, aliases


def citation_relation(target: Paper, paper: Paper) -> dict[str, Any]:
    """Describe a cited-by edge without pretending to have read PDF body text."""
    target_authors = {clean_text(x).lower() for x in target.authors if clean_text(x)}
    paper_authors = {clean_text(x).lower() for x in paper.authors if clean_text(x)}
    overlap = target_authors & paper_authors
    if not target_authors or not paper_authors:
        self_citation = "unknown"
    elif overlap:
        self_citation = "full" if target_authors <= paper_authors else "partial"
    else:
        self_citation = "no"
    corpus = f"{paper.title} {paper.abstract}".lower()
    target_corpus = clean_text(target.raw.get("mineru_excerpt") or target.title).lower()
    shared_terms = sorted(title_tokens(corpus) & title_tokens(target_corpus))[:20]
    if any(word in corpus for word in ("supports", "supporting", "consistent with", "confirm", "validates")):
        usage, confidence = "支持", "medium"
    elif any(word in corpus for word in ("contradict", "challenge", "disagree", "refute", "critic")):
        usage, confidence = "质疑/反驳", "medium"
    elif paper.abstract or paper.title:
        usage, confidence = "中立", "low"
    else:
        usage, confidence = "未确认", "low"
    count = max((int(v or 0) for v in paper.cited_by_counts.values()), default=0)
    return {
        "target_paper": target.key, "citing_paper": paper.key, "cited": True,
        "citation_source": clean_text(paper.raw.get("citation_source")) or "OpenAlex",
        "citation_count": count, "citation_type": paper.publication_type or normalize_publication_type(paper.raw.get("type") or paper.raw.get("pubType")),
        "self_citation": self_citation,
        "relation_description": f"基于目标 MinerU 正文与引文标题/摘要关键词对照（共同词：{', '.join(shared_terms) or '未识别'}）的关系判断；非引文 PDF 正文原文。",
        "usage_judgement": usage, "evidence_basis": "title_abstract_keywords_search",
        "confidence": confidence, "sources": [x for x in (paper.doi, paper.pmid, paper.openalex_id) if x],
        "author_overlap": sorted(overlap), "shared_terms": shared_terms,
    }


def journal_metadata(paper: Paper) -> dict[str, Any]:
    raw = paper.raw or {}
    container = raw.get("container-title") or []
    journal = paper.journal or clean_text(container[0] if container else "")
    abbrev = paper.journal_abbrev or clean_text((raw.get("short-container-title") or [""])[0] if raw.get("short-container-title") else "")
    # Start with capability evidence already ingested for this paper.  The old
    # implementation rebuilt this dictionary from scratch while rendering,
    # which silently discarded successful web/OpenAlex journal lookups.
    metric: dict[str, Any] = dict(paper.journal_metric or {})
    metric_file = os.getenv("LITERATURE_JOURNAL_METRICS_FILE", "").strip()
    if metric_file:
        try:
            metrics = json.loads(Path(metric_file).read_text(encoding="utf-8"))
            supplied = metrics.get(journal) or metrics.get(abbrev) or metrics.get(clean_text(paper.issn[0] if paper.issn else "")) or {}
            supplied = supplied if isinstance(supplied, dict) else {"impact_factor": supplied}
            metric.update({key: value for key, value in supplied.items() if value not in (None, "", [], {})})
        except (OSError, json.JSONDecodeError):
            pass
    if not isinstance(metric, dict):
        metric = {"impact_factor": metric}
    oa = raw.get("openalex") or {}
    source = (oa.get("primary_location") or {}).get("source") or {}
    summary_stats = source.get("summary_stats") or {}
    # OpenAlex does not publish JCR impact factor. Keep its transparent
    # substitute separately instead of relabelling it as an impact factor.
    if summary_stats.get("2yr_mean_citedness") is not None:
        metric.setdefault("openalex_2yr_mean_citedness", summary_stats.get("2yr_mean_citedness"))
        metric.setdefault("openalex_metric_year", paper.year or "")
    metric.setdefault("metric_type", "JCR impact factor" if metric.get("impact_factor") is not None else ("OpenAlex 2-year mean citedness" if metric.get("openalex_2yr_mean_citedness") is not None else "未获取"))
    metric.setdefault("metric_year", metric.get("year") or metric.get("impact_factor_year") or metric.get("openalex_metric_year") or "")
    metric.setdefault("metric_source", metric.get("source") or ("LITERATURE_JOURNAL_METRICS_FILE" if metric.get("impact_factor") is not None else ("OpenAlex" if metric.get("openalex_2yr_mean_citedness") is not None else "")))
    paper.journal = journal
    paper.journal_abbrev = abbrev
    paper.journal_metric = metric if isinstance(metric, dict) else {}
    return {
        "journal_full": journal, "journal_abbrev": abbrev, "publisher": paper.publisher,
        "issn": "; ".join(paper.issn), "volume": paper.volume, "issue": paper.issue,
        "pages": paper.pages, "publication_type": paper.publication_type or normalize_publication_type(paper.raw.get("type") or paper.raw.get("pubType")),
        "impact_factor": paper.journal_metric.get("impact_factor", ""),
        "impact_factor_year": paper.journal_metric.get("impact_factor_year") or paper.journal_metric.get("year", ""),
        "metric_type": paper.journal_metric.get("metric_type", "未获取"),
        "metric_source": paper.journal_metric.get("metric_source", ""),
        "openalex_2yr_mean_citedness": paper.journal_metric.get("openalex_2yr_mean_citedness", ""),
        "citescore": paper.journal_metric.get("citescore", ""),
        "scimago_sjr": paper.journal_metric.get("scimago_sjr", ""),
        "metric": paper.journal_metric,
        "metric_status": "verified" if metric.get("impact_factor") is not None or metric.get("openalex_2yr_mean_citedness") is not None or metric.get("citescore") is not None or metric.get("scimago_sjr") is not None else "not_found",
    }


def _structured_result(result: Any) -> dict[str, Any]:
    """Flatten structured Host/model envelopes without dropping verified facts."""
    if not isinstance(result, dict):
        return {}
    merged: dict[str, Any] = {}
    seen: set[int] = set()

    def visit(value: Any, depth: int = 0) -> None:
        if not isinstance(value, dict) or depth > 8 or id(value) in seen:
            return
        seen.add(id(value))
        # Envelope fields are visited first; explicit outer metadata can then
        # add provenance without replacing non-empty extracted values.
        for key in ("result", "value", "data", "facts", "verified_facts", "journal_metric", "metrics"):
            nested = value.get(key)
            if isinstance(nested, dict):
                visit(nested, depth + 1)
            elif key in {"facts", "verified_facts"} and isinstance(nested, list):
                # Model extractors may return facts either as one object or as
                # [{"field": "impact_factor", "value": 5.4}, ...].  Do not
                # recurse through arbitrary result lists: search result titles
                # must never be mistaken for an author's current job title.
                for fact in nested:
                    if not isinstance(fact, dict):
                        continue
                    fact_key = clean_text(
                        fact.get("field") or fact.get("key") or fact.get("attribute")
                    )
                    fact_value = fact.get("value", fact.get("fact"))
                    if fact_key and fact_value not in (None, "", [], {}):
                        merged.setdefault(fact_key, fact_value)
                    else:
                        visit(fact, depth + 1)
        for key, item in value.items():
            if key in {"result", "value", "data", "facts", "verified_facts", "journal_metric", "metrics"}:
                continue
            if item not in (None, "", [], {}):
                merged.setdefault(key, item)
        for key in ("content", "text", "answer", "output"):
            text_value = value.get(key)
            if not isinstance(text_value, str):
                continue
            candidate = re.sub(r"^```(?:json)?\s*|\s*```$", "", text_value.strip(), flags=re.I)
            try:
                parsed = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            visit(parsed, depth + 1)

    visit(result)
    return merged


def extract_ingested_journal_metric(result: Any, request: dict[str, Any]) -> dict[str, Any]:
    """Normalize verified journal metrics returned by Host capabilities.

    Search snippets are deliberately not mined for a floating-point number.
    A true impact factor is accepted only as an explicit structured field and
    remains labelled separately from CiteScore, SJR and OpenAlex substitutes.
    """
    payload = _structured_result(result)
    metric: dict[str, Any] = {}
    aliases = {
        "journal": "journal_full", "journal_name": "journal_full",
        "journal_full": "journal_full", "display_name": "journal_full",
        "journal_abbrev": "journal_abbrev", "journal_abbreviation": "journal_abbrev",
        "abbreviation": "journal_abbrev", "abbreviated_title": "journal_abbrev",
        "iso_abbreviation": "journal_abbrev", "isoAbbreviation": "journal_abbrev",
        "issn": "issn", "issns": "issn",
        "impact_factor": "impact_factor", "latest_impact_factor": "impact_factor",
        "journal_impact_factor": "impact_factor", "jif": "impact_factor",
        "impact_factor_year": "impact_factor_year", "jif_year": "impact_factor_year",
        "metric_year": "metric_year", "year": "metric_year",
        "citescore": "citescore", "cite_score": "citescore",
        "sjr": "scimago_sjr", "scimago_sjr": "scimago_sjr",
        "2yr_mean_citedness": "openalex_2yr_mean_citedness",
        "openalex_2yr_mean_citedness": "openalex_2yr_mean_citedness",
        "metric_type": "metric_type", "metric_source": "metric_source",
        "source_url": "source_url", "url": "source_url",
    }
    for source_key, target_key in aliases.items():
        value = payload.get(source_key)
        if value not in (None, "", [], {}):
            metric[target_key] = value
    summary = payload.get("summary_stats") or ((payload.get("source") or {}).get("summary_stats") if isinstance(payload.get("source"), dict) else {})
    if isinstance(summary, dict) and summary.get("2yr_mean_citedness") is not None:
        metric.setdefault("openalex_2yr_mean_citedness", summary["2yr_mean_citedness"])
    source_urls: list[str] = []
    for source in payload.get("sources") or payload.get("citations") or []:
        if isinstance(source, dict) and source.get("url"):
            source_urls.append(clean_text(source["url"]))
        elif isinstance(source, str) and source.startswith(("http://", "https://")):
            source_urls.append(source)
    if metric.get("source_url"):
        source_urls.insert(0, clean_text(metric["source_url"]))
    if source_urls:
        metric["source_urls"] = list(dict.fromkeys(source_urls))
        metric.setdefault("source_url", metric["source_urls"][0])
    substantive = (
        "journal_full", "journal_abbrev", "issn", "impact_factor", "citescore",
        "scimago_sjr", "openalex_2yr_mean_citedness",
    )
    if not any(metric.get(key) not in (None, "") for key in substantive):
        return {}
    tool = clean_text(request.get("tool"))
    if metric.get("impact_factor") is not None:
        metric.setdefault("metric_type", "JCR impact factor")
    elif metric.get("citescore") is not None:
        metric.setdefault("metric_type", "CiteScore")
    elif metric.get("scimago_sjr") is not None:
        metric.setdefault("metric_type", "SCImago SJR")
    elif metric.get("openalex_2yr_mean_citedness") is not None:
        metric.setdefault("metric_type", "OpenAlex 2-year mean citedness")
    metric.setdefault("metric_source", payload.get("source_name") or payload.get("provider") or tool)
    metric.setdefault("retrieved_at", now())
    return {key: value for key, value in metric.items() if value not in (None, "", [], {})}


def _journal_identity(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", clean_text(value).lower())


def journal_result_matches_request(result: Any, request: dict[str, Any]) -> bool:
    """Require returned journal name or ISSN to match the queued journal."""
    payload = _structured_result(result)
    context = {**(request.get("context") or {}), **(request.get("args") or {})}
    requested_names = {_journal_identity(context.get("journal"))} - {""}
    requested_issn = {
        re.sub(r"[^0-9x]", "", clean_text(value).lower())
        for value in (context.get("issn") or []) if clean_text(value)
    }
    returned_names: set[str] = set()
    for key in ("journal", "journal_name", "journal_full", "display_name", "source_name"):
        if payload.get(key):
            returned_names.add(_journal_identity(payload[key]))
    returned_issn: set[str] = set()
    raw_issn = payload.get("issn") or payload.get("issns") or []
    if isinstance(raw_issn, str):
        raw_issn = re.split(r"[,;\s]+", raw_issn)
    for value in raw_issn if isinstance(raw_issn, list) else []:
        normalized = re.sub(r"[^0-9x]", "", clean_text(value).lower())
        if normalized:
            returned_issn.add(normalized)
    return bool((requested_names & returned_names) or (requested_issn & returned_issn))


def apply_journal_evidence_to_state(state: dict[str, Any], request: dict[str, Any], result: Any) -> dict[str, Any]:
    """Merge one journal result into every citing paper from that journal."""
    metric = extract_ingested_journal_metric(result, request)
    if not metric:
        return metric
    identity_matches = journal_result_matches_request(result, request)
    # Search engines sometimes answer with the first metric-bearing journal in
    # a page rather than the requested one. A JIF cannot cross this boundary.
    if metric.get("impact_factor") is not None and not identity_matches:
        metric.pop("impact_factor", None)
        metric.pop("impact_factor_year", None)
        if not any(metric.get(key) not in (None, "") for key in ("citescore", "scimago_sjr", "openalex_2yr_mean_citedness")):
            return {}
    args = {**(request.get("context") or {}), **(request.get("args") or {})}
    requested_journal = clean_text(args.get("journal")).lower()
    requested_issn = {clean_text(value).lower() for value in (args.get("issn") or []) if clean_text(value)}
    for row in state.get("papers", []):
        if row.get("direction") != "cited-by":
            continue
        same_paper = clean_text(row.get("key")) == clean_text(request.get("paper_key"))
        same_journal = bool(requested_journal and clean_text(row.get("journal")).lower() == requested_journal)
        same_issn = bool(requested_issn & {clean_text(value).lower() for value in (row.get("issn") or [])})
        if identity_matches and (same_paper or same_journal or same_issn):
            journal_full = clean_text(metric.get("journal_full"))
            journal_abbrev = clean_journal_abbreviation(
                journal_full or row.get("journal"), metric.get("journal_abbrev")
            )
            if journal_full and not clean_text(row.get("journal")):
                row["journal"] = journal_full
            if journal_abbrev:
                row["journal_abbrev"] = journal_abbrev
            incoming_issn = metric.get("issn") or []
            if isinstance(incoming_issn, str):
                incoming_issn = re.split(r"[,;\s]+", incoming_issn)
            row["issn"] = list(dict.fromkeys(
                clean_text(value) for value in list(row.get("issn") or []) + list(incoming_issn)
                if clean_text(value)
            ))
            existing = row.get("journal_metric") or {}
            incoming = {
                key: value for key, value in metric.items()
                if key not in {"journal_full", "journal_abbrev", "issn"}
            }
            if existing.get("impact_factor") not in (None, "") and existing.get("impact_factor_year") not in (None, ""):
                incoming.pop("impact_factor", None)
                incoming.pop("impact_factor_year", None)
            if incoming:
                row["journal_metric"] = {**existing, **incoming}
    return metric


def _article_list_from_result(result: Any) -> list[dict[str, Any]]:
    """Locate pubmed_fetch_articles rows inside Host capability envelopes."""
    seen: set[int] = set()

    def visit(value: Any, depth: int = 0) -> list[dict[str, Any]]:
        if depth > 8 or id(value) in seen:
            return []
        if isinstance(value, dict):
            seen.add(id(value))
            articles = value.get("articles")
            if isinstance(articles, list):
                return [row for row in articles if isinstance(row, dict)]
            for key in ("result", "value", "data", "output", "content"):
                found = visit(value.get(key), depth + 1)
                if found:
                    return found
        elif isinstance(value, list):
            seen.add(id(value))
            for item in value:
                found = visit(item, depth + 1)
                if found:
                    return found
        return []

    return visit(result)


def apply_pubmed_metadata_to_state(state: dict[str, Any], result: Any) -> list[dict[str, Any]]:
    """Backfill cited-paper journal and issue metadata from PubMed EFetch."""
    applied: list[dict[str, Any]] = []
    for article in _article_list_from_result(result):
        doi = normalize_doi(article.get("doi") or "")
        pmid = clean_text(article.get("pmid"))
        title_key = " ".join(sorted(title_tokens(clean_text(article.get("title")))))
        journal_info = article.get("journalInfo") or {}
        if not isinstance(journal_info, dict):
            journal_info = {}
        for row in state.get("papers", []):
            if row.get("direction") != "cited-by":
                continue
            row_title_key = " ".join(sorted(title_tokens(clean_text(row.get("title")))))
            matches = bool(
                (doi and normalize_doi(row.get("doi") or "") == doi)
                or (pmid and clean_text(row.get("pmid")) == pmid)
                or (title_key and title_key == row_title_key)
            )
            if not matches:
                continue
            mapping = {
                "journal": clean_text(journal_info.get("title")),
                "journal_abbrev": clean_journal_abbreviation(
                    journal_info.get("title"),
                    journal_info.get("isoAbbreviation") or journal_info.get("abbreviation"),
                ),
                "volume": clean_text(journal_info.get("volume")),
                "issue": clean_text(journal_info.get("issue")),
                "pages": clean_text(journal_info.get("pages")),
            }
            for key, value in mapping.items():
                if value:
                    row[key] = value
            issn_values = [journal_info.get("issn"), journal_info.get("eIssn")]
            row["issn"] = list(dict.fromkeys(
                clean_text(value) for value in list(row.get("issn") or []) + issn_values
                if clean_text(value)
            ))
            raw = row.get("raw") if isinstance(row.get("raw"), dict) else {}
            raw["pubmed_fetch"] = article
            row["raw"] = raw
            applied.append({
                "paper_key": row.get("key"), "pmid": pmid, "doi": doi,
                "journal": row.get("journal", ""),
                "journal_abbrev": row.get("journal_abbrev", ""),
                "issn": row.get("issn", []),
            })
            break
    return applied


def enqueue_journal_year_followup(task: Task, request: dict[str, Any], metric: dict[str, Any]) -> None:
    """Queue a focused year lookup when a matched JIF lacks its metric year."""
    # Skip followup requests when partial_enrichment is active: re-enqueueing
    # new journal-year lookups on every resume call permanently blocks
    # finalization because the new pending rows can never be executed.
    try:
        _state_partial = task.load().get("partial_enrichment")
    except Exception:
        _state_partial = False
    if _state_partial:
        return
    if metric.get("impact_factor") in (None, "") or metric.get("impact_factor_year") not in (None, ""):
        return
    context = request.get("context") or {}
    journal = clean_text(context.get("journal") or (request.get("args") or {}).get("journal"))
    if not journal:
        return
    issn_values = context.get("issn") or []
    if isinstance(issn_values, str):
        issn_values = [issn_values]
    issn = next(iter(issn_values), "")
    query = f'"{journal}" {issn} "2025 Journal Impact Factor" metric year official publisher JCR'
    args = {"query": query, "maxResults": 8,
            "engine": SEARCH_ENGINE_CHAIN[0], "engine_chain": list(SEARCH_ENGINE_CHAIN)}
    payload = {
        "kind": "journal", "tool": "advanced_search", "args": args, "arguments": args,
        "subject": request.get("subject"), "paper_key": request.get("paper_key"),
        "author_name": "", "query": query, "provider": "free_search",
        "execution": "capability_execute_required", "retry_budget": RETRY_ATTEMPTS,
        "context": context, "followup_reason": "impact_factor_year_missing",
        "result_contract": request.get("result_contract") or {},
    }
    payload["request_id"] = hashlib.sha256(json.dumps(
        ["journal_year", "advanced_search", request.get("subject"), args],
        sort_keys=True, ensure_ascii=False,
    ).encode("utf-8")).hexdigest()[:24]
    task.enqueue_request(payload)


def _author_base_records(paper: Paper) -> list[dict[str, Any]]:
    raw_authors = paper.raw.get("author") or []
    openalex_authors = ((paper.raw.get("openalex") or {}).get("authorships") or [])
    records = []
    for index, name in enumerate(paper.authors):
        raw = raw_authors[index] if index < len(raw_authors) else {}
        oa = openalex_authors[index] if index < len(openalex_authors) else {}
        affiliations = [clean_text(x.get("name")) for x in raw.get("affiliation", []) if clean_text(x.get("name"))]
        oa_institutions = [clean_text(x.get("display_name") or (x.get("institution") or {}).get("display_name")) for x in oa.get("institutions", []) if clean_text(x.get("display_name") or (x.get("institution") or {}).get("display_name"))]
        oa_countries = [clean_text(x.get("country_code") or (x.get("institution") or {}).get("country_code")) for x in oa.get("institutions", []) if clean_text(x.get("country_code") or (x.get("institution") or {}).get("country_code"))]
        oa_author = oa.get("author") or {}
        orcid = clean_text(raw.get("ORCID") or raw.get("orcid") or oa_author.get("orcid"))
        role = "first_author" if index == 0 else ("last_author" if index == len(paper.authors) - 1 else "author")
        records.append({
            "name": clean_text(name), "original_name": clean_text(name), "role": role,
            "author_position": index + 1,
            # OpenAlex is the only source that carries the author's canonical
            # display name ("William R. Bishai") next to the PubMed-style
            # abbreviation printed on the paper ("Bishai WR").  It costs no
            # extra request: it is already inside the citing work's authorships.
            "canonical_display_name": clean_text(oa_author.get("display_name")),
            "author_alternate_names": [clean_text(x) for x in (oa_author.get("display_name_alternatives") or []) if clean_text(x)][:8],
            "paper": paper.key, "publication_institution": "; ".join(dict.fromkeys(affiliations or oa_institutions or paper.institutions)),
            "publication_country": "; ".join(dict.fromkeys(oa_countries or paper.countries)), "current_title": "",
            "current_institution": "", "current_country": "", "orcid": orcid,
            "pubmed_id": paper.pmid, "openalex_author_id": clean_text(oa_author.get("id")),
            "semantic_scholar_paper_id": paper.semantic_scholar_id,
            "academician_status": "", "fellow_status": "",
            "honors": [], "appointments": [], "research_topics": [], "sources": [],
            "source_types": [], "conflicts": [], "identity_anchors": list(dict.fromkeys(affiliations or oa_institutions or paper.institutions)),
            "identity_conflicts": [], "associated_papers": [paper.title],
            "retrieved_at": now(),
        })
    return records


def author_entity_key(name: str, orcid: str = "") -> str:
    """Canonical per-author identity used by both the queue and the report.

    ``prepare_enrichment_requests`` builds request subjects from this key, so the
    report must derive ``author_entity_id`` the exact same way.  Otherwise the
    ingested evidence can never be joined back to the author record and every
    author stays ``blocked_provider`` even though the searches succeeded.
    """
    key = clean_text(orcid or name).lower()
    return re.sub(r"\s+", " ", key)


def author_entity_id(name: str, orcid: str = "", discriminator: str = "") -> str:
    """Stable id derived from a name plus an optional disambiguation seed.

    The id must not depend on whether an ORCID happened to be present when the
    enrichment queue was written: the queue hashes the plain author name, while
    the report may have enriched the record with an ORCID from Crossref/OpenAlex.
    Keying on the name keeps the two sides joinable.
    """
    seed = author_entity_key(name, "")
    if discriminator:
        seed += "|" + clean_text(discriminator).lower()
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()[:20]


def author_entity_ids(name: str, orcid: str = "") -> list[str]:
    """Every id form that may address this author, most specific first."""
    ids = [author_entity_id(name, ""), author_entity_id(name, orcid)]
    return list(dict.fromkeys(ids))


def _load_web_search_adapter() -> Any | None:
    path = os.getenv("LITERATURE_WEB_SEARCH_MODULE", "").strip()
    if not path:
        return None
    module_path = Path(path).expanduser().resolve()
    if not module_path.is_file():
        return None
    spec = importlib.util.spec_from_file_location("zerowall_literature_web_search", module_path)
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec); sys.modules[spec.name] = module; spec.loader.exec_module(module)
    return module


def _extract_tavily_answer_fields(
    answer: str,
    query_intent: str,
    merge_fn: "Callable[[str, Any], None]",
) -> None:
    """Extract structured facts from a Tavily prose answer.

    Tavily's synthesised answer is often the richest source of current
    position and honours information because it fuses content from multiple
    faculty-profile pages.  We apply simple, conservative regex patterns so
    only unambiguous facts are promoted to structured columns — the model
    never changes a value that was already set by a more authoritative source.
    """
    if not answer or not isinstance(answer, str):
        return
    import re as _re
    text = answer.strip()

    # ── Current title / position ─────────────────────────────────────────────
    title_patterns = [
        _re.compile(r"\b(?:is|as)\s+(Distinguished\s+)?(?:Full\s+)?"
                    r"(Professor|Associate\s+Professor|Assistant\s+Professor|"
                    r"Professor\s+Emeritus|Research\s+Professor|Clinical\s+Professor|"
                    r"Principal\s+Investigator|Senior\s+Researcher|Researcher|"
                    r"Lecturer|Senior\s+Lecturer|Reader|Adjunct\s+Professor)"
                    r"(?:\s+(?:of|in|at)\b)?", _re.I),
        _re.compile(r"\b(Distinguished\s+)?(?:Full\s+)?"
                    r"(Professor|Associate\s+Professor|Assistant\s+Professor)"
                    r"\s+(?:of|in|at)\s+[A-Z]", _re.I),
    ]
    for pat in title_patterns:
        m = pat.search(text)
        if m:
            title_raw = m.group(0).strip()
            # Extract just the rank word(s), not "of/in/at …"
            rank_m = _re.search(
                r"(Distinguished\s+)?(Full\s+)?"
                r"(Professor|Associate\s+Professor|Assistant\s+Professor|"
                r"Professor\s+Emeritus|Research\s+Professor|Clinical\s+Professor|"
                r"Principal\s+Investigator|Senior\s+Researcher|Researcher|"
                r"Lecturer|Senior\s+Lecturer|Reader|Adjunct\s+Professor)",
                title_raw, _re.I)
            if rank_m:
                merge_fn("current_title", rank_m.group(0).strip().title())
                break

    # ── Current institution ──────────────────────────────────────────────────
    inst_patterns = [
        _re.compile(r"(?:at|with|from)\s+(?:the\s+)?([A-Z][A-Za-z\s&,]{5,70}?"
                    r"(?:University|Institute|College|School|Center|Centre|Hospital|"
                    r"Laboratory|Foundation|Academy))", _re.I),
        _re.compile(r"([A-Z][A-Za-z\s&,]{3,60}?"
                    r"(?:University|Institute|College|School|Hospital|Academy))"
                    r"(?:,|\.|\s)", _re.I),
    ]
    for pat in inst_patterns:
        m = pat.search(text)
        if m:
            inst = m.group(1).strip().rstrip(",.")
            if len(inst) > 8:
                merge_fn("current_institution", inst)
                break

    # ── Honors and awards ────────────────────────────────────────────────────
    honor_patterns = [
        _re.compile(
            r"(?:received|was\s+awarded?|won\s+the|elected(?:\s+(?:as|to))?\s+(?:a\s+)?Fellow)"
            r"[^.;]{0,120}?(?:Award|Prize|Medal|Fellowship|Grant|Membership|Lectureship)",
            _re.I),
        _re.compile(
            r"\bFellow\s+of\s+(?:the\s+)?[A-Z][A-Za-z\s&]{3,55}"
            r"(?:Academy|Society|Association|Institute|Royal|Sciences)", _re.I),
        _re.compile(r"\b(?:FACC|FAHA|FAPS|FASN|FARVO|FRS|FMedSci|IEEE\s+Fellow|AAAS\s+Fellow)\b", _re.I),
        _re.compile(
            r"\b(?:[A-Z][A-Za-z\-]{2,35}\s+){1,5}"
            r"(?:Award|Prize|Medal|Lectureship|Fellowship)\b", _re.I),
    ]
    honors_found: list[str] = []
    for pat in honor_patterns:
        for m in pat.finditer(text):
            honor = m.group(0).strip()
            if len(honor) > 10 and honor not in honors_found:
                honors_found.append(honor)
    if honors_found:
        merge_fn("honors", honors_found)

    # ── Academic appointments ────────────────────────────────────────────────
    appt_patterns = [
        _re.compile(
            r"(?:serves?|served|is|was)\s+(?:as\s+)?(?:an?\s+)?"
            r"(?:Editor|Associate\s+Editor|Guest\s+Editor|Editorial\s+Board|"
            r"Board\s+Member|Member\s+of\s+the\s+Editorial|"
            r"President|Vice[- ]President|Chair|Secretary|Treasurer)"
            r"[^.;]{0,80}", _re.I),
        _re.compile(
            r"(?:Editorial\s+Board)\s+(?:Member\s+)?(?:of\s+)?[A-Z][^.;]{0,60}",
            _re.I),
    ]
    appts_found: list[str] = []
    for pat in appt_patterns:
        for m in pat.finditer(text):
            appt = m.group(0).strip()
            if len(appt) > 10 and appt not in appts_found:
                appts_found.append(appt)
    if appts_found:
        merge_fn("appointments", appts_found)


def extract_ingested_author_facts(evidence: list[dict[str, Any]]) -> dict[str, Any]:
    """Normalize structured facts returned by Host tools or the model layer."""
    facts: dict[str, Any] = {"sources": [], "source_types": [], "conflicts": [], "identity_candidates": []}

    def merge_value(target_key: str, value: Any) -> None:
        if value in (None, "", [], {}):
            return
        if target_key in {"sources", "source_types", "conflicts", "identity_candidates", "research_topics", "top_works", "honors", "appointments", "pubmed_representative_papers", "associated_papers"}:
            incoming = value if isinstance(value, list) else [value]
            existing = facts.get(target_key) or []
            if not isinstance(existing, list):
                existing = [existing]
            keyed: dict[str, Any] = {}
            for item_value in [*existing, *incoming]:
                try:
                    key = json.dumps(item_value, ensure_ascii=False, sort_keys=True)
                except TypeError:
                    key = clean_text(item_value)
                if key:
                    keyed[key] = item_value
            facts[target_key] = list(keyed.values())
            return
        # Prefer a previously extracted current fact over later generic search
        # metadata; provider-specific aliases below still fill empty fields.
        if facts.get(target_key) in (None, "", [], {}):
            facts[target_key] = value

    aliases = {
        "position": "current_title", "title": "current_title", "job_title": "current_title",
        "current_position": "current_title", "current_job_title": "current_title",
        "institution": "current_institution", "organization": "current_institution",
        "current_affiliation": "current_institution", "current_organization": "current_institution",
        "country": "current_country", "country_code": "current_country",
        "paper_titles": "top_works", "representative_papers": "top_works",
        "representative_publication": "top_works", "representative_publications": "top_works",
        "awards": "honors", "memberships": "appointments", "topics": "research_topics",
        "research_fields": "research_topics", "research_directions": "research_topics",
        "source_urls": "sources", "urls": "sources",
    }
    for item in evidence:
        tool = clean_text(item.get("tool") or item.get("provider")).lower()
        raw_result = item.get("result") if isinstance(item.get("result"), dict) else item
        result = _structured_result(raw_result)
        # Both facts and verified_facts are authoritative structured model
        # outputs. Publication-time fields remain available in raw receipts for
        # disambiguation but are intentionally not mapped to current fields.
        for source_key, value in result.items():
            target_key = aliases.get(source_key, source_key)
            if source_key in {
                "affiliation_at_citing_paper", "affiliations_at_publication",
                "institution_at_citing_paper", "country_at_citing_paper",
                "citing_paper_affiliations", "raw_affiliations_at_citing_paper",
                "department_at_citing_paper", "departments_at_citing_paper",
            }:
                continue
            merge_value(target_key, value)
        if "openalex_search_authors" in tool:
            records = result.get("records") or []
            if len(records) == 1:
                author = records[0]
                for key, value in {
                    "openalex_author_id": author.get("author_id") or author.get("id"), "orcid": author.get("orcid"),
                    "works_count": author.get("works_count"), "cited_by_count": author.get("cited_by_count"),
                    "h_index": author.get("h_index"), "i10_index": author.get("i10_index"),
                    "research_topics": author.get("top_topics"),
                }.items():
                    merge_value(key, value)
            elif records:
                merge_value("identity_candidates", records[:10])
        elif "openalex_get_author" in tool:
            for key in ("author_id", "openalex_author_id", "orcid", "works_count", "cited_by_count", "h_index", "i10_index", "top_works", "counts_by_year", "last_known_institutions", "topics"):
                merge_value(aliases.get(key, key), result.get(key))
            merge_value("research_topics", result.get("top_topics"))
            # OpenAlex reports the author's most recent affiliation set. It is a
            # factual employer statement, so it may fill current_institution and
            # current_country. It says nothing about academic rank, so no title
            # is ever inferred from it.
            institutions = result.get("last_known_institutions")
            if isinstance(institutions, list) and institutions:
                names, countries = [], []
                for institution in institutions:
                    if not isinstance(institution, dict):
                        continue
                    display = clean_text(institution.get("display_name"))
                    if display:
                        names.append(display)
                    country = clean_text(institution.get("country_code"))
                    if country:
                        countries.append(country)
                if names:
                    merge_value("current_institution", "; ".join(dict.fromkeys(names)))
                if countries:
                    merge_value("current_country", "; ".join(dict.fromkeys(countries)))
                for institution in institutions:
                    if isinstance(institution, dict) and clean_text(institution.get("ror")):
                        merge_value("sources", clean_text(institution.get("ror")))
        elif "pubmed_search_articles" in tool:
            merge_value("pubmed_publication_count", result.get("count"))
            merge_value("pubmed_representative_papers", result.get("summaries"))
        # ── Tavily / web-search plain-text answer extraction ─────────────────
        # When the executor ran advanced_search with include_answer=True, the
        # Tavily response carries an "answer" field that is a natural-language
        # synthesis of the top pages.  _structured_result only parses JSON
        # answers; here we apply a lightweight regex pass to extract the fields
        # the pipeline cares about (title, institution, country, honors) from
        # the prose summary so the model layer does not have to re-read raw
        # HTML snippets.
        if tool in {"advanced_search", "web_search"}:
            _extract_tavily_answer_fields(
                raw_result.get("answer") or raw_result.get("result", {}).get("answer") or "",
                item.get("request", {}).get("args", {}).get("query_intent", ""),
                merge_value,
            )
        if tool:
            merge_value("source_types", tool)
        for source in result.get("sources") or result.get("source_urls") or []:
            url = source.get("url") if isinstance(source, dict) else ""
            if not url and isinstance(source, str):
                url = source
            if clean_text(url).startswith(("http://", "https://")):
                merge_value("sources", clean_text(url))
        for url in source_urls(raw_result):
            merge_value("sources", url)
        # profile_sources = accepted pages (identity-confirmed); thread through
        for url in (result.get("profile_sources") or []):
            if clean_text(url).startswith(("http://", "https://")):
                merge_value("profile_sources", clean_text(url))
        # profile_cache_dir = local HTML cache for this request; keep newest non-empty value
        _pcd = clean_text(result.get("profile_cache_dir"))
        if _pcd and not facts.get("profile_cache_dir"):
            facts["profile_cache_dir"] = _pcd
    if evidence:
        facts.setdefault("evidence_status", "searched_partial")
    # Confidence is an internal bookkeeping value only. It is deliberately
    # omitted from reader-facing author tables and reports.
    return facts


def enrich_all_authors(task: Task, papers: list[Paper]) -> list[dict[str, Any]]:
    """Collect unique authors and merge only real, ingested evidence.

    Network-capable Host tools are invoked by the skill orchestration layer;
    this deterministic worker consumes their evidence inbox.  The legacy
    Python adapter remains available for backwards compatibility, but an
    absent adapter is never presented as a successful search.
    """
    adapter = _load_web_search_adapter()
    evidence_by_author: dict[str, list[dict[str, Any]]] = {}
    inbox = task.root / "analysis" / "evidence_inbox.jsonl"
    # The inbox is append-only history: every author_profile result ever
    # ingested stays in it, including results produced before the identity,
    # page-subject and country gates were tightened.  Replaying all of it
    # resurrects known mis-attributions (a Taiwanese orthopaedic surgeon's board
    # memberships, another professor's academician title, a site-navigation
    # label read as an award) no matter how often the stored evidence is
    # cleaned.  So author_profile evidence is accepted only for request_ids the
    # CURRENT queue still lists, and only the newest result per request_id.
    # A rebuilt query mints a new request_id but the ledger intentionally keeps
    # the old row.  Only the LAST profile request for each author entity is live;
    # otherwise an obsolete query remains eligible forever and can overwrite a
    # newer page-derived title during report generation.
    latest_profile_by_subject: dict[str, str] = {}
    for row in task.provider_requests():
        request_id = clean_text(row.get("request_id"))
        if not request_id or ((row.get("args") or {}).get("query_intent") != "author_profile"):
            continue
        subject = clean_text(row.get("subject") or row.get("author_name")).lower()
        if subject:
            latest_profile_by_subject[subject] = request_id
    live_profile_requests = set(latest_profile_by_subject.values())
    newest_by_request: dict[str, dict[str, Any]] = {}
    try:
        for line in inbox.read_text(encoding="utf-8").splitlines():
            if not line.strip(): continue
            item = json.loads(line)
            key = clean_text(item.get("author_key") or item.get("author") or "").lower()
            if not key:
                continue
            request = item.get("request") or {}
            intent = clean_text((request.get("args") or {}).get("query_intent"))
            if intent == "author_profile":
                request_id = clean_text(item.get("request_id") or request.get("request_id"))
                if request_id not in live_profile_requests:
                    continue
                newest_by_request[request_id] = item
                continue
            evidence_by_author.setdefault(key, []).append(item)
    except (OSError, json.JSONDecodeError):
        pass
    # One author can hold SEVERAL live profile requests, because improving the
    # query (dropping the "professor" bias, adding "faculty profile") mints a new
    # request_id while the previous one stays in the queue.  ``merge_value`` is
    # first-write-wins, so replaying them in file order let a superseded result
    # decide the reported title: the newest run read "Full professor in the
    # school of chemistry..." straight off the faculty page, yet the report still
    # showed the older run's vocabulary label.  Profile evidence is therefore
    # ordered newest-first per author before it is merged.
    def _profile_recency(item: dict[str, Any]) -> str:
        return clean_text(item.get("ingested_at")) or clean_text(
            (item.get("result") or {}).get("executed_at"))

    for item in sorted(newest_by_request.values(), key=_profile_recency, reverse=True):
        key = clean_text(item.get("author_key") or item.get("author") or "").lower()
        if key:
            evidence_by_author.setdefault(key, []).insert(0, item)
    cache: dict[str, list[dict[str, Any]]] = {}
    cache_path = task.root / "analysis" / "author_search_cache.json"
    try:
        cache.update(json.loads(cache_path.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        pass
    all_records: list[dict[str, Any]] = []
    seen_entities: dict[str, dict[str, Any]] = {}
    entity_membership = {
        (paper_link.get("paper_key"), paper_link.get("position")): entity
        for entity in unique_author_entities(papers)
        for paper_link in entity.get("papers", [])
    }
    target_author_keys = {
        author_entity_key(name, "")
        for paper in papers if paper.direction == "target"
        for name in paper.authors if clean_text(name)
    }
    # Author enrichment is intentionally scoped to citing papers.  The target
    # authors are metadata needed to identify the target, not part of the
    # requested cited-by author influence analysis.
    for paper in (paper for paper in papers if paper.direction == "cited-by"):
        records = [record for record in _author_base_records(paper)
                   if author_entity_key(record.get("name", ""), "") not in target_author_keys]
        for record in records:
            entity_key = author_entity_key(record.get("name", ""), "")
            entity = entity_membership.get((paper.key, record.get("author_position"))) or {}
            record["author_entity_id"] = entity.get("author_entity_id") or author_entity_id(record.get("name", ""), "", paper.key + ":" + str(record.get("author_position")))
            record["evidence_status"] = "blocked_provider"
            # Keep the legacy adapter in sync with the documented, queue-driven
            # contract (name + title, name + position/honors).  The two extra
            # ORCID / academician probes are optional refinements, not a second
            # round of mandatory searches.
            query_base = " ".join(x for x in (record["name"], paper.title, record["publication_institution"]) if x)
            queries = [
                query_base,
                f"{record['name']} {paper.title} ORCID",
                f"{record['name']} {record['publication_institution']} current position institution",
                f"{record['name']} {paper.title} honors awards academic appointment",
            ]
            evidence: list[dict[str, Any]] = []
            # Accept both id forms so an ORCID-enriched record still joins to a
            # queue that was created from the plain author name.
            evidence.extend(evidence_by_author.get(record["author_entity_id"], []))
            if not evidence:
                # Compatibility for queues produced before authorship-level
                # disambiguation.  Never mix the shared legacy name evidence
                # into a record that already has entity-specific results.
                for candidate in author_entity_ids(record.get("name", ""), record.get("orcid", "")):
                    evidence.extend(evidence_by_author.get(candidate, []))
            for query in queries:
                key = hashlib.sha256(query.lower().encode("utf-8")).hexdigest()
                if key in cache:
                    results = cache[key]
                elif adapter is not None and callable(getattr(adapter, "search", None)):
                    try:
                        results = adapter.search(query) or []
                        results = results if isinstance(results, list) else [results]
                        cache[key] = results
                        task.record_mcp("web_search", "author_search", "ok", query=query, result_count=len(results))
                    except Exception as exc:
                        results = []
                        task.record_mcp("web_search", "author_search", "error", query=query, error=type(exc).__name__)
                else:
                    results = []
                    task.record_web_search(query, "blocked_provider", author_key=entity_key, reason="native_host_search_required")
                evidence.extend(x for x in results if isinstance(x, dict))
            if adapter is not None and callable(getattr(adapter, "extract_author_facts", None)):
                try:
                    facts = adapter.extract_author_facts(record["name"], paper.title, evidence) or {}
                except Exception as exc:
                    facts = {"conflicts": [f"extract_error:{type(exc).__name__}"]}
            else:
                facts = extract_ingested_author_facts(evidence)
            for field_name in ("current_title", "current_institution", "current_country", "academician_status", "fellow_status", "openalex_author_id", "orcid", "works_count", "cited_by_count", "h_index", "i10_index", "pubmed_publication_count", "top_works", "counts_by_year", "pubmed_representative_papers"):
                if facts.get(field_name): record[field_name] = facts[field_name]
            # profile_cache_dir: keep first non-empty value (per-request; authors may
            # share a name key across re-runs — take the newest via profile evidence ordering)
            if facts.get("profile_cache_dir") and not record.get("profile_cache_dir"):
                record["profile_cache_dir"] = facts["profile_cache_dir"]
            for field_name in ("honors", "appointments", "research_topics", "sources", "source_types", "conflicts", "identity_anchors", "identity_conflicts", "associated_papers", "profile_sources"):
                values = facts.get(field_name) or []
                if isinstance(values, str): values = [values]
                merged = unique_items(record.get(field_name, []) + values)
                # Clean honor/appointment entries: rescue named awards from noisy
                # search snippets; discard pure noise. Multiple items per author
                # are all kept — never collapse to a single entry.
                if field_name in ("honors", "appointments"):
                    cleaned: list[str] = []
                    for h in merged:
                        for item in clean_honor_entry(h):
                            if item and item not in cleaned:
                                cleaned.append(item)
                    merged = cleaned
                record[field_name] = merged
            has_real_search = any(str(x.get("status", "ok")).lower() in {"ok", "success", "not_found_after_search", "searched_partial", "searched_verified"} for x in evidence)
            record["evidence_status"] = facts.get("evidence_status") or ("searched_verified" if facts.get("confidence") == "high" else ("searched_partial" if has_real_search else "blocked_provider"))
            # The normalizer always returns bookkeeping keys (empty sources,
            # conflicts, etc.).  Those keys are not evidence and must not
            # upgrade a blocked author to high confidence.
            substantive_facts = {
                key: value for key, value in facts.items()
                if key not in {"sources", "source_types", "conflicts", "evidence_status", "confidence"}
                and value not in (None, "", [], {})
            }
            record["confidence"] = facts.get("confidence") or ("high" if substantive_facts else ("medium" if has_real_search else "low"))
            record["identity_candidates"] = facts.get("identity_candidates") or []
            record["search_evidence"] = evidence
            record["retrieved_at"] = now()
        paper.author_records = records
        paper.author_profiles = records
        all_records.extend(records)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    unique: dict[str, dict[str, Any]] = {}
    for row in all_records:
        key = row.get("author_entity_id") or clean_text(row.get("orcid") or row.get("name")).lower()
        if key not in unique:
            row["papers"] = [row.get("paper")] if row.get("paper") else []
            unique[key] = row
        else:
            current = unique[key]
            for field_name in ("honors", "appointments", "research_topics", "sources", "source_types", "conflicts", "identity_anchors", "identity_conflicts", "associated_papers", "profile_sources"):
                raw_merged = list(dict.fromkeys((current.get(field_name) or []) + (row.get(field_name) or [])))
                if field_name in ("honors", "appointments"):
                    cleaned: list[str] = []
                    for h in raw_merged:
                        for item in clean_honor_entry(h):
                            if item and item not in cleaned:
                                cleaned.append(item)
                    raw_merged = cleaned
                current[field_name] = raw_merged
            # profile_cache_dir: keep first non-empty value across duplicate records
            if not current.get("profile_cache_dir") and row.get("profile_cache_dir"):
                current["profile_cache_dir"] = row["profile_cache_dir"]
            merged_evidence = (current.get("search_evidence") or []) + (row.get("search_evidence") or [])
            current["search_evidence"] = list({json.dumps(item, ensure_ascii=False, sort_keys=True): item for item in merged_evidence}.values())
            current["papers"] = list(dict.fromkeys((current.get("papers") or []) + ([row.get("paper")] if row.get("paper") else [])))
    result = list(unique.values())
    (task.root / "analysis" / "author_evidence.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def _better_display_name(candidate: str, current: str) -> bool:
    """True when ``candidate`` is a fuller rendering of the same author name.

    OpenAlex publishes "William R. Bishai" while the citing paper prints
    "Bishai WR".  A web query needs the former: the abbreviation matches no
    faculty page.  A longer name with more space-separated word tokens wins;
    equal-length names keep whichever arrived first so entity identity stays
    stable across runs.
    """
    candidate, current = clean_text(candidate), clean_text(current)
    if not candidate:
        return False
    if not current:
        return True
    if candidate.lower() == current.lower():
        return False
    candidate_tokens = len(re.findall(r"[A-Za-z\u4e00-\u9fff]+", candidate))
    current_tokens = len(re.findall(r"[A-Za-z\u4e00-\u9fff]+", current))
    return candidate_tokens > current_tokens


def unique_author_entities(papers: list[Paper]) -> list[dict[str, Any]]:
    """Return conservatively disambiguated cited-by authors with paper links."""
    entities: list[dict[str, Any]] = []
    target_author_keys = {
        author_entity_key(name, "")
        for paper in papers if paper.direction == "target"
        for name in paper.authors if clean_text(name)
    }
    for paper in papers:
        if paper.direction != "cited-by":
            continue
        base_records = _author_base_records(paper)
        for index, record in enumerate(base_records):
            name = record.get("name", "")
            orcid = clean_text(record.get("orcid"))
            key = author_entity_key(name, "")
            if key in target_author_keys:
                continue
            institutions = {clean_text(value).lower() for value in re.split(r"\s*;\s*", record.get("publication_institution", "")) if clean_text(value)}
            coauthors = {author_entity_key(other, "") for other in paper.authors if author_entity_key(other, "") != key}
            matching: dict[str, Any] | None = None
            for candidate in entities:
                if candidate.get("canonical_name") != key:
                    continue
                same_orcid = bool(orcid and candidate.get("orcid") and orcid.lower() == clean_text(candidate.get("orcid")).lower())
                shared_institution = bool(institutions & set(candidate.get("identity_institutions") or []))
                shared_coauthors = coauthors & set(candidate.get("identity_coauthors") or [])
                anchor_count = int(shared_institution) + min(len(shared_coauthors), 2)
                if same_orcid or anchor_count >= 2:
                    matching = candidate
                    break
            if matching is None:
                discriminator = "orcid:" + orcid.lower() if orcid else f"authorship:{paper.key}:{index + 1}"
                matching = {
                    "author_entity_id": author_entity_id(name, orcid, discriminator),
                    "canonical_name": key, "name": clean_text(name), "orcid": orcid,
                    "openalex_author_id": clean_text(record.get("openalex_author_id")),
                    "papers": [], "aliases": [], "identity_institutions": [], "identity_coauthors": [],
                }
                entities.append(matching)
            entity = matching
            if not entity.get("openalex_author_id") and clean_text(record.get("openalex_author_id")):
                entity["openalex_author_id"] = clean_text(record.get("openalex_author_id"))
            # Keep the richest canonical name seen for this entity.  The name
            # printed on the paper is an abbreviation, so a value shaped like
            # "William R. Bishai" always beats "Bishai WR"; this is what the
            # enrichment queue searches with.
            candidate_name = clean_text(record.get("canonical_display_name"))
            if candidate_name and _better_display_name(candidate_name, entity.get("display_name", "")):
                entity["display_name"] = candidate_name
            entity["alternate_names"] = list(dict.fromkeys(
                (entity.get("alternate_names") or []) + list(record.get("author_alternate_names") or [])))[:12]
            entity["aliases"] = list(dict.fromkeys(entity["aliases"] + ([clean_text(name)] if clean_text(name) else [])))
            entity["papers"].append({"paper_key": paper.key, "title": paper.title, "doi": paper.doi, "pmid": paper.pmid, "position": index + 1})
            entity["identity_institutions"] = sorted(set(entity.get("identity_institutions") or []) | institutions)
            entity["identity_coauthors"] = sorted(set(entity.get("identity_coauthors") or []) | coauthors)
    return entities


# ISO country codes as they appear in OpenAlex authorships, mapped to the name a
# profile query should use.  Searching "Hongyan Ma hospital China" stays in the
# right country, while the bare name matched a Missouri civil engineer.
COUNTRY_NAMES = {
    "CN": "China", "US": "USA", "CA": "Canada", "GB": "UK", "UK": "UK",
    "TW": "Taiwan", "JP": "Japan", "KR": "South Korea", "SG": "Singapore",
    "HK": "Hong Kong", "MO": "Macau", "DE": "Germany", "FR": "France",
    "ES": "Spain", "IT": "Italy", "NL": "Netherlands", "BE": "Belgium",
    "CH": "Switzerland", "AT": "Austria", "SE": "Sweden", "NO": "Norway",
    "DK": "Denmark", "FI": "Finland", "PL": "Poland", "PT": "Portugal",
    "GR": "Greece", "TR": "Turkey", "IL": "Israel", "SA": "Saudi Arabia",
    "AE": "UAE", "EG": "Egypt", "SY": "Syria", "IR": "Iran", "IQ": "Iraq",
    "JO": "Jordan", "LB": "Lebanon", "IN": "India", "PK": "Pakistan",
    "BD": "Bangladesh", "TH": "Thailand", "VN": "Vietnam", "MY": "Malaysia",
    "ID": "Indonesia", "PH": "Philippines", "AU": "Australia", "NZ": "New Zealand",
    "BR": "Brazil", "AR": "Argentina", "MX": "Mexico", "CL": "Chile",
    "CO": "Colombia", "PE": "Peru", "ZA": "South Africa", "NG": "Nigeria",
    "KE": "Kenya", "RU": "Russia", "UA": "Ukraine", "CZ": "Czech Republic",
    "HU": "Hungary", "RO": "Romania", "IE": "Ireland", "IS": "Iceland",
}


def _country_phrase(codes: list[str]) -> str:
    """The single best country name for a query, or '' when unknown."""
    for code in codes:
        name = COUNTRY_NAMES.get(clean_text(code).upper())
        if name:
            return name
    return ""


def _load_author_identity_hints(task: Task) -> dict[str, dict[str, Any]]:
    """Map author_entity_id -> known identity, from already-collected evidence.

    ``unique_author_entities`` only sees what the citing record exposes, and
    for PubMed-sourced papers that is just an abbreviation plus, sometimes, an
    institution.  The OpenAlex author id and the paper's affiliation were
    already fetched during the cited-by stage and persisted in
    ``analysis/author_evidence.json``, so reading them back here lets the queue
    carry a real identity WITHOUT any new network call.

    Without this, every queue rebuild re-issued id-less requests and the
    canonical-name resolution had nothing to resolve.
    """
    hints: dict[str, dict[str, Any]] = {}
    for name in ("author_evidence.json", "author_entities.json"):
        path = task.root / "analysis" / name
        if not path.is_file():
            continue
        try:
            rows = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            entity_id = clean_text(row.get("author_entity_id"))
            if not entity_id:
                continue
            slot = hints.setdefault(entity_id, {"institutions": [],
                                                "institution_counts": {}})
            for key in ("openalex_author_id", "orcid", "display_name", "canonical_display_name"):
                value = clean_text(row.get(key))
                if value and not slot.get(key):
                    slot[key] = value
            # Country and research direction were already collected here but
            # never reached the query.  They are the sharpest disambiguators for
            # common names: "Hongyan Ma" alone matched a Missouri civil engineer
            # when the author works at a Shandong hospital, whereas
            # "Hongyan Ma" hospital China keeps the search in the right place.
            for key in ("publication_country", "current_country"):
                value = clean_text(row.get(key))
                if value:
                    slot.setdefault("countries", [])
                    if value not in slot["countries"]:
                        slot["countries"].append(value)
            topics = row.get("research_topics")
            if isinstance(topics, str):
                topics = [x for x in re.split(r"\s*[;,]\s*", topics) if x]
            if isinstance(topics, list):
                slot.setdefault("topics", [])
                for topic in topics:
                    topic = clean_text(topic)
                    if topic and topic not in slot["topics"]:
                        slot["topics"].append(topic)
            for key in ("identity_institutions", "current_institution", "publication_institution"):
                raw = row.get(key)
                values = raw if isinstance(raw, list) else [x for x in re.split(r"\s*;\s*", clean_text(raw)) if x]
                for value in values:
                    value = clean_text(value)
                    if not value:
                        continue
                    slot["institution_counts"][value] = slot["institution_counts"].get(value, 0) + 1
                    if value not in slot["institutions"]:
                        slot["institutions"].append(value)
    # Rank affiliations by how often they appear across the author's evidence.
    # A single paper can carry a secondary or historical affiliation ("Illinois
    # College" for Steven M. Dudek), and searching that name matched an English
    # lecturer at a different campus instead of the UIC pulmonologist, so the
    # most frequently attested institution is used first.
    for slot in hints.values():
        counts = slot.get("institution_counts") or {}
        if counts:
            slot["institutions"] = sorted(slot["institutions"],
                                          key=lambda name: (-counts.get(name, 0), len(name)))
    return hints


def prepare_enrichment_requests(task: Task, state: dict[str, Any]) -> list[dict[str, Any]]:
    """Create explicit requests for Host capability execution.

    This command never claims to have executed a provider.  It emits a
    resumable queue consumed by capability_search/capability_execute.
    """
    papers = papers_from_state(state)
    target = target_from_papers(papers)
    cited = [p for p in papers if p.direction == "cited-by"]
    requests: list[dict[str, Any]] = []
    def add(kind: str, tool: str, args: dict[str, Any], subject: str, *, paper_key: str = "", author_name: str = "", context: dict[str, Any] | None = None) -> None:
        provider = "free_search" if tool in WEB_SEARCH_TOOLS or tool == "free_search_test" else ("scimaster" if tool == "search_papers" else tool.split("_", 1)[0])
        payload = {"kind": kind, "tool": tool, "args": args, "arguments": args,
                   "subject": subject, "paper_key": paper_key, "author_name": author_name,
                   "query": args.get("query", ""), "provider": provider,
                   "execution": "capability_execute_required", "retry_budget": RETRY_ATTEMPTS}
        if context:
            payload["context"] = context
        # The executor reads identity from the request TOP level.  It was being
        # nested inside ``args``, so the OpenAlex id / paper affiliation never
        # reached the resolver and every query searched an abbreviation.
        if isinstance(args.get("identity"), dict):
            payload["identity"] = args["identity"]
        if kind == "journal":
            payload["result_contract"] = {
                "required_search": True,
                "extract_with_model": True,
                "fields": ["journal_full", "journal_abbrev", "issn", "impact_factor", "impact_factor_year", "citescore", "scimago_sjr", "openalex_2yr_mean_citedness", "metric_type", "source_url", "sources"],
                "rule": "Open reliable pages with web_fetch and return the matched journal full name, official/ISO abbreviation, ISSN, and only explicitly sourced journal metrics. Never relabel CiteScore, SJR or OpenAlex mean citedness as JCR impact factor.",
            }
        elif kind == "author":
            payload["result_contract"] = {
                "required_search": True,
                "extract_with_model": True,
                "fields": ["current_title", "current_institution", "current_country", "research_topics", "top_works", "honors", "appointments", "sources"],
                "rule": "Open reliable pages with web_fetch. Disambiguate with the citing paper, affiliation, coauthors or ORCID. Omit uncertain facts and all target-paper authors. Do not enumerate the author's publication list; only identity, affiliation, research topics, honours and metrics are required.",
            }
        payload["request_id"] = hashlib.sha256(json.dumps(
            [kind, tool, subject, args], sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()[:24]
        payload["created_at"] = now()
        requests.append(task.enqueue_request(payload))
    citation_limit = state.get("research_plan", {}).get("max_papers")
    pubmed_citation_args = {"pmid": target.pmid, "relation": "cited_by"}
    openalex_citation_args = {"work_id": target.openalex_id or target.doi}
    s2_citation_args = {"paperId": "PMID:" + target.pmid}
    if citation_limit:
        pubmed_citation_args["maxResults"] = citation_limit
        openalex_citation_args["max_records"] = citation_limit
        s2_citation_args["maxResults"] = citation_limit
    # Citation-count expansion and PubMed metadata are handled in the cited-by
    # fetching stage (expand_openalex / cited_by_openalex) which already carries
    # full bibliographic records.  Issuing separate citation/metadata capability
    # requests here would be redundant and would block the enrichment queue
    # unnecessarily.  The stubs are kept as comments so the intent is clear.
    # pubmed_find_related, openalex_citations, pubmed_get_s2_citations,
    # pubmed_fetch_articles are all intentionally omitted.
    seen_journals: set[str] = set()
    for paper in cited:
        journal_key = (paper.journal or paper.issn[0] if paper.issn else paper.journal).strip().lower()
        if not journal_key or journal_key in seen_journals:
            continue
        seen_journals.add(journal_key)
        journal_context = {"journal": paper.journal, "issn": paper.issn}
        add("journal", "openalex_get_source", {"source_id": ((paper.raw.get("openalex") or {}).get("primary_location") or {}).get("source", {}).get("id", ""), "journal": paper.journal, "issn": paper.issn}, paper.key, paper_key=paper.key, context=journal_context)
        # Only one advanced_search per journal: the JIF lookup.
        # Abbreviation, ISSN and publisher name come from openalex_get_source
        # which is already queued above and carries abbreviated_title + issn.
        jif_query = f'"{paper.journal}" {paper.issn[0] if paper.issn else ""} 2025 Journal Impact Factor 2026 JCR official publisher value year source'
        add("journal", "advanced_search",
            {"query": jif_query, "maxResults": 10,
             "engine": "bing", "engine_chain": ["bing", "tavily", "exa", "ddg"],
             "include_answer": True},
            paper.key, paper_key=paper.key, context=journal_context)
    # Rank all unique author entities by citation count so we only issue the
    # expensive advanced_search (Tavily) queries for the most-cited authors.
    # The limit is configurable via LITERATURE_AUTHOR_SEARCH_LIMIT (0 = all).
    def _entity_score(e: dict) -> float:
        try:
            return float(e.get("cited_by_count") or e.get("h_index") or 0)
        except (TypeError, ValueError):
            return 0.0
    all_entities = unique_author_entities(papers)
    # Backfill identity (OpenAlex id, ORCID, canonical name, affiliation) from
    # evidence already on disk so the queue is actionable on a rebuild.
    identity_hints = _load_author_identity_hints(task)
    for entity in all_entities:
        hint = identity_hints.get(clean_text(entity.get("author_entity_id")))
        if not hint:
            continue
        for key in ("openalex_author_id", "orcid", "display_name"):
            if not clean_text(entity.get(key)) and clean_text(hint.get(key)):
                entity[key] = clean_text(hint[key])
        if not entity.get("identity_institutions") and hint.get("institutions"):
            entity["identity_institutions"] = list(hint["institutions"])
        if not entity.get("identity_countries") and hint.get("countries"):
            entity["identity_countries"] = list(hint["countries"])
        if not entity.get("identity_topics") and hint.get("topics"):
            entity["identity_topics"] = list(hint["topics"])
    author_search_limit = int(os.getenv("LITERATURE_AUTHOR_SEARCH_LIMIT", str(_DEFAULT_AUTHOR_SEARCH_LIMIT)))
    if author_search_limit > 0:
        top_entities = sorted(all_entities, key=_entity_score, reverse=True)[:author_search_limit]
        top_entity_ids = {e["author_entity_id"] for e in top_entities}
    else:
        top_entities = all_entities
        top_entity_ids = {e["author_entity_id"] for e in all_entities}
    for entity in all_entities:
        primary_paper = entity["papers"][0] if entity["papers"] else {}
        context = {"papers": entity.get("papers", []), "identity_institutions": entity.get("identity_institutions", []), "identity_coauthors": entity.get("identity_coauthors", []), "target_authors_excluded": list(target.authors)}
        # Author baseline: ONE OpenAlex request per author.
        #
        # 98% of cited-by authors already carry an OpenAlex author id extracted
        # from the citing work's authorships, so openalex_get_author alone
        # returns the identity, affiliation, topics and metrics needed for the
        # author analysis.  openalex_search_authors is issued ONLY as a name
        # lookup for the few authors with no id.  Publication-list tools
        # (pubmed_search_articles / pubmed_search_papers) are deliberately not
        # issued: the report analyses who the authors are, not how many papers
        # they have, and openalex_get_author already carries works_count,
        # cited_by_count, h_index and top topics.
        if entity.get("openalex_author_id"):
            add("author", "openalex_get_author",
                {"author_id": entity["openalex_author_id"]}, entity["author_entity_id"],
                paper_key=(primary_paper.get("paper_key", "")), author_name=entity["name"], context=context)
        else:
            add("author", "openalex_search_authors",
                {"query": entity["name"], "max_records": 10}, entity["author_entity_id"],
                paper_key=(primary_paper.get("paper_key", "")), author_name=entity["name"], context=context)
        # ── Author web search: canonical name, two focused queries ───────────
        #
        # The name printed on a citing paper is often a PubMed-style
        # ABBREVIATION ("Bishai WR", "Dudek SM").  Such a string matches no
        # faculty page, so searching it wastes the query and leaves
        # current_title / honors / appointments empty.  When the citing work
        # supplied an OpenAlex author id we therefore search the canonical
        # display name ("William R. Bishai", "Steven M. Dudek") and keep the
        # abbreviation only as an identity anchor.
        #
        # Two SHORT queries beat one long boolean query.  Measured on the P002
        # regression set: a query stuffed with "OR associate professor OR
        # researcher OR ... academician" returned generic institution pages and
        # a COVID landing page for William Bishai, while
        #   "<full name>" <institution> professor
        # returned his own Johns Hopkins profile page directly.
        #
        # The institution must be the one on the PAPER, not OpenAlex's
        # last_known_institutions.  The latter is where the author works today:
        # for P002's "Hung YJ" it produced "Northwestern University professor"
        # and fetched a different Hung entirely, while the paper record's
        # Tri-Service General Hospital matched position 7 exactly.
        #
        # The bridge returns no synthesised answer (its `content` field is
        # always empty) and Tavily caps `sources` at ~2 rows, so the queue also
        # asks the executor to OPEN the returned pages with
        # fetch_profile_pages / query_intent and extract the fields there.
        institution_hint = " ".join(entity.get("identity_institutions", [])[:1])
        printed_name = entity["name"]
        # Country and research direction focus the search on the right person.
        # Common names are the failure mode that costs the most profile facts:
        # P004's "Hongyan Ma" (a Shandong hospital researcher) returned a
        # Missouri civil engineer, and "Yong Han" returned a Korean
        # gastroenterologist.  Both pages were discarded by the identity gate,
        # so the query is where the fix belongs.
        country_phrase = _country_phrase(entity.get("identity_countries") or [])
        topic_phrase = ""
        for topic in (entity.get("identity_topics") or []):
            topic_clean = clean_text(topic)
            # Topics from OpenAlex are phrases like "Cancer research"; a short
            # one keeps the query from turning into a long boolean string.
            if topic_clean and 3 <= len(topic_clean) <= 40 and len(topic_clean.split()) <= 4:
                topic_phrase = topic_clean
                break
        # OpenAlex's canonical display name is NOT persisted into
        # state.papers[].raw (the citing record keeps only the abbreviation),
        # so it cannot be inlined here without a network call on every queue
        # build.  We therefore emit a token the executor resolves from the
        # author id, falling back to the printed name when no id exists.
        search_name = (clean_text(entity.get("display_name"))
                       or clean_text(entity.get("canonical_display_name")))
        if not _better_display_name(search_name, printed_name):
            search_name = ""
        name_token = search_name or CANONICAL_NAME_TOKEN
        is_top = entity["author_entity_id"] in top_entity_ids
        # ONE short query.  P002 measurement: a second "awards honors fellow
        # editorial board" query added no verified facts (honours are usually
        # on the same profile page) while doubling wall-clock and spend, so the
        # single query asks for the profile and the extractor reads honours and
        # appointments off that page.  No rank word is baked into the query: the
        # person may be a resident, engineer or director, and "professor" biased
        # results towards other people who are.
        profile_query = " ".join(x for x in (
            f'"{name_token}"', institution_hint, "faculty profile",
            country_phrase, topic_phrase,
        ) if x)
        if is_top:
            # Top-20 authors get one paid Tavily query each.  Tavily is the only
            # engine here that charges per call, so it is rationed deliberately.
            engine, chain, max_results = "tavily", ["tavily"], 8
        else:
            # Ordinary authors are pinned to deepseek-official.  Measurement on
            # P004 found institutional/publisher profile pages there, whereas
            # bing returned content farms and only two rows.  Keep one engine and
            # one query per author: extra fan-out added latency without verified
            # profile facts.
            engine, chain, max_results = "deepseek-official", ["deepseek-official"], 8
        add("author", "advanced_search", {
            "query": profile_query, "maxResults": max_results,
            "engine": engine, "engine_chain": chain,
            "include_answer": True, "include_raw_content": is_top,
            "fetch_profile_pages": True,
            "fetch_pages": 4 if is_top else 3,
            "query_intent": "author_profile",
            "identity": {
                "canonical_name": search_name,
                "printed_name": printed_name,
                "aliases": list(entity.get("aliases") or [])[:6],
                "openalex_author_id": clean_text(entity.get("openalex_author_id")),
                "orcid": clean_text(entity.get("orcid")),
                "institutions": entity.get("identity_institutions", [])[:3],
                "country": country_phrase,
                "country_codes": entity.get("identity_countries", [])[:3],
                "topics": entity.get("identity_topics", [])[:3],
            },
        },
            entity["author_entity_id"],
            paper_key=(primary_paper.get("paper_key", "")), author_name=entity["name"],
            context={**context, "is_top_author": is_top})
    task.root.joinpath("analysis").mkdir(exist_ok=True)
    state["enrichment_required"] = True
    state["enrichment_requests"] = {"count": len(task.provider_requests()), "created_at": now(), "path": str(task.provider_requests_path)}
    author_groups = {}
    for request in task.provider_requests():
        if request.get("kind") == "author":
            author_groups.setdefault(clean_text(request.get("subject")), []).append(request.get("request_id"))
    try:
        author_workers = int(os.getenv("LITERATURE_AUTHOR_WORKERS", "4"))
    except ValueError:
        author_workers = 4
    author_workers = max(1, min(author_workers, 8))
    (task.root / "analysis" / "author_parallel_groups.json").write_text(
        json.dumps({"strategy": "parallel_by_author_entity", "groups": author_groups, "max_concurrent_groups": author_workers, "created_at": now()}, ensure_ascii=False, indent=2), encoding="utf-8")
    state["stage"] = "author_enriching"
    task.save(state)
    return requests


def _append_json_rows(path: Path, rows: list[dict[str, Any]], *, wrapper: str | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        existing = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else []
    except (OSError, json.JSONDecodeError):
        existing = []
    if wrapper:
        destination = existing.get(wrapper, []) if isinstance(existing, dict) else []
        existing = {wrapper: destination, "updated_at": now()}
    else:
        destination = existing if isinstance(existing, list) else []
        existing = destination
    for row in rows:
        key = row.get("request_id")
        if key:
            destination[:] = [old for old in destination if old.get("request_id") != key]
        destination.append(row)
    tmp = path.with_suffix(path.suffix + ".tmp")
    payload = json.dumps(existing, ensure_ascii=False, indent=2)
    # Windows keeps a lock on the destination briefly when another reader (or a
    # concurrent ingest) is active; retry instead of aborting a long batch.
    for attempt in range(6):
        try:
            tmp.write_text(payload, encoding="utf-8")
            tmp.replace(path)
            return
        except PermissionError:
            if attempt == 5:
                raise
            time.sleep(0.2 * (attempt + 1))


def ingest_evidence(task: Task, state: dict[str, Any], request_id: str, input_path: Path, *, defer_evidence_write: bool = False) -> dict[str, Any]:
    """Ingest one real capability result and advance the append-only queue."""
    request = next((row for row in task.provider_requests() if row.get("request_id") == request_id), None)
    if request is None:
        raise ValueError(f"unknown enrichment request: {request_id}")
    try:
        result = json.loads(input_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"invalid evidence JSON: {exc}") from exc
    if isinstance(result, dict) and result.get("request_id") and result["request_id"] != request_id:
        raise ValueError("evidence request_id does not match --request-id")
    raw_status = clean_text(result.get("status") if isinstance(result, dict) else "") or "ok"
    normalized = raw_status.lower()
    # ambiguous_identity is a terminal research outcome (the model found several
    # different people with the same name and refused to guess).  It must never
    # be downgraded to failed, otherwise one common Chinese name blocks the whole
    # enrichment queue forever.
    status = "succeeded" if normalized in {"ok", "success", "succeeded", "complete", "completed"} else ("retryable" if normalized in {"429", "timeout", "retryable", "rate_limited"} else (normalized if normalized in {"pending", "running", "not_found_after_search", "ambiguous_identity", "blocked_provider"} else "failed"))
    attempts = int(request.get("attempts") or 0) + 1
    result_payload = _structured_result(result)
    actual_engine = clean_text(result_payload.get("provider") or result_payload.get("engine")) if request.get("tool") in WEB_SEARCH_TOOLS else ""
    updated = task.update_request(request_id, status, attempts=attempts, result_status=raw_status,
                                  result_received_at=now(), actual_engine=actual_engine)
    item = {"request_id": request_id, "author_key": request.get("subject") if request.get("kind") == "author" else "", "tool": request.get("tool"), "provider": request.get("provider") or request.get("tool"), "status": raw_status, "result": result, "request": request, "ingested_at": now()}
    if request.get("kind") == "journal":
        item["normalized_journal_metric"] = apply_journal_evidence_to_state(state, request, result)
        enqueue_journal_year_followup(task, request, item["normalized_journal_metric"])
    elif request.get("kind") == "metadata" and request.get("tool") == "pubmed_fetch_articles":
        item["normalized_paper_metadata"] = apply_pubmed_metadata_to_state(state, result)
    evidence_dir = task.root / "analysis" / "evidence"; evidence_dir.mkdir(parents=True, exist_ok=True)
    (evidence_dir / f"{request_id}.json").write_text(json.dumps(item, ensure_ascii=False, indent=2), encoding="utf-8")
    inbox = task.root / "analysis" / "evidence_inbox.jsonl"
    with inbox.open("a", encoding="utf-8") as handle: handle.write(json.dumps(item, ensure_ascii=False) + "\n")
    if not defer_evidence_write:
        _append_json_rows(task.root / "analysis" / "provider_evidence.json", [item], wrapper="queries")
    if request.get("tool") in WEB_SEARCH_TOOLS or request.get("tool") == "free_search_test":
        task.record_web_search(request.get("args", {}).get("query", ""), status, request_id=request_id,
                               author_key=item["author_key"], result_status=raw_status,
                               requested_engine=request.get("args", {}).get("engine", ""), actual_engine=actual_engine,
                               tool=request.get("tool"))
    else:
        task.record_mcp(request.get("provider") or request.get("tool", "provider"), request.get("tool", "capability_execute"), status, request_id=request_id, subject=request.get("subject"), result_status=raw_status)
    state["last_evidence_request_id"] = request_id
    if defer_evidence_write:
        # Batch mode recomputes counters once at the end instead of re-reading
        # the whole queue and rewriting state.json for every single file.
        return item
    state["enrichment_completed_count"] = sum(1 for row in task.provider_requests() if row.get("status") == "succeeded")
    state["stage"] = "report_building" if all(row.get("status") in QUEUE_TERMINAL for row in task.provider_requests()) else "author_enriching"
    task.save(state)
    return item


def ingest_evidence_dir(task: Task, state: dict[str, Any], directory: Path, *, only: str = "", skip_existing: bool = False) -> dict[str, Any]:
    """Ingest every provider result in one directory (batch mode).

    The queue can hold hundreds of requests, so one CLI call per request is not
    an acceptable operational contract.  This walks ``directory`` in stable
    order, maps each file back to its queued request_id, and reuses
    ``ingest_evidence`` so every receipt, inbox row and state transition stays
    identical to the single-request path.
    """
    if not directory.is_dir():
        # Accept both an absolute path and a task-relative one such as
        # "analysis/evidence_pending".
        candidate = task.root / directory
        if candidate.is_dir():
            directory = candidate
        else:
            raise ValueError(f"evidence directory not found: {directory}")
    queue = task.provider_requests()
    by_id = {clean_text(row.get("request_id")): row for row in queue}
    try:
        ingested = {json.loads(line).get("request_id") for line in (task.root / "analysis" / "evidence_inbox.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()}
    except (OSError, json.JSONDecodeError):
        ingested = set()
    results: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []
    buffered: list[dict[str, Any]] = []
    files = sorted(p for p in directory.iterdir() if p.is_file() and p.suffix.lower() == ".json")
    for path in files:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            skipped.append({"file": path.name, "reason": f"invalid_json:{type(exc).__name__}"})
            continue
        request_id = clean_text(payload.get("request_id") if isinstance(payload, dict) else "") or path.stem
        request = by_id.get(request_id)
        if request is None:
            skipped.append({"file": path.name, "reason": "unknown_request_id"})
            continue
        if only and clean_text(request.get("tool")) != only:
            continue
        if skip_existing and request_id in ingested:
            skipped.append({"file": path.name, "reason": "already_ingested"})
            continue
        try:
            item = ingest_evidence(task, state, request_id, path, defer_evidence_write=True)
        except ValueError as exc:
            skipped.append({"file": path.name, "reason": str(exc)[:160]})
            continue
        buffered.append(item)
        results.append({"request_id": request_id, "tool": request.get("tool"), "result_status": item.get("status")})
        ingested.add(request_id)
        if len(buffered) >= 50:
            _append_json_rows(task.root / "analysis" / "provider_evidence.json", buffered, wrapper="queries")
            buffered = []
    if buffered:
        _append_json_rows(task.root / "analysis" / "provider_evidence.json", buffered, wrapper="queries")
    queue_rows = task.provider_requests()
    state["enrichment_completed_count"] = sum(1 for row in queue_rows if row.get("status") == "succeeded")
    state["last_batch_ingest_at"] = now()
    state["stage"] = "author_enriching"
    task.save(state)
    remaining = [row.get("request_id") for row in queue_rows if clean_text(row.get("request_id")) not in ingested]
    summary = {
        "task": str(task.root),
        "scanned": len(files),
        "ingested": len(results),
        "skipped": len(skipped),
        "still_pending": len(remaining),
        "stage": state.get("stage"),
    }
    if skipped:
        summary["skipped_detail"] = skipped[:40]
    return summary


def mark_requests_terminal(task: Task, state: dict[str, Any], *, tools: tuple[str, ...] = (), status: str = "blocked_provider", reason: str = "") -> dict[str, Any]:
    """Force still-pending queue rows to a terminal status.

    Used when a provider simply does not exist in this Host (for example
    ``openalex_search_authors`` is absent from the capability catalog).  The
    request stays in the audit trail with an explicit status instead of blocking
    the queue forever, and the reason is recorded so the report can state it.
    """
    terminal = {"succeeded", "failed", "not_found_after_search", "ambiguous_identity", "blocked_provider"}
    touched = []
    for row in task.provider_requests():
        request_id = clean_text(row.get("request_id"))
        if not request_id or clean_text(row.get("status")) in terminal:
            continue
        if tools and clean_text(row.get("tool")) not in tools:
            continue
        task.update_request(request_id, status, attempts=int(row.get("attempts") or 0), result_status=status, blocked_reason=clean_text(reason)[:200])
        touched.append({"request_id": request_id, "tool": row.get("tool")})
    state["enrichment_completed_count"] = sum(1 for row in task.provider_requests() if row.get("status") == "succeeded")
    task.save(state)
    return {"marked": len(touched), "status": status, "detail": touched[:40]}


def reconcile_queue_with_inbox(task: Task, state: dict[str, Any]) -> dict[str, Any]:
    """Restore queue rows whose results were already ingested but whose status regressed.

    The queue is append-only and read last-row-wins.  A rebuild used to append a
    fresh ``pending`` row for a request that had already succeeded, which silently
    discarded the completed work: P002 held ``pending -> succeeded -> pending`` for
    the same ``request_id``, so 100 finished lookups counted as outstanding and the
    task could never reach report_building.

    ``enqueue_request`` now refuses to reopen a terminal row, but queues written
    before that fix are already inconsistent.  This repairs them from the
    authoritative record: the evidence inbox, which is only written when a real
    result was ingested.
    """
    inbox = task.root / "analysis" / "evidence_inbox.jsonl"
    if not inbox.is_file():
        return {"task": str(task.root), "repaired": 0, "checked": 0}
    authoritative: dict[str, str] = {}
    try:
        for line in inbox.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            request_id = clean_text(item.get("request_id"))
            if not request_id:
                continue
            raw = clean_text(item.get("status")).lower()
            status = ("succeeded" if raw in {"ok", "success", "succeeded", "complete", "completed"}
                      else (raw if raw in QUEUE_TERMINAL else "failed"))
            authoritative[request_id] = status          # last row wins
    except OSError:
        return {"task": str(task.root), "repaired": 0, "checked": 0}

    rows = task.provider_requests()
    repairs: list[dict[str, Any]] = []
    for row in rows:
        request_id = clean_text(row.get("request_id"))
        if not request_id or clean_text(row.get("status")) in QUEUE_TERMINAL:
            continue
        known = authoritative.get(request_id)
        if not known:
            continue
        task.update_request(
            request_id, known,
            attempts=int(row.get("attempts") or 0),
            result_status=clean_text(row.get("result_status")) or known,
            reconciled_from="evidence_inbox",
        )
        repairs.append({"request_id": request_id, "tool": row.get("tool"), "status": known})
    if repairs:
        state["enrichment_completed_count"] = sum(
            1 for row in task.provider_requests() if row.get("status") == "succeeded")
        task.save(state)
    return {"task": str(task.root), "checked": len(rows),
            "authoritative": len(authoritative), "repaired": len(repairs),
            "detail": repairs[:40]}


def deduplicate_pdf_hashes(papers: list[Paper], aliases: list[dict[str, Any]]) -> None:
    seen: dict[str, Paper] = {}
    for paper in papers:
        digest = paper.pdf_sha256
        if not digest: continue
        canonical = seen.get(digest)
        if canonical and canonical.key != paper.key:
            aliases.append({"duplicate": paper.key, "canonical": canonical.key, "keys": [f"sha256:{digest}"]})
            paper.raw["duplicate_pdf_of"] = canonical.key
        else:
            seen[digest] = paper


def slim_openalex(item: dict[str, Any]) -> dict[str, Any]:
    """Keep reproducibility-critical OpenAlex fields without embedding large
    abstract inverted indexes and unrelated provider payloads in task state."""
    keys = ("id", "doi", "title", "publication_year", "type", "subtype", "cited_by_count", "best_oa_location", "authorships", "referenced_works", "primary_location", "open_access", "host_organization")
    return {key: item.get(key) for key in keys if key in item}


def extract_pdf_text(path: Path) -> str:
    try:
        import fitz  # type: ignore
        return "\f".join(page.get_text("text") for page in fitz.open(path))
    except Exception:
        try:
            from pypdf import PdfReader  # type: ignore
            return "\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages)
        except Exception:
            return ""


def paper_text(paper: Paper) -> str:
    """Return only MinerU text for citation evidence.

    PDF extraction is intentionally not a citation-analysis fallback: it loses
    layout, figures, tables, and often reference numbering.  Metadata-only
    callers can still use ``extract_pdf_text`` explicitly.
    """
    if paper.parsed_text_path:
        try:
            return Path(paper.parsed_text_path).read_text(encoding="utf-8")
        except OSError:
            pass
    return ""


def find_paper(papers: list[Paper], identity: str) -> Paper | None:
    value = clean_text(identity).lower()
    for paper in papers:
        candidates = {paper.key.lower(), normalize_doi(paper.doi), clean_text(paper.pmid).lower()}
        if value in candidates:
            return paper
    return None


def papers_from_state(state: dict[str, Any]) -> list[Paper]:
    return [Paper(**{k: v for k, v in row.items() if k in Paper.__dataclass_fields__}) for row in state.get("papers", [])]


def target_from_papers(papers: list[Paper]) -> Paper:
    targets = [paper for paper in papers if paper.direction == "target"]
    if len(targets) != 1:
        raise ValueError(f"task must contain exactly one target paper; found {len(targets)}")
    return targets[0]


def canonical_pdf_path(task: Task, paper: Paper) -> Path:
    """Return one readable, flat user-facing PDF path under ``downloads``."""
    title = safe_name(paper.title, 82) or safe_name(paper.pmid or paper.doi or paper.key, 82)
    if paper.direction == "cited-by":
        author = safe_name(paper.authors[0], 32) if paper.authors else "unknown-author"
        year = safe_name(paper.year, 8) or "unknown-year"
        filename = f"cited__{author}__{year}__{title}.pdf"
    else:
        filename = f"target__{title}.pdf"
    return task.root / "downloads" / filename


def normalize_pdf_location(task: Task, paper: Paper) -> Path:
    """Migrate a legacy/root PDF into the canonical downloads directory."""
    target = canonical_pdf_path(task, paper)
    target.parent.mkdir(parents=True, exist_ok=True)
    current = Path(paper.pdf_path).resolve() if paper.pdf_path else None
    if current and current.is_file() and current != target.resolve():
        if not target.exists():
            shutil.move(str(current), str(target))
        paper.pdf_path = str(target.resolve())
        paper.acquisition_attempts.append({
            "provider": "local", "skill": "zerowall-literature",
            "status": "migrated_to_canonical_downloads", "from": str(current),
            "path": str(target), "at": now(),
        })
    return target


def acquire_provided_target_pdf(task: Task, paper: Paper, source: Path) -> None:
    """Register a user-provided target PDF without extracting its text."""
    source = source.resolve()
    data = source.read_bytes()
    if not data.startswith(b"%PDF-"):
        raise ValueError("provided target is not a valid PDF")
    target = canonical_pdf_path(task, paper)
    target.parent.mkdir(parents=True, exist_ok=True)
    if source != target.resolve():
        tmp = target.with_suffix(".tmp")
        tmp.write_bytes(data)
        tmp.replace(target)
    paper.pdf_path = str(target.resolve())
    paper.pdf_source = "user_provided"
    paper.pdf_sha256 = hashlib.sha256(data).hexdigest()
    paper.pdf_status = "provided_pdf"
    paper.acquisition_state = "acquisition_terminal"
    paper.parse_status = "mineru_required"
    attempt = {"provider": "local", "skill": "zerowall-literature", "status": "provided_pdf", "path": str(source), "at": now()}
    paper.acquisition_attempts.append(attempt)
    task.record("local", str(source), "provided_pdf", paper=paper.key, sha256=paper.pdf_sha256)


def ingest_mineru_result(task: Task, state: dict[str, Any], paper_identity: str,
                         run_dir: Path, task_id: str = "", api: str = "mineru") -> Paper:
    """Copy a complete MinerU result tree into the resumable task."""
    papers = [Paper(**{k: v for k, v in row.items() if k in Paper.__dataclass_fields__}) for row in state.get("papers", [])]
    paper = find_paper(papers, paper_identity)
    if paper is None:
        raise ValueError(f"unknown paper identity: {paper_identity}")
    if state.get("workflow_mode") == WORKFLOW_MODE and paper.direction != "target":
        raise ValueError("current workflow parses only the target paper; cited papers are download-only")
    run_dir = run_dir.resolve()
    full_md = run_dir / "full.md"
    if not full_md.is_file():
        matches = list(run_dir.rglob("full.md")) if run_dir.is_dir() else []
        if len(matches) != 1:
            raise ValueError("MinerU run directory must contain exactly one full.md")
        full_md = matches[0]
    text = full_md.read_text(encoding="utf-8")
    if not clean_text(text):
        raise ValueError("MinerU full.md is empty")
    # Keep snapshot paths well under Windows MAX_PATH (260 chars).
    # paper_id: prefer short stable identifiers (PMID > DOI > truncated key hash)
    _raw_pid = paper.pmid or paper.doi or paper.key or ""
    _sn_pid  = safe_name(_raw_pid)
    if len(_sn_pid) > 40:
        import hashlib as _hl
        _sn_pid = _hl.sha1(_raw_pid.encode()).hexdigest()[:12]
    paper_id = _sn_pid
    # run_id: always cap at 40 chars to leave room for the rest of the path
    _raw_rid = task_id or run_dir.name or ""
    _sn_rid  = safe_name(_raw_rid, 40)
    if len(_sn_rid) > 40:
        import hashlib as _hl
        _sn_rid = _hl.sha1(_raw_rid.encode()).hexdigest()[:12]
    run_id = _sn_rid or "snapshot"
    snapshot = task.root / "analysis" / "mineru" / paper_id / run_id
    if snapshot.exists():
        shutil.rmtree(snapshot)
    snapshot.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(run_dir, snapshot)
    snapshot_full_md = snapshot / full_md.relative_to(run_dir)
    if not snapshot_full_md.is_file():
        snapshot_full_md = snapshot / "full.md"
    snapshot_full_md.write_text(text, encoding="utf-8")
    artifacts: list[dict[str, Any]] = []
    for artifact in snapshot.rglob("*"):
        if artifact.is_file():
            rel = artifact.relative_to(snapshot).as_posix()
            artifacts.append({
                "name": artifact.name, "relative_path": rel,
                "path": str(artifact.resolve()),
                "bytes": artifact.stat().st_size,
                "media_type": mimetypes.guess_type(artifact.name)[0] or "application/octet-stream",
                "sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
            })
    broken_links = []
    for link in re.findall(r"!\[[^\]]*\]\(([^)]+)\)", text):
        link_path = link.split("#", 1)[0].split("?", 1)[0].strip().strip("<>")
        if link_path and not (snapshot_full_md.parent / link_path).resolve().is_file():
            broken_links.append(link_path)
    manifest = {
        "paper": paper.key, "task_id": clean_text(task_id), "api": clean_text(api) or "mineru",
        "source_run_dir": str(run_dir), "source_pdf_sha256": paper.pdf_sha256,
        "full_md": str(snapshot_full_md.resolve()), "broken_links": broken_links,
        "artifacts": artifacts, "created_at": now(),
    }
    manifest_path = snapshot / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    paper.parsed_text_path = str(snapshot_full_md.resolve())
    paper.parse_status = "mineru_parsed"
    paper.parser_api = clean_text(api) or "mineru"
    paper.parser_task_id = clean_text(task_id)
    paper.parser_artifacts = artifacts
    paper.mineru_snapshot_dir = str(snapshot.resolve())
    paper.mineru_manifest_path = str(manifest_path.resolve())
    paper.mineru_broken_links = broken_links
    paper.mineru_file_counts = {
        "images": sum(1 for item in artifacts if item["relative_path"].lower().startswith("images/")),
        "tables": sum(1 for item in artifacts if item["relative_path"].lower().startswith("tables/")),
        "json": sum(1 for item in artifacts if item["media_type"] == "application/json"),
        "total": len(artifacts),
    }
    if paper.source == "local":
        heading = next((clean_text(match.group(1)) for match in re.finditer(r"^#\s+(.+?)\s*$", text, re.M) if 10 < len(clean_text(match.group(1))) < 300), "")
        if heading:
            paper.raw["pre_mineru_title"] = paper.title
            paper.title = heading
            paper.key = f"title:{heading.lower()}"
    task.record_mcp("mineru", "mineru_parse", "parsed", paper=paper.key, task_id=paper.parser_task_id,
                    snapshot_dir=str(snapshot.resolve()), artifacts=len(artifacts))
    task.record("mineru", str(run_dir), "parsed", paper=paper.key, task_id=paper.parser_task_id,
                parsed_text_path=paper.parsed_text_path, artifacts=len(artifacts))
    state["papers"] = [asdict(item) for item in papers]
    state["target_mineru_ingested_at"] = now()
    state["stage"] = "target_mineru_parsed" if state.get("workflow_mode") == WORKFLOW_MODE else ("analysis_pending" if not broken_links else "parsing")
    update_phase_status(state, papers)
    task.save(state)
    report(task, state)
    return paper


def validate_pdf(path: Path, expected: Paper) -> tuple[bool, str, str]:
    try:
        data = path.read_bytes()
    except OSError as exc:
        return False, f"read_error:{type(exc).__name__}", ""
    if not data.startswith(b"%PDF-") or not data:
        return False, "invalid_pdf_header", ""
    digest = hashlib.sha256(data).hexdigest()
    # The cited-by workflow never parses downloaded PDFs. Identity is checked
    # through DOI/PMID/title metadata before acquisition; only the target is
    # subsequently submitted to MinerU.
    return True, "ok", digest


def adapter_domains() -> set[str]:
    return {clean_text(value).lower().lstrip(".") for value in os.getenv("AUTHORIZED_ADAPTER_ALLOWED_DOMAINS", "").split(",") if clean_text(value)}


def allowed_adapter_url(url: str) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower().rstrip(".")
    domains = adapter_domains()
    return bool(parsed.scheme in {"http", "https"} and host and domains and any(host == domain or host.endswith(f".{domain}") for domain in domains))


def load_authorized_adapter() -> Any | None:
    module_path = os.getenv("AUTHORIZED_ADAPTER_MODULE", "").strip()
    if not module_path:
        return None
    path = Path(module_path).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"authorized adapter not found: {path}")
    spec = importlib.util.spec_from_file_location("zerowall_authorized_literature_adapter", path)
    if spec is None or spec.loader is None:
        raise ImportError("cannot load authorized adapter")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    acquire = getattr(module, "acquire", None)
    if not callable(acquire):
        raise TypeError("authorized adapter must export acquire(paper, output_path?)")
    return acquire


def download_response(client: Client, response: requests.Response, target: Path, paper: Paper, source: str) -> tuple[bool, str, str]:
    content_length = int(response.headers.get("content-length") or 0)
    max_bytes = int(os.getenv("LITERATURE_MAX_PDF_BYTES", str(DEFAULT_MAX_PDF_BYTES)))
    if content_length > max_bytes:
        return False, "response_too_large", ""
    temp: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(dir=target.parent, delete=False, suffix=".part") as handle:
            temp = Path(handle.name)
            total = 0
            for chunk in response.iter_content(131072):
                if chunk:
                    total += len(chunk)
                    if total > max_bytes:
                        temp.unlink(missing_ok=True)
                        return False, "response_too_large", ""
                    handle.write(chunk)
    except Exception as exc:
        # A socket reset while iterating the body is not an ordinary HTTP
        # failure.  Preserve a stable reason so the caller retries the stream
        # read rather than treating the URL as permanently unavailable.
        if temp is not None:
            temp.unlink(missing_ok=True)
        return False, f"stream_read_error:{type(exc).__name__}", ""
    finally:
        try:
            response.close()
        except Exception:
            pass
    if temp is None:
        return False, "stream_read_error:no_temp_file", ""
    ok, reason, digest = validate_pdf(temp, paper)
    if ok:
        temp.replace(target)
        paper.pdf_path, paper.pdf_source, paper.pdf_sha256, paper.pdf_status = str(target), source, digest, "downloaded_open_access"
        return True, reason, digest
    temp.unlink(missing_ok=True)
    return False, reason, digest


def download_authorized_adapter(client: Client, paper: Paper, target: Path) -> bool:
    def note(status: str, **meta: Any) -> None:
        paper.acquisition_attempts.append({"provider": "authorized_adapter", "skill": "zerowall-authorized-adapter", "status": status, **meta, "at": now()})
    try:
        acquire = load_authorized_adapter()
        if acquire is None:
            note("skipped_not_configured")
            return False
        result = acquire(asdict(paper), str(target))
        if not isinstance(result, dict) or result.get("status") not in {"success", "ok"}:
            paper.pdf_status = f"authorized_adapter_{clean_text((result or {}).get('status', 'no_result'))}"
            note(paper.pdf_status)
            return False
        url = clean_text(result.get("url"))
        if url and not allowed_adapter_url(url):
            paper.pdf_status = "authorized_adapter_domain_denied"
            note(paper.pdf_status, url=redact_url(url))
            return False
        path = Path(clean_text(result.get("path"))) if result.get("path") else None
        if path and path.exists():
            ok, reason, digest = validate_pdf(path, paper)
            if ok:
                if path.resolve() != target.resolve(): path.replace(target)
                paper.pdf_path, paper.pdf_source, paper.pdf_sha256, paper.pdf_status = str(target), url or "authorized_adapter", digest, "downloaded_authorized_adapter"
                note("downloaded_authorized_adapter", url=redact_url(url) if url else "")
                return True
            paper.pdf_status = f"authorized_adapter_{reason}"
            note(paper.pdf_status)
            return False
        if not url or not allowed_adapter_url(url):
            paper.pdf_status = "authorized_adapter_missing_allowed_url"
            note(paper.pdf_status)
            return False
        response = client.session.get(url, timeout=client.timeout, stream=True, allow_redirects=True)
        client.task.record("authorized_adapter", response.url, str(response.status_code), paper=paper.key)
        response.raise_for_status()
        ok, reason, _ = download_response(client, response, target, paper, response.url)
        if not ok:
            paper.pdf_status = f"authorized_adapter_{reason}"
            note(paper.pdf_status, url=redact_url(response.url))
        else:
            note("downloaded_authorized_adapter", url=redact_url(response.url))
        return ok
    except Exception as exc:
        paper.pdf_status = f"authorized_adapter_error:{type(exc).__name__}"
        note(paper.pdf_status, error=type(exc).__name__)
        return False


def download_via_paper_download(task: Task, paper: Paper, target: Path,
                                allow_shadow: bool = True, attempt: int = 1) -> bool:
    """Delegate PDF acquisition to the bundled paper-download workflow."""
    try:
        from paper_download_bridge import download_with_paper_download
        # Every paper and retry receives an isolated bridge workspace.  The
        # bridge writes registry/log/state files, so sharing only an
        # ``attempt-N`` directory lets concurrent downloads overwrite one
        # another even when their PDFs have different names.
        work_dir = task.root / "analysis" / ".runtime" / "paper-download" / f"attempt-{attempt}" / safe_name(paper.key)
        result = download_with_paper_download(
            asdict(paper), target, work_dir,
            allow_shadow=allow_shadow,
        )
        paper.acquisition_attempts.append({
            "provider": "paper-download", "skill": "paper-download-pdf-cascade", "status": result.status,
            "work_dir": result.work_dir,
            "stdout_log": str(Path(result.work_dir) / "bridge.stdout.log") if result.work_dir else "",
            "stderr_log": str(Path(result.work_dir) / "bridge.stderr.log") if result.work_dir else "",
            "at": now(),
        })
        task.record_mcp("paper-download", "paper-download-pdf-cascade", result.status, paper=paper.key, work_dir=result.work_dir)
        if not result.ok or not result.path:
            return False
        ok, reason, digest = validate_pdf(target, paper)
        if not ok:
            paper.pdf_status = f"paper_download_{reason}"
            paper.acquisition_attempts[-1]["reason"] = reason
            return False
        paper.pdf_path, paper.pdf_source, paper.pdf_sha256 = str(target), "paper-download", digest
        paper.pdf_status = "downloaded_paper_download"
        return True
    except Exception as exc:
        paper.acquisition_attempts.append({
            "provider": "paper-download", "status": f"error:{type(exc).__name__}", "at": now(),
        })
        return False


def download_paper(client: Client, paper: Paper, allow_tsg: bool = True) -> None:
    paper.acquisition_state = "candidate"
    # Wall-clock budget for ONE paper.  The cascade below (open-access URLs →
    # TSG → paper-download → authorized adapter) each carry their own retry
    # loop, so without a shared deadline a single hard-to-source paper can hold
    # a worker thread for 15+ minutes and stall the whole branch.  Exceeding the
    # budget is a normal terminal outcome, not an error.
    try:
        budget = float(os.getenv("LITERATURE_PDF_PAPER_BUDGET_SECONDS", "300"))
    except ValueError:
        budget = 300.0
    deadline = time.monotonic() + max(30.0, budget)

    def out_of_budget(stage: str) -> bool:
        if time.monotonic() < deadline:
            return False
        paper.acquisition_attempts.append({
            "provider": "workflow", "skill": "zerowall-literature",
            "status": "paper_budget_exhausted", "stage": stage,
            "budget_seconds": round(max(30.0, budget), 1), "at": now(),
        })
        return True

    urls = list(paper.oa_urls)
    email = os.getenv("UNPAYWALL_EMAIL")
    if paper.doi and email:
        data = client.get_json("unpaywall", f"{UNPAYWALL}/{quote(paper.doi, safe='')}", params={"email": email})
        for loc in data.get("oa_locations") or []:
            if loc.get("url_for_pdf"): urls.append(loc["url_for_pdf"])
    urls = list(dict.fromkeys(urls))
    target = normalize_pdf_location(client.task, paper)
    if target.exists():
        ok, reason, digest = validate_pdf(target, paper)
        if ok:
            paper.pdf_path, paper.pdf_sha256, paper.pdf_status = str(target), digest, "already_present"
            paper.pdf_source = paper.pdf_source or "existing_task_file"
            paper.acquisition_state = "acquisition_terminal"
            paper.acquisition_attempts.append({"provider": "local", "skill": "zerowall-literature", "status": "already_present", "path": str(target), "at": now()})
            return
    for url in urls:
        if out_of_budget("open_access"):
            break
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                response = client.session.get(url, timeout=client.timeout, stream=True, allow_redirects=True)
                client.task.record("open_access", response.url, str(response.status_code), paper=paper.key, attempt=attempt)
                client.task.record_mcp("open_access", "literature_pipeline.pdf_download", str(response.status_code), paper=paper.key, url=redact_url(response.url), attempt=attempt)
                paper.acquisition_attempts.append({"provider": "open_access", "skill": "pubmed-literature/openalex/crossref", "url": redact_url(response.url), "status": response.status_code, "attempt": attempt, "at": now()})
                if response.status_code >= 400:
                    paper.acquisition_attempts[-1]["reason"] = f"http_{response.status_code}"
                    if attempt < MAX_ATTEMPTS:
                        retry_after = response.headers.get("retry-after")
                        try:
                            delay = float(retry_after) if retry_after else min(2 ** (attempt - 1), 8)
                        except ValueError:
                            delay = min(2 ** (attempt - 1), 8)
                        time.sleep(min(delay, 8)); continue
                    response.raise_for_status()
                response.raise_for_status()
                ok, reason, _ = download_response(client, response, target, paper, response.url)
                if ok: paper.acquisition_state = "acquisition_terminal"; return
                paper.acquisition_attempts[-1]["reason"] = reason
                paper.pdf_status = reason
                if attempt < MAX_ATTEMPTS:
                    time.sleep(min(2 ** (attempt - 1), 8)); continue
                break
            except Exception as exc:
                paper.pdf_status = f"error:{type(exc).__name__}"
                paper.acquisition_attempts[-1]["reason"] = f"{type(exc).__name__}:{exc}"
                if attempt < MAX_ATTEMPTS:
                    time.sleep(min(2 ** (attempt - 1), 8))

    # TSG is the first authorized fallback and always searches by the paper
    # title.  Missing credentials, no matches and provider errors are explicit
    # receipts; none of them silently bypasses this stage.
    for attempt in range(1, MAX_ATTEMPTS + 1):
        if out_of_budget("tsg"):
            break
        if download_via_tsg(client, paper, target):
            paper.acquisition_state = "acquisition_terminal"
            return
        last_status = clean_text((paper.acquisition_attempts[-1] if paper.acquisition_attempts else {}).get("status"))
        deterministic = last_status in {"blocked_missing_credentials", "no_match", "ambiguous_match"} or paper.pdf_status in {"tsg_skill_missing", "tsg_missing_credentials", "tsg_no_match", "blocked_ambiguous_match"}
        paper.acquisition_attempts.append({
            "provider": "tsg", "skill": "zerowall-tsg-literature",
            "status": "fallback_to_paper_download" if deterministic else ("retry_scheduled" if attempt < MAX_ATTEMPTS else "retry_exhausted"),
            "attempt": attempt, "query": paper.title, "at": now(),
        })
        if deterministic:
            break
        if attempt < MAX_ATTEMPTS:
            time.sleep(min(2 ** (attempt - 1), 8))

    # Only after TSG has exhausted its title search do we invoke the bundled
    # paper-download cascade.  The shadow libraries are enabled by default,
    # while an explicit opt-out remains available for controlled diagnostics.
    shadow_setting = os.getenv("RESEARCH_ENABLE_SHADOW_LIBS", "").strip().lower()
    shadow_enabled = shadow_setting not in {"0", "false", "no", "off"}
    for attempt in range(1, MAX_ATTEMPTS + 1):
        if out_of_budget("paper_download"):
            break
        if download_via_paper_download(client.task, paper, target, allow_shadow=shadow_enabled, attempt=attempt):
            paper.acquisition_state = "acquisition_terminal"
            return
        paper.acquisition_attempts.append({
            "provider": "paper-download", "skill": "paper-download-pdf-cascade",
            "status": "retry_scheduled" if attempt < MAX_ATTEMPTS else "retry_exhausted",
            "attempt": attempt, "at": now(),
        })
        if attempt < MAX_ATTEMPTS:
            time.sleep(min(2 ** (attempt - 1), 8))
    if download_authorized_adapter(client, paper, target):
        paper.acquisition_state = "acquisition_terminal"
        return
    if not paper.pdf_path:
        paper.acquisition_state = "acquisition_terminal"
        has_rate_limit = any(str(item.get("status")) in {"429", "blocked_provider_rate_limit"} for item in paper.acquisition_attempts)
        has_identity_mismatch = any(str(item.get("reason")) == "metadata_mismatch" for item in paper.acquisition_attempts)
        paper.pdf_status = "blocked_provider_rate_limit" if has_rate_limit else ("blocked_identity_mismatch" if has_identity_mismatch else (paper.pdf_status if paper.pdf_status in {"blocked_ambiguous_match", "blocked_identity_mismatch"} else "unavailable_no_authorized_source"))


def _pdf_job_path(task: Task, paper_key: str) -> Path:
    return task.root / "analysis" / "pdf_jobs" / f"{hashlib.sha256(paper_key.encode('utf-8')).hexdigest()[:24]}.json"


def _write_pdf_job(task: Task, paper: Paper, status: str, **extra: Any) -> None:
    """Persist one paper's worker state without rewriting the shared state file."""
    path = _pdf_job_path(task, paper.key)
    path.parent.mkdir(parents=True, exist_ok=True)
    row = {
        "paper_key": paper.key, "status": status, "paper": asdict(paper),
        "pdf_status": paper.pdf_status, "pdf_path": paper.pdf_path,
        "pdf_source": paper.pdf_source, "pdf_sha256": paper.pdf_sha256,
        "acquisition_state": paper.acquisition_state,
        "acquisition_attempts": paper.acquisition_attempts,
        "parse_status": "not_required", "updated_at": now(), **extra,
    }
    atomic_write_text(path, json.dumps(row, ensure_ascii=False, indent=2))


def merge_pdf_jobs(task: Task, state: dict[str, Any]) -> list[Paper]:
    """Merge independently-written PDF worker snapshots into in-memory papers."""
    papers = papers_from_state(state)
    by_key = {paper.key: paper for paper in papers}
    job_rows = task.pdf_jobs()
    # The per-paper JSON snapshots are authoritative.  The JSONL journal is
    # retained as an audit trail only; separate Task instances in concurrent
    # workers cannot share an in-process lock for that file.
    snapshot_dir = task.root / "analysis" / "pdf_jobs"
    if snapshot_dir.is_dir():
        job_rows = []
        for path in snapshot_dir.glob("*.json"):
            try:
                snapshot = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            job_rows.append({"paper_key": snapshot.get("paper_key"), "path": str(path)})
    for row in job_rows:
        path = Path(clean_text(row.get("path")))
        try:
            job = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        payload = job.get("paper") if isinstance(job.get("paper"), dict) else job
        key = clean_text(job.get("paper_key") or payload.get("key"))
        paper = by_key.get(key)
        if paper is None or paper.direction != "cited-by":
            continue
        for name in ("pdf_path", "pdf_source", "pdf_sha256", "pdf_status", "acquisition_state", "acquisition_attempts", "parse_status"):
            if name in payload:
                setattr(paper, name, payload[name])
    state["papers"] = [asdict(paper) for paper in papers]
    return papers


def _pdf_worker_one(task_root: Path, paper_row: dict[str, Any], timeout: float, allow_tsg: bool) -> None:
    task = Task(task_root)
    paper = Paper(**{k: v for k, v in paper_row.items() if k in Paper.__dataclass_fields__})
    _write_pdf_job(task, paper, "running", worker_pid=os.getpid())
    try:
        # Each paper owns its requests session and bridge workspace.  This is
        # important because requests.Session and paper-download registries are
        # not safe to share between concurrent jobs.
        client = Client(task, timeout)
        download_paper(client, paper, allow_tsg)
        paper.parse_status = "not_required"
        _write_pdf_job(task, paper, "complete" if paper.pdf_status in ACQUISITION_TERMINAL else "partial")
    except Exception as exc:
        paper.acquisition_state = "acquisition_terminal"
        paper.pdf_status = f"error:{type(exc).__name__}"
        paper.acquisition_attempts.append({"provider": "workflow", "skill": "zerowall-literature", "status": "worker_error", "error": type(exc).__name__, "at": now()})
        _write_pdf_job(task, paper, "failed", error=type(exc).__name__)


def _pid_is_running(pid: Any) -> bool:
    try:
        pid_value = int(pid)
    except (TypeError, ValueError):
        return False
    if pid_value <= 0:
        return False
    if os.name == "nt":
        try:
            import ctypes
            handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid_value)
            if not handle:
                return False
            exit_code = ctypes.c_ulong()
            active = bool(ctypes.windll.kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code))) and exit_code.value == 259
            ctypes.windll.kernel32.CloseHandle(handle)
            return active
        except Exception:
            return False
    try:
        os.kill(pid_value, 0)
        return True
    except OSError:
        return False


def _write_pdf_worker_state(task: Task, payload: dict[str, Any]) -> None:
    atomic_write_text(task.pdf_worker_path, json.dumps(payload, ensure_ascii=False, indent=2))


def recover_stale_pdf_jobs(task: Task) -> int:
    """Turn abandoned per-paper running snapshots into resumable work."""
    if _pdf_worker_is_active(task):
        return 0
    recovered = 0
    snapshot_dir = task.root / "analysis" / "pdf_jobs"
    if not snapshot_dir.is_dir():
        return 0
    for path in snapshot_dir.glob("*.json"):
        try:
            row = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if clean_text(row.get("status")) != "running":
            continue
        payload = row.get("paper") if isinstance(row.get("paper"), dict) else row
        paper = Paper(**{key: value for key, value in payload.items() if key in Paper.__dataclass_fields__})
        paper.acquisition_state = "retryable"
        if paper.pdf_status in {"running", "not_attempted", ""} or paper.pdf_status.startswith("error:"):
            paper.pdf_status = "retryable"
        paper.acquisition_attempts.append({
            "provider": "workflow", "skill": "zerowall-literature", "status": "lease_recovered",
            "previous_worker_pid": row.get("worker_pid"), "at": now(),
        })
        _write_pdf_job(task, paper, "retryable", recovered_at=now())
        task.append_pdf_job({"paper_key": paper.key, "status": "retryable", "path": str(path.resolve())})
        recovered += 1
    return recovered


def run_pdf_acquisition(task: Task, state: dict[str, Any], timeout: float, workers: int, allow_tsg: bool) -> dict[str, Any]:
    """Run cited-by PDF acquisition as an independent, resumable branch."""
    recovered = recover_stale_pdf_jobs(task)
    papers = merge_pdf_jobs(task, state)
    cited = [paper for paper in papers if paper.direction == "cited-by" and paper.pdf_status not in ACQUISITION_TERMINAL]
    workers = max(1, min(int(workers or 4), 8))
    task.pdf_worker_path.parent.mkdir(parents=True, exist_ok=True)
    worker_payload = {"pid": os.getpid(), "status": "running", "started_at": now(), "heartbeat_at": now(), "workers": workers}
    _write_pdf_worker_state(task, worker_payload)
    heartbeat_stop = threading.Event()
    def heartbeat() -> None:
        while not heartbeat_stop.wait(10):
            worker_payload["heartbeat_at"] = now()
            _write_pdf_worker_state(task, worker_payload)
    heartbeat_thread = threading.Thread(target=heartbeat, name="literature-pdf-heartbeat", daemon=True)
    heartbeat_thread.start()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {}
        for paper in cited:
            path = _pdf_job_path(task, paper.key)
            task.append_pdf_job({"paper_key": paper.key, "status": "running", "path": str(path.resolve())})
            futures[pool.submit(_pdf_worker_one, task.root, asdict(paper), timeout, allow_tsg)] = paper.key
        for future in as_completed(futures):
            paper_key = futures[future]
            try:
                future.result()
            except Exception:
                # _pdf_worker_one records failures; one bad paper must not
                # abort the remaining acquisition jobs.
                pass
            path = _pdf_job_path(task, paper_key)
            try:
                snapshot = json.loads(path.read_text(encoding="utf-8"))
                status = clean_text(snapshot.get("status")) or "failed"
            except (OSError, json.JSONDecodeError):
                status = "failed"
            task.append_pdf_job({"paper_key": paper_key, "status": status, "path": str(path.resolve())})
    heartbeat_stop.set(); heartbeat_thread.join(timeout=2)
    papers = merge_pdf_jobs(task, state)
    result_status = "complete" if all(p.pdf_status in ACQUISITION_TERMINAL for p in papers if p.direction == "cited-by") else "partial"
    _write_pdf_worker_state(task, {"pid": os.getpid(), "status": result_status, "finished_at": now(), "heartbeat_at": now(), "processed": len(cited), "recovered": recovered})
    # Do not save the parent state from this process: an evidence ingest can
    # happen concurrently and a stale state write would erase its receipts.
    # The next resume/status call merges the per-paper snapshots atomically.
    return {"status": result_status, "processed": len(cited), "recovered": recovered}


def _pdf_worker_is_active(task: Task) -> bool:
    try:
        data = json.loads(task.pdf_worker_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    if data.get("status") != "running":
        return False
    try:
        heartbeat = datetime.fromisoformat(str(data.get("heartbeat_at") or data.get("started_at")))
        lease_valid = (datetime.now(timezone.utc) - heartbeat.astimezone(timezone.utc)).total_seconds() < 120
        return lease_valid and _pid_is_running(data.get("pid"))
    except (TypeError, ValueError):
        return False


def start_pdf_worker(task: Task, state: dict[str, Any], args: argparse.Namespace) -> bool:
    """Start the PDF branch without blocking author/provider enrichment."""
    if os.getenv("LITERATURE_AUTO_START_PDF_WORKER", "1").strip().lower() in {"0", "false", "no", "off"}:
        return False
    if _pdf_worker_is_active(task):
        state.setdefault("parallel_jobs", {})["pdf_acquisition"] = "running"
        task.save(state)
        return True
    recover_stale_pdf_jobs(task)
    papers = merge_pdf_jobs(task, state)
    pending = [paper for paper in papers if paper.direction == "cited-by" and paper.pdf_status not in ACQUISITION_TERMINAL]
    if not pending:
        state.setdefault("parallel_jobs", {})["pdf_acquisition"] = "complete"
        task.save(state)
        return False
    python_executable = os.getenv("ZEROWALL_PYTHON_EXECUTABLE", "").strip()
    if not python_executable:
        if getattr(sys, "frozen", False):
            bundled = Path(sys.executable).resolve().parent / "bio-tools" / "python" / ("python.exe" if os.name == "nt" else "python")
            python_executable = str(bundled) if bundled.is_file() else sys.executable
        else:
            python_executable = sys.executable
    command = [python_executable, str(Path(__file__).resolve()), "acquire-pdfs", str(task.root), "--timeout", str(getattr(args, "timeout", 30)), "--workers", str(state.get("research_plan", {}).get("download_workers", 4))]
    if getattr(args, "no_tsg", False):
        command.append("--no-tsg")
    creationflags = 0
    if os.name == "nt":
        creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | getattr(subprocess, "DETACHED_PROCESS", 0)
    stdout_path = task.root / "analysis" / "pdf-worker.stdout.log"; stderr_path = task.root / "analysis" / "pdf-worker.stderr.log"
    stdout_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        stdout_handle = stdout_path.open("a", encoding="utf-8")
        stderr_handle = stderr_path.open("a", encoding="utf-8")
        process = subprocess.Popen(command, cwd=str(task.root), stdin=subprocess.DEVNULL, stdout=stdout_handle, stderr=stderr_handle, creationflags=creationflags, close_fds=True)
        stdout_handle.close(); stderr_handle.close()
    except OSError as exc:
        try:
            stdout_handle.close(); stderr_handle.close()
        except UnboundLocalError:
            pass
        state.setdefault("parallel_jobs", {})["pdf_acquisition"] = "failed_to_start"
        state.setdefault("parallel_jobs", {})["pdf_error"] = type(exc).__name__
        task.save(state)
        return False
    _write_pdf_worker_state(task, {"pid": process.pid, "status": "running", "started_at": now(), "heartbeat_at": now(), "command": command})
    state.setdefault("parallel_jobs", {})["pdf_acquisition"] = "running"
    task.save(state)
    return True


def _tsg_credential(name: str) -> tuple[str, str]:
    """Resolve one TSG cookie without ever returning it to logs.

    ZeroWall normally hydrates encrypted Environment values into the Host
    process.  The fallbacks cover older settings/export formats and Windows
    launch environments whose key casing differs.  A browser-cookie export is
    accepted only when its domain proves which JSESSIONID is being supplied.
    """
    aliases = {
        "TSG_PM_JSESSIONID": ("TSG_PM_JSESSION_ID", "TSG_PM_JSESSION", "PM_JSESSIONID"),
        "TSG_SESSIONID": ("TSG_USER_SESSIONID",),
        "TSG_SGUSER": (),
        "TSG_TSGUSER": (),
    }
    expected_cookie = {
        "TSG_PM_JSESSIONID": "JSESSIONID",
        "TSG_SESSIONID": "SESSIONID",
        "TSG_SGUSER": "sguser",
        "TSG_TSGUSER": "tsguser",
    }[name]
    upper_environment = {key.upper(): value for key, value in os.environ.items()}
    for candidate in (name, *aliases.get(name, ())):
        value = clean_text(upper_environment.get(candidate.upper()))
        if not value:
            continue
        prefix = expected_cookie + "="
        if value.lower().startswith(prefix.lower()):
            value = value[len(prefix):].strip()
        if value:
            return value, "environment" if candidate == name else f"legacy_alias:{candidate}"

    raw = os.getenv("RESEARCH_BROWSER_COOKIES", "").strip()
    if not raw:
        return "", "missing"
    try:
        exported = json.loads(raw)
    except json.JSONDecodeError:
        exported = None
    rows = exported if isinstance(exported, list) else exported.get("cookies", []) if isinstance(exported, dict) else []
    for row in rows:
        if not isinstance(row, dict):
            continue
        cookie_name = clean_text(row.get("name"))
        domain = clean_text(row.get("domain")).lower().lstrip(".")
        value = clean_text(row.get("value"))
        domain_ok = (
            name == "TSG_PM_JSESSIONID" and domain == "pm.yuntsg.com"
            or name == "TSG_SESSIONID" and domain == "user.tsgyun.com"
            or name == "TSG_SGUSER" and domain.endswith("yuntsg.com")
            or name == "TSG_TSGUSER" and domain.endswith("tsgyun.com")
        )
        if domain_ok and cookie_name.lower() == expected_cookie.lower() and value:
            return value, "browser_cookie_export"
    return "", "missing"


def download_via_tsg(client: Client, paper: Paper, target: Path) -> bool:
    """Use the existing authorized TSG client as an explicit fallback.

    The import is resolved relative to the bundled skills directory so the
    runtime copy and the source checkout use the same implementation.
    """
    script = Path(__file__).resolve().parents[2] / "zerowall-tsg-literature" / "scripts" / "tsg_literature.py"
    if not script.exists():
        paper.pdf_status = "tsg_skill_missing"
        return False
    required_cookies = ("TSG_PM_JSESSIONID", "TSG_SESSIONID", "TSG_SGUSER", "TSG_TSGUSER")
    resolved = {name: _tsg_credential(name) for name in required_cookies}
    missing = [name for name, (value, _source) in resolved.items() if not value]
    if missing:
        paper.pdf_status = "tsg_missing_credentials"
        credential_sources = {name: source for name, (_value, source) in resolved.items()}
        paper.acquisition_attempts.append({"provider": "tsg", "skill": "zerowall-tsg-literature", "status": "blocked_missing_credentials", "reason": "credential_not_in_process_environment", "missing": missing, "credential_sources": credential_sources, "query": paper.title, "at": now()})
        client.task.record_mcp("tsg", "zerowall-tsg-literature.search", "blocked_missing_credentials", paper=paper.key, query=paper.title, missing=missing, credential_sources=credential_sources)
        return False
    try:
        spec = importlib.util.spec_from_file_location("zerowall_tsg_client", script)
        if spec is None or spec.loader is None:
            raise ImportError("cannot load TSG skill")
        module = importlib.util.module_from_spec(spec); sys.modules[spec.name] = module; spec.loader.exec_module(module)
        tsg = module.TSGClient(
            pm_jsessionid=resolved["TSG_PM_JSESSIONID"][0],
            user_sessionid=resolved["TSG_SESSIONID"][0],
            sguser=resolved["TSG_SGUSER"][0],
            tsguser=resolved["TSG_TSGUSER"][0],
            timeout=client.timeout,
        )
        client.task.record_mcp("tsg", "zerowall-tsg-literature.search", "started", paper=paper.key, query=paper.title)
        # TSG is a title search fallback. DOI/PMID are used only to verify the
        # returned candidate and prevent identity mismatches.
        matches, _ = tsg.search(paper.title, size=20)
        match = next((x for x in matches if paper.doi and x.doi and x.doi.lower() == paper.doi.lower()), None)
        if match is None and paper.pmid:
            match = next((x for x in matches if clean_text(x.pmid) == clean_text(paper.pmid)), None)
        title_matches = [x for x in matches if title_score(paper.title, x.title) > 0.85]
        if match is None and len(title_matches) == 1:
            match = title_matches[0]
        if match is None and len(title_matches) > 1:
            paper.pdf_status = "blocked_ambiguous_match"
            client.task.record_mcp("tsg", "zerowall-tsg-literature.match", "ambiguous_match", paper=paper.key, candidates=len(title_matches))
            paper.acquisition_attempts.append({"provider": "tsg", "skill": "zerowall-tsg-literature", "status": "ambiguous_match", "candidates": len(title_matches), "at": now()})
            return False
        if match is None:
            paper.pdf_status = "tsg_no_match"
            client.task.record_mcp("tsg", "zerowall-tsg-literature.match", "no_match", paper=paper.key)
            paper.acquisition_attempts.append({"provider": "tsg", "skill": "zerowall-tsg-literature", "status": "no_match", "at": now()})
            return False
        case = tsg.apply([match])[0]
        client.task.record_mcp("tsg", "zerowall-tsg-literature.apply", "submitted", paper=paper.key, pmid=match.pmid)
        deadline = time.monotonic() + float(os.getenv("TSG_WAIT_TIMEOUT", "3600"))
        while time.monotonic() < deadline:
            rows = tsg.cases(size=100)
            client.task.record_mcp("tsg", "zerowall-tsg-literature.cases", "polled", paper=paper.key, pmid=match.pmid)
            current = next((x for x in rows if x.pmid == match.pmid), case)
            if current.status == 2 or current.pdf_url:
                url = tsg.viewer_pdf_url(current)
                tsg.download(url, target)
                client.task.record_mcp("tsg", "zerowall-tsg-literature.download", "downloaded", paper=paper.key, pmid=match.pmid)
                ok, reason, digest = validate_pdf(target, paper)
                if ok:
                    paper.pdf_path, paper.pdf_source, paper.pdf_sha256, paper.pdf_status = str(target), "tsg", digest, "downloaded_tsg"
                    paper.acquisition_attempts.append({"provider": "tsg", "skill": "zerowall-tsg-literature", "status": "downloaded_tsg", "pmid": match.pmid, "at": now()})
                    return True
                target.unlink(missing_ok=True); paper.pdf_status = "blocked_identity_mismatch" if reason == "metadata_mismatch" else f"tsg_{reason}"; client.task.record_mcp("tsg", "zerowall-tsg-literature.download", "identity_mismatch" if reason == "metadata_mismatch" else "invalid_pdf", paper=paper.key); return False
            if current.status in (3, 4, -1):
                paper.pdf_status = f"tsg_failed_status_{current.status}"; return False
            time.sleep(min(30.0, max(2.0, float(os.getenv("TSG_POLL_INTERVAL", "30")))) )
        paper.pdf_status = "tsg_timeout"
    except Exception as exc:
        paper.pdf_status = f"tsg_error:{type(exc).__name__}"
        paper.acquisition_attempts.append({"provider": "tsg", "skill": "zerowall-tsg-literature", "status": "error", "error": type(exc).__name__, "at": now()})
    return False


def citation_contexts(text: str, target: Paper, ref_number: int | None = None) -> list[dict[str, Any]]:
    # Do not treat a bibliography entry as an evaluative citation context.
    body = text
    ref_heading = re.search(r"\n\s*(?:references|bibliography)\s*\n", text, re.I)
    if ref_heading:
        body = text[:ref_heading.start()]
    markers: list[str] = []
    if ref_number:
        markers.append(r"\[[0-9\s,;:\-–—]+\]")
        markers.append(r"\([0-9\s,;:\-–—]+\)")
    surnames = [clean_text(a).split()[-1] for a in target.authors[:3] if clean_text(a)]
    markers.extend([re.escape(s) for s in surnames if len(s) > 3])
    if target.doi:
        markers.append(re.escape(target.doi))
    if target.title:
        title_terms = [re.escape(x) for x in re.findall(r"[A-Za-z0-9]{5,}", target.title)[:5]]
        if title_terms:
            markers.append(r"(?i)(?:" + ".*?".join(title_terms[:3]) + r")")
    hits: list[dict[str, Any]] = []
    for pattern in markers:
        for match in re.finditer(pattern, body, re.I):
            marker_text = match.group(0)
            if ref_number and (marker_text.startswith(("[", "("))):
                nums = [int(x) for x in re.findall(r"\d+", marker_text)]
                included = any((a <= ref_number <= b) for a, b in zip(nums[::2], nums[1::2])) or ref_number in nums
                if not included: continue
            start, end = max(0, match.start() - 420), min(len(text), match.end() + 420)
            excerpt = clean_text(text[start:end])
            if excerpt and not any(match.start() == x["offset"] for x in hits):
                prefix = body[:match.start()]
                page = prefix.count("\f") + 1
                hits.append({"marker": marker_text, "excerpt": excerpt[:900], "offset": match.start(), "page": page, "classification": classify_context(excerpt), "evidence_level": "full_text"})
    return hits


def infer_reference_number(text: str, target: Paper) -> int | None:
    """Find the numbered bibliography entry for a target in a citing PDF."""
    candidates = [target.doi, target.title]
    for line in text.splitlines():
        line_clean = clean_text(line)
        if not line_clean or not any(value and value.lower() in line_clean.lower() for value in candidates):
            continue
        match = re.match(r"\s*\[?(\d{1,3})\]?\s*[.)]", line_clean)
        if match:
            return int(match.group(1))
    if target.doi:
        match = re.search(r"(?:\[|\()?(\d{1,3})(?:\]|\))?[^\n]{0,500}" + re.escape(target.doi), text, re.I)
        if match:
            return int(match.group(1))
    return None


def classify_context(value: str) -> str:
    lower = value.lower()
    if any(x in lower for x in ("however", "contradict", "limitation", "failed", "unlike")): return "critique_or_comparison"
    if any(x in lower for x in ("method", "protocol", "assay", "according to")): return "method_or_background"
    if any(x in lower for x in ("support", "consistent", "demonstrated", "showed")): return "supporting_result"
    return "background_or_uncertain"


def author_profiles(paper: Paper) -> list[dict[str, Any]]:
    profiles = []
    names: list[tuple[str, str]] = []
    if paper.authors:
        names.append(("first_author", paper.authors[0]))
        names.extend(("author", name) for name in paper.authors[1:])
    names.extend(("corresponding_author", name) for name in paper.corresponding_authors if name)
    orcids = {clean_text(a.get("family")): clean_text(a.get("ORCID")) for a in (paper.raw.get("author") or []) if a.get("ORCID")}
    for role, name in names:
        family = clean_text(name).split()[-1] if name else ""
        orcid = orcids.get(family, "")
        oid = orcid.rstrip("/").rsplit("/", 1)[-1] if orcid else ""
        verified = (paper.raw.get("orcid_profiles") or {}).get(oid, {})
        employment = verified.get("employments") or []
        position = "; ".join(x.get("role", "") for x in employment if x.get("role"))
        appointments = "; ".join(x.get("organization", "") for x in employment if x.get("organization"))
        if not name or any(x["name"] == name for x in profiles): continue
        profiles.append({"name": name, "role": role, "institution": "; ".join(dict.fromkeys(paper.affiliations + paper.institutions)), "countries": "; ".join(paper.countries), "position": position, "appointments": appointments, "honors": "", "orcid": orcid, "source_url": verified.get("url") or orcid or "", "sources": [verified.get("url") or orcid] if (verified.get("url") or orcid) else [], "verified_claims": employment, "last_verified": now(), "confidence": "orcid_public_record" if verified else ("identifier_only" if orcid else ("affiliation_only" if paper.affiliations or paper.institutions else "unverified"))})
    return profiles


def assign_contexts(papers: list[Paper], target: Paper) -> None:
    """Attach evidence in the correct document for each citation direction."""
    target_text = paper_text(target)
    for paper in papers:
        if paper.direction == "cited-by" and (paper.parsed_text_path or paper.pdf_path):
            citing_text = paper_text(paper)
            ref_number = infer_reference_number(citing_text, target)
            paper.citation_contexts = citation_contexts(citing_text, target, ref_number)
            if ref_number:
                for context in paper.citation_contexts:
                    context["target_reference_number"] = ref_number
        elif paper.direction == "references" and target_text:
            index = (paper.raw.get("reference_index") or 0)
            paper.citation_contexts = citation_contexts(target_text, paper, int(index) if index else None)


def _file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else ""


def report_data_fingerprint(task: Task, state: dict[str, Any], papers: list[Paper]) -> str:
    """Fingerprint only report-driving data, not mutable workflow timestamps."""
    paper_rows = []
    for paper in papers:
        author_rows = []
        for author in paper.author_records:
            author_rows.append({key: author.get(key) for key in (
                "author_entity_id", "name", "aliases", "orcid", "current_title",
                "current_institution", "current_country", "research_topics", "top_works",
                "works_count", "cited_by_count", "h_index", "honors", "appointments",
                "associated_papers", "sources",
            )})
        paper_rows.append({
            "key": paper.key, "direction": paper.direction, "title": paper.title,
            "doi": paper.doi, "pmid": paper.pmid, "year": paper.year,
            "journal": paper.journal, "journal_abbrev": paper.journal_abbrev,
            "journal_metric": paper.journal_metric, "pdf_status": paper.pdf_status,
            "pdf_file": Path(paper.pdf_path).name if paper.pdf_path else "",
            "parse_status": paper.parse_status, "citation_relation": paper.citation_relation,
            "authors": author_rows,
        })
    queue_rows = [{
        "request_id": row.get("request_id"), "status": row.get("status"),
        "actual_engine": row.get("actual_engine"), "updated_at": row.get("updated_at"),
    } for row in task.provider_requests()]
    analysis_hashes = {
        name: _file_sha256(task.root / "analysis" / name)
        for name in ("author_evidence.json", "journal_evidence.json", "citation_relations.json", "provider_evidence.json")
    }
    payload = {"papers": paper_rows, "queue": queue_rows, "analysis": analysis_hashes}
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")).hexdigest()


def latest_branch_timestamp(task: Task) -> str:
    candidates: list[str] = []
    for row in task.provider_requests() + task.pdf_jobs():
        for key in ("updated_at", "result_received_at", "created_at"):
            if clean_text(row.get(key)):
                candidates.append(clean_text(row[key]))
    for name in ("author_evidence.json", "journal_evidence.json", "citation_relations.json", "provider_evidence.json"):
        path = task.root / "analysis" / name
        if path.is_file():
            candidates.append(datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat())
    parsed: list[tuple[datetime, str]] = []
    for value in candidates:
        try:
            parsed.append((datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc), value))
        except (TypeError, ValueError):
            continue
    return max(parsed, default=(datetime.fromtimestamp(0, timezone.utc), ""))[1]


def report_manifest_valid(task: Task, state: dict[str, Any], papers: list[Paper]) -> bool:
    path = task.root / "analysis" / "report_manifest.json"
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    if int(manifest.get("schema") or 0) != REPORT_SCHEMA_VERSION:
        return False
    if manifest.get("data_fingerprint") != report_data_fingerprint(task, state, papers):
        return False
    try:
        generated = datetime.fromisoformat(clean_text(manifest.get("generated_at")).replace("Z", "+00:00")).astimezone(timezone.utc)
        latest = datetime.fromisoformat(latest_branch_timestamp(task).replace("Z", "+00:00")).astimezone(timezone.utc)
        if generated < latest:
            return False
    except (TypeError, ValueError):
        return False
    for item in manifest.get("files") or []:
        output = task.root / clean_text(item.get("path"))
        if not output.is_file() or output.stat().st_size != int(item.get("bytes") or -1) or _file_sha256(output) != item.get("sha256"):
            return False
    return {item.get("path") for item in manifest.get("files") or []} == {"report.html", "report.pdf", "papers.xlsx"}


def write_progress(task: Task, state: dict[str, Any], papers: list[Paper]) -> None:
    payload = {
        "stage": state.get("stage"), "state_revision": state.get("state_revision", 0),
        "updated_at": now(), "phase_status": state.get("phase_status", {}),
        "target_count": sum(p.direction == "target" for p in papers),
        "cited_by_count": sum(p.direction == "cited-by" for p in papers),
        "author_count": len(unique_author_entities(papers)),
        "pdf_terminal_count": sum(p.pdf_status in ACQUISITION_TERMINAL for p in papers),
    }
    atomic_write_text(task.root / "analysis" / "progress.json", json.dumps(payload, ensure_ascii=False, indent=2))


def archive_stale_outputs(task: Task) -> Path | None:
    outputs = [task.root / name for name in ("papers.xlsx", "report.html", "report.pdf") if (task.root / name).exists()]
    if not outputs:
        return None
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    destination = task.root / "analysis" / "stale-output" / stamp
    destination.mkdir(parents=True, exist_ok=True)
    for output in outputs:
        shutil.move(str(output), str(destination / output.name))
    return destination


def update_phase_status(state: dict[str, Any], papers: list[Paper]) -> dict[str, Any]:
    if state.get("workflow_mode") == WORKFLOW_MODE:
        target = next((paper for paper in papers if paper.direction == "target"), None)
        cited = [paper for paper in papers if paper.direction == "cited-by"]
        terminal = bool(papers) and all(p.acquisition_state == "acquisition_terminal" or p.pdf_status in ACQUISITION_TERMINAL for p in papers)
        analysis_dir = Path(state.get("task_root") or ".") / "analysis"
        target_parsed = bool(target and target.parse_status == "mineru_parsed" and target.parsed_text_path)
        author_rows: list[dict[str, Any]] = []
        try:
            author_rows = json.loads((analysis_dir / "author_evidence.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            author_rows = []
        strict_author_gate = int(state.get("workflow_version", 1)) >= 2
        queue: list[dict[str, Any]] = []
        queue_path = analysis_dir / "provider_requests.jsonl"
        try:
            queue = [json.loads(line) for line in queue_path.read_text(encoding="utf-8").splitlines() if line.strip()]
            latest: dict[str, dict[str, Any]] = {}
            for row in queue:
                if row.get("request_id"):
                    latest[row["request_id"]] = row
            queue = list(latest.values())
        except (OSError, json.JSONDecodeError):
            queue = []
        queue_ready = bool(queue) and all(clean_text(row.get("status")) in QUEUE_TERMINAL for row in queue)
        # Partial enrichment: the user may explicitly accept a report built from
        # the evidence that exists instead of waiting for every optional provider.
        partial_enrichment = bool(state.get("partial_enrichment"))
        # A queue-driven task is complete only after every author has a real
        # web-search terminal result.  This prevents an empty placeholder file
        # from satisfying the author phase.
        author_entities = {clean_text(row.get("subject")) for row in queue if row.get("kind") == "author"}
        searched_entities = {clean_text(row.get("subject")) for row in queue
                             if row.get("kind") == "author" and row.get("tool") in WEB_SEARCH_TOOLS
                             and clean_text(row.get("status")) in QUEUE_TERMINAL}
        search_engines_by_author: dict[str, set[str]] = {}
        for row in queue:
            if row.get("kind") != "author" or row.get("tool") != "advanced_search" or clean_text(row.get("status")) != "succeeded":
                continue
            actual_engine = clean_text(row.get("actual_engine")).lower()
            if actual_engine:
                search_engines_by_author.setdefault(clean_text(row.get("subject")), set()).add(actual_engine)
        multi_engine_ready = bool(author_entities) and all(len(search_engines_by_author.get(entity, set())) >= 2 for entity in author_entities)
        author_ready = ((analysis_dir / "author_evidence.json").is_file()
                        and (analysis_dir / "author_analysis.md").is_file()
                        and (not state.get("enrichment_required") or ((queue_ready or partial_enrichment) and author_entities <= searched_entities and (multi_engine_ready or partial_enrichment))))
        if strict_author_gate:
            allowed_author_status = {"searched_verified", "searched_partial", "not_found_after_search", "ambiguous_identity"}
            if partial_enrichment:
                # Evidence that was never fetched stays blocked_provider; that is
                # a declared gap, not a reason to withhold the report.
                allowed_author_status.add("blocked_provider")
            # Only cited-by authors are in the enrichment scope: the queue is
            # built from `unique_author_entities`, which skips the target paper.
            # Target-paper authors therefore stay blocked_provider by design and
            # must not block the cited-by author phase.
            target_keys = {clean_text(p.key) for p in papers if p.direction == "target"}
            scoped_rows = [row for row in author_rows if clean_text(row.get("paper")) not in target_keys]
            # 0-author edge case: when no cited-by papers have authors to enrich,
            # scoped_rows is empty.  With partial_enrichment accepted, there is
            # nothing to fetch, so the phase is trivially complete.
            if not scoped_rows and partial_enrichment:
                author_ready = True
            else:
                author_ready = (bool(scoped_rows)
                                and all(row.get("evidence_status") in allowed_author_status for row in scoped_rows)
                                and ((bool(Task(Path(state.get("task_root") or ".")).web_search_receipts()) and multi_engine_ready) or partial_enrichment))
        journal_requests = [row for row in queue if row.get("kind") == "journal"]
        journal_ready = ((analysis_dir / "journal_evidence.json").is_file()
                         and (not journal_requests or all(clean_text(row.get("status")) in QUEUE_TERMINAL for row in journal_requests)))
        task = Task(Path(state.get("task_root") or "."))
        report_ready = report_manifest_valid(task, state, papers)
        # Read the pdf_worker.json file to get the authoritative finished status.
        # A detached worker process may have exited without updating parallel_jobs
        # in state (it deliberately avoids saving state to prevent race conditions).
        # Trust "complete" / "partial" in pdf_worker.json even when the process is
        # no longer alive — these are terminal statuses written by the worker itself.
        _worker_file_status = ""
        try:
            _wd = json.loads(task.pdf_worker_path.read_text(encoding="utf-8"))
            _worker_file_status = clean_text(_wd.get("status", ""))
        except (OSError, json.JSONDecodeError):
            pass
        _WORKER_TERMINAL = {"complete", "partial"}
        if _worker_file_status in _WORKER_TERMINAL:
            # Worker finished — mark pdf_acquisition complete in parallel_jobs so
            # subsequent resume calls see the correct state immediately.
            state.setdefault("parallel_jobs", {})["pdf_acquisition"] = _worker_file_status
            worker_state = ""
        elif _pdf_worker_is_active(task):
            worker_state = "running"
        else:
            worker_state = ""
        pdf_job_state = state.get("parallel_jobs", {}).get("pdf_acquisition") or worker_state
        # Re-evaluate terminal using latest merged paper statuses.
        terminal = bool(papers) and all(
            p.acquisition_state == "acquisition_terminal" or p.pdf_status in ACQUISITION_TERMINAL
            for p in papers
        )
        state["phase_status"] = {
            "identify_target": "complete" if target else "pending",
            "target_pdf_acquired": "complete" if target and target.pdf_path else "pending",
            "target_mineru_parsed": "complete" if target_parsed else ("pending" if target and target.pdf_path else "blocked"),
            "cited_by_expanded": "complete" if cited or state.get("cited_by_expanded") else ("pending" if target_parsed else "blocked_on_target_mineru"),
            "acquisition_terminal": "complete" if (terminal or _worker_file_status in _WORKER_TERMINAL) else ("in_progress" if pdf_job_state == "running" or any(p.acquisition_attempts for p in papers) else "pending"),
            "author_enrichment": "complete" if author_ready else ("in_progress" if queue else "pending"),
            "journal_enrichment": "complete" if journal_ready else ("in_progress" if journal_requests else "pending"),
            "citation_relations": "complete" if (analysis_dir / "citation_relations.json").is_file() else "pending",
            "provider_evidence": "complete" if ((analysis_dir / "provider_evidence.json").is_file() and (not state.get("enrichment_required") or queue_ready or partial_enrichment)) else ("in_progress" if queue else "pending"),
            "report_outputs": "complete" if report_ready else "pending",
        }
        if strict_author_gate and not author_ready:
            state["phase_status"]["author_enrichment"] = "pending"
        return state["phase_status"]
    related = [paper for paper in papers if paper.direction != "target"]
    downloaded = [paper for paper in papers if paper.pdf_path]
    parsed = [paper for paper in downloaded if paper.parse_status == "mineru_parsed"]
    contexts = sum(len(paper.citation_contexts) for paper in papers)
    acquisition_terminal = bool(papers) and all(
        paper.acquisition_state == "acquisition_terminal"
        or paper.pdf_status in ACQUISITION_TERMINAL
        or (paper.pdf_path and paper.parse_status == "mineru_parsed" and paper.pdf_status == "not_attempted")
        for paper in papers
    )
    acquisition_attempted = bool(papers) and all(
        paper.pdf_status != "not_attempted" and bool(paper.acquisition_attempts)
        for paper in papers
    )
    analysis_dir = Path(state.get("task_root") or ".") / "analysis"
    required_analysis = {
        "provider_evidence": analysis_dir / "provider_evidence.json",
        "citation_analysis": analysis_dir / "citation_analysis.md",
        "author_analysis": analysis_dir / "author_analysis.md",
        "synthesis": analysis_dir / "synthesis.md",
    }
    def analysis_ready(name: str, path: Path) -> bool:
        try:
            content = path.read_text(encoding="utf-8")
        except OSError:
            return False
        if name == "provider_evidence":
            try:
                data = json.loads(content)
            except json.JSONDecodeError:
                return False
            rows = data.get("queries") or data.get("providers") or data.get("results") if isinstance(data, dict) else data
            return isinstance(rows, list) and bool(rows)
        return len(clean_text(content)) >= 80

    state["phase_status"] = {
        "identify_target": "complete" if any(p.direction == "target" for p in papers) else "pending",
        "expand_references_and_cited_by": "complete" if related else "complete_no_results",
        "acquire_pdfs": "complete" if acquisition_terminal else ("in_progress" if acquisition_attempted else "pending"),
        "acquisition_terminal": "complete" if acquisition_terminal else ("in_progress" if acquisition_attempted else "pending"),
        "mineru_parse": "complete" if downloaded and len(parsed) == len(downloaded) else ("in_progress" if parsed else ("complete_no_inputs" if acquisition_terminal and not downloaded else "pending")),
        "locate_citation_contexts": "complete" if contexts else ("complete_no_matches" if parsed and len(parsed) == len(downloaded) else ("complete_no_full_text" if acquisition_terminal and not downloaded else "blocked_on_mineru")),
        "analyze_authors": "complete" if analysis_ready("author_analysis", required_analysis["author_analysis"]) else "pending_agent_analysis",
        "cross_provider_verification": "complete" if analysis_ready("provider_evidence", required_analysis["provider_evidence"]) else "pending_agent_analysis",
        "synthesize_report": "complete" if analysis_ready("synthesis", required_analysis["synthesis"]) and analysis_ready("citation_analysis", required_analysis["citation_analysis"]) else "pending_agent_analysis",
    }
    return state["phase_status"]


def finalize_analysis(task: Task, state: dict[str, Any]) -> None:
    papers = merge_pdf_jobs(task, state)
    update_phase_status(state, papers)
    if state.get("workflow_mode") == WORKFLOW_MODE:
        # journal_enrichment and provider_evidence may remain incomplete when we
        # have enough usable data to finalize. Allow finalization if 80% of
        # cited papers have some author facts and some journal metadata.
        required = ("identify_target", "target_pdf_acquired", "target_mineru_parsed", "cited_by_expanded", "acquisition_terminal", "author_enrichment", "citation_relations")
        missing = [name for name in required if state["phase_status"].get(name) != "complete"]
        if missing:
            state["stage"] = "analysis_pending"; task.save(state)
            write_progress(task, state, papers)
            raise ValueError("cannot finalize; incomplete phases: " + ", ".join(missing))
        # Rebuild all deterministic analysis from the final evidence before
        # computing the output fingerprint. No formal file exists during this
        # step, so a crash cannot leave a new-looking stale workbook/report.
        build_simplified_analysis(task, state, papers)
        state["stage"] = "report_building"
        state["papers"] = [asdict(paper) for paper in papers]
        task.save(state)
        data_revision = int(state.get("state_revision") or 0)
        fingerprint = report_data_fingerprint(task, state, papers)
        temp_root = Path(tempfile.mkdtemp(prefix="finalize-", dir=str(task.root / "analysis")))
        try:
            renderer = simplified_report(task, state, papers, output_root=temp_root, write_manifest=False)
            outputs = [temp_root / name for name in ("papers.xlsx", "report.html", "report.pdf")]
            if any(not path.is_file() or path.stat().st_size <= 0 for path in outputs):
                raise RuntimeError("formal output generation did not produce all three artifacts")
            archive_stale_outputs(task)
            for source in outputs:
                source.replace(task.root / source.name)
        finally:
            shutil.rmtree(temp_root, ignore_errors=True)
        missing_pdfs = [paper.key for paper in papers if not paper.pdf_path]
        queue = task.provider_requests()
        degraded_requests = [row.get("request_id") for row in queue if clean_text(row.get("status")) != "succeeded"]
        final_stage = "partial_complete" if missing_pdfs or degraded_requests else "complete"
        generated_at = now()
        files = [{
            "path": path.name, "bytes": path.stat().st_size, "sha256": _file_sha256(path),
        } for path in (task.root / "report.html", task.root / "report.pdf", task.root / "papers.xlsx")]
        manifest = {
            "schema": REPORT_SCHEMA_VERSION, "generated_at": generated_at,
            "state_revision": data_revision, "data_fingerprint": fingerprint,
            "latest_branch_terminal_at": latest_branch_timestamp(task),
            "cited_by_count": sum(p.direction == "cited-by" for p in papers),
            "author_count": len(unique_author_entities(papers)),
            "pdf_terminal_count": sum(p.pdf_status in ACQUISITION_TERMINAL for p in papers),
            "pdf_renderer": renderer, "final_stage": final_stage, "files": files,
        }
        atomic_write_text(task.root / "analysis" / "report_manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        state["stage"] = final_stage
        state["finalized_data_revision"] = data_revision
        state["finalized_at"] = generated_at
        state.setdefault("parallel_jobs", {})["report"] = "final"
        update_phase_status(state, papers)
        task.save(state)
        write_progress(task, state, papers)
        return
    incomplete = {"pending", "in_progress", "blocked_on_mineru", "pending_agent_analysis"}
    missing = [name for name, status in state["phase_status"].items() if status in incomplete]
    terminal = all(
        paper.acquisition_state == "acquisition_terminal"
        or paper.pdf_status in ACQUISITION_TERMINAL
        or (paper.pdf_path and paper.parse_status == "mineru_parsed" and paper.pdf_status == "not_attempted")
        for paper in papers
    )
    parsed_all_downloads = all(
        not paper.pdf_path or paper.parse_status == "mineru_parsed"
        for paper in papers
    )
    if not terminal and "acquisition_terminal" not in missing:
        missing.append("acquisition_terminal")
    if not parsed_all_downloads:
        missing.append("mineru_parse")
    if missing:
        state["stage"] = "analysis_pending"
        task.save(state)
        raise ValueError("cannot finalize; incomplete phases: " + ", ".join(missing))
    state["stage"] = "complete"
    task.save(state)
    report(task, state)


def _strip_illegal_excel_chars(s: str) -> str:
    """Remove characters that openpyxl rejects (control chars except \t\n\r)."""
    import re as _re
    return _re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", s)


def flatten_excel_value(value: Any) -> Any:
    """Keep every workbook cell scalar while retaining nested provenance."""
    if isinstance(value, list):
        return _strip_illegal_excel_chars("; ".join(str(flatten_excel_value(item)) for item in value))
    if isinstance(value, dict):
        return _strip_illegal_excel_chars("; ".join(f"{key}: {flatten_excel_value(item)}" for key, item in value.items()))
    if isinstance(value, str):
        return _strip_illegal_excel_chars(value)
    return value


def author_intro(row: dict[str, Any]) -> str:
    """Render a compact, human-readable author introduction for Excel/report use.

    The structured columns remain the source of truth; this field is deliberately
    deterministic so a reviewer can read an author row without opening nested
    JSON or interpreting internal evidence fields.
    """
    parts = (
        ("职位", row.get("current_title")),
        ("单位", row.get("current_institution")),
        ("国家", public_country(row.get("current_country"))),
        ("研究方向", row.get("research_topics")),
        ("代表论文", row.get("top_works") or row.get("pubmed_representative_papers")),
        ("荣誉/任职", (row.get("honors") or []) + (row.get("appointments") or [])),
    )
    populated = [
        (label, flatten_excel_value(cleaned))
        for label, value in parts
        if (cleaned := public_value(value)) not in (None, "", [], {})
    ]
    return "；".join(f"{label}：{value}" for label, value in populated)


EMPTY_PUBLIC_VALUES = {
    "", "none", "null", "unknown", "not_found", "not found", "not_found_after_search",
    "unconfirmed", "未确认", "未获取", "未知", "暂无", "n/a", "na", "-",
}


def public_value(value: Any) -> Any:
    """Return reader-facing data, leaving internal absence/status markers blank."""
    if isinstance(value, list):
        return [item for item in (public_value(item) for item in value) if item not in (None, "", [])]
    if isinstance(value, dict):
        return {key: item for key, raw in value.items() if (item := public_value(raw)) not in (None, "", [], {})}
    text = clean_text(value)
    return "" if text.lower() in EMPTY_PUBLIC_VALUES else value


COUNTRY_DISPLAY = {
    "cn": "中国", "china": "中国", "pr china": "中国", "people's republic of china": "中国",
    "us": "美国", "usa": "美国", "united states": "美国", "united states of america": "美国",
    "uk": "英国", "gb": "英国", "united kingdom": "英国", "england": "英国",
    "jp": "日本", "japan": "日本", "de": "德国", "germany": "德国",
    "fr": "法国", "france": "法国", "ca": "加拿大", "canada": "加拿大",
    "au": "澳大利亚", "australia": "澳大利亚", "kr": "韩国", "south korea": "韩国",
    "in": "印度", "india": "印度", "it": "意大利", "italy": "意大利",
}


def public_country(value: Any) -> str:
    values = value if isinstance(value, list) else re.split(r"\s*[;,|]\s*", clean_text(value))
    rendered = []
    for item in values:
        text = clean_text(public_value(item))
        if text:
            rendered.append(COUNTRY_DISPLAY.get(text.lower(), text))
    return "; ".join(unique_items(rendered))


def source_urls(value: Any) -> list[str]:
    """Extract stable public evidence links from heterogeneous provider results."""
    urls: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            if key.lower() in {"url", "source_url", "link", "homepage", "orcid_url"}:
                candidate = clean_text(item)
                if candidate.startswith(("http://", "https://")):
                    urls.append(candidate)
            urls.extend(source_urls(item))
    elif isinstance(value, list):
        for item in value:
            urls.extend(source_urls(item))
    else:
        candidate = clean_text(value)
        if candidate.startswith(("http://", "https://")):
            urls.append(candidate)
    return list(dict.fromkeys(urls))


def verified_impact_factor(paper: Paper) -> tuple[Any, Any]:
    """Expose a JIF only when value and a public source are present; year is optional."""
    metric = paper.journal_metric or {}
    value = public_value(metric.get("impact_factor"))
    year = public_value(metric.get("impact_factor_year") or metric.get("metric_year"))
    urls = source_urls(metric.get("source_urls") or metric.get("source_url") or metric.get("metric_source"))
    if value in (None, "") or not urls:
        return "", ""
    # Year is nice-to-have but not mandatory.  Many sources (e.g. ablesci.com)
    # report the latest JIF without explicitly stating which edition year it is
    # from; it can be inferred from publication context.
    return value, year or ""


def author_sources(row: dict[str, Any]) -> list[str]:
    return source_urls(row.get("sources") or row.get("evidence") or row.get("source_urls"))


def reportable_author(row: dict[str, Any]) -> bool:
    substantive = (
        row.get("current_title"), row.get("current_institution"), row.get("current_country"), row.get("research_topics"),
        row.get("honors"), row.get("appointments"), row.get("works_count"),
        row.get("cited_by_count"), row.get("h_index"),
    )
    return bool(any(public_value(value) not in (None, "", [], {}) for value in substantive))


def cited_pdf_filename(paper: Paper) -> str:
    return Path(paper.pdf_path).name if clean_text(paper.pdf_path) else ""


def author_table_row(paper: Paper, author: dict[str, Any]) -> dict[str, Any]:
    """Convert one authorship record into the reader-facing Chinese schema."""
    return {
        "作者": author.get("name", ""),
        "作者角色": author.get("role", ""),
        "对应引文论文": paper.title,
        "当前职位": author.get("current_title", ""),
        "当前单位": author.get("current_institution", ""),
        "当前国家": public_country(author.get("current_country", "")),
        "研究方向": flatten_excel_value(author.get("research_topics")),
        "代表论文": flatten_excel_value(author.get("top_works") or author.get("pubmed_representative_papers")),
        "荣誉/任职": flatten_excel_value((author.get("honors") or []) + (author.get("appointments") or [])),
        "ORCID": author.get("orcid", ""),
        "发文量": author.get("works_count", ""),
        "总被引": author.get("cited_by_count", ""),
        "h-index": author.get("h_index", ""),
        "i10-index": author.get("i10_index", ""),
        "作者介绍": author_intro(author),
        "证据来源": flatten_excel_value(author.get("sources")),
    }


def write_excel(path: Path, sheets: dict[str, list[dict[str, Any]]]) -> None:
    try:
        from openpyxl import Workbook  # type: ignore
    except Exception:
        return
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.worksheet.table import Table, TableStyleInfo
    from openpyxl.chart import BarChart, PieChart, Reference
    book = Workbook(); book.remove(book.active)
    palette = {"navy": "1F4E78", "blue": "D9EAF7", "light": "F7FAFC", "amber": "FFF2CC"}
    for sheet_index, (name, rows) in enumerate(sheets.items(), 1):
        # These legacy helper rows are consumed by the automatic overview only.
        # The current workflow supplies its own reader-facing Chinese overview.
        if name in {"Summary", "Direction Stats", "PDF Stats"}:
            continue
        sheet = book.create_sheet(name[:31]); rows = list(rows)
        fields = list(dict.fromkeys(k for row in rows for k in row)) or ["status"]
        sheet.append(fields)
        for row in rows:
            values = []
            for key in fields:
                value = row.get(key, "")
                values.append(flatten_excel_value(value))
            sheet.append(values)
        sheet.freeze_panes = "A2"; sheet.auto_filter.ref = sheet.dimensions; sheet.sheet_view.showGridLines = False
        sheet.row_dimensions[1].height = 28
        for cell in sheet[1]:
            cell.font = Font(name="Arial", bold=True, color="FFFFFF"); cell.fill = PatternFill("solid", fgColor=palette["navy"]); cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        for row in sheet.iter_rows(min_row=2):
            for cell in row:
                cell.font = Font(name="Arial", size=10, color="1F2937"); cell.alignment = Alignment(vertical="top", wrap_text=False)
        for col in sheet.columns:
            letter = col[0].column_letter
            max_len = min(55, max(len(str(c.value or "")) for c in col) + 2)
            sheet.column_dimensions[letter].width = max(12, max_len)
        if rows:
            ref = f"A1:{sheet.cell(sheet.max_row, sheet.max_column).coordinate}"
            # Chinese sheet names often sanitize to the same empty ASCII
            # fragment. Include the stable sheet index to avoid openpyxl table
            # name collisions across the workbook.
            table = Table(displayName=f"Table_{sheet_index}_{re.sub(r'[^A-Za-z0-9]', '', name)[:16] or 'Data'}", ref=ref)
            table.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showFirstColumn=False, showLastColumn=False, showRowStripes=True, showColumnStripes=False)
            sheet.add_table(table)
    # Legacy callers still receive an Overview sheet.  The cited-by workflow
    # passes ``汇报总览`` directly and therefore must not get a second opaque
    # Overview sheet appended behind the user's eight documented sheets.
    if "汇报总览" not in sheets and "Summary" in sheets:
        summary_index = 1 if "说明" in sheets else 0
        summary = book.create_sheet("Overview", summary_index); summary.sheet_view.showGridLines = False
        summary["A1"] = "ZeroWall Literature 研究摘要"; summary["A1"].font = Font(name="Arial", size=16, bold=True, color=palette["navy"])
        summary["A3"] = "指标"; summary["B3"] = "数值"
        for c in summary[3]: c.font = Font(name="Arial", bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor=palette["navy"])
        summary_rows = sheets.get("Summary", [])
        for i, row in enumerate(summary_rows, 4): summary.cell(i, 1, row.get("指标", "")); summary.cell(i, 2, row.get("数值", ""))
        summary.column_dimensions["A"].width = 30; summary.column_dimensions["B"].width = 18
        direction_rows = sheets.get("Direction Stats", [])
        if direction_rows:
            start = 3; summary.cell(start, 4, "方向"); summary.cell(start, 5, "文章数")
            for i, row in enumerate(direction_rows, start + 1): summary.cell(i, 4, row.get("方向")); summary.cell(i, 5, row.get("文章数"))
            chart = BarChart(); chart.title = "文献网络规模"; chart.y_axis.title = "文章数"; chart.x_axis.title = "方向"; chart.add_data(Reference(summary, min_col=5, min_row=start, max_row=start + len(direction_rows)), titles_from_data=True); chart.set_categories(Reference(summary, min_col=4, min_row=start + 1, max_row=start + len(direction_rows))); chart.height = 7; chart.width = 11; summary.add_chart(chart, "G3")
        status_rows = sheets.get("PDF Stats", [])
        if status_rows:
            start = 10; summary.cell(start, 4, "PDF 状态"); summary.cell(start, 5, "数量")
            for i, row in enumerate(status_rows, start + 1): summary.cell(i, 4, row.get("状态")); summary.cell(i, 5, row.get("数量"))
            chart = PieChart(); chart.title = "PDF 获取状态"; chart.add_data(Reference(summary, min_col=5, min_row=start, max_row=start + len(status_rows)), titles_from_data=True); chart.set_categories(Reference(summary, min_col=4, min_row=start + 1, max_row=start + len(status_rows))); chart.height = 8; chart.width = 11; summary.add_chart(chart, "G18")
        summary.freeze_panes = "A4"
    book.save(path)


def write_report_pdf(path: Path, title: str, lines: list[str]) -> None:
    """Create a local presentation PDF without requiring a browser or network."""
    try:
        from reportlab.lib.colors import HexColor  # type: ignore
        from reportlab.lib.pagesizes import A4  # type: ignore
        from reportlab.pdfbase import pdfmetrics  # type: ignore
        from reportlab.pdfbase.ttfonts import TTFont  # type: ignore
        from reportlab.pdfgen import canvas  # type: ignore
        font = "Helvetica"
        for candidate in (Path("C:/Windows/Fonts/msyh.ttc"), Path("C:/Windows/Fonts/simhei.ttf")):
            if candidate.is_file():
                pdfmetrics.registerFont(TTFont("ZWChinese", str(candidate))); font = "ZWChinese"; break
        c = canvas.Canvas(str(path), pagesize=A4); width, height = A4
        def header() -> float:
            c.setFillColor(HexColor("#15324B")); c.rect(0, height - 92, width, 92, fill=1, stroke=0)
            c.setFillColor(HexColor("#FFFFFF")); c.setFont(font, 18); c.drawString(40, height - 54, title[:48])
            return height - 120
        y = header(); c.setFillColor(HexColor("#243746")); c.setFont(font, 9.5)
        for raw in lines:
            for segment in [raw[i:i + 72] for i in range(0, max(len(raw), 1), 72)]:
                if y < 50: c.showPage(); y = header(); c.setFillColor(HexColor("#243746")); c.setFont(font, 9.5)
                c.drawString(40, y, segment); y -= 15
            y -= 3
        c.save()
    except Exception:
        # Minimal valid PDF fallback; the HTML remains the canonical report.
        payload = b"BT /F1 12 Tf 50 780 Td (ZeroWall Literature report - see report.html) Tj ET"
        objects = [b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n", b"2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n", b"3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>endobj\n", f"4 0 obj<< /Length {len(payload)} >>stream\n".encode() + payload + b"\nendstream endobj\n", b"5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n"]
        data = bytearray(b"%PDF-1.4\n"); offsets = [0]
        for obj in objects: offsets.append(len(data)); data.extend(obj)
        xref = len(data); data.extend(f"xref\n0 {len(objects)+1}\n0000000000 65535 f \n".encode())
        for offset in offsets[1:]: data.extend(f"{offset:010d} 00000 n \n".encode())
        data.extend(f"trailer<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()); path.write_bytes(data)


def render_offline_html_pdf(html_path: Path, pdf_path: Path, title: str, fallback_lines: list[str]) -> str:
    errors: list[str] = []
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
        with sync_playwright() as runtime:
            browser = runtime.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 1000})
            page.goto(html_path.resolve().as_uri(), wait_until="load")
            page.pdf(path=str(pdf_path), format="A4", print_background=True, margin={"top": "10mm", "right": "9mm", "bottom": "10mm", "left": "9mm"})
            browser.close()
        if pdf_path.is_file() and pdf_path.stat().st_size > 10_000:
            return "playwright_chromium"
    except Exception as exc:
        errors.append(f"playwright:{type(exc).__name__}:{clean_text(exc)}")
    candidates = [
        Path(os.getenv("CHROME_PATH", "")), Path(os.getenv("EDGE_PATH", "")),
        Path("C:/Program Files/Microsoft/Edge/Application/msedge.exe"),
        Path("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
        Path("C:/Program Files/Google/Chrome/Application/chrome.exe"),
        Path("C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"),
    ]
    candidates = list(dict.fromkeys(path.resolve() for path in candidates if str(path) and path.is_file()))
    for attempt in range(1, MAX_ATTEMPTS + 1):
        for executable in candidates:
            profile = Path(tempfile.mkdtemp(prefix="zw-literature-chromium-"))
            try:
                command = [
                    str(executable), "--headless=new", "--disable-gpu", "--no-first-run",
                    "--disable-extensions", f"--user-data-dir={profile}",
                    f"--print-to-pdf={pdf_path.resolve()}", "--no-pdf-header-footer",
                    html_path.resolve().as_uri(),
                ]
                completed = subprocess.run(command, capture_output=True, text=True, timeout=180, check=False)
                if completed.returncode == 0 and pdf_path.is_file() and pdf_path.stat().st_size > 10_000:
                    return f"chromium_cli:{executable.name}"
                errors.append(f"{executable.name}:{completed.returncode}:{clean_text(completed.stderr)[-200:]}")
            except Exception as exc:
                errors.append(f"{executable.name}:{type(exc).__name__}:{clean_text(exc)}")
            finally:
                shutil.rmtree(profile, ignore_errors=True)
        if attempt < MAX_ATTEMPTS:
            time.sleep(min(2 ** (attempt - 1), 8))
    raise RuntimeError("full HTML-to-PDF rendering failed after retries: " + " | ".join(errors[-8:]))


def build_simplified_analysis(task: Task, state: dict[str, Any], papers: list[Paper]) -> None:
    """Persist metadata-level cited-by, author, journal, and provider evidence."""
    analysis = task.root / "analysis"; analysis.mkdir(exist_ok=True)
    # Rebuild journal metrics from receipts so legacy cross-journal values do
    # not survive merely because they were already serialized in state.json.
    replay_state = {"papers": [asdict(paper) | {"journal_metric": {}} for paper in papers]}
    inbox = analysis / "evidence_inbox.jsonl"
    try:
        for line in inbox.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            item = json.loads(line)
            request = item.get("request") or {}
            if request.get("kind") == "journal":
                apply_journal_evidence_to_state(replay_state, request, item.get("result"))
            elif request.get("kind") == "metadata" and request.get("tool") == "pubmed_fetch_articles":
                apply_pubmed_metadata_to_state(replay_state, item.get("result"))
    except (OSError, json.JSONDecodeError):
        pass
    replayed = {clean_text(row.get("key")): row for row in replay_state["papers"]}
    for paper in papers:
        replay_row = replayed.get(paper.key, {})
        paper.journal_metric = replay_row.get("journal_metric") or {}
        for key in ("journal", "journal_abbrev", "volume", "issue", "pages"):
            value = clean_text(replay_row.get(key))
            if value:
                setattr(paper, key, value)
        paper.issn = list(dict.fromkeys(
            clean_text(value) for value in replay_row.get("issn") or [] if clean_text(value)
        ))
        if isinstance(replay_row.get("raw"), dict):
            paper.raw = replay_row["raw"]
    target = target_from_papers(papers)
    target_text = paper_text(target)
    target.raw["mineru_excerpt"] = clean_text(target_text)[:12000]
    target_terms = sorted(title_tokens(target.raw["mineru_excerpt"]))[:200]
    (analysis / "target_mineru_analysis.json").write_text(json.dumps({
        "paper": target.key, "full_md": target.parsed_text_path,
        "character_count": len(target_text), "comparison_terms": target_terms,
        "generated_at": now(),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    relations = []
    provider_counts = {}
    _cbc = target.cited_by_counts if isinstance(target.cited_by_counts, dict) else {}
    provider_counts = {
        "openalex": _cbc.get("openalex"),
        "semantic_scholar": _cbc.get("semantic_scholar"),
        "crossref": _cbc.get("crossref"),
        "pubmed_cited_in": _cbc.get("pubmed_cited_in"),
        "europepmc": _cbc.get("europepmc"),
    }
    provider_counts = {key: value for key, value in provider_counts.items() if value is not None}
    target.provider_counts = provider_counts
    journals = []
    for paper in papers:
        journals.append({"paper": paper.key, **journal_metadata(paper)})
        if paper.direction == "cited-by":
            paper.citation_relation = citation_relation(target, paper)
            paper.citation_sources = paper.raw.get("citation_sources") or [{"provider": paper.raw.get("citation_source") or paper.source, "cited": True}]
            relations.append(paper.citation_relation)
            paper.parse_status = "not_required"
            paper.citation_contexts = []
    (analysis / "citation_relations.json").write_text(json.dumps(relations, ensure_ascii=False, indent=2), encoding="utf-8")
    (analysis / "citation_provider_counts.json").write_text(json.dumps({"target": target.key, "counts": provider_counts, "retrieved_unique_citing_papers": len(relations), "generated_at": now()}, ensure_ascii=False, indent=2), encoding="utf-8")
    (analysis / "journal_evidence.json").write_text(json.dumps(journals, ensure_ascii=False, indent=2), encoding="utf-8")
    records = enrich_all_authors(task, papers)
    # ── Backfill enriched author records onto each Paper so that
    # simplified_report (which reads paper.author_records) gets the full
    # evidence without a second enrich pass. ──────────────────────────────
    _ae_by_eid:  dict[str, dict[str, Any]] = {}
    _ae_by_name: dict[str, dict[str, Any]] = {}
    for _rec in records:
        _eid = clean_text(_rec.get("author_entity_id", "")).lower()
        _nm  = clean_text(_rec.get("name", "")).lower()
        if _eid: _ae_by_eid[_eid]  = _rec
        if _nm:  _ae_by_name[_nm]  = _rec
    _BACKFILL_FIELDS = (
        "current_title", "current_institution", "current_country",
        "research_topics", "honors", "appointments",
        "h_index", "cited_by_count", "works_count",
        "orcid", "sources", "openalex_author_id", "evidence_status", "top_works",
    )
    for _paper in papers:
        if _paper.direction != "cited-by":
            continue
        new_author_records: list[dict[str, Any]] = []
        for _ar in _author_base_records(_paper):
            _eid = clean_text(_ar.get("author_entity_id", "")).lower()
            _nm  = clean_text(_ar.get("name", "")).lower()
            _ev  = _ae_by_eid.get(_eid) or _ae_by_name.get(_nm) or {}
            if _ev:
                _merged = dict(_ar)
                for _field in _BACKFILL_FIELDS:
                    _v = _ev.get(_field)
                    if _v not in (None, "", [], {}):
                        _merged[_field] = _v
                new_author_records.append(_merged)
            else:
                new_author_records.append(_ar)
        _paper.author_records = new_author_records
    entities = unique_author_entities(papers)
    (analysis / "author_entities.json").write_text(json.dumps(entities, ensure_ascii=False, indent=2), encoding="utf-8")
    (analysis / "authorships.json").write_text(json.dumps([{"author_entity_id": row.get("author_entity_id"), "paper": row.get("paper"), "name": row.get("name"), "role": row.get("role")} for row in records], ensure_ascii=False, indent=2), encoding="utf-8")
    author_lines = ["# 引文作者资料", "", "仅整理引用目标论文之文献的作者公开资料；空字段不输出。", ""]
    for row in records:
        details = author_intro(row)
        papers_for_author = flatten_excel_value(row.get("associated_papers"))
        suffix = "；".join(value for value in (f"对应引文：{papers_for_author}" if papers_for_author else "", details) if value)
        author_lines.append(f"- {row['name']}" + (f"：{suffix}。" if suffix else ""))
    (analysis / "author_analysis.md").write_text("\n".join(author_lines) + "\n", encoding="utf-8")
    provider_path = analysis / "provider_evidence.json"
    try:
        provider_document = json.loads(provider_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        provider_document = {}
    if not isinstance(provider_document, dict):
        provider_document = {"queries": provider_document if isinstance(provider_document, list) else []}
    provider_document["generated_at"] = now()
    provider_document["mcp_receipts"] = task.mcp_receipts()
    provider_document["web_search_receipts"] = task.web_search_receipts()
    provider_path.write_text(json.dumps(provider_document, ensure_ascii=False, indent=2), encoding="utf-8")
    # NOTE: state["papers"] is serialised AFTER the author_records backfill
    # loop above so that the enriched records are preserved in state.json.
    state["papers"] = [asdict(p) for p in papers]


def build_metadata_analysis(task: Task, state: dict[str, Any], papers: list[Paper]) -> None:
    """Build the report's citation/journal layer before author evidence arrives.

    This deliberately does not call ``enrich_all_authors``.  Author searches are
    owned by the Host capability queue and may still be running while the
    metadata-ready report is displayed.
    """
    analysis = task.root / "analysis"; analysis.mkdir(exist_ok=True)
    target = target_from_papers(papers)
    target_text = paper_text(target)
    target.raw["mineru_excerpt"] = clean_text(target_text)[:12000]
    target.provider_counts = {key: value for key, value in {
        "openalex": target.cited_by_counts.get("openalex"), "semantic_scholar": target.cited_by_counts.get("semantic_scholar"),
        "crossref": target.cited_by_counts.get("crossref"), "pubmed_cited_in": target.cited_by_counts.get("pubmed_cited_in"),
        "europepmc": target.cited_by_counts.get("europepmc"),
    }.items() if value is not None}
    relations = []
    journals = []
    for paper in papers:
        journals.append({"paper": paper.key, **journal_metadata(paper)})
        if paper.direction == "cited-by":
            paper.citation_relation = citation_relation(target, paper)
            paper.citation_sources = paper.raw.get("citation_sources") or [{"provider": paper.raw.get("citation_source") or paper.source, "cited": True}]
            relations.append(paper.citation_relation); paper.parse_status = "not_required"; paper.citation_contexts = []
    (analysis / "target_mineru_analysis.json").write_text(json.dumps({"paper": target.key, "full_md": target.parsed_text_path, "character_count": len(target_text), "generated_at": now()}, ensure_ascii=False, indent=2), encoding="utf-8")
    (analysis / "citation_relations.json").write_text(json.dumps(relations, ensure_ascii=False, indent=2), encoding="utf-8")
    (analysis / "citation_provider_counts.json").write_text(json.dumps({"target": target.key, "counts": target.provider_counts, "retrieved_unique_citing_papers": len(relations), "generated_at": now()}, ensure_ascii=False, indent=2), encoding="utf-8")
    (analysis / "journal_evidence.json").write_text(json.dumps(journals, ensure_ascii=False, indent=2), encoding="utf-8")
    state["papers"] = [asdict(p) for p in papers]


def simplified_report(task: Task, state: dict[str, Any], papers: list[Paper], *, output_root: Path | None = None, write_manifest: bool = True) -> str:
    output_root = (output_root or task.root).resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    target = target_from_papers(papers)
    cited = [paper for paper in papers if paper.direction == "cited-by"]
    target_author_keys = {author_entity_key(name, "") for name in target.authors if clean_text(name)}

    legacy_root = task.root / "analysis" / "legacy-output"
    for old in (
        output_root / "report_academic.html",
        output_root / "report.md",
        output_root / "report_manifest.json",
        output_root / "report-assets",
    ):
        if not old.exists():
            continue
        legacy_root.mkdir(parents=True, exist_ok=True)
        destination = legacy_root / old.name
        if destination.exists():
            destination = legacy_root / f"{old.stem}-{int(time.time())}{old.suffix}"
        shutil.move(str(old), str(destination))

    author_profiles: dict[str, dict[str, Any]] = {}
    author_papers: dict[str, list[str]] = {}
    for paper in cited:
        for author in paper.author_records:
            if author_entity_key(author.get("name", ""), "") in target_author_keys:
                continue
            key = author.get("author_entity_id") or author_entity_id(
                author.get("name", ""), clean_text(author.get("orcid"))
            )
            profile = author_profiles.setdefault(key, dict(author))
            author_papers.setdefault(key, []).append(paper.title)
            for field in (
                "aliases", "honors", "appointments", "research_topics",
                "sources", "top_works", "pubmed_representative_papers",
            ):
                existing = profile.get(field) or []
                incoming = author.get(field) or []
                if not isinstance(existing, list):
                    existing = [existing]
                if not isinstance(incoming, list):
                    incoming = [incoming]
                merged = unique_items(existing + incoming)
                # Clean honors/appointments: use shared rescue logic so noisy
                # snippets have named awards extracted instead of being dropped.
                if field in ("honors", "appointments"):
                    cleaned: list[str] = []
                    for h in merged:
                        for item in clean_honor_entry(h):
                            if item and item not in cleaned:
                                cleaned.append(item)
                    merged = cleaned
                profile[field] = merged
            for field in (
                "current_title", "current_institution", "current_country", "orcid", "works_count",
                "cited_by_count", "h_index",
            ):
                if not public_value(profile.get(field)) and public_value(author.get(field)):
                    profile[field] = author[field]
    unique_authors = list(author_profiles.values())
    for profile in unique_authors:
        key = profile.get("author_entity_id") or author_entity_id(
            profile.get("name", ""), clean_text(profile.get("orcid"))
        )
        profile["papers"] = list(dict.fromkeys(author_papers.get(key, [])))

    # ── Merge author_evidence.json into profiles ──────────────────────────────
    # author_evidence.json is written by enrich_all_authors() and contains
    # current_title, research_topics, honors, h_index, etc. gathered from
    # OpenAlex + web search.  paper.author_records only carries publication-
    # time snapshot data (name, affiliation at publication), so we must merge
    # the richer evidence file here to populate the report and Excel correctly.
    _ae_path = task.root / "analysis" / "author_evidence.json"
    try:
        _ae_records: list[dict[str, Any]] = json.loads(
            _ae_path.read_text(encoding="utf-8")
        )
    except (OSError, json.JSONDecodeError):
        _ae_records = []
    if _ae_records:
        # Build lookup by author_entity_id (primary) and normalised name (fallback)
        _ae_by_eid:  dict[str, dict[str, Any]] = {}
        _ae_by_name: dict[str, dict[str, Any]] = {}
        for _ae_rec in _ae_records:
            _ae_eid = clean_text(_ae_rec.get("author_entity_id", "")).lower()
            _ae_nm  = clean_text(_ae_rec.get("name", "")).lower()
            if _ae_eid: _ae_by_eid[_ae_eid]  = _ae_rec
            if _ae_nm:  _ae_by_name[_ae_nm]   = _ae_rec
        _AE_SCALAR_FIELDS = (
            "current_title", "current_institution", "current_country",
            "works_count", "cited_by_count", "h_index", "orcid",
            "openalex_author_id", "evidence_status", "profile_cache_dir",
        )
        _AE_LIST_FIELDS = (
            "research_topics", "honors", "appointments",
            "aliases", "sources", "top_works", "profile_sources",
        )
        for _profile in unique_authors:
            _p_eid = clean_text(_profile.get("author_entity_id", "")).lower()
            _p_nm  = clean_text(_profile.get("name", "")).lower()
            _ae    = _ae_by_eid.get(_p_eid) or _ae_by_name.get(_p_nm)
            if not _ae:
                continue
            # Scalar fields: prefer non-empty existing value; fill from evidence
            for _sf in _AE_SCALAR_FIELDS:
                if not public_value(_profile.get(_sf)) and public_value(_ae.get(_sf)):
                    _profile[_sf] = _ae[_sf]
            # List fields: union-merge, clean honors/appointments
            for _lf in _AE_LIST_FIELDS:
                _exist = _profile.get(_lf) or []
                _inc   = _ae.get(_lf) or []
                if not isinstance(_exist, list): _exist = [_exist]
                if not isinstance(_inc,   list): _inc   = [_inc]
                _merged = unique_items(_exist + _inc)
                if _lf in ("honors", "appointments"):
                    _cleaned: list[str] = []
                    for _h in _merged:
                        for _item in clean_honor_entry(_h):
                            if _item and _item not in _cleaned:
                                _cleaned.append(_item)
                    _merged = _cleaned
                if _merged:
                    _profile[_lf] = _merged

    # ── Inject verified author data from external verified_data.json ─────────
    # Loads task-level overrides first, then skill-level shared defaults.
    # Edit <task>/analysis/verified_data.json for task-specific corrections;
    # edit scripts/verified_data.json for shared cross-task corrections.
    _vd_authors = load_verified_data(task.root).get("authors", {})

    # Build a normalised lookup: collapse all Unicode dash/hyphen variants to
    # ASCII hyphen so "Marja‐Riitta" (U+2010) matches "Marja-Riitta" etc.
    _DASH_RX = re.compile(r"[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\ufe58\ufe63\uff0d]")
    def _norm_name(s: str) -> str:
        return _DASH_RX.sub("-", s or "").strip()

    _vd_norm: dict[str, dict] = {_norm_name(k): v for k, v in _vd_authors.items()}

    for profile in unique_authors:
        name = profile.get("name", "")
        vd = _vd_authors.get(name) or _vd_norm.get(_norm_name(name))
        if vd:
            if vd.get("honors") is not None:
                profile["honors"] = vd["honors"]
            if vd.get("appointments") is not None:
                profile["appointments"] = vd["appointments"]
            if vd.get("current_title"):
                profile["current_title"] = vd["current_title"]
    # ── End verified author injection ─────────────────────────────────────────

    def author_score(row: dict[str, Any]) -> float:
        def number(field: str) -> float:
            try:
                return float(row.get(field) or 0)
            except (TypeError, ValueError):
                return 0
        return (
            number("cited_by_count")
            + 20 * number("h_index")
            + 3 * number("works_count")
            + 25 * len(row.get("papers") or [])
            + 10 * len(row.get("honors") or [])
        )

    influential = sorted(
        (row for row in unique_authors if reportable_author(row)),
        key=author_score,
        reverse=True,
    )[:12]
    years: dict[str, int] = {}
    journals: dict[str, int] = {}
    countries: dict[str, int] = {}
    institutions: dict[str, int] = {}
    positions: dict[str, int] = {}
    for paper in cited:
        if public_value(paper.year):
            years[str(paper.year)] = years.get(str(paper.year), 0) + 1
        if public_value(paper.journal):
            journals[paper.journal] = journals.get(paper.journal, 0) + 1
    for profile in unique_authors:
        country = public_country(profile.get("current_country"))
        institution = clean_text(public_value(profile.get("current_institution")))
        position = clean_text(public_value(profile.get("current_title")))
        if country:
            countries[country] = countries.get(country, 0) + 1
        if institution:
            institutions[institution] = institutions.get(institution, 0) + 1
        if position:
            positions[position] = positions.get(position, 0) + 1

    citation_columns = [
        "目标文章题目", "引用杂志全名", "引用杂志缩写", "最新影响因子", "影响因子年份",
        "引文题目", "自引/他引", "引文类型", "Book Authors", "Book Editors",
        "Group Authors", "引文作者全名", "作者所属机构", "作者所属国家", "作者头衔",
        "作者荣誉/任职", "发表期卷", "DOI", "PDF文件名",
    ]
    citation_rows: list[dict[str, Any]] = []
    for paper in cited:
        visible_authors = [
            row for row in paper.author_records
            if author_entity_key(row.get("name", ""), "") not in target_author_keys
        ]
        names = [clean_text(row.get("name")) for row in visible_authors if clean_text(row.get("name"))]
        if not names:
            names = [
                name for name in paper.authors
                if author_entity_key(name, "") not in target_author_keys
            ]
        institutions_for_paper = [
            clean_text(public_value(row.get("current_institution")))
            for row in visible_authors
        ]
        countries_for_paper = [
            public_country(row.get("current_country"))
            for row in visible_authors
        ]
        titles_for_paper = [
            clean_text(public_value(row.get("current_title"))) for row in visible_authors
        ]
        honors_for_paper = [
            flatten_excel_value(public_value((row.get("honors") or []) + (row.get("appointments") or [])))
            for row in visible_authors
        ]
        impact, impact_year = verified_impact_factor(paper)
        self_citation = clean_text((paper.citation_relation or {}).get("self_citation"))
        row = {
            "目标文章题目": target.title,
            "引用杂志全名": public_value(paper.journal),
            "引用杂志缩写": public_value(paper.journal_abbrev),
            "最新影响因子": impact,
            "影响因子年份": impact_year,
            "引文题目": paper.title,
            "自引/他引": {"full": "自引", "partial": "部分自引", "no": "他引"}.get(self_citation, ""),
            "引文类型": public_value(paper.publication_type or (paper.citation_relation or {}).get("citation_type")),
            "Book Authors": "; ".join(paper.book_authors),
            "Book Editors": "; ".join(paper.book_editors),
            "Group Authors": "; ".join(paper.group_authors),
            "引文作者全名": "; ".join(dict.fromkeys(names)),
            "作者所属机构": "; ".join(dict.fromkeys(value for value in institutions_for_paper if value)),
            "作者所属国家": "; ".join(dict.fromkeys(value for value in countries_for_paper if value)),
            "作者头衔": "; ".join(dict.fromkeys(value for value in titles_for_paper if value)),
            "作者荣誉/任职": "; ".join(dict.fromkeys(value for value in honors_for_paper if value)),
            "发表期卷": " ".join(value for value in (paper.volume, paper.issue, paper.pages) if value),
            "DOI": paper.doi,
            "PDF文件名": cited_pdf_filename(paper),
        }
        citation_rows.append({column: row.get(column, "") for column in citation_columns})

    author_columns = [
        "姓名", "别名", "ORCID", "对应引文论文", "当前职位", "当前单位", "当前国家", "研究方向", "代表论文", "发文量",
        "总被引", "h-index", "荣誉/奖项/学术任职", "作者介绍", "HTML缓存目录",
    ]
    author_rows: list[dict[str, Any]] = []
    for profile in sorted(unique_authors, key=author_score, reverse=True):
        # 作者介绍: profile_sources (identity-confirmed page URLs) first,
        # then other source URLs; each link on its own line for readability.
        _intro_links: list[str] = []
        for _url in (profile.get("profile_sources") or []):
            _u = clean_text(_url)
            if _u.startswith(("http://", "https://")) and _u not in _intro_links:
                _intro_links.append(_u)
        for _url in author_sources(profile):
            if _url not in _intro_links:
                _intro_links.append(_url)
        _intro_cell = "\n".join(_intro_links)
        # HTML缓存目录: make the absolute path relative to the task root so
        # the spreadsheet travels with the analysis folder.
        _cache_abs = clean_text(profile.get("profile_cache_dir"))
        _cache_rel = ""
        if _cache_abs:
            try:
                _cache_rel = str(Path(_cache_abs).relative_to(task.root))
            except ValueError:
                _cache_rel = _cache_abs  # already relative or different drive
        row = {
            "姓名": profile.get("name", ""),
            "别名": flatten_excel_value(public_value(profile.get("aliases"))),
            "ORCID": public_value(profile.get("orcid")),
            "对应引文论文": "；".join(profile.get("papers") or []),
            "当前职位": public_value(profile.get("current_title")),
            "当前单位": public_value(profile.get("current_institution")),
            "当前国家": public_country(profile.get("current_country")),
            "研究方向": flatten_excel_value(public_value(profile.get("research_topics"))),
            "代表论文": flatten_excel_value(public_value(profile.get("top_works") or profile.get("pubmed_representative_papers"))),
            "发文量": public_value(profile.get("works_count")),
            "总被引": public_value(profile.get("cited_by_count")),
            "h-index": public_value(profile.get("h_index")),
            "荣誉/奖项/学术任职": flatten_excel_value(public_value((profile.get("honors") or []) + (profile.get("appointments") or []))),
            "作者介绍": _intro_cell,
            "HTML缓存目录": _cache_rel,
        }
        author_rows.append({column: row.get(column, "") for column in author_columns})
    write_excel(
        output_root / "papers.xlsx",
        {
            "引文列表": citation_rows or [{column: "" for column in citation_columns}],
            "作者列表": author_rows or [{column: "" for column in author_columns}],
        },
    )

    esc = html_lib.escape

    def display(value: Any) -> str:
        value = public_value(value)
        if value in (None, "", [], {}):
            return ""
        return flatten_excel_value(value) if isinstance(value, (list, dict)) else clean_text(value)

    def chart_bars(
        values: dict[str, int], *, chronological: bool = False, limit: int = 10, tone: str = "teal"
    ) -> str:
        if not values:
            return ""
        if chronological:
            items = sorted(values.items(), key=lambda item: int(item[0]) if str(item[0]).isdigit() else 9999)
        else:
            items = sorted(values.items(), key=lambda item: (-item[1], item[0].lower()))[:limit]
        maximum = max(count for _, count in items) or 1
        rows = []
        for name, count in items:
            width = max(2, round(count / maximum * 100))
            rows.append(
                f'<div class="hbar" title="{esc(name)}：{count}"><span>{esc(name)}</span>'
                f'<i><em class="{tone}" style="width:{width}%"></em></i><b>{count}</b></div>'
            )
        return "".join(rows)

    def chart_panel(
        title: str,
        values: dict[str, int],
        *,
        chronological: bool = False,
        tone: str = "teal",
        empty_note: str = "",
    ) -> str:
        """Render one statistic panel.

        A dimension with no verifiable data still keeps its section so every
        report carries the same structure; the gap is stated explicitly instead
        of silently dropping the heading.
        """
        body = chart_bars(values, chronological=chronological, tone=tone)
        if not body:
            if not empty_note:
                return ""
            return (
                f'<section class="chart-panel"><h3>{esc(title)}</h3>'
                f'<p class="chart-empty">{esc(empty_note)}</p></section>'
            )
        return f'<section class="chart-panel"><h3>{esc(title)}</h3><div class="chart">{body}</div></section>'

    def table(headers: list[str], rows: list[list[Any]], *, css_class: str = "") -> str:
        if not rows:
            return ""
        head = "".join(f"<th>{esc(str(value))}</th>" for value in headers)
        body = "".join(
            "<tr>" + "".join(f"<td>{esc(display(value))}</td>" for value in row) + "</tr>"
            for row in rows
        )
        return f'<div class="table-wrap"><table class="{css_class}"><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'

    def research_terms(value: Any) -> list[str]:
        raw_values = value if isinstance(value, list) else [value]
        terms: list[str] = []
        for raw_value in raw_values:
            if isinstance(raw_value, dict):
                raw_value = raw_value.get("display_name") or raw_value.get("name") or raw_value.get("topic") or ""
            for term in re.split(r"[;；|、]", clean_text(raw_value)):
                term = term.strip(" ,，。")
                if 1 < len(term) <= 80:
                    terms.append(term)
        return list(dict.fromkeys(terms))

    def position_group(value: Any) -> str:
        text = clean_text(value).lower()
        if not text:
            return ""
        if any(token in text for token in ("academician", "academy member", "院士", "fellow")):
            return "院士 / 会士"
        if any(token in text for token in ("professor", "教授")):
            return "教授"
        if any(token in text for token in ("director", "chair", "head", "dean", "president", "主任", "院长", "负责人")):
            return "主任 / 负责人"
        if any(token in text for token in ("researcher", "investigator", "scientist", "研究员", "科学家")):
            return "研究人员"
        if any(token in text for token in ("physician", "doctor", "clinical", "医师", "医生")):
            return "临床 / 医师"
        return "其他现职"

    citation_provider_labels = {
        "openalex": "OpenAlex", "semantic_scholar": "Semantic Scholar", "crossref": "Crossref",
        "pubmed_cited_in": "PubMed", "europepmc": "Europe PMC",
    }

    def paper_citation_metric(paper: Paper) -> tuple[int | None, str]:
        for provider in ("openalex", "semantic_scholar", "crossref", "pubmed_cited_in", "europepmc"):
            value = paper.cited_by_counts.get(provider)
            if value not in (None, ""):
                try:
                    return int(value), citation_provider_labels[provider]
                except (TypeError, ValueError):
                    continue
        return None, ""

    topic_counts: dict[str, int] = {}
    position_groups: dict[str, int] = {}
    for profile in unique_authors:
        for topic in research_terms(profile.get("research_topics")):
            topic_counts[topic] = topic_counts.get(topic, 0) + 1
        group = position_group(profile.get("current_title"))
        if group:
            position_groups[group] = position_groups.get(group, 0) + 1

    self_citation_counts: dict[str, int] = {}
    publication_types: dict[str, int] = {}
    for paper in cited:
        self_value = clean_text((paper.citation_relation or {}).get("self_citation"))
        self_label = {"full": "自引", "partial": "部分自引", "no": "他引"}.get(self_value, "")
        if self_label:
            self_citation_counts[self_label] = self_citation_counts.get(self_label, 0) + 1
        publication_type = display(paper.publication_type or (paper.citation_relation or {}).get("citation_type"))
        if publication_type:
            publication_types[publication_type] = publication_types.get(publication_type, 0) + 1

    # ── Inject verified JIF values from external verified_data.json ───────────
    # Task-level <task>/analysis/verified_data.json wins; skill-level fills gaps.
    _vd_jif = load_verified_data(task.root).get("jif", {})
    for paper in cited:
        jname = paper.journal or ""
        key = _jif_key(jname)
        hit_raw = _vd_jif.get(key)
        if not hit_raw:
            # partial prefix match on first 4 words
            words = key.split()[:4]
            prefix = " ".join(words)
            for k, v in _vd_jif.items():
                if k.startswith(prefix):
                    hit_raw = v
                    break
        if hit_raw and not (paper.journal_metric or {}).get("impact_factor"):
            paper.journal_metric = {
                **(paper.journal_metric or {}),
                "impact_factor": hit_raw[0],
                "impact_factor_year": hit_raw[1],
                "metric_type": "jcr_impact_factor",
                "source_url": hit_raw[2],
                "metric_source": "verified_data_json",
            }
    # ── End JIF injection ────────────────────────────────────────────────────

    journal_rows: list[list[Any]] = []
    verified_jif_count = 0
    for name, count in sorted(journals.items(), key=lambda item: (-item[1], item[0].lower())):
        journal_papers = [paper for paper in cited if paper.journal == name]
        representative = journal_papers[0]
        metric_paper = next((paper for paper in journal_papers if any(verified_impact_factor(paper))), representative)
        impact, impact_year = verified_impact_factor(metric_paper)
        if impact not in (None, "") and impact_year not in (None, ""):
            verified_jif_count += 1
        journal_rows.append([
            name, representative.journal_abbrev, count, f"{count / max(1, len(cited)):.1%}",
            impact, impact_year,
        ])
    has_verified_jif = verified_jif_count > 0
    if not has_verified_jif:
        journal_rows = [row[:4] for row in journal_rows]
    journal_headers = ["引用期刊", "期刊缩写", "引文数", "占比"]
    if has_verified_jif:
        journal_headers += ["最新影响因子", "指标年份"]

    top_papers = sorted(
        cited,
        key=lambda paper: (paper_citation_metric(paper)[0] or -1, clean_text(paper.year)),
        reverse=True,
    )[:20]
    has_paper_citation_metrics = any(paper_citation_metric(paper)[0] is not None for paper in top_papers)
    paper_headers = ["引文题目", "引用期刊 / 年份", "引文作者"]
    if has_paper_citation_metrics:
        paper_headers.append("该引文被引")
    paper_rows = []
    for paper in top_papers:
        metric_value, _metric_provider = paper_citation_metric(paper)
        visible_names = [
            name for name in paper.authors
            if author_entity_key(name, "") not in target_author_keys
        ]
        journal_year = " · ".join(value for value in (paper.journal, paper.year) if value)
        row = [paper.title, journal_year, "；".join(visible_names)]
        if has_paper_citation_metrics:
            row.append(metric_value if metric_value is not None else "")
        paper_rows.append(row)

    author_rows_html = []
    for row in influential:
        bibliometrics = []
        if public_value(row.get("works_count")) not in (None, ""):
            bibliometrics.append(f"发文 {row.get('works_count')}")
        if public_value(row.get("cited_by_count")) not in (None, ""):
            bibliometrics.append(f"总被引 {row.get('cited_by_count')}")
        if public_value(row.get("h_index")) not in (None, ""):
            bibliometrics.append(f"h-index {row.get('h_index')}")
        # Name column: name only (title is a separate column)
        name_col = display(row.get("name"))
        # Current title: independent column — show the primary title
        title_col = display(row.get("current_title"))
        institution_country = "；".join(filter(None, (
            display(row.get("current_institution")), public_country(row.get("current_country")),
        )))
        bibliometrics_col = "；".join(bibliometrics)
        # Honors/appointments: ALL clean items, using shared rescue logic.
        # We de-duplicate across honors + appointments lists so multiple
        # entries from search payloads collapse into a clean unique set.
        raw_honors = unique_items((row.get("honors") or []) + (row.get("appointments") or []))
        cleaned_honors: list[str] = []
        for h in raw_honors:
            for item in clean_honor_entry(h):
                if item and item not in cleaned_honors:
                    cleaned_honors.append(item)
        honors_col = "；".join(cleaned_honors)
        author_rows_html.append([
            name_col, title_col, institution_country,
            "；".join(research_terms(row.get("research_topics"))[:5]),
            "；".join(row.get("papers") or []),
            bibliometrics_col, honors_col,
        ])

    def author_report_summary(row: dict[str, Any]) -> str:
        metrics = []
        if public_value(row.get("cited_by_count")) not in (None, ""):
            metrics.append(f"总被引 {row.get('cited_by_count')}")
        if public_value(row.get("h_index")) not in (None, ""):
            metrics.append(f"h-index {row.get('h_index')}")
        # Collect ALL clean honors/appointments using shared rescue logic
        raw_honors = unique_items((row.get("honors") or []) + (row.get("appointments") or []))
        all_clean: list[str] = []
        for h in raw_honors:
            for item in clean_honor_entry(h):
                if item and item not in all_clean:
                    all_clean.append(item)
        parts = [
            display(row.get("current_title")),
            display(row.get("current_institution")),
            public_country(row.get("current_country")),
            "研究方向：" + "；".join(research_terms(row.get("research_topics"))[:3])
            if research_terms(row.get("research_topics")) else "",
            "，".join(metrics),
        ]
        summary = "；".join(part for part in parts if part)
        if all_clean:
            honors_text = "荣誉/任职：" + " | ".join(all_clean)
            summary = summary + "；" + honors_text if summary else honors_text
        return summary

    author_highlights = "".join(
        f'<article class="author-card"><div class="author-rank">{index:02d}</div><div><h3>{esc(clean_text(row.get("name")))}</h3>'
        f'<p>{esc(author_report_summary(row))}</p><small>对应引文：{esc("；".join(row.get("papers") or []))}</small></div></article>'
        for index, row in enumerate(influential[:6], 1)
    )
    metadata = " · ".join(filter(None, (
        clean_text(target.journal), clean_text(target.year), f"DOI {target.doi}" if target.doi else "",
    )))
    numeric_years = sorted(int(year) for year in years if str(year).isdigit())
    year_span = (
        str(numeric_years[0]) if len(numeric_years) == 1
        else f"{numeric_years[0]}–{numeric_years[-1]}" if numeric_years else "—"
    )
    headline_metrics = [
        (len(cited), "去重后的 cited-by 引文"),
        (len(journals), "引用期刊"),
        (len(unique_authors), "引文作者"),
        (year_span, "引文发表跨度"),
        (len(countries), "作者国家 / 地区"),
        (len(institutions), "作者当前机构"),
    ]
    metric_strip = "".join(
        f'<div><b>{esc(str(value))}</b><span>{esc(label)}</span></div>' for value, label in headline_metrics
    )
    overview_parts = [
        f"共检索并去重 {len(cited)} 篇引用目标论文的文献",
        f"分布于 {len(journals)} 本期刊" if journals else "",
        f"涉及 {len(unique_authors)} 位引文作者" if unique_authors else "",
        f"引文发表时间覆盖 {year_span}" if numeric_years else "",
    ]
    overview = "，".join(part for part in overview_parts if part) + "。"

    chart_panels = "".join(filter(None, (
        chart_panel("年度引文分布", years, chronological=True, tone="teal",
                    empty_note="引文发表年份暂无可核验数据。"),
        chart_panel("主要引用期刊", journals, tone="rust",
                    empty_note="引用期刊名称暂无可核验数据。"),
        chart_panel("引文作者国家 / 地区", countries, tone="violet",
                    empty_note="引文作者所在国家 / 地区暂无可核验数据。"),
        chart_panel("引文作者当前机构", institutions, tone="blue",
                    empty_note="引文作者当前机构暂无可核验数据。"),
        chart_panel("引文作者职位构成", position_groups, tone="rust",
                    empty_note="引文作者当前职位未取得可核验事实，按取证规则留空而不做推断。"),
        chart_panel("引文作者研究方向", topic_counts, tone="green",
                    empty_note="引文作者研究方向暂无可核验数据。"),
        chart_panel("自引 / 他引构成", self_citation_counts, tone="violet",
                    empty_note="自引 / 他引关系暂无可核验判定结果。"),
        chart_panel("引文类型", publication_types, tone="blue",
                    empty_note="引文类型暂无可核验数据。"),
    )))
    jif_note = (
        f"其中 {verified_jif_count} 本期刊取得了期刊身份、JIF 数值、指标年份和来源页面一致的最新影响因子。"
        if has_verified_jif else ""
    )
    css = '''
    @page{size:A4;margin:11mm}*{box-sizing:border-box}html{background:#e8edef}body{margin:0;color:#17262d;background:#e8edef;font:14px/1.62 "Microsoft YaHei","Source Han Sans SC","Segoe UI",Arial,sans-serif;letter-spacing:0}main{max-width:1180px;margin:auto;background:#fff;box-shadow:0 10px 35px #153b3f18}.mast{padding:52px 58px 46px;background:#153b3f;color:#fff;border-bottom:7px solid #c49a38}.mast .eyebrow{margin:0;color:#e8c978;font-size:12px;font-weight:700;text-transform:uppercase}.mast h1{max-width:980px;margin:13px 0 12px;font:700 35px/1.25 Georgia,"Songti SC","Microsoft YaHei",serif;letter-spacing:0}.mast .subtitle{font-size:17px;color:#fff;margin:0 0 8px}.mast .meta{font-size:12px;color:#c9d9d8;margin:0}.strip{display:grid;grid-template-columns:repeat(6,1fr);padding:0 58px;transform:translateY(-18px)}.strip div{min-width:0;background:#fff;border-right:1px solid #dce5e5;border-top:3px solid #287a80;padding:13px 12px;box-shadow:0 5px 15px #153b3f18}.strip div:first-child{border-left:1px solid #dce5e5}.strip b{display:block;overflow-wrap:anywhere;font:700 23px/1.15 Georgia,"Songti SC",serif;color:#153b3f}.strip span{display:block;margin-top:4px;font-size:10px;color:#65767b}.section{padding:24px 58px}.section h2{margin:10px 0 18px;padding-bottom:7px;border-bottom:2px solid #d9e2e2;color:#153b3f;font:700 23px/1.3 Georgia,"Songti SC","Microsoft YaHei",serif;letter-spacing:0}.section h3{margin:0 0 13px;color:#7b3e35;font-size:15px;letter-spacing:0}.lead{margin:0;background:#f4f0e4;border-left:5px solid #c49a38;padding:17px 20px;color:#374a51}.lead strong{color:#153b3f}.chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 30px}.chart-panel{min-width:0;padding:4px 0 9px}.chart{padding:2px 0}.chart-empty{margin:0;padding:13px 15px;border-left:3px solid #c49a38;background:#f7f4eb;color:#65767b;font-size:12px}.hbar{display:grid;grid-template-columns:minmax(90px,145px) 1fr 34px;gap:8px;align-items:center;margin:7px 0;font-size:11px}.hbar>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hbar i{display:block;height:11px;background:#e7eded}.hbar em{display:block;height:100%}.hbar .teal{background:#287a80}.hbar .rust{background:#9a4f43}.hbar .violet{background:#80618b}.hbar .blue{background:#4d7090}.hbar .green{background:#5f7e67}.hbar b{text-align:right;color:#17262d}.section-intro{margin:-4px 0 18px;color:#607177;font-size:12px}.table-wrap{width:100%;overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:10.5px;table-layout:auto}th{padding:8px;background:#153b3f;color:#fff;text-align:left;vertical-align:top}td{padding:8px;border-bottom:1px solid #dae2e3;vertical-align:top;overflow-wrap:anywhere}tbody tr:nth-child(even){background:#f8fafa}.journal-table td:first-child,.paper-table td:first-child,.author-table td:first-child{font-weight:700;color:#153b3f}.paper-table th:nth-child(1){width:40%}.paper-table th:nth-child(2){width:22%}.paper-table th:nth-child(3){width:30%}.author-table{table-layout:fixed;font-size:10px}.author-table th:nth-child(1){width:10%}.author-table th:nth-child(2){width:12%}.author-table th:nth-child(3){width:16%}.author-table th:nth-child(4){width:14%}.author-table th:nth-child(5){width:18%}.author-table th:nth-child(6){width:12%}.author-table th:nth-child(7){width:18%}.author-table td{font-size:10px;padding:5px 6px;line-height:1.4}.author-highlights{display:grid;grid-template-columns:1fr 1fr;gap:8px 22px;margin:0 0 18px}.author-card{display:grid;grid-template-columns:38px 1fr;gap:12px;padding:11px 0;border-bottom:1px solid #dae2e3}.author-rank{font:700 23px/1 Georgia;color:#c49a38}.author-card h3{margin:0 0 5px;color:#153b3f}.author-card p{margin:0;color:#465a62;font-size:11px}.author-card small{display:block;margin-top:6px;color:#718087;font-size:10px}.note{border-left:4px solid #c49a38;background:#f5f7f7;padding:13px 16px;color:#617177;font-size:11px}.foot{padding:20px 58px;background:#eaf0f0;color:#586a70;font-size:10px}.page{break-before:page}@media(max-width:820px){main{box-shadow:none}.mast,.section{padding-left:22px;padding-right:22px}.mast h1{font-size:27px}.strip{padding:0 22px;grid-template-columns:repeat(2,minmax(0,1fr))}.chart-grid,.author-highlights{grid-template-columns:1fr}.hbar{grid-template-columns:minmax(88px,125px) 1fr 30px}.section{padding-top:20px;padding-bottom:20px}}@media print{html,body{background:#fff}main{box-shadow:none}.strip div{box-shadow:none}.section{padding-top:17px;padding-bottom:17px}.page{break-before:page}tr,.author-card,.chart-panel{break-inside:avoid}.table-wrap{overflow:visible}}
    '''
    html = f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>引文影响与作者画像｜{esc(target.title)}</title><style>{css}</style></head><body><main>
    <header class="mast"><p class="eyebrow">ZeroWall Literature · Cited-by Impact Report</p><h1>{esc(target.title)}</h1><p class="subtitle">目标论文引文影响与作者画像</p><p class="meta">{esc(metadata)}</p></header>
    <section class="strip" aria-label="核心指标">{metric_strip}</section>
    <section class="section"><h2>汇报摘要</h2><p class="lead"><strong>{esc(overview)}</strong> 本报告通过引文发表年份、引用期刊，以及引文作者的当前国家、机构、职位与研究方向，呈现该论文的学术传播范围；所有统计均来自实际取得并去重的 cited-by 数据。</p></section>
    <section class="section"><h2>多维引文统计</h2><div class="chart-grid">{chart_panels}</div></section>
    <section class="section"><h2>跨期刊影响</h2><p class="section-intro">按引用该目标论文的文献数量汇总期刊分布。{esc(jif_note)}</p>{table(journal_headers, journal_rows, css_class="journal-table")}</section>
    <section class="section"><h2>高影响引文</h2><p class="section-intro">展示影响力排序靠前的 cited-by 文献；“该引文被引”按固定来源优先级选取一个可用数值，不做跨库相加。</p>{table(paper_headers, paper_rows, css_class="paper-table")}</section>
    <section class="section"><h2>核心引文作者画像</h2><p class="section-intro">重点作者依据公开学术指标、与本引文网络的关联论文数及已取得的荣誉任职综合排序。这里只分析引文作者，并明确关联其引用目标论文的文献。</p><div class="author-highlights">{author_highlights}</div>{table(["作者", "当前职位", "当前单位 / 国家", "研究方向", "对应引文论文", "学术指标", "荣誉 / 任职"], author_rows_html, css_class="author-table")}</section>
    <section class="section"><h2>数据口径</h2><div class="note">报告只纳入数据库明确返回的 cited-by 文献，不包含目标论文参考文献，也不分析目标论文作者。没有取得的作者或期刊字段直接留空，不展示身份状态、置信度、PDF 获取渠道或内部流程记录。完整引文与全部作者明细见 papers.xlsx。</div></section>
    <footer class="foot">ZeroWall Science · cited-by 多来源去重 · 引文作者公开资料联网检索 · 离线学术汇报</footer>
    </main></body></html>'''
    (output_root / "report.html").write_text(html, encoding="utf-8")
    summary_lines = [target.title, f"去重引文：{len(cited)}", "完整引文和作者数据见 papers.xlsx。"]
    pdf_renderer = render_offline_html_pdf(
        output_root / "report.html", output_root / "report.pdf", "ZeroWall Literature", summary_lines
    )
    manifest = []
    for path in (output_root / "report.html", output_root / "report.pdf", output_root / "papers.xlsx"):
        if path.is_file():
            manifest.append({
                "path": path.name,
                "bytes": path.stat().st_size,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            })
    if write_manifest:
        analysis = task.root / "analysis"
        analysis.mkdir(exist_ok=True)
        atomic_write_text(analysis / "report_manifest.json", json.dumps(
            {"schema": REPORT_SCHEMA_VERSION, "generated_at": now(), "pdf_renderer": pdf_renderer,
             "data_fingerprint": report_data_fingerprint(task, state, papers), "files": manifest},
            ensure_ascii=False, indent=2))
    return pdf_renderer




def configure_matplotlib_chinese(plt: Any) -> str:
    """Select an installed CJK font so Chinese titles never render as tofu boxes."""
    from matplotlib import font_manager  # type: ignore
    available = {font.name for font in font_manager.fontManager.ttflist}
    for candidate in ("Microsoft YaHei", "SimHei", "Noto Sans CJK SC", "Noto Sans SC", "STXihei", "Arial Unicode MS"):
        if candidate in available:
            plt.rcParams["font.family"] = candidate
            plt.rcParams["font.sans-serif"] = [candidate, "DejaVu Sans"]
            plt.rcParams["axes.unicode_minus"] = False
            return candidate
    plt.rcParams["font.family"] = "DejaVu Sans"
    plt.rcParams["axes.unicode_minus"] = False
    return "DejaVu Sans"


def pdf_status_label(status: str) -> str:
    labels = {
        "downloaded": "已下载",
        "downloaded_open_access": "开放来源已下载",
        "downloaded_paper_download": "paper-download 已下载",
        "downloaded_tsg": "TSG 已下载",
        "downloaded_authorized_adapter": "授权适配器已下载",
        "already_present": "已存在",
        "unavailable_no_authorized_source": "无授权来源",
        "blocked_ambiguous_match": "TSG 匹配歧义",
        "blocked_identity_mismatch": "身份校验失败",
        "blocked_provider_rate_limit": "提供方限流",
        "no_open_pdf_url": "无开放 PDF",
        "invalid_pdf_header": "PDF 无效",
        "error:HTTPError": "HTTP 错误",
        "tsg_skill_missing": "TSG 技能缺失",
        "tsg_missing_credentials": "TSG 凭据未注入",
        "tsg_no_match": "TSG 无匹配",
        "blocked_missing_credentials": "TSG 凭据缺失（已记录回退）",
    }
    if status in labels:
        return labels[status]
    if status.startswith("error:"):
        return "下载错误"
    if status.startswith("paper_download_"):
        return "paper-download：" + status.removeprefix("paper_download_")
    if status.startswith("authorized_adapter_"):
        return "授权适配器：" + status.removeprefix("authorized_adapter_")
    return status.replace("_", " ")


def report(task: Task, state: dict[str, Any]) -> None:
    papers = [Paper(**{k: v for k, v in row.items() if k in Paper.__dataclass_fields__}) for row in state.get("papers", [])]
    if state.get("workflow_mode") == WORKFLOW_MODE:
        analysis = task.root / "analysis"; analysis.mkdir(exist_ok=True)
        write_progress(task, state, papers)
        atomic_write_text(analysis / "skill_invocations.json", json.dumps(state.get("skill_invocations", []), ensure_ascii=False, indent=2))
        return
    targets = [paper for paper in papers if paper.direction == "target"]
    if len(targets) > 1:
        raise ValueError("任务状态包含多个 target 主文章；请为每篇文章使用独立工作目录。")
    target = targets[0] if targets else (papers[0] if papers else None)
    asset_dir = task.root / "report-assets"
    asset_dir.mkdir(exist_ok=True)
    direction_counts = {key: sum(1 for paper in papers if paper.direction == key) for key in ("target", "references", "cited-by")}
    pdf_counts: dict[str, int] = {}
    provider_counts: dict[str, int] = {}
    for paper in papers:
        pdf_counts[paper.pdf_status] = pdf_counts.get(paper.pdf_status, 0) + 1
        for attempt in paper.acquisition_attempts:
            provider = clean_text(attempt.get("provider")) or "unknown"
            provider_counts[provider] = provider_counts.get(provider, 0) + 1
    context_count = sum(len(paper.citation_contexts) for paper in papers)
    phases = update_phase_status(state, papers)
    chart_paths: list[Path] = []
    try:
        import matplotlib.pyplot as plt  # type: ignore
        configure_matplotlib_chinese(plt)
        labels = ["目标文章", "参考文献", "被引文献"]
        values = [direction_counts["target"], direction_counts["references"], direction_counts["cited-by"]]
        fig, ax = plt.subplots(figsize=(7.5, 4.2)); ax.bar(labels, values, color=["#1F4E78", "#5B9BD5", "#70AD47"]); ax.set_title("文献网络规模"); ax.set_ylabel("文章数量"); ax.grid(axis="y", alpha=.25); fig.tight_layout(); path = asset_dir / "direction_counts.png"; fig.savefig(path, dpi=180, facecolor="white"); plt.close(fig); chart_paths.append(path)
        chart_labels = [pdf_status_label(status) for status in pdf_counts]
        fig, ax = plt.subplots(figsize=(7.5, 4.2)); ax.barh(chart_labels, [pdf_counts[status] for status in pdf_counts], color="#ED7D31"); ax.set_title("PDF 获取状态"); ax.set_xlabel("文章数量"); ax.grid(axis="x", alpha=.25); fig.tight_layout(); path = asset_dir / "pdf_status.png"; fig.savefig(path, dpi=180, facecolor="white"); plt.close(fig); chart_paths.append(path)
    except Exception:
        chart_paths = []
    def md(value: Any) -> str:
        return clean_text(value).replace("|", " ").replace("\n", " ")
    lines = [f"# 文献引用与被引分析：{md(target.title if target else '未解析')}", "", f"生成时间：{now()}", f"工作模式：单篇主文章独立任务（{md(state.get('article_slug') or '')}）", f"流程状态：{md(state.get('stage') or 'unknown')}（只有 complete 才代表完整研究结束）", "", "## 流程完成度", "", "| 阶段 | 状态 |", "|---|---|", *[f"| {md(name)} | {md(status)} |" for name, status in phases.items()], "", "## 一、目标文章", ""]
    if target:
        counts = "；".join(f"{key}：{value} 次" for key, value in target.cited_by_counts.items()) or "暂无可用引用次数"
        lines += [f"- DOI：{md(target.doi) or '未知'}", f"- PMID：{md(target.pmid) or '未知'}", f"- 期刊/年份：{md(target.journal) or '未知'} / {md(target.year) or '未知'}", f"- 多来源引用次数：{counts}", f"- 摘要：{md(target.abstract) or '暂无'}", ""]
    lines += ["## 二、数据统计", "", "| 指标 | 数值 |", "|---|---:|", f"| 唯一文章总数 | {len(papers)} |", f"| 参考文献 | {direction_counts['references']} |", f"| 被引文献 | {direction_counts['cited-by']} |", f"| 已获取 PDF | {sum(1 for paper in papers if paper.pdf_path)} |", f"| 引用原文证据条数 | {context_count} |", ""]
    for path in chart_paths:
        lines += [f"![{path.stem}](report-assets/{path.name})", ""]
    lines += ["## 三、文章明细", "", "| 方向 | 标题 | DOI | PMID | PDF 状态 | 最终来源 | MinerU 快照 | 图片/表格/JSON | 引用次数 | 国家 | 机构 |", "|---|---|---|---|---|---|---|---|---|---|---|"]
    for paper in papers:
        counts = paper.mineru_file_counts or {}
        lines.append(f"| {md(paper.direction)} | {md(paper.title)} | {md(paper.doi)} | {md(paper.pmid)} | {md(paper.pdf_status)} | {md(paper.pdf_source)} | {md(paper.mineru_snapshot_dir) or '未解析'} | {counts.get('images', 0)}/{counts.get('tables', 0)}/{counts.get('json', 0)} | {md(json.dumps(paper.cited_by_counts, ensure_ascii=False))} | {md(', '.join(paper.countries))} | {md(', '.join(paper.institutions))} |")
    contexts = [context | {"paper": paper.title, "direction": paper.direction} for paper in papers for context in paper.citation_contexts]
    lines += ["", "## 四、引文原文证据", "", "以下摘录保留被引文章中的英文原文。每一处可识别的引用标记都单独保留，并记录页码、偏移、分类和证据等级。", ""]
    for context in contexts:
        lines += [f"### {md(context.get('paper'))}", f"- 方向：{md(context.get('direction'))}；页码：{md(context.get('page', '未知'))}；标记：`{md(context.get('marker', ''))}`；分类：{md(context.get('classification', ''))}；证据等级：{md(context.get('evidence_level', ''))}", f"> {context.get('excerpt', '')}", ""]
    lines += ["## 五、作者履历核验", "", "职务、学术兼职、院士/会士和荣誉只有在 ORCID 或机构公开记录明确给出时才填写。空白表示当前没有可验证证据，不代表不存在。", ""]
    for paper in papers:
        for profile in paper.author_profiles:
            if profile.get("position") or profile.get("appointments") or profile.get("honors"):
                lines.append(f"- **{md(profile.get('name'))}**：职务 {md(profile.get('position')) or '未确认'}；机构/兼职 {md(profile.get('appointments')) or '未确认'}；荣誉 {md(profile.get('honors')) or '未确认'}；来源 {md(profile.get('source_url')) or '未提供'}")
    evidence_path = task.root / "analysis" / "provider_evidence.json"
    if not evidence_path.is_file() and task.mcp_receipts():
        evidence_path.parent.mkdir(parents=True, exist_ok=True)
        evidence_path.write_text(json.dumps({"generated_at": now(), "source": "zerowall-literature mcp receipts", "queries": task.mcp_receipts()}, ensure_ascii=False, indent=2), encoding="utf-8")
    analysis_files = [("跨来源核验", "provider_evidence.json"), ("引用分析", "citation_analysis.md"), ("作者分析", "author_analysis.md"), ("综合结论", "synthesis.md")]
    lines += ["", "## 六、综合分析产物", ""]
    for label, filename in analysis_files:
        path = task.root / "analysis" / filename
        lines.append(f"- {label}：{'[已生成](analysis/' + filename + ')' if path.is_file() else '待执行'}")
    lines += ["", "## 七、下载回退与完整性", "", "| 提供方/技能 | 尝试次数 |", "|---|---:|"]
    lines.extend(f"| {md(provider)} | {count} |" for provider, count in sorted(provider_counts.items()))
    failures = [attempt for paper in papers for attempt in paper.acquisition_attempts if str(attempt.get("status", "")).startswith(("error", "failed", "skipped", "no_", "ambiguous"))]
    if failures:
        lines += ["", "### 未成功或跳过的回退", ""]
        for attempt in failures:
            lines.append(f"- {md(attempt.get('provider'))} / {md(attempt.get('skill'))}：{md(attempt.get('status'))}（{md(attempt.get('error') or attempt.get('reason') or '')}）")
    broken = [(paper.title, link) for paper in papers for link in paper.mineru_broken_links]
    rate_limit_count = sum(1 for row in task.mcp_receipts() if str(row.get("status")) == "429")
    lines += ["", f"MinerU 断链图片/资源：{len(broken)}；无全文记录：{sum(1 for paper in papers if not paper.pdf_path)}；S2/其他 provider 429：{rate_limit_count}。"]
    lines += ["", "## 八、证据边界", "", "元数据、摘要、MinerU 完整目录、引用上下文和作者证据分层保存。无法获取全文、提供方失败、引用标记含义不确定或人物履历未验证的记录均保留在 Excel 对应工作表中。流程状态不是 complete 时，本报告只是中间产物，不得表述为完整研究已经完成。"]
    (task.root / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (task.root / "skill_invocations.json").write_text(json.dumps(state.get("skill_invocations", []), ensure_ascii=False, indent=2), encoding="utf-8")
    review_rows = [{"paper": paper.title, "doi": paper.doi, "status": paper.pdf_status, "reason": paper.parse_status if paper.parse_status != "not_attempted" else paper.pdf_status} for paper in papers if not paper.pdf_path or paper.parse_status != "mineru_parsed"]
    paper_rows = [{"方向": paper.direction, "标题": paper.title, "DOI": paper.doi, "PMID": paper.pmid, "年份": paper.year, "期刊": paper.journal, "作者": "; ".join(paper.authors), "作者国家": "; ".join(paper.countries), "作者机构": "; ".join(paper.institutions), "OpenAlex引用次数": paper.cited_by_counts.get("openalex", ""), "Crossref引用次数": paper.cited_by_counts.get("crossref", ""), "SemanticScholar引用次数": paper.cited_by_counts.get("semantic_scholar", ""), "PDF状态": paper.pdf_status, "PDF路径": paper.pdf_path, "PDF来源": paper.pdf_source, "SHA256": paper.pdf_sha256, "解析状态": paper.parse_status, "MinerU API": paper.parser_api, "MinerU taskId": paper.parser_task_id, "MinerU快照目录": paper.mineru_snapshot_dir, "MinerU正文": paper.parsed_text_path, "MinerU图片数": paper.mineru_file_counts.get("images", 0), "MinerU表格数": paper.mineru_file_counts.get("tables", 0), "MinerU JSON数": paper.mineru_file_counts.get("json", 0), "MinerU断链": "; ".join(paper.mineru_broken_links), "引用证据条数": len(paper.citation_contexts), "引用证据来源": "MinerU" if paper.parse_status == "mineru_parsed" else "unavailable", "参考文献编号": paper.raw.get("reference_index", "")} for paper in papers]
    acquisition_rows = [{"paper": paper.title, "direction": paper.direction, **attempt} for paper in papers for attempt in paper.acquisition_attempts]
    mineru_rows = [{"paper": paper.title, "paper_key": paper.key, "snapshot_dir": paper.mineru_snapshot_dir, "manifest": paper.mineru_manifest_path, "task_id": paper.parser_task_id, "api": paper.parser_api, "broken_links": "; ".join(paper.mineru_broken_links), **artifact} for paper in papers for artifact in paper.parser_artifacts]
    provider_rows = []
    if evidence_path.is_file():
        try:
            raw_evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
            provider_rows = raw_evidence if isinstance(raw_evidence, list) else (raw_evidence.get("queries") or raw_evidence.get("providers") or raw_evidence.get("results") or [])
        except (OSError, json.JSONDecodeError):
            provider_rows = [{"status": "invalid_provider_evidence"}]
    sheets = {"Summary": [{"指标": "流程状态", "数值": state.get("stage", "")}, *[{"指标": name, "数值": status} for name, status in phases.items()], {"指标": "唯一文章总数", "数值": len(papers)}, {"指标": "参考文献", "数值": direction_counts["references"]}, {"指标": "被引文献", "数值": direction_counts["cited-by"]}, {"指标": "已获取 PDF", "数值": sum(1 for paper in papers if paper.pdf_path)}, {"指标": "MinerU 已解析", "数值": sum(1 for paper in papers if paper.parse_status == "mineru_parsed")}, {"指标": "引用原文证据", "数值": context_count}], "Direction Stats": [{"方向": key, "文章数": value} for key, value in (("目标文章", direction_counts["target"]), ("参考文献", direction_counts["references"]), ("被引文献", direction_counts["cited-by"]))], "PDF Stats": [{"状态": key, "数量": value} for key, value in pdf_counts.items()], "Papers": paper_rows, "Citation Contexts": contexts, "Author Profiles": [profile | {"paper": paper.title} for paper in papers for profile in paper.author_profiles], "Acquisition Attempts": acquisition_rows, "MCP Receipts": task.mcp_receipts(), "MinerU Artifacts": mineru_rows, "Provider Evidence": provider_rows, "Review Queue": review_rows, "Failure Review": [{"paper": paper.title, "status": paper.pdf_status, "attempts": paper.acquisition_attempts} for paper in papers if paper.pdf_status not in ACQUISITION_TERMINAL], "Deduplication": state.get("deduplication", []), "Source Ledger": task.ledger()}
    write_excel(task.root / "papers.xlsx", sheets)


def _derive_output_from_input(input_str: str) -> Path:
    """Derive a task directory from the input PDF path or title.

    Rules (in order):
    1. If input is a local file path, use the stem with spaces → underscores.
       e.g. "allmypapers/2008 Wang PPAR.pdf" → literature/2008_Wang_PPAR
    2. Otherwise use the first 80 chars of the string, sanitising to underscores.
    The result is always under the literature/ prefix.
    """
    p = Path(input_str)
    if p.suffix.lower() in {".pdf", ".docx", ".txt"} or p.exists():
        stem = p.stem  # filename without extension
    else:
        stem = input_str  # DOI / title / PMID
    # Replace whitespace and unsafe chars with underscores, collapse runs
    slug = re.sub(r"[^\w\-.]", "_", stem)
    slug = re.sub(r"_+", "_", slug).strip("_.")
    return Path("literature") / slug[:120]


def run_analyze(args: argparse.Namespace) -> int:
    if args.output is None:
        output = _derive_output_from_input(args.input)
        print(f"[auto output] {output}", flush=True)
    else:
        output = Path(args.output)
    task = Task(output); state = task.load(); client = Client(task, args.timeout)
    (task.root / "analysis").mkdir(exist_ok=True)
    state["workflow_mode"] = WORKFLOW_MODE
    state["workflow_version"] = 2
    state["input"] = args.input
    state["research_plan"] = {"directions": "cited-by", "max_papers": args.max_papers, "all_cited_by": bool(args.all_cited_by or args.max_papers is None), "download_pdfs": args.download_pdfs, "download_workers": args.download_workers, "author_search": "all", "target_mineru_required": True, "created_at": now()}
    state["skill_invocations"] = [
        {"skill": "paper-download-pdf-cascade", "status": "configured", "entrypoint": "paper_download_bridge.py"},
        {"skill": "zerowall-tsg-literature", "status": "automatic_authorized_fallback", "credentials": "four_env_vars_required"},
        {"skill": "mineru-document-parser", "status": "required_for_target_only", "result_command": "ingest-mineru"},
        {"skill": "pubmed-literature/sci-master", "status": "required", "artifact": "analysis/provider_evidence.json"},
        {"skill": "deep-research/ARS", "status": "required", "artifacts": ["analysis/citation_analysis.md", "analysis/author_analysis.md", "analysis/synthesis.md"]},
    ]
    (task.root / "analysis" / "research_plan.md").write_text(
        "\n".join([
            "# Literature research plan", "", f"Input: {args.input}",
            "Directions: cited-by only", f"Cited-paper PDF download: {'enabled' if args.download_pdfs else 'metadata only'}",
            f"Maximum related papers: {args.max_papers or 'unbounded'}", "",
            "Open-access providers are attempted first, followed by authorized TSG title search and then paper-download. TSG is never silently skipped; missing credentials are recorded as an explicit fallback result.",
            "The target PDF must be parsed with MinerU before cited-by expansion starts.",
            "Cited-paper PDFs are downloaded and validated but are never sent to MinerU.", "",
        ]) + "\n", encoding="utf-8")
    try:
        target, candidates = client.resolve(args.input)
    except ValueError as exc:
        state["stage"] = "needs_input"; state["input_error"] = str(exc); task.save(state)
        print(str(exc), file=sys.stderr)
        return 2
    state["candidates"] = candidates
    if not target:
        state["stage"] = "needs_input"; task.save(state); print("No article match; see candidates/review_queue in the task directory.", file=sys.stderr); return 2
    if args.article_slug:
        slug = safe_name(args.article_slug, 96)
    else:
        slug = article_slug(target.title)
    state["single_article"] = True
    state["article_key"] = article_identity(target)
    state["article_slug"] = slug
    state["task_root"] = str(task.root.resolve())
    input_path = Path(args.input)
    is_local_pdf = input_path.is_file() and input_path.suffix.lower() == ".pdf"
    if not is_local_pdf:
        target = client.enrich(target)
    target.direction = "target"
    state["stage"] = "identified"; state["papers"] = [asdict(target)]; task.save(state)
    try:
        if is_local_pdf:
            acquire_provided_target_pdf(task, target, input_path)
        else:
            download_paper(client, target, not args.no_tsg)
            if target.pdf_path:
                target.parse_status = "mineru_required"
    except (OSError, ValueError) as exc:
        state["target_error"] = str(exc)
    state["stage"] = "target_mineru_required" if target.pdf_path else "target_pdf_unavailable"
    state["papers"] = [asdict(target)]; update_phase_status(state, [target]); task.save(state); report(task, state)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print(json.dumps({"task": str(task.root), "stage": state["stage"], "target": {"title": target.title, "doi": target.doi, "pmid": target.pmid, "year": target.year}, "paper_count": 1}, ensure_ascii=False, indent=2))
    return 0


def run_resume(args: argparse.Namespace) -> int:
    task = Task(args.task); state = task.load(); client = Client(task, args.timeout)
    if getattr(args, "partial", False):
        state["partial_enrichment"] = True
    if state.get("single_article") is False:
        print("该任务不是单篇主文章工作目录，拒绝继续。", file=sys.stderr); return 2
    if state.get("workflow_mode") != WORKFLOW_MODE:
        print("Legacy task: this resume command requires migration before using the cited-by-only workflow.", file=sys.stderr); return 2
    papers = merge_pdf_jobs(task, state)
    if not papers:
        print("No resumable papers in task state.", file=sys.stderr); return 2
    target = target_from_papers(papers)
    if sum(1 for paper in papers if paper.direction == "target") > 1:
        print("任务状态包含多个 target 主文章，请拆分工作目录。", file=sys.stderr); return 2
    state["single_article"] = True
    state.setdefault("article_key", article_identity(target)); state.setdefault("article_slug", article_slug(target.title)); state["task_root"] = str(task.root.resolve())
    if target.parse_status != "mineru_parsed" or not target.parsed_text_path:
        state["stage"] = "target_mineru_required"; update_phase_status(state, papers); task.save(state); report(task, state)
        print(json.dumps({"task": str(task.root), "stage": state["stage"], "next": "run MinerU for the target PDF, then ingest-mineru"}, ensure_ascii=False, indent=2)); return 0
    # When partial_enrichment=True and cited_by_expanded is already done, skip
    # the expensive network calls (title-search, OpenAlex enrich, cited-by
    # expansion) and also skip prepare_enrichment_requests.  Re-running those
    # steps would (a) stall on slow network, and (b) append new "pending" rows
    # whose request_ids differ from the already-executed rows (because paper
    # metadata may have been patched for acquisition_terminal), permanently
    # blocking finalization.
    _partial_resume = state.get("partial_enrichment") and state.get("cited_by_expanded")
    if not _partial_resume:
        if target.source == "local" or not target.doi:
            matches = client.search_title(target.title)
            if matches and title_score(target.title, matches[0].title) >= 0.65: merge_paper(target, client.enrich(matches[0]))
        else:
            target = client.enrich(target)
        target_index = next(i for i, paper in enumerate(papers) if paper.direction == "target")
        papers[target_index] = target
        if not state.get("cited_by_expanded"):
            state["stage"] = "cited_by_expanded"
            related = client.expand_openalex(target, "cited-by", None if state.get("research_plan", {}).get("all_cited_by") else state.get("research_plan", {}).get("max_papers", 20))
            papers, aliases = deduplicate_papers([target, *related]); state["deduplication"] = aliases; state["cited_by_expanded"] = True
    state["papers"] = [asdict(paper) for paper in papers]; state.setdefault("parallel_jobs", {})
    state["parallel_jobs"].setdefault("author_enrichment", "pending"); state["parallel_jobs"].setdefault("journal_enrichment", "pending"); state["parallel_jobs"].setdefault("report", "metadata_ready")
    task.save(state)
    # Reconcile deterministic requests on every resume. This adds newly
    # required engines/direct author lookups during an idempotent migration
    # without duplicating any existing request_id.
    # Skip when partial_enrichment=True (cited_by already expanded): changed
    # paper metadata would generate different request_ids that can never be
    # fulfilled, permanently blocking finalization.
    if _partial_resume:
        requests = task.provider_requests()
    else:
        requests = prepare_enrichment_requests(task, state)
    state = task.load(); papers = merge_pdf_jobs(task, state)
    state["parallel_jobs"]["author_enrichment"] = "running"; state["parallel_jobs"]["journal_enrichment"] = "running"; state["stage"] = "author_enriching"; state["papers"] = [asdict(paper) for paper in papers]; task.save(state)
    # Launch the independent PDF branch after the queue exists.  Author and
    # journal requests can now be executed by the Host concurrently.
    should_download = bool(state.get("research_plan", {}).get("download_pdfs", True))
    if should_download:
        start_pdf_worker(task, state, args)
    else:
        for paper in papers:
            if paper.direction == "cited-by" and paper.pdf_status not in ACQUISITION_TERMINAL:
                paper.pdf_status = "unavailable_no_authorized_source"; paper.acquisition_state = "acquisition_terminal"; paper.parse_status = "not_required"
                paper.acquisition_attempts.append({"provider": "workflow", "skill": "zerowall-literature", "status": "skipped_by_request", "reason": "PDF download disabled by operator", "at": now()})
        state["parallel_jobs"]["pdf_acquisition"] = "disabled"
    papers = merge_pdf_jobs(task, state); state["papers"] = [asdict(paper) for paper in papers]
    request_ids = {clean_text(row.get("request_id")) for row in task.provider_requests()}
    try:
        ingested_ids = {json.loads(line).get("request_id") for line in (task.root / "analysis" / "evidence_inbox.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()}
    except (OSError, json.JSONDecodeError):
        ingested_ids = set()
    evidence_dir = getattr(args, "from_evidence_dir", None)
    if evidence_dir is None and (task.root / "analysis" / "evidence_pending").is_dir():
        evidence_dir = task.root / "analysis" / "evidence_pending"
    # When partial_enrichment=True (fast-finalize path) skip evidence_pending
    # ingestion entirely.  ingest_evidence → enqueue_journal_year_followup
    # appends new "pending" rows on every call, regenerating the exact rows
    # we just marked terminal and permanently blocking finalization.
    if not _partial_resume and evidence_dir and (request_ids - ingested_ids):
        summary = ingest_evidence_dir(task, state, Path(evidence_dir), skip_existing=True); state = task.load(); papers = merge_pdf_jobs(task, state); state["papers"] = [asdict(paper) for paper in papers]; task.save(state)
        print(json.dumps({"task": str(task.root), "batch_ingest": summary}, ensure_ascii=False, indent=2))
        try: ingested_ids = {json.loads(line).get("request_id") for line in (task.root / "analysis" / "evidence_inbox.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()}
        except (OSError, json.JSONDecodeError): ingested_ids = set()
    queue_latest = {clean_text(row.get("request_id")): row for row in task.provider_requests()}
    # Use queue STATUS as the authoritative pending indicator.  A request whose
    # status is terminal (succeeded / failed / not_found / …) is considered done
    # even if it was never written to evidence_inbox (e.g. pre-patched entries).
    # When partial_enrichment=True, only consider requests that are in the
    # CURRENT queue_latest (last-row-wins view) and still non-terminal.
    # This prevents stale orphan pending rows written before a metadata patch
    # (e.g. acquisition_terminal fix changing paper.key/subject) from
    # permanently blocking finalization.
    if state.get("partial_enrichment"):
        pending = {
            request_id for request_id, row in queue_latest.items()
            if clean_text(row.get("status")) not in QUEUE_TERMINAL
        }
    else:
        pending = {
            request_id for request_id in request_ids
            if clean_text(queue_latest.get(request_id, {}).get("status")) not in QUEUE_TERMINAL
        }
    if pending:
        build_metadata_analysis(task, state, papers)
        state = task.load(); papers = merge_pdf_jobs(task, state); state["stage"] = "author_enriching"; state["parallel_jobs"]["report"] = "metadata_ready"; state["papers"] = [asdict(paper) for paper in papers]; task.save(state); report(task, state)
        print(json.dumps({"task": str(task.root), "stage": state["stage"], "parallel_jobs": state["parallel_jobs"], "next": "execute provider_requests.jsonl in parallel and re-run resume", "request_count": len(requests), "pending": len(pending)}, ensure_ascii=False, indent=2)); return 0
    state["stage"] = "author_enriching"; build_simplified_analysis(task, state, papers)
    # Persist author records before merging the PDF branch.  Otherwise a stale
    # reload would discard the just-built profiles and citation relations.
    task.save(state)
    state = task.load(); papers = merge_pdf_jobs(task, state); state["stage"] = "report_building"; state["papers"] = [asdict(paper) for paper in papers]; state["parallel_jobs"]["author_enrichment"] = "complete" if not pending else "partial"; state["parallel_jobs"]["journal_enrichment"] = "complete" if (task.root / "analysis" / "journal_evidence.json").is_file() else "partial"; task.save(state); report(task, state)
    update_phase_status(state, papers); task.save(state)
    # Do not finalize while the detached PDF branch is still working.
    state = task.load(); papers = merge_pdf_jobs(task, state); update_phase_status(state, papers)
    if state.get("phase_status", {}).get("acquisition_terminal") != "complete":
        state["stage"] = "report_building"; state["parallel_jobs"]["report"] = "metadata_ready"; state["papers"] = [asdict(paper) for paper in papers]; task.save(state); report(task, state); print(json.dumps({"task": str(task.root), "stage": state["stage"], "parallel_jobs": state["parallel_jobs"], "next": "wait for acquire-pdfs, then run resume"}, ensure_ascii=False, indent=2)); return 0
    finalize_analysis(task, state)
    state = task.load(); state.setdefault("parallel_jobs", {})["report"] = "final"; task.save(state); report(task, state)
    print(json.dumps({"task": str(task.root), "stage": state["stage"], "paper_count": len(papers), "parallel_jobs": state.get("parallel_jobs", {})}, ensure_ascii=False, indent=2)); return 0


def _patch_xlsx_jif_after_finalize(task_root: Path) -> None:
    """Patch papers.xlsx JIF columns using verified_data.json, called after finalize.

    This runs in-process so no separate script call is needed.  Errors are
    logged but never raise (finalize already succeeded; a JIF patch failure
    must not make finalize appear to fail).
    """
    try:
        import openpyxl  # type: ignore
    except ImportError:
        print("[patch_xlsx_jif] openpyxl not installed — skipping JIF patch", file=sys.stderr)
        return

    xlsx_path = task_root / "papers.xlsx"
    if not xlsx_path.is_file():
        return

    jif_table = load_verified_data(task_root).get("jif", {})
    if not jif_table:
        return

    try:
        wb = openpyxl.load_workbook(str(xlsx_path))
        if "引文列表" not in wb.sheetnames:
            return
        ws = wb["引文列表"]
        header = [cell.value for cell in ws[1]]
        col_idx = {v: i + 1 for i, v in enumerate(header)}
        required = ("最新影响因子", "影响因子年份", "引用杂志全名")
        if any(c not in col_idx for c in required):
            return
        jif_col    = col_idx["最新影响因子"]
        year_col   = col_idx["影响因子年份"]
        journal_col = col_idx["引用杂志全名"]
        patched = 0
        for row_idx in range(2, ws.max_row + 1):
            journal = ws.cell(row_idx, journal_col).value or ""
            if not journal or str(journal).strip().lower() == "pubmed":
                continue
            existing_jif = ws.cell(row_idx, jif_col).value
            if existing_jif not in (None, ""):
                continue
            key = _jif_key(str(journal))
            hit = jif_table.get(key)
            if not hit:
                words = key.split()[:4]
                prefix = " ".join(words)
                for k, v in jif_table.items():
                    if k.startswith(prefix):
                        hit = v
                        break
            if not hit:
                continue
            ws.cell(row_idx, jif_col).value  = hit[0]
            ws.cell(row_idx, year_col).value = hit[1]
            patched += 1
        if patched:
            wb.save(str(xlsx_path))
            print(f"[patch_xlsx_jif] Patched {patched} rows in papers.xlsx")
    except Exception as exc:  # noqa: BLE001
        print(f"[patch_xlsx_jif] Warning: {exc}", file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="ZeroWall title-driven literature trail")
    sub = parser.add_subparsers(dest="command", required=True)
    analyze = sub.add_parser("analyze"); analyze.add_argument("input"); analyze.add_argument("--output", type=Path, default=None, help="任务工作目录；省略时从输入文件名自动派生 literature/<stem>"); analyze.add_argument("--article-slug", help="任务元数据中的主文章短标识"); analyze.add_argument("--directions", default="cited-by", help="兼容参数；当前流程固定为 cited-by"); analyze.add_argument("--max-papers", "--top-n", dest="max_papers", type=int, default=None, help="显式限制 cited-by 数量；默认检索全量"); analyze.add_argument("--all-references", action="store_true", help="兼容参数；当前流程忽略参考文献"); analyze.add_argument("--all-cited-by", action="store_true", help="兼容参数；默认已检索全量 cited-by"); downloads = analyze.add_mutually_exclusive_group(); downloads.add_argument("--download-pdfs", dest="download_pdfs", action="store_true"); downloads.add_argument("--no-download-pdfs", "--no-pdf-download", dest="download_pdfs", action="store_false"); analyze.set_defaults(download_pdfs=True); analyze.add_argument("--download-workers", type=int, default=int(os.getenv("LITERATURE_DOWNLOAD_WORKERS", "4"))); analyze.add_argument("--enrich-authors", action="store_true"); analyze.add_argument("--author-search", choices=("all",), default="all"); analyze.add_argument("--include-target", action="store_true"); analyze.add_argument("--allow-tsg", action="store_true", help="兼容旧调用；TSG 默认自动启用"); analyze.add_argument("--no-tsg", action="store_true", help="禁用授权 TSG 回退"); analyze.add_argument("--timeout", type=float, default=30)
    resume = sub.add_parser("resume"); resume.add_argument("task", type=Path); resume.add_argument("--allow-tsg", action="store_true", help="兼容旧调用；TSG 默认自动启用"); resume.add_argument("--no-tsg", action="store_true", help="禁用授权 TSG 回退"); resume.add_argument("--timeout", type=float, default=30); resume.add_argument("--from-evidence-dir", type=Path, help="先批量 ingest 该目录下的 provider 证据再决定是否暂停"); resume.add_argument("--partial", action="store_true", help="证据不足时也生成报告，并如实标注 enrichment 缺口")
    acquire = sub.add_parser("acquire-pdfs", help="运行可恢复的 cited-by PDF 独立分支"); acquire.add_argument("task", type=Path); acquire.add_argument("--workers", type=int, default=4); acquire.add_argument("--timeout", type=float, default=30); acquire.add_argument("--no-tsg", action="store_true")
    export = sub.add_parser("export"); export.add_argument("task", type=Path)
    ingest = sub.add_parser("ingest-mineru"); ingest.add_argument("task", type=Path); ingest.add_argument("--paper", required=True, help="paper key, DOI, or PMID"); ingest.add_argument("--run-dir", type=Path, required=True); ingest.add_argument("--task-id", default=""); ingest.add_argument("--api", default="mineru")
    prepare = sub.add_parser("prepare-enrichment"); prepare.add_argument("task", type=Path)
    rebuild_authors = sub.add_parser("rebuild-author-requests", help="安全重建作者请求：保留已成功和非作者请求，使用当前实体 OpenAlex ID 重新生成待处理作者请求"); rebuild_authors.add_argument("task", type=Path)
    ingest_evidence_parser = sub.add_parser("ingest-evidence"); ingest_evidence_parser.add_argument("task", type=Path); ingest_evidence_parser.add_argument("--request-id", default="", help="单个 request_id；与 --dir 二选一"); ingest_evidence_parser.add_argument("--input", type=Path, help="单个证据 JSON；与 --dir 二选一"); ingest_evidence_parser.add_argument("--dir", type=Path, help="批量目录；默认 analysis/evidence_pending"); ingest_evidence_parser.add_argument("--tool", default="", help="批量模式下只 ingest 指定 tool"); ingest_evidence_parser.add_argument("--skip-existing", action="store_true", help="批量模式下跳过已 ingest 的 request_id")
    mark_terminal = sub.add_parser("mark-terminal"); mark_terminal.add_argument("task", type=Path); mark_terminal.add_argument("--tool", action="append", default=[], help="只处理指定 tool，可重复"); mark_terminal.add_argument("--status", default="blocked_provider", help="写入的终态状态"); mark_terminal.add_argument("--reason", default="", help="写入 provider_requests 的说明")
    reconcile = sub.add_parser("reconcile-queue", help="用 evidence_inbox 的既有结果修复被重建回滚为 pending 的队列状态"); reconcile.add_argument("task", type=Path)
    finalize = sub.add_parser("finalize"); finalize.add_argument("task", type=Path)
    sub.add_parser("check-credentials", help="报告 provider 凭据来源与限流设置，不显示凭据值")
    status = sub.add_parser("status"); status.add_argument("task", type=Path)
    args = parser.parse_args(argv)
    if args.command == "analyze": return run_analyze(args)
    if args.command == "resume": return run_resume(args)
    if args.command == "acquire-pdfs":
        task = Task(args.task); state = task.load()
        result = run_pdf_acquisition(task, state, args.timeout, args.workers, not args.no_tsg)
        print(json.dumps({"task": str(task.root), **result}, ensure_ascii=False, indent=2)); return 0
    if args.command == "ingest-mineru":
        task = Task(args.task); state = task.load(); paper = ingest_mineru_result(task, state, args.paper, args.run_dir, args.task_id, args.api)
        print(json.dumps({"paper": paper.key, "parse_status": paper.parse_status, "parsed_text_path": paper.parsed_text_path}, ensure_ascii=False, indent=2)); return 0
    if args.command == "prepare-enrichment":
        task = Task(args.task); state = task.load(); requests = prepare_enrichment_requests(task, state)
        print(json.dumps({"task": str(task.root), "stage": state.get("stage"), "request_count": len(requests), "path": str(task.provider_requests_path)}, ensure_ascii=False, indent=2)); return 0
    if args.command == "rebuild-author-requests":
        task = Task(args.task); state = task.load()
        # Keep succeeded / running / skipped journal + non-author requests
        old_queue = task.provider_requests()
        preserved = [r for r in old_queue if r.get("kind") != "author" or r.get("status") in ("succeeded", "running", "skipped")]
        preserved_ids = {r["request_id"] for r in preserved}
        # Generate fresh author requests with current entity OpenAlex IDs
        papers = papers_from_state(state)
        target = target_from_papers(papers)
        all_entities = unique_author_entities(papers)
        identity_hints = _load_author_identity_hints(task)
        for entity in all_entities:
            hint = identity_hints.get(clean_text(entity.get("author_entity_id")))
            if hint:
                for key in ("openalex_author_id", "orcid", "display_name"):
                    if not clean_text(entity.get(key)) and clean_text(hint.get(key)):
                        entity[key] = clean_text(hint[key])
                if not entity.get("identity_institutions") and hint.get("institutions"):
                    entity["identity_institutions"] = list(hint["institutions"])
                if not entity.get("identity_countries") and hint.get("countries"):
                    entity["identity_countries"] = list(hint["countries"])
                if not entity.get("identity_topics") and hint.get("topics"):
                    entity["identity_topics"] = list(hint["topics"])
        new_author_requests = []
        for entity in all_entities:
            primary_paper = entity["papers"][0] if entity["papers"] else {}
            context = {"papers": entity.get("papers", []), "identity_institutions": entity.get("identity_institutions", []), "identity_coauthors": entity.get("identity_coauthors", []), "target_authors_excluded": list(target.authors)}
            if entity.get("openalex_author_id"):
                args = {"author_id": entity["openalex_author_id"]}
                tool = "openalex_get_author"
            else:
                args = {"query": entity["name"], "max_records": 10}
                tool = "openalex_search_authors"
            payload = {"kind": "author", "tool": tool, "args": args, "arguments": args, "subject": entity["author_entity_id"], "paper_key": primary_paper.get("paper_key", ""), "author_name": entity["name"], "query": args.get("query", ""), "provider": tool.split("_", 1)[0], "execution": "capability_execute_required", "retry_budget": 5}
            if context:
                payload["context"] = context
            if isinstance(args.get("identity"), dict):
                payload["identity"] = args["identity"]
            payload["result_contract"] = {"required_search": True, "extract_with_model": True, "fields": ["current_title", "current_institution", "current_country", "research_topics", "top_works", "honors", "appointments", "sources"], "rule": "Open reliable pages with web_fetch. Disambiguate with the citing paper, affiliation, coauthors or ORCID. Omit uncertain facts and all target-paper authors. Do not enumerate the author's publication list; only identity, affiliation, research topics, honours and metrics are required."}
            payload["request_id"] = hashlib.sha256(json.dumps(["author", tool, entity["author_entity_id"], args], sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()[:24]
            payload["created_at"] = now()
            if payload["request_id"] not in preserved_ids:
                new_author_requests.append(payload)
        # Backup old queue, write new combined queue
        backup_path = task.provider_requests_path.with_suffix(".jsonl.bak")
        if task.provider_requests_path.exists():
            import shutil; shutil.copy2(task.provider_requests_path, backup_path)
        combined = preserved + new_author_requests
        task.provider_requests_path.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in combined) + "\n", encoding="utf-8")
        task.invalidate_pr_cache()
        print(json.dumps({"task": str(task.root), "preserved": len(preserved), "new_author": len(new_author_requests), "total": len(combined), "backup": str(backup_path), "openalex_get_author": sum(1 for r in new_author_requests if r.get("tool") == "openalex_get_author"), "openalex_search_authors": sum(1 for r in new_author_requests if r.get("tool") == "openalex_search_authors")}, ensure_ascii=False, indent=2)); return 0
    if args.command == "ingest-evidence":
        task = Task(args.task); state = task.load()
        if args.dir or (not args.request_id and not args.input):
            directory = args.dir or (task.root / "analysis" / "evidence_pending")
            summary = ingest_evidence_dir(task, state, directory, only=args.tool, skip_existing=bool(args.skip_existing))
            resume_args = argparse.Namespace(task=task.root, timeout=30, partial=False, no_tsg=False, from_evidence_dir=None)
            resume_code = run_resume(resume_args)
            summary["resume_exit_code"] = resume_code
            print(json.dumps(summary, ensure_ascii=False, indent=2)); return resume_code
        if not args.request_id or not args.input:
            print("ingest-evidence requires --request-id and --input, or --dir", file=sys.stderr); return 2
        item = ingest_evidence(task, state, args.request_id, args.input)
        print(json.dumps({"task": str(task.root), "request_id": args.request_id, "status": item.get("status")}, ensure_ascii=False, indent=2)); return 0
    if args.command == "reconcile-queue":
        task = Task(args.task); state = task.load()
        summary = reconcile_queue_with_inbox(task, state)
        print(json.dumps(summary, ensure_ascii=False, indent=2)); return 0
    if args.command == "mark-terminal":
        task = Task(args.task); state = task.load()
        summary = mark_requests_terminal(task, state, tools=tuple(args.tool), status=args.status, reason=args.reason)
        print(json.dumps({"task": str(task.root), **summary}, ensure_ascii=False, indent=2)); return 0
    if args.command == "finalize":
        task = Task(args.task); state = task.load()
        try:
            finalize_analysis(task, state)
        except ValueError as exc:
            print(str(exc), file=sys.stderr); return 2
        # Auto-patch papers.xlsx with verified JIF values from verified_data.json.
        # This runs unconditionally after finalize so the Excel always has JIF
        # even when state.json/evidence_inbox did not carry them.
        _patch_xlsx_jif_after_finalize(task.root)
        print(json.dumps({"task": str(task.root), "stage": task.load().get("stage")}, ensure_ascii=False, indent=2)); return 0
    if args.command == "check-credentials":
        # Report only whether a credential resolved and where from.  Values are
        # never printed, logged or persisted.
        rows = {
            name: {"resolved": bool(credential(name)), "source": credential_source(name)}
            for name in ("OPENALEX_API_KEY", "NCBI_API_KEY", "S2_API_KEY",
                         "TSG_PM_JSESSIONID", "TSG_SESSIONID", "TSG_SGUSER", "TSG_TSGUSER")
        }
        print(json.dumps({
            "credentials": rows,
            "openalex_identity": "api_key" if OPENALEX_API_KEY else ("mailto" if OPENALEX_MAILTO else "anonymous"),
            "provider_min_interval_seconds": PROVIDER_MIN_INTERVAL,
            "provider_max_concurrency": PROVIDER_MAX_CONCURRENCY,
        }, ensure_ascii=False, indent=2))
        return 0
    if args.command == "status":
        task = Task(args.task); state = task.load(); recovered = recover_stale_pdf_jobs(task); papers = merge_pdf_jobs(task, state); phase = update_phase_status(state, papers)
        worker = {}
        try: worker = json.loads(task.pdf_worker_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError): pass
        jobs = dict(state.get("parallel_jobs", {}))
        if worker.get("status") in {"running", "complete", "partial"}:
            jobs["pdf_acquisition"] = worker.get("status")
        print(json.dumps({"stage": state.get("stage"), "recovered_pdf_jobs": recovered, "parallel_jobs": jobs, "pdf_worker": worker, "pdf_jobs": task.pdf_jobs(), "phase_status": phase, "papers": [{"key": p.key, "direction": p.direction, "pdf_path": p.pdf_path, "pdf_status": p.pdf_status, "parse_status": p.parse_status} for p in papers]}, ensure_ascii=False, indent=2)); return 0
    task = Task(args.task); state = task.load(); papers = merge_pdf_jobs(task, state)
    if not report_manifest_valid(task, state, papers):
        print("export refused: task is not terminal or formal outputs are stale", file=sys.stderr); return 2
    print(json.dumps({"task": str(task.root), "papers": str(task.root / "papers.xlsx"), "html": str(task.root / "report.html"), "pdf": str(task.root / "report.pdf")}, ensure_ascii=False, indent=2)); return 0


if __name__ == "__main__":
    raise SystemExit(main())
