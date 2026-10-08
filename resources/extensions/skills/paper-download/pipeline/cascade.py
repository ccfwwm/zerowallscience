"""Cascade 9 niveaux pour `uid_resolved → pdf_acquired`.

Chaque `try_<source>` retourne un tuple (verdict, info_dict) :
  - "success"      : PDF téléchargé, page 1 validée, prêt à être moved to dest.
  - "page1_failed" : PDF téléchargé mais validation page 1 KO (homonymie probable).
                     Le tmp est quarantained, on continue la cascade.
  - "no_source"    : la source n'est pas applicable (ex: pas de DOI pour Crossref).
  - "failed"       : applicable mais erreur réseau / 404 / pas de PDF dispo.

La fonction `run_cascade(ref)` orchestre les 9 étapes et retourne le premier
succès ou un verdict "cascade_exhausted".
"""
from __future__ import annotations
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import yaml  # noqa: F401

from .config import SOURCES, QUARANTINE, LIB_PATH  # noqa: F401
from .registry import Ref
from .breakers import BreakerRegistry

# Imports différés des helpers — ils ont des side effects (logs, sessions).
# On les importe lazy depuis le plugin lib via sys.path déjà inséré par config.

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/120.0.0.0 Safari/537.36")
EMAIL = "claude@liance.art"


# ─────────────────────────────────────────────────────────────────────────────
# Utilitaires partagés
# ─────────────────────────────────────────────────────────────────────────────

def _doi(ref: Ref) -> str | None:
    uid = ref.frontmatter.get("uid") or ""
    return uid[4:].strip() if uid.startswith("doi:") else None


def _arxiv_id(ref: Ref) -> str | None:
    uid = ref.frontmatter.get("uid") or ""
    return uid[6:].strip() if uid.startswith("arxiv:") else None


