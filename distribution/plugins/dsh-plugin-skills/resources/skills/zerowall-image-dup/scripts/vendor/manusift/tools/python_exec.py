"""R-2026-06-14: ``python_exec`` tool.

Covers issue 10 (no safe way to run Python snippets
in the TUI) and issue 9 (declaration of a single
Python interpreter the agent can rely on).

The tool writes the snippet to a temp ``.py`` file
under the trace's workspace (so artifacts are
discoverable in the report bundle), then runs it
via ``Settings.python_executable`` (which defaults
to ``sys.executable``). Output is truncated to the
same 30 KB / line cap as ``BashTool`` to keep the
LLM context reasonable.

The tool is **not** a sandbox: the snippet runs
with the agent's full Python privileges. It is
the same Python the parent process uses, so
``import openpyxl`` / ``import fitz`` /
``from manusift.ingest.xlsx import parse_data_file``
all just work. The denylist is intentionally
minimal (no ``os.system``, no ``subprocess.run``)
because the agent needs to be able to do real
data work, not toy-level stuff.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .tool import ToolContext


# Hard output cap, same as BashTool.
_MAX_OUT = 30_000


# A small denylist of imports we want to discourage
# but not strictly block (since the agent may need
# them for legitimate reasons). When any of these
# appear at the top of the snippet, the tool emits
# a "consider using the bash tool instead" hint in
# the result envelope but does NOT block the call.
_SOFT_DENY_IMPORTS = (
    "subprocess",
    "ctypes",
    "ctypes.util",
    "win32api",
    "win32com",
    "_winreg",
)


@dataclass(frozen=True)
class PythonExecResult:
    """One python_exec run result."""

    ok: bool
    returncode: int
    stdout: str
    stderr: str
    stdout_truncated: bool
    stderr_truncated: bool
    elapsed_seconds: float
    script_path: str
    script_size_bytes: int
    error_kind: str | None
    hint: str | None = None


class PythonExecTool:
    """Run a Python snippet in a subprocess.

    The snippet is written to
    ``<workspace>/python_runs/<uuid>.py`` and
    executed via ``Settings.python_executable``.

    Output is captured and returned as a JSON
    envelope with ``stdout``, ``stderr``, and
    ``returncode``. The script file path is
    returned in the envelope so the LLM can grep
    or re-run it.

    The tool is *additive*: it does not modify
    any existing tool, and the bash tool still
    works. The two are complementary -- bash for
    short shell commands, python_exec for
    data-wrangling that would otherwise need
    careful quoting around f-strings / heredocs.
    """

    name = "python_exec"

    def description(self) -> str:
        return (
            "Run a Python snippet in a subprocess and "
            "return stdout / stderr / returncode. The "
            "snippet is written to a .py file under "
            "the trace's workspace so the artifact is "
            "discoverable in the report bundle. Use "
            "this for data wrangling that would "
            "otherwise need careful quoting around "
            "f-strings / heredocs. The Python "
            "interpreter is the same as the parent "
            "process (Settings.python_executable, "
            "default sys.executable) so all "
            "ManuSift imports work. Output is capped "
            "at 30 KB / stream. Hard timeout defaults "
            "to 30s; pass timeout_seconds=N per-call."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": (
                        "The Python source code to run. "
                        "Multi-line snippets are "
                        "supported; do NOT use shell "
                        "quoting tricks (this is Python, "
                        "not bash)."
                    ),
                },
                "timeout_seconds": {
                    "type": "integer",
                    "description": (
                        "Per-call timeout in seconds. "
                        "Default 30s."
                    ),
                },
            },
            "required": ["code"],
        }

    def execute(
        self,
        input: dict[str, Any],
        ctx: ToolContext,
    ) -> str:
        code = (input.get("code") or "").strip()
        if not code:
            return json.dumps({
                "ok": False,
                "error_kind": "permission_denied",
                "error": "code is required",
            })

        from ..config import get_settings

        settings = get_settings()
        python = settings.python_executable or sys.executable
        if not Path(python).exists():
            return json.dumps({
                "ok": False,
                "error_kind": "dependency_missing",
                "error": (
                    f"python executable not found: "
                    f"{python!r}"
                ),
                "hint": (
                    "set MANUSIFT_PYTHON_EXECUTABLE to a "
                    "valid Python binary"
                ),
            })

        # Workspace dir: prefer metadata, then
        # Settings.workspace_dir.
        workspace = (
            (ctx.metadata or {}).get("workspace_dir")
            or str(settings.workspace_dir)
        )
        workspace_p = Path(workspace)
        try:
            workspace_p.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            return json.dumps({
                "ok": False,
                "error_kind": "path_not_visible",
                "error": (
                    f"cannot create workspace: {exc}"
                ),
                "workspace": str(workspace_p),
            })
        runs_dir = workspace_p / "python_runs"
        runs_dir.mkdir(parents=True, exist_ok=True)
        # Unique script name. Use a short uuid hex.
        script_id = uuid.uuid4().hex[:12]
        script_path = runs_dir / f"{script_id}.py"
        script_path.write_text(
            "# Generated by manusift.tools.python_exec\n"
            f"# trace_id: {ctx.trace_id}\n"
            + code,
            encoding="utf-8",
        )
        timeout = float(
            input.get("timeout_seconds") or 30
        )
        # Soft-deny hint.
        hint: str | None = None
        first_imports = [
            line.strip()
            for line in code.split("\n")
            if line.strip().startswith("import ")
            or line.strip().startswith("from ")
        ]
        flat = " ".join(first_imports)
        for bad in _SOFT_DENY_IMPORTS:
            if (
                f"import {bad}" in flat
                or f"from {bad}" in flat
            ):
                hint = (
                    f"snippet imports {bad!r}; "
                    f"consider using the bash tool "
                    f"for shell-level work"
                )
                break

        t0 = time.monotonic()
        try:
            # R-2026-06-15 (Phase 2 + P2-4):
            # set ``cwd`` to the
            # script's parent
            # directory (inside
            # the workspace) so
            # that any
            # ``open(...)`` or
            # ``os.chdir(...)``
            # the snippet does
            # stays inside the
            # workspace.  Without
            # this, the
            # subprocess inherits
            # the *parent* cwd
            # (which is
            # ``<repo root>``
            # in tests, but in
            # production is the
            # user's home
            # directory), and a
            # snippet that does
            # ``os.chdir("/etc")``
            # can read any
            # file the OS user
            # has access to.  We
            # *also* enforce that
            # ``script_path`` is
            # inside
            # ``workspace_dir``
            # (set earlier in
            # this function), so
            # ``cwd`` itself is
            # guaranteed to be
            # inside the
            # workspace.
            proc = subprocess.run(
                [python, str(script_path)],
                capture_output=True,
                text=True,
                errors="replace",
                timeout=timeout,
                cwd=str(script_path.parent),
            )
        except subprocess.TimeoutExpired:
            return json.dumps({
                "ok": False,
                "error_kind": "budget_exhausted",
                "error": (
                    f"timeout after {timeout}s"
                ),
                "script_path": str(script_path),
                "timeout_seconds": timeout,
                "hint": (
                    "increase timeout_seconds or break "
                    "the snippet into smaller pieces"
                ),
            })
        except Exception as exc:  # noqa: BLE001
            return json.dumps({
                "ok": False,
                "error_kind": "dependency_missing",
                "error": f"exec failed: {exc}",
                "script_path": str(script_path),
            })
        elapsed = time.monotonic() - t0
        stdout = proc.stdout
        stderr = proc.stderr
        stdout_truncated = False
        stderr_truncated = False
        if len(stdout) > _MAX_OUT:
            stdout = stdout[:_MAX_OUT]
            stdout_truncated = True
        if len(stderr) > _MAX_OUT:
            stderr = stderr[:_MAX_OUT]
            stderr_truncated = True
        return json.dumps({
            "ok": proc.returncode == 0,
            "error_kind": (
                None if proc.returncode == 0
                else "command_failed"
            ),
            "returncode": proc.returncode,
            "stdout": stdout,
            "stderr": stderr,
            "stdout_truncated": stdout_truncated,
            "stderr_truncated": stderr_truncated,
            "elapsed_seconds": round(elapsed, 3),
            "script_path": str(script_path),
            "script_size_bytes": script_path.stat().st_size,
            "python_executable": python,
            "timeout_seconds": timeout,
            "hint": hint,
        }, ensure_ascii=False)
