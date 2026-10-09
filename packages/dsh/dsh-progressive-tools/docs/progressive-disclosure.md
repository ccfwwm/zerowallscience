# Progressive disclosure model

This plugin separates two related mechanisms that are often conflated:

- Agent Skills progressively load instructions and resources.
- Tool discovery progressively loads callable schemas.

DeepSeek Harness already owns the first mechanism. This plugin supplies a
cache-stable fallback for the second where the provider protocol has no native
deferred-tool content blocks.

## Skills layers

The open Agent Skills format defines three disclosure levels:

| Level | Session-visible material | Load boundary |
| --- | --- | --- |
| Metadata | `name` and `description` | Skill catalog publication |
| Instructions | Complete `SKILL.md` body | `skill` activation |
| Resources | Referenced scripts, files, and assets | Explicit need |

DSH's Skills subsystem already publishes a compact name/description catalog,
loads the complete body through the `skill` tool, and resolves resources only
when needed. The plugin does not duplicate or replace that subsystem.

References:

- [Agent Skills specification](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx)
- [DSH Skills subsystem](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/skills)

## Tool layers

Stable proxy mode implements an analogous three-level tool path:

| Level | Session-visible material | Load boundary |
| --- | --- | --- |
| Discovery entry | `tool_search`, `tool_dispatch`, common direct tools | First request |
| Exact definitions | Matching names, descriptions, and parameter schemas | `tool_search` result |
| Execution | Original tool body and result | `tool_dispatch` nested call |

The complete catalog and real executors stay in process memory. Only exact
matches enter conversation history, but each match also names every sibling in
its family, so one search opens a plugin's whole dispatchable surface. The
`status` action browses the complete family catalog when no lexical query
fits; by default it informs without unlocking dispatch.

## Native deferred tools versus stable proxy

Host `ToolSchema` includes optional `deferLoading`. A route that declares
tool updates can keep that definition out of the immediate list and activate
it later with a tool-addition block. A route without tool updates strips the
flag and sends the full schema. The chat-completion tool list still has no
deferred-reference block.

Stable proxy therefore still removes deferred catalog tools from the assembled
request. Leaving them on the list with `deferLoading` would expand the prefix
on routes that do not support tool updates. A tool already on the stable
surface keeps the host flag. This preserves prefix stability and ordinary DSH
policy, with two explicit trade-offs:

- the outer request has no provider-native grammar for a deferred catalog tool;
- discovery and execution are separate calls.

A future native mode can use tool updates on routes that declare them without
changing this fallback.

References:

- [DSH tool subsystem](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/tools)
- [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)

## Cache contract

The stable request prefix is:

```text
fixed tool schemas → fixed system sections → append-only message history
```

Discovery adds one tool result after the reusable prefix. It does not change
the fixed schemas or the generated Code Mode SDK. This is the central
difference from `dynamic` mode, whose native family activation intentionally
changes the request header.
