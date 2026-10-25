# ZeroWall Claude Code

`@zerowallscience/plugin-claude-code` adds Claude Code as an optional, independently versioned ZeroWall plugin. It is designed for the ZeroWall desktop app 8.4.7 or later and DSH `0.2.1-rc.2`.

## Isolation and installation

In ZeroWall Desktop, open Settings → Extension Center → Plugins and enable Claude Code. Activation registers the Claude Code settings page and adds Claude API to the new-session mode list. New sessions keep DSH Standard as the default; select Claude API when needed and choose a configured Claude model in the model menu to have that provider generate replies. Claude API mode keeps the standard coding tools and workflow. The Claude Code action also appears in the conversation header; open it and choose Install CLI to provision the isolated runtime.

Claude Code is installed only after the user chooses Install or Update. The plugin uses ZeroWall's bundled pnpm and the npmmirror registry to install the pinned `@anthropic-ai/claude-code` CLI into plugin-owned application data. The CLI runs by absolute path with its own config, home and package-store directories. It does not adopt, inspect or modify a user's existing Claude Code configuration, and the Claude CLI/SDK is not part of the desktop runtime.

The plugin is available only in the ZeroWall Desktop host. It does not provide a system-wide Claude installation or a PATH command.

The settings page's runtime diagnostics show the absolute managed CLI path. Each turn captures its own executable path so a later runtime change cannot change that turn's diagnostic evidence.

## Conversation routing and workspace access

Each new run reads the selected conversation's current model route. It supports routes explicitly identified as Anthropic Messages compatible and passes the credential to the child process only for that run. Credentials are not written to plugin configuration, logs, UI or conversation history. Other protocols are reported as unsupported; the plugin does not translate requests between protocols.

The Claude agent preset routes ordinary conversation turns through the independently managed Claude Code CLI. New conversations keep the DSH Standard preset unless Claude Code is selected. Each turn uses the provider, model, and explicit reasoning effort from DSH's final request, and resolves its credential again for that request. Standard conversations continue using the DSH model adapter.

Claude Code runs in the current project with `acceptEdits`, allowing automatic file edits. Enabled, compatible MCP servers are authorized for that run. It runs in noninteractive print mode: commands that require additional permission can be rejected. The plugin does not grant unrestricted command execution.

Eligible enabled Skills, independently launchable MCP servers, and configured ZeroWall environment variables are projected into the isolated Claude Code process. Environment values and credentials are supplied only to that process and redacted from returned text; MCP configuration files keep opaque references. The plugin does not rewrite source Skills or MCP definitions. Managed MCP services that cannot be launched independently are reported as unsupported. MCP credential references are resolved through the host's controlled credential service and are never copied as plaintext into Claude configuration.

Claude Code `2.1.309` does not support a `cwd` field for stdio MCP servers. An omitted or blank MCP directory inherits the current project; a matching absolute directory is supported directly (case-insensitive on Windows). For a different absolute directory, the plugin generates a temporary protocol relay under that turn's private projection. It runs Node services with ZeroWall's bundled Node/Electron executable, or launches an absolute native executable, using argument arrays and `shell: false`. The relay forwards stdin/stdout/stderr without adding output to the MCP protocol. Launch data contains no resolved credentials; controlled references remain temporary process environment variables. Turn cleanup removes the relay and launch descriptions.

Relative or invalid directories, shell-dependent launches in a separate directory, and Windows `.cmd`/`.bat` commands are skipped with an explicit compatibility reason. Use the service's absolute native executable or a Node entry point instead. The unsupported `cwd` field is never written into Claude's MCP configuration, and the source MCP records are preserved. HTTP MCP services are unaffected by this directory restriction.

## Version and source

- ZeroWall plugin: `0.1.7`
- Claude Code CLI: `2.1.309`
- Upstream adapter reference: [`Norman-else/dsh-claude`](https://github.com/Norman-else/dsh-claude/tree/fe00e3af0b1ad03acc977b13b4d4ab805086f6da), tag `v0.1.65`, commit `fe00e3af0b1ad03acc977b13b4d4ab805086f6da`
- License: MIT; see [`LICENSE`](./LICENSE)

This ZeroWall plugin is a native adaptation. It does not include the upstream Claude Agent SDK adapter or its behavior of reusing the user's Claude profile.
