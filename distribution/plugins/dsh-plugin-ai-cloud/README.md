# @zerowall/dsh-plugin-ai-cloud

English | [中文](README.zh.md)

## Summary

On official Desktop 9.x, remembered credentials use an OS-encrypted Electron vault through private parent-process IPC. Child-process disconnects and timeouts reject the operation and release listeners. Other hosts retain the configured credential provider.

AI Cloud. Provides ZeroWall sign-in, model catalogs, chat and media calls. Credentials stay in Host secure storage. Sign in and synchronize the catalog before choosing models in each feature plugin.

Sign-in, registration and password recovery use one responsive branded dialog sequenced after first-run notices. Connection details stay collapsed by default. The Cloud account settings page has Overview, Recharge and orders, and Model services tabs with one content scroller. The plugin instance shares billing and model state across tabs; payment polling survives page closure. Passwords and verification codes remain local to the authentication form, while explicitly remembered credentials stay in Host secure storage.

Chat models in groups explicitly typed Gemini use Google's native Generative Language streaming protocol. Groups whose names contain 生图 are treated as image-generation groups and remain on the media routes.

## Use

ZeroWall Desktop selects this package from its installation manifest. Open Plugins to inspect status and package-owned settings. The tested baseline is DSH 0.2.2-rc.1 and Node.js 24.9 or later. Preserve existing configuration and data when updating.

See the [retained migration reference](migration-reference.md) for detailed workflows and historical platform requirements. The package manifest owns current dependency versions.

## Development

Build and inspect archives from the repository root:

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
```

Keep the package LICENSE and any third-party notices with redistributions.

The account header refreshes account details and models. Saved credentials reauthenticate first; sessions without a saved password refresh their token and model catalog. New profiles default to XYZ direct, followed by HK Hong Kong and CN backup. Explicit gateway selections remain stored.