# UA browser-like : beaucoup de dépôts (UMass SchoolWorks, KIT, TU
# Darmstadt, repos DSpace en général) filtrent les User-Agent qui ne
# ressemblent pas à un navigateur réel. On présente un Chrome récent.
_BROWSER_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_BROWSER_HEADERS = {
    "User-Agent": _BROWSER_UA,
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "application/pdf;q=0.95,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}


def _http_get(url: str, timeout: int = 30, headers: dict | None = None,
              replace_headers: bool = False) -> bytes | None:
    """GET tolérant. Préfère `requests` (cookies, redirects, headers normaux)
    pour passer les anti-bots légers ; fallback urllib si indisponible.

    Si `replace_headers=True`, les headers passés remplacent complètement
    le set browser par défaut (utile pour mimer un client minimaliste
    type curl).
    """
    if replace_headers and headers:
        h = dict(headers)
    else:
        h = dict(_BROWSER_HEADERS)
        if headers:
            h.update(headers)
    try:
        import requests
        try:
            r = requests.get(url, headers=h, timeout=timeout, allow_redirects=True)
            if r.status_code >= 400:
                return None
            return r.content
        except (requests.RequestException, requests.exceptions.SSLError):
            return None
    except ImportError:
        # Fallback urllib (vault tests sans requests)
        import http.client
        req = urllib.request.Request(url, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError,
                http.client.IncompleteRead, http.client.HTTPException):
            return None


def _is_valid_pdf(data: bytes) -> bool:
    return bool(data) and data[:5] == b"%PDF-" and len(data) > 3000


def _looks_like_html(data: bytes) -> bool:
    """Heuristique : la réponse est une page HTML, pas un PDF."""
    if not data:
        return False
    head = data[:1024].lstrip().lower()
    return (
        head.startswith(b"<!doctype html")
        or head.startswith(b"<html")
        or b"<head" in head[:512]
    )


def _resolve_pdf_url_from_html(html: bytes, base_url: str) -> str | None:
    """Cherche le vrai PDF dans une landing page HTML.

    Stratégie, par ordre de fiabilité :
      1. `<meta name="citation_pdf_url" content="…">` — norme Highwire
         Press supportée par HAL, KIT, Darmstadt, TU Berlin, NIME,
         eScholarship, la plupart des dépôts universitaires.
      2. `<meta property="og:pdf" …>` (rare mais existe).
      3. Premier `<a href="…pdf">` qui ressemble à un lien de download
         (mots-clés `download`, `pdf`, `fulltext`, `getfile`).

    Résout les URLs relatives en absolues avec `base_url`.
    Retourne `None` si aucun candidat plausible.
    """
    if not html:
        return None
    try:
        text = html.decode("utf-8", errors="replace")
    except Exception:
        return None

    import re
    from urllib.parse import urljoin

    # 1. citation_pdf_url (cas dominant)
    m = re.search(
        r'<meta[^>]+name=["\']citation_pdf_url["\'][^>]+content=["\']([^"\']+)["\']',
        text, re.I,
    )
    if not m:
        # Variante ordre des attributs (content avant name)
        m = re.search(
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']citation_pdf_url["\']',
            text, re.I,
        )
    if m:
        return urljoin(base_url, m.group(1))

    # 2. og:pdf
    m = re.search(
        r'<meta[^>]+property=["\']og:pdf["\'][^>]+content=["\']([^"\']+)["\']',
        text, re.I,
    )
    if m:
        return urljoin(base_url, m.group(1))

    # 3. <a href="...pdf"> avec mots-clés download / fulltext / getfile
    for m in re.finditer(
        r'<a[^>]+href=["\']([^"\']+\.pdf[^"\']*)["\'][^>]*>([^<]{0,200})</a>',
        text, re.I,
    ):
        href, label = m.group(1), m.group(2).lower()
        signal = "download" in label or "full" in label or "pdf" in label
        if signal or "/download" in href or "/getfile" in href.lower():
            return urljoin(base_url, href)

    return None


def _http_get_pdf(url: str, timeout: int = 60,
                  headers: dict | None = None) -> tuple[bytes | None, dict]:
    """GET qui suit une landing page HTML vers le vrai PDF.

    Retourne `(pdf_bytes_or_none, info_dict)`. `info_dict` contient :
      - `chain` : liste des URLs visitées (pour diagnostic)
      - `resolved_via` : 'direct' | 'landing_meta' | 'curl_ua_retry' | …

    Politique :
      1. GET initial avec UA navigateur.
      2. Si PDF → on rend.
      3. Si HTML → on parse citation_pdf_url / og:pdf / a href .pdf, on
         retry sur l'URL trouvée avec Referer correct.
      4. Si toujours HTML après hop, on retry l'URL d'origine avec UA
         `curl` minimaliste : certains sites (JCMS et autres serveurs
         de revues) servent un viewer JS aux navigateurs et le PDF
         brut aux downloaders. Pas de redirection landing→PDF, juste
         un changement d'UA.
    """
    chain = [url]
    data = _http_get(url, timeout=timeout, headers=headers)
    if not data:
        return None, {"chain": chain, "resolved_via": "no_response"}

    if _is_valid_pdf(data):
        return data, {"chain": chain, "resolved_via": "direct"}

    if not _looks_like_html(data):
        return data, {"chain": chain, "resolved_via": "non_html_non_pdf"}

    resolved = _resolve_pdf_url_from_html(data, url)
    if resolved:
        chain.append(resolved)
        follow_headers = {"Referer": url}
        if headers:
            follow_headers = {**headers, **follow_headers}
        pdf = _http_get(resolved, timeout=timeout, headers=follow_headers)
        if pdf and _is_valid_pdf(pdf):
            return pdf, {"chain": chain, "resolved_via": "landing_meta"}

    # Dernier essai : UA `curl` minimaliste. Quelques sites (JCMS,
    # certains journaux scientifiques) renvoient le PDF brut aux
    # downloaders ligne-de-commande et un viewer JS aux navigateurs.
    curl_headers = {"User-Agent": "curl/7.88.0", "Accept": "*/*"}
    if headers and headers.get("Referer"):
        curl_headers["Referer"] = headers["Referer"]
    data2 = _http_get(url, timeout=timeout, headers=curl_headers,
                      replace_headers=True)
    if data2 and _is_valid_pdf(data2):
        return data2, {"chain": chain, "resolved_via": "curl_ua_retry"}

    return None, {"chain": chain, "resolved_via": "landing_dl_failed"}


def _make_dest_path(ref: Ref) -> Path:
    """Chemin de destination dans `10_SOURCES/<domain>/Sources/`.

    Le domaine est inféré depuis le frontmatter (champ `domain`) ou par défaut
    `11_Biblio_MIR` (le pré-SOTA Bernard Bel y va).
    """
    domain = ref.frontmatter.get("domain")
    if not domain:
        # Heuristique : utiliser le suffixe du slug s'il contient `biblio_*`
        slug = ref.slug
        if "biblio_informatique" in slug:
            domain = "11_Biblio_Informatique"
        elif "biblio_mir" in slug:
            domain = "11_Biblio_MIR"
        elif "biblio_ethno" in slug:
            domain = "12_Biblio_Ethno"
        elif "biblio_maths" in slug:
            domain = "13_Biblio_Maths"
        else:
            domain = "11_Biblio_MIR"
    author = (ref.frontmatter.get("author") or "Unknown").split()[0].capitalize()
    year = ref.frontmatter.get("year") or "nd"
    # Un titre Crossref peut porter des balises et des sauts de ligne : la
    # classe des blancs les laissait passer dans le nom de fichier.
    from metadata_clean import safe_filename_fragment
    title = safe_filename_fragment(ref.frontmatter.get("title"))
    fname = f"{author}_{year}_{title}.pdf"
    return SOURCES / domain / "Sources" / fname


def _quarantine(tmp: Path, ref: Ref, reason: str) -> Path:
    """Déplace un PDF rejeté en quarantaine. Retourne le path final."""
    QUARANTINE.mkdir(parents=True, exist_ok=True)
    import hashlib
    sha8 = hashlib.sha256(tmp.read_bytes()).hexdigest()[:8]
    qpath = QUARANTINE / f"{ref.slug}_{sha8}.pdf"
    shutil.move(str(tmp), str(qpath))
    return qpath


def cleanup_quarantine_for_ref(slug: str) -> int:
    """Supprime tous les fichiers en quarantaine pour ce slug.

    Appelé quand une ref atteint `page1_validated` : les anciens PDFs
    rejetés (homonymies, mauvais candidats) n'ont plus d'utilité
    diagnostique puisque le bon PDF est acquis.

    Retourne le nombre de fichiers supprimés.
    """
    if not QUARANTINE.exists():
        return 0
    n = 0
    for f in QUARANTINE.glob(f"{slug}_*.pdf"):
        try:
            f.unlink()
            n += 1
        except OSError:
            pass
    return n


def _validate_page1(pdf_path: Path, ref: Ref) -> tuple[bool, str]:
    """Wrapper sur validate_pdf_against_ref du plugin."""
    import validate_pdf_content as v
    return v.validate_pdf_against_ref(
        pdf_path,
        expected_author=ref.frontmatter.get("author") or "",
        expected_year=str(ref.frontmatter.get("year") or ""),
        expected_title=ref.frontmatter.get("title") or "",
        expected_doi=_doi(ref) or "",
        expect_book=str(ref.frontmatter.get("type") or "").lower() == "book",
    )


def _save_and_validate(data: bytes, ref: Ref) -> tuple[str, dict]:
    """Écrit data dans un tmp, valide page 1, retourne (verdict, info).

    Si OK : déplace vers dest_path, info contient pdf_path et sha256.
    Si KO : quarantaine, info contient quarantine_path et reason.

    Si l'empreinte sha256 du fichier téléchargé est déjà dans
    `ref.rejected_sha256` (PDF déjà rejeté à un précédent passage),
    on skippe immédiatement sans re-quarantine — la source peut
    re-livrer le même fichier qu'avant, on ne reboucle pas dessus.
    """
    import hashlib
    sha = hashlib.sha256(data).hexdigest()
    rejected = ref.frontmatter.get("rejected_sha256") or []
    if sha in rejected:
        return "skipped_already_rejected", {
            "reason": "sha256_already_in_rejected_list",
            "sha256_prefix": sha[:12],
        }
    if not _is_valid_pdf(data):
        return "failed", {"reason": "not_a_pdf"}
    tmp = Path(tempfile.mkstemp(suffix=".pdf", prefix="cascade_")[1])
    tmp.write_bytes(data)
    is_ok, reason = _validate_page1(tmp, ref)
    if not is_ok:
        qpath = _quarantine(tmp, ref, reason)
        # Mémoriser le sha rejeté pour éviter de re-télécharger le même
        # fichier à un futur passage (la source peut re-livrer un autre
        # PDF par contre).
        rejected_list = ref.frontmatter.setdefault("rejected_sha256", [])
        if sha not in rejected_list:
            rejected_list.append(sha)
        return "page1_failed", {"reason": reason, "quarantine": str(qpath),
                                 "sha256_prefix": sha[:12]}
    dest = _make_dest_path(ref)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(tmp), str(dest))
    sha_final = hashlib.sha256(dest.read_bytes()).hexdigest()
    return "success", {
        "pdf_path": str(dest.relative_to(SOURCES)),
        "pdf_sha256": sha_final,
        "size_kb": dest.stat().st_size // 1024,
    }


