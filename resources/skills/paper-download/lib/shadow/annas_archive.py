"""Anna's Archive cascade — source d'acquisition opt-in.

Cascade en 3 phases pour obtenir un MD5 utilisable, puis cascade DL
multi-miroir Libgen.

Activation : variable d'environnement RESEARCH_ENABLE_SHADOW_LIBS=1.

L'utilisation d'Anna's Archive / Libgen peut violer le droit d'auteur dans
votre juridiction. Cf. DISCLAIMER.md à la racine du plugin.

La liste des miroirs UP est récupérée dynamiquement depuis
`open-slum.pages.dev` via `lib/shadow/mirrors.py` (cache 24h, fallback
statique si open-slum est lui-même inaccessible).

Anti-homonymie : garantie par la page 1 validation côté `_save_and_validate`,
quelle que soit la source MD5.
"""
from __future__ import annotations

import re
from urllib.parse import quote

from pipeline.registry import Ref

from .mirrors import get_aa_mirrors, get_libgen_mirrors


def _aa_md5_from_doi(doi: str) -> tuple[str | None, str]:
    """F1 — AA `/scidb/<doi>` → MD5, en essayant tous les miroirs AA UP."""
    from pipeline.cascade import _http_get

    tried = []
    for mirror in get_aa_mirrors():
        scidb_url = f"https://{mirror}/scidb/{quote(doi, safe=':/')}"
        html = _http_get(scidb_url, timeout=30)
        if not html:
            tried.append(f"{mirror}:unreachable")
            continue
        m = re.search(rb"/md5/([0-9a-f]{32})", html)
        if m:
            return m.group(1).decode(), f"scidb_match:{mirror}"
        tried.append(f"{mirror}:no_md5")
    return None, f"scidb_failed:{','.join(tried)}" if tried else "scidb_no_aa_mirror"


def _aa_md5_from_title(title: str, author: str) -> tuple[str | None, str]:
    """F2 — title-search AA, extraction MD5 directe depuis HTML.

    Filtre les hits dont le bloc HTML contient au moins un mot distinctif
    (≥ 5 lettres) du titre demandé + le lastname de l'auteur. La sécurité
    finale reste la page 1 validation post-DL.
    """
    from pipeline.cascade import _http_get

    if not title:
        return None, "no_title_for_aa_search"
    query = f"{title} {author}".strip() if author else title
    distinctive = [
        w.lower() for w in title.replace("-", " ").split()
        if len(w) >= 5 and w.isalpha()
    ]
    author_norm = (author or "").lower().split()[0] if author else None

    for mirror in get_aa_mirrors():
        search_url = f"https://{mirror}/search?q={quote(query)}&ext=pdf"
        html_bytes = _http_get(search_url, timeout=30)
        if not html_bytes:
            continue
        html = html_bytes.decode("utf-8", errors="replace")
        parts = re.split(r"/md5/([0-9a-f]{32})", html)
        if len(parts) < 3:
            continue

        for i in range(1, len(parts) - 1, 2):
            md5 = parts[i]
            chunk = parts[i + 1][:2500]
            text = re.sub(r"<[^>]+>", " ", chunk)
            text = re.sub(r"\s+", " ", text).lower()
            if distinctive:
                matches = [w for w in distinctive if w in text]
                if not matches:
                    continue
                if author_norm and author_norm not in text:
                    continue
                return md5, f"aa_title_search:{mirror}:kw={matches[0]!r}"
            else:
                return md5, f"aa_first_hit:{mirror}"

    return None, "aa_title_no_match_any_mirror"


def _libgen_search_direct(title: str, author: str) -> tuple[str | None, str]:
    """F3 — recherche Libgen directe (bypass AA Cloudflare).

    Itère sur tous les miroirs Libgen UP, parse la table de résultats avec
    BeautifulSoup, retourne le premier MD5 dont le row contient au moins un
    mot distinctif du titre + le lastname de l'auteur.

    Anti-homonymie double-check : page 1 validation dans `_save_and_validate`.
    """
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return None, "libgen_direct:no_bs4"
    from pipeline.cascade import _http_get

    if not title:
        return None, "libgen_direct:no_title"

    query_parts = []
    if author:
        query_parts.append(author.split(",")[0].split()[0])
    query_parts.append(title)
    query = " ".join(query_parts).strip()

    distinctive = [
        w.lower() for w in title.replace("-", " ").split()
        if len(w) >= 5 and w.isalpha()
    ]
    author_norm = (author or "").lower().split()[0] if author else None

    for mirror in get_libgen_mirrors():
        url = f"https://{mirror}/index.php?req={quote(query)}&res=25"
        html_bytes = _http_get(url, timeout=30)
        if not html_bytes:
            continue
        try:
            soup = BeautifulSoup(html_bytes.decode("utf-8", errors="replace"), "html.parser")
        except Exception:
            continue

        seen = set()
        for a in soup.find_all("a", title=True):
            title_attr = a.get("title", "")
            if not re.search(r"ID:\s*\d+<br>", title_attr):
                continue
            tr = a.find_parent("tr")
            if not tr:
                continue
            ads_link = tr.find("a", href=re.compile(r"ads\.php\?md5="))
            if not ads_link:
                continue
            md5_m = re.search(r"md5=([a-f0-9]{32})", ads_link["href"])
            if not md5_m:
                continue
            md5 = md5_m.group(1)
            if md5 in seen:
                continue
            seen.add(md5)
            row_text = tr.get_text(" ", strip=True).lower()
            if distinctive and not any(w in row_text for w in distinctive):
                continue
            if author_norm and author_norm not in row_text:
                continue
            return md5, f"libgen_direct:{mirror}"

    return None, "libgen_direct:no_match"


