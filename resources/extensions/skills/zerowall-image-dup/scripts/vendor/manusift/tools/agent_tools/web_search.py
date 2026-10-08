"""Web search tool (R-audit 2026-06-10).

Extracted from ``manusift.tools.agent_tools`` in
R-2026-06-15 (Phase 4 + P4-1)
god-file extraction.
"""
from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from typing import Any

from ..tool import Tool, ToolContext


class WebSearchTool:
    """Search the web and
    return a JSON list of
    ``{title, url, snippet}``
    results.

    R-audit (2026-06-10):
    added to close the
    "Claude Code can web-
    search" gap. Three
    backends:

      * ``duckduckgo``
        (default, no API
        key) -- the
        lite.duckduckgo.com
        HTML endpoint,
        scraped.
      * ``tavily`` -- the
        Tavily Search API
        (high quality, $).
        Requires
        ``MANUSIFT_TAVILY_API_KEY``.
      * ``brave`` -- the
        Brave Search API.
        Requires
        ``MANUSIFT_BRAVE_API_KEY``.
    """

    name = "web_search"

    def description(self) -> str:
        return (
            "Search the web for a query. Returns a JSON "
            "list of {title, url, snippet} results. Default "
            "backend is DuckDuckGo (no API key required). "
            "Use Tavily or Brave for higher-quality results "
            "(require API keys). For deep reading of a "
            "specific page, use `web_fetch(url)` instead."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": (
                        "The search query string."
                    ),
                },
                "max_results": {
                    "type": "integer",
                    "description": (
                        "Optional cap on the number of "
                        "results. Default 5."
                    ),
                },
            },
            "required": ["query"],
        }

    def execute(
        self,
        input: dict[str, Any],
        ctx: ToolContext,
    ) -> str:
        from ...config import get_settings

        settings = get_settings()
        provider = (
            input.get("provider")
            or settings.web_search_provider
        )
        query = (input.get("query") or "").strip()
        if not query:
            return json.dumps(
                {"ok": False, "error": "query is required"}
            )
        max_results = int(input.get("max_results") or 5)
        max_results = min(max_results, 20)
        try:
            if provider == "tavily":
                results = _search_tavily(
                    query, settings, max_results
                )
            elif provider == "brave":
                results = _search_brave(
                    query, settings, max_results
                )
            else:
                # Default
                # to
                # DuckDuckGo.
                results = _search_duckduckgo(
                    query, max_results
                )
        except Exception as exc:  # noqa: BLE001
            return json.dumps(
                {
                    "ok": False,
                    "error": f"web_search failed: {exc}",
                    "provider": provider,
                }
            )
        return json.dumps(
            {
                "ok": True,
                "query": query,
                "provider": provider,
                "results": results,
            },
            ensure_ascii=False,
        )


def _search_duckduckgo(
    query: str, max_results: int
) -> list[dict[str, str]]:
    """DuckDuckGo HTML
    endpoint
    (lite.duckduckgo.com).
    No API key needed.

    The lite endpoint
    returns a tiny HTML
    page with anchors; we
    parse them with a small
    regex.
    """
    url = "https://html.duckduckgo.com/html/?q=" + urllib.parse.quote(
        query
    )
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0 Safari/537.36"
            )
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode("utf-8", errors="ignore")
    # Parse
    # DuckDuckGo
    # HTML
    # results.
    # They
    # look
    # like:
    # <a
    # rel="nofollow"
    # class="result__a"
    # href="...">title</a>
    # <a
    # class="result__snippet"
    # href="...">snippet
    # text...</a>
    # The
    # result__a
    # and
    # result__snippet
    # appear
    # in
    # pairs.
    out: list[dict[str, str]] = []
    title_re = re.compile(
        r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>',
        re.DOTALL,
    )
    snippet_re = re.compile(
        r'<a[^>]+class="result__snippet"[^>]*>(.*?)</a>',
        re.DOTALL,
    )
    titles = title_re.findall(html)
    snippets = snippet_re.findall(html)
    for i, (href, title_raw) in enumerate(titles):
        if len(out) >= max_results:
            break
        # Clean
        # the
        # title
        # (strip
        # HTML
        # tags
        # / entities).
        title = re.sub(r"<[^>]+>", "", title_raw).strip()
        title = (
            title.replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
        )
        snippet = ""
        if i < len(snippets):
            snippet = re.sub(r"<[^>]+>", "", snippets[i])
            snippet = (
                snippet.replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .strip()
            )
        out.append(
            {
                "title": title,
                "url": href,
                "snippet": snippet,
            }
        )
    return out


