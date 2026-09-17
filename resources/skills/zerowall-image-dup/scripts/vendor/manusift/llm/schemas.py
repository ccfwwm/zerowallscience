"""Pydantic schemas for LLM-enriched outputs.

Borrowed design from the *Instructor* library's ``response_model``
pattern: declare what the LLM must return as a Pydantic model, then
use ``model_validate_json`` on the raw text. If parsing fails once,
retry with a stricter prompt. We do not import the Instructor
package — that single dependency is overkill for one call site, and
the contract we want here is just "JSON in, dataclass out".

Adding ``model_config = ConfigDict(extra="forbid")`` makes the
schema strict: the LLM can return additional fields (refusals, code
fences, markdown prefixes) and we'll reject them rather than silently
swallow.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Three-bucket verdict keeps the model honest — "maybe" is the same
# as "needs_review" and we do not want a continuous 0..1 score that
# the LLM will hedge toward 0.5.
VerdictLabel = Literal["looks_legit", "suspicious", "needs_review"]


class LLMVerdict(BaseModel):
    """Structured output from the LLM judge.

    Populated once per high/medium finding by the LLM enrichment
    stage. The pipeline stores ``summary`` in
    ``Finding.llm_verdict`` (a backwards-compatible change — old
    HTML reports that printed free text still work, they just see
    the summary string instead of the LLM's raw output).
    """

    model_config = ConfigDict(extra="forbid")

    summary: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="1-2 sentence human-readable assessment.",
    )
    verdict: VerdictLabel = Field(
        ...,
        description="Three-bucket judgment of the underlying finding.",
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Model self-assessed confidence in the verdict.",
    )
    next_step: str = Field(
        ...,
        min_length=5,
        max_length=200,
        description="Concrete next verification step the human should take.",
    )
