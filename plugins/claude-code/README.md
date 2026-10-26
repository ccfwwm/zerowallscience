# ZeroWall Claude Code

`@zerowallscience/plugin-claude-code` adds Claude Code as an optional, independently versioned ZeroWall plugin. It is designed for the ZeroWall desktop app 8.4.7 or later and DSH `0.2.1-rc.2`.

## Isolation and installation

In ZeroWall Desktop, open Settings → Extension Center → Plugins and enable Claude Code. Activation registers the Claude Code settings page and adds Claude API to the new-session mode list. New sessions keep DSH Standard as the default; select Claude API when needed and choose a configured Claude model in the model menu to have that provider generate replies. Claude API mode keeps the standard coding tools and workflow. The Claude Code action also appears in the conversation header; open it and choose Install CLI to provision the isolated runtime.

Claude Code is installed only after the user chooses Install or Update. The plugin uses ZeroWall's bundled pnpm and the npmmirror registry to install the pinned `@anthropic-ai/claude-code` CLI into plugin-owned application data. The CLI runs by absolute path with its own config, home and package-store directories. The official Agent SDK is bundled in this independent plugin. It does not adopt, inspect or modify a user's existing Claude Code configuration.

The plugin is available only in the ZeroWall Desktop host. It does not provide a system-wide Claude installation or a PATH command.

The settings page's runtime diagnostics show the absolute managed CLI path. Each turn captures its own executable path so a later runtime change cannot change that turn's diagnostic evidence.

## Conversation routing and workspace access

Each new run reads the selected conversation's current model route. It supports routes explicitly identified as Anthropic Messages compatible and passes the credential to the child process only for that run. Credentials are not written to plugin configuration, logs, UI or conversation history. Other protocols are reported as unsupported; the plugin does not translate requests between protocols.

The Claude agent preset routes ordinary conversation turns through the independently managed Claude Code CLI. New conversations keep the DSH Standard preset unless Claude Code is selected. Each turn uses the provider, model, and explicit reasoning effort from DSH's final request, and resolves its credential again for that request. Standard conversations continue using the DSH model adapter.

Each conversation binds a persistent native Claude session ID and resumes it across turns and Host restarts. Existing DSH history is imported on first use; subsequent turns send new input. Cancelled or failed turns retain their binding, and pending input UUIDs are checked against native transcripts before retrying. CLI uninstall retains configuration, bindings and history.

Claude Code runs in the current project using the configured permission selector and the conversation's sandbox policy. Claude plugin control supports default, dontAsk, acceptEdits, auto, plan and bypassPermissions; native control follows ZeroWall's current-session presets. Composer and settings labels follow the application language. Global defaults initialize new conversations, and running turns retain the permissions they started with. SDK authorization requests use Host approval dialogs. Host-bridged tools always pass through Host policy checks.

Enabled Skills preserve their model/manual invocation restrictions and source paths. The in-process SDK MCP bridge exposes the current session's visible ZeroWall tools and enabled MCP tools through the existing Host connections, including managed services. Image generation and editing use the selected image route and return real files, receipts and conversation attachments. Environment values and credentials are supplied only to the process and redacted from returned text. The plugin does not rewrite source Skills or MCP definitions.

Claude Code `2.1.309` does not support a `cwd` field for stdio MCP servers. An omitted or blank MCP directory inherits the current project; a matching absolute directory is supported directly (case-insensitive on Windows). For a different absolute directory, the plugin generates a temporary protocol relay under that turn's private projection. It runs Node services with ZeroWall's bundled Node/Electron executable, or launches an absolute native executable, using argument arrays and `shell: false`. The relay forwards stdin/stdout/stderr without adding output to the MCP protocol. Launch data contains no resolved credentials; controlled references remain temporary process environment variables. Turn cleanup removes the relay and launch descriptions.

