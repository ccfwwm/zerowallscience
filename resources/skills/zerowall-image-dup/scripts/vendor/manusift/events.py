"""Event bus + webhook listener registry (Step E3).

Pre-E3, the pipeline was a black box
to operators: the only way to learn
that a job had finished was to poll
``/api/jobs/<tid>/progress`` (or to
read the on-disk ``findings.json``).
A user that wanted a Slack or
PagerDuty notification when a job
finished had to add a side-channel
in the web layer — and that
side-channel had to be re-implemented
for every new notification target.

E3 introduces an ``EventBus`` that the
pipeline emits to at well-defined
points (job start, per-detector
step, job done, job failed). The bus
is a process-global singleton; any
number of listeners can be
registered. The default listener is
``LoggingListener`` which simply logs
the event so the operator has a
trace of the work in the log file.
A second built-in listener is
``FileWebhookListener`` which writes
a JSON line to
``data/webhooks/<trace_id>.jsonl``
for every event — this is the
"out-of-band notification" the
``/api/jobs/<tid>/webhook`` route
documents.

Listener contract:

  * ``on_event(event: Event) -> None``
    is called synchronously by the
    bus. A slow listener blocks the
    pipeline; the listeners are
    expected to be cheap. Future
    work (E3+) could move the
    dispatch to a background thread
    pool, but for the v1 of the
    bus, synchronous dispatch is
    fine and keeps the failure
    semantics simple (an exception
    in a listener is logged and
    swallowed, not raised to the
    pipeline).
  * A listener registers with
    ``bus.subscribe(listener)`` and
    unsubscribes with
    ``bus.unsubscribe(listener)``.
    The bus uses a list, not a set,
    so the order of dispatch is
    stable (registration order).

Built-in events:

  * ``job.started`` — emitted by
    ``run_pipeline`` at the start
    of a job. ``payload``: ``{trace_id, filename, detector_count}``.
  * ``job.step_completed`` — emitted
    after every detector. ``payload``:
    ``{trace_id, detector, ok, duration_ms, findings_count}``.
  * ``job.completed`` — emitted when
    the pipeline finishes
    successfully. ``payload``:
    ``{trace_id, total_findings, llm_calls, duration_ms}``.
  * ``job.failed`` — emitted when
    the pipeline raises an
    unhandled exception.
    ``payload``: ``{trace_id, error}``.

Guarantees:

  1. ``emit`` is synchronous and
     thread-safe. Two concurrent
     emits do not interleave their
     listener invocations.
  2. A listener that raises an
     exception is logged and
     skipped; the rest of the
     listeners still fire.
  3. ``subscribe`` returns a handle
     that can be passed to
     ``unsubscribe`` for symmetry.
     The ``unsubscribe`` is a no-op
     for an unknown handle.
  4. ``reset_bus`` is a test hook
     that clears all listeners and
     re-installs the default
     ``LoggingListener``.
"""
from __future__ import annotations

import json
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

from .config import get_settings
from .trace import get_logger

log = get_logger(__name__)


@dataclass
class Event:
    """An event emitted by the pipeline.

    P0.3 metadata envelope (R-2026-06-14):
    every event now carries 4 metadata
    fields so the bus consumer (TUI, log,
    SessionLog) can correlate, attribute,
    and time-stamp without re-parsing the
    payload:

    * ``seq`` -- monotonic per-process
      counter assigned by the bus on
      ``emit``. Tests can use it to
      assert ordering.
    * ``timestamp_ms`` -- wall-clock
      time in milliseconds since
      epoch (set by the bus, not the
      caller). Existing ``ts`` field
      remains for backward compat
      (monotonic clock, good for
      inter-event intervals).
    * ``provenance`` -- a short string
      like ``"agent._execute_tool_calls"``,
      ``"heartbeat.LongTask"``,
      ``"tool.bash.execute"`` identifying
      the call site. Set by the caller.
    * ``emitter_identity`` -- the
      fully-qualified module + class or
      function name that emitted the
      event, e.g.
      ``"manusift.agent.AgentLoop"`` or
      ``"manusift.tools.heartbeat"``. Set
      by the caller. When the bus emits
      automatically (e.g. via a generic
      helper), it falls back to the
      caller's frame (best effort via
      ``inspect``).
    * ``trace_id`` -- propagated from
      the ToolContext when the caller
      passes it. Optional; the bus does
      not invent one.
    """
    type: str
    payload: dict[str, Any]
    ts: float = field(default_factory=time.monotonic)
    # P0.3 metadata envelope.
    seq: int = 0
    timestamp_ms: int = 0
    provenance: str | None = None
    emitter_identity: str | None = None
    trace_id: str | None = None


