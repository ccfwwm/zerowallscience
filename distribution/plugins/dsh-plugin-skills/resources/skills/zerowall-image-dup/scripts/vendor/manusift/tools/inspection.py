"""Tools for inspecting past detector findings (T2).

Read-only inspection for agent/MCP hosts:
list findings and open one by id. (Historical
note: pre-T2 chat-era agents could only invoke
detectors, not re-read stored findings.) Layers
two tools on the ``Tool`` Protocol:

  * ``read_finding`` -- look up
    a single finding by its
    ``finding_id`` (the
    ULID-style id assigned when
    the finding was first
    recorded) and return the
    full JSON payload as a
    string. The LLM can then
    quote or reason about any
    field in the finding.

  * ``list_findings`` -- list all
    findings for the current
    trace id, optionally filtered
    by detector name and / or
    severity. Returns a compact
    summary so the LLM does not
    blow its context window on a
    1000-finding paper.

Both tools are *read-only* --
they never mutate state, never
hit the network, and never call
an LLM. They are safe to enable
in auto-accept mode.

The tools follow the same
``Tool`` Protocol as every
other tool in the system: they
expose ``name``,
``description``, ``input_schema``,
and ``execute``. The agent loop
already knows how to surface
them to the LLM through
``iter_registered_tools`` and
to dispatch tool calls through
the ``AgentLoop``.

Borrowed design from Hermes
Agent's ``read_file`` /
``list_files`` tools and from
Claude Code's ``Read`` /
``Glob`` tools. The key
insight in both projects is
that a chat agent needs the
ability to *re-read* its own
prior outputs -- otherwise it
looses track of what it has
already said.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .tool import Tool, ToolContext


def _detector_names() -> list[str]:
    """Return the names of every
    built-in detector.

    R5 / C-audit: the list
    used to be hard-coded
    to the original five
    detectors
    (metadata,
    image_dup,
    image_forensics,
    text_patterns,
    citation_network).
    After R3 the project
    ships 31 detectors
    spread across 10
    categories, and the
    ``list_findings`` LLM
    description was
    silently out of date.
    A user who asked the
    LLM to "list
    table_benford findings"
    would have hit a
    description that did
    not mention that
    detector. We now
    source the names from
    the canonical
    ``iter_registered_detectors()``
    iterator so the
    description stays in
    sync with the
    detector registry.

    The call is wrapped in
    a try / except because
    some test environments
    mock the detectors
    package out; the
    fallback is the
    original hard-coded
    list so the tool
    keeps working even
    when the package
    cannot be imported.
    """
    try:
        from ..detectors import (
            detector_names as _names,
        )
        return _names()
    except Exception:  # noqa: BLE001
        return [
            "metadata",
            "image_dup",
            "image_forensics",
            "text_patterns",
            "citation_network",
        ]


def _findings_path(workspace_dir: Any, trace_id: str) -> Any:
    """Locate a trace's findings.json.

    Every writer (web dashboard, TUI, MCP, ``ingest_from_path``)
    persists the pipeline result to the canonical per-job layout
    (``<workspace>/<trace_id>/output/findings.json``, see
    ``workspace.JobPaths``), so this is a single fixed path with no
    layout fallback.
    """
    ws = Path(workspace_dir)
    return ws / trace_id / "output" / "findings.json"


class ReadFindingTool:
    """Read a single finding by id.

    The ``execute`` method takes a
    ``finding_id`` argument and
    returns the full finding as a
    JSON string. If the finding
    cannot be found the response
    is a JSON error object
    (``{"error": "not found"}``)
    so the LLM can react to the
    miss rather than crashing
    the chat session.

    The findings live on disk at
    ``<workspace>/<trace_id>/output/findings.json``
    -- see ``_findings_path``. This is the
    same file the
    ``/api/jobs/<tid>/findings``
    endpoint reads, so the chat
    TUI and the web dashboard
    share one source of truth.
    """

    name: str = "read_finding"

    def description(self) -> str:
        """One-paragraph description,
        written for the LLM."""
        return (
            "Read a single detector finding by its id. "
            "Returns the full finding as a JSON string with "
            "fields: finding_id, detector, severity (low / "
            "medium / high), description, evidence, "
            "suggested_action. Use this when you need to "
            "quote or reason about a specific finding the "
            "user has asked about. Read-only."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "finding_id": {
                    "type": "string",
                    "description": (
                        "The finding_id assigned when the "
                        "finding was first recorded. The id is "
                        "a 12-character ULID-like string; it "
                        "is the same id the /findings JSON "
                        "endpoint returns."
                    ),
                },
            },
            "required": ["finding_id"],
            "additionalProperties": False,
        }

    def execute(
        self,
        input: dict[str, Any],
        ctx: ToolContext,
    ) -> str:
        finding_id = input.get("finding_id")
        if not finding_id or not isinstance(finding_id, str):
            return json.dumps(
                {"error": "finding_id is required"}
            )
        # Read the findings file
        # off the workspace.
        from ..config import get_settings
        s = get_settings()
        path = _findings_path(s.workspace_dir, ctx.trace_id)
        if not path.is_file():
            return json.dumps(
                {
                    "error": (
                        f"no findings file for trace "
                        f"{ctx.trace_id}"
                    ),
                }
            )
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            return json.dumps(
                {"error": f"could not parse findings: {exc}"}
            )
        # The findings file is a
        # list of dicts. Each has
        # a ``finding_id`` key.
        findings = data if isinstance(data, list) else data.get("findings", [])
        for f in findings:
            if f.get("finding_id") == finding_id:
                return json.dumps(f, indent=2, default=str)
        return json.dumps(
            {
                "error": (
                    f"finding {finding_id!r} not found in "
                    f"trace {ctx.trace_id}"
                ),
            }
        )


class ListFindingsTool:
    """List findings for the current trace id.

    The ``execute`` method accepts
    optional ``detector`` and
    ``severity`` filters and
    returns a compact summary
    list. Each entry is just the
    ``finding_id``, detector,
    severity, and a one-line
    description -- enough for
    the LLM to know which
    finding to ``read_finding``
    next.
    """

    name: str = "list_findings"

    def description(self) -> str:
        names = _detector_names()
        # Show up to 8
        # detector names
        # in the
        # description; if
        # there are more,
        # append an
        # ellipsis so the
        # LLM knows the
        # list is not
        # exhaustive. The
        # LLM can read the
        # ``detector`` field
        # in any past
        # finding to
        # discover the full
        # list.
        sample = ", ".join(
            f"'{n}'" for n in names[:8]
        )
        if len(names) > 8:
            sample += ", ..."
        return (
            "List detector findings for the current paper. "
            "Returns a compact summary (finding_id, detector, "
            "severity, one-line description) of each finding. "
            "Optionally filter by detector name (any of: "
            f"{sample}) and / or severity (low / medium / high). "
            "Pass group_by='issue' for the aggregated issue view "
            "(findings on the same evidence object grouped together). "
            "Use this to give the user an overview before "
            "drilling into a specific finding with read_finding. "
            "Read-only."
        )

    def input_schema(self) -> dict[str, Any]:
        names = _detector_names()
        # The full list is
        # passed as a free
        # ``description``
        # rather than an
        # ``enum`` because
        # OpenAI tool
        # definitions
        # require enums to
        # be small (<= 5
        # values historically
        # -- the docs
        # recommend
        # "a handful").
        # With 31 detectors
        # a strict enum
        # would break
        # ``input_schema``
        # validation on
        # older SDKs and
        # does not buy us
        # much. The LLM
        # sees the full list
        # in ``description``.
        detector_list = ", ".join(names)
        return {
            "type": "object",
            "properties": {
                "detector": {
                    "type": "string",
                    "description": (
                        "Optional. Restrict to findings from "
                        f"this detector. One of: {detector_list}."
                    ),
                },
                "severity": {
                    "type": "string",
                    "enum": ["low", "medium", "high"],
                    "description": (
                        "Optional. Restrict to findings of "
                        "this severity."
                    ),
                },
                "group_by": {
                    "type": "string",
                    "enum": ["issue"],
                    "description": (
                        "Optional. Pass 'issue' to return the "
                        "aggregated issue view (P1.1): findings "
                        "pointing at the same evidence object are "
                        "grouped into one issue. Default returns the "
                        "flat finding list unchanged."
                    ),
                },
            },
            "additionalProperties": False,
        }

    def execute(
        self,
        input: dict[str, Any],
        ctx: ToolContext,
    ) -> str:
        detector_filter = input.get("detector")
        severity_filter = input.get("severity")
        group_by = input.get("group_by")
        from ..config import get_settings
        s = get_settings()
        path = _findings_path(s.workspace_dir, ctx.trace_id)
        if not path.is_file():
            return json.dumps(
                {
                    "findings": [],
                    "note": (
                        f"no findings file for trace "
                        f"{ctx.trace_id}"
                    ),
                }
            )
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            return json.dumps(
                {"error": f"could not parse findings: {exc}"}
            )
        findings = (
            data
            if isinstance(data, list)
            else data.get("findings", [])
        )
        # Aggregated issue view (P1.1). Issues are computed on the fly
        # from findings.json so no extra artifact is required.
        if group_by == "issue":
            from ..report.finding_aggregation import aggregate_findings
            from ..report.investigation_pairs import findings_from_json

            _tid, finding_objs, _n = findings_from_json(path)
            issues = aggregate_findings(finding_objs)
            out_issues: list[dict[str, Any]] = []
            for i in issues:
                if (
                    detector_filter
                    and detector_filter not in i.detectors
                ):
                    continue
                if severity_filter and i.severity != severity_filter:
                    continue
                out_issues.append(i.to_dict())
            return json.dumps(
                {
                    "count": len(out_issues),
                    "group_by": "issue",
                    "issues": out_issues,
                },
                indent=2,
                default=str,
            )
        # Apply filters.
        out: list[dict[str, Any]] = []
        for f in findings:
            if (
                detector_filter
                and f.get("detector") != detector_filter
            ):
                continue
            if (
                severity_filter
                and f.get("severity") != severity_filter
            ):
                continue
            out.append(
                {
                    "finding_id": f.get("finding_id"),
                    "detector": f.get("detector"),
                    "severity": f.get("severity"),
                    "description": _truncate(
                        str(f.get("description", "")), 120
                    ),
                }
            )
        return json.dumps(
            {
                "count": len(out),
                "findings": out,
            },
            indent=2,
            default=str,
        )


def _truncate(s: str, max_len: int) -> str:
    """Truncate ``s`` to ``max_len``
    characters with an ellipsis if
    it would be longer. Centralised
    here so the rule is consistent
    across every summary entry."""
    if len(s) <= max_len:
        return s
    return s[: max_len - 1] + "…"


def register_inspection_tools() -> list[Tool]:
    """Return the list of inspection
    tools for the registry. Callers
    typically do:

        from manusift.tools.inspection import (
            register_inspection_tools,
        )
        for t in register_inspection_tools():
            tool_registry.register(t)

    The list is built on every
    call (not module-level) so a
    test can monkey-patch the
    file location without
    poisoning the rest of the
    test session.
    """
    return [ReadFindingTool(), ListFindingsTool()]
