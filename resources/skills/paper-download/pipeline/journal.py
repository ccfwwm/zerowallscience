"""Journal append-only des transitions du worker."""
from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import JOURNAL


def journal_path_today() -> Path:
    JOURNAL.mkdir(parents=True, exist_ok=True)
    return JOURNAL / f"{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.jsonl"


def append_event(
    ref_slug: str,
    from_state: str | None,
    to_state: str | None,
    via: str,
    meta: dict[str, Any] | None = None,
) -> None:
    """Append un événement de transition au journal."""
    event: dict[str, Any] = {
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "ref": ref_slug,
        "from": from_state,
        "to": to_state,
        "via": via,
    }
    if meta:
        event["meta"] = meta
    line = json.dumps(event, ensure_ascii=False) + "\n"
    with journal_path_today().open("a", encoding="utf-8") as f:
        f.write(line)


def append_blocked(ref_slug: str, state: str, reason: str) -> None:
    """Append un événement de blocage (no progress / invariant échec)."""
    event = {
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "ref": ref_slug,
        "from": state,
        "to": None,
        "via": "blocked",
        "meta": {"reason": reason},
    }
    line = json.dumps(event, ensure_ascii=False) + "\n"
    with journal_path_today().open("a", encoding="utf-8") as f:
        f.write(line)
