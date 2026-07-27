"""Build a Markdown report scaffold from what is actually in a workspace.

Collects (stdlib only, no network):
  data     - data files, size, whether provenance records them
  methods  - scripts, environment manifest, pinning
  results  - one subsection per figure, with its generator and inputs
  repro    - rebuild commands, provenance log size, figures with no generator

Usage:
  python report_scaffold.py [dir] [--out FILE] [--title TEXT] [--json]

Output: Markdown on stdout, or written to --out (never overwrites). Claims are
left as TODO markers - this script reports what exists, never what it means.
"""

from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass, field

_SKIP = {"node_modules", "__pycache__", ".git", ".zerowall", ".venv", "venv", ".ipynb_checkpoints"}
FIG_EXT = {".png", ".pdf", ".svg", ".jpg", ".jpeg", ".eps", ".tif", ".tiff"}
CODE_EXT = {".py", ".r", ".jl", ".sh", ".ipynb", ".rmd", ".qmd"}
DATA_EXT = {".csv", ".tsv", ".parquet", ".nc", ".json", ".jsonl", ".xlsx", ".h5", ".hdf5",
            ".feather", ".dta", ".sav"}
MANIFESTS = ("requirements.txt", "environment.yml", "environment.yaml", "pyproject.toml",
             "renv.lock", "Pipfile")

DATA_REF = re.compile(
    r"""["']([^"'\n]*?\.(?:csv|tsv|parquet|nc|json|xlsx|h5|hdf5|feather|dta|sav))["']""", re.I
)
WRITE_HINT = re.compile(r"(savefig|ggsave|write_image|imsave|to_file|output_file)", re.I)
PINNED = re.compile(r"[=<>~!]")
ENTRY_HINT = re.compile(r"(^|[_/-])(main|run|pipeline|analysis|analyze|make)([_.-]|$)", re.I)
PY_VERSION = re.compile(r"python[\s_-]*(?:version|requires)?\s*[:=]?\s*[\"']?([><=~^]*\s*3\.\d+)", re.I)


@dataclass
class Figure:
    path: str
    generator: str | None = None
    inputs: list[str] = field(default_factory=list)


@dataclass
class Inventory:
    root: str
    title: str
    figures: list[Figure] = field(default_factory=list)
    data: list[dict] = field(default_factory=list)
    scripts: list[str] = field(default_factory=list)
    manifest: str | None = None
    manifest_text: str = ""
    unpinned: list[str] = field(default_factory=list)
    python: str | None = None
    provenance_lines: int = 0
    tracked: set[str] = field(default_factory=set)


def _rel(root: str, path: str) -> str:
    return os.path.relpath(path, root).replace(os.sep, "/")


def _read(path: str) -> str:
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return ""


def _notebook_text(raw: str) -> str:
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


def _size(root: str, rel: str) -> str:
    try:
        n = os.path.getsize(os.path.join(root, rel))
    except OSError:
        return "?"
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024.0
    return "?"


