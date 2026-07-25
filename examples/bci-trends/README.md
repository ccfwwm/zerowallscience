# examples/bci-trends

The built-in end-to-end demo project, used for the README, website, screenshots,
video, and release marketing.

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

Directories are seeded empty for now; the demo content is produced when the workbench
runs the workflow.
