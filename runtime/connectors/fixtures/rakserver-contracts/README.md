# Rakserver Contract Fixtures

This directory contains contract test fixtures for validating MCP connector behavior against the Rakserver reference implementation.

## Purpose

Rakserver is the reference MCP server implementation from myscience that defines expected behavior for:
- Tool invocation patterns
- Response schemas
- Error handling
- Rate limiting
- Authentication flows

These fixtures ensure our 247 tools across 23 domain groups maintain compatibility with the reference behavior.

## Structure

```
rakserver-contracts/
├── README.md                    # This file
├── contracts/                   # Contract definitions per domain
│   ├── literature.json
│   ├── variants.json
│   ├── ...
├── responses/                   # Sample responses for validation
│   ├── literature/
│   │   ├── openalex_search_works.json
│   │   └── arxiv_search.json
│   └── ...
└── test-suite.ts               # Contract validation test suite
```

## Contract Schema

Each contract file defines:

```json
{
  "domain": "literature",
  "version": "1.0.0",
  "tools": [
    {
      "name": "openalex_search_works",
      "inputSchema": { ... },
      "outputSchema": { ... },
      "errorCases": [
        {
          "case": "openalex_key_required",
          "expectedError": { "error": "openalex_key_required", "message": "..." }
        }
      ],
      "rateLimits": {
        "requestsPerSecond": 2
      },
      "examples": [
        {
          "input": { "query": "CRISPR", "max_records": 10 },
          "outputFile": "responses/literature/openalex_search_works_crispr.json"
        }
      ]
    }
  ]
}
```

## Validation Rules

1. **Tool Count**: Each domain must have the exact tool count from manifests
2. **Schema Compliance**: Input/output must match JSON Schema
3. **Error Handling**: Must handle all documented error cases
4. **Rate Limits**: Must respect documented rate limits
5. **Empty Query**: Must handle empty/null query parameters correctly
6. **Auth Required**: Must return structured error when auth is required

## Running Tests

```bash
npm test -- runtime/connectors/fixtures/rakserver-contracts/test-suite.ts
```

## Reference

Based on myscience/assets/mcp-servers/bio-tools rakserver implementation.
