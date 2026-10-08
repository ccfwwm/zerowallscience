"""Chat response type (Step J2).

Normalizes provider chat responses into typed content blocks
(``response.content`` as a list of blocks, not a bare string).
Both OpenAI and Anthropic return slightly different shapes, so
we normalize here. The AgentLoop (Step J3) only ever sees
ChatResponse and never the raw provider dicts.

The shape:
  * ``content_blocks`` — a list of typed dicts. Each block
    has at least a ``type`` field. Recognized types:
    - ``"text"``: plain text. Has ``text`` (str).
    - ``"tool_use"``: a request to call a tool. Has
      ``id`` (str), ``name`` (str), ``input`` (dict).
  * ``stop_reason`` — provider-specific string. The
    AgentLoop only acts on these values:
    - ``"end_turn"`` (Anthropic) / ``"stop"`` (OpenAI):
      the LLM is done, return the response.
    - ``"tool_use"`` (Anthropic) / ``"tool_calls"``
      (OpenAI): the LLM wants to call tools.
  * ``usage`` — token counts. We keep the provider's
    structure verbatim; callers that care can introspect.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ChatResponse:
    """Normalized chat response. See module docstring."""

    content_blocks: list[dict[str, Any]] = field(default_factory=list)
    stop_reason: str = ""
    usage: dict[str, Any] = field(default_factory=dict)
    # P1-E — model name that produced this
    # response. Empty string for callers that
    # build ChatResponse by hand (the
    # test-suite does this). The P1-E cost
    # aggregator uses this to bill per-model
    # with the right price list. We keep it on
    # the response (rather than on the client)
    # because the agent loop does not always
    # know which client made a given call when
    # it composes multi-model pipelines.
    model: str = ""

    def merged(self, other: "ChatResponse") -> "ChatResponse":
        """P2.5 — merge another ChatResponse into
        this one as if the model had produced
        both as a single response. Used by the
        streaming clients to fold per-chunk
        deltas into an accumulated final
        response.

        Merge rules:
          * ``content_blocks`` is concatenated
            (text blocks are merged by string
            concatenation when the previous
            block was also a text block;
            tool_use blocks with the same id
            are merged in place — the last
            chunk wins).
          * ``stop_reason`` keeps the
            non-empty value (other wins on
            tie, which is the typical case
            because the API sends the stop
            reason on the last chunk).
          * ``usage`` keeps the non-empty
            value (the API only returns it
            on the last chunk; we keep self
            if other is empty so a streaming
            response without a usage record
            still has the partial).
          * ``model`` keeps the non-empty
            value (same rationale as usage).
        """
        merged_blocks = list(self.content_blocks)
        for block in other.content_blocks:
            if block.get("type") == "text":
                if (
                    merged_blocks
                    and merged_blocks[-1].get("type") == "text"
                ):
                    last = merged_blocks[-1]
                    merged_blocks[-1] = {
                        **last,
                        "text": last.get("text", "") + block.get("text", ""),
                    }
                else:
                    merged_blocks.append(dict(block))
            elif block.get("type") == "tool_use":
                bid = block.get("id")
                if bid is not None:
                    replaced = False
                    for i, existing in enumerate(merged_blocks):
                        if (
                            existing.get("type") == "tool_use"
                            and existing.get("id") == bid
                        ):
                            merged_blocks[i] = dict(block)
                            replaced = True
                            break
                    if not replaced:
                        merged_blocks.append(dict(block))
                else:
                    merged_blocks.append(dict(block))
            elif block.get("type") in ("thinking", "redacted_thinking"):
                # Thinking: accumulate text (stream deltas are
                # cumulative *or* progressive); always keep the
                # latest non-empty signature (DeepSeek requires it).
                replaced = False
                for i, existing in enumerate(merged_blocks):
                    if existing.get("type") == block.get("type"):
                        old_t = str(existing.get("thinking") or "")
                        new_t = str(block.get("thinking") or "")
                        if not old_t or old_t in new_t or len(new_t) >= len(old_t):
                            think = new_t or old_t
                        elif new_t and new_t not in old_t:
                            think = old_t + new_t
                        else:
                            think = old_t or new_t
                        sig = (
                            str(block.get("signature") or "")
                            or str(existing.get("signature") or "")
                        )
                        data = block.get("data") or existing.get("data") or ""
                        merged_blocks[i] = {
                            **existing,
                            **dict(block),
                            "thinking": think,
                            "signature": sig,
                            "data": data,
                        }
                        replaced = True
                        break
                if not replaced:
                    merged_blocks.append(dict(block))
            else:
                merged_blocks.append(dict(block))
        return ChatResponse(
            content_blocks=merged_blocks,
            stop_reason=other.stop_reason or self.stop_reason,
            usage=other.usage or self.usage,
            model=other.model or self.model,
        )


    @property
    def text(self) -> str:
        """Concatenate all ``text`` blocks into a single
        string. Convenience for callers that only care about
        the final text (no tool calls)."""
        return "".join(
            block.get("text", "")
            for block in self.content_blocks
            if block.get("type") == "text"
        )

    @property
    def tool_calls(self) -> list[dict[str, Any]]:
        """Return all ``tool_use`` blocks as a flat list.
        The AgentLoop iterates these and dispatches each to
        a Tool.execute() call."""
        return [
            block
            for block in self.content_blocks
            if block.get("type") == "tool_use"
        ]


def normalize_assistant_content_blocks(
    blocks: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    """Reorder assistant blocks for Anthropic/DeepSeek thinking mode.

    Required order: thinking / redacted_thinking → text → tool_use → other.
    Streaming folds can emit tool_use before thinking; echoing that history
    yields 400 ``tool_use`` without ``tool_result`` / invalid thinking.
    """
    if not blocks:
        return []
    thinking: list[dict[str, Any]] = []
    text: list[dict[str, Any]] = []
    tools: list[dict[str, Any]] = []
    other: list[dict[str, Any]] = []
    for b in blocks:
        if not isinstance(b, dict):
            continue
        btype = b.get("type")
        if btype in ("thinking", "redacted_thinking"):
            thinking.append(dict(b))
        elif btype == "text":
            text.append(dict(b))
        elif btype == "tool_use":
            tools.append(dict(b))
        else:
            other.append(dict(b))
    return thinking + text + tools + other


def fold_stream_chunk(
    accumulated: "ChatResponse | None",
    partial: "ChatResponse",
    *,
    longest_text: str = "",
) -> tuple["ChatResponse", str]:
    """Fold one ``chat_stream`` yield into a running total.

    Providers (Anthropic / OpenAI / many OpenAI-compatible
    gateways) yield **running snapshots** — each chunk's
    ``.text`` is the full string so far, not a pure delta.
    Blind ``accumulated.merged(partial)`` therefore
    *re-concatenates* snapshots and produces garbled
    repetition (``论文`` + ``论文 clean`` + …).

    Rules (same as legacy ``AgentLoop.run_stream``):
      * if ``partial.text`` extends / contains
        ``longest_text`` → replace text with snapshot;
      * if ``partial.text`` is a shorter substring → keep
        longest, still take new stop_reason / tool_use;
      * else treat as a genuine delta and append via
        ``merged()``.

    Returns ``(new_accumulated, new_longest_text)``.
    """
    if accumulated is None:
        return (
            ChatResponse(
                content_blocks=normalize_assistant_content_blocks(
                    list(partial.content_blocks)
                ),
                stop_reason=partial.stop_reason,
                usage=dict(partial.usage or {}),
                model=partial.model,
            ),
            partial.text or "",
        )

    ptext = partial.text or ""
    if ptext and len(ptext) >= len(longest_text):
        if not longest_text or longest_text in ptext:
            # Snapshot replace for text; id-merge tool_use;
            # keep thinking from either side (do not drop).
            longest_text = ptext
            new_blocks: list[dict[str, Any]] = []
            seen_tool_ids: set[str] = set()
            # Preserve thinking/redacted from accumulated first.
            for b in accumulated.content_blocks:
                if b.get("type") in ("thinking", "redacted_thinking"):
                    new_blocks.append(dict(b))
                elif b.get("type") == "tool_use":
                    bid = b.get("id", "")
                    if bid:
                        seen_tool_ids.add(str(bid))
                        new_blocks.append(dict(b))
            for b in partial.content_blocks:
                if b.get("type") == "tool_use":
                    bid = str(b.get("id", "") or "")
                    if bid and bid in seen_tool_ids:
                        for i, existing in enumerate(new_blocks):
                            if (
                                existing.get("type") == "tool_use"
                                and existing.get("id") == bid
                            ):
                                new_blocks[i] = dict(b)
                                break
                    else:
                        new_blocks.append(dict(b))
                        if bid:
                            seen_tool_ids.add(bid)
                elif b.get("type") == "text":
                    # Single text block = full snapshot.
                    replaced = False
                    for i, existing in enumerate(new_blocks):
                        if existing.get("type") == "text":
                            new_blocks[i] = dict(b)
                            replaced = True
                            break
                    if not replaced:
                        new_blocks.append(dict(b))
                elif b.get("type") in ("thinking", "redacted_thinking"):
                    replaced = False
                    for i, existing in enumerate(new_blocks):
                        if existing.get("type") == b.get("type"):
                            old_t = str(existing.get("thinking") or "")
                            new_t = str(b.get("thinking") or "")
                            if (
                                not old_t
                                or old_t in new_t
                                or len(new_t) >= len(old_t)
                            ):
                                think = new_t or old_t
                            elif new_t and new_t not in old_t:
                                think = old_t + new_t
                            else:
                                think = old_t or new_t
                            sig = (
                                str(b.get("signature") or "")
                                or str(existing.get("signature") or "")
                            )
                            new_blocks[i] = {
                                **existing,
                                **dict(b),
                                "thinking": think,
                                "signature": sig,
                            }
                            replaced = True
                            break
                    if not replaced:
                        new_blocks.append(dict(b))
                else:
                    new_blocks.append(dict(b))
            if ptext and not any(
                b.get("type") == "text" for b in new_blocks
            ):
                new_blocks.append({"type": "text", "text": ptext})
            acc = ChatResponse(
                content_blocks=normalize_assistant_content_blocks(new_blocks),
                stop_reason=partial.stop_reason or accumulated.stop_reason,
                usage=partial.usage or accumulated.usage,
                model=partial.model or accumulated.model,
            )
            return acc, longest_text
        if ptext in longest_text:
            if partial.stop_reason or partial.tool_calls:
                merged = accumulated.merged(partial)
                return (
                    ChatResponse(
                        content_blocks=normalize_assistant_content_blocks(
                            list(merged.content_blocks)
                        ),
                        stop_reason=merged.stop_reason,
                        usage=dict(merged.usage or {}),
                        model=merged.model,
                    ),
                    longest_text,
                )
            return accumulated, longest_text
        # Genuine non-substring growth that is longer — rare; append.
        longest_text = longest_text + ptext
        merged = accumulated.merged(partial)
        return (
            ChatResponse(
                content_blocks=normalize_assistant_content_blocks(
                    list(merged.content_blocks)
                ),
                stop_reason=merged.stop_reason,
                usage=dict(merged.usage or {}),
                model=merged.model,
            ),
            longest_text,
        )

    if ptext and ptext not in longest_text:
        longest_text = longest_text + ptext
        merged = accumulated.merged(partial)
        return (
            ChatResponse(
                content_blocks=normalize_assistant_content_blocks(
                    list(merged.content_blocks)
                ),
                stop_reason=merged.stop_reason,
                usage=dict(merged.usage or {}),
                model=merged.model,
            ),
            longest_text,
        )

    if partial.stop_reason or partial.tool_calls:
        merged = accumulated.merged(partial)
        return (
            ChatResponse(
                content_blocks=normalize_assistant_content_blocks(
                    list(merged.content_blocks)
                ),
                stop_reason=merged.stop_reason,
                usage=dict(merged.usage or {}),
                model=merged.model,
            ),
            longest_text,
        )
    return accumulated, longest_text
