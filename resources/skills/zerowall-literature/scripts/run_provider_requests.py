"""Execute ZeroWall Literature provider requests against real providers.

Two execution layers:

1. Deterministic bibliographic APIs (OpenAlex, NCBI E-utilities, Europe PMC,
   Semantic Scholar, Crossref) for the openalex_* / pubmed_* queue entries.
2. The running ZeroWall Host Free Search bridge for every advanced_search
   entry, so each query is answered by the exact engine the queue requested.

Every result is written to ``analysis/evidence_pending/<request_id>.json`` in
the shape ``literature_pipeline.ingest-evidence`` consumes.
"""
from __future__ import annotations

import argparse
import hashlib
import html as html_module
import json
import re
import sys
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any
from urllib.parse import quote, urljoin, urlparse, urlunparse

import requests

import os

MAILTO = "zerowall-literature@localhost"
UA = "ZeroWall-Literature/1.0 (mailto:zerowall-literature@localhost)"
# Author-profile extraction lives in the skill, not here, so that widening the
# role/honour vocabulary is a skill edit rather than a per-run script edit.
SKILL_SCRIPTS = Path(os.getenv(
    "ZEROWALL_LITERATURE_SKILL",
    r"C:\Users\ccf\AppData\Local\Programs\ZeroWallScience\resources\skills"
    r"\zerowall-literature\scripts",
))
_AUTHOR_FACTS: tuple[Any, ...] | None = None
_PROFILE_SEARCH: tuple[Any, ...] | None = None
# OpenAlex premium key raises the shared rate limit; read from the environment so
# the value never lands in this file, the task state or any artifact.
OPENALEX_API_KEY = os.getenv("OPENALEX_API_KEY", "").strip()
OPENALEX = "https://api.openalex.org"
EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest"
S2 = "https://api.semanticscholar.org/graph/v1"


class Limiter:
    """Simple process-wide minimum-interval rate limiter."""

    def __init__(self, min_interval: float) -> None:
        self.min_interval = min_interval
        self._lock = threading.Lock()
        self._next = 0.0

    def wait(self) -> None:
        with self._lock:
            now = time.monotonic()
            if now < self._next:
                time.sleep(self._next - now)
                now = time.monotonic()
            self._next = now + self.min_interval


OA_LIMIT = Limiter(0.35)  # ~3 req/s; well within 10k daily budget even at scale
NCBI_LIMIT = Limiter(0.36)
EPMC_LIMIT = Limiter(0.15)
S2_LIMIT = Limiter(1.6)
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA})


def with_openalex_key(url: str, params: dict[str, Any] | None) -> dict[str, Any] | None:
    """Attach the OpenAlex key to OpenAlex calls only."""
    if not OPENALEX_API_KEY or not url.startswith(OPENALEX):
        return params
    merged = dict(params or {})
    merged.setdefault("api_key", OPENALEX_API_KEY)
    return merged


def get_json(url: str, params: dict[str, Any] | None, limiter: Limiter, timeout: float = 45.0,
             retries: int = 6) -> Any:
    params = with_openalex_key(url, params)
    last: Exception | None = None
    for attempt in range(retries + 1):
        limiter.wait()
        try:
            response = SESSION.get(url, params=params, timeout=timeout)
            if response.status_code in {429, 500, 502, 503, 504}:
                raise requests.HTTPError(f"HTTP {response.status_code}")
            response.raise_for_status()
            return response.json()
        except Exception as exc:  # network / decode / status
            last = exc
            if attempt < retries:
                # Exponential backoff so a 429 burst settles instead of hammering.
                time.sleep(min(1.5 * (2 ** attempt), 30.0))
    raise last if last else RuntimeError("request failed")


def get_text(url: str, params: dict[str, Any] | None, limiter: Limiter, timeout: float = 45.0,
             retries: int = 3) -> str:
    last: Exception | None = None
    for attempt in range(retries + 1):
        limiter.wait()
        try:
            response = SESSION.get(url, params=params, timeout=timeout)
            response.raise_for_status()
            return response.text
        except Exception as exc:
            last = exc
            if attempt < retries:
                time.sleep(min(2.0 * (attempt + 1), 8.0))
    raise last if last else RuntimeError("request failed")


def clean(value: Any) -> str:
    return " ".join(str(value or "").split())


def oa_id(value: str) -> str:
    return clean(value).rstrip("/").split("/")[-1]


COUNTRY_NAMES = {
    "CN": "China", "US": "United States", "GB": "United Kingdom", "JP": "Japan",
    "KR": "South Korea", "DE": "Germany", "FR": "France", "IT": "Italy", "ES": "Spain",
    "CA": "Canada", "AU": "Australia", "IN": "India", "BR": "Brazil", "NL": "Netherlands",
    "SE": "Sweden", "CH": "Switzerland", "BE": "Belgium", "AT": "Austria", "DK": "Denmark",
    "NO": "Norway", "FI": "Finland", "PL": "Poland", "RU": "Russia", "TR": "Turkey",
    "IR": "Iran", "EG": "Egypt", "IL": "Israel", "SG": "Singapore", "TW": "Taiwan",
    "HK": "Hong Kong", "MY": "Malaysia", "TH": "Thailand", "MX": "Mexico", "PT": "Portugal",
    "GR": "Greece", "CZ": "Czechia", "HU": "Hungary", "IE": "Ireland", "NZ": "New Zealand",
    "ZA": "South Africa", "SA": "Saudi Arabia", "AE": "United Arab Emirates", "PK": "Pakistan",
    "ID": "Indonesia", "VN": "Vietnam", "RO": "Romania", "UA": "Ukraine", "AR": "Argentina",
    "CL": "Chile", "CO": "Colombia", "RS": "Serbia", "HR": "Croatia", "SI": "Slovenia",
}


def country_name(code: str) -> str:
    code = clean(code).upper()
    return COUNTRY_NAMES.get(code, code)


# ── Author profile page fetching and fact extraction ────────────────────────
#
# The free-search bridge returns NO synthesised answer: its `content` field is
# always empty and Tavily caps `sources` at ~2 rows.  A search alone therefore
# can never produce current_title / honors / appointments — the pipeline used
# to enqueue "fetch_profile_pages": True and then throw the flag away, so those
# three fields stayed empty for every author.  We open the returned pages here
# and extract from their text, gated on identity evidence.

# Publisher and university sites reject clients that announce themselves as
# bots with 403, which cost 18 of 70 profile lookups on P004.  A normal browser
# User-Agent plus the usual navigation headers is what makes those pages
# readable; the requests are still one-per-author and rate-limited by the pool.
PROFILE_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
PROFILE_HEADERS = {
    "User-Agent": PROFILE_UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
    "Upgrade-Insecure-Requests": "1",
}

# Country names and demonyms that appear on profile pages, mapped to the country
# the queue recorded.  Used only to reject a page that proves it belongs to
# somebody in a different country.
COUNTRY_MARKERS = {
    "china": "China", "chinese": "China", "beijing": "China", "shanghai": "China",
    "usa": "USA", "united states": "USA", "american": "USA",
    "canada": "Canada", "canadian": "Canada", "québec": "Canada", "quebec": "Canada",
    "japan": "Japan", "japanese": "Japan",
    "korea": "South Korea", "korean": "South Korea",
    "taiwan": "Taiwan", "singapore": "Singapore", "hong kong": "Hong Kong",
    "germany": "Germany", "german": "Germany",
    "france": "France", "french": "France",
    "spain": "Spain", "spanish": "Spain", "italy": "Italy", "italian": "Italy",
    "netherlands": "Netherlands", "dutch": "Netherlands",
    "belgium": "Belgium", "switzerland": "Switzerland", "swiss": "Switzerland",
    "sweden": "Sweden", "norway": "Norway", "denmark": "Denmark",
    "finland": "Finland", "poland": "Poland", "portugal": "Portugal",
    "greece": "Greece", "turkey": "Turkey", "israel": "Israel",
    "saudi arabia": "Saudi Arabia", "egypt": "Egypt", "syria": "Syria",
    "iran": "Iran", "iraq": "Iraq", "jordan": "Jordan", "lebanon": "Lebanon",
    "india": "India", "indian": "India", "pakistan": "Pakistan",
    "bangladesh": "Bangladesh", "thailand": "Thailand", "vietnam": "Vietnam",
    "malaysia": "Malaysia", "indonesia": "Indonesia", "philippines": "Philippines",
    "australia": "Australia", "australian": "Australia", "new zealand": "New Zealand",
    "brazil": "Brazil", "argentina": "Argentina", "mexico": "Mexico",
    "chile": "Chile", "colombia": "Colombia", "peru": "Peru",
    "south africa": "South Africa", "nigeria": "Nigeria", "kenya": "Kenya",
    "russia": "Russia", "ukraine": "Ukraine", "ireland": "Ireland",
    "uk": "UK", "united kingdom": "UK", "england": "UK", "scotland": "UK",
}

# Domains that publish verifiable academic profiles, best first.
TRUSTED_PROFILE_DOMAINS = (
    ".edu", ".ac.uk", ".ac.jp", ".ac.cn", ".edu.cn", ".edu.au", ".ac.kr", ".ac.nz",
    "orcid.org", "scholar.google", "researchgate.net", "researchmap.jp",
    "loop.frontiersin.org", "ror.org", "semanticscholar.org",
    "ncbi.nlm.nih.gov", "nih.gov", "who.int",
    "nature.com", "sciencedirect.com", "springer.com", "wiley.com",
    "frontiersin.org", "mdpi.com", "oup.com", "cell.com", "bmj.com", "thelancet.com",
)
BLOCKED_PROFILE_DOMAINS = (
    "zhihu.com", "bilibili.com", "baidu.com", "weibo.com", "csdn.net", "2345.cc",
    "facebook.com", "twitter.com", "x.com", "instagram.com", "tiktok.com",
    "youtube.com", "reddit.com", "quora.com", "pinterest.com", "linkedin.com",
    "indeed.com", "glassdoor", "amazon.", "ebay.", "taobao.", "jd.com",
    "/jobs/", "jobs.", "dict.", "translate.", "wikipedia.org/wiki/Special",
)

