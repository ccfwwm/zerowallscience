#!/usr/bin/env python3
"""
Book downloader via Anna's Archive + libgen mirrors
Usage: python download_books.py [fichier_json] [dossier_sortie]

Nommage: Auteur - Titre - LANGUE.ext
Sources (en cascade):
  1. libgen.li (GET direct, rapide)
  2. library.lol (Cloudflare IPFS)
  3. Anna's Archive slow_download via Playwright (navigateur headless)

Post-traitement: conversion automatique epub/djvu/mobi → PDF via Calibre
"""
import json
import sys
import time
import re
import subprocess
import logging
import urllib3
from pathlib import Path
from urllib.parse import urljoin

import cloudscraper
import requests
from bs4 import BeautifulSoup

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("download_books.log", encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)

ANNAS_BASE = "https://annas-archive.gl"
DELAY_SEARCH = 4
DELAY_DOWNLOAD = 5
TIMEOUT_PAGE = 30
TIMEOUT_DL = 300
CHUNK_TIMEOUT = 300  # 5 min max sans recevoir de données = stall
SLOW_SERVERS_TO_TRY = 9
CALIBRE_PATH = "/mnt/c/Program Files/Calibre2/ebook-convert.exe"
CONVERT_TO_PDF = True


def convert_to_pdf(filepath):
    """Convertit epub/djvu/mobi en PDF via Calibre. Retourne le chemin PDF."""
    filepath = Path(filepath)
    if filepath.suffix.lower() == ".pdf":
        return str(filepath)

    pdf_path = filepath.with_suffix(".pdf")
    if pdf_path.exists() and pdf_path.stat().st_size > 10_000:
        log.info(f"  PDF already converted: {pdf_path.name}")
        return str(pdf_path)

    log.info(f"  Conversion {filepath.suffix} → PDF...")
    try:
        result = subprocess.run(
            [CALIBRE_PATH, str(filepath), str(pdf_path)],
            capture_output=True, text=True, timeout=300,
        )
        if result.returncode == 0 and pdf_path.exists():
            log.info(f"  ✓ Converti: {pdf_path.name} ({pdf_path.stat().st_size / 1024 / 1024:.1f} MB)")
            filepath.unlink()  # supprimer l'original
            return str(pdf_path)
        else:
            log.warning(f"  Conversion failed: {result.stderr[:100]}")
    except Exception as e:
        log.warning(f"  Conversion failed: {type(e).__name__}: {str(e)[:50]}")

    return str(filepath)


def create_session():
    session = cloudscraper.create_scraper()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/120.0.0.0 Safari/537.36",
    })
    return session


def detect_ext(content_type, content_disposition=""):
    """Détecte l'extension depuis les headers HTTP."""
    ct = content_type.lower()
    if "epub" in ct:
        return "epub"
    if "djvu" in ct:
        return "djvu"
    if "pdf" in ct:
        return "pdf"
    cd = content_disposition.lower()
    for ext in ("pdf", "epub", "djvu", "mobi", "azw3"):
        if f".{ext}" in cd:
            return ext
    return "pdf"


def detect_lang(isbn, title):
    """Devine la langue depuis l'ISBN ou le titre."""
    isbn = str(isbn)
    if isbn.startswith("9782"):
        return "FR"
    if isbn.startswith("9783"):
        return "DE"
    if isbn.startswith("97888"):
        return "IT"
    for w in ("de la", "du ", "les ", "des ", " et ", "une ", "pour "):
        if w in title.lower():
            return "FR"
    return "EN"


def make_filename(author, title, lang, ext):
    """Crée un nom propre: Auteur - Titre - LANG.ext"""
    author = author.split(",")[0].strip()
    title = title[:60].rstrip(". ")
    name = f"{author} - {title} - {lang}.{ext}"
    return re.sub(r'[<>:"/\\|?*]', '_', name)


def set_stream_timeout(response, timeout):
    """Timeout sur le socket pour détecter les downloads bloqués."""
    try:
        response.raw._fp.fp.raw.settimeout(timeout)  # HTTPS
    except (AttributeError, TypeError):
        try:
            response.raw._fp.fp.settimeout(timeout)  # HTTP
        except (AttributeError, TypeError):
            pass


