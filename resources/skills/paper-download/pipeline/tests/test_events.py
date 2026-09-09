"""Tests pour `pipeline.events` — Couche 3 (plan-design §4).

Tests sur fixtures SYNTHÉTIQUES (mini-dossier _journal/ + 2-3 refs
fabriquées avec cited_in). Aucune mutation du registre réel.

Cas couverts :
  - --since filtre par date
  - --to filtre par état cible
  - --cited-in filtre par intersection refs citées
  - combinaison --cited-in X --to Y = intersection correcte
  - --json parseable
  - cas Arnold 1982 (plan §4.3) : ref qui transitionne uid → pdf → page1,
    citée par SOTA_Bernard_Bel_Temperaments_Intonation
"""
from __future__ import annotations
import json
import sys
import tempfile
from datetime import date
from pathlib import Path

import pytest

PROJ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJ))

from pipeline import events as events_mod  # noqa: E402


# ─── Fixtures ───────────────────────────────────────────────────────────────

JOURNAL_LINES_2026_05_23 = [
    {"ts": "2026-05-23T10:00:00Z", "ref": "old_ref_1", "from": "candidate",
     "to": "uid_resolved", "via": "crossref"},
    {"ts": "2026-05-23T11:00:00Z", "ref": "other_ref", "from": "candidate",
     "to": None, "via": "blocked", "meta": {"reason": "no_uid"}},
]

JOURNAL_LINES_2026_05_24 = [
    # Arnold 1982 — scénario plan §4.3
    {"ts": "2026-05-24T15:30:00Z", "ref": "arnold_1982_mathematical_model_shruti",
     "from": "candidate", "to": "uid_resolved", "via": "bibkey_fallback"},
    {"ts": "2026-05-24T15:32:04Z", "ref": "arnold_1982_mathematical_model_shruti",
     "from": "uid_resolved", "to": "pdf_acquired", "via": "archive_org"},
    {"ts": "2026-05-24T15:32:11Z", "ref": "arnold_1982_mathematical_model_shruti",
     "from": "pdf_acquired", "to": "page1_validated", "via": "probe_ok_validate_passed"},
    # Une autre ref citée par un autre SOTA, transitions vers page1_validated.
    {"ts": "2026-05-24T16:00:00Z", "ref": "lerdahl_2001_biblio_mir",
     "from": "pdf_acquired", "to": "page1_validated", "via": "probe_ok"},
    # Une ref non citée par notre SOTA, transitions vers page1_validated aussi.
    {"ts": "2026-05-24T16:10:00Z", "ref": "stranger_ref",
     "from": "pdf_acquired", "to": "page1_validated", "via": "probe_ok"},
    # Un blocked
    {"ts": "2026-05-24T16:20:00Z", "ref": "arnold_1982_mathematical_model_shruti",
     "from": "page1_validated", "to": None, "via": "blocked",
     "meta": {"reason": "post_validation_noop"}},
]


def _write_journal(journal_dir: Path) -> None:
    journal_dir.mkdir(parents=True, exist_ok=True)
    (journal_dir / "2026-05-23.jsonl").write_text(
        "\n".join(json.dumps(e) for e in JOURNAL_LINES_2026_05_23) + "\n",
        encoding="utf-8",
    )
    (journal_dir / "2026-05-24.jsonl").write_text(
        "\n".join(json.dumps(e) for e in JOURNAL_LINES_2026_05_24) + "\n",
        encoding="utf-8",
    )
    # Ligne vide + ligne corrompue pour stress le parser (doivent être skippées).
    with (journal_dir / "2026-05-24.jsonl").open("a", encoding="utf-8") as f:
        f.write("\n")
        f.write("{not valid json\n")