def _provenance(root: str) -> tuple[int, set[str]]:
    log = os.path.join(root, ".zerowall", "provenance.jsonl")
    if not os.path.isfile(log):
        return 0, set()
    lines, paths = 0, set()
    try:
        with open(log, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                if not line.strip():
                    continue
                lines += 1
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                path = rec.get("path")
                if isinstance(path, str):
                    paths.add(path.replace("\\", "/").lstrip("./"))
    except OSError:
        return 0, set()
    return lines, paths


def _unpinned(name: str, text: str) -> list[str]:
    if not name.startswith("requirements"):
        return []
    out: list[str] = []
    for line in text.splitlines():
        line = line.split("#", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        if not PINNED.search(line):
            out.append(line)
    return out


def collect(root: str, title: str) -> Inventory:
    files: list[str] = []
    for base, subdirs, names in os.walk(root):
        subdirs[:] = [d for d in subdirs if d not in _SKIP and not d.startswith(".")]
        for name in names:
            files.append(_rel(root, os.path.join(base, name)))
    files.sort()

    def ext(rel: str) -> str:
        return os.path.splitext(rel)[1].lower()

    inv = Inventory(root=root, title=title)
    inv.provenance_lines, inv.tracked = _provenance(root)

    scripts = [f for f in files if ext(f) in CODE_EXT]
    inv.scripts = sorted(scripts, key=lambda p: (not ENTRY_HINT.search(os.path.basename(p)), p))

    inv.data = [
        {"path": f, "size": _size(root, f), "tracked": f in inv.tracked}
        for f in files
        if ext(f) in DATA_EXT
    ]

    for name in MANIFESTS:
        hit = next((f for f in files if os.path.basename(f) == name), None)
        if hit:
            inv.manifest = hit
            inv.manifest_text = _read(os.path.join(root, hit)).strip()
            inv.unpinned = _unpinned(name, inv.manifest_text)
            m = PY_VERSION.search(inv.manifest_text)
            inv.python = m.group(1).strip() if m else None
            break

    inv.figures = [Figure(path=f) for f in files if ext(f) in FIG_EXT]
    by_base: dict[str, list[Figure]] = {}
    for fig in inv.figures:
        by_base.setdefault(os.path.basename(fig.path).lower(), []).append(fig)
    for rel in scripts:
        text = _text_of(root, rel)
        lowered = text.lower()
        explicit = bool(WRITE_HINT.search(text))
        inputs = sorted({m.group(1) for m in DATA_REF.finditer(text)})
        for base, group in by_base.items():
            if base not in lowered:
                continue
            for fig in group:
                if fig.generator is None or explicit:
                    fig.generator = rel
                    fig.inputs = inputs
    return inv


# ---------------------------------------------------------------- sections


def _todo(text: str) -> str:
    return f"> **TODO** — {text}"


def section_summary(inv: Inventory) -> list[str]:
    return [
        "## Summary",
        "",
        _todo("One paragraph: the question, what was done, what came out. "
              "Write this last, once the Results captions exist."),
        "",
        "| | |",
        "| --- | --- |",
        "| Question | TODO |",
        "| Approach | TODO |",
        "| Main result | TODO |",
        "| Limitation | TODO |",
        "",
    ]


def section_data(inv: Inventory) -> list[str]:
    out = ["## Data", ""]
    if not inv.data:
        out += [_todo("No data file was found in the workspace. State where the inputs "
                      "live and how a reader gets them."), ""]
        return out
    untracked = [d["path"] for d in inv.data if not d["tracked"]]
    out += ["| File | Size | Provenance |", "| --- | --- | --- |"]
    for d in inv.data:
        out.append(f"| `{d['path']}` | {d['size']} | {'recorded' if d['tracked'] else '**none**'} |")
    out += [""]
    if untracked:
        out += [_todo(f"{len(untracked)} file(s) have no provenance record "
                      f"(`{'`, `'.join(untracked[:5])}`"
                      + ("…" if len(untracked) > 5 else "")
                      + "). State the source, download date, and licence for each."), ""]
    return out


def section_methods(inv: Inventory) -> list[str]:
    out = ["## Methods", ""]
    if inv.scripts:
        out += ["Analysis code in this workspace:", ""]
        out += [f"- `{s}` — TODO: one line on what it does" for s in inv.scripts[:20]]
        if len(inv.scripts) > 20:
            out.append(f"- …and {len(inv.scripts) - 20} more")
        out += [""]
    else:
        out += [_todo("No analysis script was found. A report with no code behind it "
                      "cannot be reproduced — say so explicitly or add the code."), ""]

    out += ["### Environment", ""]
    if inv.manifest:
        out += [f"Declared in `{inv.manifest}`"
                + (f", Python {inv.python}." if inv.python else "."), "", "```text",
                inv.manifest_text[:2000] + ("\n…" if len(inv.manifest_text) > 2000 else ""),
                "```", ""]
        if inv.unpinned:
            out += [_todo(f"{len(inv.unpinned)} dependency line(s) carry no version "
                          f"(`{'`, `'.join(inv.unpinned[:6])}`"
                          + ("…" if len(inv.unpinned) > 6 else "")
                          + "). Pin them before the report is shared, or the "
                            "environment is not the one described."), ""]
    else:
        out += [_todo("No environment manifest (`requirements.txt`, `environment.yml`, "
                      "`pyproject.toml`, `renv.lock`) exists. Add one — otherwise the "
                      "Methods section cannot state what was run."), ""]
    return out


def section_results(inv: Inventory) -> list[str]:
    out = ["## Results", ""]
    if not inv.figures:
        out += [_todo("No figure was found. Either add the figures this report "
                      "discusses, or write the results as tables."), ""]
        return out
    for i, fig in enumerate(inv.figures, 1):
        out += [f"### Figure {i} — TODO: the claim this figure makes", "",
                f"![Figure {i}]({fig.path})", ""]
        if fig.generator:
            out.append(f"- Generated by `{fig.generator}`")
            out.append("- Inputs: "
                       + (", ".join(f"`{p}`" for p in fig.inputs[:4]) if fig.inputs
                          else "no data file read by that script"))
        else:
            out.append("- **No script in this workspace writes this figure.** "
                       "TODO: add the generating code or remove the figure.")
        out += ["", _todo("Caption: what the reader should see, then what it means. "
                          "Quote the n and the uncertainty."), ""]
    return out


def section_repro(inv: Inventory) -> list[str]:
    out = ["## Reproducibility", ""]
    orphans = [f.path for f in inv.figures if not f.generator]
    generators = sorted({f.generator for f in inv.figures if f.generator})
    if generators:
        out += ["Rebuild the figures:", "", "```bash"]
        for gen in generators:
            if gen.lower().endswith(".ipynb"):
                out.append(f"jupyter nbconvert --execute --inplace {gen}")
            elif gen.lower().endswith((".r", ".rmd")):
                out.append(f"Rscript {gen}")
            elif gen.lower().endswith(".sh"):
                out.append(f"bash {gen}")
            else:
                out.append(f"python {gen}")
        out += ["```", ""]
    out.append(f"- Provenance log: "
               + (f"{inv.provenance_lines} record(s) in `.zerowall/provenance.jsonl`"
                  if inv.provenance_lines else "**absent** — history stops at file mtimes"))
    if orphans:
        out.append(f"- Figures with no generator: {len(orphans)} "
                   f"(`{'`, `'.join(orphans[:5])}`" + ("…" if len(orphans) > 5 else "") + ")")
    out += ["", _todo("Run `figure-provenance` and `reproducible-research` and paste "
                      "their review blocks here, or fix what they report first."), ""]
    return out


def section_open(inv: Inventory) -> list[str]:
    gaps: list[str] = []
    if not inv.manifest:
        gaps.append("no environment manifest")
    if inv.unpinned:
        gaps.append(f"{len(inv.unpinned)} unpinned dependency line(s)")
    if not inv.provenance_lines:
        gaps.append("no provenance log")
    untracked = [d for d in inv.data if not d["tracked"]]
    if untracked:
        gaps.append(f"{len(untracked)} data file(s) with no recorded source")
    orphans = [f for f in inv.figures if not f.generator]
    if orphans:
        gaps.append(f"{len(orphans)} figure(s) with no generating script")

    out = ["## Open questions and limitations", ""]
    out += [_todo("What this analysis does **not** show. Do not delete this section — "
                  "a report with no stated limitation reads as a claim of certainty."), ""]
    if gaps:
        out += ["Gaps the scaffold found in the workspace itself:", ""]
        out += [f"- [ ] {g}" for g in gaps]
        out += [""]
    return out


def build(inv: Inventory) -> str:
    out = [f"# {inv.title}", "",
           _todo("Author, date, and the one-sentence claim of this report."), ""]
    out += section_summary(inv)
    out += section_data(inv)
    out += section_methods(inv)
    out += section_results(inv)
    out += section_repro(inv)
    out += section_open(inv)
    out += ["---", "",
            "Scaffold generated from the workspace contents. Every heading above is "
            "backed by a file that exists; every claim is a TODO until a human writes it.",
            ""]
    return "\n".join(out)


def as_json(inv: Inventory) -> dict:
    return {
        "title": inv.title,
        "scripts": inv.scripts,
        "data": inv.data,
        "manifest": inv.manifest,
        "unpinned": inv.unpinned,
        "python": inv.python,
        "provenance_lines": inv.provenance_lines,
        "figures": [
            {"path": f.path, "generator": f.generator, "inputs": f.inputs} for f in inv.figures
        ],
    }


def _flag(args: list[str], name: str) -> str | None:
    if name in args:
        i = args.index(name)
        if i + 1 < len(args):
            return args[i + 1]
    return None


def main(argv: list[str]) -> int:
    args = argv[1:]
    flags = {"--out", "--title"}
    positional = [
        a for i, a in enumerate(args)
        if not a.startswith("--") and (i == 0 or args[i - 1] not in flags)
    ]
    root = os.path.abspath(positional[0]) if positional else os.getcwd()
    if not os.path.isdir(root):
        print(f"{root} is not a directory.", file=sys.stderr)
        return 1

    title = _flag(args, "--title") or os.path.basename(root.rstrip(os.sep)) or "Report"
    inv = collect(root, title)

    if "--json" in args:
        print(json.dumps(as_json(inv), ensure_ascii=False, indent=2))
        return 0

    text = build(inv)
    out_path = _flag(args, "--out")
    if not out_path:
        print(text)
        return 0
    if os.path.exists(out_path):
        print(f"{out_path} already exists; refusing to overwrite an edited report.",
              file=sys.stderr)
        return 1
    parent = os.path.dirname(os.path.abspath(out_path))
    os.makedirs(parent, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(text + "\n")
    print(f"Wrote {out_path} ({text.count(chr(10)) + 1} lines, "
          f"{text.count('**TODO**')} TODO markers).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
