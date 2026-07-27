"""Figure provenance sweep: figure <- script <- data, for every image on disk.

Checks (stdlib only, no network):
  orphan    - image no script writes
  stale     - script or input newer than the figure it produces
  input     - generating script reads a data file that does not exist
  missing   - a document references a figure that is not on disk
  untracked - figure has no .zerowall/provenance.jsonl record
  ok        - full chain resolved and the figure is newest

Usage:
  python figure_provenance.py [dir]      # defaults to the current directory

Output: one ```review fenced JSON block on stdout. A resolved chain says the
figure traces to code and data - not that the figure is scientifically right.
"""

from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass, field

NOTE = (
    "Traced every image to the script that writes it and the data that script "
    "reads. A resolved chain means the figure is regenerable, not that it is "
    "correct - a script can plot the wrong column and still trace perfectly."
)

_SKIP = {"node_modules", "__pycache__", ".git", ".zerowall", ".venv", "venv", ".ipynb_checkpoints"}
FIG_EXT = {".png", ".pdf", ".svg", ".jpg", ".jpeg", ".eps", ".tif", ".tiff"}
CODE_EXT = {".py", ".r", ".jl", ".sh", ".ipynb", ".rmd", ".qmd"}
DOC_EXT = {".md", ".markdown", ".tex", ".ipynb", ".rmd", ".qmd"}
DATA_EXT = {".csv", ".tsv", ".parquet", ".nc", ".json", ".xlsx", ".h5", ".hdf5", ".feather", ".dta", ".sav", ".zarr"}

# A quoted string that ends in a data extension - the script's inputs.
DATA_REF = re.compile(
    r"""["']([^"'\n]*?\.(?:csv|tsv|parquet|nc|json|xlsx|h5|hdf5|feather|dta|sav))["']""",
    re.I,
)
# Figure references inside a document: markdown images, LaTeX includegraphics.
DOC_FIG = re.compile(
    r"""!\[[^\]]*\]\(([^)\s]+)\)|\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}""",
)
# `savefig("...")`, `ggsave("...")`, `write_to("...")` - any call that names the file.
WRITE_HINT = re.compile(r"(savefig|ggsave|saveas|write_image|imsave|savez|to_file|output_file)", re.I)


@dataclass
class Finding:
    level: str
    tag: str
    title: str
    evidence: str


@dataclass
class Chain:
    figure: str
    generator: str | None = None
    writes_explicitly: bool = False
    inputs: list[str] = field(default_factory=list)
    missing_inputs: list[str] = field(default_factory=list)
    referenced_by: list[str] = field(default_factory=list)


def _rel(root: str, path: str) -> str:
    return os.path.relpath(path, root).replace(os.sep, "/")


def _read(path: str) -> str:
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return ""


def _notebook_text(raw: str) -> str:
    """All cell sources concatenated - a notebook both generates and references."""
    try:
        nb = json.loads(raw)
    except (ValueError, TypeError):
        return ""
    out: list[str] = []
    for cell in nb.get("cells", []):
        src = cell.get("source", "")
        out.append("".join(src) if isinstance(src, list) else str(src))
    return "\n".join(out)


def _text_of(root: str, rel: str) -> str:
    raw = _read(os.path.join(root, rel))
    return _notebook_text(raw) if rel.lower().endswith(".ipynb") else raw


@dataclass
class Tree:
    root: str
    files: list[str]
    figures: list[str]
    code: list[str]
    docs: list[str]
    stamps: dict[str, float]
    tracked: set[str]


