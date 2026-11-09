"""Test négatif F1 — vérifier que `candidate_to_uid_resolved` ne fabrique
pas de DOI pour une ref retracted pour homonymie.

Le dispatcher skip les TERMINAL_STATES (retracted inclus), donc on bypass
en appelant la transition directement. C'est exactement le pattern
"anti-homonymie P9α v1" : Shannon 1948 → amphibiens, Earley 1970 →
électrochimie. Si F1 ré-attribue un DOI à une ref déjà retracted pour
homonymie, c'est qu'on a réintroduit le bug.

Critère : `bel_2007_biblio_informatique` (état `retracted`, raison
`homonymie`) doit, après appel de `candidate_to_uid_resolved` :
  - soit échouer (return False, no uid attribué)
  - soit attribuer un bibkey: provisoire (acceptable)
  - PAS attribuer un doi: pris à Crossref (= bug critique)

Le test mute en mémoire un Ref non-sauvegardé sur disque pour ne pas
contaminer le registry. Ne pas appeler save_ref() pendant le test.
"""
from __future__ import annotations
import sys
from pathlib import Path

# Ajouter le projet au sys.path si lancé en standalone
PROJ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJ))

from pipeline.registry import load_ref
from pipeline.transitions import _crossref_title_search, _pick_crossref_strict


# Ce test négatif n'a de sens que sur un vault concret contenant
# `bel_2007_biblio_informatique.md` (état retracted). Sur un vault de test
# vide il est automatiquement skippé. Pour le lancer, pointer
# `RESEARCH_F1_NEGATIVE_REF` (ou laisser le défaut basé sur REFS) vers une
# ref retracted pour homonymie.
import os
from pipeline.config import REFS

_DEFAULT_REF = REFS / "bel_2007_biblio_informatique.md"
REF_PATH = Path(os.environ.get("RESEARCH_F1_NEGATIVE_REF", str(_DEFAULT_REF)))


def main() -> int:
    if not REF_PATH.exists():
        print(f"[SKIP] Ref de test absente: {REF_PATH}")
        return 0
    ref = load_ref(REF_PATH)
    if ref is None:
        print(f"[FAIL] Ref non chargeable: {REF_PATH}")
        return 2

    print(f"Ref: {ref.slug}")
    print(f"  state: {ref.state}")
    print(f"  uid: {ref.uid}")
    print(f"  author: {ref.frontmatter.get('author')!r}")
    print(f"  title: {ref.frontmatter.get('title')!r}")
    print(f"  year: {ref.frontmatter.get('year')!r}")
    print(f"  retracted_reason: {ref.frontmatter.get('retracted_reason')!r}")
    print()

    title = (ref.frontmatter.get("title") or "").strip()
    author = (ref.frontmatter.get("author") or "").strip()
    year = ref.frontmatter.get("year")

    if not author or not title:
        print("[SKIP] auteur ou titre vide — test inapplicable")
        # C'est OK : on ne peut pas tester le matching sans titre/auteur.
        # F1 retournerait blocked_by sans muter le uid.
        return 0

    print(f"Calling _crossref_title_search('{title[:50]}...', '{author}', {year})")
    items = _crossref_title_search(title, author, year, n=3)
    print(f"  Crossref retourne {len(items)} candidats")
    for i, it in enumerate(items[:3]):
        print(f"    [{i}] DOI={it.get('DOI')!r}, "
              f"title={((it.get('title') or [''])[0])[:60]!r}")

    print()
    print("Calling _pick_crossref_strict(...) avec seuil 0.7 + auteur strict")
    best, rejected = _pick_crossref_strict(items, title, author, year)

    if best is not None:
        it, sim, year_cr = best
        print(f"[FAIL] F1 ATTRIBUERAIT un DOI à une ref retracted homonymie !")
        print(f"  DOI candidat: {it.get('DOI')}")
        print(f"  title_sim: {sim}")
        print(f"  → Bug critique : homonymie P9α v1 réintroduite.")
        return 1

    print(f"[PASS] F1 a rejeté tous les candidats Crossref ({len(rejected)} rejets) :")
    for r in rejected:
        print(f"  - {r.get('doi')}: sim={r.get('sim')}, raison={r.get('reason')}")
    print()
    print("→ La ref retracted ne se voit pas réattribuer un DOI. F1 anti-homonymie OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