MAGIC_BYTES = {
    b"%PDF": "pdf",
    b"PK\x03\x04": "epub",  # ZIP/EPUB
    b"Rar!": "rar",
    b"\x1f\x8b": "gz",
    b"AT&T": "djvu",        # AT&TFORM
}


def detect_real_ext(filepath):
    """Détecte l'extension réelle via les magic bytes du fichier."""
    with open(filepath, "rb") as f:
        header = f.read(16)
    for magic, ext in MAGIC_BYTES.items():
        if header.startswith(magic):
            return ext
    # HTML/texte = fichier invalide
    try:
        text = header.decode("utf-8", errors="ignore").lower()
        if "<html" in text or "<!doc" in text:
            return "html"
    except Exception:
        pass
    return None


def save_file(response, output_dir, author, title, lang):
    """Sauvegarde la réponse HTTP (requests) en fichier avec nom propre."""
    ct = response.headers.get("Content-Type", "")
    cd = response.headers.get("Content-Disposition", "")
    ext = detect_ext(ct, cd)
    filename = make_filename(author, title, lang, ext)
    out_path = output_dir / filename

    set_stream_timeout(response, CHUNK_TIMEOUT)

    total = 0
    try:
        with open(out_path, "wb") as f:
            for chunk in response.iter_content(8192):
                total += len(chunk)
                f.write(chunk)
    except Exception as e:
        log.warning(f"  Download interrupted after {total / 1024 / 1024:.1f} MB: {type(e).__name__}")
        out_path.unlink(missing_ok=True)
        raise

    if total < 10_000:
        out_path.unlink(missing_ok=True)
        log.warning(f"  File too small ({total} bytes), deleted")
        return None

    # Vérifier les magic bytes et corriger l'extension si nécessaire
    real_ext = detect_real_ext(out_path)
    if real_ext == "html":
        log.warning(f"  HTML file disguised as {ext}, deleted")
        out_path.unlink(missing_ok=True)
        return None
    if real_ext == "rar" or real_ext == "gz":
        log.warning(f"  {real_ext} archive not supported, deleted")
        out_path.unlink(missing_ok=True)
        return None
    if real_ext and real_ext != ext:
        new_filename = make_filename(author, title, lang, real_ext)
        new_path = output_dir / new_filename
        out_path.rename(new_path)
        out_path = new_path
        filename = new_filename
        log.info(f"  Extension corrected: .{ext} → .{real_ext}")

    log.info(f"  ✓ {filename} ({total / 1024 / 1024:.1f} MB)")
    return str(out_path)


def save_file_from_bytes(data, url, output_dir, author, title, lang):
    """Sauvegarde des bytes bruts (Playwright) en fichier avec nom propre."""
    # Deviner l'extension depuis l'URL
    ext = "pdf"
    url_lower = url.lower()
    for e in ("epub", "djvu", "mobi"):
        if e in url_lower:
            ext = e
    filename = make_filename(author, title, lang, ext)
    out_path = output_dir / filename

    if len(data) < 10_000:
        log.warning(f"  File too small ({len(data)} bytes), ignored")
        return None

    with open(out_path, "wb") as f:
        f.write(data)

    log.info(f"  ✓ {filename} ({len(data) / 1024 / 1024:.1f} MB)")
    return str(out_path)


# ── Source 1: libgen.li ──────────────────────────────────────────

def try_libgen_li(session, md5, output_dir, author, title, lang):
    url = f"https://libgen.li/ads.php?md5={md5}"
    try:
        resp = session.get(url, timeout=TIMEOUT_PAGE)
        if resp.status_code != 200:
            return None
        soup = BeautifulSoup(resp.text, "html.parser")
        dl_link = soup.select_one('a[href*="get.php"]')
        if not dl_link:
            return None
        get_url = urljoin("https://libgen.li/", dl_link.get("href"))
        log.info(f"  [libgen.li] Downloading...")
        dl = session.get(get_url, timeout=TIMEOUT_DL, stream=True)
        if dl.status_code == 200:
            ct = dl.headers.get("Content-Type", "")
            if any(t in ct for t in ("pdf", "epub", "octet", "djvu")):
                return save_file(dl, output_dir, author, title, lang)
    except Exception as e:
        log.warning(f"  [libgen.li] {type(e).__name__}")
    return None


