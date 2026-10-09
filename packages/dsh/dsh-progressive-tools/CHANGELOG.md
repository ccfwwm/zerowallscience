# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and releases follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.0] - 2026-09-29

### Changed

- Target host runtime `0.2.0-rc.1`. Core peers match that baseline.
  `0.1.7-rc.2` is no longer accepted. Cordis `~4.0.4` and the validator
  `~3.18.4` are unchanged.
- Recognize host `ToolSchema.deferLoading`. stable-proxy still removes
  deferred catalog tools from the assembled request. A tool already on the
  stable surface keeps the flag. Routes without tool updates materialize
  that flag as an immediate schema, so it is not the discovery mechanism.

## [0.6.0] - 2026-09-25

### Changed

- Target host runtime `0.1.7-rc.2`. Core peers, Cordis `~4.0.4`, and the
  validator `~3.18.4` match that baseline. `0.1.5-rc.1` is no longer accepted.
- Initialize discovery on `agent/created`. Replay reads current tool-result
  messages and still accepts older tool-result content blocks.
- PTC fixtures follow `ctx.ptcRuntime`. Program bindings are unchanged.

## [0.5.1] - 2026-09-25

### Changed

- Publish on npm as `@everclear077/dsh-progressive-tools`. The unscoped name
  `dsh-progressive-tools` is already owned by another account.

## [0.5.0] - 2026-09-25

### Changed

- Default stable search results use `dsh-progressive-tools/v3`: an exact name
  returns only that tool, a family member table is listed once, cumulative
  discovery stays in presentation metadata, and repeated definitions already
  present in derived history return a short notice unless `reload` is set.
- Default `tool_dispatch` returns `dsh-progressive-tools/dispatch-v2`
  (`protocol`, `tool`, `value`). Rendered content is not copied into the
  program value. `legacyResults: true` restores the previous envelopes.
- `estimatedSavedTokens` remains a metadata alias of `omittedDefinitionTokens`.
  It estimates definitions omitted from the top-level tool list. It is not a
  net task saving.
- Deferred `tool:<name>` guidance is removed from the stable prompt and
  attached when that tool's definition is loaded. A frozen capability summary
  lists classes without members or live discovery counts.
- Keep high-frequency filesystem tools (`read`, `write`, `edit`, `glob`,
  `grep`) on the default stable surface so ordinary file work does not pay a
  search-then-dispatch round.
- Lower default `maxResults` from `5` to `2` so each search writes fewer full
  schemas into conversation history.
- Tell the agent not to search merely to prove a named tool is missing: refuse
  invented or uncallable names from the visible surface, and still search
  before declaring a needed capability class unavailable. An unmatched
  identifier query now returns no definitions instead of filling `maxResults`
  with unrelated schemas.

### Added

- `maxResultCharacters`, `repeatDefinitions`, `profile: coding` (optional),
  `resultBudget` (optional, with `tool_result_read`), and `familyDiscovery`.
- `pnpm run baseline` writes a deterministic character report. It does not
  call a model. Paid task comparison is still outstanding.
- `resultBudget` also replaces the model-facing `run_code` text through
  `tools/post-execute`. The program value is unchanged, and a nested dispatch
  is not budgeted a second time.
- `autoloadMaxTools` (default `0`) can place a small deferred catalog on the
  frozen surface. `profile: auto` adds registered terminal tools at the first
  assembly. Neither changes the default surface.
- Search counts document frequency once per query. Exact-name ranking is unchanged.

### Docs

- Record measured token, cache, latency, and task-outcome impact in both
  READMEs, with an architecture overview figure.
- Replace the ASCII `stable-proxy` sketch in both READMEs with a staged
  request-flow diagram (registry, frozen surface, three call paths, dispatch
  pipeline).

## [0.4.0] - 2026-09-13

### Changed

- Target runtime `0.1.5-rc.1` explicitly; older runtimes are no longer supported
  by this checkout. Align the validator with version `3.18.2` and update the lockfile.
- Use `ToolCallId`, session event snapshots, and current PTC dispatch records.
  Recognize historical nested records when the host retains them as ignorable
  events; the plugin does not migrate host session files.
- Update the integration fixture for asynchronous agent creation and session
  projections, and compare the actual leading system message in requests.

### Added

- PTC and both-mode bridge regressions for TypeScript/Python SDK stability,
  direct-call denial, target validation, and discovery restoration after reload.
  These use a binding runtime fixture, not language interpreters.
- Documentation navigation, setup, migration, troubleshooting, verification
  boundaries, coding workflow, release/rollback procedure, and maintenance roadmap.
