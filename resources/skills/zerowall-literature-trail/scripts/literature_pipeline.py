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
import os
import re
import sys
import tempfile
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote, urlparse

import requests


CROSSREF = "https://api.crossref.org/works"
OPENALEX = "https://api.openalex.org/works"
EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest"
UNPAYWALL = "https://api.unpaywall.org/v2"
USER_AGENT = "ZeroWall-Science-literature-trail/1.0 (research workflow)"
DOI_RE = re.compile(r"10\.\d{4,9}/[-._;()/:A-Z0-9]+", re.I)
PMID_RE = re.compile(r"(?:pubmed\.ncbi\.nlm\.nih\.gov/|pmid[:\s]*)?(\d{5,9})$", re.I)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def safe_name(value: str, limit: int = 120) -> str:
    value = re.sub(r"[<>:\"/\\|?*\x00-\x1f]", "_", clean_text(value)).strip(" .")
    return (value or "paper")[:limit]


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
    citation_contexts: list[dict[str, Any]] = field(default_factory=list)
    author_profiles: list[dict[str, Any]] = field(default_factory=list)


class Task:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        (root / "downloads").mkdir(exist_ok=True)
        (root / "parsed").mkdir(exist_ok=True)
        self.state_path = root / "state.json"
        self.ledger_path = root / "source_ledger.json"

    def load(self) -> dict[str, Any]:
        try:
            return json.loads(self.state_path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return {"schema": 1, "created_at": now(), "stage": "initialized", "papers": []}

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
        item = {"provider": provider, "url": url, "status": status, "at": now()}
        item.update({k: v for k, v in meta.items() if v is not None})
        rows = self.ledger()
        rows.append(item)
        self.ledger_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


class Client:
    def __init__(self, task: Task, timeout: float = 30.0):
        self.task, self.timeout = task, timeout
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})

    def get_json(self, provider: str, url: str, **kwargs: Any) -> dict[str, Any]:
        try:
            response = self.session.get(url, timeout=self.timeout, **kwargs)
            self.task.record(provider, response.url, str(response.status_code))
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            self.task.record(provider, url, "error", error=type(exc).__name__)
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
        if path.suffix.lower() in (".xlsx", ".xlsm"):
            try:
                from openpyxl import load_workbook  # type: ignore
                book = load_workbook(path, read_only=True, data_only=True)
                values = [clean_text(value) for row in book.active.iter_rows(values_only=True) for value in row if clean_text(value)]
                title = next((value for value in values if len(value) > 20 and value.lower() not in ("doi", "title")), path.stem)
                return Paper(key=f"local:{path.resolve()}", title=title, source="local_excel", raw={"path": str(path.resolve())})
            except Exception:
                pass
        if path.suffix.lower() == ".csv":
            try:
                with path.open(encoding="utf-8-sig", newline="") as handle:
                    values = [clean_text(value) for row in csv.reader(handle) for value in row if clean_text(value)]
                title = next((value for value in values if len(value) > 20 and value.lower() not in ("doi", "title")), path.stem)
                return Paper(key=f"local:{path.resolve()}", title=title, source="local_csv", raw={"path": str(path.resolve())})
            except Exception:
                pass
        text = extract_pdf_text(path) if path.suffix.lower() == ".pdf" else ""
        title = next((clean_text(line) for line in text.splitlines() if 30 < len(clean_text(line)) < 240), path.stem)
        return Paper(key=f"local:{path.resolve()}", title=title, source="local", raw={"path": str(path.resolve())})

    @staticmethod
    def crossref_paper(item: dict[str, Any], direction: str) -> Paper:
        doi = clean_text(item.get("DOI")).lower()
        authors = [clean_text(f"{a.get('given', '')} {a.get('family', '')}") for a in item.get("author", [])]
        year = ((item.get("published-print") or item.get("published-online") or item.get("issued") or {}).get("date-parts") or [[""]])[0][0]
        oa = [clean_text(x.get("URL")) for x in item.get("link", []) if x.get("URL")]
        affiliations = [clean_text(a.get("name")) for author in item.get("author", []) for a in author.get("affiliation", []) if a.get("name")]
        corresponding = [clean_text(f"{a.get('given', '')} {a.get('family', '')}") for a in item.get("author", []) if a.get("role") and any(r.get("role") == "editor" for r in a.get("role", []))]
        return Paper(key=f"doi:{doi}" if doi else f"title:{clean_text((item.get('title') or [''])[0]).lower()}", title=clean_text((item.get("title") or [""])[0]), doi=doi, year=str(year), journal=clean_text((item.get("container-title") or [""])[0]), authors=authors, affiliations=affiliations, corresponding_authors=corresponding, oa_urls=oa, source="crossref", direction=direction, raw=item)

    @staticmethod
    def epmc_paper(item: dict[str, Any], direction: str) -> Paper:
        doi = clean_text(item.get("doi")).lower()
        pmid = clean_text(item.get("pmid"))
        authors = [clean_text(a.get("fullName")) for a in (item.get("authorList") or {}).get("author", [])]
        return Paper(key=f"doi:{doi}" if doi else f"pmid:{pmid}", title=clean_text(item.get("title")), doi=doi, pmid=pmid, year=clean_text(item.get("pubYear")), journal=clean_text(item.get("journalTitle")), authors=authors, abstract=clean_text(item.get("abstractText")), source="europepmc", direction=direction, raw=item)

    def enrich(self, paper: Paper) -> Paper:
        if paper.doi:
            ep = self.get_json("europepmc", f"{EPMC}/search", params={"query": f'DOI:"{paper.doi}"', "format": "json", "resultType": "core"})
            rows = (ep.get("resultList") or {}).get("result") or []
            if rows:
                other = self.epmc_paper(rows[0], paper.direction)
                paper.pmid, paper.abstract = paper.pmid or other.pmid, paper.abstract or other.abstract
                paper.authors = paper.authors or other.authors
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
        return dedupe_urls(paper)

    def expand_openalex(self, target: Paper, direction: str, max_papers: int | None) -> list[Paper]:
        oa = target.raw.get("openalex") or {}
        ids: list[str] = []
        if direction == "references":
            ids = list(oa.get("referenced_works") or [])
        elif direction == "cited-by" and oa.get("id"):
            cursor = "*"
            while len(ids) < (max_papers or 100000):
                page = self.get_json("openalex", f"{OPENALEX}", params={"filter": f"cites:{oa['id'].split('/')[-1]}", "per-page": min(200, max_papers or 200), "cursor": cursor})
                rows = page.get("results") or []
                ids.extend([x.get("id") for x in rows if x.get("id")])
                cursor = (page.get("meta") or {}).get("next_cursor")
                if not rows or not cursor: break
        papers: list[Paper] = []
        for index, ident in enumerate(ids[:max_papers] if max_papers else ids, 1):
            api_ident = ident.replace("https://openalex.org/", f"{OPENALEX}/") if ident.startswith("https://openalex.org/") else ident
            item = self.get_json("openalex", api_ident)
            if not item: continue
            doi = clean_text(item.get("doi")).replace("https://doi.org/", "").lower()
            authors = [clean_text(f"{a.get('author', {}).get('display_name', '')}") for a in item.get("authorships", [])]
            paper = Paper(key=f"doi:{doi}" if doi else f"openalex:{item.get('id')}", title=clean_text(item.get("title")), doi=doi, year=str(item.get("publication_year") or ""), journal=clean_text((item.get("primary_location") or {}).get("source", {}).get("display_name")), authors=authors, source="openalex", direction=direction, cited_by_counts={"openalex": int(item.get("cited_by_count") or 0)}, raw={"openalex": slim_openalex(item), "reference_index": index if direction == "references" else None})
            loc = item.get("best_oa_location") or {}
            if loc.get("pdf_url"): paper.oa_urls.append(loc["pdf_url"])
            papers.append(paper)
        return papers


