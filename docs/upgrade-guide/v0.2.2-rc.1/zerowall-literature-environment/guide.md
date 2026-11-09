---
kind: upgrade-guide
description: ZeroWall literature plugins use native session attachments and official environment initialization.
---

# ZeroWall literature and environment

English | [中文](guide.zh.md)

## Change

ZeroWallScience provides MinerU through `@zerowall/dsh-plugin-mineru` and PubMed through `@zerowall/dsh-zotero/pubmed`. The environment service automatically verifies official signed configuration and fills missing variables at startup. Explicit deletions and user values remain authoritative; secure-storage errors stop dependent initialization. Legacy `file-sha256:` attachment references and unrestricted local file paths are not accepted by MinerU.

## Migration

1. Use the current ZeroWallScience bundle, or add the `@zerowall/dsh-plugin-mineru` and `@zerowall/dsh-zotero/pubmed` rows to your profile. Keep `@zerowall/dsh-plugin-environment` enabled. Remove any separately registered legacy PubMed or MinerU implementation to avoid duplicate tools.
2. Supply files through native DSH session attachments (`sha256:` references), or select a workspace and use files inside it. Set `DSH_HOME` when overriding the standard user data directory; do not copy installation paths into configuration.
3. Open environment settings to inspect synchronization status. Retry fills missing values; restore official defaults explicitly replaces official names. Configure custom MinerU and literature credentials through the same page.
4. Confirm MinerU and literature settings load, and their tools appear once. Existing MinerU task IDs resume from their original workspace task records. PubMed graph drafts remain conversation-local and are not migrated as persistent research data.