def _provenance(root: str) -> tuple[dict[str, float], set[str]]:
    """Newest ts per recorded path, and the set of recorded paths."""
    log = os.path.join(root, ".zerowall", "provenance.jsonl")
    stamps: dict[str, float] = {}
    if not os.path.isfile(log):
        return stamps, set()
    try:
        with open(log, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                path, ts = rec.get("path"), rec.get("ts")
                if isinstance(path, str) and isinstance(ts, (int, float)):
                    key = path.replace("\\", "/").lstrip("./")
                    stamps[key] = max(float(ts), stamps.get(key, 0.0))
    except OSError:
        return {}, set()
    return stamps, set(stamps)


def scan(root: str) -> Tree:
    files: list[str] = []
    for base, subdirs, names in os.walk(root):
        subdirs[:] = [d for d in subdirs if d not in _SKIP and not d.startswith(".")]
        for name in names:
            files.append(_rel(root, os.path.join(base, name)))
    files.sort()
    stamps, tracked = _provenance(root)

    def ext(rel: str) -> str:
        return os.path.splitext(rel)[1].lower()

    return Tree(
        root=root,
        files=files,
        figures=[f for f in files if ext(f) in FIG_EXT],
        code=[f for f in files if ext(f) in CODE_EXT],
        docs=[f for f in files if ext(f) in DOC_EXT],
        stamps=stamps,
        tracked=tracked,
    )


def _mtime(tree: Tree, rel: str) -> float:
    """Provenance ts when recorded, else the filesystem mtime, else 0."""
    if rel in tree.stamps:
        return tree.stamps[rel]
    try:
        return os.path.getmtime(os.path.join(tree.root, rel))
    except OSError:
        return 0.0


def build_chains(tree: Tree) -> tuple[list[Chain], list[tuple[str, str]]]:
    """Chains for every figure on disk, plus (doc, path) refs to absent figures."""
    code_text = {rel: _text_of(tree.root, rel) for rel in tree.code}
    chains = [Chain(figure=f) for f in tree.figures]
    by_base: dict[str, list[Chain]] = {}
    for chain in chains:
        by_base.setdefault(os.path.basename(chain.figure).lower(), []).append(chain)

    for rel, text in code_text.items():
        lowered = text.lower()
        for base, group in by_base.items():
            if base not in lowered:
                continue
            explicit = bool(WRITE_HINT.search(text))
            inputs = sorted({m.group(1) for m in DATA_REF.finditer(text)})
            for chain in group:
                # Prefer a script that clearly saves a figure over an incidental
                # mention (a README-ish path in a docstring, say).
                if chain.generator is None or (explicit and not chain.writes_explicitly):
                    chain.generator = rel
                    chain.writes_explicitly = explicit
                    chain.inputs = inputs

    on_disk = set(tree.files)
    for chain in chains:
        chain.missing_inputs = [
            p for p in chain.inputs if p.lstrip("./") not in on_disk and not os.path.isabs(p)
        ]

    # Document references, both directions.
    absent: list[tuple[str, str]] = []
    fig_set = set(tree.figures)
    for doc in tree.docs:
        text = _text_of(tree.root, doc)
        for m in DOC_FIG.finditer(text):
            raw = (m.group(1) or m.group(2) or "").strip()
            if not raw or raw.startswith(("http://", "https://", "data:")):
                continue
            target = raw.replace("\\", "/").lstrip("./")
            base = os.path.basename(target).lower()
            hit = [c for c in chains if c.figure == target or os.path.basename(c.figure).lower() == base]
            if hit:
                for c in hit:
                    c.referenced_by.append(doc)
            elif os.path.splitext(base)[1].lower() in FIG_EXT or "." not in base:
                if target not in fig_set:
                    absent.append((doc, raw))
    return chains, absent


def check_orphans(chains: list[Chain]) -> list[Finding]:
    found: list[Finding] = []
    for c in chains:
        if c.generator:
            continue
        cited = bool(c.referenced_by)
        found.append(
            Finding(
                "error" if cited else "warn",
                "figure · orphan",
                f"No script writes {c.figure}",
                (f"Referenced by {', '.join(sorted(set(c.referenced_by)))} but no "
                 if cited else "No ")
                + "workspace code mentions its filename, so it cannot be regenerated.",
            )
        )
    return found


def check_stale(tree: Tree, chains: list[Chain]) -> list[Finding]:
    found: list[Finding] = []
    for c in chains:
        if not c.generator:
            continue
        fig_ts = _mtime(tree, c.figure)
        newer: list[str] = []
        for dep in [c.generator, *[p for p in c.inputs if p not in c.missing_inputs]]:
            dep_ts = _mtime(tree, dep.lstrip("./"))
            if dep_ts > fig_ts > 0:
                newer.append(f"{dep} ({int(dep_ts - fig_ts)}s newer)")
        if newer:
            found.append(
                Finding(
                    "warn",
                    "figure · stale",
                    f"{c.figure} predates what produces it",
                    "Newer than the figure: " + ", ".join(newer[:4])
                    + " - regenerate it before using it in a report.",
                )
            )
    return found


def check_inputs(chains: list[Chain]) -> list[Finding]:
    found: list[Finding] = []
    for c in chains:
        if c.missing_inputs:
            found.append(
                Finding(
                    "error",
                    "figure · input",
                    f"{c.figure}: input data missing",
                    f"{c.generator} reads "
                    + ", ".join(c.missing_inputs[:4])
                    + ("…" if len(c.missing_inputs) > 4 else "")
                    + " - the file is not in the workspace, so the figure cannot be rebuilt.",
                )
            )
    return found


def check_missing(absent: list[tuple[str, str]]) -> list[Finding]:
    found: list[Finding] = []
    for doc, target in sorted(set(absent)):
        found.append(
            Finding(
                "error",
                "figure · missing",
                f"{doc} references a figure that is not on disk",
                f"{target!r} - the document will render with a broken image.",
            )
        )
    return found


def check_untracked(tree: Tree, chains: list[Chain]) -> list[Finding]:
    if not tree.tracked:
        if not chains:
            return []
        return [
            Finding(
                "warn",
                "figure · untracked",
                "No provenance log",
                f"{len(chains)} figure(s) present but .zerowall/provenance.jsonl does not "
                "exist - staleness was judged from filesystem mtimes only.",
            )
        ]
    untracked = [c.figure for c in chains if c.figure not in tree.tracked]
    if not untracked:
        return []
    return [
        Finding(
            "warn",
            "figure · untracked",
            f"{len(untracked)} figure(s) with no provenance record",
            ", ".join(untracked[:6]) + ("…" if len(untracked) > 6 else "")
            + " - history stops at the filesystem mtime.",
        )
    ]


def check_ok(tree: Tree, chains: list[Chain], flagged: set[str]) -> list[Finding]:
    found: list[Finding] = []
    for c in chains:
        if c.figure in flagged or not c.generator:
            continue
        found.append(
            Finding(
                "ok",
                "figure · ok",
                f"{c.figure} traces to code and data",
                f"Written by {c.generator}"
                + (f"; reads {', '.join(c.inputs[:3])}" if c.inputs else "; no data file read")
                + f"; newest of the chain (ts {int(_mtime(tree, c.figure))}).",
            )
        )
    return found


def run(paths: list[str]) -> dict:
    root = os.path.abspath(paths[0]) if paths else os.getcwd()
    if not os.path.isdir(root):
        return {
            "findings": [
                {
                    "level": "error",
                    "check": "figure",
                    "tag": "figure · input",
                    "title": "Not a directory",
                    "evidence": f"{root} is not a directory.",
                }
            ],
            "note": NOTE,
        }

    tree = scan(root)
    chains, absent = build_chains(tree)
    if not chains and not absent:
        return {
            "findings": [
                {
                    "level": "warn",
                    "check": "figure",
                    "tag": "figure · input",
                    "title": "No figures found",
                    "evidence": f"No image file under {_rel(root, root)} - nothing to trace.",
                }
            ],
            "note": NOTE,
        }

    findings: list[Finding] = []
    findings += check_orphans(chains)
    findings += check_stale(tree, chains)
    findings += check_inputs(chains)
    findings += check_missing(absent)
    findings += check_untracked(tree, chains)

    flagged = {c.figure for c in chains if any(c.figure in f.title or c.figure in f.evidence for f in findings)}
    findings += check_ok(tree, chains, flagged)

    return {
        "findings": [
            {
                "level": f.level,
                "check": "figure",
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
