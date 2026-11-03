---
kind: upgrade-guide
description: "Unsigned Windows desktop builds use local defaults instead of release configuration."
---

# Unsigned Windows builds use local configuration

English | [中文](guide.zh.md)

## Change

`pnpm run package:desktop:win:x64:unsigned` ignores `.env.windows`, machine presets, and inherited release settings. It uses `com.zerowallscience.desktop` as the application ID and omits update policies. Scripts that supplied a custom identity or update service to unsigned builds must use the signed packaging path for those settings.

## Migration

1. For a local test installer, run `pnpm run package:desktop:win:x64:unsigned --check`, then the same command without `--check`. Release configuration and signing credentials are unnecessary.
2. To test release identity and updates, configure the signed build as described in the [packaging reference](../../../../apps/desktop/packaging/README.md#configuration-and-local-builds) and run `pnpm run package:desktop:win:x64`. Keep signing credentials in the configured private file.
3. Check the packaging result and the installer under `.desktop-build/targets/win-x64/unsigned-artifacts/` for the local test path. Unsigned builds do not create a release completion record.