def _md5_download_cascade(md5: str, ref: Ref, via_label: str) -> tuple[str, dict]:
    """Cascade DL : itère sur tous les miroirs Libgen UP, puis AA, puis library.lol.

    Pour chaque miroir : GET ads.php?md5=X → extraction get.php?md5=X&key=Y →
    DL + page 1 validation. Premier succès gagne.

    Diagnostic granulaire dans `attempted` : `landing_unreachable`,
    `no_get_url`, `dl_unreachable`, `dl_validation_failed` — utile pour
    diagnostiquer pourquoi un md5 connu ne se télécharge pas.
    """
    from pipeline.cascade import _http_get, _save_and_validate

    attempted = []
    # Libgen multi-miroir : ads.php → get.php
    for mirror in get_libgen_mirrors():
        landing_url = f"https://{mirror}/ads.php?md5={md5}"
        landing = _http_get(landing_url, timeout=30)
        if not landing:
            attempted.append(f"{mirror}:landing_unreachable")
            continue
        # Patterns d'extraction de l'URL de DL : `get.php?...` (legacy)
        # ou `get/?...` (variante observée sur certains miroirs récents).
        get_m = (re.search(rb'(get\.php\?[^"\']+)', landing)
                 or re.search(rb'(get/\?[^"\']+)', landing))
        if not get_m:
            attempted.append(f"{mirror}:no_get_url")
            continue
        dl_url = f"https://{mirror}/" + get_m.group(1).decode()
        pdf = _http_get(dl_url, timeout=180, headers={"Referer": landing_url})
        if not pdf:
            attempted.append(f"{mirror}:dl_unreachable")
            continue
        r = _save_and_validate(pdf, ref)
        if r[0] in ("success", "page1_failed"):
            r[1]["md5"] = md5
            r[1]["via"] = f"{via_label}_{mirror}"
            return r
        attempted.append(f"{mirror}:dl_validation_failed")

    # Fallback 1 : annas-archive.org sert un lien DL direct via `/md5/<md5>`.
    for aa_mirror in get_aa_mirrors():
        aa_md5_url = f"https://{aa_mirror}/md5/{md5}"
        landing = _http_get(aa_md5_url, timeout=30)
        if not landing:
            attempted.append(f"aa:{aa_mirror}:landing_unreachable")
            continue
        # AA présente une liste de slow/fast download. On cible le premier lien
        # `/slow_download/<md5>/...` ou `/fast_download/<md5>/...`.
        aa_dl_m = re.search(
            rb'(/(?:slow_download|fast_download|server)/[^"\']+)', landing,
        )
        if not aa_dl_m:
            attempted.append(f"aa:{aa_mirror}:no_dl_link")
            continue
        aa_dl_url = f"https://{aa_mirror}" + aa_dl_m.group(1).decode()
        pdf = _http_get(aa_dl_url, timeout=180, headers={"Referer": aa_md5_url})
        if not pdf:
            attempted.append(f"aa:{aa_mirror}:dl_unreachable")
            continue
        r = _save_and_validate(pdf, ref)
        if r[0] in ("success", "page1_failed"):
            r[1]["md5"] = md5
            r[1]["via"] = f"{via_label}_aa_{aa_mirror}"
            return r
        attempted.append(f"aa:{aa_mirror}:dl_validation_failed")

    # Fallback 2 : library.lol historique.
    lib_url = f"https://library.lol/main/{md5.upper()}"
    pdf = _http_get(lib_url, timeout=60)
    if pdf:
        r = _save_and_validate(pdf, ref)
        if r[0] in ("success", "page1_failed"):
            r[1]["md5"] = md5
            r[1]["via"] = f"{via_label}_library_lol"
            return r
        attempted.append("library_lol:dl_validation_failed")
    else:
        attempted.append("library_lol:dl_unreachable")

    return "failed", {
        "reason": "md5_found_but_no_dl",
        "md5": md5,
        "via_attempted": attempted,
    }


def try_annas_archive(ref: Ref) -> tuple[str, dict]:
    """Cascade complète : F1 scidb-DOI → F2 AA-title → F3 Libgen-direct → DL multi-miroir.

    Ordre :
      1. F1 : si DOI présent → AA `/scidb/<doi>` (tous miroirs AA UP)
      2. F2 : AA title-search (tous miroirs AA UP)
      3. F3 : Libgen direct search (bypass AA Cloudflare, tous miroirs Libgen UP)
      4. DL : multi-miroir Libgen → library.lol fallback
      5. Page 1 anti-homonymie validation finale dans `_save_and_validate`
    """
    from pipeline.cascade import _doi

    doi = _doi(ref)
    author = (ref.frontmatter.get("author") or "").strip()
    title = (ref.frontmatter.get("title") or "").strip()
    md5 = None
    via_label = None
    fail_chain = []

    if doi:
        md5, info = _aa_md5_from_doi(doi)
        if md5:
            via_label = info
        else:
            fail_chain.append(f"F1:{info}")

    if not md5:
        md5, info = _aa_md5_from_title(title, author)
        if md5:
            via_label = info
        else:
            fail_chain.append(f"F2:{info}")

    if not md5:
        md5, info = _libgen_search_direct(title, author)
        if md5:
            via_label = info
        else:
            fail_chain.append(f"F3:{info}")

    if not md5:
        return "no_source", {
            "reason": "all_md5_sources_failed",
            "chain": fail_chain,
        }

    return _md5_download_cascade(md5, ref, via_label)
