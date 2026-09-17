"""Per-job persistent state store (Step P1-A).

The pre-P1-A job registry was an in-process
``dict[str, JobState]`` (see ``manusift/web/app.py``). On
uvicorn restart the dict was wiped, even though
``data/jobs/<tid>/`` was still on disk. This module
swaps the dict for a SQLite-backed store so the
registry survives process restarts.

Design notes:

  * We use Python's stdlib ``sqlite3`` (sync, not
    async). Aiosqlite / SQLAlchemy are intentionally
    not used: P1-B (Celery) is deferred, so we do
    not need async access. P1-A stays stdlib-only.
  * We define a tiny ``JobStore`` Protocol with
    ``get / set / all / delete`` so the rest of
    the code base does not have to know whether
    the store is sqlite or in-memory. A future
    in-memory store still works for tests.
  * Alembic / migrations are deferred to P2. The
    schema is created with ``CREATE TABLE IF NOT
    EXISTS`` at open time. Adding a column is
    a one-line ``ALTER TABLE`` we run on every
    open; it is a no-op on already-current
    databases.
  * The legacy ``data/jobs/<tid>/job.json`` files
    are still written by ``web/app.py``. The store
    is the new source of truth for the in-memory
    registry; the file remains for human
    inspection and for the H3 per-step checkpoint
    pipeline.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Protocol

from ..contracts import JobState
from ..trace import get_logger

log = get_logger(__name__)


# ---------- 1. Protocol ----------

class JobStore(Protocol):
    """The minimum surface the rest of the app uses.

    A ``dict[str, JobState]`` is a drop-in
    implementation; a SQLite file is what
    production runs. Tests can pass an in-memory
    implementation to avoid touching disk."""

    def get(self, trace_id: str) -> JobState | None: ...

    def set(self, job: JobState) -> None: ...

    def all(self) -> list[JobState]: ...

    def delete(self, trace_id: str) -> None: ...


# ---------- 2. In-memory implementation (for tests) ----------

class InMemoryJobStore:
    """A drop-in ``dict``-like implementation of the
    ``JobStore`` Protocol. Used by tests that want
    to exercise the registry code without touching
    a real SQLite file.

    G2: thread-safe via a single
    ``threading.Lock``. FastAPI runs
    request handlers in a thread pool
    (the ``BackgroundTasks`` worker
    model is the obvious example), so
    a read-then-write sequence
    (``get`` → ``set``) is a
    data-race waiting to happen.
    ``self._lock`` guards every method
    to make the store safe to share
    across threads.
    """

    def __init__(self) -> None:
        self._d: dict[str, JobState] = {}
        self._lock = threading.Lock()

    def get(self, trace_id: str) -> JobState | None:
        with self._lock:
            return self._d.get(trace_id)

    def set(self, job: JobState) -> None:
        with self._lock:
            self._d[job.trace_id] = job

    def all(self) -> list[JobState]:
        with self._lock:
            # Copy the values to release the
            # lock before the caller iterates
            # — otherwise a long consumer
            # blocks writers.
            return list(self._d.values())

    def delete(self, trace_id: str) -> None:
        with self._lock:
            self._d.pop(trace_id, None)


# ---------- 3. SQLite implementation ----------

# Schema version. Bump on a column add; ``open``
# runs a tiny ``PRAGMA user_version`` migration
# ladder to bring older databases up to date. We
# keep the migration inline (no alembic) on
# purpose — alembic is deferred to P2.
_SCHEMA_VERSION = 1

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS jobs (
    trace_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    source_filename TEXT NOT NULL DEFAULT '',
    current_step TEXT NOT NULL DEFAULT '',
    completed_steps_json TEXT NOT NULL DEFAULT '[]',
    failed_steps_json TEXT NOT NULL DEFAULT '[]',
    user_id TEXT NOT NULL DEFAULT '',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
"""

# Idempotent column adds. We do not have a
# migration tool yet (P2), so a column add means
# adding an ``ALTER TABLE jobs ADD COLUMN ...``
# statement guarded by a column-existence check.
# Each step is run on every ``open()`` and is a
# no-op once applied.
_ADD_COLUMN_STEPS: list[tuple[int, str, str]] = [
    # (from_version, column_name, column_def)
    (1, "user_id", "TEXT NOT NULL DEFAULT ''"),
]


