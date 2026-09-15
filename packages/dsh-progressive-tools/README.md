# DSH Progressive Tools

[![CI](https://github.com/everclear077/dsh-progressive-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/everclear077/dsh-progressive-tools/actions/workflows/ci.yml)
[![version](https://img.shields.io/badge/version-0.4.0-blue.svg)](./CHANGELOG.md)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

Cache-stable progressive tool discovery for DeepSeek Harness. The default mode
sends a small, fixed tool surface on the first request, keeps the complete
catalog in process memory, and executes discovered tools through the ordinary
Harness pipeline.

[中文文档](./README.zh-CN.md)

[Documentation map](./docs/README.md) · [Getting started](./docs/getting-started.md) ·
[Upgrade guide](./docs/migration.md) · [Troubleshooting](./docs/troubleshooting.md)

## Why

Every visible tool definition consumes input tokens on every request. Changing
that definition list later also changes the request prefix and reduces context
cache reuse. Progressive disclosure needs both properties at once:

- a small first request;
- a byte-stable tool and system prefix across later requests.

The default `stable-proxy` mode provides that contract:

```text
complete registry (process memory)
        │
        ├── exact searchable definitions
        │
        └── fixed request surface
              ├── tool_search
              ├── tool_dispatch
              └── common direct tools
                       │
tool_search result ────┴──► append exact matches to conversation history
                                  │
                                  └── tool_dispatch ──► normal DSH execution pipeline
```

Search changes conversation history, not the top-level tool list. Approval,
guards, argument validation, timeout wrappers, result policy, deferred context,
and cancellation still run for the selected real tool.

## Features

- Minimal tool definitions on the actual first AgentLoop request.
- Byte-stable native tool list and Code Mode SDK across discovery calls.
- Exact tool matches with full name, description, and parameter schema.
- Family-wide discovery: each match names every sibling tool of its family, so
  one search opens a plugin's complete dispatchable surface.
- Browsable `status` catalog listing, with an optional
  `statusGrantsDiscovery` grant for trusted deployments.
- Bounded conversation growth: search results record per-call discovery
  increments while resume state travels in presentation metadata.
- Deterministic BM25-style lexical ranking over names, descriptions, nested
  parameter descriptions, enums, family metadata, and multilingual aliases.
- Stable `tool_dispatch` transport with runtime schema validation through the
  original tool definition.
- Monotonic guard that rejects direct calls to deferred tools and permits only
  dispatcher-owned nested execution trees.
- Support for inherited and agent-scoped tools.
- Durable discovery reconstruction for top-level and Code Mode search calls.
- Optional skill-to-family discovery bindings.
- `dynamic` compatibility mode for deployments that require native definitions
  after activation.
- Reversible Cordis effects for unload and configuration reload.

## Requirements

- Node.js `^22.19.0` or `>=24.0.0`
- Host runtime `0.1.5-rc.1` (exact tested core peer versions)
- pnpm for source installation and development

## Runtime compatibility

Version `0.4.0` targets runtime `0.1.5-rc.1`. Core peer versions are
pinned to that tested release; older runtimes and later prereleases are not
covered. Earlier plugin versions predate this adaptation. The command below
uses the release tag for reproducible deployments.

## Install

```sh
dsh plugin --profile web add github:everclear077/dsh-progressive-tools#v0.4.0
```

Source installs run the package `prepare` script. If pnpm asks for build
authorization, add the exact package key it reports to the profile's
`pnpm-workspace.yaml`:

```yaml
allowBuilds:
  dsh-progressive-tools: true
```

Verify the composed layer before starting the profile:

```sh
dsh --profile web --dump-config
```

The dump should contain the `progressive-tools` row contributed by this bundle.

## Use

The default direct surface contains:

- `tool_search`;
- `tool_dispatch`;
- `skill`, `ask_user_question`, `report`, `submit_*`, and
  `structured_output*` when registered;
- reserved Harness presentation transports when the active tool mode needs
  them.

No special wording is required in an ordinary conversation. A stable system
instruction tells the agent to search before declaring a capability
unavailable.

Discovery returns exact definitions:

```json
{
  "query": "browser navigation",
  "max_results": 3
}
```

The next call uses one returned definition:

```json
{
  "name": "browser_open",
  "arguments": {
    "url": "https://example.com"
  }
}
```

Each match also lists every member tool name of its family, and the whole
family becomes dispatchable from that one search — siblings that did not make
the top-ranked slice can be dispatched by name or schema-loaded with one
exact-name query.

`tool_search` also accepts `{"action":"status"}`, which lists every deferred
family with its member tool names alongside catalog and savings estimates. By
default the listing is browse-only: dispatching an unseen name still requires
one exact-name search, and the rejection message says so. Deployments that
prefer immediate access can set `statusGrantsDiscovery: true`. Search results
are append-only conversation content; they never add native definitions to the
top-level request.

## Configure

The default configuration is intentionally small:

```yaml
- id: progressive-tools
  config:
    mode: stable-proxy
    toolName: tool_search
    dispatchToolName: tool_dispatch
    maxResults: 5
    requireDiscovery: true
    statusGrantsDiscovery: false
    deferToolGuidance: true
    alwaysVisible:
      - skill
      - ask_user_question
      - report
      - submit_*
      - structured_output*
```

Family rules improve search without changing the stable request surface:

```yaml
- id: progressive-tools
  config:
    groups:
      - id: browser
        description: Browser navigation and page interaction
        aliases: [browser, web page, 浏览器]
        include: [browser_*]
      - id: database
        description: Database inspection and queries
        aliases: [database, sql, 数据库]
        include: [db_*, sql_*]
```

See [configuration](./docs/configuration.md) for every option, the
plugin-ecosystem onboarding checklist (`alwaysVisible` for high-frequency
tools, `skillBindings` for Skill-shipping packages, explicit `groups` for
unconventional names), and the migration notes for `dynamic` mode. The
[progressive disclosure model](./docs/progressive-disclosure.md) maps Skills,
exact tool definitions, execution, and provider capability gaps.

## Execution and security semantics

Stable mode filters the authoritative prompt assembly instead of changing the
registry view. A direct call to a deferred name is then denied by a monotonic
tool guard. `tool_dispatch` creates a nested execution with the original agent,
signal, root call identity, arguments, and real tool name, so normal DSH policy
continues to apply to that real tool.

The guard is a routing invariant, not a replacement for approval or sandbox
policy. Security-sensitive deployments should keep their existing controls
enabled.

## Trade-offs

- Deferred tools lose provider-native argument grammar at the outer request.
  Their original schema is validated at dispatch time by DSH.
- A task may need one discovery call before execution.
- Family siblings become dispatchable before their schemas were shown; the
  pipeline still validates every call, but complex or side-effectful siblings
  are best schema-loaded first with one exact-name search.
- Search is deterministic lexical ranking, not an embedding service.
- Search results add only matched definitions to conversation history, but those
  definitions remain there until normal compaction.
- A registry or composition change can legitimately alter the next prompt.
  Discovery alone does not.

## Development

```sh
pnpm install
pnpm run check
```

The test suite includes a real AgentLoop request test that captures the first
wire-ready tool array and verifies that discovery leaves both tools and system
text unchanged.

The implementation follows the public references for
[architecture](https://deepseek-harness.github.io/deepseek-harness/reference/),
[system prompt assembly](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/system-prompt),
[tool execution](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/tools),
[skills](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/skills),
and [plugin packaging](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish).

## License

[MIT](./LICENSE)
