---
name: pixi-environment-builder
description: Use when creating, migrating, or debugging pixi environments, especially for scientific Python, bioinformatics, single-cell analysis, CUDA/PyTorch, Jupyter/VS Code kernels, conda-to-pixi migration, or conda + PyPI mixed dependency issues.
---

# Pixi Environment Builder

## ZeroWall execution contract

These host rules override workflow examples below when they differ.

- Use ZeroWall tools by their actual names and inspect the current manifests before proposing environment changes.
- Use `run_in_context` with Run Manager for solver, build, or validation jobs that may run for a long time.
- Resolve credentials and private indexes only through **Settings > Credentials** and approved execution-context environment injection. Never scan project `.env` files.
- Keep network access, lockfile replacement, environment removal, and cache deletion approval-gated.
- Do not install Pixi, runtimes, or dependencies automatically. Report the exact missing tool and version requirement instead.
- Use project-relative paths and cross-platform commands. Gate Unix-only examples behind an explicit WSL, container, or SSH context.

## Overview

Use this skill to design, migrate, and debug pixi-managed environments. The core principle is to clarify environment intent before editing `pixi.toml`: version constraints, project scope, package source priority, mirror/network policy, special packages, cache location, and validation tasks.

Pixi can solve dependencies automatically, but mixed conda + PyPI environments need deliberate package ownership. Most hard failures come from unclear ownership, unconstrained top-level packages, inaccessible mirrors, or non-registry packages.

## Preflight Questions

Before creating or changing a pixi environment, ask these questions unless the answer is already known from repo files, user context, or error logs:

1. **Required versions**
   - Are any package versions fixed by previous results, notebooks, papers, models, CUDA drivers, or collaborators?
   - Examples: `python`, `cuda`, `pytorch`, domain packages, model libraries, analysis frameworks.

2. **Environment scope**
   - Is this project-level, user/global-level, or temporary?
   - Project-level: create or edit repo `pixi.toml`.
   - User/global-level: prefer `pixi global` for reusable CLI tools, not complex project workflows.

3. **Package source priority**
   - Should conda or PyPI own the main dependency graph?
   - Which packages should be installed from conda, PyPI, Git, local path, or system modules?
   - Avoid specifying the same package unconstrained in both conda and PyPI.

4. **Multiple environments or kernels**
   - Does the user need separate named environments, solve groups, or Jupyter/VS Code kernels?
   - Clarify whether they need identical packages in separate prefixes or different feature sets.

5. **Mirror and network policy**
   - Which conda channels and mirrors are reachable?
   - Which PyPI index is reachable?
   - Can the machine access GitHub, `pypi.org`, `files.pythonhosted.org`, `prefix.dev`, or internal mirrors?

6. **Non-registry packages**
   - Are any packages installed from local source, private Git repos, wheels, editable paths, or unpublished projects?

7. **Cache and storage**
   - Use pixi defaults unless there is a permissions, quota, or sharing requirement.
   - If custom cache is needed, ask where writable shared cache should live.

8. **Validation**
   - What imports, version checks, CLI commands, GPU checks, or kernel registration prove the environment works?

## Design Rules

### Prefer project-level manifests for project workflows

For analysis projects, put environment definition in the repo:

```toml
[workspace]
name = "project-name"
channels = ["conda-forge"]
platforms = ["linux-64"]
```

Use user/global environments mostly for standalone tools.

### Assign package ownership

Choose one owner for each important package family.

Prefer conda for:

- Python interpreter
- compiled libraries and hard-to-build scientific packages
- CUDA/PyTorch stacks when conda binaries are desired
- R, rpy2, system libraries, CLI bioinformatics tools
- packages requiring consistent native ABI

Prefer PyPI for:

- packages whose canonical release is PyPI
- fast-moving Python-only libraries
- packages unavailable or stale on conda
- top-level frameworks that expect pip-style dependency resolution
- headless/server variants such as `opencv-python-headless`

Avoid this pattern:

```toml
[dependencies]
scanpy = "*"
anndata = "*"
scipy = "*"

[pypi-dependencies]
some-framework-that-also-depends-on-scanpy = "*"
```

