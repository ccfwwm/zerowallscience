"""Passe 4 — résolution massive via Semantic Scholar API directe.

Stratégie pour chaque fail restant :
  1. Si auteur = slug → skip (cf. catégorie F séparée)
  2. S2 paper/search par "auteur titre année" → top 5 matches
  3. Filtrer matches par similarité titre + auteur match
  4. Si best match :
     a. Si openAccessPdf.url et status ∈ {GOLD, HYBRID, GREEN} → DL direct
     b. Sinon DOI → Sci-Hub multi-mirrors
     c. Sinon → identified_metadata_no_dl avec metadata enrichie
  5. Si aucun match S2 → confirmed_no_match_via_S2 (suspicion d'hallucination)

Rate limit S2 : 1 req/sec (avec clé) ou 100 req/5min (sans).
"""
import json
import os
import re
import sys
import time
import unicodedata
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import urljoin

import requests
import urllib3
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).parent))

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Chemins dérivés du vault configuré (cf. pipeline.config). Imports tardifs
# pour éviter le cycle import (config.py insère lib/ dans sys.path).
def _vault_paths():
    from pipeline.config import VAULT, SOURCES
    return {
        "status_json": SOURCES / "_tracking_status.json",
        "md_path": SOURCES / "SOURCES_TRACKING.md",
        "obsidian_root": VAULT,
    }


def _status_json() -> Path: return _vault_paths()["status_json"]
def _md_path() -> Path: return _vault_paths()["md_path"]
def _obsidian_root() -> Path: return _vault_paths()["obsidian_root"]


LOG_PATH = Path(os.environ.get("S2_RESOLVER_LOG", "/tmp/s2_resolver.log"))

# Clé S2 : env var uniquement. Sans clé, S2 accepte les requêtes non
# authentifiées avec un rate limit plus strict (100 req / 5 min).
S2_API_KEY = os.environ.get("S2_API_KEY")
S2_BASE = "https://api.semanticscholar.org/graph/v1"
SCIHUB_MIRRORS = ["https://sci-hub.box/", "https://sci-hub.ru/", "https://sci-hub.al/", "https://sci-hub.ee/", "https://sci-hub.wf/"]
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
EMAIL = os.environ.get("RESEARCH_CONTACT_EMAIL", "anonymous@example.org")


def _load_project_authors() -> set[str]:
    """Charge la whitelist d'auteurs/groupes spécifiques au projet.

    Source : `$XDG_CONFIG_HOME/paper-trail/project_authors.txt` (défaut
    `~/.config/paper-trail/project_authors.txt`). Un identifiant par ligne,
    `#` pour commentaires. Vide si le fichier n'existe pas.
    """
    xdg = os.environ.get("XDG_CONFIG_HOME") or str(Path.home() / ".config")
    path = Path(xdg) / "paper-trail" / "project_authors.txt"
    if not path.exists():
        return set()
    out = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            out.add(line)
    return out


PROJECT_AUTHORS = _load_project_authors()


def log(msg):
    line = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(LOG_PATH, "a") as f:
        f.write(line + "\n")


