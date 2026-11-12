"""Anna's Archive — le lecteur d'articles, sans passer par les créneaux.

La voie déjà en place (`annas_headful`) cherche le fichier dans le fonds
général et doit franchir la file d'attente des « téléchargements lents »,
contingentée : passé quelques dizaines de fichiers, elle ne délivre plus rien
et c'est ce qui la fait échouer sur la plupart des articles.

Le lecteur d'articles est une porte différente : interrogé par identifiant, il
affiche directement le document et expose une adresse de fichier signée, sans
file d'attente. Sur un corpus réel, c'est la voie qui rapporte des articles là
où la première ne rapportait plus rien.

Le contrôle anti-robot du site n'est franchi que par un navigateur visible,
d'où la session partagée en affichage virtuel.

L'usage de ce fonds peut violer le droit d'auteur dans votre juridiction.
Cf. DISCLAIMER.md à la racine du greffon.
"""
from __future__ import annotations

import os
from typing import TYPE_CHECKING

from ..browser_session import (BrowserUnavailable, available, get_page,
                             open_page, download_url)
from .mirrors import get_aa_mirrors

if TYPE_CHECKING:
    from pipeline.registry import Ref

# Le lecteur met quelques secondes à composer la vue du document.
READER_SETTLE_MS = int(os.environ.get("RESEARCH_SCIDB_SETTLE_MS") or 4000)

# L'adresse signée que le lecteur expose : soit un fichier `.pdf` franc, soit
# la forme interne `/scidb/<...>~/`.
_FIND_PDF = """() => {
    const candidates = [];
    for (const el of document.querySelectorAll('iframe, embed, object'))
        candidates.push(el.src || el.data || '');
    for (const a of document.querySelectorAll('a[href]')) candidates.push(a.href);
    return candidates.find(u => u && /\\.pdf(\\?|$)|\\/scidb\\/.*~\\//.test(u)) || null;
}"""


def _reader_pdf_url(page, mirror: str, doi: str) -> str | None:
    """Ouvre le lecteur pour cet identifiant et rend l'adresse du fichier."""
    _, why = open_page(page, f"{mirror}/scidb/{doi}", settle_ms=READER_SETTLE_MS)
    if why != "ok":
        return None
    try:
        return page.evaluate(_FIND_PDF)
    except Exception:
        return None


def try_annas_scidb(ref: Ref) -> tuple[str, dict]:
    """Source de cascade : le lecteur d'articles d'Anna's Archive."""
    ok, why = available()
    if not ok:
        return "no_source", {"reason": why}

    from pipeline.cascade import _doi, _save_and_validate
    doi = _doi(ref)
    if not doi:
        return "no_source", {"reason": "no_doi"}

    try:
        page = get_page()
    except BrowserUnavailable as e:
        return "no_source", {"reason": str(e)}

    seen_reader = False
    for mirror in get_aa_mirrors():
        url = _reader_pdf_url(page, mirror, doi)
        if not url:
            continue
        seen_reader = True
        # L'adresse est signée et liée aux témoins du navigateur : on la
        # demande depuis le contexte du navigateur, pas depuis Python.
        data = None
        try:
            response = page.context.request.get(url, timeout=120000)
            body = response.body()
            if body[:5] == b"%PDF-":
                data = body
        except Exception:
            data = None
        if data is None:
            data = download_url(page, url)
        if data:
            verdict, info = _save_and_validate(data, ref)
            info.setdefault("via", f"annas_scidb@{mirror}")
            return verdict, info
    if seen_reader:
        return "failed", {"reason": "reader_link_not_downloadable", "doi": doi}
    return "no_source", {"reason": "not_in_scidb", "doi": doi}
