---
kind: upgrade-guide
description: "The reserved R MCP server and its tool prefix change to zerowallrmcp."
---

# R MCP service name

English | [中文](guide.zh.md)

## Change

The reserved server name is zerowallrmcp; its public tools use mcp__zerowallrmcp__ instead of mcp__rmcp__. Existing saved sessions retain their historical tool records. Startup migrates the rmcp and zerowall-rmcp configuration aliases while retaining credentials, enabled selections and existing conversation project bindings. The remote HTTPS endpoint is unchanged.

## Migration

1. Restart the updated application to migrate the reserved server configuration. Verify that MCP settings shows zerowallrmcp with the previous authorization and enabled state.
2. Change custom prompts and Skills from mcp__rmcp__ to mcp__zerowallrmcp__. Package-owned Skills are updated automatically; do not edit past Session records.
3. In Claude, use the Host bridge prefix: mcp__zerowall__mcp__zerowallrmcp__ followed by the tool name. Use capability_search through the same bridge to connect on demand. Verify discovery and one read-only tool call before starting research work.
