# @zerowall/dsh-plugin-brand-ui

English | [中文](README.zh.md)

## Summary

Brand UI. Uses public UI slots and the theme service for ZeroWall artwork and colors. The sidebar and blank-session title show `ZeroWall Science`; the branded hero omits the preview badge. The hero title requires the `conversation.hero.brand.title` slot supplied by ZeroWall Desktop. The desktop application owns windows, installers and updates.

Light and dark semantic tokens unify surfaces, typography colors, borders, primary controls and sidebar selection. New Science profiles default to light; saved theme choices retain precedence. The Windows shell consumes the dedicated `--dsw-specific-titlebar-fill` token and composites modal masks over native caption controls. The plugin keeps the existing artwork.

## Use

ZeroWall Desktop selects this package from its installation manifest. Open Plugins to inspect status and package-owned settings. The tested baseline is DSH 0.2.2-rc.1 and Node.js 24.9 or later. Preserve existing configuration and data when updating.

See the [retained migration reference](migration-reference.md) for detailed workflows and historical platform requirements. The package manifest owns current dependency versions.

## Development

Build and inspect archives from the repository root:

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
```

Keep the package LICENSE and any third-party notices with redistributions.
