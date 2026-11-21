---
name: science-reactome-database
description: >
  Query the Reactome database (Analysis and Content Services). Use when the user
  asks about pathway analysis, gene list enrichment, retrieving results by
  token, finding unmapped or not-found identifiers, mapping identifiers,
  reaction participants (inputs, outputs), pathway hierarchy (including
  top-level pathways), diagram export, cross-reference mapping, or searching the
  knowledgebase.
metadata:
  publisher: zerowall
---

<!-- Adapted by ZeroWall Science; upstream copyright and licenses are in ../licenses/. -->

## Product runtime

Read [the runtime guide](../runtime.md) before executing scripts. This skill uses capability `skill-science-reactome-database`, revision `000f07d8b417969ba83deafd41f8c07a0e8ac43e16e57cc54fd64df92a668df5`, and Python 3.12.14. Prepare only this capability when needed; loading this instruction does not install dependencies. Substitute `<CAPABILITY_PYTHON>` with its resolved interpreter; prefer the `python` tool with `capability_id`. Resolve resource paths against this skill's base directory and keep the working directory and outputs in the user's workspace. Do not install global packages or use system Python.

# Reactome Analysis & Content Service

## Prerequisites

1.  **`science-uv`**: Read the `science-uv` skill and follow its Setup instructions to ensure
    `science-uv` is installed and on PATH.
2.  **User Notification**: If .licenses/reactome_database_LICENSE.txt does not
    already exist in the workspace root directory then (1) prominently notify
    the user to check the terms at https://reactome.org/license and
    https://reactome.org/cite, then (2) create the file recording the
    notification text and timestamp.

## Overview

Reactome is a free, open-source, curated pathway database. This skill wraps both
the **Analysis Service** (`https://reactome.org/AnalysisService/`) and the
**Content Service** (`https://reactome.org/ContentService/`) providing pathway
enrichment analysis, identifier mapping, reaction details, pathway hierarchy
navigation, diagram export, cross-reference mapping, and search.

## When to Use This Skill

-   Performing pathway enrichment (overrepresentation) analysis on gene/protein
    lists
-   Retrieving analysis results using a token from previous enrichment
-   Identifying which genes or proteins were not found in a pathway analysis
-   Analyzing gene expression data against pathway annotations
-   Mapping identifiers to Reactome entities across species
-   Retrieving reaction participants (inputs, outputs, catalysts, regulators)
-   Navigating pathway hierarchy and listing top-level pathways
-   Finding which complexes or sets contain a protein
-   Exporting pathway/reaction diagrams (PNG/SVG) with gene highlighting
-   Cross-referencing identifiers across databases (UniProt, Ensembl, etc.)
-   Searching the Reactome knowledgebase
-   Downloading analysis reports (PDF, CSV, JSON)
-   Comparing pathways across species

## Common Species IDs

Reference list for common research organisms:

-   Homo sapiens
    -   ID: 9606
-   Mus musculus (Mouse)
    -   ID: 48892
-   Rattus norvegicus (Rat)
    -   ID: 48895

## Common Pathway IDs

Reference list for commonly used Reactome pathway stable IDs:

-   Cell Cycle
    -   Stable ID: R-HSA-1640170
    -   Notes: Top-level pathway (broad)
-   Cell Cycle, Mitotic
    -   Stable ID: R-HSA-69278
    -   Notes: Specific sub-pathway — use this for diagrams and drill-downs
-   Immune System
    -   Stable ID: R-HSA-168256
    -   Notes: Top-level pathway
-   Signal Transduction
    -   Stable ID: R-HSA-162582
    -   Notes: Top-level pathway
-   Gene Expression
    -   Stable ID: R-HSA-74160
    -   Notes: Top-level pathway
-   Programmed Cell Death
    -   Stable ID: R-HSA-5357801
    -   Notes: Top-level pathway

> **Important**: When the user asks for a "Cell Cycle" diagram or analysis,
> prefer the specific **Cell Cycle, Mitotic** pathway (`R-HSA-69278`) unless the
> user explicitly requests the top-level overview. The examples throughout this
> document use `R-HSA-69278`.

## Core Rules

1.  **Always use `--output`**: Every subcommand requires `--output <file>` to
    write results to a file. Never rely on stdout for large results.
2.  **Default species is Homo sapiens**: Use `--species` to override.
3.  **Tokens expire after 7 days**: Store tokens from analysis results to
    retrieve them later without re-submitting data.
