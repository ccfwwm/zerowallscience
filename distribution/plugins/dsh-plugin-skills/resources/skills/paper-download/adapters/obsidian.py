"""Adapter Obsidian — layout par défaut.

Conventions :
- SOTAs : `SOTA_*.md` co-localisés sous le vault (récursif). Convention
  observée sur les vaults de recherche (`10_SOURCES/<biblio>/SOTA_*.md`,
  `40_OUTPUT/Papers/<P*>/SOTA_*.md`).
- Papers : `Paper_*.md` ou `P*_*.md` (pattern P9alpha_v1_FR, etc.).
- Citations : wikilinks Obsidian `[[slug]]`.
- Index complet : tous les `.md` du vault (rglob), pour vérifier
  l'existence d'un nom cité.
"""
from __future__ import annotations
import re
from pathlib import Path

from .base import Adapter, BibliographySection


_WIKILINK_RE = re.compile(r"\[\[([a-z0-9_]+)\]\]")

# Headers markdown niveau 2 à 4 (## à ####)
_HEADER_RE = re.compile(r"^(#{2,4})\s+(.+?)\s*$")

# Mots-clés des sections candidates pour ingestion. Word boundary à
# gauche (\b) pour éviter "Ressources" matchant "sources". Ouvert à
# droite pour accepter pluriels/féminins ("Références", "Bibliographie",
# "Bibliographies", etc.).
_BIBLIO_KEYWORDS_RE = re.compile(
    r"\b("
    r"r[ée]f[ée]rence|"      # référence, références, reference, references
    r"bibliograph|"           # bibliographie, bibliographies, bibliography
    r"sources?|"              # source, sources (mais pas ressources)
    r"literature|"
    r"citation|"              # citation, citations
    r"works?\s+cited|"
    r"further\s+reading"
    r")",
    re.IGNORECASE,
)

# Mots-clés des sections volontairement écartées (à skipper).
_EXCLUDED_KEYWORDS_RE = re.compile(
    r"\b("
    r"[ée]cart[ée]|"          # écarté, écartée, écartés, écartées
    r"rejet[ée]|"             # rejeté, rejetée, rejetés, rejetées (FR)
    r"reject(ed)?|"           # reject, rejected (EN)
    r"hallucin|"              # hallucination, hallucinations, hallucinée
    r"retract|"               # retract, retracted, retraction
    r"non\s+utilis[ée]|"
    r"invalide|"
    r"fausse|"
    r"skipp"                  # skip, skipped, skippée
    r")",
    re.IGNORECASE,
)


class ObsidianAdapter(Adapter):
    """Adapter pour vault Obsidian (layout par défaut)."""

    def index_md_files(self) -> set[str]:
        """Rglob tous les .md du vault, retourne l'ensemble des stems."""
        names: set[str] = set()
        if not self.vault_root.exists():
            return names
        for p in self.vault_root.rglob("*.md"):
            names.add(p.stem)
        return names

    def find_sotas(self) -> list[Path]:
        """Rglob SOTA_*.md et Paper_*.md."""
        if not self.vault_root.exists():
            return []
        results: list[Path] = []
        for pattern in ("SOTA_*.md", "Paper_*.md"):
            results.extend(self.vault_root.rglob(pattern))
        return results

    def parse_citations(self, sota_path: Path) -> list[str]:
        """Extrait les `[[slug]]` du body markdown du SOTA."""
        try:
            body = sota_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return []
        return [m.group(1) for m in _WIKILINK_RE.finditer(body)]

    def sota_output_path(self, topic_slug: str) -> Path:
        """Par défaut, place à la racine du vault (l'utilisateur peut
        ensuite déplacer le SOTA dans son dossier biblio approprié).
        """
        return self.vault_root / f"SOTA_{topic_slug}.md"

    def format_citation(self, slug: str) -> str:
        """Wikilink Obsidian."""
        return f"[[{slug}]]"

    def extract_bibliography_sections(
        self, sota_path: Path
    ) -> list[BibliographySection]:
        """Détecte les sections markdown h2-h4 dont le titre matche un
        pattern bibliographique. Retourne le contenu brut pour parsing
        par le sub-agent `citation-parser`.

        Marque comme `is_excluded` les sections explicitement écartées.
        """
        try:
            text = sota_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return []

        lines = text.splitlines(keepends=True)
        offsets = [0]
        for line in lines:
            offsets.append(offsets[-1] + len(line))

        sections: list[BibliographySection] = []
        current_header: str | None = None
        current_header_line_idx: int = -1
        current_lines: list[str] = []
        current_is_excluded: bool = False

        def _close_section(end_line_idx: int) -> None:
            if current_header is None:
                return
            start = offsets[current_header_line_idx + 1]  # après le header
            end = offsets[end_line_idx]
            sections.append(BibliographySection(
                sota_path=sota_path,
                header=current_header,
                start_offset=start,
                end_offset=end,
                raw_text="".join(current_lines),
                is_excluded=current_is_excluded,
            ))

        for i, line in enumerate(lines):
            stripped = line.strip()
            m = _HEADER_RE.match(stripped)
            if m:
                # Ferme la section courante avant ce nouveau header
                if current_header is not None:
                    _close_section(i)
                    current_header = None
                    current_lines = []
                    current_is_excluded = False

                header_text = m.group(2)
                if _BIBLIO_KEYWORDS_RE.search(header_text):
                    current_header = stripped
                    current_header_line_idx = i
                    current_is_excluded = bool(
                        _EXCLUDED_KEYWORDS_RE.search(header_text)
                    )
            elif current_header is not None:
                current_lines.append(line)

        # Ferme la dernière section ouverte
        if current_header is not None:
            _close_section(len(lines))

        return sections