def _check_local_pdf(ref: Ref) -> tuple[str, dict] | None:
    """Step 0 de la cascade : check si le PDF est déjà sur disque.

    Vérifie dans l'ordre :
      1. `pdf_path` du frontmatter (ref déjà associée)
      2. `legacy_pdf_path` du frontmatter (chemin archivé au reset)

    Si un PDF existe à l'une de ces locations :
      - Valide page 1 anti-homonymie sur le fichier in-place
      - Si valide : retourne ("success", info) avec pdf_path + sha256
      - Si page 1 KO ou format invalide : retourne None (laisse la
        cascade externe re-essayer ailleurs)
      - Si OCR nécessaire (scan) : retourne ("scan_needs_ocr", info)
        pour bascule en awaiting_rtfm_ocr

    Évite de re-télécharger un PDF déjà présent localement.
    """
    candidates: list[tuple[str, Path]] = []
    for key in ("pdf_path", "legacy_pdf_path"):
        pp = ref.frontmatter.get(key)
        if not pp:
            continue
        abs_p = SOURCES / pp
        if abs_p.exists() and abs_p.is_file():
            candidates.append((key, abs_p))

    # Reasons indiquant un problème technique transitoire (pas un mismatch
    # de contenu). Dans ces cas, on accepte le PDF tel quel — la validation
    # sera refaite par pdf_acquired_dispatch.
    _TRANSIENT_REASONS = (
        "pdf_slow_extract", "pdftotext_timeout", "pdf_text_extract_failed",
        "pdfium_timeout", "extraction_timeout",
    )

    rejected = set(ref.frontmatter.get("rejected_sha256") or [])

    for source_key, abs_p in candidates:
        # Vérifie validité PDF (magic bytes + taille minimale)
        try:
            data = abs_p.read_bytes()
        except OSError:
            continue
        if not _is_valid_pdf(data):
            continue  # corrupt or wrong format, let cascade retry

        import hashlib
        sha = hashlib.sha256(data).hexdigest()
        # Si ce sha est déjà rejeté (page1_failed précédent), ne pas le
        # re-proposer comme local — sinon boucle infinie pdf_acquired↔needs_reacq.
        if sha in rejected:
            continue

        # Validation page 1 in-place
        is_ok, reason = _validate_page1(abs_p, ref)
        rel_path = str(abs_p.relative_to(SOURCES))
        info = {
            "pdf_path": rel_path,
            "pdf_sha256": sha,
            "size_kb": abs_p.stat().st_size // 1024,
            "matched_via": source_key,
        }

        if is_ok:
            return "success", info

        reason_lower = (reason or "").lower()

        # Cas scan / OCR : on garde le fichier, route vers OCR
        if "scan" in reason_lower or "ocr" in reason_lower:
            return "scan_needs_ocr", {**info, "reason": reason}

        # Cas problème technique transitoire (timeout pdftotext, etc.) :
        # on accepte le PDF tel quel ; pdf_acquired_dispatch re-validera.
        if any(t in reason_lower for t in _TRANSIENT_REASONS):
            return "success", {**info, "page1_deferred": reason}

        # Cas mismatch de contenu (homonymie, mauvais auteur, off-domain) :
        # on n'utilise pas ce PDF local, la cascade externe re-essaye.
        # (next candidate dans la boucle si y en a un autre)

    return None


