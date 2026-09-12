#!/usr/bin/env python3
"""profile_search.py — ZeroWall Literature author-profile page discovery.

Strategy (measured, not assumed)
--------------------------------
Author-profile lookup is **one** search per author, then the returned pages are
opened and mined for rank, honours and offices.  Earlier versions fanned the
same query across several engines; measurement showed that was wasted work:

* Pinning ``bing`` returned content farms for English scholar queries
  (``filehelper.weixin.qq.com``, ``poki.com/zh/g/level-devil``, Baidu Baike) and
  only 2 rows per call.
* ``exa`` and ``anysearch`` returned 0 rows for these queries.
* Leaving the engine **unpinned** lets the Host use its configured default,
  which answered the same queries with 8 rows — including the publisher's own
  author pages and institutional profiles — in a single round trip.

So the default path is one unpinned query.  Only the top-20 authors use a pinned
engine (Tavily, one call each), because that engine is billed per request.

Ranking matters as much as retrieval: the two rows a poor engine returns decide
whether a profile is found at all, so trusted institutional domains are sorted
above social networks and aggregators before any page is fetched.
"""

from __future__ import annotations

import re
from typing import Any

import requests

__all__ = [
    "DEFAULT_ENGINE",
    "search_profile_pages",
    "rank_profile_url",
    "is_trusted_profile_url",
]

# The engine ordinary authors use.  Pinned explicitly rather than left to the
# Host default: measured on four unrelated authors, this engine returned
# institutional and publisher author pages every time (sciencedirect, jglobal,
# medifind, elsevierpure), while the unpinned default and bing returned Baidu
# Baike, Zhihu and shopping sites for the same queries.
DEFAULT_ENGINE = "deepseek-official"

# Domains that state a person's rank, honours and offices.
#
# Ordered by usefulness, because the fetcher can only open a few pages: school
# and hospital pages render to text fine, while the big publishers actively
# block non-browser clients and return an empty body (measured: ScienceDirect
# and Wiley both answered with 0 characters).  Publisher author pages are still
# listed — some do work — but they rank below institutional ones.
_TRUSTED = (
    ".edu", ".ac.", ".gov", "university", "universite", "universität", "college",
    "institut", "hospital", "clinic", "health", "medical", "nhs.", "klinik",
    "academy", "society", "asso", "who.int", "nih.gov", "nature.com",
    "springer", "elsevier", "wiley", "oup.com", "cambridge.org", "ieee.org",
    "orcid.org", "loop.frontiersin.org", "doximity.com", "jst.go.jp",
    "medifind", "healthgrades", "vitals.com", "webmd.com", "mayoclinic",
    "clevelandclinic", "hopkinsmedicine", "mskcc.org", "mdanderson",
    "sciencedirect.com/author", "pure.", "researchmap.jp", "elsevierpure",
)

# Hosts that render no readable text to a non-browser client.
_UNREADABLE = (
    "sciencedirect.com", "onlinelibrary.wiley.com", "link.springer.com",
    "academic.oup.com", "tandfonline.com", "sagepub.com", "jstor.org",
)

# Aggregators and social sites: they rarely state a rank, and when they do the
# text is not attributable to the institution.
_NOISE = (
    "linkedin.", "facebook.", "twitter.", "x.com", "instagram.", "youtube.",
    "tiktok.", "pinterest.", "reddit.", "quora.", "zhihu.com", "baidu.com",
    "weibo.", "douban.", "sohu.com", "163.com", "sina.com", "csdn.net",
    "bilibili", "poki.com", "webcli.jp", "filehelper.weixin", "weixin.qq.com",
    "wikipedia.org", "wikidata.org", "amazon.", "ebay.", "indeed.", "glassdoor.",
    "yelp.", "tripadvisor.", "imdb.", "spotify.", "jlgames", "wookey",
    "quickdraw.withgoogle", "google.com/search", "support.microsoft",
    "hotmail", "outlook.", "apple.com", "netflix.", "booking.com",
    "researchgate.net/scientific-contributions",   # profile shell, no facts
    "scholar.google",                              # needs JS, no rank text
    "scopus.com", "publons", "semanticscholar.org", "pubmed.ncbi",
    "ncbi.nlm.nih.gov", "doi.org", "arxiv.org", "biorxiv", "medrxiv",
    "europepmc.org", "frontiersin.org/articles", "mdpi.com", "plos.org",
    "clinicaltrials.gov", "ssrn.com", "scilit", "dimensions.ai",
)

