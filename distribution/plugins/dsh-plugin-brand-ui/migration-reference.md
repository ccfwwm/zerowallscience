# ZeroWall Science Brand UI for DSH

This preview DSH plugin applies the ZeroWall Science accent color, replaces the sidebar brand mark and name, and supplies the conversation hero mark. It works with DSH `>=0.2.2-rc.1` and is maintained independently from the desktop repository.

The plugin only uses the public sidebar and conversation slots and theme token override service. Desktop window chrome, the startup screen, app icon, installer, shortcuts, and update flow belong to the desktop application and are not changed by this plugin.

## Install

After publication to npm, install into a Web profile with:

```sh
dsh plugin --profile web add @zerowall/dsh-plugin-brand-ui@next
```

For Desktop, open it once, fully quit it, then use its bundled `dsh` command with `--profile desktop`. The `next` tag selects the preview channel.

Restart DSH after installation. Disable or uninstall the plugin from the same Plugins screen to restore the default DSH brand and theme.

The plugin is also listed by the ZeroWall Science preview Discover index when that index is configured.

## Permissions and network use

The plugin requests no account credentials and makes no network requests. It registers three brand slots with priority `-100`, ahead of the default occupants, and one reversible theme-token override. DSH removes these registrations when the plugin is disabled or uninstalled.

## Development

Use the canonical `C:\codekg\scienceproject\zerowall-dsh-plugin-brand-ui` checkout on `main`; keep one active source directory per plugin. See the shared [ZeroWall development, migration, packaging, and testing guide](https://github.com/ccfwwm/zerowallscience-newui/blob/main/docs/developer/zerowall/README.zh.md) and [AGENTS.md](AGENTS.md).

Requires Node.js 24.9 or later and npm.

```sh
npm ci
npm run check
npm pack
```

Git installs consume committed `lib/` artifacts without executing package lifecycle scripts. Run `npm run check` before packing or committing those artifacts. CI verifies that rebuilding leaves `lib/` unchanged. The tarball includes generated declarations for both public entry points.

## Distribution and compatibility

The package declares DSH `>=0.2.2-rc.1`. It requires the DSH Cordis runtime, sidebar and conversation brand slots, renderer, and theme service at the matching release. DSH Discover indexes pin a Git commit before installation. ZeroWall's signed resource catalog is a separate channel: it verifies a signed catalog, immutable archive digest, and desktop/DSH compatibility before activation. npm publication uses the public `@ccfwwm` scope and the `next` tag; it does not require a ZeroWall catalog-signing key.

## Publish to npm

Run `npm whoami` to confirm the publishing account. `npm publish --access public --tag next` runs the package checks and packed-consumer verification through `prepublishOnly`. Each published version is immutable; increment `version` before publishing another release. DSH and Cordis peers declare minimum supported versions; development dependencies pin the tested baseline. Future API compatibility still needs validation.