Relative or invalid directories, shell-dependent launches in a separate directory, and Windows `.cmd`/`.bat` commands are skipped with an explicit compatibility reason. Use the service's absolute native executable or a Node entry point instead. The unsupported `cwd` field is never written into Claude's MCP configuration, and the source MCP records are preserved. HTTP MCP services are unaffected by this directory restriction.

## Conversation statistics

The composer dock displays actual Claude tokens, cache-hit share, weighted main-agent decode speed, and the most recent request's context occupancy. Compact and detailed preferences, application language and theme are shared with the standard conversation UI. Details separate uncached input, cache reads, cache writes and output (including thinking), with per-model totals covering SDK internal subagents and compaction. Missing counters or timing boundaries are never replaced with zero or an estimate.

Statistics start with this plugin version. Ignorable `zerowall-claude/metrics` events and a plugin-owned session projection preserve them across restarts without changing DSH's global event vocabulary or rewriting old logs. The managed CLI 2.1.309 restores cumulative `result.modelUsage` on resume, contrary to the older SDK 0.3.263 type comment. The collector uses its verified `model_usage_since_last_result` whole-tree delta; older resumed runtimes without that field expose confirmed partial stream statistics only. This avoids importing old spend, counting repeated assistant blocks, or adding the same final result to its provisional stream samples. Context capacity comes from the matching result model's `contextWindow`, never a model-name table or whole-turn token sum.

## Version and source

- ZeroWall plugin: `0.2.7`
- Agent SDK: `0.3.263`
- Claude Code CLI: `2.1.309`
- Upstream adapter reference: [`Norman-else/dsh-claude`](https://github.com/Norman-else/dsh-claude/tree/fe00e3af0b1ad03acc977b13b4d4ab805086f6da), tag `v0.1.65`, commit `fe00e3af0b1ad03acc977b13b4d4ab805086f6da`
- License: MIT; see [`LICENSE`](./LICENSE)

This ZeroWall plugin is a native adaptation. It does not include the upstream Claude Agent SDK adapter or its behavior of reusing the user's Claude profile.

## Claude subagents

The plugin mounts the official DSH delegation tool as `claude_subagent` in each Agent scope. It starts a text-only one-shot child with the managed Claude CLI, inherited Skills/MCP/environment, its own working directory and cancellation, and the parent's selected route by default. To delegate from an OpenAI parent, enable DSH's existing subagent model-selection setting and authorize an already configured Anthropic Messages route. `claude_list_subagent_models` discovers those allowed routes; pass exact `provider`, `model` and optional `reasoning_effort` to `claude_subagent`. This changes only the child process. The plugin never enables that setting or changes the parent/default model. Output schemas, continuation and max-token overrides are unsupported and fail explicitly.

## Native settings surface

The global setting listbox, text controls, chevron, card styles and prose theme reuse the pinned upstream `src/client/ClaudeCodeSettings.tsx`, `styles.ts` and `markdown-theme.ts`. The extracted components live in `src/client/upstream/`, retain the upstream MIT license, and are connected to ZeroWall's managed settings API. Local changes add accessible labels and help-text associations, avoid duplicate text writes on Enter, and support the managed runtime's availability descriptors. The runtime diagnostic card uses ZeroWall's CLI status and install/update/rollback operations.

Output style, permission selection, permission defaults, renderer, prose mode and the concurrent process limit are connected to the managed Host. The native conditional display rules hide prose for the native renderer and hide the plugin permission default for the native permission selector. Renderer changes apply to the next turn; prose settings apply to the plugin transcript.

The managed CLI currently exits after each turn and does not create worktrees. Worktree naming and idle-process reuse controls are shown disabled with their reasons. Upstream Claude subscription usage and Jira account services are not connected; the page states those limits without collecting credentials. The upstream plugin marketplace/update service is also not connected: ZeroWall's signed Extension Center owns plugin installation and updates, separately from the Claude CLI update controls. This reuses the applicable native settings components, rather than claiming the upstream settings services were all transplanted.
