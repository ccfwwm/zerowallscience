"""Bash tool (R-audit 2026-06-10).

Extracted from ``manusift.tools.agent_tools`` in
R-2026-06-15 (Phase 4 + P4-1)
god-file extraction.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from ..tool import Tool, ToolContext


# R-2026-06-15 (Phase 4 + P4-1):
# this constant was at
# module level in the
# original
# ``agent_tools.py``
# (line 589).  It is
# referenced by
# ``_shell_command_args``
# so we keep it at
# module level here.
SHELL_MODES = ("auto", "posix", "cmd", "powershell")


class BashTool:
    """Run a shell command.

    R-audit (2026-06-10):
    gives the LLM the same
    bash capability Claude
    Code / OpenCode /
    Hermes all provide.
    Every command is run
    through a deny-list
    blocklist (rm -rf /,
    mkfs, dd to a block
    dev, fork bomb, etc.)
    and capped at a
    configurable timeout
    (default 30s, env
    ``MANUSIFT_SHELL_TIMEOUT_SECONDS``).
    The command is run
    from the project's
    working directory by
    default; pass
    ``cwd`` to override.
    """

    name = "bash"

    def description(self) -> str:
        return (
            "Run a shell command. The command is run with "
            "the user's shell (Bourne-compatible) and "
            "returns stdout, stderr, and the exit code. "
            "Every command is run through a deny-list "
            "blocklist (rm -rf /, mkfs, dd to a block dev, "
            "fork bomb, etc.) and capped at "
            "MANUSIFT_SHELL_TIMEOUT_SECONDS (default 30s). "
            "Set MANUSIFT_ALLOW_SHELL=false to disable this "
            "tool entirely."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": (
                        "The shell command to run."
                    ),
                },
                "cwd": {
                    "type": "string",
                    "description": (
                        "Optional working directory. "
                        "Default: the project's cwd."
                    ),
                },
                "timeout_seconds": {
                    "type": "integer",
                    "description": (
                        "Optional per-call timeout. Default "
                        "MANUSIFT_SHELL_TIMEOUT_SECONDS (30s)."
                    ),
                },
            },
            "required": ["command"],
        }

    def execute(
        self,
        input: dict[str, Any],
        ctx: ToolContext,
    ) -> str:
        from ...config import get_settings

        settings = get_settings()
        if not settings.allow_shell:
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "permission_denied",
                    "error": (
                        "shell execution is disabled "
                        "(MANUSIFT_ALLOW_SHELL=False)"
                    ),
                    "hint": (
                        "set MANUSIFT_ALLOW_SHELL=true to "
                        "re-enable the bash tool, or use "
                        "the python_exec tool for "
                        "data-analysis work"
                    ),
                }
            )
        command = (input.get("command") or "").strip()
        if not command:
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "permission_denied",
                    "error": "command is required",
                }
            )
        # R-2026-06-15 (Phase 1 + 3b):
        # the new
        # ``classify_command``
        # helper
        # replaces
        # the
        # 2-line
        # ``_BASH_DENY_PATTERNS``
        # denylist
        # with
        # a
        # 3-state
        # classifier
        # (safe
        # /
        # needs_confirm
        # /
        # block).
        # The
        # classifier
        # handles
        # variable
        # expansion
        # ($HOME
        # / $PWD
        # / ~),
        # pipeline
        # splitting
        # (;
        # / &&
        # / ||),
        # and
        # PowerShell
        # (-Recurse
        # -Force).
        # ``block``
        # commands
        # are
        # refused
        # unconditionally;
        # ``needs_confirm``
        # commands
        # are
        # also
        # refused
        # (the
        # chat
        # TUI
        # can
        # opt
        # in
        # to
        # a
        # confirm
        # modal
        # in
        # a
        # future
        # revision;
        # for
        # now
        # we
        # are
        # conservative
        # and
        # require
        # the
        # user
        # to
        # disable
        # the
        # safety
        # net
        # via
        # ``MANUSIFT_ALLOW_NEEDS_CONFIRM=true``
        # to
        # actually
        # run
        # them).
        from ..safety import (
            classify_command,
            STATE_BLOCK,
            STATE_NEEDS_CONFIRM,
        )
        import os as _os
        allow_needs_confirm = (
            _os.environ.get(
                "MANUSIFT_ALLOW_NEEDS_CONFIRM",
                "",
            ).lower()
            in ("1", "true", "yes")
        )
        classification = classify_command(
            command,
            shell=settings.shell_mode
            if hasattr(settings, "shell_mode")
            else "auto",
        )
        if classification.state == STATE_BLOCK:
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "permission_denied",
                    "error": (
                        f"{classification.reason} "
                        f"(command={command!r})"
                    ),
                    "command": command,
                    "rule": (
                        classification.matched_rule
                    ),
                    "hint": (
                        "this command is blocked by "
                        "the bash classifier; see "
                        "manusift/tools/safety.py"
                    ),
                }
            )
        if (
            classification.state == STATE_NEEDS_CONFIRM
            and not allow_needs_confirm
        ):
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "permission_denied",
                    "error": (
                        f"{classification.reason} "
                        f"(command={command!r}); "
                        "set MANUSIFT_ALLOW_NEEDS_CONFIRM=true "
                        "to enable mutating commands"
                    ),
                    "command": command,
                    "rule": (
                        classification.matched_rule
                    ),
                    "hint": (
                        "the bash classifier blocks "
                        "mutating commands by default; "
                        "use a non-mutating command "
                        "instead, or set "
                        "MANUSIFT_ALLOW_NEEDS_CONFIRM=true"
                    ),
                }
            )
        cwd_str = (input.get("cwd") or "").strip() or None
        cwd_path: Path | None = None
        if cwd_str:
            cwd_path = Path(cwd_str)
            if not cwd_path.is_absolute():
                return json.dumps(
                    {
                        "ok": False,
                        "error_kind": "permission_denied",
                        "error": (
                            f"cwd must be absolute, got "
                            f"{cwd_str!r}"
                        ),
                    }
                )
            if not cwd_path.is_dir():
                return json.dumps(
                    {
                        "ok": False,
                        "error_kind": "path_not_visible",
                        "error": (
                            f"cwd is not a directory: "
                            f"{cwd_str}"
                        ),
                        "hint": (
                            "the path either does not exist "
                            "or is not visible to the bash "
                            "subprocess; check permissions"
                        ),
                    }
                )
        # R-2026-06-15 (Phase 0.9):
        # ``settings.bash_cwd`` (env
        # ``MANUSIFT_BASH_CWD``)
        # overrides the per-call
        # ``input.cwd``. A
        # non-empty value is
        # used as the default
        # working directory.
        # This is intentional:
        # the user setting is
        # a deploy-level
        # constraint (e.g. "the
        # bash tool may only
        # run inside
        # /home/user/projects")
        # and must take
        # precedence over a
        # per-call value. A
        # missing path is a
        # typed
        # ``data_source_missing``
        # error so a bad env
        # var is loud, not
        # silent.
        settings_bash_cwd = (
            settings.bash_cwd or ""
        ).strip()
        if settings_bash_cwd:
            settings_cwd_path = Path(
                settings_bash_cwd
            )
            if (
                not settings_cwd_path.is_absolute()
            ):
                return json.dumps({
                    "ok": False,
                    "error_kind": "permission_denied",
                    "error": (
                        f"settings.bash_cwd must be "
                        f"absolute, got "
                        f"{settings_bash_cwd!r}"
                    ),
                })
            if not settings_cwd_path.is_dir():
                return json.dumps({
                    "ok": False,
                    "error_kind": "data_source_missing",
                    "error": (
                        f"settings.bash_cwd points to a "
                        f"non-existent directory: "
                        f"{settings_bash_cwd}"
                    ),
                    "hint": (
                        "check the MANUSIFT_BASH_CWD "
                        "env var (or ``bash_cwd`` in "
                        "manusift.yaml / .manusift.json)"
                    ),
                })
            cwd_path = settings_cwd_path
        # R-2026-06-15 (Phase 2 + P2-3):
        # if the user supplied
        # a ``cwd`` that is
        # OUTSIDE the
        # configured workspace
        # (escape attempt via
        # symlink or path
        # traversal), reject
        # the call.  This
        # closes the audit's
        # ``BashTool.cwd is
        # unrestricted``
        # finding: a tool call
        # that asks for
        # ``cwd=/etc`` is
        # rejected even
        # though it is
        # absolute and a
        # directory.  We
        # resolve the path
        # (canonical form) and
        # check
        # ``is_relative_to()``
        # against the
        # configured
        # ``workspace_dir``.
        if cwd_path is not None:
            workspace = Path(
                settings.workspace_dir
            ).resolve()
            resolved = cwd_path.resolve()
            try:
                resolved.relative_to(workspace)
            except ValueError:
                return json.dumps({
                    "ok": False,
                    "error_kind": "permission_denied",
                    "error": (
                        f"bash cwd must be inside "
                        f"workspace "
                        f"({workspace}); got "
                        f"{resolved}"
                    ),
                })
        # R-2026-06-15 (Phase 2 + P2-5):
        # hard cap on the
        # per-call timeout.  A
        # runaway shell that
        # blocks for 24h would
        # hang the agent loop
        # indefinitely; the
        # cap is enforced at
        # *two* layers
        # (Settings field
        # validation rejects
        # ``>600`` at
        # construction time,
        # and this clamp
        # defends against a
        # buggy caller that
        # bypasses Settings
        # and supplies
        # ``timeout_seconds=10**9``
        # directly in the
        # tool input).  The
        # cap is 600s (10
        # minutes); a value
        # larger than that is
        # silently clamped
        # (not rejected) so a
        # caller that
        # ``timeout_seconds=1000``
        # still gets a
        # ``subprocess.TimeoutExpired``
        # after 600s instead
        # of a confusing
        # ``ValidationError``.
        # We also enforce a
        # minimum of 0.1s so a
        # caller that
        # ``timeout_seconds=0``
        # does not get an
        # instant timeout.
        # (The Settings field
        # has ``ge=0.1``; this
        # clamp is
        # defence-in-depth.)
        _BASHTOOL_TIMEOUT_CAP = 600.0
        _BASHTOOL_TIMEOUT_MIN = 0.1
        raw_timeout = input.get("timeout_seconds")
        if raw_timeout is None:
            raw_timeout = settings.shell_timeout_seconds
        timeout = float(raw_timeout)
        timeout = max(
            _BASHTOOL_TIMEOUT_MIN,
            min(timeout, _BASHTOOL_TIMEOUT_CAP),
        )
        t0 = time.monotonic()
        try:
            # R-2026-06-15 (Phase 0+1 + P0-1):
            # the third return value is
            # the shell name; we record
            # it in the result envelope
            # so the LLM can tell which
            # shell actually ran the
            # command (Hyrum's-Law trap:
            # Windows-without-bash silently
            # falls through to powershell).
            command_args, use_shell, shell_mode = (
                _shell_command_args(command)
            )
        except RuntimeError as exc:
            # R-2026-06-15 (Phase 0+1 + P0-1):
            # the ``mode`` that was
            # asked for is read from
            # the env here (not
            # threaded through the
            # exception) so the
            # envelope is complete
            # even on the missing-
            # binary path.
            asked_mode = os.environ.get(
                "MANUSIFT_SHELL_MODE", "auto"
            ).strip().lower() or "auto"
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "dependency_missing",
                    "error": str(exc),
                    "command": command,
                    "shell_mode": asked_mode,
                    "hint": (
                        "install the missing shell, or set "
                        "MANUSIFT_SHELL_MODE to a value "
                        "whose binary is on PATH"
                    ),
                }
            )
        # R-2026-06-15 (Phase 0.3):
        # emit a ``bash.shell_resolved``
        # event the first time
        # the bash tool is
        # invoked in this
        # process. The chat
        # TUI consumes the
        # event to show a
        # "running in cmd" /
        # "running in
        # powershell" hint
        # in the status bar so
        # the LLM is not
        # silently misled
        # about which shell
        # the agent's commands
        # actually run in.
        # The emission is
        # wrapped in a try so a
        # missing or broken bus
        # does not break the
        # bash tool (the bash
        # tool's job is to
        # execute, not to
        # notify).
        try:
            from ...events import (
                Event as _Ev,
                get_bus as _get_bus,
            )
            _get_bus().emit(_Ev(
                "bash.shell_resolved",
                {
                    "shell_mode": shell_mode,
                    "command": command,
                },
            ))
        except Exception:  # noqa: BLE001
            pass
        try:
            proc = subprocess.run(
                command_args,
                shell=use_shell,  # we want shell features (pipes, redirects)
                cwd=str(cwd_path) if cwd_path else None,
                capture_output=True,
                text=True,
                errors="replace",
                timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "budget_exhausted",
                    "error": f"timeout after {timeout}s",
                    "command": command,
                    "shell_mode": shell_mode,
                    "cwd": (
                        str(cwd_path) if cwd_path else None
                    ),
                    "timeout_seconds": timeout,
                    "hint": (
                        f"increase MANUSIFT_SHELL_TIMEOUT_SECONDS "
                        f"(current {timeout}s) or pass "
                        f"timeout_seconds={{n}} per-call"
                    ),
                }
            )
        except FileNotFoundError as exc:
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "dependency_missing",
                    "error": f"shell binary not found: {exc}",
                    "command": command,
                    "shell_mode": shell_mode,
                    "hint": (
                        f"{command_args[0]!r} is not on PATH; "
                        f"set MANUSIFT_SHELL_MODE to a shell "
                        f"whose binary IS on PATH"
                    ),
                }
            )
        except Exception as exc:  # noqa: BLE001
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "dependency_missing",
                    "error": f"exec failed: {exc}",
                    "command": command,
                    "shell_mode": shell_mode,
                }
            )
        elapsed = time.monotonic() - t0
        # Cap
        # output
        # size
        # to
        # keep
        # LLM
        # context
        # reasonable.
        max_out = 30_000
        stdout = proc.stdout
        stderr = proc.stderr
        stdout_truncated = False
        stderr_truncated = False
        if len(stdout) > max_out:
            stdout = stdout[:max_out]
            stdout_truncated = True
        if len(stderr) > max_out:
            stderr = stderr[:max_out]
            stderr_truncated = True
        return json.dumps(
            {
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
                "shell_mode": shell_mode,
                "cwd": (
                    str(cwd_path) if cwd_path else None
                ),
                "command": command,
                # R-2026-06-15 (Phase 2 + P2-5):
                # report the
                # *clamped*
                # ``timeout_seconds``
                # in the result
                # envelope so the
                # LLM can see what
                # the cap was
                # actually applied.
                # Without this, a
                # caller that
                # requested
                # ``timeout_seconds=10**9``
                # would get a
                # 600s timeout
                # without any
                # signal that the
                # value was
                # clamped.
                "timeout_seconds": timeout,
            },
            ensure_ascii=False,
        )


# ============================================================
# 4. grep
# ============================================================




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
