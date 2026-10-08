# Testing and evidence

## Required check

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run check
pnpm peers check
```

`check` runs type checking, lint, tests, build, and package validation.
It must pass before merge or release. The current release baseline has
46 tests across five files. Counts are a snapshot, not a coverage guarantee.

| Suite | What it verifies |
| --- | --- |
| `catalog.spec.ts` | Group rules, lexical ranking, nested schema text, multilingual matching and estimates |
| `state.spec.ts` | Dynamic activation, expiry, LRU, budget and snapshot behavior |
| `plugin.spec.ts` | First assembly, discovery grants, routing, top-level/nested replay, legacy records and cleanup |
| `agent-loop.spec.ts` | Actual first request, serialized tool equality and leading system-message equality after discovery/status |
| `ptc.spec.ts` | Real host PTC bridge under ptc/both, both SDK renderers, direct-call denial, target validation and reload replay |

The PTC suite uses a binding runtime fixture: it invokes the real registry
bindings and durable dispatch pipeline but does not launch a TypeScript or
Python interpreter. The request suite intercepts streaming; it uses no remote
provider or credentials. CI runs the required check on Node 22.19.0 and 24.

## Manual deployment verification

Use the [getting-started smoke test](getting-started.md) in the target profile.
Verify an allowed call, an approval-denied call, malformed arguments, and
restoration in a separate session. Exercise the real language runtime if the
deployment uses PTC, including cancellation and non-text results.

## Evidence limits

Passing tests do not prove real provider cache hit rates, lower bills, or
end-to-end task success. Character-based token estimates are approximate.
There is no published real-task performance benchmark for this release.
Compaction and session storage migration remain host-owned behaviors and need
deployment-specific verification. Additional coverage can be explored with
`pnpm run test:coverage`; it is separate from the required release check.
