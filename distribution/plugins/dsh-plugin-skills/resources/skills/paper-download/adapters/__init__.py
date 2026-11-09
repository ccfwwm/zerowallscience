"""Adapters de layout vault — factory.

Activation via la variable d'environnement RESEARCH_VAULT_LAYOUT.
Défaut : obsidian.

Layouts supportés :
- `obsidian` : vault Obsidian standard (wikilinks `[[slug]]`, SOTAs en
  `SOTA_*.md` co-localisés)
- `flat` : vault plat (markdown links `](refs/slug.md)`, SOTAs sous
  `sotas/`, refs sous `refs/`)
- `zotero` : stub V2, raise NotImplementedError

Usage typique :
    from adapters import get_adapter
    adapter = get_adapter()  # lit RESEARCH_VAULT_LAYOUT
    sotas = adapter.find_sotas()
    citations = adapter.parse_citations(sotas[0])
"""
from __future__ import annotations
import os
from pathlib import Path

from .base import Adapter


def get_adapter(
    layout: str | None = None,
    vault_root: Path | None = None,
) -> Adapter:
    """Factory : retourne l'adapter correspondant au layout demandé.

    Args:
      layout: nom du layout (obsidian / flat / zotero). Si None, lit
        RESEARCH_VAULT_LAYOUT (défaut : obsidian).
      vault_root: racine du vault. Si None, lit RESEARCH_VAULT_PATH ou
        utilise la valeur par défaut de pipeline.config.VAULT.

    Returns:
      Adapter instance.

    Raises:
      ValueError: si layout inconnu.
    """
    layout = layout or os.environ.get("RESEARCH_VAULT_LAYOUT", "obsidian")
    if vault_root is None:
        # Import lazy pour éviter cycle config ↔ adapters
        from pipeline.config import VAULT
        vault_root = VAULT

    if layout == "obsidian":
        from .obsidian import ObsidianAdapter
        return ObsidianAdapter(vault_root)
    elif layout == "flat":
        from .flat import FlatAdapter
        return FlatAdapter(vault_root)
    elif layout == "zotero":
        from .zotero import ZoteroAdapter
        return ZoteroAdapter(vault_root)
    else:
        raise ValueError(
            f"Unknown vault layout: {layout!r}. "
            f"Supported: 'obsidian', 'flat', 'zotero'."
        )
