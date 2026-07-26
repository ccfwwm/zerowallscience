# Domain contract fixtures

Generated contracts for the vendored bio-tools MCP servers, plus the test suite
that keeps them honest.

## Where these come from

The servers under `runtime/connectors/bio-tools/lib/` are the source of truth.
Nothing in `contracts/` is authored by hand — regenerate it with:

```bash
python runtime/connectors/generate_contracts.py
```

The generator reads each `mcp_<domain>` package and fails loudly if the tools it
finds disagree with `bio-tools/lib/mcp_bio/domains.json`, which is the table
`run_server.py` dispatches on. Fields the code does not state are left out
rather than invented.

## Layout

```
domain-contracts/
├── README.md
├── contracts/             # one file per domain slug, 23 files, 247 tools
│   ├── literature.json
│   ├── variants.json
│   └── ...
└── test-suite.test.ts     # picked up by the vitest run rooted at apps/desktop
```

## Contract shape

Two server tiers produce two slightly different contracts.

Five servers ship a hand-written `schemas.json` (`biomart`, `biorxiv`,
`chembl`, `clinical-trials`, `pubmed`). Their contracts copy those schemas
verbatim, so some tools carry an `outputSchema`:

```json
{
  "domain": "pubmed",
  "package": "mcp_pubmed",
  "derivedFrom": "bio-tools/lib/mcp_pubmed/schemas.json",
  "originalConnector": "pubmed",
  "toolCount": 7,
  "tools": [
    {
      "name": "pubmed_search",
      "description": "...",
      "inputSchema": { "type": "object", "properties": {} },
      "outputSchema": { "type": "object" }
    }
  ]
}
```

The other eighteen declare their tools with `@mcp.tool(...)` decorators. Their
contracts are derived from the function signatures and Google-style docstrings,
so they have no output schema at all — the return shape only exists in prose,
which is preserved as `returns` when the docstring documents it:

```json
{
  "domain": "literature",
  "package": "mcp_literature",
  "derivedFrom": "bio-tools/lib/mcp_literature/server.py",
  "toolCount": 9,
  "tools": [
    {
      "name": "openalex_search_works",
      "description": "...",
      "inputSchema": { "type": "object", "properties": {}, "required": ["query"] },
      "returns": "Returns ...",
      "upstreams": ["openalex_works"],
      "errorCases": [
        {
          "case": "openalex_key_required",
          "expectedError": { "error": "openalex_key_required", "message": "string" }
        }
      ]
    }
  ],
  "upstreams": [
    { "package": "openalex_works", "minIntervalSeconds": 0.5, "requestsPerSecond": 2.0 }
  ]
}
```

Notes on the optional fields:

- `errorCases` — only the two structured codes the servers actually return:
  `openalex_key_required` (mcp_literature) and `contact_email_required`
  (mcp_variants). Everything else surfaces as a transport error.
- `upstreams` — the fleet packages a tool imports, and, at contract level, the
  politeness interval read from each package's `client.py` (`min_interval_s` /
  `sleep_s` default). Absent when the client is constructed at import time and
  no interval is derivable.
- `returns` / `outputSchema` — present only where the source documents them.

## Running the tests

From the repository root:

```bash
npm test --workspace apps/desktop -- runtime/connectors/fixtures/domain-contracts
```
