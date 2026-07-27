"""Bibliometrics over a literature corpus file (BibTeX / CSV / JSON).

Reports, in this order:
  coverage   - how many records carry each field (printed first, always)
  by year    - counts, sparkline, compound growth across the covered window
  venues     - top journals / booktitles
  authors    - top authors, normalized to surname + initial
  keywords   - top keywords after stopword removal
  clusters   - connected components over keyword pairs co-occurring >= min-pair
  duplicates - records sharing a DOI or a normalized title

Usage:
  python bibliometrics.py CORPUS [more...] [--top N] [--since Y] [--until Y]
                          [--min-pair N] [--json] [--csv DIR]

Stdlib only, no network. Counts describe the corpus file, not the field: a
corpus is whatever a search returned.
"""

from __future__ import annotations

import csv
import json
import os
import re
import sys
from collections import Counter
from dataclasses import dataclass, field

BIB_ENTRY = re.compile(r"@(\w+)\s*\{\s*([^,\s}]+)\s*,", re.M)
YEAR_IN = re.compile(r"(1[6-9]\d{2}|20\d{2})")
SPARK = "_.-~=+*#"  # ASCII, so the report survives any console encoding

STOP = {
    "the", "a", "an", "and", "or", "of", "for", "in", "on", "with", "to", "from", "by",
    "using", "based", "via", "study", "studies", "analysis", "research", "new", "novel",
    "approach", "approaches", "method", "methods", "review", "paper", "results", "data",
    "case", "effect", "effects", "role", "toward", "towards", "into", "at", "as", "is",
    "are", "its", "their", "this", "that", "we", "our",
}

FIELD_ALIASES = {
    "year": ("year", "date", "publication_year", "pub_year", "published"),
    "venue": ("journal", "journaltitle", "venue", "source", "publication", "booktitle",
              "container-title", "journal_name"),
    "authors": ("author", "authors", "creator", "creators"),
    "keywords": ("keywords", "keyword", "terms", "index_terms", "subject", "tags"),
    "title": ("title",),
    "doi": ("doi",),
}


@dataclass
class Record:
    year: int | None = None
    venue: str = ""
    authors: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    title: str = ""
    doi: str = ""
    source: str = ""


# ---------------------------------------------------------------- parsing


def _read(path: str) -> str:
    try:
        with open(path, encoding="utf-8-sig", errors="replace") as fh:
            return fh.read()
    except OSError as exc:
        print(f"cannot read {path}: {exc}", file=sys.stderr)
        return ""


def _split_authors(raw: str) -> list[str]:
    if not raw:
        return []
    parts = re.split(r"\s+and\s+|;|\|", raw) if (" and " in raw or ";" in raw or "|" in raw) else [raw]
    return [p.strip() for p in parts if p.strip()]


def _split_keywords(raw: str) -> list[str]:
    return [k.strip().lower() for k in re.split(r"[;,|]", raw or "") if k.strip()]


def _year(raw: object) -> int | None:
    m = YEAR_IN.search(str(raw or ""))
    return int(m.group(1)) if m else None


def parse_bib(text: str, source: str) -> list[Record]:
    out: list[Record] = []
    for m in BIB_ENTRY.finditer(text):
        if m.group(1).lower() in {"comment", "preamble", "string"}:
            continue
        depth, i = 1, m.end()
        while i < len(text) and depth > 0:
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
            i += 1
        body = text[m.end() : i - 1]
        fields: dict[str, str] = {}
        for fm in re.finditer(r"(\w+)\s*=\s*[{\"]?(.*?)[}\"]?\s*(?:,\s*(?=\w+\s*=)|$)", body, re.S):
            fields.setdefault(fm.group(1).lower(), " ".join(fm.group(2).split()))
        out.append(
            Record(
                year=_year(fields.get("year") or fields.get("date")),
                venue=fields.get("journal") or fields.get("journaltitle") or fields.get("booktitle", ""),
                authors=_split_authors(fields.get("author", "")),
                keywords=_split_keywords(fields.get("keywords", "")),
                title=fields.get("title", ""),
                doi=fields.get("doi", "").strip().lower(),
                source=source,
            )
        )
    return out


def _pick(row: dict, key: str) -> str:
    lowered = {str(k).strip().lower(): v for k, v in row.items() if k}
    for alias in FIELD_ALIASES[key]:
        value = lowered.get(alias)
        if value not in (None, ""):
            if isinstance(value, list):
                return "; ".join(str(v) for v in value if v)
            if isinstance(value, dict):  # Crossref-style {"name": …}
                return str(value.get("name") or value.get("title") or "")
            return str(value)
    return ""


def from_row(row: dict, source: str) -> Record:
    return Record(
        year=_year(_pick(row, "year")),
        venue=_pick(row, "venue").strip(),
        authors=_split_authors(_pick(row, "authors")),
        keywords=_split_keywords(_pick(row, "keywords")),
        title=_pick(row, "title").strip(),
        doi=_pick(row, "doi").strip().lower(),
        source=source,
    )


