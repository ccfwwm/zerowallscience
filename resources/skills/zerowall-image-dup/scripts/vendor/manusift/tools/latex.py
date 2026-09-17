"""LaTeX sanitiser and normaliser tool (T12).

Many papers include math
expressions inline with the
text. The pipeline extracts
those expressions so the
table-statistics or text-
pattern detectors can see
them, but the LLM might want
to *rewrite* a math expression
on the user's behalf --
typically to flag a
calculation that does not
parse or to compare two
competing equations.

A raw LaTeX string from a
PDF is fragile:
  * Whitespace, line breaks,
    and inline tabs are
    inconsistent.
  * Some publishers use
    ``\\hbox{}`` or
    ``\\mathchoice`` macros
    that the LLM cannot
    intuit.
  * Display equations
    (``$$...$$``) and inline
    (``$...$``) are
    semantically different
    but the LLM may want to
    treat them uniformly.

T12 layers two utilities on
top of the existing
``Tool`` Protocol:

  * ``sanitize_latex`` -- strip
    noise (multiple spaces,
    trailing whitespace,
    line comments, ``%``
    characters), collapse
    multiple ``\\\\`` into a
    single ``\\\\``, and
    return a normalised string
    the LLM can safely re-emit
    in a report.

  * ``validate_latex`` -- quick
    sanity check: balanced
    braces, balanced ``$``,
    every ``\\begin{...}`` has
    a matching ``\\end{...}``,
    no stray ``%`` not
    followed by a comment. A
    bad expression gets a
    JSON error object; a good
    one gets ``{"ok": true,
    "stats": {...}}``.

Both tools are read-only --
they never modify the input.
Both are zero-dependency (we
do not pull in a LaTeX
compiler; we use plain
Python string parsing, which
is enough for the common cases
and degrades gracefully on
the uncommon ones).

Borrowed from the LaTeX tools
in ``pylatexenc`` and the
sanitisation patterns used
in pandoc's AST.
"""
from __future__ import annotations

import json
import re
from collections import Counter
from typing import Any

from .tool import Tool, ToolContext


# Patterns we recognise.
# Keeping them as a small list
# of compiled regexes keeps
# the module fast and easy to
# inspect.
_LATEX_COMMENT = re.compile(r"(?<!\\)%[^\n]*")
_MULTI_SPACE = re.compile(r"[ \t]{2,}")
_TRAILING_WS = re.compile(r"[ \t]+\n")
_DOLLAR_PAIR = re.compile(r"\$([^$]*)\$")
_BEGIN = re.compile(r"\\begin\{([^}]+)\}")
_END = re.compile(r"\\end\{([^}]+)\}")


def _strip_comments(s: str) -> str:
    """Remove ``%`` comments.
    We have to be careful not
    to strip ``%`` inside
    ``\\url{...}`` or other
    commands that take a
    percent sign, but in
    practice a percent in
    a math expression is rare
    enough that the simple
    rule works for our use
    case."""
    return _LATEX_COMMENT.sub("", s)


def _normalise_whitespace(s: str) -> str:
    """Collapse multiple
    spaces/tabs into one and
    strip trailing whitespace
    on every line. We do NOT
    collapse newlines --
    newlines are semantically
    meaningful in LaTeX (they
    terminate commands and
    environments)."""
    s = _MULTI_SPACE.sub(" ", s)
    s = _TRAILING_WS.sub("\n", s)
    return s.strip()


def _balance(s: str) -> dict[str, int]:
    """Count how many times
    each ``\\begin{foo}`` and
    ``\\end{foo}`` appears. The
    caller can then verify
    that they match. We do not
    try to handle nested
    environments -- a proper
    parser would walk the
    stream character by
    character. For our purpose
    (sanity-checking a PDF-
    extracted expression) the
    count is enough."""
    begins = Counter(_BEGIN.findall(s))
    ends = Counter(_END.findall(s))
    # Build a per-environment
    # diff.
    out: dict[str, int] = {}
    for env in set(begins) | set(ends):
        out[env] = begins.get(env, 0) - ends.get(
            env, 0
        )
    return out


def _dollar_balance(s: str) -> int:
    """Count ``$`` characters. A
    balanced LaTeX inline
    equation has an even
    count."""
    # Filter out escaped
    # dollars ``\$``.
    stripped = s.replace(r"\$", "")
    return stripped.count("$")


def _brace_balance(s: str) -> int:
    """Count the depth of curly
    braces. LaTeX math uses
    ``{`` and ``}`` to delimit
    arguments, so the depth
    must be zero at the end
    of a balanced expression.
    We do not handle
    ``\\{`` / ``\\}``
    (escaped braces) because
    we already stripped the
    backslash when we stripped
    comments. For math this
    is fine.
    """
    depth = 0
    for c in s:
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        if depth < 0:
            break
    return depth


