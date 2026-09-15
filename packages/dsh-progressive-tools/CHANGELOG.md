# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and releases follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/everclear077/dsh-progressive-tools/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/everclear077/dsh-progressive-tools/compare/f2bd297...v0.4.0
[0.3.0]: https://github.com/everclear077/dsh-progressive-tools/compare/v0.2.0...f2bd297
[0.2.0]: https://github.com/everclear077/dsh-progressive-tools/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/everclear077/dsh-progressive-tools/releases/tag/v0.1.0
