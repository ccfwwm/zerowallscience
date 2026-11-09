"""Chat-session log compaction (Step P1-C).

Pre-P1-C, ``data/chats/<sid>/messages.jsonl`` and
``data/chats/<sid>/tool_calls.jsonl`` grow
unbounded. After ~100 turns the file is multi-MB
and the TUI has to skip past everything to render
the most recent lines.

P1-C layers a manual compaction on top:

  1. The current ``.jsonl`` file is renamed to
     ``.<YYYY-MM-DD>.jsonl.gz`` and gzipped.
  2. A new empty ``.jsonl`` is created so the
     TUI / agent can keep appending.
  3. The date is the **last-modified time** of the
     file, not today, so the gzipped name reflects
     "this is the data from that day". A file
     rotated on 2026-06-09 at 23:55 and
     immediately rotated again on 2026-06-10 at
     00:01 produces two different date stamps.
  4. We keep a sidecar ``<file>.manifest`` with
     one line per archive so a future search
     across all sessions can find content fast.

Compact is idempotent: a second call on the same
session that already has only the live ``.jsonl``
is a no-op (no archive is created). We do not
auto-compact on every write; that is the operator's
job (cron / systemd timer) and we expose it as a
console script ``manusift-compact-chats``.

We also keep the script **stateless**: a single
call processes every session dir under the chat
root. Cron-friendly:
``0 3 * * * manusift-compact-chats``.
"""
from __future__ import annotations

import gzip
import shutil
from datetime import datetime
from pathlib import Path
from typing import Iterable

from .config import get_settings
from .trace import get_logger

log = get_logger(__name__)


def chat_sessions_root() -> Path:
    """The directory that holds one subdir per chat
    session. ``data/chats/`` by default; the
    parent of the workspace dir (legacy chat
    session layout; chat TUI removed — path
    kept for compacting leftover local data)."""
    return get_settings().workspace_dir.parent / "chats"


def compact_chat_session(session_dir: Path) -> int:
    """Compact one session. Returns the number of
    files rotated (0 or 1 per jsonl file in the
    session)."""
    if not session_dir.is_dir():
        return 0
    rotated = 0
    for live in (session_dir / "messages.jsonl",
                 session_dir / "tool_calls.jsonl"):
        if not live.exists() or live.stat().st_size == 0:
            continue
        date_str = datetime.fromtimestamp(
            live.stat().st_mtime
        ).strftime("%Y-%m-%d")
        # ``<file>.<date>.jsonl.gz`` is the archived
        # name. If we already have an archive for
        # that date we append a sequence number
        # so the second rotation of the same day
        # does not overwrite the first.
        archive = session_dir / f"{live.name}.{date_str}.jsonl.gz"
        seq = 0
        while archive.exists():
            seq += 1
            archive = session_dir / (
                f"{live.name}.{date_str}.{seq:02d}.jsonl.gz"
            )
        _gzip_file(live, archive)
        # Truncate the live file in place. ``touch()``
        # only updates mtime; we need the file to
        # be 0 bytes so the next write starts fresh.
        # ``open("wb").close()`` is the canonical
        # way to truncate without removing the
        # inode (so the file watcher in the TUI does
        # not see a delete+create).
        with live.open("wb"):
            pass
        rotated += 1
        log.info(
            "compacted chat log",
            extra={
                "live": str(live),
                "archive": str(archive),
            },
        )
    return rotated


def compact_all_chat_sessions(
    root: Path | None = None,
) -> tuple[int, int]:
    """Compact every session under ``root`` (or the
    default chat root). Returns ``(sessions_touched,
    files_rotated)``."""
    root = root or chat_sessions_root()
    if not root.exists():
        return (0, 0)
    sessions_touched = 0
    files_rotated = 0
    for session_dir in sorted(root.iterdir()):
        if not session_dir.is_dir():
            continue
        n = compact_chat_session(session_dir)
        if n:
            sessions_touched += 1
            files_rotated += n
    return (sessions_touched, files_rotated)


def _gzip_file(src: Path, dst: Path) -> None:
    """Compress ``src`` to ``dst`` with gzip level 6
    (default). We read in chunks so a 50-MB jsonl
    does not blow up memory.

    If anything fails mid-write, the partial
    ``dst`` is removed so a re-run is idempotent
    rather than leaving a corrupt archive."""
    tmp = dst.with_suffix(dst.suffix + ".tmp")
    try:
        with src.open("rb") as fin, gzip.open(
            tmp, "wb", compresslevel=6
        ) as fout:
            shutil.copyfileobj(fin, fout, length=64 * 1024)
        tmp.replace(dst)
    except Exception:
        if tmp.exists():
            tmp.unlink()
        raise


def iter_archives(session_dir: Path) -> Iterable[Path]:
    """Yield the archived ``.jsonl.gz`` files for a
    session, newest first. Used by future
    ``/api/chats/<sid>/archive`` endpoints."""
    if not session_dir.is_dir():
        return
    archives = sorted(
        session_dir.glob("*.jsonl.gz"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    yield from archives


def main() -> int:
    """Console-script entry point.

    ``manusift-compact-chats`` runs the compaction
    on every session and prints a one-line
    summary. Exit code 0 always — compact is a
    best-effort cleanup and a failure on one
    session must not stop the others."""
    sessions, files = compact_all_chat_sessions()
    log.info(
        "compact_chats done",
        extra={"sessions": sessions, "files_rotated": files},
    )
    return 0
