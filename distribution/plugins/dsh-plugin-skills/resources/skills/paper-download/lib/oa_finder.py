"""Recherche d'URLs OA pour un paper via Unpaywall + CORE + OpenAlex.

Ces 3 sources sont spécifiquement conçues pour trouver les versions OA
(sites perso auteur, repos institutionnels universités, preprints arXiv,
SSRN, OSF, etc.) — précisément ce que l'utilisateur a demandé d'ajouter
à la cascade.

Gratuit, pas de clé requise (Unpaywall demande juste un email).
"""
import re
from typing import Optional

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

EMAIL = "claude@liance.art"
UA = f"polite/Mozilla/5.0 (mailto:{EMAIL})"


def unpaywall_lookup(doi: str) -> list[dict]:
    """Retourne la liste des OA locations Unpaywall pour un DOI.

    Chaque location = {url, url_for_pdf, repository_institution, version, host_type, ...}
    host_type : 'publisher' | 'repository' (site perso, dépôt institutionnel)
    """
    if not doi:
        return []
    url = f"https://api.unpaywall.org/v2/{doi}"
    try:
        r = requests.get(url, params={"email": EMAIL},
                         headers={"User-Agent": UA}, timeout=15)
        if r.status_code == 200:
            data = r.json()
            locations = []
            best = data.get("best_oa_location")
            if best:
                locations.append(best)
            for loc in data.get("oa_locations") or []:
                if loc != best:
                    locations.append(loc)
            return locations
        elif r.status_code == 404:
            return []
    except Exception as e:
        print(f"  [unpaywall {doi}] err: {type(e).__name__}: {str(e)[:60]}")
    return []


def get_unpaywall_pdf_urls(doi: str) -> list[str]:
    """Wrapper : retourne juste les URLs PDF Unpaywall (prioritisées : repository > publisher)."""
    locs = unpaywall_lookup(doi)
    urls = []
    # Repositories d'abord (sites perso/uni)
    for loc in locs:
        if loc.get("host_type") == "repository" and loc.get("url_for_pdf"):
            urls.append(loc["url_for_pdf"])
    # Puis publisher
    for loc in locs:
        if loc.get("host_type") == "publisher" and loc.get("url_for_pdf"):
            urls.append(loc["url_for_pdf"])
    # Puis landing pages OA si pas de PDF direct
    for loc in locs:
        u = loc.get("url")
        if u and u not in urls and loc.get("url_for_pdf") is None:
            urls.append(u)
    return urls


def core_search(title: str, author: str = "", limit: int = 5) -> list[dict]:
    """Search CORE OA index (API v3 publique). Retourne top results."""
    if not title:
        return []
    q = title
    if author:
        q += f' AND authors:"{author}"'
    try:
        r = requests.get(
            "https://api.core.ac.uk/v3/search/works",
            params={"q": q, "limit": limit, "scroll": False},
            headers={"User-Agent": UA},
            timeout=15,
        )
        if r.status_code == 200:
            return r.json().get("results", [])
        elif r.status_code == 401:
            # CORE demande maintenant un API key gratuit
            return []
    except Exception as e:
        print(f"  [core search] err: {type(e).__name__}: {str(e)[:60]}")
    return []


def get_core_pdf_urls(title: str, author: str = "") -> list[str]:
    """Wrapper CORE : URLs PDF des résultats."""
    results = core_search(title, author)
    urls = []
    for r in results:
        # `fullText` peut être absent OU présent à None (API CORE) — le
        # `or {}` couvre les deux cas, contrairement à `.get(k, {})`.
        full_text = r.get("fullText") or {}
        pdf = r.get("downloadUrl") or full_text.get("url")
        if pdf:
            urls.append(pdf)
    return urls


# ─── Strict cascade for personal/institutional URLs ───

def find_personal_uni_oa_urls(doi: str = "", title: str = "", author: str = "") -> list[tuple[str, str]]:
    """Cherche toutes les URLs OA plausibles (perso, uni, repo, preprint) via Unpaywall + CORE.

    Retourne list de (url, source) — déduplicate, priorité repository > publisher.
    """
    urls = []
    seen = set()

    if doi:
        for u in get_unpaywall_pdf_urls(doi):
            if u not in seen:
                urls.append((u, "unpaywall"))
                seen.add(u)

    # CORE search (besoin titre)
    if title:
        for u in get_core_pdf_urls(title, author):
            if u not in seen:
                urls.append((u, "core"))
                seen.add(u)

    return urls


# ─── URL pattern detection (perso/uni/repo) ───

PERSONAL_OR_UNI_PATTERNS = [
    r"\.edu/",
    r"\.ac\.uk/",
    r"\.ac\.[a-z]{2,3}/",
    r"\.uni-",
    r"university\.",
    r"~[a-z]",  # site perso /~user/
    r"personalpages\.",
    r"homepages\.",
    r"staff\.",
    r"faculty\.",
    r"people\.",
    r"users\.",
    r"infoscience\.",  # EPFL
    r"hal\.",  # HAL France
    r"halshs\.",
    r"escholarship\.",  # UC scholarly
    r"repository\.",
    r"repositori\.",  # UPF, etc.
    r"eprints\.",
    r"researchgate",
    r"academia\.edu",
    r"osf\.io",
    r"zenodo\.",
    r"figshare\.",
    r"semanticscholar\.org/paper",
    r"arxiv\.org",
    r"aclanthology\.org",
    r"transactions\.ismir\.net",
    r"archives\.ismir\.net",
    r"\.mit\.edu",
    r"\.stanford\.edu",
    r"\.berkeley\.edu",
    r"\.cmu\.edu",
    r"\.upf\.edu",
    r"\.uva\.nl",
    r"\.ku\.dk",
    r"\.uchicago\.edu",
    r"\.harvard\.edu",
    r"\.oxford\.ac\.uk",
    r"\.cam\.ac\.uk",
]


def is_personal_or_uni_url(url: str) -> bool:
    """Heuristique : true si l'URL ressemble à un site perso/uni/repo institutionnel."""
    if not url:
        return False
    for pat in PERSONAL_OR_UNI_PATTERNS:
        if re.search(pat, url, re.I):
            return True
    return False


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("usage: oa_finder.py <doi> [title] [author]")
        sys.exit(1)
    doi = sys.argv[1] if sys.argv[1] != "-" else ""
    title = sys.argv[2] if len(sys.argv) > 2 else ""
    author = sys.argv[3] if len(sys.argv) > 3 else ""
    urls = find_personal_uni_oa_urls(doi=doi, title=title, author=author)
    print(f"Found {len(urls)} OA URLs:")
    for u, src in urls:
        flag = "🎓" if is_personal_or_uni_url(u) else "  "
        print(f"  {flag} [{src}] {u[:100]}")