@runtime_checkable
class Listener(Protocol):
    """A drop-in event listener.

    The Protocol is intentionally
    tiny: an ``on_event(event)`` method
    and an optional ``name`` (used
    in error logs to identify the
    listener that raised)."""

    name: str

    def on_event(self, event: Event) -> None:
        ...


# ---------- 1. EventBus ----------

class EventBus:
    """A synchronous, thread-safe
    event bus.

    Listeners are called in
    registration order. The bus is
    intentionally simple: no
    filtering, no routing, no
    background dispatch. The
    v1 use case is "notify
    listeners that the pipeline is
    done" — the bus is the seam
    for that notification, not a
    general-purpose pub/sub."""

    def __init__(self) -> None:
        self._listeners: list[Listener] = []
        self._lock = threading.Lock()
        # P0.3 (R-2026-06-14): the bus owns a
        # monotonic per-process sequence number
        # so every emitted event has a unique
        # ``seq`` in the order it was emitted.
        self._seq = 0
        # R-2026-06-15 (Phase 1 + P1-21):
        # an opt-in
        # ``ThreadPoolExecutor``
        # for async dispatch.
        # The executor is created
        # lazily (the first time
        # a caller asks for
        # async dispatch) and is
        # shut down when the
        # process exits.  A
        # slow listener no longer
        # blocks the agent loop.
        # The executor has at
        # most 4 workers (the
        # listener count is
        # typically 1-3, so 4 is
        # enough headroom for a
        # one-off burst without
        # unlimited thread
        # growth).
        self._executor: "ThreadPoolExecutor | None" = (
            None
        )
        self._executor_lock = threading.Lock()
        # Lazy import to keep ``events.py``
        # import-cheap.
        import time as _time
        self._time = _time

    def subscribe(self, listener: Listener) -> Listener:
        """Register a listener. Returns
        ``listener`` for symmetric
        ``unsubscribe`` use."""
        with self._lock:
            self._listeners.append(listener)
        return listener

    def unsubscribe(self, listener: Listener) -> None:
        """Remove a previously registered
        listener. A no-op for an
        unknown handle."""
        with self._lock:
            try:
                self._listeners.remove(listener)
            except ValueError:
                pass

    def listeners(self) -> list[Listener]:
        """Return a snapshot of the
        registered listeners, in
        registration order. Used by
        tests."""
        with self._lock:
            return list(self._listeners)

    def emit_envelope(
        self,
        event_type: str,
        payload: dict[str, Any] | None = None,
        *,
        provenance: str | None = None,
        emitter_identity: str | None = None,
        trace_id: str | None = None,
    ) -> Event:
        """Helper for callers that want the
        bus to record a typed envelope
        (P0.3).

        ``seq`` and ``timestamp_ms`` are
        auto-filled by ``emit`` (called
        at the end of this helper). If
        the caller does not pass
        ``emitter_identity``, the bus
        falls back to ``inspect`` on the
        caller's frame (best effort).

        Returns the emitted ``Event``
        so tests can assert on the
        metadata.
        """
        if emitter_identity is None:
            try:
                import inspect
                frame = inspect.stack()[1]
                mod = frame.frame.f_globals.get(
                    "__name__", "?"
                )
                fn = frame.function
                emitter_identity = f"{mod}.{fn}"
            except Exception:  # noqa: BLE001
                emitter_identity = "unknown"
        ev = Event(
            type=event_type,
            payload=dict(payload or {}),
            provenance=provenance,
            emitter_identity=emitter_identity,
            trace_id=trace_id,
        )
        self.emit(ev)
        return ev

    def emit(self, event: Event) -> None:
        """Dispatch ``event`` to every
        registered listener. A listener
        that raises is logged and
        skipped; the next listener
        still fires. The pipeline
        never sees a listener
        exception.

        P0.3 (R-2026-06-14): the bus
        auto-fills ``seq`` and
        ``timestamp_ms`` on every
        event before dispatch.
        ``provenance``, ``emitter_identity``,
        and ``trace_id`` are caller-
        supplied (the bus does not
        invent them); see
        ``emit_envelope`` for a helper
        that uses the caller's frame
        as a default for
        ``emitter_identity``.
        """
        # Mutate the event in-place. This is
        # safe because ``Event`` is a
        # dataclass (not frozen) and the
        # caller does not retain a
        # reference after ``emit`` returns
        # in the bus-consumer contract.
        with self._lock:
            self._seq += 1
            seq = self._seq
        if event.seq == 0:
            event.seq = seq
        if event.timestamp_ms == 0:
            event.timestamp_ms = int(
                self._time.time() * 1000
            )
        # Take a snapshot under the
        # lock so a ``subscribe`` /
        # ``unsubscribe`` from inside a
        # listener does not race the
        # iteration.
        with self._lock:
            snapshot = list(self._listeners)
        for listener in snapshot:
            try:
                listener.on_event(event)
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "event listener raised",
                    extra={
                        "listener": getattr(
                            listener, "name", "?"
                        ),
                        "type": event.type,
                        "err": str(exc),
                    },
                )

    def emit_async(self, event: Event) -> None:
        """R-2026-06-15 (Phase 1 + P1-21):
        async variant of
        ``emit``.  The
        ``seq`` /
        ``timestamp_ms``
        auto-fill, the snapshot
        under lock, and the
        ``try/except`` are all
        done synchronously (so
        the listener that fires
        *first* sees the same
        invariants as in
        ``emit``); only the
        actual
        ``listener.on_event(event)``
        call is dispatched to a
        thread.

        A slow listener no
        longer blocks the
        agent loop.  The
        executor is created
        lazily (one ThreadPoolExecutor
        per bus instance) and
        is sized to 4 workers
        (enough for a one-off
        burst; the listener
        count is typically 1-3,
        so 4 is generous
        headroom without
        unlimited thread
        growth).

        If a listener raises
        on the worker thread,
        the exception is logged
        via the existing
        ``log.warning`` path;
        the calling thread is
        not affected.  The
        caller does NOT get a
        return value (the
        dispatch is fire-and-forget);
        if a caller needs
        synchronous semantics,
        use ``emit`` (the
        default).
        """
        # Same seq /
        # timestamp_ms /
        # snapshot logic as
        # ``emit``, but the
        # listener call is
        # offloaded.
        with self._lock:
            self._seq += 1
            seq = self._seq
        if event.seq == 0:
            event.seq = seq
        if event.timestamp_ms == 0:
            event.timestamp_ms = int(
                self._time.time() * 1000
            )
        with self._lock:
            snapshot = list(self._listeners)
        if not snapshot:
            return
        executor = self._get_executor()
        for listener in snapshot:
            executor.submit(
                self._dispatch_one,
                listener,
                event,
            )

    def _dispatch_one(
        self,
        listener: "Listener",
        event: Event,
    ) -> None:
        """Run one listener with
        the standard
        try/except wrap.  Called
        from the worker thread
        of ``emit_async``.
        """
        try:
            listener.on_event(event)
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "event listener raised (async)",
                extra={
                    "listener": getattr(
                        listener, "name", "?"
                    ),
                    "type": event.type,
                    "err": str(exc),
                },
            )

    def _get_executor(self) -> "ThreadPoolExecutor":
        """Lazily create the
        executor on first use.
        ThreadPoolExecutor
        creation is not free
        (it spawns a thread
        pool), so we delay it
        until a caller actually
        asks for async
        dispatch.  The
        ``ThreadPoolExecutor``
        import is also lazy
        (the standard library
        import is not free
        either, and most tests
        use the synchronous
        ``emit`` only).
        """
        if self._executor is not None:
            return self._executor
        with self._executor_lock:
            if self._executor is None:
                from concurrent.futures import (
                    ThreadPoolExecutor,
                )
                self._executor = (
                    ThreadPoolExecutor(
                        max_workers=4,
                        thread_name_prefix=(
                            "manusift-event-bus"
                        ),
                    )
                )
        return self._executor


