"""Bootstrap commun aux hooks — charge `~/.config/paper-trail/env`.

Pourquoi : les hooks Claude Code n'héritent pas systématiquement de
l'environnement shell (selon comment Claude Code a été lancé, selon
le shell rc sourcé ou pas). RESEARCH_VAULT_PATH peut donc être absent
du process hook même si l'utilisateur l'a défini globalement.

Conséquence avant ce module : `from pipeline.config import …` levait
`ConfigError`, l'exception était silencieusement avalée (registre vide),
et tous les wikilinks du SOTA étaient flagués comme « absents du
registre » (I22 faux positif).

Ce module duplique la logique de `pipeline.config._load_user_config_file`
parce qu'on doit charger AVANT d'importer config (qui lèverait sinon).
"""
from __future__ import annotations
import os
from pathlib import Path


def load_user_env() -> Path | None:
    """Charge `~/.config/paper-trail/env` (XDG-aware). Retourne le path
    chargé, ou `None`. Idempotent : `os.environ.setdefault` ne réécrit
    pas les variables déjà définies."""
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
