"""Tool-call statistics (Step P1-D).

The L6 audit log already writes one JSONL line per
``tool.execute`` to ``data/chats/<sid>/tool_calls.jsonl``.
Each line carries ``tool``, ``ok``, ``duration_ms``
(plus the older ``error`` field for backward
compatibility with logs written before P1-D).

This module reads those JSONL files and aggregates
per-tool counts, success rate, and average /
percentile latency. The result feeds the
``GET /api/tools/stats`` endpoint and a future
``manusift-stats`` console script.

P1-D explicitly does **not** use Prometheus or any
metrics library: the audit data is already on
disk in plain JSONL, and a 50-line aggregator is
cheaper than a new dep that would just translate
the same data into a different format.

For sessions with no audit data yet, the
aggregator returns an empty list. For sessions
with a corrupt JSONL line, the line is skipped
(a malformed record must not break the dashboard
for everyone else).
"""
from __future__ import annotations

import gzip
import json
from collections import defaultdict
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable

from ..config import get_settings


@dataclass
class ToolStats:
    """Aggregated stats for one tool across all
    chat sessions. The dashboard renders this as
    one row in a table."""
    name: str
    calls: int
    errors: int
    avg_ms: int
    p50_ms: int
    p95_ms: int


def chat_sessions_root() -> Path:
    """See ``manusift.compaction.chat_sessions_root``;
    re-implemented here to keep this module
    import-cycle free."""
    return get_settings().workspace_dir.parent / "chats"


def _iter_audit_files(
    root: Path,
) -> Iterable[Path]:
    """Yield every ``tool_calls.jsonl`` and
    ``tool_calls.jsonl.<date>.jsonl.gz`` (the
    P1-C archives) under ``root``. Live files
    come first so a fresh call is reflected
    immediately; archives are read in mtime
    order so the most recent history is processed
    first.
    """
    if not root.exists():
        return
    for session_dir in sorted(root.iterdir()):
        if not session_dir.is_dir():
            continue
        # Live file (if it exists) first.
        live = session_dir / "tool_calls.jsonl"
        if live.exists():
            yield live
        # Then the rotated archives.
        for archive in sorted(
            session_dir.glob("tool_calls.*.jsonl.gz"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        ):
            yield archive


def _read_jsonl_lines(path: Path) -> Iterable[dict]:
    """Yield parsed JSON objects from a jsonl file
    or a gzipped jsonl archive. Malformed lines
    are silently skipped — the dashboard's job
    is to summarize, not to police data quality.
    """
    opener = (
        gzip.open
        if path.suffix == ".gz"
        else open
    )
    try:
        with opener(path, "rt", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue
    except OSError:
        # The file may have been deleted between
        # the glob and the open. Skip it.
        return


def aggregate_tool_stats(
    root: Path | None = None,
) -> list[ToolStats]:
    """Walk every session under ``root`` and
    return one ``ToolStats`` per tool, sorted
    by call count descending (the most-used
    tool is the first row in the dashboard).
    """
    root = root or chat_sessions_root()
    durations: dict[str, list[int]] = defaultdict(list)
    errors: dict[str, int] = defaultdict(int)
    calls: dict[str, int] = defaultdict(int)
    for path in _iter_audit_files(root):
        for record in _read_jsonl_lines(path):
            name = record.get("tool")
            if not name:
                continue
            calls[name] += 1
            # ``ok`` is the new P1-D flag. Older
            # records (pre-P1-D) used only the
            # ``error`` field, so we treat any
            # non-empty error string as a failure
            # for backward compatibility.
            ok = record.get("ok")
            if ok is None:
                ok = not record.get("error")
            if not ok:
                errors[name] += 1
            d = record.get("duration_ms")
            if isinstance(d, (int, float)):
                durations[name].append(int(d))
    out: list[ToolStats] = []
    for name in calls:
        ds = sorted(durations.get(name, []))
        if ds:
            avg = sum(ds) // len(ds)
            p50 = ds[len(ds) // 2]
            p95 = ds[max(0, int(len(ds) * 0.95) - 1)]
        else:
            avg = p50 = p95 = 0
        out.append(ToolStats(
            name=name,
            calls=calls[name],
            errors=errors[name],
            avg_ms=avg,
            p50_ms=p50,
            p95_ms=p95,
        ))
    # Most-called first; alpha on tie so the
    # output is stable for tests.
    out.sort(key=lambda s: (-s.calls, s.name))
    return out


def stats_to_json(rows: list[ToolStats]) -> dict:
    """Return the dashboard JSON shape: a top-level
    ``tools`` list with the row dicts inlined. The
    dataclass ``asdict`` does the field copy."""
    return {
        "tools": [asdict(r) for r in rows],
        "total_tools": len(rows),
        "total_calls": sum(r.calls for r in rows),
        "total_errors": sum(r.errors for r in rows),
    }
