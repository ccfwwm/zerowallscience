---
name: zerowall-python-packages
description: Inspect the shared ZeroWall Science Python runtime, verify signed dependency updates, preview changes, diagnose TLS, and apply approved updates or rollback.
---

# ZeroWall Science Shared Python Runtime

Discover `python_environment` with `tool_search`, then use `tool_dispatch` with the exact returned name and argument schema.

The environment serves the entire application. MCP, scientific tools and Python execution are consumers. The public entry is `%APPDATA%/zerowall-science/Python/python.exe`; all managed packages share `Python/Lib/site-packages`. Do not describe it as MCP-only or recommend isolated package profiles.

1. Use `status` and `list_packages` (`info` with `query` for filtered legacy inventory). `check_manifest` verifies the Qiniu manifest signature and application/Python compatibility; it does not install updates.
2. Call `preview_sync` for the signed dependency set. Show additions, upgrades, conflicts, download size and health requirements. Retain the returned `planId`, manifest revision and request ID. For a user-requested extra package use `preview` with package requirements and `operation="install"` or `"uninstall"`.
3. After approval of that concrete plan, use `apply_sync` with `planId`, `manifestRevision`, `requestId` and `confirm=true`; manual plans use `apply` with `plan_id`. Reuse a request ID only to reconcile the same operation. A changed snapshot or manifest requires a fresh preview and approval.
4. Poll `status` using the returned `task_id`; do not repeat apply to check progress. Report completion only after health checks pass. `rollback` requires confirmation. Preserve failures and package conflicts rather than creating a second package directory.
5. Use `diagnose` for Python, pip, CA and HTTPS mirror checks. Use `configure` with `mirrorUrl` and `expectedRevision` for application-only settings; default is `https://pypi.tuna.tsinghua.edu.cn/simple`. Do not disable TLS verification or change global pip configuration.

Never run pip/uv against the active environment or write site-packages directly. Use the Host staging, hash verification, health checks and rollback service. Package specifications cannot be URLs, paths, shell options or commands. Required packages and dependencies used by retained packages cannot be uninstalled. Query operations do not require approval. Actual results come from Runner artifacts. Remote Linux Python is a separate platform and cannot consume the Windows wheel manifest.
