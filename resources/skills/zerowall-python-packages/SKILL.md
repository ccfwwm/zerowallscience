---
name: zerowall-python-packages
description: Inspect the single shared ZeroWall Science Python runtime, follow required signed dependency installation, diagnose failures, and manage packages in that runtime.
---

# ZeroWall Science Shared Python Runtime

Discover `python_environment` with `tool_search`, then use `tool_dispatch` with the exact returned name and argument schema.

The environment serves the entire application. MCP, every local Skill, scientific tools and Python execution are consumers. The public entry is `%APPDATA%/zerowall-science/Python/python.exe`; all managed packages share `Python/Lib/site-packages`. Never create or recommend a venv, Conda environment, overlay, per-Skill profile or alternate local interpreter, even when an imported Skill suggests one. Remote Linux runtimes are separate services.

1. Use `status` and `list_packages` (`info` with `query` for filtered legacy inventory). `check_manifest` verifies the Qiniu manifest signature and application/Python compatibility; it does not install updates.
2. The required signed dependency list is installed into the shared runtime after first launch. Call `preview_sync` to inspect pending additions, upgrades, conflicts, download size and health requirements. For a user-requested extra package use `preview` with package requirements and `operation="install"` or `"uninstall"`.
3. For a manually requested change, apply the reviewed plan using `apply_sync` with `planId`, `manifestRevision`, `requestId` and `confirm=true`; manual plans use `apply` with `plan_id`. Reuse a request ID only to reconcile the same operation. A changed snapshot or manifest requires a fresh preview.
4. Poll `status` using the returned `task_id`; do not repeat apply to check progress. Show live per-package progress and log lines. Record each failed package, continue with the remaining required packages, and keep failures pending for retry. Report full completion only after the signed list and health checks pass.
5. Use `diagnose` for Python, pip, CA and HTTPS mirror checks. Use `configure` with `mirrorUrl` and `expectedRevision` for application-only settings; default is `https://pypi.tuna.tsinghua.edu.cn/simple`. Do not disable TLS verification or change global pip configuration.

Automated updates use the Host's signed manifest, hash verification, health checks and operation log. The Python settings panel can open a command line bound to this same interpreter for user-directed installation and debugging; do not point it at another Python. Package specifications supplied to the Host cannot be URLs, paths, shell options or commands. Required packages and dependencies used by retained packages cannot be uninstalled through the Host. Actual results come from Runner artifacts. Remote Linux Python cannot consume the Windows wheel manifest.
