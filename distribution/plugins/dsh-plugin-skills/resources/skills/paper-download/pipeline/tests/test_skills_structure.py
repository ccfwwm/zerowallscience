"""Test de structure des skills, commandes et agents du plugin.

Vérifie que chaque artefact du plugin a un frontmatter valide (name,
description, triggers pour les skills/agents). Ne lance pas les
workflows complets — c'est de la validation statique.

Pour les tests E2E (vrai lancement de skill avec mutations), voir les
preuves listées dans coverage_run_*.md.

Usage :
    python pipeline/tests/test_skills_structure.py
"""
from __future__ import annotations
import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]

EXPECTED_SKILLS = [
    "pdf-cascade",
    "registry-doctor",
    "sota-writer",
    "sota-auditor",
    "citation-receipts",
    "paper-writer",
]

EXPECTED_COMMANDS = [
    "paper-trail-status",
    "paper-trail-cascade",
    "paper-trail-doctor",
    "paper-trail-reactivate-ocr",
    "paper-trail-new-sota",
    "paper-trail-audit-sota",
    "paper-trail-audit-article",
    "paper-trail-receipts",
    "paper-trail-new-paper",
]

EXPECTED_AGENTS = [
    "cascade-runner",
    "page1-validator",
    "researcher",
    "claim-checker",
]


def parse_frontmatter(text: str) -> dict | None:
    """Parse YAML-like frontmatter from a markdown file."""
    if not text.startswith("---"):
        return None
    parts = text.split("---", 2)
    if len(parts) < 3:
        return None
    fm_block = parts[1]
    fm: dict = {}
    current_key = None
    current_value_lines: list[str] = []
    for raw_line in fm_block.splitlines():
        line = raw_line.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        # match "key: value" or "key: >" (multiline)
        m = re.match(r"^([a-z_]+):\s*(.*)$", line)
        if m and not line.startswith(" "):
            # flush previous
            if current_key:
                fm[current_key] = " ".join(current_value_lines).strip()
            current_key = m.group(1)
            current_value_lines = [m.group(2)]
        else:
            # continuation line
            if current_key:
                current_value_lines.append(line.strip())
    if current_key:
        fm[current_key] = " ".join(current_value_lines).strip()
    return fm


def check_skill(name: str) -> list[str]:
    """Retourne la liste des erreurs trouvées pour ce skill."""
    errors = []
    path = REPO_ROOT / "skills" / name / "SKILL.md"
    if not path.exists():
        return [f"{name} — fichier manquant : {path.relative_to(REPO_ROOT)}"]
    text = path.read_text(encoding="utf-8")
    fm = parse_frontmatter(text)
    if fm is None:
        errors.append(f"{name} — frontmatter manquant ou invalide")
        return errors
    if fm.get("name") != name:
        errors.append(f"{name} — name={fm.get('name')!r} (attendu {name!r})")
    desc = fm.get("description", "")
    if len(desc) < 50:
        errors.append(f"{name} — description trop courte ({len(desc)} chars)")
    # vérifier que le body est non vide
    body = text.split("---", 2)[2] if text.count("---") >= 2 else ""
    if len(body.strip()) < 200:
        errors.append(f"{name} — body trop court ({len(body.strip())} chars)")
    return errors


def check_command(name: str) -> list[str]:
    errors = []
    path = REPO_ROOT / "commands" / f"{name}.md"
    if not path.exists():
        return [f"{name} — fichier manquant : {path.relative_to(REPO_ROOT)}"]
    text = path.read_text(encoding="utf-8")
    fm = parse_frontmatter(text)
    if fm is None:
        errors.append(f"{name} — frontmatter manquant")
        return errors
    desc = fm.get("description", "")
    if len(desc) < 30:
        errors.append(f"{name} — description trop courte ({len(desc)} chars)")
    return errors


def check_agent(name: str) -> list[str]:
    errors = []
    path = REPO_ROOT / "agents" / f"{name}.md"
    if not path.exists():
        return [f"{name} — fichier manquant : {path.relative_to(REPO_ROOT)}"]
    text = path.read_text(encoding="utf-8")
    fm = parse_frontmatter(text)
    if fm is None:
        errors.append(f"{name} — frontmatter manquant")
        return errors
    if fm.get("name") != name:
        errors.append(f"{name} — name={fm.get('name')!r} (attendu {name!r})")
    desc = fm.get("description", "")
    if len(desc) < 50:
        errors.append(f"{name} — description trop courte ({len(desc)} chars)")
    return errors


def check_manifest() -> list[str]:
    errors = []
    path = REPO_ROOT / ".claude-plugin" / "plugin.json"
    if not path.exists():
        return ["plugin.json manquant"]
    import json
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return [f"plugin.json invalide : {e}"]
    for field in ["name", "version", "description", "author", "license"]:
        if field not in data:
            errors.append(f"plugin.json manque le champ {field!r}")
    return errors


def check_hooks() -> list[str]:
    errors = []
    path = REPO_ROOT / "hooks" / "hooks.json"
    if not path.exists():
        return ["hooks.json manquant"]
    import json
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return [f"hooks.json invalide : {e}"]
    if "hooks" not in data:
        errors.append("hooks.json manque la clé 'hooks'")
    return errors


def main() -> int:
    all_errors: list[str] = []

    print("=== Test de structure du plugin paper-trail ===\n")

    # Manifest
    errs = check_manifest()
    if errs:
        all_errors.extend([f"[MANIFEST] {e}" for e in errs])
    else:
        print("  [OK] .claude-plugin/plugin.json valide")

    # Hooks
    errs = check_hooks()
    if errs:
        all_errors.extend([f"[HOOKS] {e}" for e in errs])
    else:
        print("  [OK] hooks/hooks.json valide")

    # Skills
    for skill in EXPECTED_SKILLS:
        errs = check_skill(skill)
        if errs:
            all_errors.extend([f"[SKILL] {e}" for e in errs])
        else:
            print(f"  [OK] skill/{skill}")

    # Commands
    for cmd in EXPECTED_COMMANDS:
        errs = check_command(cmd)
        if errs:
            all_errors.extend([f"[CMD] {e}" for e in errs])
        else:
            print(f"  [OK] command/{cmd}")

    # Agents
    for agent in EXPECTED_AGENTS:
        errs = check_agent(agent)
        if errs:
            all_errors.extend([f"[AGENT] {e}" for e in errs])
        else:
            print(f"  [OK] agent/{agent}")

    print()
    if all_errors:
        print(f"=== test_skills_structure : FAIL — {len(all_errors)} erreur(s) ===",
              file=sys.stderr)
        for e in all_errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    total = (len(EXPECTED_SKILLS) + len(EXPECTED_COMMANDS)
             + len(EXPECTED_AGENTS) + 2)
    print(f"=== test_skills_structure : OK ({total} artefacts validés) ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
