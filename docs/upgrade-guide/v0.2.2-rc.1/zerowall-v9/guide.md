---
kind: upgrade-guide
description: "ZeroWall Science 9 isolates desktop data and uses the existing stable installer identity with encrypted credential migration."
---

# ZeroWall Science 9 desktop

English | [中文](guide.zh.md)

## Change

The Windows product version is independent of the bundled DSH core version. ZeroWall's official Windows installer retains `com.zerowall.science` and the 8.x stable update feed. Official unsigned builds use an embedded Ed25519 resource verification key; this is separate from Windows Authenticode. Local unsigned test builds have no update feed.

Packaged Desktop stores its Harness data in `zerowall-science/harness-v9` below the platform application-data directory. ZeroWall secrets are encrypted by the operating system in `credentials/vault-v9.json`. Existing 8.x and newui source data remains available.

The desktop shows its startup view before cloud-account requests complete. If both source profiles contain research databases, the first database is active and a different second database is retained as a checked conflict snapshot; database rows are not automatically merged.

Workspace entries for the same canonical directory merge their session membership, retaining the destination identity and title. Already completed imports receive this index repair once, with the original index backed up; their source sessions are not imported again. Successful per-session checkpoints survive partial migration retries and preserve subsequent conversation edits. Fresh profiles automatically select a default workspace; if startup is interrupted by opening another main panel, returning to the Conversation retries workspace and blank-session restoration.

Desktop reads normalized copies in `sessions-desktop`. Unreadable sessions are skipped individually without blocking startup. Sources and import checkpoints remain intact; see [Desktop history](../../../../apps/desktop/README.md#application-overview) for skipped-item reports.

## Migration

1. Close the previous desktop application before installing 9.0. First launch imports user-owned histories, attachments, workspace indexes, settings and skills from the existing newui home and the official stable 8.x profile. Complete session directories activate after byte verification; conflicts remain below `harness-v9/.migration/zerowall-v9/conflicts`. Released log generations use the existing DSH migration catalog when read.
2. Review the import result. Existing account choices and explicit sign-out take precedence. Credentials that cannot decrypt require a fresh sign-in; their source ciphertext is retained. Account balance and model availability are refreshed by the account service.
3. Confirm that expected conversations open and continue. The completion receipt is `harness-v9/.migration/zerowall-v9/completed.json`; failed items are recorded in `partial.json` and retry on the next launch. Per-session, file, settings, database and credential failures do not prevent the workspace from starting or stop healthy items from importing. Do not delete the old profile while investigating a conflict.
4. Use Settings → General → About for product/core versions and official links. Desktop installation requires a separate confirmation; business plugins update through npm. Updating the stable pointer stops future distribution of a release but does not downgrade already installed data.
