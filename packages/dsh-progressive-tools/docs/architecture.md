# Architecture

## Runtime baseline

The current checkout targets `0.1.5-rc.1`. Calls use `ToolCallId`, and replay
reads `session.snapshotEvents()` instead of the former mutable event view.
Current PTC subcalls persist `tool/ptc-dispatch`; replay also recognizes old
`tool/code-dispatch` records retained as ignorable events by host migration.
The plugin itself does not rewrite session storage.

Agent creation is asynchronous and the integration harness mounts session
projections. Request prefix tests compare the leading system-role message,
because loop-built requests no longer populate the standalone `system` field.
Additional PTC/both tests exercise the real dispatch bridge with a binding
runtime fixture, checking both SDK languages and unload/reload replay. They
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
- `agent/session-start` and durable session events for state initialization;
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

`agent/session-start` eagerly initializes the catalog for normal creation and
resume. The assembly hook remains authoritative and also covers hot reload,
late registration, and callers that assemble without a normal startup event.

## Stable-proxy mode

### Request projection

On the first assembly for one agent, the plugin freezes that session's stable
name set:

- `tool_search`;
- `tool_dispatch`;
- registered names matching `alwaysVisible`;
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
family metadata without configured aliases. Search returns at most
`maxResults` exact definitions; larger `max_results` requests are clamped.
Those definitions enter the ordinary tool result and therefore extend history
append-only.

Each match also lists every member name of its family (`groupTools`), and the
whole family becomes discovered in the same call. One query therefore opens a
plugin's complete tool surface even when only its top-ranked members carry
full schemas; the remaining siblings dispatch by name and validate against
their original definitions, or can be schema-loaded first with one exact-name
search.

The `status` action lists every deferred family with its member tool names, so
the model can browse the catalog when a search query has no lexical overlap.
By default the listing is browse-only; `statusGrantsDiscovery` optionally
turns it into a catalog-wide discovery grant.

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
including non-text blocks. A nested failure is rethrown with the real tool's
structured error code preserved, and the dispatcher delegates its
parallel-scheduling classification to the target tool's own declaration, so
concurrency-safe deferred tools keep overlapping with sibling calls.

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
arrives before the first assembly or session-start event is still classified
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

Discovery state is recorded asymmetrically. The rendered search result — the
text the model reads and re-reads in history — carries only the names newly
discovered by that call, so conversation growth stays bounded no matter how
much has been discovered. The result's presentation metadata, which never
reaches the model, carries the cumulative discovered list and the action kind.

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

- initial restriction is installed at `agent/session-start`;
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
