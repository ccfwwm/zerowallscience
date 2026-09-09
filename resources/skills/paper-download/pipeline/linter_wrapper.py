"""Wrapper du linter existant `_registry/tools/lint_registry.py`.

Le worker ne réécrit pas le linter — il l'invoque via subprocess.
"""
from __future__ import annotations
import subprocess
import sys

from .config import TOOLS


def run_lint(verbose: bool = False) -> tuple[int, str]:
    """Lance lint_registry.py et retourne (returncode, stdout)."""
    script = TOOLS / "lint_registry.py"
    if not script.exists():
        return 2, f"lint_registry.py introuvable à {script}"
    proc = subprocess.run(
        [sys.executable, str(script)],
        capture_output=True,
        text=True,
        check=False,
    )
    out = proc.stdout + (("\n[stderr]\n" + proc.stderr) if proc.stderr else "")
    if verbose:
        print(out)
    return proc.returncode, out