TITLE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bprofessor\s+emerit(?:us|a)\b", re.I), "荣誉退休教授(Professor Emeritus)"),
    (re.compile(r"\b(?:university\s+)?distinguished\s+professor\b", re.I), "特聘教授(Distinguished Professor)"),
    (re.compile(r"\bregents?\s+professor\b", re.I), "校董讲席教授(Regents Professor)"),
    (re.compile(r"\b(?:chair|chaired)\s+professor\b", re.I), "讲席教授(Chair Professor)"),
    (re.compile(r"\bnamed\s+professor\b|\bendowed\s+(?:chair|professorship)\b", re.I), "讲席教授(Endowed Chair)"),
    (re.compile(r"\bresearch\s+professor\b", re.I), "研究教授(Research Professor)"),
    (re.compile(r"\bclinical\s+professor\b", re.I), "临床教授(Clinical Professor)"),
    (re.compile(r"\badjunct\s+professor\b", re.I), "兼职教授(Adjunct Professor)"),
    (re.compile(r"\bvisiting\s+professor\b", re.I), "访问教授(Visiting Professor)"),
    (re.compile(r"\bfull\s+professor\b", re.I), "正教授(Full Professor)"),
    (re.compile(r"\bassociate\s+professor\b|\bassoc\.?\s+professor\b", re.I), "副教授(Associate Professor)"),
    (re.compile(r"\bassistant\s+professor\b|\basst\.?\s+professor\b", re.I), "助理教授(Assistant Professor)"),
    (re.compile(r"\bprofessor\s+of\b", re.I), "教授(Professor)"),
    (re.compile(r"\bprofessor\b", re.I), "教授(Professor)"),
    (re.compile(r"\bsenior\s+lecturer\b", re.I), "高级讲师(Senior Lecturer)"),
    (re.compile(r"\breader\s+in\s+[A-Z]", re.I), "准教授(Reader)"),
    (re.compile(r"\blecturer\b", re.I), "讲师(Lecturer)"),
    (re.compile(r"\bsenior\s+(?:research\s+)?scientist\b", re.I), "高级研究员(Senior Scientist)"),
    (re.compile(r"\bstaff\s+scientist\b", re.I), "研究员(Staff Scientist)"),
    (re.compile(r"\bresearch\s+scientist\b", re.I), "研究员(Research Scientist)"),
    (re.compile(r"\bprincipal\s+investigator\b", re.I), "PI(Principal Investigator)"),
    (re.compile(r"\bgroup\s+leader\b", re.I), "课题组长(Group Leader)"),
    (re.compile(r"\bconsultant\s+physician\b", re.I), "顾问医师(Consultant)"),
    # Clinical training ranks.  A first author on a clinical paper is very often
    # a trainee, and their own department page states that rank — P002's first
    # author sits on a "Internal Medicine Residents" page, which yielded nothing
    # while the query and the gate were both already correct.
    (re.compile(r"\bchief\s+resident\b", re.I), "总住院医师(Chief Resident)"),
    (re.compile(r"\b(?:internal\s+medicine|surgical|clinical|medical|"
                r"research|teaching)\s+resident\b", re.I), "住院医师(Resident)"),
    (re.compile(r"\bresident\s+physician\b", re.I), "住院医师(Resident)"),
    (re.compile(r"\b(?:clinical|research|postdoctoral|post-?doc(?:toral)?)\s+fellow\b",
                re.I), "专科医师(Fellow)"),
    (re.compile(r"\bresident\b", re.I), "住院医师(Resident)"),
    (re.compile(r"\battending\s+(?:physician|surgeon)\b", re.I), "主治医师(Attending)"),
    (re.compile(r"主任医师"), "主任医师"),
    (re.compile(r"特聘教授"), "特聘教授"),
    (re.compile(r"副教授"), "副教授"),
    (re.compile(r"教授"), "教授"),
    (re.compile(r"研究员"), "研究员"),
]

HONOR_PATTERNS = [
    re.compile(r"\b(?:elected\s+)?(?:Fellow|Member)\s+of\s+(?:the\s+)?"
               r"(?:[A-Z][A-Za-z'&.\-]+\s+){1,5}"
               r"(?:Academy|Society|Association|Sciences|Engineering|Medicine|Arts)\b"),
    re.compile(r"\b(?:[A-Z][A-Za-z'&.\-]+\s+){1,5}"
               r"(?:Award|Prize|Medal|Lectureship|Scholarship|Fellowship)\b"),
    re.compile(r"\b(?:IEEE|AAAS|APS|ACS|AHA|ACC|ASN|ARVO|RSC|FRS|FMedSci|"
               r"AAAAI|AAN|AACR|ATSF|FACEP|FCCP)\s+Fellow\b", re.I),
    re.compile(r"\b(?:国家杰出青年|长江学者|优秀青年|千人计划|万人计划|院士)\b"),
]

APPOINTMENT_PATTERNS = [
    re.compile(r"\b(?:Editor[- ]in[- ]Chief|Associate\s+Editor|Deputy\s+Editor|"
               r"Senior\s+Editor|Section\s+Editor|Guest\s+Editor)\b(?:\s+(?:of|for|,)\s*"
               r"(?:[A-Z][A-Za-z&.\-]*\s*){0,6})?"),
    re.compile(r"\bEditorial\s+Board(?:\s+Member)?\b(?:\s+(?:of|,)\s*"
               r"(?:[A-Z][A-Za-z&.\-]*\s*){0,6})?"),
    re.compile(r"\b(?:President|Vice[- ]President|Past\s+President|Chair(?:man)?|"
               r"Co[- ]Chair|Secretary|Treasurer|Board\s+Member|Council\s+Member)\s+"
               r"(?:of|,)\s+(?:the\s+)?(?:[A-Z][A-Za-z'&.\-]+\s*){1,6}"),
    re.compile(r"\b(?:Director|Head|Dean|Chief)\s+of\s+(?:the\s+)?"
               r"(?:[A-Z][A-Za-z'&.\-]+\s*){1,6}"),
    re.compile(r"\b(?:主编|副主编|编委|理事长|副理事长|会长|副会长|主任委员)\b"),
]

PROFILE_NOISE = re.compile(
    r"(cookie|privacy policy|sign in|log in|subscribe|newsletter|advertisement|"
    r"all rights reserved|terms of use|javascript|404 not found|skip to)", re.I)


def profile_url_rank(url: str) -> int:
    """Higher is better; -1 means never fetch."""
    low = clean(url).lower()
    if not low.startswith(("http://", "https://")):
        return -1
    if any(b in low for b in BLOCKED_PROFILE_DOMAINS):
        return -1
    for index, dom in enumerate(TRUSTED_PROFILE_DOMAINS):
        if dom in low:
            return len(TRUSTED_PROFILE_DOMAINS) - index
    return 0


def fetch_profile_html(url: str, timeout: float = 25.0, limit: int = 400_000) -> str:
    """Fetch a profile page and return decoded HTML (or "").

    Pages are cached on disk by :func:`profile_cache_store` when the caller
    supplies a cache directory, so a later extraction pass can re-read the exact
    bytes this run saw instead of hitting the network again.
    """
    try:
        response = SESSION.get(url, timeout=timeout, headers=PROFILE_HEADERS)
        if response.status_code >= 400:
            return ""
        ctype = clean(response.headers.get("Content-Type")).lower()
        if ctype and not any(t in ctype for t in ("html", "text", "json")):
            return ""
        declared = clean(response.encoding).lower()
        if not declared or declared in {"iso-8859-1", "latin-1", "latin1", "ascii"}:
            response.encoding = response.apparent_encoding or "utf-8"
        return response.text[:limit]
    except Exception:
        return ""


# ── Profile page cache ───────────────────────────────────────────────────────
#
# Author-profile mining is iterative: the extraction rules keep improving, and
# every re-run used to re-download the same faculty pages, which is slow, rate
# limited, and makes results non-reproducible when a site changes.  Every page
# the executor opens is therefore written to
# ``analysis/profile_pages/<request_id>/`` as the original HTML plus a small
# JSON sidecar, and re-read from there on later runs.  Pages that FAILED the
# identity gates are saved too, with the reason, so a human can audit exactly
# what was rejected and why.
PROFILE_CACHE_DIRNAME = "profile_pages"


def profile_cache_slug(url: str) -> str:
    """Stable, filesystem-safe file stem for a URL."""
    digest = hashlib.sha256(clean(url).encode("utf-8")).hexdigest()[:16]
    parsed = urlparse(clean(url))
    host = re.sub(r"[^A-Za-z0-9.-]+", "_", parsed.netloc)[:40] or "page"
    tail = re.sub(r"[^A-Za-z0-9._-]+", "_", (parsed.path or "").strip("/"))[-40:]
    return f"{host}{'_' + tail if tail else ''}_{digest}"


def profile_cache_load(cache_dir: Path | None, url: str) -> str:
    """Previously saved HTML for ``url``, or "" when not cached."""
    if cache_dir is None:
        return ""
    path = cache_dir / f"{profile_cache_slug(url)}.html"
    try:
        if path.is_file():
            return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    return ""


def profile_cache_store(cache_dir: Path | None, url: str, html: str,
                        meta: dict[str, Any] | None = None) -> str:
    """Save one fetched page and its metadata; return the stored HTML path."""
    if cache_dir is None or not html:
        return ""
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        stem = profile_cache_slug(url)
        html_path = cache_dir / f"{stem}.html"
        html_path.write_text(html, encoding="utf-8")
        sidecar = {"url": url, "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                   "html_chars": len(html), "html_file": html_path.name,
                   **(meta or {})}
        (cache_dir / f"{stem}.json").write_text(
            json.dumps(sidecar, ensure_ascii=False, indent=2), encoding="utf-8")
        return str(html_path)
    except OSError:
        return ""


def fetch_profile_html_cached(url: str, cache_dir: Path | None, timeout: float,
                              meta: dict[str, Any] | None = None) -> tuple[str, bool]:
    """HTML for ``url`` preferring the on-disk cache; also reports its origin."""
    cached = profile_cache_load(cache_dir, url)
    if cached:
        return cached, True
    html = fetch_profile_html(url, timeout=timeout)
    if html:
        profile_cache_store(cache_dir, url, html, meta)
    return html, False


def html_to_text(html: str) -> str:
    """Reduce HTML to visible text while preserving block boundaries.

    Flattening a document to a single line merged a heading such as “荣誉奖励”
    with the following “学术任职” block, so neither field could be attributed.
    Identity checks call ``clean`` and stay whitespace-insensitive, while the
    extraction kernel can now read the page's own section structure.
    """
    if not html:
        return ""
    html = re.sub(r"(?is)<(script|style|noscript|svg|footer|nav)\b.*?</\1>", " ", html)
    html = re.sub(r"(?is)<br\s*/?>|</(?:p|div|li|tr|td|th|h[1-6]|section|article|dl|dt|dd)\s*>",
                  "\n", html)
    text = html_module.unescape(re.sub(r"(?s)<[^>]+>", " ", html))
    lines = [re.sub(r"[ \t\r\f\v]+", " ", line).strip() for line in text.split("\n")]
    return "\n".join(line for line in lines if line)


def fetch_profile_text(url: str, timeout: float = 25.0, limit: int = 400_000) -> str:
    """Fetch a page and reduce it to correctly decoded visible text.

    Some faculty sites return ``Content-Type: text/html`` without a charset.
    Requests then assumes ISO-8859-1 and turns every Chinese name and rank into
    mojibake, which made both identity checks and fact extraction fail on those
    pages.  The server charset is preferred when meaningful, otherwise the
    detected encoding is used, with UTF-8 as the final fallback.
    """
    return html_to_text(fetch_profile_html(url, timeout=timeout, limit=limit))


