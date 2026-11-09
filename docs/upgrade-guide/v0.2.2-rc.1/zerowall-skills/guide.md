---
kind: upgrade-guide
description: "ZeroWall Skills use one curated catalog and shared enablement instead of duplicate legacy navigation entries."
---

# ZeroWall Skills management

English | [中文](guide.zh.md)

## Change

`@zerowall/dsh-plugin-skills` manages the shared Skill catalog. Twelve core workflows are initially enabled; other model-invocable bundled workflows are available on demand through `skills_manage` search and activation. Switches default to all workspaces, and explicit workspace overrides take precedence over global choices. Manually disabled and newly imported Skills do not activate automatically. Legacy navigation Skills covered by plugins are removed from the curated catalog, overlapping workflows are merged, and unavailable legacy GUI integrations are excluded. Existing project and user directories remain intact. The Skill registry applies management policies to discovery and direct loading, including Claude projection.

`registerEnablementPolicy()` returns an asynchronous disposer. Direct consumers must await it; Cordis effects await it during plugin disposal.

## Migration

1. Back up existing Skill directories before changing the profile. Remove duplicate legacy bundled roots from the profile's `dsh-skill-filesystem` configuration; keep user and project roots.
2. Open Settings → Skills. Inspect `resources/audit.json` in the installed package for the old-to-new mapping. Use the owning plugin for replaced navigation entries and the recorded target for merged workflows.
3. Leave optional workflows available on demand, or set their switches individually or by topic. Select a directory only when applying a workspace override. Python dependency preparation must succeed before explicit or automatic activation; failures retain the prior state. Automatic selection lasts for the current process and workspace; manual choices persist. Imported scripts are not executed during import.
4. Check the catalog from a standard and a Claude session. Disabled definitions remain visible in management but cannot be loaded, and disabling a winning definition never activates a shadowed copy.
