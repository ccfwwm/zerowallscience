# Git And Data Boundary

Use this reference when creating `.gitignore`, git policy sections, or data/output conventions.

## Git Tracks

Git should usually track:

- `README.md`
- `AGENTS.md`
- `.gitignore`
- `docs/`
- `scripts/`, `src/`, `utils/`, notebooks when intentionally source-like
- `pixi.toml`, `pixi.lock`
- `pixi-workspaces/*/pixi.toml`
- `pixi-workspaces/*/pixi.lock`
- small example configs or manifests

## Git Does Not Track

Git should usually ignore:

```text
data/
output/
result/
figure/
tmp/
scratch/
.pixi/
__pycache__/
.Rhistory
.RData
*.rds
*.qs
*.h5ad
*.loom
*.bam
*.fastq
*.fq
*.gz
```

Adjust extensions by project. Do not ignore source notebooks or small metadata files merely because the project is data-heavy.

## Large Resources

Reference genomes, indexes, downloaded databases, model weights, and large public datasets should not be Pixi packages and should not enter git.

Track them through `docs/DATA_MANIFEST.md`:

```markdown
## Resource name

- source:
- local_path:
- expected_files:
- rebuild_or_download:
- status:
- notes:
```

## Generated Artifacts

Generated data and figures do not enter git by default. If they become formal project outputs, document them with:

- `workflow_map.md` for script-level flow;
- `data_lineage.md` for result-level provenance;
- `PROJECT_LOG.md` for accepted milestones.
