# MCP Source Snapshots

The checked-in `mcp-servers/` tree is the ZeroWall Science source of truth.
Older ZeroWall and Claude Science snapshots are comparison inputs only and must
not be copied over this directory as a whole.

## bio-tools

`bio-tools` keeps ZeroWall's current 23-domain aggregate server, local fixes,
strict system TLS defaults, and test contract. The empty-search-criterion guard
in `lib/mcp_servers_common/criteria.py` was selectively adapted from the local
Claude Science asset snapshot. Only the blank-input behavior was ported; the
snapshot's `tls_policy.py` and unrelated server differences were deliberately
excluded.

## ketcher-chemistry

`ketcher-chemistry` is the bundled Node MCP server and MCP App asset used by the
desktop application. ZeroWall launches `server.js` directly with Node and reads
`ui://ketcher-chemistry/editor` through the standard MCP resource flow. Ketcher
attribution and license notices are recorded in
`skills/THIRD_PARTY_LICENSES.md`.
