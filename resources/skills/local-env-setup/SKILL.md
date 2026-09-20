---
name: local-env-setup
description: Diagnose ZeroWall managed Python, scientific tools and MCP initialization. Remote compute uses compute-env-setup.
license: Apache-2.0
---

# Local environment

ZeroWall uses its signed Python 3.12.10 runtime and managed snapshots. It does not require a separately downloaded Python, uv or venv.

1. Discover `python_environment` with `tool_search` and dispatch `action="info"` to inspect the actual interpreter, snapshot, packages and health.
2. Load `zerowall-python-packages` for dependency changes. Preview and obtain confirmation before applying; never modify the active snapshot with pip, uv, conda or global PATH settings.
3. Discover `mcp_connect` to inspect connections. Configure credentials in Settings. A disconnected MCP is not proof of missing Python dependencies.
4. Query task status after changes and retain the previous healthy environment on failure.

External BLAST, MUSCLE, Nextflow, MATLAB and GPU runtimes are separate prerequisites. Inspect them for the requested task. Explicitly requested independent pixi projects use `managing-pixi-environments`; SSH environments use `compute-env-setup`.
