"""Grep + Glob tools (R-audit 2026-06-10).

Extracted from ``manusift.tools.agent_tools`` in
R-2026-06-15 (Phase 4 + P4-1)
god-file extraction.
"""
from __future__ import annotations

import json
import re
import shlex
import subprocess
from pathlib import Path
from typing import Any

from ..tool import Tool, ToolContext


class GrepTool:
    """ripgrep-style content
    search.

    R-audit (2026-06-10):
    the LLM needs to search
    text inside a path
    (e.g. find every mention
    of "GRIM" in a
    supplementary readme).
    We use Python's own
    ``re`` module (no
    ripgrep binary
    required) and
    ``Path.rglob`` /
    ``Path.iterdir`` for
    file discovery.
    """

    name = "grep"

    def description(self) -> str:
        return (
            "ripgrep-style content search. Recursively "
            "search files under `path` for `pattern` (a "
            "Python regular expression). Returns matches in "
            "`path:line:content` format. `glob_filter` "
            "narrows the search to specific file types "
            "(e.g. `*.md`, `*.csv`). Text files only; "
            "binary files are skipped by sniffing for NUL "
            "bytes in the first 1 KB."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": (
                        "Python regular expression to "
                        "search for (case-sensitive by "
                        "default; pass `ignore_case=True` "
                        "to override)."
                    ),
                },
                "path": {
                    "type": "string",
                    "description": (
                        "Root directory for the search. "
                        "Must be absolute. Default: cwd."
                    ),
                },
                "glob_filter": {
                    "type": "string",
                    "description": (
                        "Optional glob (e.g. `*.md`) to "
                        "limit which files are searched."
                    ),
                },
                "ignore_case": {
                    "type": "boolean",
                    "description": (
                        "Case-insensitive search. Default "
                        "False."
                    ),
                },
                "max_matches": {
                    "type": "integer",
                    "description": (
                        "Optional cap on matches. Default "
                        "200."
                    ),
                },
            },
            "required": ["pattern"],
        }

    def execute(
        self,
        input: dict[str, Any],
        ctx: ToolContext,
    ) -> str:
        pattern = (input.get("pattern") or "").strip()
        if not pattern:
            return json.dumps(
                {"ok": False, "error": "pattern is required"}
            )
        path_str = (input.get("path") or "").strip()
        root: Path
        if path_str:
            root = Path(path_str)
            if not root.is_absolute():
                return json.dumps(
                    {
                        "ok": False,
                        "error": (
                            f"path must be absolute, got "
                            f"{path_str!r}"
                        ),
                    }
                )
        else:
            root = Path.cwd()
        if not root.exists():
            return json.dumps(
                {
                    "ok": False,
                    "error": f"path does not exist: {root}",
                }
            )
        glob_filter = input.get("glob_filter") or ""
        ignore_case = bool(input.get("ignore_case"))
        max_matches = int(input.get("max_matches") or 200)
        max_matches = min(max_matches, 5000)
        try:
            rx = re.compile(
                pattern, re.IGNORECASE if ignore_case else 0
            )
        except re.error as exc:
            return json.dumps(
                {"ok": False, "error": f"bad regex: {exc}"}
            )
        matches: list[dict[str, Any]] = []
        files_scanned = 0
        files_skipped_binary = 0
        # Discover
        # files.
        if root.is_file():
            file_iter: Any = iter([root])
        else:
            if glob_filter:
                file_iter = root.rglob(glob_filter)
            else:
                file_iter = (
                    p
                    for p in root.rglob("*")
                    if p.is_file()
                )
        for f in file_iter:
            if len(matches) >= max_matches:
                break
            files_scanned += 1
            # Sniff
            # the
            # first
            # 1 KB
            # for
            # NUL
            # bytes
            # (binary
            # detection).
            try:
                with f.open("rb") as fp:
                    head = fp.read(1024)
                if b"\x00" in head:
                    files_skipped_binary += 1
                    continue
            except OSError:
                continue
            try:
                content = f.read_text(
                    encoding="utf-8",
                    errors="ignore",
                )
            except OSError:
                continue
            for lineno, line in enumerate(
                content.splitlines(), start=1
            ):
                if rx.search(line):
                    matches.append(
                        {
                            "file": str(f),
                            "line": lineno,
                            "content": line[:400],
                        }
                    )
                    if len(matches) >= max_matches:
                        break
        return json.dumps(
            {
                "ok": True,
                "pattern": pattern,
                "path": str(root),
                "files_scanned": files_scanned,
                "files_skipped_binary": files_skipped_binary,
                "match_count": len(matches),
                "truncated": len(matches) >= max_matches,
                "matches": matches,
            },
            ensure_ascii=False,
        )


    # ============================================================
    # 5. glob
    # ============================================================




class GlobTool:
    """Find files matching a
    glob pattern.

    R-audit (2026-06-10):
    the LLM needs to find
    files by glob (e.g.
    "all *.csv under this
    directory"). We use
    Python's stdlib
    ``Path.rglob`` /
    ``Path.glob``.
    """

    name = "glob"

    def description(self) -> str:
        return (
            "Find files matching a glob pattern under a "
            "root path. Recursive by default. Returns "
            "absolute paths. Common patterns: `**/*.csv`, "
            "`*.md`, `**/test_*.py`."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": (
                        "Glob pattern (e.g. `**/*.csv`)."
                    ),
                },
                "path": {
                    "type": "string",
                    "description": (
                        "Root directory. Must be absolute. "
                        "Default: cwd."
                    ),
                },
                "max_results": {
                    "type": "integer",
                    "description": (
                        "Cap on the number of results. "
                        "Default 200."
                    ),
                },
            },
            "required": ["pattern"],
        }

    def execute(
        self,
        input: dict[str, Any],
        ctx: ToolContext,
    ) -> str:
        pattern = (input.get("pattern") or "").strip()
        if not pattern:
            return json.dumps(
                {"ok": False, "error": "pattern is required"}
            )
        path_str = (input.get("path") or "").strip()
        root: Path
        if path_str:
            root = Path(path_str)
            if not root.is_absolute():
                return json.dumps(
                    {
                        "ok": False,
                        "error": (
                            f"path must be absolute, got "
                            f"{path_str!r}"
                        ),
                    }
                )
        else:
            root = Path.cwd()
        if not root.exists():
            return json.dumps(
                {
                    "ok": False,
                    "error": f"path does not exist: {root}",
                }
            )
        max_results = int(input.get("max_results") or 200)
        max_results = min(max_results, 5000)
        matches: list[str] = []
        try:
            for p in root.glob(pattern):
                if p.is_file():
                    matches.append(str(p.resolve()))
                if len(matches) >= max_results:
                    break
        except (ValueError, OSError) as exc:
            return json.dumps(
                {"ok": False, "error": f"glob failed: {exc}"}
            )
        return json.dumps(
            {
                "ok": True,
                "pattern": pattern,
                "path": str(root),
                "count": len(matches),
                "truncated": len(matches) >= max_results,
                "files": matches,
            },
            ensure_ascii=False,
        )


# ============================================================
# 6. task (subagent delegation)
# ============================================================
