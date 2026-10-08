#!/usr/bin/env python3
"""PreToolUse hook — bloque le save d'un SOTA non conforme.

Déclenché par Claude Code AVANT Write/Edit sur un fichier SOTA. Vérifie
les invariants I21 (texte libre non ingéré), I22 (wikilink vers ref
absente du registre), I23 (wikilink vers retracted) sur le fichier.

Si l'un de ces invariants > 0, retourne exit code 2 → Claude Code
bloque l'écriture et affiche le message à l'utilisateur.

L'utilisateur doit alors lancer `/paper-trail:ingest <SOTA>` avant de
finaliser.

Bypass via env var : `PAPER_TRAIL_SKIP_PRE_SAVE=1` (pour les hotfix).

Hook contract :
- stdin : JSON tool_input (contient file_path et new_string/content)
- exit 0 : OK, autorise l'écriture
- exit 2 : bloque, message dans stderr
"""
from __future__ import annotations
import json
import os
import re
import sys
from pathlib import Path

# Bootstrap : charge la config globale AVANT tout import qui dépend
# de RESEARCH_VAULT_PATH. Évite les faux positifs I22 quand Claude Code
# n'a pas hérité de la variable d'environnement shell.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _hook_env import load_user_env  # noqa: E402
load_user_env()

_CITATION_LINE_RE = re.compile(
    r"^\s*(?:[-*+]|\d+\.)\s+.*\b(19|20)\d{2}\b.+$",
    re.MULTILINE,
)
# Match les trois formes de citation :
#   [[slug]]                    (Obsidian simple)
#   [[slug|display]]            (Obsidian piped, alias)
#   [display](path/slug.md)     (flat markdown link)
_HAS_WIKILINK_RE = re.compile(
    r"\[\[[a-z0-9_]+(?:\|[^\]]+)?\]\]"
    r"|\]\((?:[^)]*?/)?[a-z0-9_]+\.md\)"
)
# Extraction du slug — couvre [[slug]] ET [[slug|display]]
_WIKILINK_RE = re.compile(r"\[\[([a-z0-9_]+)(?:\|[^\]]+)?\]\]")
_REF_SLUG_RE = re.compile(r"^[a-z][a-z0-9]*_(19|20)\d{2}_[a-z0-9_]+$")


def main() -> int:
    if os.environ.get("PAPER_TRAIL_SKIP_PRE_SAVE") == "1":
        return 0  # bypass explicit

    try:
        hook_input = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        return 0  # ne pas bloquer si input malformé
    tool_input = hook_input.get("tool_input", {})
    file_path = tool_input.get("file_path") or tool_input.get("path") or ""
    if not file_path:
        return 0
    p = Path(file_path)
    if not re.search(r"(SOTA_|sota_)", p.name):
        return 0

    # Récupère le contenu qui sera écrit (Write : `content`, Edit : on
    # ne sait pas le résultat final → skip car le contenu n'est pas tout)
    content = tool_input.get("content") or tool_input.get("new_string") or ""
    if not content:
        return 0

    # I21 : citations texte libre sans wikilink
    free_text_lines = []
    for line in content.splitlines():
        if _CITATION_LINE_RE.match(line) and not _HAS_WIKILINK_RE.search(line):
            free_text_lines.append(line.strip()[:80])

    # I22/I23 : nécessite accès au registre
    plugin_root = os.environ.get("CLAUDE_PLUGIN_ROOT") or str(
        Path(__file__).resolve().parent.parent
    )
    sys.path.insert(0, plugin_root)
    registry_slugs: set[str] = set()
    retracted_slugs: set[str] = set()
    registry_load_error: str | None = None
    try:
        from pipeline.registry import iter_refs
        for ref in iter_refs():
            registry_slugs.add(ref.slug)
            if ref.state == "retracted":
                retracted_slugs.add(ref.slug)
    except Exception as e:
        # Critique : si on ne peut PAS lire le registre, on doit absolument
        # éviter de bloquer sur I22/I23, sinon TOUS les wikilinks d'un
        # SOTA légitime sont flagués « absents » (faux positif massif).
        # On garde I21 (qui ne dépend pas du registre).
        registry_load_error = f"{type(e).__name__}: {str(e)[:200]}"

    wikilinks_in_content = set(_WIKILINK_RE.findall(content))
    if registry_load_error is None:
        missing_refs = [
            slug for slug in wikilinks_in_content
            if _REF_SLUG_RE.match(slug) and slug not in registry_slugs
        ]
        retracted_cites = [
            slug for slug in wikilinks_in_content
            if slug in retracted_slugs
        ]
    else:
        # Pas de check I22/I23 — on l'annonce explicitement, on ne ment
        # pas avec un « rien à signaler ».
        missing_refs = []
        retracted_cites = []
        print(
            f"[paper-trail WARN] registry unreachable — I22/I23 skipped.\n"
            f"  Detail: {registry_load_error}\n"
            f"  Hint: set RESEARCH_VAULT_PATH in "
            f"~/.config/paper-trail/env if you have not already.",
            file=sys.stderr,
        )

    errors = []
    if free_text_lines:
        errors.append(
            f"I21: {len(free_text_lines)} free-text citation(s) with no "
            f"wikilink. Examples: {free_text_lines[:2]}"
        )
    if missing_refs:
        errors.append(
            f"I22: wikilinks to refs missing from the registry: "
            f"{missing_refs[:3]}"
        )
    if retracted_cites:
        # I23 = WARN, pas bloquant. Juste avertir.
        print(
            f"[paper-trail WARN] {p.name} cites retracted refs: "
            f"{retracted_cites[:3]}",
            file=sys.stderr,
        )

    if errors:
        print(f"[paper-trail PRE-SAVE BLOCKED] {p.name}", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        print(
            f"\nRun `/paper-trail:ingest {p.name}` to resolve, or "
            f"`PAPER_TRAIL_SKIP_PRE_SAVE=1` for an exceptional bypass.",
            file=sys.stderr,
        )
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
