"""PreToolUse hook script — refuse SOTA write if cited refs are not validated.

Triggered by Claude Code before any Write tool call on a SOTA markdown
file. Parses the would-be content for wikilinks (Obsidian layout) or
markdown links (flat layout) via the adapter, looks up each cited slug
in the registry, and exits non-zero if any cited ref is NOT in state
`page1_validated`, `sota_cited_confirmed`, or similar "validated" state.

Goal : enforce the anti-hallucination contract of sota-writer skill
mechanically. A SOTA citing a `candidate` or `blocked_human:*` ref is
considered unfinished and the write is blocked.

Hook contract (Claude Code) :
- stdin : JSON object with tool_input (containing file_path and content)
- exit 0 : non-blocking, action proceeds
- exit ≠ 0 : blocks the action, message printed to stderr
"""
from __future__ import annotations
import json
import os
import re
import sys
from pathlib import Path

# Inject plugin root in sys.path
PLUGIN_ROOT = (
    Path(os.environ.get("CLAUDE_PLUGIN_ROOT", ""))
    if os.environ.get("CLAUDE_PLUGIN_ROOT")
    else Path(__file__).resolve().parent.parent
)
sys.path.insert(0, str(PLUGIN_ROOT))

# Bootstrap : charge la config globale AVANT d'importer pipeline/adapters.
# Sans ça, l'absence de RESEARCH_VAULT_PATH dans l'env du hook produit
# soit une exception (skip silencieux) soit un registre vide (faux
# positifs « ref absente »).
sys.path.insert(0, str(PLUGIN_ROOT / "hooks"))
try:
    from _hook_env import load_user_env
    load_user_env()
except ImportError:
    pass

VALIDATED_STATES = {
    "page1_validated",
    "sota_cited_confirmed",
    "awaiting_rtfm_ocr",  # accepts OCR-pending refs (the PDF exists, OCR queued)
}


def is_sota_file(file_path: str) -> bool:
    """True if the file path matches the SOTA convention (configurable
    via the adapter)."""
    name = Path(file_path).stem
    # Heuristic : SOTA_* (Obsidian) or paths containing /sotas/ (flat)
    return name.startswith("SOTA_") or "/sotas/" in file_path


def main() -> int:
    try:
        hook_input = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        return 0

    tool_input = hook_input.get("tool_input", {})
    file_path = (
        tool_input.get("file_path")
        or tool_input.get("path")
        or ""
    )
    if not file_path or not is_sota_file(file_path):
        return 0

    # Content to be written (Write tool) or new_string (Edit tool)
    content = (
        tool_input.get("content")
        or tool_input.get("new_string")
        or ""
    )
    if not content:
        return 0

    # Use the adapter to parse citations from the would-be content
    try:
        from adapters import get_adapter
        from pipeline.registry import iter_refs
    except ImportError as e:
        print(f"[paper-trail PreToolUse] import error : {e}", file=sys.stderr)
        return 0  # non-blocking on infra error

    # Build registry index
    refs_by_slug = {}
    try:
        for ref in iter_refs():
            refs_by_slug[ref.slug] = ref.state
    except Exception as e:
        # Critique : ne PAS bloquer en silence. Le hook ne peut pas
        # vérifier les states des refs citées → on prévient l'utilisateur
        # explicitement et on laisse passer le write (mieux un faux
        # négatif passé qu'un faux positif bloquant légitime).
        print(
            f"[paper-trail PreToolUse] registry unreachable — check "
            f"disabled.\n"
            f"  Detail: {type(e).__name__}: {str(e)[:200]}\n"
            f"  Hint: add RESEARCH_VAULT_PATH to "
            f"~/.config/paper-trail/env.",
            file=sys.stderr,
        )
        return 0

    # Parse citations via temporary file (adapter.parse_citations expects
    # a Path)
    import tempfile
    with tempfile.NamedTemporaryFile(mode="w", suffix=".md",
                                     delete=False) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)
    try:
        adapter = get_adapter()
        cited_slugs = adapter.parse_citations(tmp_path)
    except Exception as e:
        print(f"[paper-trail PreToolUse] adapter error : {e}", file=sys.stderr)
        return 0
    finally:
        try:
            tmp_path.unlink()
        except OSError:
            pass

    # Check each cited slug
    issues = []
    for slug in cited_slugs:
        state = refs_by_slug.get(slug)
        if state is None:
            issues.append(f"  - [{slug}] : ref absente du registre")
        elif state not in VALIDATED_STATES:
            issues.append(f"  - [{slug}] : state={state} (attendu : "
                          f"page1_validated, sota_cited_confirmed, ou "
                          f"awaiting_rtfm_ocr)")

    if not issues:
        return 0

    print(
        f"[paper-trail PreToolUse] SOTA write blocked — {len(issues)} "
        f"cited ref(s) not validated :",
        file=sys.stderr,
    )
    for line in issues:
        print(line, file=sys.stderr)
    print(
        "\nRun `/paper-trail:cascade <slug>` to acquire the missing refs, "
        "then retry.\n"
        "Or remove the offending wikilinks from the SOTA.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
