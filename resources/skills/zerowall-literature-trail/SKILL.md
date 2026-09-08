---
name: zerowall-literature-trail
description: Analyze a paper from a title, DOI, PMID, URL, local PDF, or reference spreadsheet. Resolve metadata, expand references and cited-by, acquire authorized full text, extract citation contexts, and produce reproducible evidence reports.
whenToUse: Use for title-driven literature retrieval, citation-network analysis, PDF parsing, citation-context extraction, and evidence-grounded reports. Combine with pubmed-literature, mineru-document-parser, literature-review, and deep-research when those capabilities are available.
---

# ZeroWall Literature Trail

Run the bundled CLI at `scripts/literature_pipeline.py` with the managed Python runtime. It accepts a title, DOI, PMID, URL, local PDF, or Excel/CSV input and stores all outputs under a task directory.

Typical commands:

```text
python scripts/literature_pipeline.py analyze "Upregulation of WDR6 drives hepatic de novo lipogenesis in insulin resistance in mice" --output literature/wdr6
python scripts/literature_pipeline.py analyze 10.1038/s41392-023-01672-5 --output literature/wdr6 --download-pdfs
python scripts/literature_pipeline.py resume literature/wdr6
python scripts/literature_pipeline.py export literature/wdr6
```

The workflow first resolves the best title/identifier match, then merges PubMed/Europe PMC, Crossref, and OpenAlex metadata. It expands both `references` and `cited-by`, records each provider's citation count separately, and tries open-access PDF URLs before an optional authorized TSG fallback.

The CLI never prints tokens or cookies. Configure `TSG_TOKEN`, `TSG_USER_TOKEN`, `TSG_PM_JSESSIONID`, and `TSG_USER_JSESSIONID` through ZeroWall Environment settings. `NCBI_API_KEY`, `NCBI_ADMIN_EMAIL`, `OPENALEX_API_KEY`, `S2_API_KEY`, and `UNPAYWALL_EMAIL` are optional provider settings.

Use MinerU for complex layout, tables, formulas, or OCR after the PDF is saved. Preserve its task ID and artifact paths in the task's `source_ledger.json`. Use `pubmed-literature` for native PubMed capability calls, `deep-research` for source verification and synthesis, and ARS citation-check/literature-review modes for the final prose audit.

Every downloaded file is validated as a PDF, checked against title/author text when available, hashed, and written atomically. Every missing or ambiguous source is retained in `review_queue.tsv`; no citation or author credential is invented. Quote only short, necessary citation-context excerpts with page/paragraph locations.

The acquisition layer is adapter-based. Built-in adapters are direct URLs, PMC/Europe PMC, OpenAlex OA, Crossref links, Unpaywall, and TSG. User-owned institutional services may be added as a local adapter through `AUTHORIZED_ADAPTER_MODULE`; the adapter must return a source URL, authorization note, and validated PDF path. Specific third-party shadow-library crawlers and access-control bypass logic are not bundled in the ZeroWall runtime.
