"""FastAPI application factory + in-process job registry."""
from __future__ import annotations

import json
import os
import threading
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import TYPE_CHECKING, Any, Iterator

from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from .. import __version__
from ..config import get_settings
from ..contracts import JobState
from ..pipeline import run_pipeline
from ..trace import bind_trace_id, configure_logging, get_logger, new_trace_id
from ..workspace import JobPaths

log = get_logger(__name__)

if TYPE_CHECKING:
    from ..config import Settings
    from .jobs_db import InMemoryJobStore

# P1-A — the job registry is no longer a process-local
# ``dict``; it lives in SQLite at
# ``data/manusift.db`` (overridable via env). We still
# expose ``_JOBS`` as a module-level alias for the
# ``InMemoryJobStore`` that the test suite uses. The
# production path replaces this with a
# ``SqliteJobStore`` per ``create_app`` call (see
# below).
from .jobs_db import InMemoryJobStore as _DefaultStore  # noqa: E402
_JOBS_STORE: InMemoryJobStore = _DefaultStore()


def _settings_dep() -> Iterator[None]:
    # Hook point for future per-request settings overrides.
    yield None


def _render_prometheus_metrics() -> str:
    """P0-11 — render a minimal Prometheus text-format
    payload. Counters we expose today are just enough
    for an operator to see whether the service is
    busy; the schema is additive so future counters
    slot in without breaking existing scrapers."""
    lines: list[str] = []

    def add(name: str, help_text: str, value: int) -> None:
        lines.append(f"# HELP {name} {help_text}")
        lines.append(f"# TYPE {name} counter")
        lines.append(f"{name} {value}")

    add(
        "manusift_http_requests_total",
        "Total HTTP requests handled since process start.",
        _METRICS["http_requests_total"],
    )
    add(
        "manusift_uploads_total",
        "Total PDF uploads accepted since process start.",
        _METRICS["uploads_total"],
    )
    add(
        "manusift_rate_limited_total",
        "Total requests rejected by the rate limiter.",
        _METRICS["rate_limited_total"],
    )
    add(
        "manusift_llm_calls_total",
        "Total LLM enrichment calls (success + fail).",
        _METRICS["llm_calls_total"],
    )
    # G5: in-flight gauge. The
    # latency-tracking middleware
    # increments this on entry and
    # decrements on exit; the value
    # is the number of requests
    # currently being handled.
    lines.append("# HELP manusift_in_flight_requests Requests currently being handled.")
    lines.append("# TYPE manusift_in_flight_requests gauge")
    lines.append(f"manusift_in_flight_requests {_METRICS['in_flight_requests']}")
    # G5: slow-request buckets. We
    # expose one counter per
    # threshold (5 s, 10 s, 30 s, 60 s).
    for threshold in (5, 10, 30, 60):
        lines.append(
            f"# HELP manusift_http_request_seconds_over_{threshold} "
            f"Total HTTP requests slower than {threshold} s."
        )
        lines.append(
            f"# TYPE manusift_http_request_seconds_over_{threshold} counter"
        )
        lines.append(
            f"manusift_http_request_seconds_over_{threshold} "
            f"{_METRICS[f'slow_request_seconds_{threshold}']}"
        )
    return chr(10).join(lines) + chr(10)


# P0-11 — in-process counters incremented by the
# middleware. Resetting on every process start is
# fine: Prometheus's ``rate()`` handles counter
# resets automatically.
# G2: a single lock guarding the in-process
# counters (``_METRICS``) and the
# rate-limit hits dict (``_rl_hits``). Both
# are read-modify-write data structures
# that FastAPI's BackgroundTasks worker
# pool races on; without the lock, two
# concurrent ``+= 1`` can drop an
# increment. RLock would let us re-enter;
# a plain Lock is enough because the
# critical sections are short and
# non-recursive.
_METRICS_LOCK = threading.Lock()


def _bump(metric: str, n: int = 1) -> None:
    """G2: increment ``_METRICS[metric]`` by
    ``n`` under ``_METRICS_LOCK``. The
    render function reads ``_METRICS``,
    so the write side must be serialized
    to keep the count consistent."""
    with _METRICS_LOCK:
        _METRICS[metric] = _METRICS.get(metric, 0) + n


_METRICS: dict[str, int] = {
    "http_requests_total": 0,
    "uploads_total": 0,
    "rate_limited_total": 0,
    # G5: in-flight request counter.
    # Incremented by the latency-tracking
    # middleware as it enters the
    # handler; decremented on the way
    # out. Mirrored to Prometheus as a
    # gauge.
    "in_flight_requests": 0,
    # G5: a coarse latency histogram.
    # Each completed request bumps
    # the bucket for the lowest
    # threshold it exceeds (5 s, 10 s,
    # 30 s, 60 s). Operators use this to
    # spot a slow request without
    # having to scrape the log file.
    # The exact distribution is
    # deliberately coarse — a real
    # histogram would use 10+ buckets;
    # the four we expose are enough
    # for "is there a slow path" to
    # answer with yes/no.
    "slow_request_seconds_5": 0,
    "slow_request_seconds_10": 0,
    "slow_request_seconds_30": 0,
    "slow_request_seconds_60": 0,
    "llm_calls_total": 0,
}


