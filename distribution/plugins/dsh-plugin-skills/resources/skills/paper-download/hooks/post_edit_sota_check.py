#!/usr/bin/env python3
"""PostToolUse hook — warning si SOTA modifié avec citations en texte libre.

Déclenché par Claude Code après Write/Edit. Si le fichier est un SOTA
(SOTA_*.md), scanne ses sections bibliographiques pour détecter des
citations en texte libre sans wikilink correspondant. Non-bloquant :
émet juste un warning dans stderr.

L'utilisateur peut alors lancer `/paper-trail:ingest <SOTA>` pour
absorber les citations dans le registre.

Hook contract :
- stdin : JSON tool_input (contient file_path)
- exit 0 : toujours non-bloquant (warning seulement)
"""
from __future__ import annotations
import json
import os
import re
import sys
from pathlib import Path

# Charge le module d'invariants pour réutiliser la détection
_CITATION_LINE_RE = re.compile(
    r"^\s*(?:[-*+]|\d+\.)\s+.*\b(19|20)\d{2}\b.+$",
    re.MULTILINE,
)
_HAS_WIKILINK_RE = re.compile(r"\[\[[a-z0-9_]+\]\]")


def main() -> int:
    try:
        hook_input = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        return 0
    tool_input = hook_input.get("tool_input", {})
    file_path = tool_input.get("file_path") or tool_input.get("path") or ""
    if not file_path:
        return 0
    p = Path(file_path)
    if not p.exists():
        return 0
    # Filtre : fichier doit ressembler à un SOTA
    if not re.search(r"(SOTA_|sota_)", p.name):
        return 0
    # Charge le module ingest/adapter pour réutiliser
    # extract_bibliography_sections
    plugin_root = os.environ.get("CLAUDE_PLUGIN_ROOT") or str(
        Path(__file__).resolve().parent.parent
    )
    sys.path.insert(0, plugin_root)
    try:
        from adapters import get_adapter
        adapter = get_adapter()
    except Exception:
        return 0
    try:
        sections = adapter.extract_bibliography_sections(p)
    except Exception:
        return 0
    free_text = 0
    for s in sections:
        if s.is_excluded:
            continue
        for line in s.raw_text.splitlines():
            if _CITATION_LINE_RE.match(line) and not _HAS_WIKILINK_RE.search(line):
                free_text += 1
    if free_text:
        print(
            f"[paper-trail] {p.name} contains {free_text} free-text "
            f"citation(s) with no wikilink. Run `/paper-trail:ingest "
            f"{p.name}` to absorb them into the registry.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
