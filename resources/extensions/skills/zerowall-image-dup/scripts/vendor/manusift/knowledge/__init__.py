"""Knowledge-base subpackage (E-audit, 2026-06).

The end-to-end audit found
that host agents (and the
removed chat TUI) had no
way to consult a user's
external knowledge base.
This subpackage layers a
*protocol-driven* read-only
adapter on top of an
Obsidian vault.

Two backends ship in the
box:

  * ``FileBackend``
    (``obsidian_files.py``)
    -- reads the vault as a
    plain directory of
    ``.md`` files. Zero
    external dependencies;
    works offline. This is
    the default.

  * ``RestBackend``
    (``obsidian_rest.py``)
    -- talks to a running
    Obsidian instance via
    the Local REST API
    plugin. Requires
    ``httpx`` (already
    installed as a
    transitive dependency)
    and the user to have
    Obsidian + the plugin
    running locally with
    HTTPS on port 27124.
    Optional: a user who
    only configures the
    vault path uses
    ``FileBackend``
    without ever loading
    ``RestBackend``.

The four LLM-facing tools
in
``manusift/tools/knowledge.py``
talk to the backend
through the
``KnowledgeBackend``
Protocol in
``base.py``. A third
backend (e.g. Notion,
Roam, Logseq) can be
added by implementing the
protocol.
"""
from __future__ import annotations

from typing import Any

from .base import (
    BackendUnavailable,
    KnowledgeBackend,
    NoteContent,
    NoteMeta,
)
from .resolver import resolve_backend

__all__ = [
    "BackendUnavailable",
    "KnowledgeBackend",
    "NoteContent",
    "NoteMeta",
    "resolve_backend",
]
