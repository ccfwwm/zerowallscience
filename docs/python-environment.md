# ZeroWall Python environment

ZeroWall Science uses one managed Python profile for MCP servers and bundled
Skills. The dependency inputs are layered so the runtime can stay small while
the literature and document workflows share the same interpreter:

| File | Purpose |
| --- | --- |
| `resources/python/requirements-base.txt` | MCP, HTTP, validation, pandas, NumPy, image basics |
| `resources/python/requirements-science.txt` | PDF, Office, plotting, statistics, and common bioinformatics |
| `resources/python/requirements-mineru.txt` | Optional MinerU, OCR, and deep-learning layer |
| `resources/python/requirements-mcp.txt` | Compatibility entry point used by the MCP environment builder |

The managed Windows runtime is built from the requirements inputs into
`mcp-environment-staging/bio-tools/python`, then installed under
`%APPDATA%\\zerowall-science\\zerowall-python`. The packaging manifest must list
the modules used by health checks and include the `resources/skills` tree. A
profile migration should be performed in this order:

1. Build a new staging profile from the locked inputs.
2. Run the MCP health check and import checks for document, plotting, and
   literature modules.
3. Run the ZeroWall plugin and Python regression tests.
4. Switch the default profile only after the previous profile remains available
   for rollback.

Heavy packages such as MinerU, Torch, Scanpy, and OpenCV belong to the opt-in
layer. They are not silently installed by a Skill. A missing optional package
must produce an actionable error and leave the task's review queue intact.

The literature trail Skill uses `requests`, `pypdf`/`PyMuPDF`, and `openpyxl`.
For complex layout, equations, tables, or OCR, the saved PDF is handed to the
ZeroWall MinerU capability and its task ID/artifacts are recorded in the source
ledger. Credentials remain in ZeroWall Environment settings and are never part
of a requirements file or task artifact.
