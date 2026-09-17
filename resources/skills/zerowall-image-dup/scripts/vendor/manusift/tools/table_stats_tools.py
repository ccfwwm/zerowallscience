"""LLM-callable wrappers around the table-statistics detectors.

R-audit (2026-06): the four
detectors in
``manusift.detectors.table_stats``
(Benford, DuplicateRow,
Outlier, RoundBias) existed
for months but were
unreachable from the agent
loop because nothing populated
``ParsedDoc.tables``. This
module:

  1. exposes the existing
     detectors through the
     existing
     ``tool_from_detector``
     adapter (they read
     ``doc.tables`` now that
     PDF ingest populates
     them), AND

  2. adds a new
     ``ListDataSourcesTool``
     that lets the LLM
     enumerate every
     companion XLSX /
     CSV file in the
     job's ``materials/``
     directory, AND

  3. adds a new
     ``ReadDataSourceTool``
     that lets the LLM
     fetch the headers +
     rows of any single
     source-data file
     inline (so the LLM
     can quote specific
     numbers in its
     narrative report).

The first two are
short -- they wrap the
existing detectors via
``tool_from_detector``. The
last is the more interesting
piece: it parses the XLSX on
demand so the LLM can pivot
between "run Benford on
everything" and "show me
just Fig.2A's rows".
"""
from __future__ import annotations

import json
import logging
from typing import Any

from ..config import get_settings
from ..workspace import JobPaths
from .tool import Tool

log = logging.getLogger(__name__)


