"""Hygiène des métadonnées et des fiches — retour de terrain, septembre 2026.

Trois symptômes rapportés après quatre mois d'usage sur un corpus réel :
une fiche au YAML invalide disparaissait des passages sans un mot ; un titre
Crossref replié produisait un nom de fichier contenant un saut de ligne ;
l'écriture initiale d'une fiche ne vérifiait pas sa propre sortie.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

PROJ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJ))
sys.path.insert(0, str(PROJ / "lib"))

from metadata_clean import clean_metadata_text, safe_filename_fragment  # noqa: E402
from pipeline.registry import (load_ref_verbose,  # noqa: E402
                               parse_frontmatter_md_verbose)

# Le cas réel : Crossref rend le titre replié sur trois lignes, avec du JATS.
TITRE_CROSSREF = ("The Medicine Dance of the\n"
                  "                    <i>!</i>\n"
                  "                    Kung Bushmen")


# ─── Assainissement des titres ──────────────────────────────────────────────

def test_titre_replie_avec_balises_est_remis_a_plat():
    assert clean_metadata_text(TITRE_CROSSREF) == \
        "The Medicine Dance of the ! Kung Bushmen"


def test_nom_de_fichier_sans_saut_de_ligne():
    """Le filtre d'origine gardait les blancs — donc le saut de ligne."""
    nom = safe_filename_fragment(TITRE_CROSSREF)
    assert "\n" not in nom and "\r" not in nom
    assert nom == "The_Medicine_Dance_of_the_Kung_Bushmen"


@pytest.mark.parametrize("brut", [
    "Titre avec séparateur de ligne Unicode",
    "Titre\tavec tabulation",
    "Titre&amp;entité",
    "  espaces   multiples  ",
])
def test_aucun_blanc_exotique_ne_survit(brut):
    assert not any(c in safe_filename_fragment(brut) for c in "\n\r\t  ")
    assert "  " not in clean_metadata_text(brut)


def test_valeur_absente_ou_vide():
    assert clean_metadata_text(None) == ""
    assert safe_filename_fragment(None) == "untitled"
    assert safe_filename_fragment("!!!") == "untitled"


def test_le_nom_de_fichier_reste_lisible():
    """Accents conservés, ponctuation retirée, longueur bornée."""
    assert safe_filename_fragment("Rythme & Transe : étude") == "Rythme_Transe_étude"
    assert len(safe_filename_fragment("x" * 200)) == 50


def test_chemin_de_destination_assaini(monkeypatch, tmp_path):
    """Le défaut se manifestait ici : dans le nom du fichier écrit au coffre."""
    monkeypatch.setenv("RESEARCH_VAULT_PATH", str(tmp_path))
    from pipeline.cascade import _make_dest_path
    from pipeline.registry import Ref
    ref = Ref(slug="katz_1982_medicine", path=tmp_path / "r.md",
              frontmatter={"author": "Katz Richard", "year": "1982",
                           "title": TITRE_CROSSREF}, body="")
    nom = _make_dest_path(ref).name
    assert "\n" not in nom
    assert nom == "Katz_1982_The_Medicine_Dance_of_the_Kung_Bushmen.pdf"


# ─── Une fiche illisible doit être nommée, pas escamotée ────────────────────

@pytest.mark.parametrize("contenu,attendu", [
    ("state: candidate\n", "no frontmatter delimiter"),
    ("---\nstate: candidate\n", "unterminated frontmatter block"),
    # Le cas réel : deux-points non échappé dans un scalaire nu.
    ("---\nvenue: Psychiatry Research: Neuroimaging\n---\n", "invalid YAML"),
    # Élément de liste orphelin après une liste vide.
    ("---\nrejected_sha256: []\n- abc\n---\n", "invalid YAML"),
])
def test_raison_de_lecture_impossible(contenu, attendu):
    fm, why, _ = parse_frontmatter_md_verbose(contenu)
    assert fm is None
    assert attendu in why


def test_fiche_illisible_nommee_avec_son_slug(tmp_path):
    mauvaise = tmp_path / "bourguignon_1973_religion.md"
    mauvaise.write_text("---\nvenue: Psychiatry Research: Neuroimaging\n---\n",
                        encoding="utf-8")
    ref, why = load_ref_verbose(mauvaise)
    assert ref is None
    assert "invalid YAML" in why


