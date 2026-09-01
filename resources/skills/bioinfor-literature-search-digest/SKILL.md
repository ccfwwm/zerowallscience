---
name: bioinfor-literature-search-digest
description: Use when searching PubMed or biomedical preprints, retrieving papers by PMID/DOI/arXiv, building a literature review, monitoring bioRxiv or medRxiv, checking citations, or producing a bounded and source-grounded literature digest.
---

# Biomedical Literature Search and Digest

## ZeroWall execution contract

These host rules override workflow examples below when they differ.

- Use ZeroWall tools by their actual names and discover optional MCP capabilities with `search_mcp_tools`; do not assume a connector is installed.
- Use `python` for normalization and small report-generation work; use `run_in_context` with Run Manager for long-running retrieval or batch processing.
- Resolve credentials only through **Settings > Credentials**. Never create, scan, or load project `.env` files and never print secret values.
- Keep network calls, large transfers, paid APIs, and external writes approval-gated. Bound searches before retrieval.
- Do not install runtimes or dependencies automatically. Report the exact missing runtime or package instead.
- Keep outputs inside the active project or Session workspace and preserve source identifiers for every record.

Build a reproducible, source-grounded literature set before writing conclusions.
Use ZeroWall Science's available literature connectors or official APIs at runtime; do not
require a machine-specific repository or script checkout.

## Workflow

1. Clarify the research question, organism/disease, evidence type, date range,
   language, and maximum result count.
2. Translate the question into a primary query and a small number of documented
   synonyms or MeSH terms.
3. Discover the live ZeroWall MCP/tool catalog instead of assuming exact tool names.
4. Search the most appropriate sources:
   - PubMed for biomedical primary literature and reviews;
   - Europe PMC or Crossref for metadata/citation completion;
   - bioRxiv/medRxiv for recent preprints;
   - arXiv for computational methods when relevant.
5. Normalize PMID, DOI, arXiv ID, title, authors, journal/server, date, abstract,
   URL, publication type, and source query.
6. Deduplicate by DOI/PMID first, then normalized title. Keep version links when
   a preprint later became a journal article.
7. Rank transparently by relevance, date, evidence type, and study design. Do
   not present a heuristic score as an impact factor or evidence grade.
8. Digest only supported claims. Separate metadata/abstract evidence from
   full-text evidence and mark papers that require manual full-text review.
9. Save the query, date range, source list, result table, exclusions, and final
   digest under the active project's `literature/` directory.

## Output contract

For a topic search, produce:

- `search_strategy.md`: question, sources, query strings, filters, and run date;
- `papers.tsv` or `papers.json`: normalized and deduplicated records;
- `digest.md`: grouped findings with PMID/DOI/arXiv links;
- `review_queue.tsv`: paywalled, ambiguous, or high-priority full-text items.

For a single-paper digest, report:

- citation and persistent identifiers;
- research question and study design;
- cohort/data/methods;
- main results supported by the abstract or available full text;
- limitations and unresolved questions;
- whether the evidence came from metadata, abstract, or full text.

## Safety and quality rules

- Always use an explicit date range for ?recent? or ?latest? requests.
- Bound broad searches before retrieving hundreds of records.
- Preserve source identifiers and never invent a PMID, DOI, quotation, sample
  size, effect size, or citation count.
- Do not describe abstract-only processing as a systematic review or full-text
  appraisal.
- Treat preprints as non-peer-reviewed and identify later journal versions.
- For clinical or regulatory decisions, state that expert review of the full
  source and current guidance is required.
- Respect API rate limits and record partial failures instead of silently
  dropping a source.

## ZeroWall Science integration

- Prefer ZeroWall MCP tools for PubMed, bioRxiv, arXiv, Crossref, and Europe PMC
  discovery when available.
- Use the persistent Python runtime only for normalization, deduplication,
  tabulation, and reproducible report generation.
- Keep downloaded PDFs and large caches as project assets; do not embed them in
  the skill directory.
