---
kind: upgrade-guide
description: "ZeroWall image settings move to the image plugin and Desktop supplies explicit managed Claude runtime paths."
---

# ZeroWall plugin settings

English | [中文](guide.zh.md)

## Change

Image configuration belongs to `@zerowall/dsh-imagecreate`. The environment Remote setters `setImageModelSelection` and `setImageQuality` are removed; media selection writes no longer accept `image`. Image consumers use `zerowallImageSettings`, exported through the image package's `./remote` and `./types` entries. Existing task records keep their saved models and parameters.

Desktop supplies `ZEROWALL_DESKTOP_RUNTIME_ROOT`, `ZEROWALL_DESKTOP_PNPM_ENTRY` and `DSH_DESKTOP_NODE_EXECUTABLE` before profiles load. Claude installation uses these paths and an isolated runtime under `DSH_HOME`; old desktop marker variables and guessed pnpm layouts are unsupported. CLI preparation starts automatically when enabled; explicitly uninstalling it suppresses automatic reinstall across restarts.

Plugin-owned usage instructions appear in plugin details. Their names, registry discovery, priorities and enablement are preserved. Independent, project and imported Skills remain in Skills management.

## Migration

1. Update the ZeroWall plugin set together. Use a Desktop build containing the runtime path initialization; updating npm packages alone cannot add it to an older Desktop host.
2. Open the image plugin's configuration. The first load backs up and migrates the environment image selection into `DSH_HOME/zerowall/imagecreate/settings.json`. When it is empty, a saved media image selection is resolved against the real catalog. Existing choices retain user ownership. New automatic defaults use the bundle's preferred group and model; saving a choice prevents future automatic replacement.
3. Update custom callers to `zerowallImageSettings.get()` and `.save({ selection, quality })`. Keep video, music and speech settings in the environment service. Do not write image selections there.
4. Open Claude settings and inspect the detected CLI version. Use Install or Repair after a failed preparation. `runtimeRoot` or `ZEROWALL_CLAUDE_RUNTIME_ROOT` overrides the data directory; `version`, `registry` and `autoInstall` configure managed preparation. A working installation reports Ready only after its executable passes the version probe.
5. Manage plugin instructions in the owning plugin's Usage instructions section. Its switch controls instructions provided to the model, independently of plugin activation. `providerOwners` maps official providers to their owning npm packages without modifying official packages.
