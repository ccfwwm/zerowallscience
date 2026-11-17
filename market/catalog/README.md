# Online catalog sources

English | [中文](README.zh.md)

`plugins.json` on Qiniu is a published copy of [`market/index.json`](../index.json), using the shared market format 1. [`skills.json`](skills.json) is the schema-1 skill archive catalog in this directory. Publish immutable packages and archives first, then replace the two mutable JSON objects and refresh their CDN keys. Host Runtime 9.1.6 discovers additions in the built-in [Plugins workspace](../../packages/client/ui-plugin-market/README.md) when opening or refreshing a catalog; compatible additions require no EXE or Host Runtime release.

The public catalogs are `https://zerowall.chengxunkeji.cn/stable/catalog/plugins.json` and `https://zerowall.chengxunkeji.cn/stable/catalog/skills.json`. Plugin entries identify exact npm versions or pinned Git commits; npm remains the package source. Skill entries identify immutable HTTPS ZIP URLs with byte counts and SHA-256 hashes; these archives can be hosted on Qiniu. A catalog entry grants no new Host API compatibility.
