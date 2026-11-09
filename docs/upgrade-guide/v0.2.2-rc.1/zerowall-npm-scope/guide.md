---
kind: upgrade-guide
description: "ZeroWall packages use the @zerowall npm scope and Desktop selects business plugins individually."
---

# ZeroWall npm packages

English | [中文](guide.zh.md)

## Change

ZeroWall packages use `@zerowall` instead of `@ccfwwm`. New Desktop profiles select each bundled business plugin independently. The Science bundle configures discovery and account onboarding; it does not mount a second copy of AI Cloud or Brand UI. File Review, Dream Skin, Open File Viewer and Office Tools are excluded from the default distribution. Office previews use DSH's bundled converter.

## Migration

1. Quit Desktop before updating. Desktop renames enabled installation-carried ZeroWall bundles and creates `package.before-zerowall-scope.json` beside the profile manifest. It adds newly offered default bundles once and records `zerowall.defaultBundles`, backing up the manifest as `package.before-default-plugins.json`. Profiles without this record receive the current defaults; subsequent starts preserve disabled and recovery selections. User patches and explicitly installed names and versions remain unchanged.
2. To replace an explicitly installed legacy package, use `dsh plugin --profile desktop` to remove the old package and add its `@zerowall` successor after backing up the profile. Keep the recorded configuration and data directories.
3. Open Plugins. Installation-carried business bundles appear under Built-in plugins, while profile dependencies remain manageable. Open a plugin to inspect its configuration and runtime status.
4. Confirm the installed version and complete one task before removing any backup. A package rename does not migrate Session generations or erase plugin data.
