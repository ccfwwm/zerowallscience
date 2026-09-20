---
name: zerowall-python-packages
description: Safely inspect the built-in Python environment, query package versions, preview installation, upgrade or uninstall, track progress and roll back failed changes.
---

# Managed Python packages

Discover `python_environment` with `tool_search`, then use `tool_dispatch` with the exact returned name and argument schema.

1. `info` returns the actual Python version, executable, snapshot and installed packages; `query` filters package names. `versions` checks available versions for explicit `packages`.
2. `preview` accepts package requirements and `operation="install"` or `"uninstall"`. Show the returned plan, including transitive changes and protected dependency errors.
   For conflicting optional packages, specify `profile="sbol"` (SBOL/tyto) or a named independent profile. Its complete locked dependency set is installed in a separate directory using the same interpreter. The preview includes required profile baseline packages. Profiles never downgrade shared packages; a changed interpreter snapshot requires a fresh preview. Profile uninstall is not supported; replace the profile with an approved package set.
3. Ask the user to approve that concrete plan. Only then call `apply` with `plan_id` and `confirm=true`. A changed snapshot requires a new preview and approval.
4. Poll `status` using the returned `task_id`; do not repeat apply to check progress. Report completion only after health checks pass. `rollback` requires confirmation.

Never install another Python or run pip/uv against the active environment. Package specifications cannot be URLs, paths, shell options or commands. Required core packages and dependencies used by retained packages cannot be uninstalled. Failures leave the active snapshot usable. Query operations do not require approval.
