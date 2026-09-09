"""Anna's Archive via navigateur *visible* — source d'acquisition opt-in.

Pourquoi cette source en plus de `annas_archive.py` : sur le terrain
(2026-08, cf. issue #1), la voie `cloudscraper` échoue en deux temps.

| Étape                         | cloudscraper | Playwright headless | Playwright **headful** |
|-------------------------------|--------------|---------------------|------------------------|
| Page `/scidb/` ou `/md5/`     | 403 DDoS-Guard | passe             | passe                  |
| Lien partenaire `*.xyz/dN/…`  | —            | obtenu              | obtenu                 |
| Téléchargement du PDF         | —            | **502** systématique | **PDF valide**        |

Le challenge anti-robot tombe en headless, mais le serveur de fichiers
partenaire refuse tant que le navigateur est invisible. Un Chromium
fenêtré dans un affichage virtuel obtient le fichier normalement :

    xvfb-run -a --server-args="-screen 0 1400x1000x24" python -m pipeline run

Deux détails de protocole découverts au passage :
  - la page `/md5/<md5>` n'expose ses liens `slow_download` qu'avec le
    paramètre `?&check=1` ;
  - le lien partenaire n'apparaît sur la page du créneau qu'après ~20 s ;
    les créneaux (`/0/0` … `/0/3`) sont contingentés, on les essaie en série.

Déploiement (conteneur sans écran, travail planifié) :
voir `docs/ACQUISITION_HEADFUL.md` (en anglais, comme le reste de `docs/`).

Activation : `RESEARCH_ENABLE_SHADOW_LIBS=1` **et** Playwright installé
(`pip install playwright && playwright install chromium`) **et** un
affichage disponible (`$DISPLAY`, typiquement fourni par `xvfb-run`).
Sinon la source se déclare indisponible et la cascade continue —
aucun comportement existant n'est modifié.

L'utilisation d'Anna's Archive peut violer le droit d'auteur dans votre
juridiction. Cf. DISCLAIMER.md à la racine du plugin.

Anti-homonymie : garantie comme pour toute source par la validation
page 1 de `_save_and_validate`.
"""
from __future__ import annotations

import contextlib
import os
import re
import time
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import quote

from ..browser_session import BrowserUnavailable
from ..browser_session import available as browser_available
from ..browser_session import get_page

from .mirrors import get_aa_mirrors

if TYPE_CHECKING:  # `Ref` ne sert qu'aux annotations : l'importer vraiment
    from pipeline.registry import Ref  # tirerait la config du vault, et le
    # test d'environnement ci-dessus échouerait faute de `RESEARCH_VAULT_PATH`.

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/131.0.0.0 Safari/537.36")
CHALLENGE = ("DDoS", "Just a moment", "Attention Required")
PARTNER_LINK = re.compile(r'href="(https://[a-z0-9]+\.[a-z]{2,4}/d\d[^"]+)"')
SLOTS = (0, 1, 2, 3)
# Les créneaux contingentés se sondent lentement (4 créneaux × 9 sondes × 8 s
# par miroir). Sans borne, une seule ref peut occuper la passe une demi-heure.
BUDGET_S = int(os.environ.get("RESEARCH_ANNAS_HEADFUL_BUDGET_S") or 600)
# Marge au-delà du budget avant que le garde-fou dur ne coupe : les retours
# ordonnés (cf. `_left_ms`) doivent gagner la course dans tous les cas normaux.
GUARD_GRACE_S = 30


def _left_ms(deadline: float, cap_ms: int) -> int:
    """Millisecondes restantes avant l'échéance, plafonnées à `cap_ms`.

    Renvoie 0 quand l'échéance est passée. Un appelant doit alors abandonner
    sans appeler Playwright : pour Playwright `timeout=0` ne veut pas dire
    « tout de suite » mais « jamais ».
    """
    return max(0, min(cap_ms, int((deadline - time.monotonic()) * 1000)))


class _BudgetExpired(BaseException):
    """Échéance dure atteinte. Dérive de `BaseException` volontairement :
    les `except Exception` qui absorbent les aléas du navigateur ne doivent
    pas l'avaler."""


