"""Tests P4 — module purge sur fixture synthétique.

Tests sur fixture_purge.md (6 cas couverts) :
- T1 : plan_purge détecte les 6 actions attendues, ignore légitimes
- T2 : apply_purge supprime / remplace correctement
- T3 : idempotence (2e exécution = 0 action)
- T4 : wikilinks légitimes préservés

Les refs de test sont passées en argument (refs=...) à plan_purge,
pas chargées depuis le registre réel.
"""
from __future__ import annotations
import shutil
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace

PROJ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJ))

from pipeline.purge import (  # noqa: E402
    plan_purge, apply_purge, PurgeReason,
)


FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "ingest"


@dataclass
class FakeRef:
    """Minimal Ref-like object pour les tests (sans I/O)."""
    slug: str
    frontmatter: dict = field(default_factory=dict)

    @property
    def state(self):
        return self.frontmatter.get("state", "candidate")


def _build_fake_refs():
    """Refs synthétiques cohérentes avec fixture_purge.md."""
    return [
        # Cas A : retracted pur
        FakeRef("knuth_1965_lr", {"state": "retracted"}),
        # Cas A' : retracted avec merged_into
        FakeRef("merged_old", {
            "state": "retracted",
            "retracted_reason": "merged_into:merged_new",
        }),
        FakeRef("merged_new", {"state": "page1_validated"}),
        # Cas B : zero-year + sibling complet
        FakeRef("hopcroft_0000_old", {"state": "candidate"}),
        FakeRef("hopcroft_2001_intro", {
            "state": "page1_validated",
            "pdf_path": "Sources/Hopcroft.pdf",
        }),
        # Wikilink légitime (Earley)
        FakeRef("earley_1970_efficient", {
            "state": "page1_validated",
            "pdf_path": "Sources/Earley.pdf",
        }),
        # Cas C / D / D' : ces wikilinks n'ont pas besoin de refs (détectés
        # par pattern slug seul)
    ]


def test_T1_plan_purge_detects_all_cases(tmp_path):
    src = FIXTURES_DIR / "fixture_purge.md"
    sota = tmp_path / "fixture_purge.md"
    shutil.copy(src, sota)

    refs = _build_fake_refs()
    result = plan_purge(sota, refs=refs)
    assert not result.errors, f"errors: {result.errors}"

    by_reason = result.by_reason()
    print(f"  by_reason: {by_reason}")
    # On attend 6 actions, une par cas
    # Chaque slug est mentionné 2× dans la fixture (Synthèse + Références)
    expected = {
        "retracted_pure": 2,
        "retracted_merged_to_target": 2,
        "zero_year_with_sibling": 2,
        "ugly_numeric_suffix": 2,
        "technical_file": 2,
        "non_bibliographic_slug": 2,
    }
    for reason, count in expected.items():
        assert by_reason.get(reason, 0) == count, \
            f"reason={reason}: expected {count}, got {by_reason.get(reason, 0)}"


def test_T2_apply_purge_strips_and_replaces(tmp_path):
    src = FIXTURES_DIR / "fixture_purge.md"
    sota = tmp_path / "fixture_purge.md"
    shutil.copy(src, sota)
    refs = _build_fake_refs()
    result = plan_purge(sota, refs=refs)
    n = apply_purge(result)
    assert n == 12, f"got {n} (expected 12)"

    content = sota.read_text(encoding="utf-8")
    # Cas A retracted pur : wikilink doit avoir disparu
    assert "[[knuth_1965_lr]]" not in content
    # Cas A' merged : remplacé par [[merged_new]]
    assert "[[merged_old]]" not in content
    assert "[[merged_new]]" in content
    # Cas B zero-year : remplacé par sibling
    assert "[[hopcroft_0000_old]]" not in content
    assert "[[hopcroft_2001_intro]]" in content
    # Cas C ugly suffix : strip
    assert "sipser_2012_intro_2_3_4" not in content
    # Cas D technical : strip
    assert "20_ATLAS/canvas_dev.canvas" not in content
    # Cas D' non-bib : strip
    assert "[[ZZZ_Fake_NonBibSlug_Test]]" not in content
    # Légitime : préservé
    assert "[[earley_1970_efficient]]" in content


def test_T3_idempotence(tmp_path):
    src = FIXTURES_DIR / "fixture_purge.md"
    sota = tmp_path / "fixture_purge.md"
    shutil.copy(src, sota)
    refs = _build_fake_refs()

    r1 = plan_purge(sota, refs=refs)
    apply_purge(r1)

    # 2e passe : 0 action attendue
    r2 = plan_purge(sota, refs=refs)
    assert len(r2.actions) == 0, \
        f"got {len(r2.actions)} actions, expected 0"


def test_T4_legitimate_wikilinks_preserved(tmp_path):
    """Si un SOTA contient uniquement des wikilinks légitimes, plan=vide."""
    sota = tmp_path / "SOTA_clean.md"
    sota.write_text(
        "## Refs\n\n"
        "- [[earley_1970_efficient]] -- Earley 1970\n"
        "- [[hopcroft_2001_intro]] -- Hopcroft textbook\n"
        "- [[merged_new]] -- target ref valide\n",
        encoding="utf-8",
    )
    refs = _build_fake_refs()
    result = plan_purge(sota, refs=refs)
    assert len(result.actions) == 0, \
        f"got {len(result.actions)} actions, expected 0"


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