# URL path fragments that usually mean "a person's page" rather than a listing.
_PERSONAL_PATH = (
    "profile", "people", "person", "faculty", "staff", "directory", "member",
    "team", "/bio", "biography", "cv", "researcher", "author", "doctor",
    "physician", "specialist", "expert", "our-team", "leadership", "about",
)


def _host(url: str) -> str:
    match = re.match(r"https?://([^/]+)", url or "", re.I)
    return (match.group(1) if match else "").lower()


def is_trusted_profile_url(url: str) -> bool:
    """True when the URL could belong to an institution or professional body."""
    if not url or not url.lower().startswith(("http://", "https://")):
        return False
    low = url.lower()
    host = _host(url)
    if not host:
        return False
    if any(bad in low for bad in _NOISE):
        return False
    return any(good in host or good in low for good in _TRUSTED)


def rank_profile_url(url: str) -> int:
    """Higher is a better page to read.  Negative means "do not fetch"."""
    if not is_trusted_profile_url(url):
        return -1
    low = url.lower()
    score = 1
    if any(frag in low for frag in _PERSONAL_PATH):
        score += 3
    if low.endswith((".pdf", ".doc", ".docx")):
        score -= 1
    # A bare domain root carries no profile.
    if re.match(r"https?://[^/]+/?$", low):
        score -= 2
    # Rank unreadable hosts last so the fetch budget goes to pages that render.
    if any(host in low for host in _UNREADABLE):
        score -= 4
    return score


def _one_search(bridge: str, query: str, engine: str, timeout: float,
                max_results: int) -> list[dict[str, Any]]:
    """One bridge call.  ``engine`` empty means "use the Host's default"."""
    endpoint = bridge.rstrip("/") + "/api/dsh-free-search-settings/raw-search"
    payload: dict[str, Any] = {"query": query, "maxResults": max_results, "cache": False}
    if engine:
        payload["engine"] = engine
    try:
        response = requests.post(endpoint, json=payload, timeout=timeout)
        if response.status_code != 200:
            return []
        body = response.json()
    except Exception:
        return []
    value = body.get("value") if isinstance(body.get("value"), dict) else body
    out: list[dict[str, Any]] = []
    for row in value.get("sources") or []:
        if not isinstance(row, dict):
            continue
        url = str(row.get("url") or "").strip()
        if not url:
            continue
        out.append({
            "title": re.sub(r"\s+", " ", str(row.get("title") or "")).strip(),
            "url": url,
            "snippet": re.sub(r"\s+", " ", str(row.get("snippet") or row.get("content") or "")).strip(),
            "engine": engine or "default",
        })
    return out


def search_profile_pages(query: str, bridge: str, *, engine: str = "",
                         timeout: float = 15.0, max_results: int = 8
                         ) -> list[dict[str, Any]]:
    """Search for an author's profile pages, then rank what came back.

    Engine policy:

    * ordinary authors use :data:`DEFAULT_ENGINE` (deepseek-official) — one
      query, one engine;
    * Top-20 authors use the paid engine the queue pinned (Tavily) exactly once.

    Do not silently add a second engine here.  The engine policy is part of the
    reproducible queue contract: ordinary authors = deepseek-official once;
    Top-20 = Tavily once.  Recall limitations are recorded in the evidence and
    can be revisited from the saved HTML rather than hidden by extra searches.
    """
    targets = [engine] if engine else [DEFAULT_ENGINE]

    rows: list[dict[str, Any]] = []
    for target in targets:
        rows.extend(_one_search(bridge, query, target, timeout, max_results))

    ordered = sorted(rows, key=lambda r: -rank_profile_url(r["url"]))
    seen: set[str] = set()
    merged: list[dict[str, Any]] = []
    for row in ordered:
        key = row["url"].split("#")[0].rstrip("/").lower()
        if key in seen:
            continue
        seen.add(key)
        merged.append(row)
    return merged
