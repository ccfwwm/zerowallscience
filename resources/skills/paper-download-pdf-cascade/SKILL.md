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

For title/DOI/PMID workflows started through `zerowall-literature`, its `scripts/paper_download_bridge.py` invokes this same cascade in an isolated registry and returns only a validated PDF.
