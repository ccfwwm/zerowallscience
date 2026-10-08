"""General-purpose agent tools (R-audit 2026-06-10).

R-2026-06-15 (Phase 4 + P4-1):
this package replaces the
2496-line
``manusift.tools.agent_tools``
god-file.  Each tool
family lives in its own
submodule:

  * ``web_search`` --
    ``WebSearchTool``
  * ``web_fetch`` --
    ``WebFetchTool``
  * ``bash`` --
    ``BashTool`` (+ the
    shell-detect helper
    ``_shell_command_args``)
  * ``grep_glob`` --
    ``GrepTool`` and
    ``GlobTool``
    (same family, share
    a module)
  * ``task`` --
    ``TaskTool`` (+ the
    role-filter helper
    ``_filter_tools_by_role``)
  * ``todo_write`` --
    ``TodoWriteTool``

For backward
compatibility,
``manusift.tools.agent_tools``
is preserved as a
re-export shim
(symlink-pattern via
``from .agent_tools_pkg
import *``); the 46
existing test files
and downstream imports
are unaffected.
"""
from __future__ import annotations

# R-2026-06-15 (Phase 4 + P4-1):
# ``Tool`` lives in
# ``manusift/tools/tool.py``
# (the parent
# package's module),
# NOT in this
# package.  Use
# ``..tool`` to
# reach it (one
# level up, then
# ``tool.py``).
from ..tool import Tool
from .bash import (
    SHELL_MODES,
    BashTool,
    _shell_command_args,
)

# R-2026-06-19 (P2-B5):
# ``DiffTool`` is the
# read-only
# ``diff``
# viewer.  It's a
# 9th
# general-purpose
# agent tool.  See
# ``diff.py``
# for the
# contract.
from .diff import DiffTool
from .grep_glob import GlobTool, GrepTool
from .todo_write import TodoWriteTool
from .web_fetch import WebFetchTool
from .web_search import (
    WebSearchTool,
    _search_brave,
    _search_duckduckgo,
    _search_tavily,
)

__all__ = [
    "WebSearchTool",
    "WebFetchTool",
    "BashTool",
    "GrepTool",
    "GlobTool",
    "TodoWriteTool",
    "DiffTool",
    "register_agent_tools",
]


def register_agent_tools() -> list[Tool]:
    """Return the 8 general-purpose agent tools in
    registration order.

    Wired into the global tool registry by
    ``manusift.tools.registry._load_builtin_tools``.

    R-audit (2026-06-14):
    ``SourceDataAuditTool`` was added in this audit
    to give the LLM a deterministic path for the
    "check the source data" task instead of spawning
    a sub-agent to write a one-off script.

    R-2026-06-19 (P2-B5):
    ``DiffTool`` (the 9th
    tool) is appended
    last so existing
    tool indices in
    agent prompts and
    tests are
    preserved.
    """
    from ..data_audit import SourceDataAuditTool
    from ..python_exec import PythonExecTool
    from ..table_scan import TableScanTool

    return [
        WebSearchTool(),
        WebFetchTool(),
        BashTool(),
        GrepTool(),
        GlobTool(),
        TodoWriteTool(),
        SourceDataAuditTool(),
        PythonExecTool(),
        TableScanTool(),
        DiffTool(),
    ]
