"""Session de navigateur partagée par les voies d'acquisition pilotées.

Deux invariants tiennent tout le reste : le pilote doit naître hors de la
borne mémoire que `pipeline run` se pose (sinon aucun navigateur ne démarre,
cf. issue #6), et le profil doit être réglé pour enregistrer les PDF (sinon
Chromium les affiche et rien n'est jamais téléchargé).
"""
from __future__ import annotations

import json
import resource
import sys
import types
from pathlib import Path

import pytest

PROJ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJ))

from lib import browser_session as bs  # noqa: E402

BORNE = 1536 * 1024 * 1024


@pytest.fixture(autouse=True)
def session_propre():
    """Aucun test ne doit hériter d'une session ouverte par un autre."""
    bs.close_session()
    yield
    bs.close_session()


# ─── Disponibilité ──────────────────────────────────────────────────────────

def test_sans_affichage_indisponible(monkeypatch):
    monkeypatch.delenv("DISPLAY", raising=False)
    assert bs.available() == (False, "no_display_run_under_xvfb")


def test_sans_playwright_indisponible(monkeypatch):
    monkeypatch.setenv("DISPLAY", ":99")
    import builtins
    vrai = builtins.__import__

    def refuse(name, *a, **k):
        if name == "playwright":
            raise ImportError
        return vrai(name, *a, **k)

    monkeypatch.setattr(builtins, "__import__", refuse)
    assert bs.available() == (False, "playwright_not_installed")


def test_page_refusee_si_indisponible(monkeypatch):
    monkeypatch.delenv("DISPLAY", raising=False)
    with pytest.raises(bs.BrowserUnavailable):
        bs.get_page()


# ─── Borne d'espace d'adressage (issue #6) ──────────────────────────────────

def test_borne_levee_puis_retablie():
    soft0, hard0 = resource.getrlimit(resource.RLIMIT_AS)
    if hard0 != resource.RLIM_INFINITY and hard0 <= BORNE:
        pytest.skip("limite dure déjà basse dans cet environnement")
    resource.setrlimit(resource.RLIMIT_AS, (BORNE, hard0))
    try:
        with bs._address_space_unbounded():
            dedans, _ = resource.getrlimit(resource.RLIMIT_AS)
            assert dedans == hard0, "la borne doit être levée pour le lancement"
        apres, _ = resource.getrlimit(resource.RLIMIT_AS)
        assert apres == BORNE, "la borne doit être rétablie après le lancement"
    finally:
        resource.setrlimit(resource.RLIMIT_AS, (soft0, hard0))


def _faux_playwright(monkeypatch, au_demarrage, contexte=None):
    """Faux paquet `playwright`, instrumenté au démarrage du pilote."""
    class _Chromium:
        def launch_persistent_context(self, *a, **k):
            if contexte is None:
                raise RuntimeError("lancement refusé par le test")
            return contexte

    class _PW:
        chromium = _Chromium()
        def stop(self):
            pass

    class _Amorce:
        def start(self):
            au_demarrage()
            return _PW()

    paquet = types.ModuleType("playwright")
    api = types.ModuleType("playwright.sync_api")
    api.sync_playwright = lambda: _Amorce()
    paquet.sync_api = api
    monkeypatch.setitem(sys.modules, "playwright", paquet)
    monkeypatch.setitem(sys.modules, "playwright.sync_api", api)


class _FauxContexte:
    def __init__(self):
        self.pages = []
        self.cookies = []
    def add_cookies(self, c):
        self.cookies.extend(c)
    def new_page(self):
        return object()
    def close(self):
        pass


def test_le_pilote_nait_hors_de_la_borne(monkeypatch, tmp_path):
    """Régression issue #6.

    Le pilote hérite de la borne en vigueur à sa naissance, et c'est lui qui
    lance le navigateur : la borne doit déjà être levée à cet instant.
    """
    soft0, hard0 = resource.getrlimit(resource.RLIMIT_AS)
    if hard0 != resource.RLIM_INFINITY and hard0 <= BORNE:
        pytest.skip("limite dure déjà basse dans cet environnement")
    monkeypatch.setenv("DISPLAY", ":99")
    monkeypatch.setenv("RESEARCH_BROWSER_PROFILE", str(tmp_path / "profil"))
    vu = {}
    _faux_playwright(monkeypatch,
                     lambda: vu.__setitem__("soft", resource.getrlimit(resource.RLIMIT_AS)[0]),
                     contexte=_FauxContexte())
    resource.setrlimit(resource.RLIMIT_AS, (BORNE, hard0))
    try:
        bs.get_page()
    finally:
        resource.setrlimit(resource.RLIMIT_AS, (soft0, hard0))
    assert vu["soft"] == hard0, (
        "la borne doit être levée quand le pilote est lancé, sinon il en "
        "hérite et le navigateur meurt au démarrage")


