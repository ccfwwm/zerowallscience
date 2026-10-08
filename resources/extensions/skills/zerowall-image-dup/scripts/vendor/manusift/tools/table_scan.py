"""R-2026-06-14: ``table_scan`` tool.

Covers issue 13 (LLM had no way to read a 14813-row
x 22-col table efficiently and would spawn parallel
sub-agents to chunk the work, with all the
non-determinism that brings).

The tool reads a registered data source in
**chunks** and returns the chunk as a JSON list of
records. The caller (LLM or detector) requests
chunks via ``offset`` and ``limit`` so a large
table can be walked in O(rows / limit) calls. Each
chunk includes ``schema_hash`` (so the caller can
detect a column-set change between chunks) and
``row_count_total`` (so the caller knows the upper
bound).

The tool is deliberately simple: it does NOT
parse, transform, or run statistics on the data.
The source_data_audit tool is for that. The two
are complementary: audit first to get a
shape/quality overview, then table_scan to pull
specific chunks the detectors need.
"""
from __future__ import annotations

import csv
import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .data_audit import (
    DEFAULT_SAMPLE_ROWS,
    _file_hash,
    _read_csv_or_tsv,
    _read_json,
    _read_xlsx,
)
from .tool import ToolContext


# Per-call row cap. The tool can read up to
# ``DEFAULT_CHUNK_SIZE`` rows in one call; more
# requires paginating.
DEFAULT_CHUNK_SIZE = 2_000


@dataclass(frozen=True)
class TableChunk:
    """A single chunk of a data source."""

    data_source_id: str
    path: str
    format: str
    offset: int
    limit: int
    row_count: int
    row_count_total: int
    schema_hash: str
    schema: list[str]
    # The chunk's rows, each a list of cell strings.
    rows: list[list[str]]
    has_more: bool
    duration_ms: int
    # ``None`` unless the read failed. R-audit
    # (2026-06-14 anti-corruption pass): the
    # previous version silently dropped the
    # exception and returned a zero-row chunk with
    # no diagnostic, so the LLM could mistake a
    # read error for "source has no data".
    skip_reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "data_source_id": self.data_source_id,
            "path": self.path,
            "format": self.format,
            "offset": self.offset,
            "limit": self.limit,
            "row_count": self.row_count,
            "row_count_total": self.row_count_total,
            "schema_hash": self.schema_hash,
            "schema": list(self.schema),
            "rows": [list(r) for r in self.rows],
            "has_more": self.has_more,
            "duration_ms": self.duration_ms,
            "skip_reason": self.skip_reason,
        }