# ── Source 2: library.lol ────────────────────────────────────────

def try_library_lol(session, md5, output_dir, author, title, lang):
    url = f"https://library.lol/main/{md5.upper()}"
    try:
        resp = session.get(url, timeout=TIMEOUT_PAGE, verify=False)
        if resp.status_code != 200:
            return None
        soup = BeautifulSoup(resp.text, "html.parser")
        dl_link = (
            soup.select_one('a[href*="cloudflare-ipfs"]')
            or soup.select_one('#download h2 a')
            or soup.select_one('a[href*="ipfs.io"]')
        )
        if not dl_link:
            return None
        href = dl_link.get("href")
        log.info(f"  [library.lol] Downloading...")
        dl = session.get(href, timeout=TIMEOUT_DL, stream=True, verify=False)
        if dl.status_code == 200:
            ct = dl.headers.get("Content-Type", "")
            if any(t in ct for t in ("pdf", "epub", "octet", "djvu")):
                return save_file(dl, output_dir, author, title, lang)
    except Exception as e:
        log.warning(f"  [library.lol] {type(e).__name__}")
    return None


# ── Source 3: Anna's Archive slow_download via Playwright ────────

def try_annas_slow(playwright_browser, md5, output_dir, author, title, lang):
    """Utilise Playwright pour passer Cloudflare et télécharger via slow servers."""
    if not playwright_browser:
        return None

    for server_idx in range(SLOW_SERVERS_TO_TRY):
        url = f"{ANNAS_BASE}/slow_download/{md5}/0/{server_idx}"
        log.info(f"  [anna slow #{server_idx+1}] Tentative...")

        try:
            context = playwright_browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                           "AppleWebKit/537.36 (KHTML, like Gecko) "
                           "Chrome/120.0.0.0 Safari/537.36",
            )
            page = context.new_page()
            page.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
            )

            page.goto(url, timeout=60000)

            # Attendre que Cloudflare passe (max 15s)
            for _ in range(15):
                body = page.inner_text("body")[:100]
                if "Checking" not in body:
                    break
                time.sleep(1)

            # Attendre le décompte + apparition du lien (max 10 min)
            EXCLUDE = ("annas-archive", "jdownloader", "reddit", "matrix.to",
                       "software.annas", "open-slum", "translate.")
            download_link = None
            # Vérifier qu'on est bien sur une page slow_download
            body_check = page.inner_text("body")
            if "patienter" not in body_check.lower() and "wait" not in body_check.lower() and "seconde" not in body_check.lower():
                # Pas de décompte visible → mauvaise page
                log.info(f"  [anna slow #{server_idx+1}] No countdown page, skipping")
                page.close()
                context.close()
                time.sleep(3)
                continue
            for wait in range(120):  # 120 x 5s = 10 min max
                download_link = page.query_selector('a[href*="/d3/"], a[href*="/d2/"], a[href*="/d1/"]')
                if download_link:
                    break
                # Fallback: lien externe hors sites parasites
                all_links = page.query_selector_all("a[href^='http']")
                for link in all_links:
                    text = (link.text_content() or "").lower()
                    href = link.get_attribute("href") or ""
                    if "download" in text and not any(x in href for x in EXCLUDE):
                        download_link = link
                        break
                if download_link:
                    break
                if wait == 0:
                    log.info(f"  [anna slow #{server_idx+1}] Waiting for the countdown...")
                if wait % 12 == 11:  # log toutes les ~60s
                    log.info(f"  [anna slow #{server_idx+1}] Toujours en attente ({(wait+1)*5}s)...")
                time.sleep(5)

            if download_link:
                dl_url = download_link.get_attribute("href")
                log.info(f"  [anna slow #{server_idx+1}] Link found: {dl_url[:60]}...")

                # Télécharger avec requests (plus fiable pour gros fichiers)
                page.close()
                context.close()

                dl = requests.get(dl_url, timeout=TIMEOUT_DL, stream=True, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                  "AppleWebKit/537.36"
                })
                if dl.status_code == 200:
                    ct = dl.headers.get("Content-Type", "")
                    if any(t in ct for t in ("pdf", "epub", "octet", "djvu")):
                        return save_file(dl, output_dir, author, title, lang)
                    elif int(dl.headers.get("Content-Length", "0")) > 50_000:
                        return save_file(dl, output_dir, author, title, lang)
                log.warning(f"  [anna slow #{server_idx+1}] Download failed: HTTP {dl.status_code}")
            else:
                log.info(f"  [anna slow #{server_idx+1}] No link found")
                page.close()
                context.close()

        except Exception as e:
            log.warning(f"  [anna slow #{server_idx+1}] {type(e).__name__}: {str(e)[:40]}")
            try:
                page.close()
                context.close()
            except Exception:
                pass

        time.sleep(3)

    return None


