"""Session de navigateur partagée par toutes les voies d'acquisition pilotées.

Pourquoi une session partagée : la cascade appelle ses sources une référence à
la fois. Sans mise en commun, chaque référence relançait un Chromium complet —
deux secondes perdues par référence, et surtout un profil neuf à chaque fois,
donc aucun témoin de session conservé et un contrôle anti-robot à refranchir.
La session est ouverte à la première demande et fermée à la fin du processus.

Trois réglages font toute la différence, découverts sur le terrain :

  - **Le navigateur doit être visible.** Certains serveurs de fichiers
    répondent 502 à un navigateur invisible et servent normalement un
    navigateur fenêtré. D'où Chromium fenêtré dans un affichage virtuel.
  - **Le profil doit enregistrer les PDF au lieu de les afficher.** Sans
    `always_open_pdf_externally`, Chromium ouvre son lecteur intégré et rien
    n'est jamais téléchargé.
  - **La borne d'espace d'adressage doit être levée avant le lancement.**
    Le pilote hérite de la borne en vigueur à sa naissance, et c'est lui qui
    lance le navigateur (cf. issue #6).
"""
from __future__ import annotations

import atexit
import contextlib
import json
import os
import re
from pathlib import Path

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/131.0.0.0 Safari/537.36")
# Sans cette préférence, Chromium affiche les PDF dans son lecteur intégré et
# aucun téléchargement ne se déclenche jamais.
PREFS = ('{"plugins":{"always_open_pdf_externally":true},'
         '"download":{"prompt_for_download":false}}')
CHALLENGE_TITLES = ("Just a moment", "Attention Required", "DDoS")
CHALLENGE_TEXTS = ("Security check", "unusual activity", "Verifying you are human")
BANNER_LABELS = ("Accept", "Accept all", "I agree", "Tout accepter", "J'accepte")

_SESSION: dict = {}


def available() -> tuple[bool, str]:
    """La voie par navigateur est-elle utilisable ici ?"""
    if not os.environ.get("DISPLAY"):
        return False, "no_display_run_under_xvfb"
    try:
        import playwright  # noqa: F401
    except ImportError:
        return False, "playwright_not_installed"
    return True, "ok"


@contextlib.contextmanager
def _address_space_unbounded():
    """Lève la borne d'espace d'adressage le temps du lancement.

    `pipeline run` se borne à 1,5 Go pour ne pas figer la machine, et les
    rlimits sont héritées par les fils. Le navigateur en réserve des dizaines
    de Go : sous cette borne il meurt au démarrage. Comme la session survit à
    l'appel, on peut rétablir la borne aussitôt après le lancement — le pilote
    et le navigateur, eux, gardent la limite haute dont ils ont hérité.
    """
    try:
        import resource
        soft, hard = resource.getrlimit(resource.RLIMIT_AS)
    except (ImportError, OSError):
        yield
        return
    if soft == hard:
        yield
        return
    try:
        resource.setrlimit(resource.RLIMIT_AS, (hard, hard))
    except (ValueError, OSError):
        yield
        return
    try:
        yield
    finally:
        with contextlib.suppress(ValueError, OSError):
            resource.setrlimit(resource.RLIMIT_AS, (soft, hard))


def _profile_dir() -> str:
    """Profil persistant, réglé pour enregistrer les PDF."""
    root = Path(os.environ.get("RESEARCH_BROWSER_PROFILE")
                or Path.home() / ".cache" / "paper-trail" / "browser-profile")
    default = root / "Default"
    default.mkdir(parents=True, exist_ok=True)
    prefs = default / "Preferences"
    if not prefs.exists():
        prefs.write_text(PREFS, encoding="utf-8")
    return str(root)


def _load_cookies() -> list[dict]:
    """Témoins de session fournis par l'utilisateur, exportés du navigateur.

    Certains sites — ResearchGate en particulier — ne servent le texte
    intégral qu'à un compte connecté. Le fichier est celui qu'exporte une
    extension d'export de témoins : une liste d'objets `{name, value, domain}`.
    """
    path = os.environ.get("RESEARCH_BROWSER_COOKIES")
    if not path or not Path(path).is_file():
        return []
    try:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    entries = raw.get("cookies", raw) if isinstance(raw, dict) else raw
    out = []
    for c in entries if isinstance(entries, list) else []:
        if not isinstance(c, dict) or not c.get("name") or not c.get("domain"):
            continue
        out.append({"name": c["name"], "value": str(c.get("value") or ""),
                    "domain": c["domain"], "path": c.get("path") or "/",
                    "secure": True})
    return out


