"""Reproducibility gate: can a stranger rerun this project?

Checks (stdlib only, no network):
  layout      - somewhere for inputs, code, and outputs; nothing generated loose
                in the workspace root
  environment - a dependency manifest exists and pins versions
  paths       - no absolute or home-relative path baked into a script
  provenance  - returns project-relative artifact candidates for ZeroWall's
                inspect_project_provenance tool to check separately

Usage:
  python repro_check.py [dir]        # defaults to the current directory

Output: one ```review fenced JSON block on stdout, ready to paste as the last
thing in a message. Findings only describe what was checked - clearing them does
not prove the project reproduces.
"""

from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

NOTE = (
    "Checked layout, dependency pinning, hard-coded paths, and artifact "
    "provenance. A clean result is not proof the project reproduces - system "
    "libraries, data availability, and hardware are out of scope."
)

_SKIP = {"node_modules", "__pycache__", ".git", ".zerowall", ".venv", "venv", ".ipynb_checkpoints"}

CODE_EXT = {".py", ".r", ".jl", ".sh", ".ipynb"}
ARTIFACT_EXT = {".png", ".pdf", ".svg", ".jpg", ".jpeg", ".csv", ".parquet", ".tsv", ".xlsx"}

DATA_DIRS = {"data", "datasets", "input", "inputs", "raw"}
CODE_DIRS = {"scripts", "src", "code", "analysis", "notebooks"}
OUT_DIRS = {"figures", "figs", "outputs", "output", "results", "artifacts", "reports", "tables"}

MANIFESTS = ("requirements.txt", "environment.yml", "environment.yaml", "pyproject.toml", "renv.lock", "Pipfile")

# An absolute path a reader cannot possibly have: a Windows drive, a unix /home
# or /Users tree, or an expanded ~ inside a string literal.
ABS_PATH = re.compile(r"""["']((?:[A-Za-z]:[\\/]|/(?:home|Users|mnt|media)/|~/)[^"'\n]{2,})["']""")

# `pandas` pins nothing; `pandas==2.2.1`, `pandas>=2`, `pandas~=2.2` do.
PINNED = re.compile(r"[=<>~!]")


@dataclass
class Finding:
    level: str  # error | warn | ok
    tag: str
    title: str
    evidence: str


@dataclass
class Tree:
    root: str
    dirs: set[str]  # top-level directory names, lowercased
    files: list[str]  # workspace-relative paths, forward slashes


def _rel(root: str, path: str) -> str:
    return os.path.relpath(path, root).replace(os.sep, "/")


def scan(root: str) -> Tree:
    dirs: set[str] = set()
    files: list[str] = []
    for base, subdirs, names in os.walk(root):
        subdirs[:] = [d for d in subdirs if d not in _SKIP and not d.startswith(".")]
        if base == root:
            dirs = {d.lower() for d in subdirs}
        for name in names:
            files.append(_rel(root, os.path.join(base, name)))
    return Tree(root=root, dirs=dirs, files=sorted(files))