def _init_sentry(settings: Settings) -> None:
    """P0-10 — set up Sentry if a DSN is configured.

    A no-op when the DSN is empty (the default) and
    also a no-op when sentry-sdk is not installed
    (e.g. local dev venv that does not have the
    optional ``[sentry]`` extra). Never raises.
    """
    if not settings.sentry_dsn:
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import (
            FastApiIntegration,
        )
        from sentry_sdk.integrations.starlette import (
            StarletteIntegration,
        )
    except ImportError:
        # sentry-sdk is an optional dep. We log
        # once at startup so an operator sees why
        # errors are not being reported.
        import logging
        logging.getLogger(__name__).warning(
            "sentry_dsn is set but sentry-sdk is not "
            "installed; run `pip install sentry-sdk` "
            "to enable error reporting.",
        )
        return
    try:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            # Trace every request; the FastAPI
            # integration is a tiny middleware that
            # records the URL + status + latency.
            integrations=[
                FastApiIntegration(),
                StarletteIntegration(),
            ],
            # We do not want to capture PII (paper
            # contents, API keys) in the breadcrumb
            # data. Sentry's default is already
            # conservative; we set send_default_pii
            # explicitly to make the choice auditable.
            send_default_pii=False,
            traces_sample_rate=0.1,
        )
    except Exception as exc:  # noqa: BLE001
        # Any other init error (bad DSN, network
        # unreachable) must not stop the server.
        import logging
        logging.getLogger(__name__).warning(
            "Sentry init failed",
            extra={"err": str(exc)},
        )


