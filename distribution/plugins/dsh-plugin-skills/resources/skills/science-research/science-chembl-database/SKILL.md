---
name: science-chembl-database
description: >
  Query the ChEMBL database for bioactive molecules, drug targets, bioactivity
  data, approved drugs, and chemical structures. Use when the user asks about
  compounds, targets, IC50/Ki values, drug mechanisms, or structure searches.
metadata:
  publisher: zerowall
---

<!-- Adapted by ZeroWall Science; upstream copyright and licenses are in ../licenses/. -->

## Product runtime

Read [the runtime guide](../runtime.md) before executing scripts. This skill uses capability `skill-science-chembl-database`, revision `c12cf921b6f36fe11fb68221912143ec3d4006aea94eab9a5594a34b447dd8de`, and Python 3.12.14. Prepare only this capability when needed; loading this instruction does not install dependencies. Substitute `<CAPABILITY_PYTHON>` with its resolved interpreter; prefer the `python` tool with `capability_id`. Resolve resource paths against this skill's base directory and keep the working directory and outputs in the user's workspace. Do not install global packages or use system Python.

# ChEMBL Database Query

## Prerequisites

1.  **`science-uv`**: Read the `science-uv` skill and follow its Setup instructions to ensure
    `science-uv` is installed and on PATH.
2.  **User Notification**: If .licenses/chembl_database_LICENSE.txt does not
    already exist in the workspace root directory then (1) prominently notify
    the user to check the terms at
    https://chembl.gitbook.io/chembl-interface-documentation/about, then (2)
    create the file recording the notification text and timestamp.

## Core Rules

-   [!IMPORTANT] **Use the Utility Scripts**: You MUST ALWAYS use the provided
    utility script `scripts/chembl_api.py` for all ChEMBL API interactions,
    including checking status. NEVER use `curl` or custom Python requests to
    query the ChEMBL API directly. This ensures rate limit is enfoced and also
    retries on network errors.

-   **Output to File (Required)**: The `--output` flag is **required** for every
    subcommand. All JSON results are written to the specified file. After
    running the command, read the output file with jq or your own code to
    extract the data. List results are typically wrapped in a JSON array keyed
    by the endpoint name (e.g., `molecules`, `activities`).

-   **Notification**: If this skill is used, ensure this is mentioned in the
    output.

## Utility Script

All ChEMBL API queries use one script with subcommands:

```bash
<CAPABILITY_PYTHON> scripts/chembl_api.py <subcommand> --output <file> [options]
```

--------------------------------------------------------------------------------

### 1. Check API Status

```bash
<CAPABILITY_PYTHON> scripts/chembl_api.py status --output ./status.json
```

--------------------------------------------------------------------------------

### 2. Molecule Queries

**Fetch by ChEMBL ID:** `<CAPABILITY_PYTHON> scripts/chembl_api.py molecule --id
CHEMBL25 --output ./mol.json`

**Search by name:** `<CAPABILITY_PYTHON> scripts/chembl_api.py molecule --search
"aspirin" --limit 3 --output ./mol_search.json`

**Batch fetch:** `<CAPABILITY_PYTHON> scripts/chembl_api.py molecule --ids
"CHEMBL25;CHEMBL1642" --limit 10 --output ./mol_batch.json`

**Filter by properties:** `<CAPABILITY_PYTHON> scripts/chembl_api.py molecule --filter
molecule_properties__mw_freebase__lte=500 --limit 5 --output
./mol_filter.json`

**Filter by range:** `<CAPABILITY_PYTHON> scripts/chembl_api.py molecule --filter
molecule_properties__mw_freebase__range=150,200 --limit 5 --output
./mol_range.json`

**Download SDF structure file:** `<CAPABILITY_PYTHON> scripts/chembl_api.py molecule
--id CHEMBL25 --dl_format sdf --output ./aspirin.sdf`

> **Tip**: SDF/MOL files can be passed directly to tools like PyMOL or RDKit for
> 3D visualization and analysis.

--------------------------------------------------------------------------------

### 3. Target Queries

**Search for targets:** `<CAPABILITY_PYTHON> scripts/chembl_api.py target --search
"EGFR" --limit 5 --output ./targets.json`

**Fetch by ID:** `<CAPABILITY_PYTHON> scripts/chembl_api.py target --id CHEMBL203
--output ./egfr.json`

