# Configuration reference

Configuration is validated when the plugin loads. Invalid modes, names,
limits, duplicate family IDs, empty patterns, and bindings to unknown families
fail loudly.

## Runtime compatibility

Version `0.4.0` targets runtime `0.1.5-rc.1` and pins its core peers
to that tested version. Do not install it into a `0.1.1-rc.2` profile or assume
compatibility with later prereleases. Existing plugin configuration remains
unchanged. PTC presentation is configured on the host tool runtime with
`mode: ptc` or `mode: both`; the plugin's own `mode` still selects
`stable-proxy` or `dynamic`.

The host owns session format migration. Discovery replay accepts current
`tool/ptc-dispatch` records and historical `tool/code-dispatch` records when
the host preserves them as ignorable events. This does not make an arbitrary
old host session file loadable by the new runtime.

## Options

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `mode` | `stable-proxy` \| `dynamic` | `stable-proxy` | Cache-stable dispatch or changing native family activation. |
| `toolName` | string | `tool_search` | Discovery tool name. |
| `dispatchToolName` | string | `tool_dispatch` | Stable dispatcher name. Must differ from `toolName`. |
| `alwaysVisible` | string[] | essential direct tools | Exact names or `*` patterns kept on the fixed direct surface. |
| `groups` | group[] | built-in rules | Ordered search and dynamic activation families; first match wins. |
| `skillBindings` | binding[] | `[]` | Successful Skill calls that discover or activate named families. |
| `maxResults` | integer | `5` | Maximum exact definitions returned by stable search, or group matches in dynamic mode. Caller `max_results` values outside `1..maxResults` are clamped, not rejected. |
| `requireDiscovery` | boolean | `true` | Require a search hit, a family-wide discovery, or a Skill binding before stable dispatch. |
| `statusGrantsDiscovery` | boolean | `false` | Let one `status` listing make every cataloged name dispatchable. Off by default so dispatch always follows a seen schema. |
| `deferToolGuidance` | boolean | `true` | Remove exact hidden `tool:<name>` prompt sections. |
| `activationGroupLimit` | integer | `1` | Dynamic mode: highest-ranked families activated by one search. |
| `maxActiveGroups` | integer | `3` | Dynamic mode: maximum retained active families. |
| `maxActiveToolTokens` | integer | `6000` | Dynamic mode: approximate active-schema budget. |
| `retentionTurns` | integer | `6` | Dynamic mode: inactive turns before expiry; `0` disables expiry. |
| `charactersPerToken` | integer | `4` | Compact schema characters represented by one estimate token. |

`activationGroupLimit` cannot exceed `maxActiveGroups`. Dynamic-only fields are
still validated in stable mode so switching modes cannot reveal a latent bad
configuration.

## Stable direct tools

The default patterns are:

```yaml
alwaysVisible:
  - skill
  - ask_user_question
  - report
  - submit_*
  - structured_output*
```

`tool_search` and `tool_dispatch` are added automatically. A matching tool must
exist when the first assembly freezes the session surface. Tools registered
later enter the deferred catalog even when their names match an
`alwaysVisible` wildcard; this keeps the active session prefix stable. A new
session sees the new composition.

Keep this list small. Add only tools whose direct schema or completion role is
worth paying on every request.

## Wildcards

`alwaysVisible`, `groups[].include`, and `groups[].exclude` use anchored `*`
wildcards over complete tool names. Every other character is matched literally.
Matching is case-insensitive.

```yaml
alwaysVisible:
  - approval_*
  - submit_*
```

## Family rules

```yaml
groups:
  - id: browser
    description: Browser navigation and page interaction
    aliases: [browser, web page, 浏览器]
    include: [browser_*]
    exclude: [browser_experimental_*]
```

Rules are evaluated in list order. A tool belongs to at most one configured
family. Unmatched tools are grouped by the first underscore-delimited prefix
when at least two share it; otherwise each tool receives a singleton family.
Generic verb prefixes (`get`, `set`, `list`, `create`, `delete`, `update`,
`add`, `remove`, `cancel`, `run`, `start`, `stop`, `send`, `read`, `write`,
`new`, `check`) never merge, because unrelated plugins routinely share them;
such tools stay singleton families unless a configured rule claims them.

