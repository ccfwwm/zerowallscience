---
kind: upgrade-guide
description: Figure OCR and evidence reports use explicit coverage and versioned exports.
---

# Integrity evidence reports

English | [中文](guide.zh.md)

## Change

Figure OCR defaults to local RapidOCR instead of EasyOCR. Explicit `--local-ocr off` now reports disabled work with its required count, rather than not applicable. Existing screening files remain unchanged. The existing `research_integrity` tool adds `report`, `resume`, `status` and `export`: versioned evidence manifests generate offline HTML, editable Word and PDF, with 10 priority findings by default. Machine candidates do not become confirmed issues through report generation or grouping.

## Migration

1. Prepare the managed `skill-integrity` capability for RapidOCR; select `--local-ocr easyocr` only when that engine and its dependencies are explicitly available. Import supplemental OCR through `--ocr-results` with matching source hashes, then rerun the numeric audit.
2. Use the bundled research-integrity skill and its schema-1 report instructions. Keep sources and evidence inside the selected workspace. Older screening JSON requires reviewed findings and evidence locations before it can become a conclusion report.
3. Enable managed Python and the `skill-integrity-report` capability for Word, plus the shared Office converter for PDF. A PDF failure preserves HTML and Word; retry `export` on the same report directory. `resume` creates a new revision. The `priorityLimit` plugin setting or tool argument changes the default 10.
