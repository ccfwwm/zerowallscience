"""Tool registry (Step J4 prep, Step J1 first cut).

Plugin-style tool discovery via Python's standard
``importlib.metadata`` entry-points mechanism — third-party
tools live in their own pip packages and ship a one-line entry
point in pyproject.toml.

The registry is lazy: every call to ``iter_registered_tools``
re-reads the entry points table, so a tool installed at
runtime is picked up on the next call without restarting
the process. This is the same lazy-lookup discipline we
use for detectors (``manusift.detectors.registry``).
"""
from __future__ import annotations

import logging
from importlib import metadata
from typing import Iterable

from .tool import Tool
from .detector_adapter import tool_from_detector

log = logging.getLogger(__name__)

ENTRY_POINT_GROUP = "manusift.tools"

# Built-in tools: every detector is automatically a tool.
# This means a user who has 0 third-party tools installed
# still gets 4 tools (one per detector), which is enough
# to demonstrate the agent loop end-to-end.
_BUILTIN_TOOLS: list[Tool] = []


def _load_builtin_tools() -> list[Tool]:
    """Return the built-in tools. Lazily imported to avoid a
    circular import: ``manusift.detectors`` imports from
    ``manusift.config`` which does not depend on us, but the
    detector classes themselves import pymupdf etc. — better
    to defer the import until the registry is actually
    called.

    R-audit-i18n (2026-06-10): every detector in
    ``manusift.detectors`` is exposed as a tool via
    ``register_all_detectors()`` -- the previous hand-written
    list of 4 detector adapters was redundant. Adding a new
    detector to ``detectors/__init__.py`` now makes it a tool
    automatically, with no further wiring. The remaining
    ``register_*`` calls surface the non-detector tools
    (inspection, OCR, table-stats helpers, latex, similarity
    matrix, knowledge base, render report).
    """
    # T2: inspection
    # tools --
    # read / list
    # findings.
    from .inspection import register_inspection_tools
    # T10: OCR table
    # extractor
    # (image -> CSV).
    from .table_ocr import register_table_tools
    # R-audit: table-
    # statistics
    # surface
    # area (4
    # detector
    # wrappers
    # + 2 data-
    # source
    # helpers).
    from .table_stats_tools import (
        register_table_stats_tools,
    )
    # T12: LaTeX tools.
    from .latex import register_latex_tools
    # P1.5: similarity
    # matrix.
    from .similarity_matrix import (
        register_similarity_tools,
    )
    # E-audit: knowledge-
    # base tools.
    from .knowledge import (
        register_knowledge_tools,
    )
    # R-audit: render
    # report.
    from .render import register_render_tools
    # R-audit (2026-06-10):
    # direct-fs tools --
    # ``read_file``,
    # ``ingest_from_path``,
    # ``list_dir``.
    # Allow the LLM to
    # pick up a user-
    # supplied file path
    # without the user
    # having to run
    # ``manusift ingest``
    # manually.
    from .direct_fs import register_direct_fs_tools
    # R-audit (2026-06-10):
    # general-purpose agent
    # tools -- ``web_search``,
    # ``web_fetch``,
    # ``bash``,
    # ``grep``,
    # ``glob``,
    # ``task`` (subagent),
    # ``todo_write``. Closes
    # the Claude Code /
    # OpenCode / Hermes
    # tool-gap (R-audit
    # 2026-06-10).
    from .agent_tools import register_agent_tools
    # P3 (MCP product surface): one-call screen verdict + async
    # screen jobs (submit / status / result).
    from .screen_tools import register_screen_tools
    # R-audit-i18n
    # (2026-06-10):
    # one call
    # wraps
    # every
    # detector.
    # ``register_all_detectors``
    # iterates
    # ``iter_registered_detectors()``
    # so the
    # canonical
    # detector
    # list (``__all__``)
    # is the
    # single
    # source
    # of
    # truth.
    from .detector_catalog import (
        register_all_detectors,
    )
    return [
        *register_all_detectors(),
        *register_inspection_tools(),
        *register_table_tools(),
        *register_table_stats_tools(),
        *register_latex_tools(),
        *register_similarity_tools(),
        *register_knowledge_tools(),
        *register_render_tools(),
        *register_direct_fs_tools(),
        *register_agent_tools(),
        *register_screen_tools(),
    ]


