"""R-2026-06-14: long-task heartbeat emitter.

Covers issue 11 (TUI freezes for X minutes during a
long tool, the user has no way to tell whether the
tool is still working or hung). The fix is a
small background thread that periodically emits a
``task.heartbeat`` event on the EventBus while a
long-running tool is executing. The TUI subscribes
to ``task.heartbeat`` and renders a per-tool row
"elapsed=42s, last_event=image_dup".

Pattern follows claw-code's
``HookProgressEvent`` (see
``external_repos/claw-code/rust/crates/runtime/src/hooks.rs``).
"""
from __future__ import annotations

import threading
import time
from typing import Any

from ..events import Event, get_bus


# Lock so two ``LongTask`` blocks at the same time
# don't clobber the bus listener count.
_lock = threading.Lock()


class LongTaskHeartbeat:
    """Context manager: emit ``task.heartbeat`` events
    every ``interval_seconds`` until the block exits.

    Usage:

        with LongTaskHeartbeat(tool="image_dup", interval_seconds=2.0) as hb:
            for chunk in image_dup.iter_chunks(pdf_path):
                process(chunk)
                hb.tick(extra={"chunks_done": i})

    The ``__exit__`` emits a final ``task.finished``
    event so the TUI can close the row.

    The heartbeat thread is a daemon: it will be
    killed when the process exits. There is no
    leak; ``__exit__`` waits for the thread to
    stop (with a small grace period) so the bus
    listener is unsubscribed before the user sees
    the result.
    """

    _seq = 0  # monotonic per-session sequence

    def __init__(
        self,
        tool: str,
        interval_seconds: float = 5.0,
        trace_id: str | None = None,
        subagent_id: str | None = None,
    ) -> None:
        self.tool = tool
        self.interval_seconds = max(0.1, interval_seconds)
        self.trace_id = trace_id
        self.subagent_id = subagent_id
        self._t0 = time.monotonic()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._ticked = 0
        self._last_extra: dict[str, Any] = {}
        self._bus = get_bus()
        with _lock:
            LongTaskHeartbeat._seq += 1
            self._seq_id = LongTaskHeartbeat._seq

    def __enter__(self) -> "LongTaskHeartbeat":
        # Announce the start.
        self._bus.emit(Event(
            "task.started",
            {
                "tool": self.tool,
                "trace_id": self.trace_id,
                "subagent_id": self.subagent_id,
                "seq_id": self._seq_id,
                "interval_seconds": self.interval_seconds,
            },
        ))
        self._t0 = time.monotonic()
        # Start the heartbeat thread.
        self._thread = threading.Thread(
            target=self._run,
            name=(
                f"heartbeat-{self.tool}-{self._seq_id}"
            ),
            daemon=True,
        )
        self._thread.start()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        # Stop the thread; wait briefly so the bus
        # listener count drops to zero.
        self._stop.set()
        if self._thread is not None:
            self._thread.join(
                timeout=self.interval_seconds + 0.5
            )
        elapsed = time.monotonic() - self._t0
        self._bus.emit(Event(
            "task.finished",
            {
                "tool": self.tool,
                "trace_id": self.trace_id,
                "subagent_id": self.subagent_id,
                "seq_id": self._seq_id,
                "elapsed_seconds": round(elapsed, 3),
                "ticked": self._ticked,
                "last_extra": dict(self._last_extra),
                "ok": exc_type is None,
                "error": (
                    None
                    if exc_type is None
                    else f"{exc_type.__name__}: {exc}"
                ),
            },
        ))

    def tick(self, extra: dict[str, Any] | None = None) -> None:
        """Mark progress. The next ``task.heartbeat``
        event will include ``extra`` as
        ``payload["last_extra"]``.
        """
        self._ticked += 1
        if extra is not None:
            self._last_extra = dict(extra)

    def _run(self) -> None:
        """Thread body: emit heartbeat events every
        ``interval_seconds`` until ``_stop`` is set.
        """
        while not self._stop.wait(self.interval_seconds):
            elapsed = time.monotonic() - self._t0
            self._bus.emit(Event(
                "task.heartbeat",
                {
                    "tool": self.tool,
                    "trace_id": self.trace_id,
                    "subagent_id": self.subagent_id,
                    "seq_id": self._seq_id,
                    "elapsed_seconds": round(elapsed, 3),
                    "ticked": self._ticked,
                    "last_extra": dict(self._last_extra),
                },
            ))


def heartbeat(
    tool: str,
    interval_seconds: float = 5.0,
) -> "LongTaskHeartbeat":
    """Functional alias for ``LongTaskHeartbeat(tool, ...)``.

    Lets a long tool be wrapped with a single line:

        with heartbeat("image_dup"):
            do_long_work()
    """
    return LongTaskHeartbeat(
        tool=tool, interval_seconds=interval_seconds
    )
