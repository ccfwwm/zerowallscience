"""Suivre le DOI jusque chez l'éditeur — le geste que fait un humain.

La cascade interrogeait des annuaires d'accès ouvert (Crossref, Unpaywall,
OpenAlex…) mais n'ouvrait jamais simplement l'adresse de l'article. Or la
plupart des éditeurs déclarent l'adresse du fichier dans la balise
`citation_pdf_url` de leur page, y compris quand aucun annuaire ne les
référence comme ouverts.

Quand cette balise mène à un lecteur intégré plutôt qu'au fichier, on suit le
lecteur d'un cran de plus : c'est le cas de plusieurs plateformes de revues.
"""
from __future__ import annotations

import re
from typing import TYPE_CHECKING
from urllib.parse import urljoin

if TYPE_CHECKING:  # importer `Ref` pour de vrai tirerait la configuration du
    from pipeline.registry import Ref  # coffre, que ce module n'exige pas.

# Deux ordres d'attributs possibles pour la balise normalisée.
_CITATION_PDF = (
    re.compile(r'<meta[^>]+name=["\']citation_pdf_url["\'][^>]+content=["\']([^"\']+)', re.I),
    re.compile(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']citation_pdf_url', re.I),
)
_EMBEDDED = re.compile(r'<(?:iframe|embed)[^>]+src=["\']([^"\']+)', re.I)
_HREF = re.compile(r'href=["\']([^"\']+)', re.I)
_LOOKS_PDF = re.compile(r"\.pdf(\?|$)|downloads?\.php|/pdf/|type=printable", re.I)


def pdf_links_in_html(html: str, base: str, limit: int = 6) -> list[str]:
    """Adresses de fichier plausibles dans une page, la plus sûre d'abord."""
    found: list[str] = []
    for pattern in _CITATION_PDF:
        m = pattern.search(html)
        if m:
            found.append(m.group(1))
    for pattern in (_EMBEDDED, _HREF):
        found.extend(u for u in pattern.findall(html) if _LOOKS_PDF.search(u))
    seen, out = set(), []
    for u in found:
        absolute = urljoin(base, u.replace("&amp;", "&"))
        if absolute not in seen:
            seen.add(absolute)
            out.append(absolute)
    return out[:limit]


def try_publisher_doi(ref: Ref) -> tuple[str, dict]:
    """Ouvre `https://doi.org/<doi>` et descend jusqu'au fichier."""
    from pipeline.cascade import (_doi, _http_get, _is_valid_pdf,
                                  _looks_like_html, _save_and_validate)
    doi = _doi(ref)
    if not doi:
        return "no_source", {"reason": "no_doi"}

    landing = f"https://doi.org/{doi}"
    data = _http_get(landing, timeout=60)
    if not data:
        return "failed", {"reason": "publisher_unreachable", "url": landing}
    if _is_valid_pdf(data):
        return _finish(data, ref, ["direct"], _save_and_validate)
    if not _looks_like_html(data):
        return "failed", {"reason": "publisher_served_neither_pdf_nor_page"}

    page, base, chain = data.decode("utf-8", "ignore"), landing, [landing]
    # Deux niveaux : la page de l'article, puis un éventuel lecteur intégré.
    for depth in range(2):
        next_pages = []
        for url in pdf_links_in_html(page, base):
            chain.append(url)
            got = _http_get(url, timeout=120, headers={"Referer": base})
            if not got:
                continue
            if _is_valid_pdf(got):
                return _finish(got, ref, chain, _save_and_validate)
            if depth == 0 and _looks_like_html(got):
                next_pages.append((got.decode("utf-8", "ignore"), url))
        if not next_pages:
            break
        page, base = next_pages[0]
    return "failed", {"reason": "no_reachable_pdf_on_publisher_page",
                      "chain": chain[:8]}


def _finish(data: bytes, ref: Ref, chain: list[str], save) -> tuple[str, dict]:
    verdict, info = save(data, ref)
    info.setdefault("via", "publisher_doi")
    info.setdefault("chain", chain[:8])
    return verdict, info