def parse_csv(text: str, source: str) -> list[Record]:
    rows = list(csv.DictReader(text.splitlines()))
    return [from_row(r, source) for r in rows]


def parse_json(text: str, source: str) -> list[Record]:
    try:
        blob = json.loads(text)
    except ValueError:
        rows = []
        for line in text.splitlines():  # .jsonl
            line = line.strip()
            if line:
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    continue
        blob = rows
    if isinstance(blob, dict):
        for key in ("papers", "results", "data", "items", "records"):
            if isinstance(blob.get(key), list):
                blob = blob[key]
                break
        else:
            blob = [blob]
    return [from_row(r, source) for r in blob if isinstance(r, dict)]


def load(paths: list[str]) -> list[Record]:
    out: list[Record] = []
    for path in paths:
        text = _read(path)
        if not text:
            continue
        ext = os.path.splitext(path)[1].lower()
        name = os.path.basename(path)
        if ext == ".bib":
            out += parse_bib(text, name)
        elif ext == ".csv":
            out += parse_csv(text, name)
        else:
            out += parse_json(text, name)
    return out


# ---------------------------------------------------------------- analysis


def norm_author(raw: str) -> str:
    """`Smith, John A.` and `John A. Smith` both -> `Smith J`."""
    raw = re.sub(r"\{|\}", "", raw).strip()
    if "," in raw:
        surname, rest = raw.split(",", 1)
    else:
        bits = raw.split()
        surname, rest = (bits[-1], " ".join(bits[:-1])) if len(bits) > 1 else (raw, "")
    initial = next((c for c in rest if c.isalpha()), "")
    return f"{surname.strip().title()} {initial.upper()}".strip()


def norm_title(raw: str) -> str:
    return re.sub(r"\W+", "", raw).lower()


def keyword_terms(rec: Record) -> list[str]:
    """Declared keywords when present, else content words from the title."""
    if rec.keywords:
        return [k for k in rec.keywords if k not in STOP and len(k) > 2]
    words = re.findall(r"[A-Za-z][A-Za-z-]{2,}", rec.title.lower())
    return [w for w in words if w not in STOP]


def sparkline(counts: list[int]) -> str:
    if not counts:
        return ""
    hi = max(counts) or 1
    return "".join(SPARK[min(len(SPARK) - 1, round(c / hi * (len(SPARK) - 1)))] for c in counts)


def cluster(pairs: Counter, min_pair: int) -> list[list[str]]:
    """Connected components over keyword pairs seen >= min_pair times."""
    adj: dict[str, set[str]] = {}
    for (a, b), n in pairs.items():
        if n < min_pair:
            continue
        adj.setdefault(a, set()).add(b)
        adj.setdefault(b, set()).add(a)
    seen: set[str] = set()
    groups: list[list[str]] = []
    for node in sorted(adj):
        if node in seen:
            continue
        stack, comp = [node], []
        while stack:
            cur = stack.pop()
            if cur in seen:
                continue
            seen.add(cur)
            comp.append(cur)
            stack.extend(adj[cur] - seen)
        if len(comp) > 1:
            groups.append(sorted(comp))
    return sorted(groups, key=len, reverse=True)


def analyze(records: list[Record], top: int, min_pair: int) -> dict:
    total = len(records)
    coverage = {
        "year": sum(1 for r in records if r.year),
        "venue": sum(1 for r in records if r.venue),
        "authors": sum(1 for r in records if r.authors),
        "keywords": sum(1 for r in records if r.keywords),
        "doi": sum(1 for r in records if r.doi),
    }

    dup_doi: Counter = Counter(r.doi for r in records if r.doi)
    dup_title: Counter = Counter(norm_title(r.title) for r in records if r.title)
    duplicates = (
        sum(n - 1 for n in dup_doi.values() if n > 1)
        + sum(n - 1 for k, n in dup_title.items() if n > 1 and len(k) > 12)
    )

    years = Counter(r.year for r in records if r.year)
    span = sorted(years)
    by_year = [{"year": y, "count": years.get(y, 0)} for y in range(span[0], span[-1] + 1)] if span else []

    growth = None
    if len(by_year) >= 2 and by_year[0]["count"] > 0:
        first, last = by_year[0]["count"], by_year[-1]["count"]
        periods = len(by_year) - 1
        if last > 0:
            growth = round(((last / first) ** (1 / periods) - 1) * 100, 1)

    pairs: Counter = Counter()
    kw_counts: Counter = Counter()
    for rec in records:
        terms = sorted(set(keyword_terms(rec)))
        kw_counts.update(terms)
        for i, a in enumerate(terms):
            for b in terms[i + 1 :]:
                pairs[(a, b)] += 1

    return {
        "records": total,
        "sources": sorted({r.source for r in records}),
        "coverage": coverage,
        "duplicates": duplicates,
        "years": {"from": span[0], "to": span[-1]} if span else None,
        "by_year": by_year,
        "growth_pct_per_year": growth,
        "venues": Counter(r.venue for r in records if r.venue).most_common(top),
        "authors": Counter(
            norm_author(a) for r in records for a in r.authors if a
        ).most_common(top),
        "keywords": kw_counts.most_common(top),
        "keyword_source": "declared keywords where present, title words otherwise",
        "clusters": cluster(pairs, min_pair)[:top],
        "min_pair": min_pair,
    }


