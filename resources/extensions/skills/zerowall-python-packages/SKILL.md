---
name: zerowall-python-packages
description: Inspect fixed ZeroWall Python, supplement missing packages, and diagnose durable installation tasks while preserving installed versions.
---

# ZeroWall Science Shared Python Runtime

Call `python_environment` directly with its current argument schema.

The environment serves the entire application. The normal executable is `<actual application installation directory>/Python/python.exe`, or an explicitly selected fixed root, with its own `Lib/site-packages`. Read `runtimeRoot`, `executable` and `sitePackages` from the service. Never execute `.zerowall/slots`, backup, candidate, system Python, Conda, a venv or overlay. Old environments are retained without migration. Remote Linux runtimes are separate services.

1. Call `scan_local`, retain `scanId`, then poll `status` until detection completes (45 seconds maximum). `list_packages` and legacy `info` read actual local inventory; use `query`, `offset`, `limit` and `nextOffset` for paging. Checks and previews never initialize Python.
2. A normalized package name present locally is installed regardless of version. Default core, science and capability plans only supplement missing names. Never upgrade, downgrade or reinstall existing packages to match an online list. A user-authorized install initializes missing Python first in the same durable task; `install_runtime` with `confirm=true` explicitly initializes or repairs it. Bootstrap remains CPython 3.12.10 / 1.5.2. For an explicit extra package or version change, use `preview` and `operation="install"` or `"uninstall"`.
3. For a manually requested change, apply the reviewed plan using `apply_sync` with `planId`, `manifestRevision`, `requestId` and `confirm=true`; manual plans use `apply` with `plan_id`. Reuse a request ID only to reconcile the same operation. A changed snapshot or manifest requires a fresh preview.
4. Checks, previews and installs return durable task IDs. Poll `task_status`; never repeat apply to check progress. `cancel` cancels that task. Report partial science completion with unresolved names; core completion requires all required names present. Interpreter, pip, import diagnostics, `pip check` and MCP health are separate. Version conflicts do not make distributions absent.
5. Use `diagnose` for Python, pip, CA and HTTPS mirror checks. Use `configure` with `mirrorUrl` and `expectedRevision` for application-only settings; default is USTC at `https://mirrors.ustc.edu.cn/pypi/simple`. Preserve an explicitly saved mirror choice; resetting the application mirror selects USTC. Do not disable TLS verification or change global pip configuration.

Automated updates use the Host's signed manifest, hash verification, health checks and operation log. The Python settings panel can open a command line bound to this same interpreter for user-directed installation and debugging; do not point it at another Python. Package specifications supplied to the Host cannot be URLs, paths, shell options or commands. Required packages and dependencies used by retained packages cannot be uninstalled through the Host. Actual results come from Runner artifacts. Remote Linux Python cannot consume the Windows wheel manifest.

Missing packages prefer official wheels. Source builds use a private temporary build interpreter; failed builds may use a matching signed Qiniu fallback wheel after identity, platform, size and SHA-256 validation. Cancellation and integrity failures never trigger fallback. Updates wait for runtime leases and rollback restores files to the same fixed root.

Python execution returns a bounded summary and `result_id`. Read full output with `python_result`; byte offsets are UTF-8 and `next_offset` identifies the next page. A subsequent `CONTEXT_WINDOW_EXCEEDED` belongs to the model reply: preserve successful tool results, never rerun installation to recover a reply, and preserve user model and reasoning settings.
