"""LLM provider implementations.

R-2026-06-15 (Phase 4 + P4-2):
extracted from
``manusift.llm.client``.

Contains ``OpenAILLM`` and
``AnthropicLLM`` plus the
per-provider helpers
(``_openai_*`` /
``_anthropic_*`` /
``_to_*_messages``) and
the shared helpers
(``_format_llm_error`` /
``_build_prompt`` /
``_safe_parse`` /
``_strip_code_fence`` /
``_safe_json_loads`` /
``_unwrap_key`` /
``_parse_or_retry``).

The shared helpers are
in this module because
both ``OpenAILLM`` and
``AnthropicLLM`` need
them; putting them in
``__init__.py`` would
create a circular import
risk.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any, Iterator

import httpx
from pydantic import SecretStr, ValidationError

# R-2026-06-15 (Phase 4 + P4-2):
# the original
# ``llm/client.py`` used
# ``from ..config``
# (i.e. ``manusift.config``).
# In the new package at
# ``llm/client/``,
# ``..`` is ``llm/`` (NOT
# ``manusift/``).  We use
# ``...`` (3 dots) to
# reach ``manusift``.
from ...config import Settings, get_settings
from ...contracts import Finding
from ...retry import (
    classify_exception,
    classify_status,
    remote_call,
)
from ...trace import get_logger

from ..chat import ChatResponse
from ..schemas import LLMVerdict

from .protocol import LLMClient


# R-2026-06-15 (Phase 4 + P4-2):
# ``log`` was at
# module level in
# the original
# ``llm/client.py``
# (line 34).  It is
# used by
# ``OpenAILLM`` and
# ``AnthropicLLM``
# for failure
# logging.
log = get_logger(__name__)


# R-2026-06-15 (Phase 4 + P4-2):
# these constants were
# at module level in
# the original
# ``llm/client.py``
# (lines 78-80).  They
# are referenced by
# ``_format_llm_error``
# to classify the
# HTTP status code.
_TRANSIENT_5XX = {500, 502, 503, 504, 524, 529}
_RATE_LIMITED = {429}

def _format_llm_error(exc: BaseException) -> str:
    """Return a short,
    user-friendly error
    message for any LLM
    exception.

    The format is::

        ✖ <provider> <status>: <human message>
          request_id=<rid>
          hint: <action>

    The ``request_id`` is
    included so the user
    can quote it in a
    support ticket. The
    ``hint`` is
    "transient -- press
    Ctrl+R to retry" for
    5xx / 429 (since the
    upstream provider is
    expected to recover),
    "check your API key"
    for 401/403, or "fix
    the request" for
    other 4xx.

    For non-SDK
    exceptions (network
    errors, timeouts) the
    message falls back to
    ``str(exc)``.
    """
    # Try
    # the
    # Anthropic
    # SDK
    # first.
    try:
        import anthropic
    except ImportError:
        anthropic = None  # type: ignore
    if anthropic is not None and isinstance(exc, anthropic.APIStatusError):
        status = getattr(exc, "status_code", 0) or 0
        rid = getattr(exc, "request_id", "") or ""
        err_type = getattr(exc, "type", "") or ""
        # ``message``
        # is
        # sometimes
        # a
        # bare
        # 'unknown
        # error,
        # 999
        # (1000)'
        # (MiniMax
        # upstream
        # format)
        # so
        # we
        # don't
        # echo
        # the
        # raw
        # ``exc.message``
        # -- instead
        # we
        # build
        # a
        # short
        # human
        # summary.
        head = (
            f"✖ anthropic {status}"
            + (f" ({err_type})" if err_type else "")
            + ": upstream provider error"
        )
        if rid:
            head += f"\n  request_id={rid}"
        if status in _TRANSIENT_5XX or status in _RATE_LIMITED:
            head += (
                "\n  hint: this is a transient upstream error."
                "\n         press Ctrl+R to retry, or wait a "
                "few seconds."
            )
        elif status in (401, 403):
            head += (
                "\n  hint: authentication failed."
                "\n         check MANUSIFT_ANTHROPIC_API_KEY "
                "in your .env file."
            )
        elif 400 <= status < 500:
            head += (
                "\n  hint: the request was rejected."
                "\n         check the system prompt and tool "
                "schemas."
            )
        return head
    # Try
    # the
    # OpenAI
    # SDK.
    try:
        import openai
    except ImportError:
        openai = None  # type: ignore
    if openai is not None and isinstance(exc, openai.APIStatusError):
        status = getattr(exc, "status_code", 0) or 0
        rid = (
            getattr(exc, "request_id", "")
            or getattr(getattr(exc, "response", None), "headers", {}).get(
                "x-request-id", ""
            )
            or ""
        )
        head = f"✖ openai {status}: upstream provider error"
        if rid:
            head += f"\n  request_id={rid}"
        if status in _TRANSIENT_5XX or status in _RATE_LIMITED:
            head += (
                "\n  hint: this is a transient upstream error."
                "\n         press Ctrl+R to retry, or wait a "
                "few seconds."
            )
        elif status in (401, 403):
            head += (
                "\n  hint: authentication failed."
                "\n         check MANUSIFT_OPENAI_API_KEY "
                "in your .env file."
            )
        elif 400 <= status < 500:
            head += (
                "\n  hint: the request was rejected."
                "\n         check the system prompt and tool "
                "schemas."
            )
        return head
    # Try
    # the
    # generic
    # SDK
    # status
    # error
    # (httpx).
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        return (
            f"✖ http {status}: {exc.response.reason_phrase or 'error'}"
            + (
                "\n  hint: transient upstream error -- "
                "press Ctrl+R to retry."
                if status in _TRANSIENT_5XX
                else ""
            )
        )
    # Network /
    # timeout
    # fallthrough.
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError, httpx.NetworkError)):
        kind = (
            "timeout"
            if isinstance(exc, httpx.TimeoutException)
            else "network error"
        )
        return (
            f"✖ {kind}: {exc}"
            "\n  hint: check your internet connection, "
            "then press Ctrl+R to retry."
        )
    # Unknown
    # --
    # fall
    # back
    # to
    # str(exc).
    return f"✖ {type(exc).__name__}: {exc}"




def _build_prompt(finding: Finding, strict_json: bool = False) -> str:
    raw_repr = json.dumps(finding.raw, ensure_ascii=False, indent=2)[:1500]
    base = (
        f"Detector: {finding.detector}\n"
        f"Severity: {finding.severity}\n"
        f"Location: {finding.location}\n"
        f"Title: {finding.title}\n"
        f"Evidence: {finding.evidence}\n"
        f"Raw data: {raw_repr}\n\n"
        "Respond with one JSON object."
    )
    if strict_json:
        base += (
            " Output ONLY the JSON object, no prose, no markdown fences, "
            "no explanation before or after."
        )
    return base


# ---------- factory ----------

_client_singleton: LLMClient | None = None




_VERDICT_ALIASES: dict[str, str] = {
    "looks_legit": "looks_legit",
    "looks-legit": "looks_legit",
    "looks legit": "looks_legit",
    "legit": "looks_legit",
    "legitimate": "looks_legit",
    "clean": "looks_legit",
    "ok": "looks_legit",
    "benign": "looks_legit",
    "suspicious": "suspicious",
    "suspect": "suspicious",
    "likely_fraud": "suspicious",
    "fraudulent": "suspicious",
    "fabricated": "suspicious",
    "needs_review": "needs_review",
    "needs-review": "needs_review",
    "needs review": "needs_review",
    "review": "needs_review",
    "uncertain": "needs_review",
    "unclear": "needs_review",
    "maybe": "needs_review",
}


def _strip_code_fence(text: str) -> str:
    """Best-effort strip of ```json ... ``` fences that some LLMs add."""
    s = text.strip()
    if s.startswith("```"):
        lines = s.splitlines()
        lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        return "\n".join(lines).strip()
    return s


def _extract_json_object(text: str) -> dict[str, Any] | None:
    """Pull the first JSON object from free text (DeepSeek often adds prose)."""
    s = _strip_code_fence(text or "")
    if not s:
        return None
    try:
        obj = json.loads(s)
        if isinstance(obj, dict):
            return obj
    except (ValueError, TypeError):
        pass
    start = s.find("{")
    end = s.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        obj = json.loads(s[start : end + 1])
        return obj if isinstance(obj, dict) else None
    except (ValueError, TypeError):
        return None


def _coerce_verdict_payload(data: dict[str, Any]) -> dict[str, Any]:
    """Normalise common DeepSeek / loose-schema variants into LLMVerdict fields."""
    summary = (
        data.get("summary")
        or data.get("assessment")
        or data.get("explanation")
        or data.get("reason")
        or ""
    )
    summary = str(summary).strip()
    if len(summary) > 500:
        summary = summary[:497] + "..."
    if not summary:
        summary = "Model returned no summary; manual review required."

    raw_v = data.get("verdict") or data.get("judgment") or data.get("label") or "needs_review"
    v_key = str(raw_v).strip().lower().replace("-", " ")
    v_key_us = v_key.replace(" ", "_")
    if v_key in _VERDICT_ALIASES:
        verdict = _VERDICT_ALIASES[v_key]
    elif v_key_us in _VERDICT_ALIASES:
        verdict = _VERDICT_ALIASES[v_key_us]
    elif str(raw_v) in {"looks_legit", "suspicious", "needs_review"}:
        verdict = str(raw_v)
    else:
        verdict = "needs_review"

    conf = data.get("confidence", data.get("score", 0.5))
    try:
        conf_f = float(conf)
    except (TypeError, ValueError):
        conf_f = 0.5
    conf_f = max(0.0, min(1.0, conf_f))

    next_step = (
        data.get("next_step")
        or data.get("action")
        or data.get("recommendation")
        or "Inspect the cited location and source data manually."
    )
    next_step = str(next_step).strip()
    if len(next_step) > 200:
        next_step = next_step[:197] + "..."
    if len(next_step) < 5:
        next_step = "Inspect the cited location and source data manually."

    return {
        "summary": summary,
        "verdict": verdict,
        "confidence": conf_f,
        "next_step": next_step,
    }


def _safe_parse(raw: str | None) -> LLMVerdict | None:
    """Parse LLM text into LLMVerdict; tolerate fences, prose, alias labels."""
    if raw is None:
        return None
    data = _extract_json_object(raw)
    if data is None:
        log.debug("llm verdict: no JSON object in response")
        return None
    try:
        cleaned = _coerce_verdict_payload(data)
        return LLMVerdict.model_validate(cleaned)
    except ValidationError as exc:
        log.debug("llm verdict parse failed", extra={"err": str(exc)})
        return None


# ---------- shared ----------

_SYSTEM_PROMPT = (
    "You are a research-integrity reviewer. Given a single suspicious "
    "finding from a paper-integrity scanner, you MUST respond with a "
    "single JSON object matching this schema: "
    '{"summary": str, "verdict": "looks_legit" | "suspicious" | '
    '"needs_review", "confidence": float in [0.0, 1.0], "next_step": str}. '
    "Be cautious and concrete; do not fabricate evidence. Do not wrap "
    "the JSON in markdown fences or any other text."
)




def _safe_json_loads(s: str) -> Any:
    """Parse a JSON string, returning ``None``
    on any error. Used by the streaming
    clients to fold partial ``input_json``
    deltas — the streaming JSON is
    incomplete until the last chunk, so a
    ``JSONDecodeError`` is expected and not
    a bug."""
    import json
    try:
        return json.loads(s)
    except (ValueError, TypeError):
        return None




def _unwrap_key(value: str | SecretStr | None) -> str | None:
    """Return the plain string inside a SecretStr, or
    the value as-is if it is already a str / None.

    Settings stores API keys as ``SecretStr`` to keep them
    out of logs. The SDK + httpx headers need a plain
    string. This helper is the single place we unwrap."""
    if value is None:
        return None
    if isinstance(value, SecretStr):
        return value.get_secret_value()
    return value




def _parse_or_retry(
    client: Any,
    finding: Finding,
    raw: str | None,
    call_with_strict: Any,
) -> LLMVerdict | None:
    """Validate ``raw`` as JSON matching ``LLMVerdict``.

    On ``ValidationError`` we call the provider one more time with
    ``strict_json=True`` (a prompt that explicitly forbids prose
    around the JSON). If that also fails the LLM is considered
    non-responsive and we return ``None`` — the pipeline then marks
    the finding as ``llm_skipped=True``.
    """
    verdict = _safe_parse(raw)
    if verdict is not None:
        return verdict
    log.info(
        "llm verdict failed schema; retrying with strict-json prompt",
        extra={"fid": finding.finding_id},
    )
    try:
        raw2 = call_with_strict(finding, strict_json=True)
    except Exception as exc:  # noqa: BLE001
        log.warning("strict-json retry call failed", extra={"err": str(exc)})
        return None
    return _safe_parse(raw2)




def _openai_create_with_retry(
    sdk: Any,
    *,
    model: str,
    messages: list[dict[str, Any]],
    max_tokens: int,
    tools: list[dict[str, Any]] | None,
    stream: bool = False,
    timeout: float | None = None,
    session_id: str | None = None,
) -> Any:
    """G5.5: invoke the OpenAI SDK
    with automatic retry on
    server / network / timeout
    failures. The retry policy is
    the same one the ``remote_call``
    decorator uses elsewhere; we
    inline the implementation here
    (rather than decorating
    ``OpenAILLM.chat``) because the
    SDK call is the only
    network-touching line in the
    method, and decorating the
    method would re-invoke the
    whole tool-translation pipeline
    on every retry.

    R-2026-06-15 (Phase 0 + 3c):
    when ``session_id`` is
    provided, the OpenAI SDK is
    called with a
    ``prompt_cache_key``
    derived from the session id
    AND an ``extra_body``
    containing the cache TTL.
    Providers that support
    prompt caching (OpenAI
    direct, Azure with cache
    enabled, vLLM with
    ``--enable-prompt-caching``)
    will return cached tokens
    on the second-and-later
    calls of a long
    conversation. The cache
    survives the configured
    ``prompt_cache_ttl``
    (default ``"ephemeral"``
    = 5 minutes). When the
    ``prompt_cache_ttl`` is
    ``"off"``, the extra body
    is not sent (so the
    provider does not cache).

    ``timeout`` is optional so
    callers that do not care
    (legacy code paths) can pass
    nothing; the OpenAI SDK
    default of 600s will then
    apply. The R-audit-2026-06-10
    fix passes the streaming
    timeout explicitly so the
    MiniMax-M3 endpoint's long
    thinking pauses do not crash
    the agent loop.

    On an unrecoverable error
    (auth, bad request, 4xx that
    is not 429) the helper raises
    the classified
    ``RemoteServiceError``. The
    caller's ``except`` block
    converts the error to a
    ``ChatResponse`` with a
    user-visible message.
    """
    from ...retry import (
        NetworkError_,
        RateLimited,
        ServerError_,
        TimeoutError_,
    )
    # R-2026-06-15 (Phase 0 +
    # 3c): build the
    # prompt-cache kwargs
    # only when the user
    # has not disabled it.
    cache_kwargs: dict[str, Any] = {}
    if session_id is not None:
        from ..prompt_cache import (
            build_openai_cache_extra_body,
            openai_cache_key_from_session,
        )
        ttl = get_settings().prompt_cache_ttl
        if ttl != "off":
            cache_kwargs = {
                "prompt_cache_key": (
                    openai_cache_key_from_session(
                        session_id
                    )
                ),
                "extra_body": (
                    build_openai_cache_extra_body(
                        cache_key="",  # unused
                        ttl=ttl,
                    )
                ),
            }
    if stream:
        # Streaming call. The SDK
        # returns a stream object;
        # we cannot return the
        # result of a single call.
        # The streaming path is
        # handled by the caller.
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "tools": tools,
            "stream": True,
        }
        if timeout is not None:
            kwargs["timeout"] = timeout
        kwargs.update(cache_kwargs)
        return sdk.chat.completions.create(**kwargs)
    @remote_call("openai", max_attempts=3, multiplier=1.0)
    def _do() -> Any:
        try:
            sdk_kwargs: dict[str, Any] = {
                "model": model,
                "messages": messages,
                "max_tokens": max_tokens,
                "tools": tools,
            }
            sdk_kwargs.update(cache_kwargs)
            return sdk.chat.completions.create(
                **sdk_kwargs
            )
        except Exception as exc:
            # G5.5: classify the SDK
            # exception so ``remote_call``
            # can decide whether to retry
            # (5xx / network / timeout /
            # 429) or fail fast (auth /
            # 4xx). The original
            # exception is preserved on
            # ``err.cause``.
            raise classify_exception(exc) from exc
    return _do()




def _anthropic_create_with_retry(
    sdk: Any,
    *,
    model: str,
    messages: list[dict[str, Any]],
    max_tokens: int,
    tools: list[dict[str, Any]] | None,
    stream: bool = False,
    timeout: float | None = None,
    **kwargs: Any,
) -> Any:
    """G5.5: same as
    ``_openai_create_with_retry``
    but for the Anthropic SDK.

    The Anthropic SDK uses
    keyword arguments rather than
    positional, so we accept
    ``**kwargs`` and forward them.
    The retry policy is identical
    to OpenAI's. ``timeout`` is
    plumbed through explicitly
    (R-audit-2026-06-10) so the
    MiniMax-M3 endpoint's long
    thinking pauses do not crash
    the agent loop with
    ``httpcore.ReadTimeout``.
    """
    from ...retry import (
        NetworkError_,
        RateLimited,
        ServerError_,
        TimeoutError_,
    )
    if stream:
        call_kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,  # type: ignore[arg-type]
            "max_tokens": max_tokens,
            "tools": tools,  # type: ignore[arg-type]
            "stream": True,
            **kwargs,
        }
        if timeout is not None:
            call_kwargs["timeout"] = timeout
        return sdk.messages.create(**call_kwargs)
    @remote_call("anthropic", max_attempts=3, multiplier=1.0)
    def _do() -> Any:
        try:
            return sdk.messages.create(
                model=model,
                messages=messages,  # type: ignore[arg-type]
                max_tokens=max_tokens,
                tools=tools,  # type: ignore[arg-type]
                **kwargs,
            )
        except Exception as exc:
            # G5.5: same as
            # ``_openai_create_with_retry``
            # — classify the SDK
            # exception so the retry
            # policy applies. The
            # original exception is
            # preserved on ``err.cause``.
            raise classify_exception(exc) from exc
    return _do()


class OpenAILLM:
    name = "openai"

    def __init__(self, settings: Settings) -> None:
        self._api_key = _unwrap_key(settings.openai_api_key)
        self._base_url = settings.openai_base_url.rstrip("/")
        self._model = settings.openai_model
        # Lazy SDK client. We do not construct it at
        # import-time because tests frequently swap the
        # api_key (or absence thereof) after construction.
        self._client: Any = None

    def _sdk(self) -> Any:
        if self._client is None:
            from openai import OpenAI
            self._client = OpenAI(
                api_key=self._api_key,
                base_url=self._base_url or None,
                timeout=float(get_settings().llm_call_timeout_seconds),
            )
        return self._client

    def is_available(self) -> bool:
        return bool(self._api_key)

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        max_tokens: int = 4096,
        session_id: str | None = None,
    ) -> ChatResponse:
        """Step J2: OpenAI tool-call API via the official SDK.

        R-2026-06-15 (Phase 0 + 3c):
        ``session_id`` is forwarded
        to the OpenAI SDK as
        ``prompt_cache_key`` so
        prompt caching is keyed
        on the chat session.
        A ``/resume`` of the
        same session lands on
        the same cache bucket
        and gets a 100% hit on
        the first turn.

        We translate our provider-agnostic tool dicts into
        the OpenAI ``tools=[{"type": "function",
        "function": {"name", "description", "parameters"}}]``
        shape and call ``client.chat.completions.create``.

        On response we normalize OpenAI's ``message.tool_calls``
        (a list of dicts with ``id``, ``function.name``,
        ``function.arguments``) into our flat ``content_blocks``
        with ``type="tool_use"`` so the AgentLoop (Step J3)
        only ever sees one shape.
        """
        if not self.is_available():
            return ChatResponse(
                content_blocks=[{"type": "text", "text": "(no API key)"}],
                stop_reason="end_turn",
            )
        openai_tools: list[dict[str, Any]] | None = None
        if tools:
            openai_tools = [
                {
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t.get("description", ""),
                        "parameters": t.get(
                            "input_schema",
                            {"type": "object", "properties": {}},
                        ),
                    },
                }
                for t in tools
            ]
        try:
            # G5.5: retry on
            # server / network / timeout
            # failures. The helper uses
            # the same tenacity policy
            # as the crossref HTTP
            # retry; on success it
            # returns the SDK response
            # directly.
            resp = _openai_create_with_retry(
                self._sdk(),
                model=self._model,
                messages=messages,
                max_tokens=max_tokens,
                tools=openai_tools,
                session_id=session_id,
            )
        except Exception as exc:  # noqa: BLE001
            # G5: classify the exception
            # so the operator log records
            # the *kind* of failure
            # (timeout, 5xx, 401, 429, ...)
            # in addition to the raw
            # error string. The original
            # exception is preserved on
            # ``err.cause`` for debugging.
            err = classify_exception(exc)
            log.warning(
                "openai chat failed",
                extra={"err": str(exc), "kind": type(err).__name__},
            )
            return ChatResponse(
                content_blocks=[
                    {"type": "text", "text": _format_llm_error(exc)}
                ],
                stop_reason="end_turn",
            )
        choice = (resp.choices or [None])[0]
        if choice is None:
            return ChatResponse(content_blocks=[], stop_reason="")
        message = choice.message
        blocks: list[dict[str, Any]] = []
        text = getattr(message, "content", None)
        if text:
            blocks.append({"type": "text", "text": text})
        for tc in (getattr(message, "tool_calls", None) or []):
            raw_args = getattr(tc.function, "arguments", None) or "{}"
            try:
                args = json.loads(raw_args)
            except json.JSONDecodeError:
                args = {}
            blocks.append(
                {
                    "type": "tool_use",
                    "id": getattr(tc, "id", "") or "",
                    "name": getattr(tc.function, "name", "") or "",
                    "input": args,
                }
            )
        return ChatResponse(
            content_blocks=blocks,
            stop_reason=getattr(choice, "finish_reason", "") or "",
            usage=(resp.usage.model_dump() if getattr(resp, "usage", None) else {}),
            model=self._model,
        )

    def chat_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        max_tokens: int = 4096,
        session_id: str | None = None,
    ) -> "Iterator[ChatResponse]":
        """P2.5 — token-level streaming via the
        OpenAI SDK ``stream=True`` mode.

        R-2026-06-15 (Phase 0 + 3c):
        ``session_id`` is forwarded
        to the SDK as
        ``prompt_cache_key`` so
        prompt caching is
        keyed on the chat
        session. A ``/resume``
        of the same session
        lands on the same cache
        bucket and gets a 100%
        hit on the first turn.

        Each chunk from the SDK has a
        ``choices[0].delta`` with possibly:
          * ``content`` (text fragment, str)
          * ``tool_calls`` (list of partial
            tool-call objects; the SDK may
            split a single tool call across
            many chunks — name in the first,
            arguments in subsequent)
          * ``finish_reason`` (on the last
            non-empty chunk)
        Some chunks also carry ``usage`` (when
        ``stream_options.include_usage`` is
        set; the SDK does that automatically
        for ``stream=True`` calls in recent
        versions).

        We fold each chunk into the accumulated
        ``ChatResponse`` via ``merged()`` and
        yield the running total. The agent
        loop gets to see the same shape it
        would have seen from ``chat()`` —
        just earlier, with each text fragment
        appended in place.
        """
        if not self.is_available():
            resp = self.chat(
                messages, tools, max_tokens=max_tokens
            )
            yield resp
            return
        # Translate our normalized tool dicts
        # into the OpenAI wire format. This is
        # the same translation ``chat()``
        # does; we duplicate it here so the
        # streaming path stays independent.
        openai_tools = None
        if tools:
            openai_tools = [
                {
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t.get("description", ""),
                        "parameters": t.get(
                            "input_schema", {}
                        ),
                    },
                }
                for t in tools
            ]
        # The system prompt is the first
        # message in our normalized list. The
        # OpenAI SDK expects it as the
        # ``messages[0].role == "system"``
        # entry, which we already produce in
        # the agent loop. We just pass it
        # through.
        openai_messages = _to_openai_messages(messages)
        accumulated = ChatResponse(model=self._model)
        try:
            # G5.5: stream=True call
            # also routed through the
            # retry helper. The helper
            # returns the SDK stream
            # object; the iteration that
            # follows is the same as
            # before.
            stream = _openai_create_with_retry(
                self._sdk(),
                model=self._model,
                messages=openai_messages,
                max_tokens=max_tokens,
                tools=openai_tools,
                stream=True,
                session_id=session_id,
                timeout=float(
                    get_settings()
                    .llm_stream_timeout_seconds
                ),
            )
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "openai chat_stream failed",
                extra={"err": str(exc)},
            )
            yield ChatResponse(
                content_blocks=[
                    {"type": "text", "text": _format_llm_error(exc)}
                ],
                stop_reason="end_turn",
                model=self._model,
            )
            return
        for chunk in stream:
            # ``chunk.choices`` is empty for the
            # final usage-only chunk; skip it
            # when there is no delta to apply.
            choices = getattr(chunk, "choices", None) or []
            if not choices:
                # The usage chunk is the last
                # one; record it on the
                # accumulated response and
                # yield one final time so the
                # caller sees the usage record
                # (a P1-E cost aggregator relies
                # on this).
                usage_obj = getattr(chunk, "usage", None)
                if usage_obj is not None:
                    accumulated = ChatResponse(
                        content_blocks=accumulated.content_blocks,
                        stop_reason=accumulated.stop_reason,
                        usage=usage_obj.model_dump()
                        if hasattr(usage_obj, "model_dump")
                        else dict(usage_obj),
                        model=accumulated.model,
                    )
                    yield accumulated
                continue
            delta = choices[0].delta
            new_blocks: list[dict[str, Any]] = []
            text_fragment = getattr(delta, "content", None) or ""
            if text_fragment:
                new_blocks.append({
                    "type": "text",
                    "text": text_fragment,
                })
            for tc in (getattr(delta, "tool_calls", None) or []):
                # ``tc.id`` is None on the
                # argument-only follow-up chunks
                # that complete a tool call's
                # arguments. We must look up the
                # existing tool_use block by
                # index in that case (the SDK
                # sets ``tc.index``).
                idx = getattr(tc, "index", None)
                tool_id = getattr(tc, "id", None)
                tool_name = None
                func = getattr(tc, "function", None)
                if func is not None:
                    tool_name = getattr(func, "name", None) or None
                tool_args_fragment = (
                    getattr(func, "arguments", None) or ""
                ) if func is not None else ""
                # If we have a new id, this is
                # the start of a new tool call.
                # If id is None but index is
                # given, this chunk is a
                # continuation of the
                # call at that index.
                if tool_id is not None:
                    new_blocks.append({
                        "type": "tool_use",
                        "id": tool_id,
                        "name": tool_name or "",
                        "input": (
                            _safe_json_loads(tool_args_fragment)
                            if tool_args_fragment else {}
                        ),
                    })
                else:
                    # Continuation chunk. We
                    # cannot reconstruct the
                    # correct id without the
                    # SDK's state, so we leave
                    # the fold to the next
                    # non-continuation chunk —
                    # i.e. we skip this delta.
                    # The final, non-delta
                    # chunk of a tool call is
                    # a single block we can
                    # apply on its own.
                    pass
            stop_reason = getattr(
                choices[0], "finish_reason", ""
            ) or ""
            delta_resp = ChatResponse(
                content_blocks=new_blocks,
                stop_reason=stop_reason,
                model=self._model,
            )
            accumulated = accumulated.merged(delta_resp)
            yield accumulated

    def analyze_finding(self, finding: Finding) -> LLMVerdict | None:
        if not self.is_available():
            return None
        try:
            raw = self._call(finding, strict_json=False)
            verdict = _parse_or_retry(self, finding, raw, self._call)
        except Exception as exc:  # noqa: BLE001 — LLM failure is non-fatal
            log.warning("openai llm call failed", extra={"err": str(exc)})
            return None
        return verdict

    def analyze_findings_batch(
        self,
        findings: list[Finding],
        *,
        ids: list[str] | None = None,
    ) -> dict[str, LLMVerdict]:
        from ..enrichment import _batch_prompt, _parse_batch_response

        if not self.is_available() or not findings:
            return {}
        id_list = ids or [f.finding_id for f in findings]
        items = list(zip(id_list, findings))
        prompt = _batch_prompt(items)
        try:
            raw = self._call_raw_prompt(prompt, max_tokens=2500)
            out = _parse_batch_response(raw, id_list)
            missing = [it for it in items if it[0] not in out]
            if missing:
                raw2 = self._call_raw_prompt(
                    prompt + "\nOutput ONLY a JSON array.",
                    max_tokens=2500,
                )
                out.update(_parse_batch_response(raw2, [m[0] for m in missing]))
            return out
        except Exception as exc:  # noqa: BLE001
            log.warning("openai batch llm failed", extra={"err": str(exc)})
            return {}

    def _call_raw_prompt(
        self, prompt: str, *, max_tokens: int = 800
    ) -> str | None:
        timeout = float(get_settings().llm_call_timeout_seconds)
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(
                f"{self._base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={
                    "model": self._model,
                    "messages": [
                        {"role": "system", "content": _SYSTEM_PROMPT},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.0,
                    "max_tokens": max_tokens,
                },
            )
            resp.raise_for_status()
            data = resp.json()
        return data["choices"][0]["message"]["content"]

    def _call(self, finding: Finding, strict_json: bool = False) -> str | None:
        prompt = _build_prompt(finding, strict_json=strict_json)
        return self._call_raw_prompt(
            prompt, max_tokens=400 if not strict_json else 600
        )


# ---------- Anthropic ----------



class AnthropicLLM:
    name = "anthropic"

    def __init__(self, settings: Settings) -> None:
        self._api_key = _unwrap_key(settings.anthropic_api_key)
        self._base_url = settings.anthropic_base_url.rstrip("/")
        self._model = settings.anthropic_model
        # Lazy SDK client.
        self._client: Any = None

    def _sdk(self) -> Any:
        if self._client is None:
            import anthropic
            self._client = anthropic.Anthropic(
                api_key=self._api_key,
                base_url=self._base_url or None,
                timeout=float(get_settings().llm_call_timeout_seconds),
            )
        return self._client

    def is_available(self) -> bool:
        return bool(self._api_key)

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        max_tokens: int = 4096,
        session_id: str | None = None,
    ) -> ChatResponse:
        """Step J2: Anthropic Messages API with tool use.

        Wire format (per Anthropic docs):
          POST {base}/v1/messages
          body: {
            "model": "...",
            "max_tokens": int,
            "system": "..." (optional),
            "messages": [
              {"role": "user", "content": "..." or [{...}]},
              {"role": "assistant",
               "content": [{"type": "text"}, {"type": "tool_use", ...}]},
              {"role": "user",
               "content": [{"type": "tool_result",
                            "tool_use_id": "...",
                            "content": "..."}]},
            ],
            "tools": [
              {"name": "...",
               "description": "...",
               "input_schema": {...}}
            ]
          }
          response: {
            "stop_reason": "end_turn" | "tool_use" | "max_tokens" | "stop_sequence",
            "content": [
              {"type": "text", "text": "..."},
              {"type": "tool_use",
               "id": "toolu_...",
               "name": "...",
               "input": {...}}
            ],
            "usage": {...}
          }
        """
        if not self.is_available():
            return ChatResponse(
                content_blocks=[{"type": "text", "text": "(no API key)"}],
                stop_reason="end_turn",
            )
        # Pull a system prompt out of the messages list if
        # the caller passed one as role=system.
        system_text: str | None = None
        norm_messages: list[dict[str, Any]] = []
        for m in messages:
            if m.get("role") == "system":
                # Multiple system messages get concatenated.
                if system_text is None:
                    system_text = m.get("content", "")
                else:
                    system_text = str(system_text) + "\n" + str(m.get("content", ""))
            else:
                norm_messages.append(m)
        body: dict[str, Any] = {
            "model": self._model,
            "max_tokens": max_tokens,
            "messages": norm_messages,
        }
        if system_text:
            # R-2026-06-15
            # (Phase 0 +
            # 3c): mark the
            # system
            # prompt as
            # prompt-
            # cacheable
            # (Anthropic
            # ephemeral
            # cache).
            # The cache
            # survives
            # 5 minutes
            # by default,
            # or the
            # configured
            # ``prompt_cache_ttl``.
            from ..prompt_cache import (
                build_anthropic_cache_metadata,
            )
            ttl = (
                get_settings().prompt_cache_ttl
            )
            body["system"] = [
                {
                    "type": "text",
                    "text": system_text,
                    "cache_control": (
                        build_anthropic_cache_metadata(
                            ttl
                        )
                    ),
                }
            ]
        if tools:
            # Anthropic shape is identical to our
            # provider-agnostic shape — name / description /
            # input_schema. No translation needed.
            body["tools"] = [
                {
                    "name": t["name"],
                    "description": t.get("description", ""),
                    "input_schema": t.get(
                        "input_schema",
                        {"type": "object", "properties": {}},
                    ),
                }
                for t in tools
            ]
        try:
            kwargs: dict[str, Any] = {
                "model": self._model,
                "max_tokens": max_tokens,
                "messages": norm_messages,
            }
            if system_text:
                # R-2026-06-15
                # (Phase 0 +
                # 3c): mark the
                # system
                # prompt as
                # prompt-
                # cacheable
                # (Anthropic).
                from ..prompt_cache import (
                    build_anthropic_cache_metadata,
                )
                ttl = (
                    get_settings().prompt_cache_ttl
                )
                kwargs["system"] = [
                    {
                        "type": "text",
                        "text": system_text,
                        "cache_control": (
                            build_anthropic_cache_metadata(
                                ttl
                            )
                        ),
                    }
                ]
            if tools:
                kwargs["tools"] = [
                    {
                        "name": t["name"],
                        "description": t.get("description", ""),
                        "input_schema": t.get(
                            "input_schema",
                            {"type": "object", "properties": {}},
                        ),
                    }
                    for t in tools
                ]
            # G5.5: same retry policy as
            # OpenAI. The helper takes
            # ``model``, ``max_tokens``,
            # ``messages`` as named
            # arguments and forwards any
            # extra ``kwargs`` (e.g.
            # ``system``, ``tools``)
            # through. We extract the
            # three core fields from
            # ``kwargs`` and pass the
            # remainder.
            # Filter out every key that
            # is now passed as a named
            # argument to the helper
            # (model, max_tokens, messages,
            # tools). Anything else
            # (e.g. ``system``,
            # ``metadata``, future
            # fields) is forwarded as
            # ``**kwargs``. We exclude
            # ``tools`` too because the
            # helper accepts ``tools`` as
            # a named argument.
            _helper_keys = {
                "model", "max_tokens", "messages", "tools",
            }
            resp = _anthropic_create_with_retry(
                self._sdk(),
                model=kwargs["model"],
                max_tokens=kwargs["max_tokens"],
                messages=kwargs["messages"],
                tools=kwargs.get("tools"),
                **{
                    k: v for k, v in kwargs.items()
                    if k not in _helper_keys
                },
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("anthropic chat failed", extra={"err": str(exc)})
            return ChatResponse(
                content_blocks=[
                    {"type": "text", "text": _format_llm_error(exc)}
                ],
                stop_reason="end_turn",
            )
        # Translate SDK response -> our ChatResponse. The
        # SDK's ``content`` is a list of typed blocks
        # (TextBlock, ToolUseBlock, ...); we convert to
        # plain dicts in our normalized shape.
        blocks: list[dict[str, Any]] = []
        for block in getattr(resp, "content", []) or []:
            btype = getattr(block, "type", "")
            if btype == "text":
                blocks.append({"type": "text", "text": getattr(block, "text", "")})
            elif btype == "thinking":
                # DeepSeek / extended-thinking models: must echo
                # thinking (+ signature) on the next request or the
                # API returns 400 invalid_request_error.
                blocks.append(
                    {
                        "type": "thinking",
                        "thinking": getattr(block, "thinking", "") or "",
                        "signature": getattr(block, "signature", "") or "",
                    }
                )
            elif btype == "redacted_thinking":
                blocks.append(
                    {
                        "type": "redacted_thinking",
                        "data": getattr(block, "data", "") or "",
                    }
                )
            elif btype == "tool_use":
                blocks.append(
                    {
                        "type": "tool_use",
                        "id": getattr(block, "id", "") or "",
                        "name": getattr(block, "name", "") or "",
                        "input": dict(getattr(block, "input", {}) or {}),
                    }
                )
        return ChatResponse(
            content_blocks=blocks,
            stop_reason=getattr(resp, "stop_reason", "") or "",
            usage=(
                resp.usage.model_dump()
                if getattr(resp, "usage", None) is not None
                else {}
            ),
        )

    def chat_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        max_tokens: int = 4096,
        session_id: str | None = None,
    ) -> "Iterator[ChatResponse]":
        """P2.5 — token-level streaming via the
        Anthropic SDK ``stream=True`` mode.

        Anthropic's stream emits event objects
        that we fold into a running
        ``ChatResponse`` via ``merged()`` and
        yield the running total. The shape
        of the event types is documented in
        the Anthropic Python SDK: each event
        has a ``type`` attribute ("message_start",
        "content_block_start",
        "content_block_delta",
        "content_block_stop", "message_delta",
        "message_stop"). We translate them
        into ChatResponse deltas and let
        ``merged()`` fold them in.
        """
        if not self.is_available():
            resp = self.chat(
                messages, tools, max_tokens=max_tokens
            )
            yield resp
            return
        anthropic_messages, system_text = _to_anthropic_messages(
            messages
        )
        anthropic_tools = None
        if tools:
            anthropic_tools = [
                {
                    "name": t["name"],
                    "description": t.get("description", ""),
                    "input_schema": t.get("input_schema", {}),
                }
                for t in tools
            ]
        accumulated = ChatResponse(model=self._model)
        try:
            # G5.5: same retry helper
            # as the non-streaming path.
            # The helper returns the SDK
            # stream object; the
            # iteration that follows is
            # the same as before.
            # System prompt is a top-level
            # Anthropic field (same as
            # non-stream ``chat()``) — never
            # re-role as user (that created
            # consecutive user messages and
            # DeepSeek 400s under tools).
            stream_kwargs: dict[str, Any] = {
                "model": self._model,
                "max_tokens": max_tokens,
                "messages": anthropic_messages,
                "tools": anthropic_tools,
                "stream": True,
                "timeout": float(
                    get_settings().llm_stream_timeout_seconds
                ),
            }
            if system_text:
                from ..prompt_cache import (
                    build_anthropic_cache_metadata,
                )

                ttl = get_settings().prompt_cache_ttl
                stream_kwargs["system"] = [
                    {
                        "type": "text",
                        "text": system_text,
                        "cache_control": (
                            build_anthropic_cache_metadata(ttl)
                        ),
                    }
                ]
            stream = _anthropic_create_with_retry(
                self._sdk(),
                **stream_kwargs,
            )
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "anthropic chat_stream failed; falling back to non-stream chat",
                extra={"err": str(exc)},
            )
            # Prefer a real completion over an error bubble —
            # thinking models + multi-turn need full blocks.
            yield self.chat(
                messages, tools, max_tokens=max_tokens, session_id=session_id
            )
            return
        # Track the currently-open tool_use
        # block. Anthropic sends the input as
        # a streaming JSON string; the SDK
        # does not re-parse it for us, so we
        # accumulate the fragments and feed
        # the best-effort parsed object into
        # the merged() fold on every chunk.
        #
        # Thinking (DeepSeek / extended thinking):
        # ``thinking_delta`` fragments must be
        # *concatenated*, and ``signature_delta``
        # must be attached — the next request
        # requires both or the API returns 400.
        pending_tool_name: str = ""
        pending_tool_input_parts: list[str] = []
        pending_tool_id: str = ""
        pending_thinking: str = ""
        pending_thinking_sig: str = ""
        thinking_open: bool = False
        try:
            for event in stream:
                new_blocks: list[dict[str, Any]] = []
                stop_reason = ""
                usage: dict[str, Any] = {}
                event_type = getattr(event, "type", None)
                if event_type == "content_block_start":
                    block = getattr(event, "content_block", None)
                    if block is None:
                        continue
                    btype = getattr(block, "type", None)
                    if btype == "text":
                        new_blocks.append({"type": "text", "text": ""})
                    elif btype == "thinking":
                        thinking_open = True
                        pending_thinking = getattr(block, "thinking", "") or ""
                        pending_thinking_sig = (
                            getattr(block, "signature", "") or ""
                        )
                        new_blocks.append(
                            {
                                "type": "thinking",
                                "thinking": pending_thinking,
                                "signature": pending_thinking_sig,
                            }
                        )
                    elif btype == "redacted_thinking":
                        new_blocks.append(
                            {
                                "type": "redacted_thinking",
                                "data": getattr(block, "data", "") or "",
                            }
                        )
                    elif btype == "tool_use":
                        pending_tool_name = (
                            getattr(block, "name", "") or ""
                        )
                        pending_tool_id = (
                            getattr(block, "id", "") or ""
                        )
                        pending_tool_input_parts = []
                        new_blocks.append({
                            "type": "tool_use",
                            "id": pending_tool_id,
                            "name": pending_tool_name,
                            "input": {},
                        })
                elif event_type == "content_block_delta":
                    delta = getattr(event, "delta", None)
                    if delta is None:
                        continue
                    dtype = getattr(delta, "type", None)
                    if dtype == "text_delta":
                        text_fragment = getattr(delta, "text", "") or ""
                        if text_fragment:
                            new_blocks.append({
                                "type": "text",
                                "text": text_fragment,
                            })
                    elif dtype == "thinking_delta":
                        frag = getattr(delta, "thinking", None)
                        if frag is None:
                            frag = getattr(delta, "text", "") or ""
                        pending_thinking += str(frag or "")
                        thinking_open = True
                        new_blocks.append(
                            {
                                "type": "thinking",
                                "thinking": pending_thinking,
                                "signature": pending_thinking_sig,
                            }
                        )
                    elif dtype == "signature_delta":
                        sig = getattr(delta, "signature", "") or ""
                        if sig:
                            pending_thinking_sig = sig
                        thinking_open = True
                        new_blocks.append(
                            {
                                "type": "thinking",
                                "thinking": pending_thinking,
                                "signature": pending_thinking_sig,
                            }
                        )
                    elif dtype == "input_json_delta":
                        fragment = getattr(
                            delta, "partial_json", ""
                        ) or ""
                        if fragment:
                            pending_tool_input_parts.append(fragment)
                            tentative = _safe_json_loads(
                                "".join(pending_tool_input_parts)
                            )
                            if tentative is None:
                                tentative = {}
                            new_blocks.append({
                                "type": "tool_use",
                                "id": pending_tool_id,
                                "name": pending_tool_name,
                                "input": tentative,
                            })
                elif event_type == "content_block_stop":
                    if thinking_open and (
                        pending_thinking or pending_thinking_sig
                    ):
                        new_blocks.append(
                            {
                                "type": "thinking",
                                "thinking": pending_thinking,
                                "signature": pending_thinking_sig,
                            }
                        )
                        thinking_open = False
                elif event_type == "message_delta":
                    delta = getattr(event, "delta", None)
                    if delta is not None:
                        sr = getattr(delta, "stop_reason", None)
                        if sr:
                            stop_reason = sr
                    usage_obj = (
                        getattr(delta, "usage", None)
                        if delta is not None else None
                    ) or getattr(event, "usage", None)
                    if usage_obj is not None:
                        usage = (
                            usage_obj.model_dump()
                            if hasattr(usage_obj, "model_dump")
                            else dict(usage_obj)
                        )
                if not new_blocks and not stop_reason and not usage:
                    continue
                delta_resp = ChatResponse(
                    content_blocks=new_blocks,
                    stop_reason=stop_reason,
                    usage=usage,
                    model=self._model,
                )
                accumulated = accumulated.merged(delta_resp)
                yield accumulated
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "anthropic chat_stream iteration failed; "
                "falling back to non-stream chat",
                extra={"err": str(exc)},
            )
            yield self.chat(
                messages, tools, max_tokens=max_tokens, session_id=session_id
            )
            return

    def analyze_finding(self, finding: Finding) -> LLMVerdict | None:
        if not self.is_available():
            return None
        try:
            raw = self._call(finding, strict_json=False)
            verdict = _parse_or_retry(self, finding, raw, self._call)
        except Exception as exc:  # noqa: BLE001
            log.warning("anthropic llm call failed", extra={"err": str(exc)})
            return None
        return verdict

    def analyze_findings_batch(
        self,
        findings: list[Finding],
        *,
        ids: list[str] | None = None,
    ) -> dict[str, LLMVerdict]:
        """Batch enrichment: one Messages call → map id → LLMVerdict."""
        from ..enrichment import _batch_prompt, _parse_batch_response

        if not self.is_available() or not findings:
            return {}
        id_list = ids or [f.finding_id for f in findings]
        items = list(zip(id_list, findings))
        prompt = _batch_prompt(items)
        try:
            raw = self._call_raw_prompt(prompt, max_tokens=2500)
            out = _parse_batch_response(raw, id_list)
            missing = [it for it in items if it[0] not in out]
            if missing:
                raw2 = self._call_raw_prompt(
                    prompt + "\nOutput ONLY a JSON array.",
                    max_tokens=2500,
                )
                out.update(_parse_batch_response(raw2, [m[0] for m in missing]))
            return out
        except Exception as exc:  # noqa: BLE001
            log.warning("anthropic batch llm failed", extra={"err": str(exc)})
            return {}

    def _call_raw_prompt(
        self, prompt: str, *, max_tokens: int = 1200
    ) -> str | None:
        timeout = float(get_settings().llm_call_timeout_seconds)
        base = (self._base_url or "https://api.anthropic.com").rstrip("/")
        url = f"{base}/messages" if base.endswith("/v1") else f"{base}/v1/messages"
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(
                url,
                headers={
                    "x-api-key": self._api_key or "",
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": self._model,
                    "max_tokens": max_tokens,
                    "system": _SYSTEM_PROMPT,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            resp.raise_for_status()
            data = resp.json()
        return _anthropic_content_text(data.get("content"))

    def _call(self, finding: Finding, strict_json: bool = False) -> str | None:
        """Enrichment HTTP call via Anthropic-compatible Messages API.

        Uses ``settings.anthropic_base_url`` so DeepSeek
        (``https://api.deepseek.com/anthropic``) and other Anthropic-
        compatible proxies work. Official Anthropic remains the default
        when base_url is unset / points at api.anthropic.com.

        Response content may include ``thinking`` blocks before ``text``
        (DeepSeek reasoner / v4); we return the first text block.
        """
        prompt = _build_prompt(finding, strict_json=strict_json)
        max_tokens = 800 if strict_json else 1200
        return self._call_raw_prompt(prompt, max_tokens=max_tokens)


def _anthropic_content_text(content: Any) -> str | None:
    """Extract assistant text from Anthropic-style content blocks.

    Prefers ``type=text`` blocks; skips thinking/tool_use. Falls back to
    first string-like block for older/nonstandard proxies.
    """
    if content is None:
        return None
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return None
    texts: list[str] = []
    for block in content:
        if isinstance(block, str):
            texts.append(block)
            continue
        if not isinstance(block, dict):
            # SDK object
            btype = getattr(block, "type", None)
            if btype == "text":
                t = getattr(block, "text", None)
                if t:
                    texts.append(str(t))
            continue
        if block.get("type") == "text" and block.get("text"):
            texts.append(str(block["text"]))
    if texts:
        return "\n".join(texts).strip() or None
    # Last resort: first block with a text field
    for block in content:
        if isinstance(block, dict) and block.get("text"):
            return str(block["text"])
    return None


# ---------- schema validation + retry ----------



def _to_openai_messages(
    messages: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Translate our provider-agnostic message
    list (with content as a string) into the
    OpenAI wire format (content is a string
    too, so this is mostly a pass-through —
    we keep the helper for symmetry with
    ``_to_anthropic_messages`` and as a
    future extension point)."""
    out: list[dict[str, Any]] = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        if isinstance(content, str):
            out.append({"role": role, "content": content})
        else:
            # Pass-through for the agent loop's
            # tool_result blocks (a list of
            # dicts with ``type`` set).
            out.append({"role": role, "content": content})
    return out




def _to_anthropic_messages(
    messages: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], str | None]:
    """Translate provider-agnostic messages to Anthropic wire format.

    Returns ``(messages_without_system, system_text)``.

    Anthropic requires ``system`` as a *top-level* field, not a
    ``role=system`` entry in ``messages``. Historically this helper
    re-labeled system → user, which produced **two consecutive user
    messages** (system body + real user) and caused DeepSeek/Anthropic
    gateways to return ``400 invalid_request_error`` when tools were
    attached. Non-stream ``chat()`` already extracted system correctly;
    stream now matches that contract.
    """
    out: list[dict[str, Any]] = []
    system_parts: list[str] = []
    for m in messages:
        role = m.get("role", "user")
        if role == "system":
            content = m.get("content", "")
            if content:
                system_parts.append(str(content))
            continue
        out.append({"role": role, "content": m.get("content", "")})
    system_text = "\n".join(system_parts) if system_parts else None
    return out, system_text
