"""Voies d'acquisition ajoutées après le retour de terrain de septembre 2026.

Le corpus de terrain montrait que la cascade échouait là où un humain
réussissait en trois clics : ouvrir l'article chez son éditeur, chercher le
dépôt d'auteur, passer par un fonds sans file d'attente. Ces tests fixent le
comportement de chacune de ces voies sans toucher au réseau.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

PROJ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJ))

from lib.acquire import publisher, researchgate  # noqa: E402
from lib.shadow import libgen  # noqa: E402

PDF = b"%PDF-1.4" + b" corps" * 700          # au-dessus du seuil de taille


def _ref(**fm):
    from pipeline.registry import Ref
    base = {"slug": "x_2020_y", "state": "uid_resolved", "title": "A Study",
            "author": "Doe Jane"}
    base.update(fm)
    return Ref(slug="x_2020_y", path=Path("/nonexistent/x.md"),
               frontmatter=base, body="\n")


# ─── L'éditeur, suivi depuis l'identifiant ──────────────────────────────────

def test_lien_declare_par_lediteur_passe_en_premier():
    """`citation_pdf_url` est la déclaration normalisée : elle prime."""
    html = ('<a href="/autre.pdf">x</a>'
            '<meta name="citation_pdf_url" content="/vrai.pdf">')
    assert publisher.pdf_links_in_html(html, "https://ed.org/a/1")[0] == \
        "https://ed.org/vrai.pdf"


def test_liens_relatifs_rendus_absolus_et_dedupliques():
    html = '<a href="/f.pdf">a</a><a href="https://ed.org/f.pdf">b</a>'
    assert publisher.pdf_links_in_html(html, "https://ed.org/a/1") == \
        ["https://ed.org/f.pdf"]


def test_page_sans_lien_de_fichier():
    assert publisher.pdf_links_in_html("<p>résumé seul</p>", "https://ed.org/") == []


def test_sans_identifiant_la_voie_se_recuse():
    verdict, info = publisher.try_publisher_doi(_ref(uid=""))
    assert verdict == "no_source" and info["reason"] == "no_doi"


def _monter_editeur(monkeypatch, pages: dict):
    """Remplace l'accès réseau par une table adresse → contenu."""
    import pipeline.cascade as c
    monkeypatch.setattr(c, "_http_get",
                        lambda url, **k: pages.get(url))
    monkeypatch.setattr(c, "_save_and_validate",
                        lambda data, ref: ("success", {"pdf_path": "p.pdf"}))


def test_fichier_servi_directement(monkeypatch):
    _monter_editeur(monkeypatch, {"https://doi.org/10.1/x": PDF})
    verdict, info = publisher.try_publisher_doi(_ref(uid="doi:10.1/x"))
    assert verdict == "success" and info["via"] == "publisher_doi"


def test_page_puis_fichier_declare(monkeypatch):
    _monter_editeur(monkeypatch, {
        "https://doi.org/10.1/x":
            b'<html><meta name="citation_pdf_url" content="https://ed.org/f.pdf"></html>',
        "https://ed.org/f.pdf": PDF,
    })
    verdict, info = publisher.try_publisher_doi(_ref(uid="doi:10.1/x"))
    assert verdict == "success"
    assert "https://ed.org/f.pdf" in info["chain"]


def test_lecteur_integre_suivi_dun_cran(monkeypatch):
    """Certaines plateformes intercalent un lecteur entre la page et le fichier."""
    _monter_editeur(monkeypatch, {
        "https://doi.org/10.1/x": b'<html><a href="https://ed.org/pdf/1">lire</a></html>',
        "https://ed.org/pdf/1": b'<html><iframe src="https://cdn.org/f.pdf"></iframe></html>',
        "https://cdn.org/f.pdf": PDF,
    })
    assert publisher.try_publisher_doi(_ref(uid="doi:10.1/x"))[0] == "success"


def test_editeur_injoignable(monkeypatch):
    _monter_editeur(monkeypatch, {})
    verdict, info = publisher.try_publisher_doi(_ref(uid="doi:10.1/x"))
    assert verdict == "failed" and info["reason"] == "publisher_unreachable"


def test_page_sans_fichier_accessible(monkeypatch):
    _monter_editeur(monkeypatch, {
        "https://doi.org/10.1/x": b"<html><p>payant</p></html>"})
    verdict, info = publisher.try_publisher_doi(_ref(uid="doi:10.1/x"))
    assert verdict == "failed"
    assert info["reason"] == "no_reachable_pdf_on_publisher_page"


# ─── Library Genesis ────────────────────────────────────────────────────────

def test_miroirs_surchargeables(monkeypatch):
    monkeypatch.setenv("RESEARCH_LIBGEN_MIRRORS", "https://a.org, https://b.org/")
    assert libgen.get_mirrors() == ["https://a.org", "https://b.org"]