In stable mode, family metadata improves exact-tool search, the result
contains the highest-ranked individual definitions, and each match lists every
member name of its family so siblings become dispatchable from one query. In
dynamic mode, the highest-ranked whole family becomes natively visible.
Because family membership now also widens discovery, a wrong rule no longer
just skews ranking — it unlocks unrelated names. Keep custom rules precise.

The built-in order covers browser, vision, image generation, filesystem,
terminal, web, database, remote operations, memory, workbench, teams,
subagents, workflows, and generated interfaces. Explicit rules are recommended
when third-party packages use unrelated names for one capability.

## Skill bindings

Bindings inspect the `name` or `skill` argument of a successful tool named
`skill`:

```yaml
skillBindings:
  - skill: browser-automation
    groups: [browser]
  - skill: database-operations
    groups: [database]
```

Stable mode marks bound tools as dispatchable. The Skill instructions should
describe the tools and their arguments; otherwise call `tool_search` to load
the exact definitions into history. Dynamic mode activates the bound native
families under its normal cap, budget, and LRU rules.

## Discovery gate

With `requireDiscovery: true`, `tool_dispatch` accepts names that were matched
by a successful search, listed as a family sibling of a match, or introduced
through a Skill binding. This catches guessed or stale tool names before
nested execution.

A `status` listing is browse-only by default: it shows every family and member
name but does not unlock dispatch, so the model must load a schema before
calling. The rejection message points to the deterministic recovery — search
the exact name once (exact matches always rank first) and dispatch. Set
`statusGrantsDiscovery: true` to let one status call unlock the whole catalog;
this trades away the seen-schema guarantee, so reserve it for deployments with
approval layers or read-only tool surfaces.

Set `requireDiscovery: false` only when another trusted catalog supplies exact
names and schemas. Direct calls to deferred names remain denied; they must
still pass through `tool_dispatch`.

## Guidance deferral

`deferToolGuidance: true` removes only sections whose names map exactly to a
deferred tool:

```text
tool:<deferred-name>
tool:<deferred-name>:<suffix>
```

It does not guess package ownership or delete general sections. This avoids
silently removing unrelated policy text. A tool package that registers one
shared family section should move large operational instructions into a Skill
or keep the section always visible.

## Onboarding an existing plugin ecosystem

Three configuration moves cover most friction when this plugin fronts an
already-installed tool ecosystem:

1. Add high-frequency small tools to `alwaysVisible`. Anything the model calls
   nearly every turn (todo updates, reporting) should not pay the
   search-then-dispatch round trip.
2. Bind plugin-shipped Skills with `skillBindings`. Loading a Skill should make
   its tools dispatchable in the same turn; without a binding the model still
   needs one search after the Skill call.
3. Write explicit `groups` rules, with multilingual aliases, for packages whose
   tool names do not follow common prefixes. This fixes automatic-group
   scatter, improves family search recall, and keeps family-wide discovery
   from unlocking strangers.

## Token estimates

The estimate for one tool is:

```text
ceil(JSON.stringify(schema).length / charactersPerToken)
```

It is deterministic diagnostic data, not provider billing. In stable mode,
`estimatedSavedTokens` is the complete deferred catalog estimate because none
of those definitions appears in the top-level request. Search results add only
the matched definitions to history.

## Dynamic-mode budgets

When a dynamic activation exceeds `maxActiveGroups` or
`maxActiveToolTokens`, the least recently used unprotected family is removed
first. Families activated by the current search are protected for that
operation. A requested family that alone exceeds the budget remains active and
reports the over-budget estimate.

Dynamic mode changes the request tool set on activation, eviction, and expiry.
Prefer stable mode when context-cache reuse is important.

## Full stable example

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
    alwaysVisible: [skill, ask_user_question, report, submit_*, structured_output*]
    groups:
      - id: browser
        description: Browser navigation and page interaction
        aliases: [browser, web page, 浏览器]
        include: [browser_*]
      - id: database
        description: Database inspection and queries
        aliases: [database, sql, 数据库]
        include: [db_*, sql_*]
    skillBindings:
      - skill: browser-automation
        groups: [browser]
```

## v0.1 migration

Version 0.2 defaults to `stable-proxy`, so a prior configuration now returns
exact definitions and uses `tool_dispatch` instead of exposing a native family.

To retain v0.1 call semantics while taking the lifecycle fixes:

```yaml
- id: progressive-tools
  config:
    mode: dynamic
```

Dynamic mode now affects the first request and makes a successful search
visible on the immediately following request, but it remains intentionally
cache-hostile when the active family set changes.