# ── Recherche Anna's Archive ─────────────────────────────────────

def _parse_size_mb(size_str):
    """Convertit '9.2MB' ou '120KB' en float MB."""
    size_str = size_str.strip().upper()
    try:
        if "GB" in size_str:
            return float(size_str.replace("GB", "")) * 1024
        if "MB" in size_str:
            return float(size_str.replace("MB", ""))
        if "KB" in size_str:
            return float(size_str.replace("KB", "")) / 1024
    except ValueError:
        pass
    return 999  # inconnu → basse priorité


def _score_result(fmt, size_mb, lang_code):
    """Score un résultat: plus petit = meilleur.
    Priorité: PDF<10MB > non-PDF convertible > PDF gros. FR > EN > autre."""
    lang_score = {"fr": 0, "en": 1}.get(lang_code, 2)
    if fmt == "pdf" and size_mb < 10:
        return 0 * 3 + lang_score  # 0-2
    if fmt in ("epub", "djvu", "mobi"):
        return 1 * 3 + lang_score  # 3-5
    if fmt == "pdf":
        return 2 * 3 + lang_score  # 6-8
    return 9 * 3 + lang_score  # inconnu


def search_annas_multi(pw_browser, query, label=""):
    """Recherche sur Anna's Archive, retourne une liste triée de résultats
    [{md5, fmt, size_mb, lang, title, score}, ...] par ordre de préférence."""
    if not pw_browser:
        return []
    url = f"{ANNAS_BASE}/search?q={query}"
    log.info(f"  {label}: recherche Playwright...")
    try:
        context = pw_browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) "
                       "Chrome/120.0.0.0 Safari/537.36",
        )
        page = context.new_page()
        page.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
        )
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        time.sleep(5)
        # Attendre Cloudflare
        for _ in range(15):
            body = page.inner_text("body")[:100]
            if "Checking" not in body:
                break
            time.sleep(1)

        # Extraire les cartes de résultats via JS
        raw = page.evaluate("""() => {
            const cards = document.querySelectorAll('div[class*="border-b"]');
            const results = [];
            const seen = new Set();
            for (const card of cards) {
                const link = card.querySelector('a[href*="/md5/"]');
                if (!link) continue;
                if (link.closest('.header') || link.closest('.js-recent-downloads')) continue;
                const href = link.getAttribute('href') || '';
                const md5 = href.split('/').pop();
                if (seen.has(md5)) continue;
                seen.add(md5);
                const text = card.innerText;
                results.push({md5, text: text.substring(Math.max(0, text.length - 200))});
                if (results.length >= 15) break;
            }
            return results;
        }""")
        page.close()
        context.close()

        # Parser les métadonnées depuis la fin du texte de chaque carte
        # Format: "français [fr] · PDF · 9.0MB · 1971 · 📘 Livre · 🚀/..."
        results = []
        for r in raw:
            md5 = r["md5"]
            tail = r["text"]
            meta = re.search(
                r"(\w+)\s*\[(\w+)\]\s*·\s*(\w+)\s*·\s*([\d.,]+\s*[KMG]B)", tail
            )
            if not meta:
                continue
            lang_code = meta.group(2).lower()
            fmt = meta.group(3).lower()
            size_mb = _parse_size_mb(meta.group(4))
            score = _score_result(fmt, size_mb, lang_code)
            results.append({
                "md5": md5, "fmt": fmt, "size_mb": size_mb,
                "lang": lang_code, "score": score,
            })

        results.sort(key=lambda x: x["score"])
        if results:
            best = results[0]
            log.info(f"  {label}: {len(results)} results, best: "
                     f"[{best['lang']}] {best['fmt']} {best['size_mb']:.1f}MB (md5: {best['md5'][:12]}...)")
        else:
            log.info(f"  {label}: no result")
        return results

    except Exception as e:
        log.warning(f"  {label} (Playwright): {type(e).__name__}: {str(e)[:40]}")
        try:
            page.close()
            context.close()
        except Exception:
            pass
    return []


