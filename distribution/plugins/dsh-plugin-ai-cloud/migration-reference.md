# ZeroWall Science AI Cloud for DSH

This preview DSH plugin adds ZeroWall account sign-in, secure credential storage, model discovery, managed chat routes, and image/media cloud calls. It targets DSH `>=0.2.2-rc.1` and is maintained independently from the desktop repository.

## Install

After publication to npm, install into a Web profile with:

```sh
dsh plugin --profile web add @zerowall/dsh-plugin-ai-cloud@latest
```

For Desktop, open it once, fully quit it, then use its bundled `dsh` command with `--profile desktop`. The `latest` tag selects the stable channel.

Restart DSH after installation. The plugin is also listed by the ZeroWall Science Discover index when that index is configured.

On startup, saved credentials restore your session automatically. Signed-out users see sign-in and registration with **Skip for now**; remembered passwords stay in secure device storage. The sidebar footer shows the account balance, labels stale values, and suggests a recharge below ¥5. Balance refreshes every minute while visible and when the window regains focus or reconnects; the reminder can be dismissed and never submits a payment automatically. Use the footer account button to manage your account or recharge. Open **Settings → Models** to manage custom providers and models. The plugin adds no AI platform, image-generation, or My models sidebar entry and keeps the shell's Settings button. Select a discovered managed model in a conversation for text calls. Image/media calls remain available through the cloud service and generated remotes; this preview does not mount a standalone image page. Image submission is billed by the selected platform; refreshing a task does not submit it again. Preview downloads accept PNG, JPEG, and WebP up to 8 MiB. Larger artifacts remain in the Host media cache.

When installing into a plain DSH profile with pnpm 11, explicitly deny the unused `@google/genai` and `protobufjs` installation scripts in that profile's `pnpm-workspace.yaml` (`allowBuilds` values `false`), then retry. ZeroWall Desktop seeds those denials. The plugin itself has no installation lifecycle scripts.

## Account and network access

The first sign-in needs network access to one of the ZeroWall AI Cloud gateways:

- `https://hkcode.aicodeme.xyz`
- `https://code.aicodeme.xyz`
- `https://code.aicodeme.cn`

The plugin uses the account session to discover available groups and models. Per-group API credentials are stored through DSH's credential provider and are never sent through the client UI. Chat and image/media requests go to the selected gateway or its credential-backed CDN endpoint.

Use **Sign out** to remove the active session. Disable or uninstall the plugin to stop its routes and media services. Network failures leave the last account state marked stale and do not print credentials in diagnostics.

## Compatibility and development

Use the canonical `C:\codekg\scienceproject\zerowall-dsh-plugin-ai-cloud` checkout on `main`; keep one active source directory per plugin. See the shared [ZeroWall development, migration, packaging, and testing guide](https://github.com/ccfwwm/zerowallscience-newui/blob/main/docs/developer/zerowall/README.zh.md) and [AGENTS.md](AGENTS.md).

Requires Node.js 24.9 or later and npm for local development. The published bundle declares DSH `>=0.2.2-rc.1`.

```sh
npm ci
npm run check
npm pack
```

The resulting tarball contains the built DSH bundle and TypeScript declarations, locales, patch manifest, license, source notice, and this README. `node_modules`, tests, caches, and credentials are excluded. Git installs consume committed `lib/` artifacts without executing package lifecycle scripts; run `npm run check` before packing or committing those artifacts. CI checks that rebuilding leaves `lib/` unchanged.

The sidebar account button, sign-in dialog, and plugin listing use the plugin's own ZeroWall Science PNG. Client artwork is embedded in the bundle; the `./icon` export supplies the same image to plugin managers without requiring any desktop files.

The build uses the matching official Typert analyzer and emitter against the installed DSH declarations. It emits Host validation metadata and Client Remote namespaces, which the Client mounts before its account and image panels. `npm run test:package` installs the archive in a separate consumer and checks entry points and rejected invalid Remote inputs.

## Distribution

This repository is public and uses the DSH bundle/manifest contract. DSH Discover indexes pin the Git commit before installation. ZeroWall's signed resource catalog is a separate channel: it verifies a signed catalog, immutable archive digest, and desktop/DSH compatibility before activation. npm publication uses the public `@zerowall` scope and the `latest` tag; it does not require a ZeroWall catalog-signing key.

## Publish to npm

Run `npm whoami` to confirm the publishing account. `npm publish --access public --tag latest` runs the package checks and packed-consumer verification through `prepublishOnly`. Each published version is immutable; increment `version` before publishing another release. DSH and Cordis peers declare minimum supported versions; development dependencies pin the tested baseline. Future API compatibility still needs validation.
