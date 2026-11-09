# @zerowall/dsh-plugin-mcp

MCP configuration

Manage MCP servers and credential references from the plugin detail page. The optional databasePath config selects the SQLite research store. Without it, ZEROWALL_RESEARCH_DB is accepted; otherwise the store is under the DSH home at zerowall/research.sqlite.

Build with pnpm run zerowall:build and inspect archives with pnpm run zerowall:pack at the repository root. The tested baseline is Node.js 24.9 or later and DSH 0.2.2-rc.1.