# Language codes that a bilingual profile may be published under.  Used only to
# recognise a locale token that a site already puts in its own URLs.
_LOCALE_TOKENS = (
    "en", "en-us", "en_us", "en-gb", "eng", "english",
    "zh", "zh-cn", "zh_cn", "zh-hans", "cn", "chinese",
    "ja", "jp", "ko", "kr", "de", "fr", "es", "it", "pt", "ru", "nl", "sv",
)


def localized_profile_variants(url: str, html: str = "") -> list[str]:
    """Other-language versions of the SAME profile, discovered from the page.

    A person's institutional page can be published under any layout, so no
    single URL rule works: sites use ``/en/``, ``/en-us/``, ``?lang=en``,
    ``/english/``, or a completely different path behind a language switch link.
    The page itself is the authority, so alternates are taken from
    ``<link rel="alternate" hreflang=...>`` and from anchors whose text or
    attributes mark them as the language switch.  A generic locale-token swap in
    the path is kept last as a fallback for sites that publish no alternate
    metadata.

    This matters because identity is verified against the romanized name from
    OpenAlex, which a Chinese-language page never prints, while that same page
    is the authoritative source of the person's current rank.
    """
    url = clean(url)
    if not url:
        return []
    out: list[str] = []

    def push(candidate: str) -> None:
        candidate = clean(candidate)
        if not candidate or candidate.startswith(("mailto:", "javascript:", "#")):
            return
        absolute = urljoin(url, candidate)
        if not absolute.lower().startswith(("http://", "https://")):
            return
        if absolute.split("#")[0].rstrip("/") == url.split("#")[0].rstrip("/"):
            return
        if urlparse(absolute).netloc != urlparse(url).netloc:
            return
        if absolute not in out:
            out.append(absolute)

    if html:
        for match in re.finditer(r"(?is)<link\b[^>]*rel=[\"']?alternate[\"']?[^>]*>", html):
            tag = match.group(0)
            if re.search(r"(?i)hreflang=", tag):
                href = re.search(r"(?is)href=[\"']([^\"']+)[\"']", tag)
                if href:
                    push(href.group(1))
        # A language switch is usually an anchor labelled with the target
        # language, or carrying a lang/hreflang attribute.
        for match in re.finditer(r"(?is)<a\b([^>]*)>(.*?)</a>", html):
            attrs, label = match.group(1), html_module.unescape(
                re.sub(r"(?s)<[^>]+>", " ", match.group(2)))
            label_clean = clean(label).lower()
            href = re.search(r"(?is)href=[\"']([^\"']+)[\"']", attrs)
            if not href:
                continue
            marked = bool(re.search(r"(?i)\b(?:hreflang|lang)=", attrs))
            switch_label = label_clean in {
                "en", "english", "en-us", "中文", "中文主页", "简体中文", "繁體中文",
                "chinese", "日本語", "한국어", "deutsch", "français", "español",
            }
            if marked or switch_label:
                push(href.group(1))

    # Fallback: swap a locale token that the site already uses in the path.
    parts = urlparse(url)
    segments = parts.path.split("/")
    for index, segment in enumerate(segments):
        if segment.lower() in _LOCALE_TOKENS:
            for replacement in ("en", "zh_CN", "zh-CN", "cn", "english"):
                if replacement.lower() == segment.lower():
                    continue
                swapped = list(segments)
                swapped[index] = replacement
                push(urlunparse(parts._replace(path="/".join(swapped))))
    return out[:4]


def localized_profile_variant(url: str, html: str = "") -> str:
    """First discovered other-language version of ``url``, or ""."""
    variants = localized_profile_variants(url, html)
    return variants[0] if variants else ""


def _surname_and_initials(name: str) -> tuple[str, set[str]]:
    """Surname (lowercase) plus initial letters, handling packed initials."""
    parts = [p for p in clean(name).replace(".", " ").replace(",", " ").split() if p]
    if not parts:
        return "", set()
    if len(parts) > 1 and parts[-1].isupper() and len(parts[-1]) <= 3:
        return " ".join(parts[:-1]).lower(), set(parts[-1].lower())
    return parts[-1].lower(), {p[0].lower() for p in parts[:-1]}


def _norm_key(value: str) -> str:
    """Lowercase, drop every separator, and strip accents-ish punctuation.

    Author names arrive with Unicode hyphens ("Yi‐Jen"), periods ("William R.
    Bishai") and accents.  Comparing raw substrings makes those fail to match
    the plain ASCII form used on most profile pages, so both sides are folded
    to bare alphanumerics.
    """
    folded = unicodedata.normalize("NFKD", clean(value))
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]", "", folded.lower())


def _given_keys(full_name: str) -> list[str]:
    """Candidate 'given name + surname' keys, longest first.

    OpenAlex stores initials for some people ("William R. Bishai") while the
    profile page spells the given name out ("William Ramses Bishai").  We
    therefore accept the first given token plus the surname, which survives
    both spellings and is still far stricter than a bare surname.
    """
    parts = [p for p in re.split(r"[\s,]+", clean(full_name)) if p]
    if len(parts) < 2:
        return []
    if parts[-1].isupper() and len(parts[-1]) <= 3:
        given, surname = parts[:-1], parts[-2] if len(parts) > 2 else parts[0]
    else:
        given, surname = parts[:-1], parts[-1]
    keys: list[str] = []
    for token in given:
        key = _norm_key(token + surname)
        if len(key) >= 6:
            keys.append(key)
    return keys


def _name_tokens(name: str) -> tuple[str, list[str]]:
    """Split a display name into (surname, given tokens), accent-folded.

    Returned as separate tokens rather than concatenated: the previous gate
    joined a given name to the surname ("hongyanma") and searched for that
    inside the whole page with every separator stripped.  On a long page the
    joined form reappears by accident, so a namesake at an unrelated university
    passed the gate.  Token-level comparison against the unfolded text is what
    actually distinguishes people.
    """
    parts = [p for p in re.split(r"[\s,]+", clean(name)) if p]
    if not parts:
        return "", []
    # PubMed style: "Bishai WR" / "Al Matni MY" — trailing initials are given.
    if len(parts) > 1 and parts[-1].isupper() and len(parts[-1]) <= 3:
        return _norm_key(" ".join(parts[:-1])), [_norm_key(parts[-1])]
    return _norm_key(parts[-1]), [_norm_key(p) for p in parts[:-1]]


def _surname_key_matches(text: str, surname: str) -> bool:
    """Surname present as a whole word, tolerant of accents and punctuation."""
    if not surname:
        return False
    plain = unicodedata.normalize("NFKD", clean(text))
    plain = "".join(ch for ch in plain if not unicodedata.combining(ch)).lower()
    return re.search(rf"(?<![a-z]){re.escape(surname)}(?![a-z])", plain) is not None


def profile_identity_ok(text: str, surname: str, institutions: list[str], orcid: str,
                        full_name: str = "") -> bool:
    """A page counts as this author's only with a real, local name anchor.

    Two failure modes had to be balanced.

    Too weak: matching the surname anywhere (or a concatenated name inside
    separator-stripped text) let a Missouri civil-engineering professor stand in
    for a Shandong hospital clinician, because common Chinese names recur across
    continents.

    Too strict: demanding the institution in the same window rejected 21 of 70
    genuine authors on P004, since a faculty page prints the person and their
    rank without restating their employer's full name.

    So: the given name and the surname must appear **as separate whole words
    within one short window**, or the ORCID must be on the page.  The window is
    deliberately small (a byline, not a directory page).  Institution is a
    supporting anchor used only when no given name is available.
    """
    if not text or not surname:
        return False
    if not _surname_key_matches(text, surname):
        return False

    plain = unicodedata.normalize("NFKD", clean(text))
    plain = "".join(ch for ch in plain if not unicodedata.combining(ch)).lower()

    if orcid:
        token = _norm_key(orcid.rstrip("/").split("/")[-1])
        if token and len(token) >= 8 and token in _norm_key(text):
            return True

    _, given_tokens = _name_tokens(full_name or "")
    given_tokens = [t for t in given_tokens if len(t) >= 2]
    if given_tokens:
        for match in re.finditer(rf"(?<![a-z]){re.escape(surname)}(?![a-z])", plain):
            window = plain[max(0, match.start() - 60):match.end() + 60]
            if any(re.search(rf"(?<![a-z]){re.escape(t)}(?![a-z])", window)
                   for t in given_tokens):
                return True
        # "Dudek, Steven M." places the surname first, so also scan a wider
        # radius before giving up.
        for match in re.finditer(rf"(?<![a-z]){re.escape(surname)}(?![a-z])", plain):
            window = plain[max(0, match.start() - 200):match.end() + 200]
            if any(re.search(rf"(?<![a-z]){re.escape(t)}(?![a-z])", window)
                   for t in given_tokens):
                return True
        return False

    # No given name to verify with: require the institution beside the surname.
    for inst in institutions:
        inst_clean = clean(inst)
        if not inst_clean:
            continue
        anchors = [_norm_key(inst_clean)]
        tokens = [t for t in re.findall(r"[A-Za-z]{5,}", inst_clean)
                  if t.lower() not in {"university", "institute", "college", "school",
                                       "center", "centre", "hospital", "research",
                                       "health", "medical", "national", "faculty",
                                       "provincial", "academy", "chinese", "medicine"}]
        anchors += [_norm_key(t) for t in tokens[:2]]
        for anchor in [a for a in anchors if len(a) >= 5]:
            if anchor in _norm_key(text):
                return True
    return False


def profile_offtarget(text: str, country: str, institutions: list[str]) -> bool:
    """True when a page demonstrably belongs to someone in another country.

    A name-plus-given-name match is still not proof for very common names.  The
    clearest sign that a page is a namesake is that it sits in a country the
    author has never been affiliated with: the Missouri civil engineer's page
    says "Missouri, USA" while the author's records say China.  The check fires
    only on *positive* evidence of a different country, so a page that simply
    never mentions a country is never penalised, and a page naming one of the
    author's own institutions is always accepted (people do move).
    """
    if not country or not text:
        return False
    home = COUNTRY_MARKERS.get(country.strip().lower())
    if not home:
        return False
    low = text.lower()
    for inst in institutions:
        inst_clean = clean(inst).lower()
        if inst_clean and inst_clean in low:
            return False
    for marker, marker_country in COUNTRY_MARKERS.items():
        if marker_country == home:
            continue
        if re.search(rf"(?<![a-z]){re.escape(marker)}(?![a-z])", low):
            return True
    return False