class ListDataSourcesTool:
    """Enumerate every
    tabular data source
    the pipeline knows
    about for the current
    job.

    Returns one entry per
    ``ExtractedTable`` that
    ``parse_pdf`` produced
    (PDF-native tables from
    PyMuPDF's
    ``page.find_tables()``
    PLUS companion XLSX /
    CSV / TSV / JSON in
    ``<workspace>/jobs/<tid>/materials/``).

    Each entry carries
    ``table_id``,
    ``source_kind``,
    ``source_path``,
    ``sheet_name``,
    ``source_index``,
    ``n_rows``,
    ``n_cols`` and a
    truncated
    ``headers`` preview
    so the LLM can pick
    the right table
    without re-parsing
    every file.

    The companion-file
    discovery reuses
    ``manusift.ingest.xlsx.discover_companion_files``
    so we apply the same
    hidden-directory /
    max-depth rules as
    the ingest path.
    """

    name: str = "list_data_sources"

    def description(self) -> str:
        return (
            "Enumerate every tabular data source attached to "
            "the current PDF. Returns a list of objects with "
            "``table_id``, ``source_kind`` (``xlsx`` / ``csv`` "
            "/ ``pdf_native`` / ``json``), the file path, "
            "the sheet name (when applicable), the number "
            "of rows and columns, and a preview of the "
            "headers. Use this to decide which table(s) to "
            "analyse with the ``benford`` / ``duplicate_row`` "
            "/ ``outlier`` / ``round_bias`` detectors or to "
            "fetch via ``read_data_source``."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "trace_id": {
                    "type": "string",
                    "description": (
                        "The trace_id of the job whose "
                        "tables we want to enumerate."
                    ),
                },
            },
            "required": ["trace_id"],
            "additionalProperties": False,
        }

    def execute(
        self,
        input: dict[str, Any],
        ctx: Any,
    ) -> str:
        trace_id = (input.get("trace_id") or "").strip()
        if not trace_id:
            return json.dumps(
                {"error": "trace_id is required"}
            )
        try:
            doc = ctx.metadata.get("parsed_doc")
            if doc is None:
                settings = get_settings()
                from ..ingest.pdf import parse_pdf
                paths = JobPaths.for_trace(
                    trace_id, settings.workspace_dir
                )
                if not paths.original.exists():
                    return json.dumps(
                        {
                            "error": (
                                f"PDF not found for "
                                f"trace_id={trace_id}"
                            )
                        }
                    )
                doc = parse_pdf(
                    paths.original,
                    trace_id=trace_id,
                    workspace_dir=settings.workspace_dir,
                )
                # R-2026-06-17 (Phase 4 +
                # auto-discover
                # source data):
                # ``parse_pdf``
                # already
                # discovers
                # and
                # parses
                # the
                # companion
                # XLSX /
                # CSV /
                # TSV /
                # JSON
                # files
                # in
                # ``<trace>/materials/``
                # and
                # merges
                # them
                # into
                # ``doc.tables``
                # (see
                # ``manusift.ingest.pdf.parse_pdf``
                # step
                # 2).
                # So
                # the
                # re-parse
                # path
                # here
                # *already*
                # sees
                # the
                # auto-discovered
                # tables;
                # we
                # do
                # not
                # need
                # to
                # re-scan
                # ``materials_dir``
                # ourselves
                # (doing
                # so
                # would
                # double-count
                # the
                # tables
                # and
                # return
                # the
                # wrong
                # ``n_tables``).
                # This
                # is
                # the
                # root
                # cause
                # of
                # the
                # user
                # report's
                # ``data_source_missing``
                # warning:
                # the
                # old
                # ``list_data_sources``
                # re-parse
                # path
                # only
                # saw
                # the
                # PDF-native
                # tables
                # (often
                # 0
                # for
                # Nature
                # papers);
                # the
                # re-parse
                # now
                # returns
                # the
                # *full*
                # set
                # (PDF
                # +
                # companion
                # files)
                # because
                # ``parse_pdf``
                # already
                # handles
                # the
                # companion
                # file
                # discovery.
                # If
                # the
                # LLM
                # had
                # a
                # stale
                # ``trace_id``
                # in
                # context
                # (the
                # original
                # bug),
                # ``data_sources``
                # propagation
                # in
                # the
                # agent
                # loop
                # now
                # refreshes
                # the
                # trace_id
                # on
                # the
                # next
                # tool
                # result
                # so
                # the
                # follow-up
                # call
                # uses
                # the
                # correct
                # trace.
            tables = list(getattr(doc, "tables", []) or [])
            out = []
            for t in tables:
                # R-2026-06-19 (Phase D,
                # per-fig xlsx): surface
                # ``fig_name`` and ``bbox``
                # so the LLM can build the
                # ``table_ids`` argument
                # for a per-fig detector
                # run and can see
                # exactly which rows
                # / cols in the source
                # sheet this table
                # covers. Both fields
                # are optional on
                # ``ExtractedTable``
                # (empty string / None
                # for legacy CSV /
                # PDF-native / text-stat
                # tables).
                fig_name = getattr(t, "fig_name", "") or ""
                bbox = getattr(t, "bbox", None)
                highlighted = (
                    getattr(t, "highlighted_cells", []) or []
                )
                table_entry: dict[str, object] = {
                    "table_id": t.table_id,
                    "source_kind": t.source_kind,
                    "source_path": t.source_path,
                    "sheet_name": t.sheet_name,
                    "source_index": t.source_index,
                    "n_rows": len(t.rows),
                    "n_cols": len(t.headers),
                    "headers_preview": t.headers[:8],
                }
                if highlighted:
                    table_entry["n_highlighted_cells"] = len(
                        highlighted
                    )
                    table_entry["highlighted_preview"] = highlighted[:8]
                if fig_name:
                    table_entry["fig_name"] = fig_name
                if bbox is not None:
                    # Convert 0-indexed bbox to
                    # 1-indexed for human
                    # consumption (so
                    # rows 1-6, cols 1-3
                    # instead of 0-5, 0-2).
                    table_entry["bbox"] = {
                        "top": bbox.get("top", 0) + 1,
                        "bottom": bbox.get("bottom", 0) + 1,
                        "left": bbox.get("left", 0) + 1,
                        "right": bbox.get("right", 0) + 1,
                    }
                out.append(table_entry)
            # Also emit ``data_sources`` (ingest-compatible
            # shape) so source_data_audit / pydantic_loop
            # propagation can register companion files.
            data_sources = []
            for t in out:
                data_sources.append(
                    {
                        "id": t.get("table_id", ""),
                        "table_id": t.get("table_id", ""),
                        "format": t.get("source_kind", ""),
                        "source_kind": t.get("source_kind", ""),
                        "path": t.get("source_path", ""),
                        "source_path": t.get("source_path", ""),
                        "sheet_name": t.get("sheet_name", ""),
                        "row_count": t.get("n_rows", 0),
                        "column_count": t.get("n_cols", 0),
                    }
                )
            return json.dumps(
                {
                    "trace_id": trace_id,
                    "n_tables": len(out),
                    "tables": out,
                    "data_sources": data_sources,
                },
                ensure_ascii=False,
            )
        except Exception as exc:  # noqa: BLE001
            return json.dumps(
                {
                    "error": f"{type(exc).__name__}: {exc}"
                }
            )


