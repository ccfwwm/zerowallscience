"""Ré-ingestion : une citation déjà au registre ne doit pas créer de doublon.

Le cas rapporté (issue #10) : un travail hebdomadaire ré-ingère les mêmes
citations. Celles dont l'année est inconnue ne se reconnaissaient jamais, si
bien qu'une fiche de plus naissait chaque semaine — `_2`, `_3`, `_4` — avec
pour conséquences le même fichier téléchargé deux fois, une file d'attente
manuelle qui gonfle, et un historique de tentatives éparpillé entre doublons.
"""
from __future__ import annotations

import importlib
import sys
from pathlib import Path

import pytest

PROJ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJ))


@pytest.fixture()
def ing(tmp_path, monkeypatch):
    """Module d'ingestion rechargé sur un coffre jetable."""
    monkeypatch.setenv("RESEARCH_VAULT_PATH", str(tmp_path))
    import pipeline.config
    importlib.reload(pipeline.config)
    import pipeline.ingest as module
    importlib.reload(module)
    module.REFS.mkdir(parents=True, exist_ok=True)
    # Le pré-filtrage documentaire n'est pas le sujet : on force le parcours
    # complet du registre.
    monkeypatch.setattr(module, "_rtfm_prefilter_registry_slugs",
                        lambda *a, **k: [])
    return module


def _citation(ing, **kw):
    champs = dict(author="Maître Eckhart", year="", title="Sermons",
                  raw="Eckhart, Sermons", confidence=0.9)
    champs.update(kw)
    return ing.ParsedCitation(**champs)


def _vider_cache(ing):
    """Le registre est mis en cache : une fiche créée doit être revue."""
    for nom in ("_REGISTRY_CACHE", "_registry_cache"):
        if hasattr(ing, nom):
            setattr(ing, nom, None)
    ing._get_registry_cached.cache_clear() if hasattr(
        ing._get_registry_cached, "cache_clear") else None


def test_citation_sans_annee_reconnue_a_la_reingestion(ing, tmp_path):
    """Le cœur de l'issue : trois ingestions, une seule fiche."""
    sota = tmp_path / "sota.md"
    slugs = []
    for _ in range(3):
        _vider_cache(ing)
        cit = _citation(ing)
        existant = ing._reconcile_with_registry(cit, None)
        slugs.append(existant or ing._create_ref(cit, None, sota))
    assert slugs[0] == slugs[1] == slugs[2], f"doublons créés : {slugs}"
    assert len(list(ing.REFS.glob("*.md"))) == 1


def test_aucun_suffixe_numerique_apparait(ing, tmp_path):
    sota = tmp_path / "sota.md"
    for _ in range(4):
        _vider_cache(ing)
        cit = _citation(ing)
        if not ing._reconcile_with_registry(cit, None):
            ing._create_ref(cit, None, sota)
    noms = sorted(p.stem for p in ing.REFS.glob("*.md"))
    assert not any(n.endswith(("_2", "_3", "_4")) for n in noms), noms


def test_annee_zero_et_annee_absente_sont_la_meme_chose(ing, tmp_path):
    """Le registre écrit `0000`, la citation rend une chaîne vide."""
    ing._create_ref(_citation(ing, year="0000"), None, tmp_path / "s.md")
    _vider_cache(ing)
    assert ing._reconcile_with_registry(_citation(ing, year=""), None) is not None


def test_deux_oeuvres_distinctes_du_meme_auteur_restent_distinctes(ing, tmp_path):
    """Sans année pour trancher, le titre doit être exigeant."""
    sota = tmp_path / "sota.md"
    ing._create_ref(_citation(ing, title="Sermons"), None, sota)
    _vider_cache(ing)
    autre = _citation(ing, title="Traité du détachement")
    assert ing._reconcile_with_registry(autre, None) is None


def test_les_annees_connues_departagent_toujours(ing, tmp_path):
    """Deux éditions datées d'un même titre restent deux références."""
    sota = tmp_path / "sota.md"
    ing._create_ref(_citation(ing, year="1932", title="Black Elk Speaks"),
                    None, sota)
    _vider_cache(ing)
    autre = _citation(ing, year="2014", title="Black Elk Speaks")
    assert ing._reconcile_with_registry(autre, None) is None


def test_une_citation_datee_rejoint_sa_fiche_sans_date(ing, tmp_path):
    """La date apparaît souvent après coup : la fiche ne doit pas se dédoubler."""
    ing._create_ref(_citation(ing, year=""), None, tmp_path / "s.md")
    _vider_cache(ing)
    assert ing._reconcile_with_registry(_citation(ing, year="1305"), None) is not None


def test_le_doi_reste_prioritaire(ing, tmp_path):
    """Le rapprochement par identifiant ne doit pas être affaibli."""
    slug = ing._create_ref(_citation(ing, year="2020", title="Une étude"),
                           "10.1/x", tmp_path / "s.md")
    _vider_cache(ing)
    autre = _citation(ing, year="1999", title="Titre sans rapport")
    assert ing._reconcile_with_registry(autre, "10.1/x") == slug
