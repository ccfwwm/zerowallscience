---
kind: upgrade-guide
description: ZeroWall Python dependencies and curated Skills use new environment locations and shared enablement management.
---

# ZeroWall Python and Skills

English | [中文](guide.zh.md)

## Change

ZeroWallScience uses DSH's bundled interpreter with uv dependency environments. Old ZeroWall Python directories, environment pointers and updater workers are not used or migrated. Applications embedding the Python package must supply `DSH_PYTHON_EXECUTABLE`, or allow uv to download the exact interpreter version declared by the packaged payload. `ZEROWALL_PYTHON_DEPENDENCIES_ROOT` selects the dependency store. The owner publishes `ZEROWALL_PYTHON_ENV_ROOT`, `ZEROWALL_PYTHON_EXECUTABLE` and `ZEROWALL_PYTHON_SITE_PACKAGES` after validation. Optional Skills resolve their own prepared environments; custom consumers must not construct interpreter paths from directory names.

`@zerowall/dsh-plugin-skills` manages discovery and enablement for model loading, slash commands and Claude projections. Twelve core workflows are enabled by default. Optional topics and imports remain disabled until selected. Plugin-owned guidance replaces duplicate standalone Skills. Remote research modules expose a Skill name only when one exists; `r.files`, `r.packages` and `r.compute` return `skill: null` and use MCP plugin help.

Desktop no longer bundles extension wheels or OCR model binaries. First launch requires network access for automatic preparation; ordinary startup remains available if preparation fails. Python defaults to the Tsinghua mirror and offers Aliyun and PyPI in settings. OCR downloads pinned models from RapidAI ModelScope; deployers can set `ZEROWALL_OCR_MODELS_ROOT` and `ZEROWALL_OCR_MODEL_MIRROR`. Existing verified environments remain reusable; no previous Python installation is imported.

The Science research skills catalog contains 40 namespaced skills. Its Python capabilities use isolated hash-locked environments; AlphaGenome Atlas separately downloads Python 3.14.0. Preparing them requires Python plugin 0.1.4 or later and leaves core rollback state unchanged.

## Migration

1. Install the current Science bundle and its selected plugin dependencies. Keep Python, environment and Skills management enabled. Preserve old directories as backups; do not copy their environments into the new dependency store.
2. For Desktop, launch normally and inspect Python settings until core preparation succeeds. For another carrier, supply absolute resource locations through the documented environment variables or profile fields. Never point at an old environment or a system Python installation.
3. Open Skills settings to review the curated inventory, source and dependency declarations. Enable optional topics explicitly. Folder, ZIP, Markdown and GitHub imports first show a preview and are committed disabled; select their workspace or global scope before enabling.
4. Update Python consumers to await `zerowallPythonManagement.ready()` or `resolveCapability(id)` and use the returned executable. Reading a dependency-bearing skill starts background preparation; the `python` tool accepts `capability_id` and waits for that preparation before execution. If Python tools are hidden, discover `python` and `python_environment` through `tool_search`. Refreshing settings does not install dependencies. Failed preparation is visible in Python settings; the next execution retries it.
5. Confirm PPT assets load, Bio MCP connects, disabled Skills disappear from discovery, and imported resources remain readable.
6. To use the Science research skills catalog, update Python to 0.1.4 or later and restart it, then install the suite in Plugins → Skills. Resolve and prepare a capability with the matching skill-manifest revision. Python and package downloads occur only when that capability is prepared.
