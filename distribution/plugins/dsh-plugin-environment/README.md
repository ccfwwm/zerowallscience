# @zerowall/dsh-plugin-environment

English | [中文](README.zh.md)

## Summary

Environment settings. Configures environment variables and context budgets from plugin details or Settings. Image settings belong to the image creation plugin. Credentials stay in Host secure storage; opening or refreshing the page only reads configuration.

On Windows, the plugin appends missing system directories from `SystemRoot` or `windir` to the Host PATH so folder opening and default-application file actions can find Explorer and PowerShell. Existing tool precedence is preserved. Unloading removes only the entries it added; the system and user PATH stored by Windows are unchanged.

At startup, the service recovers secure local values and verifies the signed official configuration from Qiniu. It fills missing names, preserving user overrides, inherited values and explicit deletions. The settings page shows synchronization status and offers missing-only retry; restoring official defaults remains an explicit replacement. Remote failures leave local values intact. `ready()` resolves after local recovery and the first synchronization attempt, including offline attempts; unavailable secure storage rejects it so dependent integrations cannot start with untrusted credentials.

The conversation input exposes a 32k–1m context budget, defaulting to 300k. At 90%, the Host prunes tool results and compacts older conversation while reserving model output capacity. Per-session reads and saves require the live Agent registry; changes are persisted in the Session log. An unconfirmed save retains the last confirmed display value and asks the user to reopen the conversation to check the actual budget.

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
