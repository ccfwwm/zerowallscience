"""Adapter that turns a Detector into a Tool.

The point of this file is to keep ``Detector`` and ``Tool``
as two independent Protocols so detector authors do not have
to learn about the agent layer. A detector has a name and a
``run(doc)`` method. A tool has a name, a description, a JSON
schema, and an ``execute(input, ctx)`` method. This adapter
maps between them with a one-line conversion per call.

The input schema is generated from a small convention: every
detector accepts a single ``doc: ParsedDoc`` argument, so the
schema is ``{"type": "object", "properties": {"trace_id":
{...}}}`` and the adapter looks up the parsed doc by trace_id
via the ``ctx``. If a detector wants a richer input it can
subclass this adapter.
"""
from __future__ import annotations

import json
from typing import Any

from .tool import Tool, ToolContext
from ..workspace import JobPaths
from ..config import get_settings


# Default input schema for a detector-as-tool. Concrete
# detectors may override by passing a different schema to
# the adapter constructor; the adapter also exposes
# ``input_schema()`` returning a dict the LLM can reason
# about.
DEFAULT_INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "trace_id": {
            "type": "string",
            "description": (
                "The trace_id of the PDF currently in the "
                "agent's working set. The agent loop sets "
                "this from ctx.current_pdf."
            ),
        },
        "kwargs": {
            "type": "object",
            "description": (
                "Optional detector-specific arguments. Most "
                "detectors take none; pass {} for default."
            ),
        },
    },
    "required": ["trace_id"],
    "additionalProperties": False,
}


class DetectorToolAdapter:
    """Wrap a Detector (anything with ``name`` and ``run(doc)``)
    and expose the ``Tool`` Protocol shape.

    The adapter is intentionally tiny: it exists so the agent
    layer (Step J3) does not have to know that "tool" and
    "detector" are two words for related ideas.
    """

    def __init__(self, detector: Any, *, schema: dict[str, Any] | None = None) -> None:
        self._detector = detector
        self._schema = schema or DEFAULT_INPUT_SCHEMA

    @property
    def name(self) -> str:
        return self._detector.name

    def description(self) -> str:
        # Prefer the detector's explicit docstring. The
        # Pipeline's existing detectors (metadata,
        # image_dup, image_forensics, text_patterns) each
        # have a top-of-class docstring explaining what they
        # look for, which is exactly what the LLM needs.
        cls = type(self._detector)
        doc = (cls.__doc__ or "").strip()
        if not doc:
            doc = f"Run the {self.name} detector on the current PDF."
        return doc

    def input_schema(self) -> dict[str, Any]:
        return self._schema

    def execute(self, input: dict[str, Any], ctx: ToolContext) -> str:
        """Run the detector and return a JSON string of
        findings. The LLM will see this string verbatim.

        Errors are caught and returned as a JSON error
        object — never raised — so one bad tool call does
        not abort the agent loop.

        R-2026-06-19 (Phase D,
        per-fig detector run):
        the input may carry a
        ``table_ids`` list. When
        provided, the doc's
        ``tables`` field is
        filtered down to only
        the matching ``table_id``s
        before the detector
        runs. This is how the
        LLM scopes a detector
        to a single fig panel
        (e.g.
        ``table_benford({table_ids: ["<x:...:Sfig.2:Fig.S1a>"]})``)
        instead of running the
        detector on every
        table in the doc.
        The doc is rebuilt via
        ``dataclasses.replace``
        so the original
        ``ParsedDoc`` in
        ``ctx.metadata`` is
        untouched.
        """
        try:
            # LLMs often call detector tools with empty input
            # (e.g. ``pdf_metadata({})``). Prefer the explicit
            # trace_id, then the run context. Keep ``current_pdf``
            # as a legacy fallback only when it is not a file path.
            trace_id = input.get("trace_id")
            if not trace_id:
                trace_id = ctx.trace_id
            if not trace_id and ctx.current_pdf:
                current_pdf = str(ctx.current_pdf)
                if not (
                    "\\" in current_pdf
                    or "/" in current_pdf
                    or ":" in current_pdf
                ):
                    trace_id = current_pdf
            if not trace_id or trace_id == "":
                return json.dumps(
                    {"error": "no trace_id given and ctx is empty"}
                )
            # Resolve to a ParsedDoc on demand. The agent
            # loop usually passes the parsed doc via ctx
            # metadata, but if not, re-parse from the job
            # workspace.
            doc = ctx.metadata.get("parsed_doc")
            if doc is None:
                settings = get_settings()
                paths = JobPaths.for_trace(trace_id, settings.workspace_dir)
                if not paths.original.exists():
                    return json.dumps(
                        {"error": f"PDF not found for trace_id={trace_id}"}
                    )
                from ..ingest.pdf import parse_pdf

                doc = parse_pdf(
                    paths.original,
                    trace_id=trace_id,
                    workspace_dir=settings.workspace_dir,
                )
            # R-2026-06-19 (Phase D):
            # if the LLM passed a
            # ``table_ids`` list,
            # scope the doc to only
            # those tables so the
            # detector runs on the
            # specific fig the user
            # asked about. We do this
            # via ``dataclasses.replace``
            # so the cached doc in
            # ``ctx.metadata`` stays
            # intact (future detector
            # runs without a filter
            # still see all tables).
            table_ids = input.get("table_ids")
            if table_ids:
                from dataclasses import replace
                if not isinstance(table_ids, list):
                    return json.dumps(
                        {
                            "error": (
                                "table_ids must be a list of "
                                "table_id strings, got "
                                f"{type(table_ids).__name__}"
                            ),
                        }
                    )
                selected = [
                    t for t in getattr(doc, "tables", []) or []
                    if getattr(t, "table_id", "") in set(table_ids)
                ]
                if not selected:
                    return json.dumps(
                        {
                            "error": (
                                "no tables matched table_ids; check "
                                "list_data_sources for the available "
                                "table_id list"
                            ),
                            "requested": list(table_ids),
                            "available": [
                                getattr(t, "table_id", "")
                                for t in getattr(doc, "tables", []) or []
                            ],
                        }
                    )
                doc = replace(doc, tables=selected)
            result = self._detector.run(doc)
        except Exception as exc:  # noqa: BLE001 — never abort the loop
            return json.dumps(
                {
                    "error": f"{type(exc).__name__}: {exc}",
                    "detector": getattr(self._detector, "name", "?"),
                }
            )
        # Return a compact JSON: detector name, ok flag, and
        # the findings list. Long evidence strings are kept
        # verbatim — the LLM can decide what to summarize.
        return json.dumps(
            {
                "detector": result.detector,
                "ok": result.ok,
                "duration_ms": result.duration_ms,
                "error": result.error,
                "findings": [f.__dict__ for f in result.findings],
            },
            ensure_ascii=False,
            default=str,
        )


def tool_from_detector(detector: Any) -> DetectorToolAdapter:
    """Adapter factory. Returns a ``DetectorToolAdapter`` that
    satisfies the ``Tool`` Protocol for the given detector.

    Usage::

        tool = tool_from_detector(MetadataDetector())
        assert tool.name == "metadata"
        assert "metadata" in tool.description().lower()
    """
    return DetectorToolAdapter(detector)
