"""Assainissement des métadonnées reçues des fournisseurs bibliographiques.

Crossref rend des titres porteurs de balises JATS et de sauts de ligne
d'indentation, par exemple :

    "The Medicine Dance of the\n      <i>!</i>\n      Kung Bushmen"

Écrit tel quel au registre, ce titre a produit un nom de fichier contenant
un saut de ligne littéral, ce qui casse tout traitement en ligne de commande
sur le coffre (retour de terrain, septembre 2026).
"""
from __future__ import annotations

import html as _html
import re

_TAG = re.compile(r"<[^>]+>")
_SPACE = re.compile(r"\s+")
# Caractères de contrôle et séparateurs de ligne Unicode, que la classe des
# blancs ne couvre pas toujours : on les traite explicitement.
_CONTROL = re.compile(r"[\x00-\x1f\x7f  ]")
# Tout sauf lettres/chiffres/souligné, espace et trait d'union.
_UNSAFE_IN_NAME = re.compile(r"[^\w -]")


def clean_metadata_text(value: str | None) -> str:
    """Dépouille le balisage, déplie les entités, réduit les blancs à une espace.

    Sûr sur une valeur absente ou déjà propre : rend alors la chaîne telle
    quelle, aux blancs de bord près.
    """
    if not value:
        return ""
    text = _html.unescape(_TAG.sub(" ", str(value)))
    text = _CONTROL.sub(" ", text)
    return _SPACE.sub(" ", text).strip()


def safe_filename_fragment(value: str | None, limit: int = 50,
                           fallback: str = "untitled") -> str:
    """Fragment de nom de fichier sûr, dérivé d'un titre.

    L'ancienne version filtrait sur la classe « ni mot ni blanc », or les
    blancs incluent le saut de ligne : un titre replié survivait au filtre
    et se retrouvait dans le nom du fichier. On assainit d'abord, on filtre
    ensuite.
    """
    text = clean_metadata_text(value)[:limit]
    text = _UNSAFE_IN_NAME.sub("", text)
    return _SPACE.sub(" ", text).strip().replace(" ", "_")[:limit] or fallback
