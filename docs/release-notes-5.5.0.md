# ZeroWall Science 5.5.0

5.5.0 consolidates the 5.4.0 stability work with the FigureYa and rdatalinux
MCP improvements. The Windows x64 installer is the packaged release artifact.

## Startup and desktop stability

- Plugin startup is asynchronous and resilient: cached MCP entries render first,
  remote refreshes run in the background, and a failed optional MCP does not
  block built-in tools or ordinary conversations.
- Duplicate remote mounts, file-review API mounts, capability registrations and
  system-prompt cards are deduplicated during startup and session replay.
- Workspace-free conversations are supported, and the desktop runtime remains
  usable when no workspace is selected.
- OpenCode Zen vision models preserve image capability metadata and send image
  content through the OpenAI-compatible backend.

## Capability management and context

- All built-in tools and `dsh-genui` are resident by default. `rmcp` and
  `zerowall_managed_bio_tools` remain searchable on demand.
- `meta_search` supports aliases, bilingual keywords, server/tool-family
  matching and fuzzy suggestions. `meta_enable` updates the current
  Agent/Session visibility immediately and has no artificial batch-count limit.
- Tool visibility is enforced in the execution layer, while the model receives
  only the schemas enabled for the current session. Large skill catalogs are
  retained for history compatibility but are no longer injected into new
  conversations.
- System prompts keep a compact MCP domain index and are shown once per request
  series unless the actual prompt, model or agent changes.

## MCP and environment configuration

- SciMaster, Huagongshe and rdatalinux rmcp credentials are managed in the
  Environment settings through Secret Broker; managed MCP editor fields are
  read-only and no duplicate credential forms are shown.
- The rdatalinux endpoint and authorization status are validated asynchronously;
  cached server names and tool counts appear before remote refresh completes.
- MCP connection failures expose readable diagnostics without affecting other
  connections or built-in functionality.

## FigureYa 图片成果

- FigureYa 生成的图片按任务保存到项目工作区的 `figureya/<job_id>/` 目录，并通过 MCP 返回项目相对路径。
- MCP 图片结果保存为会话附件，在对话工具结果中直接显示预览；原始文件仍可从项目路径打开。
- FigureYa 等待结果会返回图片、成果路径和必要的简短说明，不再要求用户处理 base64 或完整清单。

## MCP 与科研工作流

- 固定并验证 rdatalinux MCP 的正式端点、鉴权和 172 个工具的分页清单。
- 保留 `rplatform`、`rbioagent`、`rplotfigure` 命名空间，FigureYa 的搜索、任务等待、图片读取和结果兼容链路保持可用。
- 更新 `zerowall-rplotfigure` Skill，明确图片展示、项目目录和 `run_id` 兼容规则。

## Markdown、MinerU 与审查

- Better Sidebar Markdown previews rewrite relative, Windows and URL-encoded
  media paths consistently, including reference images, HTML media and local
  audio/video, while enforcing workspace and file-size boundaries.
- Local image failures show an explicit path-aware placeholder instead of
  silently degrading to alt text. Mermaid, tables, task lists, footnotes,
  syntax-highlighted code and safe HTML remain enabled.
- PDF uploads fall back cleanly when MinerU is unavailable and preserve the
  existing project file path and parsing status.
- Operation approval (`dsh-auto-review`) and answer/citation verification remain
  separate switches. File review keeps the ZeroWall tab/service contract and
  aggregates nested changes under one root call.

## WeChat

- The upstream `dsh-wechat` integration is pinned and adapted to ZeroWall's
  existing account, profile and settings contracts, including QR login routing,
  media placeholders and reconnect behavior.

## Model detection

- Model probes use per-provider/model versions and explicit terminal states
  (`available`, `unavailable` or `requires-login`). Batch results complete state
  write-back even when incremental events are lost; stale generations cannot
  overwrite newer results.