--------------------------------------------------------------------------------

### 4. Bioactivity Data

**Fetch activity by ID:** `<CAPABILITY_PYTHON> scripts/chembl_api.py activity --id 31863
--output ./act.json`

**Search activities:** `<CAPABILITY_PYTHON> scripts/chembl_api.py activity --search
"EGFR" --limit 5 --output ./act_search.json`

**Filter activities for a target:** `<CAPABILITY_PYTHON> scripts/chembl_api.py activity
--filter target_chembl_id=CHEMBL203 standard_type=IC50 --limit 10 --output
./egfr_ic50.json`

**Normalize bioactivity units to nM:** `<CAPABILITY_PYTHON> scripts/chembl_api.py
activity --filter target_chembl_id=CHEMBL203 standard_type=IC50 --limit 5
--normalize --output ./egfr_normalized.json`

> **Important**: Bioactivity values come in various units (nM, µM, pM). Use
> `--normalize` to convert all values to nM for consistent comparison. Each
> record will include `normalized_value_nM` and `normalization_note`.

--------------------------------------------------------------------------------

### 5. Drug Information

**Fetch drug details:** `<CAPABILITY_PYTHON> scripts/chembl_api.py drug --id CHEMBL25
--output ./drug.json`

**Drug indications:** `<CAPABILITY_PYTHON> scripts/chembl_api.py drug_indication
--filter molecule_chembl_id=CHEMBL25 --limit 10 --output ./indications.json`

**Filter indications by phase:** `<CAPABILITY_PYTHON> scripts/chembl_api.py
drug_indication --filter molecule_chembl_id=CHEMBL25 max_phase_for_ind=4.0
--limit 10 --output ./approved_indications.json`

**Drug warnings:** `<CAPABILITY_PYTHON> scripts/chembl_api.py drug_warning --limit 5
--output ./warnings.json`

**Mechanisms of action:** `<CAPABILITY_PYTHON> scripts/chembl_api.py mechanism --filter
molecule_chembl_id=CHEMBL25 --limit 5 --output ./mech.json`

--------------------------------------------------------------------------------

### 6. Structure-Based Searches

> **Note**: Both similarity and substructure searches are performed
> **server-side** on ChEMBL's pre-indexed database. They do not require a local
> RDKit installation.

**Similarity search (SMILES + threshold):** `<CAPABILITY_PYTHON> scripts/chembl_api.py
similarity --smiles "CC(=O)Oc1ccccc1C(=O)O" --similarity 85 --limit 5 --output
./similar.json`

**Substructure search (SMILES):** `<CAPABILITY_PYTHON> scripts/chembl_api.py
substructure --smiles "c1ccccc1" --limit 5 --output ./substruct.json`

--------------------------------------------------------------------------------

### 7. Compound Image

Download a 2D structure image (SVG by default, scalable for publication):

```bash
<CAPABILITY_PYTHON> scripts/chembl_api.py image --id CHEMBL25 --output ./chembl25.svg
```

*Options:*

-   `--dimensions`: Image size in pixels (max 500, default 500).
-   `--engine`: Rendering engine (default: rdkit).
-   `--img_format`: Output format — `svg` (default, vector) or `png` (raster).

--------------------------------------------------------------------------------

### 8. Cross-Referencing with Other Databases

ChEMBL integrates with UniProt, Ensembl, PubChem, and other databases. Common
cross-referencing patterns:

**Find a ChEMBL target from a UniProt accession:** `<CAPABILITY_PYTHON> scripts/chembl_api.py target --filter target_components__accession=P00533
--limit 5 --output ./uniprot_target.json`

**Resolve any ChEMBL ID to its entity type:** `<CAPABILITY_PYTHON> scripts/chembl_api.py
chembl_id_lookup --id CHEMBL203 --output ./lookup.json`

**Look up cross-reference sources:** `<CAPABILITY_PYTHON> scripts/chembl_api.py
xref_source --limit 10 --output ./xrefs.json`

> **Tip**: Use the `target_component` endpoint to find UniProt accessions, gene
> names, and protein sequences for any ChEMBL target.

--------------------------------------------------------------------------------

### 9. Pagination

All list endpoints support `--limit` and `--offset` for pagination:

