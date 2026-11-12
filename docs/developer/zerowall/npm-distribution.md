---
description: "Build and release ZeroWall npm plugins."
---

# ZeroWall npm distribution

English | [中文](npm-distribution.zh.md)

## Summary

ZeroWall Desktop defaults to the six upstream npm plugins and the ZeroWall business plugins. Own packages use `@zerowall`. The 9.1 formal release set contains 15 `@zerowall` packages on npm's `latest` tag: Skills and Science use exact `0.1.1` versions, and the other packages use `0.1.0`. The tested baseline remains DSH `0.2.2-rc.1`, Cordis `4.1.0`, Node.js `24.21.0` and pnpm `11.28.5`; the Desktop lockfile fixes installed versions.

Installation-provided Desktop business packages update through Settings → Updates; exact npm versions are prepared in a sealed user generation and activated on restart. See [software updates](desktop-updates.md) for the allowlist, shared runtime and recovery behavior.

## Table of Contents

- [Package ownership](#package-ownership)
- [Build and inspect archives](#build-and-inspect-archives)
- [Release](#release)
- [Existing profiles](#existing-profiles)
- [Dev Note](#dev-note)

## Package ownership

The [Science manifest](../../../distribution/science/package.json) owns default selection. Desktop selects bundles individually so each plugin can be disabled without duplicate registrations. The Science patch configures Discover and account onboarding. Installing Science alone does not enable all dependencies.

| Owner | Packages |
|---|---|
| Upstream npm | `dsh-free-search`, `dsh-better-sidebar`, `dsh-wechat`, `dsh-ssh-ops`, `@dingyi222666/dsh-session-notification`, `@michengai/dsh-archive-manager` |
| ZeroWall business | Zotero with Harvest, PPT, video, image, Claude, AI Cloud and Brand UI |
| Shared services | Environment, MCP, Python, research storage and resource integrity |

Third-party packages keep upstream implementations and native configuration. File Review, Dream Skin, Open File Viewer and Office Tools are excluded. PPT uses the official Office conversion service and its installed LibreOffice kit.

## Build and inspect archives

Run from the repository root:

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
pnpm run zerowall:verify-formal
```

The pack command inspects exports, patches, README files and licenses, rejects local dependency protocols, and writes versions and SHA-512 integrity values to `.artifacts/zerowall-npm/manifest.json`. It uses the existing build without rebuilding. Use `--output <directory>` and `--packages <comma-separated-names>` for a separate release set. Retain these exact archives for release.

Install these archives and the matching DSH release into a separate directory, then run `pnpm run zerowall:check-install <directory>`. The command imports public Host entries, checks installed versions, and rejects duplicate DSH or LibreOffice kit releases. It writes `.artifacts/zerowall-npm/installed-validation.json`; `--manifest <path>` and `--output <path>` select a separate release manifest and report.

<a id="publish"></a>
## Release

Publication requires an npm account with write access to `@zerowall`. A denied scope check does not permit a scope change. Publish validated dependency archives to `latest` before consumers, and Science last. The 9.1 package metadata exposes no `preview` profile or `next` publication tag. Reinstall the exact manifest versions from npm in an isolated profile and repeat startup, configuration and workflow checks before updating Desktop or promoting the 9.1 stable feed. Increment versions; never replace released archives.

Local archive checks do not establish registry publication, authenticated workflows or Windows installation readiness. Follow the [Windows delivery guide](windows-delivery.md) for native client acceptance.

<a id="migration"></a>
## Existing profiles

Desktop renames enabled installation-provided legacy identities to `@zerowall` and saves `package.before-zerowall-scope.json`. It adds newly offered default bundles once, records them in `zerowall.defaultBundles`, and saves `package.before-default-plugins.json`. A profile without that record receives the current default set. Subsequent starts preserve disabled choices and recovery selections; explicit dependencies retain their names and versions. User patches, credentials, task data and project paths remain user-owned. See the [upgrade guide](../../upgrade-guide/v0.2.2-rc.1/zerowall-npm-scope/guide.md).

Installation-provided plugins appear under Built-in plugins, including disabled, missing and failed packages. User-installed bundles appear under Installed plugins. Open a plugin to inspect version, status, documentation and contributed configuration. Internal runtime rows remain in the advanced inventory. Refresh reads status without saving configuration.

## Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

Registry reinstall and authenticated workflows need the corresponding release and account access.

</details>
