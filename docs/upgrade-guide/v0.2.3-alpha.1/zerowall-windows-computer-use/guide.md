---
kind: upgrade-guide
description: ZeroWall Windows computer use has a new npm package name.
---

# Windows computer use package name

English | [中文](guide.zh.md)

## Change

ZeroWall Desktop for Windows replaces `dsh-computer-use-win` with `@zerowall/dsh-computer-use-win`. The first migration to the new default selects it once, including profiles that received 0.1.13. Plugin configuration keys and tool names stay the same.

## Migration

1. In ZeroWall Windows Desktop 9.1.13, open Settings → Updates and update the ZeroWall Science plugin bundle to 0.1.15 or later. Restart when prompted.
2. Give Desktop time to install or update `@zerowall/dsh-computer-use-win`, then restart Desktop again. Confirm that the package switch is on and its settings page opens. Desktop 9.1.13 displays the downloaded package under Installed plugins. Hosts that ship the replacement group the package switch under Built-in plugins. The migration backs up the profile files it edits and preserves later changes to the switch.
3. For other Windows DSH profiles that you maintain manually, remove `dsh-computer-use-win` and add `@zerowall/dsh-computer-use-win` in the same profile. Update custom configuration that refers to the package by name.
