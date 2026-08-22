"""Citation apparatus consistency gate.

Checks (stdlib only, no network):
  undefined  - in-text citation key with no bibliography entry
  uncited    - bibliography entry nothing cites
  duplicate  - same key twice, or same DOI/title under different keys
  fields     - entry missing a field its type requires
  identifier - malformed DOI / arXiv id / ISBN
  style      - pandoc [@key] and LaTeX \\cite{key} mixed in one document

Usage:
  python citation_check.py [files or dirs...]   # defaults to the current directory

Output: one ```review fenced JSON block on stdout. This is an offline,
file-level check: it never verifies that a cited work exists, that its metadata
is right, or that it supports the claim citing it.
"""

from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass, field

NOTE = (
    "Offline consistency check of citation keys, bibliography entries, and "
    "identifier syntax. It does not verify that any cited work exists, that its "
    "metadata is correct, or that it supports the claim citing it."
)

_SKIP = {"node_modules", "__pycache__", ".git", ".zerowall", ".venv", "venv"}
TEXT_EXT = {".md", ".markdown", ".tex", ".bib", ".ipynb", ".rmd", ".qmd"}

# Pandoc: [@key], [-@key; @other], bare @key. Keys allow letters, digits, : - _ .
PANDOC = re.compile(r"(?<![\w@])-?@([A-Za-z][\w:.#$%&+?<>~/-]*)")
LATEX = re.compile(r"\\(?:cite|citep|citet|citeauthor|citeyear|parencite|autocite|footcite|textcite)"
                   r"(?:\[[^\]]*\])*\{([^}]*)\}")
# Numeric reference-list lines: "[1] Author..." or "1. Author..."
NUMBERED = re.compile(r"^\s*(?:\[(\d{1,3})\]|(\d{1,3})\.)\s+\S")
REF_HEADING = re.compile(r"^\s{0,3}(?:#+\s*)?(references|bibliography|works cited)\s*:?\s*$", re.I)
# Numeric in-text citations: [1], [2,3], [4-6]
NUMERIC_CITE = re.compile(r"\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\]")

BIB_ENTRY = re.compile(r"@(\w+)\s*\{\s*([^,\s}]+)\s*,", re.M)
DOI_OK = re.compile(r"^10\.\d{4,9}/\S+$")
ARXIV_OK = re.compile(r"^(?:\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?/\d{7}(?:v\d+)?)$", re.I)

REQUIRED = {
    "article": ("author", "title", "journal", "year"),
    "inproceedings": ("author", "title", "booktitle", "year"),
    "book": ("author", "title", "year"),
    "phdthesis": ("author", "title", "school", "year"),
    "techreport": ("author", "title", "institution", "year"),
}
# `year` may be spelled `date` in biblatex; treat them as one field.
ALIASES = {"date": "year", "journaltitle": "journal", "editor": "author"}


@dataclass
class Finding:
    level: str
    tag: str
    title: str
    evidence: str


@dataclass
class Entry:
    key: str
    kind: str
    fields: dict[str, str]
    source: str
    line: int


@dataclass
class Doc:
    path: str
    text: str
    kind: str  # md | tex | bib | ipynb
    pandoc: set[str] = field(default_factory=set)
    latex: set[str] = field(default_factory=set)
    numeric: set[int] = field(default_factory=set)
    listed: set[int] = field(default_factory=set)


def _read(path: str) -> str:
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return ""


def _notebook_markdown(text: str) -> str:
    try:
        nb = json.loads(text)
    except (ValueError, TypeError):
        return ""
    out: list[str] = []
    for cell in nb.get("cells", []):
        if cell.get("cell_type") == "markdown":
            src = cell.get("source", "")
            out.append("".join(src) if isinstance(src, list) else str(src))
    return "\n".join(out)


def _slash(path: str) -> str:
    """Forward slashes and no leading `./`, so evidence reads the same everywhere."""
    out = path.replace(os.sep, "/")
    return out[2:] if out.startswith("./") else out


def discover(paths: list[str]) -> list[str]:
    if not paths:
        paths = ["."]
    out: list[str] = []
    for p in paths:
        if os.path.isfile(p):
            out.append(_slash(p))
            continue
        for base, subdirs, names in os.walk(p):
            subdirs[:] = [d for d in subdirs if d not in _SKIP and not d.startswith(".")]
            for name in names:
                if os.path.splitext(name)[1].lower() in TEXT_EXT:
                    out.append(_slash(os.path.join(base, name)))
    return sorted(set(out))


def _line_of(text: str, idx: int) -> int:
    return text.count("\n", 0, max(idx, 0)) + 1


