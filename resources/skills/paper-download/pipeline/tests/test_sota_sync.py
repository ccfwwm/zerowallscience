"""Tests pour pipeline.sota_sync (Phase 1 du plan refonte INGEST).

3 tests d'invariance + edge cases :
- T1 : retract simple supprime le wikilink, garde le texte humain
- T2 : merge remplace [[old]] par [[new]] partout
- T3 : idempotence (2e exécution ne change rien)
- T4 : dry_run n'écrit pas
- T5 : wikilink avec path PDF + alias détecté
- T6 : plusieurs wikilinks sur même ligne

Pas de dépendance pytest : tests exécutables directement via
`python pipeline/tests/test_sota_sync.py`.
"""
from __future__ import annotations
import sys
import tempfile
from pathlib import Path

PROJ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJ))

from pipeline.sota_sync import (  # noqa: E402
    update_wikilinks_in_sotas,
    _wikilink_targets_slug,
    _strip_wikilink_in_line,
    _replace_wikilink_in_line,
)


def _make_vault(tmp: Path, sotas: dict) -> Path:
    vault = tmp / "vault"
    vault.mkdir()
    for rel_path, content in sotas.items():
        sota = vault / rel_path
        sota.parent.mkdir(parents=True, exist_ok=True)
        sota.write_text(content, encoding="utf-8")
    return vault


def test_T1_retract_simple_keeps_human_text(tmp_path):
    vault = _make_vault(tmp_path, {
        "SOTA_test.md": (
            "# Test\n\n## Refs\n\n"
            "- [[knuth_1965_lr]] -- Knuth 1965 LR parser\n"
            "- [[earley_1970_efficient]] -- Earley 1970\n"
        ),
    })
    result = update_wikilinks_in_sotas(
        old_slug="knuth_1965_lr", new_slug=None,
        reason="test_retract", vault_root=vault, skip_git_backup=True,
    )
    assert result.total_substitutions == 1
    assert len(result.sotas_touched) == 1
    new_content = (vault / "SOTA_test.md").read_text(encoding="utf-8")
    assert "knuth_1965_lr" not in new_content
    assert "Knuth 1965 LR parser" in new_content
    assert "earley_1970_efficient" in new_content


def test_T2_merge_replaces_with_new_slug(tmp_path):
    vault = _make_vault(tmp_path, {
        "SOTA_a.md": (
            "Mention 1 : OLDSLUG -- Hopcroft textbook\n"
            "Mention 2 : voir OLDSLUG aussi.\n"
        ).replace("OLDSLUG", "[[hopcroft_0000_old]]"),
        "Publications/SOTA_b.md": (
            "Avec alias : OLDALIAS -- Hopcroft\n"
        ).replace("OLDALIAS", "[[hopcroft_0000_old|hopcroft]]"),
    })
    result = update_wikilinks_in_sotas(
        old_slug="hopcroft_0000_old",
        new_slug="hopcroft_2001_introduction",
        reason="test_merge", vault_root=vault, skip_git_backup=True,
    )
    assert result.total_substitutions == 3
    assert len(result.sotas_touched) == 2
    a = (vault / "SOTA_a.md").read_text(encoding="utf-8")
    assert "hopcroft_0000_old" not in a
    assert a.count("hopcroft_2001_introduction") == 2
    assert "Hopcroft textbook" in a
    b = (vault / "Publications/SOTA_b.md").read_text(encoding="utf-8")
    assert "hopcroft_0000_old" not in b
    assert "hopcroft_2001_introduction|hopcroft" in b


def test_T3_idempotence(tmp_path):
    vault = _make_vault(tmp_path, {
        "SOTA_test.md": "- [[foo_2020_bar]] -- Foo 2020 bar paper\n",
    })
    r1 = update_wikilinks_in_sotas(
        old_slug="foo_2020_bar", new_slug=None,
        reason="test", vault_root=vault, skip_git_backup=True,
    )
    assert r1.total_substitutions == 1
    after1 = (vault / "SOTA_test.md").read_text(encoding="utf-8")
    r2 = update_wikilinks_in_sotas(
        old_slug="foo_2020_bar", new_slug=None,
        reason="test", vault_root=vault, skip_git_backup=True,
    )
    assert r2.total_substitutions == 0
    after2 = (vault / "SOTA_test.md").read_text(encoding="utf-8")
    assert after1 == after2


