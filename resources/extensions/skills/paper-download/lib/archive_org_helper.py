"""Helper pour archive.org : search, metadata, download direct (public domain),
+ workflow Borrow (cookies session utilisateur).

API documentée : https://archive.org/developers/

Sans clé requise. Rate-limit raisonnable (1 req/sec).
"""
import json
import re
import subprocess
import time
from pathlib import Path
from typing import Optional

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def search_items(query: str, limit: int = 5, mediatype: str = None) -> list[dict]:
    """Search archive.org items via advancedsearch.

    Args:
        query: titre+auteur+année ou expression complète
        limit: nb max results
        mediatype: 'texts' (livres/papers), 'audio', etc. None = tous.

    Returns: list of dicts with id, title, creator, date, mediatype, ...
    """
    q = query
    if mediatype:
        q = f"({query}) AND mediatype:{mediatype}"
    try:
        r = requests.get(
            "https://archive.org/advancedsearch.php",
            params={
                "q": q,
                "output": "json",
                "rows": limit,
                "fl[]": ["identifier", "title", "creator", "date", "mediatype", "language", "publicdate"],
            },
            headers={"User-Agent": UA},
            timeout=15,
        )
        if r.status_code == 200:
            return r.json().get("response", {}).get("docs", [])
    except Exception as e:
        print(f"  [archive.org search] err: {type(e).__name__}: {str(e)[:60]}")
    return []


def get_metadata(identifier: str) -> dict:
    """Retourne metadata complète d'un item archive.org."""
    try:
        r = requests.get(f"https://archive.org/metadata/{identifier}",
                         headers={"User-Agent": UA}, timeout=15)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        print(f"  [archive.org metadata {identifier}] err: {e}")
    return {}


def find_pdf_file(metadata: dict) -> Optional[str]:
    """Cherche un fichier PDF dans la liste des files de l'item.

    Préfère :
      1. {id}.pdf (le PDF "principal")
      2. {id}_text.pdf
      3. n'importe quel .pdf

    Skip les fichiers chiffrés (DRM).
    """
    files = metadata.get("files", [])
    pdfs = [f for f in files if f.get("name", "").lower().endswith(".pdf")]
    # Skip DRM-encrypted (LCP)
    pdfs = [f for f in pdfs if "encrypted" not in f.get("name", "").lower()]
    if not pdfs:
        return None
    # Préférence : exact id.pdf > id_text.pdf > autre
    item_id = metadata.get("metadata", {}).get("identifier", "")
    for prefix in [f"{item_id}.pdf", f"{item_id}_text.pdf"]:
        for f in pdfs:
            if f.get("name", "").lower() == prefix.lower():
                return f["name"]
    return pdfs[0].get("name")


def is_borrow_only(metadata: dict) -> bool:
    """Détecte si l'item est en Controlled Digital Lending (Borrow only)."""
    md = metadata.get("metadata", {})
    collections = md.get("collection", [])
    if isinstance(collections, str):
        collections = [collections]
    borrow_collections = {"inlibrary", "internetarchivebooks", "printdisabled"}
    return any(c in borrow_collections for c in collections)


def download_public_pdf(identifier: str, out: Path, session_cookies: dict = None) -> bool:
    """DL un PDF public archive.org. Retourne True si succès."""
    meta = get_metadata(identifier)
    if not meta:
        return False
    if is_borrow_only(meta) and not session_cookies:
        print(f"  [archive.org {identifier}] BORROW_ONLY — login + Borrow required")
        return False
    pdf_name = find_pdf_file(meta)
    if not pdf_name:
        print(f"  [archive.org {identifier}] no PDF in this item")
        return False
    url = f"https://archive.org/download/{identifier}/{pdf_name}"
    try:
        r = requests.get(url, headers={"User-Agent": UA},
                         cookies=session_cookies or {},
                         stream=True, timeout=120, allow_redirects=True, verify=False)
        if r.status_code != 200:
            print(f"  [archive.org {identifier}] http={r.status_code}")
            return False
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "wb") as f:
            for chunk in r.iter_content(1 << 16):
                if chunk:
                    f.write(chunk)
        if out.stat().st_size > 3000:
            with open(out, "rb") as f:
                if f.read(8).startswith(b"%PDF"):
                    return True
        out.unlink(missing_ok=True)
    except Exception as e:
        print(f"  [archive.org dl {identifier}] err: {type(e).__name__}: {str(e)[:60]}")
    return False


