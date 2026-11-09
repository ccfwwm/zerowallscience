"""Tests P6 — module acquire (filtrage cibles sur scope d'un SOTA).

On ne teste pas la cascade elle-même (déjà testée dans worker B). On teste :
- slugs_cited_by_sota : extraction wikilinks + filtrage
- _looks_like_bib_slug : heuristique
- run_acquire_for_sota en dry-run sur refs synthétiques
"""
from __future__ import annotations
import sys
import tempfile
from pathlib import Path

PROJ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJ))

from pipeline.acquire import (  # noqa: E402
    slugs_cited_by_sota,
    _looks_like_bib_slug,
)


def test_unit_looks_like_bib_slug():
    assert _looks_like_bib_slug("knuth_1965_lr") is True
    assert _looks_like_bib_slug("hopcroft_0000_intro") is True
    assert _looks_like_bib_slug("vijayshanker_1987_study") is True
    # Non-bib
    assert _looks_like_bib_slug("IR_Spec_Preliminaire") is False
    assert _looks_like_bib_slug("AE-001") is False
    assert _looks_like_bib_slug("Zones_Floues_Formalismes") is False
    # Edge
    assert _looks_like_bib_slug("") is False
    assert _looks_like_bib_slug("foo") is False  # pas d'underscore


def test_T_slugs_cited_by_sota_extract_wikilinks(tmp_path):
    """Extrait les slugs bib des wikilinks, ignore les paths techniques."""
    sota = tmp_path / "SOTA_test.md"
    sota.write_text(
        "# Test\n"
        "- [[knuth_1965_lr]] -- Knuth\n"
        "- [[Sources/Hopcroft.pdf|hopcroft_2001_intro]] -- Hopcroft\n"
        "- [[20_ATLAS/canvas_dev.canvas]] -- ne devrait pas être inclus\n"
        "- [[IR_Spec_Preliminaire]] -- non-bib\n"
        "- [[earley_1970_efficient]] -- Earley\n",
        encoding="utf-8",
    )
    slugs = slugs_cited_by_sota(sota)
    # [[slug]] simples extraits
    assert "knuth_1965_lr" in slugs
    assert "earley_1970_efficient" in slugs
    # [[Path/File.pdf|alias]] skipped : la ref a déjà un PDF, inutile d'acquérir
    assert "hopcroft_2001_intro" not in slugs
    # path technique exclu
    assert not any("canvas" in s for s in slugs)
    # non-bib exclu
    assert "ir_spec_preliminaire" not in slugs
    assert "IR_Spec_Preliminaire" not in slugs


def test_T_slugs_dedup(tmp_path):
    """Slugs mentionnés plusieurs fois → dédup."""
    sota = tmp_path / "SOTA_test.md"
    sota.write_text(
        "[[foo_2020_bar]] mentioned in body. "
        "Voir aussi [[foo_2020_bar]] dans le tableau.\n",
        encoding="utf-8",
    )
    slugs = slugs_cited_by_sota(sota)
    assert slugs.count("foo_2020_bar") == 1


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
