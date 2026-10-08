---
name: citation-reviewer
description: Use whenever the user asks to check, review, clean up, or fix citations, references, or a bibliography — "check my citations", "are the references consistent", "did I cite everything", "fix the bibliography", "check the reference format", or before submitting a manuscript. Cross-checks in-text citation keys against the bibliography, finds uncited and undefined entries, validates DOI/arXiv/ISBN syntax, and flags duplicates and missing required fields. Works offline against the files on disk; it does not verify that a cited work exists or says what the text claims.
license: MIT
zerowall:
  schema_version: 1
  domains: [scientific-literature]
  research_stages: [validation, synthesis]
  roles: [critic, validator]
  evidence_types: [literature]
  outputs: [validation-plan, literature-review]
  side_effects: code_execution
---

# Citation reviewer

This skill answers one question exhaustively: **is the citation apparatus in this
document internally consistent?** That is a file-level, offline question, and it
is where most citation errors actually live — a key that never made it into the
`.bib`, an entry pasted twice under two keys, a DOI with a stray space, a
reference nobody ever cites.

It deliberately does **not** check whether a cited paper exists, whether the
authors and year are right, or whether the source supports the sentence citing
it. Those need the literature, not the filesystem — use the literature-search
connector for them, and never let a clean run here stand in for that.

## Run the gate

After `use_skill`, run the absolute `citation_check.py` path listed under
`Bundled Resources`:

```text
python "<absolute path to citation_check.py>" [files or dirs...]
```

With no argument it sweeps the current directory for `.md`, `.tex`, `.bib`, and
`.ipynb` files. It prints one ` ```review ` fenced JSON block:

- **cite · undefined** — an in-text key with no bibliography entry. This is an
  `error`: the rendered document will show `[?]`.
- **cite · uncited** — a bibliography entry nothing cites. A `warn`; harmless in
  a reference manager, noise in a submission.
- **cite · duplicate** — two entries with the same key, or the same DOI/title
  under different keys.
- **cite · fields** — an entry missing a field its type requires (an `article`
  with no journal, anything with no year or author).
- **cite · identifier** — a DOI, arXiv id, or ISBN that cannot be well-formed.
- **cite · style** — mixed citation syntax in one document (`[@key]` pandoc and
  `\cite{key}` LaTeX together), which usually means one half will not render.

## What it reads

| Source | Citations found as |
| --- | --- |
| `.md` (pandoc) | `[@key]`, `[-@key]`, `@key` |
| `.tex` | `\cite`, `\citep`, `\citet`, `\parencite`, `\autocite`, `\footcite` |
| `.bib` | `@article{key, …}` entry definitions and their fields |
| `.ipynb` | markdown cells, treated as pandoc |

A plain-text reference list (numbered `[1] Author, Year…` under a `## References`
heading) is recognized too, so a document with no `.bib` still gets the
undefined/uncited cross-check.

## Reporting

Copy the ` ```review ` block as the **last thing** in your message. When you
summarize in prose, keep the scope honest: say "the citation keys and
bibliography are internally consistent", not "the citations are correct".

## Adding a check

Add a `check_<name>(...)` in `citation_check.py` and call it from `run()`. Keep
new findings on `check: "citation"` so they group with the rest.
