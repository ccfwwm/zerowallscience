---
name: science-unibind-database
description: >-
  Queries the UniBind database for experimentally validated transcription factor
  (TF) binding sites. Use when retrieving direct TF-DNA interaction datasets,
  downloading binding site coordinates (BED/FASTA) for local analysis, or
  listing available datasets by species, cell line, or TF name. Don't use to
  query specific intervals, locations, genes, motif models or expression
  data.
metadata:
  publisher: zerowall
---

<!-- Adapted by ZeroWall Science; upstream copyright and licenses are in ../licenses/. -->

## Product runtime

Read [the runtime guide](../runtime.md) before executing scripts. This skill uses capability `skill-science-unibind-database`, revision `1e800e62ad018019fa22cfab12cb0827f0009e0dd69869a8484a51a9ef340444`, and Python 3.12.14. Prepare only this capability when needed; loading this instruction does not install dependencies. Substitute `<CAPABILITY_PYTHON>` with its resolved interpreter; prefer the `python` tool with `capability_id`. Resolve resource paths against this skill's base directory and keep the working directory and outputs in the user's workspace. Do not install global packages or use system Python.

# UniBind Database Skill

UniBind is a database of direct TF–DNA interactions across 9 species,
integrating ChIP-seq peaks with JASPAR TF binding profiles via the DAMO
framework.

## Prerequisites

1.  **`science-uv`**: Read the `science-uv` skill and follow its Setup instructions to ensure
    `science-uv` is installed and on PATH.
2.  **User Notification**: If .licenses/unibind_database_LICENSE.txt does not
    already exist in the workspace root directory then (1) prominently notify
    the user to check the terms at https://unibind.uio.no/ and
    https://unibind.uio.no/api/overview, then (2) create the file recording the
    notification text and timestamp.

## Quick Start

Query commands print JSON to stdout by default. Most outputs are small enough to
read directly. For large outputs (`list_cell_lines`, `list_tfs`), pipe through
`jq` to extract only the fields you need.

```bash
<CAPABILITY_PYTHON> <SKILL DIR>/scripts/unibind_api.py list_species
```

The `download_tfbs` command writes BED/FASTA files to `--output-dir` instead.
You may optionally use `--output <path>` on any query command to save results to
a file if needed.

## Core Rules

-   **Use the Wrapper**: ALWAYS execute the provided helper scripts to query the
    database rather than accessing the database directly. The scripts
    automatically enforce the required rate limit gracefully.
-   **Output**: Query commands print JSON to stdout. Most responses are compact
    and can be read directly.
-   **Large Results**: `list_cell_lines` and `list_tfs` produce large output.
    Pipe these through `jq` to extract specific fields rather than reading the
    full output into context.
-   **Saving to File**: Use `--output <path>` when you need to reference the
    data later or when processing very large results with `jq`.
-   **Pagination**: Use `--page` and `--page-size` (max 1000) to chunk large
    result sets.
-   **Ordering**: Use `--order field_name` (prefix with `-` for descending) on
    any list command.
-   **Notification**: If this skill is used, ensure this is mentioned in the
    output.

## Utility Scripts

*Replace `<SKILL DIR>` with the absolute path to this skill's directory.*

### 1. List Species

```bash
<CAPABILITY_PYTHON> <SKILL DIR>/scripts/unibind_api.py list_species
```

### 2. List Collections

```bash
<CAPABILITY_PYTHON> <SKILL DIR>/scripts/unibind_api.py list_collections
```

### 3. List Cell Lines & TFs (large output — use `jp`)

These commands return large datasets. Use `uvx --from jmespath jp` to extract
only the fields you need.

```bash
<CAPABILITY_PYTHON> <SKILL DIR>/scripts/unibind_api.py list_cell_lines | uvx --from jmespath jp "results[].name"
<CAPABILITY_PYTHON> <SKILL DIR>/scripts/unibind_api.py list_tfs | uvx --from jmespath jp "results[].tf_name"
```

### 4. List and Filter Datasets (and Profile-Specific Datasets)

Filter datasets using the following arguments:

-   `--species` (e.g., "Homo sapiens")
-   `--tf-name` (e.g., "CTCF")
-   `--cell-line` (e.g., "mESC")
-   `--collection` (e.g., Permissive, Robust)
-   `--search` (a search term)
-   `--biological-condition` (biological condition or source)
-   `--data-source` (source of data, e.g., "ENCODE")
-   `--has-pvalue` ("true" or "false")
-   `--identifier` (e.g., "GSE60130")
-   `--jaspar-id` (JASPAR database profile matrix ID)
-   `--model` (prediction model)
-   `--summary` (summary filter)
-   `--threshold-pvalue` (p-value threshold)

Use `list_datasets` for standard datasets, or `list_specific_datasets` for
profile-specific queries.

```bash
<CAPABILITY_PYTHON> <SKILL DIR>/scripts/unibind_api.py list_datasets --species "Homo sapiens" --tf-name "CTCF" --data-source "ENCODE"
<CAPABILITY_PYTHON> <SKILL DIR>/scripts/unibind_api.py list_specific_datasets --species "Mus musculus" --cell-line "mESC"
```

### 5. Get Dataset Details

```bash
<CAPABILITY_PYTHON> <SKILL DIR>/scripts/unibind_api.py get_dataset "EXP047889.HMLE-Twist-ER_breast_cancer.SMAD3"
```

### 6. Download TFBS Files (BED / FASTA)

Downloads all TFBS files for a dataset to a local directory. Use `--format bed`
(default) or `--format fasta`.

```bash
<CAPABILITY_PYTHON> <SKILL DIR>/scripts/unibind_api.py download_tfbs "EXP047889.HMLE-Twist-ER_breast_cancer.SMAD3" --output-dir ./tfbs --format bed
```

## Anti-Patterns

-   **DON'T** attempt to use the UniBind API to query specific genomic
    intervals, locations, or genes.
-   **DON'T** guess or hallucinate genome coordinates. Always use
    `science-ensembl-database` as an external check if you're pulling local BED tracks
    for offline bedtools intersection.
-   **DON'T** use for motif models (PFMs). Use the **jaspar-database** skill
    instead.
-   **DON'T** use for gene expression data. UniBind only stores binding events.
-   **DON'T** assume tissue-specific expression from dataset lists alone.
-   **DON'T** use `cat` to read large JSON output files into context. The output
    is too large. Use `jq` or write your own code to parse the output files.
