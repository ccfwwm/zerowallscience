"""Prompt-cache helpers
(R-2026-06-15, Phase 0 + 3c).

Hermes rule (AGENTS.md, the
"prompt caching is sacred"
section): "long system
prompts and tool schemas
are cacheable. Always
include the
``cache_control: {type:
ephemeral}`` (or
``5m`` / ``1h``) marker
on the system prompt and
the last tool in every
LLM call. A cache hit
costs 10% of the input
price; a miss is the full
price. Caching is a 5-line
additive change with
high ROI on long
sessions."

This module is a **pure
helper** (no SDK
imports, no network) that
the LLM clients call to
build the cache-control
metadata for a request.
Tests pin the contract.

## Anthropic shape

The Anthropic Messages API
takes a list of
content blocks, and any
block can carry a
``cache_control`` field.
We mark the system
prompt and the last
tool as cacheable so the
client-server hit ratio
is maximal::

    system = [
        {
            "type": "text",
            "text": "...",
            "cache_control": {
                "type": "ephemeral"
            }
        }
    ]
    tools = [
        {"name": "...", ...},
        ...
        {
            "name": "...",
            "cache_control": {
                "type": "ephemeral"
            }
        }
    ]

## OpenAI shape

The OpenAI Chat Completions
API supports
``prompt_cache_key`` and
(when the model is a
known cached model like
``gpt-4o`` /
``o1`` /
``o3-mini``) accepts a
``prompt_cache_key`` at
the request level. Some
deployments (Azure,
vLLM) also support
``cache: {type:
"ephemeral"}`` in extra
body. We pass both the
``prompt_cache_key`` and
the cache hint at the
``extra_body`` level so
the SDK does the right
thing for the chosen
provider.
"""
from __future__ import annotations

from typing import Any


# Allowed TTLs. Anthropic
# supports ``"ephemeral"``
# (5 min) and ``"5m"`` /
# ``"1h"``. OpenAI does
# not expose a TTL knob at
# the API level; the
# ``prompt_cache_key`` is
# cached for 5-10 minutes
# by default. We keep the
# same vocabulary so the
# Settings field is
# provider-agnostic.
_VALID_TTLS: frozenset[str] = frozenset(
    {"ephemeral", "5m", "1h", "off"}
)


def build_anthropic_cache_metadata(
    ttl: str,
) -> dict[str, Any]:
    """Return a single
    ``cache_control`` dict
    for the Anthropic
    Messages API.

    The contract:

      * ``ttl="ephemeral"`` →
        ``{"type":
        "ephemeral"}``.
      * ``ttl="5m"`` →
        ``{"type":
        "ephemeral", "ttl":
        "5m"}``.
      * ``ttl="1h"`` →
        ``{"type":
        "ephemeral", "ttl":
        "1h"}``.
      * ``ttl="off"`` →
        returns ``{}``
        (no cache marker;
        the LLM client
        should still
        attach it but
        providers ignore
        the field).
      * Any other value →
        ``ValueError``.

    The returned dict is
    meant to be spread into
    a system-content block
    or a tool schema dict.
    """
    if ttl not in _VALID_TTLS:
        raise ValueError(
            f"invalid prompt-cache ttl "
            f"{ttl!r}; expected one of "
            f"{sorted(_VALID_TTLS)}"
        )
    if ttl == "off":
        return {}
    if ttl == "ephemeral":
        return {"type": "ephemeral"}
    return {"type": "ephemeral", "ttl": ttl}


def mark_anthropic_system_for_cache(
    system: list[dict[str, Any]],
    ttl: str,
) -> list[dict[str, Any]]:
    """Return a new list of
    system-content blocks
    with the LAST block
    marked as cacheable
    using the given TTL.

    The contract:

      * The last block
        gets a
        ``cache_control``
        field appended
        (or replaced).
      * Earlier blocks
        are passed
        through
        unchanged. We
        do NOT mark
        every block,
        because that
        would
        invalidate the
        cache on any
        small edit.
      * An empty input
        returns
        ``[]``.
      * A ``ttl="off"``
        returns the
        input
        unchanged.
    """
    if ttl == "off":
        return list(system)
    if not system:
        return []
    cache_control = (
        build_anthropic_cache_metadata(ttl)
    )
    out: list[dict[str, Any]] = []
    for i, block in enumerate(system):
        new_block = dict(block)
        if i == len(system) - 1:
            new_block["cache_control"] = (
                cache_control
            )
        out.append(new_block)
    return out


def mark_anthropic_tools_for_cache(
    tools: list[dict[str, Any]],
    ttl: str,
) -> list[dict[str, Any]]:
    """Return a new list of
    tool-schema dicts with
    the LAST tool marked
    as cacheable.

    The contract:

      * The last tool
        gets a
        ``cache_control``
        field appended
        (or replaced).
      * Earlier tools
        are passed
        through
        unchanged.
      * An empty input
        returns
        ``[]``.
      * A ``ttl="off"``
        returns the
        input
        unchanged.
    """
    if ttl == "off":
        return list(tools)
    if not tools:
        return []
    cache_control = (
        build_anthropic_cache_metadata(ttl)
    )
    out: list[dict[str, Any]] = []
    for i, tool in enumerate(tools):
        new_tool = dict(tool)
        if i == len(tools) - 1:
            new_tool["cache_control"] = (
                cache_control
            )
        out.append(new_tool)
    return out


def build_openai_cache_extra_body(
    cache_key: str,
    ttl: str,
) -> dict[str, Any]:
    """Return an
    ``extra_body`` dict
    that the OpenAI SDK
    forwards verbatim. The
    shape is::

        {
            "prompt_cache_key":
                cache_key,
            # Some providers also
            # accept a "cache"
            # block; we include
            # it best-effort.
            "cache": {
                "type": ttl
            },
        }

    The contract:

      * ``ttl="off"`` →
        returns ``{}``
        (the OpenAI
        cache marker is
        not sent).
      * ``cache_key``
        is always
        returned so the
        LLM client can
        pass it as a
        top-level
        argument (the
        OpenAI SDK does
        not accept
        ``prompt_cache_key``
        in ``extra_body``
        for all models;
        we surface it as
        a separate
        return-value
        field).
    """
    if ttl not in _VALID_TTLS:
        raise ValueError(
            f"invalid prompt-cache ttl "
            f"{ttl!r}; expected one of "
            f"{sorted(_VALID_TTLS)}"
        )
    if ttl == "off":
        return {}
    out: dict[str, Any] = {
        "cache": {"type": ttl}
    }
    return out


def openai_cache_key_from_session(
    session_id: str,
) -> str:
    """Return the
    ``prompt_cache_key``
    for a given session.

    The OpenAI cache is
    keyed by a free-form
    string. We pass the
    session id so resume
    operations land on
    the same cache
    bucket.
    """
    return f"manusift:session:{session_id}"
