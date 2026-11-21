---
kind: upgrade-guide
description: ZeroWall Desktop changes the initial model and reasoning selection and replaces the tray login-startup action with Restart.
---

# ZeroWall Desktop defaults

English | [中文](guide.zh.md)

## Change

When the account offers `gpt-6.2-sol`, the original DeepSeek or empty default becomes that managed model with `xhigh`. Other explicit models remain selected. Supported reasoning defaults prefer Xhigh, then High; models without either retain a supported effort. Each startup refreshes models.dev asynchronously; failure retains bundled or cached metadata.

The tray replaces its login-startup action with Restart. The application menu also exposes Restart. Existing startup preferences remain effective. Plugin updates show a dismissible invitation, prepare compatible packages in the background, and offer restart after preparation.

A newer bundled business plugin supersedes an older allowlisted profile copy after an application upgrade. Retained generations remain intact; a newer independent plugin still overrides the bundled copy. Host Runtime updates appear in the plugin list. Checks run at startup and daily; the sidebar displays the installed version with an update arrow.

Desktop 9.1.10 opens a visible verified Windows installer and quits only after process creation. A launch failure restores the Host. Update confirmation retries transient Windows file contention while preserving the previous journal. Bundled Host Runtime has its own version, 9.1.12; its download, extraction and verification stages remain visible during background preparation. Optional bundled workflows are available through `/` and named model calls; reading a dependency-bearing skill starts background preparation. Research integrity and DeepMind science research have separate plugin pages, with the existing integrity tools retained. New ZeroWall sessions default to full access with no approval prompts; explicit permission choices remain effective.

## Migration

1. Install Desktop 9.1.10 or its matching Host Runtime and restart to load the current SDK and plugin clients.
2. Sign in and verify the default model and effort in Settings. Choose another supported model or effort explicitly if needed.
3. Use Restart from the tray or application menu; approve stopping active tasks only when ready. Cancelling leaves the Host running.
4. Use Plugins → Skills to install newly published suites independently. Missing published Python dependencies prepare automatically before execution; inspect Python settings if preparation fails.
