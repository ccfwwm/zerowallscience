"""Liste curatée de miroirs shadow libs, alimentée par open-slum.pages.dev.

open-slum.pages.dev est un dashboard public de monitoring d'uptime pour les
principaux miroirs Anna's Archive / Libgen / Sci-Hub / Z-Library. Le module
extrait la liste des miroirs UP et la met en cache 24h. Si open-slum est
inaccessible, on retombe sur une liste statique de secours.

Utilisé par `_md5_download_cascade` (DL multi-miroir) et `_libgen_search_direct`
(F3 — recherche Libgen directe quand AA est Cloudflare-bloqué).
"""
from __future__ import annotations

import json
import re
import time
import urllib.request
import urllib.error
from pathlib import Path

OPEN_SLUM_URL = "https://open-slum.pages.dev/"
_CACHE_DIR = Path.home() / ".cache" / "paper-trail"
_CACHE_FILE = _CACHE_DIR / "shadow_mirrors.json"
_CACHE_TTL = 24 * 3600  # 24h

_FALLBACK_LIBGEN = ["libgen.li", "libgen.bz", "libgen.gl", "libgen.la", "libgen.vg"]
_FALLBACK_AA = ["annas-archive.gl", "annas-archive.li"]


def _flat(seq):
    out = []
    for x in seq:
        if isinstance(x, list):
            out.extend(_flat(x))
        elif x is not None:
            out.append(x)
    return out


def _parse_open_slum(html: str) -> dict | None:
    """Extrait {'status': {id: UP|DOWN}, 'urls': {id: url}} depuis le HTML."""
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>([^<]+)</script>', html)
    if not m:
        return None
    try:
        nd = json.loads(m.group(1))
        pp = nd.get("props", {}).get("pageProps", {})
        cs = pp.get("compactedStateStr")
        if not cs:
            return None
        state = json.loads(cs)
    except (json.JSONDecodeError, KeyError):
        return None

    status = {}
    for mid, inc in state.get("incident", {}).items():
        starts = _flat(inc.get("start", []))
        ends = _flat(inc.get("end", []))
        if not starts:
            status[mid] = "UP"
            continue
        ms = max(starts)
        me = max(ends) if ends else 0
        status[mid] = "DOWN" if ms > me else "UP"

    urls = {}
    for mon in pp.get("monitors", []):
        urls[mon["id"]] = mon.get("statusPageLink", "")

    return {"status": status, "urls": urls}


def _fetch_open_slum(timeout: int = 15) -> dict | None:
    try:
        req = urllib.request.Request(
            OPEN_SLUM_URL, headers={"User-Agent": "paper-trail/0.3"}
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            html = resp.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError):
        return None
    return _parse_open_slum(html)


def _load_cache() -> dict | None:
    try:
        if not _CACHE_FILE.exists():
            return None
        data = json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
        if time.time() - data.get("fetched_at", 0) > _CACHE_TTL:
            return None
        return data
    except (OSError, json.JSONDecodeError):
        return None


def _save_cache(data: dict) -> None:
    try:
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        data["fetched_at"] = int(time.time())
        _CACHE_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except OSError:
        pass


def _get_data(force_refresh: bool = False) -> dict:
    if not force_refresh:
        cached = _load_cache()
        if cached:
            return cached
    fresh = _fetch_open_slum()
    if fresh:
        _save_cache(fresh)
        return fresh
    return {
        "status": {},
        "urls": {},
        "fallback": True,
    }


def _extract_host(url: str) -> str | None:
    m = re.match(r"https?://([^/]+)", url or "")
    return m.group(1) if m else None


def _mirrors_for_prefix(prefix: str, fallback: list[str]) -> list[str]:
    data = _get_data()
    status = data.get("status", {})
    urls = data.get("urls", {})
    out = []
    for mid, s in status.items():
        if s != "UP" or not mid.startswith(prefix):
            continue
        if mid.startswith("software_") or mid.startswith("search_test_"):
            continue
        host = _extract_host(urls.get(mid, ""))
        if host:
            out.append(host)
    return out if out else list(fallback)


def get_libgen_mirrors() -> list[str]:
    """Liste des hôtes Libgen UP (ex: ['libgen.li', 'libgen.bz', ...])."""
    return _mirrors_for_prefix("libgen_", _FALLBACK_LIBGEN)


def get_aa_mirrors() -> list[str]:
    """Liste des hôtes Anna's Archive UP (ex: ['annas-archive.gl', ...])."""
    return _mirrors_for_prefix("annas_archive_", _FALLBACK_AA)


def refresh_cache() -> dict:
    """Force le refresh du cache. Retourne le dict de données."""
    return _get_data(force_refresh=True)
