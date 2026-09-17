"""SessionLog JSONL append-only (P2.1, R-2026-06-14).

The audit sink in
``AgentLoop._emit_audit`` already writes a
per-tool-call record. This module adds a
session-level append-only JSONL log that
captures:

  * The session id (a uuid generated at
    process start).
  * Every audit record, in order, so
    ``cat data/sessions/<sid>.jsonl`` is
    a full history.
  * The LLM-side ``task.heartbeat`` /
    ``task.finished`` events, so an
    audit consumer can correlate
    long-running tools to their
    completion time.

The contract:

  * The file is append-only: ``append()``
    is the only public method.
  * Each line is one JSON object.
    ``json.dumps(..., ensure_ascii=False)``
    is used so a Chinese path / detector
    name is not escaped.
  * The file path is
    ``<workspace_dir>/sessions/<sid>.jsonl``.
  * The session id is generated at
    construction time; it is stable for
    the lifetime of the ``SessionLog``
    instance.
  * ``flock`` is used on POSIX to
    prevent concurrent appends from
    corrupting a line. On Windows we
    fall back to a no-op because the
    file handle is opened with
    ``O_APPEND`` semantics in
    ``open(..., "a")``.

Pattern follows claw-code's
``SessionAppender`` in
``rust/crates/runtime/src/session.rs``.
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any


# Schema version of the session log.
# Bumped when the on-disk format
# changes. Consumers should refuse to
# read a log with a different version
# (unless explicitly told to migrate).
SESSION_LOG_VERSION = "manusift.session.v1"


def _default_sessions_dir(workspace: Path) -> Path:
    """``<workspace>/sessions/`` — the
    conventional location for session
    JSONL files.
    """
    return workspace / "sessions"


class SessionLog:
    """Append-only JSONL log of one
    session's audit events.
    """

    def __init__(
        self,
        workspace: Path,
        *,
        session_id: str | None = None,
        path: Path | None = None,
    ) -> None:
        if session_id is None:
            session_id = uuid.uuid4().hex[:12]
        self.session_id = session_id
        self.workspace = Path(workspace)
        if path is None:
            sessions_dir = _default_sessions_dir(
                self.workspace
            )
            sessions_dir.mkdir(
                parents=True, exist_ok=True
            )
            path = sessions_dir / f"{session_id}.jsonl"
        else:
            # An explicit path is the
            # caller's choice; honour
            # it but ensure the parent
            # exists so ``open("a")``
            # does not raise.
            path = Path(path)
            path.parent.mkdir(
                parents=True, exist_ok=True
            )
        self.path = Path(path)
        # A layer file is created on first
        # ``append`` so an empty session
        # does not leave a 0-byte file
        # on disk.
        self._header_written = False

    def append(
        self,
        event: str,
        payload: dict[str, Any] | None = None,
        *,
        ts: float | None = None,
    ) -> None:
        """Append one event. ``event`` is
        a free-form type (e.g.
        ``tool.started`` /
        ``tool.finished`` /
        ``task.heartbeat``). The
        payload is JSON-serialised
        inline.
        """
        if ts is None:
            ts = time.time()
        record = {
            "session_version": SESSION_LOG_VERSION,
            "session_id": self.session_id,
            "ts": ts,
            "event": event,
            "payload": payload or {},
        }
        line = (
            json.dumps(
                record, ensure_ascii=False
            )
            + "\n"
        )
        # ``open(..., "a")`` is atomic
        # for small writes on POSIX when
        # ``O_APPEND`` is set, which
        # CPython does for ``"a"``. We
        # add an explicit flock on POSIX
        # for extra safety; on Windows
        # we rely on the ``O_APPEND``
        # semantics.
        if sys.platform != "win32":
            try:
                import fcntl
                fd = os.open(
                    str(self.path),
                    os.O_WRONLY
                    | os.O_CREAT
                    | os.O_APPEND,
                    0o644,
                )
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX)
                    os.write(fd, line.encode("utf-8"))
                finally:
                    fcntl.flock(fd, fcntl.LOCK_UN)
                    os.close(fd)
            except (OSError, ImportError):
                # Fall back to plain
                # ``open(..., "a")`` if
                # flock is unavailable.
                with self.path.open(
                    "a", encoding="utf-8"
                ) as f:
                    f.write(line)
        else:
            with self.path.open(
                "a", encoding="utf-8"
            ) as f:
                f.write(line)
        self._header_written = True

    def read_all(self) -> list[dict[str, Any]]:
        """Return every record in the
        log. Test affordance; production
        code uses tail-based consumers
        (the file is append-only and may
        grow large).
        """
        if not self.path.exists():
            return []
        out: list[dict[str, Any]] = []
        with self.path.open(
            "r", encoding="utf-8"
        ) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        return out

    def reset(self) -> None:
        """Test hook. Delete the on-disk
        file so the next ``append``
        starts a fresh log.
        """
        if self.path.exists():
            self.path.unlink()
        self._header_written = False
