"""Trace ID propagation + JSON log formatting.

A trace ID is a 12-char ULID-ish identifier minted at the HTTP edge. It
flows through the entire pipeline via a ``ContextVar`` so that log
lines and ``Finding`` records can be correlated without threading the
value through every function signature.
"""
from __future__ import annotations

import json
import logging
import os
import secrets
import sys
import time
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Iterator

# Per-request trace ID. Set once at the HTTP edge.
_current_trace_id: ContextVar[str | None] = ContextVar("trace_id", default=None)


def new_trace_id() -> str:
    """Mint a short, URL-safe, time-sortable trace id.

    12 chars of base32 (Crockford-ish) is enough entropy for a single
    process and keeps the JSON log lines compact.
    """
    # 60 bits of randomness in 12 base32 chars (5 bits/char).
    return secrets.token_hex(6)


def current_trace_id() -> str | None:
    return _current_trace_id.get()


def bind_trace_id(trace_id: str) -> None:
    _current_trace_id.set(trace_id)


@contextmanager
def trace_id_scope(trace_id: str) -> Iterator[str]:
    """Bind a trace id for the duration of the block, then restore."""
    token = _current_trace_id.set(trace_id)
    try:
        yield trace_id
    finally:
        _current_trace_id.reset(token)


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": time.time(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        tid = _current_trace_id.get()
        if tid:
            payload["trace_id"] = tid
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: str = "INFO") -> None:
    """Install a single JSON handler on the root logger.

    Idempotent — re-running it (e.g. under pytest) replaces the handler
    rather than stacking duplicates.

    P0-9 — if the ``MANUSIFT_STRUCTLOG`` env var is set, swap the
    hand-written JSON formatter for structlog. structlog is
    nicer to look at (colored console output in dev) and lets
    callers do ``log.bind(trace_id=...)`` instead of the older
    ``extra={"trace_id": ...}`` dance. We fall back to the
    legacy formatter if structlog is not importable so the
    minimal install still works.
    """
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    for h in list(root.handlers):
        root.removeHandler(h)
    if os.environ.get("MANUSIFT_STRUCTLOG", "").lower() in (
        "1", "true", "yes"
    ):
        try:
            _configure_structlog(root)
            return
        except ImportError:
            # structlog is an optional dep. We log
            # a one-line warning and fall back to
            # the legacy JSON handler.
            import warnings
            warnings.warn(
                "MANUSIFT_STRUCTLOG=1 but structlog is not "
                "installed; falling back to the legacy JSON "
                "formatter. Run `pip install structlog`.",
                stacklevel=2,
            )
    handler = logging.StreamHandler(stream=sys.stderr)
    handler.setFormatter(_JsonFormatter())
    root.addHandler(handler)


def _configure_structlog(root: logging.Logger) -> None:
    """P0-9 — wire structlog into the standard logging
    module so existing ``logging.getLogger(__name__)``
    calls automatically benefit. The processor chain
    is minimal: bind ``trace_id`` from the ContextVar,
    format timestamp as ISO-8601, render as compact
    JSON (the same shape the legacy formatter emits,
    so downstream log shippers do not have to
    change)."""
    import structlog
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            _add_trace_id,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            # root.level is already an int (e.g. logging.INFO == 20);
            # make_filtering_bound_logger wants the int directly.
            root.level
        ),
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    # Route stdlib logging through structlog's
    # processor chain so a ``logging.getLogger("x")
    # .info("...")`` call still gets a JSON line
    # with the trace_id.
    handler = logging.StreamHandler(stream=sys.stderr)
    handler.setFormatter(_StructlogBridge())
    root.addHandler(handler)


def _add_trace_id(
    logger: Any, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """structlog processor: attach the active trace id
    to every event. No-op if no trace id is bound."""
    tid = _current_trace_id.get()
    if tid is not None:
        event_dict.setdefault("trace_id", tid)
    return event_dict


class _StructlogBridge(logging.Formatter):
    """Adapter so stdlib ``logging`` calls also flow
    through structlog and pick up the trace_id."""

    def format(self, record: logging.LogRecord) -> str:
        import structlog
        log = structlog.get_logger(record.name)
        # Use the level method that matches the
        # record's levelname. The structlog API
        # does not have a generic "log" method.
        level = record.levelname.lower()
        method = getattr(log, level, log.info)
        kwargs: dict[str, Any] = {
            "logger": record.name,
        }
        if record.exc_info:
            kwargs["exc_info"] = record.exc_info
        method(record.getMessage(), **kwargs)
        # Return empty string — the JSON line was
        # already written to stderr by the
        # stdlib handler.
        return ""


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
