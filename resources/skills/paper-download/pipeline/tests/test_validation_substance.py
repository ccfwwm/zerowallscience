"""Validation page 1 : le bon document, pas seulement du texte.

Deux familles de défauts rapportées depuis un corpus extérieur (issues #8 et
#9). Les fichiers d'épreuve sont de vrais PDF fabriqués pour l'occasion : le
contrôle interroge le fichier — nombre de pages, métadonnées — et ne peut donc
pas être vérifié sur des chaînes de caractères.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

PROJ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJ))
sys.path.insert(0, str(PROJ / "lib"))

from validate_pdf_content import (author_name_tokens,  # noqa: E402
                                  looks_like_about_the_work, pdf_info,
                                  validate_pdf_against_ref)

reportlab = pytest.importorskip("reportlab", reason="fabrique les PDF d'épreuve")


def fabriquer_pdf(chemin: Path, pages: list[str], titre: str = "",
                  auteur: str = "", sujet: str = "", lourd: bool = False) -> Path:
    """Écrit un vrai PDF : une page par entrée, avec ses métadonnées.

    `lourd` alourdit la page sans y ajouter de texte, comme le fait la
    numérisation d'une page de titre : c'est ce qui distingue un aperçu de
    librairie d'un fichier tronqué, que le seuil de taille attrape déjà.
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    c = canvas.Canvas(str(chemin), pagesize=A4, pageCompression=0)
    if titre:
        c.setTitle(titre)
    if auteur:
        c.setAuthor(auteur)
    if sujet:
        c.setSubject(sujet)
    for contenu in pages:
        y = 800
        for ligne in contenu.splitlines():
            c.drawString(50, y, ligne[:110])
            y -= 14
        if lourd:
            for i in range(4000):
                c.line(20 + (i % 500) * 0.1, 100, 20 + (i % 500) * 0.1, 101)
        c.showPage()
    c.save()
    return chemin


# ─── Issue #8 : le titre de civilité pris pour un nom ───────────────────────

@pytest.mark.parametrize("auteur,attendu", [
    ("Maître Eckhart", "Eckhart"),
    ("Meister Eckhart", "Eckhart"),
    ("Saint Augustin", "Augustin"),
    ("Sri Aurobindo", "Aurobindo"),
    ("Anonyme (Mahābhārata)", "Mahābhārata"),
    ("Anonymous (Beowulf)", "Beowulf"),
])
def test_le_nom_est_trouve_derriere_la_civilite(auteur, attendu):
    assert attendu in author_name_tokens(auteur)


def test_la_civilite_nest_jamais_le_nom_cherche():
    assert "Maître" not in author_name_tokens("Maître Eckhart")
    assert "Anonyme" not in author_name_tokens("Anonyme (Mahābhārata)")


def test_les_particules_ne_sont_pas_des_noms():
    jetons = author_name_tokens("de la Fontaine Jean")
    assert "Fontaine" in jetons and "de" not in jetons and "la" not in jetons


def test_champ_auteur_vide():
    assert author_name_tokens("") == []
    assert author_name_tokens(None) == []


def test_le_plus_discriminant_dabord():
    """Le mot le plus long porte le plus d'information."""
    assert author_name_tokens("Jan Van Der Waals")[0] == "Waals"


def test_sermons_deckhart_valide(tmp_path):
    """Le cas rapporté : le fichier est authentique, il était refusé."""
    pdf = fabriquer_pdf(
        tmp_path / "sermons.pdf",
        ["Sermons de Maitre Eckhart 1-90"]
        + [f"Sermon {i} — Intravit Jesus in templum. " * 12 for i in range(1, 40)],
        titre="Sermons de Maître Eckhart 1-90", auteur="Eckhart")
    ok, why = validate_pdf_against_ref(pdf, expected_author="Maître Eckhart",
                                       expected_title="Sermons")
    assert ok, why


def test_auteur_absent_du_texte_mais_present_dans_les_metadonnees(tmp_path):
    """Une édition ancienne dont la couverture est muette : les métadonnées
    nomment pourtant l'ouvrage et son auteur."""
    pdf = fabriquer_pdf(
        tmp_path / "meta.pdf",
        ["Les Sermons"] + [f"page {i} " + "texte courant. " * 30 for i in range(40)],
        titre="Sermons", auteur="Eckhart", sujet="Maitre Eckhart - Sermons")
    ok, why = validate_pdf_against_ref(pdf, expected_author="Maître Eckhart",
                                       expected_title="Sermons")
    assert ok, why


def test_auteur_introuvable_partout_refuse(tmp_path):
    pdf = fabriquer_pdf(
        tmp_path / "autre.pdf",
        [f"Un ouvrage sans rapport, page {i}. " + "prose quelconque. " * 25
         for i in range(40)],
        titre="Autre chose", auteur="Quelquun")
    ok, why = validate_pdf_against_ref(pdf, expected_author="Maître Eckhart",
                                       expected_title="Sermons")
    assert not ok
    assert "author_not_in_first_pages_or_metadata" in why


# ─── Issue #9 : ce qui parle de l'ouvrage n'est pas l'ouvrage ───────────────