# ─────────────────────────────────────────────────────────────────────────────
# Source 1 — Crossref OA URL (REST direct)
# ─────────────────────────────────────────────────────────────────────────────

def try_crossref_oa(ref: Ref) -> tuple[str, dict]:
    doi = _doi(ref)
    if not doi:
        return "no_source", {"reason": "no_doi"}
    api = f"https://api.crossref.org/works/{doi}"
    try:
        with urllib.request.urlopen(api, timeout=15) as r:
            import json
            data = json.loads(r.read())
    except Exception as e:
        return "failed", {"reason": f"crossref_api_error:{type(e).__name__}"}
    links = (data.get("message") or {}).get("link") or []
    pdf_urls = [L.get("URL") for L in links
                if L.get("content-type") == "application/pdf" and L.get("URL")]
    if not pdf_urls:
        return "no_source", {"reason": "no_oa_url_in_crossref"}
    for url in pdf_urls[:3]:
        pdf, _info = _http_get_pdf(url, timeout=60)
        if pdf:
            return _save_and_validate(pdf, ref)
    return "failed", {"reason": "all_oa_urls_failed"}


# ─────────────────────────────────────────────────────────────────────────────
# Source 0 — `oa_url` injecté par l'utilisateur dans le frontmatter
# ─────────────────────────────────────────────────────────────────────────────

def try_manual_url(ref: Ref) -> tuple[str, dict]:
    """F0 — URL fournie par l'utilisateur via le frontmatter `oa_url`.

    Permet à l'utilisateur (ou à un agent) d'injecter une URL connue
    quand la cascade automatique ne trouve pas le bon PDF (page d'auteur,
    dépôt universitaire spécifique, NIME, KIT, etc.). Évite de devoir
    bricoler manuellement le PDF.

    Le résolveur landing→PDF s'applique : si l'URL renvoie une page HTML,
    on suit `citation_pdf_url` automatiquement.
    """
    url = (ref.frontmatter.get("oa_url") or "").strip()
    if not url:
        return "no_source", {"reason": "no_oa_url_in_frontmatter"}
    pdf, info = _http_get_pdf(url, timeout=60)
    if not pdf:
        return "failed", {"reason": "manual_url_dl_failed",
                          "url": url, "trace": info}
    r = _save_and_validate(pdf, ref)
    if r[0] == "success":
        r[1]["via"] = "manual_oa_url"
        r[1]["chain"] = info.get("chain", [])
    return r


# ─────────────────────────────────────────────────────────────────────────────
# Source 2 — arXiv direct
# ─────────────────────────────────────────────────────────────────────────────

def try_arxiv(ref: Ref) -> tuple[str, dict]:
    aid = _arxiv_id(ref)
    if not aid:
        return "no_source", {"reason": "no_arxiv_id"}
    url = f"https://arxiv.org/pdf/{aid}.pdf"
    pdf = _http_get(url, timeout=60)
    if not pdf:
        return "failed", {"reason": "arxiv_dl_failed"}
    return _save_and_validate(pdf, ref)


# ─────────────────────────────────────────────────────────────────────────────
# Source 3 — OpenAlex oa_url
# ─────────────────────────────────────────────────────────────────────────────

