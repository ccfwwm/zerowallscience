"""Tests P2 — branchement automatique sota_sync sur retract/merge.

Vérifie qu'après les commandes CLI (arbitrate retract, resolve-textbooks
merge), les SOTAs qui pointaient vers la ref mutée sont automatiquement
mis à jour.

Ce sont des tests d'intégration : ils invoquent les fonctions cmd_*
directement (sans le main parser argparse).
"""
from __future__ import annotations
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

PROJ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJ))


def _setup_vault_and_refs(tmp: Path) -> tuple[Path, Path]:
    """Crée un vault + refs synthétiques minimal pour tester le sync.

    Retourne (vault_dir, refs_dir).
    """
    vault = tmp / "vault"
    vault.mkdir()
    # Init git pour que _ensure_git_backup passe
    import subprocess
    subprocess.run(["git", "init", "-q", str(vault)], check=True)
    subprocess.run(
        ["git", "-C", str(vault), "config", "user.email", "test@test"],
        check=True,
    )
    subprocess.run(
        ["git", "-C", str(vault), "config", "user.name", "test"],
        check=True,
    )

    # Crée un registre minimal
    refs_dir = vault / "10_SOURCES" / "_registry" / "refs"
    refs_dir.mkdir(parents=True)
    # Ref qui va être retract
    (refs_dir / "knuth_1965_lr.md").write_text(
        "---\n"
        "author: Knuth, D.E.\n"
        "title: On the Translation of Languages from Left to Right\n"
        "year: 1965\n"
        "state: candidate\n"
        "state_history:\n"
        "- at: '2026-01-01T00:00:00Z'\n"
        "  by: test_fixture\n"
        "  state: candidate\n"
        "---\n",
        encoding="utf-8",
    )
    # Ref source à merger
    (refs_dir / "hopcroft_0000_old.md").write_text(
        "---\n"
        "author: Hopcroft\n"
        "title: ''\n"
        "year: '0000'\n"
        "state: candidate\n"
        "state_history:\n"
        "- at: '2026-01-01T00:00:00Z'\n"
        "  by: test_fixture\n"
        "  state: candidate\n"
        "---\n",
        encoding="utf-8",
    )
    # Ref cible du merge
    (refs_dir / "hopcroft_2001_introduction.md").write_text(
        "---\n"
        "author: Hopcroft, Motwani, Ullman\n"
        "title: Introduction to Automata Theory\n"
        "year: 2001\n"
        "state: page1_validated\n"
        "state_history:\n"
        "- at: '2026-01-01T00:00:00Z'\n"
        "  by: test_fixture\n"
        "  state: page1_validated\n"
        "---\n",
        encoding="utf-8",
    )

    # Crée 2 SOTAs qui citent ces refs
    sotas_dir = vault / "Publications"
    sotas_dir.mkdir()
    (sotas_dir / "SOTA_p2_a.md").write_text(
        "# Test P2 A\n\n"
        "## Refs\n\n"
        "- [[knuth_1965_lr]] -- Knuth 1965 LR\n"
        "- [[hopcroft_0000_old]] -- Hopcroft textbook\n",
        encoding="utf-8",
    )
    (sotas_dir / "SOTA_p2_b.md").write_text(
        "# Test P2 B\n\n"
        "Voir [[hopcroft_0000_old]] aussi.\n",
        encoding="utf-8",
    )

    # Initial commit
    subprocess.run(["git", "-C", str(vault), "add", "."], check=True,
                   capture_output=True)
    subprocess.run(
        ["git", "-C", str(vault), "commit", "-q", "-m", "init"],
        check=True, capture_output=True,
    )

    return vault, refs_dir


def _patch_config(vault: Path, refs_dir: Path):
    """Patche config.VAULT et config.REFS pour le test.

    Plusieurs modules font from .config import REFS en haut, ce qui
    capture la valeur. On doit donc patcher TOUS les modules consommateurs.
    """
    from pipeline import config, registry, transitions, cli
    config.VAULT = vault
    config.REFS = refs_dir
    config.SOURCES = vault / "Sources"  # not used here
    registry.REFS = refs_dir
    registry.SOURCES = config.SOURCES
    transitions.REFS = refs_dir
    transitions.SOURCES = config.SOURCES
    cli.REFS = refs_dir  # cmd_arbitrate, cmd_resolve_textbooks, etc.


def test_T7_arbitrate_retract_syncs_sotas(tmp_path):
    """Après `cmd_arbitrate <slug> --decision retract`, les wikilinks
    vers `<slug>` doivent avoir disparu de tous les SOTAs.
    """
    vault, refs_dir = _setup_vault_and_refs(tmp_path)
    _patch_config(vault, refs_dir)

    from pipeline.cli import cmd_arbitrate
    args = SimpleNamespace(
        slug="knuth_1965_lr",
        decision="retract",
        reason="test_T7_retract",
    )
    rc = cmd_arbitrate(args)
    assert rc == 0, f"cmd_arbitrate returned {rc}"

    sota_a = (vault / "Publications" / "SOTA_p2_a.md").read_text()
    assert "[[knuth_1965_lr]]" not in sota_a, \
        f"wikilink toujours présent : {sota_a!r}"
    assert "Knuth 1965 LR" in sota_a, "texte humain perdu"
    # Autre wikilink non touché
    assert "[[hopcroft_0000_old]]" in sota_a


def test_T8_resolve_textbooks_merge_syncs_sotas(tmp_path):
    """Après merge_into via cmd_resolve_textbooks --apply-from, les
    wikilinks `[[old]]` doivent être remplacés par `[[target]]` dans
    tous les SOTAs.
    """
    vault, refs_dir = _setup_vault_and_refs(tmp_path)
    _patch_config(vault, refs_dir)

    decisions_json = tmp_path / "decisions.json"
    import json as _json
    decisions_json.write_text(_json.dumps([
        {
            "slug": "hopcroft_0000_old",
            "action": "merge_into",
            "target_slug": "hopcroft_2001_introduction",
        }
    ]))

    from pipeline.cli import cmd_resolve_textbooks
    args = SimpleNamespace(
        apply_from=str(decisions_json),
        list_candidates=False,
    )
    rc = cmd_resolve_textbooks(args)
    assert rc == 0, f"cmd_resolve_textbooks returned {rc}"

    sota_a = (vault / "Publications" / "SOTA_p2_a.md").read_text()
    sota_b = (vault / "Publications" / "SOTA_p2_b.md").read_text()
    assert "[[hopcroft_0000_old]]" not in sota_a
    assert "[[hopcroft_0000_old]]" not in sota_b
    assert "[[hopcroft_2001_introduction]]" in sota_a
    assert "[[hopcroft_2001_introduction]]" in sota_b
    # Autres wikilinks préservés
    assert "[[knuth_1965_lr]]" in sota_a


def _run_all():
    import inspect
    fns = [
        (name, fn) for name, fn in globals().items()
        if name.startswith("test_") and inspect.isfunction(fn)
    ]
    n_ok = 0
    for name, fn in fns:
        try:
            with tempfile.TemporaryDirectory() as d:
                fn(Path(d))
            print(f"  PASS  {name}")
            n_ok += 1
        except AssertionError as e:
            print(f"  FAIL  {name}: {e}")
        except Exception as e:
            print(f"  ERROR {name}: {type(e).__name__}: {e}")
    print(f"--- {n_ok}/{len(fns)} tests ---")
    return 0 if n_ok == len(fns) else 1


if __name__ == "__main__":
    sys.exit(_run_all())