def get_page():
    """Rend la page partagée, en ouvrant la session au premier appel.

    Lève `BrowserUnavailable` si le navigateur ne peut pas démarrer ici.
    """
    if _SESSION.get("page") is not None:
        return _SESSION["page"]
    ok, why = available()
    if not ok:
        raise BrowserUnavailable(why)

    from playwright.sync_api import sync_playwright
    with _address_space_unbounded():
        pw = sync_playwright().start()
        try:
            ctx = pw.chromium.launch_persistent_context(
                _profile_dir(), headless=False, accept_downloads=True,
                args=["--no-sandbox",
                      "--disable-blink-features=AutomationControlled"],
                user_agent=UA, locale="en-US",
                viewport={"width": 1400, "height": 1000})
        except Exception as e:
            with contextlib.suppress(Exception):
                pw.stop()
            raise BrowserUnavailable(f"launch_failed: {e}") from e

    cookies = _load_cookies()
    if cookies:
        with contextlib.suppress(Exception):
            ctx.add_cookies(cookies)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    _SESSION.update({"pw": pw, "ctx": ctx, "page": page,
                     "cookies_loaded": len(cookies)})
    atexit.register(close_session)
    return page


class BrowserUnavailable(RuntimeError):
    """Le navigateur ne peut pas être utilisé ici (affichage, dépendance…)."""


def close_session() -> None:
    """Ferme la session. Idempotent — appelé aussi à la fin du processus."""
    for key, stop in (("ctx", lambda o: o.close()), ("pw", lambda o: o.stop())):
        obj = _SESSION.pop(key, None)
        if obj is not None:
            with contextlib.suppress(Exception):
                stop(obj)
    _SESSION.pop("page", None)


# ─── Gestes communs à toutes les voies pilotées ─────────────────────────────

def under_challenge(page) -> bool:
    """Vrai si la page affichée est le contrôle anti-robot, pas le contenu."""
    try:
        title = page.title() or ""
        body = page.evaluate("() => document.body.innerText.slice(0, 300)")
    except Exception:
        return False
    return (any(c in title for c in CHALLENGE_TITLES)
            or any(c in body for c in CHALLENGE_TEXTS))


def dismiss_banner(page) -> None:
    """Écarte le bandeau de consentement, qui masque souvent les liens."""
    for label in BANNER_LABELS:
        try:
            button = page.get_by_role("button", name=re.compile(label, re.I))
            if button.count():
                button.first.click(timeout=2500)
                page.wait_for_timeout(800)
                return
        except Exception:
            pass


def pdf_links_on_page(page, limit: int = 6) -> list[str]:
    """Adresses de fichier plausibles sur la page, la plus sûre d'abord.

    `citation_pdf_url` est la déclaration normalisée que publient la plupart
    des éditeurs : on la prend en premier quand elle est là.
    """
    try:
        return page.evaluate("""(limit) => {
            const out = [];
            const meta = document.querySelector('meta[name="citation_pdf_url"]');
            if (meta && meta.content) out.push(meta.content);
            for (const el of document.querySelectorAll('iframe[src], embed[src]'))
                if (/\\.pdf(\\?|$)/i.test(el.src)) out.push(el.src);
            for (const a of document.querySelectorAll('a[href]'))
                if (/\\.pdf(\\?|$)|\\/pdf\\/|\\/pdf(\\?|$)|epdf|type=printable|download.*pdf/i
                        .test(a.href))
                    out.push(a.href);
            return [...new Set(out)].slice(0, limit);
        }""", limit)
    except Exception:
        return []


def download_url(page, url: str, timeout_ms: int = 90000) -> bytes | None:
    """Fait enregistrer l'adresse par le navigateur lui-même.

    On ne peut pas simplement demander le fichier : c'est précisément la
    requête de programme que le serveur refuse. On injecte donc un lien de
    téléchargement dans la page et on le clique, si bien que la demande part
    du navigateur, avec ses témoins et sa signature.
    """
    import tempfile
    try:
        with page.expect_download(timeout=timeout_ms) as handle:
            page.evaluate(
                "u => { const a = document.createElement('a'); a.href = u;"
                " a.download = ''; document.body.appendChild(a); a.click(); }",
                url)
        target = Path(tempfile.mkstemp(suffix=".pdf", prefix="pt_browser_")[1])
        handle.value.save_as(str(target))
    except Exception:
        return None
    try:
        data = target.read_bytes()
    except OSError:
        return None
    finally:
        with contextlib.suppress(OSError):
            target.unlink()
    return data if data[:5] == b"%PDF-" else None


def open_page(page, url: str, timeout_ms: int = 90000,
              settle_ms: int = 3000) -> tuple[int | None, str]:
    """Ouvre une adresse et laisse la page se poser. Rend (code, motif)."""
    try:
        response = page.goto(url, wait_until="domcontentloaded",
                             timeout=timeout_ms)
    except Exception:
        return None, "page_unreachable"
    dismiss_banner(page)
    page.wait_for_timeout(settle_ms)
    if under_challenge(page):
        return None, "anti_bot_challenge"
    status = response.status if response is not None else 0
    if status >= 400:
        return status, f"page_http_{status}"
    return status, "ok"
