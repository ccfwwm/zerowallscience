#!/usr/bin/env python3
"""Minimal local Python kernel for the ZeroWall Science notebook.

A persistent process that holds one namespace across cells (shared state, like a
Jupyter kernel) and speaks a line-delimited JSON protocol over stdin/stdout:

    request : {"id": "<str>", "code": "<str>"}\\n
    response: {"id","ok","stdout","result","error"}\\n

Standard library only — no ipykernel/ZMQ — so it runs against whatever Python the
user has, offline, with no model key. `result` mirrors Jupyter: the repr of the
final expression when a cell ends in one, else null.
"""
import ast
import io
import json
import sys
import traceback
from contextlib import redirect_stderr, redirect_stdout


def run_cell(ns: dict, code: str):
    """Execute `code` in namespace `ns`. Returns (stdout, result_repr_or_None, error_or_None)."""
    out = io.StringIO()
    try:
        parsed = ast.parse(code, mode="exec")
    except SyntaxError:
        return "", None, traceback.format_exc(limit=1)

    body = parsed.body
    result = None
    # Jupyter behaviour: if the cell ends in an expression, show its value.
    tail_expr = None
    if body and isinstance(body[-1], ast.Expr):
        last = body.pop()
        assert isinstance(last, ast.Expr)
        tail_expr = ast.Expression(last.value)

    try:
        with redirect_stdout(out), redirect_stderr(out):
            if body:
                exec(compile(ast.Module(body, []), "<cell>", "exec"), ns)  # noqa: S102
            if tail_expr is not None:
                value = eval(compile(tail_expr, "<cell>", "eval"), ns)  # noqa: S307
                if value is not None:
                    result = repr(value)
    except Exception:  # surface the traceback to the notebook, like a kernel does
        return out.getvalue(), None, traceback.format_exc()

    return out.getvalue(), result, None


def main() -> None:
    # Force UTF-8 on the stdio protocol regardless of the OS locale. On Windows,
    # piped stdin/stdout default to the ANSI code page (e.g. cp936/GBK), which
    # corrupts non-ASCII source like `print("中文")` before it is executed. This
    # is self-contained (independent of how the process is spawned); a no-op
    # where stdio is already UTF-8.
    for stream in (sys.stdin, sys.stdout):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8")

    ns: dict = {"__name__": "__main__"}
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue
        stdout, result, error = run_cell(ns, req.get("code", ""))
        resp = {
            "id": req.get("id"),
            "ok": error is None,
            "stdout": stdout,
            "result": result,
            "error": error,
        }
        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
