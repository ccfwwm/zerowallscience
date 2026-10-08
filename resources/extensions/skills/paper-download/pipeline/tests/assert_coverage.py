"""assert_coverage.py — refuse exit 0 si une étape de cascade n'a pas son
tableau de ≥ 2 refs testées E2E (critère G4 du plan).

Lit `coverage_run_2026-05-24.md` (le rapport vivant rempli par le développeur
au fur et à mesure des tests E2E), vérifie que chaque fix F1-F2-F3-F4 a un
tableau G2 explicite avec ≥ 2 refs testées.

Lance avant tout message "livré" pour valider mécaniquement la couverture.

Exit codes :
  0 — toutes les couvertures OK
  1 — au moins une étape manque son tableau G2 ou a < 2 refs
  2 — fichier coverage_run introuvable ou illisible

Usage :
  python pipeline/tests/assert_coverage.py
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

COVERAGE_RUN = Path(__file__).parent / "coverage_run_2026-05-24.md"

EXPECTED_FIXES = ["F1", "F2", "F3", "F4"]
# I1-I15 = Couche 1, I16-I19 = Couche 5 (RTFM correlation)
EXPECTED_INVARIANTS = [f"I{n}" for n in range(1, 20)]
# S1-S6 = skills du plugin paper-trail (P2-P4 livrées 2026-05-25)
EXPECTED_SKILLS = ["S1", "S2", "S3", "S4", "S5", "S6"]
MIN_REFS_PER_FIX = 2
MIN_FIXTURES_PER_INVARIANT = 1  # 1 fixture par invariant (cf. plan §6.4)
MIN_PROOFS_PER_SKILL = 1  # au moins 1 preuve par skill (E2E ou structurelle)


def main() -> int:
    if not COVERAGE_RUN.exists():
        print(f"[FAIL] Fichier coverage_run introuvable : {COVERAGE_RUN}",
              file=sys.stderr)
        return 2

    text = COVERAGE_RUN.read_text(encoding="utf-8")

    # Pour chaque fix, on cherche le tableau G2 :
    #   F# — testé E2E sur : [slug1 (verdict), slug2 (verdict), …]
    #   F# — code écrit non testé E2E : [...]
    failures: list[str] = []
    for fix in EXPECTED_FIXES:
        # Match : ligne commençant par "F# — testé E2E sur"
        pattern = rf"{fix}\s*[—-]\s*testé E2E sur\s*:\s*\[(.*?)\]"
        m = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if not m:
            failures.append(f"{fix} — tableau G2 'testé E2E sur' absent")
            continue
        slugs_blob = m.group(1).strip()
        # Compter les refs : on attend des éléments séparés par ',' (slug + verdict)
        # On approxime par le nb d'occurrences de ' (' (chaque ref a un verdict en parens)
        n_refs = slugs_blob.count("(")
        if n_refs < MIN_REFS_PER_FIX:
            failures.append(
                f"{fix} — seulement {n_refs} ref(s) E2E testée(s), "
                f"requis ≥ {MIN_REFS_PER_FIX} : `{slugs_blob[:120]}`"
            )

    # Vérifier qu'on n'a pas oublié de mettre à jour la ligne "code écrit non
    # testé E2E" — accepter "(aucun)" ou variantes (pas obligatoire d'avoir
    # quelque chose, mais la ligne doit exister pour conscience G2).
    for fix in EXPECTED_FIXES:
        pattern = rf"{fix}\s*[—-]\s*code écrit non testé E2E\s*:"
        if not re.search(pattern, text, re.IGNORECASE):
            failures.append(f"{fix} — ligne 'code écrit non testé E2E' absente")

    # Section I1-I15 (Couche 1) : chaque invariant doit avoir un tableau
    # "testé synthétique sur" + "code écrit non testé E2E" pour la conscience G2.
    for inv in EXPECTED_INVARIANTS:
        # Pattern souple : "I3 — testé synthétique sur : [...]"
        pattern = rf"{inv}\b\s*[—-]\s*testé synthétique sur\s*:\s*\[(.*?)\]"
        m = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if not m:
            failures.append(
                f"{inv} — tableau G2 'testé synthétique sur' absent (Couche 1)"
            )
            continue
        slugs_blob = m.group(1).strip()
        n_refs = slugs_blob.count("(")
        if n_refs < MIN_FIXTURES_PER_INVARIANT:
            failures.append(
                f"{inv} — seulement {n_refs} fixture(s) testée(s), "
                f"requis ≥ {MIN_FIXTURES_PER_INVARIANT} : `{slugs_blob[:120]}`"
            )

    # Vérifier la ligne "code écrit non testé E2E" pour chaque invariant (conscience G2)
    for inv in EXPECTED_INVARIANTS:
        pattern = rf"{inv}\b\s*[—-]\s*code écrit non testé E2E\s*:"
        if not re.search(pattern, text, re.IGNORECASE):
            failures.append(f"{inv} — ligne 'code écrit non testé E2E' absente")

    # Section Skills (S1-S6) — preuves de test de chaque skill du plugin
    # Pattern : "S1 pdf-cascade — testé E2E sur : [...]"
    # (lazy match jusqu'au prochain tiret-em séparateur)
    for skill in EXPECTED_SKILLS:
        pattern = rf"{skill}\s+[a-z][^\n]*?—\s*testé E2E sur\s*:\s*\[(.*?)\]"
        m = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if not m:
            failures.append(
                f"{skill} — tableau 'testé E2E sur' absent (section Skills)"
            )
            continue
        proofs_blob = m.group(1).strip()
        n_proofs = proofs_blob.count("(")
        if n_proofs < MIN_PROOFS_PER_SKILL:
            failures.append(
                f"{skill} — seulement {n_proofs} preuve(s), "
                f"requis ≥ {MIN_PROOFS_PER_SKILL}"
            )

    # Vérifier la ligne "code écrit non testé E2E" pour chaque skill aussi
    for skill in EXPECTED_SKILLS:
        pattern = rf"{skill}\s+[a-z][^\n]*?—\s*code écrit non testé E2E\s*:"
        if not re.search(pattern, text, re.IGNORECASE):
            failures.append(f"{skill} — ligne 'code écrit non testé E2E' absente")

    if failures:
        print("=== assert_coverage : FAIL ===", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        print(f"\n{len(failures)} violation(s). Fichier : {COVERAGE_RUN}",
              file=sys.stderr)
        return 1

    print("=== assert_coverage : OK ===")
    for fix in EXPECTED_FIXES:
        pattern = rf"{fix}\s*[—-]\s*testé E2E sur\s*:\s*\[(.*?)\]"
        m = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if m:
            blob = m.group(1).strip()[:120]
            print(f"  {fix} : {blob}")
    print(f"  --- Couches 1+5 (I1-I19) : {len(EXPECTED_INVARIANTS)} invariants couverts ---")
    print(f"  --- Plugin skills (S1-S6) : {len(EXPECTED_SKILLS)} skills couverts ---")
    return 0


if __name__ == "__main__":
    sys.exit(main())