def _read(root: str, rel: str) -> str:
    try:
        with open(os.path.join(root, rel), encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return ""


def _notebook_code(text: str) -> str:
    """Concatenate the source of a notebook's code cells; '' when unparseable."""
    try:
        nb = json.loads(text)
    except (ValueError, TypeError):
        return ""
    out: list[str] = []
    for cell in nb.get("cells", []):
        if cell.get("cell_type") == "code":
            src = cell.get("source", "")
            out.append("".join(src) if isinstance(src, list) else str(src))
    return "\n".join(out)


def _code_text(root: str, rel: str) -> str:
    text = _read(root, rel)
    return _notebook_code(text) if rel.lower().endswith(".ipynb") else text


def _line_of(text: str, needle: str) -> int:
    idx = text.find(needle)
    return text.count("\n", 0, idx) + 1 if idx >= 0 else 0


def check_layout(tree: Tree) -> list[Finding]:
    found: list[Finding] = []
    code = [f for f in tree.files if os.path.splitext(f)[1].lower() in CODE_EXT]
    if not code:
        return [Finding("warn", "repro · layout", "No analysis code found",
                        "No .py/.R/.jl/.ipynb file in the workspace - nothing to rerun.")]

    missing = [
        label
        for label, wanted in (("inputs", DATA_DIRS), ("code", CODE_DIRS), ("outputs", OUT_DIRS))
        if not (tree.dirs & wanted)
    ]
    if missing:
        found.append(
            Finding(
                "warn",
                "repro · layout",
                f"No conventional directory for {', '.join(missing)}",
                "Top-level directories: "
                + (", ".join(sorted(tree.dirs)) or "(none)")
                + ". A reader has to guess which files are inputs and which are generated.",
            )
        )

    loose = [
        f
        for f in tree.files
        if "/" not in f and os.path.splitext(f)[1].lower() in ARTIFACT_EXT
    ]
    if loose:
        found.append(
            Finding(
                "warn",
                "repro · layout",
                f"{len(loose)} generated-looking file(s) in the workspace root",
                ", ".join(loose[:6]) + ("…" if len(loose) > 6 else "")
                + " - move outputs under a directory that can be deleted and regenerated.",
            )
        )
    return found


def check_environment(tree: Tree) -> list[Finding]:
    present = [m for m in MANIFESTS if m in tree.files]
    if not present:
        return [
            Finding(
                "error",
                "repro · environment",
                "No dependency manifest",
                "None of " + ", ".join(MANIFESTS) + " exists, so the package versions "
                "this analysis ran against are unrecoverable.",
            )
        ]

    found: list[Finding] = []
    if "requirements.txt" in present:
        text = _read(tree.root, "requirements.txt")
        bare = [
            ln.strip()
            for ln in text.splitlines()
            if ln.strip() and not ln.strip().startswith(("#", "-")) and not PINNED.search(ln)
        ]
        if bare:
            found.append(
                Finding(
                    "warn",
                    "repro · environment",
                    f"{len(bare)} unpinned dependency in requirements.txt",
                    ", ".join(bare[:8]) + ("…" if len(bare) > 8 else "")
                    + " - a rerun months from now resolves to a different version.",
                )
            )
    return found


def check_paths(tree: Tree) -> list[Finding]:
    found: list[Finding] = []
    for rel in tree.files:
        if os.path.splitext(rel)[1].lower() not in CODE_EXT:
            continue
        text = _code_text(tree.root, rel)
        for match in ABS_PATH.finditer(text):
            path = match.group(1)
            found.append(
                Finding(
                    "error",
                    "repro · paths",
                    "Machine-specific path in code",
                    f"{rel}:{_line_of(text, match.group(0))} references {path!r}. "
                    "Nobody else has that path - use a path relative to the project root.",
                )
            )
            break  # one finding per file keeps the report readable
    return found


def provenance_candidates(tree: Tree) -> list[str]:
    return [
        f
        for f in tree.files
        if os.path.splitext(f)[1].lower() in ARTIFACT_EXT
        and (f.split("/")[0].lower() in OUT_DIRS or "/" not in f)
    ]


def run(paths: list[str]) -> dict:
    root_path = Path(paths[0] if paths else os.getcwd()).resolve()
    root = str(root_path)
    if not root_path.is_dir():
        return {
            "findings": [
                {
                    "level": "error",
                    "check": "integrity",
                    "tag": "repro · input",
                    "title": "Not a directory",
                    "evidence": f"{root} is not a directory.",
                }
            ],
            "note": NOTE,
        }

    tree = scan(root)
    findings: list[Finding] = []
    findings += check_layout(tree)
    findings += check_environment(tree)
    findings += check_paths(tree)
    candidates = provenance_candidates(tree)

    return {
        "findings": [
            {
                "level": f.level,
                "check": "integrity",
                "tag": f.tag,
                "title": f.title,
                "evidence": f.evidence,
            }
            for f in findings
        ],
        "provenance_status": "unknown",
        "provenance_paths": candidates,
        "note": NOTE,
    }


def main(argv: list[str]) -> int:
    print("```review")
    print(json.dumps(run(argv[1:]), ensure_ascii=False))
    print("```")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
