# runtime/mcp

MCP (Model Context Protocol) server configurations.

## First batch

| MCP | Purpose | Phase |
| --- | --- | --- |
| `filesystem` | Project file read/write | v0.1 |
| `paper-search-mcp` | Literature search | v0.1 |
| `BioMCP` | Biomedical databases | later |
| `Zotero MCP` | Reference library | later |
| `GitHub MCP` | Repos / issues / releases | later |
| `local runtime MCP` | Local execution status | later |

v0.1 ships `filesystem` + paper search; the rest are added incrementally.
MCP servers must stay pluggable and configurable.