# P1.3 (R-2026-06-14): the registry
# tracks a per-process set of
# ``disabled`` tool names. Tools in
# this set are still discovered and
# still callable by name (e.g. from
# a LLM prompt that explicitly says
# "use detector X"), but the
# default iteration
# (``iter_registered_tools``) skips
# them. The TUI's /tools slash
# command, the doctor health check,
# and the LLM tool list all see the
# filtered set; an explicit
# ``registry.get_tool("x")`` call
# still returns the unfiltered
# instance for advanced use.
_DISABLED: set[str] = set()


def disable(name: str) -> None:
    """Disable a tool by name. Idempotent."""
    _DISABLED.add(name)


def enable(name: str) -> None:
    """Re-enable a tool by name. Idempotent."""
    _DISABLED.discard(name)


def is_disabled(name: str) -> bool:
    return name in _DISABLED


def list_disabled() -> tuple[str, ...]:
    """Return the currently-disabled tool names,
    in insertion order. Sorted to make tests
    deterministic.
    """
    return tuple(sorted(_DISABLED))


def reset_disabled() -> None:
    """Test hook. Drop every disable. Production
    code should not call this.
    """
    _DISABLED.clear()


def reset_builtin_cache() -> None:
    """Test hook. Drop the builtin-tools cache so the next
    ``iter_registered_tools()`` call re-loads from scratch.
    Production code should not call this.
    """
    global _BUILTIN_TOOLS
    _BUILTIN_TOOLS = []


def iter_registered_tools() -> Iterable[Tool]:
    """Yield every built-in tool followed by every third-party
    tool installed via entry_points.

    Failures are logged and skipped — a broken third-party
    tool must not stop the agent loop.

    P1.3 (R-2026-06-14): the disabled set is
    applied here. A disabled tool is still
    constructable (``get_tool("x")`` returns
    the unfiltered instance) but does not
    appear in the LLM's tool list.
    """
    global _BUILTIN_TOOLS
    if not _BUILTIN_TOOLS:
        _BUILTIN_TOOLS = _load_builtin_tools()
    for tool in _BUILTIN_TOOLS:
        if is_disabled(tool.name):
            continue
        yield tool
    try:
        eps = metadata.entry_points(group=ENTRY_POINT_GROUP)
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "could not load tool entry points",
            extra={"group": ENTRY_POINT_GROUP, "err": str(exc)},
        )
        return
    for ep in eps:
        try:
            cls_or_obj = ep.load()
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "could not load tool entry point",
                extra={"ep_name": ep.name, "ep_module": ep.value, "err": str(exc)},
            )
            continue
        if isinstance(cls_or_obj, type):
            try:
                instance = cls_or_obj()
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "could not instantiate tool",
                    extra={"ep_name": ep.name, "err": str(exc)},
                )
                continue
        else:
            instance = cls_or_obj
        if not (
            hasattr(instance, "name")
            and hasattr(instance, "description")
            and hasattr(instance, "input_schema")
            and hasattr(instance, "execute")
        ):
            log.warning(
                "entry point does not satisfy Tool protocol",
                extra={"ep_name": ep.name, "type": type(instance).__name__},
            )
            continue
        log.info(
            "loaded tool from entry point",
            extra={"ep_name": ep.name, "class": type(instance).__name__},
        )
        yield instance


def tool_names() -> list[str]:
    """Return the names of every registered tool. Useful for
    diagnostics and the /tools HTTP endpoint (Step J3
    follows)."""
    return [t.name for t in iter_registered_tools()]


def get_tool(name: str) -> Tool | None:
    """Look up a tool by name. Returns None if no such tool
    is registered. The AgentLoop uses this to dispatch the
    LLM's tool calls."""
    for tool in iter_registered_tools():
        if tool.name == name:
            return tool
    return None