def test_passage_signale_la_fiche_sautee(tmp_path, capsys):
    """La panne était silencieuse : la référence disparaissait des passages."""
    from pipeline.registry import iter_refs
    (tmp_path / "bonne.md").write_text("---\nstate: candidate\n---\n\n",
                                       encoding="utf-8")
    (tmp_path / "cassee.md").write_text("---\ntitle: A: B\n---\n\n",
                                        encoding="utf-8")
    slugs = [r.slug for r in iter_refs(tmp_path)]
    assert slugs == ["bonne"]
    err = capsys.readouterr().err
    assert "cassee" in err and "invalid YAML" in err


def test_fiche_valide_ne_dit_rien(tmp_path, capsys):
    (tmp_path / "ok.md").write_text("---\nstate: candidate\n---\n\n",
                                    encoding="utf-8")
    from pipeline.registry import iter_refs
    assert [r.slug for r in iter_refs(tmp_path)] == ["ok"]
    assert capsys.readouterr().err == ""


# ─── L'écriture initiale d'une fiche contrôle sa propre sortie ──────────────

def _ingest_sur_coffre(tmp_path, monkeypatch):
    """Recharge le module d'ingestion sur un coffre jetable."""
    import importlib
    monkeypatch.setenv("RESEARCH_VAULT_PATH", str(tmp_path))
    import pipeline.config
    importlib.reload(pipeline.config)
    import pipeline.ingest as ing
    importlib.reload(ing)
    ing.REFS.mkdir(parents=True, exist_ok=True)
    return ing


def _citation(ing, **kw):
    champs = dict(author="Bourguignon Erika", year="1973",
                  title="Religion, Altered States of Consciousness",
                  raw="Bourguignon 1973", confidence=0.9)
    champs.update(kw)
    return ing.ParsedCitation(**champs)


def test_titre_a_deux_points_ne_casse_pas_la_fiche(tmp_path, monkeypatch):
    """Le cas de terrain : « Quality of Life: A Randomized Clinical Trial »."""
    ing = _ingest_sur_coffre(tmp_path, monkeypatch)
    slug = ing._create_ref(
        _citation(ing, title="Effect of Yoga on Quality of Life: A Randomized "
                             "Clinical Trial"),
        None, tmp_path / "sota.md")
    ref, why = load_ref_verbose(ing.REFS / f"{slug}.md")
    assert ref is not None, why
    assert ref.frontmatter["title"].endswith("A Randomized Clinical Trial")


def test_chemin_de_sota_a_deux_points_ne_casse_pas_la_fiche(tmp_path, monkeypatch):
    """Un dossier nommé « Psychiatry Research: Neuroimaging » est licite."""
    ing = _ingest_sur_coffre(tmp_path, monkeypatch)
    sota = tmp_path / "Psychiatry Research: Neuroimaging" / "sota.md"
    sota.parent.mkdir(parents=True, exist_ok=True)
    slug = ing._create_ref(_citation(ing), None, sota)
    ref, why = load_ref_verbose(ing.REFS / f"{slug}.md")
    assert ref is not None, why


def test_apostrophe_dans_un_titre(tmp_path, monkeypatch):
    ing = _ingest_sur_coffre(tmp_path, monkeypatch)
    slug = ing._create_ref(
        _citation(ing, title="L'état de transe et l'écoute"), None,
        tmp_path / "sota.md")
    ref, why = load_ref_verbose(ing.REFS / f"{slug}.md")
    assert ref is not None, why
    assert ref.frontmatter["title"] == "L'état de transe et l'écoute"


def test_une_fiche_illisible_est_refusee_pas_ecrite(tmp_path, monkeypatch):
    """Dernier rempart : si le gabarit produit du YAML invalide, on refuse.

    C'est la seule écriture du registre qui ne passe pas par la sauvegarde
    ordinaire, laquelle relit toujours ce qu'elle vient d'écrire.
    """
    from pipeline.registry import RegistryWriteCorrupted
    ing = _ingest_sur_coffre(tmp_path, monkeypatch)
    monkeypatch.setattr(ing, "REF_TEMPLATE",
                        "---\nslug: {slug}\nbad: A: B\n---\n" + "{author}{year}"
                        "{title}{uid_line}{pdf_line}{pdf_history_line}"
                        "{created_at}{sota_relpath}{sota_relpath_q}"
                        "{confidence}{raw}")
    with pytest.raises(RegistryWriteCorrupted) as e:
        ing._create_ref(_citation(ing), None, tmp_path / "sota.md")
    assert "does not parse" in str(e.value)
    assert list(ing.REFS.glob("*.md")) == [], "aucun fichier ne doit rester"
