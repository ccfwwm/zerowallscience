# @zerowall/dsh-zotero

English | [中文](README.zh.md)

## Summary

Zotero and Harvest. Combines local Zotero and Harvest for search, details, download links, authorized saves, deduplication, sufficiency checks, reviews and offline exports. One implementation is mounted. Personal-library writes require Zotero authorization; the separate scholarly retrieval component has its own switch.

The same npm package includes `@zerowall/dsh-zotero/pubmed`, a default literature component for PubMed, Europe PMC, PubTator, Semantic Scholar and OpenAlex. Credentials and endpoint configuration are available in environment settings; the component waits for automatic official configuration before reading live environment variables. It offers article search and metadata, citation discovery and conversation-local literature graphs, with no separate PubMed Skill. Graph drafts are not persistent and are cleared on reset or service disposal. Requests use provider-specific credentials, explicit endpoint settings, bounded responses, cancellation and rate limits. The ported literature engine retains its Apache-2.0 attribution in source and `THIRD_PARTY_LICENSES/Apache-2.0.txt`.

## Use

ZeroWall Desktop selects this package from its installation manifest. Open Plugins to inspect status and package-owned settings. The tested baseline is DSH 0.2.2-rc.1 and Node.js 24.9 or later. Preserve existing configuration and data when updating.

See the [retained migration reference](migration-reference.md) for detailed workflows and historical platform requirements. The package manifest owns current dependency versions.

## Development

Build and inspect archives from the repository root:

Dependency installation leaves workspace outputs unbuilt. Build the core with `pnpm run build:artifacts` before building plugins; direct package packing runs the plugin build through `prepack`.

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
```

Keep the package LICENSE and any third-party notices with redistributions.
