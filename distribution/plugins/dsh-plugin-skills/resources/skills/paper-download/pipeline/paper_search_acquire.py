"""Module paper_search_acquire — tier natif intégré (P6.1).

Étend acquire en exploitant les 13 plateformes additionnelles intégrées
nativement dans `pipeline/cascade_sources/` :

    dblp, Semantic Scholar, PMC, Europe PMC, biorxiv, medrxiv, OpenAIRE,
    CiteSeerX, DOAJ, BASE, Zenodo, SSRN, IACR

Anciennement (avant intégration native) : subprocess vers paper-search-mcp
CLI externe. Maintenant : appels directs aux classes Searcher.

Invoqué en fallback par `pipeline/acquire.py::run_acquire_for_sota` quand
la cascade native du worker B n'a pas obtenu de PDF. Valide page 1
anti-homonymie avant d'accepter.
"""
from __future__ import annotations
from pathlib import Path
from typing import Optional


def _extract_lastname(author: str) -> str:
    if not author:
        return ""
    first = author.split(",")[0].split(" et al.")[0]
    parts = first.split()
    return parts[0].lower() if parts else ""


def _get_searchers():
    """Instancie les 13 searchers (lazy, pour éviter le coût d'init au
    chargement du module)."""
    from .cascade_sources import (
        DBLPSearcher, SemanticSearcher, PMCSearcher, EuropePMCSearcher,
        BioRxivSearcher, MedRxivSearcher, OpenAiresearcher,
        CiteSeerXSearcher, DOAJSearcher, BASESearcher, ZenodoSearcher,
        SSRNSearcher, IACRSearcher,
    )
    return [
        ("dblp", DBLPSearcher()),
        ("semantic", SemanticSearcher()),
        ("pmc", PMCSearcher()),
        ("europepmc", EuropePMCSearcher()),
        ("biorxiv", BioRxivSearcher()),
        ("medrxiv", MedRxivSearcher()),
        ("openaire", OpenAiresearcher()),
        ("citeseerx", CiteSeerXSearcher()),
        ("doaj", DOAJSearcher()),
        ("base", BASESearcher()),
        ("zenodo", ZenodoSearcher()),
        ("ssrn", SSRNSearcher()),
        ("iacr", IACRSearcher()),
    ]


def _author_matches(authors_field, expected_lastname: str) -> bool:
    """True si le lastname attendu apparaît dans la liste d'auteurs."""
    if not expected_lastname:
        return True
    if isinstance(authors_field, list):
        joined = " ".join(str(a) for a in authors_field).lower()
    else:
        joined = str(authors_field or "").lower()
    return expected_lastname in joined


def _year_matches(published_date, expected_year: str) -> bool:
    """True si la date publication est dans l'année attendue (si fournie)."""
    if not expected_year:
        return True
    s = str(published_date or "")
    return s[:4] == expected_year if len(s) >= 4 else False


def try_paper_search_download(
    author: str,
    year: str,
    title: str,
    dest_dir: Path,
) -> Optional[tuple[Path, str]]:
    """Tente de télécharger un PDF via les 13 sources additionnelles.

    Retourne (pdf_path, source_name) si succès, None sinon.

    Stratégie : itère sur les 13 searchers, lance search sur chacun,
    filtre par lastname + year, et tente download_pdf sur le 1er match
    avec PDF accessible. Le 1er DL réussi gagne.
    """
    if not title:
        return None

    expected_lastname = _extract_lastname(author)
    expected_year = (year or "").strip()
    query = title.strip()
    if author:
        query += " " + author
    if year:
        query += " " + year

    dest_dir.mkdir(parents=True, exist_ok=True)

    for source_name, searcher in _get_searchers():
        try:
            papers = searcher.search(query, max_results=3)
        except Exception:
            continue
        if not papers:
            continue

        for paper in papers:
            # Filtre auteur + année
            if not _author_matches(getattr(paper, "authors", None), expected_lastname):
                continue
            if not _year_matches(
                getattr(paper, "published_date", None), expected_year
            ):
                continue
            paper_id = getattr(paper, "paper_id", None)
            if not paper_id:
                continue
            # Tentative de download
            try:
                pdf_path_str = searcher.download_pdf(paper_id, str(dest_dir))
            except Exception:
                continue
            if not pdf_path_str:
                continue
            pdf_path = Path(pdf_path_str)
            if not pdf_path.exists() or pdf_path.stat().st_size < 1000:
                continue
            return (pdf_path, source_name)

    return None
