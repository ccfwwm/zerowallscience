---
name: paper-download-pdf-cascade
description: "Acquire academic PDFs with the copied paper-download cascade, strict page-one identity validation, registry state transitions, retries, quarantine, hashes, and auditable source attempts."
---

# paper-download PDF cascade

Use the full runtime and focused instructions in `../paper-download/skills/pdf-cascade/SKILL.md`. Run the worker from `../paper-download` with the ZeroWall Environment variables loaded:

```text
python -m pipeline run --ref <slug>
python -m pipeline run --state candidate --limit 50
python -m pipeline reactivate-ocr
```

For title/DOI/PMID workflows, invoke this cascade in an isolated registry and return only a validated PDF.
