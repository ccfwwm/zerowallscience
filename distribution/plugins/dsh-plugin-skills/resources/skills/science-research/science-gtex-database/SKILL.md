---
name: science-gtex-database
description: >
  Use when you want to retrieve quantitative RNA expression data and variant
  eQTL information from the GTEx (Genotype-Tissue Expression) Project across 54
  non-diseased tissue sites.
metadata:
  publisher: zerowall
---

<!-- Adapted by ZeroWall Science; upstream copyright and licenses are in ../licenses/. -->

## Product runtime

Read [the runtime guide](../runtime.md) before executing scripts. This skill uses capability `skill-science-gtex-database`, revision `15bfe0d086fece84bc312a951e1d6f2a4f16ef5ea6ab18c7525f19b4a981222f`, and Python 3.12.14. Prepare only this capability when needed; loading this instruction does not install dependencies. Substitute `<CAPABILITY_PYTHON>` with its resolved interpreter; prefer the `python` tool with `capability_id`. Resolve resource paths against this skill's base directory and keep the working directory and outputs in the user's workspace. Do not install global packages or use system Python.

# GTEx Database Integration

This skill retrieves transcriptomics data (RNA expression baselines) and
expression Quantitative Trait Loci (eQTLs) from the GTEx Portal API V2. It
provides access to median TPM (Transcripts Per Million) values for genes and
significant eQTLs for variants across 54 human tissue sites.

## Prerequisites

1.  **`science-uv`**: Read the `science-uv` skill and follow its Setup instructions to ensure
    `science-uv` is installed and on PATH.
2.  **User Notification**: If .licenses/gtex_database_LICENSE.txt does not
    already exist in the workspace root directory then (1) prominently notify
    the user to check the terms at https://gtexportal.org/home/license and
    https://gtexportal.org/home/documentationPage#gtexApi, then (2) create the
    file recording the notification text and timestamp.

## When to Use

**Use this skill when you need to:**

-   Map a gene symbol to its Versioned GENCODE ID.
-   Retrieve the baseline median expression level (in TPM) of a gene across
    various tissues.
-   Find the top tissues where a particular gene is most highly expressed.
-   Fetch significant single-tissue eQTLs for a variant or within a chromosomal
    window.
-   Get all significant eQTLs associated with a specific gene.
-   Contextualise a variant within GWAS loci using eQTL data.

**Do NOT use when you need to:**

-   Query for protein-level expression or post-translational modifications
    (PTMs). GTEx only measures mRNA abundance.
-   Query gene expression in diseased tissues (e.g., tumor samples, cirrhosis).
    GTEx is a baseline atlas of normal, non-diseased tissues.
-   Query embryonic or fetal gene expression. GTEx donors are adults only.

## Core Rules

**CRITICAL**: You MUST respect GTEx Portal API Terms of Use.

-   **Use the Wrapper**: ALWAYS execute the provided helper scripts to query the
    database rather than accessing the database directly. The scripts
    automatically enforce the required rate limit gracefully.
-   Limit requests to maximum 250 items per page where applicable.
-   **Notification**: If this skill is used, ensure this is mentioned in the
    output.

## Command Selection Guide

**Pick the right command on the first try.** Match the user's input to the
correct subcommand below.

-   Map a gene symbol to GENCODE ID: `resolve-gencode-id`
-   Get median expression (TPM) for a gene: `get-median-expression`
-   Find tissues with highest expression for a gene: `get-top-expressed-tissues`
-   Get all eQTLs for a specific gene: `get-gene-eqtls`
-   Find eQTLs within a chromosomal region: `get-eqtls-in-region`

## Quick Start

```bash
# Map the TNF gene symbol to its GENCODE ID
<CAPABILITY_PYTHON> scripts/gtex_cli.py resolve-gencode-id TNF --output ./tnf_id.json

# Get median expression of a gene by GENCODE ID
<CAPABILITY_PYTHON> scripts/gtex_cli.py get-median-expression ENSG00000232810.2 --output ./tnf_expr.json
```

All subcommands write JSON to disk. Always save output in the `./` directory.
The default output file is `./gtex_output.json` if `--output` is not
specified.

## Commands

### 1. `resolve-gencode-id` — Gene Symbol → GENCODE ID

Maps a standard gene symbol (e.g., "JUN", "TNF") to its Versioned GENCODE ID.
This ID is required for all other expression and eQTL calls.

```bash
<CAPABILITY_PYTHON> scripts/gtex_cli.py resolve-gencode-id TNF --output ./tnf_id.json
```

*Arguments:*

-   `gene_symbol` (positional): The standard gene symbol (e.g., "TNF").
-   `--output`: Output file path (default: `./gtex_output.json`).

### 2. `get-median-expression` — Get Median Expression (TPM)

Retrieves the median TPM for a gene across all 54 GTEx tissue sites or specified
tissues.

```bash
<CAPABILITY_PYTHON> scripts/gtex_cli.py get-median-expression ENSG00000232810.2 \
  --tissues "Whole Blood,Spleen" --output ./expr.json
```

*Arguments:*

-   `gencode_id` (positional): The Versioned GENCODE ID.
-   `--tissues`: Comma-separated list of tissue IDs (optional, defaults to all
    54 tissues).
-   `--output`: Output file path (default: `./gtex_output.json`).

### 3. `get-top-expressed-tissues` — Get Top Expressed Tissues

Returns the `n` tissues with the highest median expression for the target gene.

```bash
<CAPABILITY_PYTHON> scripts/gtex_cli.py get-top-expressed-tissues ENSG00000232810.2 \
  --n 5 --output ./top_tissues.json
```

*Arguments:*

-   `gencode_id` (positional): The Versioned GENCODE ID.
-   `--n`: Number of top tissues to return (default: 5).
-   `--output`: Output file path.

### 4. `get-gene-eqtls` — Get All eQTLs for a Gene

Returns every significant eQTL associated with the gene across specified
tissues.

```bash
<CAPABILITY_PYTHON> scripts/gtex_cli.py get-gene-eqtls ENSG00000232810.2 \
  --tissues "Whole Blood" --output ./eqtls.json
```

*Arguments:*

-   `gencode_id` (positional): The Versioned GENCODE ID.
-   `--tissues`: Comma-separated list of tissue IDs (optional, defaults to all).
-   `--output`: Output file path.

### 5. `get-eqtls-in-region` — Get eQTLs in Chromosomal Region

Returns all significant single-tissue eQTLs within a chromosomal window (up to
8Mb).

```bash
<CAPABILITY_PYTHON> scripts/gtex_cli.py get-eqtls-in-region chr17 7000000 7100000 "Esophagus - Muscularis" \
  --output ./region_eqtls.json
```

*Arguments:*

-   `chromosome` (positional): Chromosome name (e.g., `chr17`).
-   `start` (positional): Start position.
-   `end` (positional): End position (max 8Mb from start).
-   `tissue_id` (positional): The target tissue ID.
-   `--output`: Output file path.

## Typical Workflows

### Identify highest expressing tissues for a gene

```bash
# Step 1: Map symbol to GENCODE ID
<CAPABILITY_PYTHON> scripts/gtex_cli.py resolve-gencode-id GATA4 --output ./gata4_id.json

# Step 2: Query for top tissues using the resolved ID
<CAPABILITY_PYTHON> scripts/gtex_cli.py get-top-expressed-tissues <gencode_id> --n 5 \
  --output ./gata4_top.json
```