def try_openalex(ref: Ref) -> tuple[str, dict]:
    doi = _doi(ref)
    title = ref.frontmatter.get("title") or ""
    if not doi and not title:
        return "no_source", {"reason": "no_doi_no_title"}
    if doi:
        api = f"https://api.openalex.org/works/doi:{doi}"
    else:
        from urllib.parse import quote
        api = f"https://api.openalex.org/works?search={quote(title[:100])}&per-page=1"
    try:
        with urllib.request.urlopen(api, timeout=15) as r:
            import json
            data = json.loads(r.read())
    except Exception as e:
        return "failed", {"reason": f"openalex_api:{type(e).__name__}"}
    if "results" in data:
        results = data.get("results") or []
        if not results:
            return "no_source", {"reason": "openalex_empty_results"}
        work = results[0]
    else:
        work = data
    oa = (work.get("open_access") or {}).get("oa_url") or work.get("oa_url")
    if not oa:
        return "no_source", {"reason": "no_oa_url"}
    pdf, info = _http_get_pdf(oa, timeout=60)
    if not pdf:
        return "failed", {"reason": "openalex_oa_dl_failed", "trace": info}
    return _save_and_validate(pdf, ref)


# ─────────────────────────────────────────────────────────────────────────────
# Source 4 — Unpaywall (via helper)
# ─────────────────────────────────────────────────────────────────────────────

def try_unpaywall(ref: Ref) -> tuple[str, dict]:
    doi = _doi(ref)
    if not doi:
        return "no_source", {"reason": "no_doi"}
    try:
        from oa_finder import get_unpaywall_pdf_urls
        urls = get_unpaywall_pdf_urls(doi)
    except Exception as e:
        return "failed", {"reason": f"unpaywall_helper:{type(e).__name__}"}
    if not urls:
        return "no_source", {"reason": "no_unpaywall_url"}
    for url in urls[:3]:
        pdf, _info = _http_get_pdf(url, timeout=60)
        if pdf:
            return _save_and_validate(pdf, ref)
    return "failed", {"reason": "all_unpaywall_failed"}


# ─────────────────────────────────────────────────────────────────────────────
# Source 5 — HAL / CORE / Zenodo (via helper CORE + REST HAL)
# ─────────────────────────────────────────────────────────────────────────────

def try_hal(ref: Ref) -> tuple[str, dict]:
    title = ref.frontmatter.get("title") or ""
    author = ref.frontmatter.get("author") or ""
    if not title:
        return "no_source", {"reason": "no_title_for_hal_query"}
    from urllib.parse import quote
    q = quote(f'title_t:"{title[:100]}"')
    api = f"https://api.archives-ouvertes.fr/search/?q={q}&fl=halId_s,fileMain_s&rows=3&wt=json"
    try:
        with urllib.request.urlopen(api, timeout=15) as r:
            import json
            docs = (json.loads(r.read()).get("response") or {}).get("docs") or []
    except Exception as e:
        return "failed", {"reason": f"hal_api:{type(e).__name__}"}
    for d in docs:
        url = d.get("fileMain_s")
        hal_id = d.get("halId_s")
        # Tentative 1 : fileMain_s direct (avec résolveur landing→PDF)
        if url:
            pdf, _info = _http_get_pdf(url, timeout=60)
            if pdf:
                r = _save_and_validate(pdf, ref)
                if r[0] in ("success", "page1_failed"):
                    r[1]["hal_id"] = hal_id
                    return r
        # Tentative 2 : URL canonique /document (force la sortie PDF)
        if hal_id:
            doc_url = f"https://hal.science/{hal_id}/document"
            pdf, _info = _http_get_pdf(doc_url, timeout=60)
            if pdf:
                r = _save_and_validate(pdf, ref)
                if r[0] in ("success", "page1_failed"):
                    r[1]["hal_id"] = hal_id
                    r[1]["via"] = "hal_document_url"
                    return r
    return "no_source", {"reason": "hal_no_match_or_no_file"}


def try_core(ref: Ref) -> tuple[str, dict]:
    title = ref.frontmatter.get("title") or ""
    author = ref.frontmatter.get("author") or ""
    if not title:
        return "no_source", {"reason": "no_title"}
    try:
        from oa_finder import get_core_pdf_urls
        urls = get_core_pdf_urls(title, author)
    except Exception as e:
        return "failed", {"reason": f"core_helper:{type(e).__name__}"}
    for url in urls[:2]:
        pdf, _info = _http_get_pdf(url, timeout=60)
        if pdf:
            return _save_and_validate(pdf, ref)
    return "no_source", {"reason": "no_core_match"}


# ─────────────────────────────────────────────────────────────────────────────
# Source 5c — Internet Archive (via helper archive_org_helper)
# ─────────────────────────────────────────────────────────────────────────────

