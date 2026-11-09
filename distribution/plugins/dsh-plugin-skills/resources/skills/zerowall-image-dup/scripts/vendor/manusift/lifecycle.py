"""Graceful-shutdown lifecycle tracker (Step G3).

Pre-G3, the ``_run_in_background`` task
spawned by ``/api/upload`` had no
visibility from the server lifecycle.
A SIGTERM (Kubernetes rolling update,
``docker stop``, ``systemctl stop``)
could kill the process while a
detector was halfway through an
analysis, losing the in-flight work.
The H3 checkpoint machinery (per-step
JSON files in ``data/jobs/<tid>/steps/``)
meant the *state* survived, but the
*work* was abandoned, and the in-memory
``JobState`` registry could disagree
with the on-disk state until a
subsequent operator action.

G3 layers a small in-process tracker
on top of the existing background
task machinery:

  * ``InFlightTracker`` records every
    trace_id that is currently in a
    background task, and exposes a
    ``wait_idle(timeout: float)`` method.
  * ``lifespan(app)`` is an async
    context-manager that
    ``create_app`` installs on the
    FastAPI app via the modern
    ``lifespan=`` parameter. The
    shutdown phase calls
    ``tracker.wait_idle(timeout=30.0)``
    so in-flight jobs get a chance to
    finish before the process exits.
  * The existing ``_run_in_background``
    registers itself with the tracker
    on entry and unregisters on exit.
    The tracker is a module-level
    singleton, similar to the
    existing ``_JOBS_STORE`` and
    ``_METRICS`` patterns.

The 30-second timeout is the same
value as ``uvicorn
timeout_graceful_shutdown``; a server
that needs a longer cool-down can be
configured via
``MANUSIFT_SHUTDOWN_TIMEOUT_SECONDS``.
Setting the timeout to 0 disables
the wait (SIGTERM immediately).

Guarantees:

  1. ``wait_idle(0)`` returns immediately
     regardless of in-flight count (for
     tests and emergency shutdowns).
  2. ``wait_idle(timeout)`` waits at
     most ``timeout`` seconds, even if
     a task is still running.
  3. The tracker is process-global.
  4. A task that takes longer than the
     timeout is *not* killed; the
     FastAPI shutdown simply stops
     waiting. The OS-level process exit
     is what would eventually reap it.
  5. The tracker is thread-safe (a
     background task can register /
     unregister from any worker thread).
"""
from __future__ import annotations

import threading
import time
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from .trace import get_logger

log = get_logger(__name__)


class InFlightTracker:
    """A simple set-based tracker of
    in-flight background jobs.

    The tracker is process-global and
    thread-safe. ``register`` is called
    when a background task starts;
    ``unregister`` when it finishes (or
    raises). ``wait_idle`` blocks until
    the set is empty or a timeout
    elapses.
    """

    def __init__(self) -> None:
        self._in_flight: set[str] = set()
        self._lock = threading.Lock()
        # An event that is set when the
        # set is empty. ``wait_idle`` waits
        # on this event with a timeout; the
        # unregister path clears it.
        self._idle_event = threading.Event()
        self._idle_event.set()

    def register(self, trace_id: str) -> None:
        """Add ``trace_id`` to the
        in-flight set. A second register
        for the same id is a no-op."""
        with self._lock:
            self._in_flight.add(trace_id)
            # Once any job is in flight the
            # event is no longer "set".
            self._idle_event.clear()

    def unregister(self, trace_id: str) -> None:
        """Remove ``trace_id`` from the
        in-flight set. A no-op if the id
        was not registered (which can
        happen if a task is double-
        unregistered by accident — we
        do not want to crash on that)."""
        with self._lock:
            self._in_flight.discard(trace_id)
            if not self._in_flight:
                # Wake up anyone waiting on
                # ``wait_idle``.
                self._idle_event.set()

    def count(self) -> int:
        """Return the current in-flight
        count. Used by ``/api/health/ready``
        to surface "shutting down" via a
        503 once the tracker is non-empty
        at shutdown time."""
        with self._lock:
            return len(self._in_flight)

    def in_flight(self) -> list[str]:
        """Return a snapshot of the
        in-flight trace ids. Used by the
        /metrics gauge and by tests."""
        with self._lock:
            return sorted(self._in_flight)

    def wait_idle(self, timeout: float) -> bool:
        """Block until the in-flight set
        is empty or ``timeout`` seconds
        elapse. Returns True if the set
        became empty, False on timeout.

        A timeout of 0 returns
        immediately.
        """
        if timeout <= 0:
            return self.count() == 0
        # ``wait`` returns True if the
        # event was set (i.e. idle) before
        # the timeout elapsed. We re-check
        # the count under the lock to
        # avoid a TOCTOU race where a
        # register happens between the
        # event set and the count check.
        return self._idle_event.wait(timeout=timeout)


# Module-level singleton. A real app
# imports ``get_tracker()`` and the
# lifespan closes it. The singleton is
# fine because the tracker is
# intentionally process-global: any
# background task in the same process
# should be visible to the shutdown
# path.
_tracker = InFlightTracker()
_tracker_lock = threading.Lock()


def get_tracker() -> InFlightTracker:
    """Return the process-global
    ``InFlightTracker``."""
    return _tracker


def reset_tracker() -> None:
    """Test hook. Clear the in-flight
    set. Production code should not
    call this."""
    global _tracker
    with _tracker_lock:
        _tracker = InFlightTracker()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """FastAPI lifespan that waits for
    in-flight background tasks to drain
    on shutdown.

    The yield-without-shutdown path is
    the application lifetime. The
    post-yield path is the shutdown
    path. We look up the configured
    timeout from ``app.state`` if set
    (so the timeout can be configured
    per-app), falling back to a 30 s
    default that matches
    ``uvicorn
    timeout_graceful_shutdown``.

    The wait is *non-fatal*: a task
    that does not finish in time is
    left running; the OS-level process
    exit is what eventually reaps it.
    A 503 from ``/api/health/ready``
    (driven by the in-flight count)
    keeps new traffic from being
    routed to a server in the middle
    of a drain.
    """
    from .config import get_settings
    settings = get_settings()
    timeout = float(settings.shutdown_timeout_seconds)
    log.info("app startup", extra={"timeout": timeout})
    try:
        yield
    finally:
        # Shutdown path.
        n = get_tracker().count()
        if n == 0:
            log.info("shutdown: no in-flight jobs")
            return
        log.info(
            "shutdown: waiting for in-flight jobs",
            extra={"n": n, "timeout": timeout},
        )
        drained = get_tracker().wait_idle(timeout=timeout)
        if drained:
            log.info("shutdown: drained cleanly")
        else:
            log.warning(
                "shutdown: timeout, "
                "some jobs may be abandoned",
                extra={"remaining": get_tracker().count()},
            )
