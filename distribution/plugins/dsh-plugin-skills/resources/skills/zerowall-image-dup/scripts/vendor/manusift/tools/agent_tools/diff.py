"""R-2026-06-19 (P2-B5):
inline
``diff``
tool.

Claude Code
has both an
``Edit`` /
``Write``
tool
*and* a
``diff``
viewer
that shows
inline
unified
diffs. The
write tools
are
destructive
(they
mutate the
user's
files)
and are out
of scope
for
ManuSift's
read-only
forensic
screener
(this is
hard-coded
in
``manusift.yaml``).
The ``diff``
viewer, on
the other
hand, is a
*read-only*
convenience:
the user
(LLM or
human)
asks "what
would
change if
I replaced
this
string
with that
string?" and
the tool
returns
the
unified
diff.

Two
modes:

  * ``path_a``
    +
    ``path_b``:
    diff two
    files on
    disk
    (e.g.
    before /
    after a
    backup).
  * ``path``
    +
    ``new_content``:
    diff a
    file
    against
    an
    in-memory
    string
    (e.g.
    "what
    would
    this
    proposed
    edit
    change?").

Output is
a
unified-diff
text
block
(prefixed
with
``---`` /
``+++`` /
``@@`` /
``+`` /
``-``).
The TUI
ToolCallCard
renders
this in
the body
section
as a
monospace
block.

The tool is
opt-in:
the
``agent_tools``
plugin
loader picks
it up via
the standard
``Tool``
Protocol
(see
``manusift/tools/tool.py``)
but
``detector_catalog.py``
does NOT
register it
for forensic
runs (a
forensic
run on a
paper does
not need a
diff tool).
"""
from __future__ import annotations

import difflib
import json
from pathlib import Path
from typing import Any

from ..tool import Tool, ToolContext


