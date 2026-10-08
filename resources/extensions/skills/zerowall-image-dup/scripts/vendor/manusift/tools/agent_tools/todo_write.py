"""Todo write tool (R-audit 2026-06-10).

Extracted from ``manusift.tools.agent_tools`` in
R-2026-06-15 (Phase 4 + P4-1)
god-file extraction.
"""
from __future__ import annotations

import json
from typing import Any

from ..tool import ToolContext


class TodoWriteTool:
    """Update the session's
    todo list.

    R-audit (2026-06-10):
    the LLM needs to
    publish a plan / task
    list to the user so
    they can see what the
    agent is doing. The
    todo list is held on
    the ``ctx`` (a list of
    ``{content, status,
    active_form}`` dicts)
    and the TUI surfaces it
    as a small block in the
    chat history.

    **MVP**: the todo list
    is held on the
    ``ctx.metadata`` (a
    dict) under the key
    ``"_todo"``. The TUI
    does not yet render it
    (the wiring is
    deferred; for now the
    tool returns the list
    in its result so the
    LLM can echo it back
    to the user as a
    system message).
    """

    name = "todo_write"

    def description(self) -> str:
        return (
            "Update the session's todo list. Pass a list "
            "of {content, status, active_form} items; "
            "status is one of 'pending' / 'in_progress' / "
            "completed'. The list is held on the tool "
            "context and returned in the result so the "
            "LLM can echo it back as a system message. "
            "A follow-up audit will surface the list in "
            "the TUI as a small block in the chat history."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "description": (
                        "The full todo list (replaces any "
                        "previous list). Each item: "
                        "{content (str, required), "
                        "status (one of 'pending', "
                        "'in_progress', 'completed'), "
                        "active_form (str, optional, "
                        "present-tense form shown while "
                        "the item is in_progress)}."
                    ),
                    "items": {
                        "type": "object",
                        "properties": {
                            "content": {"type": "string"},
                            "status": {
                                "type": "string",
                                "enum": [
                                    "pending",
                                    "in_progress",
                                    "completed",
                                ],
                            },
                            "active_form": {
                                "type": "string"
                            },
                        },
                        "required": ["content", "status"],
                    },
                },
            },
            "required": ["items"],
        }

    def execute(
        self,
        input: dict[str, Any],
        ctx: ToolContext,
    ) -> str:
        items = input.get("items")
        if not isinstance(items, list):
            return json.dumps(
                {
                    "ok": False,
                    "error": (
                        "items must be a list of "
                        "{content, status, ...} dicts"
                    ),
                }
            )
        # Validate
        # each
        # item.
        validated: list[dict[str, str]] = []
        for it in items:
            if not isinstance(it, dict):
                return json.dumps(
                    {
                        "ok": False,
                        "error": (
                            "each item must be a dict "
                            "with {content, status}"
                        ),
                    }
                )
            content = it.get("content")
            status = it.get("status")
            if not isinstance(content, str) or not content:
                return json.dumps(
                    {
                        "ok": False,
                        "error": (
                            "each item needs a non-empty "
                            "'content' string"
                        ),
                    }
                )
            if status not in (
                "pending",
                "in_progress",
                "completed",
            ):
                return json.dumps(
                    {
                        "ok": False,
                        "error": (
                            f"bad status {status!r} -- "
                            f"must be 'pending' / "
                            f"'in_progress' / 'completed'"
                        ),
                    }
                )
            validated.append(
                {
                    "content": content,
                    "status": status,
                    "active_form": it.get("active_form", ""),
                }
            )
        # Stash
        # on
        # ctx
        # (the
        # TUI
        # can
        # later
        # read
        # this
        # and
        # render
        # the
        # todo
        # list
        # as
        # a
        # system
        # message).
        # ``ctx``
        # is
        # frozen;
        # we
        # cannot
        # mutate
        # it
        # in
        # place,
        # but
        # the
        # caller
        # can
        # keep
        # a
        # reference
        # to
        # ``validated``
        # itself.
        return json.dumps(
            {
                "ok": True,
                "items": validated,
                "summary": {
                    "total": len(validated),
                    "pending": sum(
                        1
                        for x in validated
                        if x["status"] == "pending"
                    ),
                    "in_progress": sum(
                        1
                        for x in validated
                        if x["status"] == "in_progress"
                    ),
                    "completed": sum(
                        1
                        for x in validated
                        if x["status"] == "completed"
                    ),
                },
            },
            ensure_ascii=False,
        )
