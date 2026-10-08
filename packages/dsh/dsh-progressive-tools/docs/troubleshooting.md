# Troubleshooting

| Symptom | Check and recovery |
| --- | --- |
| Plugin absent from config dump | Verify the selected profile, source build authorization, and bundle installation; restart that profile. |
| Type/import errors after host upgrade | Compare exact core peer versions with `0.1.5-rc.1`; align the host/plugin pair rather than suppressing type checks. |
| Duplicate `tool_search` registration | Remove duplicate discovery plugins or configure distinct search and dispatch names. |
| Empty catalog | Verify providers registered their tools in this agent's scope. Tools already directly visible are excluded from the deferred catalog. |
| Search returns no match | Browse `status`, then query an exact name; add explicit groups and multilingual aliases for recurring vocabulary gaps. |
| Dispatch says “has not been discovered” | Status alone does not grant discovery by default. Search the exact name before dispatch. |
| Dispatch says “not in the deferred catalog” | Check whether the tool is already directly visible, unregistered, or restricted by another policy. |
| Hidden name is denied directly | This is expected. Use the discovered schema through `tool_dispatch`. |
| A discovered tool still fails approval or validation | Inspect the underlying tool's policy and arguments. Discovery does not bypass execution controls. |
| `run_code` or SDK assembly fails | Check host PTC configuration and its loaded runtime language; test native presentation to isolate the provider. |
| Prefix changes | Confirm no config, registry, visible definition, or other system section changed. Dynamic mode deliberately changes the tool set. |
| Discovery is lost after resume | Check the retained search metadata/PTC records and host migration. A missing historical log cannot be reconstructed by the plugin. |

## Useful diagnostics

```sh
node --version
pnpm --version
dsh --profile web --dump-config
```

For a source checkout, also run `pnpm peers check` and `pnpm run check`.
Provide the plugin commit/tag, host version, presentation mode, minimal group
configuration, exact tool names, reproduction steps, and error code. Redact
credentials, private arguments, and sensitive config before sharing logs.
Use the [security policy](../SECURITY.md) for exploitable routing or policy issues.