def _write_refs(refs_dir: Path) -> None:
    refs_dir.mkdir(parents=True, exist_ok=True)

    arnold = """---
slug: arnold_1982_mathematical_model_shruti
state: page1_validated
cited_in:
- name: SOTA_Bernard_Bel_Temperaments_Intonation
  section: refs_principales
  type: sota
---
body Arnold
"""
    (refs_dir / "arnold_1982_mathematical_model_shruti.md").write_text(
        arnold, encoding="utf-8",
    )

    lerdahl = """---
slug: lerdahl_2001_biblio_mir
state: page1_validated
cited_in:
- name: SOTA_Lerdahl_TPS_Topology
  section: refs_principales
  type: sota
---
body Lerdahl
"""
    (refs_dir / "lerdahl_2001_biblio_mir.md").write_text(
        lerdahl, encoding="utf-8",
    )

    stranger = """---
slug: stranger_ref
state: page1_validated
cited_in: []
---
body stranger
"""
    (refs_dir / "stranger_ref.md").write_text(stranger, encoding="utf-8")


# ─── Fixtures pytest ────────────────────────────────────────────────────────

@pytest.fixture()
def journal_dir(tmp_path: Path) -> Path:
    d = tmp_path / "_journal"
    _write_journal(d)
    return d


@pytest.fixture()
def refs_dir(tmp_path: Path) -> Path:
    d = tmp_path / "refs"
    _write_refs(d)
    return d


# ─── Tests ──────────────────────────────────────────────────────────────────

def test_since_filter(journal_dir: Path) -> None:
    """--since 2026-05-24 doit exclure les events du 23."""
    evs = list(events_mod.iter_events(
        journal_dir=journal_dir, since=date(2026, 5, 24),
    ))
    refs = {e["ref"] for e in evs}
    assert "old_ref_1" not in refs, f"old_ref_1 (23) ne doit pas apparaître : {refs}"
    assert "other_ref" not in refs
    assert "arnold_1982_mathematical_model_shruti" in refs
    # Aucun event avec ts < 2026-05-24
    for e in evs:
        ts = e["ts"]
        assert ts >= "2026-05-24", f"event antérieur {ts} non filtré"
    print(f"  test_since_filter OK ({len(evs)} events ≥ 2026-05-24)")


def test_to_state_filter(journal_dir: Path, refs_dir: Path) -> None:
    """--to page1_validated doit ne garder que les transitions vers cet état.

    Le journal contient 3 events to=page1_validated (arnold, lerdahl, stranger).
    """
    raw = list(events_mod.iter_events(journal_dir=journal_dir))
    out = events_mod.filter_events(raw, to_state="page1_validated",
                                   refs_dir=refs_dir)
    refs = sorted({e["ref"] for e in out})
    expected_refs = sorted([
        "arnold_1982_mathematical_model_shruti",
        "lerdahl_2001_biblio_mir",
        "stranger_ref",
    ])
    assert refs == expected_refs, f"attendu {expected_refs}, eu {refs}"
    # Aucun event ne doit avoir to != page1_validated
    for e in out:
        assert e.get("to") == "page1_validated", e
    print(f"  test_to_state_filter OK ({len(out)} page1_validated)")


def test_cited_in_filter(journal_dir: Path, refs_dir: Path) -> None:
    """--cited-in SOTA_Bernard_Bel_Temperaments_Intonation → seul arnold_1982."""
    raw = list(events_mod.iter_events(journal_dir=journal_dir))
    out = events_mod.filter_events(
        raw,
        cited_in="SOTA_Bernard_Bel_Temperaments_Intonation",
        refs_dir=refs_dir,
    )
    refs = {e["ref"] for e in out}
    assert refs == {"arnold_1982_mathematical_model_shruti"}, (
        f"attendu seulement arnold_1982, eu {refs}"
    )
    print(f"  test_cited_in_filter OK ({len(out)} events sur arnold_1982)")


def test_combined_to_and_cited_in(journal_dir: Path, refs_dir: Path) -> None:
    """Cas Arnold 1982 : --to page1_validated --cited-in SOTA_Bernard_Bel_X
    doit retourner exactement la transition pdf_acquired → page1_validated."""
    raw = list(events_mod.iter_events(journal_dir=journal_dir))
    out = events_mod.filter_events(
        raw,
        to_state="page1_validated",
        cited_in="SOTA_Bernard_Bel_Temperaments_Intonation",
        refs_dir=refs_dir,
    )
    assert len(out) == 1, f"attendu 1 event, eu {len(out)} : {out}"
    ev = out[0]
    assert ev["ref"] == "arnold_1982_mathematical_model_shruti"
    assert ev["to"] == "page1_validated"
    assert ev["from"] == "pdf_acquired"
    assert ev["via"] == "probe_ok_validate_passed"
    print(f"  test_combined_to_and_cited_in OK (Arnold 1982 trouvé)")


