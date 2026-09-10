#!/usr/bin/env python3
"""
author_title_search.py  —  ZeroWall Literature helper
======================================================
Search current titles / honors for the top-N cited-by authors of a task
via the ZeroWall Host free-search bridge.

Engine strategy
---------------
- bing first (free, no key needed, stable)
- tavily as fallback (paid per query — only used when bing returns nothing)
- deepseek-official as last resort
Sequential fallback: stop at first engine that has real results.
NO fan-out / parallel per-engine queries.

Honor extraction
----------------
Each author gets TWO queries:
  1. profile  — faculty page / current position
  2. honors   — awards, fellowships, academician status

Extracted items:
  - current_title  : highest-ranking title found (+ all others as extras)
  - titles_extra   : additional titles beyond the first
  - honors         : list of clean award/fellowship strings (up to 8)
  - appointments   : additional appointments / positions
All are written into evidence_pending/*.json (verified_facts).

Usage
-----
  python scripts/author_title_search.py literature/<slug> [--workers 3] [--top-n 20]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

# ── Bridge config ─────────────────────────────────────────────────────────────
BRIDGE    = "http://127.0.0.1:62705"
ENDPOINT  = "/api/dsh-free-search-settings/raw-search"

# bing is free and reliable; tavily is accurate but paid-per-query.
# Sequential: stop at first engine that returns real content.
ENGINE_CHAIN = ["bing", "tavily", "deepseek-official"]

# Throttle: bing needs ≥0.3s; tavily needs ≥0.6s to be safe.
# We use 0.4s as a middle ground (≈2.5 req/s, well within bing limits).
MIN_INTERVAL = 0.4

_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "Mozilla/5.0 (compatible; zerowall-literature/1.0)"})
_LOCK = threading.Lock()
_LAST: list[float] = [0.0]


def _throttle() -> None:
    with _LOCK:
        wait = MIN_INTERVAL - (time.time() - _LAST[0])
        if wait > 0:
            time.sleep(wait)
        _LAST[0] = time.time()


def _bridge_search(query: str, engine: str, max_results: int = 10) -> dict:
    _throttle()
    try:
        resp = _SESSION.post(
            BRIDGE + ENDPOINT,
            json={"query": query, "engine": engine, "maxResults": max_results},
            timeout=60,
        )
    except requests.RequestException as exc:
        return {"status": "error", "engine": engine, "error": str(exc), "results": [], "answer": ""}
    if resp.status_code != 200:
        return {"status": "error", "engine": engine,
                "error": f"HTTP {resp.status_code}", "results": [], "answer": ""}
    try:
        data = resp.json()
    except ValueError:
        return {"status": "error", "engine": engine, "error": "invalid json", "results": [], "answer": ""}
    value = data.get("value") if isinstance(data.get("value"), dict) else data
    results = value.get("sources") or value.get("results") or []
    answer  = value.get("content") or value.get("answer") or ""
    return {
        "status": "ok" if (results or answer) else "empty",
        "engine": engine,
        "results": results,
        "answer": answer,
    }


def _search(query: str) -> dict:
    """Try engines sequentially; return first with real content."""
    for engine in ENGINE_CHAIN:
        payload = _bridge_search(query, engine)
        if payload["status"] == "ok" or payload.get("answer", "").strip():
            payload["used_engine"] = engine
            return payload
    return {"status": "not_found", "results": [], "answer": "", "used_engine": "none"}


# ── Text assembly ─────────────────────────────────────────────────────────────

def _assemble(payload: dict) -> str:
    """Join answer + all snippets into one searchable text blob."""
    parts = []
    answer = (payload.get("answer") or "").strip()
    if answer:
        parts.append("[ANSWER] " + answer)
    for r in payload.get("results") or []:
        t = (r.get("title") or "").strip()
        s = (r.get("snippet") or "").strip()
        parts.append(f"[{t}] {s}" if t else s)
    return " || ".join(parts)


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip()


# ── Title patterns (ordered most-senior first) ────────────────────────────────

_TITLE_PATTERNS = [
    (re.compile(r"\bprofessor\s+emeritus\b", re.I),        "荣誉退休教授(Emeritus Professor)"),
    (re.compile(r"\bdistinguished\s+professor\b", re.I),   "特聘教授(Distinguished Professor)"),
    (re.compile(r"\bfull\s+professor\b", re.I),             "正教授(Full Professor)"),
    (re.compile(r"\bclinical\s+professor\b", re.I),         "临床教授(Clinical Professor)"),
    (re.compile(r"\badjunct\s+professor\b", re.I),          "兼职教授(Adjunct Professor)"),
    (re.compile(r"\bvisiting\s+professor\b", re.I),         "访问教授(Visiting Professor)"),
    (re.compile(r"\bassociate\s+professor\b", re.I),        "副教授(Associate Professor)"),
    (re.compile(r"\bassistant\s+professor\b", re.I),        "助理教授(Assistant Professor)"),
    (re.compile(r"\bprofessor\b", re.I),                    "教授(Professor)"),
    (re.compile(r"\bsenior\s+lecturer\b", re.I),            "高级讲师(Senior Lecturer)"),
    (re.compile(r"\blecturer\b", re.I),                     "讲师(Lecturer)"),
    (re.compile(r"\bdepartment\s+chair(?:man|person)?\b|\bchair\s+of\s+the\s+depart", re.I), "系主任(Chair)"),
    (re.compile(r"\bdean\b", re.I),                         "院长(Dean)"),
    (re.compile(r"\bdirector\b",  re.I),                    "主任/所长(Director)"),
    (re.compile(r"\bprincipal\s+investigator\b|\b(?<!\w)pi(?!\w)", re.I), "PI(Principal Investigator)"),
    (re.compile(r"\bsenior\s+(?:research\s+)?scientist\b",  re.I), "高级研究员(Senior Scientist)"),
    (re.compile(r"\bresearch\s+scientist\b",                re.I), "研究员(Research Scientist)"),
    (re.compile(r"\bchief\s+(?:scientist|researcher)\b",    re.I), "首席研究员(Chief Scientist)"),
    (re.compile(r"教授"),  "教授"),
    (re.compile(r"副教授"), "副教授"),
    (re.compile(r"讲师"),  "讲师"),
    (re.compile(r"研究员"), "研究员"),
    (re.compile(r"主任医师"), "主任医师"),
    (re.compile(r"院士"),   "院士"),
]

# ── Honor / award patterns ────────────────────────────────────────────────────

# Patterns that extract the meaningful portion of a snippet directly.
# Each tuple: (pattern, group_to_keep) — group 0 = whole match.
_HONOR_PATTERNS = [
    # Named fellowships / academies
    re.compile(
        r"(?:elected\s+)?(?:fellow|member)\s+of\s+(?:the\s+)?[A-Z][A-Za-z\s&]{3,60}(?:Academy|Society|Association|Institute|Royal|National|Academiae|Europaea|Sciences)",
        re.I),
    re.compile(r"IEEE\s+Fellow|AAAS\s+Fellow|FACC|FAHA|FAPS|FASN|FARVO|FRS\b|FMedSci\b", re.I),
    # Named awards
    re.compile(
        r"(?:[A-Z][A-Za-z\s\-]{2,40})\s+(?:Award|Prize|Medal|Lecture(?:ship)?|Fellowship|Grant)[^.;,\|\n]{0,50}",
        re.I),
    re.compile(
        r"(?:Award|Prize|Medal)\s+(?:of|for|in|from)\s+[A-Z][^.;,\|\n]{0,60}",
        re.I),
    # Academician / Academy member
    re.compile(r"academician\s+(?:of\s+)?[A-Z][^.;,\|\n]{0,60}", re.I),
    re.compile(r"member\s+of\s+(?:the\s+)?(?:US\s+)?National\s+Academy[^.;,\|\n]{0,50}", re.I),
    re.compile(r"elected\s+(?:member|fellow)[^.;,\|\n]{0,60}", re.I),
    # Chinese honorifics
    re.compile(r"院士|杰青|长江学者|优青|特聘教授|讲席教授|千人计划|万人计划|国家自然科学奖|国家科技进步奖|973首席|863计划"),
    # Sloan, Wellcome, HHMI, etc.
    re.compile(r"(?:Sloan|Wellcome|HHMI|Howard\s+Hughes|Fulbright|Humboldt|Guggenheim)\s+(?:Research\s+)?(?:Fellow|Scholar|Award|Grant)[^.;,\|\n]{0,50}", re.I),
]

# Noise patterns — if the WHOLE string matches, discard it.
_NOISE_RX = re.compile(
    r"h-index\s*[&|]|publications\s*[&|]|cited\s+by\s+\d|"
    r"read\s+\d+\s+publication|research\.com\s+overview|"
    r"researchgate\.net|google\s+scholar|back\s+to\s+top|"
    r"home\s*>|faculty\s+profile\s+page\s*$|"
    r"n/a\s+certif|certif\w*\s+n/a|"
    r"quantitative\s+market|structural\s+econom|"
    r"teaching\s+assistant\b|taiwan\b|"
    r"^\s*\[.*\]\s*$",  # bare [title] noise
    re.I,
)


def _rescue_honors(text: str) -> list[str]:
    """
    Extract all clean award/fellowship names from a potentially long text blob.
    Returns up to 8 distinct items, each ≤100 chars.
    """
    found: list[str] = []
    for rx in _HONOR_PATTERNS:
        for m in rx.finditer(text):
            raw = _clean(m.group(0))
            # Strip trailing noise words
            raw = re.sub(r"\s*[|\[({].*$", "", raw).strip()
            raw = re.sub(r"\s+", " ", raw).strip()
            if not raw or len(raw) < 5:
                continue
            if _NOISE_RX.search(raw):
                continue
            s = raw[:100]
            if s not in found:
                found.append(s)
        if len(found) >= 8:
            break
    return found[:8]


def _clean_one_honor(raw: str) -> str:
    """
    Clean a single honor string that may be a raw snippet.
    Steps:
      1. Strip markdown links   [text](url) → text
      2. Strip bare URLs
      3. Strip leading [PageTitle] prefix
      4. Strip bracket chars
      5. If still >100 chars, try to rescue named award from within it.
      6. If still noise → discard.
    Returns clean string ≤100 chars, or "" to discard.
    """
    s = _clean(str(raw or ""))
    # Strip markdown links
    s = re.sub(r"\[([^\]]{1,80})\]\(http[^\)]+\)", r"\1", s)
    # Strip bare URLs
    s = re.sub(r"https?://\S+", "", s).strip()
    # Strip leading [PageTitle] prefix (common in snippet sources)
    s = re.sub(r"^\[[^\]]{1,120}\]\s*", "", s).strip()
    s = re.sub(r"^\[[^\]]{1,120}\]\s*", "", s).strip()  # twice for nested
    s = re.sub(r"[\[\]]", "", s).strip()
    s = _clean(s)
    if not s:
        return ""
    if len(s) <= 100 and not _NOISE_RX.search(s):
        return s
    # Long or noisy: try to rescue a named award from within
    rescued = _rescue_honors(s)
    return rescued[0] if rescued else ""


def _name_nearby(text: str, name_tokens: list[str], start: int, end: int,
                 window: int = 300) -> bool:
    ctx_start = max(0, start - window)
    ctx_end   = min(len(text), end + window)
    ctx = text[ctx_start:ctx_end].lower()
    return True if not name_tokens else any(t in ctx for t in name_tokens)


def extract_facts(profile_payload: dict, honors_payload: dict, author_name: str) -> dict:
    """
    Extract all titles and honors from two search result payloads.
    Returns dict with keys: current_title, titles_extra, honors, appointments.
    """
    name_simple  = re.sub(r"[^a-z\u4e00-\u9fff ]", "", author_name.lower()).strip()
    name_tokens  = [t for t in name_simple.split() if len(t) > 1]

    full_profile = _assemble(profile_payload)
    full_honors  = _assemble(honors_payload)
    full_text    = full_profile + " ||| " + full_honors

    # ── Titles ────────────────────────────────────────────────────────────────
    found_titles: list[str] = []
    for rx, label in _TITLE_PATTERNS:
        for m in rx.finditer(full_text):
            if not _name_nearby(full_text, name_tokens, m.start(), m.end()):
                continue
            if label not in found_titles:
                found_titles.append(label)
            if len(found_titles) >= 4:
                break
        if len(found_titles) >= 4:
            break

    # ── Honors ────────────────────────────────────────────────────────────────
    found_honors: list[str] = []
    for rx in _HONOR_PATTERNS:
        for m in rx.finditer(full_text):
            if not _name_nearby(full_text, name_tokens, m.start(), m.end()):
                continue
            raw = _clean(m.group(0))
            raw = re.sub(r"\s*[|\[({].*$", "", raw).strip()
            if not raw or len(raw) < 5 or _NOISE_RX.search(raw):
                continue
            s = raw[:100]
            if s not in found_honors:
                found_honors.append(s)
        if len(found_honors) >= 8:
            break

    facts: dict = {}
    if found_titles:
        facts["current_title"] = found_titles[0]
        if len(found_titles) > 1:
            facts["titles_extra"] = found_titles[1:]
    if found_honors:
        facts["honors"]       = found_honors
        facts["appointments"] = found_honors  # mirror for pipeline compatibility
    return facts


def author_score(rec: dict) -> float:
    def n(k: str) -> float:
        try:
            return float(rec.get(k) or 0)
        except (TypeError, ValueError):
            return 0.0
    return n("cited_by_count") + 20 * n("h_index") + 3 * n("works_count")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Search titles/honors for top-N cited-by authors (bing-first, tavily fallback)")
    parser.add_argument("task", help="Task directory, e.g. literature/wang-2008-ppar-cilostazol")
    parser.add_argument("--workers", type=int, default=3,
                        help="Parallel workers (default 3; keep low for bing rate limits)")
    parser.add_argument("--top-n", dest="top_n", type=int, default=20,
                        help="Only search the top N authors by citation count (default 20)")
    parser.add_argument("--bridge", default=BRIDGE, help="ZeroWall Host URL")
    args = parser.parse_args()

    task_dir = Path(args.task)
    if not task_dir.is_dir():
        task_dir = Path.cwd() / args.task
    if not task_dir.is_dir():
        print(f"task dir not found: {task_dir}", file=sys.stderr)
        return 1

    state_path = task_dir / "analysis" / "state.json"
    pend_dir   = task_dir / "analysis" / "evidence_pending"
    reqs_path  = task_dir / "analysis" / "provider_requests.jsonl"

    print("Loading state.json …", flush=True)
    state = json.loads(state_path.read_text(encoding="utf-8"))

    # Identify target-paper authors to exclude
    target_author_keys: set[str] = set()
    for paper in state.get("papers") or []:
        if paper.get("direction") == "target":
            for name in paper.get("authors") or []:
                k = re.sub(r"[^a-z ]", "", (name or "").lower()).strip()
                target_author_keys.add(k)

    # Collect unique author entities from cited-by papers
    all_entities: dict[str, dict] = {}
    for paper in state.get("papers") or []:
        if paper.get("direction") != "cited-by":
            continue
        for rec in paper.get("author_records") or []:
            eid  = rec.get("author_entity_id") or ""
            name = (rec.get("name") or "").strip()
            if not eid or not name:
                continue
            nk = re.sub(r"[^a-z ]", "", name.lower()).strip()
            if nk in target_author_keys:
                continue
            if eid not in all_entities:
                insts = [i.strip() for i in re.split(r";\s*", rec.get("publication_institution") or "") if i.strip()]
                all_entities[eid] = {
                    "name": name, "entity_id": eid, "institutions": insts,
                    "cited_by_count": rec.get("cited_by_count") or 0,
                    "h_index":        rec.get("h_index") or 0,
                    "works_count":    rec.get("works_count") or 0,
                }
            else:
                old = all_entities[eid]
                for k in ("cited_by_count", "h_index", "works_count"):
                    try:
                        if float(rec.get(k) or 0) > float(old.get(k) or 0):
                            old[k] = rec[k]
                    except (TypeError, ValueError):
                        pass

    ranked     = sorted(all_entities.values(), key=author_score, reverse=True)
    top_list   = ranked[: args.top_n]
    print(f"Total unique authors: {len(all_entities)} → searching top-{args.top_n}: {len(top_list)}", flush=True)
    print(f"Engine chain: {ENGINE_CHAIN}", flush=True)

    # Build request_id → entity_id map
    entity_to_rids: dict[str, list[str]] = {}
    if reqs_path.is_file():
        seen_rids: set[str] = set()
        for line in reqs_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                r = json.loads(line)
            except ValueError:
                continue
            rid = r.get("request_id", "")
            if not rid or rid in seen_rids:
                continue
            seen_rids.add(rid)
            if r.get("kind") == "author" and r.get("tool") == "advanced_search":
                eid = r.get("subject") or ""
                entity_to_rids.setdefault(eid, []).append(rid)

    # Load cache (so re-runs never re-query for already-searched authors)
    cache_path = task_dir / "analysis" / "author_title_search_cache.json"
    cache: dict[str, dict] = {}
    if cache_path.is_file():
        try:
            cache = json.loads(cache_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass

    updated: list[str] = []
    done_count = [0]

    def process(info: dict) -> None:
        eid   = info["entity_id"]
        name  = info["name"]
        hint  = (info["institutions"] or [""])[0][:60]

        if eid not in cache:
            profile_q = (
                f'"{name}" {hint} professor OR "associate professor" OR lecturer OR '
                f'"principal investigator" OR director OR dean faculty profile current position'
            ).strip()
            honors_q = (
                f'"{name}" {hint} award fellow honor academician fellowship prize medal'
            ).strip()
            p_res = _search(profile_q)
            h_res = _search(honors_q)
            cache[eid] = {"name": name, "profile": p_res, "honors": h_res}
            done_count[0] += 1
            if done_count[0] % 5 == 0:
                with _LOCK:
                    cache_path.write_text(
                        json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
                print(f"  {done_count[0]}/{len(top_list)} searched …", flush=True)
        else:
            p_res = cache[eid]["profile"]
            h_res = cache[eid]["honors"]
            done_count[0] += 1

        facts = extract_facts(p_res, h_res, name)
        if not facts:
            return

        # Attach source URLs
        sources: list[str] = []
        for payload in (p_res, h_res):
            for row in payload.get("results") or []:
                url = row.get("url") or ""
                if url and url not in sources:
                    sources.append(url)
        facts["sources"]    = sources[:5]
        facts["extraction"] = "title_search"
        facts["engine"]     = p_res.get("used_engine", "")

        # Write into ALL matching advanced_search evidence files
        rids    = entity_to_rids.get(eid) or []
        written = 0
        for rid in rids:
            fpath = pend_dir / f"{rid}.json"
            if not fpath.is_file():
                continue
            try:
                ev = json.loads(fpath.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            # Don't overwrite existing verified title (only honors can be enriched)
            existing_vf = dict(ev.get("verified_facts") or {})
            if existing_vf.get("current_title") and not facts.get("honors"):
                continue
            existing_vf.update(facts)
            ev["verified_facts"] = existing_vf
            fpath.write_text(json.dumps(ev, ensure_ascii=False, indent=2), encoding="utf-8")
            written += 1

        if written:
            with _LOCK:
                n_honors = len(facts.get("honors") or [])
                updated.append(
                    f"{name}: {facts.get('current_title','—')} | "
                    f"extra={len(facts.get('titles_extra',[]))} | "
                    f"honors={n_honors} | engine={facts.get('engine','')}"
                )

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        list(pool.map(process, top_list))

    cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nDone. Updated {len(updated)} author entities in evidence_pending.", flush=True)
    for line in updated[:40]:
        print("  " + line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
