#!/usr/bin/env python3
"""
apply_facts_to_state.py  —  ZeroWall Literature helper
=======================================================
Direct-write author facts from evidence_pending/*.json into state.json,
bypassing the slow ingest pipeline.

Honor handling: each raw entry is passed through the shared clean_honor_entry
logic — long snippets have award names rescued, pure noise is discarded.
Multiple honors per author are ALL kept.

Usage:
  python scripts/apply_facts_to_state.py literature/<slug>
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent


# ── Shared honor-rescue logic (keep in sync with literature_pipeline.py) ──────

_HONOR_RESCUE_PATTERNS = [
    re.compile(
        r"(?:elected\s+)?(?:fellow|member)\s+of\s+(?:the\s+)?[A-Z][A-Za-z\s&]{3,55}"
        r"(?:Academy|Society|Association|Institute|Royal|National|Academiae|Europaea|Sciences)",
        re.I),
    re.compile(
        r"\bIEEE\s+Fellow\b|\bAAAS\s+Fellow\b|\bFACC\b|\bFAHA\b|\bFAPS\b"
        r"|\bFASN\b|\bFARVO\b|\bFRS\b|\bFMedSci\b|\bFACR\b",
        re.I),
    re.compile(
        r"\b(?:[A-Z][A-Za-z\-]{2,35}\s+){1,5}"
        r"(?:Award|Prize|Medal|Lectureship?|Fellowship)"
        r"(?:\s+(?:of|for|in|from)\s+[A-Za-z\s]{2,40})?",
        re.I),
    re.compile(r"(?:Award|Prize|Medal)\s+(?:of|for|in|from)\s+[A-Z][^.;,|\n]{0,60}", re.I),
    re.compile(r"academician\s+(?:of\s+)?[A-Z][^.;,|\n]{0,55}", re.I),
    re.compile(r"(?:elected\s+)?member\s+of\s+(?:the\s+)?(?:US\s+)?National\s+Academy[^.;,|\n]{0,50}", re.I),
    re.compile(r"elected\s+(?:member|fellow)\s+(?:of\s+)?[A-Z][^.;,|\n]{0,55}", re.I),
    re.compile(r"院士|杰青|长江学者|优青|千人计划|万人计划|国家自然科学奖|国家科技进步奖"),
    re.compile(
        r"(?:Alfred\s+P\.\s+)?Sloan\s+(?:Research\s+)?Fellow"
        r"|Wellcome\s+(?:Trust\s+)?(?:Senior\s+)?(?:Research\s+)?Fellow"
        r"|Howard\s+Hughes\s+(?:Medical\s+)?(?:Institute\s+)?(?:Investigator|Scholar|Fellow)"
        r"|HHMI\s+(?:Investigator|Fellow|Scholar)"
        r"|Fulbright\s+(?:Research\s+)?(?:Scholar|Fellow)"
        r"|Alexander\s+von\s+Humboldt\s+(?:Fellow|Award)"
        r"|Guggenheim\s+Fellow",
        re.I),
]

_HONOR_NOISE_RX = re.compile(
    r"h-index\s*[&|,]|publications\s*[&|,]|cited\s+by\s+\d|"
    r"read\s+\d+\s+publication|research\.com\b.*overview|"
    r"researchgate\.net|google\s+scholar|back\s+to\s+top|"
    r"home\s*>|faculty\s+profile\s+page\s*$|"
    r"n/a\s+certif|certif\w*\s+n/a|quantitative\s+market|"
    r"structural\s+econom|teaching\s+assistant\b|taiwan\b|"
    r"^\s*honors[,\s]*awards\s+and\s+grants\s*$|"
    r"^\s*awards\s+and\s+grants\s*$|"
    r"\[\s*\.\.\.\s*\]",
    re.I,
)

_RESCUE_DISCARD_RX = re.compile(
    r"^(?:the\s+\w{1,20}|awards?\s*(?:and\s*grants?)?|grants?\s*)$",
    re.I,
)


def _rescue_honors_from_text(text: str, max_results: int = 8) -> list[str]:
    found: list[str] = []
    for rx in _HONOR_RESCUE_PATTERNS:
        for m in rx.finditer(text):
            raw = re.sub(r"\s+", " ", m.group(0)).strip()
            raw = re.sub(r"\s*[|({].*$", "", raw).strip()
            raw = re.sub(r"^(?:and|or|,|;|\s|[a-z]{1,3})\s+", "", raw).strip()
            raw = re.sub(r"^[^A-Z\u4e00-\u9fff]+", "", raw).strip()
            if not raw or len(raw) < 8:
                continue
            if _HONOR_NOISE_RX.search(raw) or _RESCUE_DISCARD_RX.match(raw):
                continue
            if re.match(r"^(?:numerous|several|many|various)\s+\w+\s*$", raw, re.I):
                continue
            s = raw[:100]
            dominated = False
            new_found = []
            for existing in found:
                if existing in s or s in existing:
                    if len(s) > len(existing):
                        continue
                    else:
                        dominated = True
                        new_found.append(existing)
                else:
                    new_found.append(existing)
            if dominated:
                found = new_found
                continue
            found = new_found
            found.append(s)
        if len(found) >= max_results:
            break
    return found[:max_results]


def clean_honor_entry(raw) -> list[str]:
    s = re.sub(r"\s+", " ", str(raw or "")).strip()
    s = re.sub(r"\[([^\]]{1,80})\]\(http[^\)]+\)", r"\1", s)
    s = re.sub(r"https?://\S+", "", s).strip()
    s = re.sub(r"^\[[^\]]{1,150}\]\s*", "", s).strip()
    s = re.sub(r"^\[[^\]]{1,150}\]\s*", "", s).strip()
    s = re.sub(r"[\[\]]", "", s).strip()
    s = re.sub(r"\s+", " ", s).strip()
    if not s:
        return []
    if len(s) <= 100 and not _HONOR_NOISE_RX.search(s) and not _RESCUE_DISCARD_RX.match(s):
        return [s]
    return _rescue_honors_from_text(s)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _clean(s) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip()


def _load_verified_data(task_root: "Path | None" = None) -> dict:
    """Two-level verified data lookup (task wins over skill-level defaults)."""
    def _load(path) -> dict:
        if path.is_file():
            try:
                d = json.loads(path.read_text(encoding="utf-8"))
                return d if isinstance(d, dict) else {}
            except (OSError, ValueError):
                pass
        return {}

    skill_data = _load(SCRIPT_DIR / "verified_data.json")
    task_data: dict = {}
    if task_root is not None:
        task_data = _load(Path(task_root) / "analysis" / "verified_data.json")

    if not task_data:
        return skill_data or {"jif": {}, "authors": {}}
    if not skill_data:
        return task_data
    merged: dict = {}
    for key in set(list(skill_data.keys()) + list(task_data.keys())):
        sv = skill_data.get(key, {})
        tv = task_data.get(key, {})
        if isinstance(sv, dict) and isinstance(tv, dict):
            merged[key] = {**sv, **tv}
        else:
            merged[key] = tv if tv else sv
    return merged


def _jif_key(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").lower()
    s = re.sub(r"['\u2019\u2018\u00ad\-\u2013\u2014]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


_DASH_RX = re.compile(r"[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\ufe58\ufe63\uff0d]")


def _norm_name(s: str) -> str:
    return _DASH_RX.sub("-", s or "").strip()


def merge_into_record(rec: dict, facts: dict) -> bool:
    changed = False
    for key in ("current_title", "current_institution", "current_country"):
        val = _clean(str(facts.get(key) or ""))
        if val and not rec.get(key):
            rec[key] = val
            changed = True
    for key in ("honors", "appointments"):
        incoming_raw = facts.get(key) or []
        if isinstance(incoming_raw, str):
            incoming_raw = [incoming_raw]
        incoming: list[str] = []
        for h in incoming_raw:
            for item in clean_honor_entry(h):
                if item and item not in incoming:
                    incoming.append(item)
        if incoming:
            existing = rec.get(key) or []
            if isinstance(existing, str):
                existing = [existing]
            cleaned_existing: list[str] = []
            for h in existing:
                for item in clean_honor_entry(h):
                    if item and item not in cleaned_existing:
                        cleaned_existing.append(item)
            merged = list(dict.fromkeys(cleaned_existing + incoming))
            if merged != existing:
                rec[key] = merged
                changed = True
    sources = facts.get("sources") or []
    if isinstance(sources, str):
        sources = [sources]
    if sources:
        existing_src = rec.get("sources") or []
        merged_src = list(dict.fromkeys(existing_src + sources))
        if merged_src != existing_src:
            rec["sources"] = merged_src
            changed = True
    return changed


def apply_verified_authors(state: dict, verified_authors: dict) -> int:
    norm_map = {_norm_name(k): v for k, v in verified_authors.items()}
    updated = 0
    for paper in state.get("papers", []):
        if paper.get("direction") != "cited-by":
            continue
        for rec in paper.get("author_records", []):
            name = rec.get("name", "")
            vd = verified_authors.get(name) or norm_map.get(_norm_name(name))
            if not vd:
                continue
            if vd.get("honors") is not None:
                rec["honors"] = vd["honors"]
            if vd.get("appointments") is not None:
                rec["appointments"] = vd["appointments"]
            if vd.get("current_title"):
                rec["current_title"] = vd["current_title"]
            updated += 1
    return updated


def apply_verified_jif(state: dict, jif_table: dict) -> int:
    updated = 0
    for paper in state.get("papers", []):
        if paper.get("direction") != "cited-by":
            continue
        jname = paper.get("journal") or ""
        if not jname:
            continue
        key = _jif_key(jname)
        hit = jif_table.get(key)
        if not hit:
            words = key.split()[:4]
            prefix = " ".join(words)
            for k, v in jif_table.items():
                if k.startswith(prefix):
                    hit = v
                    break
        if not hit:
            continue
        if not (paper.get("journal_metric") or {}).get("impact_factor"):
            paper["journal_metric"] = {
                **(paper.get("journal_metric") or {}),
                "impact_factor": hit[0],
                "impact_factor_year": hit[1],
                "metric_type": "jcr_impact_factor",
                "source_url": hit[2],
                "metric_source": "verified_data_json",
            }
            updated += 1
    return updated


def main() -> int:
    task_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    if not task_dir.is_dir():
        task_dir = Path.cwd() / task_dir

    state_path = task_dir / "analysis" / "state.json"
    pend_dir   = task_dir / "analysis" / "evidence_pending"
    reqs_path  = task_dir / "analysis" / "provider_requests.jsonl"

    print("Loading state.json …", flush=True)
    state = json.loads(state_path.read_text(encoding="utf-8"))

    # ── Wipe existing raw-snippet honors from all author_records ─────────────
    # This ensures re-runs start clean and don't accumulate noise.
    wiped = 0
    for paper in state.get("papers", []):
        if paper.get("direction") != "cited-by":
            continue
        for rec in paper.get("author_records", []):
            for field in ("honors", "appointments"):
                raw_list = rec.get(field) or []
                if isinstance(raw_list, str):
                    raw_list = [raw_list]
                cleaned: list[str] = []
                for h in raw_list:
                    for item in clean_honor_entry(h):
                        if item and item not in cleaned:
                            cleaned.append(item)
                if cleaned != raw_list:
                    rec[field] = cleaned
                    wiped += 1
    print(f"  Cleaned existing honors in {wiped} records", flush=True)

    # ── Apply verified_data.json overrides ────────────────────────────────────
    vd = _load_verified_data(task_dir)
    if vd:
        n_auth = apply_verified_authors(state, vd.get("authors", {}))
        n_jif  = apply_verified_jif(state, vd.get("jif", {}))
        print(f"  verified_data.json: {n_auth} author record overrides, {n_jif} JIF injections")

    # ── Apply evidence_pending facts ─────────────────────────────────────────
    print("Loading provider_requests.jsonl …", flush=True)
    req_to_subject: dict[str, str] = {}
    seen_rids: set[str] = set()
    if reqs_path.is_file():
        for line in reqs_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                r = json.loads(line)
            except Exception:
                continue
            rid = r.get("request_id", "")
            if not rid or rid in seen_rids:
                continue
            seen_rids.add(rid)
            if r.get("kind") == "author":
                req_to_subject[rid] = r.get("subject", "")

    # Build entity_id → list[author_record] index
    entity_records: dict[str, list[dict]] = {}
    for paper in state.get("papers", []):
        if paper.get("direction") != "cited-by":
            continue
        for rec in paper.get("author_records", []):
            eid = rec.get("author_entity_id", "")
            if eid:
                entity_records.setdefault(eid, []).append(rec)

    print(f"  {len(entity_records)} unique author entities in state", flush=True)

    applied = 0
    authors_updated: set[str] = set()
    if pend_dir.is_dir():
        for fpath in sorted(pend_dir.glob("*.json")):
            rid = fpath.stem
            eid = req_to_subject.get(rid, "")
            if not eid:
                continue
            try:
                ev = json.loads(fpath.read_text(encoding="utf-8"))
            except Exception:
                continue
            vf = ev.get("verified_facts") or {}
            if not vf:
                continue
            has_real = any(vf.get(k) for k in (
                "current_title", "honors", "appointments",
                "current_institution", "current_country"))
            if not has_real:
                continue
            recs = entity_records.get(eid, [])
            for rec in recs:
                if merge_into_record(rec, vf):
                    applied += 1
                    authors_updated.add(rec.get("name", eid))

    print(f"Applied evidence_pending facts to {len(authors_updated)} authors ({applied} writes)",
          flush=True)

    # ── Coverage report ───────────────────────────────────────────────────────
    all_cited_recs = [
        r for p in state.get("papers", [])
        if p.get("direction") == "cited-by"
        for r in p.get("author_records", [])
    ]
    title_count  = sum(1 for r in all_cited_recs if r.get("current_title"))
    honors_count = sum(1 for r in all_cited_recs if r.get("honors"))
    inst_count   = sum(1 for r in all_cited_recs if r.get("current_institution"))
    print(f"Coverage: title={title_count}/{len(all_cited_recs)}  "
          f"honors={honors_count}/{len(all_cited_recs)}  "
          f"inst={inst_count}/{len(all_cited_recs)}")

    state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Saved state.json", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
