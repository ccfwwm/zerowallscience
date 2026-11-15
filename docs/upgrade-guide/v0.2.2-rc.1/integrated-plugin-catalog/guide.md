---
kind: upgrade-guide
description: "The separate online catalog bundle is retired in favor of the built-in Plugins workspace and Updates."
---

# Integrated plugin and skill catalogs

English | [中文](guide.zh.md)

## Change

Desktop Host Runtime 9.1.7 includes online discovery in the existing Plugins workspace. **Discover** lists plugins, **Skills** lists skill archives, and **Settings → Updates** handles installed updates through the existing one-click and individual actions. The separate **Online plugins and skills** Settings page is retired.

Loading a profile removes `@zerowall/dsh-plugin-online-catalog` from `dsh.profile.bundles` in its `package.json`. Its dependency, user patch, installed skills, and `$DSH_HOME/zerowall-online-catalog/skills.json` receipts remain. No Session format changes.

## Migration

1. Update Host Runtime through **Settings → Updates**, then restart and apply. Desktop EXE 9.1.4 is compatible; no separate catalog plugin is required.
2. Open **Plugins → Discover** or **Plugins → Skills** and refresh the catalog. Inspect installed skills through the existing Skills management plugin.
3. Confirm that Settings contains one Updates page and no separate online catalog page. Installed skill updates appear in Updates; compatible new entries arrive through the Qiniu manifests without another EXE release.

Custom deployments configure the existing `plugin-market` row with `skillIndexUrl` and `skillReceiptDir`; see the [market service](../../../../packages/boot/plugin-market/README.md#use-this-package). Explicit profile settings override Desktop defaults.