def load(path: str) -> Doc:
    raw = _read(path)
    ext = os.path.splitext(path)[1].lower()
    if ext == ".ipynb":
        return Doc(path=path, text=_notebook_markdown(raw), kind="ipynb")
    if ext == ".bib":
        return Doc(path=path, text=raw, kind="bib")
    return Doc(path=path, text=raw, kind="tex" if ext == ".tex" else "md")


def parse_bib(doc: Doc) -> list[Entry]:
    """Split a .bib into entries by scanning brace depth from each @type{key,."""
    entries: list[Entry] = []
    text = doc.text
    for m in BIB_ENTRY.finditer(text):
        kind, key = m.group(1).lower(), m.group(2)
        if kind in {"comment", "preamble", "string"}:
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
            name = ALIASES.get(fm.group(1).lower(), fm.group(1).lower())
            fields.setdefault(name, " ".join(fm.group(2).split()))
        entries.append(
            Entry(key=key, kind=kind, fields=fields, source=doc.path, line=_line_of(text, m.start()))
        )
    return entries


def scan_citations(doc: Doc) -> None:
    if doc.kind == "bib":
        return
    if doc.kind == "tex":
        for m in LATEX.finditer(doc.text):
            doc.latex.update(k.strip() for k in m.group(1).split(",") if k.strip())
    # Pandoc syntax appears in .md and, via \cite, sometimes in .md too.
    for m in PANDOC.finditer(doc.text):
        doc.pandoc.add(m.group(1).rstrip(".,;:"))
    if doc.kind != "tex":
        for m in LATEX.finditer(doc.text):
            doc.latex.update(k.strip() for k in m.group(1).split(",") if k.strip())

    # Numeric citations + a plain-text reference list.
    in_refs = False
    for line in doc.text.splitlines():
        if REF_HEADING.match(line):
            in_refs = True
            continue
        if in_refs:
            m = NUMBERED.match(line)
            if m:
                doc.listed.add(int(m.group(1) or m.group(2)))
                continue
            if line.strip().startswith("#"):
                in_refs = False
        else:
            for m in NUMERIC_CITE.finditer(line):
                for part in re.split(r"[,–-]", m.group(1)):
                    part = part.strip()
                    if part.isdigit():
                        doc.numeric.add(int(part))


def check_undefined(docs: list[Doc], keys: set[str]) -> list[Finding]:
    found: list[Finding] = []
    for doc in docs:
        cited = doc.pandoc | doc.latex
        missing = sorted(k for k in cited if k not in keys)
        if missing and keys:
            found.append(
                Finding(
                    "error",
                    "cite · undefined",
                    f"{len(missing)} citation key(s) with no bibliography entry",
                    f"{doc.path}: " + ", ".join(missing[:8]) + ("…" if len(missing) > 8 else "")
                    + " - these render as an unresolved marker.",
                )
            )
        elif cited and not keys:
            found.append(
                Finding(
                    "error",
                    "cite · undefined",
                    f"{len(cited)} citation key(s) but no bibliography",
                    f"{doc.path} cites {', '.join(sorted(cited)[:6])} and no .bib entry or "
                    "reference list was found anywhere in the scanned files.",
                )
            )
        dangling = sorted(n for n in doc.numeric if doc.listed and n not in doc.listed)
        if dangling:
            found.append(
                Finding(
                    "error",
                    "cite · undefined",
                    f"{len(dangling)} numeric citation(s) past the end of the reference list",
                    f"{doc.path} cites [{', '.join(str(n) for n in dangling[:8])}] but the list "
                    f"stops at {max(doc.listed)}.",
                )
            )
    return found


def check_uncited(docs: list[Doc], entries: list[Entry]) -> list[Finding]:
    cited: set[str] = set()
    for doc in docs:
        cited |= doc.pandoc | doc.latex
    if not cited:
        return []
    orphans = sorted({e.key for e in entries} - cited)
    if not orphans:
        return []
    return [
        Finding(
            "warn",
            "cite · uncited",
            f"{len(orphans)} bibliography entry nothing cites",
            ", ".join(orphans[:8]) + ("…" if len(orphans) > 8 else "")
            + " - fine in a reference library, noise in a submission.",
        )
    ]


