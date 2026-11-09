"""Rate-limit strategy registry (Step E2).

Pre-E2, the in-process rate limiter was
hard-coded to a per-IP rolling
60-second window (see
``manusift/web/app.py:rate_limit_middleware``).
A multi-tenant deployment that wants
per-API-key or token-bucket fairness
had to fork the middleware. The
configuration flag was a single
``rate_limit_per_minute`` integer.

E2 introduces a ``RateLimitStrategy``
Protocol with the following surface:

  * ``name`` (str): the registered
    name of the strategy (``"per_ip"``,
    ``"per_api_key"``, ``"token_bucket"``).
  * ``max_calls`` (int): the
    per-window cap. Read from
    ``settings.rate_limit_per_minute``.
  * ``check(client_id: str) -> bool``:
    return True if the request is
    allowed; record the request and
    return False if the cap is
    exceeded.
  * ``reset() -> None``: a test hook
    that clears the strategy's
    in-memory state.

Three built-in strategies ship:

  * ``PerIpStrategy`` — the pre-E2
    behavior: a rolling 60-second
    window per client IP.
  * ``PerApiKeyStrategy`` — same
    shape as ``PerIpStrategy`` but the
    ``client_id`` is the ``X-API-Key``
    request header (falling back to
    the client IP for unauthenticated
    traffic).
  * ``TokenBucketStrategy`` — a
    token-bucket implementation: each
    caller has a bucket that refills
    at a fixed rate; a request
    consumes one token; an empty
    bucket returns False. This is
    the canonical "smooth" rate
    limiter (no burst at window
    boundaries).

Guarantees:

  1. ``list_strategies()`` returns the
     sorted names of every registered
     strategy.
  2. ``get_strategy(name)`` returns a
     strategy with the given name, or
     raises ``StrategyNotFound``.
  3. Each strategy is process-global
     (a singleton). Tests use
     ``reset_all()`` to clear state.
  4. A strategy whose ``max_calls`` is
     0 (or negative) is a no-op
     (``check`` always returns True);
     this is the pre-E2 ``disable``
     semantics.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Protocol, runtime_checkable

from .trace import get_logger

log = get_logger(__name__)


class StrategyNotFound(LookupError):
    """Raised when ``get_strategy(name)`` is
    called for a name that has not been
    registered."""


@runtime_checkable
class RateLimitStrategy(Protocol):
    """A drop-in rate-limit strategy.

    The Protocol is intentionally tiny.
    A third-party plugin implements
    the three members and registers
    via the ``manusift.rate_limiters``
    entry-point group; the
    ``rate_limit_middleware`` in
    ``web/app.py`` picks the strategy
    at request time based on
    ``settings.rate_limit_strategy``.
    """

    name: str

    def check(self, client_id: str) -> bool:
        """Return True if the request
        from ``client_id`` is allowed;
        record the request and return
        False otherwise. The caller
        (the rate-limit middleware)
        responds with 429 on a False
        return.
        """
        ...

    def reset(self) -> None:
        """Clear the strategy's
        in-memory state. Test-only;
        production code should not
        call this."""
        ...


# ---------- 1. Built-in strategies ----------

@dataclass
class _SlidingWindowState:
    """The state for a sliding-window
    strategy: per-client id, a deque
    of monotonic-clock timestamps of
    recent requests."""
    hits: dict[str, list[float]] = field(default_factory=dict)
    lock: threading.Lock = field(default_factory=threading.Lock)


class PerIpStrategy:
    """The pre-E2 behavior: a rolling
    60-second window per client IP.

    The implementation uses
    ``time.monotonic`` so a forward
    jump in wall-clock time (e.g.
    NTP correction) cannot
    prematurely expire entries.
    """

    name = "per_ip"
    WINDOW_SECONDS = 60.0

    def __init__(self, max_calls: int = 0) -> None:
        self.max_calls = max_calls
        self._state = _SlidingWindowState()

    def check(self, client_id: str) -> bool:
        if self.max_calls <= 0:
            return True
        now = time.monotonic()
        with self._state.lock:
            window = self._state.hits.setdefault(client_id, [])
            # Drop entries older than
            # ``WINDOW_SECONDS``.
            cutoff = now - self.WINDOW_SECONDS
            while window and window[0] < cutoff:
                window.pop(0)
            if len(window) >= self.max_calls:
                return False
            window.append(now)
        return True

    def reset(self) -> None:
        with self._state.lock:
            self._state.hits.clear()


class PerApiKeyStrategy:
    """Same shape as ``PerIpStrategy``
    but the ``client_id`` is the
    ``X-API-Key`` request header. An
    empty header falls back to the
    client IP (unauthenticated
    callers share the default
    bucket).

    Note: this strategy is stateless
    on its own. The middleware is
    responsible for extracting the
    header and passing the right
    ``client_id`` to ``check()``.
    """

    name = "per_api_key"
    WINDOW_SECONDS = 60.0

    def __init__(self, max_calls: int = 0) -> None:
        self.max_calls = max_calls
        self._state = _SlidingWindowState()

    def check(self, client_id: str) -> bool:
        # Identical to PerIpStrategy.
        # The middleware is the
        # component that distinguishes
        # an API key from a client IP
        # when it builds the
        # ``client_id`` string.
        return _sliding_window_check(
            self._state, client_id, self.max_calls,
            self.WINDOW_SECONDS,
        )

    def reset(self) -> None:
        with self._state.lock:
            self._state.hits.clear()


def _sliding_window_check(
    state: _SlidingWindowState,
    client_id: str,
    max_calls: int,
    window_seconds: float,
) -> bool:
    """Shared implementation of the
    sliding-window check. Both
    ``PerIpStrategy`` and
    ``PerApiKeyStrategy`` use the
    same algorithm; the only
    difference between them is the
    intent of the ``client_id``
    parameter (an IP vs an API key).
    """
    if max_calls <= 0:
        return True
    now = time.monotonic()
    with state.lock:
        window = state.hits.setdefault(client_id, [])
        cutoff = now - window_seconds
        while window and window[0] < cutoff:
            window.pop(0)
        if len(window) >= max_calls:
            return False
        window.append(now)
    return True


class TokenBucketStrategy:
    """A token-bucket implementation.

    Each caller has a bucket of
    ``max_calls`` tokens. Tokens
    refill at ``max_calls`` per
    60 seconds (a uniform rate). A
    request consumes one token; an
    empty bucket returns False.

    Unlike the sliding-window
    strategies, the token-bucket
    implementation does not let a
    caller burst ``max_calls`` at a
    window boundary — instead, the
    bucket starts full and refills
    continuously, so a caller can
    spend up to ``max_calls``
    immediately and then waits for
    the bucket to refill before the
    next call is allowed.
    """

    name = "token_bucket"
    REFILL_PERIOD_SECONDS = 60.0

    def __init__(
        self,
        max_calls: int = 0,
        *,
        clock: Callable[[], float] | None = None,
    ) -> None:
        self.max_calls = max_calls
        self._clock = clock or time.monotonic
        # ``client_id`` -> (tokens,
        # last_refill_monotonic). A
        # request consumes a token and
        # the bucket refills at the
        # configured rate.
        self._buckets: dict[str, tuple[float, float]] = {}
        self._lock = threading.Lock()

    def check(self, client_id: str) -> bool:
        if self.max_calls <= 0:
            return True
        now = self._clock()
        with self._lock:
            tokens, last = self._buckets.get(
                client_id, (float(self.max_calls), now)
            )
            # Refill: ``(now - last) /
            # REFILL_PERIOD`` of a full
            # bucket, capped at
            # ``max_calls``.
            refill_rate = self.max_calls / self.REFILL_PERIOD_SECONDS
            tokens = min(
                float(self.max_calls),
                tokens + (now - last) * refill_rate,
            )
            if tokens < 1.0:
                # Not enough tokens; deny.
                # Record the (unchanged)
                # tokens so the next call
                # continues to refill.
                self._buckets[client_id] = (tokens, now)
                return False
            tokens -= 1.0
            self._buckets[client_id] = (tokens, now)
        return True

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()


# ---------- 2. Registry ----------

_STRATEGIES: dict[str, type[RateLimitStrategy]] = {}
_STRATEGIES_LOCK = threading.Lock()


def register_strategy(cls: type[RateLimitStrategy]) -> None:
    """Insert a strategy class into the
    global registry. Used by
    third-party plugins via the
    ``manusift.rate_limiters`` entry
    point group."""
    with _STRATEGIES_LOCK:
        _STRATEGIES[cls.name] = cls


def _register_builtins() -> None:
    """Insert the built-in strategies
    into the global registry. Called
    once at module import time."""
    for cls in (PerIpStrategy, PerApiKeyStrategy, TokenBucketStrategy):
        _STRATEGIES[cls.name] = cls


def list_strategies() -> list[str]:
    """Return the sorted names of every
    registered strategy."""
    _register_builtins()  # idempotent
    with _STRATEGIES_LOCK:
        return sorted(_STRATEGIES.keys())


def get_strategy(name: str, max_calls: int) -> RateLimitStrategy:
    """Return an instance of the
    strategy registered under ``name``
    with the given ``max_calls``.
    Raises ``StrategyNotFound`` if no
    strategy is registered under that
    name."""
    _register_builtins()  # idempotent
    with _STRATEGIES_LOCK:
        cls = _STRATEGIES.get(name)
    if cls is None:
        raise StrategyNotFound(
            f"no rate-limit strategy named {name!r} "
            f"(available: {', '.join(list_strategies())})"
        )
    return cls(max_calls=max_calls)


def _iter_entrypoint_strategies() -> list[type[RateLimitStrategy]]:
    """Yield strategy classes registered
    as third-party entry points."""
    try:
        from importlib.metadata import entry_points
    except ImportError:  # pragma: no cover
        return []
    eps = entry_points()
    group = (
        eps.select(group="manusift.rate_limiters")
        if hasattr(eps, "select")
        else eps.get("manusift.rate_limiters", [])  # type: ignore[union-attr]
    )
    out: list[type[RateLimitStrategy]] = []
    for ep in group:
        try:
            cls = ep.load()
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "could not load rate-limit entry point",
                extra={"ep": ep.name, "err": str(exc)},
            )
            continue
        if not all(
            hasattr(cls, attr)
            for attr in ("name", "check", "reset")
        ):
            log.warning(
                "rate-limit entry point does not implement the protocol",
                extra={"ep": ep.name},
            )
            continue
        out.append(cls)  # type: ignore[arg-type]
    return out