def _search_tavily(
    query: str, settings, max_results: int
) -> list[dict[str, str]]:
    """Tavily Search API."""
    key = settings.tavily_api_key
    if not key:
        # Fall
        # back
        # to
        # DDG
        # if
        # no
        # key
        # is
        # configured.
        return _search_duckduckgo(query, max_results)
    body = json.dumps(
        {
            "api_key": key.get_secret_value(),
            "query": query,
            "max_results": max_results,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.tavily.com/search",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        payload = json.loads(resp.read())
    out: list[dict[str, str]] = []
    for r in payload.get("results", []):
        out.append(
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "snippet": r.get("content", ""),
            }
        )
    return out


def _search_brave(
    query: str, settings, max_results: int
) -> list[dict[str, str]]:
    """Brave Search API."""
    key = settings.brave_api_key
    if not key:
        return _search_duckduckgo(query, max_results)
    url = (
        "https://api.search.brave.com/res/v1/web/search?"
        + urllib.parse.urlencode(
            {
                "q": query,
                "count": str(max_results),
            }
        )
    )
    req = urllib.request.Request(
        url,
        headers={
            "X-Subscription-Token": key.get_secret_value()
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        payload = json.loads(resp.read())
    out: list[dict[str, str]] = []
    for r in (
        payload.get("web", {}).get("results", [])
    ):
        out.append(
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "snippet": r.get("description", ""),
            }
        )
    return out


# ============================================================
# 2. web_fetch
# ============================================================


_MAX_FETCH_BYTES = 50_000  # 50 KB cap per page




def _search_duckduckgo(
    query: str, max_results: int
) -> list[dict[str, str]]:
    """DuckDuckGo HTML
    endpoint
    (lite.duckduckgo.com).
    No API key needed.

    The lite endpoint
    returns a tiny HTML
    page with anchors; we
    parse them with a small
    regex.
    """
    url = "https://html.duckduckgo.com/html/?q=" + urllib.parse.quote(
        query
    )
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0 Safari/537.36"
            )
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode("utf-8", errors="ignore")
    # Parse
    # DuckDuckGo
    # HTML
    # results.
    # They
    # look
    # like:
    # <a
    # rel="nofollow"
    # class="result__a"
    # href="...">title</a>
    # <a
    # class="result__snippet"
    # href="...">snippet
    # text...</a>
    # The
    # result__a
    # and
    # result__snippet
    # appear
    # in
    # pairs.
    out: list[dict[str, str]] = []
    title_re = re.compile(
        r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>',
        re.DOTALL,
    )
    snippet_re = re.compile(
        r'<a[^>]+class="result__snippet"[^>]*>(.*?)</a>',
        re.DOTALL,
    )
    titles = title_re.findall(html)
    snippets = snippet_re.findall(html)
    for i, (href, title_raw) in enumerate(titles):
        if len(out) >= max_results:
            break
        # Clean
        # the
        # title
        # (strip
        # HTML
        # tags
        # / entities).
        title = re.sub(r"<[^>]+>", "", title_raw).strip()
        title = (
            title.replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
        )
        snippet = ""
        if i < len(snippets):
            snippet = re.sub(r"<[^>]+>", "", snippets[i])
            snippet = (
                snippet.replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .strip()
            )
        out.append(
            {
                "title": title,
                "url": href,
                "snippet": snippet,
            }
        )
    return out




def _search_tavily(
    query: str, settings, max_results: int
) -> list[dict[str, str]]:
    """Tavily Search API."""
    key = settings.tavily_api_key
    if not key:
        # Fall
        # back
        # to
        # DDG
        # if
        # no
        # key
        # is
        # configured.
        return _search_duckduckgo(query, max_results)
    body = json.dumps(
        {
            "api_key": key.get_secret_value(),
            "query": query,
            "max_results": max_results,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.tavily.com/search",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        payload = json.loads(resp.read())
    out: list[dict[str, str]] = []
    for r in payload.get("results", []):
        out.append(
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "snippet": r.get("content", ""),
            }
        )
    return out




def _search_brave(
    query: str, settings, max_results: int
) -> list[dict[str, str]]:
    """Brave Search API."""
    key = settings.brave_api_key
    if not key:
        return _search_duckduckgo(query, max_results)
    url = (
        "https://api.search.brave.com/res/v1/web/search?"
        + urllib.parse.urlencode(
            {
                "q": query,
                "count": str(max_results),
            }
        )
    )
    req = urllib.request.Request(
        url,
        headers={
            "X-Subscription-Token": key.get_secret_value()
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        payload = json.loads(resp.read())
    out: list[dict[str, str]] = []
    for r in (
        payload.get("web", {}).get("results", [])
    ):
        out.append(
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "snippet": r.get("description", ""),
            }
        )
    return out


# ============================================================
# 2. web_fetch
# ============================================================


_MAX_FETCH_BYTES = 50_000  # 50 KB cap per page
