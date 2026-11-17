---
kind: package-bundle
description: "Install and update ZeroWall plugins and skill archives from Qiniu catalogs without replacing Desktop."
---

# @zerowall/dsh-plugin-online-catalog

English | [中文](README.zh.md)

## Summary

This retired bundle is retained for earlier deployments. Desktop Host Runtime 9.1.6 incorporates its catalog into the existing Plugins workspace and Updates. Compatible content additions remain independent of EXE releases.

## Table of contents

- [Use this package](#use-this-package)
- [Catalog configuration](#catalog-configuration)
- [Model experience](#model-experience)
- [Known limitations](#known-limitations)

<a id="use-this-package"></a>
## Use this package

This separate entry is retired. Update Host Runtime to 9.1.6 and restart, then use the built-in **Plugins → Discover**, **Plugins → Skills**, and **Settings → Updates**. No catalog plugin installation is required. Existing dependencies and skill receipts remain, while the bundle selection is removed automatically; see the [migration guide](../../../docs/upgrade-guide/v0.2.2-rc.1/integrated-plugin-catalog/guide.md).

<a id="catalog-configuration"></a>
## Catalog configuration

The default plugin URL is `https://zerowall.chengxunkeji.cn/stable/catalog/plugins.json`; the skill URL is `https://zerowall.chengxunkeji.cn/stable/catalog/skills.json`. Set `pluginIndexUrl`, `skillIndexUrl`, `home`, `fetchTimeoutMs`, `maxCatalogBytes` or `maxSkillBytes` on the bundle row to override them. Defaults allow 15 seconds per operation, 4 MiB per catalog and 64 MiB per skill archive. Endpoints must use HTTPS without credentials or fragments. Downloads reject redirects. A failed refresh retains the valid side of the previous snapshot and prevents installation until a refresh succeeds.

Plugin catalogs use [market format 1](../../../packages/util/plugin-market-index/README.md). The existing plugin manager owns compatibility, build approval, package installation, rollback and diagnostic logs. A failed operation retains its complete manager result, including output and log paths. Skill catalogs use schema 1 with unique ids, versions, localized titles and descriptions, immutable HTTPS ZIP URLs, byte counts, SHA-256 hashes and exact skill names. Length or hash failure leaves existing skills unchanged. The Skills importer owns extraction and replacement; successful updates restore prior global enablement, enable new skills, and retain workspace overrides. Local skill receipts are written atomically below the selected DSH home.

Publish immutable packages and archives first, then update the [catalog sources](../../../market/catalog/README.md) and refresh the CDN keys. Existing clients discover additions on the next explicit refresh; no polling interval or background installation is enabled.

<a id="model-experience"></a>
## Model experience

This bundle adds no tools or prompt content. Installed and enabled skills become available through the existing skill registry.

<a id="known-limitations"></a>
## Known limitations

Git sources support first installation; registry updates use the existing manager's update support. Read-only or unsupported package sources remain manageable through Plugins. An incompatible DSH version requires a compatible package or a Host Runtime update. New host APIs cannot be delivered by a catalog alone. A skill import that fails after publication can leave imported files disabled or partially configured; the UI reports this state and asks the user to inspect Skills before retrying. Skill version receipts describe catalog installs, not arbitrary local edits.
