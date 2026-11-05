---
description: "Install ZeroWall cloud, branding and discovery into an official DSH Web or Desktop profile."
kind: "package-bundle"
---

# @ccfwwm/dsh-bundle-science

English | [中文](README.zh.md)

## Summary

This bundle enables ZeroWall AI Cloud sign-in, model discovery, sidebar branding and the ZeroWall plugin index in DSH. It selects the cloud account interface and disables automatic onboarding for official model credentials. Install it into a Web or Desktop profile running DSH `>=0.2.2-rc.1` and Node.js `>=24.9.0`. Native desktop branding remains part of the separate ZeroWall desktop distribution.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>

## Use this package

Install the preview channel with the normal DSH command. Fully stop the selected profile before changing packages, then restart it.

```sh
dsh plugin --profile web add @ccfwwm/dsh-bundle-science@next
dsh web
```

For Desktop, open the app once to initialize its profile, fully quit it, then use the app's bundled `dsh` command:

```sh
dsh plugin --profile desktop add @ccfwwm/dsh-bundle-science@next
```

The bundle supplies its own plugin configuration. Later user profile patches can override `ui-settings-account`, `ui-settings-models` and `plugin-market`. To update the preview channel, repeat the `add` command. To remove it, run `dsh plugin --profile web remove @ccfwwm/dsh-bundle-science` and restart. Account and conversation data remain stored by their owning services.

-----

<a id="understand-the-implementation"></a>

## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

The [patch](cordis.patch.yml) mounts the separately published AI Cloud and Brand UI packages plus the official plugin-index services. It owns the account-page and credential-onboarding choices. Desktop Host only resolves packages and launches the official profile runner. The bundle's dependency ranges and plugin peer declarations use minimum versions; the desktop lockfile selects reproducible builds. The [npm distribution guide](https://github.com/ccfwwm/zerowallscience-newui/blob/main/docs/developer/zerowall/npm-distribution.md) owns publication and migration commands.

</details>

-----

<a id="model-experience"></a>

## Model Experience

AI Cloud supplies the model selected by the user. The official plugin-index service can supply the existing `plugin_market` tool to supported presets. The bundle adds no new tool implementation or Session event.

#### KV Cache effect

Changing enabled tools or the selected model can change request prefixes according to the mounted official providers.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The installer, native app icons, taskbar identity, tray and startup window require the separately maintained desktop shell.
- Minimum version declarations allow upgrades; they do not guarantee compatibility with future breaking APIs.
- Install either this suite or its individual plugin bundles; enabling both compositions can insert duplicate plugin rows.

-----

<a id="dev-note"></a>

### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
