"""Reset complet du registre — toutes refs non-retracted reviennent à `candidate`.

Cas d'usage : repartir d'un état propre après accumulation de drift / état
hérité non-fiable. Préserve les 120 `retracted` (audit historique
d'hallucinations détectées) et garde tous les PDFs sur disque.

Mutations appliquées pour chaque ref dont `state != "retracted"` :
  - state              → "candidate"
  - acquisition_attempts → []   (cascade re-tente toutes les sources)
  - state_history      → [{state: candidate, at: <now>, via: "reset_<date>"}]
  - pdf_path           → null
  - pdf_sha256         → null
  - page1_validation_log → supprimé
  - blocked_reason     → supprimé
  - blocked_since      → supprimé
  - cited_in           → garde structure mais retire `verified_at` pour
                          que le curator revalide
  - legacy_state       → préserve l'ancien state pour audit
  - legacy_pdf_path    → préserve l'ancien chemin (le PDF est sur disque)

Préservés tels quels :
  - slug, uid, title, author, year, type
  - cited_in[] (sans les verified_at)
  - body markdown
  - tous les `.md` en état `retracted`

PDFs sur disque : non touchés. Ils deviennent orphelins par rapport au
registre — un outil futur `pdf-identifier` les ré-associera par
identification page 1.

Mode dry-run par défaut. `--apply` pour muter le registre.

Usage :
    python tools/reset_registry.py                # dry-run, liste les refs
    python tools/reset_registry.py --apply        # mute le registre
    python tools/reset_registry.py --apply --limit 10  # tester sur 10 refs
"""
from __future__ import annotations
import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

# Permet de lancer depuis la racine du repo sans `python -m`
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.registry import iter_refs, save_ref

RESET_DATE = datetime.now(timezone.utc).strftime("%Y-%m-%d")
RESET_VIA = f"reset_{RESET_DATE}"


def reset_one(ref) -> dict:
    """Mute le frontmatter en place. Retourne un récap de la mutation."""
    fm = ref.frontmatter
    prev = {
        "state": fm.get("state"),
        "had_pdf": bool(fm.get("pdf_path")),
        "had_attempts": bool(fm.get("acquisition_attempts")),
        "n_state_history": len(fm.get("state_history") or []),
        "n_cited_in": len(fm.get("cited_in") or []),
        "retracted_reason": fm.get("retracted_reason"),
    }

    # Archive l'ancien state et pdf_path dans des champs legacy_*
    if fm.get("state"):
        fm["legacy_state"] = fm["state"]
    if fm.get("pdf_path"):
        fm["legacy_pdf_path"] = fm["pdf_path"]
    # Archive retracted_reason (cas du remoulin des retracted) pour validation
    # comparative legacy vs nouveau process
    if fm.get("retracted_reason"):
        fm["legacy_retracted_reason"] = fm.pop("retracted_reason")
    if fm.get("retracted_at"):
        fm["legacy_retracted_at"] = fm.pop("retracted_at")

    # Reset state + tout le travail accumulé
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    fm["state"] = "candidate"
    fm["acquisition_attempts"] = []
    fm["state_history"] = [{
        "state": "candidate",
        "at": now_iso,
        "via": RESET_VIA,
    }]
    fm.pop("pdf_path", None)
    fm.pop("pdf_sha256", None)
    fm.pop("page1_validation_log", None)
    fm.pop("blocked_reason", None)
    fm.pop("blocked_since", None)
    fm.pop("blocked_by", None)
    fm.pop("ocr_pending_since", None)
    fm.pop("last_rtfm_check_at", None)
    fm.pop("doctor_flags", None)

    # Retirer les `verified_at` des cited_in (curator revalidera)
    cited_in = fm.get("cited_in") or []
    if isinstance(cited_in, list):
        for c in cited_in:
            if isinstance(c, dict):
                c.pop("verified_at", None)

    return prev


def main() -> int:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--apply", action="store_true",
                   help="Apply the mutations (default: dry-run)")
    p.add_argument("--limit", type=int, default=0,
                   help="Cap on the number of refs processed (0 = no limit)")
    p.add_argument("--include-retracted", action="store_true",
                   help="Include `retracted` refs (archives retracted_reason "
                        "as legacy_retracted_reason, sets state=candidate)")
    p.add_argument("--only-retracted", action="store_true",
                   help="Process ONLY `retracted` refs (implies "
                        "--include-retracted, excludes the rest)")
    args = p.parse_args()

    # Inventaire des refs
    targets = []
    retracted_count = 0
    other_count = 0
    for ref in iter_refs():
        is_retracted = (ref.state == "retracted")
        if is_retracted:
            retracted_count += 1
            if not (args.include_retracted or args.only_retracted):
                continue
        else:
            other_count += 1
            if args.only_retracted:
                continue
        targets.append(ref)
        if args.limit and len(targets) >= args.limit:
            break

    print(f"# Registry reset — {len(targets)} ref(s) to reset")
    print(f"# Mode : {'APPLY (mutations)' if args.apply else 'DRY-RUN'}")
    print()
    print(f"  - Total refs scanned: {retracted_count + other_count}")
    if args.only_retracted:
        print(f"  - Mode --only-retracted: retracted only ({len(targets)})")
    elif args.include_retracted:
        print(f"  - To reset (all): {len(targets)} "
              f"(dont {retracted_count} retracted + {other_count} autres)")
    else:
        print(f"  - To reset (non-retracted): {len(targets)}")
        print(f"  - Preserved (retracted): {retracted_count}")
    print()

    # Distribution des états actuels (pour info)
    from collections import Counter
    state_counts = Counter(r.state for r in targets)
    print("Distribution of states to reset:")
    for state, n in state_counts.most_common():
        print(f"  {state:<40} {n:>4}")
    print()

    # Échantillon avec impact
    print(f"{'slug':<55} {'state actuel':<25} {'pdf?':<6} {'cited?'}")
    print("-" * 95)
    for ref in targets[:20]:
        has_pdf = "yes" if ref.frontmatter.get("pdf_path") else "no"
        n_cit = len(ref.frontmatter.get("cited_in") or [])
        print(f"{ref.slug[:55]:<55} {ref.state[:25]:<25} {has_pdf:<6} {n_cit}")
    if len(targets) > 20:
        print(f"… et {len(targets) - 20} autre(s)")
    print()

    if not args.apply:
        print("Dry-run finished. Re-run with --apply to reset the registry.")
        print("⚠️  Avant --apply : snapshot tar OBLIGATOIRE du _registry/refs/.")
        return 0

    print("Applying resets…")
    saved = 0
    failed = 0
    for ref in targets:
        try:
            reset_one(ref)
            save_ref(ref)
            saved += 1
        except Exception as e:
            failed += 1
            print(f"[FAIL] {ref.slug}: {type(e).__name__}: {e}",
                  file=sys.stderr)

    print()
    print(f"Summary: {saved} reset, {failed} failure(s)")
    print(f"Retracted refs preserved: {retracted_count}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
