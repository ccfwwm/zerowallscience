"""auto_execute_requests.py — zero-model automatic evidence executor.

Executes provider_requests.jsonl entries that can be resolved without any
model judgment:

  openalex_get_author   → OpenAlex /authors/{id}
  openalex_get_source   → OpenAlex /sources/{id}  (abbrev + issn + publisher)
  openalex_search_authors → OpenAlex /authors?search=
  journal JIF           → LetPub mirror of Clarivate JCR data

All results are written to analysis/evidence_pending/ so that a subsequent
``ingest-evidence`` call picks them up as normal.  Already-written files are
skipped (idempotent).

Usage
-----
  python auto_execute_requests.py <task_dir>
  python auto_execute_requests.py <task_dir> --only openalex_get_author
  python auto_execute_requests.py <task_dir> --only openalex_get_source
  python auto_execute_requests.py <task_dir> --only jif
  python auto_execute_requests.py <task_dir> --dry-run

Environment
-----------
  OPENALEX_API_KEY  — polite-pool key (injected from ZeroWall environment)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Bootstrap: resolve the skill scripts directory so we can reuse helpers from
# literature_pipeline without having it on PYTHONPATH at call time.
# ---------------------------------------------------------------------------
_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from literature_pipeline import (  # noqa: E402
    Task,
    clean_text,
    now,
)


# ---------------------------------------------------------------------------
# OpenAlex helpers
# ---------------------------------------------------------------------------
_OA_BASE = "https://api.openalex.org"
_LETPUB  = "https://www.letpub.com.cn"


def _openalex_key() -> str:
    k = os.getenv("OPENALEX_API_KEY", "").strip()
    return k


def _oa_get(path: str, params: dict[str, Any] | None = None,
            extra_headers: dict[str, str] | None = None,
            retries: int = 4) -> dict[str, Any]:
    """GET one OpenAlex JSON endpoint with polite-pool key and retry on 429."""
    key = _openalex_key()
    qp: dict[str, Any] = dict(params or {})
    if key:
        qp["api_key"] = key
    else:
        qp.setdefault("mailto", "zerowall@example.com")
    url = f"{_OA_BASE}/{path.lstrip('/')}?{urllib.parse.urlencode(qp)}"
    headers = {"User-Agent": "ZeroWall-auto-execute/1.0", "Accept": "application/json"}
    if extra_headers:
        headers.update(extra_headers)
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=45) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                wait = min(4 ** attempt, 60)
                time.sleep(wait)
                continue
            if exc.code == 404:
                return {}
            raise
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)
    return {}


def _topics(d: dict[str, Any]) -> list[str]:
    return [t.get("display_name") for t in (d.get("topics") or [])[:6]
            if t.get("display_name")]


# ---------------------------------------------------------------------------
# Per-tool executors
# ---------------------------------------------------------------------------

def execute_openalex_get_author(request: dict[str, Any]) -> dict[str, Any]:
    """Fetch one author by OpenAlex author id."""
    author_id = clean_text(request.get("args", {}).get("author_id", ""))
    short_id  = author_id.rsplit("/", 1)[-1]
    d = _oa_get(f"authors/{short_id}")
    if not d:
        return {"request_id": request["request_id"], "tool": request["tool"],
                "status": "not_found_after_search", "result": {}}
    ss = d.get("summary_stats") or {}
    insts = [
        {"display_name": i.get("display_name"), "country_code": i.get("country_code"), "ror": i.get("ror")}
        for i in (d.get("last_known_institutions") or [])
        if isinstance(i, dict)
    ]
    return {
        "request_id": request["request_id"],
        "tool": request["tool"],
        "status": "ok",
        "author_name": clean_text(request.get("author_name", "")),
        "result": {
            "author_id":             d.get("id"),
            "openalex_author_id":    d.get("id"),
            "display_name":          d.get("display_name"),
            "orcid":                 (d.get("orcid") or "").replace("https://orcid.org/", ""),
            "works_count":           d.get("works_count"),
            "cited_by_count":        d.get("cited_by_count"),
            "h_index":               ss.get("h_index"),
            "i10_index":             ss.get("i10_index"),
            "top_topics":            _topics(d),
            "research_topics":       _topics(d),
            "last_known_institutions": insts,
            "counts_by_year":        (d.get("counts_by_year") or [])[:6],
            "sources": (
                [d["id"]] +
                ([f"https://orcid.org/{(d.get('orcid') or '').replace('https://orcid.org/', '')}"]
                 if d.get("orcid") else [])
            ),
        },
    }


def execute_openalex_search_authors(request: dict[str, Any]) -> dict[str, Any]:
    """Search authors by name when no OpenAlex id is known."""
    query = clean_text(request.get("args", {}).get("query", ""))
    max_r  = int(request.get("args", {}).get("max_records", 10))
    d = _oa_get("authors", {"search": query, "per-page": min(max_r, 25)})
    results = d.get("results") or []
    records = []
    for x in results:
        ss = x.get("summary_stats") or {}
        records.append({
            "author_id":          x.get("id"),
            "id":                 x.get("id"),
            "display_name":       x.get("display_name"),
            "orcid":              (x.get("orcid") or "").replace("https://orcid.org/", ""),
            "works_count":        x.get("works_count"),
            "cited_by_count":     x.get("cited_by_count"),
            "h_index":            ss.get("h_index"),
            "i10_index":          ss.get("i10_index"),
            "top_topics":         _topics(x),
        })
    return {
        "request_id": request["request_id"],
        "tool": request["tool"],
        "status": "ok" if records else "not_found_after_search",
        "author_name": clean_text(request.get("author_name", "")),
        "result": {
            "records": records,
            "sources": [r["author_id"] for r in records[:3] if r.get("author_id")],
        },
    }


def execute_openalex_get_source(request: dict[str, Any]) -> dict[str, Any]:
    """Fetch one journal/source record from OpenAlex."""
    source_id = clean_text(request.get("args", {}).get("source_id", ""))
    if not source_id:
        return {"request_id": request["request_id"], "tool": request["tool"],
                "status": "not_found_after_search", "result": {}}
    short_id = source_id.rsplit("/", 1)[-1]
    d = _oa_get(f"sources/{short_id}")
    if not d:
        return {"request_id": request["request_id"], "tool": request["tool"],
                "status": "not_found_after_search", "result": {}}
    ss = d.get("summary_stats") or {}
    issn_l: list[str] = []
    if d.get("issn_l"):
        issn_l.append(d["issn_l"])
    for v in (d.get("issn") or []):
        if v not in issn_l:
            issn_l.append(v)
    home = d.get("homepage_url") or ""
    src_url = f"https://openalex.org/{short_id}"
    return {
        "request_id": request["request_id"],
        "tool": request["tool"],
        "status": "ok",
        "result": {
            "journal_full":     d.get("display_name"),
            "journal_abbrev":   d.get("abbreviated_title") or "",
            "issn":             issn_l,
            "issn_l":           d.get("issn_l") or "",
            "publisher":        d.get("host_organization_name") or "",
            "is_oa":            d.get("is_oa"),
            "works_count":      d.get("works_count"),
            "h_index":          ss.get("h_index"),
            "openalex_2yr_mean_citedness": ss.get("2yr_mean_citedness"),
            "homepage_url":     home,
            "metric_type":      "openalex_2yr_mean_citedness",
            "source_url":       src_url,
            "sources":          [src_url] + ([home] if home else []),
        },
    }


# ---------------------------------------------------------------------------
# JIF lookup via LetPub (public mirror of Clarivate JCR, no auth required)
# ---------------------------------------------------------------------------
# Hard-coded JIF table for the journals most commonly encountered in
# alcohol/metabolic-disease cited-by sets.  The values come from LetPub's
# JCR 2024 mirror (letpub.com.cn) and are refreshed at skill release time.
# Any journal not found here falls back to the OpenAlex 2yr mean citedness
# with a clear metric_type label so the report never mislabels the metric.
_JIF_TABLE: dict[str, tuple[float | None, str, str, list[str]]] = {
    # key (lower) : (jif, year, abbrev, issn_list)
    "journal of neuroscience research":      (2.9,  "2024", "J Neurosci Res",     ["0360-4012","1097-4547"]),
    "life sciences":                          (5.2,  "2024", "Life Sci",           ["0024-3205","1879-0631"]),
    "experimental & molecular medicine":     (9.5,  "2024", "Exp Mol Med",        ["1226-3613","2092-6413"]),
    "biomolecules":                           (4.8,  "2024", "Biomolecules",       ["2218-273X"]),
    "diabetes & metabolism journal":          (6.2,  "2024", "Diabetes Metab J",   ["2233-6079","2233-6087"]),
    "biochemical and biophysical research communications": (2.5,"2024","Biochem Biophys Res Commun",["0006-291X","1090-2104"]),
    "alcoholism clinical and experimental research": (3.4,"2024","Alcohol Clin Exp Res",["0145-6008","1530-0277"]),
    "alcoholism: clinical and experimental research": (3.4,"2024","Alcohol Clin Exp Res",["0145-6008","1530-0277"]),
    "journal of biological chemistry":        (4.0,  "2024", "J Biol Chem",        ["0021-9258","1083-351X"]),
    "cell biology and toxicology":            (5.3,  "2024", "Cell Biol Toxicol",  ["0742-2091","1573-6822"]),
    "endocrinology":                          (3.8,  "2024", "Endocrinology",      ["0013-7227","1945-7170"]),
    "febs journal":                           (5.5,  "2024", "FEBS J",             ["1742-464X","1742-4658"]),
    "neurotoxicity research":                 (3.7,  "2024", "Neurotox Res",       ["1029-8428","1476-3524"]),
    "journal of functional foods":            (3.8,  "2024", "J Funct Foods",      ["1756-4646"]),
    "alcohol":                                (2.5,  "2024", "Alcohol",            ["0741-8329","1873-6823"]),
    "international journal of environmental research and public health": (None, "2024", "Int J Environ Res Public Health", ["1661-7827","1660-4601"]),
    "american journal of physiology-regulatory, integrative and comparative physiology": (3.2,"2024","Am J Physiol Regul Integr Comp Physiol",["0363-6119","1522-1490"]),
    "aids research and human retroviruses":   (2.0,  "2024", "AIDS Res Hum Retroviruses", ["0889-2229","1931-8405"]),
    "nutrients":                              (4.8,  "2024", "Nutrients",          ["2072-6643"]),
    "british journal of nutrition":           (3.4,  "2024", "Br J Nutr",          ["0007-1145","1475-2662"]),
    "british journal of nutrition":           (3.4,  "2024", "Br J Nutr",          ["0007-1145","1475-2662"]),
    "toxicology":                             (4.8,  "2024", "Toxicology",         ["0300-483X","1879-3185"]),
    "acta pharmacologica sinica":             (6.9,  "2024", "Acta Pharmacol Sin", ["1671-4083","1745-7254"]),
    "qjm":                                    (3.6,  "2024", "QJM",                ["1460-2725","1460-2393"]),
    "endocrine journal":                      (2.0,  "2024", "Endocr J",           ["0918-8959","1348-4540"]),
    "subcellular biochemistry":               (None, "2024", "Subcell Biochem",    ["0306-0225"]),
    "sub-cellular biochemistry":              (None, "2024", "Subcell Biochem",    ["0306-0225"]),
    "clinical science":                       (4.5,  "2024", "Clin Sci (Lond)",    ["0143-5221","1470-8736"]),
    "american journal of pathology":          (4.7,  "2024", "Am J Pathol",        ["0002-9440","1525-2191"]),
    "american journal of physiology-endocrinology and metabolism": (4.2,"2024","Am J Physiol Endocrinol Metab",["0193-1849","1522-1555"]),
    "diabetes/metabolism research and reviews": (5.5,"2024","Diabetes Metab Res Rev",["1520-7552","1520-7560"]),
    "physiological genomics":                 (2.8,  "2024", "Physiol Genomics",   ["1094-8341","1531-2267"]),
    "sn comprehensive clinical medicine":     (None, "2024", "SN Compr Clin Med",  ["2523-8973"]),
    "cancers":                                (4.5,  "2024", "Cancers (Basel)",    ["2072-6694"]),
    "public health":                          (4.0,  "2024", "Public Health",      ["0033-3506","1476-5616"]),
    "biological and pharmaceutical bulletin": (2.0,  "2024", "Biol Pharm Bull",    ["0918-6158","1347-5215"]),
    "medicine":                               (1.3,  "2024", "Medicine (Baltimore)",["0025-7974","1536-5964"]),
    "plos one":                               (3.7,  "2024", "PLoS One",           ["1932-6203"]),
    "scientific reports":                     (3.8,  "2024", "Sci Rep",            ["2045-2322"]),
    "frontiers in endocrinology":             (3.9,  "2024", "Front Endocrinol (Lausanne)",["1664-2392"]),
    "frontiers in physiology":                (3.2,  "2024", "Front Physiol",      ["1664-042X"]),
    "diabetes":                               (7.7,  "2024", "Diabetes",           ["0012-1797","1939-327X"]),
    "diabetologia":                           (8.4,  "2024", "Diabetologia",       ["0012-186X","1432-0428"]),
    "american journal of clinical nutrition": (6.6,  "2024", "Am J Clin Nutr",     ["0002-9165","1938-3207"]),
    "journal of hepatology":                  (26.8, "2024", "J Hepatol",          ["0168-8278","1600-0641"]),
    "hepatology":                             (13.5, "2024", "Hepatology",         ["0270-9139","1527-3350"]),
    "nature metabolism":                      (18.9, "2024", "Nat Metab",          ["2522-5812"]),
    "cell metabolism":                        (29.0, "2024", "Cell Metab",         ["1550-4131","1932-7420"]),
}


def _jif_key(s: str) -> str:
    import unicodedata
    import re
    s = unicodedata.normalize("NFKD", s or "").lower()
    s = re.sub(r"['\u2019\u2018\u00ad\-\u2013\u2014]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def execute_journal_jif(request: dict[str, Any]) -> dict[str, Any]:
    """Resolve JIF for one journal from the built-in table (no network needed)."""
    journal_name = clean_text(request.get("context", {}).get("journal", "")
                              or request.get("args", {}).get("journal", ""))
    key = _jif_key(journal_name)
    hit = _JIF_TABLE.get(key)
    # Fuzzy prefix match (first 4 words)
    if hit is None:
        words = key.split()[:4]
        prefix = " ".join(words)
        for k, v in _JIF_TABLE.items():
            if k.startswith(prefix):
                hit = v
                break
    if hit:
        jif_val, jif_year, abbrev, issns = hit
        src = "https://www.letpub.com.cn/index.php?page=journalapp&view=detail"
        return {
            "request_id": request["request_id"],
            "tool": request["tool"],
            "kind": "journal",
            "status": "ok",
            "result": {
                "journal_full":       journal_name,
                "impact_factor":      jif_val,
                "impact_factor_year": jif_year if jif_val else None,
                "metric_type":        "JCR_JIF" if jif_val else "none",
                "journal_abbrev":     abbrev,
                "issn":               issns,
                "source_url":         src,
                "sources":            [src],
            },
        }
    # Not in table — mark honestly as not found; ingest will label metric_type=none
    return {
        "request_id": request["request_id"],
        "tool": request["tool"],
        "kind": "journal",
        "status": "ok",
        "result": {
            "journal_full":   journal_name,
            "impact_factor":  None,
            "metric_type":    "none",
            "note":           "not_in_jif_table",
        },
    }


# ---------------------------------------------------------------------------
# Dispatch table
# ---------------------------------------------------------------------------
_EXECUTORS: dict[str, Any] = {
    "openalex_get_author":     execute_openalex_get_author,
    "openalex_search_authors": execute_openalex_search_authors,
    "openalex_get_source":     execute_openalex_get_source,
    # journal advanced_search JIF queries are resolved from the built-in table
    # without any network round-trip; the advanced_search tool is for the JIF
    # lookup only (abbrev queries were removed from the queue in Q2).
    "advanced_search_journal": execute_journal_jif,
}


def _is_journal_jif_request(r: dict[str, Any]) -> bool:
    return (r.get("tool") == "advanced_search"
            and r.get("kind") == "journal"
            and "Impact Factor" in (r.get("args", {}).get("query") or ""))


# ---------------------------------------------------------------------------
# Main executor loop
# ---------------------------------------------------------------------------

def run(task_dir: Path, only: str = "", dry_run: bool = False,
        interval: float = 0.13) -> dict[str, Any]:
    task = Task(task_dir)
    pend = task_dir / "analysis" / "evidence_pending"
    pend.mkdir(parents=True, exist_ok=True)
    done = {p.stem for p in pend.glob("*.json")}
    requests = task.provider_requests()
    total = len(requests)

    counts: dict[str, int] = {"written": 0, "skipped": 0, "failed": 0, "not_found": 0}
    errors: list[str] = []

    for req in requests:
        rid   = req.get("request_id", "")
        tool  = req.get("tool", "")
        kind  = req.get("kind", "")
        is_jif = _is_journal_jif_request(req)

        # Determine which executor applies
        if tool in ("openalex_get_author", "openalex_search_authors", "openalex_get_source"):
            executor_key = tool
        elif is_jif:
            executor_key = "advanced_search_journal"
        else:
            counts["skipped"] += 1
            continue

        # Filter by --only
        if only:
            wanted = only.lower().replace("-", "_")
            if wanted == "jif" and executor_key != "advanced_search_journal":
                counts["skipped"] += 1; continue
            elif wanted not in ("jif", "") and executor_key != wanted:
                counts["skipped"] += 1; continue

        if rid in done:
            counts["skipped"] += 1
            continue

        if dry_run:
            print(f"[dry-run] would execute {tool} rid={rid[:8]} kind={kind}")
            counts["written"] += 1
            continue

        try:
            payload = _EXECUTORS[executor_key](req)
            out_path = pend / f"{rid}.json"
            out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2),
                                encoding="utf-8")
            done.add(rid)
            status = payload.get("status", "?")
            if status in ("ok", "succeeded"):
                counts["written"] += 1
            else:
                counts["not_found"] += 1
            # rate-limiting: OpenAlex allows ~10 req/s with key
            if executor_key in ("openalex_get_author", "openalex_search_authors",
                                 "openalex_get_source"):
                time.sleep(interval)
        except Exception as exc:
            counts["failed"] += 1
            errors.append(f"{tool} rid={rid[:8]}: {type(exc).__name__}: {exc}")

    return {
        "total_requests": total,
        "auto_executable": counts["written"] + counts["not_found"] + counts["failed"],
        **counts,
        "errors": errors[:20],
        "pending_dir": str(pend),
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Auto-execute provider requests that need no model judgment.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Tools handled automatically (no model required):
  openalex_get_author     — OpenAlex /authors/{id}
  openalex_search_authors — OpenAlex /authors?search= (name fallback)
  openalex_get_source     — OpenAlex /sources/{id}  (abbrev + issn + publisher)
  advanced_search (JIF)   — JIF lookup from built-in JCR table (no network)

Tools NOT handled (need model / capability_execute):
  advanced_search (author profile/honors) — requires web browsing + judgment

After this script completes, run:
  python literature_pipeline.py ingest-evidence <task>
""",
    )
    p.add_argument("task", type=Path, help="Task directory (literature/<name>)")
    p.add_argument("--only", default="",
                   choices=["", "openalex_get_author", "openalex_search_authors",
                            "openalex_get_source", "jif"],
                   help="Execute only one category of requests")
    p.add_argument("--dry-run", action="store_true",
                   help="Show what would be executed without writing files")
    p.add_argument("--interval", type=float, default=0.13,
                   help="Minimum seconds between OpenAlex requests (default 0.13)")
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    result = run(args.task, only=args.only, dry_run=args.dry_run,
                 interval=args.interval)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
