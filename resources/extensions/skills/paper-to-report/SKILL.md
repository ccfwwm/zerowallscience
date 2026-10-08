---
name: paper-to-report
description: Use whenever the user asks to turn a finished analysis into a written document — "write up the results", "generate a report", "make a Markdown report from this project", "draft the methods section", "summarize what we did into a report", or before sharing a workspace with a collaborator or supervisor. Builds a Markdown report scaffold from what is actually in the workspace (figures with their generating script and inputs, data files, environment manifest, stored provenance facts) and leaves explicit TODO markers where only a human can supply the claim.
license: MIT
zerowall:
  schema_version: 1
  domains: [general]
  research_stages: [synthesis]
  roles: [synthesizer]
  evidence_types: [project-data, computational]
  outputs: [analysis-module, literature-review]
  side_effects: project_write
---

# Paper to report

Turn a workspace into a document a reader can follow. The scaffold is generated
from the filesystem, so every figure, table, and data file in the report is one
that exists, and every Methods sentence about the environment comes from the
manifest rather than from memory.

The script writes structure and evidence. **You write the claims.** It never
invents a result, a number, or an interpretation — those arrive as `TODO`
markers you fill in from the analysis.

## Build the scaffold

After `use_skill`, run the absolute `report_scaffold.py` path listed under
`Bundled Resources`:

```text
python "<absolute path to report_scaffold.py>" [dir] --out report.md
```

| Flag | Effect |
| --- | --- |
| `--out FILE` | write the report (default: print to stdout) |
| `--title TEXT` | report title (default: the directory name) |
| `--json` | emit the inventory object instead of Markdown, for another tool |

Nothing is overwritten: `--out` on an existing file stops with an error, so a
report you already edited is safe.

## What the scaffold contains

1. **Summary** — a TODO block with the three questions a reader asks first: what
   question, what was done, what came out.
2. **Data** — every data file found, with size. Query all listed paths with
   `inspect_project_provenance` and add its `tracked`, `untracked`, or `unknown`
   status; never infer tracking from file existence.
3. **Methods** — the scripts in dependency-ish order (entry points first), the
   environment manifest verbatim (`requirements.txt`, `environment.yml`,
   `pyproject.toml`, `renv.lock`), and the Python/R version if the manifest
   states one. Unpinned dependencies are called out inline.
4. **Results** — one subsection per figure, each with an embedded image, the
   script that writes it, the data that script reads, and a `TODO` caption. The
   figure→script→data chain comes from the same inference `figure-provenance`
   uses.
5. **Reproducibility** — the commands to rebuild the figures, stored provenance
   facts from `inspect_project_provenance`, and any figure with no generator.
6. **Open questions** — a TODO list seeded with every gap the sweep found.

## Working through it

- Fill the TODO markers top to bottom. The Summary last: it is easier once the
  Results captions are written.
- Every number in prose should also appear in a table or figure in the report. If
  it does not, it came from somewhere the reader cannot check.
- Run `citation-reviewer` on the finished report before sharing it, and
  `figure-provenance` if you changed any figure while writing.
- A generated report is a draft, not a submission. Say what the analysis showed
  and what it did not; the scaffold deliberately gives limitations its own TODO
  rather than letting the section be dropped.

## Adding a section

Add a `section_<name>(inv)` returning a list of Markdown lines in
`report_scaffold.py` and call it from `build()`. Sections take the same
inventory object, so a new section costs no extra filesystem walk.