4.  **Use `--fdr` and `--pvalue` to filter**: Enrichment results can be
    overwhelming. Filter with `--fdr 0.05` or `--pvalue 0.01` to focus on
    statistically significant pathways.
5.  **Identifier formats**: Reactome auto-detects identifiers including gene
    symbols (TP53), UniProt (P04637), Ensembl (ENSG00000141510), ChEBI, OMIM,
    EntrezGene, and many more.
6.  **Handle large outputs**: For commands that return large data (like
    `species-comparison`), use the `--summary` flag to truncate lists and avoid
    exceeding workspace file size limits (1MB).
7.  **Notification**: If this skill is used, ensure this is mentioned in the
    output.

## Tool Execution

The CLI tool is at `scripts/reactome_analysis.py`. Run with `science-uv`:

```bash
<CAPABILITY_PYTHON> scripts/reactome_analysis.py <command> [options] --output ./out.json
```

**To list all available subcommands and flags**, run:

```bash
<CAPABILITY_PYTHON> scripts/reactome_analysis.py --help
```

Use `--help` to verify available subcommands or flags before executing an
unfamiliar command.

## Feature Domains

### 1. Database Info

```bash
<CAPABILITY_PYTHON> scripts/reactome_analysis.py db-version --output ./version.json
<CAPABILITY_PYTHON> scripts/reactome_analysis.py db-name --output ./name.json
```

### 2. Single Identifier Analysis

```bash
<CAPABILITY_PYTHON> scripts/reactome_analysis.py identifier --id TP53 --output ./tp53.json
<CAPABILITY_PYTHON> scripts/reactome_analysis.py identifier-projection --id TP53 --output ./tp53_proj.json
```

### 3. Batch Analysis (Enrichment)

Submit a list of identifiers for overrepresentation or expression analysis:

```bash
<CAPABILITY_PYTHON> scripts/reactome_analysis.py analyze --data "TP53,BRCA1,EGFR" --output ./enrich.json
<CAPABILITY_PYTHON> scripts/reactome_analysis.py analyze --file genes.txt --output ./enrich.json
<CAPABILITY_PYTHON> scripts/reactome_analysis.py analyze-projection --data "TP53,BRCA1" --output ./proj.json
<CAPABILITY_PYTHON> scripts/reactome_analysis.py analyze --data "TP53,BRCA1" --fdr 0.05 --output ./sig.json
```

Common options: `--page-size` (alias `--limit`), `--page` (alias `--offset`),
`--sort-by`, `--order`, `--resource`, `--species`, `--fdr`, `--pvalue`.

### 4. Token-Based Result Retrieval

```bash
<CAPABILITY_PYTHON> scripts/reactome_analysis.py token-result --token TOKEN --output ./result.json
<CAPABILITY_PYTHON> scripts/reactome_analysis.py token-not-found --token TOKEN --output ./notfound.json
<CAPABILITY_PYTHON> scripts/reactome_analysis.py token-resources --token TOKEN --output ./resources.json
<CAPABILITY_PYTHON> scripts/reactome_analysis.py token-found-entities --token TOKEN --pathway R-HSA-69278 --output ./found.json
<CAPABILITY_PYTHON> scripts/reactome_analysis.py token-filter-species --token TOKEN --species-filter 9606 --output ./filtered.json
<CAPABILITY_PYTHON> scripts/reactome_analysis.py token-reactions-pathway --token TOKEN --pathway R-HSA-69278 --output ./rxns.json
```

### 5. Download Results

```bash
<CAPABILITY_PYTHON> scripts/reactome_analysis.py download-result --token TOKEN --output ./full.json
<CAPABILITY_PYTHON> scripts/reactome_analysis.py download-pathways --token TOKEN --output ./pathways.csv
<CAPABILITY_PYTHON> scripts/reactome_analysis.py download-found --token TOKEN --output ./found.csv
<CAPABILITY_PYTHON> scripts/reactome_analysis.py download-not-found --token TOKEN --output ./notfound.csv
```

### 6. Identifier Mapping

```bash
<CAPABILITY_PYTHON> scripts/reactome_analysis.py mapping --data "TP53,BRCA1" --output ./mapped.json
<CAPABILITY_PYTHON> scripts/reactome_analysis.py mapping-projection --data "TP53" --output ./mapped_proj.json
```

### 7. Reaction Participants & Mechanism of Action

Retrieve the molecular participants of a reaction (inputs, outputs, catalysts):

