---
kind: upgrade-guide
description: "ZeroWall Science 9.1.13 moves the default Desktop profile and managed Python to fixed paths."
---

# ZeroWall Science fixed Desktop home

English | [中文](guide.zh.md)

## Change

ZeroWall Science 9.1.13 reads the default Desktop profile from `%APPDATA%\zerowall-science\harness`. Windows uses `%LOCALAPPDATA%\Programs\ZeroWallScience` for new per-user installations and reuses the registered installation directory on upgrades. The bundled runtime and active Python dependencies use `dsh-runtimes/dsh-primary-runtime` and `python/env` under the Harness home.

## Migration

1. Close ZeroWall Science 9.1.12 and run the 9.1.13 installer. The first start imports chat history and attachments from `harness-v9` and any prior `harness`. Open an existing chat and one of its attachments after startup.
2. Open the AI Cloud account page. Desktop uses the existing Windows-encrypted credential store. If the session requires a new sign-in, use the AI Cloud entry in the application.
3. Check Python settings as the first dependency installation runs in the background. Retry there if the installation fails.
4. For recovery, keep `harness-v9` and `harness.before-fixed-home`, when present. Previous settings, plugin installations and Python files remain in those directories. An explicit `DSH_HOME` keeps using its existing profile. Desktop removes the retired session notification package from that profile and saves the files it changes.
