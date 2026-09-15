# Agent instructions

Guidance for coding agents working in this repository. Human contributors
should also read [CONTRIBUTING.md](./CONTRIBUTING.md).

## Project overview

`dsh-progressive-tools` is a DeepSeek Harness (DSH) plugin that provides
cache-stable progressive tool discovery. The default `stable-proxy` mode keeps
a small byte-stable tool surface (`tool_search`, `tool_dispatch`, and a few
always-visible tools) on every request, holds the complete tool catalog in
process memory, and executes discovered tools through the ordinary DSH
execution pipeline. A legacy `dynamic` mode natively activates whole tool
families at the cost of cache stability.

## Layout

| Path | Purpose |
| --- | --- |
| `src/index.ts` | Plugin entry: config resolution, tool registration, prompt projection, routing guard, lifecycle events |
| `src/catalog.ts` | Catalog construction, wildcard matching, BM25-style tool search, group ranking |
| `src/state.ts` | Dynamic-mode activation state: LRU eviction, turn expiry, snapshots |
| `src/defaults.ts` | Default config values, always-visible patterns, built-in family rules |
| `src/types.ts` | Shared public types |
| `tests/` | Vitest suites, including a real AgentLoop request regression test |
| `docs/` | Architecture, configuration reference, progressive disclosure model |
| `cordis.patch.yml` | Bundle composition patch consumed by the DSH plugin loader |

## Commands

Current release: `0.4.0`; supported host core baseline: `0.1.5-rc.1`.
Core peers are pinned to the tested prerelease. Do not broaden the range
without a compatibility run. Read [docs/README.md](./docs/README.md) for
onboarding, migration, testing, release and maintenance guidance.

```sh
pnpm install          # install dependencies (pnpm 11, Node 22.19+ or 24+)
pnpm run typecheck    # tsc --noEmit
pnpm run lint         # oxlint src tests
pnpm run test         # vitest run
pnpm run build        # tsc -p tsconfig.build.json -> lib/
pnpm run check        # typecheck + lint + test + build + publint (run before finishing)
pnpm peers check      # confirm the installed validation graph has no peer conflicts
```

## Invariants that must not break

1. The first AgentLoop request already carries the small stable surface.
2. Discovery never changes the top-level tool list, system text, or generated
   Code Mode SDK for an unchanged composition. The AgentLoop integration test
   asserts byte-level prefix equality; keep it passing.
3. Deferred tools execute through the full DSH pipeline (`ctx.tools.execute`
   with the dispatcher token as parent), so approval, guards, validation,
   timeouts, and result policy still apply.
4. Direct calls to deferred names stay denied by the monotonic guard. Any new
   deferred path must be covered by the guard and by an end-to-end test.
5. All runtime behavior uses public DSH services and events. Per-agent state
   stays isolated and every effect is reversible for unload and reload.

## Conventions

- Conventional Commit subjects; keep commits focused.
- Add or update tests for behavior changes, including resume and unload paths.
- When public behavior changes, update `README.md`, `README.zh-CN.md`,
  `docs/configuration.md`, `docs/architecture.md`, and `CHANGELOG.md` in the
  same change. Keep both README languages in sync.
- Comments and docs explain intent and constraints, not restatements of code.
- Do not add runtime dependencies without discussion; the plugin currently
  depends only on the DSH peer packages and the schemastery validator.

## Content policy

- Never mention AI assistant identities, AI vendors, or model or product names
  of AI systems in code, comments, documentation, commit messages, or any
  other project text. Describe capabilities and protocols generically (for
  example "provider-native deferred tool protocol") instead of naming a
  provider.
- Do not add attribution footers or co-author trailers to commits.