class DiffTool:
    """Unified-diff viewer (read-only).

    R-2026-06-19 (P2-B5):
    borrowed from
    Claude Code's
    ``Edit`` /
    ``Write``
    tool's inline
    diff
    rendering.
    The
    destructive
    write path is
    NOT exposed
    here -- only
    the
    *preview*
    (read-only)
    of what a
    proposed
    change
    would
    look like.
    The user
    runs the
    edit
    out-of-band
    (in their
    editor /
    via a
    version
    control
    command).

    Two modes
    (selected
    by which
    keys the
    caller
    passes):

      * ``path_a``
        +
        ``path_b``:
        diff two
        files on
        disk.
      * ``path`` +
        ``new_content``:
        diff a
        file on
        disk
        against
        an
        in-memory
        string.

    Output is
    the
    ``unified_diff``
    text (no
    styling
    -- the
    TUI
    renders
    the
    ``+`` /
    ``-``
    prefixes
    in
    green /
    red via
    Rich
    later).
    """

    name = "diff"

    def description(self) -> str:
        return (
            "Show a unified diff between two files on disk "
            "(`path_a` + `path_b`) or between a file and an "
            "in-memory string (`path` + `new_content`). "
            "Read-only: the tool never mutates the user's "
            "files. Returns a unified-diff text block "
            "(prefixed with `---` / `+++` / `@@` / `+` / `-`). "
            "Useful for previewing a proposed edit before "
            "applying it manually."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path_a": {
                    "type": "string",
                    "description": (
                        "First file path. Required when "
                        "comparing two files."
                    ),
                },
                "path_b": {
                    "type": "string",
                    "description": (
                        "Second file path. Required when "
                        "comparing two files."
                    ),
                },
                "path": {
                    "type": "string",
                    "description": (
                        "File path. Required when comparing "
                        "a file against an in-memory string "
                        "(`new_content`)."
                    ),
                },
                "new_content": {
                    "type": "string",
                    "description": (
                        "The proposed new content. Required "
                        "when `path` is set."
                    ),
                },
                "fromfile": {
                    "type": "string",
                    "description": (
                        "Label for the first side in the "
                        "diff header (default: `path_a` or "
                        "`path`)."
                    ),
                },
                "tofile": {
                    "type": "string",
                    "description": (
                        "Label for the second side in the "
                        "diff header (default: `path_b` or "
                        "`<path> (proposed)`)."
                    ),
                },
                "context_lines": {
                    "type": "integer",
                    "description": (
                        "Number of context lines to show "
                        "around each hunk (default 3)."
                    ),
                },
            },
        }

    def execute(
        self,
        input: dict[str, Any],
        ctx: ToolContext,
    ) -> str:
        path_a = (input.get("path_a") or "").strip()
        path_b = (input.get("path_b") or "").strip()
        path = (input.get("path") or "").strip()
        new_content = input.get("new_content")
        fromfile = (
            (input.get("fromfile") or "").strip()
            or (path_a or path or "a")
        )
        tofile = (
            (input.get("tofile") or "").strip()
            or (path_b or (f"{path} (proposed)" if path else "b"))
        )
        try:
            n = int(input.get("context_lines") or 3)
        except (TypeError, ValueError):
            n = 3
        n = max(0, min(n, 50))

        # Mode 1:
        # two
        # files.
        if path_a and path_b:
            pa = Path(path_a)
            pb = Path(path_b)
            if not pa.is_file():
                return json.dumps(
                    {
                        "ok": False,
                        "error_kind": "argument_invalid",
                        "error": (
                            f"path_a is not a file: "
                            f"{path_a}"
                        ),
                    }
                )
            if not pb.is_file():
                return json.dumps(
                    {
                        "ok": False,
                        "error_kind": "argument_invalid",
                        "error": (
                            f"path_b is not a file: "
                            f"{path_b}"
                        ),
                    }
                )
            try:
                a = pa.read_text(
                    encoding="utf-8", errors="replace"
                )
                b = pb.read_text(
                    encoding="utf-8", errors="replace"
                )
            except OSError as exc:
                return json.dumps(
                    {
                        "ok": False,
                        "error_kind": "io_error",
                        "error": f"read failed: {exc}",
                    }
                )
        # Mode 2:
        # file
        # vs
        # in-memory
        # string.
        elif path and isinstance(new_content, str):
            pa = Path(path)
            if not pa.is_file():
                return json.dumps(
                    {
                        "ok": False,
                        "error_kind": "argument_invalid",
                        "error": (
                            f"path is not a file: {path}"
                        ),
                    }
                )
            try:
                a = pa.read_text(
                    encoding="utf-8", errors="replace"
                )
            except OSError as exc:
                return json.dumps(
                    {
                        "ok": False,
                        "error_kind": "io_error",
                        "error": f"read failed: {exc}",
                    }
                )
            b = new_content
        else:
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "argument_invalid",
                    "error": (
                        "provide either (path_a + path_b) "
                        "or (path + new_content)"
                    ),
                }
            )

        # Build
        # the
        # unified
        # diff.
        # ``splitlines(keepends=True)``
        # preserves
        # trailing
        # ``\n``
        # so the
        # diff
        # output
        # matches
        # ``diff -u``.
        a_lines = a.splitlines(keepends=True)
        b_lines = b.splitlines(keepends=True)
        # ``unified_diff``
        # is a
        # generator;
        # join
        # it.
        diff_iter = difflib.unified_diff(
            a_lines,
            b_lines,
            fromfile=fromfile,
            tofile=tofile,
            n=n,
        )
        diff_text = "".join(diff_iter)
        # Always
        # return
        # an
        # envelope
        # so the
        # caller
        # knows
        # the
        # tool
        # ran
        # (even
        # when
        # the
        # diff
        # is
        # empty).
        return json.dumps(
            {
                "ok": True,
                "diff": diff_text,
                "fromfile": fromfile,
                "tofile": tofile,
                "is_empty": diff_text == "",
                "n_added": sum(
                    1 for line in diff_text.splitlines()
                    if line.startswith("+")
                    and not line.startswith("+++")
                ),
                "n_removed": sum(
                    1 for line in diff_text.splitlines()
                    if line.startswith("-")
                    and not line.startswith("---")
                ),
            },
            ensure_ascii=False,
        )