def try_archive_org(ref: Ref) -> tuple[str, dict]:
    """Cascade Internet Archive : search (3 stratégies) → metadata → DL.

    Couvre les refs sans DOI publiées dans des journaux indiens / proceedings
    spécialisés non indexés Crossref (typiquement la production Bernard Bel
    et Arnold dans Sangit Natak Akademi).

    Stratégies de query enchaînées (vu que IA full-text indexing est strict) :
      Q1. titre complet + auteur + année
      Q2. mots distinctifs du titre (≥ 5 lettres) + auteur
      Q3. auteur + année (last resort — `best_search_match` filtre
          ensuite par title_similarity ≥ 0.5 + auteur match + score ≥ 4)

    Anti-homonymie : déléguée à `archive_org_helper.best_search_match` qui
    refuse tout match sans titre fourni et filtre score ≥ 4.

    G5 (pas de `no_source` muet) : chaque échec a un motif descriptif.
    """
    fm = ref.frontmatter
    author = (fm.get("author") or "").strip()
    title = (fm.get("title") or "").strip()
    year = str(fm.get("year") or "").strip()
    if not title:
        return "no_source", {"reason": "no_title_for_archive_org_search"}

    try:
        from archive_org_helper import (
            search_items, best_search_match, get_metadata,
            is_borrow_only, find_pdf_file,
        )
    except Exception as e:
        return "failed", {"reason": f"ia_helper_import:{type(e).__name__}:{str(e)[:60]}"}

    # Construire les 3 queries
    distinctive = " ".join(w for w in title.replace("-", " ").split()
                            if len(w) >= 5 and w.isalpha())[:120]
    queries = [
        f"{title} {author} {year}".strip(),
        f"{distinctive} {author}".strip() if distinctive else None,
        f"{author} {year}".strip() if author and year else None,
    ]
    queries = [q for q in queries if q]

    # Collecter les résultats des 3 queries, déduper par identifier
    all_results = []
    seen = set()
    tried = []
    for q in queries:
        results = search_items(q, limit=5, mediatype="texts")
        tried.append({"q": q, "hits": len(results)})
        for r in results:
            ident = r.get("identifier")
            if ident and ident not in seen:
                seen.add(ident)
                all_results.append(r)
        if all_results:
            # On a au moins quelques candidats — best_search_match va filtrer.
            # Pas besoin d'épuiser les 3 queries si on a déjà du matériel.
            break

    if not all_results:
        return "no_source", {"reason": "ia_no_results_3_queries", "queries_tried": tried}

    best = best_search_match(all_results, author, title, year)
    if not best:
        return "no_source", {"reason": "ia_no_match_above_threshold",
                              "candidates": len(all_results),
                              "queries_tried": tried}

    identifier = best.get("identifier", "")
    meta = get_metadata(identifier)
    if is_borrow_only(meta):
        return "failed", {"reason": "ia_borrow_only_needs_login",
                          "detail": f"archive.org/details/{identifier}"}
    pdf_name = find_pdf_file(meta)
    if not pdf_name:
        return "failed", {"reason": "ia_item_found_but_no_pdf",
                          "detail": f"archive.org/details/{identifier}"}

    # DL direct : on quote le nom de fichier (peut contenir des '%' littéraux
    # comme dans dli.ministry.16926/JSNA%2867%2929-41.pdf — les '%' doivent
    # devenir '%25' pour l'URL. Le helper download_public_pdf ne le fait pas.)
    from urllib.parse import quote
    dl_url = f"https://archive.org/download/{identifier}/{quote(pdf_name, safe='')}"
    pdf_bytes = _http_get(dl_url, timeout=180,
                          headers={"Referer": f"https://archive.org/details/{identifier}"})
    if not pdf_bytes or not _is_valid_pdf(pdf_bytes):
        return "failed", {"reason": "ia_dl_returned_invalid_pdf",
                          "detail": f"archive.org/details/{identifier}",
                          "url": dl_url}
    data = pdf_bytes
    verdict, save_info = _save_and_validate(data, ref)
    if verdict in ("success", "page1_failed"):
        save_info["via"] = "archive_org"
        save_info["ia_identifier"] = identifier
        save_info["ia_pdf"] = pdf_name
    return verdict, save_info


# ─────────────────────────────────────────────────────────────────────────────
# Source 6/7 — Sci-Hub et Anna's Archive — EXTRAITS dans lib/shadow/ (opt-in)
# Voir RESEARCH_ENABLE_SHADOW_LIBS=1 + DISCLAIMER.md
# ─────────────────────────────────────────────────────────────────────────────


# ─────────────────────────────────────────────────────────────────────────────
# Source 8 — WebSearch (skipped en CLI worker) — flag pour Claude Code
# ─────────────────────────────────────────────────────────────────────────────

