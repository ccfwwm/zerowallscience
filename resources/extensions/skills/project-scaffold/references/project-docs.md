# Project Documentation Scaffold

Use this reference when designing project documentation from a README.

## README.md

README is the entrypoint for humans and AI. Keep it concise:

```markdown
# Project Name

## Overview
## Project Structure
## Quick Start
## Data And Outputs
## Environment
## AI Context
```

README should link to detailed docs rather than duplicate them.

## AGENTS.md

`AGENTS.md` controls AI behavior. Include:

- required context files to read;
- language policy;
- code and documentation change rules;
- git and large-data boundaries;
- environment management policy;
- workflow/data lineage update policy;
- user authority over project state.

## DATA_MANIFEST.md

Use `docs/DATA_MANIFEST.md` to describe data and external resources that are not tracked by git.

Minimum fields:

```markdown
## Dataset or Resource

- source:
- local_path:
- managed_by:
- used_by:
- status:
- notes:
```

## ENVIRONMENTS.md

Use `docs/ENVIRONMENTS.md` to index environments:

```markdown
## workspace-name

- purpose:
- runtime:
- state:
- manifest:
- check:
- used_by:
```

## Status Policy

Use a small vocabulary:

```text
active       # current formal path
stable       # accepted and reusable
exploratory  # not formal downstream input
deprecated   # replaced but retained
legacy       # old workflow kept for reference
rejected     # abandoned; do not reuse
```

Use status labels in `PROJECT_LOG.md`, `workflow_map.md`, `data_lineage.md`, and `ENVIRONMENTS.md`.
