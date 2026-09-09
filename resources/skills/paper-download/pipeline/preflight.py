"""Pré-vol — vérifie l'environnement avant de lancer le pipeline.

Cas d'usage : appelé par `/paper-trail:new-sota` (et utilisable seul via
`pipeline preflight`) pour détecter en amont les problèmes typiques
d'installation qui font perdre du temps en cours de session :

  1. Vault non configuré ou inaccessible
  2. Dépendances Python manquantes (pypdf, yaml, requests)
  3. MCP `paper-search` non enregistré dans Claude Code
  4. MCP `paper-search` enregistré mais pointant vers la version PyPI
     dégradée (13 outils) au lieu de la version git HEAD (63 outils)
  5. git binaire absent (les backups pré-flight sont skippés)

Sortie : JSON (avec `--json`) ou texte humain. Code retour :
  - 0  tout OK
  - 1  warnings (manque optionnel : RTFM, NotebookLM, etc.)
  - 2  erreur bloquante (vault absent, paper-search absent)

Le check `paper-search` parse la sortie de `claude mcp list` (best effort).
Si la CLI `claude` n'est pas accessible, on remonte juste un warning
expliquant comment vérifier manuellement.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path


def _load_user_config_file() -> Path | None:
    """Charge ~/.config/paper-trail/env si présent (cf. config._load_…).

    Retourne le chemin chargé (ou None) pour affichage dans le rapport.
    """
    xdg = os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config")
    cfg_path = Path(xdg) / "paper-trail" / "env"
    if not cfg_path.is_file():
        return None
    try:
        for raw in cfg_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key, value = key.strip(), value.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)
        return cfg_path
    except OSError:
        return None

# Paquet PyPI dégradé vs dépôt git HEAD complet (cf. doc INSTALL.md).
_PAPER_SEARCH_GIT_URL = "git+https://github.com/openags/paper-search-mcp.git"
_PAPER_SEARCH_INSTALL_RECIPE = (
    "uv venv ~/.local/paper-search-mcp/venv\n"
    "uv pip install --python ~/.local/paper-search-mcp/venv/bin/python \\\n"
    f"    \"paper-search-mcp @ {_PAPER_SEARCH_GIT_URL}\"\n"
    "claude mcp add paper-search --scope user \\\n"
    "    ~/.local/paper-search-mcp/venv/bin/python -m paper_search_mcp.server"
)


def _check_env_vault() -> dict:
    """RESEARCH_VAULT_PATH défini + dossier accessible."""
    vault = os.environ.get("RESEARCH_VAULT_PATH")
    if not vault:
        return {
            "id": "vault_path",
            "level": "error",
            "msg": "RESEARCH_VAULT_PATH non défini",
            "fix": (
                "Ajoutez à votre shell :\n"
                "    export RESEARCH_VAULT_PATH=\"$HOME/Documents/MyResearch\""
            ),
        }
    p = Path(vault)
    if not p.exists():
        return {
            "id": "vault_path",
            "level": "error",
            "msg": f"Le dossier {vault} n'existe pas",
            "fix": f"    mkdir -p \"{vault}\"",
        }
    if not os.access(p, os.W_OK):
        return {
            "id": "vault_path",
            "level": "error",
            "msg": f"Pas de droits d'écriture sur {vault}",
            "fix": f"    chmod -R u+w \"{vault}\"",
        }
    return {"id": "vault_path", "level": "ok", "msg": f"vault = {vault}"}


def _check_python_deps() -> list[dict]:
    """Dépendances Python essentielles."""
    results = []
    for mod, hint in [
        ("yaml", "pip install pyyaml"),
        ("pypdf", "pip install pypdf"),
        ("requests", "pip install requests"),
    ]:
        try:
            __import__(mod)
            results.append({
                "id": f"pydep_{mod}", "level": "ok", "msg": f"import {mod} OK",
            })
        except ImportError:
            results.append({
                "id": f"pydep_{mod}",
                "level": "error",
                "msg": f"module Python {mod!r} introuvable",
                "fix": f"    {hint}",
            })
    return results


def _check_git() -> dict:
    """Présence du binaire git (pour les backups pré-flight ingest)."""
    if shutil.which("git"):
        return {"id": "git_bin", "level": "ok", "msg": "git présent"}
    return {
        "id": "git_bin",
        "level": "warn",
        "msg": "git absent — les backups pré-flight seront désactivés",
        "fix": "Installer git via votre gestionnaire de paquets (apt/brew/etc.)",
    }


def _check_paper_search_mcp() -> dict:
    """`paper-search` enregistré dans Claude Code ?

    Méthode : lance `claude mcp list` et cherche une ligne `paper-search`.
    Fallback si la CLI manque : warning expliquant la vérification manuelle.
    """
    claude_bin = shutil.which("claude")
    if not claude_bin:
        return {
            "id": "paper_search_mcp",
            "level": "warn",
            "msg": "CLI `claude` introuvable — impossible de vérifier l'enregistrement du MCP",
            "fix": (
                "Vérifiez manuellement dans Claude Code que le MCP "
                "`paper-search` est enregistré."
            ),
        }
    try:
        r = subprocess.run(
            [claude_bin, "mcp", "list"],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=15,
        )
    except (subprocess.TimeoutExpired, OSError) as e:
        return {
            "id": "paper_search_mcp",
            "level": "warn",
            "msg": f"`claude mcp list` a échoué ({e!r}) — vérification ignorée",
        }
    haystack = ((r.stdout or "") + (r.stderr or "")).lower()
    if "paper-search" in haystack or "paper_search" in haystack:
        # Détection best-effort de la version dégradée PyPI : si on voit
        # un chemin python global / un site-packages standard sans git/venv
        # dédié, on suggère de vérifier que c'est bien la version git.
        suggest_git = (
            "git+" not in r.stdout and "/paper-search-mcp/venv/" not in r.stdout
        )
        if suggest_git:
            return {
                "id": "paper_search_mcp",
                "level": "warn",
                "msg": (
                    "paper-search enregistré, mais l'origine ne semble pas être "
                    "la version git (qui expose 63 outils). PyPI 0.1.3 n'en "
                    "expose que 13 — manque OpenAlex/Crossref/S2/HAL/CORE."
                ),
                "fix": (
                    "Si la cascade vous renvoie des erreurs `search_openalex` "
                    "ou `search_crossref` inconnus, réinstaller depuis git :\n"
                    + _PAPER_SEARCH_INSTALL_RECIPE
                ),
            }
        return {
            "id": "paper_search_mcp", "level": "ok",
            "msg": "paper-search enregistré",
        }
    return {
        "id": "paper_search_mcp",
        "level": "error",
        "msg": "MCP `paper-search` non enregistré dans Claude Code",
        "fix": (
            "Installer le MCP (≠ paquet PyPI obsolète) :\n"
            + _PAPER_SEARCH_INSTALL_RECIPE
        ),
    }


def _check_optional_env() -> list[dict]:
    """Variables d'environnement optionnelles — warnings seulement."""
    out = []
    if not os.environ.get("RESEARCH_CONTACT_EMAIL"):
        out.append({
            "id": "contact_email",
            "level": "warn",
            "msg": "RESEARCH_CONTACT_EMAIL non défini — politesse Crossref/S2 désactivée",
            "fix": "    export RESEARCH_CONTACT_EMAIL=\"you@example.org\"",
        })
    if not os.environ.get("S2_API_KEY"):
        out.append({
            "id": "s2_api_key",
            "level": "info",
            "msg": "S2_API_KEY non défini — Semantic Scholar limité à 100/5min",
        })
    return out


