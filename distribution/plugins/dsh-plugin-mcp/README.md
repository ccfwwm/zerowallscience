# @zerowall/dsh-plugin-mcp

English | [中文](README.zh.md)

## Summary

MCP configuration. Manages MCP connections and credential references. databasePath selects SQLite storage; the default reads ZEROWALL_RESEARCH_DB, then zerowall/research.sqlite under the DSH home. Newly connected tools become available on subsequent model steps; the Host denies direct conversation execution of remote R project administration.

## Use

Standard conversations default to `toolLoading: on-demand`: basic tools and `tool_search` are presented first. Search by capability or exact name to load optional plugin definitions on the next model step. `mcp_search` connects a matching server and loads up to `toolSearchLimit` matching definitions (default 5); `mcp_connect` explicitly loads one server's full live tool list. Selection is isolated per conversation and restored from successful discovery results. Permissions and native execution remain enforced. Custom and PTC presets retain their executors.

Set `alwaysAvailableTools` to replace the basic tool-name list, or set `toolLoading: all` on the MCP plugin entry to retain full presentation and automatic connection during prompt assembly. Restart Desktop after updating this plugin.

ZeroWall Desktop selects this package from its installation manifest. Open Plugins to inspect status and package-owned settings. The tested baseline is DSH 0.2.2-rc.1 and Node.js 24.9 or later. Preserve existing configuration and data when updating.

Python MCP connections wait for the Python dependency service before launching. The interpreter, environment and packages use `ZEROWALL_PYTHON_EXECUTABLE`, `ZEROWALL_PYTHON_ENV_ROOT` and `ZEROWALL_PYTHON_SITE_PACKAGES`. Node and HTTP connections do not wait for Python. Dependency failures remain visible in connection status; retry the Python preparation before reconnecting.

Bio Tools and Ketcher resources ship with this npm package; the SciMaster server is copied unchanged from the pinned build dependency with its license. The installed plugin launches the bundled server without installing the SciMaster CLI or its React terminal interface. Desktop keeps the resource tree outside ASAR. Absolute environment overrides `ZEROWALL_BIO_TOOLS_ROOT`, `ZEROWALL_KETCHER_ROOT` and `ZEROWALL_SCI_ROOT` select alternative resource directories; `ZEROWALL_SCIMASTER_ENTRY` selects an alternative SciMaster entry. Node uses `DSH_DESKTOP_NODE_EXECUTABLE` or the current Host executable. Resource lookup does not inspect older Python installations.

Research workflow modules advertise a Skill only when one is retained. Genetics uses `zerowall-mr` and OmicVerse uses `zerowall-omicverse`; compute, file transfer and package administration expose their operation schemas directly.

Host workflow calls can execute unconditional R tools registered after the current model step began. Current conversation restrictions and execution guards still apply; discovery does not expose every R tool definition to the model.

See the [retained migration reference](migration-reference.md) for detailed workflows and historical platform requirements. The package manifest owns current dependency versions.

## Development

Build and inspect archives from the repository root:

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
```

Keep the package LICENSE and any third-party notices with redistributions.

The reserved R service is zerowallrmcp and tools use mcp__zerowallrmcp__. Startup migrates rmcp and zerowall-rmcp records while retaining credentials and configuration. The remote endpoint and existing conversation project bindings retain their identities.
