"""JSON-lines stdio tool server for the pi agent extension.

Replaces the former MCP server as the bridge between the TypeScript
pi orchestration layer and the Python Domain Kernel. One JSON object
per line on stdin; one JSON object per line on stdout.

Requests::

    {"op": "list", "id": 1}
    {"op": "call", "id": 2, "tool": "list_dir", "input": {...},
     "trace_id": "job1"}
    {"op": "shutdown"}

Responses::

    {"id": 1, "ok": true, "tools": [{"name", "description",
     "input_schema"}, ...]}
    {"id": 2, "ok": true, "result": "<tool output string>"}
    {"id": 2, "ok": false, "error": "unknown_tool: foo"}

On startup the server emits ``{"op": "ready", "tools": <count>}`` so
the client knows the (slow, see below) import phase finished.

Usage::

    python -m manusift.toolserver [--trace-id ID] [--list-tools]
"""
from __future__ import annotations

import argparse
import contextlib
import json
import logging
import os
import sys
import uuid
from typing import Any, TextIO

from .tools import ToolContext, iter_registered_tools
from .tools.registry import get_tool

log = logging.getLogger(__name__)


def _silence_stdout_leaks() -> None:
    """Keep library chatter off the JSON-lines channel (stdout).

    PyMuPDF prints a one-time layout promo via print(); other deps may
    print too. Additionally, eager-import the heavy native chain on the
    main thread: lazy numpy/scipy C-extension imports deadlock at
    create_module when triggered from worker threads on Windows
    (confirmed via faulthandler dumps in the MCP era).
    """
    try:
        import pymupdf

        pymupdf.no_recommend_layout()
    except Exception:  # noqa: BLE001
        pass
    for _mod in (
        "numpy",
        "scipy",
        "scipy.fft",
        "scipy.special",
        "imagehash",
        "cv2",
        "skimage",
        "torch",
        "easyocr",
    ):
        try:
            __import__(_mod)
        except Exception:  # noqa: BLE001
            pass
    if os.environ.get("MANUSIFT_TOOLSERVER_DEBUG"):
        import faulthandler

        faulthandler.dump_traceback_later(15, repeat=True)


def tool_schemas() -> list[dict[str, Any]]:
    """Return {name, description, input_schema} for every registered tool."""
    schemas: list[dict[str, Any]] = []
    for tool in iter_registered_tools():
        try:
            name = str(getattr(tool, "name", "") or "")
            if not name:
                continue
            try:
                desc = str(tool.description() or "")
            except Exception:  # noqa: BLE001
                desc = name
            schema: dict[str, Any]
            try:
                raw = tool.input_schema()
                schema = raw if isinstance(raw, dict) else {
                    "type": "object",
                    "properties": {},
                }
            except Exception:  # noqa: BLE001
                schema = {"type": "object", "properties": {}}
            if schema.get("type") != "object":
                schema = {
                    "type": "object",
                    "properties": schema.get("properties", {}),
                }
            schemas.append(
                {
                    "name": name,
                    "description": desc,
                    "input_schema": schema,
                }
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("skip tool for toolserver", extra={"err": str(exc)})
    return schemas


def _default_ctx(trace_id: str | None = None) -> ToolContext:
    tid = trace_id or f"pi-{uuid.uuid4().hex[:12]}"
    return ToolContext(trace_id=tid, metadata={"source": "pi"})


def _resolve_tool(name: str) -> Any:
    tool = get_tool(name)
    if tool is None:
        for t in iter_registered_tools():
            if getattr(t, "name", None) == name:
                return t
    return tool


def execute_call(
    req: dict[str, Any], base_ctx: ToolContext
) -> dict[str, Any]:
    """Execute one ``call`` request and return the response object."""
    rid = req.get("id")
    name = str(req.get("tool") or "")
    args = req.get("input")
    args = dict(args) if isinstance(args, dict) else {}
    trace_id = args.pop("trace_id", None) or req.get("trace_id") or (
        base_ctx.trace_id
    )
    run_ctx = ToolContext(
        trace_id=str(trace_id),
        current_pdf=base_ctx.current_pdf,
        metadata=dict(base_ctx.metadata) if base_ctx.metadata else {},
    )
    tool = _resolve_tool(name)
    if tool is None:
        return {"id": rid, "ok": False, "error": f"unknown_tool: {name}"}
    try:
        # Library prints must never reach the protocol channel.
        with contextlib.redirect_stdout(sys.stderr):
            result = tool.execute(args, run_ctx)
    except Exception as exc:  # noqa: BLE001
        return {
            "id": rid,
            "ok": False,
            "error": f"tool_crashed: {type(exc).__name__}: {exc}",
        }
    if not isinstance(result, str):
        try:
            result = json.dumps(result, ensure_ascii=False, default=str)
        except Exception:  # noqa: BLE001
            result = str(result)
    return {"id": rid, "ok": True, "result": result}


def serve(
    *,
    trace_id: str | None = None,
    stdin: TextIO | None = None,
    stdout: TextIO | None = None,
) -> None:
    """Blocking request/response loop (one JSON object per line)."""
    inp = stdin or sys.stdin
    out = stdout or sys.stdout

    def _send(obj: dict[str, Any]) -> None:
        out.write(json.dumps(obj, ensure_ascii=False, default=str) + "\n")
        out.flush()

    base_ctx = _default_ctx(trace_id)
    schemas = tool_schemas()
    _send({"op": "ready", "tools": len(schemas)})
    for line in inp:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except ValueError:
            _send({"id": None, "ok": False, "error": "bad_json"})
            continue
        if not isinstance(req, dict):
            _send({"id": None, "ok": False, "error": "bad_request"})
            continue
        op = str(req.get("op") or "")
        if op == "shutdown":
            break
        if op == "list":
            # Schemas can change when tools register lazily; refresh.
            schemas = tool_schemas()
            _send({"id": req.get("id"), "ok": True, "tools": schemas})
        elif op == "call":
            if os.environ.get("MANUSIFT_TOOLSERVER_DEBUG"):
                print(
                    f"[toolserver] call {req.get('tool')}",
                    file=sys.stderr,
                    flush=True,
                )
            _send(execute_call(req, base_ctx))
        else:
            _send(
                {
                    "id": req.get("id"),
                    "ok": False,
                    "error": f"unknown_op: {op}",
                }
            )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="manusift-toolserver",
        description=(
            "Expose ManuSift Domain Kernel tools over a JSON-lines "
            "stdio protocol (used by the pi agent extension)."
        ),
    )
    parser.add_argument(
        "--trace-id",
        default=None,
        help="Default trace_id / job workspace key for tool calls.",
    )
    parser.add_argument(
        "--list-tools",
        action="store_true",
        help="Print registered tool names as JSON and exit.",
    )
    args = parser.parse_args(argv)

    if args.list_tools:
        names = [s["name"] for s in tool_schemas()]
        print(json.dumps({"tools": names, "count": len(names)}, indent=2))
        return

    _silence_stdout_leaks()
    serve(trace_id=args.trace_id)


if __name__ == "__main__":
    main()
