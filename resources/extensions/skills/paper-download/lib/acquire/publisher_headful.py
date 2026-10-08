"""L'éditeur, ouvert dans un vrai navigateur.

Plusieurs éditeurs refusent toute requête de programme — 403, ou pire une page
d'accueil servie avec un code 200 — et servent sans difficulté un navigateur
ordinaire. Le cas relevé sur le terrain : MDPI, PMC, JMIR, ASHA. PMC est le
plus trompeur, puisqu'il rend du HTML avec un code 200 à l'adresse même du
fichier : une source qui ne vérifierait que le code croirait avoir réussi.

On ouvre donc la page de l'article dans la session partagée, on y repère le
lien du texte intégral, et on fait enregistrer le fichier par le navigateur.

Cette voie ne récupère que ce que l'éditeur publie : ce n'est pas une
bibliothèque de l'ombre, elle n'est donc pas conditionnée à
`RESEARCH_ENABLE_SHADOW_LIBS`. Elle vient tard dans la cascade parce qu'elle
coûte plusieurs secondes par référence, là où les annuaires coûtent une requête.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from ..browser_session import (BrowserUnavailable, available, download_url,
                             get_page, open_page, pdf_links_on_page)

if TYPE_CHECKING:
    from pipeline.registry import Ref


def try_publisher_headful(ref: Ref) -> tuple[str, dict]:
    """Source de cascade : la page de l'éditeur, pilotée au navigateur."""
    ok, why = available()
    if not ok:
        return "no_source", {"reason": why}

    from pipeline.cascade import _doi, _save_and_validate
    doi = _doi(ref)
    manual = str(ref.frontmatter.get("oa_url") or "").strip()
    starts = [u for u in (f"https://doi.org/{doi}" if doi else "", manual) if u]
    if not starts:
        return "no_source", {"reason": "no_doi_and_no_manual_url"}

    try:
        page = get_page()
    except BrowserUnavailable as e:
        return "no_source", {"reason": str(e)}

    last = "no_starting_point"
    for start in starts:
        _, why = open_page(page, start)
        if why != "ok":
            last = why
            continue
        links = pdf_links_on_page(page)
        if not links:
            last = "no_fulltext_link_on_page"
            continue
        for url in links:
            data = download_url(page, url)
            if data:
                verdict, info = _save_and_validate(data, ref)
                info.setdefault("via", f"publisher_headful:{start}")
                return verdict, info
        last = "fulltext_links_not_downloadable"
    # Le contrôle anti-robot est passager : la référence reste reprenable.
    if last == "anti_bot_challenge":
        return "failed", {"reason": "anti_bot_challenge_retry_later"}
    return "failed", {"reason": last}