This can make conda pin versions before PyPI solves, causing conflicts.

### Start minimal, then add constraints only when evidence requires them

Do not mechanically copy an entire old conda environment. Start from:

- interpreter/runtime
- top-level packages the user directly uses
- hardware/runtime packages
- Jupyter/kernel tooling if needed
- non-registry packages

Add transitive pins only when solver output or runtime validation proves they are needed.

## Migrating From Conda

When migrating an existing conda/mamba environment:

1. Inspect by path if env-name lookup is unreliable:

```bash
conda list -p /path/to/env
conda env export -p /path/to/env --no-builds
```

2. Identify direct imports and notebook evidence:

```bash
rg -n "^(import|from) " scripts src notebooks tests --glob '*.py' --glob '*.ipynb'
rg -n "Version:|__version__|import " notebooks scripts --glob '*.ipynb'
```

3. Classify packages:
   - direct user dependencies
   - transitive dependencies
   - runtime/system dependencies
   - local/Git/private packages
   - packages only needed for old experiments

4. Preserve known compatibility anchors:
   - versions printed in notebook outputs
   - versions required by published workflow
   - CUDA/PyTorch compatibility
   - package versions known to affect results

5. Leave unrelated transitive packages out of `pixi.toml`.

## Multiple Environments And Kernels

Use multiple named environments when the user needs isolation or parallel notebooks.

Use one solve group when environments should have identical package versions:

```toml
[environments]
worker-1 = { solve-group = "analysis" }
worker-2 = { solve-group = "analysis" }
worker-3 = { solve-group = "analysis" }
```

Use separate features when environments differ:

```toml
[feature.gpu.dependencies]
pytorch-cuda = "*"

[feature.r.dependencies]
r-base = "*"

[environments]
cpu = []
gpu = ["gpu"]
r-analysis = ["r"]
```

For VS Code/Jupyter kernels, add explicit kernel tasks:

```toml
[tasks]
kernel-1 = "python -m ipykernel install --user --name worker-1 --display-name 'Python (worker-1)'"
kernel-2 = "python -m ipykernel install --user --name worker-2 --display-name 'Python (worker-2)'"
kernels = "pixi run -e worker-1 kernel-1 && pixi run -e worker-2 kernel-2"
```

Tell VS Code users: after registration, select the kernel in VS Code; they do not need to launch notebooks through `pixi run`.

## Mirrors And Network

Use mirrors deliberately. Do not assume a mirror works for all package types.

Recommended checks:

```bash
pixi config list
sed -n '1,120p' ~/.config/uv/uv.toml 2>/dev/null
sed -n '1,120p' ~/.config/pip/pip.conf 2>/dev/null
env | rg "PIP|UV|PIXI|RATTLER|HTTP|HTTPS|PROXY"
```

For PyPI, prefer setting only the index URL in `pixi.toml`:

```toml
[pypi-options]
index-url = "https://example-mirror/simple"
```

Avoid unnecessary `files.pythonhosted.org` mirror rewrites unless verified. Some mirrors serve simple index pages but fail wheel metadata URLs.

If official PyPI times out, switch to a reachable mirror. If a mirror gives 404 for metadata, try another mirror or direct official file host.

For conda, use `.pixi/config.toml` mirrors when needed:

```toml
[mirrors]
"https://conda.anaconda.org/conda-forge" = [
  "https://your-conda-mirror/anaconda/cloud/conda-forge",
  "https://conda.anaconda.org/conda-forge"
]
```

## Conda + PyPI Mapping

Pixi needs conda-to-PyPI name mapping when conda and PyPI dependencies are mixed. If fetching mapping from `prefix.dev` fails, use a local mapping file.

In `pixi.toml`:

```toml
[workspace]
conda-pypi-map = { "conda-forge" = "config/conda-pypi-map.json" }
```

Example `config/conda-pypi-map.json`:

```json
{
  "scikit-learn": "scikit-learn",
  "matplotlib-base": "matplotlib",
  "pytorch": "torch",
  "torchvision": "torchvision",
  "torchaudio": "torchaudio"
}
```