def check_duplicates(entries: list[Entry]) -> list[Finding]:
    found: list[Finding] = []
    by_key: dict[str, list[Entry]] = {}
    for e in entries:
        by_key.setdefault(e.key, []).append(e)
    for key, group in sorted(by_key.items()):
        if len(group) > 1:
            found.append(
                Finding(
                    "error",
                    "cite · duplicate",
                    f"Key {key!r} defined {len(group)} times",
                    "; ".join(f"{e.source}:{e.line}" for e in group)
                    + " - which entry wins depends on the tool.",
                )
            )

    for label, getter in (("DOI", lambda e: e.fields.get("doi", "").lower()),
                          ("title", lambda e: re.sub(r"\W+", "", e.fields.get("title", "")).lower())):
        seen: dict[str, str] = {}
        for e in entries:
            value = getter(e)
            if not value or len(value) < 8:
                continue
            if value in seen and seen[value] != e.key:
                found.append(
                    Finding(
                        "warn",
                        "cite · duplicate",
                        f"Same {label} under two keys",
                        f"{seen[value]} and {e.key} share the {label} {value[:60]!r} "
                        "- the same work will appear twice in the reference list.",
                    )
                )
            else:
                seen[value] = e.key
    return found


def check_fields(entries: list[Entry]) -> list[Finding]:
    found: list[Finding] = []
    for e in entries:
        required = REQUIRED.get(e.kind, ("author", "title", "year"))
        missing = [f for f in required if not e.fields.get(f)]
        if missing:
            found.append(
                Finding(
                    "warn",
                    "cite · fields",
                    f"{e.key}: @{e.kind} missing {', '.join(missing)}",
                    f"{e.source}:{e.line} - the formatted reference will be incomplete.",
                )
            )
    return found


def check_identifiers(entries: list[Entry]) -> list[Finding]:
    found: list[Finding] = []
    for e in entries:
        doi = e.fields.get("doi", "").strip()
        if doi:
            bare = re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:)", "", doi, flags=re.I)
            if not DOI_OK.match(bare):
                found.append(
                    Finding(
                        "error",
                        "cite · identifier",
                        f"{e.key}: DOI is not well-formed",
                        f"{doi!r} at {e.source}:{e.line} - a DOI is 10.<registrant>/<suffix>.",
                    )
                )
        arxiv = (e.fields.get("eprint") or e.fields.get("archiveprefix") or "").strip()
        if arxiv and arxiv.lower() != "arxiv" and not ARXIV_OK.match(arxiv.replace("arXiv:", "")):
            found.append(
                Finding(
                    "warn",
                    "cite · identifier",
                    f"{e.key}: arXiv id is not well-formed",
                    f"{arxiv!r} at {e.source}:{e.line} - expected 2401.01234 or math.GT/0309136.",
                )
            )
        isbn = e.fields.get("isbn", "").strip()
        if isbn:
            digits = re.sub(r"[^0-9Xx]", "", isbn)
            if len(digits) not in (10, 13):
                found.append(
                    Finding(
                        "warn",
                        "cite · identifier",
                        f"{e.key}: ISBN has {len(digits)} digits",
                        f"{isbn!r} at {e.source}:{e.line} - an ISBN has 10 or 13.",
                    )
                )
    return found


def check_style(docs: list[Doc]) -> list[Finding]:
    found: list[Finding] = []
    for doc in docs:
        if doc.kind in {"md", "ipynb"} and doc.pandoc and doc.latex:
            found.append(
                Finding(
                    "warn",
                    "cite · style",
                    "Pandoc and LaTeX citation syntax mixed",
                    f"{doc.path} uses both [@{sorted(doc.pandoc)[0]}] and "
                    f"\\cite{{{sorted(doc.latex)[0]}}} - one of the two will render literally.",
                )
            )
    return found


def run(paths: list[str]) -> dict:
    docs = [load(p) for p in discover(paths)]
    if not docs:
        return {
            "findings": [
                {
                    "level": "warn",
                    "check": "citation",
                    "tag": "cite · input",
                    "title": "No document to check",
                    "evidence": "Found no .md/.tex/.bib/.ipynb file in the given paths.",
                }
            ],
            "note": NOTE,
        }

    entries: list[Entry] = []
    for doc in docs:
        if doc.kind == "bib":
            entries += parse_bib(doc)
        else:
            scan_citations(doc)

    keys = {e.key for e in entries}
    findings: list[Finding] = []
    findings += check_undefined(docs, keys)
    findings += check_uncited(docs, entries)
    findings += check_duplicates(entries)
    findings += check_fields(entries)
    findings += check_identifiers(entries)
    findings += check_style(docs)

    return {
        "findings": [
            {
                "level": f.level,
                "check": "citation",
                "tag": f.tag,
                "title": f.title,
                "evidence": f.evidence,
            }
            for f in findings
        ],
        "note": NOTE,
    }


def main(argv: list[str]) -> int:
    print("```review")
    print(json.dumps(run(argv[1:]), ensure_ascii=False))
    print("```")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