def test_json_parseable(journal_dir: Path, refs_dir: Path) -> None:
    """La sortie JSON via filter_events doit être sérialisable + parseable."""
    raw = list(events_mod.iter_events(
        journal_dir=journal_dir, since=date(2026, 5, 24),
    ))
    out = events_mod.filter_events(
        raw, to_state="page1_validated", refs_dir=refs_dir,
    )
    s = json.dumps(out)
    parsed = json.loads(s)
    assert isinstance(parsed, list)
    assert all("ref" in e and "ts" in e for e in parsed)
    print(f"  test_json_parseable OK ({len(parsed)} events round-trip JSON)")


def test_arnold_scenario_e2e(journal_dir: Path, refs_dir: Path) -> None:
    """Scénario complet plan §4.3 : 3 transitions Arnold 1982 dans le journal,
    le filtre par SOTA citant retourne les 3."""
    raw = list(events_mod.iter_events(
        journal_dir=journal_dir, since=date(2026, 5, 24),
    ))
    out = events_mod.filter_events(
        raw,
        cited_in="SOTA_Bernard_Bel_Temperaments_Intonation",
        refs_dir=refs_dir,
    )
    # Arnold a 4 events le 24 (3 transitions + 1 blocked)
    assert len(out) == 4, f"attendu 4 events Arnold, eu {len(out)}"
    transitions = [(e["from"], e["to"]) for e in out if e["to"] is not None]
    assert ("candidate", "uid_resolved") in transitions
    assert ("uid_resolved", "pdf_acquired") in transitions
    assert ("pdf_acquired", "page1_validated") in transitions
    print(f"  test_arnold_scenario_e2e OK (3 transitions + 1 blocked)")


def test_malformed_lines_skipped(journal_dir: Path) -> None:
    """Les lignes vides ou JSON cassé ne crashent pas le parser."""
    evs = list(events_mod.iter_events(journal_dir=journal_dir))
    # Si on arrive ici, c'est qu'aucune exception n'a été levée. On vérifie
    # juste que les events valides sont bien là (8 valides : 2 du 23 + 6 du 24).
    assert len(evs) == 8, f"attendu 8 events valides, eu {len(evs)}"
    print(f"  test_malformed_lines_skipped OK ({len(evs)} events valides)")


# ─── Runner ─────────────────────────────────────────────────────────────────

def main() -> int:
    with tempfile.TemporaryDirectory(prefix="events_test_") as td:
        root = Path(td)
        journal_dir = root / "_journal"
        refs_dir = root / "refs"
        _write_journal(journal_dir)
        _write_refs(refs_dir)

        print("# test_events.py")
        print()
        print("Setup :")
        print(f"  journal_dir = {journal_dir}")
        print(f"  refs_dir    = {refs_dir}")
        print(f"  files       = {[p.name for p in journal_dir.glob('*.jsonl')]}")
        print()
        print("Tests :")

        tests = [
            ("test_since_filter", lambda: test_since_filter(journal_dir)),
            ("test_to_state_filter",
             lambda: test_to_state_filter(journal_dir, refs_dir)),
            ("test_cited_in_filter",
             lambda: test_cited_in_filter(journal_dir, refs_dir)),
            ("test_combined_to_and_cited_in",
             lambda: test_combined_to_and_cited_in(journal_dir, refs_dir)),
            ("test_json_parseable",
             lambda: test_json_parseable(journal_dir, refs_dir)),
            ("test_arnold_scenario_e2e",
             lambda: test_arnold_scenario_e2e(journal_dir, refs_dir)),
            ("test_malformed_lines_skipped",
             lambda: test_malformed_lines_skipped(journal_dir)),
        ]
        failed = 0
        for name, fn in tests:
            try:
                fn()
            except AssertionError as e:
                print(f"  [FAIL] {name} : {e}")
                failed += 1
            except Exception as e:
                print(f"  [CRASH] {name} : {type(e).__name__}: {e}")
                failed += 1

        print()
        print(f"Récap : {len(tests) - failed}/{len(tests)} OK")
        return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