def to_ascii(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode("ascii")


def normalize_title(s):
    return re.sub(r"[^\w\s]", " ", to_ascii(s).lower()).strip()


def title_similarity(t1, t2):
    n1, n2 = normalize_title(t1), normalize_title(t2)
    if not n1 or not n2:
        return 0.0
    w1 = set(w for w in n1.split() if len(w) > 3)
    w2 = set(w for w in n2.split() if len(w) > 3)
    jacc = len(w1 & w2) / max(len(w1 | w2), 1) if w1 and w2 else 0.0
    seq = SequenceMatcher(None, n1, n2).ratio()
    return max(jacc, seq)


def author_match(a_cite, authors_s2):
    """Check si l'auteur cité apparaît dans la liste S2."""
    if not a_cite or not authors_s2: return False
    a_norm = to_ascii(a_cite).lower()
    for au in authors_s2:
        name = to_ascii(au.get("name", "")).lower()
        if not name:
            continue
        parts = name.split()
        if a_norm in name or (parts and parts[-1] in a_norm):
            return True
    return False


def s2_search(author, title, year, limit=5):
    """Cherche sur S2 paper/search."""
    query_parts = []
    if author and author not in PROJECT_AUTHORS:
        query_parts.append(author)
    if title:
        query_parts.append(title)
    if year:
        query_parts.append(year)
    query = " ".join(query_parts).strip()
    if not query:
        return []
    try:
        r = requests.get(
            f"{S2_BASE}/paper/search",
            params={
                "query": query[:300],
                "limit": limit,
                "fields": "title,authors,year,openAccessPdf,externalIds,venue",
            },
            headers={"User-Agent": UA, **({"x-api-key": S2_API_KEY} if S2_API_KEY else {})},
            timeout=20,
        )
        if r.status_code == 200:
            return r.json().get("data", [])
        elif r.status_code == 429:
            log(f"      [S2] 429 rate limit, sleep 5s")
            time.sleep(5)
        else:
            log(f"      [S2 search] http={r.status_code}: {r.text[:100]}")
    except Exception as e:
        log(f"      [S2 search] err: {type(e).__name__}: {str(e)[:80]}")
    return []


def pick_best_match(results, ref_auteur, ref_titre, ref_annee):
    """Score chaque résultat S2 et retourne le meilleur."""
    best = None
    best_score = -1
    for p in results:
        sim = title_similarity(ref_titre, p.get("title", "")) if ref_titre else 0
        a_ok = 1 if author_match(ref_auteur, p.get("authors", [])) else 0
        y_ok = 1 if (ref_annee and p.get("year") and str(p.get("year")) == str(ref_annee)) else 0
        # Score : si pas de titre, on s'appuie davantage sur auteur+année
        if ref_titre:
            score = sim * 3 + a_ok * 2 + y_ok
        else:
            score = a_ok * 3 + y_ok * 2
        if score > best_score:
            best_score = score
            best = p
    return best, best_score


def write_stream(resp, out):
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "wb") as f:
        for chunk in resp.iter_content(1 << 16):
            if chunk: f.write(chunk)


def is_valid_pdf(p):
    if not p.exists() or p.stat().st_size < 3000: return False
    with open(p, "rb") as f:
        return f.read(8).startswith(b"%PDF")


def try_url(url, out):
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=60, stream=True,
                         allow_redirects=True, verify=False)
        if r.status_code != 200:
            return False
        ct = r.headers.get("Content-Type", "").lower()
        if "pdf" not in ct and "octet" not in ct:
            chunks, total = [], 0
            for chunk in r.iter_content(1 << 14):
                chunks.append(chunk); total += len(chunk)
                if total > 4096: break
            head = b"".join(chunks)[:4096]
            if not head.startswith(b"%PDF"): return False
            with open(out, "wb") as f:
                f.write(head)
                for chunk in r.iter_content(1 << 16):
                    if chunk: f.write(chunk)
        else:
            write_stream(r, out)
        return is_valid_pdf(out)
    except Exception:
        return False


def try_scihub(doi, out):
    s = requests.Session()
    s.headers.update({"User-Agent": UA})
    for mirror in SCIHUB_MIRRORS:
        try:
            r = s.get(mirror + doi, timeout=20, verify=False, allow_redirects=True)
            if r.status_code != 200: continue
            if "article not found" in r.text.lower(): continue
            soup = BeautifulSoup(r.text, "html.parser")
            iframe = soup.select_one('iframe#pdf, iframe[src*="pdf"], embed[src*="pdf"]')
            pdf = iframe.get("src") if iframe else None
            if not pdf:
                btn = soup.select_one('button[onclick*="location.href"]')
                if btn:
                    m = re.search(r"location\.href\s*=\s*['\"]([^'\"]+)['\"]", btn.get("onclick", ""))
                    pdf = m.group(1) if m else None
            if not pdf: continue
            if pdf.startswith("//"): pdf = "https:" + pdf
            elif pdf.startswith("/"): pdf = mirror.rstrip("/") + pdf
            dl = s.get(pdf, timeout=120, stream=True, verify=False)
            if dl.status_code != 200: continue
            write_stream(dl, out)
            if is_valid_pdf(out): return True
            out.unlink(missing_ok=True)
        except Exception:
            pass
        time.sleep(1)
    return False


