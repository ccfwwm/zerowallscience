"""Tests P8 — registry-cleanup commande + invariance post-merge.

3 tests :
- T_list_includes_ugly_suffixes : --list capture aussi les _2_3_4
- T_apply_merge_syncs_sotas : un merge_into propage aux SOTAs
- T_invariance_post_cleanup : doctor I22/I23 = 0 après cleanup
"""
from __future__ import annotations
import json as _json
import subprocess
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

PROJ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJ))


def _setup_vault(tmp: Path, refs_data: list[dict], sotas_data: dict[str, str]) -> tuple[Path, Path]:
    vault = tmp / "vault"
    vault.mkdir()
    subprocess.run(["git", "init", "-q", str(vault)], check=True)
    subprocess.run(["git", "-C", str(vault), "config", "user.email", "a@a"],
                   check=True)
    subprocess.run(["git", "-C", str(vault), "config", "user.name", "t"],
                   check=True)
    refs_dir = vault / "10_SOURCES" / "_registry" / "refs"
    refs_dir.mkdir(parents=True)
    for r in refs_data:
        fm = "\n".join(f"{k}: {v}" for k, v in r.items() if k != "slug")
        (refs_dir / f"{r['slug']}.md").write_text(
            f"---\n{fm}\nstate_history:\n- at: '2026-01-01T00:00:00Z'\n"
            f"  by: test\n  state: {r.get('state', 'candidate')}\n---\n",
            encoding="utf-8",
        )
    sotas_dir = vault / "Publications"
    sotas_dir.mkdir()
    for name, content in sotas_data.items():
        (sotas_dir / name).write_text(content, encoding="utf-8")
    subprocess.run(["git", "-C", str(vault), "add", "."], capture_output=True)
    subprocess.run(["git", "-C", str(vault), "commit", "-q", "-m", "init"],
                   capture_output=True)
    return vault, refs_dir


def _patch_config(vault: Path, refs_dir: Path):
    from pipeline import config, registry, transitions, cli
    config.VAULT = vault
    config.REFS = refs_dir
    config.SOURCES = vault / "Sources"
    registry.REFS = refs_dir
    registry.SOURCES = config.SOURCES
    transitions.REFS = refs_dir
    transitions.SOURCES = config.SOURCES
    cli.REFS = refs_dir


def test_T_list_includes_ugly_suffixes(tmp_path, capsys):
    """`registry-cleanup --list` doit inclure les refs avec suffixe `_2_3_4`."""
    refs = [
        {"slug": "foo_2020_paper", "author": "Foo", "year": "2020",
         "title": "Paper", "state": "candidate"},
        # Ugly suffix : doit être capturé
        {"slug": "foo_2020_paper_2", "author": "Foo", "year": "2020",
         "title": "Paper", "state": "candidate"},
        {"slug": "foo_2020_paper_2_3", "author": "Foo", "year": "2020",
         "title": "Paper", "state": "candidate"},
        # Zero-year : doit être capturé aussi
        {"slug": "sipser_0000_intro", "author": "Sipser", "year": "0000",
         "title": "Intro", "state": "candidate"},
    ]
    vault, refs_dir = _setup_vault(tmp_path, refs, {})
    _patch_config(vault, refs_dir)

    from pipeline.cli import cmd_registry_cleanup

    args = SimpleNamespace(list_candidates=True, apply_from=None)
    rc = cmd_registry_cleanup(args)
    out = capsys.readouterr().out
    data = _json.loads(out)
    slugs_listed = {c["slug"] for c in data}

    # foo_2020_paper (clean) ne doit PAS être candidate
    assert "foo_2020_paper" not in slugs_listed
    # Les suffixes moches doivent l'être
    assert "foo_2020_paper_2" in slugs_listed
    assert "foo_2020_paper_2_3" in slugs_listed
    # Zero-year aussi
    assert "sipser_0000_intro" in slugs_listed


