---
name: science-literature-search-europepmc
description: >
  Search Europe PMC for scientific literature and download open-access full
  texts and PDFs. Retrieve full-text XML/plain text by PMCID, get citation
  lists and bibliography.
metadata:
  publisher: zerowall
---

<!-- Adapted by ZeroWall Science; upstream copyright and licenses are in ../licenses/. -->

## Product runtime

Read [the runtime guide](../runtime.md) before executing scripts. This skill uses capability `skill-science-literature-search-europepmc`, revision `ee6dc1b413b58e9c74546c36da17c081d7328a76cae54410dbf7c2c917dd1056`, and Python 3.12.14. Prepare only this capability when needed; loading this instruction does not install dependencies. Substitute `<CAPABILITY_PYTHON>` with its resolved interpreter; prefer the `python` tool with `capability_id`. Resolve resource paths against this skill's base directory and keep the working directory and outputs in the user's workspace. Do not install global packages or use system Python.

# Europe PMC Database

A skill for searching, downloading, and exploring open-access papers from
[Europe PMC](https://europepmc.org/) — a comprehensive, free life-science
literature database with over 43 million abstracts and 9 million full-text
articles.

## Prerequisites

1.  **`science-uv`**: Read the `science-uv` skill and follow its Setup instructions to ensure
    `science-uv` is installed and on PATH.
2.  **User Notification**: If .licenses/literature_search_europepmc_LICENSE.txt
    does not already exist in the workspace root directory then (1) prominently
    notify the user to check the terms at https://europepmc.org/ and to always
    check the license of the papers retrieved by the skill for any restrictions,
    then (2) create the file recording the notification text and timestamp.

## Core Rules

-   **Open Access Only**: This skill exclusively searches open-access content.
    The script automatically appends `OPEN_ACCESS:y` to every search query. Do
    NOT remove or override this filter.
-   **NEVER run python3 or python3 -c directly**: the system Python does not
    necessarily have all key dependencies. Do not attempt to pip install or
    create new venvs.
-   **Use the Wrapper**: ALWAYS use the provided script rather than calling the
    API directly. The script handles rate limiting (1 req/s) and errors.
-   **Output Files**: All subcommands require `--output` to write results to a
    file. Read the output file separately to avoid context overflow.
-   **List Sources.** If this skill is used, ensure this is mentioned in the
    output AND list the URLs of all papers that were used in producing the
    output.

## Utility Scripts

All commands are subcommands of `scripts/europepmc_api.py`. Rate limiting and
retries are handled automatically.

### 1. Search (`search`)

Search Europe PMC by query. Supports DOI lookup, keyword search, author search,
PMID lookup, and the full
[Europe PMC search syntax](https://europepmc.org/searchsyntax).

```bash
# Look up a paper by DOI
<CAPABILITY_PYTHON> scripts/europepmc_api.py search "DOI:10.1038/s41586-021-03819-2" --output result.json

# Keyword search
<CAPABILITY_PYTHON> scripts/europepmc_api.py search "CRISPR cancer" --max_results 5 --output results.json

# Author search
<CAPABILITY_PYTHON> scripts/europepmc_api.py search "AUTH:Jumper J" --max_results 10 --output results.json

# PMID lookup
<CAPABILITY_PYTHON> scripts/europepmc_api.py search "EXT_ID:34265844 AND SRC:MED" --output result.json

# Sorted by citations
<CAPABILITY_PYTHON> scripts/europepmc_api.py search "machine learning" \
  --sort "CITED desc" --max_results 20 --output results.json
```

**Arguments:**

-   `query` (str, required) — search query using Europe PMC syntax
-   `--output` (str, required) — output JSON file path
-   `--max_results` (int, default 10) — maximum results per page (max 1000)
-   `--result_type` (str, default `core`) — `core` (full metadata) or `lite`
-   `--cursor` (str, default `*`) — cursor mark for pagination; pass the
    `nextCursorMark` value from a previous response to get the next page
-   `--sort` (str) — sort order, e.g. `CITED desc`, `P_PDATE_D desc`
    (publication date descending), `P_PDATE_D asc`

**Output:** JSON file with three fields:

-   `hitCount` (int) — total number of matching articles
-   `nextCursorMark` (str) — cursor for next page; empty string if no more pages
-   `results` (list) — array of article metadata objects

**Search Syntax Quick Reference:**

-   `DOI:10.xxxx/yyyy` — look up by DOI
-   `EXT_ID:12345678 AND SRC:MED` — look up by PMID
-   `AUTH:surname initials` — author search
-   `TITLE:keyword` — search in title only
-   `JOURNAL:name` — search by journal
-   `PUB_YEAR:2024` or `(FIRST_PDATE:[2023-01-01 TO 2023-12-31])` — date filter
-   `HAS_FT:y` — restrict to articles with full text in Europe PMC
-   Boolean operators: `AND`, `OR`, `NOT`

> **Note**: `OPEN_ACCESS:y` is automatically appended to all queries. You do not
> need to add it manually.

### 2. Download PDF (`download_pdf`)

Download an open-access PDF from Europe PMC by PMCID.

```bash
<CAPABILITY_PYTHON> scripts/europepmc_api.py download_pdf PMC8371605 --output alphafold.pdf
```

**Arguments:**

-   `pmcid` (str, required) — PubMed Central ID (e.g., `PMC8371605`)
-   `--output` (str, required) — filepath to save the PDF

**Output:** Saves the PDF to the specified file. Exits with an error if the
PMCID is not found or the response is not a valid PDF. Whenever you download a
PDF, check the pdf downloaded is not empty or corrupted.

### 3. Get Full Text (`get_fulltext`)

Retrieve the full text of an open-access article and save to a file. Returns
plain text (XML tags stripped) by default, or raw XML with `--format xml`.

```bash
# Get plain text (default)
<CAPABILITY_PYTHON> scripts/europepmc_api.py get_fulltext PMC8371605 --output fulltext.txt

# Get raw XML
<CAPABILITY_PYTHON> scripts/europepmc_api.py get_fulltext PMC8371605 --format xml --output fulltext.xml
```

**Arguments:**

-   `pmcid` (str, required) — PubMed Central ID
-   `--output` (str, required) — output file path
-   `--format` (str, default `text`) — `text` (plain text) or `xml` (raw JATS
    XML)

**Output:** Full text written to the specified file. Exits with an error if the
article is not in the Europe PMC open-access subset.

> **Important**: Only articles in the PMC Open Access Subset have full text
> available. If retrieval fails, use `search` to check the `isOpenAccess` field
> and fall back to the abstract.

### 4. Get Citations (`get_citations`)

Retrieve articles that cite a given paper.

```bash
# Get citations for the AlphaFold paper (PMID 34265844)
<CAPABILITY_PYTHON> scripts/europepmc_api.py get_citations MED 34265844 \
  --page_size 25 --output citations.json
```

**Arguments:**

-   `source` (str, required) — source database: `MED` (PubMed), `PMC`, `PPR`
    (preprints), `PAT` (patents)
-   `article_id` (str, required) — article ID in the source database
-   `--output` (str, required) — output JSON file path
-   `--page` (int, default 1) — page number
-   `--page_size` (int, default 25) — results per page

**Output:** JSON file with `hitCount` and `citations` array.

### 5. Get References (`get_references`)

Retrieve the reference list (bibliography) of a given paper.

```bash
# Get references from the AlphaFold paper
<CAPABILITY_PYTHON> scripts/europepmc_api.py get_references MED 34265844 \
  --page_size 100 --output references.json
```

**Arguments:**

-   `source` (str, required) — source database: `MED`, `PMC`, `PPR`, `PAT`
-   `article_id` (str, required) — article ID in the source database
-   `--output` (str, required) — output JSON file path
-   `--page` (int, default 1) — page number
-   `--page_size` (int, default 25) — results per page

**Output:** JSON file with `hitCount` and `references` array.

## Common Workflows

### DOI to PDF

```bash
# Step 1: Search for the PMCID
<CAPABILITY_PYTHON> scripts/europepmc_api.py search "DOI:10.1038/s41586-021-03819-2" --output result.json
PMCID=$(jq -r '.results[0].pmcid // empty' result.json)

# Step 2: Download the PDF
<CAPABILITY_PYTHON> scripts/europepmc_api.py download_pdf "$PMCID" --output paper.pdf
```

### PMID to Full Text

```bash
# Step 1: Find the PMCID from a PMID
<CAPABILITY_PYTHON> scripts/europepmc_api.py search "EXT_ID:34265844 AND SRC:MED" --output result.json
PMCID=$(jq -r '.results[0].pmcid // empty' result.json)

# Step 2: Get the full text
<CAPABILITY_PYTHON> scripts/europepmc_api.py get_fulltext "$PMCID" --output fulltext.txt
```

### Citation Graph Traversal

```bash
# Find what papers cite a landmark study, then check their references
<CAPABILITY_PYTHON> scripts/europepmc_api.py get_citations MED 34265844 --page_size 50 --output citing.json
# Parse a cited paper's PMID and explore its references
<CAPABILITY_PYTHON> scripts/europepmc_api.py get_references MED <CITING_PMID> --output refs.json
```

### Search with Pagination

```bash
# First page
<CAPABILITY_PYTHON> scripts/europepmc_api.py search "CRISPR" --max_results 100 --output page1.json
# Extract cursor for next page
CURSOR=$(jq -r '.nextCursorMark // empty' page1.json)
# Next page
<CAPABILITY_PYTHON> scripts/europepmc_api.py search "CRISPR" --max_results 100 --cursor "$CURSOR" --output page2.json
```