- Pull request and issue templates with reproducible acceptance evidence.

## [0.3.0] - 2026-08-25

Upgrading changes the stable discovery prompt text, so every deployment pays
one context-cache cold start on the first request after the upgrade; the
prefix is byte-stable again from the second request onward.

### Added

- Family-wide discovery: each stable search match lists every member tool name
  of its family (`groupTools`), and the whole family becomes dispatchable from
  that one search, so a plugin's tool surface is no longer truncated to the
  top-ranked slice.
- Stable-proxy `status` action lists every deferred family with member tool
  names, giving the model a catalog-browsing fallback when a search query has
  no lexical overlap.
- `statusGrantsDiscovery` option (default `false`): when enabled, one `status`
  listing makes every cataloged name dispatchable. The default keeps dispatch
  behind a seen schema and the rejection message points to the deterministic
  exact-name recovery search.
- Generic verb prefixes (`get`, `list`, `create`, ...) never merge into
  automatic families, so unrelated plugins sharing a prefix stay separate.
- The built-in image-generation family covers generation task helpers such as
  `get_image_generation_task` and `cancel_image_generation_task`.
- CJK character-bigram tokenization so queries without space-delimited words
  match deferred definitions and family metadata without configured aliases.
- `tool_dispatch` delegates its parallel-scheduling classification to the
  target tool, so concurrency-safe deferred tools keep overlapping execution.
- Documentation: an ecosystem onboarding checklist (`alwaysVisible` for
  high-frequency tools, `skillBindings` for Skill-shipping packages, explicit
  `groups` for unconventional names).

### Changed

- Search results now record per-call discovery increments in the rendered
  text, plus a cumulative `discoveredCount`; the cumulative name list moved to
  presentation metadata, so conversation growth stays bounded and resume
  restores full state from the latest surviving entry.
- The stable discovery prompt clarifies that names mentioned elsewhere in the
  prompt still require discovery, and points to `status` for catalog browsing.
- `max_results` values outside the configured range are clamped instead of
  rejected, matching upstream tool-search semantics.

### Fixed

- The routing guard prepares per-agent state on demand, closing a
  direct-call window before the first assembly or session-start event.
- Discovered-tool state survives registry refreshes such as provider
  reconnects; dispatch validates catalog membership at call time.
- Dispatch failures preserve the real tool's structured error code instead of
  collapsing it into an unstructured message.

## [0.2.0] - 2026-08-25

### Added

- Cache-stable `stable-proxy` mode as the new default.
- Fixed first-request surface with `tool_search`, `tool_dispatch`, and
  configurable common direct tools.
- Exact definition search with BM25-style lexical ranking over nested schema
  text and multilingual family aliases.
- Nested real-tool dispatch through the complete DSH execution pipeline.
- Monotonic routing guard for direct-call and Code Mode bypass prevention.
- Stable Code Mode SDK projection and conservative tool-guidance deferral.
- Real AgentLoop request regression test for first-request and prefix stability.

### Fixed

- First request no longer sends the full tool catalog before progressive state
  takes effect.
- Dynamic-mode search and Skill activation now affect the immediately following
  request instead of lagging one request boundary.
- Request lifecycle documentation now matches the official assembly order.

### Changed

- Search returns exact tool definitions in stable mode instead of activating a
  whole family.
- Agent-scoped tools can be deferred in stable mode.
- `dynamic` is now an explicit compatibility mode.

## [0.1.0] - 2026-08-25

### Added

- Per-agent progressive tool discovery through the official scoped restriction
  API.
- Configurable family rules, multilingual aliases, and automatic fallback
  grouping.
- Token-budget, LRU, family-cap, and turn-TTL retention controls.
- Optional skill-to-family activation bindings.
- Dynamic registry refresh and reversible lifecycle cleanup.
- Resume restoration for top-level and nested discovery calls.
- Bundle manifest, GitHub source-install build path, documentation, tests, and
  continuous integration.

[Unreleased]: https://github.com/everclear077/dsh-progressive-tools/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/everclear077/dsh-progressive-tools/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/everclear077/dsh-progressive-tools/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/everclear077/dsh-progressive-tools/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/everclear077/dsh-progressive-tools/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/everclear077/dsh-progressive-tools/compare/f2bd297...v0.4.0
[0.3.0]: https://github.com/everclear077/dsh-progressive-tools/compare/v0.2.0...f2bd297
[0.2.0]: https://github.com/everclear077/dsh-progressive-tools/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/everclear077/dsh-progressive-tools/releases/tag/v0.1.0