Validate it:

```bash
python -m json.tool config/conda-pypi-map.json
```

Keep this mapping small and project-specific. Add entries only for packages relevant to mixed solving.

## Non-Registry Packages

If a package is not found on PyPI or conda, inspect how it was installed before guessing.

Check old environment metadata:

```bash
find /path/to/env/lib/python*/site-packages -maxdepth 3 \
  \( -iname '*dist-info' -o -path '*dist-info/direct_url.json' \)
```

Use local path dependency when reproducible on this machine:

```toml
[pypi-dependencies]
my-package = { path = "/absolute/path/to/source" }
```

Use Git dependency when portability matters:

```toml
[pypi-dependencies]
my-package = { git = "https://github.com/org/repo.git", rev = "commit-sha" }
```

Prefer a fixed commit/tag for reproducibility.

## Common Failure Patterns

### Package not found in registry

Root cause: package is unpublished, private, named differently, or only installed from source.

Actions:
- Inspect old `direct_url.json`.
- Search project docs for install command.
- Use path or Git dependency.
- Do not keep retrying PyPI.

### Version conflict after conda solve

Root cause: conda pinned a transitive package version that conflicts with PyPI requirements.

Actions:
- Read the solver message for pinned packages.
- Decide whether top-level package should own those dependencies.
- Remove conda-side transitive packages, or bound them to a compatible range.
- Pin only compatibility anchors, not every transitive package.

### Network timeout fetching PyPI package

Root cause: inaccessible PyPI index, file host, proxy, or mirror.

Actions:
- Check current `[pypi-options] index-url`.
- Check user uv/pip config for reachable mirrors.
- Change only PyPI index first.
- Clean PyPI cache and retry.

```bash
pixi clean cache --pypi -y
pixi install --all
```

### Mirror metadata 404

Root cause: simple index mirror works but wheel metadata/file mirror is incomplete.

Actions:
- Remove `files.pythonhosted.org` mirror rewrites.
- Use a different PyPI index.
- Avoid mixing multiple PyPI mirror layers unless verified.

### OpenCV solve conflict

Root cause: conda `opencv` pulls GUI/Qt/Python ABI-specific builds.

Server/headless fix:

```toml
[pypi-dependencies]
opencv-python-headless = ">=4.10,<5"
```

Use conda `opencv` only when GUI functionality is required.

### CUDA/PyTorch mismatch

Root cause: CUDA runtime, driver, PyTorch build, and channel priorities disagree.

Actions:
- Ask for `nvidia-smi`.
- Pin CUDA runtime intentionally.
- Use a single coherent PyTorch source.
- Validate with `torch.cuda.is_available()`.

## Cache Guidance

Pixi has default cache. Do not create custom cache directories unless the user requests shared cache, has permission errors, or needs a specific storage path.

Useful commands:

```bash
pixi clean cache --pypi -y
pixi clean cache --repodata -y
pixi clean cache --mapping -y
```

If custom cache is needed:

```bash
PIXI_CACHE_DIR=/path/to/pixi-cache \
RATTLER_CACHE_DIR=/path/to/rattler-cache \
pixi install --all
```

## Verification Tasks

Add a `check` task for complex environments. It should verify the actual success criteria, not just installation.

Examples:

```toml
[tasks]
check = "python -c \"import sys; print(sys.version)\""
```

For GPU Python environments:

```toml
check = "python -c \"import torch; print(torch.__version__); print(torch.version.cuda); print(torch.cuda.is_available()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NO GPU')\""
```

Run:

```bash
pixi run -e <environment> check
```

For Jupyter/VS Code workflows, verify kernel registration separately:

```bash
pixi run kernels
jupyter kernelspec list
```

## OpenBLAS Thread Tuning For R Environments

conda-forge `r-base` ships with OpenBLAS, but when `OPENBLAS_NUM_THREADS` is unset on a
high-core server, the default thread scheduling is extremely poor — SVD on 96 cores
without explicit thread count is *slower* than single-threaded. This directly impacts
Seurat `RunPCA()` (backed by `irlba()` randomized SVD).