```bash
<CAPABILITY_PYTHON> scripts/reactome_analysis.py participants --id R-HSA-6804194 --output ./participants.json
<CAPABILITY_PYTHON> scripts/reactome_analysis.py participating-entities --id R-HSA-6804194 --output ./entities.json
```

### 8. Complex & Set Membership

Find which complexes or sets contain a given entity:

```bash
<CAPABILITY_PYTHON> scripts/reactome_analysis.py component-of --id R-HSA-69488 --output ./complexes.json
```

### 9. Pathway Hierarchy Navigation

Move up (ancestors) or down (contained events) the pathway hierarchy:

```bash
<CAPABILITY_PYTHON> scripts/reactome_analysis.py event-ancestors --id R-HSA-69278 --output ./ancestors.json
<CAPABILITY_PYTHON> scripts/reactome_analysis.py contained-events --id R-HSA-69278 --output ./steps.json
<CAPABILITY_PYTHON> scripts/reactome_analysis.py top-pathways --output ./top.json
<CAPABILITY_PYTHON> scripts/reactome_analysis.py low-pathways --id R-HSA-69488 --output ./low.json
```

### 10. Diagram Export

Export pathway or reaction diagrams as PNG/SVG, with optional gene highlighting:

```bash
<CAPABILITY_PYTHON> scripts/reactome_analysis.py diagram --id R-HSA-69278 --output ./diagram.png
<CAPABILITY_PYTHON> scripts/reactome_analysis.py diagram --id R-HSA-69278 --highlight TP53 --output ./highlighted.png
<CAPABILITY_PYTHON> scripts/reactome_analysis.py diagram --id R-HSA-69278 --format svg --output ./diagram.svg
<CAPABILITY_PYTHON> scripts/reactome_analysis.py reaction-diagram --id R-HSA-6804194 --output ./rxn.png
```

### 11. Cross-Reference Mapping

Resolve identifiers to Reactome internal IDs and cross-references:

```bash
<CAPABILITY_PYTHON> scripts/reactome_analysis.py xref-mapping --id TP53 --output ./xref.json
<CAPABILITY_PYTHON> scripts/reactome_analysis.py xref-mapping-batch --data "TP53,BRCA1" --output ./xrefs.json
```

### 12. Search

```bash
<CAPABILITY_PYTHON> scripts/reactome_analysis.py search --query "TP53 apoptosis" --output ./results.json
```

### 13. Query Entry by ID

```bash
<CAPABILITY_PYTHON> scripts/reactome_analysis.py query --id R-HSA-69278 --output ./entry.json
```

### 14. Report & Species Comparison

```bash
<CAPABILITY_PYTHON> scripts/reactome_analysis.py report --token TOKEN --output ./report.pdf
<CAPABILITY_PYTHON> scripts/reactome_analysis.py species-comparison --species-id 48892 --output ./species.json
# Use --summary to truncate large output and avoid workspace file size limits
<CAPABILITY_PYTHON> scripts/reactome_analysis.py species-comparison --species-id 48892 --summary --output ./species.json
```

## Recipe: Interpreting Gene Set Enrichment

A step-by-step workflow for interpreting gene set enrichment results:

1.  **Submit gene list** with projection to human pathways: `<CAPABILITY_PYTHON> scripts/reactome_analysis.py analyze-projection \ --data
    "TP53,BRCA1,EGFR,MYC,PTEN" --fdr 0.05 --output ./enrichment.json`

2.  **Inspect top pathways** — examine `pathwaysFound`, top pathway names,
    p-values, and FDR values in the output.

3.  **Drill into a pathway** — get its sub-events and reaction details: `bash uv
    run scripts/reactome_analysis.py contained-events --id R-HSA-69278 --output
    ./steps.json <CAPABILITY_PYTHON> scripts/reactome_analysis.py participants --id
    <reaction_id> --output ./parts.json`

4.  **Visualise** — export a diagram with your genes highlighted: `<CAPABILITY_PYTHON> scripts/reactome_analysis.py diagram --id R-HSA-69278 \ --highlight
    "TP53,BRCA1" --output ./diagram.png`

5.  **Check hierarchy** — navigate up to see broader biological context: `bash
    <CAPABILITY_PYTHON> scripts/reactome_analysis.py event-ancestors --id R-HSA-69278
    --output ./ancestors.json`

6.  **Cross-reference** — map identifiers to other databases: `<CAPABILITY_PYTHON> scripts/reactome_analysis.py xref-mapping --id TP53 --output
    ./xrefs.json`

## Reference

For detailed API endpoint documentation, see
[references/api_reference.md](references/api_reference.md).