def run_preflight(as_json: bool = False) -> tuple[int, str]:
    """Lance tous les checks. Retourne (rc, texte)."""
    loaded = _load_user_config_file()
    checks = []
    if loaded:
        checks.append({
            "id": "user_env_file", "level": "info",
            "msg": f"config globale chargée : {loaded}",
        })
    checks.append(_check_env_vault())
    checks.extend(_check_python_deps())
    checks.append(_check_git())
    checks.append(_check_paper_search_mcp())
    checks.extend(_check_optional_env())

    levels = {c["level"] for c in checks}
    if "error" in levels:
        rc = 2
    elif "warn" in levels:
        rc = 1
    else:
        rc = 0

    if as_json:
        return rc, json.dumps({"rc": rc, "checks": checks},
                              ensure_ascii=False, indent=2)

    lines = []
    icon = {"ok": "✓", "info": "i", "warn": "!", "error": "✗"}
    for c in checks:
        lines.append(f"  {icon.get(c['level'], '?')} [{c['level']:5}] {c['msg']}")
        if c.get("fix"):
            for fl in c["fix"].splitlines():
                lines.append(f"      {fl}")
    header = {
        0: "Pré-vol : tout est prêt.",
        1: "Pré-vol : OK avec avertissements.",
        2: "Pré-vol : configuration incomplète — voir détails ci-dessous.",
    }[rc]
    return rc, header + "\n" + "\n".join(lines)
