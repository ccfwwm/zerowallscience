"""Hook registry (Step E5).

Pre-E5, the pipeline had three
single-receiver hooks:

  * ``on_step_complete`` — fired
    after every detector; the web
    layer passed a closure that
    updated the in-memory job
    registry.
  * ``_emit_audit`` — fired for
    every tool call; the audit
    sink was a list-append function
    wired into ``AgentLoop``.
  * ``_bump(metric)`` — fired for
    every Prometheus counter; the
    sink was a single function in
    ``web/app.py``.

Each of these hooks had exactly one
caller and one receiver. A new
subscriber (e.g. a Slack notifier
that fires on every tool call) had
to fork the calling site. The
situation was three of the same
bug, dressed in three different
syntaxes.

E5 introduces a single
``HookRegistry`` that supports an
arbitrary number of subscribers per
hook name. The pipeline and the
agent loop call ``hooks.dispatch(
"on_step", res, job_state)`` and
the registry fans the call out to
every registered subscriber. The
default subscriber set is empty;
the host wires its own
``on_step_complete`` closure in
``create_app`` via
``hooks.subscribe("on_step", ...);``.

A subscriber that raises is logged
and skipped — the other subscribers
still fire. The pipeline never sees
a subscriber exception.

A subscriber's return value is
ignored; the registry does not
aggregate. A future E5+ could let
``on_step`` return a transformed
``DetectorResult`` and aggregate
the returned values; for v1 the
hook is fire-and-forget.

Guarantees:

  1. ``subscribe(name, fn)`` returns
     a handle that can be passed to
     ``unsubscribe`` for symmetry.
     The ``unsubscribe`` is a no-op
     for an unknown handle.
  2. ``dispatch(name, *args, **kwargs)``
     invokes every registered
     subscriber in registration
     order. A subscriber that raises
     is logged and skipped; the
     next subscriber still fires.
  3. ``iter_entrypoint_hooks()``
     yields ``(name, fn)`` tuples
     from the ``manusift.hooks``
     entry-point group. The
     returned callables are
     registered automatically on
     the global registry so a
     third-party plugin can wire
     its own subscriber.
  4. ``reset_hooks`` is a test hook
     that clears every subscriber.
"""
from __future__ import annotations

import logging
from importlib import metadata
from typing import Any, Callable

from .trace import get_logger

log = get_logger(__name__)


class HookRegistry:
    """A simple hook registry.

    The registry is process-global.
    Subscribers are organized by
    hook name; an unknown hook name
    is created on first subscribe.
    A dispatch to a hook name with
    no subscribers is a no-op (not
    an error)."""

    def __init__(self) -> None:
        self._subscribers: dict[str, list[Callable[..., Any]]] = {}
        self._lock = __import__("threading").Lock()

    def subscribe(
        self,
        name: str,
        fn: Callable[..., Any],
    ) -> Callable[..., Any]:
        """Register ``fn`` as a
        subscriber for ``name``.
        Returns ``fn`` for symmetric
        ``unsubscribe`` use."""
        with self._lock:
            self._subscribers.setdefault(name, []).append(fn)
        return fn

    def unsubscribe(
        self,
        name: str,
        fn: Callable[..., Any],
    ) -> None:
        """Remove ``fn`` from the
        subscribers of ``name``. A
        no-op for an unknown hook
        name or an unknown function."""
        with self._lock:
            subs = self._subscribers.get(name, [])
            try:
                subs.remove(fn)
            except ValueError:
                pass

    def subscribers(
        self, name: str
    ) -> list[Callable[..., Any]]:
        """Return a snapshot of the
        subscribers for ``name``."""
        with self._lock:
            return list(self._subscribers.get(name, []))

    def dispatch(
        self,
        name: str,
        *args: Any,
        **kwargs: Any,
    ) -> None:
        """Invoke every subscriber of
        ``name`` in registration
        order. A subscriber that
        raises is logged and skipped;
        the next subscriber still
        fires."""
        with self._lock:
            snapshot = list(self._subscribers.get(name, []))
        for fn in snapshot:
            try:
                fn(*args, **kwargs)
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "hook subscriber raised",
                    extra={
                        "hook": name,
                        "fn": getattr(fn, "__name__", "?"),
                        "err": str(exc),
                    },
                )

    def clear(self, name: str | None = None) -> None:
        """Remove every subscriber
        from ``name`` (or from every
        hook when ``name`` is None).
        Test-only; production code
        should not call this."""
        with self._lock:
            if name is None:
                self._subscribers.clear()
            else:
                self._subscribers.pop(name, None)


# ---------- 2. Singleton + reset hook ----------

_HOOKS_LOCK = __import__("threading").Lock()
_HOOKS: HookRegistry | None = None


def get_hooks() -> HookRegistry:
    """Return the process-global
    ``HookRegistry``. The registry
    starts empty; the host wires
    its own subscribers in
    ``create_app`` (or equivalent)."""
    global _HOOKS
    with _HOOKS_LOCK:
        if _HOOKS is None:
            _HOOKS = HookRegistry()
        return _HOOKS


def reset_hooks() -> None:
    """Test hook. Clear every
    subscriber from every hook.
    Production code should not
    call this."""
    global _HOOKS
    with _HOOKS_LOCK:
        _HOOKS = None


# ---------- 3. Entry-point discovery ----------

ENTRY_POINT_GROUP = "manusift.hooks"


def iter_entrypoint_hooks() -> list[tuple[str, Callable[..., Any]]]:
    """Yield ``(name, fn)`` tuples
    from the ``manusift.hooks``
    entry-point group. The entry
    point's ``.load()`` is expected
    to return a *callable*, not a
    class. The entry point's name
    (the part after the ``=``) is
    the hook name; a plugin that
    wants to register the same
    callable under multiple hook
    names is free to return a list
    of ``(name, fn)`` tuples from
    a single entry point.

    The returned callables are
    auto-registered on the global
    registry so a third-party
    plugin can wire its own
    subscriber without touching
    ManuSift's source code.
    """
    try:
        eps = metadata.entry_points(group=ENTRY_POINT_GROUP)
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "could not load entry_points for %s",
            extra={
                "group": ENTRY_POINT_GROUP,
                "err": str(exc),
            },
        )
        return []
    out: list[tuple[str, Callable[..., Any]]] = []
    for ep in eps:
        try:
            target = ep.load()
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "could not load hook entry point",
                extra={"ep": ep.name, "err": str(exc)},
            )
            continue
        # An entry point may yield
        # one callable, or a list of
        # ``(name, fn)`` tuples. We
        # accept both shapes.
        if callable(target) and not isinstance(target, type):
            out.append((ep.name, target))
        elif isinstance(target, list):
            for item in target:
                if (
                    isinstance(item, tuple)
                    and len(item) == 2
                    and callable(item[1])
                    and isinstance(item[0], str)
                ):
                    out.append((item[0], item[1]))
        else:
            log.warning(
                "hook entry point did not return "
                "a callable or a list of tuples",
                extra={"ep": ep.name},
            )
    # Auto-register on the global
    # registry so a third-party
    # plugin can wire its own
    # subscriber without the host
    # calling ``subscribe()``
    # explicitly.
    for name, fn in out:
        get_hooks().subscribe(name, fn)
    return out
