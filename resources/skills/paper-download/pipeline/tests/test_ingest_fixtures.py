"""Tests pour le module INGEST sur fixtures synthétiques (H7).

3 fixtures couvrent les cas limites :
- fixture_libre.md     : section "## Références" en bullet list pure
- fixture_mixte.md     : Local + À procurer + tableau + plusieurs sections
- fixture_wikilink.md  : déjà wikilinké → idempotence

Les tests vérifient :
- Extraction de sections : nombre + headers + is_excluded
- Substitution wikilink : fonctionne sur citations en mémoire, sans
  dépendre du registre réel ni de la résolution DOI online
- Idempotence : fixture déjà wikilinkée → 0 substitution
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

# Path setup pour exécution directe
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT))

from pipeline.ingest import (  # noqa: E402
    ParsedCitation, _substitute_to_wikilink,
)
import pipeline.ingest as ingest_mod  # noqa: E402

FIXTURES = HERE / "fixtures" / "ingest"
EXPECTED = json.loads((FIXTURES / "expected_sections.json").read_text())


def _extract_sections(sota_path: Path) -> list[dict]:
    """Appelle l'adapter pour extraire les sections (équivalent
    `pipeline ingest <sota> --extract-only`).
    """
    sys.path.insert(0, str(ROOT))
    from adapters import get_adapter
    adapter = get_adapter()
    sections = adapter.extract_bibliography_sections(sota_path)
    return [
        {"header": s.header, "is_excluded": s.is_excluded}
        for s in sections
    ]


def test_extract_sections_match_golden():
    """Les sections détectées doivent matcher les golden files."""
    failures = []
    for fixture_name, expected in EXPECTED.items():
        path = FIXTURES / fixture_name
        actual = _extract_sections(path)
        if actual != expected:
            failures.append(
                f"  {fixture_name}\n"
                f"    expected: {expected}\n"
                f"    actual  : {actual}"
            )
    assert not failures, (
        "Sections extraites ne matchent pas les golden:\n"
        + "\n".join(failures)
    )


def test_substitute_wikilink_strict_match(tmp_path):
    """Substitution strict-match : le raw exact présent dans le SOTA
    doit être préfixé par le wikilink.
    """
    sota = tmp_path / "sota.md"
    sota.write_text(
        "## Refs\n\n- Earley, J. 1970 *An Efficient Context-Free Parsing Algorithm*\n",
        encoding="utf-8",
    )
    ingest_mod._wikilink_for_slug = lambda s: f"[[{s}]]"
    cit = ParsedCitation(
        author="Earley, J.", year="1970",
        title="An Efficient Context-Free Parsing Algorithm",
        raw="Earley, J. 1970 *An Efficient Context-Free Parsing Algorithm*",
    )
    assert _substitute_to_wikilink(sota, cit, "earley_1970_efficient")
    assert "[[earley_1970_efficient]]" in sota.read_text()


def test_substitute_wikilink_anchor_fallback(tmp_path):
    """Si le raw du sub-agent ne matche pas mot-à-mot, l'ancrage par
    lastname+year doit retrouver la ligne.
    """
    sota = tmp_path / "sota.md"
    sota.write_text(
        "## Refs\n\n- **Vijay-Shanker, K. 1987** *A Study of Tree Adjoining Grammars*, PhD Thesis.\n",
        encoding="utf-8",
    )
    ingest_mod._wikilink_for_slug = lambda s: f"[[{s}]]"
    # Le sub-agent renvoie un raw sans les `**` markdown
    cit = ParsedCitation(
        author="Vijay-Shanker, K.", year="1987",
        title="A Study of Tree Adjoining Grammars",
        raw="Vijay-Shanker, K. 1987 *A Study of Tree Adjoining Grammars*, PhD Thesis, University of Pennsylvania",
    )
    assert _substitute_to_wikilink(sota, cit, "vijayshanker_1987_study")
    assert "[[vijayshanker_1987_study]]" in sota.read_text()


def test_substitute_idempotent_when_already_present(tmp_path):
    """Si le wikilink est déjà devant le raw, ne fait rien."""
    sota = tmp_path / "sota.md"
    sota.write_text(
        "## Refs\n\n- [[earley_1970_efficient]] — Earley 1970\n",
        encoding="utf-8",
    )
    ingest_mod._wikilink_for_slug = lambda s: f"[[{s}]]"
    cit = ParsedCitation(
        author="Earley, J.", year="1970", title="Efficient Context-Free Parsing",
        raw="Earley 1970",
    )
    before = sota.read_text()
    _substitute_to_wikilink(sota, cit, "earley_1970_efficient")
    assert sota.read_text() == before


def _run_all():
    """Lance tous les tests `test_*` du module sans pytest."""
    import inspect, tempfile
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
            print(f"  FAIL  {name}\n        {e}")
        except Exception as e:
            print(f"  ERROR {name}\n        {type(e).__name__}: {e}")
    print(f"--- {n_ok}/{len(fns)} tests ---")
    return 0 if n_ok == len(fns) else 1


if __name__ == "__main__":
    sys.exit(_run_all())
