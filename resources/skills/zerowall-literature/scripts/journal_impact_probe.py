"""Probe cited-by journal searches without mutating literature task state.

The production workflow still executes searches through ZeroWall capability
tools.  This diagnostic script makes the same journal queries against the
loopback Free Search bridge when ``--bridge-url`` is supplied and writes an
auditable result matrix.  Without a bridge URL it writes the exact request
plan so a packaged Host can execute it through ``advanced_search``.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote, urljoin

import requests

from literature_pipeline import (
    FALLBACK_SEARCH_ENGINES,
    PRIMARY_SEARCH_ENGINES,
    Paper,
    Task,
    clean_journal_abbreviation,
    clean_text,
    source_urls,
    verified_impact_factor,
)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def journals_from_task(task: Task) -> list[dict[str, Any]]:
    state = task.load()
    journals: dict[str, dict[str, Any]] = {}
    for raw in state.get("papers", []):
        paper = Paper(**{key: value for key, value in raw.items() if key in Paper.__dataclass_fields__})
        if paper.direction != "cited-by" or not clean_text(paper.journal):
            continue
        key = clean_text(paper.journal).lower()
        row = journals.setdefault(key, {
            "journal": clean_text(paper.journal),
            "abbreviation": clean_text(paper.journal_abbrev),
            "issn": list(dict.fromkeys(clean_text(value) for value in paper.issn if clean_text(value))),
            "dois": [],
            "papers": 0,
            "current_metric": {},
        })
        row["papers"] += 1
        if clean_text(paper.doi):
            row["dois"] = list(dict.fromkeys(row["dois"] + [clean_text(paper.doi)]))
        impact, year = verified_impact_factor(paper)
        if impact not in (None, "") and year not in (None, ""):
            row["current_metric"] = {
                "impact_factor": impact,
                "impact_factor_year": year,
                "source_urls": source_urls(paper.journal_metric),
            }
    return sorted(journals.values(), key=lambda row: (-row["papers"], row["journal"].lower()))


def query_for(row: dict[str, Any], field_group: str) -> str:
    issn = row.get("issn") or []
    issn_hint = f' ISSN {issn[0]}' if issn else ""
    if field_group == "metadata":
        return f'"{row["journal"]}"{issn_hint} official ISO 4 abbreviation ISSN NLM Catalog'
    return f'"{row["journal"]}"{issn_hint} "2025 Journal Impact Factor" 2026 JCR official publisher'


def result_count(payload: Any) -> int:
    if not isinstance(payload, dict):
        return 0
    value = payload.get("value") if isinstance(payload.get("value"), dict) else payload
    for key in ("results", "items", "data", "sources"):
        rows = value.get(key) if isinstance(value, dict) else None
        if isinstance(rows, list):
            return len(rows)
    return int(value.get("count") or 0) if isinstance(value, dict) else 0


def candidate_metric_text(payload: Any) -> list[str]:
    """Return diagnostic snippets only; production never ingests these values."""
    text = json.dumps(payload, ensure_ascii=False)
    patterns = (
        r"(?:2025\s+)?(?:Journal\s+Impact\s+Factor|Impact\s+Factor|JIF)\D{0,24}(\d+(?:\.\d+)?)",
        r"(\d+(?:\.\d+)?)\D{0,24}(?:2025\s+)?(?:Journal\s+Impact\s+Factor|Impact\s+Factor|JIF)",
    )
    values: list[str] = []
    for pattern in patterns:
        for candidate in re.findall(pattern, text, flags=re.I):
            try:
                number = float(candidate)
            except ValueError:
                continue
            if 0 < number < 100:
                values.append(candidate)
    return list(dict.fromkeys(values))[:5]


def candidate_years(payload: Any) -> list[str]:
    text = json.dumps(payload, ensure_ascii=False)
    values = re.findall(r"\b20(?:2[0-6])\b", text)
    return list(dict.fromkeys(values))[:8]


def candidate_abbreviations(payload: Any) -> list[str]:
    """Extract explicit abbreviation labels for diagnostics, never ingestion."""
    texts: list[str] = []
    if isinstance(payload, dict):
        value = payload.get("value") if isinstance(payload.get("value"), dict) else payload
        for source in value.get("sources") or []:
            if not isinstance(source, dict):
                continue
            texts.extend(clean_text(source.get(key)) for key in ("snippet", "content") if clean_text(source.get(key)))
    patterns = (
        r"(?:title\s+)?abbreviation\s*[:：]\s*([A-Za-z][A-Za-z0-9.& '\-]{1,50}?)(?=\s+Title(?:\(|\[|\s)|\s*\||$)",
        r"(?:abbreviation|abbreviated\s+title).{0,180}?\bis\s*\"\s*([^\"]{2,50}?)\s*\"",
    )
    values: list[str] = []
    for text in texts:
        for pattern in patterns:
            for value in re.findall(pattern, text, flags=re.I):
                cleaned = clean_text(value).strip(" .,:;-")
                if cleaned and len(cleaned.split()) <= 8:
                    values.append(cleaned)
    return list(dict.fromkeys(values))[:5]


def execute_bridge(base_url: str, query: str, engine: str, timeout: float) -> dict[str, Any]:
    endpoint = urljoin(base_url.rstrip("/") + "/", "api/dsh-free-search-settings/raw-search")
    response = requests.post(
        endpoint,
        json={"query": query, "maxResults": 8, "engine": engine, "cache": False},
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()


def crossref_metadata_probe(row: dict[str, Any], timeout: float) -> dict[str, Any]:
    """Test the deterministic journal metadata path used before web search."""
    doi = next(iter(row.get("dois") or []), "")
    if not doi:
        return {"status": "skipped_missing_doi"}
    try:
        response = requests.get(
            f"https://api.crossref.org/works/{quote(doi, safe='')}",
            headers={"User-Agent": "ZeroWall-Literature-Journal-Probe/1.0"},
            timeout=timeout,
        )
        response.raise_for_status()
        message = response.json().get("message") or {}
        journal_full = clean_text(next(iter(message.get("container-title") or []), ""))
        journal_abbrev_raw = clean_text(next(iter(message.get("short-container-title") or []), ""))
        return {
            "status": "succeeded",
            "doi": doi,
            "journal_full": journal_full,
            "journal_abbrev_raw": journal_abbrev_raw,
            "journal_abbrev": clean_journal_abbreviation(journal_full, journal_abbrev_raw),
            "issn": list(dict.fromkeys(
                clean_text(value) for value in message.get("ISSN") or [] if clean_text(value)
            )),
            "publisher": clean_text(message.get("publisher")),
            "url": f"https://api.crossref.org/works/{quote(doi, safe='')}",
        }
    except Exception as exc:
        return {"status": "failed", "doi": doi, "error": f"{type(exc).__name__}: {exc}"}


def main() -> int:
    parser = argparse.ArgumentParser(description="测试 cited-by 期刊最新影响因子搜索覆盖")
    parser.add_argument("task", type=Path, help="ZeroWall Literature 任务目录")
    parser.add_argument("--journal", action="append", default=[], help="只测试指定期刊，可重复")
    parser.add_argument("--engine", action="append", default=[], help="指定 Free Search 引擎，可重复")
    parser.add_argument(
        "--field", action="append", choices=("metadata", "impact_factor"), default=[],
        help="只测试期刊身份/缩写或影响因子；默认两类都测试",
    )
    parser.add_argument(
        "--bridge-url", default=os.getenv("ZEROWALL_FREE_SEARCH_BRIDGE_URL", ""),
        help="运行中的 ZeroWall Host 地址；省略时只生成搜索计划",
    )
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--workers", type=int, default=4, help="并发搜索数，默认 4")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    task = Task(args.task)
    rows = journals_from_task(task)
    selected = {clean_text(value).lower() for value in args.journal if clean_text(value)}
    if selected:
        rows = [row for row in rows if row["journal"].lower() in selected]
    engines = args.engine or list(PRIMARY_SEARCH_ENGINES + FALLBACK_SEARCH_ENGINES)
    field_groups = args.field or ["metadata", "impact_factor"]
    output = args.output or task.root / "analysis" / "journal-impact-probe.json"
    output.parent.mkdir(parents=True, exist_ok=True)

    for row in rows:
        row["crossref_probe"] = crossref_metadata_probe(row, args.timeout)

    def run_probe(row: dict[str, Any], engine: str, field_group: str) -> dict[str, Any]:
        query = query_for(row, field_group)
        probe = {
            "journal": row["journal"], "abbreviation": row["abbreviation"],
            "issn": row["issn"], "field_group": field_group,
            "engine": engine, "query": query,
            "status": "planned", "searched_at": "",
        }
        if not args.bridge_url:
            return probe
        probe["searched_at"] = now()
        try:
            result = execute_bridge(args.bridge_url, query, engine, args.timeout)
            probe.update({
                "status": "succeeded", "actual_engine": clean_text(
                    (result.get("value") or {}).get("provider") if isinstance(result.get("value"), dict)
                    else result.get("provider")
                ),
                "result_count": result_count(result),
                "candidate_impact_factor_values": candidate_metric_text(result),
                "candidate_impact_factor_years": candidate_years(result),
                "candidate_journal_abbreviations": candidate_abbreviations(result),
                "result": result,
            })
        except Exception as exc:
            probe.update({"status": "failed", "error": f"{type(exc).__name__}: {exc}"})
        return probe

    probes: list[dict[str, Any]] = []
    work = [
        (row, engine, field_group)
        for row in rows for engine in engines for field_group in field_groups
    ]
    if args.bridge_url and work:
        workers = max(1, min(int(args.workers), len(work), 8))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(run_probe, row, engine, field_group) for row, engine, field_group in work]
            for future in as_completed(futures):
                probes.append(future.result())
    else:
        probes = [run_probe(row, engine, field_group) for row, engine, field_group in work]
    probes.sort(key=lambda row: (row["journal"].lower(), row["field_group"], row["engine"].lower()))

    document = {
        "schema": 1,
        "generated_at": now(),
        "task": str(task.root),
        "mode": "live_bridge" if args.bridge_url else "request_plan",
        "journal_count": len(rows),
        "engines": engines,
        "field_groups": field_groups,
        "current_verified_jif_count": sum(bool(row["current_metric"]) for row in rows),
        "crossref_metadata_success_count": sum(
            row.get("crossref_probe", {}).get("status") == "succeeded" for row in rows
        ),
        "journals": rows,
        "probes": probes,
        "production_rule": (
            "候选片段只用于诊断。正式 Excel/报告仍要求期刊名称或 ISSN 匹配，"
            "并同时取得 JIF 数值、指标年份和来源 URL。"
        ),
    }
    output.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(output), "mode": document["mode"], "journals": len(rows),
        "probes": len(probes), "succeeded": sum(row["status"] == "succeeded" for row in probes),
        "failed": sum(row["status"] == "failed" for row in probes),
        "crossref_metadata_succeeded": document["crossref_metadata_success_count"],
        "verified_jif": document["current_verified_jif_count"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