def best_search_match(results: list, author: str, title: str, year: str) -> Optional[dict]:
    """Score les results d'une search archive.org. Retourne le meilleur SEULEMENT si titre fournit.

    ⚠️ STRICT : refuse les matches sans titre fourni (homonymie auteur+année garantie sinon).
    Cf. RULES sec. 5 : bad match Hamanaka politologue, Goguen romancier, etc.
    """
    if not title:
        # Sans titre, pas de match fiable possible — éviter la homonymie auteur+année.
        return None
    from difflib import SequenceMatcher
    def norm(s):
        return re.sub(r"[^\w\s]", " ", (s or "").lower()).strip()
    best = None
    best_score = -1
    for r in results:
        t = r.get("title", "")
        sim_t = SequenceMatcher(None, norm(title), norm(t)).ratio()
        creator = " ".join(r.get("creator", []) if isinstance(r.get("creator"), list) else [r.get("creator", "")])
        a_ok = 1 if author and norm(author).split()[0] in norm(creator) else 0
        y_ok = 0
        date = (r.get("date") or "")[:4]
        if year and date == str(year):
            y_ok = 1
        # Titre similarité OBLIGATOIRE >= 0.5 pour matcher
        if sim_t < 0.5:
            continue
        score = sim_t * 3 + a_ok * 2 + y_ok
        if score > best_score:
            best_score = score
            best = r
    return best if best_score >= 4 else None


def try_archive_org(author: str, title: str, year: str, out: Path,
                    session_cookies: dict = None) -> tuple[bool, str]:
    """Cascade complète archive.org : search → metadata → DL.

    Retourne (success, info_string).
    """
    query = " ".join(p for p in [title, author, year] if p).strip()
    if not query:
        return False, "no_query"
    results = search_items(query, limit=5, mediatype="texts")
    if not results:
        return False, "no_results_archive_org"
    best = best_search_match(results, author, title, year)
    if not best:
        return False, "no_good_match_archive_org"
    identifier = best.get("identifier", "")
    meta = get_metadata(identifier)
    borrow = is_borrow_only(meta)
    pdf_name = find_pdf_file(meta) if meta else None
    if borrow and not session_cookies:
        return False, f"borrow_only [archive.org/details/{identifier}]"
    if not pdf_name:
        return False, f"no_pdf_in_item [archive.org/details/{identifier}]"
    if download_public_pdf(identifier, out, session_cookies):
        return True, f"archive.org/download/{identifier}/{pdf_name}"
    return False, f"dl_failed [archive.org/details/{identifier}]"


# ─── Wrapper Borrow workflow ───

def load_session_cookies(cookies_file: Path) -> dict:
    """Charge cookies depuis un fichier Netscape cookies.txt (export browser)."""
    cookies = {}
    if not cookies_file.exists():
        return cookies
    for line in cookies_file.read_text().splitlines():
        if line.startswith("#") or not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) >= 7 and "archive.org" in parts[0]:
            cookies[parts[5]] = parts[6]
    return cookies


if __name__ == "__main__":
    # Test : recherche Castellano 1984
    import sys
    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])
    else:
        query = "Castellano Tonal Hierarchies North India 1984"
    print(f"Search archive.org: {query}")
    results = search_items(query, limit=3, mediatype="texts")
    for r in results:
        print(f"  {r.get('identifier')} | {r.get('title','')[:60]} | {r.get('date','')}")
        print(f"    creator: {r.get('creator','')}")
    if results:
        best = best_search_match(results, "Castellano", "Tonal Hierarchies", "1984")
        if best:
            print(f"\nBest match: {best.get('identifier')}")
            meta = get_metadata(best['identifier'])
            print(f"  borrow_only: {is_borrow_only(meta)}")
            print(f"  pdf_file: {find_pdf_file(meta)}")