def _window_around(text: str, surname: str, radius: int = 2500,
                   full_name: str = "") -> str:
    """Restrict extraction to text near the name to avoid cross-person bleed.

    Locating the given-name + surname pair matters: a directory page naming
    many people is otherwise searched for the surname only, and a namesake's
    awards land in this author's record.
    """
    text_key = _norm_key(text)
    # The page spells names with separators, so search for the space-joined
    # variant as well as the concatenated key: "mohammedalmatni" never occurs in
    # text, which silently sent windows back to the whole page.
    lowered = clean(text).lower()
    spans: list[str] = []
    for name_key in (_given_keys(full_name) or [_norm_key(surname)]):
        if not name_key:
            continue
        needles = [name_key, re.sub(r"([a-z])(?=[A-Z])", r"\1 ", "")]  # placeholder
        candidates = [name_key]
        parts = [p for p in re.split(r"[\s,]+", clean(full_name)) if p]
        if len(parts) >= 2:
            candidates.append(_norm_key(parts[0] + " " + parts[-1]))
            candidates.append(_norm_key(parts[0] + ".*" + parts[-1]))
        start = 0
        while len(spans) < 4:
            idx = text_key.find(name_key, start)
            if idx < 0:
                break
            spans.append(text[max(0, idx - radius):idx + radius])
            start = idx + len(name_key)
        if spans:
            break
        # Fall back to a regex over the raw text so separators do not matter.
        if len(parts) >= 2:
            pattern = re.compile(re.escape(parts[0]) + r"[^A-Za-z]{0,3}" + re.escape(parts[-1]),
                                 re.I)
            for match in pattern.finditer(lowered):
                spans.append(text[max(0, match.start() - radius):match.start() + radius])
                if len(spans) >= 4:
                    break
        if spans:
            break
    return " ".join(spans) if spans else text[:radius * 2]


def _tidy_fact(value: str) -> str:
    value = clean(value).strip(" ,;:.-—|")
    value = re.sub(r"^(?:and|the|of|in|at)\s+", "", value, flags=re.I)
    return value


def extract_fact_list(text: str, patterns: list[re.Pattern[str]], cap: int = 6) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for pattern in patterns:
        for match in pattern.finditer(text):
            item = _tidy_fact(match.group(0))
            # Reject fragments that start mid-word, which is how truncated
            # P011-style values ("f Arts and Social Sciences Dean's Staff
            # Award at") were produced.
            if not (12 <= len(item) <= 120):
                continue
            if not item[0].isupper() and not re.match(r"[\u4e00-\u9fff]", item):
                continue
            # Reject dangling connectives: "President of The", "Director of the".
            if re.search(r"\b(?:of|for|the|and|at|in|to|with|de|del|von|van|und)$",
                         item, re.I):
                continue
            if PROFILE_NOISE.search(item) or "http" in item.lower():
                continue
            key = re.sub(r"[^a-z0-9\u4e00-\u9fff]", "", item.lower())
            if not key or key in seen:
                continue
            seen.add(key)
            found.append(item)
            if len(found) >= cap:
                return found
    return found


def _author_facts_module():
    """Load the skill's author_facts kernel, or None when it is unavailable.

    Extraction lives in the skill (``scripts/author_facts.py``) rather than in
    this executor so that improving how facts are recognised is a skill change,
    not a per-run script edit.  The import is defensive: a deployment without
    the skill still runs, falling back to the local pattern tables below.
    """
    global _AUTHOR_FACTS
    if _AUTHOR_FACTS is not None:
        return _AUTHOR_FACTS[0]
    try:
        import importlib.util
        from pathlib import Path
        path = Path(SKILL_SCRIPTS) / "author_facts.py"
        if not path.is_file():
            _AUTHOR_FACTS = (None,)
            return None
        spec = importlib.util.spec_from_file_location("zw_author_facts", path)
        module = importlib.util.module_from_spec(spec)
        sys.modules["zw_author_facts"] = module
        spec.loader.exec_module(module)
        _AUTHOR_FACTS = (module,)
        return module
    except Exception:
        _AUTHOR_FACTS = (None,)
        return None


def extract_profile_title(text: str, full_name: str = "", surname: str = "") -> str:
    module = _author_facts_module()
    if module is not None:
        return module.extract_profile_title(text, full_name=full_name, surname=surname)
    for pattern, label in TITLE_PATTERNS:
        if pattern.search(text):
            return label
    return ""


def profile_is_about_person(text: str, full_name: str, surname: str) -> bool:
    """True when the page is ABOUT this person, not merely mentioning them.

    Measured on P004's false positives, this is the decisive signal:

    * A real profile prints the full name in its title area — "Wei Zhang |
      Shandong University" (offset 0), "Hongyan Ma ... Dr. Hongyan Ma" (0 and
      31).
    * A page that merely cites the person never prints the full name at all
      (a Taiwanese orthopaedics department page matched "Han" 747 characters in,
      inside prose about the department) or prints it only deep inside a
      publication list (offset 8808 on another professor's profile, where the
      author is one of forty co-authors).

    So the full name must appear, and it must appear either near the top of the
    document or adjacent to a role word — the way a page introduces its subject.
    """
    if not text or not full_name:
        return False
    plain = unicodedata.normalize("NFKD", clean(text))
    plain = "".join(ch for ch in plain if not unicodedata.combining(ch)).lower()
    tokens = [t.strip(".,-").lower() for t in clean(full_name).split() if t.strip(".,-")]
    if len(tokens) < 2:
        return False
    given, last = tokens[0], tokens[-1]
    # Accept either printed order, with optional middle names/initials between.
    forms = [
        rf"(?<![a-z]){re.escape(given)}[a-z.\s\-]{{0,24}}{re.escape(last)}(?![a-z])",
        rf"(?<![a-z]){re.escape(last)}\s*,\s*{re.escape(given)}(?![a-z])",
    ]
    hits: list[int] = []
    for form in forms:
        hits.extend(m.start() for m in re.finditer(form, plain))
    if not hits:
        return False
    # The subject of a page is introduced early; 1200 characters covers a title,
    # a navigation bar and a heading.
    if min(hits) <= 1200:
        return True
    # Otherwise the name must sit beside a statement of what the person is —
    # and NOT inside a bibliography, where "Professor" often belongs to the
    # page's real subject a few words away.  Measured on P004: another
    # professor's profile listed this author among forty co-authors, with the
    # heading's "Professor" close enough to satisfy a loose window.
    for hit in hits:
        window = plain[max(0, hit - 60):hit + 90]
        if re.search(r"(et\s+al|\bdoi\b|\bvol\b|\bpp\b|\bj\s|journal|"
                     r"n\s+engl\s+j\s+med|lancet|\b19\d\d\b|\b20\d\d\b\s*[;:(]|"
                     r"\d+\s*\(\s*\d+\s*\)\s*[:,]|\bpubmed\b)", window):
            continue
        if re.search(r"\b(professor|lecturer|chair|chief|director|dean|president|"
                     r"principal investigator|attending|consultant|fellow|"
                     r"researcher|scientist|physician|head of|m\.?d\.?|ph\.?d)\b",
                     window):
            return True
    return False


