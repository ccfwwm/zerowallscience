"""Chemins et constantes — paramétrables par variables d'environnement.

Variables d'environnement requises :
- RESEARCH_VAULT_PATH      racine du vault (REQUISE — sinon ConfigError)

Variables optionnelles :
- RESEARCH_SOURCES_PATH    dossier sources/PDFs (défaut : VAULT/10_SOURCES)
- RESEARCH_REGISTRY_PATH   dossier registre (défaut : SOURCES/_registry)
- RESEARCH_VAULT_LAYOUT    layout adapter (défaut : obsidian)
- RESEARCH_RTFM_DB         base RTFM pour corrélation des échecs (défaut : aucune)
- RESEARCH_ENABLE_SHADOW_LIBS  active AA + Sci-Hub (défaut : non)
- RESEARCH_SKIP_END_DOCTOR     skip le SessionEnd hook (défaut : non)
- RESEARCH_CONTACT_EMAIL   email injecté dans les requêtes externes (Crossref, S2, …)
- S2_API_KEY               clé Semantic Scholar (défaut : appels non authentifiés)

Aucun chemin n'est codé en dur : si `RESEARCH_VAULT_PATH` n'est pas défini,
le plugin refuse de démarrer avec un message d'aide explicite.
"""
from pathlib import Path
import os
import sys


class ConfigError(RuntimeError):
    """Configuration manquante ou invalide."""


def _load_user_config_file() -> None:
    """Charge ~/.config/paper-trail/env si présent.

    Format : `KEY=VALUE` par ligne, `#` pour commentaire, espaces tolérés.
    Les variables déjà définies dans l'environnement courant gardent la
    priorité (le fichier ne réécrit jamais une valeur explicite).

    Utilité : éviter à l'utilisateur de redéfinir S2_API_KEY,
    RESEARCH_CONTACT_EMAIL, RESEARCH_VAULT_PATH, etc. dans chaque projet.
    Idéal pour les secrets et préférences globales.
    """
    xdg = os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config")
    cfg_path = Path(xdg) / "paper-trail" / "env"
    if not cfg_path.is_file():
        return
    try:
        for raw in cfg_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if not key:
                continue
            os.environ.setdefault(key, value)
    except OSError:
        # Lecture impossible — on ignore silencieusement, ce n'est qu'un
        # commodity loader.
        pass


_load_user_config_file()

_RAW_VAULT = os.environ.get("RESEARCH_VAULT_PATH")
if not _RAW_VAULT:
    raise ConfigError(
        "RESEARCH_VAULT_PATH n'est pas défini.\n"
        "\n"
        "Le plugin paper-trail a besoin de connaître la racine de votre vault.\n"
        "Trois options :\n"
        "\n"
        "  1. Variable d'environnement shell (par session) :\n"
        "       export RESEARCH_VAULT_PATH=\"$HOME/Documents/MyResearch\"\n"
        "\n"
        "  2. Variable globale dans ~/.config/paper-trail/env (recommandé\n"
        "     pour les secrets et préférences réutilisées entre projets) :\n"
        "       RESEARCH_VAULT_PATH=~/Documents/MyResearch\n"
        "       S2_API_KEY=...\n"
        "       RESEARCH_CONTACT_EMAIL=you@example.org\n"
        "\n"
        "  3. .env de projet sourcé avant de lancer Claude Code.\n"
        "\n"
        "Voir INSTALL.md pour la liste complète des variables."
    )

VAULT = Path(_RAW_VAULT)
SOURCES = Path(os.environ.get("RESEARCH_SOURCES_PATH",
                              str(VAULT / "10_SOURCES")))
REGISTRY = Path(os.environ.get("RESEARCH_REGISTRY_PATH",
                               str(SOURCES / "_registry")))
REFS = REGISTRY / "refs"
JOURNAL = REGISTRY / "_journal"
QUARANTINE = REGISTRY / "_quarantine"

# Layout adapter (défaut : obsidian).
VAULT_LAYOUT = os.environ.get("RESEARCH_VAULT_LAYOUT", "obsidian")

# Helpers locaux au plugin (lib/ à la racine du repo).
LIB_PATH = Path(__file__).parent.parent / "lib"
TOOLS = REGISTRY / "tools"

# DB RTFM — optionnelle. La corrélation des échecs RTFM est désactivée
# proprement quand elle est absente (cf. pipeline/rtfm_failures.py et
# pipeline/ingest.py qui vérifient `.exists()` avant usage).
_RTFM_DB_RAW = os.environ.get("RESEARCH_RTFM_DB")
RTFM_DB = Path(_RTFM_DB_RAW) if _RTFM_DB_RAW else Path("/dev/null/no-rtfm-db")

# Insère lib/ dans sys.path pour que `import validate_pdf_content`,
# `import s2_resolver`, etc. marchent (ces helpers sont sans package
# parent, ils s'importent au niveau racine).
if str(LIB_PATH) not in sys.path:
    sys.path.insert(0, str(LIB_PATH))

# Etats finaux / acceptés (le worker ne les fait pas progresser).
TERMINAL_STATES = {"sota_cited_confirmed", "retracted"}
WAITING_STATES = {"awaiting_rtfm_ocr"}
BLOCKED_PREFIX = "blocked_human"

# États non-finaux que le worker doit faire progresser.
ACTIVE_STATES = {
    "candidate", "uid_resolved", "pdf_acquired", "needs_reacquisition",
    "page1_validated",  # → curator domain; worker stops here
}

# Ordre canonique de la machine d'état (pour tri de progression).
STATE_ORDER = {
    "candidate": 0,
    "uid_resolved": 1,
    "pdf_acquired": 2,
    "needs_reacquisition": 2,
    "awaiting_rtfm_ocr": 3,
    "page1_validated": 4,
    "sota_cited_confirmed": 5,
    "retracted": 99,
}