def search_by_title(pw_browser, author, title):
    """Cherche sur Anna's Archive par auteur + titre."""
    surname = author.split(",")[0].split(".")[-1].split("&")[0].strip()
    # Nettoyer le titre : retirer contenu entre parenthèses, ponctuation
    clean_title = re.sub(r'\([^)]*\)', '', title)  # retirer (...)
    clean_title = re.sub(r'[:()\[\]{}"\'«»]', ' ', clean_title)
    words = [w for w in clean_title.split() if len(w) > 3][:3]
    query = f"{surname} {' '.join(words)}"
    return search_annas_multi(pw_browser, query, label=f"\"{query}\"")


# ── Process principal ─────────────────────────────────────────────

def is_already_downloaded(output_dir, author, title):
    """Vérifie si un fichier correspondant existe déjà (dossier principal, nouveaux, archives)."""
    author_short = author.split(",")[0].strip()
    prefix = f"{author_short} - {title[:60]}"
    prefix_clean = re.sub(r'[<>:"/\\|?*]', '_', prefix).lower()
    for subdir in [output_dir, output_dir / "nouveaux", output_dir / "archives"]:
        if not subdir.exists():
            continue
        for f in subdir.iterdir():
            if f.is_file() and f.name.lower().startswith(prefix_clean):
                if f.stat().st_size > 10_000:
                    return f.name
    return None


def try_download_convert(result):
    """Tente la conversion PDF. Si échec sur un non-PDF, supprime et retourne None."""
    if not result or not CONVERT_TO_PDF:
        return result
    filepath = Path(result)
    if filepath.suffix.lower() == ".pdf":
        return result
    converted = convert_to_pdf(result)
    if converted and converted.endswith(".pdf"):
        return converted
    # Conversion échouée — supprimer le fichier inutilisable
    log.warning(f"  Conversion impossible, recherche d'un autre format...")
    filepath.unlink(missing_ok=True)
    return None


def try_all_sources(session, pw_browser, md5, output_dir, author, title, lang):
    """Essaie toutes les sources de téléchargement pour un MD5 donné."""
    for try_fn in (try_libgen_li, try_library_lol):
        result = try_fn(session, md5, output_dir, author, title, lang)
        result = try_download_convert(result)
        if result:
            return result
        time.sleep(2)
    result = try_annas_slow(pw_browser, md5, output_dir, author, title, lang)
    result = try_download_convert(result)
    if result:
        return result
    return None