def create_app(settings: Settings | None = None) -> FastAPI:
    # L3: callers (mainly tests) can pass an explicit
    # Settings instance to avoid the env-leak race where
    # ``get_settings()`` reads stale env vars from a
    # previous test. In production the default
    # ``get_settings()`` is what we want.
    if settings is None:
        settings = get_settings()
    configure_logging()
    # P1-A — persistent job registry. We replace the
    # in-memory ``_JOBS_STORE`` with a SQLite-backed
    # store so the registry survives uvicorn
    # restarts. The default is still the in-memory
    # store (P1-A is opt-in via env var so existing
    # tests do not need a per-test SQLite file).
    from .jobs_db import SqliteJobStore, InMemoryJobStore
    global _JOBS_STORE
    if os.environ.get("MANUSIFT_PERSIST_JOBS", "").lower() in (
        "1", "true", "yes"
    ):
        db_path = settings.workspace_dir.parent / "manusift.db"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        _JOBS_STORE = SqliteJobStore(db_path)
        log.info(
            "persistent job registry enabled",
            extra={"db": str(db_path)},
        )
    else:
        _JOBS_STORE = InMemoryJobStore()
    # P0-10 — Sentry error aggregation. Lazy import:
    # sentry-sdk is an optional dep (only installed
    # in production), and the safe_init helper is
    # a no-op when ``settings.sentry_dsn`` is empty
    # (the default), so the dev / CI flow is
    # untouched.
    _init_sentry(settings)
    settings.workspace_dir.mkdir(parents=True, exist_ok=True)

    # G3 — graceful shutdown. The lifespan
    # waits up to ``settings.shutdown_timeout_seconds``
    # for in-flight background tasks to
    # drain before the process exits. The
    # lifespan is the modern FastAPI hook
    # (``@app.on_event("startup")`` is
    # deprecated since 0.93).
    from ..lifecycle import lifespan as _lifespan
    app = FastAPI(
        title="ManuSift",
        version=__version__,
        description="Paper-integrity screener — upload a PDF, get a report.",
        lifespan=_lifespan,
    )
    static_dir = Path(__file__).parent / "static"
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    # L3 — CORS. A browser on a different origin (e.g.
    # a static frontend served from a separate host)
    # needs an explicit Access-Control-Allow-Origin
    # header. Without this the browser blocks the
    # response even though the request reaches the
    # server. The default allow-list is the loopback
    # + 127.0.0.1 port we use for the TUI/web demo;
    # set ``MANUSIFT_CORS_ALLOW_ORIGINS`` to a
    # comma-separated list for production.
    allow_origins = [
        o.strip() for o in settings.cors_allow_origins.split(",")
        if o.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        # Only the upload endpoint needs credentials,
        # but the rest of the API is fine to call
        # without them. We keep credentials off for
        # the static GETs and on for the JSON API.
        allow_credentials=False,
        # ``allow_methods=["*"]`` lets the middleware
        # answer preflight (OPTIONS) requests for any
        # path, including endpoints that only declare
        # a POST handler. Without this, an OPTIONS
        # request to ``/api/upload`` falls through to
        # the (non-existent) OPTIONS handler and
        # returns 405.
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def trace_middleware(request: Request, call_next):
        tid = new_trace_id()
        bind_trace_id(tid)
        response = await call_next(request)
        response.headers["X-ManuSift-Trace-Id"] = tid
        # G2: bump the in-process counter.
        # The read-modify-write is now
        # serialized by ``_METRICS_LOCK``.
        _bump("http_requests_total")
        return response

    @app.middleware("http")
    async def latency_middleware(request: Request, call_next):
        """G5: measure the wall-clock
        latency of every request, bump
        the ``in_flight_requests`` gauge
        on entry / exit, and bucket the
        latency into the slow-request
        counters. The lock is held only
        for the brief read-modify-write
        of the four-bucket histogram; the
        expensive call to ``call_next``
        is *outside* the lock so a slow
        handler does not block other
        handlers from completing their
        own bumps."""
        with _METRICS_LOCK:
            _METRICS["in_flight_requests"] = (
                _METRICS.get("in_flight_requests", 0) + 1
            )
        t0 = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            elapsed = time.perf_counter() - t0
            with _METRICS_LOCK:
                _METRICS["in_flight_requests"] = max(
                    0,
                    _METRICS.get("in_flight_requests", 0) - 1,
                )
                for threshold in (5, 10, 30, 60):
                    if elapsed >= threshold:
                        _METRICS[
                            f"slow_request_seconds_{threshold}"
                        ] = _METRICS.get(
                            f"slow_request_seconds_{threshold}", 0
                        ) + 1
        return response

    # L3 — Starlette's default error middleware turns
    # any HTTPException raised by a *middleware* (as
    # opposed to a route handler) into a 500. We want
    # our rate-limiter's 429 to actually reach the
    # client as a 429. The fix is a tiny exception
    # handler: re-raise the HTTPException so the outer
    # ServerErrorMiddleware can produce a clean
    # JSONResponse with the right status code.
    from fastapi import HTTPException as _HTTPException
    from fastapi.responses import JSONResponse as _JSONResponse

    @app.exception_handler(_HTTPException)
    async def _http_exception_handler(
        request: Request, exc: _HTTPException
    ):
        # Preserve the trace header even on errors.
        return _JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )

    # L3 — minimal in-process rate limiter. Counts POST
    # requests per client IP over a rolling 60-second
    # window. Only POSTs (i.e. the upload endpoint and
    # any future write endpoints) are limited; GETs are
    # unlimited so the dashboard / TUI can poll freely.
    # In-process means the counter is per-worker; for
    # multi-worker prod we will swap this for a Redis
    # token-bucket (P1). ``rate_limit_per_minute=0``
    # disables the limiter (useful for tests).
    _rl_hits: dict[str, deque[float]] = defaultdict(deque)

    # E2: resolve the rate-limit
    # strategy once at startup. The
    # strategy is the source of
    # truth for the in-memory window;
    # caching the instance avoids
    # losing the state on every
    # request (which is what
    # happens if we construct a
    # fresh strategy per call). A
    # test that wants a clean slate
    # calls ``reset_rate_limiter``
    # (which delegates to
    # ``strategy.reset()``).
    from ..rate_limit import (
        RateLimitStrategy,
        StrategyNotFound,
        get_strategy,
    )
    _rate_limit_strategy: RateLimitStrategy | None
    try:
        _rate_limit_strategy = get_strategy(
            settings.rate_limit_strategy,
            max_calls=settings.rate_limit_per_minute,
        )
    except StrategyNotFound:
        # Fall back to per_ip so a
        # misconfigured ``rate_limit_strategy``
        # is a no-op, not a crash. The
        # operator should fix
        # settings; the warning below
        # is the visible signal.
        _rate_limit_strategy = get_strategy(
            "per_ip",
            max_calls=settings.rate_limit_per_minute,
        )
        log.warning(
            "rate-limit strategy missing; using per_ip",
            extra={
                "configured": settings.rate_limit_strategy,
                "fallback": "per_ip",
            },
        )

    def _reset_rate_limiter() -> None:
        """Test hook — clear the in-memory rate-limit
        counters. The function is exposed on the app
        for pytest fixtures; production code should
        not call it."""
        with _METRICS_LOCK:
            _rl_hits.clear()
            # Reset the counter too so a
            # test that exercises a 429 sees
            # a clean slate.
            _METRICS["rate_limited_total"] = 0
        # E2: also reset the strategy's
        # own state (sliding-window
        # buckets, token-bucket
        # tokens, etc.). This is what
        # ``get_strategy(name, max_calls)``
        # is for: a single
        # ``reset()`` call on the
        # configured strategy.
        if _rate_limit_strategy is not None:
            _rate_limit_strategy.reset()
    app.state.reset_rate_limiter = _reset_rate_limiter

    @app.middleware("http")
    async def rate_limit_middleware(request: Request, call_next):
        if request.method == "POST":
            # ``request.client`` is None in some test
            # transports; fall back to a sentinel key.
            client_ip = (
                request.client.host if request.client else "unknown"
            )
            # L3: the closed-over ``settings`` is the
            # same object the test (or prod) set up at
            # ``create_app()`` time, so no env-leak race.
            # E2: delegate to the cached
            # strategy. The strategy
            # was resolved at startup;
            # calling ``check()`` is
            # cheap and the in-memory
            # state is preserved across
            # requests.
            strategy = _rate_limit_strategy
            if strategy is None:
                return await call_next(request)
            strategy_name = settings.rate_limit_strategy
            # Build the right ``client_id``
            # for the configured strategy.
            if strategy_name == "per_api_key":
                api_key = request.headers.get(
                    "X-API-Key", ""
                ).strip()
                rate_limit_id = (
                    f"key:{api_key}" if api_key
                    else f"ip:{client_ip}"
                )
            else:
                rate_limit_id = f"ip:{client_ip}"
            if not strategy.check(rate_limit_id):
                with _METRICS_LOCK:
                    _METRICS["rate_limited_total"] = (
                        _METRICS.get(
                            "rate_limited_total", 0
                        ) + 1
                    )
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": (
                            f"rate limit: max "
                            f"{settings.rate_limit_per_minute} "
                            f"POSTs per 60s "
                            f"(strategy={strategy_name})"
                        )
                    },
                )
        return await call_next(request)

    # ---- routes ----

    @app.get("/api/health")
    def health() -> dict:
        # Kept for backward compatibility. New code
        # should prefer ``/api/healthz`` (liveness) or
        # ``/api/health/ready`` (readiness) below.
        return {"status": "ok", "version": __version__}

    @app.get("/api/healthz")
    def healthz() -> dict:
        """Liveness probe — returns 200 as long as the
        process is running. Kubernetes liveness probes
        should hit this; failing it means "kill the
        pod and start a new one". It must NOT depend
        on any external service."""
        return {"status": "alive", "version": __version__}

    @app.get("/metrics")
    def metrics() -> "PlainTextResponse":
        """P0-11 — Prometheus text exposition. Only
        registered when ``Settings.prometheus_port > 0``
        (see the early return above). The shape is
        the standard ``# HELP`` / ``# TYPE`` /
        value lines; Prometheus servers parse this
        format directly. We track the four counters
        we actually care about today; the format is
        additive so future metrics slot in without
        a schema break."""
        if settings.prometheus_port <= 0:
            return JSONResponse(
                status_code=404,
                content={
                    "detail": (
                        "metrics disabled; set "
                        "MANUSIFT_PROMETHEUS_PORT>0 to enable"
                    )
                },
            )
        return PlainTextResponse(
            content=_render_prometheus_metrics(),
            media_type="text/plain; version=0.0.4",
        )

    @app.get("/api/health/ready")
    def health_ready() -> JSONResponse:
        """Readiness probe — returns 200 only if the
        service is ready to take traffic. Checks the
        things that, if broken, would make us
        return 5xx on the next upload: the
        workspace dir is writable, the LLM client
        is configured (we do not ping the API — that
        is too flaky for a readiness check)."""
        checks: dict[str, str] = {}
        ok = True
        # 1. Workspace dir is writable.
        try:
            probe = settings.workspace_dir / ".ready_probe"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink()
            checks["workspace"] = "writable"
        except OSError as exc:
            checks["workspace"] = f"unwritable: {exc}"
            ok = False
        # 2. LLM client configuration (do not call the API).
        from ..llm import get_llm_client
        try:
            client = get_llm_client()
            checks["llm"] = (
                f"configured ({client.name}, "
                f"available={client.is_available()})"
            )
        except Exception as exc:  # noqa: BLE001
            checks["llm"] = f"error: {exc}"
            ok = False
        # 3. Detector registry loads without errors.
        try:
            from ..pipeline import detector_names_for_progress
            n = len(detector_names_for_progress())
            checks["detectors"] = f"loaded {n}"
        except Exception as exc:  # noqa: BLE001
            checks["detectors"] = f"error: {exc}"
            ok = False
        status_code = 200 if ok else 503
        return JSONResponse(
            status_code=status_code,
            content={
                "status": "ready" if ok else "not_ready",
                "version": __version__,
                "checks": checks,
            },
        )

    @app.get("/api/cost")
    def cost() -> dict:
        """P1-E — LLM cost dashboard.

        Returns aggregated cost and token usage
        per model over the last 30 days. The
        shape mirrors ``/api/tools/stats`` so a
        front-end can render both with the
        same template. ``days=0`` means all
        time; we use 30 as the default so the
        numbers stay relevant even after months
        of use.
        """
        from ..cost import aggregate_cost, cost_to_json
        rows = aggregate_cost(days=30)
        return cost_to_json(rows)

    @app.get("/api/tools/stats")
    def tool_stats() -> dict:
        """P1-D — per-tool call statistics aggregated
        from the L6 audit logs
        (``data/chats/<sid>/tool_calls.jsonl``).

        Returns a JSON object with:

        * ``tools``: list of per-tool rows
          (name, calls, errors, avg_ms, p50_ms,
          p95_ms), sorted by call count descending.
        * ``total_tools``: distinct tool count.
        * ``total_calls``: sum of all calls.
        * ``total_errors``: sum of all errors.

        If no audit data exists yet (the TUI has
        never been used) the response is a valid
        empty aggregate, not 404. An empty
        dashboard is the most useful behavior
        because the front-end just renders
        ``tools: []``.
        """
        from ..tools.stats import (
            aggregate_tool_stats,
            stats_to_json,
        )
        rows = aggregate_tool_stats()
        return stats_to_json(rows)

    @app.get("/api/detectors")
    def list_detectors() -> dict:
        """R5 — list every built-in
        detector so the LLM and
        the web client can
        introspect the available
        analysis surface.

        Returns a JSON object with:

        * ``detectors``: list of
          detector rows
          (name, class_name,
          module) in the canonical
          order from
          ``manusift.detectors.__all__``.
        * ``count``: number of
          built-in detectors.

        Built-in detectors are
        the canonical list
        maintained by R3. A new
        detector becomes visible
        here by being added to
        the package's
        ``__all__`` and imported
        at the bottom of
        ``manusift.detectors.__init__``.
        Third-party detectors
        (registered via Python
        entry points) are
        *not* listed here --
        they show up in
        ``/api/tools`` instead.
        """
        from ..detectors import detector_names
        names = detector_names()
        # We do not import
        # the actual classes
        # here because doing
        # so would instantiate
        # every detector on
        # every GET. The web
        # client just needs the
        # names; the LLM gets
        # the full tool
        # descriptions from
        # ``/api/tools``.
        import manusift.detectors as _pkg
        rows: list[dict[str, str]] = []
        for name in names:
            # ``name`` is the
            # ``.name`` attr of
            # the detector class.
            # Find the class
            # object by name.
            cls = next(
                (
                    getattr(_pkg, attr)
                    for attr in dir(_pkg)
                    if isinstance(
                        getattr(_pkg, attr, None), type
                    )
                    and getattr(
                        getattr(_pkg, attr, None), "name", None
                    ) == name
                ),
                None,
            )
            rows.append(
                {
                    "name": name,
                    "class_name": (
                        cls.__name__ if cls else "?"
                    ),
                    "module": (
                        cls.__module__ if cls else "?"
                    ),
                }
            )
        return {"detectors": rows, "count": len(rows)}

    @app.get("/api/tools")
    def list_tools() -> dict:
        """R5 — list every
        tool that the LLM can
        call. Built-in tools
        are the ``DetectorToolAdapter``-
        wrapped detectors plus
        the inspection / OCR /
        LaTeX / similarity-matrix
        tools. Third-party
        tools installed via
        ``manusift.tools``
        entry points are also
        listed.

        Returns a JSON object with:

        * ``tools``: list of tool
          rows (name, description,
          has_schema).
        * ``count``: total tool
          count.

        The ``description`` is
        the truncated first 200
        characters of the tool's
        LLM-facing description.
        The full description is
        in the agent's system
        prompt; this endpoint is
        for the web dashboard
        and LLM introspect.
        """
        from ..tools import iter_registered_tools
        rows: list[dict[str, object]] = []
        for tool in iter_registered_tools():
            desc = ""
            try:
                desc = tool.description() or ""
            except Exception:  # noqa: BLE001
                # A broken description() must not 500 the endpoint.
                desc = ""
            rows.append(
                {
                    "name": tool.name,
                    "description": desc[:200],
                    "has_schema": hasattr(tool, "input_schema"),
                }
            )
        return {"tools": rows, "count": len(rows)}

    @app.get("/")
    def index() -> FileResponse:
        static_dir = Path(__file__).parent / "static"
        return FileResponse(static_dir / "index.html")

    @app.post("/api/upload")
    async def upload(
        request: Request,
        file: UploadFile = File(...),
        idem_key: str = Header("", alias="Idempotency-Key"),
    ) -> JSONResponse:
        """Accept a single PDF and queue it for analysis.

        Returns immediately with ``trace_id``; analysis happens in a
        background task.

        G4 — ``Idempotency-Key`` header
        support. A client that retries
        the same upload (e.g. after a
        network blip) can send the same
        key, and the cached response is
        replayed. The store is keyed on
        ``Idempotency-Key`` + a body
        hash; a reused key with a
        different body is rejected as
        a 409.
        """
        # G4: read the file content once
        # and use those bytes for both
        # the upload and the idempotency
        # hash. We cannot call
        # ``request.body()`` after the
        # file is read (Starlette
        # consumes the stream).
        from ..idempotency import (
            CachedResponse,
            IdempotencyKeyConflict,
            lookup as idem_lookup,
            record as idem_record,
        )
        body = await file.read()
        if idem_key:
            cached = idem_lookup(idem_key, body)
            if isinstance(cached, IdempotencyKeyConflict):
                raise HTTPException(
                    status_code=409, detail=str(cached)
                )
            if isinstance(cached, CachedResponse):
                log.info(
                    "idempotency replay",
                    extra={"key": idem_key},
                )
                return JSONResponse(
                    status_code=cached.status_code,
                    content=cached.body,
                )

        tid = new_trace_id()
        bind_trace_id(tid)
        log.info("upload received")

        # The file is already in memory
        # as ``body`` (read above). We
        # no longer need ``request.form()``.
        filename = file.filename or "upload.pdf"
        if not filename.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=400, detail="file must be a PDF (.pdf extension)"
            )
        # L2 hardening: enforce a hard size cap + the
        # ``%PDF-`` magic number. The cap stops a malicious
        # client from filling the disk; the magic-number
        # check stops them from uploading any non-PDF that
        # happens to end in ``.pdf``. We do this BEFORE
        # ``paths.ensure()`` so a rejected upload leaves
        # no trace on disk.
        max_bytes = settings.max_upload_mb * 1024 * 1024
        if len(body) > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"file too large: {len(body)} bytes "
                    f"(max {settings.max_upload_mb} MB)"
                ),
            )
        if not body.startswith(b"%PDF-"):
            raise HTTPException(
                status_code=400,
                detail="file is not a PDF (missing %PDF- magic number)",
            )
        paths = JobPaths.for_trace(tid, settings.workspace_dir)
        paths.ensure()
        paths.original.write_bytes(body)

        job = JobState(
            trace_id=tid,
            status="queued",
            source_filename=filename,
        )
        _JOBS_STORE.set(job)
        # G2: bump the upload counter
        # after the registry update. The
        # bump is best-effort; a failure
        # here does not affect the
        # upload.
        _bump("uploads_total")
        paths.job_json.write_text(
            json.dumps(job.__dict__, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        # Fire-and-forget background analysis. FastAPI's BackgroundTasks
        # runs after the response is sent, on the same process.
        from fastapi import BackgroundTasks

        bg = BackgroundTasks()
        bg.add_task(_run_in_background, paths, job)
        # We don't actually return the bg object — the trick is to add
        # the task to a response. Use a JSON response and call the task
        # via add_task on the response below.
        response_body = {
            "trace_id": tid,
            "status": "queued",
            "filename": filename,
        }
        # G4: cache the response under
        # ``idem_key`` (if any) so a
        # retry returns the same body
        # verbatim. The body hash
        # guarantees that a future retry
        # with a different payload
        # is rejected as a 409.
        if idem_key:
            from ..idempotency import (
                record as idem_record,
            )
            idem_record(
                key=idem_key,
                body=body,
                status_code=202,
                response_body=response_body,
                trace_id=tid,
            )
        response = JSONResponse(
            response_body,
            status_code=202,
        )
        response.background = bg
        return response

    @app.get("/api/jobs/{trace_id}/progress")
    def job_progress(trace_id: str) -> dict:
        """Return live detector-by-detector progress for a job.

        The web layer keeps a per-job in-memory snapshot that the
        pipeline's ``on_step_complete`` hook updates. If the hook
        has not fired yet (job is queued or the very first
        detector is still running) we fall back to scanning the
        steps/ directory on disk so the endpoint is always
        informative. The total detector count comes from
        ``detector_names_for_progress`` (the pipeline's source
        of truth, including any third-party detector plugins).
        """
        paths = JobPaths.for_trace(trace_id, settings.workspace_dir)
        from ..pipeline import detector_names_for_progress
        detector_names = detector_names_for_progress()
        total = len(detector_names)
        # Prefer the in-memory job (richer; carries current_step)
        # but if the server restarted mid-job, fall back to the
        # on-disk step files.
        job = _JOBS_STORE.get(trace_id)
        if job is not None and (job.completed_steps or job.current_step):
            completed = list(job.completed_steps)
            current = job.current_step
            failed = list(job.failed_steps)
        else:
            from ..checkpoint import read_step_silent
            completed = []
            failed = []
            for idx, name in enumerate(detector_names):
                step_file = paths.step_path(idx, name)
                if not step_file.exists():
                    continue
                cached = read_step_silent(step_file)
                if cached is None:
                    continue
                if cached.ok:
                    completed.append(name)
                else:
                    failed.append(name)
            # The "current" detector is the next one that has not
            # yet completed — best effort.
            current: str | None = None
            for n in detector_names:
                if n not in completed and n not in failed:
                    current = n
                    break
        return {
            "trace_id": trace_id,
            "status": job.status if job is not None else "unknown",
            "total_steps": total,
            "completed_steps": completed,
            "current_step": current,
            "failed_steps": failed,
            "completed_count": len(completed),
            "failed_count": len(failed),
        }

    @app.get("/api/jobs/{trace_id}")
    def job_status(trace_id: str) -> dict:
        job = _JOBS_STORE.get(trace_id)
        if job is None:
            # Maybe the server restarted — return 404.
            raise HTTPException(status_code=404, detail="unknown trace_id")
        return {
            "trace_id": job.trace_id,
            "status": job.status,
            "source_filename": job.source_filename,
            "detectors_run": job.detectors_run,
            "finding_count": job.finding_count,
            "duration_ms": job.duration_ms,
            "error": job.error,
        }

    @app.get("/api/jobs/{trace_id}/report", response_class=HTMLResponse)
    def job_report(trace_id: str) -> HTMLResponse:
        paths = JobPaths.for_trace(trace_id, settings.workspace_dir)
        if not paths.report_html.exists():
            raise HTTPException(status_code=404, detail="report not ready")
        return HTMLResponse(paths.report_html.read_text(encoding="utf-8"))

    @app.get("/api/jobs/{trace_id}/report.md", response_class=PlainTextResponse)
    def job_report_markdown(trace_id: str) -> PlainTextResponse:
        """R-audit -- the markdown source of the LLM-written
        narrative report.

        The integrity_report skill writes ``report.md``
        alongside the .html / .pdf via the ``render_report``
        tool. This endpoint serves the raw markdown so the
        user can grep / diff / paste it elsewhere. Returns
        404 if the LLM has not yet produced a narrative
        report (the old flat-dump report.html still exists
        in that case; only the .md file is LLM-written).
        """
        paths = JobPaths.for_trace(trace_id, settings.workspace_dir)
        md_path = paths.output_dir / "report.md"
        if not md_path.exists():
            raise HTTPException(
                status_code=404,
                detail="narrative report.md not generated yet",
            )
        return PlainTextResponse(
            md_path.read_text(encoding="utf-8")
        )

    @app.get("/api/jobs/{trace_id}/report.zh.md", response_class=PlainTextResponse)
    def job_report_markdown_zh(trace_id: str) -> PlainTextResponse:
        """R-audit-i18n -- the Simplified Chinese markdown
        source of the LLM-written narrative report.

        ``render_report(language="zh")`` writes to
        ``report.zh.md`` / ``report.zh.html`` so the English
        and Chinese versions can coexist in the same job
        workspace. Returns 404 if the LLM has not yet
        produced a Chinese narrative report. The English
        counterpart lives at ``/report.md``.
        """
        paths = JobPaths.for_trace(trace_id, settings.workspace_dir)
        md_path = paths.output_dir / "report.zh.md"
        if not md_path.exists():
            raise HTTPException(
                status_code=404,
                detail="narrative report.zh.md not generated yet",
            )
        return PlainTextResponse(
            md_path.read_text(encoding="utf-8")
        )

    @app.get("/api/jobs/{trace_id}/report.zh.html", response_class=HTMLResponse)
    def job_report_html_zh(trace_id: str) -> HTMLResponse:
        """R-audit-i18n -- the Simplified Chinese rendered
        narrative HTML. Same ``<html lang="zh-Hans">`` and
        CJK font fallback chain as the markdown endpoint
        delivers; the body itself is produced by the LLM
        when ``render_report(language="zh")`` was called.
        Returns 404 if no Chinese narrative has been
        generated yet.
        """
        paths = JobPaths.for_trace(trace_id, settings.workspace_dir)
        zh_html = paths.output_dir / "report.zh.html"
        if not zh_html.exists():
            raise HTTPException(
                status_code=404,
                detail="narrative report.zh.html not generated yet",
            )
            return HTMLResponse(
                zh_html.read_text(encoding="utf-8")
            )

    @app.get("/api/formats")
    def list_formats() -> dict:
        """E1 — return the names of every
        registered output formatter.
        Useful for clients that want to
        discover ``/api/jobs/<tid>/report.<fmt>``
        options without hard-coding
        the list."""
        from ..formatters import list_formatters
        return {"formats": list_formatters()}

    @app.get("/api/jobs/{trace_id}/fmt/{fmt}")
    def job_report_fmt(trace_id: str, fmt: str) -> Response:
        """E1 — on-demand report in a
        registered format. The
        formatter is looked up in the
        ``OutputFormatter`` registry
        (built-in + entry-point);
        unknown names return 404. The
        response is a ``Response`` with
        the formatter's
        ``content_type`` and a
        ``Content-Disposition``
        attachment name built from
        ``manusift-<trace_id>.<ext>``.

        The data source is
        ``findings.json`` (already on
        disk after the pipeline ran).
        The formatter turns it into
        bytes; we do not re-run the
        pipeline. A 404 means either
        the job does not exist, the
        findings are not yet on disk,
        or the requested format is not
        registered.
        """
        from ..formatters import (
            FormatterNotFound,
            get_formatter,
        )
        from ..contracts import Finding
        try:
            formatter = get_formatter(fmt)
        except FormatterNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc))
        paths = JobPaths.for_trace(trace_id, settings.workspace_dir)
        if not paths.findings_json.exists():
            raise HTTPException(
                status_code=404, detail="findings not ready"
            )
        try:
            data = json.loads(
                paths.findings_json.read_text(encoding="utf-8")
            )
        except (OSError, json.JSONDecodeError) as exc:
            raise HTTPException(
                status_code=500,
                detail=f"could not read findings: {exc}",
            )
        # Reconstruct an AnalysisResult-like
        # object the formatter can read.
        # The formatter's ``format()``
        # method uses ``getattr`` with
        # defaults, so a plain ``dict``
        # is also acceptable.
        class _Result:
            pass
        r = _Result()
        r.trace_id = trace_id
        r.findings = [Finding(**f) for f in data.get("findings", [])]
        r.detectors_run = data.get("detectors_run", [])
        r.llm_calls = data.get("llm_calls", 0)
        r.duration_ms = data.get("duration_ms", 0)
        r.settings = settings
        body = formatter.format(r)
        return Response(
            content=body,
            media_type=formatter.content_type,
            headers={
                "Content-Disposition": (
                    f'attachment; filename="manusift-'
                    f'{trace_id}.{formatter.file_extension}"'
                )
            },
        )

    @app.get("/api/jobs/{trace_id}/report.pdf")
    def job_report_pdf(trace_id: str) -> "Response":
        """P2-A1 — PDF export of the same report.

        The PDF is rendered on demand from the
        findings JSON (already on disk) so we do
        not have to re-run the pipeline. The
        content matches the HTML report: the
        same severity-colored finding list,
        same detector list, same trace id. The
        response Content-Type is
        ``application/pdf`` and the
        ``Content-Disposition`` header names the
        file ``manusift-<trace_id>.pdf`` so
        browsers download it with a meaningful
        name.

        If ``weasyprint`` is not installed we
        return 501 (Not Implemented) with a
        helpful ``detail`` field that points at
        the install command. Returning 503 or
        500 would be misleading: the server is
        fine, the optional dependency is just
        missing.
        """
        from ..report import (
            WeasyprintNotInstalled,
            build_report_pdf,
        )
        from ..contracts import Finding
        paths = JobPaths.for_trace(trace_id, settings.workspace_dir)
        if not paths.findings_json.exists():
            raise HTTPException(
                status_code=404, detail="findings not ready"
            )
        findings_doc = json.loads(
            paths.findings_json.read_text(encoding="utf-8")
        )
        findings = [
            Finding(**f) for f in findings_doc.get("findings", [])
        ]
        try:
            pdf_bytes = build_report_pdf(
                trace_id=trace_id,
                findings=findings,
                detectors_run=findings_doc.get(
                    "detectors_run", []
                ),
                llm_calls=findings_doc.get("llm_calls", 0),
                settings=settings,
            )
        except WeasyprintNotInstalled as exc:
            raise HTTPException(
                status_code=501,
                detail=str(exc),
            ) from exc
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": (
                    f'attachment; filename="manusift-'
                    f'{trace_id}.pdf"'
                ),
            },
        )

    @app.get("/api/jobs/{trace_id}/findings")
    def job_findings(trace_id: str) -> dict:
        paths = JobPaths.for_trace(trace_id, settings.workspace_dir)
        if not paths.findings_json.exists():
            raise HTTPException(status_code=404, detail="findings not ready")
        return json.loads(paths.findings_json.read_text(encoding="utf-8"))

    return app