def test_notice_unique_retenue():
    assert libgen._pick_edition('<a href="edition.php?id=1">', "10.1/x") == \
        "edition.php?id=1"


def test_notice_choisie_apres_la_derniere_mention():
    """La première occurrence de l'identifiant est le champ de recherche."""
    html = ('champ 10.1/x <a href="edition.php?id=9">a</a>'
            ' 10.1/x <a href="edition.php?id=7">b</a>')
    assert libgen._pick_edition(html, "10.1/x") == "edition.php?id=7"


def test_absent_du_fonds_arrete_tous_les_miroirs(monkeypatch):
    """Le fonds est le même partout : inutile d'interroger chaque miroir."""
    monkeypatch.setenv("RESEARCH_LIBGEN_MIRRORS", "https://a.org,https://b.org")
    vus = []

    def faux(sess, base, doi):
        vus.append(base)
        return None, "not_in_libgen"

    monkeypatch.setattr(libgen, "_fetch_from_mirror", faux)
    monkeypatch.setattr(libgen, "_session", lambda: object())
    verdict, info = libgen.try_libgen(_ref(uid="doi:10.1/x"))
    assert verdict == "no_source" and info["reason"] == "not_in_libgen"
    assert vus == ["https://a.org"], "un seul miroir doit être interrogé"


def test_miroir_en_panne_puis_miroir_vivant(monkeypatch):
    monkeypatch.setenv("RESEARCH_LIBGEN_MIRRORS", "https://mort.org,https://vif.org")
    monkeypatch.setattr(libgen, "_session", lambda: object())
    monkeypatch.setattr(libgen, "_fetch_from_mirror",
                        lambda s, base, doi: (PDF, "ok") if "vif" in base
                        else (None, "search_http_502"))
    import pipeline.cascade as c
    monkeypatch.setattr(c, "_save_and_validate", lambda d, r: ("success", {}))
    verdict, info = libgen.try_libgen(_ref(uid="doi:10.1/x"))
    assert verdict == "success" and info["via"] == "libgen@https://vif.org"


def test_libgen_sans_identifiant():
    assert libgen.try_libgen(_ref(uid=""))[0] == "no_source"


# ─── ResearchGate ───────────────────────────────────────────────────────────

def test_sans_temoins_la_voie_se_declare_indisponible(monkeypatch):
    monkeypatch.setenv("DISPLAY", ":99")
    monkeypatch.delenv("RESEARCH_BROWSER_COOKIES", raising=False)
    ok, why = researchgate.available_here()
    assert not ok and "RESEARCH_BROWSER_COOKIES" in why


def test_sans_affichage_la_voie_se_declare_indisponible(monkeypatch):
    monkeypatch.delenv("DISPLAY", raising=False)
    assert researchgate.available_here()[0] is False


def test_voie_indisponible_ne_tente_rien(monkeypatch):
    monkeypatch.delenv("DISPLAY", raising=False)
    verdict, _ = researchgate.try_researchgate(_ref())
    assert verdict == "no_source"


def test_mots_significatifs_sans_accents_ni_bruit():
    assert researchgate._significant_words("L'état de Transe & l'écoute") == \
        {"etat", "transe", "ecoute"}


class _PageCherche:
    """Page factice qui rend une liste de résultats figée."""
    def __init__(self, resultats):
        self.resultats = resultats
    def goto(self, *a, **k):
        return type("R", (), {"status": 200})()
    def wait_for_timeout(self, ms):
        pass
    def title(self):
        return "ResearchGate"
    def evaluate(self, script, *a):
        if "document.body.innerText" in script:
            return ""
        return self.resultats
    def get_by_role(self, *a, **k):
        return type("B", (), {"count": lambda s: 0})()


def test_notice_trop_eloignee_refusee(monkeypatch):
    """Mieux vaut ne rien rendre qu'un document approchant : la validation
    page 1 le rejetterait, en inscrivant son empreinte au refus."""
    monkeypatch.setattr(researchgate, "SEARCH_GAP_S", 0)
    page = _PageCherche([{"href": "https://rg/publication/1",
                          "txt": "Something entirely different about fish"}])
    lien, why = researchgate.find_record(page, "Auditory beat stimulation and cognition")
    assert lien is None and why == "no_close_enough_match"


def test_notice_proche_acceptee(monkeypatch):
    monkeypatch.setattr(researchgate, "SEARCH_GAP_S", 0)
    page = _PageCherche([{"href": "https://rg/publication/7",
                          "txt": "Auditory beat stimulation and its effects on cognition"}])
    lien, why = researchgate.find_record(page, "Auditory beat stimulation and cognition")
    assert why == "ok" and lien == "https://rg/publication/7"


