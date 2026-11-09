"""MockLLM for tests.

R-2026-06-15 (Phase 4 + P4-2):
extracted from
``manusift.llm.client``.
"""
from __future__ import annotations

from typing import Any

from ..chat import ChatResponse
from .protocol import LLMClient

class MockLLM:
    name = "mock"

    def analyze_finding(self, finding: Finding) -> LLMVerdict | None:
        return None

    def is_available(self) -> bool:
        return True

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        max_tokens: int = 4096,
        session_id: str | None = None,
    ) -> ChatResponse:
        """The mock LLM echoes the last user message back
        and reports end_turn. This is enough for the
        AgentLoop (Step J3) to be exercised end-to-end
        without any real LLM — the loop reads the (empty)
        tool_calls, finds nothing to do, and returns.
        Tests that need a tool call inject a smarter mock
        via ``monkeypatch.setattr(client, 'chat', ...)``.

        R-2026-06-15 (Phase 0 + 3c):
        ``session_id`` is accepted
        but ignored (the mock
        does not talk to a real
        provider; the kwarg
        exists so the test
        signature matches the
        OpenAI / Anthropic
        clients).
        """
        last_text = ""
        for m in reversed(messages):
            content = m.get("content", "")
            if isinstance(content, str) and content.strip():
                last_text = content
                break
        return ChatResponse(
            content_blocks=[{"type": "text", "text": f"[mock echo] {last_text}"}],
            stop_reason="end_turn",
        )

    def chat_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        max_tokens: int = 4096,
        session_id: str | None = None,
    ) -> "Iterator[ChatResponse]":
        """P2-B1 — the mock streams in one
        chunk. Yielding exactly the same
        response as ``chat()`` keeps the
        AgentLoop logic identical between the
        streaming and non-streaming code paths
        (the loop's on_step hook and the cost
        log see a single ChatResponse per
        LLM call).

        R-2026-06-15 (Phase 0 + 3c):
        ``session_id`` is accepted
        but ignored (the mock
        does not talk to a real
        provider; the kwarg
        exists so the test
        signature matches the
        OpenAI / Anthropic
        clients).
        """
        yield self.chat(
            messages,
            tools,
            max_tokens=max_tokens,
            session_id=session_id,
        )


# ---------- OpenAI compatible ----------
