"""LLM-facing knowledge-base tools (E-audit, 2026-06).

Four ``Tool`` classes
that wrap a
``KnowledgeBackend``
(either the file-system
or the REST backend)
and expose the knowledge
base to the agent loop.

The four tools:

  1. ``ListVaultNotesTool``
     -- list notes in a
     folder.
  2. ``ReadNoteTool`` --
     read one note by
     relative path.
  3. ``SearchVaultTool`` --
     full-text search
     across the vault.
  4. ``RecentVaultNotesTool``
     -- most-recently-
     modified notes.

The tools are thin
wrappers: they do the
JSON-marshalling and the
``"error: ..."`` envelope
so a misconfigured /
unavailable backend
returns a *clean* error
string to the LLM rather
than raising. The
backend does the actual
I/O.

Why four tools and not
one: a single
``vault_query`` tool
would force the LLM to
choose a verb in a
free-form string, which
the LLM is bad at. Four
discrete tools give the
LLM explicit verbs in
the cheat sheet and the
input schema.

No write tool: Manusift
is a fraud detector, not
a note-taking app. A
future ``CreateNoteTool``
can be added under a
``manusift.tools.writing``
subpackage once the user
has a concrete write use
case.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..knowledge import (
    BackendUnavailable,
    KnowledgeBackend,
    NoteContent,
    NoteMeta,
    resolve_backend,
)
from .tool import Tool, ToolContext


# ---------- shared helpers ----------


def _serialize_meta(
    meta: NoteMeta, limit_tags: int = 20
) -> dict[str, Any]:
    """A small JSON-friendly
    dict for one
    ``NoteMeta``. We
    deliberately omit
    ``mtime`` -- the LLM
    never needs a
    Unix timestamp."""
    return {
        "relpath": meta.relpath,
        "title": meta.title,
        "tags": meta.tags[:limit_tags],
    }


def _err(message: str) -> str:
    """Build a
    ``{"error": "..."}``
    JSON string. Every
    knowledge tool returns
    this shape on
    failure so the LLM
    sees a consistent
    envelope."""
    return json.dumps({"error": message})


# ---------- backend resolution (cached per Tool instance) ----------


def _get_backend(ctx: ToolContext) -> KnowledgeBackend | None:
    """Return a backend for
    the current call.

    We resolve the backend
    on every call (rather
    than caching it on the
    tool instance) so
    settings changes during
    a chat session -- e.g.
    the user runs
    ``/obsidian <path>``
    to set a vault -- take
    effect immediately. A
    backend is cheap to
    build; a 1000-note
    vault takes < 1 second
    to scan.

    The ``ToolContext``
    carries the ``trace_id``
    but not the settings;
    we read settings from
    the global cache.
    """
    try:
        from ..config import get_settings
        settings = get_settings()
    except Exception:  # noqa: BLE001
        return None
    return resolve_backend(settings)


# ---------- 1. ListVaultNotesTool ----------


class ListVaultNotesTool:
    """List notes under a
    vault folder. The
    ``folder`` argument is
    optional; the empty
    string returns every
    note in the vault."""

    name: str = "list_vault_notes"

    def description(self) -> str:
        return (
            "List notes in the user's external knowledge base "
            "(Obsidian vault or any folder of .md files). "
            "Returns a compact summary per note: relative path, "
            "title, and tags. Optionally restrict to one folder "
            "by passing ``folder`` (e.g. ``research/``). "
            "Use this to give the LLM a list of the user's notes "
            "before it picks which to read in detail. "
            "Read-only."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "folder": {
                    "type": "string",
                    "description": (
                        "Optional. Restrict to this folder, "
                        "relative to the vault root. Use "
                        "``\"\"`` (the default) to list every "
                        "note. The folder path uses forward "
                        "slashes (e.g. ``research/ml/``)."
                    ),
                    "default": "",
                },
                "limit": {
                    "type": "integer",
                    "description": (
                        "Optional. Maximum number of notes "
                        "to return. Default 50. The vault "
                        "may have thousands of notes; the "
                        "LLM should not load the full list "
                        "into its context at once."
                    ),
                    "default": 50,
                    "minimum": 1,
                    "maximum": 500,
                },
            },
            "additionalProperties": False,
        }

    def execute(
        self, input: dict[str, Any], ctx: ToolContext
    ) -> str:
        backend = _get_backend(ctx)
        if backend is None:
            return _err(
                "knowledge base is not configured. "
                "Set MANUSIFT_OBSIDIAN_VAULT_PATH "
                "in the environment, or "
                "MANUSIFT_OBSIDIAN_REST_API_URL + "
                "MANUSIFT_OBSIDIAN_REST_API_KEY for "
                "the live Obsidian REST API path."
            )
        folder = (input.get("folder") or "").strip()
        try:
            limit = int(input.get("limit") or 50)
        except (TypeError, ValueError):
            limit = 50
        try:
            notes = backend.list_notes(folder=folder)
        except BackendUnavailable as exc:
            return _err(f"backend unavailable: {exc}")
        notes = notes[:limit]
        return json.dumps(
            {
                "count": len(notes),
                "notes": [
                    _serialize_meta(m) for m in notes
                ],
            },
            ensure_ascii=False,
        )


# ---------- 2. ReadNoteTool ----------


class ReadNoteTool:
    """Read one note by its
    relative path inside
    the vault. The path
    is the same string the
    ``list_vault_notes``
    tool returned in
    ``relpath``."""

    name: str = "read_note"

    def description(self) -> str:
        return (
            "Read a single note from the user's external "
            "knowledge base by its relative path. The "
            "``relpath`` is the same string the "
            "``list_vault_notes`` tool returned. Returns "
            "a JSON object with three keys: ``title`` "
            "(the note's title from frontmatter or the "
            "first H1), ``frontmatter`` (a dict of YAML "
            "metadata, empty if no frontmatter), and "
            "``body`` (the markdown body, with the "
            "frontmatter stripped). Read-only."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "relpath": {
                    "type": "string",
                    "description": (
                        "Relative path of the note within "
                        "the vault. Use forward slashes. "
                        "Example: ``research/transformer.md``."
                    ),
                },
            },
            "required": ["relpath"],
            "additionalProperties": False,
        }

    def execute(
        self, input: dict[str, Any], ctx: ToolContext
    ) -> str:
        backend = _get_backend(ctx)
        if backend is None:
            return _err(
                "knowledge base is not configured"
            )
        relpath = (input.get("relpath") or "").strip()
        if not relpath:
            return _err("relpath is required")
        try:
            note = backend.read_note(relpath)
        except BackendUnavailable as exc:
            return _err(f"backend unavailable: {exc}")
        if not note.body and not note.frontmatter:
            return _err(
                f"note {relpath!r} not found in the "
                f"knowledge base"
            )
        return json.dumps(
            {
                "relpath": note.relpath,
                "title": note.title,
                "frontmatter": note.frontmatter,
                "body": note.body,
            },
            ensure_ascii=False,
            indent=2,
            default=str,
        )


# ---------- 3. SearchVaultTool ----------


class SearchVaultTool:
    """Full-text search across
    the vault. The match
    is a *substring* on the
    file body and the
    title, case-insensitive.
    A semantic-search
    backend can be added
    later by implementing
    ``KnowledgeBackend.search``
    differently."""

    name: str = "search_vault"

    def description(self) -> str:
        return (
            "Search the user's external knowledge base "
            "for a substring (case-insensitive). Returns "
            "a list of notes whose body or title contains "
            "the query. Use this when the LLM needs to "
            "find a note on a specific topic -- e.g. "
            "``search_vault(\"transformer\")`` returns "
            "every note that mentions 'transformer'. "
            "Read-only."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": (
                        "Substring to search for. Case-"
                        "insensitive. Match is against "
                        "the note's body and title (not "
                        "the path)."
                    ),
                },
                "limit": {
                    "type": "integer",
                    "description": (
                        "Optional. Maximum number of "
                        "matches to return. Default 10."
                    ),
                    "default": 10,
                    "minimum": 1,
                    "maximum": 100,
                },
            },
            "required": ["query"],
            "additionalProperties": False,
        }

    def execute(
        self, input: dict[str, Any], ctx: ToolContext
    ) -> str:
        backend = _get_backend(ctx)
        if backend is None:
            return _err(
                "knowledge base is not configured"
            )
        query = (input.get("query") or "").strip()
        if not query:
            return _err("query is required")
        try:
            limit = int(input.get("limit") or 10)
        except (TypeError, ValueError):
            limit = 10
        try:
            matches = backend.search(
                query=query, limit=limit
            )
        except BackendUnavailable as exc:
            return _err(f"backend unavailable: {exc}")
        return json.dumps(
            {
                "query": query,
                "count": len(matches),
                "matches": [
                    _serialize_meta(m) for m in matches
                ],
            },
            ensure_ascii=False,
        )


# ---------- 4. RecentVaultNotesTool ----------


class RecentVaultNotesTool:
    """List the most
    recently modified
    notes. The file
    backend uses
    ``st_mtime``; the
    REST backend falls
    back to alphabetical
    order because the
    Local REST API does
    not expose per-file
    mtimes."""

    name: str = "recent_vault_notes"

    def description(self) -> str:
        return (
            "List the most recently modified notes in "
            "the user's external knowledge base. Useful "
            "when the user asks 'what did I write "
            "yesterday?' or 'show me my recent notes'. "
            "Returns the same shape as "
            "``list_vault_notes``: relative path, title, "
            "and tags. Read-only."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": (
                        "Optional. Maximum number of "
                        "notes to return. Default 10."
                    ),
                    "default": 10,
                    "minimum": 1,
                    "maximum": 100,
                },
            },
            "additionalProperties": False,
        }

    def execute(
        self, input: dict[str, Any], ctx: ToolContext
    ) -> str:
        backend = _get_backend(ctx)
        if backend is None:
            return _err(
                "knowledge base is not configured"
            )
        try:
            limit = int(input.get("limit") or 10)
        except (TypeError, ValueError):
            limit = 10
        try:
            notes = backend.recent(limit=limit)
        except BackendUnavailable as exc:
            return _err(f"backend unavailable: {exc}")
        return json.dumps(
            {
                "count": len(notes),
                "notes": [
                    _serialize_meta(m) for m in notes
                ],
            },
            ensure_ascii=False,
        )


# ---------- registry helper ----------


def register_knowledge_tools() -> list[Tool]:
    """Return the four
    knowledge tools for the
    registry.

    This list is built on
    every call (not
    module-level) so a
    test can monkey-patch
    the knowledge resolver
    without poisoning the
    rest of the test
    session. Mirrors the
    pattern used by
    ``register_inspection_tools``
    in
    ``manusift.tools.inspection``.
    """
    return [
        ListVaultNotesTool(),
        ReadNoteTool(),
        SearchVaultTool(),
        RecentVaultNotesTool(),
    ]
