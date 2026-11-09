"""LLM cost tracking (Step P1-E).

The pre-P1-E pipeline had no notion of "how much
did this LLM call cost". Agent hosts may make
several LLM calls per session; without a log the
operator cannot tell whether a session cost 0.001
USD or 0.10 USD.

P1-E layers a cost log on top of the existing
``ChatResponse.usage`` field. The cost log lives
at ``data/cost/calls.jsonl`` (one line per LLM
call, regardless of session). The aggregator
reads the log, looks up a price per
(input/output) token by model, and returns a
JSON shape suitable for a dashboard.

Price list:

  We hard-code a small but realistic price
  table for the four models we expect users to
  run. Adding a model is a one-line addition
  to ``_PRICE_PER_1K``. The prices are per
  1 000 tokens in USD and reflect the public
  list prices as of mid-2026; they are
  intentionally not configurable via env
  var — if you have a custom enterprise price,
  fork this file.

We intentionally use the log-only pattern (no
SQLite, no in-memory dict) for the same
reason as the L6 audit log: rotating it later
is a single cron line, and a corrupted line
does not break the dashboard.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Iterable

from .config import get_settings
from .llm.chat import ChatResponse
from .trace import get_logger

log = get_logger(__name__)


# Public price list — USD per 1 000 tokens.
# Source: each vendor's public pricing page in
# 2026-Q2. Update quarterly. The MockLLM
# produces zero usage so the aggregator returns
# 0.00 USD by default.
_PRICE_PER_1K: dict[str, dict[str, float]] = {
    "gpt-4o-mini":         {"in": 0.15, "out": 0.60},
    "gpt-4o":              {"in": 2.50, "out": 10.00},
    "gpt-4.1-mini":        {"in": 0.40, "out": 1.60},
    "gpt-4.1":             {"in": 2.00, "out": 8.00},
    "claude-3-5-sonnet-latest": {"in": 3.00, "out": 15.00},
    "claude-3-5-haiku-latest":  {"in": 0.80, "out": 4.00},
    "claude-3-opus-latest":     {"in": 15.00, "out": 75.00},
    "mock":                {"in": 0.00, "out": 0.00},
}


def _cost_for(model: str, in_tok: int, out_tok: int) -> float:
    """USD cost for one call. Unknown models
    default to gpt-4o-mini pricing — that is
    the safest "we don't know" choice and an
    operator who adds a new model will see the
    surprise in the dashboard, not on the bill.
    """
    table = _PRICE_PER_1K.get(model, _PRICE_PER_1K["gpt-4o-mini"])
    in_cost = in_tok / 1000.0 * table["in"]
    out_cost = out_tok / 1000.0 * table["out"]
    return round(in_cost + out_cost, 6)


def cost_root() -> Path:
    """Directory that holds the cost log. We
    deliberately place it next to ``data/jobs``
    (sibling, not child) so deleting a job does
    not erase the cost record — the cost log
    is the audit trail for "what did we
    actually spend"."""
    return get_settings().workspace_dir.parent / "cost"


def cost_log_path() -> Path:
    """The single ``calls.jsonl`` we append to.
    A future P2 step may rotate this daily
    (parallel to P1-C chat compaction)."""
    return cost_root() / "calls.jsonl"


def record_call(chat_response: ChatResponse) -> dict | None:
    """Append one record to the cost log. Returns
    the record written, or None if the response
    has no usage info (e.g. the mock client
    with a no-API-key path).

    Best-effort: any I/O error is logged and
    swallowed so a buggy cost log can never
    break a chat session."""
    usage = chat_response.usage or {}
    in_tok = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
    out_tok = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)
    if in_tok == 0 and out_tok == 0:
        # Mock / no-key path. No cost, no record —
        # a chat session that does no LLM work
        # should not pollute the dashboard.
        return None
    model = chat_response.model or "mock"
    record = {
        "ts": datetime.now().timestamp(),
        "model": model,
        "in_tok": in_tok,
        "out_tok": out_tok,
        "cost_usd": _cost_for(model, in_tok, out_tok),
    }
    try:
        cost_log_path().parent.mkdir(parents=True, exist_ok=True)
        with cost_log_path().open("a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
    except OSError as exc:
        log.warning(
            "cost log write failed",
            extra={"err": str(exc)},
        )
    return record


@dataclass
class ModelCost:
    """One row in the cost dashboard — per model
    aggregated over the time window."""
    model: str
    calls: int
    in_tok: int
    out_tok: int
    cost_usd: float


def _iter_records(
    since_ts: float | None = None,
) -> Iterable[dict[str, Any]]:
    """Yield every JSON object in the cost log,
    newest first, optionally filtered by
    ``since_ts`` (records with ``ts >= since_ts``
    are kept). Corrupt lines are skipped (they
    are never fatal to the dashboard)."""
    path = cost_log_path()
    if not path.exists():
        return
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return
    records: list[dict[str, Any]] = []
    for line in text.splitlines():
        if not line.strip():
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        if since_ts is not None and rec.get("ts", 0) < since_ts:
            continue
        records.append(rec)
    # Newest first.
    records.sort(key=lambda r: r.get("ts", 0), reverse=True)
    yield from records


def aggregate_cost(days: int = 30) -> list[ModelCost]:
    """Sum cost and token counts per model over
    the last ``days`` days. ``days=0`` means
    "all time"."""
    if days <= 0:
        since = None
    else:
        since = (datetime.now() - timedelta(days=days)).timestamp()
    rows: dict[str, ModelCost] = {}
    for rec in _iter_records(since_ts=since):
        model = rec.get("model", "unknown")
        if model not in rows:
            rows[model] = ModelCost(
                model=model, calls=0,
                in_tok=0, out_tok=0, cost_usd=0.0,
            )
        row = rows[model]
        row.calls += 1
        row.in_tok += int(rec.get("in_tok", 0))
        row.out_tok += int(rec.get("out_tok", 0))
        row.cost_usd += float(rec.get("cost_usd", 0.0))
    out = list(rows.values())
    out.sort(key=lambda r: (-r.cost_usd, r.model))
    return out


def cost_to_json(rows: list[ModelCost]) -> dict:
    """Dashboard JSON shape. ``total_cost_usd`` is
    rounded to 4 decimal places to keep the
    response short."""
    total_in = sum(r.in_tok for r in rows)
    total_out = sum(r.out_tok for r in rows)
    total_cost = round(sum(r.cost_usd for r in rows), 4)
    return {
        "by_model": [asdict(r) for r in rows],
        "total_models": len(rows),
        "total_calls": sum(r.calls for r in rows),
        "total_in_tok": total_in,
        "total_out_tok": total_out,
        "total_cost_usd": total_cost,
    }
