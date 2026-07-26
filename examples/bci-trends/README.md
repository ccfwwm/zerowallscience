# examples/bci-trends (planned — spec only)

A specification for a future end-to-end demo project. Nothing here ships today:
the directory holds no data, code, or notebooks, the app does not bundle or
install it, and no workflow starter references it. The current built-in demo is
`examples/climate-trends`. If this project is built out, it is the one intended
for the README, website, screenshots, video, and release marketing.

Task:

> 2023–2026 brain–computer interface literature trends

Expected outputs (a full project workspace):

```text
plan.md
data/corpus.csv
scripts/analyze.py
figures/year_trend.png
figures/topic_clusters.png
figures/top_keywords.png
report.md
review.md
provenance.jsonl
```

## Workspace layout (mirrors a real project)

```text
data/{raw,processed}/   papers/   parsed/   scripts/   notebooks/
figures/   reports/   artifacts/   reviews/   provenance.jsonl   manifest.json
```

Directories are seeded empty; the demo content would be produced by the workbench
once this workflow is implemented.
