#!/usr/bin/env python3
"""PostToolUse hook — mini doctor check on the edited ref.

Triggered by Claude Code after a Write or Edit tool call. Reads the
tool input from stdin (JSON), checks if the file path matches a ref
in the registry, and if so runs `pipeline doctor --severity warn` on
that single ref to flag any invariant violation introduced by the edit.

Non-blocking : prints warnings to stdout/stderr but always exits 0.

Hook contract (Claude Code) :
- stdin : JSON object with tool_input (containing file_path)
- exit 0 : non-blocking warning
- exit ≠ 0 : would block the action (not used here)
"""
from __future__ import annotations
import json
import os
import re
import subprocess
import sys
from pathlib import Path


def main() -> int:
    # Read hook input from stdin
    try:
        hook_input = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        # Malformed input — don't block, just exit silently
        return 0

    # Extract file path from tool_input (varies by tool: Write, Edit, MultiEdit)
    tool_input = hook_input.get("tool_input", {})
    file_path = (
        tool_input.get("file_path")
        or tool_input.get("path")
        or ""
    )
    if not file_path:
        return 0

    # Match registry refs : */refs/*.md
    if not re.search(r"/refs/[^/]+\.md$", file_path):
        return 0

    # Find the plugin root (env var CLAUDE_PLUGIN_ROOT injected by harness,
    # fallback to script's parent.parent)
    plugin_root = os.environ.get("CLAUDE_PLUGIN_ROOT") or str(
        Path(__file__).resolve().parent.parent
    )

    # Compute the ref slug for filtering (basename without .md)
    slug = Path(file_path).stem

    # Run doctor scoped to that slug via grep on the JSON output.
    # The CLI doesn't natively filter by slug, so we run full doctor with
    # --json and grep client-side. This is fast (~3s for 909 refs).
    try:
        proc = subprocess.run(
            ["python3", "-m", "pipeline", "doctor", "--json",
             "--severity", "warn"],
            cwd=plugin_root,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (subprocess.TimeoutExpired, OSError):
        return 0  # non-blocking

    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return 0

    violations = [
        v for v in (data.get("violations") or [])
        if v.get("ref_slug") == slug
    ]
    if not violations:
        return 0

    print(f"[paper-trail hook] Doctor warnings on {slug}:", file=sys.stderr)
    for v in violations:
        print(f"  - {v['invariant']} ({v['severity']}): {v['message']}",
              file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
