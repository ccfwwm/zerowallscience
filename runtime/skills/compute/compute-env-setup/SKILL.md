---
name: compute-env-setup
description: >
  General compute environment configuration and dependency management.
  Use this skill to set up reproducible compute environments across local,
  remote, and cloud platforms with proper dependency isolation and version control.
---

# Compute Environment Setup

Configure reproducible compute environments for scientific workflows. This skill
covers general environment management principles, dependency isolation, and
cross-platform setup patterns that apply to Python, R, Julia, and containerized
environments.

## When to use

- Setting up a new research project with specific software dependencies
- Creating reproducible environments for published analyses
- Managing multiple projects with conflicting dependencies
- Preparing environments for remote or cloud compute

## Core principles

1. **Isolation**: Each project gets its own environment
2. **Reproducibility**: Pin exact versions of all dependencies
3. **Documentation**: Record environment setup in version control
4. **Portability**: Use cross-platform tools when possible

## Environment management tools

### Python
```bash
# Using conda
conda create -n myproject python=3.11
conda activate myproject
conda install numpy pandas scipy

# Using venv + pip
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### R
```r
# Using renv
renv::init()
renv::install("tidyverse")
renv::snapshot()
```

### Julia
```julia
# Using Pkg
using Pkg
Pkg.activate(".")
Pkg.add("DataFrames")
Pkg.instantiate()
```

## Recording dependencies

**Python**: `requirements.txt` or `environment.yml`
```bash
pip freeze > requirements.txt
conda env export > environment.yml
```

**R**: `renv.lock`
```r
renv::snapshot()
```

**Julia**: `Project.toml` and `Manifest.toml` (automatic)

## Container-based environments

For maximum reproducibility, use Docker or Apptainer:

```dockerfile
FROM python:3.11-slim
WORKDIR /workspace
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
```

## Best practices

- **Pin versions**: Use exact versions (`numpy==1.24.3`) not ranges (`numpy>=1.24`)
- **Separate concerns**: Keep development dependencies separate from runtime
- **Test portability**: Verify environment setup on a fresh system
- **Document platform requirements**: Note OS, CPU/GPU, memory requirements
- **Use lock files**: Commit `requirements.txt`, `environment.yml`, `renv.lock`, or `Manifest.toml`

## Common issues

| Issue | Solution |
|---|---|
| Dependency conflicts | Use conda for complex scientific stacks; separate environments |
| Missing system libraries | Document and install system deps before Python/R packages |
| Version drift | Use lock files and pin all versions |
| Platform differences | Test on target platforms; use containers for strict reproducibility |

## Related skills

- `local-env-setup` — Detailed local Python/R/Julia setup
- `remote-compute-ssh` — Apply these patterns on remote systems
- `remote-compute-modal` — Serverless compute with managed environments

---

**Next:** Test environment portability, document setup steps in README, or
containerize for maximum reproducibility.
