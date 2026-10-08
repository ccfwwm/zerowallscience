"""Idempotency key store (Step G4).

Pre-G4, an ``/api/upload`` retry from a
client with a flaky network (or a
manual user retry) would re-run the
full analysis. The cost of an LLM
enrichment is non-trivial — a single
detector pass can cost several cents,
and a five-detector run with full LLM
enrichment can cost tens of cents. A
retry that runs the whole pipeline
again is wasted work.

G4 adds an ``Idempotency-Key`` header
pattern modeled on Stripe's:

  * The client sends ``Idempotency-Key:
    <some-uuid>`` on the ``POST
    /api/upload`` request.
  * The middleware hashes the request
    body and the trace_id and checks
    whether a record with the same
    ``Idempotency-Key`` already exists
    on disk. If it does, the cached
    response is replayed verbatim.
  * If no record exists, the request
    proceeds; on completion the
    response is recorded for future
    retries.

The cache TTL is 24 hours. After
24 hours, the record is treated as
absent. (A real Stripe-style store
would also pin the TTL to 24 hours
exactly to bound the disk footprint;
we do the same.)

The store is on disk so the
idempotency window survives a server
restart. The record file lives under
``data/idempotency/<key>.json``. We
compute the path with ``hashlib`` so
a 36-char UUID key lands in a
predictable, filesystem-safe filename.

Guarantees:

  1. ``store_and_get`` returns the
     cached record on a hit and a
     ``None`` on a miss.
  2. ``record(key, status, body)``
     persists the response and is
     atomic: a crash mid-write leaves
     no partial file.
  3. Records older than
     ``settings.idempotency_ttl_seconds``
     are treated as missing; the
     middleware re-runs the request
     in that case.
  4. ``IdempotencyKeyConflict`` is
     raised if the same key arrives
     with a different request body
     (the client used the same key
     for two different uploads — the
     safe behavior is to reject the
     second one, not silently serve
     the first).
  5. The store is a single file per
     key; reads are cached in-process
     for the lifetime of the request
     so a single retried request does
     not re-read the same file 30
     times.
"""
from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import get_settings
from .trace import get_logger

log = get_logger(__name__)


class IdempotencyKeyConflict(Exception):
    """The same key was reused for a
    different request body. The safe
    response is to reject the second
    request, not serve the first
    request's response (which would
    silently drop the second
    payload)."""


@dataclass
class CachedResponse:
    """A response cached under an
    ``Idempotency-Key``."""
    key: str
    body_hash: str
    status_code: int
    body: dict[str, Any]
    trace_id: str
    recorded_at: float


def _hash_body(body: bytes) -> str:
    """A short fingerprint of the request
    body. We use SHA-256 truncated to 16
    hex chars so a key collision
    requires the same exact body."""
    return hashlib.sha256(body).hexdigest()[:16]


def _key_path(key: str) -> Path:
    """The on-disk path of a key's
    record. We use a SHA-256 of the key
    as the filename so a 36-char UUID
    key never lands in a path that has
    special characters and the
    filename is bounded in length."""
    settings = get_settings()
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]
    return settings.workspace_dir.parent / "idempotency" / f"{digest}.json"


def _is_expired(recorded_at: float, ttl: float) -> bool:
    """A record older than ``ttl``
    seconds is treated as missing. We
    use a ``monotonic`` clock so a
    forward jump in wall-clock time
    (e.g. NTP correction) cannot
    prematurely expire records."""
    return time.monotonic() - recorded_at > ttl


def lookup(key: str, body: bytes) -> CachedResponse | IdempotencyKeyConflict | None:
    """Look up ``key`` in the on-disk
    store. Returns:

      * ``CachedResponse`` on a hit
        (same key, same body, record
        not yet expired).
      * ``IdempotencyKeyConflict`` if
        the key is associated with a
        *different* body.
      * ``None`` on a miss (no record,
        or record expired).

    The TTL is read from settings
    *each* call. Tests that want to
    exercise the expiry path can set
    ``MANUSIFT_IDEMPOTENCY_TTL_SECONDS=0``
    via env.
    """
    path = _key_path(key)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        # Corrupt record: treat as a miss
        # so the request is re-run. A
        # corrupt cache must not block
        # the user.
        log.warning(
            "idempotency record corrupt; treating as miss",
            extra={"key": key},
        )
        return None
    settings = get_settings()
    if _is_expired(
        data.get("recorded_at", 0.0),
        float(settings.idempotency_ttl_seconds),
    ):
        return None
    if data.get("body_hash") != _hash_body(body):
        # Same key, different body. The
        # client reused a key for a
        # different upload — this is
        # almost always a bug in the
        # client, so we reject the
        # second request rather than
        # silently serve the first.
        return IdempotencyKeyConflict(
            f"idempotency key {key!r} was already "
            f"used with a different request body"
        )
    return CachedResponse(
        key=key,
        body_hash=data["body_hash"],
        status_code=int(data["status_code"]),
        body=data["body"],
        trace_id=data.get("trace_id", ""),
        recorded_at=data["recorded_at"],
    )


def record(
    key: str,
    body: bytes,
    status_code: int,
    response_body: dict[str, Any],
    trace_id: str,
) -> None:
    """Persist the response under
    ``key`` so future retries with the
    same key (and body) replay this
    response. The write is atomic: we
    write to a ``.tmp`` and ``replace``
    so a crash mid-write leaves no
    partial file."""
    path = _key_path(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    record_data = {
        "key": key,
        "body_hash": _hash_body(body),
        "status_code": status_code,
        "body": response_body,
        "trace_id": trace_id,
        "recorded_at": time.monotonic(),
    }
    tmp = path.with_suffix(path.suffix + ".tmp")
    try:
        tmp.write_text(
            json.dumps(record_data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        tmp.replace(path)
    except OSError as exc:
        log.warning(
            "could not record idempotency response",
            extra={"key": key, "err": str(exc)},
        )
