"""CLI client for searching and retrieving authorized TSG Yun library articles."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
import base64
import secrets
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urljoin, urlparse

import requests
from Crypto.Cipher import AES


SEARCH_URL = "https://pm.yuntsg.com/api/search/search"
APPLY_URL = "https://pm.yuntsg.com/api/cases/add"
CASES_URL = "https://user.tsgyun.com/cases/v2/getUserCasesList"
VIEWER_URL = "https://fulltext.yuntsg.com/pdfviewer"
ATTACH_PREFIX = "https://attach.pubtsg.com/attach/"

# The pm.yuntsg.com search backend only honours the page sizes offered by the
# web client's own dropdown. Any other value is answered with HTTP 200,
# code=0, msg="success" and an EMPTY list -- a silent failure that is easily
# mistaken for "no matches" or "broken authentication". Reject unsupported
# values locally instead of reporting a bogus zero-result search.
ALLOWED_PAGE_SIZES = (10, 20, 50)
DEFAULT_PAGE_SIZE = 20


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_name(value: str, limit: int = 120) -> str:
    value = re.sub(r"[<>:\"/\\|?*\x00-\x1f]", "_", value).strip(" .")
    return (value or "article")[:limit]


@dataclass
class Article:
    pmid: str
    title: str
    authorls: str = ""
    source: str = ""
    doi: str = ""
    jid: str = ""
    caseFlag: int = 0
    raw: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_api(cls, item: dict[str, Any]) -> "Article":
        return cls(
            pmid=str(item.get("pmid", "")), title=str(item.get("title", "")),
            authorls=str(item.get("authorls", "")), source=str(item.get("source", "")),
            doi=str(item.get("doi", "")), jid=str(item.get("jid", "")),
            caseFlag=int(item.get("caseFlag", 0) or 0), raw=item,
        )

    def apply_payload(self) -> dict[str, Any]:
        # The web client submits these fields; retaining raw data makes this
        # compatible with server-side fields that are added later.
        payload = dict(self.raw)
        payload.update({"title": self.title, "author": self.authorls,
                        "sourcefrom": self.source, "doi": self.doi,
                        "pmid": self.pmid, "jid": self.jid,
                        "pmidNcNlmId": self.jid, "sourcecode": "pm", "web": 1, "url": ""})
        payload.pop("author", None)
        payload["authorls"] = self.authorls
        return payload


@dataclass
class Case:
    pmid: str
    title: str
    status: int | None = None
    case_id: str = ""
    pdf_url: str = ""
    updated_at: str = ""

    @classmethod
    def from_api(cls, item: dict[str, Any]) -> "Case":
        return cls(str(item.get("pmid", "")), str(item.get("title", "")),
                   item.get("status"), str(item.get("caseId", "")),
                   str(item.get("pdfUrl", "") or ""), utc_now())


class State:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.search_file = root / "search.json"
        self.cases_file = root / "cases.json"
        self.download_dir = root / "downloads"
        self.download_dir.mkdir(exist_ok=True)

    def read(self, path: Path, default: Any) -> Any:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return default

    def write(self, path: Path, value: Any) -> None:
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")

    def articles(self) -> dict[str, dict[str, Any]]:
        return {str(x["pmid"]): x for x in self.read(self.search_file, []) if x.get("pmid")}

    def cases(self) -> dict[str, dict[str, Any]]:
        return {str(x["pmid"]): x for x in self.read(self.cases_file, []) if x.get("pmid")}


class TSGClient:
    def __init__(self, pm_jsessionid: str, user_sessionid: str,
                 sguser: str, tsguser: str, timeout: float = 30):
        values = {
            "TSG_PM_JSESSIONID": pm_jsessionid,
            "TSG_SESSIONID": user_sessionid,
            "TSG_SGUSER": sguser,
            "TSG_TSGUSER": tsguser,
        }
        missing = [name for name, value in values.items() if not value]
        if missing:
            raise ValueError(f"missing required TSG cookies: {', '.join(missing)}")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({"Accept": "application/json, text/javascript, */*; q=0.01",
                                      "X-Requested-With": "XMLHttpRequest",
                                      "User-Agent": "tsg-literature-cli/1.0"})
        self.sguser = sguser
        self.tsguser = tsguser
        # The web API accepts the same JWT values both as their browser cookie
        # and as its legacy `token` header; no additional token is configured.
        self.session.headers["token"] = sguser
        # These are the four browser cookies exported from the two TSG hosts.
        # Keep each cookie domain-scoped so credentials are never sent to the
        # wrong service.
        self.session.cookies.set("JSESSIONID", pm_jsessionid, domain="pm.yuntsg.com", path="/")
        self.session.cookies.set("sguser", sguser, domain=".yuntsg.com", path="/")
        self.session.cookies.set("SESSIONID", user_sessionid, domain="user.tsgyun.com", path="/")
        self.session.cookies.set("tsguser", tsguser, domain=".tsgyun.com", path="/")

    def _json(self, response: requests.Response) -> dict[str, Any]:
        if response.status_code in (401, 403):
            raise RuntimeError(f"authentication failed (HTTP {response.status_code}); refresh token/cookie")
        response.raise_for_status()
        data = response.json()
        if isinstance(data, dict) and data.get("code") not in (None, 0):
            raise RuntimeError(str(data.get("msg") or data))
        return data

    def search(self, term: str, page: int = 1,
               size: int = DEFAULT_PAGE_SIZE) -> tuple[list[Article], str]:
        if size not in ALLOWED_PAGE_SIZES:
            supported = ", ".join(str(x) for x in ALLOWED_PAGE_SIZES)
            raise ValueError(
                f"size={size} is not supported by the TSG search backend; "
                f"use one of {supported}. Other values return a silent empty "
                f"result set that looks like a search with no matches."
            )
        body = {"term": term, "sort": "", "sortOrder": "", "format": "", "filter": "",
                "impactIf": "", "impact": "", "sjr": "", "fenqu": "", "total": "",
                "alt": "", "jabbr": "", "size": str(size), "page": str(page), "num": "",
                "order": "1", "exclude": "0", "reKey": "", "pmidListIndex": "",
                "pmidListKey": "", "linkname": ""}
        data = self._json(self.session.post(SEARCH_URL, data=body, timeout=self.timeout))
        return [Article.from_api(x) for x in data.get("data", {}).get("list", [])], str(data.get("data", {}).get("rekey", ""))

    def apply(self, articles: Iterable[Article]) -> list[Case]:
        items = list(articles)
        if not items:
            return []
        if len(items) > 20:
            raise ValueError("the service allows at most 20 applications per request")
        data = self._json(self.session.post(APPLY_URL, json=[a.apply_payload() for a in items], timeout=self.timeout))
        result = data.get("data") or {}
        case_id = str(result.get("casesId", ""))
        pdf_url = str(result.get("pdfUrl", "") or "")
        return [Case(a.pmid, a.title, 2 if pdf_url else 1, case_id, pdf_url, utc_now()) for a in items]

    def cases(self, page: int = 1, size: int = 100) -> list[Case]:
        old_token = self.session.headers.get("token")
        self.session.headers["token"] = self.tsguser
        try:
            response = self.session.get(CASES_URL, params={"giveup": "", "page": page, "size": size,
                                                           "typeid": "", "cyear": ""}, timeout=self.timeout)
        finally:
            self.session.headers["token"] = old_token
        data = self._json(response)
        return [Case.from_api(x) for x in data.get("data", {}).get("list", [])]

    def viewer_pdf_url(self, case: Case) -> str:
        parsed = urlparse(case.pdf_url)
        if case.pdf_url and parsed.scheme in ("http", "https") and parsed.netloc and parsed.path not in ("", "/"):
            return case.pdf_url
        url = f"{VIEWER_URL}?casesid={case.case_id}&type=user&token={self.tsguser}"
        html = self.session.get(url, timeout=self.timeout).text
        def element(name: str) -> str:
            match = re.search(rf'<[^>]+id=["\']{name}["\'][^>]*>(.*?)</[^>]+>', html, re.I | re.S)
            return re.sub(r"<.*?>", "", match.group(1)).strip() if match else ""
        source = element("str")
        key_hex = element("keyHex")
        file_name = element("fileName")
        query = element("query")
        if source and key_hex and file_name and query:
            iv_text = "".join(secrets.choice("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") for _ in range(16))
            pad = 16 - (len(source.encode("utf-8")) % 16)
            plaintext = source.encode("utf-8") + bytes([pad]) * pad
            cipher = AES.new(bytes.fromhex(key_hex), AES.MODE_CBC, iv_text.encode("utf-8"))
            cipher_token = base64.urlsafe_b64encode(cipher.encrypt(plaintext)).decode().rstrip("=")
            return f"{ATTACH_PREFIX}{file_name}?query={query}&iv={iv_text}&token={cipher_token}&view=false&type=.pdf"
        patterns = [r'https://attach\.pubtsg\.com/attach/[^"\']+', r'data-href=["\']([^"\']+\.pdf[^"\']*)']
        for pattern in patterns:
            match = re.search(pattern, html, re.I)
            if match:
                return match.group(1) if match.lastindex else match.group(0)
        raise RuntimeError(f"no PDF URL found for case {case.case_id}")

    def download(self, url: str, target: Path) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        with self.session.get(url, stream=True, timeout=self.timeout) as response:
            response.raise_for_status()
            with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as tmp:
                temp = Path(tmp.name)
                first = b""
                for chunk in response.iter_content(1024 * 128):
                    if chunk:
                        if not first:
                            first = chunk[:5]
                        tmp.write(chunk)
        if first != b"%PDF-" or temp.stat().st_size == 0:
            temp.unlink(missing_ok=True)
            raise RuntimeError("downloaded content is not a valid PDF")
        temp.replace(target)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Authorized TSG Yun literature search and download CLI")
    p.add_argument("--state-dir", type=Path, default=Path(".tsg-state"))
    p.add_argument("--pm-jsessionid", default=os.getenv("TSG_PM_JSESSIONID"), help="JSESSIONID for pm.yuntsg.com")
    p.add_argument("--user-sessionid", default=os.getenv("TSG_SESSIONID"), help="SESSIONID for user.tsgyun.com")
    p.add_argument("--sguser", default=os.getenv("TSG_SGUSER"), help="sguser cookie for .yuntsg.com")
    p.add_argument("--tsguser", default=os.getenv("TSG_TSGUSER"), help="tsguser cookie for .tsgyun.com")
    sub = p.add_subparsers(dest="command", required=True)
    s = sub.add_parser("search"); s.add_argument("term"); s.add_argument("--page", type=int, default=1); s.add_argument("--size", type=int, default=DEFAULT_PAGE_SIZE, choices=ALLOWED_PAGE_SIZES, help="results per page; the TSG backend only supports %s" % ", ".join(str(x) for x in ALLOWED_PAGE_SIZES))
    r = sub.add_parser("request"); r.add_argument("pmids", nargs="+")
    w = sub.add_parser("watch"); w.add_argument("--interval", type=float, default=30); w.add_argument("--timeout", type=float, default=3600)
    d = sub.add_parser("download"); d.add_argument("pmids", nargs="*")
    run = sub.add_parser("run"); run.add_argument("term"); run.add_argument("--interval", type=float, default=30); run.add_argument("--timeout", type=float, default=3600)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    state = State(args.state_dir)
    client = TSGClient(args.pm_jsessionid, args.user_sessionid, args.sguser, args.tsguser)
    articles = state.articles(); cases = state.cases()
    if args.command in ("search", "run"):
        found, rekey = client.search(args.term, getattr(args, "page", 1), getattr(args, "size", 20))
        state.write(state.search_file, [asdict(x) for x in found])
        for i, article in enumerate(found, 1): print(f"{i:>3}  {article.pmid}  {article.title}")
        print(f"saved {len(found)} results; rekey={rekey}")
        if args.command == "search": return 0
        selected = input("PMIDs to request (comma separated, blank cancels): ").strip()
        if not selected: return 0
        args.pmids = [x.strip() for x in selected.split(",") if x.strip()]
    if args.command in ("request", "run"):
        selected = [articles[x] for x in args.pmids if x in articles and x not in cases]
        for start in range(0, len(selected), 20):
            for case in client.apply([Article(**{k: v for k, v in selected[i].items() if k in Article.__dataclass_fields__}) for i in range(start, min(start + 20, len(selected)))]):
                cases[case.pmid] = asdict(case)
        state.write(state.cases_file, list(cases.values())); print(f"submitted {len(selected)} article(s)")
        if args.command == "request": return 0
    if args.command in ("watch", "run"):
        deadline = time.monotonic() + args.timeout
        while True:
            for case in client.cases():
                if case.pmid in cases: cases[case.pmid] = asdict(case)
            state.write(state.cases_file, list(cases.values()))
            pending = [x for x in cases.values() if x.get("status") == 1]
            print(f"pending={len(pending)} ready={sum(x.get('status') == 2 for x in cases.values())}")
            if not pending or time.monotonic() >= deadline: break
            time.sleep(args.interval)
    if args.command in ("download", "run"):
        wanted = set(getattr(args, "pmids", []) or cases.keys())
        for raw in cases.values():
            if raw["pmid"] not in wanted or raw.get("status") != 2: continue
            case = Case(**{k: raw[k] for k in ("pmid", "title", "status", "case_id", "pdf_url", "updated_at")})
            target = state.download_dir / f"{case.pmid}-{safe_name(case.title)}.pdf"
            if target.exists(): print(f"exists {target}"); continue
            client.download(client.viewer_pdf_url(case), target); print(f"downloaded {target}")
    return 0


if __name__ == "__main__":
    try: raise SystemExit(main())
    except (requests.RequestException, RuntimeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr); raise SystemExit(2)
