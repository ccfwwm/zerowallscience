"""Base abstraite des adapters de layout vault.

Un adapter décrit comment résoudre les SOTAs, les refs et les citations
dans un layout donné (Obsidian, flat, Zotero, etc.). Permet au plugin
paper-trail de tourner sur différentes organisations de vault sans
hardcoder l'arborescence.

Activation : variable d'environnement RESEARCH_VAULT_LAYOUT.
Default : obsidian.
"""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path


@dataclass
class BibliographySection:
    """Bloc de texte candidat pour ingestion par INGEST.

    Représente une section d'un SOTA qui contient des citations à
    extraire — typiquement `## Références`, `## Bibliographie`, ou une
    liste bibliographique. Le contenu brut (`raw_text`) est destiné à
    être parsé par le sub-agent `citation-parser`.

    Le champ `is_excluded` est `True` si l'en-tête correspond à une
    section volontairement écartée (« Écartées », « Hallucinées »,
    « Retracted ») — INGEST ne parse pas ces sections.
    """
    sota_path: Path
    header: str           # texte complet du header markdown ("## Références Clés")
    start_offset: int     # offset dans le fichier (en caractères) où démarre la section
    end_offset: int       # offset de fin (exclusif)
    raw_text: str         # contenu de la section (sans le header)
    is_excluded: bool     # True = à skipper (refs volontairement écartées)


class Adapter(ABC):
    """Interface abstraite pour un adapter de layout vault.

    Chaque sous-classe implémente la résolution des SOTAs, refs et
    citations selon sa convention.

    Args:
      vault_root: racine du vault (en général issu de RESEARCH_VAULT_PATH).
    """

    def __init__(self, vault_root: Path):
        self.vault_root = vault_root

    @abstractmethod
    def index_md_files(self) -> set[str]:
        """Index par stem de TOUS les .md indexables du vault.

        Utilisé par I11 pour vérifier l'existence d'un nom cité dans
        `cited_in[].name`.
        """
        ...

    @abstractmethod
    def find_sotas(self) -> list[Path]:
        """Retourne les chemins des fichiers SOTA/Paper du vault.

        Utilisé par I12 pour scanner la réciprocité ref↔SOTA.
        """
        ...

    @abstractmethod
    def parse_citations(self, sota_path: Path) -> list[str]:
        """Extrait les slugs de refs cités depuis un SOTA.

        Format dépendant de l'adapter (wikilinks `[[slug]]` pour Obsidian,
        markdown links `[text](path/to/slug.md)` pour flat, etc.).
        """
        ...

    @abstractmethod
    def sota_output_path(self, topic_slug: str) -> Path:
        """Où écrire un nouveau SOTA sur ce sujet.

        Utilisé par le skill sota-writer.
        """
        ...

    @abstractmethod
    def format_citation(self, slug: str) -> str:
        """Format de citation textuelle pour ce slug dans cet adapter.

        Ex: `[[slug]]` pour Obsidian, `[slug](refs/slug.md)` pour flat.
        """
        ...

    @abstractmethod
    def extract_bibliography_sections(
        self, sota_path: Path
    ) -> list[BibliographySection]:
        """Extrait les sections candidates pour ingestion d'un SOTA.

        Cible : sections dont le titre matche un pattern bibliographique
        (« Références », « Bibliographie », « Sources », « Literature »,
        etc.), niveau h2-h4.

        Marque comme `is_excluded` les sections « Écartées »,
        « Rejetées », « Hallucinées », « Retracted », « Non utilisées »
        (case-insensitive). INGEST les retournera pour traçabilité
        mais ne les parsera pas.

        Le contenu brut (`raw_text`) est destiné au sub-agent
        `citation-parser` qui retournera des citations structurées.
        """
        ...