def test_recension_de_treize_pages_refusee(tmp_path):
    """Le cas rapporté : une recension reproduit l'auteur et le titre en
    première page, et franchissait donc le garde anti-homonymie."""
    entete = ("Anthropology and Humanism Volume 39, Number 1\n"
              "Book Review\n"
              "La Chute du ciel, par Davi Kopenawa\n"
              "reviewed by J. A. Kelly\n")
    pdf = fabriquer_pdf(tmp_path / "recension.pdf",
                        [entete] + [f"suite de la recension, page {i}. " * 20
                                    for i in range(12)])
    ok, why = validate_pdf_against_ref(pdf, expected_author="Kopenawa Davi",
                                       expected_title="La Chute du ciel")
    assert not ok
    assert "pdf_is_a_review_of_the_work" in why


def test_apercu_dune_page_refuse(tmp_path):
    """110 Ko, une page : la page de titre d'un aperçu de librairie."""
    pdf = fabriquer_pdf(tmp_path / "apercu.pdf",
                        ["BLACK ELK SPEAKS\nJohn G. Neihardt\nUniversity Press"],
                        lourd=True)
    ok, why = validate_pdf_against_ref(pdf, expected_author="Black Elk",
                                       expected_title="Black Elk Speaks")
    assert not ok
    assert "pdf_is_a_cover_or_preview" in why


def test_ouvrage_complet_accepte(tmp_path):
    """Le contrôle ne doit pas refuser le vrai livre."""
    pdf = fabriquer_pdf(
        tmp_path / "livre.pdf",
        ["BLACK ELK SPEAKS\nJohn G. Neihardt"]
        + [f"Chapitre. page {i}. " + "récit continu et substantiel. " * 25
           for i in range(60)])
    ok, why = validate_pdf_against_ref(pdf, expected_author="Black Elk",
                                       expected_title="Black Elk Speaks",
                                       expect_book=True)
    assert ok, why
    assert "pages=61" in why, "le nombre de pages doit figurer au journal"


def test_ouvrage_declare_trop_court_refuse(tmp_path):
    pdf = fabriquer_pdf(
        tmp_path / "court.pdf",
        ["BLACK ELK SPEAKS\nJohn G. Neihardt"]
        + [f"page {i}. " + "un peu de texte. " * 25 for i in range(8)])
    ok, why = validate_pdf_against_ref(pdf, expected_author="Black Elk",
                                       expected_title="Black Elk Speaks",
                                       expect_book=True)
    assert not ok and "book_too_short" in why


def test_le_plancher_ne_sapplique_quaux_ouvrages_declares(tmp_path):
    """Un article court est légitime : le plancher le refuserait à tort."""
    pdf = fabriquer_pdf(
        tmp_path / "article.pdf",
        ["Beat stimulation and cognition\nJane Doe"]
        + [f"page {i}. " + "corps de l'article. " * 25 for i in range(6)])
    ok, why = validate_pdf_against_ref(pdf, expected_author="Doe Jane",
                                       expected_title="Beat stimulation and cognition")
    assert ok, why


def test_mention_de_recension_en_bibliographie_ne_compte_pas():
    """« book review » figure légitimement dans la bibliographie d'un livre :
    seul l'en-tête est regardé."""
    corps = "Chapitre premier. " * 100 + " book review of something"
    assert looks_like_about_the_work(corps, 400) is None


def test_recension_longue_dans_un_periodique(tmp_path):
    """Longue mais parue dans un périodique : c'est la recension."""
    texte = ("Journal of Anthropology Vol. 12, No. 3\nReviews of books\n"
             + "analyse critique. " * 200)
    assert "pdf_is_a_review_of_the_work" in looks_like_about_the_work(texte, 120)


def test_extrait_annonce_comme_tel():
    assert "pdf_is_a_sample_not_the_work" in \
        looks_like_about_the_work("Sample chapter from the forthcoming book", 20)


def test_plancher_configurable(tmp_path, monkeypatch):
    import importlib
    monkeypatch.setenv("RESEARCH_MIN_BOOK_PAGES", "5")
    import validate_pdf_content as v
    importlib.reload(v)
    try:
        pdf = fabriquer_pdf(
            tmp_path / "c.pdf",
            ["TITRE\nAuteur Nom"] + [f"page {i}. " + "texte. " * 30 for i in range(8)])
        ok, why = v.validate_pdf_against_ref(pdf, expected_author="Nom Auteur",
                                            expected_title="TITRE",
                                            expect_book=True)
        assert ok, why
    finally:
        monkeypatch.delenv("RESEARCH_MIN_BOOK_PAGES")
        importlib.reload(v)


# ─── Métadonnées du fichier ─────────────────────────────────────────────────

def test_metadonnees_lues(tmp_path):
    pdf = fabriquer_pdf(tmp_path / "m.pdf", ["a", "b", "c"],
                        titre="Un titre", auteur="Un auteur", sujet="Un sujet")
    info = pdf_info(pdf)
    assert info["pages"] == 3
    assert info["title"] == "Un titre" and info["author"] == "Un auteur"


def test_metadonnees_fichier_absent(tmp_path):
    assert pdf_info(tmp_path / "rien.pdf")["pages"] == 0
