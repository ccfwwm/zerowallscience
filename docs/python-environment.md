# ZeroWall Python environment

The Windows x64 shared CPU research environment uses **CPython 3.12.10**.
Environment release **1.4.0 / revision 1** is versioned independently of Python
and the desktop application. Existing 1.3.0 assets remain available for rollback.

## Dependency inputs

| File | Purpose |
| --- | --- |
| `requirements-base.txt`, `requirements-science.txt` | Existing MCP, documents, statistics and biology |
| `requirements-science.lock`, `requirements-managed-compatible.lock` | Preserve existing core versions |
| `requirements-integrity.txt`, `requirements-integrity.lock` | Image comparison and PDF integrity |
| `requirements-research.txt` | Broad CPU research, medical imaging, geography and PyZotero |
| `requirements-research.lock` | Complete resolution with upstream distribution hashes |
| `requirements-windows.lock` | Exact release wheels, including locally built pure Python wheels |
| `skill-dependency-policy.json` | Import aliases and independent environment exceptions |
| `skill-dependencies.json` | Source evidence, installed versions and isolated verification |

Only `opencv-python-headless` is installed in the shared environment. Scanpy,
Leiden, scientific image libraries and the Playwright Python API are included.
Playwright browsers, Torch/CUDA, model weights, complete OCR stacks and system
tools are provisioned separately. Aeon, Cobra, NeuroKit2, MatchMS, BioServices
and scVelo require independent environments because of core version constraints.
PySAM and ETE4 are excluded until supported Windows wheels are available.

## Reproducible build

1. Resolve the research input for Windows x64 / Python 3.12 with the existing
   science, compatibility and integrity constraints. Do not downgrade core pins.
2. Run `py -3.12 tools/release/prepare-python-environment.py --work .build/python-1.4.0`.
   The build interpreter must be exactly 3.12.10. Wheels are hash checked; the
   final environment is installed offline into a clean staging directory.
3. Run the staged `bio-tools/python/python.exe -s -B` with the absolute path to
   `tools/release/verify-python-environment.py --output .build/python-1.4.0/verification.json`.
   This disables personal packages and tests actual image, medical, Office,
   Zotero, statistical, biological, chemical and quantum operations.
4. Run image workflow integration, desktop Python tool, MCP and update tests.
   Build with `ZEROWALL_MCP_ENVIRONMENT_STAGING`, `ZEROWALL_MCP_ENVIRONMENT_OUTPUT`,
   `ZEROWALL_PYTHON_VERIFICATION`, `ZEROWALL_MCP_REBUILD_PYTHON=0`, version 1.4.0,
   Python version 3.12.10 and the existing stable-3 signing key file configured.
   `node tools/release/build-mcp-environment.mjs` checks the lock, installed
   metadata and verification inventory agree before generating schema 2 assets.

The auditor reads Python AST imports, dynamic imports, Markdown declarations
and examples, requirements and vendor sources. Source documents are audit data.
`managed` requires installation and isolated verification evidence, and version
mismatches remain visible. Standard-library and Skill-local imports are filtered.
Optional examples, development dependencies and external services are recorded
separately; static analysis cannot prove that every arbitrary dynamic import was found.

## Publication and updates

`node scripts/publish-mcp-environment.mjs` first uploads immutable versioned ZIP
and signed manifest. It verifies the public signature, complete size and SHA-256
before promoting `latest.json`, then checks the exact URL used by desktop clients.
Never overwrite an existing version archive. Credentials and signing keys remain
outside the archive and source control.

The desktop installs into the inactive slot and checks health before switching
`current.json`. The `python-overlay/python-3.12` directory is retained across
updates, including the six existing user extensions. Rollback retains the old
slot; a failed update must leave the previous working environment selected.
Comprehensive checks run during the build; client startup keeps lightweight checks.
