---
name: bibliometric-analysis
description: Use whenever the user asks to analyze a literature corpus quantitatively — "what are the trends in this field", "publication counts by year", "which journals publish this", "top keywords", "who are the most prolific authors", "cluster these papers by topic", "analyze my BibTeX library", or to turn search results into a trend figure. Computes year trends, keyword and author frequencies, journal/venue distribution, and keyword co-occurrence clusters from a BibTeX, CSV, or JSON corpus, and reports coverage so thin metadata is never presented as a finding.
license: MIT
zerowall:
  schema_version: 1
  domains: [scientific-literature]
  research_stages: [retrieval, analysis, synthesis]
  roles: [analyst, synthesizer]
  evidence_types: [literature]
  outputs: [analysis-module, literature-review]
  side_effects: code_execution
---

# Bibliometric analysis

Turn a pile of literature metadata into counts a reader can check. The unit of
work is a **corpus file** — a `.bib` export, a `.csv` from a database, or the
`.json` a literature-search connector returns — not a web search. Fetch the
corpus first (the `paper-search` connector, a database export, `pdf-explore` for
a folder of PDFs), then analyze it here so the numbers come from a file that can
be re-analyzed later.

## Run the analysis

After `use_skill`, run the absolute `bibliometrics.py` path listed under
`Bundled Resources` with the active Python interpreter:

```text
python "<absolute path to bibliometrics.py>" CORPUS [more...]
```

Options:

| Flag | Effect |
| --- | --- |
| `--top N` | how many rows per ranking (default 15) |
| `--since YEAR` / `--until YEAR` | restrict the year window |
| `--json` | emit the raw result object instead of the Markdown report |
| `--csv DIR` | also write `by_year.csv`, `keywords.csv`, `venues.csv`, `authors.csv` |

Accepted inputs:

- **BibTeX** (`.bib`) — reads `year`/`date`, `journal`/`booktitle`, `author`,
  `keywords`, `title`, `doi`.
- **CSV** (`.csv`) — header names are matched case-insensitively against
  `year`, `journal`/`venue`/`source`/`publication`, `author`/`authors`,
  `keywords`/`terms`, `title`, `doi`.
- **JSON** (`.json`/`.jsonl`) — a list of objects, or `{"papers": […]}` /
  `{"results": […]}` / `{"data": […]}`, with the same field names.

## What it reports

1. **Coverage** — how many records carry each field, printed **first**. A
   keyword ranking over the 12% of records that have keywords is not a finding
   about the field; the report says so instead of hiding it.
2. **Publications per year**, with an ASCII sparkline and the compound growth
   rate across the covered window.
3. **Top venues**, **top authors** (surname + initial, so `Smith, J.` and
   `J. Smith` merge), **top keywords** after stopword removal.
4. **Keyword co-occurrence clusters** — greedy connected components over
   keyword pairs that co-occur at least `--min-pair` times (default 3). This is
   a cheap descriptive grouping, not a validated topic model; the report labels
   it that way.
5. **Duplicates** — records sharing a DOI or a normalized title, counted once in
   every ranking and reported separately.

## Reading the result

The Markdown report is meant to be pasted into a notebook or a report section as
is. Two rules when you write prose around it:

- Quote the denominator. "Deep learning appears in 41 of 380 records (11%)" is
  checkable; "deep learning is a dominant theme" is not.
- A corpus is whatever the search returned. Say which query and which database
  produced it, or the counts describe a sample nobody can reconstruct.

## Plotting

For a trend figure, run with `--csv figures/` and plot `by_year.csv` — the
figure then has a data file behind it, which is what `figure-provenance` looks
for. Style it with the `figure-style` skill if the project has one.
