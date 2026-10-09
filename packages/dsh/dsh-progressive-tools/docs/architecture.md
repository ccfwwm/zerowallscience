# Architecture

## Runtime baseline

The current checkout targets `0.2.0-rc.1`. Calls use `ToolCallId`, and replay
reads `session.snapshotEvents()` instead of the former mutable event view.
Host tool schemas may include `deferLoading`. stable-proxy still removes
deferred catalog tools from the assembled request, because a route without
tool updates strips that flag and sends the full schema. A tool that is
already on the stable surface keeps the flag.

Current PTC subcalls persist `tool/ptc-dispatch`; replay also recognizes old
`tool/code-dispatch` records retained as ignorable events by host migration.
The plugin itself does not rewrite session storage.

Agent creation is asynchronous and the integration harness mounts session
projections. Request prefix tests compare the leading system-role message,
because loop-built requests no longer populate the standalone `system` field.
Additional PTC/both tests exercise the real dispatch bridge through
`ctx.ptcRuntime`, checking both SDK languages and unload/reload replay. They
do not certify the language interpreters or measure provider cache savings.

## Goals and invariants

The default architecture has four invariants:

1. The first AgentLoop request already carries the small surface.
2. Discovery never changes the top-level tool list or generated SDK.
3. Deferred calls still traverse the complete DSH execution pipeline.
4. A caller cannot bypass discovery by naming a hidden tool directly.

The plugin uses only public Harness APIs and extension points:

- `ctx.systemPrompt.section()` for stable discovery guidance;
- `system-prompt/assemble` for the authoritative request projection;
- `ctx.tools.register()` for search and dispatch;
- `ctx.tools.guard()` for monotonic routing enforcement;
- `ctx.tools.execute()` for nested real-tool execution;
- `tools/result` for authoritative discovery commits;
- `tools/change` for in-process catalog invalidation;
- `agent/created` and durable session events for state initialization;
- `agent/disposed` and Cordis effects for cleanup.

## The DSH lifecycle boundary

DSH assembles prompt sections and tool schemas before `agent/pre-step`:

```text
claim inbox input
      │
      ▼
systemPrompt.assemble()
      │
      ├── collect sections and tools
      └── system-prompt/assemble waterfall
                         │
                         ▼
                  agent/pre-step
                         │
                         ▼
                    LLM request
```

Version 0.1.0 installed a restriction in `agent/pre-step`, so it could affect
only the following assembly. Version 0.2.0 performs the authoritative
projection in `system-prompt/assemble`, after all providers have contributed
but before AgentLoop stores or sends the request.

`agent/created` eagerly initializes the catalog for normal creation and
resume. The assembly hook remains authoritative and also covers hot reload,
late registration, and callers that assemble without a normal startup event.

## Stable-proxy mode

### Request projection

On the first assembly for one agent, the plugin freezes that session's stable
name set:

- `tool_search`;
- `tool_dispatch`;
- registered names matching `alwaysVisible` (filesystem tools `read`, `write`,
  `edit`, `glob`, and `grep` are in the default list when the host registers
  them);
- the reserved `run_code` transport when DSH exposes it.

The complete registry remains visible to in-process code. The assembly
waterfall filters only the final `PromptAssembly.tools` projection. In Code
Mode and `both` mode, the `tools:sdk` section is regenerated from the same
stable names, preserving one coherent presentation.

`deferToolGuidance` conservatively removes a section only when its name is an
exact hidden-tool guidance slot (`tool:<name>` or `tool:<name>:...`). General
guidance and sections that cannot be mapped safely remain untouched.

The stable name set does not grow after first assembly. A later registry change
refreshes only the searchable catalog, so installing a new deferred tool does
not silently change an active session's cache prefix.

### Discovery

The catalog stores detached model-facing definitions in process memory. Search
operates on individual tools, not whole families. A searchable document
contains:

- tool name and description;
- nested parameter keys, descriptions, constants, and enums;
- configured family ID, description, and aliases.

Ranking combines exact-name and contained-label bonuses with a deterministic
BM25-style lexical score. CJK text is additionally tokenized into character
bigrams, so queries without space-delimited words can match definitions and
family metadata without configured aliases. An identifier query with no catalog
name hit returns nothing rather than filling `maxResults` from shared tokens
such as `tool`. Search otherwise returns at most `maxResults` exact
definitions; larger `max_results` requests are clamped. Those definitions
enter the ordinary tool result and therefore extend history append-only.

An exact registered name returns only that tool. Other queries return at most
`maxResults` definitions and also stop at `maxResultCharacters`. Schemas are
not cut to fit. One definition that is larger than the budget is returned
whole, with `budget.singleDefinitionExceedsBudget`. The family member table
appears once on `families`, not on every match. `schema` means parameters are
in the result; `name-only` means the sibling can be dispatched or loaded with
an exact-name search; `skill` means a configured Skill supplies the contract.
The whole family is still discovered unless `familyDiscovery` is `matched`.

The `status` action lists every deferred family with its member tool names, so
the model can browse the catalog when a search query has no lexical overlap.
By default the listing is browse-only; `statusGrantsDiscovery` optionally
turns it into a catalog-wide discovery grant. The discovery guidance still
requires a search before declaring a needed capability class unavailable. It
tells the model not to search merely to prove a named tool is missing.