### When To Apply

- User reports RunPCA / SVD / matrix operations are slow in a pixi R environment
- `OPENBLAS_NUM_THREADS` and `OMP_NUM_THREADS` are both unset
- Multi-core Linux server (>16 cores)

### Diagnostic Flow

#### Step 1 - Confirm BLAS Implementation

```bash
PREFIX=$(pixi info --manifest-path pixi-workspaces/<env>/pixi.toml 2>/dev/null | grep "Prefix location" | awk '{print $NF}')
readlink -f "$PREFIX/lib/libblas.so.3"
```

- Points to `libopenblasp-*.so` → OpenBLAS, this section applies
- Points to `libflexiblas.so` → different approach needed (FlexiBLAS backend switching)

#### Step 2 - Baseline Benchmark

```bash
pixi run --manifest-path pixi-workspaces/<env>/pixi.toml \
  Rscript -e '
  cat("OPENBLAS_NUM_THREADS =", Sys.getenv("OPENBLAS_NUM_THREADS"), "\n")
  set.seed(42); n <- 3000; X <- matrix(rnorm(n*n), n, n)
  t <- system.time({ svd(X, nu=10, nv=0) })
  cat("SVD(3000) time:", round(t["elapsed"], 3), "sec\n")
  cat("Detected cores:", parallel::detectCores(), "\n")
  '
```

- SVD(3000) > 15 sec on 96 cores → confirmed thread scheduling problem
- SVD(3000) < 5 sec → already optimized, no action needed

#### Step 3 - Thread Count Sweep

```bash
for threads in 1 8 16 32 64; do
    echo "=== OPENBLAS_NUM_THREADS=$threads ==="
    OPENBLAS_NUM_THREADS=$threads OMP_NUM_THREADS=$threads \
    pixi run --manifest-path pixi-workspaces/<env>/pixi.toml \
    Rscript -e '
    set.seed(42); n <- 3000; X <- matrix(rnorm(n*n), n, n)
    t <- system.time({ svd(X, nu=10, nv=0) })
    cat("SVD(3000) time:", round(t["elapsed"],3), "sec\n")
    ' 2>/dev/null
done
```

#### Step 4 - Pick Optimal Thread Count

Benchmark results on AMD EPYC 7K62 (96 cores, Zen2):

| Threads | SVD(3000) Time | Speedup |
|---------|---------------|---------|
| Default (unset) | ~20 sec | 1x (baseline) |
| 1 | ~12 sec | 1.6x |
| 8 | ~3.8 sec | 5.2x |
| 16 | ~3.2 sec | 6.2x |
| **32** | **~2.9 sec** | **6.8x (optimal)** |
| 64 | ~3.3 sec | 6.0x (overhead degrades) |

**Rule of thumb**: optimal thread count ≈ 1/3 of total cores (96→32, 64→16-24, 32→8-16).
Beyond the sweet spot, thread synchronization overhead degrades performance.

### Fix - pixi.toml activation.env (Recommended)

Add `[activation.env]` to the workspace `pixi.toml`:

```toml
[activation.env]
OPENBLAS_NUM_THREADS = "32"
OMP_NUM_THREADS = "32"
```

Takes effect on every `pixi run` or environment activation. Jupyter kernels (IRkernel)
registered via `pixi run kernel` also inherit these variables.

### Gotchas

- **Do NOT use all cores**: 96 cores fully loaded is ~15% slower than 32 threads
- **Set OMP_NUM_THREADS too**: some R packages (data.table, RcppParallel) use OpenMP
- **conda-forge r-base already links OpenBLAS**: unlike system R (/opt/R), no need to
  manually replace libRblas.so symlinks
- **Optimal thread count varies by CPU**: AMD EPYC (Zen2) vs Intel Xeon may differ

## Debugging Discipline

- Treat each error type separately: network timeout, package not found, version conflict, mapping failure, runtime import failure.
- Change one thing per solver error where possible.
- Do not rewrite the manifest blindly after every failure.
- Do not run install commands if the user asked only for diagnosis or commands.
- Explain whether warnings are harmless or actionable.