# ─── Parse MD ───

def clean(s):
    s = s.strip()
    if s in ("—", "-", "–"): return ""
    s = re.sub(r"^\*\*(.+?)\*\*$", r"\1", s)
    return s


def parse_md():
    refs = {}
    lines = _md_path().read_text(encoding="utf-8").splitlines()
    section = None; b = d = 0
    for i, line in enumerate(lines, 1):
        s = line.strip()
        if s.startswith("## A.") or s.startswith("## C."):
            section = None; continue
        if s.startswith("## B."):
            section = "B"; b = 0; continue
        if s.startswith("## D."):
            section = "D"; d = 0; continue
        if not s.startswith("|") or not section: continue
        if "---" in s: continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if section == "B" and len(cells) >= 7:
            if cells[0].lower() == "auteur": continue
            b += 1
            refs[f"B{b:04d}"] = {
                "auteur": clean(cells[0]), "annee": clean(cells[1]),
                "titre": clean(cells[2]), "cible": clean(cells[4]),
                "line_no": i, "section": "B",
            }
        elif section == "D" and len(cells) >= 9:
            if cells[0].lower() == "code": continue
            d += 1
            refs[f"D{clean(cells[0])}"] = {
                "auteur": clean(cells[2]), "annee": clean(cells[3]),
                "titre": clean(cells[4]), "cible": "",
                "line_no": i, "section": "D",
            }
    return refs


def target_dir(ref):
    c = ref.get("cible", "")
    m = re.match(r"(\d+_Biblio_\w+)/Sources/?", c)
    if m:
        return _obsidian_root() / "10_SOURCES" / m.group(1) / "Sources"
    return _obsidian_root() / "10_SOURCES" / "13_Biblio_Maths" / "Sources"


def make_filename(ref):
    auteur = to_ascii(re.sub(r"[^\w\-]", "", ref.get("auteur") or "Anon")) or "Anon"
    annee = re.sub(r"[^\d]", "", ref.get("annee") or "") or "ND"
    titre = ref.get("titre") or "no_title"
    s = re.sub(r"[^\w\s\-]", "", to_ascii(titre))
    words, out, cur = s.split(), [], 0
    for w in words:
        if cur + len(w) + 1 > 60: break
        out.append(w); cur += len(w) + 1
    return f"{auteur}_{annee}_{'_'.join(out) or 'no_title'}.pdf"


# ─── Main ───