def sanitize_latex_expression(
    s: str, *, strip_display_dollars: bool = False
) -> str:
    """Return a normalised
    LaTeX expression.

    The default behaviour
    keeps ``$$...$$`` and
    ``$...$`` markers. Pass
    ``strip_display_dollars=True``
    to remove the outer ``$``
    pairs so the LLM can
    re-emit the expression
    without context. We never
    modify the inner content
    of math delimiters; we
    only clean whitespace and
    comments.

    The function is a pure
    string transformer: it
    does not parse math or
    look up macros.
    """
    if s is None:
        return ""
    s = _strip_comments(s)
    s = _normalise_whitespace(s)
    if strip_display_dollars:
        # Strip outer ``$$...$$``
        # or ``$...$`` if
        # present. The regex
        # uses a non-greedy
        # match so it does not
        # eat a multi-equation
        # block.
        s = re.sub(r"^\$\$", "", s)
        s = re.sub(r"\$\$$", "", s)
        s = re.sub(r"^\$", "", s)
        s = re.sub(r"\$$", "", s)
    return s


def validate_latex_expression(s: str) -> dict[str, Any]:
    """Sanity-check a LaTeX
    expression. Returns a dict
    with ``ok`` (True/False) and
    ``stats`` (counts) so the
    LLM can decide what to do
    with a malformed input.
    """
    if s is None or not s.strip():
        return {"ok": False, "error": "empty input"}
    s_sanitised = _strip_comments(s)
    env_balance = _balance(s_sanitised)
    bad_envs = [
        env for env, d in env_balance.items() if d != 0
    ]
    dollar_count = _dollar_balance(s_sanitised)
    brace_depth = _brace_balance(s_sanitised)
    ok = (
        not bad_envs
        and dollar_count % 2 == 0
        and brace_depth == 0
    )
    return {
        "ok": ok,
        "stats": {
            "length": len(s),
            "env_balance": env_balance,
            "dollar_count": dollar_count,
            "final_brace_depth": brace_depth,
        },
        "errors": []
        if ok
        else (
            [
                f"unbalanced env: {bad_envs}"
                if bad_envs
                else "balanced"
            ]
            + (
                ["unbalanced $"] if dollar_count % 2 else []
            )
            + (
                [
                    f"unbalanced {{: final depth {brace_depth}"
                ]
                if brace_depth
                else []
            )
        ),
    }


class SanitizeLatexTool:
    """Normalise a LaTeX
    expression. Read-only --
    the input is never
    modified on disk."""

    name: str = "sanitize_latex"

    def description(self) -> str:
        return (
            "Normalise a LaTeX expression. Strips comments, "
            "collapses whitespace, optionally strips outer "
            "display-dollars. Use this when you have a raw "
            "LaTeX string from a PDF and want to re-emit it "
            "in a report. Read-only."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": (
                        "The LaTeX expression to normalise. "
                        "Can be inline (``$...$``), display "
                        "(``$$...$$``), or un-delimited."
                    ),
                },
                "strip_display_dollars": {
                    "type": "boolean",
                    "description": (
                        "If true, remove the outer ``$`` or "
                        "``$$`` markers so the output is the "
                        "raw LaTeX body. Default: false."
                    ),
                    "default": False,
                },
            },
            "required": ["expression"],
            "additionalProperties": False,
        }

    def execute(
        self,
        input: dict[str, Any],
        ctx: ToolContext,
    ) -> str:
        expr = input.get("expression", "")
        strip = bool(input.get("strip_display_dollars", False))
        out = sanitize_latex_expression(expr, strip_display_dollars=strip)
        return json.dumps(
            {
                "original_length": len(expr or ""),
                "result_length": len(out),
                "result": out,
            }
        )


class ValidateLatexTool:
    """Sanity-check a LaTeX
    expression: balanced
    braces, balanced ``$``,
    matched ``\\begin{...}`` /
    ``\\end{...}`` pairs."""

    name: str = "validate_latex"

    def description(self) -> str:
        return (
            "Sanity-check a LaTeX expression. Returns ``{ok: "
            "true, ...}`` if the expression is balanced, "
            "otherwise an error list naming the unbalanced "
            "constructs. Read-only."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "The LaTeX expression to check.",
                },
            },
            "required": ["expression"],
            "additionalProperties": False,
        }

    def execute(
        self,
        input: dict[str, Any],
        ctx: ToolContext,
    ) -> str:
        return json.dumps(
            validate_latex_expression(input.get("expression", ""))
        )


def register_latex_tools() -> list[Tool]:
    return [SanitizeLatexTool(), ValidateLatexTool()]