def test_titre_trop_generique_pour_chercher(monkeypatch):
    monkeypatch.setattr(researchgate, "SEARCH_GAP_S", 0)
    lien, why = researchgate.find_record(_PageCherche([]), "de la")
    assert lien is None and why == "title_too_generic_to_search"


# ─── Ordre de la cascade ────────────────────────────────────────────────────

def _noms_cascade(monkeypatch, tmp_path, **env):
    import importlib
    monkeypatch.setenv("RESEARCH_VAULT_PATH", str(tmp_path))
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    for k in ("RESEARCH_ENABLE_SHADOW_LIBS", "DISPLAY", "RESEARCH_BROWSER_COOKIES"):
        if k not in env:
            monkeypatch.delenv(k, raising=False)
    import pipeline.config
    importlib.reload(pipeline.config)
    import pipeline.cascade as c
    importlib.reload(c)
    return [n for n, _ in c._build_cascade()]


def test_leditur_est_essaye_avant_les_fonds_de_lombre(monkeypatch, tmp_path):
    noms = _noms_cascade(monkeypatch, tmp_path)
    assert "publisher_doi" in noms
    assert noms.index("publisher_doi") < noms.index("websearch")


def test_sans_affichage_aucune_voie_pilotee(monkeypatch, tmp_path):
    noms = _noms_cascade(monkeypatch, tmp_path, RESEARCH_ENABLE_SHADOW_LIBS="1")
    assert not any(n in noms for n in
                   ("publisher_headful", "researchgate", "annas_scidb_optin",
                    "annas_headful_optin"))
    assert "libgen_optin" in noms, "le fonds sans navigateur reste disponible"


def test_le_lecteur_darticles_passe_avant_la_file_dattente(monkeypatch, tmp_path):
    """Le lecteur n'est pas contingenté : l'essayer après la file d'attente
    reviendrait à ne jamais l'atteindre."""
    noms = _noms_cascade(monkeypatch, tmp_path,
                         RESEARCH_ENABLE_SHADOW_LIBS="1", DISPLAY=":99")
    assert noms.index("annas_scidb_optin") < noms.index("annas_headful_optin")


def test_les_voies_couteuses_viennent_apres_les_annuaires(monkeypatch, tmp_path):
    noms = _noms_cascade(monkeypatch, tmp_path, DISPLAY=":99")
    assert noms.index("publisher_headful") > noms.index("publisher_doi")
    assert noms.index("publisher_headful") > noms.index("unpaywall")


def test_researchgate_absent_sans_temoins(monkeypatch, tmp_path):
    assert "researchgate" not in _noms_cascade(monkeypatch, tmp_path, DISPLAY=":99")


def test_researchgate_present_avec_temoins(monkeypatch, tmp_path):
    f = tmp_path / "c.json"
    f.write_text("[]", encoding="utf-8")
    noms = _noms_cascade(monkeypatch, tmp_path, DISPLAY=":99",
                         RESEARCH_BROWSER_COOKIES=str(f))
    assert "researchgate" in noms


# ─── Cibler quelques fiches plutôt que toutes ───────────────────────────────

def test_plusieurs_fiches_ciblees():
    """Une passe entière rejoue les échecs connus de toutes les fiches en
    attente. Acquérir quelques nouvelles références doit pouvoir se demander."""
    from pipeline.cli import build_parser
    args = build_parser().parse_args(["run", "--ref", "a_2020_x,b_1999_y"])
    vises = {s.strip() for s in (args.ref or "").split(",") if s.strip()}
    assert vises == {"a_2020_x", "b_1999_y"}


def test_une_seule_fiche_reste_acceptee():
    from pipeline.cli import build_parser
    args = build_parser().parse_args(["run", "--ref", "a_2020_x"])
    assert {s.strip() for s in args.ref.split(",") if s.strip()} == {"a_2020_x"}


def test_sortie_non_tamponnee(monkeypatch, tmp_path):
    """Sur un quart d'heure de travail, on doit voir la passe avancer.

    Quand la sortie est redirigée — travail planifié, journal — Python tamponne
    par blocs : rien ne s'affiche avant la fin, et on ne sait pas si l'outil
    travaille ou s'il est bloqué.
    """
    import pipeline.cli as cli

    class _Sortie:
        line_buffering = False
        def reconfigure(self, **kw):
            self.line_buffering = kw.get("line_buffering", self.line_buffering)
        def write(self, *a):
            return 0
        def flush(self):
            pass

    sortie = _Sortie()
    monkeypatch.setattr(cli.sys, "stdout", sortie)
    monkeypatch.setenv("RESEARCH_VAULT_PATH", str(tmp_path))
    (tmp_path / "_registry" / "refs").mkdir(parents=True, exist_ok=True)
    with pytest.raises(SystemExit):
        cli.main(["--help"])
    assert sortie.line_buffering is True
