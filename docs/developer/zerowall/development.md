---
description: "Set up the Windows development checkout, locate customization owners, work on plugin main, and integrate tested Git artifacts."
---

# Develop ZeroWall desktop and plugins

English | [中文](development.zh.md)

## Summary

Build the desktop from the canonical checkout and develop plugins in their own repositories. Plugin builds produce the committed artifacts used by Git installation. Integrate a plugin only after its independent checks pass; a local plugin edit does not update the bundled desktop automatically.

## Table of Contents

- [1. Prepare the environment](#setup)
- [2. Build and run the desktop](#desktop-loop)
- [3. Locate the change owner](#source-map)
- [4. Develop each plugin on main](#plugin-loop)
- [5. Integrate a tested plugin revision](#integration)
- [6. Synchronize upstream deliberately](#upstream)
- [Dev Note](#dev-note)

-----

<a id="setup"></a>

## 1. Prepare the environment

Use Windows x64, Git, Node.js 24.9 or later, and the pnpm version declared by [packageManager](../../../package.json). This checkout currently declares pnpm 11.28.5. Windows packaging additionally needs the tools checked by [the packaging preflight](windows-delivery.md#preflight).

```powershell
Set-Location C:\codekg\scienceproject\zerowallscience-newui
node --version
pnpm --version
git status --short --branch
pnpm install --frozen-lockfile
```

Install must finish before another pnpm command starts. If a deliberate dependency edit makes the frozen install fail, resolve it with `pnpm install`, review the lockfile, and commit both files. Do not run competing installs against the same checkout.

<a id="desktop-loop"></a>

## 2. Build and run the desktop

Run these from the desktop repository root. The first command builds repository artifacts, the second checks aggregate programs against them, and the third starts the desktop with its existing output.

```powershell
pnpm run build:artifacts
pnpm run build:check
pnpm run start:desktop
```

Alternatively, `pnpm run dev:desktop` builds repository artifacts and the shell before starting. It does not replace the aggregate `build:check`. `pnpm run build` runs both repository build phases. Rebuild and restart after changes; independent plugin repositories are not watched by this launcher.

The [development launcher](../../../apps/desktop/scripts/dev.ts) prints the actual `DSH_HOME`, Electron user-data directory, and inspector ports. Defaults live under `apps/desktop/.desktop-build/development/`. For an isolated test, give both `DSH_HOME` and `DSH_DESKTOP_USER_DATA_DIR` fresh absolute paths in the current shell before launch. Keep the installed application data untouched.

The default local inspector ports are 9229 for Electron main, 9222 for the renderer, and 9230 for Host. Diagnose shell/window errors in main, UI errors in renderer DevTools, and account/network/provider failures in Host. Do not attach to or terminate an unrelated installed process.

<a id="source-map"></a>

## 3. Locate the change owner

Change the narrowest owner and keep business features in plugins. Read its README and applicable `AGENTS.md` before editing.

| Change | Owner |
|---|---|
| Initial window, recovery, taskbar identity | [apps/desktop/src/main.ts](../../../apps/desktop/src/main.ts) |
| Application and tray artwork | [apps/desktop/resources](../../../apps/desktop/resources), [icon renderer](../../../apps/desktop/scripts/render-tray-icon.ts) |
| Installer copy and animation | [apps/desktop/installer](../../../apps/desktop/installer), [installer artwork renderer](../../../apps/desktop/scripts/render-installer-brand.ps1) |
| Built-in plugin dependencies and account presentation | [Desktop Host manifest](../../../apps/desktop-host/package.json), [profile composition](../../../apps/desktop-host/src/profile.ts) |
| Sign-in, balance, cloud calls | AI Cloud repository: `src/account`, `src/cloud`, `test` |
| Brand slots and theme | Brand UI repository: `src/client`, `test` |

App and installer artwork belongs to the shell. AI Cloud ships its own image inside its package and bundle; never point it at a desktop resource path. Route UI text through locale dictionaries, reuse DSH UI tokens and slots, and dispose registrations, timers, and listeners with their owning plugin.

<a id="plugin-loop"></a>

## 4. Develop each plugin on main

Use the existing canonical directory. These commands are for AI Cloud; use `zerowall-dsh-plugin-brand-ui` for Brand UI. Inspect local changes first and resolve them before pulling. Never overwrite a draft to make the pull succeed.

```powershell
Set-Location C:\codekg\scienceproject\zerowall-dsh-plugin-ai-cloud
git status --short --branch
git switch main
git pull --ff-only origin main
npm ci --no-audit --no-fund
npm run check
npm run test:package
```

`check` runs type checking, unit tests, and the build. `test:package` packs the current output and tests it from a separate temporary consumer. Git installation does not execute lifecycle scripts, so review and commit rebuilt `lib/` with source changes. CI rejects a build that changes committed output. Temporary consumers are not extra development repositories.

Before pushing `main`, inspect the exact diff, stage only intended source, tests, docs, manifests, and built files, then commit and run `git push origin main`. Keep normal hooks enabled. Verify the remote head with `git ls-remote origin refs/heads/main`. Documentation-only plugin commits do not require a package version bump or desktop pin update.

<a id="integration"></a>

## 5. Integrate a tested plugin revision

For behavior changes, first publish the plugin commit with its rebuilt artifacts. Record its package version and commit in the delivery record. Update the matching Git dependency in `apps/desktop-host/package.json` to that exact commit, resolve with `pnpm install`, and review `pnpm-lock.yaml`. Do not replace hashes manually across the lockfile or suppress integrity failures.

For a discoverable release, update `market/index.json` according to the [index format](../../../packages/util/plugin-market-index/README.md), preserving existing versions and matching package metadata and DSH compatibility. Rebuild the desktop, run [focused checks and clean-profile acceptance](windows-delivery.md#automated-tests), then commit the desktop manifest, lockfile, and index together. Installing a plugin into another profile is not evidence that the bundled desktop contains it.

<a id="upstream"></a>

## 6. Synchronize upstream deliberately

Record the official DSH base and local patches before an upstream update. Compare startup, installer, plugin slots, remote schemas, credentials, and profile loading first. Retain each customization only when the new base still needs it, and check plugins against the new peer versions. Follow [the migration workflow](migration.md) and rerun each affected layer before changing the integrated baseline.

<a id="dev-note"></a>

## Dev Note

<details>
<summary>Working context</summary>

None.

</details>