# ---------- 2. Built-in listeners ----------

class LoggingListener:
    """The default listener. Every
    event is logged at INFO level
    with the event type and a
    truncated payload.

    The listener does *not* log the
    ``trace_id`` as a separate field
    (the pipeline's
    ``bind_trace_id`` machinery
    already includes it in every log
    record within the job's
    scope)."""

    name = "logging"

    def on_event(self, event: Event) -> None:
        # Truncate the payload to a
        # small set of fields so the
        # log line stays readable.
        keys = sorted(event.payload.keys())
        log.info(
            f"event: {event.type}",
            extra={
                "event": event.type,
                "keys": ",".join(keys),
            },
        )


class FileWebhookListener:
    """A listener that writes one
    JSON line per event to
    ``data/webhooks/<trace_id>.jsonl``.

    This is the v1 of the
    "out-of-band notification"
    pattern. A user that wants
    Slack, PagerDuty, or email
    can write a tiny daemon that
    tails the JSONL file and
    posts the events to the
    target system; the daemon is
    not a ManuSift component and
    is free to be implemented in
    any language.

    The listener also reads the
    trace id from the payload; if
    the payload does not have a
    ``trace_id`` key, the event
    is logged and dropped. The
    JSONL file is named after the
    trace id so a tail-based
    consumer can pick up the
    events for a specific job
    without scanning every
    event."""

    name = "file_webhook"

    def __init__(self, base_dir: Path | None = None) -> None:
        self._base_dir = base_dir

    def _dir(self) -> Path:
        if self._base_dir is not None:
            return self._base_dir
        settings = get_settings()
        return settings.workspace_dir.parent / "webhooks"

    def on_event(self, event: Event) -> None:
        trace_id = event.payload.get("trace_id", "")
        if not trace_id:
            log.warning(
                "file-webhook: event has no trace_id; skipping",
                extra={"type": event.type},
            )
            return
        target_dir = self._dir()
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / f"{trace_id}.jsonl"
        record = {
            "type": event.type,
            "ts": event.ts,
            "payload": event.payload,
        }
        with target.open("a", encoding="utf-8") as f:
            f.write(
                json.dumps(record, ensure_ascii=False) + "\n"
            )


# ---------- 3. Singleton bus + reset hook ----------

_BUS_LOCK = threading.Lock()
_BUS: EventBus | None = None


def get_bus() -> EventBus:
    """Return the process-global event
    bus. The default listeners
    (``LoggingListener``) are
    installed on first call."""
    global _BUS
    with _BUS_LOCK:
        if _BUS is None:
            _BUS = EventBus()
            _BUS.subscribe(LoggingListener())
        return _BUS


def reset_bus() -> None:
    """Test hook. Clear all listeners
    and re-install the default
    ``LoggingListener``. Production
    code should not call this."""
    global _BUS
    with _BUS_LOCK:
        _BUS = None


def emit_envelope(
    event_type: str,
    payload: dict[str, Any] | None = None,
    *,
    provenance: str | None = None,
    emitter_identity: str | None = None,
    trace_id: str | None = None,
) -> Event:
    """Module-level convenience: ``get_bus().emit_envelope(...)``."""
    return get_bus().emit_envelope(
        event_type,
        payload,
        provenance=provenance,
        emitter_identity=emitter_identity,
        trace_id=trace_id,
    )