def try_websearch(ref: Ref) -> tuple[str, dict]:
    """F4 — append la query au manifest `_websearch_queue.md`.

    Décision V1 : abandon des scrapers DDG/Scholarly (fragiles, exactement le
    piège L18). À la place, on **délègue** à une session Claude Code
    interactive (qui a accès au tool WebSearch MCP) : le worker ajoute la
    query à un manifest markdown, et l'utilisateur ou un agent les consomme
    en batch.

    Retourne toujours `no_source` car aucun PDF acquis ici — l'étape suivante
    (manual queue) sera prise.
    """
    from .config import REGISTRY
    from datetime import datetime, timezone

    fm = ref.frontmatter
    title = (fm.get("title") or "").strip()
    author = (fm.get("author") or "").strip()
    year = fm.get("year")

    if not title and not author:
        return "no_source", {"reason": "no_title_author_for_websearch_query"}

    query_parts = []
    if title:
        query_parts.append(f'"{title}"')
    if author:
        query_parts.append(f'"{author}"')
    query_parts.append("filetype:pdf")
    query = " ".join(query_parts)

    queue_file = REGISTRY / "_websearch_queue.md"
    if not queue_file.exists():
        queue_file.write_text(
            "# WebSearch queue — refs with no hit in the automatic cascade\n\n"
            "These refs exhausted Crossref/arXiv/OpenAlex/Unpaywall/HAL/CORE/"
            "archive.org/Sci-Hub/AA without finding a PDF. They are waiting "
            "for a manual WebSearch through interactive Claude Code.\n\n"
            "Format: `| slug | query | created_at | status |`\n\n"
            "| slug | query | created_at | status |\n"
            "|------|-------|-----------|--------|\n",
            encoding="utf-8",
        )

    line = (
        f"| `{ref.slug}` "
        f"| `{query[:200]}` "
        f"| {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%MZ')} "
        f"| pending |\n"
    )
    # Append-only, vérification que la ref n'est pas déjà dans la queue
    existing = queue_file.read_text(encoding="utf-8")
    if f"`{ref.slug}`" in existing:
        return "no_source", {"reason": "websearch_already_queued",
                              "manifest": str(queue_file.name)}
    with queue_file.open("a", encoding="utf-8") as f:
        f.write(line)
    return "no_source", {"reason": "queued_for_manual_websearch",
                          "manifest": str(queue_file.name),
                          "query": query[:160]}


# ─────────────────────────────────────────────────────────────────────────────
# Orchestrateur
# ─────────────────────────────────────────────────────────────────────────────

_shadow_disclaimer_shown = False


def _warn_shadow_disclaimer_once() -> None:
    """Affiche le disclaimer shadow libs une seule fois par session."""
    global _shadow_disclaimer_shown
    if _shadow_disclaimer_shown:
        return
    _shadow_disclaimer_shown = True
    print(
        "\n[paper-trail] WARNING: shadow libraries enabled.\n"
        "Anna's Archive and Sci-Hub may violate copyright in your\n"
        "jurisdiction. You confirm you have the legal right to access\n"
        "the downloaded material. See DISCLAIMER.md for details.\n",
        file=sys.stderr,
    )


def _build_cascade() -> list[tuple[str, Callable[[Ref], tuple[str, dict]]]]:
    """Construit la cascade — shadow libs conditionnelles via env var."""
    # Ordre : le moins cher d'abord. Les annuaires d'accès ouvert coûtent une
    # requête ; la page de l'éditeur en coûte quelques-unes ; le navigateur
    # coûte plusieurs secondes. Les fonds de l'ombre viennent en dernier.
    from lib.acquire.publisher import try_publisher_doi
    cascade = [
        ("manual_oa_url", try_manual_url),  # F0 — URL fournie via frontmatter
        ("crossref_oa", try_crossref_oa),
        ("arxiv", try_arxiv),
        ("openalex_oa", try_openalex),
        ("unpaywall", try_unpaywall),
        ("hal", try_hal),
        ("core", try_core),
        # Ouvrir simplement l'adresse de l'article chez son éditeur : les
        # annuaires ne référencent pas tout ce que les éditeurs publient.
        ("publisher_doi", try_publisher_doi),
        ("archive_org", try_archive_org),  # F3 — étape 5c (2026-05-24)
    ]

    # Voies pilotées au navigateur. Ce ne sont pas des fonds de l'ombre : elles
    # ne prennent que ce que l'éditeur ou l'auteur met lui-même en ligne. Elles
    # ne s'activent que si un affichage et Playwright sont disponibles.
    from lib.browser_session import available as _browser_available
    _browser_ok, _browser_why = _browser_available()
    if _browser_ok:
        from lib.acquire.publisher_headful import try_publisher_headful
        from lib.acquire.researchgate import available_here as _rg_available
        from lib.acquire.researchgate import try_researchgate
        cascade.append(("publisher_headful", try_publisher_headful))
        _rg_ok, _rg_why = _rg_available()
        if _rg_ok:
            cascade.append(("researchgate", try_researchgate))
        else:
            print(f"[cascade] researchgate source unavailable ({_rg_why}) — "
                  f"it needs your own session cookies, exported to a file "
                  f"named by RESEARCH_BROWSER_COOKIES. "
                  f"Details: docs/ACQUISITION_HEADFUL.md", file=sys.stderr)
    else:
        print(f"[cascade] browser-driven sources unavailable ({_browser_why}) "
              f"— the other sources carry on normally. To enable them: "
              f"`pip install playwright && playwright install chromium`, "
              f"then run under `xvfb-run -a`. "
              f"Details: docs/ACQUISITION_HEADFUL.md", file=sys.stderr)

    if os.environ.get("RESEARCH_ENABLE_SHADOW_LIBS") == "1":
        from lib.shadow.scihub import try_scihub
        from lib.shadow.annas_archive import try_annas_archive
        from lib.shadow.libgen import try_libgen
        _warn_shadow_disclaimer_once()
        cascade += [
            ("scihub_optin", try_scihub),
            ("annas_archive_optin", try_annas_archive),
            # Fonds distinct d'Anna's Archive, sans contrôle anti-robot ni
            # créneau contingenté : il aboutit là où la file d'attente
            # d'Anna's ne délivre plus rien.
            ("libgen_optin", try_libgen),
        ]
        if _browser_ok:
            # Le lecteur d'articles d'Anna's : porte distincte du fonds
            # général, sans file d'attente. À essayer AVANT la voie par
            # créneaux, qui est contingentée et bien plus lente.
            from lib.shadow.annas_scidb import try_annas_scidb
            from lib.shadow.annas_headful import try_annas_headful
            cascade += [
                ("annas_scidb_optin", try_annas_scidb),
                ("annas_headful_optin", try_annas_headful),
            ]
    cascade.append(("websearch", try_websearch))
    return cascade