def dedupe_urls(paper: Paper) -> Paper:
    paper.oa_urls = list(dict.fromkeys(x for x in paper.oa_urls if x.startswith(("http://", "https://"))))
    return paper


def slim_openalex(item: dict[str, Any]) -> dict[str, Any]:
    """Keep reproducibility-critical OpenAlex fields without embedding large
    abstract inverted indexes and unrelated provider payloads in task state."""
    keys = ("id", "doi", "title", "publication_year", "cited_by_count", "best_oa_location", "authorships", "referenced_works", "primary_location", "open_access")
    return {key: item.get(key) for key in keys if key in item}


def extract_pdf_text(path: Path) -> str:
    try:
        import fitz  # type: ignore
        return "\n".join(page.get_text("text") for page in fitz.open(path))
    except Exception:
        try:
            from pypdf import PdfReader  # type: ignore
            return "\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages)
        except Exception:
            return ""


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


def download_paper(client: Client, paper: Paper, allow_tsg: bool = False) -> None:
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
            return
    for url in urls:
        try:
            response = client.session.get(url, timeout=client.timeout, stream=True, allow_redirects=True)
            client.task.record("pdf", response.url, str(response.status_code), paper=paper.key)
            response.raise_for_status()
            with tempfile.NamedTemporaryFile(dir=target.parent, delete=False, suffix=".part") as handle:
                temp = Path(handle.name)
                for chunk in response.iter_content(131072):
                    if chunk: handle.write(chunk)
            ok, reason, digest = validate_pdf(temp, paper)
            if ok:
                temp.replace(target)
                paper.pdf_path, paper.pdf_source, paper.pdf_sha256, paper.pdf_status = str(target), response.url, digest, "downloaded"
                return
            temp.unlink(missing_ok=True)
            paper.pdf_status = reason
        except Exception as exc:
            paper.pdf_status = f"error:{type(exc).__name__}"
    if allow_tsg and paper.doi and os.getenv("TSG_TOKEN"):
        if download_via_tsg(client, paper, target):
            return
    if not paper.pdf_path:
        paper.pdf_status = paper.pdf_status if paper.pdf_status != "not_attempted" else "no_open_pdf_url"


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
            os.getenv("TSG_TOKEN", ""),
            user_token=os.getenv("TSG_USER_TOKEN"),
            pm_jsessionid=os.getenv("TSG_PM_JSESSIONID"),
            user_jsessionid=os.getenv("TSG_USER_JSESSIONID"),
            timeout=client.timeout,
        )
        matches, _ = tsg.search(paper.doi or paper.title, size=20)
        match = next((x for x in matches if paper.doi and x.doi.lower() == paper.doi.lower()), None)
        match = match or next((x for x in matches if title_score(paper.title, x.title) > 0.65), None)
        if match is None:
            paper.pdf_status = "tsg_no_match"
            return False
        case = tsg.apply([match])[0]
        deadline = time.monotonic() + float(os.getenv("TSG_WAIT_TIMEOUT", "3600"))
        while time.monotonic() < deadline:
            rows = tsg.cases(size=100)
            current = next((x for x in rows if x.pmid == match.pmid), case)
            if current.status == 2 or current.pdf_url:
                url = tsg.viewer_pdf_url(current)
                tsg.download(url, target)
                ok, reason, digest = validate_pdf(target, paper)
                if ok:
                    paper.pdf_path, paper.pdf_source, paper.pdf_sha256, paper.pdf_status = str(target), "tsg", digest, "downloaded_tsg"
                    return True
                target.unlink(missing_ok=True); paper.pdf_status = f"tsg_{reason}"; return False
            if current.status in (3, 4, -1):
                paper.pdf_status = f"tsg_failed_status_{current.status}"; return False
            time.sleep(min(30.0, max(2.0, float(os.getenv("TSG_POLL_INTERVAL", "30")))) )
        paper.pdf_status = "tsg_timeout"
    except Exception as exc:
        paper.pdf_status = f"tsg_error:{type(exc).__name__}"
    return False


