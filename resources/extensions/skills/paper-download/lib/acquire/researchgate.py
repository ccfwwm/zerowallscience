"""ResearchGate — les textes intégraux déposés par leurs auteurs.

Beaucoup de chercheurs y déposent eux-mêmes des travaux par ailleurs payants.
C'est du dépôt d'auteur, pas une bibliothèque de l'ombre : la source n'est
donc pas conditionnée à `RESEARCH_ENABLE_SHADOW_LIBS`.

Deux conditions, découvertes sur le terrain :

  - **Un compte est nécessaire.** Le site ne sert le texte intégral qu'à une
    session ouverte. On lit les témoins de session dans le fichier désigné par
    `RESEARCH_BROWSER_COOKIES` — exporté depuis votre propre navigateur. Sans
    ce fichier, la source se déclare indisponible et la cascade continue.
  - **Tout doit passer par le navigateur.** Le contrôle vérifie la signature
    du client autant que les témoins : rejouer les témoins depuis un programme
    ne suffit pas.

Le site freine les visiteurs insistants. On respecte un écart minimal entre
deux recherches et on n'insiste pas quand le contrôle se referme : la
référence repart en échec passager et sera reprise plus tard.
"""
from __future__ import annotations

import os
import re
import time
import unicodedata
from typing import TYPE_CHECKING

from ..browser_session import (BrowserUnavailable, available, dismiss_banner,
                             download_url, get_page, open_page)

if TYPE_CHECKING:
    from pipeline.registry import Ref

BASE = "https://www.researchgate.net"
# Écart minimal entre deux recherches : en dessous, le site referme le contrôle
# anti-robot pour le reste de la session.
SEARCH_GAP_S = int(os.environ.get("RESEARCH_RG_SEARCH_GAP_S") or 25)
_LAST_SEARCH = [0.0]

_FIND_RESULTS = """() => [...document.querySelectorAll('a[href*="/publication/"]')]
    .map(a => ({href: a.href.split('?')[0], txt: (a.innerText || '').trim()}))
    .filter(x => x.txt.length > 20).slice(0, 10)"""

_FIND_FULLTEXT = """() => ([...document.querySelectorAll('a[href]')].map(x => x.href)
    .find(h => /\\.pdf/.test(h) && h.includes('/publication/')) || null)"""


def available_here() -> tuple[bool, str]:
    """Navigateur utilisable *et* témoins de session fournis."""
    ok, why = available()
    if not ok:
        return False, why
    path = os.environ.get("RESEARCH_BROWSER_COOKIES")
    if not path or not os.path.isfile(path):
        return False, "no_session_cookies_set_RESEARCH_BROWSER_COOKIES"
    return True, "ok"


def _fold(s: str) -> str:
    """Réduit à des mots comparables : sans accents, sans ponctuation."""
    plain = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9 ]", " ", plain.lower())


def _significant_words(title: str) -> set[str]:
    return {w for w in _fold(title).split() if len(w) >= 4}


def _throttle(page) -> None:
    waited = SEARCH_GAP_S - (time.monotonic() - _LAST_SEARCH[0])
    if waited > 0:
        page.wait_for_timeout(int(waited * 1000))
    _LAST_SEARCH[0] = time.monotonic()


def find_record(page, title: str) -> tuple[str | None, str]:
    """Cherche le titre et rend l'adresse de la notice la plus proche.

    On n'accepte une notice que si elle partage assez de mots significatifs
    avec le titre attendu : une correspondance approximative livrerait le
    mauvais document, que la validation page 1 rejetterait ensuite — au prix
    d'un téléchargement inutile et d'une empreinte inscrite au refus.
    """
    words = [w for w in _fold(title).split() if len(w) >= 4][:10]
    if not words:
        return None, "title_too_generic_to_search"
    _throttle(page)
    _, why = open_page(page, f"{BASE}/search/publication?q=" + "+".join(words),
                       settle_ms=4000)
    if why != "ok":
        return None, why
    dismiss_banner(page)
    page.wait_for_timeout(2000)
    try:
        results = page.evaluate(_FIND_RESULTS)
    except Exception:
        results = []
    if not results:
        return None, "no_search_result"
    expected = _significant_words(title)
    scored = sorted(results, key=lambda r: len(expected & _significant_words(r["txt"])),
                    reverse=True)
    best = scored[0]
    hits = len(expected & _significant_words(best["txt"]))
    if hits < max(3, len(expected) // 3):
        return None, "no_close_enough_match"
    return best["href"], "ok"


def try_researchgate(ref: Ref) -> tuple[str, dict]:
    """Source de cascade : le texte intégral déposé sur ResearchGate."""
    ok, why = available_here()
    if not ok:
        return "no_source", {"reason": why}

    from pipeline.cascade import _save_and_validate
    title = str(ref.frontmatter.get("title") or "").strip().strip("'\"")
    if not title:
        return "no_source", {"reason": "no_title_to_search"}

    try:
        page = get_page()
    except BrowserUnavailable as e:
        return "no_source", {"reason": str(e)}

    record = str(ref.frontmatter.get("researchgate_url") or "").strip()
    if not record:
        record, why = find_record(page, title)
        if not record:
            # Le contrôle anti-robot est passager : la référence doit rester
            # reprenable, pas être classée sans suite.
            if why == "anti_bot_challenge":
                return "failed", {"reason": "anti_bot_challenge_retry_later"}
            return "no_source", {"reason": why}

    _, why = open_page(page, record, settle_ms=4000)
    if why != "ok":
        if why == "anti_bot_challenge":
            return "failed", {"reason": "anti_bot_challenge_retry_later"}
        return "failed", {"reason": why, "record": record}
    try:
        link = page.evaluate(_FIND_FULLTEXT)
    except Exception:
        link = None
    if not link:
        return "no_source", {"reason": "no_author_deposited_fulltext",
                             "record": record}
    data = download_url(page, link, timeout_ms=120000)
    if not data:
        return "failed", {"reason": "fulltext_download_refused", "record": record}
    verdict, info = _save_and_validate(data, ref)
    info.setdefault("via", "researchgate")
    info.setdefault("record", record)
    return verdict, info
