"""Reproducible, title-driven literature acquisition and citation audit CLI.

The script is deliberately deterministic at the network/data boundary: every
provider response is recorded in the source ledger, every task is resumable,
and generated reports never contain credentials or complete PDF contents.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import json
import mimetypes
import os
import re
import shutil
import sys
import tempfile
import threading
import time
import html as html_lib
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qsl, quote, urlencode, urlparse, urlunparse

import requests


CROSSREF = "https://api.crossref.org/works"
OPENALEX = "https://api.openalex.org/works"
EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest"
UNPAYWALL = "https://api.unpaywall.org/v2"
USER_AGENT = "ZeroWall-Science-literature/1.1 (research workflow)"
DEFAULT_MAX_PDF_BYTES = 120 * 1024 * 1024
RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}
ACQUISITION_TERMINAL = {
    "downloaded", "downloaded_authorized",
    "downloaded_open_access", "downloaded_paper_download", "downloaded_tsg",
    "downloaded_authorized_adapter", "already_present", "unavailable_no_authorized_source",
    "blocked_ambiguous_match", "blocked_identity_mismatch", "blocked_provider_rate_limit",
}
SENSITIVE_QUERY_KEYS = {"token", "query", "key", "cookie", "authorization", "jsessionid", "signature", "sig", "iv"}
DOI_RE = re.compile(r"10\.\d{4,9}/[-._;()/:A-Z0-9]+", re.I)
PMID_RE = re.compile(r"(?:pubmed\.ncbi\.nlm\.nih\.gov/|pmid[:\s]*)?(\d{5,9})$", re.I)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def safe_name(value: str, limit: int = 120) -> str:
    value = re.sub(r"[<>:\"/\\|?*\x00-\x1f]", "_", clean_text(value)).strip(" .")
    return (value or "paper")[:limit]


def article_slug(value: str) -> str:
    """Create a stable, filesystem-safe directory name for one main article."""
    ascii_part = re.sub(r"[^a-z0-9]+", "-", clean_text(value).lower()).strip("-")
    digest = hashlib.sha1(clean_text(value).encode("utf-8")).hexdigest()[:8]
    return f"{(ascii_part or 'article')[:72]}-{digest}"


def article_identity(paper: "Paper") -> str:
    """Use a provider identifier when available, otherwise normalized title."""
    if paper.doi:
        return f"doi:{normalize_doi(paper.doi)}"
    if paper.pmid:
        return f"pmid:{clean_text(paper.pmid)}"
    return f"title:{clean_text(paper.title).lower()}"


def redact_url(value: str) -> str:
    """Keep provenance useful without persisting bearer/query credentials."""
    try:
        parsed = urlparse(value)
        query = [(key, "[REDACTED]" if key.lower() in SENSITIVE_QUERY_KEYS else val) for key, val in parse_qsl(parsed.query, keep_blank_values=True)]
        return urlunparse(parsed._replace(query=urlencode(query)))
    except ValueError:
        return "[invalid-url]"


def title_tokens(value: str) -> set[str]:
    return {x for x in re.findall(r"[a-z0-9]+", value.lower()) if len(x) > 2}


def title_score(left: str, right: str) -> float:
    a, b = title_tokens(left), title_tokens(right)
    overlap = len(a & b) / max(len(a | b), 1)
    return round(0.55 * overlap + 0.45 * SequenceMatcher(None, clean_text(left).lower(), clean_text(right).lower()).ratio(), 4)


@dataclass
class Paper:
    key: str
    title: str
    doi: str = ""
    pmid: str = ""
    year: str = ""
    journal: str = ""
    authors: list[str] = field(default_factory=list)
    corresponding_authors: list[str] = field(default_factory=list)
    affiliations: list[str] = field(default_factory=list)
    abstract: str = ""
    source: str = ""
    direction: str = "target"
    cited_by_counts: dict[str, int] = field(default_factory=dict)
    oa_urls: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)
    pdf_path: str = ""
    pdf_source: str = ""
    pdf_sha256: str = ""
    pdf_status: str = "not_attempted"
    parse_status: str = "not_attempted"
    parsed_text_path: str = ""
    parser_api: str = ""
    parser_task_id: str = ""
    parser_artifacts: list[dict[str, Any]] = field(default_factory=list)
    mineru_snapshot_dir: str = ""
    mineru_manifest_path: str = ""
    mineru_broken_links: list[str] = field(default_factory=list)
    mineru_file_counts: dict[str, int] = field(default_factory=dict)
    citation_contexts: list[dict[str, Any]] = field(default_factory=list)
    author_profiles: list[dict[str, Any]] = field(default_factory=list)
    acquisition_state: str = "candidate"
    acquisition_attempts: list[dict[str, Any]] = field(default_factory=list)
    countries: list[str] = field(default_factory=list)
    institutions: list[str] = field(default_factory=list)
    dedup_keys: list[str] = field(default_factory=list)
    openalex_id: str = ""
    semantic_scholar_id: str = ""
    journal_abbrev: str = ""
    publisher: str = ""
    issn: list[str] = field(default_factory=list)
    volume: str = ""
    issue: str = ""
    pages: str = ""
    journal_metric: dict[str, Any] = field(default_factory=dict)
    author_records: list[dict[str, Any]] = field(default_factory=list)
    citation_relation: dict[str, Any] = field(default_factory=dict)


class Task:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        (root / "downloads").mkdir(exist_ok=True)
        (root / "parsed").mkdir(exist_ok=True)
        self.state_path = root / "state.json"
        self.ledger_path = root / "source_ledger.json"
        self.mcp_receipts_path = root / "mcp_receipts.jsonl"
        self._ledger_lock = threading.Lock()

    def load(self) -> dict[str, Any]:
        try:
            return json.loads(self.state_path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return {"schema": 3, "created_at": now(), "stage": "initialized", "single_article": True, "papers": [], "phase_status": {}}

    def save(self, state: dict[str, Any]) -> None:
        state["updated_at"] = now()
        tmp = self.state_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self.state_path)

    def ledger(self) -> list[dict[str, Any]]:
        try:
            return json.loads(self.ledger_path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return []

    def record(self, provider: str, url: str, status: str, **meta: Any) -> None:
        item = {"provider": provider, "url": redact_url(url), "status": status, "at": now()}
        item.update({k: v for k, v in meta.items() if v is not None})
        with self._ledger_lock:
            rows = self.ledger()
            rows.append(item)
            tmp = self.ledger_path.with_suffix(".tmp")
            tmp.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp.replace(self.ledger_path)

    def record_mcp(self, provider: str, tool: str, status: str, **meta: Any) -> None:
        """Append a redacted receipt for an actual MCP/skill invocation."""
        item = {"provider": clean_text(provider), "tool": clean_text(tool), "status": clean_text(status), "at": now()}
        item.update({k: v for k, v in meta.items() if v is not None})
        with self._ledger_lock:
            with self.mcp_receipts_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(item, ensure_ascii=False) + "\n")

    def mcp_receipts(self) -> list[dict[str, Any]]:
        try:
            return [json.loads(line) for line in self.mcp_receipts_path.read_text(encoding="utf-8").splitlines() if line.strip()]
        except (FileNotFoundError, json.JSONDecodeError):
            return []


class Client:
    def __init__(self, task: Task, timeout: float = 30.0):
        self.task, self.timeout = task, timeout
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
        self._json_cache: dict[str, dict[str, Any]] = {}
        self._provider_backoff: dict[str, float] = {}
        self._provider_lock = threading.Lock()

    def get_json(self, provider: str, url: str, **kwargs: Any) -> dict[str, Any]:
        params = kwargs.get("params") or {}
        cache_key = json.dumps([provider, url, sorted((str(k), str(v)) for k, v in params.items())], ensure_ascii=False)
        if cache_key in self._json_cache:
            self.task.record_mcp(provider, f"json:{provider}", "cache_hit", url=url)
            return self._json_cache[cache_key]
        for attempt in range(1, 4):
            with self._provider_lock:
                delay_until = self._provider_backoff.get(provider, 0.0)
            if delay_until > time.monotonic():
                time.sleep(min(delay_until - time.monotonic(), 8.0))
            response = None
            try:
                response = self.session.get(url, timeout=self.timeout, **kwargs)
                self.task.record(provider, response.url, str(response.status_code), attempt=attempt)
                self.task.record_mcp(provider, f"json:{provider}", str(response.status_code), url=redact_url(response.url), attempt=attempt)
                if response.status_code == 429:
                    retry_after = float(response.headers.get("retry-after") or min(2 ** attempt, 8))
                    with self._provider_lock:
                        self._provider_backoff[provider] = time.monotonic() + retry_after
                    if attempt < 3:
                        time.sleep(min(retry_after, 8.0))
                        continue
                    return {}
                response.raise_for_status()
                data = response.json()
                self._json_cache[cache_key] = data
                return data
            except Exception as exc:
                self.task.record(provider, url, "error", error=type(exc).__name__, attempt=attempt)
                self.task.record_mcp(provider, f"json:{provider}", "error", url=redact_url(url), error=type(exc).__name__, attempt=attempt)
                status = getattr(locals().get("response"), "status_code", None)
                if attempt < 3 and (status in RETRYABLE_STATUS or status is None):
                    time.sleep(min(2 ** (attempt - 1), 4))
                    continue
                return {}

    def resolve(self, value: str) -> tuple[Paper | None, list[dict[str, Any]]]:
        raw = value.strip()
        doi_match = DOI_RE.search(raw)
        if doi_match:
            doi = doi_match.group(0).rstrip(".,;)")
            paper = self.by_doi(doi)
            return paper, []
        pmid_match = PMID_RE.search(raw)
        if pmid_match and (raw.isdigit() or "pubmed" in raw.lower() or "pmid" in raw.lower()):
            paper = self.by_pmid(pmid_match.group(1))
            return paper, []
        if Path(raw).is_file():
            return self.from_local(Path(raw)), []
        candidates = self.search_title(raw)
        if not candidates or candidates[0].raw.get("match_score", 0) < 0.65:
            return None, [{"title": p.title, "doi": p.doi, "pmid": p.pmid, "score": title_score(raw, p.title)} for p in candidates]
        return candidates[0], [{"title": p.title, "doi": p.doi, "pmid": p.pmid, "score": title_score(raw, p.title)} for p in candidates]

    def by_doi(self, doi: str) -> Paper | None:
        data = self.get_json("crossref", f"{CROSSREF}/{quote(doi, safe='')}").get("message") or {}
        if not data:
            return None
        return self.crossref_paper(data, "target")

    def by_pmid(self, pmid: str) -> Paper | None:
        data = self.get_json("europepmc", f"{EPMC}/search", params={"query": f"EXT_ID:{pmid}", "format": "json", "resultType": "core"})
        rows = (data.get("resultList") or {}).get("result") or []
        return self.epmc_paper(rows[0], "target") if rows else None

    def search_title(self, title: str) -> list[Paper]:
        cr = self.get_json("crossref", CROSSREF, params={"query.title": title, "rows": 8}).get("message", {}).get("items", [])
        ep = self.get_json("europepmc", f"{EPMC}/search", params={"query": f'TITLE:"{title}"', "format": "json", "pageSize": 8, "resultType": "core"})
        candidates = [self.crossref_paper(x, "target") for x in cr] + [self.epmc_paper(x, "target") for x in (ep.get("resultList", {}).get("result") or [])]
        unique: dict[str, Paper] = {}
        for paper in candidates:
            paper.raw["match_score"] = title_score(title, paper.title)
            key = paper.doi.lower() or paper.pmid or paper.title.lower()
            if key and (key not in unique or paper.raw["match_score"] > unique[key].raw.get("match_score", 0)):
                unique[key] = paper
        return sorted(unique.values(), key=lambda p: p.raw.get("match_score", 0), reverse=True)

    def from_local(self, path: Path) -> Paper:
        source = "local"
        titles: list[str] = []
        if path.suffix.lower() in (".xlsx", ".xlsm"):
            try:
                from openpyxl import load_workbook  # type: ignore
                book = load_workbook(path, read_only=True, data_only=True)
                titles = []
                for sheet in book.worksheets:
                    titles.extend(self._local_titles([list(row) for row in sheet.iter_rows(values_only=True)]))
                titles = self._unique_titles(titles)
                source = "local_excel"
            except Exception:
                titles = []
        elif path.suffix.lower() == ".csv":
            try:
                with path.open(encoding="utf-8-sig", newline="") as handle:
                    titles = self._local_titles(list(csv.reader(handle)))
                source = "local_csv"
            except Exception:
                titles = []
        if titles:
            if len(titles) > 1:
                preview = "；".join(titles[:3])
                raise ValueError(f"输入文件包含多个主文章标题（{len(titles)} 个）：{preview}。一次任务只能处理一篇主文章，请拆分为独立工作目录后重试。")
            return Paper(key=f"local:{path.resolve()}", title=titles[0], source=source, raw={"path": str(path.resolve()), "local_titles": titles})
        text = extract_pdf_text(path) if path.suffix.lower() == ".pdf" else ""
        title = next((clean_text(line) for line in text.splitlines() if 30 < len(clean_text(line)) < 240), path.stem)
        return Paper(key=f"local:{path.resolve()}", title=title, source="local", raw={"path": str(path.resolve())})

    @staticmethod
    def _local_titles(rows: list[list[Any]]) -> list[str]:
        """Extract distinct article titles and reject batch-style inputs."""
        if not rows:
            return []
        header = [clean_text(value).lower() for value in rows[0]]
        title_columns = [index for index, value in enumerate(header) if re.search(r"(?:^|[ _-])(title|article|paper|标题|文章)(?:$|[ _-])", value)]
        candidates: list[str] = []
        for row in rows[1:] if title_columns else rows:
            values = [row[index] for index in title_columns if index < len(row)] if title_columns else row
            for value in values:
                text = clean_text(value)
                lower = text.lower()
                if len(text) < 20 or lower in {"doi", "title", "article", "paper", "nan", "none"} or DOI_RE.fullmatch(text):
                    continue
                if re.fullmatch(r"\d{4}[-/]\d{1,2}[-/]\d{1,2}", text):
                    continue
                candidates.append(text)
        return Client._unique_titles(candidates)

    @staticmethod
    def _unique_titles(candidates: Iterable[str]) -> list[str]:
        unique: list[str] = []
        for value in candidates:
            if not any(title_score(value, existing) >= 0.94 for existing in unique):
                unique.append(value)
        return unique

    @staticmethod
    def crossref_paper(item: dict[str, Any], direction: str) -> Paper:
        doi = clean_text(item.get("DOI")).lower()
        authors = [clean_text(f"{a.get('given', '')} {a.get('family', '')}") for a in item.get("author", [])]
        year = ((item.get("published-print") or item.get("published-online") or item.get("issued") or {}).get("date-parts") or [[""]])[0][0]
        oa = [clean_text(x.get("URL")) for x in item.get("link", []) if x.get("URL")]
        affiliations = [clean_text(a.get("name")) for author in item.get("author", []) for a in author.get("affiliation", []) if a.get("name")]
        corresponding = [clean_text(f"{a.get('given', '')} {a.get('family', '')}") for a in item.get("author", []) if a.get("role") and any(r.get("role") == "editor" for r in a.get("role", []))]
        return Paper(key=f"doi:{doi}" if doi else f"title:{clean_text((item.get('title') or [''])[0]).lower()}", title=clean_text((item.get("title") or [""])[0]), doi=doi, year=str(year), journal=clean_text((item.get("container-title") or [""])[0]), authors=authors, affiliations=affiliations, corresponding_authors=corresponding, oa_urls=oa, source="crossref", direction=direction, raw=item, publisher=clean_text(item.get("publisher")), issn=list(dict.fromkeys(clean_text(x) for x in item.get("ISSN", []) if clean_text(x))), volume=clean_text(item.get("volume")), issue=clean_text(item.get("issue")), pages=clean_text(item.get("page")))

    @staticmethod
    def epmc_paper(item: dict[str, Any], direction: str) -> Paper:
        doi = clean_text(item.get("doi")).lower()
        pmid = clean_text(item.get("pmid"))
        authors = [clean_text(a.get("fullName")) for a in (item.get("authorList") or {}).get("author", [])]
        return Paper(key=f"doi:{doi}" if doi else f"pmid:{pmid}", title=clean_text(item.get("title")), doi=doi, pmid=pmid, year=clean_text(item.get("pubYear")), journal=clean_text(item.get("journalTitle")), authors=authors, abstract=clean_text(item.get("abstractText")), source="europepmc", direction=direction, raw=item, journal_abbrev=clean_text(item.get("journalAbbreviation")), volume=clean_text(item.get("journalVolume")), issue=clean_text(item.get("issue")), pages=clean_text(item.get("pageInfo")))

    def enrich(self, paper: Paper) -> Paper:
        if paper.doi:
            ep = self.get_json("europepmc", f"{EPMC}/search", params={"query": f'DOI:"{paper.doi}"', "format": "json", "resultType": "core"})
            rows = (ep.get("resultList") or {}).get("result") or []
            if rows:
                other = self.epmc_paper(rows[0], paper.direction)
                paper.pmid, paper.abstract = paper.pmid or other.pmid, paper.abstract or other.abstract
                paper.authors = paper.authors or other.authors
            cr_data = self.get_json("crossref", f"{CROSSREF}/{quote(paper.doi, safe='')}").get("message") or {}
            if cr_data:
                if cr_data.get("is-referenced-by-count") is not None:
                    paper.cited_by_counts["crossref"] = int(cr_data.get("is-referenced-by-count") or 0)
                if not paper.raw.get("reference"):
                    paper.raw["reference"] = cr_data.get("reference") or []
        if paper.doi:
            oa = self.get_json("openalex", f"{OPENALEX}/https://doi.org/{quote(paper.doi, safe='')}")
            if oa:
                paper.cited_by_counts["openalex"] = int(oa.get("cited_by_count") or 0)
                paper.raw["openalex"] = slim_openalex(oa)
                loc = oa.get("best_oa_location") or {}
                if loc.get("pdf_url"):
                    paper.oa_urls.append(loc["pdf_url"])
                paper.raw["openalex_references"] = oa.get("referenced_works") or []
                paper.raw["openalex_id"] = oa.get("id")
                paper.openalex_id = clean_text(oa.get("id"))
                paper.institutions = list(dict.fromkeys(clean_text(x.get("institution", {}).get("display_name")) for a in oa.get("authorships", []) for x in a.get("institutions", []) if clean_text(x.get("institution", {}).get("display_name"))))
                paper.countries = list(dict.fromkeys(clean_text(x.get("country_code")) for a in oa.get("authorships", []) for x in a.get("institutions", []) if clean_text(x.get("country_code"))))
                paper.raw["crossref_references"] = (paper.raw.get("reference") or [])
            cr = paper.raw if paper.source == "crossref" else {}
            if cr.get("is-referenced-by-count") is not None:
                paper.cited_by_counts["crossref"] = int(cr.get("is-referenced-by-count") or 0)
            s2_key = os.getenv("S2_API_KEY", "").strip()
            headers = {"x-api-key": s2_key} if s2_key else {}
            s2 = self.get_json("semantic_scholar", f"https://api.semanticscholar.org/graph/v1/paper/DOI:{quote(paper.doi, safe='')}", headers=headers, params={"fields": "citationCount,authors"})
            if s2.get("citationCount") is not None:
                paper.cited_by_counts["semantic_scholar"] = int(s2.get("citationCount") or 0)
            # ORCID public records are optional and only used for explicit, verified claims.
            orcid_profiles = paper.raw.setdefault("orcid_profiles", {})
            for author in paper.raw.get("author", []) or []:
                oid = clean_text(author.get("ORCID") or author.get("orcid"))
                if not oid or oid in orcid_profiles: continue
                oid = oid.rstrip("/").rsplit("/", 1)[-1]
                profile = self.get_json("orcid", f"https://pub.orcid.org/v3.0/{oid}/record", headers={"Accept": "application/json"})
                if profile:
                    summary = (profile.get("activities-summary") or {})
                    employments = ((summary.get("employments") or {}).get("affiliation-group") or [])
                    roles = []
                    for group in employments:
                        for item in group.get("summaries", []) or []:
                            org = ((item.get("employment-summary") or {}).get("organization") or {}).get("name")
                            role_name = (item.get("employment-summary") or {}).get("role-title")
                            if org or role_name: roles.append({"organization": clean_text(org), "role": clean_text(role_name)})
                    distinctions = ((summary.get("fundings") or {}).get("group") or [])
                    orcid_profiles[oid] = {"url": f"https://orcid.org/{oid}", "employments": roles, "distinctions": distinctions}
        return dedupe_urls(paper)

    def expand_openalex(self, target: Paper, direction: str, max_papers: int | None) -> list[Paper]:
        oa = target.raw.get("openalex") or {}
        ids: list[str] = []
        if direction == "references":
            ids = list(oa.get("referenced_works") or [])
            # Crossref is the authoritative fallback when OpenAlex has an incomplete graph.
            for ref in target.raw.get("reference", []) or []:
                doi = clean_text(ref.get("DOI") or ref.get("doi")).lower()
                if doi:
                    ids.append(f"doi:{doi}")
        elif direction == "cited-by" and oa.get("id"):
            cursor = "*"
            while len(ids) < (max_papers or 100000):
                page = self.get_json("openalex", f"{OPENALEX}", params={"filter": f"cites:{oa['id'].split('/')[-1]}", "per-page": min(200, max_papers or 200), "cursor": cursor})
                rows = page.get("results") or []
                ids.extend([x.get("id") for x in rows if x.get("id")])
                cursor = (page.get("meta") or {}).get("next_cursor")
                if not rows or not cursor: break
        papers: list[Paper] = []
        seen = set()
        for index, ident in enumerate(ids[:max_papers] if max_papers else ids, 1):
            if ident in seen: continue
            seen.add(ident)
            if ident.startswith("doi:"):
                resolved = self.by_doi(ident[4:])
                if resolved:
                    resolved.direction = direction; resolved.raw["reference_index"] = index; papers.append(self.enrich(resolved))
                continue
            api_ident = ident.replace("https://openalex.org/", f"{OPENALEX}/") if ident.startswith("https://openalex.org/") else ident
            item = self.get_json("openalex", api_ident)
            if not item: continue
            doi = clean_text(item.get("doi")).replace("https://doi.org/", "").lower()
            authors = [clean_text(f"{a.get('author', {}).get('display_name', '')}") for a in item.get("authorships", [])]
            paper = Paper(key=f"doi:{doi}" if doi else f"openalex:{item.get('id')}", title=clean_text(item.get("title")), doi=doi, year=str(item.get("publication_year") or ""), journal=clean_text((item.get("primary_location") or {}).get("source", {}).get("display_name")), authors=authors, source="openalex", direction=direction, cited_by_counts={"openalex": int(item.get("cited_by_count") or 0)}, raw={"openalex": slim_openalex(item), "reference_index": index if direction == "references" else None}, openalex_id=clean_text(item.get("id")))
            paper.institutions = list(dict.fromkeys(clean_text(a.get("institutions", [{}])[0].get("display_name")) for a in item.get("authorships", []) if a.get("institutions") and clean_text(a.get("institutions", [{}])[0].get("display_name"))))
            paper.countries = list(dict.fromkeys(clean_text(i.get("country_code")) for a in item.get("authorships", []) for i in a.get("institutions", []) if clean_text(i.get("country_code"))))
            loc = item.get("best_oa_location") or {}
            if loc.get("pdf_url"): paper.oa_urls.append(loc["pdf_url"])
            papers.append(self.enrich(paper))
        return papers


def dedupe_urls(paper: Paper) -> Paper:
    paper.oa_urls = list(dict.fromkeys(x for x in paper.oa_urls if x.startswith(("http://", "https://"))))
    return paper


def normalize_doi(value: str) -> str:
    return clean_text(value).lower().removeprefix("https://doi.org/").removeprefix("http://doi.org/").rstrip(".,;)")


def identity_keys(paper: Paper) -> list[str]:
    keys = []
    if paper.doi: keys.append(f"doi:{normalize_doi(paper.doi)}")
    if paper.pmid: keys.append(f"pmid:{clean_text(paper.pmid)}")
    if paper.openalex_id: keys.append(f"openalex:{paper.openalex_id.rsplit('/', 1)[-1].lower()}")
    if paper.title:
        token = " ".join(sorted(title_tokens(paper.title)))
        keys.append(f"title:{token}:{paper.year}")
    return list(dict.fromkeys(keys))


def merge_paper(existing: Paper, incoming: Paper) -> Paper:
    for attr in ("doi", "pmid", "year", "journal", "abstract", "pdf_path", "pdf_source", "pdf_sha256", "openalex_id"):
        if not getattr(existing, attr) and getattr(incoming, attr): setattr(existing, attr, getattr(incoming, attr))
    for attr in ("authors", "affiliations", "oa_urls", "countries", "institutions"):
        setattr(existing, attr, list(dict.fromkeys((getattr(existing, attr) or []) + (getattr(incoming, attr) or []))))
    existing.cited_by_counts.update(incoming.cited_by_counts)
    existing.raw.update({k: v for k, v in incoming.raw.items() if v not in (None, "", [], {})})
    existing.dedup_keys = identity_keys(existing)
    return existing


def deduplicate_papers(papers: list[Paper]) -> tuple[list[Paper], list[dict[str, Any]]]:
    by_key: dict[str, Paper] = {}
    aliases: list[dict[str, Any]] = []
    for paper in papers:
        keys = identity_keys(paper); paper.dedup_keys = keys
        found = next((by_key[k] for k in keys if k in by_key), None)
        if found:
            aliases.append({"duplicate": paper.key, "canonical": found.key, "keys": keys})
            merge_paper(found, paper)
        else:
            by_key[keys[0] if keys else paper.key] = paper
            for key in keys: by_key.setdefault(key, paper)
    unique = []
    seen_ids = set()
    for paper in by_key.values():
        if id(paper) not in seen_ids:
            seen_ids.add(id(paper)); unique.append(paper)
    return unique, aliases


def citation_relation(target: Paper, paper: Paper) -> dict[str, Any]:
    """Describe a cited-by edge without pretending to have read PDF body text."""
    target_authors = {clean_text(x).lower() for x in target.authors if clean_text(x)}
    paper_authors = {clean_text(x).lower() for x in paper.authors if clean_text(x)}
    overlap = target_authors & paper_authors
    if overlap and target_authors and paper_authors:
        self_citation = "full" if target_authors <= paper_authors else "partial"
    else:
        self_citation = "no"
    corpus = f"{paper.title} {paper.abstract}".lower()
    if any(word in corpus for word in ("supports", "supporting", "consistent with", "confirm", "validates")):
        usage, confidence = "supportive", "medium"
    elif any(word in corpus for word in ("contradict", "challenge", "disagree", "refute", "critic")):
        usage, confidence = "critical", "medium"
    elif paper.abstract or paper.title:
        usage, confidence = "neutral", "low"
    else:
        usage, confidence = "uncertain", "low"
    count = max((int(v or 0) for v in paper.cited_by_counts.values()), default=0)
    return {
        "target_paper": target.key, "citing_paper": paper.key, "cited": True,
        "citation_source": ", ".join(sorted(paper.cited_by_counts)) or paper.source,
        "citation_count": count, "citation_type": "journal_article",
        "self_citation": self_citation,
        "relation_description": f"基于标题、摘要和关键词的引用关系推断：{usage}；非 PDF 正文原文。",
        "usage_judgement": usage, "evidence_basis": "title_abstract_keywords_search",
        "confidence": confidence, "sources": [x for x in (paper.doi, paper.pmid, paper.openalex_id) if x],
        "author_overlap": sorted(overlap),
    }


def journal_metadata(paper: Paper) -> dict[str, Any]:
    raw = paper.raw or {}
    container = raw.get("container-title") or []
    journal = paper.journal or clean_text(container[0] if container else "")
    abbrev = paper.journal_abbrev or clean_text((raw.get("short-container-title") or [""])[0] if raw.get("short-container-title") else "")
    metric = {}
    metric_file = os.getenv("LITERATURE_JOURNAL_METRICS_FILE", "").strip()
    if metric_file:
        try:
            metrics = json.loads(Path(metric_file).read_text(encoding="utf-8"))
            metric = metrics.get(journal) or metrics.get(abbrev) or metrics.get(clean_text(paper.issn[0] if paper.issn else "")) or {}
        except (OSError, json.JSONDecodeError):
            metric = {}
    paper.journal = journal
    paper.journal_abbrev = abbrev
    paper.journal_metric = metric if isinstance(metric, dict) else {}
    return {
        "journal_full": journal, "journal_abbrev": abbrev, "publisher": paper.publisher,
        "issn": "; ".join(paper.issn), "volume": paper.volume, "issue": paper.issue,
        "pages": paper.pages, "metric": paper.journal_metric,
        "metric_status": "verified" if metric else "not_found",
    }


def _author_base_records(paper: Paper) -> list[dict[str, Any]]:
    raw_authors = paper.raw.get("author") or []
    records = []
    for index, name in enumerate(paper.authors):
        raw = raw_authors[index] if index < len(raw_authors) else {}
        affiliations = [clean_text(x.get("name")) for x in raw.get("affiliation", []) if clean_text(x.get("name"))]
        orcid = clean_text(raw.get("ORCID") or raw.get("orcid"))
        role = "first_author" if index == 0 else ("last_author" if index == len(paper.authors) - 1 else "author")
        records.append({
            "name": clean_text(name), "original_name": clean_text(name), "role": role,
            "paper": paper.key, "publication_institution": "; ".join(dict.fromkeys(affiliations or paper.institutions)),
            "publication_country": "; ".join(paper.countries), "current_title": "",
            "current_institution": "", "current_country": "", "orcid": orcid,
            "academician_status": "not_found", "fellow_status": "not_found",
            "honors": [], "appointments": [], "research_topics": [], "sources": [],
            "source_types": [], "confidence": "metadata_only", "conflicts": [],
            "retrieved_at": now(),
        })
    return records


def _load_web_search_adapter() -> Any | None:
    path = os.getenv("LITERATURE_WEB_SEARCH_MODULE", "").strip()
    if not path:
        return None
    module_path = Path(path).expanduser().resolve()
    if not module_path.is_file():
        return None
    spec = importlib.util.spec_from_file_location("zerowall_literature_web_search", module_path)
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def enrich_all_authors(task: Task, papers: list[Paper]) -> list[dict[str, Any]]:
    """Collect every author; enrich through an injected web_search adapter when configured."""
    adapter = _load_web_search_adapter()
    cache: dict[str, list[dict[str, Any]]] = {}
    cache_path = task.root / "analysis" / "author_search_cache.json"
    try:
        cache.update(json.loads(cache_path.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        pass
    all_records: list[dict[str, Any]] = []
    for paper in papers:
        records = _author_base_records(paper)
        for record in records:
            query_base = " ".join(x for x in (record["name"], paper.title, record["publication_institution"]) if x)
            queries = [query_base, f"{record['name']} ORCID", f"{record['name']} position institution", f"{record['name']} academician fellow honors"]
            evidence: list[dict[str, Any]] = []
            for query in queries:
                key = hashlib.sha256(query.lower().encode("utf-8")).hexdigest()
                if key in cache:
                    results = cache[key]
                elif adapter is not None and callable(getattr(adapter, "search", None)):
                    try:
                        results = adapter.search(query) or []
                        results = results if isinstance(results, list) else [results]
                        cache[key] = results
                        task.record_mcp("web_search", "author_search", "ok", query=query, result_count=len(results))
                    except Exception as exc:
                        results = []
                        task.record_mcp("web_search", "author_search", "error", query=query, error=type(exc).__name__)
                else:
                    results = []
                    task.record_mcp("web_search", "author_search", "skipped_no_adapter", query=query)
                evidence.extend(x for x in results if isinstance(x, dict))
            if adapter is not None and callable(getattr(adapter, "extract_author_facts", None)):
                try:
                    facts = adapter.extract_author_facts(record["name"], paper.title, evidence) or {}
                except Exception as exc:
                    facts = {"conflicts": [f"extract_error:{type(exc).__name__}"]}
            else:
                facts = {}
            for field_name in ("current_title", "current_institution", "current_country", "academician_status", "fellow_status"):
                if facts.get(field_name): record[field_name] = facts[field_name]
            for field_name in ("honors", "appointments", "research_topics", "sources", "source_types", "conflicts"):
                values = facts.get(field_name) or []
                if isinstance(values, str): values = [values]
                record[field_name] = list(dict.fromkeys(record.get(field_name, []) + values))
            record["confidence"] = facts.get("confidence") or ("web_search_candidate" if evidence else "metadata_only")
            record["search_evidence"] = evidence
            record["retrieved_at"] = now()
        paper.author_records = records
        paper.author_profiles = records
        all_records.extend(records)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    (task.root / "analysis" / "author_evidence.json").write_text(json.dumps(all_records, ensure_ascii=False, indent=2), encoding="utf-8")
    return all_records


def deduplicate_pdf_hashes(papers: list[Paper], aliases: list[dict[str, Any]]) -> None:
    seen: dict[str, Paper] = {}
    for paper in papers:
        digest = paper.pdf_sha256
        if not digest: continue
        canonical = seen.get(digest)
        if canonical and canonical.key != paper.key:
            aliases.append({"duplicate": paper.key, "canonical": canonical.key, "keys": [f"sha256:{digest}"]})
            paper.raw["duplicate_pdf_of"] = canonical.key
        else:
            seen[digest] = paper


def slim_openalex(item: dict[str, Any]) -> dict[str, Any]:
    """Keep reproducibility-critical OpenAlex fields without embedding large
    abstract inverted indexes and unrelated provider payloads in task state."""
    keys = ("id", "doi", "title", "publication_year", "cited_by_count", "best_oa_location", "authorships", "referenced_works", "primary_location", "open_access")
    return {key: item.get(key) for key in keys if key in item}


def extract_pdf_text(path: Path) -> str:
    try:
        import fitz  # type: ignore
        return "\f".join(page.get_text("text") for page in fitz.open(path))
    except Exception:
        try:
            from pypdf import PdfReader  # type: ignore
            return "\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages)
        except Exception:
            return ""


def paper_text(paper: Paper) -> str:
    """Return only MinerU text for citation evidence.

    PDF extraction is intentionally not a citation-analysis fallback: it loses
    layout, figures, tables, and often reference numbering.  Metadata-only
    callers can still use ``extract_pdf_text`` explicitly.
    """
    if paper.parsed_text_path:
        try:
            return Path(paper.parsed_text_path).read_text(encoding="utf-8")
        except OSError:
            pass
    return ""


def find_paper(papers: list[Paper], identity: str) -> Paper | None:
    value = clean_text(identity).lower()
    for paper in papers:
        candidates = {paper.key.lower(), normalize_doi(paper.doi), clean_text(paper.pmid).lower()}
        if value in candidates:
            return paper
    return None


def ingest_mineru_result(task: Task, state: dict[str, Any], paper_identity: str,
                         run_dir: Path, task_id: str = "", api: str = "mineru") -> Paper:
    """Copy a complete MinerU result tree into the resumable task."""
    papers = [Paper(**{k: v for k, v in row.items() if k in Paper.__dataclass_fields__}) for row in state.get("papers", [])]
    paper = find_paper(papers, paper_identity)
    if paper is None:
        raise ValueError(f"unknown paper identity: {paper_identity}")
    run_dir = run_dir.resolve()
    full_md = run_dir / "full.md"
    if not full_md.is_file():
        matches = list(run_dir.rglob("full.md")) if run_dir.is_dir() else []
        if len(matches) != 1:
            raise ValueError("MinerU run directory must contain exactly one full.md")
        full_md = matches[0]
    text = full_md.read_text(encoding="utf-8")
    if not clean_text(text):
        raise ValueError("MinerU full.md is empty")
    paper_id = safe_name(paper.pmid or paper.doi or paper.key)
    run_id = safe_name(task_id or run_dir.name, 80)
    snapshot = task.root / "parsed" / paper_id / run_id
    if snapshot.exists():
        shutil.rmtree(snapshot)
    snapshot.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(run_dir, snapshot)
    snapshot_full_md = snapshot / full_md.relative_to(run_dir)
    if not snapshot_full_md.is_file():
        snapshot_full_md = snapshot / "full.md"
    snapshot_full_md.write_text(text, encoding="utf-8")
    artifacts: list[dict[str, Any]] = []
    for artifact in snapshot.rglob("*"):
        if artifact.is_file():
            rel = artifact.relative_to(snapshot).as_posix()
            artifacts.append({
                "name": artifact.name, "relative_path": rel,
                "path": str(artifact.resolve()),
                "bytes": artifact.stat().st_size,
                "media_type": mimetypes.guess_type(artifact.name)[0] or "application/octet-stream",
                "sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
            })
    broken_links = []
    for link in re.findall(r"!\[[^\]]*\]\(([^)]+)\)", text):
        link_path = link.split("#", 1)[0].split("?", 1)[0].strip().strip("<>")
        if link_path and not (snapshot_full_md.parent / link_path).resolve().is_file():
            broken_links.append(link_path)
    manifest = {
        "paper": paper.key, "task_id": clean_text(task_id), "api": clean_text(api) or "mineru",
        "source_run_dir": str(run_dir), "source_pdf_sha256": paper.pdf_sha256,
        "full_md": str(snapshot_full_md.resolve()), "broken_links": broken_links,
        "artifacts": artifacts, "created_at": now(),
    }
    manifest_path = snapshot / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    paper.parsed_text_path = str(snapshot_full_md.resolve())
    paper.parse_status = "mineru_parsed"
    paper.parser_api = clean_text(api) or "mineru"
    paper.parser_task_id = clean_text(task_id)
    paper.parser_artifacts = artifacts
    paper.mineru_snapshot_dir = str(snapshot.resolve())
    paper.mineru_manifest_path = str(manifest_path.resolve())
    paper.mineru_broken_links = broken_links
    paper.mineru_file_counts = {
        "images": sum(1 for item in artifacts if item["relative_path"].lower().startswith("images/")),
        "tables": sum(1 for item in artifacts if item["relative_path"].lower().startswith("tables/")),
        "json": sum(1 for item in artifacts if item["media_type"] == "application/json"),
        "total": len(artifacts),
    }
    task.record_mcp("mineru", "mineru_parse", "parsed", paper=paper.key, task_id=paper.parser_task_id,
                    snapshot_dir=str(snapshot.resolve()), artifacts=len(artifacts))
    task.record("mineru", str(run_dir), "parsed", paper=paper.key, task_id=paper.parser_task_id,
                parsed_text_path=paper.parsed_text_path, artifacts=len(artifacts))
    target = next((item for item in papers if item.direction == "target"), papers[0])
    assign_contexts(papers, target)
    state["papers"] = [asdict(item) for item in papers]
    state["stage"] = "analysis_pending" if not broken_links else "parsing"
    update_phase_status(state, papers)
    task.save(state)
    report(task, state)
    return paper


def validate_pdf(path: Path, expected: Paper) -> tuple[bool, str, str]:
    try:
        data = path.read_bytes()
    except OSError as exc:
        return False, f"read_error:{type(exc).__name__}", ""
    if not data.startswith(b"%PDF-") or not data:
        return False, "invalid_pdf_header", ""
    digest = hashlib.sha256(data).hexdigest()
    text = extract_pdf_text(path)[:20000].lower()
    title_ok = not text or title_score(expected.title, text[:3000]) > 0.18
    author_ok = not text or any(clean_text(a).split()[-1].lower() in text for a in expected.authors[:3] if clean_text(a))
    if text and not (title_ok or author_ok):
        return False, "metadata_mismatch", digest
    return True, "ok", digest


def adapter_domains() -> set[str]:
    return {clean_text(value).lower().lstrip(".") for value in os.getenv("AUTHORIZED_ADAPTER_ALLOWED_DOMAINS", "").split(",") if clean_text(value)}


def allowed_adapter_url(url: str) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower().rstrip(".")
    domains = adapter_domains()
    return bool(parsed.scheme in {"http", "https"} and host and domains and any(host == domain or host.endswith(f".{domain}") for domain in domains))


def load_authorized_adapter() -> Any | None:
    module_path = os.getenv("AUTHORIZED_ADAPTER_MODULE", "").strip()
    if not module_path:
        return None
    path = Path(module_path).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"authorized adapter not found: {path}")
    spec = importlib.util.spec_from_file_location("zerowall_authorized_literature_adapter", path)
    if spec is None or spec.loader is None:
        raise ImportError("cannot load authorized adapter")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    acquire = getattr(module, "acquire", None)
    if not callable(acquire):
        raise TypeError("authorized adapter must export acquire(paper, output_path?)")
    return acquire


def download_response(client: Client, response: requests.Response, target: Path, paper: Paper, source: str) -> tuple[bool, str, str]:
    content_length = int(response.headers.get("content-length") or 0)
    max_bytes = int(os.getenv("LITERATURE_MAX_PDF_BYTES", str(DEFAULT_MAX_PDF_BYTES)))
    if content_length > max_bytes:
        return False, "response_too_large", ""
    with tempfile.NamedTemporaryFile(dir=target.parent, delete=False, suffix=".part") as handle:
        temp = Path(handle.name)
        total = 0
        for chunk in response.iter_content(131072):
            if chunk:
                total += len(chunk)
                if total > max_bytes:
                    temp.unlink(missing_ok=True)
                    return False, "response_too_large", ""
                handle.write(chunk)
    ok, reason, digest = validate_pdf(temp, paper)
    if ok:
        temp.replace(target)
        paper.pdf_path, paper.pdf_source, paper.pdf_sha256, paper.pdf_status = str(target), source, digest, "downloaded_open_access"
        return True, reason, digest
    temp.unlink(missing_ok=True)
    return False, reason, digest


def download_authorized_adapter(client: Client, paper: Paper, target: Path) -> bool:
    def note(status: str, **meta: Any) -> None:
        paper.acquisition_attempts.append({"provider": "authorized_adapter", "skill": "zerowall-authorized-adapter", "status": status, **meta, "at": now()})
    try:
        acquire = load_authorized_adapter()
        if acquire is None:
            note("skipped_not_configured")
            return False
        result = acquire(asdict(paper), str(target))
        if not isinstance(result, dict) or result.get("status") not in {"success", "ok"}:
            paper.pdf_status = f"authorized_adapter_{clean_text((result or {}).get('status', 'no_result'))}"
            note(paper.pdf_status)
            return False
        url = clean_text(result.get("url"))
        if url and not allowed_adapter_url(url):
            paper.pdf_status = "authorized_adapter_domain_denied"
            note(paper.pdf_status, url=redact_url(url))
            return False
        path = Path(clean_text(result.get("path"))) if result.get("path") else None
        if path and path.exists():
            ok, reason, digest = validate_pdf(path, paper)
            if ok:
                if path.resolve() != target.resolve(): path.replace(target)
                paper.pdf_path, paper.pdf_source, paper.pdf_sha256, paper.pdf_status = str(target), url or "authorized_adapter", digest, "downloaded_authorized_adapter"
                note("downloaded_authorized_adapter", url=redact_url(url) if url else "")
                return True
            paper.pdf_status = f"authorized_adapter_{reason}"
            note(paper.pdf_status)
            return False
        if not url or not allowed_adapter_url(url):
            paper.pdf_status = "authorized_adapter_missing_allowed_url"
            note(paper.pdf_status)
            return False
        response = client.session.get(url, timeout=client.timeout, stream=True, allow_redirects=True)
        client.task.record("authorized_adapter", response.url, str(response.status_code), paper=paper.key)
        response.raise_for_status()
        ok, reason, _ = download_response(client, response, target, paper, response.url)
        if not ok:
            paper.pdf_status = f"authorized_adapter_{reason}"
            note(paper.pdf_status, url=redact_url(response.url))
        else:
            note("downloaded_authorized_adapter", url=redact_url(response.url))
        return ok
    except Exception as exc:
        paper.pdf_status = f"authorized_adapter_error:{type(exc).__name__}"
        note(paper.pdf_status, error=type(exc).__name__)
        return False


def download_via_paper_download(task: Task, paper: Paper, target: Path,
                                allow_shadow: bool = False) -> bool:
    """Delegate PDF acquisition to the bundled paper-download workflow."""
    try:
        from paper_download_bridge import download_with_paper_download
        result = download_with_paper_download(
            asdict(paper), target, task.root / "paper-download",
            allow_shadow=allow_shadow,
        )
        paper.acquisition_attempts.append({
            "provider": "paper-download", "skill": "paper-download-pdf-cascade", "status": result.status,
            "work_dir": result.work_dir,
            "stdout_log": str(Path(result.work_dir) / "bridge.stdout.log") if result.work_dir else "",
            "stderr_log": str(Path(result.work_dir) / "bridge.stderr.log") if result.work_dir else "",
            "at": now(),
        })
        task.record_mcp("paper-download", "paper-download-pdf-cascade", result.status, paper=paper.key, work_dir=result.work_dir)
        if not result.ok or not result.path:
            return False
        ok, reason, digest = validate_pdf(target, paper)
        if not ok:
            paper.pdf_status = f"paper_download_{reason}"
            paper.acquisition_attempts[-1]["reason"] = reason
            return False
        paper.pdf_path, paper.pdf_source, paper.pdf_sha256 = str(target), "paper-download", digest
        paper.pdf_status = "downloaded_paper_download"
        return True
    except Exception as exc:
        paper.acquisition_attempts.append({
            "provider": "paper-download", "status": f"error:{type(exc).__name__}", "at": now(),
        })
        return False


def download_paper(client: Client, paper: Paper, allow_tsg: bool = True) -> None:
    paper.acquisition_state = "candidate"
    urls = list(paper.oa_urls)
    email = os.getenv("UNPAYWALL_EMAIL")
    if paper.doi and email:
        data = client.get_json("unpaywall", f"{UNPAYWALL}/{quote(paper.doi, safe='')}", params={"email": email})
        for loc in data.get("oa_locations") or []:
            if loc.get("url_for_pdf"): urls.append(loc["url_for_pdf"])
    urls = list(dict.fromkeys(urls))
    target = client.task.root / "downloads" / f"{safe_name(paper.pmid or paper.doi or paper.key)}_{safe_name(paper.title)}.pdf"
    if target.exists():
        ok, reason, digest = validate_pdf(target, paper)
        if ok:
            paper.pdf_path, paper.pdf_sha256, paper.pdf_status = str(target), digest, "already_present"
            paper.pdf_source = paper.pdf_source or "existing_task_file"
            paper.acquisition_state = "acquisition_terminal"
            paper.acquisition_attempts.append({"provider": "local", "skill": "zerowall-literature", "status": "already_present", "path": str(target), "at": now()})
            return
    for url in urls:
        for attempt in range(1, 4):
            try:
                response = client.session.get(url, timeout=client.timeout, stream=True, allow_redirects=True)
                client.task.record("open_access", response.url, str(response.status_code), paper=paper.key, attempt=attempt)
                client.task.record_mcp("open_access", "literature_pipeline.pdf_download", str(response.status_code), paper=paper.key, url=redact_url(response.url), attempt=attempt)
                paper.acquisition_attempts.append({"provider": "open_access", "skill": "pubmed-literature/openalex/crossref", "url": redact_url(response.url), "status": response.status_code, "attempt": attempt, "at": now()})
                if response.status_code in RETRYABLE_STATUS and attempt < 3:
                    time.sleep(min(2 ** attempt, 8)); continue
                response.raise_for_status()
                ok, reason, _ = download_response(client, response, target, paper, response.url)
                if ok: paper.acquisition_state = "acquisition_terminal"; return
                paper.acquisition_attempts[-1]["reason"] = reason
                paper.pdf_status = reason
                break
            except Exception as exc:
                paper.pdf_status = f"error:{type(exc).__name__}"
                if attempt < 3: time.sleep(min(2 ** attempt, 8))
    if os.getenv("LITERATURE_DISABLE_PAPER_DOWNLOAD", "").strip().lower() not in {"1", "true", "yes"}:
        if download_via_paper_download(client.task, paper, target,
                                       allow_shadow=os.getenv("RESEARCH_ENABLE_SHADOW_LIBS", "").strip().lower() in {"1", "true", "yes"}):
            paper.acquisition_state = "acquisition_terminal"
            return
    tsg_configured = allow_tsg and all(os.getenv(name, "").strip() for name in (
        "TSG_PM_JSESSIONID", "TSG_SESSIONID", "TSG_SGUSER", "TSG_TSGUSER",
    ))
    if tsg_configured:
        if download_via_tsg(client, paper, target):
            paper.acquisition_state = "acquisition_terminal"
            return
    else:
        reason = "disabled_by_flag" if not allow_tsg else "missing_credentials"
        paper.acquisition_attempts.append({"provider": "tsg", "skill": "zerowall-tsg-literature", "status": "skipped_missing_credentials" if reason == "missing_credentials" else "skipped_disabled", "reason": reason, "at": now()})
    if download_authorized_adapter(client, paper, target):
        paper.acquisition_state = "acquisition_terminal"
        return
    if not paper.pdf_path:
        paper.acquisition_state = "acquisition_terminal"
        has_rate_limit = any(str(item.get("status")) in {"429", "blocked_provider_rate_limit"} for item in paper.acquisition_attempts)
        has_identity_mismatch = any(str(item.get("reason")) == "metadata_mismatch" for item in paper.acquisition_attempts)
        paper.pdf_status = "blocked_provider_rate_limit" if has_rate_limit else ("blocked_identity_mismatch" if has_identity_mismatch else (paper.pdf_status if paper.pdf_status in {"blocked_ambiguous_match", "blocked_identity_mismatch"} else "unavailable_no_authorized_source"))


def download_via_tsg(client: Client, paper: Paper, target: Path) -> bool:
    """Use the existing authorized TSG client as an explicit fallback.

    The import is resolved relative to the bundled skills directory so the
    runtime copy and the source checkout use the same implementation.
    """
    script = Path(__file__).resolve().parents[2] / "zerowall-tsg-literature" / "scripts" / "tsg_literature.py"
    if not script.exists():
        paper.pdf_status = "tsg_skill_missing"
        return False
    try:
        spec = importlib.util.spec_from_file_location("zerowall_tsg_client", script)
        if spec is None or spec.loader is None:
            raise ImportError("cannot load TSG skill")
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        tsg = module.TSGClient(
            pm_jsessionid=os.getenv("TSG_PM_JSESSIONID", ""),
            user_sessionid=os.getenv("TSG_SESSIONID", ""),
            sguser=os.getenv("TSG_SGUSER", ""),
            tsguser=os.getenv("TSG_TSGUSER", ""),
            timeout=client.timeout,
        )
        client.task.record_mcp("tsg", "zerowall-tsg-literature.search", "started", paper=paper.key, query=paper.doi or paper.title)
        matches, _ = tsg.search(paper.doi or paper.title, size=20)
        match = next((x for x in matches if paper.doi and x.doi and x.doi.lower() == paper.doi.lower()), None)
        if match is None and paper.pmid:
            match = next((x for x in matches if clean_text(x.pmid) == clean_text(paper.pmid)), None)
        title_matches = [x for x in matches if title_score(paper.title, x.title) > 0.85]
        if match is None and len(title_matches) == 1:
            match = title_matches[0]
        if match is None and len(title_matches) > 1:
            paper.pdf_status = "blocked_ambiguous_match"
            client.task.record_mcp("tsg", "zerowall-tsg-literature.match", "ambiguous_match", paper=paper.key, candidates=len(title_matches))
            paper.acquisition_attempts.append({"provider": "tsg", "skill": "zerowall-tsg-literature", "status": "ambiguous_match", "candidates": len(title_matches), "at": now()})
            return False
        if match is None:
            paper.pdf_status = "tsg_no_match"
            client.task.record_mcp("tsg", "zerowall-tsg-literature.match", "no_match", paper=paper.key)
            paper.acquisition_attempts.append({"provider": "tsg", "skill": "zerowall-tsg-literature", "status": "no_match", "at": now()})
            return False
        case = tsg.apply([match])[0]
        client.task.record_mcp("tsg", "zerowall-tsg-literature.apply", "submitted", paper=paper.key, pmid=match.pmid)
        deadline = time.monotonic() + float(os.getenv("TSG_WAIT_TIMEOUT", "3600"))
        while time.monotonic() < deadline:
            rows = tsg.cases(size=100)
            client.task.record_mcp("tsg", "zerowall-tsg-literature.cases", "polled", paper=paper.key, pmid=match.pmid)
            current = next((x for x in rows if x.pmid == match.pmid), case)
            if current.status == 2 or current.pdf_url:
                url = tsg.viewer_pdf_url(current)
                tsg.download(url, target)
                client.task.record_mcp("tsg", "zerowall-tsg-literature.download", "downloaded", paper=paper.key, pmid=match.pmid)
                ok, reason, digest = validate_pdf(target, paper)
                if ok:
                    paper.pdf_path, paper.pdf_source, paper.pdf_sha256, paper.pdf_status = str(target), "tsg", digest, "downloaded_tsg"
                    paper.acquisition_attempts.append({"provider": "tsg", "skill": "zerowall-tsg-literature", "status": "downloaded_tsg", "pmid": match.pmid, "at": now()})
                    return True
                target.unlink(missing_ok=True); paper.pdf_status = "blocked_identity_mismatch" if reason == "metadata_mismatch" else f"tsg_{reason}"; client.task.record_mcp("tsg", "zerowall-tsg-literature.download", "identity_mismatch" if reason == "metadata_mismatch" else "invalid_pdf", paper=paper.key); return False
            if current.status in (3, 4, -1):
                paper.pdf_status = f"tsg_failed_status_{current.status}"; return False
            time.sleep(min(30.0, max(2.0, float(os.getenv("TSG_POLL_INTERVAL", "30")))) )
        paper.pdf_status = "tsg_timeout"
    except Exception as exc:
        paper.pdf_status = f"tsg_error:{type(exc).__name__}"
        paper.acquisition_attempts.append({"provider": "tsg", "skill": "zerowall-tsg-literature", "status": "error", "error": type(exc).__name__, "at": now()})
    return False


def citation_contexts(text: str, target: Paper, ref_number: int | None = None) -> list[dict[str, Any]]:
    # Do not treat a bibliography entry as an evaluative citation context.
    body = text
    ref_heading = re.search(r"\n\s*(?:references|bibliography)\s*\n", text, re.I)
    if ref_heading:
        body = text[:ref_heading.start()]
    markers: list[str] = []
    if ref_number:
        markers.append(r"\[[0-9\s,;:\-–—]+\]")
        markers.append(r"\([0-9\s,;:\-–—]+\)")
    surnames = [clean_text(a).split()[-1] for a in target.authors[:3] if clean_text(a)]
    markers.extend([re.escape(s) for s in surnames if len(s) > 3])
    if target.doi:
        markers.append(re.escape(target.doi))
    if target.title:
        title_terms = [re.escape(x) for x in re.findall(r"[A-Za-z0-9]{5,}", target.title)[:5]]
        if title_terms:
            markers.append(r"(?i)(?:" + ".*?".join(title_terms[:3]) + r")")
    hits: list[dict[str, Any]] = []
    for pattern in markers:
        for match in re.finditer(pattern, body, re.I):
            marker_text = match.group(0)
            if ref_number and (marker_text.startswith(("[", "("))):
                nums = [int(x) for x in re.findall(r"\d+", marker_text)]
                included = any((a <= ref_number <= b) for a, b in zip(nums[::2], nums[1::2])) or ref_number in nums
                if not included: continue
            start, end = max(0, match.start() - 420), min(len(text), match.end() + 420)
            excerpt = clean_text(text[start:end])
            if excerpt and not any(match.start() == x["offset"] for x in hits):
                prefix = body[:match.start()]
                page = prefix.count("\f") + 1
                hits.append({"marker": marker_text, "excerpt": excerpt[:900], "offset": match.start(), "page": page, "classification": classify_context(excerpt), "evidence_level": "full_text"})
    return hits


def infer_reference_number(text: str, target: Paper) -> int | None:
    """Find the numbered bibliography entry for a target in a citing PDF."""
    candidates = [target.doi, target.title]
    for line in text.splitlines():
        line_clean = clean_text(line)
        if not line_clean or not any(value and value.lower() in line_clean.lower() for value in candidates):
            continue
        match = re.match(r"\s*\[?(\d{1,3})\]?\s*[.)]", line_clean)
        if match:
            return int(match.group(1))
    if target.doi:
        match = re.search(r"(?:\[|\()?(\d{1,3})(?:\]|\))?[^\n]{0,500}" + re.escape(target.doi), text, re.I)
        if match:
            return int(match.group(1))
    return None


def classify_context(value: str) -> str:
    lower = value.lower()
    if any(x in lower for x in ("however", "contradict", "limitation", "failed", "unlike")): return "critique_or_comparison"
    if any(x in lower for x in ("method", "protocol", "assay", "according to")): return "method_or_background"
    if any(x in lower for x in ("support", "consistent", "demonstrated", "showed")): return "supporting_result"
    return "background_or_uncertain"


def author_profiles(paper: Paper) -> list[dict[str, Any]]:
    profiles = []
    names: list[tuple[str, str]] = []
    if paper.authors:
        names.append(("first_author", paper.authors[0]))
        names.extend(("author", name) for name in paper.authors[1:])
    names.extend(("corresponding_author", name) for name in paper.corresponding_authors if name)
    orcids = {clean_text(a.get("family")): clean_text(a.get("ORCID")) for a in (paper.raw.get("author") or []) if a.get("ORCID")}
    for role, name in names:
        family = clean_text(name).split()[-1] if name else ""
        orcid = orcids.get(family, "")
        oid = orcid.rstrip("/").rsplit("/", 1)[-1] if orcid else ""
        verified = (paper.raw.get("orcid_profiles") or {}).get(oid, {})
        employment = verified.get("employments") or []
        position = "; ".join(x.get("role", "") for x in employment if x.get("role"))
        appointments = "; ".join(x.get("organization", "") for x in employment if x.get("organization"))
        if not name or any(x["name"] == name for x in profiles): continue
        profiles.append({"name": name, "role": role, "institution": "; ".join(dict.fromkeys(paper.affiliations + paper.institutions)), "countries": "; ".join(paper.countries), "position": position, "appointments": appointments, "honors": "", "orcid": orcid, "source_url": verified.get("url") or orcid or "", "sources": [verified.get("url") or orcid] if (verified.get("url") or orcid) else [], "verified_claims": employment, "last_verified": now(), "confidence": "orcid_public_record" if verified else ("identifier_only" if orcid else ("affiliation_only" if paper.affiliations or paper.institutions else "unverified"))})
    return profiles


def assign_contexts(papers: list[Paper], target: Paper) -> None:
    """Attach evidence in the correct document for each citation direction."""
    target_text = paper_text(target)
    for paper in papers:
        if paper.direction == "cited-by" and (paper.parsed_text_path or paper.pdf_path):
            citing_text = paper_text(paper)
            ref_number = infer_reference_number(citing_text, target)
            paper.citation_contexts = citation_contexts(citing_text, target, ref_number)
            if ref_number:
                for context in paper.citation_contexts:
                    context["target_reference_number"] = ref_number
        elif paper.direction == "references" and target_text:
            index = (paper.raw.get("reference_index") or 0)
            paper.citation_contexts = citation_contexts(target_text, paper, int(index) if index else None)


def update_phase_status(state: dict[str, Any], papers: list[Paper]) -> dict[str, Any]:
    related = [paper for paper in papers if paper.direction != "target"]
    downloaded = [paper for paper in papers if paper.pdf_path]
    parsed = [paper for paper in downloaded if paper.parse_status == "mineru_parsed"]
    contexts = sum(len(paper.citation_contexts) for paper in papers)
    acquisition_terminal = bool(papers) and all(
        paper.acquisition_state == "acquisition_terminal"
        or paper.pdf_status in ACQUISITION_TERMINAL
        or (paper.pdf_path and paper.parse_status == "mineru_parsed" and paper.pdf_status == "not_attempted")
        for paper in papers
    )
    acquisition_attempted = bool(papers) and all(
        paper.pdf_status != "not_attempted" and bool(paper.acquisition_attempts)
        for paper in papers
    )
    analysis_dir = Path(state.get("task_root") or ".") / "analysis"
    required_analysis = {
        "provider_evidence": analysis_dir / "provider_evidence.json",
        "citation_analysis": analysis_dir / "citation_analysis.md",
        "author_analysis": analysis_dir / "author_analysis.md",
        "synthesis": analysis_dir / "synthesis.md",
    }
    def analysis_ready(name: str, path: Path) -> bool:
        try:
            content = path.read_text(encoding="utf-8")
        except OSError:
            return False
        if name == "provider_evidence":
            try:
                data = json.loads(content)
            except json.JSONDecodeError:
                return False
            rows = data.get("queries") or data.get("providers") or data.get("results") if isinstance(data, dict) else data
            return isinstance(rows, list) and bool(rows)
        return len(clean_text(content)) >= 80

    state["phase_status"] = {
        "identify_target": "complete" if any(p.direction == "target" for p in papers) else "pending",
        "expand_references_and_cited_by": "complete" if related else "complete_no_results",
        "acquire_pdfs": "complete" if acquisition_terminal else ("in_progress" if acquisition_attempted else "pending"),
        "acquisition_terminal": "complete" if acquisition_terminal else ("in_progress" if acquisition_attempted else "pending"),
        "mineru_parse": "complete" if downloaded and len(parsed) == len(downloaded) else ("in_progress" if parsed else ("complete_no_inputs" if acquisition_terminal and not downloaded else "pending")),
        "locate_citation_contexts": "complete" if contexts else ("complete_no_matches" if parsed and len(parsed) == len(downloaded) else ("complete_no_full_text" if acquisition_terminal and not downloaded else "blocked_on_mineru")),
        "analyze_authors": "complete" if analysis_ready("author_analysis", required_analysis["author_analysis"]) else "pending_agent_analysis",
        "cross_provider_verification": "complete" if analysis_ready("provider_evidence", required_analysis["provider_evidence"]) else "pending_agent_analysis",
        "synthesize_report": "complete" if analysis_ready("synthesis", required_analysis["synthesis"]) and analysis_ready("citation_analysis", required_analysis["citation_analysis"]) else "pending_agent_analysis",
    }
    return state["phase_status"]


def finalize_analysis(task: Task, state: dict[str, Any]) -> None:
    papers = [Paper(**{k: v for k, v in row.items() if k in Paper.__dataclass_fields__}) for row in state.get("papers", [])]
    update_phase_status(state, papers)
    incomplete = {"pending", "in_progress", "blocked_on_mineru", "pending_agent_analysis"}
    missing = [name for name, status in state["phase_status"].items() if status in incomplete]
    terminal = all(
        paper.acquisition_state == "acquisition_terminal"
        or paper.pdf_status in ACQUISITION_TERMINAL
        or (paper.pdf_path and paper.parse_status == "mineru_parsed" and paper.pdf_status == "not_attempted")
        for paper in papers
    )
    parsed_all_downloads = all(
        not paper.pdf_path or paper.parse_status == "mineru_parsed"
        for paper in papers
    )
    if not terminal and "acquisition_terminal" not in missing:
        missing.append("acquisition_terminal")
    if not parsed_all_downloads:
        missing.append("mineru_parse")
    if missing:
        state["stage"] = "analysis_pending"
        task.save(state)
        raise ValueError("cannot finalize; incomplete phases: " + ", ".join(missing))
    state["stage"] = "complete"
    task.save(state)
    report(task, state)


def flatten_excel_value(value: Any) -> Any:
    """Keep every workbook cell scalar while retaining nested provenance."""
    if isinstance(value, list):
        return "; ".join(str(flatten_excel_value(item)) for item in value)
    if isinstance(value, dict):
        return "; ".join(f"{key}: {flatten_excel_value(item)}" for key, item in value.items())
    return value


def write_excel(path: Path, sheets: dict[str, list[dict[str, Any]]]) -> None:
    try:
        from openpyxl import Workbook  # type: ignore
    except Exception:
        return
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.worksheet.table import Table, TableStyleInfo
    from openpyxl.chart import BarChart, PieChart, Reference
    book = Workbook(); book.remove(book.active)
    palette = {"navy": "1F4E78", "blue": "D9EAF7", "light": "F7FAFC", "amber": "FFF2CC"}
    for name, rows in sheets.items():
        if name == "Summary":
            continue
        sheet = book.create_sheet(name[:31]); rows = list(rows)
        fields = list(dict.fromkeys(k for row in rows for k in row)) or ["status"]
        sheet.append(fields)
        for row in rows:
            values = []
            for key in fields:
                value = row.get(key, "")
                values.append(flatten_excel_value(value))
            sheet.append(values)
        sheet.freeze_panes = "A2"; sheet.auto_filter.ref = sheet.dimensions; sheet.sheet_view.showGridLines = False
        sheet.row_dimensions[1].height = 28
        for cell in sheet[1]:
            cell.font = Font(name="Arial", bold=True, color="FFFFFF"); cell.fill = PatternFill("solid", fgColor=palette["navy"]); cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        for row in sheet.iter_rows(min_row=2):
            for cell in row:
                cell.font = Font(name="Arial", size=10, color="1F2937"); cell.alignment = Alignment(vertical="top", wrap_text=False)
        for col in sheet.columns:
            letter = col[0].column_letter
            max_len = min(55, max(len(str(c.value or "")) for c in col) + 2)
            sheet.column_dimensions[letter].width = max(12, max_len)
        if rows:
            ref = f"A1:{sheet.cell(sheet.max_row, sheet.max_column).coordinate}"
            table = Table(displayName=f"Table_{re.sub(r'[^A-Za-z0-9]', '', name)[:20] or 'Data'}", ref=ref)
            table.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showFirstColumn=False, showLastColumn=False, showRowStripes=True, showColumnStripes=False)
            sheet.add_table(table)
    summary = book.create_sheet("Summary", 0); summary.sheet_view.showGridLines = False
    summary["A1"] = "ZeroWall Literature 研究摘要"; summary["A1"].font = Font(name="Arial", size=16, bold=True, color=palette["navy"])
    summary["A3"] = "指标"; summary["B3"] = "数值"
    for c in summary[3]: c.font = Font(name="Arial", bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor=palette["navy"])
    summary_rows = sheets.get("Summary", [])
    for i, row in enumerate(summary_rows, 4): summary.cell(i, 1, row.get("指标", "")); summary.cell(i, 2, row.get("数值", ""))
    summary.column_dimensions["A"].width = 30; summary.column_dimensions["B"].width = 18
    direction_rows = sheets.get("Direction Stats", [])
    if direction_rows:
        start = 3; summary.cell(start, 4, "方向"); summary.cell(start, 5, "文章数")
        for i, row in enumerate(direction_rows, start + 1): summary.cell(i, 4, row.get("方向")); summary.cell(i, 5, row.get("文章数"))
        chart = BarChart(); chart.title = "文献网络规模"; chart.y_axis.title = "文章数"; chart.x_axis.title = "方向"; chart.add_data(Reference(summary, min_col=5, min_row=start, max_row=start + len(direction_rows)), titles_from_data=True); chart.set_categories(Reference(summary, min_col=4, min_row=start + 1, max_row=start + len(direction_rows))); chart.height = 7; chart.width = 11; summary.add_chart(chart, "G3")
    status_rows = sheets.get("PDF Stats", [])
    if status_rows:
        start = 10; summary.cell(start, 4, "PDF 状态"); summary.cell(start, 5, "数量")
        for i, row in enumerate(status_rows, start + 1): summary.cell(i, 4, row.get("状态")); summary.cell(i, 5, row.get("数量"))
        chart = PieChart(); chart.title = "PDF 获取状态"; chart.add_data(Reference(summary, min_col=5, min_row=start, max_row=start + len(status_rows)), titles_from_data=True); chart.set_categories(Reference(summary, min_col=4, min_row=start + 1, max_row=start + len(status_rows))); chart.height = 8; chart.width = 11; summary.add_chart(chart, "G18")
    summary.freeze_panes = "A4"
    book.save(path)


def configure_matplotlib_chinese(plt: Any) -> str:
    """Select an installed CJK font so Chinese titles never render as tofu boxes."""
    from matplotlib import font_manager  # type: ignore
    available = {font.name for font in font_manager.fontManager.ttflist}
    for candidate in ("Microsoft YaHei", "SimHei", "Noto Sans CJK SC", "Noto Sans SC", "STXihei", "Arial Unicode MS"):
        if candidate in available:
            plt.rcParams["font.family"] = candidate
            plt.rcParams["font.sans-serif"] = [candidate, "DejaVu Sans"]
            plt.rcParams["axes.unicode_minus"] = False
            return candidate
    plt.rcParams["font.family"] = "DejaVu Sans"
    plt.rcParams["axes.unicode_minus"] = False
    return "DejaVu Sans"


def pdf_status_label(status: str) -> str:
    labels = {
        "downloaded": "已下载",
        "downloaded_open_access": "开放来源已下载",
        "downloaded_paper_download": "paper-download 已下载",
        "downloaded_tsg": "TSG 已下载",
        "downloaded_authorized_adapter": "授权适配器已下载",
        "already_present": "已存在",
        "unavailable_no_authorized_source": "无授权来源",
        "blocked_ambiguous_match": "TSG 匹配歧义",
        "blocked_identity_mismatch": "身份校验失败",
        "blocked_provider_rate_limit": "提供方限流",
        "no_open_pdf_url": "无开放 PDF",
        "invalid_pdf_header": "PDF 无效",
        "error:HTTPError": "HTTP 错误",
        "tsg_skill_missing": "TSG 技能缺失",
        "tsg_no_match": "TSG 无匹配",
    }
    if status in labels:
        return labels[status]
    if status.startswith("error:"):
        return "下载错误"
    if status.startswith("paper_download_"):
        return "paper-download：" + status.removeprefix("paper_download_")
    if status.startswith("authorized_adapter_"):
        return "授权适配器：" + status.removeprefix("authorized_adapter_")
    return status.replace("_", " ")


def report(task: Task, state: dict[str, Any]) -> None:
    papers = [Paper(**{k: v for k, v in row.items() if k in Paper.__dataclass_fields__}) for row in state.get("papers", [])]
    targets = [paper for paper in papers if paper.direction == "target"]
    if len(targets) > 1:
        raise ValueError("任务状态包含多个 target 主文章；请为每篇文章使用独立工作目录。")
    target = targets[0] if targets else (papers[0] if papers else None)
    asset_dir = task.root / "report-assets"
    asset_dir.mkdir(exist_ok=True)
    direction_counts = {key: sum(1 for paper in papers if paper.direction == key) for key in ("target", "references", "cited-by")}
    pdf_counts: dict[str, int] = {}
    provider_counts: dict[str, int] = {}
    for paper in papers:
        pdf_counts[paper.pdf_status] = pdf_counts.get(paper.pdf_status, 0) + 1
        for attempt in paper.acquisition_attempts:
            provider = clean_text(attempt.get("provider")) or "unknown"
            provider_counts[provider] = provider_counts.get(provider, 0) + 1
    context_count = sum(len(paper.citation_contexts) for paper in papers)
    phases = update_phase_status(state, papers)
    chart_paths: list[Path] = []
    try:
        import matplotlib.pyplot as plt  # type: ignore
        configure_matplotlib_chinese(plt)
        labels = ["目标文章", "参考文献", "被引文献"]
        values = [direction_counts["target"], direction_counts["references"], direction_counts["cited-by"]]
        fig, ax = plt.subplots(figsize=(7.5, 4.2)); ax.bar(labels, values, color=["#1F4E78", "#5B9BD5", "#70AD47"]); ax.set_title("文献网络规模"); ax.set_ylabel("文章数量"); ax.grid(axis="y", alpha=.25); fig.tight_layout(); path = asset_dir / "direction_counts.png"; fig.savefig(path, dpi=180, facecolor="white"); plt.close(fig); chart_paths.append(path)
        chart_labels = [pdf_status_label(status) for status in pdf_counts]
        fig, ax = plt.subplots(figsize=(7.5, 4.2)); ax.barh(chart_labels, [pdf_counts[status] for status in pdf_counts], color="#ED7D31"); ax.set_title("PDF 获取状态"); ax.set_xlabel("文章数量"); ax.grid(axis="x", alpha=.25); fig.tight_layout(); path = asset_dir / "pdf_status.png"; fig.savefig(path, dpi=180, facecolor="white"); plt.close(fig); chart_paths.append(path)
    except Exception:
        chart_paths = []
    def md(value: Any) -> str:
        return clean_text(value).replace("|", " ").replace("\n", " ")
    lines = [f"# 文献引用与被引分析：{md(target.title if target else '未解析')}", "", f"生成时间：{now()}", f"工作模式：单篇主文章独立任务（{md(state.get('article_slug') or '')}）", f"流程状态：{md(state.get('stage') or 'unknown')}（只有 complete 才代表完整研究结束）", "", "## 流程完成度", "", "| 阶段 | 状态 |", "|---|---|", *[f"| {md(name)} | {md(status)} |" for name, status in phases.items()], "", "## 一、目标文章", ""]
    if target:
        counts = "；".join(f"{key}：{value} 次" for key, value in target.cited_by_counts.items()) or "暂无可用引用次数"
        lines += [f"- DOI：{md(target.doi) or '未知'}", f"- PMID：{md(target.pmid) or '未知'}", f"- 期刊/年份：{md(target.journal) or '未知'} / {md(target.year) or '未知'}", f"- 多来源引用次数：{counts}", f"- 摘要：{md(target.abstract) or '暂无'}", ""]
    lines += ["## 二、数据统计", "", "| 指标 | 数值 |", "|---|---:|", f"| 唯一文章总数 | {len(papers)} |", f"| 参考文献 | {direction_counts['references']} |", f"| 被引文献 | {direction_counts['cited-by']} |", f"| 已获取 PDF | {sum(1 for paper in papers if paper.pdf_path)} |", f"| 引用原文证据条数 | {context_count} |", ""]
    for path in chart_paths:
        lines += [f"![{path.stem}](report-assets/{path.name})", ""]
    lines += ["## 三、文章明细", "", "| 方向 | 标题 | DOI | PMID | PDF 状态 | 最终来源 | MinerU 快照 | 图片/表格/JSON | 引用次数 | 国家 | 机构 |", "|---|---|---|---|---|---|---|---|---|---|---|"]
    for paper in papers:
        counts = paper.mineru_file_counts or {}
        lines.append(f"| {md(paper.direction)} | {md(paper.title)} | {md(paper.doi)} | {md(paper.pmid)} | {md(paper.pdf_status)} | {md(paper.pdf_source)} | {md(paper.mineru_snapshot_dir) or '未解析'} | {counts.get('images', 0)}/{counts.get('tables', 0)}/{counts.get('json', 0)} | {md(json.dumps(paper.cited_by_counts, ensure_ascii=False))} | {md(', '.join(paper.countries))} | {md(', '.join(paper.institutions))} |")
    contexts = [context | {"paper": paper.title, "direction": paper.direction} for paper in papers for context in paper.citation_contexts]
    lines += ["", "## 四、引文原文证据", "", "以下摘录保留被引文章中的英文原文。每一处可识别的引用标记都单独保留，并记录页码、偏移、分类和证据等级。", ""]
    for context in contexts:
        lines += [f"### {md(context.get('paper'))}", f"- 方向：{md(context.get('direction'))}；页码：{md(context.get('page', '未知'))}；标记：`{md(context.get('marker', ''))}`；分类：{md(context.get('classification', ''))}；证据等级：{md(context.get('evidence_level', ''))}", f"> {context.get('excerpt', '')}", ""]
    lines += ["## 五、作者履历核验", "", "职务、学术兼职、院士/会士和荣誉只有在 ORCID 或机构公开记录明确给出时才填写。空白表示当前没有可验证证据，不代表不存在。", ""]
    for paper in papers:
        for profile in paper.author_profiles:
            if profile.get("position") or profile.get("appointments") or profile.get("honors"):
                lines.append(f"- **{md(profile.get('name'))}**：职务 {md(profile.get('position')) or '未确认'}；机构/兼职 {md(profile.get('appointments')) or '未确认'}；荣誉 {md(profile.get('honors')) or '未确认'}；来源 {md(profile.get('source_url')) or '未提供'}")
    evidence_path = task.root / "analysis" / "provider_evidence.json"
    if not evidence_path.is_file() and task.mcp_receipts():
        evidence_path.parent.mkdir(parents=True, exist_ok=True)
        evidence_path.write_text(json.dumps({"generated_at": now(), "source": "zerowall-literature mcp receipts", "queries": task.mcp_receipts()}, ensure_ascii=False, indent=2), encoding="utf-8")
    analysis_files = [("跨来源核验", "provider_evidence.json"), ("引用分析", "citation_analysis.md"), ("作者分析", "author_analysis.md"), ("综合结论", "synthesis.md")]
    lines += ["", "## 六、综合分析产物", ""]
    for label, filename in analysis_files:
        path = task.root / "analysis" / filename
        lines.append(f"- {label}：{'[已生成](analysis/' + filename + ')' if path.is_file() else '待执行'}")
    lines += ["", "## 七、下载回退与完整性", "", "| 提供方/技能 | 尝试次数 |", "|---|---:|"]
    lines.extend(f"| {md(provider)} | {count} |" for provider, count in sorted(provider_counts.items()))
    failures = [attempt for paper in papers for attempt in paper.acquisition_attempts if str(attempt.get("status", "")).startswith(("error", "failed", "skipped", "no_", "ambiguous"))]
    if failures:
        lines += ["", "### 未成功或跳过的回退", ""]
        for attempt in failures:
            lines.append(f"- {md(attempt.get('provider'))} / {md(attempt.get('skill'))}：{md(attempt.get('status'))}（{md(attempt.get('error') or attempt.get('reason') or '')}）")
    broken = [(paper.title, link) for paper in papers for link in paper.mineru_broken_links]
    rate_limit_count = sum(1 for row in task.mcp_receipts() if str(row.get("status")) == "429")
    lines += ["", f"MinerU 断链图片/资源：{len(broken)}；无全文记录：{sum(1 for paper in papers if not paper.pdf_path)}；S2/其他 provider 429：{rate_limit_count}。"]
    lines += ["", "## 八、证据边界", "", "元数据、摘要、MinerU 完整目录、引用上下文和作者证据分层保存。无法获取全文、提供方失败、引用标记含义不确定或人物履历未验证的记录均保留在 Excel 对应工作表中。流程状态不是 complete 时，本报告只是中间产物，不得表述为完整研究已经完成。"]
    (task.root / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (task.root / "skill_invocations.json").write_text(json.dumps(state.get("skill_invocations", []), ensure_ascii=False, indent=2), encoding="utf-8")
    review_rows = [{"paper": paper.title, "doi": paper.doi, "status": paper.pdf_status, "reason": paper.parse_status if paper.parse_status != "not_attempted" else paper.pdf_status} for paper in papers if not paper.pdf_path or paper.parse_status != "mineru_parsed"]
    paper_rows = [{"方向": paper.direction, "标题": paper.title, "DOI": paper.doi, "PMID": paper.pmid, "年份": paper.year, "期刊": paper.journal, "作者": "; ".join(paper.authors), "作者国家": "; ".join(paper.countries), "作者机构": "; ".join(paper.institutions), "OpenAlex引用次数": paper.cited_by_counts.get("openalex", ""), "Crossref引用次数": paper.cited_by_counts.get("crossref", ""), "SemanticScholar引用次数": paper.cited_by_counts.get("semantic_scholar", ""), "PDF状态": paper.pdf_status, "PDF路径": paper.pdf_path, "PDF来源": paper.pdf_source, "SHA256": paper.pdf_sha256, "解析状态": paper.parse_status, "MinerU API": paper.parser_api, "MinerU taskId": paper.parser_task_id, "MinerU快照目录": paper.mineru_snapshot_dir, "MinerU正文": paper.parsed_text_path, "MinerU图片数": paper.mineru_file_counts.get("images", 0), "MinerU表格数": paper.mineru_file_counts.get("tables", 0), "MinerU JSON数": paper.mineru_file_counts.get("json", 0), "MinerU断链": "; ".join(paper.mineru_broken_links), "引用证据条数": len(paper.citation_contexts), "引用证据来源": "MinerU" if paper.parse_status == "mineru_parsed" else "unavailable", "参考文献编号": paper.raw.get("reference_index", "")} for paper in papers]
    acquisition_rows = [{"paper": paper.title, "direction": paper.direction, **attempt} for paper in papers for attempt in paper.acquisition_attempts]
    mineru_rows = [{"paper": paper.title, "paper_key": paper.key, "snapshot_dir": paper.mineru_snapshot_dir, "manifest": paper.mineru_manifest_path, "task_id": paper.parser_task_id, "api": paper.parser_api, "broken_links": "; ".join(paper.mineru_broken_links), **artifact} for paper in papers for artifact in paper.parser_artifacts]
    provider_rows = []
    if evidence_path.is_file():
        try:
            raw_evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
            provider_rows = raw_evidence if isinstance(raw_evidence, list) else (raw_evidence.get("queries") or raw_evidence.get("providers") or raw_evidence.get("results") or [])
        except (OSError, json.JSONDecodeError):
            provider_rows = [{"status": "invalid_provider_evidence"}]
    sheets = {"Summary": [{"指标": "流程状态", "数值": state.get("stage", "")}, *[{"指标": name, "数值": status} for name, status in phases.items()], {"指标": "唯一文章总数", "数值": len(papers)}, {"指标": "参考文献", "数值": direction_counts["references"]}, {"指标": "被引文献", "数值": direction_counts["cited-by"]}, {"指标": "已获取 PDF", "数值": sum(1 for paper in papers if paper.pdf_path)}, {"指标": "MinerU 已解析", "数值": sum(1 for paper in papers if paper.parse_status == "mineru_parsed")}, {"指标": "引用原文证据", "数值": context_count}], "Direction Stats": [{"方向": key, "文章数": value} for key, value in (("目标文章", direction_counts["target"]), ("参考文献", direction_counts["references"]), ("被引文献", direction_counts["cited-by"]))], "PDF Stats": [{"状态": key, "数量": value} for key, value in pdf_counts.items()], "Papers": paper_rows, "Citation Contexts": contexts, "Author Profiles": [profile | {"paper": paper.title} for paper in papers for profile in paper.author_profiles], "Acquisition Attempts": acquisition_rows, "MCP Receipts": task.mcp_receipts(), "MinerU Artifacts": mineru_rows, "Provider Evidence": provider_rows, "Review Queue": review_rows, "Failure Review": [{"paper": paper.title, "status": paper.pdf_status, "attempts": paper.acquisition_attempts} for paper in papers if paper.pdf_status not in ACQUISITION_TERMINAL], "Deduplication": state.get("deduplication", []), "Source Ledger": task.ledger()}
    write_excel(task.root / "papers.xlsx", sheets)


def run_analyze(args: argparse.Namespace) -> int:
    output = Path(args.output)
    task = Task(output); state = task.load(); client = Client(task, args.timeout)
    (task.root / "analysis").mkdir(exist_ok=True)
    state["input"] = args.input; state["research_plan"] = {"directions": args.directions, "max_papers": args.max_papers, "download_pdfs": args.download_pdfs, "download_workers": args.download_workers, "enrich_authors": args.enrich_authors, "created_at": now()}
    state["skill_invocations"] = [
        {"skill": "paper-download-pdf-cascade", "status": "configured", "entrypoint": "paper_download_bridge.py"},
        {"skill": "zerowall-tsg-literature", "status": "automatic_authorized_fallback", "credentials": "four_env_vars_required"},
        {"skill": "mineru-document-parser", "status": "required", "result_command": "ingest-mineru"},
        {"skill": "pubmed-literature/sci-master", "status": "required", "artifact": "analysis/provider_evidence.json"},
        {"skill": "deep-research/ARS", "status": "required", "artifacts": ["analysis/citation_analysis.md", "analysis/author_analysis.md", "analysis/synthesis.md"]},
    ]
    (task.root / "research_plan.md").write_text(
        "\n".join([
            "# Literature research plan", "", f"Input: {args.input}",
            f"Directions: {args.directions}", f"PDF download: {'enabled' if args.download_pdfs else 'metadata only'}",
            f"Maximum related papers: {args.max_papers or 'unbounded'}", "",
            "Open-access providers are attempted first, followed by paper-download and authorized TSG when all four credentials are configured. Use --no-tsg to disable the authorized fallback.",
            "Every acquired PDF must be submitted to mineru_parse and registered with the ingest-mineru command.",
            "PubMed/SciMaster provider evidence and ARS/deep-research analysis are required before finalize succeeds.", "",
        ]) + "\n", encoding="utf-8")
    try:
        target, candidates = client.resolve(args.input)
    except ValueError as exc:
        state["stage"] = "needs_input"; state["input_error"] = str(exc); task.save(state)
        print(str(exc), file=sys.stderr)
        return 2
    state["candidates"] = candidates
    if not target:
        state["stage"] = "needs_input"; task.save(state); print("No article match; see candidates/review_queue in the task directory.", file=sys.stderr); return 2
    if args.article_slug:
        slug = safe_name(args.article_slug, 96)
    else:
        slug = article_slug(target.title)
    state["single_article"] = True
    state["article_key"] = article_identity(target)
    state["article_slug"] = slug
    state["task_root"] = str(task.root.resolve())
    target = client.enrich(target); target.author_profiles = author_profiles(target)
    state["stage"] = "identified"; state["papers"] = [asdict(target)]; task.save(state)
    papers = [target]
    for direction in args.directions.split(","):
        direction = direction.strip()
        direction_limit = None if ((direction == "references" and args.all_references) or (direction == "cited-by" and args.all_cited_by)) else args.max_papers
        papers.extend(client.expand_openalex(target, direction, direction_limit))
    papers, aliases = deduplicate_papers(papers)
    state["deduplication"] = aliases
    state["stage"] = "expanded"; state["papers"] = [asdict(p) for p in papers]; task.save(state)
    if args.download_pdfs:
        workers = max(1, min(args.download_workers, 8))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(download_paper, client, paper, not args.no_tsg): paper for paper in papers}
            for index, future in enumerate(as_completed(futures), 1):
                future.result(); paper = futures[future]
                if paper.pdf_path:
                    text = extract_pdf_text(Path(paper.pdf_path)); paper.parse_status = "text_extracted" if text else "no_text"
                paper.author_profiles = author_profiles(paper)
                if index % 5 == 0: state["papers"] = [asdict(p) for p in papers]; task.save(state)
        deduplicate_pdf_hashes(papers, state.setdefault("deduplication", []))
    state["stage"] = "mineru_pending" if any(p.pdf_path for p in papers) else "acquisition_incomplete"
    state["papers"] = [asdict(p) for p in papers]; update_phase_status(state, papers); task.save(state); report(task, state)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print(json.dumps({"task": str(task.root), "stage": state["stage"], "target": {"title": target.title, "doi": target.doi, "pmid": target.pmid, "year": target.year}, "paper_count": len(papers)}, ensure_ascii=False, indent=2))
    return 0


def run_resume(args: argparse.Namespace) -> int:
    task = Task(args.task); state = task.load(); client = Client(task, args.timeout)
    if state.get("single_article") is False:
        print("该任务不是单篇主文章工作目录，拒绝继续。", file=sys.stderr); return 2
    papers = [Paper(**{k: v for k, v in row.items() if k in Paper.__dataclass_fields__}) for row in state.get("papers", [])]
    if not papers:
        print("No resumable papers in task state.", file=sys.stderr); return 2
    target = next((p for p in papers if p.direction == "target"), papers[0])
    if sum(1 for paper in papers if paper.direction == "target") > 1:
        print("任务状态包含多个 target 主文章，请拆分工作目录。", file=sys.stderr); return 2
    state["single_article"] = True
    state.setdefault("article_key", article_identity(target))
    state.setdefault("article_slug", article_slug(target.title))
    state["task_root"] = str(task.root.resolve())
    target = client.enrich(target)
    target.author_profiles = author_profiles(target)
    papers[0 if papers and papers[0].direction == "target" else next(i for i, p in enumerate(papers) if p.key == target.key)] = target
    for paper in papers:
        if paper.pdf_status in ACQUISITION_TERMINAL:
            continue
        download_paper(client, paper, not args.no_tsg)
        paper.author_profiles = author_profiles(paper)
        state["papers"] = [asdict(p) for p in papers]; task.save(state)
    state["stage"] = "mineru_pending" if any(p.pdf_path and p.parse_status != "mineru_parsed" for p in papers) else "analysis_pending"
    state["papers"] = [asdict(p) for p in papers]; update_phase_status(state, papers); task.save(state); report(task, state)
    print(json.dumps({"task": str(task.root), "stage": state["stage"], "paper_count": len(papers)}, ensure_ascii=False, indent=2))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="ZeroWall title-driven literature trail")
    sub = parser.add_subparsers(dest="command", required=True)
    analyze = sub.add_parser("analyze"); analyze.add_argument("input"); analyze.add_argument("--output", type=Path, required=True, help="该主文章唯一的独立工作目录"); analyze.add_argument("--article-slug", help="任务元数据中的主文章短标识"); analyze.add_argument("--directions", default="references,cited-by"); analyze.add_argument("--max-papers", type=int, default=int(os.getenv("LITERATURE_MAX_RELATED_PAPERS", "40"))); analyze.add_argument("--all-references", action="store_true"); analyze.add_argument("--all-cited-by", action="store_true"); downloads = analyze.add_mutually_exclusive_group(); downloads.add_argument("--download-pdfs", dest="download_pdfs", action="store_true"); downloads.add_argument("--no-download-pdfs", dest="download_pdfs", action="store_false"); analyze.set_defaults(download_pdfs=True); analyze.add_argument("--download-workers", type=int, default=int(os.getenv("LITERATURE_DOWNLOAD_WORKERS", "4"))); analyze.add_argument("--enrich-authors", action="store_true"); analyze.add_argument("--include-target", action="store_true"); analyze.add_argument("--allow-tsg", action="store_true", help="兼容旧调用；TSG 默认自动启用"); analyze.add_argument("--no-tsg", action="store_true", help="禁用授权 TSG 回退"); analyze.add_argument("--timeout", type=float, default=30)
    resume = sub.add_parser("resume"); resume.add_argument("task", type=Path); resume.add_argument("--allow-tsg", action="store_true", help="兼容旧调用；TSG 默认自动启用"); resume.add_argument("--no-tsg", action="store_true", help="禁用授权 TSG 回退"); resume.add_argument("--timeout", type=float, default=30)
    export = sub.add_parser("export"); export.add_argument("task", type=Path)
    ingest = sub.add_parser("ingest-mineru"); ingest.add_argument("task", type=Path); ingest.add_argument("--paper", required=True, help="paper key, DOI, or PMID"); ingest.add_argument("--run-dir", type=Path, required=True); ingest.add_argument("--task-id", default=""); ingest.add_argument("--api", default="mineru")
    finalize = sub.add_parser("finalize"); finalize.add_argument("task", type=Path)
    status = sub.add_parser("status"); status.add_argument("task", type=Path)
    args = parser.parse_args(argv)
    if args.command == "analyze": return run_analyze(args)
    if args.command == "resume": return run_resume(args)
    if args.command == "ingest-mineru":
        task = Task(args.task); state = task.load(); paper = ingest_mineru_result(task, state, args.paper, args.run_dir, args.task_id, args.api)
        print(json.dumps({"paper": paper.key, "parse_status": paper.parse_status, "parsed_text_path": paper.parsed_text_path}, ensure_ascii=False, indent=2)); return 0
    if args.command == "finalize":
        task = Task(args.task); state = task.load()
        try:
            finalize_analysis(task, state)
        except ValueError as exc:
            print(str(exc), file=sys.stderr); return 2
        print(json.dumps({"task": str(task.root), "stage": "complete"}, ensure_ascii=False, indent=2)); return 0
    if args.command == "status":
        task = Task(args.task); state = task.load(); papers = [Paper(**{k: v for k, v in row.items() if k in Paper.__dataclass_fields__}) for row in state.get("papers", [])]
        print(json.dumps({"stage": state.get("stage"), "phase_status": update_phase_status(state, papers), "papers": [{"key": p.key, "direction": p.direction, "pdf_path": p.pdf_path, "parse_status": p.parse_status} for p in papers]}, ensure_ascii=False, indent=2)); return 0
    task = Task(args.task); state = task.load(); report(task, state); print(str(task.root)); return 0


if __name__ == "__main__":
    raise SystemExit(main())
