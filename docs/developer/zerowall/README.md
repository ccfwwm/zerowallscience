---
description: "Develop the ZeroWall desktop and independent plugins, migrate original features in small batches, and prepare Windows test deliveries."
---

# ZeroWall Science contributor guide

English | [中文](README.zh.md)

## Summary

Use these guides to continue development from the customized DSH desktop. Keep each plugin in its own repository and integrate a tested commit into the desktop. Development, migration, packaging, and real-service acceptance have separate verification steps.

## Table of Contents

- [Choose a task](#reading-order)
- [Repository ownership](#repositories)
- [Product baseline](#product-baseline)
- [Read the owning references](#references)
- [Dev Note](#dev-note)

-----

<a id="reading-order"></a>

## Choose a task

Start with the guide for the change you intend to make. The DSH architecture and package READMEs remain the API reference.

- [Daily development](development.md): environment, source locations, plugin development on `main`, and desktop integration.
- [Feature migration](migration.md): dependency inventory, migration batches, persisted data, compatibility, and rollback.
- [Windows packaging and testing](windows-delivery.md): preflight, unsigned packaging, regression checks, manual acceptance, and release records.

<a id="repositories"></a>

## Repository ownership

The local development root is `C:\codekg\scienceproject`. Keep these three active directories; each plugin uses its existing `main` checkout.

| Directory / repository | Owns |
|---|---|
| [zerowallscience-newui](https://github.com/ccfwwm/zerowallscience-newui) | Electron shell, installer, startup, window and taskbar branding, bundled-plugin pins, Discover index. |
| [zerowall-dsh-plugin-ai-cloud](https://github.com/ccfwwm/zerowall-dsh-plugin-ai-cloud) | Account, secure credentials, cloud models, managed text and image/media calls, plugin-owned artwork. |
| [zerowall-dsh-plugin-brand-ui](https://github.com/ccfwwm/zerowall-dsh-plugin-brand-ui) | Sidebar and conversation brand slots and reversible theme overrides. |

The original source at `C:\softworks\gpt-tools\zerowallscience` is the migration reference. Preserve its repository, data, and the existing `deepseek-harness` and `zerowall-dsh-plugins` repositories. The new desktop does not contain the remaining scientific features merely because their source exists there.

Do not create persistent `-check`, `-iconfix`, or other duplicate source checkouts. Run checks in the canonical directory; use ignored artifacts and temporary consumer profiles for test isolation. Historical local drafts belong in recovery archives, not another development directory.

<a id="product-baseline"></a>

## Product baseline

Startup enters the workspace directly. AI Cloud restores saved credentials or offers sign-in, registration, and a visible skip action. Its sidebar footer shows the balance and a recharge reminder below ¥5. Custom models belong under **Settings → Models**; keep the extra AI platform, image-generation, and My models sidebar pages absent.

Use [the Desktop Host manifest](../../../apps/desktop-host/package.json), [the lockfile](../../../pnpm-lock.yaml), and [the Discover index](../../../market/index.json) to identify integrated plugin revisions. A newer plugin `main` does not change a desktop that pins an older tested commit. Discover is a Git index; it does not verify a ZeroWall signed catalog.

<a id="references"></a>

## Read the owning references

Read [architecture](../../architecture.md) before package changes and [development](../../development.md) for the shared build system. [Testing policy](../../testing.md), [desktop packaging](../../../apps/desktop/packaging/README.md), and [Windows signing](../../../apps/desktop/windows-signing/README.md) own their detailed rules. These guides specialize that workflow for ZeroWall.

<a id="dev-note"></a>

## Dev Note

<details>
<summary>Working context</summary>

None.

</details>
