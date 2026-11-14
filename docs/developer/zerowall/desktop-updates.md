---
description: "Operate ZeroWall's isolated EXE feed and restart-activated npm business updates."
---

# ZeroWall software updates

English | [中文](desktop-updates.zh.md)

## Summary

Windows installers use Qiniu; business plugins use npm; Host Runtime packages use the signed `stable/host-runtime/` feed. Checking discovers versions without downloading packages. Downloads require a user action; EXE installation requires separate native confirmation. Official environment configuration services retain their current endpoints. Official 9.x releases retain the legacy 8.x stable channel.

## Table of Contents

- [Desktop release](#desktop-release)
- [Business packages](#business-packages)
- [Host Runtime](#host-runtime)
- [Recovery](#recovery)
- [Qualification](#qualification)
- [Dev Note](#dev-note)

<a id="desktop-release"></a>

## Desktop release

The public [release configuration](../../../apps/desktop/config/zerowall-release.json) separates the official 9.x lane from preview builds. Official Windows retains appId `com.zerowall.science`, `ZeroWallScience.exe`, `stable/latest.yml` and immutable `stable/releases/<version>/` artifacts. Preview builds retain their isolated `newui` identity and feeds. The 9.1 ZeroWall npm package metadata uses formal `0.1.0` versions, the `latest` tag and no preview release profile.

The explicit `package:zerowall:stable` command builds the approved unsigned Windows x64 release with an update feed. Other unsigned builds remain feedless test artifacts. Product 9.1.2 is independent of bundled DSH 0.2.2-rc.1. The [9.1 Host Runtime upgrade guide](../../upgrade-guide/v0.2.2-rc.1/zerowall-host-runtime/guide.md) owns the Bootstrap and external-runtime migration. Packaging reads public configuration only; Qiniu and resource-signing secrets stay in ignored `apps/desktop/config/publishing/.env.qiniu` and its referenced PEM.

`publish:zerowall:stable --stage <absolute-exe> --version 9.1.2` verifies the embedded installer version, unsigned status and embedded resource trust, uploads immutable EXE/blockmap/signed release metadata, and checks every public size and SHA-256. `--promote <absolute-publication.json>` checks the staged objects again, rejects concurrent pointer changes, switches the legacy YAML and website JSON, refreshes CDN and verifies both pointers.

Release metadata uses Ed25519 resource signatures; this is independent of Windows Authenticode. The installer remains unsigned as in 8.x. Changed bytes at an existing immutable key stop publication. Journals and previous pointer bytes remain under `.desktop-build/zerowall-stable-publications`; a switching failure requires inspection and recovery before another promotion.

Existing feed-enabled 8.x installations can detect 9.x on the same stable channel. Feedless newui builds require one manual install. Checking does not download; download requires a click, and installation requires a separate confirmation after running tasks are inspected and the Host stops.

<a id="business-packages"></a>

## Business packages

Science's `zerowall.defaultBundles` generates the owned package allowlist. Check it with `node distribution/scripts/sync-update-policy.mjs --check`; regenerate the Desktop Host manifest with `--write` when changing ownership. Core DSH, Cordis, React and native carriers remain installation-owned. ZeroWall packages in the 9.1 release set are exact `0.1.0` versions on npm's `latest` tag; `pnpm run zerowall:verify-formal` checks the closure. Build and publish business archives through the [npm distribution procedure](npm-distribution.md).

The ZeroWall plugin index includes the Windows-only `dsh-computer-use-win` bundle. Installing it adds its native profile layer and computer-control settings without manual MCP configuration. Its lifecycle and version checks use the existing plugin manager.

<a id="host-runtime"></a>

## Host Runtime

The Desktop Bootstrap resolves an active Host Runtime from `$DSH_HOME/zerowall/host-runtimes/` and falls back to the immutable runtime bundled with the installer. A runtime directory is immutable after staging and contains a signed `host-runtime.json`; the state file records `active`, `previous`, and `pending` generations. Activation occurs only during a restart after task inspection and Host shutdown. The next Host must report its own runtime version, source and protocol, and the primary renderer must mount before confirmation; a failed boot restores the previous generation and keeps its diagnostic record.

Host Runtime metadata is published at `stable/host-runtime/latest.json` with immutable release objects under `stable/host-runtime/releases/<version>/`. The Bootstrap verifies the Ed25519 signature, platform, architecture, DSH and Host protocol versions, Electron/Node ABI, LibreOffice kit, Python, pnpm, payload size and SHA-256 before selecting a runtime. The Bootstrap is part of the Desktop installer, so an older Desktop ignores the external feed and continues using its bundled Host.

Build the signed runtime archive and feed from a prepared Host directory with `pnpm --dir apps/desktop run host-runtime:release -- --runtime <runtime-dir> --output <feed-dir> --version <runtime-version> --product 9.1.2 --dsh 0.2.2-rc.1 --protocol 4 --electron 44.7.0 --abi 149 --libreoffice 0.1.5 --pnpm 11.28.5 --python 3.12.14 --platform win32 --arch x64 --archive-url <https-url> --key-file <ed25519-pem> --key-id <key-id>`. The ABI is `process.versions.modules` from the packaged Electron runtime. `pnpm --dir apps/desktop run host-runtime:publish -- --stage <feed-dir>` authenticates the feed against the embedded trust and verifies uploaded immutable objects; `--promote <publication.json>` checks for concurrent pointer changes before publishing `latest.json`.

Settings → Updates distinguishes bundled, effective and offered versions. The manager checks versions on connection for enabled installations. An update installs exact versions in a new profile `.business-updates/generations/<uuid>` directory. Pnpm overrides omit shared runtime dependencies; every nested candidate package's original runtime requirements must match the installation. Candidate bundle patches, package identities, compatibility and a complete SHA-256 seal must pass before `state.json` records a pending generation. Canceling preparation leaves the active generation and profile configuration intact.

The shared `restart-transaction.json` records both original generations before activation and a durable joint commit decision before either confirmation write. An interruption replays the commit decision or restores both originals; per-transaction evidence remains in `transactions/`. Restart stops the Host after task inspection and admission locking. The next process activates and verifies candidate bytes before starting the Host. Host plugin failures or skipped updated bundles fail startup. The generation becomes verified only after all Client entries activate and the renderer mounts. Host and Client failures restore the previous generation and verify its next startup independently. An interrupted activation also requests recovery. Successful restarts retain selections, disable states, exact versions, compatibility exemptions and user configuration; an explicit missing override never silently falls back.

<a id="recovery"></a>

## Recovery

A recovered startup retains a notice in Settings → Updates. **Restore bundled features** prepares a baseline generation and requires restart; it does not edit user patches, accounts or explicit profile dependencies. Failed recovery remains visible and blocks another normal business update. When startup cannot reach settings, the native recovery dialog's explicit plugin-disable action archives the update journal as `state-before-repair-<uuid>.json`, resets the generation selection and uses the existing profile recovery procedure. Candidate directories and their evidence remain available for diagnosis.

Do not manually replace files inside a sealed generation or delete its journal to make startup appear successful. Preserve the profile and publication records when reporting failure. Repairing EXE installation follows the native updater's existing task shutdown and confirmation flow.

<a id="qualification"></a>

## Qualification

Tests cover candidate preparation, runtime dependency rejection, integrity failure, interrupted activation, version persistence and independent recovery; publisher tests use an in-memory object store and injected signature verifier. Those tests do not establish public release availability or a hardware signature. Qualify Windows native buttons, maximize/Snap and 100/125/150% scaling in the installed application. Use two actual feed-enabled versions to verify detection, download, installation, restart and final version; compare the public installer checksum with the local receipt. Exercise authentication and payments against an approved test account without a real debit.

<a id="dev-note"></a>

## Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

Release and activation journals are outside Session persistence. They do not change recorded conversation formats. Signing credentials, npm authorization and a reachable Qiniu bucket are deployment inputs, not repository defaults.

</details>
