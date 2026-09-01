---
name: sc-upstream
description: Use when the user wants to process GEO/SRA single-cell upstream data with scu/sc-upstream, write reusable dataset scripts or TOML configs, migrate old prefetch/fasterq/STARsolo shell workflows into scu, or debug scu runs in pulmonary hypertension animal public-data projects.
---

# sc-upstream

## ZeroWall execution contract

These host rules override workflow examples below when they differ.

- Use ZeroWall tools by their actual names and discover optional MCP capabilities with `search_mcp_tools`; do not assume `scu` or any connector is installed.
- Use `run_in_context` with Run Manager for SRA downloads, FASTQ conversion, STARsolo, and other long-running jobs.
- Resolve credentials only through **Settings > Credentials** and approved execution-context environment injection. Never scan project `.env` files.
- Keep network calls, large transfers, overwrites, and destructive cleanup approval-gated. Validate metadata and manifests first.
- Do not install Pixi, `scu`, runtimes, or dependencies automatically. Report the exact missing tool and version requirement instead.
- Use project-relative paths and cross-platform commands. Treat shell examples as illustrative and gate Unix-only commands behind WSL, a container, or SSH.

## Overview

Use this skill to turn public single-cell GEO/SRA datasets into a reproducible `scu` workflow. The preferred output is a dataset-local set of scripts, TOML config, metadata tables, logs, reports, and STARsolo results that can be reviewed and rerun without mixing data products into the `sc-upstream` source tree.

Primary local context:

- `scu` source: `$SC_UPSTREAM_ROOT`
- data root: `$SC_DATA_ROOT`
- common references:
  - mouse STARsolo index: `/path/to/references/mouse-star-index`
  - rat STARsolo index: `/path/to/references/rat-star-index`
  - 10x v2 whitelist: `/path/to/references/737K-august-2016.txt`
  - 10x v3 whitelist: `/path/to/references/3M-february-2018.txt`

## When To Use

Use this skill for tasks like:

- "用 sc-upstream/scu 处理 GSE/PRJNA/SRR 数据"
- "把旧的 prefetch/fasterq/STARsolo 脚本改成 scu 流程"
- "为某个 GEO 数据集写 scripts 和 scu TOML"
- "检查 scu 上游结果、manifest 或 STARsolo Summary.csv"
- "在 pulmonary_hypertension_animal_scdata 里复用之前的上游处理经验"

Do not use this skill for downstream Seurat/Scanpy analysis, cluster annotation, or cell-type labeling unless the user is only asking how to find upstream outputs for those tasks.

## First Read

Before editing or running anything, inspect only the relevant lightweight files:

```bash
sed -n '1,220p' $SC_UPSTREAM_ROOT/README.md
sed -n '1,220p' $SC_UPSTREAM_ROOT/AGENT.md
find <dataset_dir> -maxdepth 3 -type f \( -name '*.md' -o -name '*.toml' -o -name '*.sh' -o -name '*.tsv' \) -print
```

Avoid broad recursive searches across `fastq/`, `sra/`, `results/`, `soloout/`, notebook outputs, or compressed files. These directories can be huge and often contain noisy generated content.

## Operating Rules

- Communicate and deliver in Chinese unless the user asks otherwise.
- Use `pixi run -m $SC_UPSTREAM_ROOT scu ...` unless the user has a release build or active `pixi shell`.
- Keep every dataset self-contained: `metadata/`, `sra/`, `fastq/`, `results/`, `logs/`, `reports/`, `scripts/`, and the dataset TOML stay under that dataset directory.
- Do not run real `prefetch`, `fasterq-dump`, `STARsolo`, `cellranger`, or `kb` steps unless the user clearly asks to execute heavy processing. Prefer writing scripts, dry runs, help checks, manifest checks, and small file validation first.
- Treat missing tools, missing metadata fields, empty target samples, and non-ready manifest rows as fail-fast conditions.
- Prefer absolute paths in TOML when using `pixi run -m`; prior runs showed relative paths can resolve against the `sc-upstream` source context instead of the data directory.
- Do not change `scu` source code to paper over a dataset-specific manifest issue. First fix or review the dataset-local `metadata/starsolo_manifest.tsv`.

## Workflow Choice

Choose the shortest valid path:

1. Fresh GEO/SRA dataset:
   `metadata fetch-geo -> metadata normalize -> filter target GSM/SRX/SRR -> download sra -> convert fasterq -> prepare-starsolo-manifest -> run starsolo`
2. Existing metadata and local `.sra`:
   `metadata normalize -> convert fasterq -> prepare-starsolo-manifest -> run starsolo`
3. GEO supplementary processed matrix only:
   download or organize supplementary files, then stop; do not force `fasterq` or STARsolo when no raw sequencing data is available.
4. Existing FASTQ:
   create or repair `metadata/runs.tsv`, prepare/review manifest, then run STARsolo.

## Standard Directory Layout

Create or reuse this layout inside the dataset directory:

```text
<dataset>/
  scripts/
  metadata/
  sra/
  fastq/
  results/
  logs/
  reports/
```

Keep wrapper scripts in `scripts/`. A useful pattern is either numbered scripts:

```text
scripts/01_fetch_geo.sh
scripts/02_normalize_metadata.sh
scripts/03_filter_targets.sh
scripts/04_download_sra.sh
scripts/05_fasterq.sh
scripts/06_prepare_manifest.sh
scripts/07_check_manifest.sh
scripts/08_run_starsolo.sh
```

or one `plan/run` script that prints commands by default and executes only when called with `run`.

## TOML Defaults

Start from this shape and adapt species, paths, target metadata, threads, jobs, and proxy:

