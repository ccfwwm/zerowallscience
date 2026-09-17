"""Tools subpackage (Step J1-J4).

Re-exports the Tool Protocol, the default context, and a
factory for detector-to-tool adapters so callers can
``from manusift.tools import tool_from_detector``.
"""
from .detector_adapter import DEFAULT_INPUT_SCHEMA, DetectorToolAdapter, tool_from_detector
from .registry import (
    ENTRY_POINT_GROUP,
    get_tool,
    iter_registered_tools,
    tool_names,
)
from .tool import Tool, ToolContext, ToolResult

__all__ = [
    "Tool",
    "ToolContext",
    "ToolResult",
    "DetectorToolAdapter",
    "tool_from_detector",
    "DEFAULT_INPUT_SCHEMA",
    "iter_registered_tools",
    "tool_names",
    "get_tool",
    "ENTRY_POINT_GROUP",
]
