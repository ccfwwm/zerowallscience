"""Module purge — nettoie les wikilinks invalides d'un SOTA.

Phase 4 du plan refonte INGEST. Détecte et corrige 6 cas de wikilinks
posant problème :

A.  Wikilink vers fiche `state=retracted` avec `retracted_reason=
    merged_into:<target>` → remplacé par `[[<target>]]`.
A'. Wikilink vers fiche `state=retracted` pure → strip (garde le texte
    humain qui suivait).
B.  Wikilink vers `lastname_0000_*` (zero-year orphelin) avec un sibling
    `lastname_YYYY_*` validé → remplacé par le sibling.
C.  Wikilink vers slug avec suffixe numérique moche `_2_3` / `_2_3_4` →
    strip (artefacts de runs INGEST passés).
D.  Wikilink vers fichier technique (paths `20_ATLAS/`, `30_DEV/`,
    `00_MANAGEMENT/`, extension `.canvas`) → strip.
D'. Wikilink vers slug non-bibliographique (TitleCase avec underscores,
    ex `IR_Spec_Preliminaire`) → strip.

L'utilisateur invoque ce module via `/paper-trail:purge <SOTA>`. Backup
git auto avant `--apply`.
"""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional

from .sota_sync import (
    _WIKILINK_PATTERN,
    _strip_wikilink_in_line,
)


# Marqueurs de la section ## Statut des sources (auto-générée par linkify).
# La purge SKIPPE cette zone : elle est régénérable et son contenu est
# délibéré (traçabilité des refs retracted listées avec leur slug).
_STATUT_BEGIN_MARKER = "<!-- paper-trail:statut:begin -->"
_STATUT_END_MARKER = "<!-- paper-trail:statut:end -->"

# Patterns
_VALID_REF_SLUG_RE = re.compile(r"^[a-z][a-z0-9]*_(19|20)\d{2}_[a-z0-9_]+$")
_UGLY_SUFFIX_RE = re.compile(r"_\d+_\d+(?:_\d+)+$")  # _2_3, _2_3_4, etc.
_ZERO_YEAR_SLUG_RE = re.compile(r"^[a-z][a-z0-9]*_0000_")

# Préfixes de paths "techniques" (non-bibliographiques) interdits comme
# cibles de wikilinks dans un SOTA.
_TECHNICAL_PATH_PREFIXES = (
    "20_ATLAS/", "30_DEV/", "00_MANAGEMENT/",
)
# Extensions de fichiers techniques
_TECHNICAL_EXTS = (".canvas",)


def _looks_non_bibliographic(base: str) -> bool:
    """True si le nom (sans extension) ressemble à un fichier de projet
    plutôt qu'à une référence bibliographique.

    Heuristique : pattern TitleCase avec underscores entre mots
    (ex: `IR_Spec_Preliminaire`, `Zones_Floues_Formalismes`). Distinct
    des slugs de refs (`lastname_YYYY_word`, tout lowercase + année).
    """
    # Doit contenir au moins un `_`
    if "_" not in base:
        return False
    parts = base.split("_")
    # Au moins 2 parts qui commencent par une majuscule, sans année
    # 4-digit visible.
    has_year = any(re.match(r"^(19|20)\d{2}$", p) for p in parts)
    if has_year:
        return False
    capitalized = sum(1 for p in parts if p and p[0].isupper())
    return capitalized >= 2


class PurgeReason(str, Enum):
    RETRACTED_MERGED = "retracted_merged_to_target"
    RETRACTED_PURE = "retracted_pure"
    ZERO_YEAR_WITH_SIBLING = "zero_year_with_sibling"
    UGLY_SUFFIX = "ugly_numeric_suffix"
    TECHNICAL_PATH = "technical_file"
    NON_BIBLIO_SLUG = "non_bibliographic_slug"


@dataclass
class PurgeAction:
    """Une action de purge à effectuer (strip ou replace) sur une ligne."""
    line_no: int
    raw_wikilink: str
    reason: PurgeReason
    replacement: Optional[str] = None  # None = strip ; sinon nouveau wikilink
    sibling_slug: Optional[str] = None