def test_borne_retablie_apres_ouverture(monkeypatch, tmp_path):
    """La session survit à l'appel : la borne peut être remise aussitôt."""
    soft0, hard0 = resource.getrlimit(resource.RLIMIT_AS)
    if hard0 != resource.RLIM_INFINITY and hard0 <= BORNE:
        pytest.skip("limite dure déjà basse dans cet environnement")
    monkeypatch.setenv("DISPLAY", ":99")
    monkeypatch.setenv("RESEARCH_BROWSER_PROFILE", str(tmp_path / "profil"))
    _faux_playwright(monkeypatch, lambda: None, contexte=_FauxContexte())
    resource.setrlimit(resource.RLIMIT_AS, (BORNE, hard0))
    try:
        bs.get_page()
        apres, _ = resource.getrlimit(resource.RLIMIT_AS)
    finally:
        resource.setrlimit(resource.RLIMIT_AS, (soft0, hard0))
    assert apres == BORNE


# ─── Profil : sans ce réglage, aucun PDF n'est jamais téléchargé ────────────

def test_profil_regle_pour_enregistrer_les_pdf(monkeypatch, tmp_path):
    monkeypatch.setenv("RESEARCH_BROWSER_PROFILE", str(tmp_path / "profil"))
    racine = Path(bs._profile_dir())
    prefs = json.loads((racine / "Default" / "Preferences").read_text())
    assert prefs["plugins"]["always_open_pdf_externally"] is True
    assert prefs["download"]["prompt_for_download"] is False


def test_profil_existant_non_ecrase(monkeypatch, tmp_path):
    """Le profil est persistant : on ne piétine pas ce qu'il a accumulé."""
    monkeypatch.setenv("RESEARCH_BROWSER_PROFILE", str(tmp_path / "profil"))
    prefs = Path(bs._profile_dir()) / "Default" / "Preferences"
    prefs.write_text('{"deja": "la"}', encoding="utf-8")
    bs._profile_dir()
    assert json.loads(prefs.read_text()) == {"deja": "la"}


# ─── Témoins de session ─────────────────────────────────────────────────────

def test_temoins_absents(monkeypatch):
    monkeypatch.delenv("RESEARCH_BROWSER_COOKIES", raising=False)
    assert bs._load_cookies() == []


def test_temoins_lus_et_normalises(monkeypatch, tmp_path):
    f = tmp_path / "c.json"
    f.write_text(json.dumps([
        {"name": "sid", "value": "x", "domain": ".researchgate.net"},
        {"name": "sans_domaine", "value": "y"},          # ignoré
        {"pas_un_temoin": True},                          # ignoré
    ]), encoding="utf-8")
    monkeypatch.setenv("RESEARCH_BROWSER_COOKIES", str(f))
    c = bs._load_cookies()
    assert [x["name"] for x in c] == ["sid"]
    assert c[0]["path"] == "/" and c[0]["secure"] is True


def test_temoins_fichier_illisible(monkeypatch, tmp_path):
    f = tmp_path / "c.json"
    f.write_text("pas du json", encoding="utf-8")
    monkeypatch.setenv("RESEARCH_BROWSER_COOKIES", str(f))
    assert bs._load_cookies() == []


def test_temoins_enveloppes_dans_un_objet(monkeypatch, tmp_path):
    """Certains exports enveloppent la liste sous une clé `cookies`."""
    f = tmp_path / "c.json"
    f.write_text(json.dumps({"cookies": [
        {"name": "sid", "value": "x", "domain": ".researchgate.net"}]}),
        encoding="utf-8")
    monkeypatch.setenv("RESEARCH_BROWSER_COOKIES", str(f))
    assert [x["name"] for x in bs._load_cookies()] == ["sid"]


# ─── Session partagée ───────────────────────────────────────────────────────

def test_une_seule_session_pour_toutes_les_references(monkeypatch, tmp_path):
    """Le coût d'ouverture ne doit pas être payé une fois par référence."""
    monkeypatch.setenv("DISPLAY", ":99")
    monkeypatch.setenv("RESEARCH_BROWSER_PROFILE", str(tmp_path / "profil"))
    ouvertures = []
    _faux_playwright(monkeypatch, lambda: ouvertures.append(1),
                     contexte=_FauxContexte())
    p1, p2, p3 = bs.get_page(), bs.get_page(), bs.get_page()
    assert p1 is p2 is p3
    assert len(ouvertures) == 1


def test_fermeture_idempotente():
    bs.close_session()
    bs.close_session()
