---
description: "Move one original feature at a time into DSH plugins with independent dependencies, compatible data, acceptance evidence, and rollback."
---

# Migrate original ZeroWall features

English | [中文](migration.zh.md)

## Summary

Migrate one usable feature at a time while keeping the current desktop installable and runnable. Inventory the original implementation before choosing a repository or dependency. Each migration must include a user entry, Host behavior, tests, packaging evidence, and a safe data transition when needed. The batches below are a development order, not a claim that the features have migrated.

## Table of Contents

- [1. Inventory one feature](#inventory)
- [2. Choose a migration batch](#batches)
- [3. Build a complete plugin](#implementation)
- [4. Protect existing data](#data)
- [5. Accept and integrate one batch](#acceptance)
- [6. Distribute and recover](#distribution)
- [Dev Note](#dev-note)

-----

<a id="inventory"></a>

## 1. Inventory one feature

Read the feature under the original project `plugins/`, its matching `packages/`, profile patches, and existing tests. Record the old package and entry point rather than copying the entire workspace. Use this small checklist in the feature issue or migration PR.

- User entry and one observable success case; required settings and permissions.
- Host services, client slots, remote methods, npm dependencies, subprocesses, network services, and shared stores.
- Persisted files or tables, old and new versions, credential owner, migration reversibility, and backup path.
- Runtime resources, licenses, size, supported platform, failure recovery, test owner, and acceptance owner.

<a id="batches"></a>

## 2. Choose a migration batch

Choose the next feature by user value and dependency cost. The source names below identify inventory candidates; verify their actual coupling before fixing the order.

| Batch | Source candidates | Completion criterion |
|---|---|---|
| Keep the baseline working | Account, secrets, AI Cloud, brand UI already integrated | Current login, model, cloud-call, and installer checks stay usable. |
| Independent workflows | `pubmed`, `mineru`, `publications`, `zotero-harvest`, `dsh-file-review` | One selected workflow installs independently and completes one real task. |
| Shared scientific data | `projects`, `research-store`, `research`, `files`, `runs` | Define data ownership and import/backup before moving dependent screens. |
| Managed execution | `environment`, `execution`, `python`, `mcp`, `singlecell` | Verify external runtime acquisition, cancellation, failure handling, and cleanup. |
| Additional media and integrations | `images`, `videos`, `dsh-ppt-maker`, `wechat` | Add the remaining user workflows without duplicating current cloud services. |

<a id="implementation"></a>

## 3. Build a complete plugin

Use one canonical directory per new plugin and develop on that plugin repository's `main`. Combine features when they share one lifecycle and release together. Keep independently replaceable capabilities separate. Put window, installer, and OS integration in the desktop; use documented Cordis services, remote methods, tools, and client slots for business features.

Remove dependencies that only resolve inside the old monorepo, including `workspace:*`, source aliases, and absolute resource paths. Publish required shared libraries explicitly or package tightly coupled private helpers within the plugin. Keep DSH and Cordis peer versions compatible with the target desktop. Export built declarations, bundle client artwork, and declare a `dsh.bundle.patch` only for an installable profile layer.

Design error states and disposal with the feature: report actionable failures, stop dependent work, and release listeners, timers, subprocesses, and temporary files. Keep credentials with the existing credential service. Model-visible input and results must remain reconstructable from Session events; UI-only fixtures stay beside their owner. Follow [architecture](../../architecture.md) and [testing policy](../../testing.md).

<a id="data"></a>

## 4. Protect existing data

Test imports and migrations on a copy of the old data. Record the source version, export/import procedure, backup, and post-import checks. Do not overwrite the original profile, copy plaintext passwords into configuration, or treat a plugin downgrade as an automatic database downgrade.

A released Session or declared persistence-type change follows [the persistence review cookbook](../../cookbook/reviewing-persistence-type-changes.md) and [Session format status](../../session-format-status.md). Preserve committed historical generations; SQLite schema versions increase monotonically. Write an [upgrade guide](../../../.agents/skills/dsh-create-upgrade-guide/SKILL.md) for an externally perceptible break. Never invent fallback support that the reader does not implement.

<a id="acceptance"></a>

## 5. Accept and integrate one batch

Use the [development integration steps](development.md#integration) only after the feature passes its own tests. Each batch records these results before it is considered migrated.

1. Independent typecheck, unit tests, built artifacts, and packed-consumer import pass without the old workspace.
2. Install from the public Git source into an isolated target DSH profile, restart, and complete the chosen user task.
3. Disable or uninstall and confirm registrations and background work stop; reinstall or update without losing owned data.
4. Cover failures and cancellation, one keyless recorded Session for model-visible behavior, and owner-local UI evidence.
5. Run Windows package and clean-machine checks when the change adds runtime resources, native dependencies, or shell integration.
6. Commit the plugin first, then the desktop pin, lockfile, and applicable market metadata; attach evidence and remaining limits.

<a id="distribution"></a>

## 6. Distribute and recover

DSH Discover distributes fixed Git sources through `market/index.json`. ZeroWall's signed resource catalog separately verifies catalog signatures, immutable archive digests, and compatibility. Its preview validation must complete before stable promotion. Updating Discover alone does not publish or validate the signed catalog.

Keep the previous plugin commit, desktop lockfile, installation package, and data backup. For a code-only failure, restore the known working pin in a new desktop commit and retest. For a data-format change, follow the tested import/restore procedure; use a compatible application build rather than opening migrated data with an unsupported older reader.

<a id="dev-note"></a>

## Dev Note

<details>
<summary>Working context</summary>

None.

</details>