def _schema_hash_from_header(header: list[str]) -> str:
    """Hash a header list to detect column-set
    changes between chunks.
    """
    import hashlib
    payload = json.dumps(header, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def _load_full(
    data_source: dict[str, Any],
) -> tuple[list[str], list[list[str]]]:
    """Load the full source into memory and return
    (header, rows). Capped at
    ``DEFAULT_SAMPLE_ROWS`` to keep the tool fast;
    larger sources need a streaming reader
    (future work).
    """
    fmt = str(data_source.get("format", "")).lower()
    path = Path(str(data_source.get("path", "")))
    if fmt == "csv":
        return _read_csv_or_tsv(path, "csv")
    if fmt == "tsv":
        return _read_csv_or_tsv(path, "tsv")
    if fmt == "xlsx":
        return _read_xlsx(path)
    if fmt == "json":
        return _read_json(path)
    raise ValueError(f"unsupported format: {fmt!r}")


def table_scan(
    data_source: dict[str, Any],
    offset: int = 0,
    limit: int = DEFAULT_CHUNK_SIZE,
) -> TableChunk:
    """Read one chunk from a data source.

    The first call should be
    ``table_scan(ds, offset=0, limit=N)``; the
    returned ``has_more`` flag tells the caller
    whether to keep paginating.
    """
    if limit <= 0 or limit > DEFAULT_CHUNK_SIZE:
        limit = DEFAULT_CHUNK_SIZE
    if offset < 0:
        offset = 0
    import time
    t0 = int(time.monotonic() * 1000)
    ds_id = str(data_source.get("id", "?"))
    path = Path(str(data_source.get("path", "")))
    fmt = str(data_source.get("format", "")).lower()
    if not path.exists():
        return TableChunk(
            data_source_id=ds_id,
            path=str(path),
            format=fmt,
            offset=offset,
            limit=limit,
            row_count=0,
            row_count_total=0,
            schema_hash="",
            schema=[],
            rows=[],
            has_more=False,
            duration_ms=int(time.monotonic() * 1000) - t0,
            skip_reason=f"file not found: {path}",
        )
    try:
        header, rows = _load_full(data_source)
    except Exception as exc:  # noqa: BLE001
        # R-audit (2026-06-14 anti-corruption
        # pass): the previous implementation
        # returned an empty chunk with no
        # ``skip_reason``, silently dropping the
        # exception. The LLM would have seen
        # ``row_count=0`` and assumed the source
        # was empty, not that the reader crashed.
        # We now surface the error in
        # ``skip_reason`` so the typed-envelope
        # contract (Principle I.3) holds.
        return TableChunk(
            data_source_id=ds_id,
            path=str(path),
            format=fmt,
            offset=offset,
            limit=limit,
            row_count=0,
            row_count_total=0,
            schema_hash="",
            schema=[],
            rows=[],
            has_more=False,
            duration_ms=int(time.monotonic() * 1000) - t0,
            skip_reason=f"read failed: {type(exc).__name__}: {exc}",
        )
    total = len(rows)
    chunk = rows[offset: offset + limit]
    has_more = (offset + limit) < total
    return TableChunk(
        data_source_id=ds_id,
        path=str(path),
        format=fmt,
        offset=offset,
        limit=limit,
        row_count=len(chunk),
        row_count_total=total,
        schema_hash=_schema_hash_from_header(header),
        schema=header,
        rows=chunk,
        has_more=has_more,
        duration_ms=int(time.monotonic() * 1000) - t0,
    )


class TableScanTool:
    """Pull a chunk of a registered data source.

    Pair this with ``source_data_audit``:
    ``source_data_audit`` answers "is the data
    usable?"; ``table_scan`` answers "give me
    rows 1000..1500 of ds-1".
    """

    name = "table_scan"

    def description(self) -> str:
        return (
            "Read a chunk of a registered data source. "
            "Returns a JSON list of rows plus "
            "schema_hash (so a column-set change "
            "between chunks is detectable) and "
            "has_more (true if more rows are "
            "available). Use this for table-shaped "
            "data that the LLM needs to inspect "
            "row-by-row; the source_data_audit tool "
            "is the right starting point for "
            "whole-table statistics."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "data_source_id": {
                    "type": "string",
                    "description": (
                        "The data source id (as "
                        "registered in "
                        "ctx.metadata['data_sources'])."
                    ),
                },
                "offset": {
                    "type": "integer",
                    "description": (
                        "First row to return (0-based). "
                        "Default 0."
                    ),
                },
                "limit": {
                    "type": "integer",
                    "description": (
                        "Max rows to return. Default 2000. "
                        "Hard cap 2000."
                    ),
                },
            },
            "required": ["data_source_id"],
        }

    def execute(
        self,
        input: dict[str, Any],
        ctx: ToolContext,
    ) -> str:
        ds_id = str(input.get("data_source_id", ""))
        if not ds_id:
            return json.dumps({
                "ok": False,
                "error_kind": "permission_denied",
                "error": "data_source_id is required",
            })
        sources = (ctx.metadata or {}).get(
            "data_sources"
        ) or []
        if not isinstance(sources, list):
            return json.dumps({
                "ok": False,
                "error_kind": "data_source_missing",
                "error": (
                    "ctx.metadata['data_sources'] is "
                    "not a list"
                ),
            })
        ds = next(
            (
                s for s in sources
                if str(s.get("id", "")) == ds_id
            ),
            None,
        )
        if ds is None:
            return json.dumps({
                "ok": False,
                "error_kind": "data_source_missing",
                "error": (
                    f"no data source with id={ds_id!r}"
                ),
                "data_sources_available": [
                    s.get("id") for s in sources
                ],
            })
        offset = int(input.get("offset") or 0)
        limit = int(input.get("limit") or DEFAULT_CHUNK_SIZE)
        chunk = table_scan(ds, offset=offset, limit=limit)
        return json.dumps(
            {"ok": True, "chunk": chunk.to_dict()},
            ensure_ascii=False,
        )
