#!/usr/bin/env python3
"""Minimal local Python kernel for the ZeroWall Science notebook.

A persistent process that holds one namespace across cells (shared state, like a
Jupyter kernel) and speaks a line-delimited JSON protocol over stdin/stdout:

    request : {"id": "<str>", "code": "<str>"}\\n
    response: {"id","ok","stdout","result","error","image","truncated"}\\n

Standard library only — no ipykernel/ZMQ — so it runs against whatever Python the
user has, offline, with no model key. `result` mirrors Jupyter: the repr of the
final expression when a cell ends in one, else null. `image` is a base64 PNG when
the cell left a matplotlib figure open.

The protocol stream is PRIVATE. Cell output cannot reach it: fd 1 is duplicated
to a reserved descriptor at startup and every response is written there, while
fd 1 itself is redirected into the cell's capture buffer. A cell that spawns a
subprocess, or writes to fd 1 directly, therefore produces cell output — not a
corrupt response line that would desynchronize the host and cost the user their
whole session state.
"""
import ast
import base64
import io
import json
import os
import sys
import tempfile
import traceback
from contextlib import redirect_stderr, redirect_stdout

# Cap on a single cell's captured output. A runaway loop otherwise builds one
# unbounded JSON line (a `for i in range(200000): print(i)` cell measured
# 1.3 MB), which the host must buffer whole before the user sees anything.
MAX_OUTPUT_CHARS = 200_000

# Cap on an emitted figure. Beyond this the PNG is dropped rather than sent —
# the response is one line, and a huge image would stall the notebook.
MAX_IMAGE_BYTES = 4_000_000


def _truncate(text: str) -> tuple[str, bool]:
    """Clip captured output to MAX_OUTPUT_CHARS, keeping the head and tail."""
    if len(text) <= MAX_OUTPUT_CHARS:
        return text, False
    keep = MAX_OUTPUT_CHARS // 2
    dropped = len(text) - 2 * keep
    return f"{text[:keep]}\n... [{dropped} characters omitted] ...\n{text[-keep:]}", True


def capture_figure() -> str | None:
    """Base64 PNG of the current matplotlib figure, if a cell left one open.

    Matplotlib is optional and often absent; importing it must never be an
    error. Only an already-imported module is inspected — importing it here
    would cost seconds on the first cell of every session, and a user who
    never plots should not pay that.
    """
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is None:
        return None
    try:
        if not plt.get_fignums():
            return None
        buf = io.BytesIO()
        plt.savefig(buf, format="png", bbox_inches="tight", dpi=110)
        plt.close("all")  # Jupyter semantics: a shown figure is consumed
        raw = buf.getvalue()
        if len(raw) > MAX_IMAGE_BYTES:
            return None
        return base64.b64encode(raw).decode("ascii")
    except Exception:
        # A broken backend must not fail the cell — the user's code ran fine.
        return None


def run_cell(ns: dict, code: str):
    """Execute `code` in namespace `ns`.

    Returns (stdout, result_repr_or_None, error_or_None, image_or_None,
    truncated). Output written to fd 1 by a subprocess is captured too, via
    the temporary file fd 1 points at for the duration of the cell.
    """
    out = io.StringIO()
    try:
        parsed = ast.parse(code, mode="exec")
    except SyntaxError:
        return "", None, traceback.format_exc(limit=1), None, False

    body = parsed.body
    result = None
    # Jupyter behaviour: if the cell ends in an expression, show its value.
    tail_expr = None
    if body and isinstance(body[-1], ast.Expr):
        last = body.pop()
        assert isinstance(last, ast.Expr)
        tail_expr = ast.Expression(last.value)

    error = None
    with tempfile.TemporaryFile(mode="w+b") as sink:
        # Point the real fd 1 and fd 2 at the sink for the duration of the
        # cell, so a subprocess (which inherits descriptors, not sys.stdout)
        # writes into the cell's output instead of into the protocol stream.
        saved = os.dup(1), os.dup(2)
        try:
            os.dup2(sink.fileno(), 1)
            os.dup2(sink.fileno(), 2)
            try:
                with redirect_stdout(out), redirect_stderr(out):
                    if body:
                        exec(compile(ast.Module(body, []), "<cell>", "exec"), ns)  # noqa: S102
                    if tail_expr is not None:
                        value = eval(compile(tail_expr, "<cell>", "eval"), ns)  # noqa: S307
                        if value is not None:
                            result = repr(value)
            except BaseException:  # noqa: BLE001 - report, never kill the kernel
                # Catches SystemExit/KeyboardInterrupt too: `sys.exit()` in a
                # cell must end the cell, not the session.
                error = traceback.format_exc()
        finally:
            os.dup2(saved[0], 1)
            os.dup2(saved[1], 2)
            os.close(saved[0])
            os.close(saved[1])
        sink.seek(0)
        raw = sink.read().decode("utf-8", "replace")

    # Anything a child process wrote lands after this cell's own prints.
    text, truncated = _truncate(out.getvalue() + raw)
    return text, result, error, capture_figure(), truncated


def main() -> None:
    # Reserve a private copy of fd 1 for the protocol BEFORE any cell runs,
    # then hand the original fd 1 over to cell capture. Everything the host
    # reads is written to this descriptor and nothing else can reach it.
    protocol_fd = os.dup(1)
    protocol = os.fdopen(protocol_fd, "w", encoding="utf-8", newline="\n")

    # Force UTF-8 on the stdio protocol regardless of the OS locale. On Windows,
    # piped stdin defaults to the ANSI code page (e.g. cp936/GBK), which
    # corrupts non-ASCII source like `print("中文")` before it is executed.
    reconfigure = getattr(sys.stdin, "reconfigure", None)
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
        stdout, result, error, image, truncated = run_cell(ns, req.get("code", ""))
        resp = {
            "id": req.get("id"),
            "ok": error is None,
            "stdout": stdout,
            "result": result,
            "error": error,
            "image": image,
            "truncated": truncated,
        }
        # ensure_ascii keeps the line 7-bit clean, so the host never depends on
        # the pipe's encoding to frame a response.
        protocol.write(json.dumps(resp, ensure_ascii=True) + "\n")
        protocol.flush()


if __name__ == "__main__":
    main()
