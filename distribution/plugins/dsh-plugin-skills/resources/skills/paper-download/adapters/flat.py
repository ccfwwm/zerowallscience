"""Adapter Flat — layout plat sans dépendance Obsidian.

Conventions :
- SOTAs : `<vault>/sotas/*.md`
- Refs : `<vault>/refs/*.md` (registre)
- Citations : Markdown links standard `[text](refs/slug.md)` ou
  `[slug](slug.md)` selon préférence. On accepte les deux.
- Index complet : tous les `.md` du vault.

Convient pour un workflow non-Obsidian (Pandoc, mkdocs, etc.).
"""
from __future__ import annotations
import re
from pathlib import Path

from .base import Adapter, BibliographySection
# Réutilise l'implémentation Obsidian pour l'extraction des sections
# bibliographiques (même format markdown).
from .obsidian import ObsidianAdapter


# Match :
#   [anything](refs/slug.md)
#   [anything](slug.md)
# Capture le slug (nom de fichier sans .md, alphanumeric + underscore).
_MD_LINK_RE = re.compile(r"\]\((?:[^)]*?/)?([a-z0-9_]+)\.md\)")


class FlatAdapter(Adapter):
    """Adapter flat — vault plat sans dépendance Obsidian."""

    def index_md_files(self) -> set[str]:
        """Rglob tous les .md du vault."""
        names: set[str] = set()
        if not self.vault_root.exists():
            return names
        for p in self.vault_root.rglob("*.md"):
            names.add(p.stem)
        return names

    def find_sotas(self) -> list[Path]:
        """Glob `sotas/*.md` sous le vault."""
        sotas_dir = self.vault_root / "sotas"
        if not sotas_dir.exists():
            return []
        return list(sotas_dir.glob("*.md"))

    def parse_citations(self, sota_path: Path) -> list[str]:
        """Extrait les `](refs/slug.md)` ou `](slug.md)` du body markdown."""
        try:
            body = sota_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return []
        return [m.group(1) for m in _MD_LINK_RE.finditer(body)]

    def sota_output_path(self, topic_slug: str) -> Path:
        """Sous `<vault>/sotas/<topic_slug>.md`."""
        return self.vault_root / "sotas" / f"{topic_slug}.md"

    def format_citation(self, slug: str) -> str:
        """Markdown link standard vers `refs/<slug>.md`."""
        return f"[{slug}](refs/{slug}.md)"

    def extract_bibliography_sections(
        self, sota_path: Path
    ) -> list[BibliographySection]:
        """Délègue à ObsidianAdapter — les en-têtes markdown sont
        identiques entre layouts flat et obsidian."""
        return ObsidianAdapter(self.vault_root).extract_bibliography_sections(
            sota_path
        )