@contextlib.contextmanager
def _wall_clock_guard(seconds: float):
    """Garde-fou dur : interrompt le corps au bout de `seconds`.

    Toutes les attentes du navigateur sont bornées explicitement, sauf une :
    l'attente de fin de téléchargement (`download.path()`) n'accepte aucun
    délai. Un serveur qui ouvre le transfert puis se tait immobiliserait la
    passe entière (issue #7). L'alarme se réarme toutes les 15 s tant que le
    corps n'a pas rendu la main, pour couvrir aussi la fermeture du
    navigateur si elle se bloque à son tour.

    Ne s'arme que dans le fil principal — seul endroit où un signal est
    livré — et restaure l'alarme et le gestionnaire précédents.
    """
    import signal
    import threading
    if seconds <= 0 or threading.current_thread() is not threading.main_thread():
        yield
        return

    def _fire(signum, frame):
        raise _BudgetExpired

    previous = signal.signal(signal.SIGALRM, _fire)
    signal.setitimer(signal.ITIMER_REAL, seconds, 15.0)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


def available() -> tuple[bool, str]:
    """La source est-elle utilisable ici ? (Playwright + affichage)"""
    return browser_available()


def _content(pg, deadline: float, tries: int = 3) -> str:
    """`page.content()` échoue si la page navigue — on retente."""
    for _ in range(tries):
        try:
            return pg.content()
        except Exception:
            pause = _left_ms(deadline, 2500)
            if not pause:
                return ""
            pg.wait_for_timeout(pause)
    return ""


def _load(pg, url: str, deadline: float, tries: int = 7, wait: int = 4000) -> str:
    """Charge une page et patiente tant que le challenge anti-robot s'affiche.

    Le challenge anti-robot boucle sur certaines adresses : sans plafonner
    chaque attente au reste du budget, cette seule fonction le dépasse.
    """
    budget = _left_ms(deadline, 90000)
    if not budget:
        return ""
    try:
        pg.goto(url, timeout=budget, wait_until="load")
    except Exception:
        return ""
    for _ in range(tries):
        pause = _left_ms(deadline, wait)
        if not pause:
            return ""
        pg.wait_for_timeout(pause)
        html = _content(pg, deadline)
        try:
            title = pg.title()
        except Exception:
            continue
        if html and not any(c in title for c in CHALLENGE):
            return html
    return ""


def _md5_candidates(pg, ref: Ref, deadline: float,
                    maxi: int = 5) -> tuple[list[str], str]:
    """Empreintes candidates, la plus sûre d'abord.

    Plusieurs candidats et non un seul : un fichier écarté par la validation
    page 1 doit laisser la place au suivant. Le fonds contient couramment
    plusieurs éditions sous des empreintes différentes, des homonymes, et des
    numérisations illisibles — s'arrêter au premier résultat, c'est renoncer
    pour toute la référence sur un mauvais tirage.

    Ordre : empreinte déjà connue, puis le lecteur d'articles, puis la
    recherche par titre filtrée sur un mot distinctif.
    """
    fm = ref.frontmatter
    out: list[str] = []

    def add(x: str | None) -> None:
        if x and x not in out:
            out.append(x)

    add(fm.get("annas_md5"))                  # gratuit : pas de budget en jeu
    if time.monotonic() > deadline:
        return out, "budget_exhausted" if not out else "cached_md5"

    from pipeline.cascade import _doi
    doi = _doi(ref)
    mirrors = get_aa_mirrors()
    via = "cached_md5" if out else ""

    if doi:
        for mirror in mirrors:
            if len(out) >= maxi or time.monotonic() > deadline:
                break
            found = re.findall(r"/md5/([0-9a-f]{32})",
                               _load(pg, f"https://{mirror}/scidb/{quote(doi, safe=':/')}",
                                     deadline))
            for m in found:
                add(m)
            if found:
                via = via or f"scidb:{mirror}"
                break

    title = (fm.get("title") or "").strip().strip("'\"")
    author = (fm.get("author") or "").split(",")[0].strip()
    if not title:
        return out, via or "no_title_for_search"
    words = [w.lower() for w in re.findall(r"[A-Za-zÀ-ÿ]{6,}", title)][:4]
    for mirror in mirrors:
        if len(out) >= maxi or time.monotonic() > deadline:
            break
        html = _load(pg, f"https://{mirror}/search?q={quote(f'{title} {author}')}",
                     deadline)
        if not html:
            continue
        # un mot distinctif du titre doit apparaître dans le bloc du résultat
        for block in re.split(r'(?=<a[^>]+href="/md5/)', html):
            m = re.search(r'href="/md5/([0-9a-f]{32})"', block)
            if m and any(w in block.lower() for w in words):
                add(m.group(1))
                via = via or f"search:{mirror}"
            if len(out) >= maxi:
                break
    if out:
        return out[:maxi], via or "found"
    if time.monotonic() > deadline:
        return [], "budget_exhausted"
    return [], "no_md5_found"