@dataclass
class PurgeResult:
    """Résultat (plan ou exécution) d'une purge sur un SOTA."""
    sota_path: Path
    actions: list[PurgeAction] = field(default_factory=list)
    n_applied: int = 0
    errors: list[str] = field(default_factory=list)

    def by_reason(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for a in self.actions:
            counts[a.reason.value] = counts.get(a.reason.value, 0) + 1
        return counts


def _build_sibling_index(refs: list) -> dict[str, list]:
    """Index lastname → [refs valides] pour résoudre les zero-year orphelins."""
    from collections import defaultdict
    by_lastname = defaultdict(list)
    for ref in refs:
        lname = ref.slug.split("_", 1)[0]
        by_lastname[lname].append(ref)
    return by_lastname


def _best_sibling_for_zero_year(
    slug: str, by_lastname: dict
) -> Optional[str]:
    """Trouve la meilleure ref `lastname_YYYY_*` à utiliser à la place
    d'une ref orpheline `lastname_0000_*`.
    """
    lname = slug.split("_", 1)[0]
    candidates = [
        r for r in by_lastname.get(lname, [])
        if r.slug != slug
        and not _ZERO_YEAR_SLUG_RE.match(r.slug)
        and r.frontmatter.get("state") != "retracted"
        and _VALID_REF_SLUG_RE.match(r.slug.lower())
    ]
    if not candidates:
        return None
    # Préférence : state validé > has_pdf > defaut
    candidates.sort(
        key=lambda r: (
            r.frontmatter.get("state") == "sota_cited_confirmed",
            r.frontmatter.get("state") == "page1_validated",
            bool(r.frontmatter.get("pdf_path")),
        ),
        reverse=True,
    )
    return candidates[0].slug


def _classify_wikilink(
    target: str, alias: Optional[str],
    by_slug: dict, by_lastname: dict,
    vault_md_stems: Optional[set] = None,
) -> Optional[PurgeAction]:
    """Pour un wikilink `[[target]]` ou `[[target|alias]]`, retourne une
    PurgeAction si invalide, None si légitime.

    `vault_md_stems` : set des stems (nom sans extension) de tous les
    fichiers `.md` du vault. Si le target ou son stem y est, le wikilink
    pointe vers un vrai fichier du vault (cross-référence légitime) et
    NE doit PAS être classé non-bib.
    """
    # Cas D : path technique (préfixe répertoire ou extension)
    if any(target.startswith(p) for p in _TECHNICAL_PATH_PREFIXES):
        return PurgeAction(0, "", PurgeReason.TECHNICAL_PATH, None)
    if any(target.endswith(e) for e in _TECHNICAL_EXTS):
        return PurgeAction(0, "", PurgeReason.TECHNICAL_PATH, None)

    # Détermine le slug effectif
    if alias:
        base = alias
    else:
        base = Path(target).stem
    base_lower = base.lower()

    # Cross-référence légitime : le wikilink pointe vers un VRAI fichier du
    # vault (autre SOTA, MOC, note Atlas, etc.). On NE flag PAS comme non-bib.
    if vault_md_stems is not None:
        if base in vault_md_stems or Path(target).stem in vault_md_stems:
            # On laisse passer la suite (cas A/B/C peuvent encore s'appliquer
            # si c'est aussi un slug retracted/zero-year/ugly, ce qui serait
            # bizarre mais correct).
            # Mais on saute le test non-bib en mémorisant qu'il est dans le vault.
            _is_in_vault = True
        else:
            _is_in_vault = False
    else:
        _is_in_vault = False

    # Cas C : suffixe moche _2_3_4
    if _UGLY_SUFFIX_RE.search(base_lower):
        return PurgeAction(0, "", PurgeReason.UGLY_SUFFIX, None)

    # Cas A : retracted
    ref = by_slug.get(base_lower)
    if ref and ref.frontmatter.get("state") == "retracted":
        rr = ref.frontmatter.get("retracted_reason", "") or ""
        if rr.startswith("merged_into:"):
            target_slug = rr.split(":", 1)[1].strip()
            if target_slug in by_slug:
                return PurgeAction(
                    0, "", PurgeReason.RETRACTED_MERGED,
                    replacement=f"[[{target_slug}]]",
                    sibling_slug=target_slug,
                )
        return PurgeAction(0, "", PurgeReason.RETRACTED_PURE, None)

    # Cas B : zero-year avec sibling
    if _ZERO_YEAR_SLUG_RE.match(base_lower):
        sib = _best_sibling_for_zero_year(base_lower, by_lastname)
        if sib:
            return PurgeAction(
                0, "", PurgeReason.ZERO_YEAR_WITH_SIBLING,
                replacement=f"[[{sib}]]",
                sibling_slug=sib,
            )
        # Sinon : on laisse, le sweep textbook-resolver s'en occupera

    # Cas D' : slug non-bib (TitleCase fichier projet) — SAUF si
    # cross-référence vers un vrai fichier du vault (autre SOTA, MOC, etc.)
    if _looks_non_bibliographic(base) and not _is_in_vault:
        return PurgeAction(0, "", PurgeReason.NON_BIBLIO_SLUG, None)

    return None  # wikilink légitime


def plan_purge(
    sota_path: Path,
    refs: Optional[list] = None,
) -> PurgeResult:
    """Scan le SOTA et produit la liste d'actions de purge (sans appliquer).

    Args:
        sota_path: chemin du SOTA à analyser
        refs: liste pré-chargée de refs (pour tests). Si None, charge via
              iter_refs().
    """
    result = PurgeResult(sota_path=sota_path)
    try:
        text = sota_path.read_text(encoding="utf-8")
    except OSError as e:
        result.errors.append(f"read: {e}")
        return result

    if refs is None:
        from .registry import iter_refs
        refs = list(iter_refs())
    by_slug = {r.slug: r for r in refs}
    by_lastname = _build_sibling_index(refs)

    # Index des stems des fichiers .md du vault, pour distinguer les
    # cross-références légitimes (vers autres SOTAs, MOCs, notes Atlas)
    # des slugs non-bibliographiques cassés.
    vault_md_stems: set[str] = set()
    try:
        from .config import VAULT
        if VAULT.exists():
            for p in VAULT.rglob("*.md"):
                vault_md_stems.add(p.stem)
    except Exception:
        pass

    # Détecte les bornes de la section Statut pour la skipper (zone
    # auto-générée par linkify, régénérable, traçabilité voulue des
    # refs retracted listées avec leur slug).
    lines = text.split("\n")
    statut_start_line = None
    statut_end_line = None
    for i, line in enumerate(lines, start=1):
        if _STATUT_BEGIN_MARKER in line and statut_start_line is None:
            statut_start_line = i
        elif _STATUT_END_MARKER in line and statut_end_line is None:
            statut_end_line = i

    def _in_statut_zone(ln: int) -> bool:
        if statut_start_line is None or statut_end_line is None:
            return False
        return statut_start_line <= ln <= statut_end_line

    for line_no, line in enumerate(lines, start=1):
        if _in_statut_zone(line_no):
            continue
        for m in _WIKILINK_PATTERN.finditer(line):
            target = m.group(1)
            alias = m.group(2)
            raw = m.group(0)
            action = _classify_wikilink(
                target, alias, by_slug, by_lastname,
                vault_md_stems=vault_md_stems,
            )
            if action is not None:
                action.line_no = line_no
                action.raw_wikilink = raw
                result.actions.append(action)
    return result


def apply_purge(result: PurgeResult) -> int:
    """Applique la liste d'actions sur le SOTA. Idempotent.

    Retourne le nombre d'actions effectivement appliquées (= len(actions)
    moins celles qui n'ont rien à faire car le wikilink a déjà été retiré
    par une autre action sur la même ligne).
    """
    if not result.actions:
        return 0
    try:
        text = result.sota_path.read_text(encoding="utf-8")
    except OSError as e:
        result.errors.append(f"read: {e}")
        return 0

    # Group actions by line number
    actions_per_line: dict[int, list[PurgeAction]] = {}
    for a in result.actions:
        actions_per_line.setdefault(a.line_no, []).append(a)

    new_lines: list[str] = []
    n_applied = 0
    for line_no, line in enumerate(text.split("\n"), start=1):
        new_line = line
        for action in actions_per_line.get(line_no, []):
            if action.raw_wikilink not in new_line:
                continue  # déjà retiré
            if action.replacement is not None:
                new_line = new_line.replace(
                    action.raw_wikilink, action.replacement, 1
                )
            else:
                new_line = _strip_wikilink_in_line(new_line, action.raw_wikilink)
            n_applied += 1
        new_lines.append(new_line)

    if n_applied > 0:
        result.sota_path.write_text("\n".join(new_lines), encoding="utf-8")
    result.n_applied = n_applied
    return n_applied
