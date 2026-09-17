"""LLM client package.

R-2026-06-15 (Phase 4 + P4-2):
``manusift.llm.client`` is
now a package with 3
submodules:

  * ``protocol`` -- the
    ``LLMClient``
    Protocol
  * ``providers`` --
    ``OpenAILLM`` and
    ``AnthropicLLM`` (plus
    the shared helpers)
  * ``mock`` --
    ``MockLLM``

The ``get_llm_client``
singleton factory and
the
``_reset_for_tests``
test hook live here
because they orchestrate
all three submodules.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from ...config import get_settings

from .protocol import LLMClient
from .providers import (
    OpenAILLM,
    AnthropicLLM,
    _format_llm_error,
    _build_prompt,
    _safe_parse,
    _strip_code_fence,
    # R-2026-06-15 (Phase 4 + P4-2):
    # these are
    # referenced by
    # tests and
    # downstream
    # callers.  They
    # were not
    # originally
    # re-exported
    # but are used
    # in
    # ``test_config_secret.py``
    # and
    # ``test_real_streaming.py``.
    _unwrap_key,
    _safe_json_loads,
)
from .mock import MockLLM

log = logging.getLogger(__name__)

_client_singleton: LLMClient | None = None


def get_llm_client() -> LLMClient:
    """Return a process-wide LLM client.

    Chooses in this order:
      1. Anthropic if the key is set and the default provider requests it.
      2. OpenAI if its key is set.
      3. Mock — the pipeline keeps working without any key.
    """
    global _client_singleton
    if _client_singleton is not None:
        return _client_singleton
    settings = get_settings()
    if settings.default_llm_provider == "anthropic" and settings.has_anthropic:
        _client_singleton = AnthropicLLM(settings)
    elif settings.has_openai:
        _client_singleton = OpenAILLM(settings)
    elif settings.has_anthropic:
        _client_singleton = AnthropicLLM(settings)
    else:
        log.info("no LLM keys configured — running with mock client")
        _client_singleton = MockLLM()
    return _client_singleton




def _reset_for_tests(
    forced: LLMClient | None = None,
) -> None:  # pragma: no cover — test helper
    """Reset the LLM-client
    singleton for testing.

    Tests that need a
    specific client (mock,
    fake, etc.) pass it via
    ``forced``; the singleton
    is then replaced with
    that client. Tests that
    only want to clear the
    cache call this with no
    argument, and the next
    ``get_llm_client()`` call
    will rebuild from
    ``get_settings()`` -- but
    because ``Settings``
    reads ``.env`` at
    construction time, an
    ``.env`` with a key
    will still produce an
    ``AnthropicLLM``. The
    ``forced`` argument is
    the supported way to
    override that."""
    global _client_singleton
    if forced is not None:
        _client_singleton = forced
        return
    _client_singleton = None
