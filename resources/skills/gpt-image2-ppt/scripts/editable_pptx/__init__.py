"""Editable PPTX reconstruction primitives and opt-in workflow."""

from .provider import OpenAIImageProvider
from .renderer import render_editable_deck
from .scene import EditableScene
from .workflow import EditableBuildResult, build_editable_output

__all__ = [
    "EditableBuildResult",
    "EditableScene",
    "OpenAIImageProvider",
    "build_editable_output",
    "render_editable_deck",
]
