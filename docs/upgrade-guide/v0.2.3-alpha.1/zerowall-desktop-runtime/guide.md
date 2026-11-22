---
kind: upgrade-guide
description: "ZeroWall Desktop installations with the previous Host protocol need a full installer to adopt the DSH 0.2.3-alpha.1 runtime."
---

# ZeroWall Desktop runtime upgrade

English | [中文](guide.zh.md)

## Change

ZeroWall Desktop 9.1.11 carries DSH 0.2.2-rc.1 and Host protocol 4. Desktop builds with DSH 0.2.3-alpha.1 use Host protocol 5 and LibreOffice Kit 0.2.3. The installed Bootstrap accepts a Host Runtime only when its compatibility fields match the installed Desktop.

## Migration

1. Close ZeroWall Desktop and back up its Harness home and Desktop profile. Run the full installer carrying DSH 0.2.3-alpha.1.
2. If your profile overrides the `office-to-pdf` row, update that override to `office-kit` and use the new provider package as described in the [Office Kit migration](../../v0.2.2-alpha.3/office-kit-package/guide.md).
3. If your profile or overlay selects the Python PTC provider, follow the [Node PTC migration](../../v0.2.2-rc.2/python-ptc-removal/guide.md). The managed Python environment for ZeroWall tools remains available.
4. Start the upgraded application. Open an existing Session and one of its attachments, then open an Office document in preview to check the profile and runtime.
