"""Web fetch tool (R-audit 2026-06-10).

Extracted from ``manusift.tools.agent_tools`` in
R-2026-06-15 (Phase 4 + P4-1)
god-file extraction.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
from typing import Any

from ..tool import Tool, ToolContext

_MAX_FETCH_BYTES = 50 * 1024


class WebFetchTool:
    """Fetch a URL and return
    its plain-text content.

    R-audit (2026-06-10):
    the existing tooling
    lets the LLM pick up
    *local* files via
    ``read_file``. To read
    *remote* content (the
    abstract page of a
    paper, a GitHub
    issue, a blog post)
    we need an HTTP client
    with the same
    plain-text extraction
    + size cap discipline.
    """

    name = "web_fetch"

    def description(self) -> str:
        return (
            "Fetch a URL and return the page's plain-text "
            "content. Capped at 50 KB. Use this to read a "
            "specific web page (paper abstract, blog post, "
            "GitHub issue, etc.) without having to "
            "web_search first."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": (
                        "The URL to fetch. Must be http:// "
                        "or https://."
                    ),
                },
            },
            "required": ["url"],
        }

    def execute(
        self,
        input: dict[str, Any],
        ctx: ToolContext,
    ) -> str:
        url = (input.get("url") or "").strip()
        if not url:
            return json.dumps(
                {"ok": False, "error": "url is required"}
            )
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return json.dumps(
                {
                    "ok": False,
                    "error": (
                        f"unsupported scheme {parsed.scheme!r}, "
                        f"only http/https"
                    ),
                }
            )
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 ManuSift-WebFetch/1.0"
                    )
                },
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                ctype = resp.headers.get(
                    "Content-Type", ""
                ).lower()
                raw = resp.read(_MAX_FETCH_BYTES + 1)
                truncated = len(raw) > _MAX_FETCH_BYTES
                if truncated:
                    raw = raw[:_MAX_FETCH_BYTES]
        except Exception as exc:  # noqa: BLE001
            return json.dumps(
                {"ok": False, "error": f"fetch failed: {exc}"}
            )
        # Decode
        # (try
        # utf-8
        # first,
        # fall
        # back
        # to
        # latin-1).
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            text = raw.decode("latin-1", errors="ignore")
        # If
        # HTML,
        # strip
        # tags
        # to
        # plaintext.
        if "html" in ctype or "<html" in text.lower():
            text = re.sub(
                r"<script[^>]*>.*?</script>",
                " ",
                text,
                flags=re.DOTALL | re.IGNORECASE,
            )
            text = re.sub(
                r"<style[^>]*>.*?</style>",
                " ",
                text,
                flags=re.DOTALL | re.IGNORECASE,
            )
            text = re.sub(
                r"<[^>]+>", " ", text
            )
            text = re.sub(r"\s+", " ", text).strip()
        return json.dumps(
            {
                "ok": True,
                "url": url,
                "content_type": ctype,
                "truncated": truncated,
                "size": len(raw),
                "text": text,
            },
            ensure_ascii=False,
        )


# ============================================================
# 3. bash (with safety blocklist)
# ============================================================


# R-2026-06-15 (Phase 0+1 + P1-15):
# the legacy
# ``_BASH_DENY_PATTERNS`` table
# below was the 2-state
# blocklist (regex pattern ->
# human reason).  It was
# replaced by
# ``classify_command`` in
# ``manusift/tools/safety.py``
# (a 3-state classifier
# ``safe / needs_confirm /
# block`` that handles
# variable expansion, pipeline
# splitting, and PowerShell).
# The classify_command call
# lives in
# ``BashTool.execute`` (line
# 940+).  The legacy table is
# removed; if a future PR adds
# a deny rule, it must go
# into
# ``manusift/tools/safety.py``
# ``_SHELL_DENY_RULES`` (the
# single source of truth).  A
# grep test
# (tests/test_phase0_p115.py)
# guards against the legacy
# table re-appearing.


SHELL_MODES = ("auto", "posix", "cmd", "powershell")


def _filter_tools_by_role(
    tools: list[Any],
    role: str | None,
) -> list[Any]:
    """R-2026-06-15 (Phase 0.8):
    Apply a per-role tool
    filter.

    The contract:

      * ``role="leaf"`` --
        default; strips
        ``TaskTool`` from
        the sub-agent's
        tool list so the
        sub-agent cannot
        recursively spawn
        sub-sub-agents.
      * ``role="orchestrator"`` --
        the sub-agent
        keeps the full
        tool list (it
        can delegate
        further).
      * ``role=None`` or
        missing -- the
        safe default
        (``"leaf"``).
      * Unknown role --
        returns an empty
        list (the caller is
        responsible for
        emitting the
        typed
        ``not_applicable``
        error).
    """
    if role is None or role == "":
        role = "leaf"
    if role == "orchestrator":
        return list(tools)
    if role == "leaf":
        return [
            t
            for t in tools
            if getattr(t, "name", "") != "task"
        ]
    # Unknown role:
    # return an empty list.
    return []


def _shell_command_args(
    command: str,
) -> tuple[list[str] | str, bool, str]:
    """Build a shell invocation.

    R-2026-06-14: the previous implementation only
    tried ``bash`` and then ``powershell``. On Windows
    without bash, every LLM-generated ``echo $foo``
    / ``export X=Y`` / heredoc / ``&&`` chain
    produced a confusing error from PowerShell, which
    silently re-quoted ``$``/``{}``/``%`` and stripped
    the heredoc, so the LLM kept retrying with
    ever-worse quoting.

    We now honour an optional ``MANUSIFT_SHELL_MODE``
    env override:

      ``auto``       : try ``bash`` first, then
                       ``cmd.exe``, then ``powershell``
                       (default; matches the user's
                       shell capability).
      ``posix``      : require ``bash``; deny anything
                       else with a typed error.
      ``cmd``        : always use ``cmd.exe /c``.
                       Cheapest fallback for Windows
                       LLMs that target CMD syntax
                       (``set X=Y``, ``dir``,
                       ``&&`` chains).
      ``powershell`` : always use ``powershell -NoProfile
                       -ExecutionPolicy Bypass -Command``.
                       PowerShell-only features
                       (``$env:X``, ``Get-ChildItem``,
                       here-strings) work; LLM bash
                       style does not.

    The returned tuple is
    ``(args, use_shell, shell_mode)``
    where ``shell_mode`` is one of
    ``"bash" | "cmd" | "powershell" | "shell"``.
    R-2026-06-15 (Phase 0+1 + P0-1):
    the third element was added so
    the bash tool can record *which*
    shell actually ran the command
    in the result envelope
    (Hyrum's-Law trap: the LLM
    believed the result was from
    bash when it was from
    PowerShell, and kept retrying
    with ever-worse quoting).
    """
    mode = os.environ.get(
        "MANUSIFT_SHELL_MODE", "auto"
    ).strip().lower() or "auto"
    if mode not in SHELL_MODES:
        mode = "auto"

    def _try_bash() -> list[str] | None:
        bash = shutil.which("bash")
        if not bash:
            return None
        try:
            probe = subprocess.run(
                [bash, "-lc", ":"],
                capture_output=True,
                timeout=2,
                text=True,
                errors="replace",
            )
            if probe.returncode == 0:
                return [bash, "-lc", command]
        except Exception:  # noqa: BLE001
            return None
        return None

    def _try_cmd() -> list[str] | None:
        if sys.platform != "win32":
            return None
        # ``cmd`` is always present on Windows.
        return ["cmd.exe", "/c", command]

    def _try_powershell() -> list[str] | None:
        if sys.platform != "win32":
            return None
        ps = shutil.which("powershell") or shutil.which(
            "pwsh"
        )
        if not ps:
            return None
        return [
            ps,
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            command,
        ]

    if mode == "posix":
        b = _try_bash()
        if b is None:
            raise RuntimeError(
                "MANUSIFT_SHELL_MODE=posix but no bash "
                "binary found on PATH"
            )
        return b, False, "bash"
    if mode == "cmd":
        c = _try_cmd()
        if c is None:
            raise RuntimeError(
                "MANUSIFT_SHELL_MODE=cmd requires "
                "Windows"
            )
        return c, False, "cmd"
    if mode == "powershell":
        p = _try_powershell()
        if p is None:
            raise RuntimeError(
                "MANUSIFT_SHELL_MODE=powershell but no "
                "PowerShell binary found on Windows"
            )
        return p, False, "powershell"

    # mode == "auto": bash > cmd > powershell
    # R-2026-06-15 (Phase 0+1 + P0-1):
    # the function now returns a
    # 3-tuple ``(args, use_shell, shell_mode)``
    # so the caller can record
    # *which* shell actually ran the
    # command in the result envelope.
    # Hyrum's-Law trap the old API
    # hid: on Windows-without-bash the
    # LLM was led to believe it had
    # bash semantics when the LLM had
    # actually run PowerShell (which
    # silently re-quotes ``$foo``,
    # ``${var}``, ``%VAR%``, and
    # strips heredocs).
    b = _try_bash()
    if b is not None:
        return b, False, "bash"
    c = _try_cmd()
    if c is not None:
        return c, False, "cmd"
    p = _try_powershell()
    if p is not None:
        return p, False, "powershell"
    return command, True, "shell"
