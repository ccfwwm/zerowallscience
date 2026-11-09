# @zerowall/dsh-videocreate

English | [中文](README.zh.md)

## Summary

Video creation. Preserves video, music, reference assets, durable jobs and local composition. Plugin settings save video and music models and JSON parameters while preserving other categories. Generation requires available models and account permissions; local composition requires FFmpeg in the managed runtime.

## Use

Image defaults for reference creation belong to the image plugin. This plugin resolves `zerowallImageSettings` lazily and does not choose the first image model when a saved route is unavailable. Existing jobs retain their recorded selections and parameters.

ZeroWall Desktop selects this package from its installation manifest. Open Plugins to inspect status and package-owned settings. The tested baseline is DSH 0.2.2-rc.1 and Node.js 24.9 or later. Preserve existing configuration and data when updating.

Desktop keeps the bundled Skill and composition script outside ASAR and verifies required files before packaging. Composition uses the Python dependency service and resolves its script from the installed plugin directory.

See the [retained migration reference](migration-reference.md) for detailed workflows and historical platform requirements. The package manifest owns current dependency versions.

## Development

Build and inspect archives from the repository root:

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
```

Keep the package LICENSE and any third-party notices with redistributions.