def _run_in_background(paths: JobPaths, job: JobState) -> None:
    """Wrap ``run_pipeline`` and rebind the trace id for log correlation.

    The pipeline's ``on_step_complete`` hook is used to update the
    in-memory job registry so the /progress endpoint can answer
    in real time without re-reading the steps/ directory on every
    request.

    G3: the tracker is registered for
    the lifetime of this background
    task. The lifespan (see
    ``manusift.lifecycle``) waits for
    the tracker to drain on shutdown,
    so a SIGTERM in the middle of an
    upload gets a chance to finish
    rather than being abandoned.
    """
    from ..lifecycle import get_tracker
    get_tracker().register(job.trace_id)
    try:
        _run_in_background_impl(paths, job)
    finally:
        get_tracker().unregister(job.trace_id)


def _run_in_background_impl(paths: JobPaths, job: JobState) -> None:
    """Implementation of ``_run_in_background``
    extracted for the G3 tracker wiring.
    Same body as the pre-G3 version; the
    wrapper above adds the register /
    unregister bookkeeping."""
    bind_trace_id(job.trace_id)

    def _on_step(res, job_state: JobState) -> None:
        # Update the in-memory job (single source of truth for
        # /progress and /jobs/{tid}).
        # G5: defensive guard. A buggy
        # detector that returns a list
        # (or any non-DetectorResult)
        # would crash the hook. The hook
        # is best-effort; the pipeline
        # does not abort because of a
        # misbehaving hook. We log and
        # skip the update.
        if not hasattr(res, "detector") or not hasattr(res, "ok"):
            log.warning(
                "on_step: res is not a DetectorResult; "
                "skipping update",
                extra={"res_type": type(res).__name__},
            )
            return
        if res.ok:
            job_state.completed_steps.append(res.detector)
        else:
            job_state.failed_steps.append(res.detector)
        # ``current_step`` is the most recent detector that ran.
        # If we have a "next" detector not yet in completed/failed,
        # use that; otherwise leave the just-completed one as the
        # last-known activity.
        next_current = _next_pending(job_state, res.detector)
        if next_current is not None:
            job_state.current_step = next_current
        else:
            job_state.current_step = res.detector
        # Persist the progress into job.json so a TUI or curl can
        # read it even if the in-memory dict is gone (server
        # restart). Best effort — never crash the pipeline.
        try:
            paths.job_json.write_text(
                json.dumps(job_state.__dict__, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except OSError:
            pass

    try:
        run_pipeline(paths.original, paths, job, on_step_complete=_on_step)
    except Exception:
        # Already logged + persisted by the pipeline itself.
        pass


def _next_pending(job_state: JobState, just_done: str) -> str | None:
    """Return the first detector name that has not yet been
    completed or failed, or ``None`` if all are accounted for.

    The four detector names are hard-coded here on purpose: the
    pipeline's detector list is the source of truth (it lives in
    pipeline.py) and the progress endpoint duplicates the list
    to avoid a circular import. If the two ever drift apart the
    fallback in the endpoint will still be correct, just
    slightly stale."""
    from .pipeline import detector_names_for_progress
    all_names = detector_names_for_progress()
    for n in all_names:
        if n == just_done:
            continue
        if n not in job_state.completed_steps and n not in job_state.failed_steps:
            return n
    return None


# Module-level app for ``uvicorn manusift.web.app:app``.
app = create_app()