def process_book(session, pw_browser, book, output_dir):
    """Cherche par titre, choisit le meilleur résultat, télécharge."""
    author = book["author"]
    title = book["title"]

    # Si nblm_import == "failed", supprimer l'ancien fichier (pas ceux dans nouveaux/)
    nblm = book.get("nblm_import", "")
    if nblm == "failed":
        # Vérifier d'abord si un nouveau téléchargement existe déjà → skip
        nouveaux_dir = output_dir / "nouveaux"
        if nouveaux_dir.exists():
            for f in nouveaux_dir.iterdir():
                prefix = re.sub(r'[<>:"/\\|?*]', '_', f"{author.split(',')[0].strip()} - {title[:60]}").lower()
                if f.is_file() and f.name.lower().startswith(prefix) and f.stat().st_size > 10_000:
                    log.info(f"\n  ⏭ {author} - {title[:40]}... ALREADY IN nouveaux/")
                    return {"status": "ok", "file": str(f), "isbn": "cached", "md5": "cached"}
        # Supprimer l'ancien fichier invalide du dossier principal uniquement
        for f in output_dir.iterdir():
            prefix = re.sub(r'[<>:"/\\|?*]', '_', f"{author.split(',')[0].strip()} - {title[:60]}").lower()
            if f.is_file() and f.name.lower().startswith(prefix) and f.stat().st_size > 10_000:
                log.info(f"\n  🔄 {author} - {title[:40]}... NBLM failed, suppression de {f.name}")
                f.unlink(missing_ok=True)
                break
    elif nblm == "ok":
        # Phase 1 a déjà archivé ces fichiers au démarrage → skip
        log.info(f"\n  ⏭ {author} - {title[:40]}... OK (archived)")
        return {"status": "ok", "file": "archived", "isbn": "cached", "md5": "cached"}
    else:
        # Skip si déjà téléchargé
        existing = is_already_downloaded(output_dir, author, title)
        if existing:
            log.info(f"\n  ⏭ {author} - {title[:40]}... ALREADY PRESENT: {existing}")
            return {"status": "ok", "file": existing, "isbn": "cached", "md5": "cached"}

    log.info(f"\n{'='*60}")
    log.info(f"[{author}] {title}")

    dl_dir = output_dir / "nouveaux"
    dl_dir.mkdir(exist_ok=True)

    # Recherche par titre (prioritaire — les ISBN de la biblio ne sont pas fiables)
    candidates = search_by_title(pw_browser, author, title)
    if not candidates:
        log.warning(f"  ✗ No result found")
        return {"status": "fail", "title": title}

    # Essayer chaque candidat dans l'ordre de score (meilleur en premier)
    for rank, cand in enumerate(candidates, 1):
        md5 = cand["md5"]
        lang = cand["lang"].upper() if cand["lang"] in ("fr", "en") else cand["lang"].upper()
        log.info(f"  #{rank} [{cand['lang']}] {cand['fmt']} {cand['size_mb']:.1f}MB (md5: {md5[:12]}...)")

        result = try_all_sources(session, pw_browser, md5, dl_dir, author, title, lang)
        if result:
            return {"status": "ok", "file": result, "md5": md5}

        time.sleep(2)

    log.warning(f"  ✗ {len(candidates)} candidates tried, none worked")
    return {"status": "fail", "title": title}


def fetch_book_metadata(pw_browser, md5):
    """Récupère auteur et titre depuis la page Anna's Archive /md5/..."""
    url = f"{ANNAS_BASE}/md5/{md5}"
    try:
        context = pw_browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) "
                       "Chrome/120.0.0.0 Safari/537.36",
        )
        page = context.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        time.sleep(3)
        # Attendre Cloudflare
        for _ in range(10):
            body = page.inner_text("body")[:100]
            if "Checking" not in body:
                break
            time.sleep(1)
        # Extraire titre et auteur depuis la page
        info = page.evaluate("""() => {
            const titleEl = document.querySelector('div.font-semibold.text-2xl');
            let title = titleEl ? titleEl.innerText.replace(/🔍/g, '').trim() : '';
            let author = '';
            const links = document.querySelectorAll('a[href*="/search"]');
            for (const a of links) {
                const icon = a.querySelector('span[class*="user-edit"]');
                if (icon) { author = a.innerText.trim(); break; }
            }
            return { title, author };
        }""")
        page.close()
        context.close()
        return info.get("author", ""), info.get("title", "")
    except Exception as e:
        log.warning(f"  Metadata: {type(e).__name__}: {str(e)[:40]}")
        try:
            page.close()
            context.close()
        except Exception:
            pass
    return "", ""


def find_underscored_books(books, output_dir):
    """Trouve les livres dont le fichier dans nouveaux/ a été préfixé par _."""
    nouveaux_dir = output_dir / "nouveaux"
    if not nouveaux_dir.exists():
        return []
    rejected = []
    for book in books:
        author_short = book["author"].split(",")[0].strip()
        prefix = re.sub(r'[<>:"/\\|?*]', '_', f"{author_short} - {book['title'][:60]}").lower()
        for f in nouveaux_dir.iterdir():
            if f.is_file() and f.name.startswith("_") and f.name[1:].lower().startswith(prefix):
                rejected.append(book)
                break
    return rejected


