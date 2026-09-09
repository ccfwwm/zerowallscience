"""Re-associe les PDFs sur disque aux refs candidates via le champ
`legacy_pdf_path` archivé lors du reset.

Workflow Tier 1 (rapide) :
  - Pour chaque ref `candidate` avec `legacy_pdf_path` :
    - Vérifie que le fichier existe sur disque (`SOURCES / legacy_pdf_path`)
    - Valide page 1 anti-homonymie (`validate_pdf_against_ref`)
    - Si OK : set `pdf_path`, recompute `pdf_sha256`, state →
      `page1_validated` (ou `pdf_acquired` si pas extractible)
    - Si KO : laisse en `candidate`, log la raison

Workflow Tier 2 (TODO) : pour les PDFs orphelins sur disque sans match
via `legacy_pdf_path`, scan page 1 et matche contre les refs candidates
restantes par (auteur, année, similarité titre).

Mode dry-run par défaut. `--apply` pour muter.

Usage :
    python tools/identify_pdfs.py             # dry-run, liste les matches
    python tools/identify_pdfs.py --apply     # mute les refs candidates
    python tools/identify_pdfs.py --limit 10  # tester sur 10 refs
"""
from __future__ import annotations
import argparse
import hashlib
import sys
from pathlib import Path

# Permet lancement depuis racine repo sans `python -m`
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.registry import iter_refs, save_ref
from pipeline.config import SOURCES, LIB_PATH

# Helper page 1 validation
sys.path.insert(0, str(LIB_PATH))
from validate_pdf_content import validate_pdf_against_ref, probe_pdf_health


def identify_one(ref) -> dict:
    """Tente d'identifier le PDF d'une ref via son legacy_pdf_path.

    Retourne dict avec verdict :
      - "no_legacy"     : pas de legacy_pdf_path archivé
      - "file_missing"  : legacy_pdf_path existe mais fichier absent
      - "scan_needs_ocr" : PDF est un scan, sera mis en pdf_acquired
      - "page1_failed"  : validation page 1 KO
      - "validated"     : OK, re-associé en page1_validated
    """
    legacy_pp = ref.frontmatter.get("legacy_pdf_path")
    if not legacy_pp:
        return {"verdict": "no_legacy", "ref": ref.slug}

    pdf_abs = SOURCES / legacy_pp
    if not pdf_abs.exists():
        return {"verdict": "file_missing", "ref": ref.slug,
                "legacy_pdf_path": legacy_pp}

    expected_author = (ref.frontmatter.get("author") or "").strip()
    expected_title = (ref.frontmatter.get("title") or "").strip()
    expected_year = str(ref.frontmatter.get("year") or "").strip()

    is_valid, reason = validate_pdf_against_ref(
        pdf_abs,
        expected_author=expected_author,
        expected_title=expected_title,
        expected_year=expected_year,
        required_title_match=0.3,
    )

    if is_valid:
        verdict = "validated"
    elif "scan_needs_ocr" in reason or "no_text_layer" in reason:
        verdict = "scan_needs_ocr"
    else:
        verdict = "page1_failed"

    return {
        "verdict": verdict,
        "ref": ref.slug,
        "legacy_pdf_path": legacy_pp,
        "pdf_abs": str(pdf_abs),
        "reason": reason,
    }


def apply_identification(ref, identification: dict) -> None:
    """Applique l'identification au frontmatter de la ref."""
    fm = ref.frontmatter
    legacy_pp = identification["legacy_pdf_path"]
    pdf_abs = Path(identification["pdf_abs"])

    # Recompute sha256
    sha = hashlib.sha256(pdf_abs.read_bytes()).hexdigest()

    fm["pdf_path"] = legacy_pp
    fm["pdf_sha256"] = sha

    if identification["verdict"] == "validated":
        fm["state"] = "page1_validated"
    elif identification["verdict"] == "scan_needs_ocr":
        fm["state"] = "awaiting_rtfm_ocr"
        from datetime import datetime, timezone
        fm["ocr_pending_since"] = datetime.now(timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )

    # Append state_history entry
    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    fm.setdefault("state_history", []).append({
        "state": fm["state"],
        "at": now_iso,
        "via": "identify_pdfs_tier1",
    })


def main() -> int:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--apply", action="store_true",
                   help="Apply the mutations (default: dry-run)")
    p.add_argument("--limit", type=int, default=0,
                   help="Cap on the number of candidate refs processed")
    p.add_argument("--verbose", "-v", action="store_true",
                   help="Print per-ref details")
    args = p.parse_args()

    candidates = [r for r in iter_refs() if r.state == "candidate"]
    if args.limit:
        candidates = candidates[:args.limit]

    print(f"# pdf-identifier Tier 1 — {len(candidates)} ref(s) candidate")
    print(f"# Mode : {'APPLY (mutations)' if args.apply else 'DRY-RUN'}")
    print()

    counts = {"validated": 0, "scan_needs_ocr": 0, "page1_failed": 0,
              "file_missing": 0, "no_legacy": 0}
    failed_details = []

    for ref in candidates:
        ident = identify_one(ref)
        verdict = ident["verdict"]
        counts[verdict] += 1
        if verdict in ("page1_failed", "file_missing") and args.verbose:
            failed_details.append(f"  [{verdict}] {ref.slug}: "
                                  f"{ident.get('reason', 'n/a')}")
        if args.apply and verdict in ("validated", "scan_needs_ocr"):
            try:
                apply_identification(ref, ident)
                save_ref(ref)
            except Exception as e:
                print(f"[FAIL] {ref.slug}: {type(e).__name__}: {e}",
                      file=sys.stderr)

    print("Summary:")
    for v, n in counts.items():
        print(f"  {v:<25} {n:>4}")
    print()

    if failed_details:
        print("Failure sample:")
        for line in failed_details[:20]:
            print(line)
        if len(failed_details) > 20:
            print(f"  … et {len(failed_details) - 20} autre(s)")
        print()

    if not args.apply:
        n_actionable = counts["validated"] + counts["scan_needs_ocr"]
        print(f"Dry-run finished. {n_actionable} ref(s) re-associable "
              f"via --apply.")
    else:
        n_done = counts["validated"] + counts["scan_needs_ocr"]
        print(f"Application finished: {n_done} ref(s) re-associated.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
