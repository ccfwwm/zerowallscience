"""Adapter Zotero — stub V2.

Intégration prévue avec une bibliothèque Zotero (via better-bibtex export
ou Zotero API) pour les utilisateurs qui maintiennent leurs références
dans Zotero plutôt qu'un vault markdown.

**Statut V0.1 : non implémenté.** Lève NotImplementedError clean.
À implémenter en V2 après usage réel des adapters obsidian + flat.
"""
from __future__ import annotations
from pathlib import Path

from .base import Adapter, BibliographySection


class ZoteroAdapter(Adapter):
    """Stub Zotero — non implémenté en V0.1."""

    def _raise(self) -> None:
        raise NotImplementedError(
            "ZoteroAdapter — non implémenté en V0.1. "
            "Roadmap : V2 après stabilisation des adapters obsidian + flat. "
            "Pour l'instant, exportez votre bibliothèque Zotero via "
            "better-bibtex en markdown plat et utilisez l'adapter `flat`."
        )

    def index_md_files(self) -> set[str]:
        self._raise()
        return set()  # unreachable

    def find_sotas(self) -> list[Path]:
        self._raise()
        return []  # unreachable

    def parse_citations(self, sota_path: Path) -> list[str]:
        self._raise()
        return []  # unreachable

    def sota_output_path(self, topic_slug: str) -> Path:
        self._raise()
        return Path()  # unreachable

    def format_citation(self, slug: str) -> str:
        self._raise()
        return ""  # unreachable

    def extract_bibliography_sections(
        self, sota_path: Path
    ) -> list[BibliographySection]:
        self._raise()
        return []  # unreachable
