---
kind: upgrade-guide
description: "ZeroWall business updates require an explicit installation allowlist and restart activation; unsigned clients require manual bootstrap."
---

# ZeroWall business and desktop updates

English | [中文](guide.zh.md)

## Change

Allowlisted shipped business packages can use exact user-profile generations instead of their installation copy. Core runtime packages remain installation-owned. New releases use the isolated Qiniu `newui` feed; unsigned builds expose no automatic update source. Account access opens Cloud account settings, and update actions open Settings → Updates. The original 8.x channel is unaffected.

## Migration

1. Preserve the current newui profile, credentials and user patches. Install a signed, feed-enabled newui EXE manually when upgrading an unsigned build. Do not point an 8.x client at this channel.
2. Distribution maintainers run `node distribution/scripts/sync-update-policy.mjs --write` after changing Science's owned default packages, then rebuild the EXE. Keep shared core and React packages outside `dsh.installation.profileOverrides`.
3. Use Settings → Updates to inspect and prepare npm versions. Restart explicitly to activate; the page shows the effective version only after the new Host and Client start. Leave profile configuration, disabled selections and compatibility exemptions in place.
4. A failed activation restores the previous generation and retains a notice. Use Restore bundled features or native plugin recovery when needed; confirm the effective version and readiness afterward. Keep the archived journal and immutable generation directories for diagnosis. See [update operations](../../../developer/zerowall/desktop-updates.md) for publication and recovery.