class ReadDataSourceTool:
    """Return the full
    headers + rows of a
    single
    ``ExtractedTable``.

    Use this when the LLM
    wants to quote
    specific numbers in
    its narrative report
    (the four
    statistics detectors
    only return
    aggregates; this
    tool returns the
    raw data so the
    LLM can show, e.g.,
    "the top 3 rows of
    Fig.2A").

    The ``max_rows``
    parameter caps the
    response size so a
    5000-row spreadsheet
    does not blow the
    LLM's context window.
    """

    name: str = "read_data_source"

    def description(self) -> str:
        return (
            "Read the headers + rows of a single tabular data "
            "source by ``table_id``. Use ``list_data_sources`` "
            "first to discover the ``table_id``. Returns a "
            "JSON object with ``headers``, ``rows`` (truncated "
            "to ``max_rows``), and ``truncated`` (true when "
            "more rows exist beyond the cap). Pass "
            "``max_rows=0`` (default) for the entire table."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "trace_id": {
                    "type": "string",
                    "description": (
                        "The trace_id of the job."
                    ),
                },
                "table_id": {
                    "type": "string",
                    "description": (
                        "The ``table_id`` returned by "
                        "``list_data_sources``."
                    ),
                },
                "max_rows": {
                    "type": "integer",
                    "description": (
                        "Maximum number of rows to "
                        "return. ``0`` (default) means "
                        "all rows. Useful for "
                        "previewing a big spreadsheet."
                    ),
                    "default": 0,
                },
            },
            "required": ["trace_id", "table_id"],
            "additionalProperties": False,
        }

    def execute(
        self,
        input: dict[str, Any],
        ctx: Any,
    ) -> str:
        trace_id = (input.get("trace_id") or "").strip()
        table_id = (input.get("table_id") or "").strip()
        if not trace_id:
            return json.dumps(
                {"error": "trace_id is required"}
            )
        if not table_id:
            return json.dumps(
                {"error": "table_id is required"}
            )
        try:
            max_rows = int(input.get("max_rows") or 0)
        except (TypeError, ValueError):
            max_rows = 0
        try:
            doc = ctx.metadata.get("parsed_doc")
            if doc is None:
                settings = get_settings()
                from ..ingest.pdf import parse_pdf
                paths = JobPaths.for_trace(
                    trace_id, settings.workspace_dir
                )
                if not paths.original.exists():
                    return json.dumps(
                        {
                            "error": (
                                f"PDF not found for "
                                f"trace_id={trace_id}"
                            )
                        }
                    )
                doc = parse_pdf(
                    paths.original,
                    trace_id=trace_id,
                    workspace_dir=settings.workspace_dir,
                )
            tables = list(getattr(doc, "tables", []) or [])
            match = None
            for t in tables:
                if t.table_id == table_id:
                    match = t
                    break
            if match is None:
                # R-2026-06-19 (Phase D):
                # the ``available`` list
                # now shows ``fig_name``
                # + ``sheet_name`` so
                # the LLM can quickly
                # tell which table_id
                # corresponds to which
                # fig (e.g. "table_id
                # abc123 = Fig.S1a in
                # Sfig.2") without
                # re-querying
                # ``list_data_sources``.
                available = []
                for t in tables:
                    entry = {
                        "table_id": t.table_id,
                        "sheet_name": t.sheet_name,
                    }
                    fn = getattr(t, "fig_name", "") or ""
                    if fn:
                        entry["fig_name"] = fn
                    available.append(entry)
                return json.dumps(
                    {
                        "error": (
                            f"table_id={table_id} not "
                            "found in this job"
                        ),
                        "available": available,
                        "available_table_ids": [
                            t.table_id for t in tables
                        ],
                    }
                )
            rows = match.rows
            truncated = False
            if max_rows > 0 and len(rows) > max_rows:
                rows = rows[:max_rows]
                truncated = True
            highlighted = (
                getattr(match, "highlighted_cells", []) or []
            )
            if max_rows > 0:
                highlighted = [
                    h
                    for h in highlighted
                    if int(h.get("row", -1)) < len(rows)
                ]
            return json.dumps(
                {
                    "trace_id": trace_id,
                    "table_id": match.table_id,
                    "source_kind": match.source_kind,
                    "source_path": match.source_path,
                    "sheet_name": match.sheet_name,
                    "headers": match.headers,
                    "rows": rows,
                    "highlighted_cells": highlighted,
                    "n_rows_total": len(match.rows),
                    "n_rows_returned": len(rows),
                    "truncated": truncated,
                },
                ensure_ascii=False,
            )
        except Exception as exc:  # noqa: BLE001
            return json.dumps(
                {
                    "error": f"{type(exc).__name__}: {exc}"
                }
            )


def register_table_stats_tools() -> list[Tool]:
    """Return the
    table-statistics
    surface area for the
    registry.

    The four
    ``BenfordDetector`` /
    ``DuplicateRowDetector``
    / ``OutlierDetector``
    / ``RoundBiasDetector``
    wrappers are
    registered
    automatically by
    ``register_all_detectors()``
    in
    ``detector_catalog.py``
    -- this function
    returns only the two
    data-source helpers
    (``ListDataSourcesTool``
    + ``ReadDataSourceTool``)
    that do not correspond
    to a detector class.
    """
    return [
        ListDataSourcesTool(),
        ReadDataSourceTool(),
    ]
