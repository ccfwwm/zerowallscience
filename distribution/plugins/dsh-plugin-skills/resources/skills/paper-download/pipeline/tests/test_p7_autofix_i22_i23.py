"""Tests P7 — auto-fix I22 (wikilink → ref absente) et I23 (→ retracted).

Tests d'invariance : après doctor --fix, les violations I22/I23 doivent
disparaître. Les SOTAs sont synchronisés.

3 cas :
- T_I22 : SOTA cite [[absent_2020]] → fix retire le wikilink
- T_I23_strip : SOTA cite [[old_2020]] retracted SANS merge_into → fix strip
- T_I23_merge : SOTA cite [[old_2020]] retracted AVEC merge_into:new_2020
              → fix remplace par [[new_2020]]
"""
from __future__ import annotations
import sys
import subprocess
import tempfile
from pathlib import Path

PROJ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJ))


def _setup_vault_and_refs(tmp: Path, refs_data: list[dict]) -> tuple[Path, Path]:
    """Crée un vault avec git initialisé + refs synthétiques."""
    vault = tmp / "vault"
    vault.mkdir()
    subprocess.run(["git", "init", "-q", str(vault)], check=True)
    subprocess.run(
        ["git", "-C", str(vault), "config", "user.email", "test@test"],
        check=True,
    )
    subprocess.run(
        ["git", "-C", str(vault), "config", "user.name", "test"],
        check=True,
    )

    refs_dir = vault / "10_SOURCES" / "_registry" / "refs"
    refs_dir.mkdir(parents=True)
    for r in refs_data:
        frontmatter_lines = [f"{k}: {v}" for k, v in r.items() if k != "slug"]
        (refs_dir / f"{r['slug']}.md").write_text(
            "---\n" + "\n".join(frontmatter_lines) +
            "\nstate_history:\n- at: '2026-01-01T00:00:00Z'\n  by: test\n"
            "  state: " + r.get("state", "candidate") + "\n---\n",
            encoding="utf-8",
        )
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


def test_T_I22_autofix(tmp_path):
    """SOTA cite ref absente → fix doit retirer le wikilink."""
    vault, refs_dir = _setup_vault_and_refs(tmp_path, [
        {"slug": "earley_1970_efficient", "author": "Earley",
         "year": "1970", "title": "x", "state": "candidate"},
    ])
    _patch_config(vault, refs_dir)

    sotas_dir = vault / "Publications"
    sotas_dir.mkdir()
    (sotas_dir / "SOTA_test.md").write_text(
        "## Refs\n\n"
        "- [[absent_2020_paper]] -- Paper absent du registre\n"
        "- [[earley_1970_efficient]] -- Earley (valide)\n",
        encoding="utf-8",
    )
    subprocess.run(["git", "-C", str(vault), "add", "."], capture_output=True)
    subprocess.run(["git", "-C", str(vault), "commit", "-q", "-m", "init"],
                   capture_output=True)

    from pipeline import doctor
    from pipeline.registry import iter_refs

    # Detect: I22 doit lever pour absent_2020_paper
    refs = list(iter_refs())
    violations_before = doctor.run_all_checks(refs, vault_root=vault)
    i22 = [v for v in violations_before if v.invariant == "I22"]
    assert len(i22) == 1, f"got {len(i22)} I22"
    assert "absent_2020_paper" in i22[0].message

    # Fix
    fixed, skipped = doctor.auto_fix(i22)
    assert fixed == 1, f"got fixed={fixed}, skipped={skipped}"

    # Re-check : I22 = 0
    violations_after = doctor.run_all_checks(refs, vault_root=vault)
    i22_after = [v for v in violations_after if v.invariant == "I22"]
    assert len(i22_after) == 0, f"got {len(i22_after)} I22 après fix"

    # Le wikilink est retiré du SOTA
    content = (sotas_dir / "SOTA_test.md").read_text()
    assert "[[absent_2020_paper]]" not in content
    assert "Paper absent du registre" in content
    assert "[[earley_1970_efficient]]" in content  # valide préservé


def test_T_I23_strip_when_no_merge(tmp_path):
    """SOTA cite ref retracted sans merge_into → fix strip."""
    vault, refs_dir = _setup_vault_and_refs(tmp_path, [
        {"slug": "old_2020_paper", "author": "X", "year": "2020", "title": "x",
         "state": "retracted", "retracted_reason": "cascade_exhausted"},
    ])
    _patch_config(vault, refs_dir)

    sotas_dir = vault / "Publications"
    sotas_dir.mkdir()
    (sotas_dir / "SOTA_test.md").write_text(
        "## Refs\n\n"
        "- [[old_2020_paper]] -- X 2020 paper\n",
        encoding="utf-8",
    )
    subprocess.run(["git", "-C", str(vault), "add", "."], capture_output=True)
    subprocess.run(["git", "-C", str(vault), "commit", "-q", "-m", "init"],
                   capture_output=True)

    from pipeline import doctor
    from pipeline.registry import iter_refs

    refs = list(iter_refs(refs_dir))
    violations_before = doctor.run_all_checks(refs, vault_root=vault)
    i23 = [v for v in violations_before if v.invariant == "I23"]
    assert len(i23) == 1

    fixed, _ = doctor.auto_fix(i23)
    assert fixed == 1

    violations_after = doctor.run_all_checks(refs, vault_root=vault)
    i23_after = [v for v in violations_after if v.invariant == "I23"]
    assert len(i23_after) == 0

    content = (sotas_dir / "SOTA_test.md").read_text()
    assert "[[old_2020_paper]]" not in content
    assert "X 2020 paper" in content  # texte humain préservé


def test_T_I23_merge_into_redirects(tmp_path):
    """SOTA cite ref retracted AVEC merge_into:X → fix remplace par [[X]]."""
    vault, refs_dir = _setup_vault_and_refs(tmp_path, [
        {"slug": "old_slug", "author": "X", "year": "2020", "title": "x",
         "state": "retracted",
         "retracted_reason": "merged_into:new_2020_canonical"},
        {"slug": "new_2020_canonical", "author": "X", "year": "2020",
         "title": "x", "state": "page1_validated"},
    ])
    _patch_config(vault, refs_dir)

    sotas_dir = vault / "Publications"
    sotas_dir.mkdir()
    (sotas_dir / "SOTA_test.md").write_text(
        "## Refs\n\n"
        "- [[old_slug]] -- X 2020 ancien slug\n",
        encoding="utf-8",
    )
    subprocess.run(["git", "-C", str(vault), "add", "."], capture_output=True)
    subprocess.run(["git", "-C", str(vault), "commit", "-q", "-m", "init"],
                   capture_output=True)

    from pipeline import doctor
    from pipeline.registry import iter_refs

    refs = list(iter_refs(refs_dir))
    violations_before = doctor.run_all_checks(refs, vault_root=vault)
    i23 = [v for v in violations_before if v.invariant == "I23"]
    assert len(i23) == 1

    fixed, _ = doctor.auto_fix(i23)
    assert fixed == 1

    violations_after = doctor.run_all_checks(refs, vault_root=vault)
    i23_after = [v for v in violations_after if v.invariant == "I23"]
    assert len(i23_after) == 0

    content = (sotas_dir / "SOTA_test.md").read_text()
    assert "[[old_slug]]" not in content
    assert "[[new_2020_canonical]]" in content


def _run_all():
    import inspect
    fns = [
        (n, fn) for n, fn in globals().items()
        if n.startswith("test_") and inspect.isfunction(fn)
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
