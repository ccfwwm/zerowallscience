"""Module sota_sync — propage les mutations de slug vers les SOTAs.

Quand une fiche du registre passe en `retracted` (via arbitrate, sweep
textbook, retract-uncited) ou est mergée vers une autre fiche, les
wikilinks `[[slug]]` qui pointent vers elle dans les SOTAs deviennent
obsolètes. Ce module garantit que toute mutation d'identité au registre
entraîne la mise à jour synchrone des SOTAs concernés, dans la même
transaction (commit git pré-flight via `_ensure_git_backup`).

Branché depuis (phase 2 du plan) :
- pipeline/cli.py::cmd_arbitrate (action retract)
- pipeline/cli.py::cmd_resolve_textbooks (action merge_into)
- pipeline/cli.py::cmd_retract_uncited
- pipeline/doctor.py::auto_fix (I22, I23 — phase 7)

API publique : `update_wikilinks_in_sotas(old_slug, new_slug, ...)`.
"""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


# Pattern wikilink Obsidian : supporte `[[target]]` et `[[target|alias]]`.
# - group(1) : target (chemin ou slug, peut contenir des slashes ou .pdf)
# - group(2) : alias (None si pas d'alias)
_WIKILINK_PATTERN = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")


@dataclass
class SyncResult:
    """Résultat d'une opération `update_wikilinks_in_sotas`.

    Sérialisable pour le log final / les tests d'invariance.
    """
    old_slug: str
    new_slug: Optional[str]
    reason: str
    sotas_touched: list[Path] = field(default_factory=list)
    substitutions_per_sota: dict[str, int] = field(default_factory=dict)
    total_substitutions: int = 0
    dry_run: bool = False
    errors: list[str] = field(default_factory=list)


def _wikilink_targets_slug(target: str, alias: Optional[str], slug: str) -> bool:
    """True si un wikilink pointe vers `slug`.

    Cas couverts :
    - `[[slug]]`                      → target=slug
    - `[[slug|alias]]`                → target=slug
    - `[[path/file.pdf|slug]]`        → alias=slug
    - `[[some_file.pdf|slug]]`        → stem(target)=slug
    """
    if target == slug:
        return True
    if alias is not None and alias == slug:
        return True
    if Path(target).stem == slug:
        return True
    return False


def _strip_wikilink_in_line(line: str, raw_wikilink: str) -> str:
    """Retire un wikilink en mode retract, en gardant le texte humain.

    Cas A : `[[wikilink]] — texte humain`  → `texte humain`
    Cas B : `- [[wikilink]] — texte`       → `- texte`
    Cas C : `[[wikilink]]` isolé           → strip + cleanup espaces
    """
    # Cas A/B : wikilink suivi de " — " ou " - " ou " -- " ou " – "
    # (tiret simple, em-dash, en-dash, double tiret markdown).
    pattern = re.escape(raw_wikilink) + r"\s*[—–-]+\s*"
    new_line = re.sub(pattern, "", line, count=1)
    if new_line != line:
        return new_line
    # Cas C : wikilink isolé, on retire juste le wikilink
    new_line = line.replace(raw_wikilink, "", 1)
    # Cleanup : doubles espaces résiduels
    new_line = re.sub(r"  +", " ", new_line)
    # Si la ligne ne contient plus que des espaces/marqueurs, garder marker seul
    stripped = new_line.strip()
    if stripped in ("", "-", "*", "+", "-,", "*,"):
        return ""
    return new_line


def _replace_wikilink_in_line(
    line: str, raw_wikilink: str, new_target_slug: str
) -> str:
    """Remplace un wikilink par un nouveau pointant vers `new_target_slug`.

    Préserve l'alias original si présent dans le wikilink.
    """
    m = _WIKILINK_PATTERN.search(raw_wikilink)
    if m and m.group(2):
        # Avait un alias → préserve l'alias
        new_link = f"[[{new_target_slug}|{m.group(2)}]]"
    else:
        new_link = f"[[{new_target_slug}]]"
    return line.replace(raw_wikilink, new_link, 1)