CASCADE: list[tuple[str, Callable[[Ref], tuple[str, dict]]]] = _build_cascade()


def already_tried(ref: Ref, source: str) -> bool:
    """Vrai si la source a déjà un verdict définitif pour cette ref.

    Verdicts définitifs (skip au prochain passage) :
      - `success` : source a livré le bon PDF, plus la peine
      - `failed`  : source a essayé et n'a rien (réseau, 404, etc.)
      - `skipped_already_tried` : déjà skippée

    Verdicts NON définitifs (la source peut re-tenter) :
      - `no_source` : la source n'avait pas de DOI/UID compatible — peut
        re-tenter si l'UID a changé
      - `page1_failed` : la source a livré un mauvais PDF (homonymie), MAIS
        elle peut avoir d'autres candidats. Le anti-doublon par sha256 dans
        `_save_and_validate` évite de re-traiter le MÊME fichier.
      - `skipped_breaker_open` : circuit-breaker temporaire de session
      - `skipped_already_rejected` : sha256 déjà rejeté, skip instantané
    """
    for a in ref.frontmatter.get("acquisition_attempts") or []:
        if a.get("source") == source and a.get("verdict") in (
            "success", "failed", "skipped_already_tried"
        ):
            return True
    return False


# Registry global de breakers — singleton process-wide, partagé par les
# appels successifs à run_cascade dans la même session worker.
_BREAKERS: BreakerRegistry | None = None


def get_breakers() -> BreakerRegistry:
    """Accès au registre global de breakers (init paresseuse)."""
    global _BREAKERS
    if _BREAKERS is None:
        _BREAKERS = BreakerRegistry(fail_threshold=5, window_s=60.0)
    return _BREAKERS


def reset_breakers() -> None:
    """Réinitialise le registre global. Utile pour les tests."""
    global _BREAKERS
    _BREAKERS = None


def run_cascade(ref: Ref, breakers: BreakerRegistry | None = None
                ) -> tuple[str, list[dict]]:
    """Lance la cascade. Retourne ('success'|'cascade_exhausted', attempts_log).

    Les attempts sont retournés pour que le caller les append au YAML.

    Si `breakers` n'est pas fourni, utilise le registre global de la session.
    Une source dont le breaker est ouvert est skippée avec verdict
    `skipped_breaker_open` (et reason explicite).

    **Step 0** (local-first) : avant de tenter les sources externes, on
    vérifie si le PDF est déjà sur disque (pdf_path ou legacy_pdf_path
    du frontmatter). Si oui, on valide page 1 in-place et on saute la
    cascade. Évite de re-télécharger un PDF déjà présent localement.
    """
    if breakers is None:
        breakers = get_breakers()

    attempts: list[dict] = []

    # Step 0 — local PDF check
    local_result = _check_local_pdf(ref)
    if local_result is not None:
        verdict, info = local_result
        attempts.append({"source": "local_pdf_index", "verdict": verdict,
                         **info})
        if verdict in ("success", "scan_needs_ocr"):
            return verdict, attempts
        # Si page1_failed (jamais retourné pour l'instant) ou autre,
        # on log et on continue avec la cascade externe.

    for source, fn in CASCADE:
        if already_tried(ref, source):
            attempts.append({"source": source, "verdict": "skipped_already_tried"})
            continue
        if breakers[source].is_open():
            attempts.append({
                "source": source,
                "verdict": "skipped_breaker_open",
                "reason": "5_consecutive_fails_in_60s",
            })
            continue
        verdict, info = fn(ref)
        entry = {"source": source, "verdict": verdict, **info}
        attempts.append(entry)
        # On considère la source OK si elle a su livrer (success) OU livrer
        # un PDF qui a échoué la validation page 1 (page1_failed = source a
        # délivré, la ref est juste un mauvais hit — pas la faute de la source).
        # failed / no_source comptent comme un échec côté breaker.
        breakers[source].record(success=verdict in ("success", "page1_failed"))
        if verdict == "success":
            return "success", attempts
        # En cas de page1_failed, on quarantine et on continue (homonymie probable).
        # En cas de failed/no_source, on continue.
        time.sleep(1)  # courtoisie réseau
    return "cascade_exhausted", attempts