def citation_contexts(text: str, target: Paper, ref_number: int | None = None) -> list[dict[str, Any]]:
    markers: list[str] = []
    if ref_number:
        markers.extend([rf"\[{ref_number}\]", rf"\[{max(1, ref_number - 1)}\s*[-–]\s*{ref_number}\s*\]", rf"\b{ref_number}\b"])
    surnames = [clean_text(a).split()[-1] for a in target.authors[:3] if clean_text(a)]
    markers.extend([re.escape(s) for s in surnames if len(s) > 3])
    hits: list[dict[str, Any]] = []
    for pattern in markers:
        for match in re.finditer(pattern, text, re.I):
            start, end = max(0, match.start() - 420), min(len(text), match.end() + 420)
            excerpt = clean_text(text[start:end])
            if excerpt and not any(match.start() == x["offset"] for x in hits):
                hits.append({"marker": match.group(0), "excerpt": excerpt[:900], "offset": match.start(), "classification": classify_context(excerpt)})
    return hits


def classify_context(value: str) -> str:
    lower = value.lower()
    if any(x in lower for x in ("however", "contradict", "limitation", "failed", "unlike")): return "critique_or_comparison"
    if any(x in lower for x in ("method", "protocol", "assay", "according to")): return "method_or_background"
    if any(x in lower for x in ("support", "consistent", "demonstrated", "showed")): return "supporting_result"
    return "background_or_uncertain"


def author_profiles(paper: Paper) -> list[dict[str, Any]]:
    profiles = []
    names = [("first_author", paper.authors[0] if paper.authors else "")]
    names.extend(("corresponding_author", name) for name in paper.corresponding_authors if name)
    orcids = {clean_text(a.get("family")): clean_text(a.get("ORCID")) for a in (paper.raw.get("author") or []) if a.get("ORCID")}
    for role, name in names:
        family = clean_text(name).split()[-1] if name else ""
        orcid = orcids.get(family, "")
        profiles.append({"name": name, "role": role, "institution": "; ".join(dict.fromkeys(paper.affiliations)), "position": "", "appointments": "", "honors": "", "orcid": orcid, "source_url": orcid or "", "confidence": "identifier_only" if orcid else "unverified"})
    return profiles


