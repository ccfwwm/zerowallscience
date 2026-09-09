"""Test d'idempotence — un 2ᵉ run consécutif ne doit faire aucune transition.

Stratégie (sans réseau, sans toucher au registre réel) :
  1. Construit un mini-registre synthétique dans un tmp dir (3-5 refs en
     états variés : terminal, blocked, page1_validated, candidate-déjà-tenté).
  2. Lance la boucle "decide what to do" du dispatcher sur chaque ref →
     compte les `Plan` non-None retournés (= transitions qui SERAIENT
     lancées). Pour les refs ciblées (terminales, blocked, page1_validated),
     ce nombre doit être 0.
  3. Re-lance → assert `done2 == 0`.

On ne lance pas la cascade réseau pour éviter d'avoir à mocker 10 sources.
L'idempotence concerne aussi le fait qu'une transition réelle, exécutée 2x,
ne re-mutera pas la ref (cf. `transitions.py` qui mute selon l'état courant
et passe à un nouvel état → le 2ᵉ appel verra un état différent).

Aux états couverts ici, le dispatcher retourne `None` → aucune transition →
idempotence triviale et vérifiable.
"""
from __future__ import annotations
import sys
import tempfile
from pathlib import Path

PROJ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJ))

from pipeline.registry import load_ref, save_ref
from pipeline.dispatcher import plan_for


# ─── Fixtures inline ────────────────────────────────────────────────────────

FIXTURES = {
    "ref_terminal_confirmed.md": """---
slug: ref_terminal_confirmed
state: sota_cited_confirmed
title: 'Test ref terminale confirmée'
author: 'Doe John'
year: 2020
uid: 'doi:10.1234/test1'
---

Body
""",
    "ref_terminal_retracted.md": """---
slug: ref_terminal_retracted
state: retracted
title: 'Test ref retracted'
author: 'Doe John'
year: 2021
retracted_reason: 'homonymie'
---

Body
""",
    "ref_blocked_human.md": """---
slug: ref_blocked_human
state: 'blocked_human:title_mismatch'
title: 'Test ref bloquée'
author: 'Smith Jane'
year: 2019
blocked_reason: 'review humaine requise'
blocked_since: '2026-05-01T00:00:00Z'
---

Body
""",
    "ref_page1_validated.md": """---
slug: ref_page1_validated
state: page1_validated
title: 'Test ref validée page 1'
author: 'Test Auteur'
year: 2022
uid: 'doi:10.1234/test4'
pdf_path: '11_Biblio_MIR/Sources/Test_2022.pdf'
pdf_sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
---

Body
""",
    "ref_blocked_by_set.md": """---
slug: ref_blocked_by_set
state: candidate
title: 'Test candidate bloqué transitoire'
author: 'X Y'
year: 2023
blocked_by: 'worker_crash:NetworkError'
---

Body
""",
}


def _build_synthetic_registry(tmp_dir: Path) -> Path:
    refs_dir = tmp_dir / "refs"
    refs_dir.mkdir(parents=True)
    for name, content in FIXTURES.items():
        (refs_dir / name).write_text(content, encoding="utf-8")
    return refs_dir


def _count_transitions_planned(refs_dir: Path) -> tuple[int, int]:
    """Compte (n_refs, n_transitions_planifiées) sur les refs du dir."""
    n_refs = 0
    n_planned = 0
    for p in sorted(refs_dir.glob("*.md")):
        ref = load_ref(p)
        if ref is None:
            continue
        n_refs += 1
        plan = plan_for(ref)
        if plan is not None:
            n_planned += 1
    return n_refs, n_planned


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="test_idem_") as tdir:
        tmp = Path(tdir)
        refs_dir = _build_synthetic_registry(tmp)

        # 1er passage
        n_refs1, n_planned1 = _count_transitions_planned(refs_dir)
        print(f"[run1] refs={n_refs1}  transitions planifiées={n_planned1}")

        # Toutes les refs synthétiques sont en états où le dispatcher
        # retourne None → 0 transition attendue.
        if n_planned1 != 0:
            print(f"[FAIL] run1 a planifié {n_planned1} transitions, attendu 0")
            print("  → les fixtures ne sont peut-être pas toutes en états inertes")
            return 1

        # 2ᵉ passage immédiat
        n_refs2, n_planned2 = _count_transitions_planned(refs_dir)
        print(f"[run2] refs={n_refs2}  transitions planifiées={n_planned2}")

        if n_planned2 != 0:
            print(f"[FAIL] run2 a planifié {n_planned2} transitions — idempotence violée")
            return 1

        if n_refs1 != n_refs2:
            print(f"[FAIL] le nombre de refs lisibles change entre run1 ({n_refs1}) "
                  f"et run2 ({n_refs2})")
            return 1

        # Test additionnel : save_ref idempotent (re-sauver une ref ne perd pas l'état)
        print()
        print("[save_ref] vérification idempotence post-write")
        sample_path = refs_dir / "ref_page1_validated.md"
        ref = load_ref(sample_path)
        if ref is None:
            print("[FAIL] ref_page1_validated non chargeable")
            return 1
        original_state = ref.state
        save_ref(ref)
        ref_reloaded = load_ref(sample_path)
        if ref_reloaded is None:
            print("[FAIL] re-load après save_ref échoue")
            return 1
        if ref_reloaded.state != original_state:
            print(f"[FAIL] state perdu : {original_state!r} → {ref_reloaded.state!r}")
            return 1
        print(f"  state préservé : {original_state!r}")

        print()
        print("=== test_idempotence : OK ===")
        print(f"  - {n_refs1} refs synthétiques traitées en 2 runs consécutifs")
        print(f"  - run1 : 0 transitions planifiées")
        print(f"  - run2 : 0 transitions planifiées (idempotence)")
        print(f"  - save_ref préserve l'état au re-parse (post-write validation)")
        return 0


if __name__ == "__main__":
    sys.exit(main())
