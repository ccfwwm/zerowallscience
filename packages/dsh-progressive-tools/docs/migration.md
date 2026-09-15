# Upgrade to 0.4.0

## Compatibility change

This release requires host runtime `0.1.5-rc.1`. The former runtime baseline
`0.1.1-rc.2` is no longer supported by this checkout. Later prereleases are
also outside the exact tested core peer versions. Existing plugin options
retain their names and defaults.

## Upgrade sequence

1. Record the existing host version, plugin commit/tag, and profile configuration.
2. Back up session data using the host's supported storage procedure.
3. Upgrade the host and its profile composition together to the required baseline.
4. Install the plugin's `v0.4.0` tag using the command in the overview.
5. Inspect `--dump-config`, then start a fresh session and run the discovery smoke test.
6. Test a restored session separately before making it the default deployment.

An upgrade can change prompt bytes and incur a new cache prefix. The stability
guarantee applies to subsequent discovery within an unchanged composition.

## Session boundaries

The implementation now reads `session.snapshotEvents()` and current
`tool/ptc-dispatch` records. It also understands historical
`tool/code-dispatch` records if host migration retains them as ignorable
events. The plugin does not migrate host session files or guarantee that an
arbitrary old session file can be opened by the new host.

Top-level discovery metadata and incremental search results remain supported.
Code bindings and host transport names must match the current runtime; do not
copy old presentation configuration blindly into a new profile.

## Rollback

Restore a known-working host/plugin pair and its recorded profile config.
Keep upgraded session data separate from the backup: do not assume a newer
session format is readable by an older host. Disabling this plugin removes
its routing guard and prompt projection, exposing the host's normal tool view;
it does not revoke the underlying tools' credentials or permissions.
