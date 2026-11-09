"""Tests de la distinction échec passager / échec définitif (issue PR #3).

Un contingentement de miroir ou un circuit-breaker ouvert ne justifie aucune
décision humaine : la ref doit patienter (`retry_after`) et repartir seule.
Un 404, une page 1 refusée ou un fichier déjà rejeté justifient au contraire
le verrou curateur — les classer « passagers » ferait boucler la ref
indéfiniment sans jamais la présenter à l'arbitrage.
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

PROJ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJ))

from pipeline.registry import Ref  # noqa: E402
from pipeline.transitions import _backoff_stamp, _only_transient_failures  # noqa: E402


def _att(verdict: str, reason: str = "", source: str = "src") -> dict:
    return {"n": 1, "source": source, "verdict": verdict, "reason": reason,
            "at": "2026-08-23T10:00:00"}


def _ref(**fm) -> Ref:
    fm.setdefault("slug", "t_1999_test")
    fm.setdefault("state", "uid_resolved")
    return Ref(slug=fm["slug"], path=Path("/nonexistent/t_1999_test.md"),
               frontmatter=fm, body="\n")


# ─── Passagers ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("attempts", [
    [_att("skipped_breaker_open")],
    # `no_slot_delivered` / `all_mirrors_no_slot` sont des MOTIFS produits par
    # la source par navigateur, pas des verdicts : le verdict reste `failed`.
    [_att("failed", "no_slot_delivered")],
    [_att("failed", "all_mirrors_no_slot")],
    [_att("failed", "annas_waitlist_no_slot_free")],
    [_att("failed", "http_502_bad_gateway")],
    [_att("failed", "openalex_rate_limited")],
    [_att("failed", "read_timeout")],
    [_att("skipped_breaker_open"), _att("failed", "waitlist")],
])
def test_transient_only(attempts):
    assert _only_transient_failures(attempts) is True


# ─── Définitifs ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("attempts", [
    pytest.param([], id="aucune_tentative"),
    pytest.param([_att("success")], id="succes"),
    pytest.param([_att("failed", "no_doi")], id="404_pas_de_doi"),
    pytest.param([_att("page1_failed", "homonymie")], id="page1_refusee"),
    pytest.param([_att("no_source", "no_arxiv_id")], id="source_incompatible"),
    pytest.param([_att("skipped_already_tried")], id="deja_essayee"),
    pytest.param([_att("verdict_inedit")], id="verdict_inconnu"),
    pytest.param([_att("skipped_breaker_open"), _att("failed", "no_doi")],
                 id="melange"),
])
def test_definitive(attempts):
    assert _only_transient_failures(attempts) is False


def test_fichier_deja_refuse_reste_definitif():
    """La source re-livre le PDF déjà refusé en page 1 : attendre n'y change
    rien, seul le curateur peut trancher."""
    attempts = [_att("skipped_already_rejected", "sha256_already_in_rejected_list")]
    assert _only_transient_failures(attempts) is False


def test_taille_de_fichier_nest_pas_un_code_http():
    """`pdf_too_small [1502B]` contient « 502 » sans être une panne passagère."""
    assert _only_transient_failures([_att("failed", "pdf_too_small [1502B]")]) is False
    assert _only_transient_failures([_att("failed", "pdf_too_small [503B]")]) is False


def test_titre_contenant_rate_nest_pas_un_contingentement():
    """« Heart Rate Variability » contient « rate » sans être un quota."""
    attempts = [_att("failed",
                     "no_match_for_title Heart Rate Variability and Accurate Timing")]
    assert _only_transient_failures(attempts) is False


# ─── Recul progressif ───────────────────────────────────────────────────────

def test_backoff_progresse_et_plafonne():
    ref = _ref()
    delais = []
    for _ in range(8):
        stamp = _backoff_stamp(ref)
        due = datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ").replace(
            tzinfo=timezone.utc)
        delais.append(round((due - datetime.now(timezone.utc)) / timedelta(minutes=1)))
    assert delais[:5] == [15, 30, 60, 120, 240], delais
    assert all(d == 480 for d in delais[5:]), delais
    assert ref.frontmatter["transient_retries"] == 8


# ─── Le dispatcher respecte puis lève l'attente ─────────────────────────────

def _stamp(minutes: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).strftime(
        "%Y-%m-%dT%H:%M:%SZ")


def test_ref_en_attente_nest_pas_replanifiee():
    from pipeline.dispatcher import plan_for
    ref = _ref(uid="doi:10.1/x", retry_after=_stamp(30))
    assert plan_for(ref) is None


def test_attente_echue_replanifie_la_ref():
    from pipeline.dispatcher import plan_for
    ref = _ref(uid="doi:10.1/x", retry_after=_stamp(-1))
    plan = plan_for(ref)
    assert plan is not None and plan.fn_name == "uid_resolved_to_pdf_acquired"


def test_horodatage_illisible_ne_bloque_pas():
    from pipeline.dispatcher import plan_for
    ref = _ref(uid="doi:10.1/x", retry_after="pas-une-date")
    assert plan_for(ref) is not None
