"""Réinjecte dans la cascade les refs en `state: blocked_human` (sans `:`).

Cible : refs legacy où `state == "blocked_human"` exact (sans suffixe), antérieures
à la formalisation `blocked_human:<categorie>`. Ces refs sont sorties du flux du
worker (l'invariant I1 les rejette ; le worker ne tente plus rien). Objectif :
les remettre en `state: candidate` pour qu'elles repassent par la cascade actuelle
(F1 bibkey, F3 archive.org, P5 reactivate-ocr, etc.) qui a évolué depuis le blocage.

Mutations appliquées (sur décision utilisateur) :
  - state                  → "candidate"
  - acquisition_attempts   → []   (reset complet — re-tente toutes les sources)
  - blocked_reason         → supprimé
  - blocked_since          → supprimé
  - state_history.append({state: "candidate", at: <ISO now>,
                          via: "reinject_legacy_blocked"})

Préserve le `body` et tous les autres champs (uid, pdf_path, cited_in, etc.).

Mode dry-run par défaut. `--apply` pour muter le registre.

Usage :
    python tools/reinject_legacy_blocked.py            # dry-run, liste les refs
    python tools/reinject_legacy_blocked.py --apply    # mute + save
"""
from __future__ import annotations
import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

# Permet de lancer le script depuis la racine du repo sans `python -m`
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.registry import iter_refs, save_ref


REINJECT_VIA = "reinject_legacy_blocked"


def is_legacy_blocked(state: str) -> bool:
    """True si state == 'blocked_human' exact (sans suffixe `:`)."""
    return state == "blocked_human"


def reinject(ref, now_iso: str) -> dict:
    """Mute le frontmatter en place. Retourne un récap de la mutation."""
    fm = ref.frontmatter
    prev = {
        "state": fm.get("state"),
        "had_blocked_reason": "blocked_reason" in fm,
        "had_blocked_since": "blocked_since" in fm,
        "n_attempts": len(fm.get("acquisition_attempts") or []),
    }

    fm["state"] = "candidate"
    fm["acquisition_attempts"] = []
    fm.pop("blocked_reason", None)
    fm.pop("blocked_since", None)

    history = fm.get("state_history") or []
    if not isinstance(history, list):
        history = []
    history.append({
        "state": "candidate",
        "at": now_iso,
        "via": REINJECT_VIA,
    })
    fm["state_history"] = history

    return prev


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--apply", action="store_true",
                   help="Apply the mutations (default: dry-run)")
    p.add_argument("--limit", type=int, default=0,
                   help="Cap on the number of refs processed (0 = no limit)")
    args = p.parse_args()

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    targets = []
    for ref in iter_refs():
        if is_legacy_blocked(ref.state):
            targets.append(ref)
        if args.limit and len(targets) >= args.limit:
            break

    print(f"# legacy_blocked reinjection — {len(targets)} target ref(s)")
    print(f"# Mode : {'APPLY (mutations)' if args.apply else 'DRY-RUN'}")
    print()

    n_with_reason = sum(1 for r in targets if "blocked_reason" in r.frontmatter)
    n_with_attempts = sum(1 for r in targets
                          if r.frontmatter.get("acquisition_attempts"))
    print(f"  - with blocked_reason: {n_with_reason}")
    print(f"  - with non-empty acquisition_attempts: {n_with_attempts}")
    print()

    if not targets:
        print("Nothing to do.")
        return 0

    print(f"{'slug':<55} {'reason?':<8} {'attempts':>9}")
    print("-" * 75)
    for ref in targets[:20]:
        has_reason = "yes" if "blocked_reason" in ref.frontmatter else "no"
        n_att = len(ref.frontmatter.get("acquisition_attempts") or [])
        print(f"{ref.slug[:55]:<55} {has_reason:<8} {n_att:>9}")
    if len(targets) > 20:
        print(f"… et {len(targets) - 20} autre(s)")
    print()

    if not args.apply:
        print("Dry-run finished. Re-run with --apply to mutate the registry.")
        return 0

    print("Applying mutations…")
    saved = 0
    failed = 0
    for ref in targets:
        try:
            reinject(ref, now_iso)
            save_ref(ref)
            saved += 1
        except Exception as e:
            failed += 1
            print(f"[FAIL] {ref.slug}: {type(e).__name__}: {e}",
                  file=sys.stderr)

    print()
    print(f"Summary: {saved} reinjected, {failed} failure(s)")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
