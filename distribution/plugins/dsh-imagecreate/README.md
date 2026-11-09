# @zerowall/dsh-imagecreate

English | [中文](README.zh.md)

## Summary

Image creation. Provides the image Skill, generate_image, edit_image and result presentation. This plugin owns the model, quality, aspect ratio and dimensions; missing required dimensions fail before generation is submitted.

## Use

ZeroWall Desktop selects this package from its installation manifest. Open Plugins to inspect status and package-owned settings. The tested baseline is DSH 0.2.2-rc.1 and Node.js 24.9 or later. Preserve existing configuration and data when updating.

Desktop keeps bundled Skill resources outside ASAR and verifies required files before packaging. Skill loading uses the installed package directory without copying instructions into user folders.

See the [retained migration reference](migration-reference.md) for detailed workflows and historical platform requirements. The package manifest owns current dependency versions.

Open Image generation settings or this plugin's detail page to choose the model, group, quality and protocol parameters. Generation, editing and PPT share `zerowallImageSettings`; video image references read it lazily. Settings are atomically stored under `DSH_HOME/zerowall/imagecreate/settings.json` (`home` overrides the DSH home). The first load backs up legacy environment/media image settings and marks existing selections as user-owned. The bundle declares `preferredGroupName` and `preferredModelId`; defaults are selected only from one real, available matching route. Manual saving protects the selection and parameters across login, synchronization and restart. Missing or ambiguous routes require a selection; unrelated models are never substituted.

## Development

Build and inspect archives from the repository root:

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
```

Keep the package LICENSE and any third-party notices with redistributions.