def test_T4_dry_run_no_mutation(tmp_path):
    vault = _make_vault(tmp_path, {
        "SOTA_test.md": "[[foo_2020_bar]] -- Foo paper\n",
    })
    original = (vault / "SOTA_test.md").read_text(encoding="utf-8")
    result = update_wikilinks_in_sotas(
        old_slug="foo_2020_bar", new_slug="foo_2020_corrected",
        reason="test", vault_root=vault,
        dry_run=True, skip_git_backup=True,
    )
    assert result.total_substitutions == 1
    assert result.dry_run is True
    after = (vault / "SOTA_test.md").read_text(encoding="utf-8")
    assert after == original


def test_T5_wikilink_with_pdf_path_target(tmp_path):
    """[[path/file.pdf|slug]] doit être détecté par stem(target)."""
    vault = _make_vault(tmp_path, {
        "SOTA_test.md": (
            "PDFLINK -- Knuth 1965 LR\n"
        ).replace("PDFLINK", "[[Sources/Knuth_1965_Translation.pdf|knuth_1965]]"),
    })
    result = update_wikilinks_in_sotas(
        old_slug="knuth_1965", new_slug=None,
        reason="test", vault_root=vault, skip_git_backup=True,
    )
    assert result.total_substitutions == 1, f"got {result.total_substitutions}"
    content = (vault / "SOTA_test.md").read_text(encoding="utf-8")
    assert "Sources/Knuth_1965_Translation.pdf" not in content
    assert "Knuth 1965 LR" in content


def test_T6_multiple_wikilinks_same_line(tmp_path):
    vault = _make_vault(tmp_path, {
        "SOTA_test.md": (
            "Voir [[foo_2020_bar]] et plus loin [[foo_2020_bar]] aussi.\n"
        ),
    })
    result = update_wikilinks_in_sotas(
        old_slug="foo_2020_bar", new_slug="foo_2020_corrected",
        reason="test", vault_root=vault, skip_git_backup=True,
    )
    assert result.total_substitutions == 2
    content = (vault / "SOTA_test.md").read_text(encoding="utf-8")
    assert content.count("foo_2020_corrected") == 2


def test_unit_strip_keeps_human_text():
    assert _strip_wikilink_in_line(
        "- [[knuth_1965_lr]] -- Knuth 1965 LR", "[[knuth_1965_lr]]"
    ) == "- Knuth 1965 LR"
    assert _strip_wikilink_in_line(
        "voir [[foo]] et plus", "[[foo]]"
    ) == "voir et plus"


def test_unit_replace_preserves_alias():
    assert _replace_wikilink_in_line(
        "[[old|alias]]", "[[old|alias]]", "new"
    ) == "[[new|alias]]"
    assert _replace_wikilink_in_line(
        "[[old]]", "[[old]]", "new"
    ) == "[[new]]"


def test_unit_targets_slug():
    assert _wikilink_targets_slug("slug", None, "slug") is True
    assert _wikilink_targets_slug("path/file.pdf", "slug", "slug") is True
    assert _wikilink_targets_slug("path/slug.pdf", None, "slug") is True
    assert _wikilink_targets_slug("other", None, "slug") is False


def _run_all():
    import inspect
    fns = [
        (name, fn) for name, fn in globals().items()
        if name.startswith("test_") and inspect.isfunction(fn)
    ]
    n_ok = 0
    for name, fn in fns:
        params = inspect.signature(fn).parameters
        try:
            if "tmp_path" in params:
                with tempfile.TemporaryDirectory() as d:
                    fn(Path(d))
            else:
                fn()
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
