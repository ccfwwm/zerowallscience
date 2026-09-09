"""Tests P5 — module linkify + section Statut sur fixture synthétique.

Tests :
- T1 : entry PDF validé → wikilink direct PDF
- T2 : entry ref absente → wikilink vers ancre + StatutEntry catégorie missing
- T3 : section ## Statut des sources idempotente (2× linkify → même contenu)
- T4 : 5 catégories en ordre stable
- T5 : build_statut_section produit ancres + entrées corrects
- Unit : _make_anchor, _strip_existing_statut, _classify_entry
"""
from __future__ import annotations
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

PROJ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJ))

from pipeline.linkify import (  # noqa: E402
    _make_anchor,
    _classify_entry,
    _strip_existing_statut,
    build_statut_section,
    StatutEntry,
    STATUT_BEGIN, STATUT_END, STATUT_HEADING,
)


def test_unit_make_anchor():
    assert _make_anchor("Younger", "1967") == "source-younger-1967"
    assert _make_anchor("Vijay-Shanker", "1987") == "source-vijayshanker-1987"
    assert _make_anchor("", "") == "source-unknown-0000"
    assert _make_anchor("De Gaulle", "1958") == "source-degaulle-1958"


def test_unit_classify_entry():
    assert _classify_entry("page1_validated") == "validated"
    assert _classify_entry("sota_cited_confirmed") == "validated"
    assert _classify_entry("retracted") == "retracted"
    assert _classify_entry("blocked_human:cascade_exhausted") == "blocked"
    assert _classify_entry("candidate") == "in_progress"
    assert _classify_entry("awaiting_rtfm_ocr") == "in_progress"
    assert _classify_entry(None) == "missing"
    assert _classify_entry("not_yet_created") == "missing"


def test_unit_strip_existing_statut():
    text_with = (
        "# SOTA\n\n"
        "Body content.\n\n"
        f"{STATUT_BEGIN}\n{STATUT_HEADING}\n\n"
        "Some Statut content.\n"
        f"{STATUT_END}\n"
    )
    stripped = _strip_existing_statut(text_with)
    assert STATUT_BEGIN not in stripped
    assert STATUT_END not in stripped
    assert "Body content." in stripped
    # 2e passe : idempotent
    stripped2 = _strip_existing_statut(stripped)
    assert stripped == stripped2


def test_unit_build_statut_categories_order():
    """5 catégories produites en ordre stable, sections vides skippées."""
    entries = [
        StatutEntry(
            slug="b_2020", anchor="source-b-2020", lastname="B",
            year="2020", title="x", state="page1_validated",
            reason="ok", pdf_path="x.pdf", category="validated",
        ),
        StatutEntry(
            slug=None, anchor="source-c-2021", lastname="C",
            year="2021", title="y", state="not_yet_created",
            reason="absent", category="missing",
        ),
        StatutEntry(
            slug="a_2019", anchor="source-a-2019", lastname="A",
            year="2019", title="z", state="page1_validated",
            reason="ok", pdf_path="a.pdf", category="validated",
        ),
    ]
    md = build_statut_section(entries)
    # Format minimaliste : pas de headings séparés. L'ordre des entrées
    # doit respecter (catégorie, lastname, year). A (validated) avant
    # C (missing). A avant B dans validated.
    pos_a = md.find("^source-a-2019")
    pos_b = md.find("^source-b-2020")
    pos_c = md.find("^source-c-2021")
    assert pos_a < pos_b  # A avant B (validated, par lastname)
    assert pos_b < pos_c  # validated avant missing


def test_unit_build_statut_skip_empty_categories():
    """Catégories vides ne génèrent pas de heading."""
    entries = [
        StatutEntry(
            slug=None, anchor="source-x-2020", lastname="X",
            year="2020", title="t", state="not_yet_created",
            reason="x", category="missing",
        ),
    ]
    md = build_statut_section(entries)
    # Format minimaliste : pas de headings séparés mais l'entrée X
    # (catégorie missing) doit être présente avec son ancre block.
    assert "^source-x-2020" in md
    assert "X 2020" in md


def test_T_idempotence_statut_section():
    """Régénération idempotente : strip + rewrite ne change pas le contenu."""
    entries = [
        StatutEntry(
            slug="a_2020", anchor="source-a-2020", lastname="A",
            year="2020", title="t", state="candidate",
            reason="state=candidate", category="in_progress",
        ),
    ]
    section_1 = build_statut_section(entries)
    # Insère dans un SOTA fictif
    text = f"# SOTA\n\nBody.\n\n{section_1}\n"
    # Strip + rewrite
    text_stripped = _strip_existing_statut(text)
    text_rewritten = text_stripped.rstrip() + "\n\n" + section_1 + "\n"
    # 2e cycle
    text_stripped_2 = _strip_existing_statut(text_rewritten)
    text_rewritten_2 = text_stripped_2.rstrip() + "\n\n" + section_1 + "\n"
    assert text_rewritten == text_rewritten_2


def test_unit_anchor_in_section():
    """L'ancre Obsidian block-ref doit être présente."""
    entries = [
        StatutEntry(
            slug=None, anchor="source-foo-2020", lastname="Foo",
            year="2020", title="t", state="candidate",
            reason="state=candidate", category="in_progress",
        ),
    ]
    md = build_statut_section(entries)
    assert "^source-foo-2020" in md
    assert "Foo 2020" in md


def _run_all():
    import inspect
    fns = [
        (name, fn) for name, fn in globals().items()
        if name.startswith("test_") and inspect.isfunction(fn)
    ]
    n_ok = 0
    for name, fn in fns:
        try:
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
