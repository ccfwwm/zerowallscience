#!/usr/bin/env python3
"""SessionEnd hook — full doctor sweep at end of session.

Triggered by Claude Code when the session ends. Runs the full doctor
audit at severity=error and prints the recap. Non-blocking.

Skip mechanism : if `RESEARCH_SKIP_END_DOCTOR=1` is set, exits silently.

Hook contract :
- stdin : JSON (ignored in this hook)
- exit 0 : non-blocking
"""
from __future__ import annotations
import os
import subprocess
import sys
from pathlib import Path


def main() -> int:
    if os.environ.get("RESEARCH_SKIP_END_DOCTOR") == "1":
        return 0

    plugin_root = os.environ.get("CLAUDE_PLUGIN_ROOT") or str(
        Path(__file__).resolve().parent.parent
    )

    try:
        proc = subprocess.run(
            ["python3", "-m", "pipeline", "doctor", "--severity", "error"],
            cwd=plugin_root,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except (subprocess.TimeoutExpired, OSError) as e:
        print(f"[paper-trail hook] SessionEnd doctor crashed: "
              f"{type(e).__name__}", file=sys.stderr)
        return 0  # non-blocking

    # Extract only the recap line for terseness
    recap = None
    for line in (proc.stdout or "").splitlines():
        if line.startswith("Summary:"):
            recap = line
            break

    if recap:
        print(f"[paper-trail SessionEnd] {recap}", file=sys.stderr)
    elif proc.returncode != 0:
        print(f"[paper-trail SessionEnd] doctor exited {proc.returncode}",
              file=sys.stderr)
    # If exit 0 and no recap, nothing to say (no violations)
    return 0


if __name__ == "__main__":
    sys.exit(main())