def interactive_pass(session, pw_browser, failed_books, output_dir):
    """Passe interactive: collecte tous les liens d'abord, puis télécharge."""
    log.info(f"\n{'='*60}")
    log.info(f"=== {len(failed_books)} books to process — URL entry ===")
    log.info(f"Paste an Anna's Archive URL (/md5/...) or press Enter to skip.\n")

    # Phase 1 : collecter toutes les URLs
    todo = []  # [(book, md5), ...]
    skipped = []
    for b in failed_books:
        print(f"  {b['author']} - {b['title']}")
        try:
            url = input("  URL (Entrée = passer) : ").strip()
        except (EOFError, KeyboardInterrupt):
            skipped.extend(failed_books[failed_books.index(b):])
            print()
            break
        if not url:
            skipped.append(b)
            continue
        md5_match = re.search(r'/md5/([a-fA-F0-9]+)', url)
        if not md5_match:
            print(f"  ⚠ invalid URL, skipped")
            skipped.append(b)
            continue
        todo.append((b, md5_match.group(1)))
        print(f"  ✓ md5 recorded")

    if not todo:
        return [], skipped

    # Phase 2 : télécharger tout d'un coup
    log.info(f"\n{'='*60}")
    log.info(f"=== Downloading {len(todo)} books ===")
    ok, still_failed = [], []
    for b, md5 in todo:
        log.info(f"\n  [{b['author']}] {b['title'][:50]}")
        log.info(f"  md5: {md5[:12]}... → downloading...")
        lang = detect_lang("", b["title"])
        dl_dir = output_dir / "nouveaux"
        dl_dir.mkdir(exist_ok=True)
        result = try_all_sources(session, pw_browser, md5, dl_dir, b["author"], b["title"], lang)
        if result:
            ok.append({**b, "status": "ok", "file": result, "md5": md5})
            log.info(f"  ✓ OK")
        else:
            log.warning(f"  ✗ Failed")
            still_failed.append(b)
        time.sleep(2)
    still_failed.extend(skipped)
    return ok, still_failed


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Book downloader")
    parser.add_argument("input_file", nargs="?", default="downloads/musicologie_books.json")
    parser.add_argument("output_dir", nargs="?", default="downloads/musicologie")
    parser.add_argument("-i", "--interactive", action="store_true",
                        help="Interactive pass over the failures after downloading")
    parser.add_argument("--retry", action="store_true",
                        help="Retry mode: re-run the interactive pass only over the failures du rapport.json")
    parser.add_argument("--add", action="store_true",
                        help="Mode ajout: saisir de nouveaux ouvrages (URL + auteur + titre)")
    args = parser.parse_args()

    input_file = args.input_file
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    with open(input_file, encoding="utf-8") as f:
        books = json.load(f)

    log.info(f"=== {len(books)} books to process ===")
    log.info(f"Sortie: {output_dir.resolve()}")

    # Phase 1 : archiver les livres déjà validés dans NotebookLM
    archive_dir = output_dir / "archives"
    archived = 0
    for book in books:
        if book.get("nblm_import") != "ok":
            continue
        author_short = book["author"].split(",")[0].strip()
        prefix = f"{author_short} - {book['title'][:60]}"
        prefix_clean = re.sub(r'[<>:"/\\|?*]', '_', prefix).lower()
        for subdir in [output_dir, output_dir / "nouveaux"]:
            if not subdir.exists():
                continue
            found = False
            for f in subdir.iterdir():
                if f.is_file() and f.name.lower().startswith(prefix_clean) and f.stat().st_size > 10_000:
                    archive_dir.mkdir(exist_ok=True)
                    dst = archive_dir / f.name
                    if not dst.exists():
                        f.rename(dst)
                        archived += 1
                    found = True
                    break
            if found:
                break
    if archived:
        log.info(f"📦 {archived} books archived in {archive_dir}")

    session = create_session()

    # Lancer Playwright une seule fois
    pw_browser = None
    pw_instance = None
    try:
        from playwright.sync_api import sync_playwright
        pw_instance = sync_playwright().start()
        pw_browser = pw_instance.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
        )
        log.info("Playwright: browser launched")
    except Exception as e:
        log.warning(f"Playwright unavailable ({e}), slow sources disabled")

    report_path = output_dir / "rapport.json"

    try:
        # Mode --add : saisie d'URLs uniquement, métadonnées auto
        if args.add:
            print(f"\n=== Ajout de nouveaux ouvrages ===")
            print(f"Paste the Anna's Archive URLs (/md5/...).")
            print(f"URL vide = terminer.\n")
            md5_list = []
            while True:
                try:
                    url = input("  URL : ").strip()
                except (EOFError, KeyboardInterrupt):
                    print()
                    break
                if not url:
                    break
                md5_match = re.search(r'/md5/([a-fA-F0-9]+)', url)
                if not md5_match:
                    print(f"  ⚠ invalid URL (no /md5/...), skipped")
                    continue
                md5_list.append(md5_match.group(1))
                print(f"  ✓ md5 recorded ({len(md5_list)})")

            if not md5_list:
                log.info("Nothing to download.")
                return

            log.info(f"\n{'='*60}")
            log.info(f"=== Fetching metadata + downloading ({len(md5_list)} works) ===")
            new_books = []
            dl_dir = output_dir / "nouveaux"
            dl_dir.mkdir(exist_ok=True)
            for md5 in md5_list:
                log.info(f"\n  md5: {md5[:12]}...")
                author, title = fetch_book_metadata(pw_browser, md5)
                if not title:
                    title = md5[:16]
                if not author:
                    author = "Inconnu"
                log.info(f"  → {author} - {title[:60]}")
                lang = detect_lang("", title)
                result = try_all_sources(session, pw_browser, md5, dl_dir, author, title, lang)
                if result:
                    log.info(f"  ✓ OK")
                    new_books.append({"author": author, "title": title})
                else:
                    log.warning(f"  ✗ Failed")
                time.sleep(2)

            # Ajouter les nouveaux livres au JSON
            if new_books:
                books.extend(new_books)
                with open(input_file, "w", encoding="utf-8") as f:
                    json.dump(books, f, ensure_ascii=False, indent=2)
                log.info(f"\n📝 {len(new_books)} works added to {input_file}")
            return

        # Mode --retry : échecs du rapport + fichiers _préfixés dans nouveaux/
        if args.retry:
            failed_books = []
            # Source 1 : rapport.json
            if report_path.exists():
                with open(report_path, encoding="utf-8") as f:
                    prev = json.load(f)
                failed_books = prev.get("fail", [])
            else:
                prev = {"ok": [], "fail": []}
            # Source 2 : fichiers préfixés _ dans nouveaux/
            underscored = find_underscored_books(books, output_dir)
            seen = {(b["author"], b["title"]) for b in failed_books}
            for b in underscored:
                if (b["author"], b["title"]) not in seen:
                    failed_books.append(b)
            if underscored:
                log.info(f"📌 {len(underscored)} books rejected (_prefixed in nouveaux/)")
            if not failed_books:
                log.info("Nothing to retry.")
                return
            ok, still_failed = interactive_pass(session, pw_browser, failed_books, output_dir)
            prev["ok"].extend(ok)
            prev["fail"] = still_failed
            with open(report_path, "w", encoding="utf-8") as f:
                json.dump(prev, f, ensure_ascii=False, indent=2)
            log.info(f"\n{'='*60}")
            log.info(f"=== Retry: {len(ok)} recovered, {len(still_failed)} remaining ===")
            return

        # Mode normal
        results = {"ok": [], "fail": []}
        for i, book in enumerate(books, 1):
            log.info(f"\n[{i}/{len(books)}]")
            r = process_book(session, pw_browser, book, output_dir)
            results[r["status"]].append({**book, **r})
            if r.get("isbn") != "cached":
                time.sleep(DELAY_DOWNLOAD)

        # Passe interactive si activée
        if args.interactive and results["fail"]:
            ok, still_failed = interactive_pass(session, pw_browser, results["fail"], output_dir)
            results["ok"].extend(ok)
            results["fail"] = still_failed

    finally:
        if pw_browser:
            pw_browser.close()
        if pw_instance:
            pw_instance.stop()

    # Rapport
    log.info(f"\n{'='*60}")
    log.info(f"=== RESULT: {len(results['ok'])}/{len(books)} downloaded ===")
    if results["fail"]:
        log.info(f"\n--- FAILURES ({len(results['fail'])}) ---")
        for b in results["fail"]:
            log.info(f"  ✗ {b['author']} - {b['title']}")

    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    log.info(f"\nRapport: {report_path}")


if __name__ == "__main__":
    main()