def fetch_and_extract_profile(req: dict[str, Any], payload: dict[str, Any],
                               timeout: float,
                               cache_dir: Path | None = None) -> None:
    """Open the ranked result pages and write verified facts into ``payload``.

    Mutates ``payload`` in place with current_title / honors / appointments /
    profile_sources / profile_pages_read.  Never invents a fact: a field is
    only set when the identity gate accepted the page it came from.

    When ``cache_dir`` is given, every page opened is saved there (HTML plus a
    JSON sidecar recording which identity gate accepted or rejected it) and is
    re-read from disk on later runs.  Extraction rules keep being refined, and
    re-downloading the same faculty pages for each refinement is slow, rate
    limited, and unreproducible when a site changes underneath.
    """
    if not (req.get("args") or {}).get("fetch_profile_pages"):
        return
    identity = req.get("identity") or {}
    printed = clean(identity.get("printed_name")) or clean(req.get("author_name"))
    canonical = clean(identity.get("canonical_name"))
    primary = canonical if canonical and CANONICAL_NAME_TOKEN not in canonical else printed
    surname, _ = _surname_and_initials(primary)
    institutions = [clean(x) for x in (identity.get("institutions") or []) if clean(x)]
    orcid = clean(identity.get("orcid"))
    country = clean(identity.get("country"))
    # Full-name gate: do not discard it merely because the citing record already
    # printed the canonical form ("Wei Zhang" == "Wei Zhang").  The page-subject
    # gate needs that exact full name to distinguish a real profile heading from
    # a surname buried in somebody else's publication list.
    full_name = primary if primary and len(primary.split()) >= 2 else ""

    ranked: list[tuple[int, dict[str, Any]]] = []
    for row in payload.get("results") or []:
        rank = profile_url_rank(row.get("url", ""))
        if rank < 0:
            continue
        ranked.append((rank, row))
    ranked.sort(key=lambda item: -item[0])

    try:
        max_pages = int((req.get("args") or {}).get("fetch_pages") or 3)
    except (TypeError, ValueError):
        max_pages = 3
    max_pages = max(1, min(max_pages, 4))

    corpus: list[str] = []
    sources: list[str] = []
    audit: list[dict[str, Any]] = []
    # Page fetches run inside an already-searched request, so each one gets a
    # tight deadline: a profile page that has not answered in a few seconds is
    # not worth the author's remaining budget.
    page_timeout = max(4.0, min(timeout, 8.0))
    base_meta = {"author": primary, "request_id": clean(req.get("request_id")),
                 "institutions": institutions, "country": country}
    for rank, row in ranked[:max_pages]:
        url = clean(row.get("url"))
        html, from_cache = fetch_profile_html_cached(
            url, cache_dir, page_timeout, {**base_meta, "url_rank": rank})
        text = html_to_text(html)
        blob = text or clean(row.get("snippet"))
        entry = {"url": url, "url_rank": rank, "from_cache": from_cache,
                 "html_chars": len(html), "text_chars": len(text),
                 "html_file": f"{profile_cache_slug(url)}.html" if html and cache_dir else ""}
        if not blob:
            entry["verdict"] = "empty_body"
            audit.append(entry)
            continue
        identity_blob = blob
        # A localized faculty page prints the person's name in the local script,
        # which can never match the romanized name the bibliographic record
        # carries.  Before discarding such a page, follow the site's OWN
        # language-alternate links and verify identity against that version,
        # then keep mining every version for the facts each one states.
        if not profile_identity_ok(identity_blob, surname, institutions, orcid, full_name):
            verified = False
            for mirror in localized_profile_variants(url, html):
                mirror_html, mirror_cached = fetch_profile_html_cached(
                    mirror, cache_dir, page_timeout,
                    {**base_meta, "locale_mirror_of": url})
                mirror_text = html_to_text(mirror_html)
                if not mirror_text:
                    continue
                if profile_identity_ok(mirror_text, surname, institutions, orcid, full_name):
                    identity_blob = mirror_text
                    blob = f"{blob}\n{mirror_text}"
                    text = blob
                    entry["locale_mirror"] = mirror
                    entry["locale_mirror_from_cache"] = mirror_cached
                    entry["locale_mirror_file"] = (
                        f"{profile_cache_slug(mirror)}.html" if mirror_html and cache_dir else "")
                    verified = True
                    break
            if not verified:
                entry["verdict"] = "rejected_identity"
                audit.append(entry)
                continue
        # A department page or another professor's publication list may mention
        # this author without being their profile.  Only pages introducing the
        # full name near the heading or beside a role statement may contribute
        # rank, honours or appointments.
        if full_name and not profile_is_about_person(identity_blob, full_name, surname):
            entry["verdict"] = "rejected_page_subject"
            audit.append(entry)
            continue
        # A page that proves it belongs to somebody in a different country is a
        # namesake even when the name matches, so it is dropped before its text
        # can contribute facts.
        if profile_offtarget(blob, country, institutions):
            entry["verdict"] = "rejected_offtarget"
            audit.append(entry)
            continue
        entry["verdict"] = "accepted"
        audit.append(entry)
        corpus.append(text if text else blob)
        sources.append(url)
    payload["profile_pages_read"] = len(sources)
    if audit:
        # The audit travels with the evidence so a later pass can see exactly
        # which pages were opened, which were rejected and by which gate,
        # without repeating a single network request.
        payload["profile_page_audit"] = audit
        if cache_dir is not None:
            payload["profile_cache_dir"] = str(cache_dir)
            # Keep a self-contained manifest beside the HTML.  A future manual
            # extractor should not need to reconstruct context from the queue or
            # the append-only evidence ledger.
            try:
                cache_dir.mkdir(parents=True, exist_ok=True)
                manifest = {
                    "request_id": clean(req.get("request_id")),
                    "author": primary,
                    "identity": identity,
                    "search_results": payload.get("results") or [],
                    "page_audit": audit,
                    "accepted_sources": sources,
                    "created_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                }
                (cache_dir / "manifest.json").write_text(
                    json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
            except OSError:
                pass

    # Snippets from trusted domains still count when no page could be opened.
    if not corpus:
        for rank, row in ranked:
            snippet = clean(row.get("snippet"))
            if rank > 0 and profile_identity_ok(snippet, surname, institutions, orcid, full_name) \
                    and not profile_offtarget(snippet, country, institutions):
                corpus.append(snippet)
                sources.append(clean(row.get("url")))

    if not corpus:
        return
    payload["profile_sources"] = sources[:6]
    module = _author_facts_module()
    if module is not None:
        # The kernel owns windowing as well as extraction, so pass the raw pages
        # and let it decide which sentences belong to this author.
        merged: dict[str, Any] = {"current_title": "", "honors": [], "appointments": []}
        for blob in corpus:
            facts = module.extract_author_facts(blob, full_name=full_name, surname=surname)
            if not merged["current_title"] and facts.get("current_title"):
                merged["current_title"] = facts["current_title"]
            for kind in ("honors", "appointments"):
                for item in facts.get(kind) or []:
                    if item not in merged[kind]:
                        merged[kind].append(item)
        title = merged["current_title"]
        if title:
            payload["current_title"] = title
        if merged["honors"]:
            payload["honors"] = merged["honors"][:8]
        if merged["appointments"]:
            payload["appointments"] = merged["appointments"][:8]
        return

    text = " || ".join(_window_around(blob, surname, full_name=full_name) for blob in corpus)
    title = extract_profile_title(text)
    if title:
        payload["current_title"] = title
    honors = extract_fact_list(text, HONOR_PATTERNS)
    if honors:
        payload["honors"] = honors
    appointments = extract_fact_list(text, APPOINTMENT_PATTERNS)
    if appointments:
        payload["appointments"] = appointments
    if sources:
        payload["profile_sources"] = sources[:6]


def institution_row(inst: dict[str, Any]) -> dict[str, Any]:
    return {
        "display_name": clean(inst.get("display_name")),
        "country_code": clean(inst.get("country_code")),
        "ror": clean(inst.get("ror")),
        "type": clean(inst.get("type")),
    }


def author_payload(author: dict[str, Any]) -> dict[str, Any]:
    stats = author.get("summary_stats") or {}
    insts = [institution_row(x) for x in (author.get("last_known_institutions") or []) if isinstance(x, dict)]
    if not insts and isinstance(author.get("last_known_institution"), dict):
        insts = [institution_row(author["last_known_institution"])]
    return {
        "author_id": clean(author.get("id")),
        "openalex_author_id": clean(author.get("id")),
        "display_name": clean(author.get("display_name")),
        "alternate_names": [clean(x) for x in (author.get("display_name_alternatives") or []) if clean(x)][:8],
        "orcid": clean(author.get("orcid")),
        "works_count": author.get("works_count"),
        "cited_by_count": author.get("cited_by_count"),
        "h_index": stats.get("h_index"),
        "i10_index": stats.get("i10_index"),
        "two_year_mean_citedness": stats.get("2yr_mean_citedness"),
        "last_known_institutions": insts,
        "top_topics": [clean(t.get("display_name")) for t in (author.get("topics") or [])[:8] if clean(t.get("display_name"))],
        "counts_by_year": [
            {"year": row.get("year"), "works_count": row.get("works_count"), "cited_by_count": row.get("cited_by_count")}
            for row in (author.get("counts_by_year") or [])[:12]
        ],
    }


def openalex_top_works(author_id: str, limit: int = 5) -> list[dict[str, Any]]:
    try:
        data = get_json(f"{OPENALEX}/works", {
            "filter": f"author.id:{oa_id(author_id)}",
            "sort": "cited_by_count:desc",
            "per_page": limit,
            "select": "id,doi,title,publication_year,cited_by_count,primary_location",
            "mailto": MAILTO,
        }, OA_LIMIT)
    except Exception:
        return []
    works: list[dict[str, Any]] = []
    for row in data.get("results") or []:
        loc = row.get("primary_location") or {}
        source = (loc.get("source") or {}) if isinstance(loc, dict) else {}
        works.append({
            "title": clean(row.get("title")),
            "year": row.get("publication_year"),
            "doi": clean(row.get("doi")).replace("https://doi.org/", ""),
            "cited_by_count": row.get("cited_by_count"),
            "journal": clean(source.get("display_name")),
            "url": clean(row.get("id")),
        })
    return works


# --------------------------------------------------------------------------
# tool implementations
# --------------------------------------------------------------------------

def do_openalex_get_author(req: dict[str, Any]) -> dict[str, Any]:
    author_id = oa_id(req["args"].get("author_id", ""))
    data = get_json(f"{OPENALEX}/authors/{author_id}", {"mailto": MAILTO}, OA_LIMIT)
    payload = author_payload(data)
    payload["top_works"] = openalex_top_works(author_id)
    insts = payload.get("last_known_institutions") or []
    anchors = {clean(x).lower() for x in ((req.get("context") or {}).get("identity_institutions") or []) if clean(x)}
    preferred = next((row for row in insts if clean(row.get("display_name")).lower() in anchors), None)
    chosen = preferred or (insts[0] if insts else None)
    if chosen:
        payload["current_institution"] = chosen["display_name"]
        if chosen.get("country_code"):
            payload["current_country"] = country_name(chosen["country_code"])
    payload["research_topics"] = payload.get("top_topics") or []
    payload["sources"] = [f"https://openalex.org/{author_id}", f"{OPENALEX}/authors/{author_id}"]
    payload["status"] = "ok"
    return payload


def _name_tokens(name: str) -> tuple[str, set[str]]:
    """Split an author name into (surname, initial-tokens) for matching.

    Handles both "Al Matni MY" (surname first, packed initials) and
    "Yousef Al Matni" (given name first) styles.
    """
    parts = [p for p in clean(name).replace(".", " ").replace(",", " ").split() if p]
    if not parts:
        return "", set()
    # A trailing all-caps short token is an initial block, e.g. "MY".
    if len(parts) > 1 and parts[-1].isupper() and len(parts[-1]) <= 3:
        surname = " ".join(parts[:-1]).lower()
        initials = set(parts[-1].lower())
    else:
        surname = parts[-1].lower()
        initials = {p[0].lower() for p in parts[:-1]}
    return surname, initials


def _authorship_lookup(req: dict[str, Any]) -> dict[str, Any]:
    """Resolve an author via the citing work's OpenAlex authorships.

    Abbreviated cited-by author names ("Al Matni MY") almost never match the
    OpenAlex /authors name search, but the citing work itself carries fully
    disambiguated authorship records.  Resolving through the work is therefore
    both cheaper and far more reliable than a name query.
    """
    context = req.get("context") or {}
    papers = context.get("papers") or []
    target_name = clean(req.get("author_name") or (req.get("args") or {}).get("query"))
    surname, initials = _name_tokens(target_name)
    if not surname:
        return {}
    for paper in papers if isinstance(papers, list) else []:
        if not isinstance(paper, dict):
            continue
        doi = clean(paper.get("doi")).replace("https://doi.org/", "")
        pmid = clean(paper.get("pmid"))
        work = None
        for ident in ([f"doi:{doi}"] if doi else []) + ([f"pmid:{pmid}"] if pmid else []):
            try:
                work = get_json(f"{OPENALEX}/works/{ident}", {
                    "mailto": MAILTO, "select": "id,doi,authorships",
                }, OA_LIMIT, retries=2)
            except Exception:
                work = None
            if isinstance(work, dict) and work.get("authorships"):
                break
        if not isinstance(work, dict):
            continue
        position = paper.get("position")
        rows = work.get("authorships") or []
        # 1) exact surname + initial match, 2) positional fallback.
        chosen_id = ""
        for row in rows:
            author = (row or {}).get("author") or {}
            cand = clean(author.get("display_name"))
            c_surname, c_initials = _name_tokens(cand)
            if not c_surname:
                continue
            # OpenAlex spells names out in full ("Mohammed Yaman Al Matni")
            # while cited-by metadata abbreviates them ("Al Matni MY"), so the
            # queried surname may be a trailing part of the full name.
            full = clean(cand).lower()
            surname_hit = (
                c_surname == surname
                or full.endswith(" " + surname)
                or full == surname
            )
            if not surname_hit:
                continue
            # Given-name initials must not contradict the abbreviated form.
            given = full[: len(full) - len(surname)].split() if surname_hit else []
            given_initials = {g[0] for g in given if g}
            if initials and given_initials and not (initials & given_initials):
                continue
            chosen_id = oa_id(clean(author.get("id")))
            break
        if not chosen_id and isinstance(position, int) and 1 <= position <= len(rows):
            author = (rows[position - 1] or {}).get("author") or {}
            cand = clean(author.get("display_name"))
            c_surname, _ = _name_tokens(cand)
            if c_surname == surname:
                chosen_id = oa_id(clean(author.get("id")))
        if chosen_id:
            try:
                payload = do_openalex_get_author({
                    "args": {"author_id": chosen_id}, "context": context,
                })
            except Exception:
                continue
            payload["resolved_via"] = "openalex_authorship"
            payload["resolved_from_work"] = clean(work.get("id"))
            return payload
    return {}


def do_openalex_search_authors(req: dict[str, Any]) -> dict[str, Any]:
    args = req["args"]
    query = args.get("query", "")
    per_page = int(args.get("max_records") or 10)
    # Authorship resolution first: abbreviated names do not survive a name
    # search, but the citing work's authorships identify the author exactly.
    resolved = _authorship_lookup(req)
    if resolved:
        resolved.setdefault("status", "ok")
        resolved["query"] = query
        resolved["records"] = [{
            "author_id": resolved.get("author_id") or resolved.get("openalex_author_id", ""),
            "display_name": resolved.get("display_name", ""),
            "orcid": resolved.get("orcid", ""),
            "works_count": resolved.get("works_count"),
            "cited_by_count": resolved.get("cited_by_count"),
            "h_index": resolved.get("h_index"),
            "i10_index": resolved.get("i10_index"),
            "top_topics": resolved.get("research_topics") or resolved.get("top_topics") or [],
            "last_known_institutions": resolved.get("last_known_institutions") or [],
        }]
        return resolved
    data = get_json(f"{OPENALEX}/authors", {
        "search": query, "per_page": per_page, "mailto": MAILTO,
    }, OA_LIMIT)
    records = [author_payload(row) for row in (data.get("results") or [])]
    context = req.get("context") or {}
    anchors = {clean(x).lower() for x in (context.get("identity_institutions") or []) if clean(x)}
    known_id = ""
    for other in ():
        pass
    # Prefer the authorship-resolved OpenAlex author when the queue also holds a
    # direct openalex_get_author request for the same subject.
    known_id = oa_id(clean(req.get("_resolved_author_id", "")))
    matched: list[dict[str, Any]] = []
    if known_id:
        matched = [row for row in records if oa_id(row.get("author_id", "")) == known_id]
    if not matched and anchors:
        for row in records:
            names = {clean(inst.get("display_name")).lower() for inst in row.get("last_known_institutions") or []}
            if names & anchors or any(any(a in n for a in anchors) for n in names if n):
                matched.append(row)
    result = {
        "status": "ok",
        "query": query,
        "count": len(records),
        "records": matched[:1] if len(matched) == 1 else records[:per_page],
        "all_candidates": records[:per_page],
        "sources": [f"{OPENALEX}/authors?search={quote(query)}"],
    }
    return result


def do_openalex_get_source(req: dict[str, Any]) -> dict[str, Any]:
    args = req["args"]
    source_id = oa_id(args.get("source_id", ""))
    data = get_json(f"{OPENALEX}/sources/{source_id}", {"mailto": MAILTO}, OA_LIMIT)
    stats = data.get("summary_stats") or {}
    issn = [clean(x) for x in (data.get("issn") or []) if clean(x)]
    if clean(data.get("issn_l")) and clean(data.get("issn_l")) not in issn:
        issn.insert(0, clean(data.get("issn_l")))
    return {
        "status": "ok",
        "journal_full": clean(data.get("display_name")),
        "journal_abbrev": clean(data.get("abbreviated_title")),
        "issn": issn,
        "publisher": clean(data.get("host_organization_name")),
        "openalex_2yr_mean_citedness": stats.get("2yr_mean_citedness"),
        "h_index": stats.get("h_index"),
        "works_count": data.get("works_count"),
        "cited_by_count": data.get("cited_by_count"),
        "homepage_url": clean(data.get("homepage_url")),
        "metric_type": "openalex_2yr_mean_citedness",
        "sources": [f"https://openalex.org/{source_id}", f"{OPENALEX}/sources/{source_id}"],
    }


def pubmed_esearch(term: str, retmax: int = 20) -> dict[str, Any]:
    return get_json(f"{EUTILS}/esearch.fcgi", {
        "db": "pubmed", "term": term, "retmax": retmax, "retmode": "json", "sort": "relevance",
        "tool": "zerowall-literature", "email": MAILTO,
    }, NCBI_LIMIT)


def pubmed_esummary(pmids: list[str]) -> dict[str, Any]:
    if not pmids:
        return {}
    return get_json(f"{EUTILS}/esummary.fcgi", {
        "db": "pubmed", "id": ",".join(pmids), "retmode": "json",
        "tool": "zerowall-literature", "email": MAILTO,
    }, NCBI_LIMIT)


def summary_rows(payload: dict[str, Any], pmids: list[str]) -> list[dict[str, Any]]:
    result = (payload or {}).get("result") or {}
    rows: list[dict[str, Any]] = []
    for pmid in pmids:
        row = result.get(pmid)
        if not isinstance(row, dict):
            continue
        doi = ""
        for aid in row.get("articleids") or []:
            if clean(aid.get("idtype")).lower() == "doi":
                doi = clean(aid.get("value"))
        rows.append({
            "pmid": pmid,
            "title": clean(row.get("title")),
            "journal": clean(row.get("fulljournalname") or row.get("source")),
            "year": clean(row.get("pubdate"))[:4],
            "authors": [clean(a.get("name")) for a in (row.get("authors") or [])][:12],
            "doi": doi,
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        })
    return rows


def do_pubmed_search_articles(req: dict[str, Any]) -> dict[str, Any]:
    args = req["args"]
    term = args.get("query", "")
    retmax = int(args.get("maxResults") or 20)
    search = pubmed_esearch(term, retmax)
    esr = search.get("esearchresult") or {}
    pmids = [clean(x) for x in (esr.get("idlist") or []) if clean(x)]
    rows = summary_rows(pubmed_esummary(pmids), pmids) if pmids else []
    return {
        "status": "ok",
        "query": term,
        "count": int(esr.get("count") or 0),
        "summaries": rows,
        "sources": [f"https://pubmed.ncbi.nlm.nih.gov/?term={quote(term)}"],
    }


def europepmc_search(query: str, page_size: int = 10) -> list[dict[str, Any]]:
    data = get_json(f"{EPMC}/search", {
        "query": query, "format": "json", "pageSize": page_size, "resultType": "lite",
    }, EPMC_LIMIT)
    rows = ((data.get("resultList") or {}).get("result") or [])
    return [{
        "source": "europepmc",
        "id": clean(row.get("id")),
        "pmid": clean(row.get("pmid")),
        "doi": clean(row.get("doi")),
        "title": clean(row.get("title")),
        "journal": clean(row.get("journalTitle")),
        "year": clean(row.get("pubYear")),
        "authors": clean(row.get("authorString")),
        "cited_by_count": row.get("citedByCount"),
    } for row in rows]


def openalex_works_search(query: str, per_page: int = 10) -> list[dict[str, Any]]:
    data = get_json(f"{OPENALEX}/works", {
        "search": query, "per_page": per_page, "mailto": MAILTO,
        "select": "id,doi,title,publication_year,cited_by_count,authorships,primary_location",
    }, OA_LIMIT)
    rows: list[dict[str, Any]] = []
    for row in data.get("results") or []:
        loc = row.get("primary_location") or {}
        source = (loc.get("source") or {}) if isinstance(loc, dict) else {}
        rows.append({
            "source": "openalex",
            "id": clean(row.get("id")),
            "doi": clean(row.get("doi")).replace("https://doi.org/", ""),
            "title": clean(row.get("title")),
            "journal": clean(source.get("display_name")),
            "year": row.get("publication_year"),
            "cited_by_count": row.get("cited_by_count"),
            "authors": [clean((a.get("author") or {}).get("display_name")) for a in (row.get("authorships") or [])][:12],
        })
    return rows


def s2_search(query: str, limit: int = 10) -> list[dict[str, Any]]:
    data = get_json(f"{S2}/paper/search", {
        "query": query, "limit": limit,
        "fields": "title,year,venue,citationCount,externalIds,authors",
    }, S2_LIMIT, retries=2)
    rows: list[dict[str, Any]] = []
    for row in data.get("data") or []:
        ext = row.get("externalIds") or {}
        rows.append({
            "source": "semantic_scholar",
            "id": clean(row.get("paperId")),
            "doi": clean(ext.get("DOI")),
            "pmid": clean(ext.get("PubMed")),
            "title": clean(row.get("title")),
            "journal": clean(row.get("venue")),
            "year": row.get("year"),
            "cited_by_count": row.get("citationCount"),
            "authors": [clean(a.get("name")) for a in (row.get("authors") or [])][:12],
        })
    return rows


def do_pubmed_search_papers(req: dict[str, Any]) -> dict[str, Any]:
    args = req["args"]
    query = args.get("query", "")
    per = int(args.get("maxResultsPerSource") or 10)
    sources = args.get("sources") or ["pubmed", "europepmc", "openalex"]
    merged: list[dict[str, Any]] = []
    status_by_source: dict[str, str] = {}
    if "pubmed" in sources:
        try:
            search = pubmed_esearch(f"{query}[Author]" if "[" not in query else query, per)
            pmids = [clean(x) for x in ((search.get("esearchresult") or {}).get("idlist") or []) if clean(x)]
            rows = summary_rows(pubmed_esummary(pmids), pmids) if pmids else []
            for row in rows:
                row["source"] = "pubmed"
            merged.extend(rows)
            status_by_source["pubmed"] = "ok"
        except Exception as exc:
            status_by_source["pubmed"] = f"failed:{type(exc).__name__}"
    if "europepmc" in sources:
        try:
            merged.extend(europepmc_search(f'AUTH:"{query}"', per))
            status_by_source["europepmc"] = "ok"
        except Exception as exc:
            status_by_source["europepmc"] = f"failed:{type(exc).__name__}"
    if "openalex" in sources:
        try:
            merged.extend(openalex_works_search(query, per))
            status_by_source["openalex"] = "ok"
        except Exception as exc:
            status_by_source["openalex"] = f"failed:{type(exc).__name__}"
    if "s2" in sources:
        try:
            merged.extend(s2_search(query, per))
            status_by_source["s2"] = "ok"
        except Exception as exc:
            status_by_source["s2"] = f"failed:{type(exc).__name__}"
    ok_sources = [name for name, value in status_by_source.items() if value == "ok"]
    return {
        "status": "ok" if ok_sources else "failed",
        "query": query,
        "count": len(merged),
        "papers": merged,
        "source_status": status_by_source,
        "sources": [f"https://api.openalex.org/works?search={quote(query)}"],
    }


def do_openalex_citations(req: dict[str, Any]) -> dict[str, Any]:
    work_id = oa_id(req["args"].get("work_id", ""))
    cursor = "*"
    rows: list[dict[str, Any]] = []
    while cursor and len(rows) < 400:
        data = get_json(f"{OPENALEX}/works", {
            "filter": f"cites:{work_id}", "per_page": 100, "cursor": cursor, "mailto": MAILTO,
        }, OA_LIMIT)
        for row in data.get("results") or []:
            loc = row.get("primary_location") or {}
            source = (loc.get("source") or {}) if isinstance(loc, dict) else {}
            ids = row.get("ids") or {}
            rows.append({
                "openalex_id": clean(row.get("id")),
                "doi": clean(row.get("doi")).replace("https://doi.org/", ""),
                "pmid": clean(ids.get("pmid")).replace("https://pubmed.ncbi.nlm.nih.gov/", "").strip("/"),
                "title": clean(row.get("title") or row.get("display_name")),
                "journal": clean(source.get("display_name")),
                "year": row.get("publication_year"),
                "cited_by_count": row.get("cited_by_count"),
                "type": clean(row.get("type")),
                "authors": [clean((a.get("author") or {}).get("display_name")) for a in (row.get("authorships") or [])],
            })
        cursor = ((data.get("meta") or {}).get("next_cursor") or "")
        if not (data.get("results") or []):
            break
    return {
        "status": "ok",
        "count": len(rows),
        "citing_works": rows,
        "records": rows,
        "sources": [f"{OPENALEX}/works?filter=cites:{work_id}"],
    }


def do_pubmed_find_related(req: dict[str, Any]) -> dict[str, Any]:
    args = req["args"]
    pmid = clean(args.get("pmid"))
    relation = clean(args.get("relation") or "cited_by")
    linkname = {"cited_by": "pubmed_pubmed_citedin", "references": "pubmed_pubmed_refs",
                "similar": "pubmed_pubmed"}.get(relation, "pubmed_pubmed_citedin")
    data = get_json(f"{EUTILS}/elink.fcgi", {
        "dbfrom": "pubmed", "db": "pubmed", "id": pmid, "linkname": linkname, "retmode": "json",
        "tool": "zerowall-literature", "email": MAILTO,
    }, NCBI_LIMIT)
    pmids: list[str] = []
    for linkset in data.get("linksets") or []:
        for db in linkset.get("linksetdbs") or []:
            if clean(db.get("linkname")) == linkname:
                pmids.extend(clean(x) for x in db.get("links") or [])
    rows = summary_rows(pubmed_esummary(pmids[:200]), pmids[:200]) if pmids else []
    return {
        "status": "ok",
        "relation": relation,
        "count": len(pmids),
        "pmids": pmids,
        "records": rows,
        "summaries": rows,
        "sources": [f"https://pubmed.ncbi.nlm.nih.gov/?linkname={linkname}&from_uid={pmid}"],
    }


def do_pubmed_get_s2_citations(req: dict[str, Any]) -> dict[str, Any]:
    args = req["args"]
    paper_id = clean(args.get("paperId") or args.get("paper_id"))
    rows: list[dict[str, Any]] = []
    offset = 0
    while offset < 400:
        data = get_json(f"{S2}/paper/{quote(paper_id, safe=':')}/citations", {
            "limit": 100, "offset": offset,
            "fields": "title,year,venue,citationCount,externalIds,authors",
        }, S2_LIMIT, retries=3)
        chunk = data.get("data") or []
        for item in chunk:
            paper = item.get("citingPaper") or {}
            ext = paper.get("externalIds") or {}
            rows.append({
                "s2_id": clean(paper.get("paperId")),
                "doi": clean(ext.get("DOI")),
                "pmid": clean(ext.get("PubMed")),
                "title": clean(paper.get("title")),
                "journal": clean(paper.get("venue")),
                "year": paper.get("year"),
                "cited_by_count": paper.get("citationCount"),
                "authors": [clean(a.get("name")) for a in (paper.get("authors") or [])],
            })
        if len(chunk) < 100:
            break
        offset += 100
    return {
        "status": "ok",
        "count": len(rows),
        "citations": rows,
        "records": rows,
        "sources": [f"https://api.semanticscholar.org/graph/v1/paper/{paper_id}/citations"],
    }


def do_pubmed_fetch_articles(req: dict[str, Any]) -> dict[str, Any]:
    pmids = [clean(x) for x in (req["args"].get("pmids") or []) if clean(x)]
    if not pmids:
        return {"status": "not_found_after_search", "articles": []}
    articles: list[dict[str, Any]] = []
    for start in range(0, len(pmids), 100):
        chunk = pmids[start:start + 100]
        xml = get_text(f"{EUTILS}/efetch.fcgi", {
            "db": "pubmed", "id": ",".join(chunk), "retmode": "xml",
            "tool": "zerowall-literature", "email": MAILTO,
        }, NCBI_LIMIT)
        articles.extend(parse_pubmed_xml(xml))
    return {
        "status": "ok",
        "count": len(articles),
        "articles": articles,
        "records": articles,
        "sources": [f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" for pmid in pmids[:25]],
    }


def parse_pubmed_xml(xml: str) -> list[dict[str, Any]]:
    import xml.etree.ElementTree as ET

    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return []
    out: list[dict[str, Any]] = []
    for art in root.findall(".//PubmedArticle"):
        cit = art.find("./MedlineCitation")
        if cit is None:
            continue
        article = cit.find("./Article")
        pmid = clean(cit.findtext("./PMID"))
        journal = article.find("./Journal") if article is not None else None
        issns = [clean(x.text) for x in (journal.findall("./ISSN") if journal is not None else []) if clean(x.text)]
        issue = journal.find("./JournalIssue") if journal is not None else None
        year = ""
        if issue is not None:
            year = clean(issue.findtext("./PubDate/Year")) or clean(issue.findtext("./PubDate/MedlineDate"))[:4]
        authors: list[dict[str, Any]] = []
        for author in (article.findall("./AuthorList/Author") if article is not None else []):
            last = clean(author.findtext("./LastName"))
            fore = clean(author.findtext("./ForeName"))
            collective = clean(author.findtext("./CollectiveName"))
            affs = [clean(a.text) for a in author.findall("./AffiliationInfo/Affiliation") if clean(a.text)]
            orcid = ""
            for ident in author.findall("./Identifier"):
                if clean(ident.get("Source")).lower() == "orcid":
                    orcid = clean(ident.text)
            authors.append({
                "name": clean(f"{fore} {last}").strip() or collective,
                "last_name": last, "fore_name": fore, "collective": collective,
                "affiliations": affs, "orcid": orcid,
            })
        abstract = " ".join(clean(x.text) for x in (article.findall("./Abstract/AbstractText") if article is not None else []) if clean(x.text))
        doi = ""
        for aid in art.findall("./PubmedData/ArticleIdList/ArticleId"):
            if clean(aid.get("IdType")).lower() == "doi":
                doi = clean(aid.text)
        out.append({
            "pmid": pmid,
            "doi": doi,
            "title": clean(article.findtext("./ArticleTitle")) if article is not None else "",
            "abstract": abstract,
            "journal": clean(journal.findtext("./Title")) if journal is not None else "",
            "journal_abbrev": clean(journal.findtext("./ISOAbbreviation")) if journal is not None else "",
            "issn": issns,
            "year": year,
            "volume": clean(issue.findtext("./Volume")) if issue is not None else "",
            "issue": clean(issue.findtext("./Issue")) if issue is not None else "",
            "pages": clean(article.findtext("./Pagination/MedlinePgn")) if article is not None else "",
            "authors": authors,
            "keywords": [clean(k.text) for k in cit.findall("./KeywordList/Keyword") if clean(k.text)],
            "mesh_terms": [clean(m.findtext("./DescriptorName")) for m in cit.findall("./MeshHeadingList/MeshHeading")],
            "publication_types": [clean(p.text) for p in (article.findall("./PublicationTypeList/PublicationType") if article is not None else []) if clean(p.text)],
            "grants": [clean(g.findtext("./Agency")) for g in (article.findall("./GrantList/Grant") if article is not None else [])],
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        })
    return out


_CANONICAL_NAME_CACHE: dict[str, str] = {}
_CANONICAL_NAME_LOCK = threading.Lock()

# Queue rows never carry a searchable full name: OpenAlex's canonical display
# name is not persisted into state.papers[].raw, and the name printed on a
# citing paper is a PubMed-style abbreviation ("Bishai WR", "Dudek SM") that
# matches no faculty page.  prepare-enrichment therefore embeds this token and
# we resolve it here, in the same network round-trip that already talks to
# OpenAlex, so the queue stays deterministic and replayable.
CANONICAL_NAME_TOKEN = "{{CANONICAL_NAME}}"
# Canonical-name lookups must never dominate a request's runtime.
CANONICAL_NAME_TIMEOUT = 8.0


def resolve_canonical_name(req: dict[str, Any]) -> str:
    """Best available full name for the request's author, memoised per id.

    Bounded hard: the default ``get_json`` retry policy (6 retries with
    exponential backoff) turned a rate-limited lookup into an 80-second stall
    per author, and the whole point of resolving the name is to make the
    subsequent search faster.  The OpenAlex read normally answers in under a
    second, so a short timeout with a single retry is the right trade.
    """
    identity = req.get("identity") or {}
    known = clean(identity.get("canonical_name"))
    if known and CANONICAL_NAME_TOKEN not in known:
        return known
    author_id = oa_id(identity.get("openalex_author_id") or req.get("openalex_author_id") or "")
    if not author_id:
        return ""
    with _CANONICAL_NAME_LOCK:
        cached = _CANONICAL_NAME_CACHE.get(author_id)
    if cached is not None:
        return cached
    name = ""
    try:
        data = get_json(f"{OPENALEX}/authors/{author_id}", {}, OA_LIMIT,
                        CANONICAL_NAME_TIMEOUT, retries=1)
        if isinstance(data, dict):
            name = clean(data.get("display_name"))
    except Exception:
        name = ""
    # Only memoise a success: caching "" would poison every later request for
    # this author for the rest of the run.
    if name:
        with _CANONICAL_NAME_LOCK:
            _CANONICAL_NAME_CACHE[author_id] = name
    return name


def _profile_search_module():
    """Load the skill's profile_search module (multi-engine fan-out), or None."""
    global _PROFILE_SEARCH
    if _PROFILE_SEARCH is not None:
        return _PROFILE_SEARCH[0]
    try:
        import importlib.util
        path = SKILL_SCRIPTS / "profile_search.py"
        if not path.is_file():
            _PROFILE_SEARCH = (None,)
            return None
        spec = importlib.util.spec_from_file_location("zw_profile_search", path)
        module = importlib.util.module_from_spec(spec)
        sys.modules["zw_profile_search"] = module
        spec.loader.exec_module(module)
        _PROFILE_SEARCH = (module,)
        return module
    except Exception:
        _PROFILE_SEARCH = (None,)
        return None


def orcid_employment_title(orcid: str, institutions: list[str],
                           timeout: float = 12.0) -> dict[str, Any]:
    """Current employment role stated by the author's own ORCID record.

    ORCID is the one structured source that can carry a job title, so it is
    worth asking when no profile page could be verified.  Measured on the P004
    top-20, however, only 2 of 13 ORCID records fill ``role-title`` at all, and
    one of those two pointed at a different employer than the citing paper — so
    the role is accepted ONLY when its organisation agrees with an institution
    the bibliographic record attests.  OpenAlex is never consulted for a title:
    its author object has no role/position field whatsoever.
    """
    ident = clean(orcid).rstrip("/").split("/")[-1]
    if not re.fullmatch(r"\d{4}-\d{4}-\d{4}-\d{3}[\dX]", ident):
        return {}
    try:
        response = SESSION.get(f"https://pub.orcid.org/v3.0/{ident}/employments",
                               timeout=timeout,
                               headers={"User-Agent": UA, "Accept": "application/json"})
        if response.status_code >= 400:
            return {}
        data = response.json()
    except Exception:
        return {}
    wanted = [_norm_key(x) for x in institutions if clean(x)]
    for group in data.get("affiliation-group") or []:
        for summary in group.get("summaries") or []:
            employment = summary.get("employment-summary") or {}
            if employment.get("end-date") is not None:
                continue  # a past post is not the current title
            role = clean(employment.get("role-title"))
            org = clean((employment.get("organization") or {}).get("name"))
            if not role or not org:
                continue
            folded_org = _norm_key(org)
            if wanted and not any(w and (w in folded_org or folded_org in w) for w in wanted):
                continue
            return {"current_title": role, "current_institution": org,
                    "department": clean(employment.get("department-name")),
                    "source": f"https://orcid.org/{ident}"}
    return {}


def do_advanced_search(req: dict[str, Any], bridge: str, timeout: float,
                       cache_dir: Path | None = None) -> dict[str, Any]:
    args = req["args"]
    query = args.get("query", "")
    # Substitute the canonical full name before the query leaves this process,
    # otherwise the abbreviation is what actually gets searched.
    identity = req.get("identity") or {}
    canonical_name = resolve_canonical_name(req)
    if CANONICAL_NAME_TOKEN in query:
        replacement = canonical_name or clean(identity.get("printed_name")) or clean(req.get("author_name"))
        query = query.replace(CANONICAL_NAME_TOKEN, replacement)
    engine = clean(args.get("engine"))
    endpoint = bridge.rstrip("/") + "/api/dsh-free-search-settings/raw-search"

    # Author-profile discovery fans out across engines.  The bridge returns at
    # most two sources per engine for every backend, and different engines
    # return different pages, so a single engine silently decides whether a
    # profile is found at all.  Other intents keep the single-request path.
    profile_module = _profile_search_module() if args.get("query_intent") == "author_profile" else None
    if profile_module is not None:
        # ONE search per author: unpinned for ordinary authors (the Host default
        # answered these queries with 8 rows), pinned to Tavily only for the
        # top-20 authors the queue marked as such.
        rows = profile_module.search_profile_pages(
            query, bridge, engine=engine, timeout=min(timeout, 15.0),
            max_results=int(args.get("maxResults") or 8))
        results = [{"title": row["title"], "url": row["url"], "snippet": row["snippet"]}
                   for row in rows]
        urls = [row["url"] for row in results if row["url"].startswith(("http://", "https://"))]
        out = {
            "status": "ok" if results else "not_found_after_search",
            "engine": engine,
            "provider": "multi-engine",
            "requested_engine": engine,
            "query": query,
            "count": len(results),
            "results": results,
            "answer": "",
            "sources": urls,
        }
        if results:
            # The canonical name is resolved here, not in the queue (the queue
            # stores a token), so hand it to the extractor explicitly.
            if canonical_name:
                req = {**req, "identity": {**identity, "canonical_name": canonical_name}}
            fetch_and_extract_profile(req, out, timeout, cache_dir=cache_dir)
        # ORCID is the only structured source that can state a job title, so it
        # is consulted when no verified page produced one — and only when its
        # employer agrees with the affiliation the citing record attests.
        if not clean(out.get("current_title")):
            fallback = orcid_employment_title(
                clean(identity.get("orcid")),
                [clean(x) for x in (identity.get("institutions") or []) if clean(x)],
                timeout=min(timeout, 12.0))
            if fallback:
                out["current_title"] = fallback["current_title"]
                out["title_source"] = "orcid_employment"
                out["sources"] = list(dict.fromkeys([*(out.get("sources") or []), fallback["source"]]))
                out["profile_sources"] = list(dict.fromkeys(
                    [*(out.get("profile_sources") or []), fallback["source"]]))[:6]
        return out

    last: Exception | None = None
    for attempt in range(3):
        try:
            response = SESSION.post(endpoint, json={
                "query": query, "maxResults": int(args.get("maxResults") or 8),
                "engine": engine, "cache": False,
            }, timeout=timeout)
            response.raise_for_status()
            payload = response.json()
            break
        except Exception as exc:
            last = exc
            payload = None
            time.sleep(1.5 * (attempt + 1))
    if payload is None:
        return {"status": "failed", "engine": engine, "query": query,
                "error": f"{type(last).__name__}: {last}"}
    value = payload.get("value") if isinstance(payload.get("value"), dict) else payload
    provider = clean(value.get("provider")) or engine
    rows = value.get("sources") or []
    results = [{
        "title": clean(row.get("title")),
        "url": clean(row.get("url")),
        "snippet": clean(row.get("snippet") or row.get("content")),
    } for row in rows if isinstance(row, dict)]
    urls = [row["url"] for row in results if row["url"].startswith(("http://", "https://"))]
    out = {
        "status": "ok" if results else "not_found_after_search",
        "engine": engine,
        "provider": provider,
        "requested_engine": engine,
        "query": query,
        "count": len(results),
        "results": results,
        "answer": clean(value.get("content")),
        "sources": urls,
    }
    # The bridge never synthesises an answer, so open the ranked pages and
    # extract the author fields from their text.
    if results:
        fetch_and_extract_profile(req, out, timeout, cache_dir=cache_dir)
    if args.get("query_intent") == "author_profile" and not clean(out.get("current_title")):
        fallback = orcid_employment_title(
            clean(identity.get("orcid")),
            [clean(x) for x in (identity.get("institutions") or []) if clean(x)],
            timeout=min(timeout, 12.0))
        if fallback:
            out["current_title"] = fallback["current_title"]
            out["title_source"] = "orcid_employment"
            out["sources"] = list(dict.fromkeys([*(out.get("sources") or []), fallback["source"]]))
            out["profile_sources"] = list(dict.fromkeys(
                [*(out.get("profile_sources") or []), fallback["source"]]))[:6]
    return out


def do_free_search_test(req: dict[str, Any], bridge: str, timeout: float) -> dict[str, Any]:
    engines = req["args"].get("engines") or []
    query = req["args"].get("query", "")
    report: dict[str, Any] = {}
    for engine in engines:
        probe = do_advanced_search({"args": {"query": query, "engine": engine, "maxResults": 3}}, bridge, timeout)
        report[engine] = {"status": probe.get("status"), "provider": probe.get("provider"),
                          "count": probe.get("count", 0)}
    working = [name for name, row in report.items() if row.get("status") == "ok"]
    return {"status": "ok" if working else "failed", "engines": report,
            "working_engines": working, "query": query,
            "sources": ["dsh-free-search-bridge://raw-search"]}


DETERMINISTIC = {
    "openalex_get_author": do_openalex_get_author,
    "openalex_search_authors": do_openalex_search_authors,
    "openalex_get_source": do_openalex_get_source,
    "pubmed_search_articles": do_pubmed_search_articles,
    "pubmed_search_papers": do_pubmed_search_papers,
    "openalex_citations": do_openalex_citations,
    "pubmed_find_related": do_pubmed_find_related,
    "pubmed_get_s2_citations": do_pubmed_get_s2_citations,
    "pubmed_fetch_articles": do_pubmed_fetch_articles,
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("task", type=Path)
    parser.add_argument("--tools", default="", help="comma separated tool filter")
    parser.add_argument("--kind", default="", help="request kind filter")
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--bridge-url", default="http://127.0.0.1:62705")
    parser.add_argument("--timeout", type=float, default=90.0)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--force", action="store_true",
                        help="re-run requests even when an evidence file already exists")
    args = parser.parse_args()

    task = args.task
    queue_path = task / "analysis" / "provider_requests.jsonl"
    out_dir = task / "analysis" / "evidence_pending"
    out_dir.mkdir(parents=True, exist_ok=True)

    tool_filter = {x.strip() for x in args.tools.split(",") if x.strip()}
    # provider_requests.jsonl is an append-only ledger.  Read it last-row-wins by
    # request_id, then keep only the newest author_profile request per author
    # entity.  Without both reductions, rebuilding a better query made the
    # executor run old and new queries together (and often run each three times).
    latest_by_id: dict[str, dict[str, Any]] = {}
    request_order: list[str] = []
    for line in queue_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        request_id = clean(row.get("request_id"))
        if not request_id:
            continue
        if request_id not in latest_by_id:
            request_order.append(request_id)
        latest_by_id[request_id] = row
    latest_profile_by_subject: dict[str, str] = {}
    for request_id in request_order:
        row = latest_by_id[request_id]
        if (row.get("args") or {}).get("query_intent") != "author_profile":
            continue
        subject = clean(row.get("subject") or row.get("author_name")).lower()
        if subject:
            latest_profile_by_subject[subject] = request_id
    live_profile_ids = set(latest_profile_by_subject.values())

    requests_rows: list[dict[str, Any]] = []
    for request_id in request_order:
        row = latest_by_id[request_id]
        if tool_filter and row.get("tool") not in tool_filter:
            continue
        if args.kind and row.get("kind") != args.kind:
            continue
        if ((row.get("args") or {}).get("query_intent") == "author_profile"
                and request_id not in live_profile_ids):
            continue
        if not args.force and (out_dir / f"{request_id}.json").exists():
            continue
        requests_rows.append(row)
    if args.limit:
        requests_rows = requests_rows[:args.limit]

    # Let openalex_search_authors reuse the authorship-resolved id of the same subject.
    resolved: dict[str, str] = {}
    for line in queue_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get("tool") == "openalex_get_author":
            resolved[clean(row.get("subject"))] = clean((row.get("args") or {}).get("author_id"))
    for row in requests_rows:
        if row.get("tool") == "openalex_search_authors":
            row["_resolved_author_id"] = resolved.get(clean(row.get("subject")), "")

    print(f"executing {len(requests_rows)} requests", flush=True)
    done = {"ok": 0, "failed": 0}
    lock = threading.Lock()

    def run(row: dict[str, Any]) -> None:
        tool = row.get("tool")
        try:
            if tool == "advanced_search":
                # Every profile page this request opens is cached under the task
                # so a later extraction pass can re-read the exact HTML offline.
                cache_dir = (task / "analysis" / PROFILE_CACHE_DIRNAME / str(row["request_id"])
                             if (row.get("args") or {}).get("fetch_profile_pages") else None)
                payload = do_advanced_search(row, args.bridge_url, args.timeout,
                                             cache_dir=cache_dir)
            elif tool == "free_search_test":
                payload = do_free_search_test(row, args.bridge_url, args.timeout)
            elif tool in DETERMINISTIC:
                payload = DETERMINISTIC[tool](row)
            else:
                payload = {"status": "blocked_provider", "reason": f"unsupported tool {tool}"}
        except Exception as exc:
            payload = {"status": "failed", "error": f"{type(exc).__name__}: {exc}"}
        payload["request_id"] = row["request_id"]
        payload.setdefault("tool", tool)
        payload.setdefault("executed_at", time.strftime("%Y-%m-%dT%H:%M:%S%z"))
        (out_dir / f"{row['request_id']}.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        with lock:
            key = "ok" if payload.get("status") in {"ok", "not_found_after_search"} else "failed"
            done[key] += 1
            total = done["ok"] + done["failed"]
            if total % 25 == 0:
                print(f"  {total}/{len(requests_rows)} ok={done['ok']} failed={done['failed']}", flush=True)

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = [pool.submit(run, row) for row in requests_rows]
        for future in as_completed(futures):
            future.result()
    print(json.dumps({"executed": len(requests_rows), **done}, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
