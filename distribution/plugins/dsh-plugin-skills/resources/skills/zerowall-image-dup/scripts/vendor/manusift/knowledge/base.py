"""Knowledge-backend Protocol (E-audit, 2026-06).

The end-to-end audit found
that host agents (and the
removed chat TUI) had no
way to consult a user's
external knowledge base --
detector output and the
LLM's prior context were
the only sources available
when reasoning about a paper.

This module defines the
*protocol* that any
knowledge backend must
satisfy so the LLM-facing
tools in
``manusift/tools/knowledge.py``
can talk to either
filesystem-based
(``obsidian_files.py``) or
REST-based
(``obsidian_rest.py``)
backends through one
interface.

The split is borrowed from
the existing
``Detector`` / ``Tool``
Protocol pattern in
``manusift/detectors/base.py``
and
``manusift/tools/tool.py``.
Backends are
duck-typed: any class
with the right method
names qualifies. We do
NOT use an ``ABC`` base
class so third-party
plugins (e.g. a Notion or
Roam backend) can be
added by implementing
the four methods without
importing a Manusift
internal.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable


@dataclass(frozen=True)
class NoteMeta:
    """Lightweight summary
    of a note in a
    knowledge base.

    The ``relpath`` is the
    *relative* path of the
    note inside the
    knowledge base, e.g.
    ``research/transformer.md``.
    The full path is the
    backend's concern --
    the tools only need
    the relative form to
    pass back to
    ``read_note``.

    ``tags`` is a flat list
    of strings parsed from
    the note's frontmatter
    (YAML ``tags: [...]`` or
    inline ``#tag``). An
    empty list means the
    note has no tags.

    ``mtime`` is the file's
    modification time as a
    Unix timestamp. The
    ``recent_vault_notes``
    tool sorts by this
    field.
    """

    relpath: str
    title: str
    tags: list[str] = field(default_factory=list)
    mtime: float = 0.0


@dataclass(frozen=True)
class NoteContent:
    """Full content of a
    single note.

    ``frontmatter`` is a
    free-form dict parsed
    from the YAML block at
    the top of the file
    (empty dict if no
    frontmatter). ``body``
    is the markdown body
    with the frontmatter
    stripped.

    ``relpath`` echoes the
    argument the caller
    passed so the LLM can
    cross-reference.
    """

    relpath: str
    title: str
    frontmatter: dict[str, Any] = field(
        default_factory=dict
    )
    body: str = ""


@runtime_checkable
class KnowledgeBackend(Protocol):
    """The contract every
    knowledge backend must
    satisfy.

    The four methods map
    one-to-one to the four
    LLM-facing tools in
    ``manusift/tools/knowledge.py``:

      * ``list_notes`` -->
        ``list_vault_notes``
      * ``read_note`` -->
        ``read_note``
      * ``search`` -->
        ``search_vault``
      * ``recent`` -->
        ``recent_vault_notes``

    A backend can choose to
    be strict (raise
    ``BackendUnavailable``
    on a missing
    configuration) or
    silent (return an
    empty list with a
    ``{"error": "..."}``
    result). The tools
    expect *silent* failure
    so a misconfigured
    backend does not break
    the agent loop --
    the LLM gets a JSON
    error and the user
    sees a system message
    in the chat.
    """

    name: str

    def list_notes(
        self, folder: str = ""
    ) -> list[NoteMeta]:
        """List every note under
        ``folder`` (empty
        folder = the entire
        knowledge base)."""
        ...

    def read_note(
        self, relpath: str
    ) -> NoteContent:
        """Read one note by
        relative path. The
        backend must return
        a ``NoteContent`` even
        if the file is
        missing -- with
        ``body=""`` and
        ``title=relpath`` so
        the tool can render a
        clean ``{"error": ...}``
        JSON to the LLM."""
        ...

    def search(
        self, query: str, limit: int = 10
    ) -> list[NoteMeta]:
        """Full-text search.

        The contract is a
        *substring match* on
        the body and tags
        (case-insensitive).
        We deliberately do
        not require a vector
        search: a substring
        match is enough to
        answer "find my notes
        that mention
        X" 99% of the time,
        and a vector search
        needs an embedding
        model and an index
        file -- both of
        which are evidence-
        driven additions the
        user can opt into
        later."""
        ...

    def recent(
        self, limit: int = 10
    ) -> list[NoteMeta]:
        """Return the most
        recently modified
        notes, newest first.
        A backend that cannot
        determine mtime
        (e.g. a no-filesystem
        REST API without a
        ``mtime`` field)
        should return notes
        in an arbitrary order
        -- the tools degrade
        gracefully.
        """
        ...


class BackendUnavailable(Exception):
    """Raised by a backend
    when its configuration
    is missing or its
    dependency failed to
    load. The
    ``manusift.tools.knowledge``
    wrappers catch this and
    return a JSON error so
    the LLM sees a clean
    error message rather
    than a stack trace."""

    pass
