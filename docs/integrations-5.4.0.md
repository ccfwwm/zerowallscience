# ZeroWall 5.4.0 Plugin Integration

Pinned sources and licenses are recorded in `config/integrations/upstream-sources.json` and `THIRD_PARTY_NOTICES.md`.

## Ownership

The active WeChat implementation is `packages/dsh-wechat` 0.8.0. The legacy `plugins/wechat` package is excluded from the workspace. Existing upstream account and configuration storage paths are retained. The active plugin does not expose the legacy Secret Broker contract; no credential migration from the inactive package is performed.

Capability management uses the upstream menu with a ZeroWall per-session selection service. `meta_search` and `meta_enable` are the default discovery tools. MCP aliases forward through the same service. Schema projection, PTC SDK generation and ToolRuntime execution share that policy. Selection events restore tools and disabled capabilities after session replay. Default native tools are read, read_image, glob, grep, ask_user_question and todo_write when registered.

Each enable request accepts at most eight capabilities. Sessions allow 24 explicitly selected capabilities and 48 KiB of tool schemas. Search lists are capped at 12 results, descriptions at 350 characters, and detail responses at 12,000 characters. Full skill instructions load through explicit selection. Legacy large skill catalogs are replaced only on the model surface, retaining the source log.

`dsh-auto-review` owns operation approval, defaults off, uses Chinese reports, and delegates failures to human approval. `plugins/reviewer` retains answer and citation verification with its existing settings and events. These are independent functions and switches, as requested.

`dsh-file-review-tab` adapts upstream 0.6.0 while retaining its package identity, fileReview service and Better Sidebar entry. A single lifecycle capture and PTC adapter record changes. File operations remain workspace-contained, reject symlinks and files over 16 MiB, compare Windows writable bits, and preserve CRLF during hunk operations.

Managed MCP connection fields are read-only in both the editor and Host API. The enabled switch remains editable. Credentials remain in Environment settings.

## Verification Boundaries

Local automated tests use deterministic model and MCP fixtures. Actual WeChat login, sending to contacts, and production rmcp deployment are separate operations. No production deployment is part of this local build.
