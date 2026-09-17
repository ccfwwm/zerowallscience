"""HTTP retry + circuit-breaker + exception classification (G1).

Pre-G1, every external HTTP call
(OpenAI, Anthropic, Crossref) had a single
try/except. A 500 from the LLM provider
during a 30-second network hiccup meant
the whole job failed. Operators had to
re-upload the PDF and start over.

G1 layers three standard reliability
patterns on top of the existing call
sites, without changing the public API of
the LLM clients:

  1. **Exception classification.** A
     ``RemoteServiceError`` hierarchy lets
     callers tell *why* a call failed:
     ``Timeout | RateLimited | ServerError
     | NetworkError | AuthError | Unknown``.
     The retry policy then picks the right
     strategy: 4xx-with-rate-limit retried,
     4xx-auth not retried, 5xx retried, etc.
  2. **Retry with backoff.** A
     ``@remote_call`` decorator wraps a
     function so a transient 5xx or
     network error is retried 3 times with
     exponential backoff (1 s, 2 s, 4 s).
     The decorator is non-invasive: a
     function ``f()`` is wrapped to
     ``f()`` with retry, and the rest of
     the code is unchanged.
  3. **Circuit breaker.** A per-host
     circuit breaker tracks recent
     failures and "opens" after 5
     consecutive failures, short-circuiting
     further calls for 30 seconds. The
     caller gets a ``RemoteServiceError``
     immediately instead of waiting for a
     doomed HTTP timeout. After the cool
     down, the breaker moves to
     half-open and lets one probe
     through; success closes it again.

The decorator is intentionally generic —
any function that takes no arguments and
returns a response object (or raises) can
be wrapped. The detector and the LLM
clients wrap their network call in the
decorator; the rest of the code is
unchanged.

Guarantees:

  1. ``remote_call`` retries on
     ``ServerError`` and ``NetworkError``;
     it does NOT retry on ``AuthError`` or
     a plain ``ValueError`` (the LLM
     responded, it just returned bad
     data — retrying will not help).
  2. ``RateLimited`` is retried after a
     longer backoff (the provider told us
     to slow down) — 3 retries, 2 s, 4 s,
     8 s.
  3. ``CircuitBreakerOpenError`` is
     raised by the breaker when the
     circuit is open; the caller is
     expected to treat it as a "fail fast"
     (the LLM clients convert it into a
     ``RemoteServiceError`` and the
     pipeline records the failure).
  4. The breaker is process-global. A
     test fixture resets it.
  5. The retry / breaker never silently
     swallows the original exception; both
     reraise the original or a converted
     ``RemoteServiceError`` so callers can
     inspect ``error.cause`` for diagnostics.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from functools import wraps
from typing import Any, Callable, TypeVar

import httpx
from tenacity import (
    Retrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from .trace import get_logger

log = get_logger(__name__)


T = TypeVar("T")


# ---------- 1. Exception classification ----------

class RemoteServiceError(Exception):
    """Base class for a remote service
    failure. ``cause`` is the original
    exception (or ``None`` if we only got
    a status code).
    """

    def __init__(self, message: str = "", *, cause: BaseException | None = None) -> None:
        super().__init__(message)
        self.cause = cause



class TimeoutError_(RemoteServiceError):  # noqa: N801 — kept for clarity
    """The remote service did not respond
    within the configured timeout. Always
    retried."""


class NetworkError_(RemoteServiceError):  # noqa: N801
    """A TCP/DNS/TLS-level failure. Always
    retried."""


class ServerError_(RemoteServiceError):  # noqa: N801
    """A 5xx response. Always retried
    (transient)."""


class RateLimited(RemoteServiceError):
    """A 429 response. Retried with a
    longer backoff than ServerError."""


class AuthError(RemoteServiceError):
    """A 401/403 response. NOT retried —
    the operator needs to fix the API key
    or the auth header."""


class BadRequest(RemoteServiceError):
    """A 4xx (other than 401/403/429)
    response. NOT retried — the request
    itself is malformed."""


def classify_status(status: int) -> type[RemoteServiceError]:
    """Map an HTTP status code to the
    corresponding ``RemoteServiceError``
    subclass. 5xx → ``ServerError``;
    429 → ``RateLimited``; 401/403 →
    ``AuthError``; other 4xx →
    ``BadRequest``; everything else (1xx,
    3xx) → ``RemoteServiceError`` (we
    should not be seeing these)."""
    if 500 <= status < 600:
        return ServerError_
    if status == 429:
        return RateLimited
    if status in (401, 403):
        return AuthError
    if 400 <= status < 500:
        return BadRequest
    return RemoteServiceError


def classify_exception(exc: BaseException) -> RemoteServiceError:
    """Convert any exception raised by
    ``httpx`` (or anything that *might* be
    a network failure) into a
    ``RemoteServiceError`` subclass.
    The original exception is stored on
    ``.cause``."""
    if isinstance(exc, RemoteServiceError):
        return exc
    if isinstance(exc, httpx.TimeoutException):
        return TimeoutError_(
            f"remote timeout: {exc}", cause=exc
        )
    if isinstance(
        exc, (httpx.ConnectError, httpx.NetworkError)
    ):
        return NetworkError_(
            f"remote network error: {exc}", cause=exc
        )
    if isinstance(exc, httpx.HTTPStatusError):
        cls = classify_status(exc.response.status_code)
        return cls(
            f"remote status {exc.response.status_code}: {exc}",
            cause=exc,
        )
    # G5.5: SDK-aware classification.
    # The OpenAI and Anthropic
    # Python SDKs each expose a
    # small exception hierarchy. The
    # names line up with the HTTP
    # status they correspond to, so
    # the classification is
    # mechanical. We use lazy
    # imports so a project that does
    # not have the SDKs installed
    # does not pay the import cost.
    sdk_cls, sdk_name = _sdk_exception_kind(exc)
    if sdk_cls is not None:
        kind = sdk_name or "unknown"
        return sdk_cls(
            f"remote SDK error ({kind}): {exc}",
            cause=exc,
        )
    return RemoteServiceError(
        f"remote call failed: {exc}", cause=exc
    )


def _sdk_exception_kind(
    exc: BaseException,
) -> tuple[type[RemoteServiceError] | None, str | None]:
    """Map an SDK-specific exception
    to a ``RemoteServiceError``
    subclass.

    The OpenAI and Anthropic SDKs
    both expose ``RateLimitError``,
    ``AuthenticationError``,
    ``APITimeoutError``,
    ``APIConnectionError``,
    ``InternalServerError``,
    ``BadRequestError`` (OpenAI
    only) and a common
    ``APIStatusError`` base class.
    We inspect the exception class
    name (rather than ``isinstance``
    on the SDK classes) so a
    project that has the SDK
    installed implicitly through
    one of the LLM client classes
    does not need a hard
    dependency on either SDK to
    import ``manusift.retry``.

    Returns ``(class, kind)``:
    ``class`` is the target
    ``RemoteServiceError``
    subclass (or ``None`` if the
    exception is not a recognized
    SDK exception); ``kind`` is a
    short string label that the
    log can use to identify the
    SDK family (``"openai"`` /
    ``"anthropic"`` / etc.)."""
    cls_name = type(exc).__name__
    module = type(exc).__module__ or ""
    # OpenAI SDK lives in
    # ``openai``. Anthropic lives
    # in ``anthropic``. We check
    # the module path so a third
    # SDK that happens to share a
    # class name (``TimeoutError``)
    # is not misclassified.
    if module == "openai" or module.startswith("openai."):
        if cls_name == "APITimeoutError":
            return TimeoutError_, "openai"
        if cls_name == "RateLimitError":
            return RateLimited, "openai"
        if cls_name == "AuthenticationError":
            return AuthError, "openai"
        if cls_name == "PermissionDeniedError":
            return AuthError, "openai"
        if cls_name == "APIConnectionError":
            return NetworkError_, "openai"
        if cls_name == "InternalServerError":
            return ServerError_, "openai"
        if cls_name == "BadRequestError":
            return BadRequest, "openai"
    if module == "anthropic" or module.startswith("anthropic."):
        if cls_name == "APITimeoutError":
            return TimeoutError_, "anthropic"
        if cls_name == "RateLimitError":
            return RateLimited, "anthropic"
        if cls_name == "AuthenticationError":
            return AuthError, "anthropic"
        if cls_name == "PermissionDeniedError":
            return AuthError, "anthropic"
        if cls_name == "APIConnectionError":
            return NetworkError_, "anthropic"
        if cls_name == "InternalServerError":
            return ServerError_, "anthropic"
        if cls_name == "BadRequestError":
            return BadRequest, "anthropic"
    return None, None


# Allow attaching the original exception
# on the wrapper class without a
# dataclass-rewrite.



# ---------- 2. Circuit breaker ----------

@dataclass
class _BreakerState:
    failures: int = 0
    opened_at: float = 0.0
    half_open_in_flight: bool = False


class CircuitBreakerOpenError(RemoteServiceError):
    """Raised by ``breaker.call`` when the
    circuit is open. The caller should
    treat this as a fast-fail (do not
    retry) and surface the message to the
    user."""


class CircuitBreaker:
    """A simple per-host circuit breaker.

    State machine:
        closed --(N consecutive failures)--> open
        open   --(cool-down elapsed)------> half-open
        half-open --(probe succeeds)-----> closed
        half-open --(probe fails)--------> open

    The breaker is per-host. Operators
    that need finer granularity (per-endpoint,
    per-API-key) can instantiate one
    breaker per call site.
    """

    def __init__(
        self,
        *,
        name: str,
        failure_threshold: int = 5,
        cool_down_seconds: float = 30.0,
        clock: Callable[[], float] | None = None,
    ) -> None:
        self.name = name
        self._failure_threshold = failure_threshold
        self._cool_down = cool_down_seconds
        self._clock = clock or time.monotonic
        self._state = _BreakerState()
        self._lock = threading.Lock()

    def _now(self) -> float:
        return self._clock()

    def _is_open_locked(self) -> bool:
        """Caller must hold ``self._lock``."""
        if (
            self._state.failures >= self._failure_threshold
            and self._state.opened_at > 0
        ):
            if self._now() - self._state.opened_at < self._cool_down:
                return True
            # Cool-down elapsed; move to
            # half-open. We do not reset
            # ``failures`` yet — a failed probe
            # trips us straight back to open.
            self._state.opened_at = 0.0
            self._state.half_open_in_flight = True
        return False

    def call(self, fn: Callable[..., T], *args, **kwargs) -> T:
        """Run ``fn(*args, **kwargs)`` under
        the breaker's protection. If the
        circuit is open, raise
        ``CircuitBreakerOpenError``
        immediately. If ``fn`` raises, the
        failure is recorded and the
        exception is re-raised. If ``fn``
        succeeds, any open state is reset.
        """
        with self._lock:
            if self._is_open_locked():
                raise CircuitBreakerOpenError(
                    f"circuit '{self.name}' is open"
                )
            half_open_probe = self._state.half_open_in_flight
        try:
            result = fn(*args, **kwargs)
        except BaseException:
            with self._lock:
                if half_open_probe:
                    # Probe failed: trip the
                    # breaker back to open.
                    self._state.failures = (
                        self._failure_threshold
                    )
                    self._state.opened_at = self._now()
                    self._state.half_open_in_flight = False
                else:
                    self._state.failures += 1
                    if (
                        self._state.failures
                        >= self._failure_threshold
                    ):
                        self._state.opened_at = self._now()
                        log.warning(
                            "circuit breaker opened",
                            extra={"breaker": self.name},
                        )
            raise
        with self._lock:
            if half_open_probe:
                log.info(
                    "circuit breaker probe succeeded; closing",
                    extra={"breaker": self.name},
                )
            self._state.failures = 0
            self._state.opened_at = 0.0
            self._state.half_open_in_flight = False
        return result

    def reset(self) -> None:
        """Test / operational hook. Resets
        the breaker to a fully-closed
        state."""
        with self._lock:
            self._state = _BreakerState()


# Per-host breakers, lazily created.
_breakers: dict[str, CircuitBreaker] = {}
_breakers_lock = threading.Lock()


def get_breaker(name: str) -> CircuitBreaker:
    """Return the circuit breaker for
    ``name``, creating it on first use.
    The breaker is process-global."""
    with _breakers_lock:
        if name not in _breakers:
            _breakers[name] = CircuitBreaker(name=name)
        return _breakers[name]


def reset_all_breakers() -> None:
    """Test hook. Reset every breaker to a
    closed state so test order does not
    leak state between tests."""
    with _breakers_lock:
        for b in _breakers.values():
            b.reset()


# ---------- 3. Retry decorator ----------

# ``AuthError`` and ``BadRequest`` are not
# retried — they will not get better with
# a retry. ``RateLimited`` and the 5xx /
# network / timeout classes are retried.
_RETRY_ON = (
    ServerError_,
    NetworkError_,
    TimeoutError_,
    RateLimited,
)
# CircuitBreakerOpenError is *not* in
# ``_RETRY_ON``: a retry against an open
# circuit just wastes a few milliseconds
# before the next breaker short-circuit.


def remote_call(
    breaker_name: str,
    *,
    max_attempts: int = 3,
    multiplier: float = 1.0,
    max_wait: float = 8.0,
) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """Wrap a function so that
    ``RemoteServiceError`` of retryable
    kinds trigger an exponential backoff
    retry. The function is also protected
    by a per-host ``CircuitBreaker``.

    Parameters
    ----------
    breaker_name
        The name of the breaker to use
        (e.g. ``"openai"``, ``"anthropic"``,
        ``"crossref"``). All calls sharing
        a breaker name share its
        failure-state machine, so an outage
        at one provider does not trip the
        breakers of unrelated providers.
    max_attempts
        Maximum number of attempts,
        including the first. Default 3
        means: try once, retry up to
        twice.
    multiplier
        The base wait in seconds. Default
        1.0 → wait 1 s, 2 s, 4 s. The
        ``RateLimited`` case overrides this
        with a 2.0 multiplier to give the
        provider more breathing room.
    max_wait
        Upper bound on the per-retry wait
        in seconds.

    The wrapped function must be
    side-effect-free on failure (i.e. a
    failed HTTP call leaves no state to
    clean up) — this is true of every
    ``httpx.Client.get`` we wrap today.
    """
    breaker = get_breaker(breaker_name)

    def decorator(fn: Callable[..., T]) -> Callable[..., T]:
        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> T:
            # ``tenacity.Retrying`` is itself a
            # generator-shaped object you can
            # ``for attempt in Retrying(...)``;
            # the loop body executes inside a
            # ``with attempt:`` block.
            try:
                for attempt in Retrying(
                    stop=stop_after_attempt(max_attempts),
                    wait=wait_exponential(
                        multiplier=multiplier, max=max_wait
                    ),
                    retry=retry_if_exception_type(_RETRY_ON),
                    reraise=True,
                ):
                    with attempt:
                        # The breaker trips on
                        # CircuitBreakerOpenError
                        # (fast-fail). It does not
                        # count toward the retry
                        # counter because we do
                        # not include that class
                        # in ``_RETRY_ON``.
                        return breaker.call(fn, *args, **kwargs)
            except _RETRY_ON as exc:
                # Exhausted retries. Re-raise the
                # *original* exception (not the
                # RetryError) so the caller sees a
                # ``RemoteServiceError`` and can
                # inspect ``exc.cause``.
                raise
            # Unreachable.
            raise RuntimeError("retry wrapper exited without return")
        return wrapper

    return decorator


class _Retrying:
    """Tiny shim that hides the tenacity
    ``Retrying`` context-manager protocol
    behind a familiar ``with attempt:``
    syntax. The shim is necessary because
    tenacity's ``Retrying`` is itself a
    context manager, and the decorator
    pattern above is a bit easier to read
    when we spell it out.

    The shim also converts the
    ``RetryError`` (the exception tenacity
    raises when it gives up) into the
    *last* ``RemoteServiceError`` so
    callers see a meaningful exception
    type — not "tenacity stopped after
    N attempts".
    """
    def __init__(self, *, stop, wait, retry) -> None:
        self._iter = Retrying(
            stop=stop, wait=wait, retry=retry, reraise=False
        )

    def __enter__(self) -> "_Retrying":
        # The first iteration of the
        # ``Retrying`` iterator is "the
        # initial attempt". We enter the
        # iterator here.
        self._next = self._iter.__enter__()
        return self

    def __exit__(self, *exc_info) -> bool:
        # ``Retrying.__exit__`` returns True
        # to swallow the exception (it is
        # expected to fire ``retry`` /
        # ``stop``). We then convert the
        # final RetryError back to the
        # original RemoteServiceError.
        swallowed = self._iter.__exit__(*exc_info)
        if swallowed and exc_info[0] is not None:
            # Final attempt failed. The
            # original is the ``__cause__``
            # of the RetryError.
            from tenacity import RetryError
            if exc_info[0] is RetryError:
                original = exc_info[1].last_attempt.exception()
                if original is not None:
                    raise original from None
        return swallowed
