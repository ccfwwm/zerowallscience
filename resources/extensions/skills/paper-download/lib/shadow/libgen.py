"""Library Genesis par identifiant — voie indépendante d'Anna's Archive.

Intérêt : aucun contrôle anti-robot, donc aucun navigateur, et aucun créneau
de téléchargement contingenté. Sur un corpus réel de quatre mois, c'est la
deuxième voie la plus productive, particulièrement sur les fonds anciens et
les grandes revues — là où les annuaires d'accès ouvert ne trouvent rien.

La chaîne compte quatre temps : recherche par identifiant, page d'édition
qui porte l'empreinte du fichier, page intermédiaire qui délivre une clé de
téléchargement à durée limitée, puis le fichier lui-même. Chaque temps exige
le référent du précédent.

L'usage de ce fonds peut violer le droit d'auteur dans votre juridiction.
Cf. DISCLAIMER.md à la racine du greffon.
"""
from __future__ import annotations

import os
import re
from typing import TYPE_CHECKING
from urllib.parse import urlencode

if TYPE_CHECKING:
    from pipeline.registry import Ref

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/131.0.0.0 Safari/537.36")
_EDITION = re.compile(r"edition\.php\?id=\d+")
_MD5 = re.compile(r"\b([a-f0-9]{32})\b")
_KEY = re.compile(r'href="(get\.php\?md5=[a-f0-9]{32}&(?:amp;)?key=[A-Za-z0-9]+)"')


def get_mirrors() -> list[str]:
    """Miroirs à essayer, surchargeables — ils changent d'adresse souvent."""
    raw = os.environ.get("RESEARCH_LIBGEN_MIRRORS")
    if raw:
        return [m.strip().rstrip("/") for m in raw.split(",") if m.strip()]
    return ["https://libgen.gl", "https://libgen.la", "https://libgen.vg"]


def _session():
    import requests
    s = requests.Session()
    s.headers.update({"User-Agent": UA})
    return s


def _pick_edition(html: str, doi: str) -> str | None:
    """La notice de l'édition cherchée, parmi les résultats de la recherche.

    Une seule notice : c'est la bonne. Plusieurs : on prend celle qui suit la
    dernière mention de l'identifiant, car la première occurrence est le
    champ de recherche lui-même, pas un résultat.
    """
    ids = list(dict.fromkeys(_EDITION.findall(html)))
    if not ids:
        return None
    if len(ids) == 1:
        return ids[0]
    pos = html.lower().rfind(doi.lower())
    after = _EDITION.search(html[pos:]) if pos >= 0 else None
    return after.group(0) if after else ids[0]


def _fetch_from_mirror(sess, base: str, doi: str) -> tuple[bytes | None, str]:
    """Suit la chaîne recherche → édition → clé → fichier."""
    query = urlencode({"req": doi, "columns[]": "d", "objects[]": "a",
                       "topics[]": "a"}, doseq=True)
    r = sess.get(f"{base}/index.php?{query}", timeout=45)
    if r.status_code != 200:
        return None, f"search_http_{r.status_code}"
    edition = _pick_edition(r.text, doi)
    if not edition:
        return None, "not_in_libgen"

    r = sess.get(f"{base}/{edition}", timeout=45)
    md5 = _MD5.search(r.text)
    if not md5:
        return None, "edition_without_fingerprint"
    md5 = md5.group(1)

    r = sess.get(f"{base}/ads.php?md5={md5}", timeout=45,
                 headers={"Referer": f"{base}/"})
    key = _KEY.search(r.text)
    if not key:
        return None, "no_download_key"

    r = sess.get(f"{base}/{key.group(1).replace('&amp;', '&')}", timeout=180,
                 headers={"Referer": f"{base}/ads.php?md5={md5}"})
    data = r.content
    return (data, "ok") if data[:5] == b"%PDF-" else (None, "not_a_pdf")


def try_libgen(ref: Ref) -> tuple[str, dict]:
    """Source de cascade : Library Genesis par identifiant."""
    from pipeline.cascade import _doi, _save_and_validate
    doi = _doi(ref)
    if not doi:
        return "no_source", {"reason": "no_doi"}

    sess = _session()
    last = "no_mirror_reachable"
    for base in get_mirrors():
        try:
            data, why = _fetch_from_mirror(sess, base, doi)
        except Exception as e:                      # réseau, TLS, redirection…
            data, why = None, f"error_{type(e).__name__}"
        if data:
            verdict, info = _save_and_validate(data, ref)
            info.setdefault("via", f"libgen@{base}")
            return verdict, info
        last = why
        if why == "not_in_libgen":
            # Le fonds est le même sur tous les miroirs : inutile d'insister.
            return "no_source", {"reason": "not_in_libgen", "doi": doi}
    return "failed", {"reason": last, "doi": doi}