```toml
[runtime]
workdir = "/abs/path/to/dataset"
log_level = "INFO"
dry_run = false

[download]
metadata = "/abs/path/to/dataset/metadata/runs.target.tsv"
out_dir = "/abs/path/to/dataset/sra"
jobs = 2
retries = 3
max_size = "200G"
proxy = ""

[convert]
sra_dir = "/abs/path/to/dataset/sra"
fastq_dir = "/abs/path/to/dataset/fastq"
threads = 16
include_technical = true

[starsolo]
manifest = "/abs/path/to/dataset/metadata/starsolo_manifest.tsv"
fastq_dir = "/abs/path/to/dataset/fastq"
out_dir = "/abs/path/to/dataset/results/starsolo"
threads = 16
jobs = 1
solo_features = ["Gene"]
out_sam_type = "None"

[references]
genome_dir = "/path/to/references/mouse-star-index"
whitelist_v2 = "/path/to/references/737K-august-2016.txt"
whitelist_v3 = "/path/to/references/3M-february-2018.txt"
```

For rat datasets, use `Rat_2024`. If `scu` requires both `whitelist_v2` and `whitelist_v3`, write both even when the expected chemistry uses only one.

## Command Patterns

Use these as the canonical `scu` entry points:

```bash
pixi run -m $SC_UPSTREAM_ROOT scu --help
pixi run -m $SC_UPSTREAM_ROOT scu metadata fetch-geo --geo GSE000000 --out metadata/GSE000000.tsv --workdir /abs/path/to/dataset
pixi run -m $SC_UPSTREAM_ROOT scu metadata normalize --input metadata/GSE000000.tsv --out metadata/runs.tsv --workdir /abs/path/to/dataset
pixi run -m $SC_UPSTREAM_ROOT scu download sra --config /abs/path/to/config.toml --workdir /abs/path/to/dataset
pixi run -m $SC_UPSTREAM_ROOT scu convert fasterq --config /abs/path/to/config.toml --workdir /abs/path/to/dataset
pixi run -m $SC_UPSTREAM_ROOT scu run prepare-starsolo-manifest --config /abs/path/to/config.toml --workdir /abs/path/to/dataset
pixi run -m $SC_UPSTREAM_ROOT scu run starsolo --config /abs/path/to/config.toml --workdir /abs/path/to/dataset
```

If a dataset already has local `.sra` files, skip `fetch-geo` and `download sra` unless metadata is missing or the user asks to redownload.

## Target Filtering

When the user specifies target GSMs/SRXs/SRRs, write a deterministic filter step after `metadata normalize`:

- scan all row values for exact target IDs;
- require every target to match at least once;
- write `metadata/runs.target.tsv`;
- print target-to-run counts for manual review;
- fail on missing targets instead of falling back to fuzzy matching.

## STARsolo Manifest Review

Always review `metadata/starsolo_manifest.tsv` before running STARsolo:

- expected row count matches target sample or experiment count;
- each row has `status=ready`;
- chemistry matches the known kit (`v2` or `v3`);
- each row maps to exactly one intended GSM/SRX/sample;
- multi-run experiments are intentionally grouped by `experiment_accession`;
- barcode/UMI FASTQs and cDNA FASTQs are correct.

Known issue from prior pulmonary hypertension runs: `fasterq-dump --include-technical` can create technical read files that should not enter STARsolo. For one 10x v3.1 dataset, each run produced `_1`, `_2`, `_3`, `_4`; the valid STARsolo inputs were `_3` as barcode+UMI and `_4` as cDNA, while two 10 bp technical reads had to be removed from `barcode_umi_files`. Do not assume this exact numbering for every dataset; verify read lengths and manifest roles.

## STARsolo Defaults And Cautions

- Default to `solo_features = ["Gene"]`.
- Do not promise `Gene + Velocyto` in a single run unless the current `scu` version is verified to pass multiple `--soloFeatures` values correctly. Prior runs saw STAR receive `"Gene Velocyto"` as one token and fail.
- Use conservative parallelism for shared servers: `starsolo.jobs = 1` or `2`; tune `threads` by species index and available RAM.
- For accepted outputs, check `results/starsolo/<sample_id>/Solo.out/Gene/Summary.csv`.
- Report basic QC from `Summary.csv` when available: estimated cells, mean/median UMI per cell, mean/median genes per cell, Q30 CB+UMI, Q30 RNA read, unique mapping to genome, unique mapping to gene.

## Delivery Checklist

For script/config creation tasks, deliver:

- the dataset path used;
- config path;
- script entry point(s);
- target sample IDs and expected count;
- species, chemistry, genome index, whitelist;
- whether heavy steps were run or only prepared;
- validation commands or manifest checks;
- any manual manifest edits needed.

For completed runs, also report:

- `metadata/runs.tsv` and optional `metadata/runs.target.tsv`;
- `metadata/starsolo_manifest.tsv` status;
- `fastq/<run_accession>/` presence;
- `results/starsolo/<sample_id>/Solo.out/Gene/Summary.csv`;
- failures from `reports/` or `logs/`.

## Common Mistakes

- Writing relative TOML paths and then invoking `pixi run -m` from a different context. Prefer absolute paths or pass `--workdir` consistently.
- Letting generated data land in the `sc-upstream` source tree. All run products belong under the dataset directory.
- Running heavy downloads or STARsolo before the user has reviewed target filtering and manifest status.
- Treating a generated manifest as automatically correct. The read-role check is mandatory for 10x data with technical reads.
- Reusing scripts from another dataset without changing target GSMs, species, genome index, whitelist, and expected manifest count.
- Trying to fold downstream Seurat/Scanpy analysis into the upstream delivery. Keep the boundary at usable count outputs unless asked otherwise.
