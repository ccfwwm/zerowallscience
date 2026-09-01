---
name: bioinfor-public-data-access
description: "Plan, configure, validate, and document portable public-bioinformatics data acquisition. Use for GEO/GSE/GDS, SRA/ENA, TCGA/GDC, GTEx, DepMap, public expression matrices, raw reads, release files, manifests, resumable downloads, and reusable local caches. Keep the workflow provider-neutral: DepMap is one optional source, never the default architecture."
---

# Public Bioinformatics Data Access

## ZeroWall execution contract

These host rules override workflow examples below when they differ.

- Use ZeroWall tools by their actual names and discover optional MCP capabilities with `search_mcp_tools`; do not assume a connector is installed.
- Use `python` for plan validation and bounded metadata work; use `run_in_context` with Run Manager for long-running downloads or compute.
- Resolve credentials only through **Settings > Credentials**. Never create, scan, or load project `.env` files and never print secret values.
- Keep network calls, large transfers, paid APIs, overwrites, and destructive changes approval-gated. Build and validate the plan first.
- Do not install runtimes or dependencies automatically. Report the exact missing runtime or package instead.
- Keep raw data and manifests inside the active project or Session workspace, using project-relative paths where practical.

Build a reproducible acquisition plan before downloading. Treat GEO, SRA/ENA,
GDC, GTEx, and DepMap as independent providers behind one provider-neutral
workflow. Do not require a provider-specific toolkit or machine-specific checkout.

## Workflow

1. **Clarify the dataset contract.** Identify the provider, accession/project,
   release, modality, smallest useful data product, filters, target directory,
   expected scale, and downstream analysis.
2. **Inspect before transfer.** Use available MCP/connectors or official
   metadata endpoints to list releases, files, samples, sizes, and checksums.
   Do not start a bulk transfer during discovery.
3. **Write a provider-neutral plan.** Run `scripts/public_data_plan.py init`.
   Store the plan next to the future dataset as `download-plan.json`.
4. **Validate and review.** Run `validate`, show the user the resolved provider,
   transport, filters, limits, output location, and known size. Wait for explicit
   confirmation before a large, paid, authenticated, or overwrite-capable job.
5. **Select the adapter at runtime.** Prefer an already available ZeroWall MCP tool
   for metadata and small queries. Prefer official HTTPS/FTP or provider clients
   for bulk files. Use an external project only when it is installed and record
   its version in the plan/manifest.
6. **Acquire safely.** Reuse existing valid files, resume partial transfers when
   supported, keep raw files immutable, and never place credentials in the plan.
7. **Verify and hand off.** Check expected files, byte sizes, checksums when
   available, and sample/file counts. Generate `manifest.json` with the script.

## Provider routing

| Provider | Discovery and small queries | Bulk acquisition | Typical products |
|---|---|---|---|
| GEO | GEO metadata connector, NCBI E-utilities | NCBI GEO HTTPS/FTP | series matrix, SOFT, supplementary files |
| SRA/ENA | RunInfo or ENA Portal API | ENA HTTPS/FTP or SRA Toolkit | FASTQ, run metadata |
| GDC | GDC files/cases API | manifest + `gdc-client`, or HTTPS for bounded files | expression, mutation, CNV, clinical, methylation |
| GTEx | GTEx expression connector/API | official release files for matrices | gene/tissue queries, median or sample expression |
| DepMap | DepMap model/release metadata | official release file endpoint | model metadata, expression, mutation, dependency |
| custom | User-provided catalog/API | explicit HTTPS/FTP URLs | provider-specific files |

Read `references/provider-routing.md` before implementing or changing a
provider adapter. DepMap-specific flags or release semantics must stay inside
the DepMap adapter; they must not shape the common plan schema.

## Create and validate a plan

```bash
python scripts/public_data_plan.py init \
  --provider geo \
  --identifier GSE12345 \
  --data-type series-matrix \
  --output-dir data/public/geo/GSE12345 \
  --plan data/public/geo/GSE12345/download-plan.json

python scripts/public_data_plan.py validate \
  data/public/geo/GSE12345/download-plan.json
```

Filters are provider-specific but encoded uniformly as repeated `key=value`
pairs:

```bash
python scripts/public_data_plan.py init \
  --provider gdc \
  --identifier TCGA-BRCA \
  --data-type expression \
  --filter workflow_type="STAR - Counts" \
  --filter sample_type="Primary Tumor" \
  --max-files 20 \
  --transport gdc-client \
  --plan data/public/gdc/TCGA-BRCA/download-plan.json
```

The planner does not download data. It produces a reviewable contract. See
`references/download-plan-schema.md` for the complete schema.

## Generate a manifest

After acquisition:

```bash
python scripts/public_data_plan.py manifest \
  data/public/geo/GSE12345/download-plan.json \
  --scan-dir data/public/geo/GSE12345 \
  --output data/public/geo/GSE12345/manifest.json
```

Use SHA-256 for modest datasets and provider checksums for large archives. For
very large datasets, `--checksum none` is acceptable only when official
checksums or immutable object identifiers are recorded elsewhere.

## Safety and reproducibility rules

- Default to `overwrite=false`, `resume=true`, and the minimum useful subset.
- Never translate an exploratory request into “download everything.”
- Keep provider metadata, query/filter payloads, release/version, transport,
  tool version, URLs/object identifiers, and validation results.
- Separate immutable source files from normalized/derived outputs.
- Do not treat a successful HTTP response as a valid dataset; verify content.
- Do not embed API keys, cookies, signed URLs, SSH keys, or bearer tokens.
- Use structured runs or a remote execution context for long transfers rather
  than extending an interactive shell timeout.
- If an adapter or connector cannot perform the requested transfer, stop after
  producing the validated plan and report the missing capability explicitly.

## ZeroWall Science integration

- Discover the live connector/tool catalog instead of assuming exact MCP tool
  names; installations can expose different provider adapters.
- Use connectors for discovery and bounded queries, then official transfer
  mechanisms for large files.
- Keep outputs under the active project, normally `data/public/<provider>/...`.
- The optional `kernel.py` sidecar exposes plan creation and validation helpers
  in ZeroWall's persistent Python runtime.
- Treat this skill as an acquisition/orchestration layer. Downstream QC,
  statistics, annotation, and visualization belong to other skills.