def _download(pg, mirror: str, md5: str, deadline: float,
              patience: int = 9) -> tuple[bytes | None, str]:
    """Parcourt les créneaux `slow_download` jusqu'à obtenir le fichier."""
    for slot in SLOTS:
        budget = _left_ms(deadline, 90000)
        if not budget:
            return None, "budget_exhausted"
        slot_url = f"https://{mirror}/slow_download/{md5}/0/{slot}"
        try:
            pg.goto(slot_url, timeout=budget, wait_until="load")
        except Exception:
            continue
        link = None
        for _ in range(patience):
            pause = _left_ms(deadline, 8000)
            if not pause:
                return None, "budget_exhausted"
            pg.wait_for_timeout(pause)
            html = _content(pg, deadline)
            m = PARTNER_LINK.search(html)
            if m:
                link = m.group(1)
                break
            low = html.lower()
            if "waitlist" in low or "too many" in low:
                break  # créneau contingenté : passer au suivant
        if not link:
            continue
        budget = _left_ms(deadline, 300000)
        if not budget:
            return None, "budget_exhausted"
        try:
            with pg.expect_download(timeout=budget) as dl:
                pg.click(f'a[href="{link}"]', timeout=budget)
            data = Path(dl.value.path()).read_bytes()
            if data[:4] == b"%PDF":
                return data, f"slow_slot{slot}"
        except Exception:
            pass
    return None, "no_slot_delivered"


def try_annas_headful(ref: Ref) -> tuple[str, dict]:
    """Source de cascade : Anna's Archive piloté par un navigateur visible."""
    ok, why = available()
    if not ok:
        return "no_source", {"reason": why}

    from pipeline.cascade import _save_and_validate

    mirrors = get_aa_mirrors()
    deadline = time.monotonic() + BUDGET_S
    try:
        with _wall_clock_guard(BUDGET_S + GUARD_GRACE_S):
            try:
                pg = get_page()
            except BrowserUnavailable as e:
                return "no_source", {"reason": str(e)}

            candidates, via = _md5_candidates(pg, ref, deadline)
            if not candidates:
                if via == "budget_exhausted":
                    return "failed", {"reason": "budget_exhausted_retry_later",
                                      "via": "md5_lookup"}
                return "no_source", {"reason": via}
            ref.frontmatter.setdefault("annas_md5", candidates[0])

            rejected = []
            for md5 in candidates:
                for mirror in mirrors:
                    if time.monotonic() > deadline:
                        return "failed", {"reason": "budget_exhausted_retry_later",
                                          "md5": md5, "via": via}
                    data, how = _download(pg, mirror, md5, deadline)
                    if not data:
                        continue
                    verdict, info = _save_and_validate(data, ref)
                    if verdict == "success":
                        info.setdefault("via", f"{via}/{how}@{mirror}")
                        return verdict, info
                    # Mauvais tirage : on essaie l'empreinte suivante plutôt
                    # que de renoncer pour toute la référence.
                    rejected.append({"md5": md5[:12], "verdict": verdict,
                                     "reason": info.get("reason")})
                    break
            spent = time.monotonic() > deadline
            return "failed", {
                "reason": ("budget_exhausted_retry_later" if spent
                           else "all_candidates_rejected" if rejected
                           else "all_mirrors_no_slot"),
                "via": via, "candidates": len(candidates),
                "rejected": rejected[:5]}
    except _BudgetExpired:
        # Le garde-fou dur a coupé : une attente non bornée par Playwright
        # (fin de téléchargement) a dépassé le budget. Reprenable.
        return "failed", {"reason": "budget_exhausted_retry_later",
                          "via": "wall_clock_guard"}