# ---------------------------------------------------------------- reporting


def _pct(n: int, total: int) -> str:
    return f"{n}/{total} ({round(100 * n / total) if total else 0}%)"


def report(res: dict, top: int) -> str:
    total = res["records"]
    out: list[str] = ["# Bibliometric summary", ""]
    out.append(f"- Records: **{total}** from {', '.join(res['sources']) or 'unknown source'}")
    if res["years"]:
        out.append(f"- Year window: **{res['years']['from']}-{res['years']['to']}**")
    if res["duplicates"]:
        out.append(f"- Probable duplicates (same DOI or title): **{res['duplicates']}**")
    out += ["", "## Coverage", "",
            "Every ranking below is over the records that carry the field, "
            "not over the whole corpus.", "",
            "| Field | Records with a value |", "| --- | --- |"]
    for name, n in res["coverage"].items():
        out.append(f"| {name} | {_pct(n, total)} |")

    if res["by_year"]:
        counts = [row["count"] for row in res["by_year"]]
        out += ["", "## Publications per year", "", "```", sparkline(counts), "```", ""]
        out += ["| Year | Count |", "| --- | --- |"]
        out += [f"| {row['year']} | {row['count']} |" for row in res["by_year"]]
        if res["growth_pct_per_year"] is not None:
            out += ["", f"Compound change across the window: **{res['growth_pct_per_year']}%/year** "
                        "(endpoint-to-endpoint; a single unusual year moves it a lot)."]

    for heading, key, label in (
        ("Top venues", "venues", "Venue"),
        ("Top authors", "authors", "Author"),
        ("Top keywords", "keywords", "Keyword"),
    ):
        rows = res[key]
        if not rows:
            continue
        out += ["", f"## {heading}", "", f"| {label} | Records |", "| --- | --- |"]
        out += [f"| {name} | {n} |" for name, n in rows[:top]]

    if res["keywords"]:
        out += ["", f"Keyword source: {res['keyword_source']}."]

    if res["clusters"]:
        out += ["", "## Keyword co-occurrence groups", "",
                f"Connected components over keyword pairs co-occurring at least "
                f"{res['min_pair']} times. A descriptive grouping, **not** a validated "
                "topic model.", ""]
        for i, group in enumerate(res["clusters"], 1):
            out.append(f"{i}. {', '.join(group[:12])}" + ("…" if len(group) > 12 else ""))

    out += ["", "---", "",
            "Counts describe this corpus file. State the query and database that "
            "produced it, or the numbers describe a sample nobody can reconstruct."]
    return "\n".join(out)


def write_csvs(res: dict, out_dir: str) -> list[str]:
    os.makedirs(out_dir, exist_ok=True)
    written: list[str] = []
    tables = {
        "by_year.csv": (("year", "count"), [(r["year"], r["count"]) for r in res["by_year"]]),
        "venues.csv": (("venue", "count"), res["venues"]),
        "authors.csv": (("author", "count"), res["authors"]),
        "keywords.csv": (("keyword", "count"), res["keywords"]),
    }
    for name, (header, rows) in tables.items():
        if not rows:
            continue
        path = os.path.join(out_dir, name)
        with open(path, "w", encoding="utf-8", newline="") as fh:
            writer = csv.writer(fh)
            writer.writerow(header)
            writer.writerows(rows)
        written.append(path)
    return written


def _flag(argv: list[str], name: str, default: str | None = None) -> str | None:
    if name in argv:
        i = argv.index(name)
        if i + 1 < len(argv):
            return argv[i + 1]
    return default


def main(argv: list[str]) -> int:
    args = argv[1:]
    flags = {"--top", "--since", "--until", "--min-pair", "--csv"}
    paths = [
        a
        for i, a in enumerate(args)
        if not a.startswith("--") and (i == 0 or args[i - 1] not in flags)
    ]
    if not paths:
        print(__doc__)
        return 2

    top = int(_flag(args, "--top", "15") or 15)
    min_pair = int(_flag(args, "--min-pair", "3") or 3)
    since = _flag(args, "--since")
    until = _flag(args, "--until")

    records = load(paths)
    if since:
        records = [r for r in records if r.year and r.year >= int(since)]
    if until:
        records = [r for r in records if r.year and r.year <= int(until)]
    if not records:
        print("No records parsed. Expected a .bib, .csv, or .json corpus with "
              "year / venue / author / keyword fields.", file=sys.stderr)
        return 1

    res = analyze(records, top=top, min_pair=min_pair)

    csv_dir = _flag(args, "--csv")
    if csv_dir:
        res["csv_written"] = write_csvs(res, csv_dir)

    if "--json" in args:
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        print(report(res, top))
        if csv_dir:
            print("\nWrote: " + ", ".join(res.get("csv_written", [])))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