Successful `tools/result` observation commits the returned names to the
agent's discovered set. Failed or invalid searches do not mutate live state.

### Dispatch

`tool_dispatch` accepts an exact discovered name and one JSON object of
arguments. It then calls the ordinary registry:

```text
tool_dispatch root execution
      │
      ├── check catalog membership and discovery state
      ├── preserve agent, rootCallId, signal, and arguments
      └── ctx.tools.execute(real tool, parent = dispatcher token)
                         │
                         ├── pre-execute / approval
                         ├── monotonic guards
                         ├── timeout and retry wrappers
                         ├── original schema validation and body
                         ├── post-execute and finalization
                         └── tools/result
```

Nested contexts and a successful turn-conclusion marker are ferried back to
the outer result. The outer rendering uses the real tool's finalized content,
including non-text blocks. The default program value is
`dsh-progressive-tools/dispatch-v2`: `{ protocol, tool, value }`. Rendered
content is not copied into that value, so a program that returns the whole
object does not repeat the body. `legacyResults` restores
`dsh-progressive-tools/dispatch-v1`, which includes `content`. A nested
failure is rethrown with the real tool's structured error code preserved, and
the dispatcher delegates its parallel-scheduling classification to the target
tool's own declaration, so concurrency-safe deferred tools keep overlapping
with sibling calls.

`resultBudget` applies to a direct `tool_dispatch` rendering. A dispatch nested
under `run_code` keeps the target rendering so the body is not compressed
twice. The outer `run_code` model text is then replaced in `tools/post-execute`.
The canonical program value is not truncated. `tools/ptc-dispatch-log` is still
only a durable log copy.

### Routing guard

Prompt filtering alone does not change registry lookup. Stable mode therefore
registers a monotonic guard:

- stable direct names are allowed;
- deferred direct names are denied;
- a nested execution whose parent token belongs to `tool_dispatch` is allowed;
- descendants of that authorized nested execution inherit the authorization
  for the duration of their execution tree.

Tokens are registry-minted opaque identities, so a caller cannot manufacture
the parent capability. Authorized tokens are removed on result and plugin
cleanup. The guard prepares the agent's state on demand, so a call that
arrives before the first assembly or agent/created event is still classified
against the deferred catalog instead of passing through unexamined.

The guard is not an authorization boundary for the underlying capability. It
enforces presentation-to-dispatch alignment while existing approval, sandbox,
and policy layers continue to own security decisions.

## Cache behavior

For an unchanged session composition:

```text
request 1: stable tools + stable system + user history
request 2: stable tools + stable system + prior history + search result
request 3: stable tools + stable system + prior history + dispatch result
```

Only history grows. The tool/system prefix remains byte-identical. The
AgentLoop integration test captures actual `GenerateOptions` values and asserts
both the first request surface and post-search equality.

A real composition change can still alter the prefix: changing plugin config,
removing a stable tool, changing its definition, or replacing another system
section is outside the discovery invariant.

## Resume behavior

Discovery state is recorded asymmetrically. The default search value
(`dsh-progressive-tools/v3`) does not carry the cumulative name list. The
result's presentation metadata, which never reaches the model, carries that
list plus `omittedDefinitionTokens`. `estimatedSavedTokens` in the same
metadata is the same number and is not a bill. Old v2 records are still read.
Current tool results store model content directly on the tool message. Replay
also accepts older logs that wrap that content in a `tool-result` block.

On resume the plugin replays successful search results and skill bindings,
preferring the cumulative metadata when present and unioning per-call
increments otherwise. The metadata path restores full state from the latest
surviving entry even when older events were compacted. Nested Code Mode calls
have no top-level presentation metadata, so their standard
`tool/ptc-dispatch` content increments are folded instead (with historical
`tool/code-dispatch` records accepted when preserved by host migration). A replayed
`status` result also restores the catalog-listing grant used by
`statusGrantsDiscovery`.

The plugin introduces no custom session event vocabulary. Discovered names
survive registry refreshes such as provider reconnects; dispatch validates
catalog membership at call time, so a stale name fails the individual call
without losing the rest of the discovery state.

## Dynamic compatibility mode

`mode: dynamic` retains the v0.1 family activation design for deployments that
need provider-native definitions after search. Its lifecycle is corrected:

- initial restriction is installed at `agent/created`;
- turn expiry is reconciled at `agent/inbox/claimed`;
- successful search and skill results reinstall the restriction immediately;
- the assembly waterfall filters the already-collected current assembly and
  regenerates Code Mode SDK text from the same visible set.

This mode aligns presentation, lookup, and execution through
`agent.ctx.tools.restrict()`, but changing families changes the tool prefix and
can reduce cache reuse. It cannot hide tools registered in the exact agent
scope because scoped restrictions intentionally preserve scope-local tools.

## Cleanup

Tool registrations, the prompt section, assembly listener, guard, and event
listeners are Cordis-owned effects. Agent disposal removes its state and lifts
any dynamic restriction. Plugin unload lifts all remaining restrictions and
clears authorization tokens before its registered tools disappear.