def update_wikilinks_in_sotas(
    old_slug: str,
    new_slug: Optional[str] = None,
    *,
    reason: str = "unspecified",
    dry_run: bool = False,
    keep_human_text: bool = True,
    vault_root: Optional[Path] = None,
    skip_git_backup: bool = False,
) -> SyncResult:
    """Met à jour les wikilinks vers `old_slug` dans tous les SOTAs du vault.

    Args:
        old_slug: slug source (ex: `knuth_1965_lr`)
        new_slug: slug cible si merge ; None si retract simple.
        reason: trace courte (ex: `retract:cascade_exhausted`,
            `merged_into:target_slug`).
        dry_run: True = calcule le delta sans toucher au disque.
        keep_human_text: en mode retract (new_slug=None), True garde le texte
            qui suivait le wikilink (cas A/B) ; False retire la ligne entière.
            Note: pour l'instant on supporte uniquement True (le False est
            traité comme strip simple sans drop de ligne).
        vault_root: override pour les tests (sinon utilise config.VAULT).
        skip_git_backup: skip le commit pré-flight (utile en tests).

    Returns:
        SyncResult avec compteurs (sotas_touched, total_substitutions) +
        erreurs éventuelles (chaque SOTA traité indépendamment, échec
        d'un SOTA n'arrête pas le traitement des autres).
    """
    result = SyncResult(
        old_slug=old_slug,
        new_slug=new_slug,
        reason=reason,
        dry_run=dry_run,
    )

    # Résolution du vault
    if vault_root is None:
        from .config import VAULT
        vault_root = VAULT
    if not vault_root.exists():
        result.errors.append(f"vault introuvable: {vault_root}")
        return result

    # Pre-flight : git backup
    if not dry_run and not skip_git_backup:
        from .ingest import _ensure_git_backup
        msg = f"paper-trail sota_sync before {reason}:{old_slug}"
        if new_slug:
            msg += f"->{new_slug}"
        if not _ensure_git_backup(vault_root, msg):
            result.errors.append("git backup pre-flight failed")
            return result

    # Enumération des SOTAs via l'adapter actif. On instancie directement
    # pour ne pas dépendre du singleton get_adapter() (utile en tests).
    from adapters.obsidian import ObsidianAdapter
    adapter = ObsidianAdapter(vault_root=vault_root)
    sotas = list(adapter.find_sotas())

    for sota_path in sotas:
        try:
            text = sota_path.read_text(encoding="utf-8")
        except OSError as e:
            result.errors.append(f"read {sota_path}: {e}")
            continue

        # Traitement ligne par ligne. Permet de remplacer/retirer plusieurs
        # wikilinks d'une même ligne en série, et de stripper proprement le
        # marqueur " — " qui suit en mode retract.
        new_lines: list[str] = []
        n_sub_in_file = 0
        for line in text.split("\n"):
            new_line = line
            # Re-finditer après chaque modification car les offsets bougent.
            # On collecte d'abord toutes les matches de la ligne ORIGINALE
            # pour pouvoir les remplacer une par une dans la version mutée.
            wikilinks_to_handle = []
            for m in _WIKILINK_PATTERN.finditer(line):
                target = m.group(1)
                alias = m.group(2)
                if _wikilink_targets_slug(target, alias, old_slug):
                    wikilinks_to_handle.append(m.group(0))
            for raw in wikilinks_to_handle:
                if raw not in new_line:
                    continue  # déjà retiré (multi-passes)
                if new_slug is not None:
                    new_line = _replace_wikilink_in_line(new_line, raw, new_slug)
                else:
                    new_line = _strip_wikilink_in_line(new_line, raw)
                n_sub_in_file += 1
            new_lines.append(new_line)

        if n_sub_in_file > 0:
            result.sotas_touched.append(sota_path)
            try:
                rel = str(sota_path.relative_to(vault_root))
            except ValueError:
                rel = str(sota_path)
            result.substitutions_per_sota[rel] = n_sub_in_file
            result.total_substitutions += n_sub_in_file
            if not dry_run:
                new_text = "\n".join(new_lines)
                try:
                    sota_path.write_text(new_text, encoding="utf-8")
                except OSError as e:
                    result.errors.append(f"write {sota_path}: {e}")

    return result
