# Cost-optimization status

Checked against the current worktree before implementation. Plugin version
`0.7.0`. Host peers are pinned to `0.2.0-rc.1`. The installed host packages
expose tool execution, rendering, presentation metadata, and
`tools/ptc-dispatch-log`. That last event changes only the durable log copy.
This checkout does not ship a public result-spill service the plugin can call.

| Item | Status |
| --- | --- |
| P0 local baseline, redacted fixture, metric definitions | Done |
| P1 dispatch value no longer repeats rendered content | Done on the default path. `legacyResults: true` restores the old envelope |
| P1 cumulative discovery stays out of the public value | Done. Resume metadata still carries it |
| P1 exact name returns one tool | Done |
| P1 one family member table | Done |
| P1 diagnostic estimates leave the model body | Done. Metadata keeps `omittedDefinitionTokens` and the old alias |
| P2 count limit and character budget | Done. Schemas are not truncated |
| P2 optional coding profile | Done, off by default |
| P2 frozen capability summary | Done |
| P3 guidance reattached on discovery | Done for exact `tool:<name>` sections |
| P3 repeat notice and `reload` | Done when derived history still contains the full definition |
| P4 direct-dispatch model budget and original read | Done, off by default. Program values are not truncated |
| P4 Code Mode model-output budget | Done when `resultBudget` is on. `tools/post-execute` replaces `run_code` model content and leaves the program value unchanged. Nested dispatch content is not budgeted again |
| P5 offline A–E character comparison | Done. Every arm's cost is unknown without server usage |
| P5 paid A–E task runs | Not run. This checkout has no price config and no live session. The redacted fixture stays unknown |
| Small-catalog autoload | Done, off by default (`autoloadMaxTools: 0`) |
| Startup profile selection | Done as `profile: auto`, off by default |
| Native deferred-tool protocol | Host `ToolSchema.deferLoading` is recognized. stable-proxy still omits deferred catalog tools, because routes without tool updates send that flag as an immediate schema. Stable-surface tools keep the flag |
| Large-catalog index | Done. Document frequency is counted once per query. Ranking for an exact name is unchanged |
| Tool-call timeout policy | Host-owned. This package does not include the timeout policy plugin. Cancellation is forwarded and covered by tests |

## Host gap

`tools/ptc-dispatch-log` still changes only the durable log copy. The model-visible
`run_code` budget uses `tools/post-execute` content replacement. `deferLoading`
is recognized and is not the discovery path. This install still has no timeout
policy package.