def test_T_apply_merge_syncs_sotas(tmp_path):
    """Un merge appliqué via registry-cleanup --apply-from propage aux SOTAs."""
    refs = [
        {"slug": "foo_2020_paper", "author": "Foo", "year": "2020",
         "title": "Paper", "state": "page1_validated"},
        {"slug": "foo_2020_paper_2", "author": "Foo", "year": "2020",
         "title": "Paper", "state": "candidate"},
    ]
    sotas = {
        "SOTA_a.md": "## Refs\n\n- [[foo_2020_paper_2]] -- Foo paper duplicate\n",
        "SOTA_b.md": "Voir [[foo_2020_paper_2]] aussi.\n",
    }
    vault, refs_dir = _setup_vault(tmp_path, refs, sotas)
    _patch_config(vault, refs_dir)

    # Décisions : merge foo_2020_paper_2 → foo_2020_paper
    decisions_json = tmp_path / "decisions.json"
    decisions_json.write_text(_json.dumps([
        {"slug": "foo_2020_paper_2", "action": "merge_into",
         "target_slug": "foo_2020_paper"}
    ]))

    from pipeline.cli import cmd_registry_cleanup
    args = SimpleNamespace(list_candidates=False,
                           apply_from=str(decisions_json))
    rc = cmd_registry_cleanup(args)
    assert rc == 0

    sota_a = (vault / "Publications" / "SOTA_a.md").read_text()
    sota_b = (vault / "Publications" / "SOTA_b.md").read_text()
    assert "[[foo_2020_paper_2]]" not in sota_a
    assert "[[foo_2020_paper_2]]" not in sota_b
    assert "[[foo_2020_paper]]" in sota_a
    assert "[[foo_2020_paper]]" in sota_b


def test_T_invariance_post_cleanup(tmp_path):
    """Après cleanup avec merge, doctor I22/I23 = 0."""
    refs = [
        {"slug": "foo_2020_paper", "author": "Foo", "year": "2020",
         "title": "Paper", "state": "page1_validated"},
        {"slug": "foo_2020_paper_2", "author": "Foo", "year": "2020",
         "title": "Paper", "state": "candidate"},
    ]
    sotas = {
        "SOTA_test.md": "- [[foo_2020_paper_2]] -- duplicate\n",
    }
    vault, refs_dir = _setup_vault(tmp_path, refs, sotas)
    _patch_config(vault, refs_dir)

    decisions = tmp_path / "decisions.json"
    decisions.write_text(_json.dumps([
        {"slug": "foo_2020_paper_2", "action": "merge_into",
         "target_slug": "foo_2020_paper"}
    ]))

    from pipeline.cli import cmd_registry_cleanup
    cmd_registry_cleanup(SimpleNamespace(
        list_candidates=False, apply_from=str(decisions)
    ))

    # Re-check : I22/I23 = 0
    from pipeline import doctor
    from pipeline.registry import iter_refs
    refs_list = list(iter_refs(refs_dir))
    violations = doctor.run_all_checks(refs_list, vault_root=vault)
    i22 = [v for v in violations if v.invariant == "I22"]
    i23 = [v for v in violations if v.invariant == "I23"]
    assert len(i22) == 0, f"I22 = {len(i22)} après cleanup"
    assert len(i23) == 0, f"I23 = {len(i23)} après cleanup"


def _run_all():
    import inspect
    fns = [
        (n, fn) for n, fn in globals().items()
        if n.startswith("test_") and inspect.isfunction(fn)
    ]
    n_ok = 0
    for name, fn in fns:
        params = inspect.signature(fn).parameters
        try:
            with tempfile.TemporaryDirectory() as d:
                if "capsys" in params:
                    # Mini fake capsys (capture stdout)
                    import io
                    from contextlib import redirect_stdout
                    buf = io.StringIO()
                    class FakeCapsys:
                        def readouterr(self):
                            return SimpleNamespace(out=buf.getvalue(), err="")
                    with redirect_stdout(buf):
                        fn(Path(d), FakeCapsys())
                else:
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
