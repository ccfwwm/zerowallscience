---
description: "Publish ZeroWall plugins to npm, install them through DSH, and maintain the separate native desktop shell."
---

# Publish and install ZeroWall plugins

English | [中文](npm-distribution.zh.md)

## Summary

Use the public `@ccfwwm` npm scope for AI Cloud, Brand UI and the Science bundle. DSH and Cordis compatibility declarations specify minimum versions; developer dependencies and the desktop lockfile pin tested builds. The supported baseline is DSH `0.2.2-rc.1`, Cordis `4.1.0` and Node.js `24.9.0`.

## Table of Contents

- [1. Choose the integration](#integration)
- [2. Validate and publish](#publish)
- [3. Install and update](#install)
- [4. Upgrade an existing desktop profile](#migration)
- [Dev Note](#dev-note)

-----

<a id="integration"></a>

## 1. Choose the integration

The separately published [Science bundle](../../../distribution/science/README.md) owns application configuration. Preserve native ZeroWall branding by maintaining the desktop shell alongside the official DSH runtime.

| Customization | Owner |
|---|---|
| Cloud login, credentials, balance and model discovery | `@ccfwwm/dsh-plugin-ai-cloud` |
| Sidebar and conversation branding, theme overrides | `@ccfwwm/dsh-plugin-brand-ui` |
| Plugin composition, account page, credential onboarding, index URL | `@ccfwwm/dsh-bundle-science` |
| Installer, executable icon, taskbar identity, tray, first window and updates | ZeroWall desktop distribution under `apps/desktop` |

The packages need no edits under `packages/` or `vendor/`. The desktop distribution retains its own integration and packaging code. Full native branding cannot be supplied by plugins loaded after the Electron shell starts.

<a id="publish"></a>

## 2. Validate and publish

Confirm `npm whoami` reports an account with access to the chosen scope. Run these commands in each canonical plugin directory, first `zerowall-dsh-plugin-ai-cloud`, then `zerowall-dsh-plugin-brand-ui`:

```sh
npm ci --no-audit --no-fund
npm run check
npm run test:package
npm publish --access public --tag next
```

The publication hook runs checks and packed-consumer verification. Alternatively, publish the exact tarball already validated by `test:package`; npm does not rebuild a tarball. Review `npm pack --dry-run --json` before publishing. Package versions are immutable: increment `version` for each subsequent release. The `next` tag selects preview releases; promote a tested version with `npm dist-tag add <package>@<version> latest` when ready.

Publish the Science bundle after both dependencies are available. From the desktop repository:

```sh
npm pack ./distribution/science --pack-destination .artifacts
npm publish ./.artifacts/ccfwwm-dsh-bundle-science-0.1.0-preview.1.tgz --access public --tag next
npm view @ccfwwm/dsh-bundle-science@next version dependencies engines
```

The desktop Host declares npm dependencies. After publishing a new package version, update its required minimum if necessary, run `pnpm install`, review the lockfile, and complete the checks in the [Windows delivery guide](windows-delivery.md). A plugin publication alone does not rebuild an installed desktop runtime.

<a id="install"></a>

## 3. Install and update

Upgrade a separately installed npm CLI and install the preview suite:

```sh
npm install --global @deepseek-ai/dsh@0.2.2-rc.1
dsh --version
dsh plugin --profile web add @ccfwwm/dsh-bundle-science@next
dsh web
```

Repeat the suite `add` command to select the current preview release. For Desktop, use its bundled command with `--profile desktop` after fully quitting the app. A global npm CLI upgrade does not replace the runtime embedded in the desktop installer. Plugin installation uses pnpm; keep it on PATH. With pnpm 11, explicitly deny the unused `@google/genai` and `protobufjs` build scripts in the profile's `pnpm-workspace.yaml` if pnpm requests a decision, then retry. ZeroWall Desktop seeds these denials.

For an isolated Web trial, set `DSH_HOME` to a new absolute directory before installation and launch. Verify that the cloud account entry, model settings, brand marks and Discover tab appear. Disable the suite and restart to check that its configuration and UI registrations are removed. Cloud authentication and paid requests require a separately authorized test account.

<a id="migration"></a>

## 4. Upgrade an existing desktop profile

The desktop upgrades enabled built-in bundle names from `@zerowall` to `@ccfwwm`, saves the original manifest as `package.before-npm-scope.json`, and preserves user patches and disabled choices. Existing profiles keep their individual plugin composition. New profiles select the Science suite.

To switch an existing profile to the suite, stop the app and back up its `package.json` and `cordis.patch.yml`. Install the suite, then replace the individual AI Cloud, Brand UI and experimental plugin-market entries in `dsh.profile.bundles` with one `@ccfwwm/dsh-bundle-science` entry. Keep unrelated entries and user patches. Existing account-page or index patches continue to override the suite until you remove those specific overrides yourself.

Keep backups of user data when changing a runtime. Plugin removal does not downgrade Session or storage formats. Read the upstream upgrade guides for data compatibility; this bundle introduces no Session format.

<a id="dev-note"></a>

## Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