def assign_contexts(papers: list[Paper], target: Paper) -> None:
    """Attach evidence in the correct document for each citation direction."""
    target_text = extract_pdf_text(Path(target.pdf_path)) if target.pdf_path else ""
    for paper in papers:
        if paper.direction == "cited-by" and paper.pdf_path:
            paper.citation_contexts = citation_contexts(extract_pdf_text(Path(paper.pdf_path)), target)
        elif paper.direction == "references" and target_text:
            index = (paper.raw.get("reference_index") or 0)
            paper.citation_contexts = citation_contexts(target_text, paper, int(index) if index else None)


def write_tsv(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    rows = list(rows)
    fields = sorted({key for row in rows for key in row}) or ["status"]
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore", delimiter="\t")
        writer.writeheader(); writer.writerows(rows)


def write_excel(path: Path, sheets: dict[str, list[dict[str, Any]]]) -> None:
    try:
        from openpyxl import Workbook  # type: ignore
    except Exception:
        return
    book = Workbook(); book.remove(book.active)
    for name, rows in sheets.items():
        sheet = book.create_sheet(name[:31]); rows = list(rows)
        fields = list(dict.fromkeys(k for row in rows for k in row)) or ["status"]
        sheet.append(fields)
        for row in rows: sheet.append([json.dumps(row.get(k), ensure_ascii=False) if isinstance(row.get(k), (dict, list)) else row.get(k, "") for k in fields])
        sheet.freeze_panes = "A2"; sheet.auto_filter.ref = sheet.dimensions
    book.save(path)


def report(task: Task, state: dict[str, Any]) -> None:
    papers = [Paper(**{k: v for k, v in row.items() if k in Paper.__dataclass_fields__}) for row in state.get("papers", [])]
    target = next((p for p in papers if p.direction == "target"), papers[0] if papers else None)
    lines = [f"# Literature trail: {target.title if target else 'unresolved'}", "", f"Generated: {now()}", "", "## Target", ""]
    if target:
        lines += [f"- DOI: {target.doi or 'unknown'}", f"- PMID: {target.pmid or 'unknown'}", f"- Journal/year: {target.journal or 'unknown'} / {target.year or 'unknown'}", f"- Abstract: {target.abstract or 'not available'}", ""]
    lines += ["## Papers", "", "| Direction | Title | DOI | PMID | PDF | Citation counts |", "|---|---|---|---|---|---|"]
    for p in papers:
        lines.append(f"| {p.direction} | {p.title.replace('|', ' ')} | {p.doi} | {p.pmid} | {p.pdf_status} | {json.dumps(p.cited_by_counts, ensure_ascii=False)} |")
    contexts = [ctx | {"paper": p.title, "direction": p.direction} for p in papers for ctx in p.citation_contexts]
    lines += ["", "## Citation contexts", ""]
    for ctx in contexts: lines += [f"- **{ctx['paper']}** ({ctx['classification']}): {ctx['excerpt']}", ""]
    lines += ["## Evidence limits", "", "Metadata, abstracts, full-text excerpts, and author profiles are kept as separate evidence levels. Missing PDFs, ambiguous citation markers, and unverified biographies remain in `review_queue.tsv`."]
    (task.root / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    write_tsv(task.root / "citation_contexts.tsv", contexts)
    write_tsv(task.root / "author_profiles.tsv", [profile | {"paper": p.title} for p in papers for profile in p.author_profiles])
    write_tsv(task.root / "review_queue.tsv", [{"paper": p.title, "doi": p.doi, "status": p.pdf_status, "reason": p.parse_status if p.parse_status != "not_attempted" else p.pdf_status} for p in papers if not p.pdf_path or p.pdf_status not in ("downloaded", "already_present")])
    sheets = {"Papers": [asdict(p) for p in papers], "Citation Contexts": contexts, "Author Profiles": [profile | {"paper": p.title} for p in papers for profile in p.author_profiles], "Source Ledger": task.ledger()}
    write_excel(task.root / "papers.xlsx", sheets)


def run_analyze(args: argparse.Namespace) -> int:
    task = Task(Path(args.output)); state = task.load(); client = Client(task, args.timeout)
    state["input"] = args.input; state["research_plan"] = {"directions": args.directions, "max_papers": args.max_papers, "download_pdfs": args.download_pdfs, "created_at": now()}
    (task.root / "research_plan.md").write_text(
        "\n".join([
            "# Literature research plan", "", f"Input: {args.input}",
            f"Directions: {args.directions}", f"PDF download: {'enabled' if args.download_pdfs else 'metadata only'}",
            f"Maximum related papers: {args.max_papers or 'unbounded'}", "",
            "Open-access providers are attempted first. TSG is attempted only with --allow-tsg and configured account credentials.",
            "MinerU is the high-fidelity parser for complex layout/OCR; the deterministic parser records text and citation evidence.",
            "ARS/deep-research consume the task artifacts for source verification and synthesis.", "",
        ]) + "\n", encoding="utf-8")
    target, candidates = client.resolve(args.input)
    state["candidates"] = candidates
    if not target:
        state["stage"] = "needs_input"; task.save(state); print("No article match; see candidates/review_queue in the task directory.", file=sys.stderr); return 2
    target = client.enrich(target); target.author_profiles = author_profiles(target)
    state["stage"] = "identified"; state["papers"] = [asdict(target)]; task.save(state)
    papers = [target]
    for direction in args.directions.split(","):
        papers.extend(client.expand_openalex(target, direction.strip(), args.max_papers))
    unique: dict[str, Paper] = {p.key: p for p in papers}
    papers = list(unique.values())
    state["stage"] = "expanded"; state["papers"] = [asdict(p) for p in papers]; task.save(state)
    if args.download_pdfs:
        for index, paper in enumerate(papers, 1):
            download_paper(client, paper, args.allow_tsg)
            if paper.pdf_path:
                text = extract_pdf_text(Path(paper.pdf_path)); paper.parse_status = "text_extracted" if text else "no_text"
            paper.author_profiles = author_profiles(paper)
            if index % 5 == 0: state["papers"] = [asdict(p) for p in papers]; task.save(state)
        assign_contexts(papers, target)
    state["stage"] = "reported"; state["papers"] = [asdict(p) for p in papers]; task.save(state); report(task, state)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print(json.dumps({"task": str(task.root), "stage": state["stage"], "target": {"title": target.title, "doi": target.doi, "pmid": target.pmid, "year": target.year}, "paper_count": len(papers)}, ensure_ascii=False, indent=2))
    return 0


def run_resume(args: argparse.Namespace) -> int:
    task = Task(args.task); state = task.load(); client = Client(task, args.timeout)
    papers = [Paper(**{k: v for k, v in row.items() if k in Paper.__dataclass_fields__}) for row in state.get("papers", [])]
    if not papers:
        print("No resumable papers in task state.", file=sys.stderr); return 2
    target = next((p for p in papers if p.direction == "target"), papers[0])
    for paper in papers:
        if paper.pdf_status in ("downloaded", "downloaded_tsg", "already_present"):
            continue
        download_paper(client, paper, args.allow_tsg)
        if paper.pdf_path:
            text = extract_pdf_text(Path(paper.pdf_path)); paper.parse_status = "text_extracted" if text else "no_text"
        paper.author_profiles = author_profiles(paper)
        state["papers"] = [asdict(p) for p in papers]; task.save(state)
    assign_contexts(papers, target)
    state["stage"] = "reported"; state["papers"] = [asdict(p) for p in papers]; task.save(state); report(task, state)
    print(json.dumps({"task": str(task.root), "stage": state["stage"], "paper_count": len(papers)}, ensure_ascii=False, indent=2))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="ZeroWall title-driven literature trail")
    sub = parser.add_subparsers(dest="command", required=True)
    analyze = sub.add_parser("analyze"); analyze.add_argument("input"); analyze.add_argument("--output", type=Path, required=True); analyze.add_argument("--directions", default="references,cited-by"); analyze.add_argument("--max-papers", type=int); analyze.add_argument("--download-pdfs", action="store_true"); analyze.add_argument("--include-target", action="store_true"); analyze.add_argument("--allow-tsg", action="store_true"); analyze.add_argument("--timeout", type=float, default=30)
    resume = sub.add_parser("resume"); resume.add_argument("task", type=Path); resume.add_argument("--allow-tsg", action="store_true"); resume.add_argument("--timeout", type=float, default=30)
    export = sub.add_parser("export"); export.add_argument("task", type=Path)
    args = parser.parse_args(argv)
    if args.command == "analyze": return run_analyze(args)
    if args.command == "resume": return run_resume(args)
    task = Task(args.task); state = task.load(); report(task, state); print(str(task.root)); return 0


if __name__ == "__main__":
    raise SystemExit(main())
