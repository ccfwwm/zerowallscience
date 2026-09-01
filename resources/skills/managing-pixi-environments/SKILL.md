---
name: managing-pixi-environments
description: Use when a user needs long-term Pixi environment governance for a large project, including auditing pixi.toml or pixi.lock, splitting workspaces, naming environments, migrating conda or mixed conda/PyPI stacks, handling GPU/R/Python/CLI toolchains, Jupyter kernels, or reproducible environment policy.
---

# Managing Pixi Environments

## ZeroWall execution contract

These host rules override workflow examples below when they differ.

- Use ZeroWall tools by their actual names and inspect the current manifests before proposing environment changes.
- Use `run_in_context` with Run Manager for solver, build, or validation jobs that may run for a long time.
- Resolve credentials and private indexes only through **Settings > Credentials** and approved execution-context environment injection. Never scan project `.env` files.
- Keep network access, lockfile replacement, environment removal, and cache deletion approval-gated.
- Do not install Pixi, runtimes, or dependencies automatically. Report the exact missing tool and version requirement instead.
- Use project-relative paths and cross-platform commands. Gate Unix-only examples behind an explicit WSL, container, or SSH context.

## Overview

Use this skill to manage Pixi environments as long-lived project infrastructure, not as one-off install targets. The core rule is to define environment boundaries by technical ownership and maintenance lifecycle: unrelated stacks should not share one `pixi.lock` merely for convenience.

This skill complements `pixi-environment-builder`: use that skill for concrete package solving, dependency debugging, mirror failures, and implementation-level Pixi edits. Use this skill first when deciding how environments should be organized, audited, named, migrated, documented, and maintained.

## First Response

When this skill triggers, start by stating the management frame:

- Identify whether the user wants assessment, design, migration, cleanup, or documentation.
- Inspect existing Pixi files before proposing structure.
- Prefer read-only audit commands unless the user explicitly asks to modify files.
- Do not create formal names, directories, kernels, or tasks until the project owner confirms naming.

If the user asks for implementation, proceed incrementally: audit first, then propose boundaries, then migrate one workspace at a time.

## Audit Workflow

Begin with the current state. Use `rg` and Pixi read-only commands first.

```bash
rg --files -g 'pixi.toml' -g 'pixi.lock' -g '.pixi/config.toml'
pixi info
pixi list -e <ENVIRONMENT> --explicit --frozen
pixi list -e <ENVIRONMENT> --frozen
```

Prefer `--frozen` during audits. Plain `pixi list` may trigger workspace checks or solving in large mixed workspaces, which can be slow or misleading when the goal is to inspect the current lockfile.

Record these fields for each environment:

| Field | What to Capture |
| --- | --- |
| Current name | Workspace, environment, feature, kernel, task |
| Purpose | What analysis or workflow it supports |
| Runtime | Python, R, Julia, Java, CLI tools, CUDA, etc. |
| Version anchors | Python/R, CUDA, PyTorch/JAX, domain packages |
| Package sources | Conda, PyPI, Git, local path, system module |
| GPU | Required, optional, none |
| Jupyter | Lab host, kernel only, none |
| State | Active, Experimental, Legacy, Archived |
| Validation | Imports, CLI versions, GPU checks, minimal workflow |
| Risk | Conflicts, slow solves, local paths, missing data, huge prefix |

For installed-prefix evidence, use direct interpreters when Pixi commands are slow:

```bash
.pixi/envs/<ENV>/bin/python -c "import importlib.metadata as m; print(m.version('scanpy'))"
.pixi/envs/<ENV>/bin/Rscript -e "sessionInfo()"
```

## Boundary Rules

Split into independent workspaces when any major condition applies:

| Condition | Default Decision |
| --- | --- |
| Different Python major/minor runtime | Split |
| Python and R have different lifecycles | Usually split |
| Different CUDA runtime or driver expectations | Split |
| JAX and PyTorch are both complex top-level owners | Usually split |
| CLI workflow tools are unrelated to notebooks | Split |
| Stable and fast-moving experimental stacks differ | Split |
| Legacy notebooks need old package constraints | Split or isolate as legacy |
| One stack should change without solving another | Split |
| A workspace has become very large or slow to solve | Split candidates |

Keep environments in one workspace when they are genuinely coupled:

| Condition | Pixi Pattern |
| --- | --- |
| Same dependency graph, separate working prefixes | multiple environments with one `solve-group` |
| Same base, optional small add-ons | features |
| CPU/GPU variants with shared core versions | feature plus explicit validation |
| Notebook/test/dev variants that update together | same workspace |

Remember: all environments in one workspace share one `pixi.lock`. If a dependency change in one technical domain should not affect another, they do not belong in the same workspace.

## Recommended Architecture

For large projects, prefer a root orchestration workspace plus independent child workspaces:

```text
project-root/
├── pixi.toml
├── pixi.lock
├── pixi-workspaces/
│   ├── <WORKSPACE_A>/
│   │   ├── pixi.toml
│   │   ├── pixi.lock
│   │   └── README.md
│   └── <WORKSPACE_B>/
│       ├── pixi.toml
│       ├── pixi.lock
│       └── README.md
└── docs/
    └── ENVIRONMENTS.md
```

The root workspace should be thin. It should provide tasks that call child workspaces:

```toml
[tasks]
analysis-check = "pixi run --manifest-path pixi-workspaces/<WORKSPACE> check"
analysis-kernel = "pixi run --manifest-path pixi-workspaces/<WORKSPACE> kernel"
check-all = { depends-on = ["analysis-check", "tools-check"] }
```

The root workspace should not carry heavy analysis dependencies unless it is itself the analysis workspace.

## Naming Governance

Do not turn examples into final names. Before creating formal directories, kernels, or task names, produce a confirmation table:

| Temporary ID | Purpose | Runtime | GPU | Suggested Name | Final Name |
| --- | --- | --- | --- | --- | --- |
| Workspace A | Main analysis | Python | Optional | pending | pending |
| Workspace B | Orthology tools | CLI | No | pending | pending |
| Workspace C | R conversion | R/Bioconductor | No | pending | pending |

Recommend names that:

- use lowercase and hyphens;
- avoid personal names and unclear numbers;
- avoid `new`, `latest`, `final`, and date-only names;
- describe the technical purpose;
- keep workspace, environment, kernel, and task names semantically aligned.

Good name patterns:

```text
<domain>-<purpose>
<purpose>-<runtime>
<purpose>-<variant>
```

Examples are placeholders only: `analysis-core`, `training-gpu`, `conversion-r`, `orthology-tools`, `legacy-omicverse`.

## Dependency Ownership

Each workspace should have a package ownership table. Decide which resolver owns each important package family before editing `pixi.toml`.

Prefer conda for:

- Python/R interpreters;
- CUDA, PyTorch stacks when using conda binaries;
- R, Bioconductor, `rpy2`;
- HDF5, image codecs, FAISS, compiled scientific libraries;
- bioinformatics CLI tools such as `samtools`, `bedtools`, `diamond`, `mmseqs2`;
- packages where native ABI consistency matters.

Prefer PyPI for:

- packages absent or stale on conda;
- fast-moving Python frameworks whose canonical releases are PyPI;
- Python-only packages;
- Git or local editable project packages;
- headless variants such as `opencv-python-headless`.

Avoid letting conda and PyPI compete for the same dependency family without intent. For mixed environments, keep `conda-pypi-map` small and project-specific.

## Local Paths and Non-Registry Packages

Treat local path dependencies as reproducibility risks:

```toml
[pypi-dependencies]
my-package = { path = "/home/user/src/my-package" }
```

When auditing, record each local path dependency and decide whether to:

- replace it with a Git URL plus tag or commit;
- vendor it as a project submodule or package;
- keep it only in an experimental or personal workspace;
- document why it cannot be made portable.

Do not silently preserve absolute personal paths in a formal reproducible workspace.

## Data and External Resources

Separate environment definition from data resources. Large databases, reference genomes, model weights, indexes, and downloaded annotation resources should not be treated as Pixi packages.

For each external resource, define:

- storage location;
- download or build command;
- expected files and sizes;
- checksum or integrity check when possible;
- validation task independent from package installation.

Example checks:

```bash
test -s resource/db/example.db
diamond version
emapper.py --version
```

If a CLI tool is installed but its database is missing or zero bytes, report the environment as installed but not workflow-ready.

## Jupyter Strategy

Use one primary JupyterLab host when possible. Other workspaces should usually install only `ipykernel` and register kernels.

Kernel tasks should be explicit:

```toml
[tasks]
kernel = "python -m ipykernel install --user --name <KERNEL_NAME> --display-name '<DISPLAY_NAME>'"
```

Before registering formal kernels, confirm:

| Workspace | Internal Kernel Name | Display Name | Status |
| --- | --- | --- | --- |
| pending | pending | pending | pending |

Kernel names should reflect technical purpose, not temporary numbering.

## Health Checks

Every formal workspace needs a `check` task. It should prove the environment's actual purpose, not just print Python version.

Include relevant checks:

- runtime executable and version;
- major imports and versions;
- GPU visibility for GPU workspaces;
- CLI tool versions for workflow workspaces;
- R/Bioconductor package load for R workspaces;
- minimal smoke test that exercises the intended stack;
- external data readiness when needed.

GPU example:

```toml
[tasks]
check = "python -c \"import torch; print(torch.__version__); print(torch.version.cuda); print(torch.cuda.is_available()); print(torch.cuda.device_count())\""
```

R example:

```toml
[tasks]
check = "Rscript -e \"library(anndataR); library(zellkonverter); sessionInfo()\""
```

CLI example:

```toml
[tasks]
check = "diamond version && mmseqs version && test -s resource/eggnog_mapper/eggnog.db"
```

## Migration Sequence

Do not perform a big-bang rewrite. Use this sequence:

1. Audit current environments and kernels.
2. Classify environments by technical domain and lifecycle.
3. Create a naming confirmation table.
4. Choose one low-risk pilot workspace.
5. Create a minimal `pixi.toml` from direct dependencies only.
6. Generate and install the lockfile.
7. Add a meaningful `check` task.
8. Register a kernel if needed.
9. Validate representative scripts or notebooks.
10. Document the workspace in `docs/ENVIRONMENTS.md`.
11. Mark the old environment as Legacy, not Deleted.
12. Repeat one technical domain at a time.

Good pilot candidates are isolated tool or conversion stacks. Avoid starting with the largest CUDA analysis environment unless the user explicitly needs that first.

## Daily Operations

Use child workspace manifests explicitly:

```bash
pixi run --manifest-path pixi-workspaces/<WORKSPACE> check
pixi shell --manifest-path pixi-workspaces/<WORKSPACE>
pixi add --manifest-path pixi-workspaces/<WORKSPACE> <PACKAGE>
pixi add --manifest-path pixi-workspaces/<WORKSPACE> --pypi <PACKAGE>
```

For reproducible runs, prefer:

```bash
pixi run --locked --manifest-path pixi-workspaces/<WORKSPACE> <TASK>
```

For audits, prefer:

```bash
pixi list --frozen --manifest-path pixi-workspaces/<WORKSPACE>
```

## Git and Configuration Policy

Commit:

- root and child `pixi.toml`;
- root and child `pixi.lock`;
- workspace README files;
- `docs/ENVIRONMENTS.md`;
- check scripts and lightweight management scripts.

Do not commit:

- `.pixi/`;
- caches;
- databases, indexes, model weights, or generated results;
- private tokens, proxy credentials, or personal auth files.

Mirror and proxy policy:

- Put credentials and personal proxy settings in user-level config.
- Project-level mirror config is acceptable only when it is deliberately part of project reproducibility and contains no secrets.
- Document required network assumptions if a mirror is essential.

## Report Template

When asked to analyze or propose Pixi environment management, use this structure:

```markdown
**Current State**
[What exists: workspaces, environments, lockfiles, kernels, major stacks]

**Main Risks**
[Slow solves, shared lockfile risks, mixed CUDA, local paths, missing resources]

**Recommended Boundaries**
[Workspace split table with rationale]

**Naming Decisions Needed**
[Names the project owner must confirm]

**Pilot Migration**
[One low-risk first workspace and validation criteria]

**Next Steps**
[Concrete commands or file changes, scoped to the requested level]
```

## Common Mistakes

- Splitting by temporary numbers instead of technical domains.
- Keeping unrelated stacks in one lockfile because they live in one repository.
- Copying every transitive package from an old environment into `pixi.toml`.
- Installing packages with `pip` inside a formal environment and forgetting to update `pixi.toml`.
- Treating external databases as if Pixi installed them.
- Registering permanent Jupyter kernels with temporary names.
- Running full upgrades in stable environments without a branch and validation plan.
- Deleting legacy environments before notebooks and results are proven reproducible elsewhere.
