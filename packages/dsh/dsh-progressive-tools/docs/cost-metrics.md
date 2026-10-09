# Cost and size metrics

These names are the ones the local baseline and evaluation helpers use.
Character counts, byte counts, character-ratio estimates, and server usage
are different measurements. A missing price or a missing usage record is
`unknown`. It is not zero.

| Field | Meaning |
| --- | --- |
| `characters` / `bytes` | Size of one concrete string. |
| `estimatedTokens` | `ceil(characters / charactersPerToken)`. Not a provider tokenizer. |
| `usage.source` | `server` only when a host usage record was supplied. Otherwise `unknown`. |
| `cost` | Computed from server usage and an explicit price config. Otherwise `unknown`. |
| `omittedDefinitionTokens` | Estimate of deferred definitions absent from the top-level tool list. |
| `estimatedSavedTokens` | Deprecated alias of `omittedDefinitionTokens` in search metadata. Not a net task saving and not a bill. |

Discovery and execution traces are keyed by the real target tool.
`run_code → tool_dispatch → target` attributes the call to `target`.
Execution events and durable log copies are not added again as model input.

`pnpm run baseline` writes [the current deterministic report](cost-baseline-report.md).
The redacted fixture at `tests/fixtures/redacted-usage.json` has no server usage;
analysis must report the cost as unknown.

Paid task runs are not part of this command. See [implementation status](implementation-status.md).
