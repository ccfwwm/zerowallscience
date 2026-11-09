# @zerowall/dsh-claude-coderun

English | [中文](README.zh.md)

## Summary

Claude Code runtime. Preserves the customized Claude CLI, native session recovery, permissions, Skills and MCP bridges, and usage statistics. Open the plugin configuration to manage its isolated runtime, account and model; the CLI is detected and prepared automatically in the background, independently of AI Cloud login.

## Use

ZeroWall Desktop selects this package from its installation manifest. Open Plugins to inspect status and package-owned settings. The tested baseline is DSH 0.2.2-rc.1 and Node.js 24.9 or later. Preserve existing configuration and data when updating.

See the [retained migration reference](migration-reference.md) for detailed workflows and historical platform requirements. The package manifest owns current dependency versions.

Runtime preparation uses the Desktop carrier's standalone Node and pnpm paths, never a personal Claude installation. Installer scripts receive the bundled Node directory first in PATH; a flat private dependency layout keeps Windows lifecycle-script directories short. Defaults are CLI `2.1.309`, HTTPS registry `https://registry.npmmirror.com` and `autoInstall: true`; these are plugin Config fields. Storage defaults to `DSH_HOME/zerowall/claude-code/runtime`, with `runtimeRoot` or `ZEROWALL_CLAUDE_RUNTIME_ROOT` overrides. Status refresh runs a bounded version probe without installing or moving the activation pointer. Install, automatic startup and session startup share preparation. Failed candidates preserve the active generation. Exit cancels the installer tree and awaits termination; explicit uninstall persists automatic-install suppression, and manual installation restores it.

## Development

Build and inspect archives from the repository root:

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
```

Keep the package LICENSE and any third-party notices with redistributions.

Claude uses the current conversation’s Host tool bridge for MCP, including on-demand capability discovery. The session plugin directory contains enabled Skills with relative resources intact; external MCP credentials and direct connection settings remain with the Host. Host tool NAME is called as mcp__zerowall__NAME; Skills rewrite MCP references to the same bridge names. Registry changes refresh scoped tool schemas; newly enabled Skills are projected after tool operations.
