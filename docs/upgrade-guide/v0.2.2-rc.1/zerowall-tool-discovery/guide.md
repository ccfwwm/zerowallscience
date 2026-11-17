---
kind: upgrade-guide
description: Standard ZeroWall conversations load optional tools on demand and managed cloud requests use upstream output defaults.
---

# ZeroWall tool discovery and output defaults

English | [中文](guide.zh.md)

## Change

The MCP plugin presents basic tools in standard conversations and loads optional definitions after `tool_search` or `mcp_search`. Prompt assembly no longer connects every enabled MCP server. Explicit `mcp_connect` loads one server's complete list. Successful discovery results restore the selection when a conversation resumes; custom and PTC presets keep their executors.

The AI Cloud plugin treats catalog output capacity as model metadata. Optional output-limit parameters are omitted unless a caller supplies a cap. Anthropic Messages retains its required model-specific `max_tokens`. Context capacities remain independent. Empty upstream truncation responses become retryable failures.

## Migration

1. Update `@zerowall/dsh-plugin-mcp` and `@zerowall/dsh-plugin-ai-cloud`, then restart Desktop.
2. Let the model use `tool_search` or `mcp_search` before calling optional capabilities. To retain full exposure, set `toolLoading: all` in the MCP plugin's `config` in your profile's `cordis.patch.yml`. `alwaysAvailableTools` replaces the initial tool-name list; `toolSearchLimit` sets the number of search matches, from 1 to 20.
3. Start a standard conversation and confirm the first request contains basic tool definitions. After a capability search, confirm only matched definitions are added on the next step. Cloud requests without an explicit cap should omit optional output-limit fields.
