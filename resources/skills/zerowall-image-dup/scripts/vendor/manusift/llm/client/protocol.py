"""LLMClient Protocol.

R-2026-06-15 (Phase 4 + P4-2):
extracted from
``manusift.llm.client``.
"""
from __future__ import annotations

from typing import Any, Protocol

class LLMClient(Protocol):
    name: str

    def analyze_finding(self, finding: Finding) -> LLMVerdict | None: ...

    def is_available(self) -> bool: ...

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        max_tokens: int = 4096,
        session_id: str | None = None,
    ) -> "ChatResponse":
        """Step J2: send ``messages`` (provider-agnostic dict
        list — see ``_normalize_messages`` below) to the LLM
        and return a normalized ``ChatResponse``.

        P2-B1: clients that support token-level
        streaming also implement ``chat_stream``
        below. The default Protocol fallback in
        the body of the LLMClient class yields a
        single ``ChatResponse`` from ``chat()`` —
        that way callers that ask for streaming
        on a non-streaming client still get a
        valid (one-shot) iterator.

        ``tools`` is a list of provider-agnostic tool dicts::

            {
                "name": "...",
                "description": "...",
                "input_schema": {...},
            }

        The implementation translates this into the
        provider's wire format (Anthropic's ``input_schema``
        is identical; OpenAI wraps it as
        ``{"type": "function", "function": {"name",
        "description", "parameters": {...}}}``).

        The Mock implementation returns a ChatResponse with a
        single text block and ``stop_reason="end_turn"`` so
        the agent loop can be exercised end-to-end without
        any LLM.
        """
        ...

    def chat_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        max_tokens: int = 4096,
        session_id: str | None = None,
    ) -> "Iterator[ChatResponse]":
        """P2-B1: yield one ``ChatResponse`` per
        chunk. Default Protocol body just yields
        the one-shot chat() result; real clients
        override."""
        ...


# ---------- mock ----------