class SqliteJobStore:
    """SQLite-backed ``JobStore``.

    Thread-safe via a single shared connection plus
    a ``threading.Lock``. SQLite itself is
    serializable; the lock is needed to keep the
    Python-side ``Connection`` from being shared
    across threads without serialization (the
    stdlib explicitly warns about that).

    Schema is created at open time. A new column
    is a one-line addition to ``_ADD_COLUMN_STEPS``
    plus a version bump.
    """

    def __init__(self, db_path: Path) -> None:
        self._path = db_path
        self._lock = threading.Lock()
        # ``check_same_thread=False`` lets the
        # connection travel between threads (we
        # serialize via the lock; FastAPI runs
        # handlers in a thread pool). The
        # ``isolation_level=None`` puts us in
        # autocommit mode for DDL; the lock
        # governs writes explicitly.
        self._conn = sqlite3.connect(
            str(db_path),
            check_same_thread=False,
            isolation_level=None,
        )
        self._init_schema()

    @contextmanager
    def _txn(self) -> Iterator[sqlite3.Cursor]:
        """Acquire the lock and return a cursor. The
        caller is expected to issue a single
        statement; for multi-statement transactions
        wrap the call site in ``BEGIN`` / ``COMMIT``
        explicitly."""
        with self._lock:
            cur = self._conn.cursor()
            try:
                yield cur
            finally:
                cur.close()

    def _init_schema(self) -> None:
        """Create the table if missing, then walk
        the additive migration steps. We read the
        ``user_version`` PRAGMA to know where we
        are and apply any step whose ``from_version``
        matches the current value.
        """
        with self._txn() as cur:
            cur.executescript(_CREATE_TABLE)
            cur.execute("PRAGMA user_version")
            row = cur.fetchone()
            current = int(row[0]) if row else 0
            if current < _SCHEMA_VERSION:
                for from_v, col, col_def in _ADD_COLUMN_STEPS:
                    if current < from_v and not self._has_column(cur, col):
                        cur.execute(
                            f"ALTER TABLE jobs ADD COLUMN {col} {col_def}"
                        )
                cur.execute(f"PRAGMA user_version = {_SCHEMA_VERSION}")

    @staticmethod
    def _has_column(cur: sqlite3.Cursor, name: str) -> bool:
        cur.execute("PRAGMA table_info(jobs)")
        return any(row[1] == name for row in cur.fetchall())

    # ----- JobStore Protocol -----

    def get(self, trace_id: str) -> JobState | None:
        with self._txn() as cur:
            cur.execute(
                "SELECT trace_id, status, source_filename, current_step, "
                "completed_steps_json, failed_steps_json, user_id, "
                "created_at, updated_at "
                "FROM jobs WHERE trace_id = ?",
                (trace_id,),
            )
            row = cur.fetchone()
        if row is None:
            return None
        return _row_to_job_state(row)

    def set(self, job: JobState) -> None:
        # P1-A: stamp updated_at on every write so a
        # future "recently active" sort works. We
        # never look at the caller's value here
        # because callers might forget to update
        # it; the store is the single source of
        # truth for "when did this row last change".
        import time as _time
        job.updated_at = _time.time()
        completed = json.dumps(list(job.completed_steps))
        failed = json.dumps(list(job.failed_steps))
        with self._txn() as cur:
            cur.execute(
                "INSERT OR REPLACE INTO jobs ("
                "trace_id, status, source_filename, current_step, "
                "completed_steps_json, failed_steps_json, user_id, "
                "created_at, updated_at"
                ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    job.trace_id,
                    _status_to_str(job.status),
                    job.source_filename,
                    job.current_step or "",
                    completed,
                    failed,
                    job.user_id or "",
                    float(job.created_at),
                    float(getattr(job, "updated_at", job.created_at)),
                ),
            )

    def all(self) -> list[JobState]:
        with self._txn() as cur:
            cur.execute(
                "SELECT trace_id, status, source_filename, current_step, "
                "completed_steps_json, failed_steps_json, user_id, "
                "created_at, updated_at FROM jobs "
                "ORDER BY created_at DESC"
            )
            rows = cur.fetchall()
        return [_row_to_job_state(r) for r in rows]

    def delete(self, trace_id: str) -> None:
        with self._txn() as cur:
            cur.execute("DELETE FROM jobs WHERE trace_id = ?", (trace_id,))


# ---------- 4. Conversion helpers ----------

def _row_to_job_state(row: tuple) -> JobState:
    """Map a SELECT row back to a ``JobState``."""
    (
        trace_id, status, source_filename, current_step,
        completed_json, failed_json, user_id,
        created_at, updated_at,
    ) = row
    return JobState(
        trace_id=trace_id,
        status=_str_to_status(status),
        source_filename=source_filename,
        current_step=current_step or None,
        completed_steps=json.loads(completed_json or "[]"),
        failed_steps=json.loads(failed_json or "[]"),
        user_id=user_id or "",
        created_at=created_at,
        updated_at=updated_at,
    )


def _status_to_str(status: object) -> str:
    """``JobStatus`` is a ``Literal`` alias; serialize
    as the bare string. ``str(JobStatus.queued)``
    yields ``"queued"`` because of the
    ``auto(Literal)`` choice in ``contracts.py``."""
    return str(status)


def _str_to_status(s: str) -> object:
    """Inverse of ``_status_to_str``. We return the
    string and let pydantic-style coercion happen
    in callers that need a strict type. ``JobState``
    is a dataclass with ``status: JobStatus``;
    assigning a ``str`` is permitted at runtime
    (dataclasses do not coerce)."""
    return s