```bash
# First page: 2 results starting at offset 0
<CAPABILITY_PYTHON> scripts/chembl_api.py molecule --limit 2 --offset 0 --output ./page1.json

# Second page: next 2 results starting at offset 2
<CAPABILITY_PYTHON> scripts/chembl_api.py molecule --limit 2 --offset 2 --output ./page2.json
```

The response includes `page_meta` with `total_count`, `limit`, `offset`, `next`,
and `previous` links. Use successive `--offset` values to page through large
result sets.

--------------------------------------------------------------------------------

### 10. Other Endpoints

All remaining endpoints follow the same pattern:

```bash
<CAPABILITY_PYTHON> scripts/chembl_api.py <subcommand> --output <file> [--id ID | --ids ID1;ID2 | --search QUERY] [--limit N] [--offset N] [--filter KEY=VAL ...]
```

**Key subcommands at a glance:**

-   `molecule` (searchable: true): Molecules/compounds — the primary entry point
-   `target` (searchable: true): Drug targets (proteins, organisms, etc.)
-   `activity` (searchable: true): Bioactivity data (IC50, Ki, EC50, etc.)
-   `drug` (searchable: false): Approved drugs
-   `mechanism` (searchable: false): Mechanisms of action
-   `assay` (searchable: true): Assay descriptions
-   `similarity` (searchable: false): Similarity search (special)
-   `substructure` (searchable: false): Substructure search (special)
-   `image` (searchable: false): Compound image download (special)

**Full subcommand list:**

-   `activity_supp` (searchable: false): Supplementary activity data
-   `assay_class` (searchable: false): Assay classifications
-   `atc_class` (searchable: false): ATC drug classifications
-   `binding_site` (searchable: false): Binding site information
-   `biotherapeutic` (searchable: false): Biotherapeutic molecules
-   `cell_line` (searchable: false): Cell line details
-   `chembl_id_lookup` (searchable: true): ChEMBL ID resolution
-   `chembl_release` (searchable: false): Database release info
-   `compound_record` (searchable: false): Compound records
-   `compound_structural_alert` (searchable: false): Structural alerts
-   `document` (searchable: true): Literature documents
-   `document_similarity` (searchable: false): Document similarity
-   `drug_indication` (searchable: false): Drug indications
-   `drug_warning` (searchable: false): Drug safety warnings
-   `go_slim` (searchable: false): GO slim terms
-   `metabolism` (searchable: false): Metabolism data
-   `molecule_form` (searchable: false): Molecule forms (salts/parents)
-   `organism` (searchable: false): Organisms
-   `protein_classification` (searchable: true): Protein classifications
-   `source` (searchable: false): Data sources
-   `target_component` (searchable: false): Target protein components
-   `target_relation` (searchable: false): Target relationships
-   `tissue` (searchable: false): Tissue types
-   `xref_source` (searchable: false): Cross-reference sources
-   `status` (searchable: false): API status check (special)

## Common Options

-   `--output FILE`: **Required.** Output file path for JSON results.
-   `--id ID`: Fetch a single record by ID.
-   `--ids ID1;ID2;...`: Batch fetch multiple records.
-   `--search QUERY`: Free-text search (only for searchable endpoints, marked
    ✓).
-   `--limit N`: Max results to return (default: 5).
-   `--offset N`: Pagination offset.
-   `--filter KEY=VAL`: Filter parameters (can specify multiple).
-   `--normalize`: (activity only) Normalize values to nM.
-   `--dl_format sdf|mol`: (molecule only) Download structure file.

## Reference

-   **API Endpoints Reference**: See
    [references/api_endpoints.md](references/api_endpoints.md) for the full list
    of endpoints and filter operators.

## Workflow

1.  Use `status --output ./status.json` to verify the API is available.
2.  Search for targets, molecules, or drugs using the relevant subcommand.
3.  Read the output JSON file to extract IDs and data.
4.  Use IDs from search results to fetch detailed records.
5.  Query `activity` with filters to get bioactivity data for targets/molecules.
    Use `--normalize` when comparing values across studies.
6.  Use `similarity` or `substructure` for server-side structure-based queries.
7.  Download compound images with `image` or structure files with `molecule
    --dl_format sdf`.
8.  Use `target --filter target_components__accession=<UniProt>` to cross-
    reference with UniProt.