def main():
    log("=" * 70)
    log(f"S2 resolver — {datetime.now().isoformat()}")
    log("=" * 70)
    status = json.loads(_status_json().read_text(encoding="utf-8"))
    refs = parse_md()
    fails = [(k, v) for k, v in status["refs"].items() if v["status"] == "failed"]
    log(f"Fails à retraiter : {len(fails)}")

    # Skip slugs (cat F) et hallucinations confirmées (cat B)
    SKIP_REASONS = ("slug_or_project", "confirmed_no_match", "still_unidentified", "identified_metadata_no_dl")
    candidates = []
    for rid, st in fails:
        reason = st.get("reason", "")
        if any(s in reason for s in SKIP_REASONS):
            continue
        if rid not in refs:
            continue
        candidates.append((rid, st, refs[rid]))
    log(f"Candidats S2 : {len(candidates)} (slugs et identified_metadata_no_dl exclus)")

    recovered = 0
    new_metadata = 0
    new_no_match = 0
    for i, (rid, st, ref) in enumerate(candidates, 1):
        log(f"\n[{i}/{len(candidates)}] {rid} {ref['auteur']} {ref['annee']} — {ref['titre'][:60] or '(no title)'}")
        out = target_dir(ref) / make_filename(ref)
        if is_valid_pdf(out):
            status["refs"][rid] = {"status": "ok", "path": str(out), "source": "existing_pdf", "line_no": st["line_no"]}
            recovered += 1
            log("   ⏭ déjà présent")
            time.sleep(0.5)
            continue

        results = s2_search(ref["auteur"], ref["titre"], ref["annee"], limit=5)
        if not results:
            ln = st["line_no"]
            status["refs"][rid] = {"status": "failed", "reason": f"confirmed_no_match_via_S2 [S2 search empty for {ref['auteur']} {ref['annee']}]", "line_no": ln}
            new_no_match += 1
            log(f"   ❌ S2 zéro résultat → confirmed_no_match")
            time.sleep(1.1)
            continue

        best, score = pick_best_match(results, ref["auteur"], ref["titre"], ref["annee"])
        if not best or score < 2:
            ln = st["line_no"]
            t_top = best.get("title", "?")[:60] if best else "?"
            status["refs"][rid] = {"status": "failed", "reason": f"S2_weak_match [top: \"{t_top}\" score={score}]", "line_no": ln}
            log(f"   ⚠ S2 match faible (score={score}): \"{t_top}\"")
            time.sleep(1.1)
            continue

        # Match solide trouvé
        t_match = best.get("title", "")
        doi = best.get("externalIds", {}).get("DOI", "") if best.get("externalIds") else ""
        oa = best.get("openAccessPdf") or {}
        oa_url = oa.get("url", "") if oa.get("status") in ("GOLD", "HYBRID", "GREEN") else ""
        venue = best.get("venue", "")

        log(f"   S2 match (score={score}): \"{t_match[:60]}\"")
        log(f"      DOI={doi or 'n/a'} | OA={oa.get('status','?')}")

        # Tentative DL
        success = False
        if oa_url:
            log(f"      OA URL: {oa_url[:80]}")
            if try_url(oa_url, out):
                success = True
                status["refs"][rid] = {"status": "ok", "path": str(out), "source": f"s2_oa:{oa_url[:50]}", "line_no": st["line_no"]}
                log(f"   ✅ DLed via OA")
        if not success and doi:
            log(f"      Sci-Hub DOI {doi}")
            if try_scihub(doi, out):
                success = True
                status["refs"][rid] = {"status": "ok", "path": str(out), "source": f"s2_scihub:{doi}", "line_no": st["line_no"]}
                log(f"   ✅ DLed via Sci-Hub")
        if success:
            recovered += 1
        else:
            # Metadata enrichie mais DL KO
            ln = st["line_no"]
            arxiv = best.get("externalIds", {}).get("ArXiv", "") if best.get("externalIds") else ""
            info = f"S2 confirmé : \"{t_match[:80]}\" venue={venue[:40]} DOI={doi or '-'} arXiv={arxiv or '-'} OA-status={oa.get('status','?')}"
            status["refs"][rid] = {"status": "failed", "reason": f"identified_metadata_no_dl [{info}]", "line_no": ln}
            new_metadata += 1
            log(f"   ℹ️ metadata S2 enrichie mais DL KO")

        time.sleep(1.1)

        if i % 20 == 0:
            _status_json().write_text(json.dumps(status, ensure_ascii=False, indent=1), encoding="utf-8")
            log(f"   [checkpoint S2 : {recovered} DL / {new_metadata} new_metadata / {new_no_match} new_no_match]")

    _status_json().write_text(json.dumps(status, ensure_ascii=False, indent=1), encoding="utf-8")
    log("\n" + "=" * 70)
    log(f"BILAN S2 : {recovered} récupérés / {new_metadata} metadata enrichie / {new_no_match} confirmed no_match / {len(candidates)} candidats")
    log("=" * 70)


if __name__ == "__main__":
    main()
