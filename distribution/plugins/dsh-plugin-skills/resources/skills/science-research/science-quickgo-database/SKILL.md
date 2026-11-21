---
name: science-quickgo-database
description: >
  Query the QuickGO and Evidence & Conclusion Ontology (ECO) REST API. Use this
  when you need to map genes to biological processes, molecular functions, or
  cellular components, find genes associated with a specific pathway/GO term, or
  explore the Gene Ontology hierarchy. Do not use for querying drug targets (use
  OpenTargets) or mechanistic signaling pathway diagrams (use KEGG).
metadata:
  publisher: zerowall
---

<!-- Adapted by ZeroWall Science; upstream copyright and licenses are in ../licenses/. -->

## Product runtime

Read [the runtime guide](../runtime.md) before executing scripts. This skill uses capability `skill-science-quickgo-database`, revision `7e997eaf4810756ec5d5968520a8ad8ef16a3cc1f2a6ba1417a26f3c93164a3c`, and Python 3.12.14. Prepare only this capability when needed; loading this instruction does not install dependencies. Substitute `<CAPABILITY_PYTHON>` with its resolved interpreter; prefer the `python` tool with `capability_id`. Resolve resource paths against this skill's base directory and keep the working directory and outputs in the user's workspace. Do not install global packages or use system Python.

# QuickGO Database Skill

GO (Gene Ontology) annotations are one of the main ways to label a gene's
function. QuickGO is a fast, web-based browser for the GO and Evidence &
Conclusion Ontology (ECO), maintained by the Gene Ontology Annotation (GOA)
group at EMBL-EBI.

It provides a centralised resource to explore the functional attributes of gene
products (proteins, RNA, and complexes). It is a primary tool for functional
annotation mapping since it allows you to link a gene (e.g., USH2A) to its
specific biological processes (e.g. sensory perception of light stimulus),
molecular functions, and cellular components.

## Prerequisites

1.  **`science-uv`**: Read the `science-uv` skill and follow its Setup instructions to ensure
    `science-uv` is installed and on PATH.
2.  **User Notification**: If .licenses/quickgo_database_LICENSE.txt does not
    already exist in the workspace root directory then (1) prominently notify
    the user to check the terms at https://www.ebi.ac.uk/QuickGO/ and
    https://www.ebi.ac.uk/QuickGO/api/index.html, then (2) create the file
    recording the notification text and timestamp.

## Usage

This skill provides a Python CLI wrapper `scripts/quickgo_tool.py` that queries
the QuickGO REST API. It handles formatting the requests, respecting rate
limits, and safely storing the potentially large JSON responses.

## Core Rules

-   **Use the Wrapper**: ALWAYS execute the provided helper scripts to query the
    database rather than accessing the database directly. The scripts
    automatically enforce the required rate limit gracefully.
-   **Pagination & Limits**: Restrict endpoints to a maximum of 100 results per
    page using `--limit 100` and the `--page` parameter for larger datasets.
-   **Output Files**: Always use the `--output` flag to save responses to a file
    incrementally or parse via `jq`.
-   **Evidence Codes**: Prioritize experimental evidence (`ECO:0000269`) over
    electronic (`ECO:0000501`) to avoid noisy predictions.
-   **Taxon Filtering**: Use `--taxonId 9606` to restrict results to Human when
    analysing clinical or human genomic data.
-   **Notification**: If this skill is used, ensure this is mentioned in the
    output.

The tool has four main subcommands:

1.  **`go`**: For retrieving information about GO terms (e.g. definitions,
    ancestors, descendants, and slims). See
    [references/go_terms.md](references/go_terms.md).
2.  **`annotation`**: For finding functional annotations linking gene products
    to GO terms. This is your primary functional mapper. See
    [references/annotations.md](references/annotations.md).
3.  **`geneproduct`**: For resolving gene symbols (like `PROC`) to their formal
    database identifiers. See
    [references/gene_products.md](references/gene_products.md).
4.  **`eco`**: For Evidence & Conclusion Ontology terms (used in annotations to
    indicate how an annotation was derived, e.g. experimental vs electronic).
    See [references/eco_terms.md](references/eco_terms.md).

## Common Workflows

### 1. Map a gene to its functions (Annotations)

To find out what a gene does, you must first resolve its symbol to a UniProtKB
ID, and then query its annotations. Often it is best to filter for experimental
evidence (e.g. `ECO:0000269` for EXP, or others like IDA, IMP) to avoid noisy
electronic predictions.

```bash
# Step 1: Find the UniProtKB ID for human (9606) gene PROC
<CAPABILITY_PYTHON> scripts/quickgo_tool.py geneproduct search --query "PROC" --taxonId 9606 --limit 5 --output proc_id.json
# (Look at proc_id.json, observe the ID is e.g., UniProtKB:P04070)

# Step 2: Find experimental GO annotations for that ID
<CAPABILITY_PYTHON> scripts/quickgo_tool.py annotation search --geneProductId "UniProtKB:P04070" --taxonId 9606 --evidenceCode "ECO:0000269" --limit 50 --output proc_annotations.json
```

### 2. Find all genes in a pathway

To find all genes annotated to a specific GO term (e.g., GO:0003700 for
"transcription factor activity"):

```bash
# Find human genes with this specific molecular function
<CAPABILITY_PYTHON> scripts/quickgo_tool.py annotation search --goId "GO:0003700" --taxonId 9606 --limit 50 --output tf_genes.json
```

### 3. Explore the GO Hierarchy

To check if a specific GO term is a descendant of a broader category, or to
fetch its definition:

```bash
# Fetch term details (definitions, synonyms)
<CAPABILITY_PYTHON> scripts/quickgo_tool.py go terms --ids "GO:0003150" --output term_details.json

# Check ancestry (e.g., is GO:0001917 a child of something?)
<CAPABILITY_PYTHON> scripts/quickgo_tool.py go terms --ids "GO:0001917" --relation ancestors --output term_ancestors.json
```

### 4. Create a GO Slim Summary

If you have a list of candidate genes and want a high-level functional summary,
you can map them up to a predefined GO Slim. First, fetch the annotations for
the genes to extract their GO IDs, then pass those IDs to the slim endpoint:

```bash
# Step 1: Find GO IDs for candidate genes (e.g., via their UniProt IDs, fetching their annotations)
# ... (output yields e.g., GO:0006915,GO:0008219)

# Step 2: Create a slim summary from those specific GO IDs
<CAPABILITY_PYTHON> scripts/quickgo_tool.py go slim --slimsToIds "GO:0005575,GO:0008150,GO:0003674" --slimsFromIds "GO:0006915,GO:0008219" --output my_slim.json
```
