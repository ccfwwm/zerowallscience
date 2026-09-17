"""Product-level screen tools (P3, MCP product surface).

Four tools layered on top of ``manusift.screen_jobs``:

  * ``screen_verdict`` — synchronous one-shot triage. Either runs the
    full pipeline on a PDF path (small PDFs / debugging) or reduces an
    already-analysed ``trace_id``'s artifacts to a verdict.
  * ``submit_screen`` — asynchronous variant: starts the pipeline on a
    background thread and returns a ``job_id`` immediately. Use this
    for real papers; the MCP server stays responsive while it runs.
  * ``get_job_status`` / ``get_job_result`` — poll a submitted job.

The verdict rule and score formula are documented in
``manusift/screen_jobs.py``'s module docstring and mirrored in the
``screen_verdict`` description below (LLM-facing) and in
``docs/mcp/README.md``.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .tool import Tool, ToolContext

_VERDICT_RULES = (
    "Verdict rule: 'flagged' if >=1 high-severity issue; else "
    "'suspect' if >=3 medium-severity issues (threshold configurable "
    "via MANUSIFT_SCREEN_SUSPECT_MEDIUM_ISSUE_THRESHOLD); else "
    "'clean'. Score is 0-1 severity-weighted: "
    "min(1.0, (1.0*high + 0.4*medium + 0.1*low) / 3.0), so one high "
    "issue scores 0.333 and three high issues saturate at 1.0. Issues "
    "are the aggregated P1.1 view (detector chatter on the same "
    "evidence object collapses into one issue)."
)


class ScreenVerdictTool:
    """One-call triage: PDF path or existing trace_id -> verdict."""

    name: str = "screen_verdict"

    def description(self) -> str:
        return (
            "Screen a paper for integrity problems in one call and "
            "return a triage verdict. Pass 'path' to run the full "
            "detector pipeline on a PDF (synchronous; use for small "
            "PDFs or debugging — for large PDFs prefer submit_screen + "
            "get_job_status + get_job_result). Omit 'path' to reuse "
            "the already-analysed paper of the current trace_id "
            "(reads its issues.json / findings.json, no re-run). "
            "Returns JSON: {verdict: clean|suspect|flagged, score, "
            "top_issues[], counts_by_severity, report_path, trace_id}. "
            "LLM enrichment/adjudication is OFF by default "
            "(deterministic, offline); pass use_llm=true to enable "
            "enrichment. " + _VERDICT_RULES
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": (
                        "Absolute or relative path to the PDF to "
                        "screen. When omitted, the current trace_id's "
                        "existing artifacts are reused instead of "
                        "running the pipeline."
                    ),
                },
                "use_llm": {
                    "type": "boolean",
                    "description": (
                        "Enable LLM enrichment of findings (needs an "
                        "API key; default false = deterministic, "
                        "offline screen)."
                    ),
                },
                "include_sidecar": {
                    "type": "boolean",
                    "description": (
                        "Auto-include companion data files (XLSX/CSV/"
                        "TSV/JSON) found in the PDF's directory as "
                        "auditable sources (default true)."
                    ),
                },
            },
            "additionalProperties": False,
        }

    def execute(self, input: dict[str, Any], ctx: ToolContext) -> str:
        from .. import screen_jobs as screen

        path_arg = input.get("path")
        use_llm = bool(input.get("use_llm"))
        include_sidecar = bool(input.get("include_sidecar", True))
        if path_arg:
            pdf = Path(str(path_arg)).expanduser()
            if not pdf.is_absolute():
                pdf = (Path.cwd() / pdf).resolve()
            if not pdf.is_file():
                return json.dumps(
                    {"error": "pdf_not_found", "path": str(path_arg)}
                )
            if pdf.suffix.lower() != ".pdf":
                return json.dumps(
                    {"error": "not_a_pdf", "path": str(path_arg)}
                )
            try:
                verdict = screen.run_screen(
                    pdf, use_llm=use_llm, include_sidecar=include_sidecar
                )
            except Exception as exc:  # noqa: BLE001
                return json.dumps(
                    {
                        "error": "screen_failed",
                        "detail": f"{type(exc).__name__}: {exc}",
                    }
                )
            return json.dumps(verdict, ensure_ascii=False, indent=2)
        # No path: reuse the current trace's artifacts.
        try:
            verdict = screen.verdict_for_trace(ctx.trace_id)
        except FileNotFoundError:
            return json.dumps(
                {
                    "error": "no_artifacts",
                    "trace_id": ctx.trace_id,
                    "hint": (
                        "pass 'path' to run the pipeline, or ingest + "
                        "analyse the paper first"
                    ),
                }
            )
        except Exception as exc:  # noqa: BLE001
            return json.dumps(
                {
                    "error": "screen_failed",
                    "detail": f"{type(exc).__name__}: {exc}",
                }
            )
        return json.dumps(verdict, ensure_ascii=False, indent=2)


class SubmitScreenTool:
    """Start an async screen job; returns immediately with a job_id."""

    name: str = "submit_screen"

    def description(self) -> str:
        return (
            "Submit a PDF for asynchronous integrity screening and "
            "return immediately with a job_id. The full detector "
            "pipeline runs on a background thread (LLM enrichment off "
            "by default; pass use_llm=true to enable). Poll with "
            "get_job_status(job_id) — status goes queued -> running -> "
            "done|failed with progress_pct and the current detector "
            "name in 'stage' — then fetch the final verdict with "
            "get_job_result(job_id), which returns the same payload as "
            "screen_verdict. Job state is persisted to disk, so "
            "completed jobs survive a server restart. " + _VERDICT_RULES
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Absolute or relative path to the PDF.",
                },
                "use_llm": {
                    "type": "boolean",
                    "description": (
                        "Enable LLM enrichment of findings (default "
                        "false)."
                    ),
                },
            },
            "required": ["path"],
            "additionalProperties": False,
        }

    def execute(self, input: dict[str, Any], ctx: ToolContext) -> str:
        from ..screen_jobs import get_screen_job_manager

        path_arg = input.get("path")
        if not path_arg or not isinstance(path_arg, str):
            return json.dumps({"error": "path is required"})
        out = get_screen_job_manager().submit(
            path_arg, use_llm=bool(input.get("use_llm"))
        )
        return json.dumps(out, ensure_ascii=False, indent=2)


class GetJobStatusTool:
    """Poll a submitted screen job."""

    name: str = "get_job_status"

    def description(self) -> str:
        return (
            "Get the status of a screen job started with "
            "submit_screen. Returns JSON: {job_id, status: "
            "queued|running|done|failed, progress_pct (0-100, "
            "monotonic while running), stage (current/last detector "
            "name), steps_done, steps_total, created_at, started_at, "
            "finished_at, error}. A job left in queued/running by a "
            "server restart is reported as failed with "
            "error='interrupted: server restarted'."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "job_id": {
                    "type": "string",
                    "description": "The job_id returned by submit_screen.",
                },
            },
            "required": ["job_id"],
            "additionalProperties": False,
        }

    def execute(self, input: dict[str, Any], ctx: ToolContext) -> str:
        from ..screen_jobs import get_screen_job_manager

        job_id = input.get("job_id")
        if not job_id or not isinstance(job_id, str):
            return json.dumps({"error": "job_id is required"})
        out = get_screen_job_manager().status(job_id)
        return json.dumps(out, ensure_ascii=False, indent=2)


class GetJobResultTool:
    """Fetch the verdict of a finished screen job."""

    name: str = "get_job_result"

    def description(self) -> str:
        return (
            "Get the result of a screen job started with "
            "submit_screen. When status is 'done', returns the same "
            "verdict payload as screen_verdict ({verdict, score, "
            "top_issues[], counts_by_severity, report_path, "
            "trace_id}). When the job is still queued/running, "
            "returns the get_job_status payload instead — poll again "
            "later. When it failed, returns the status payload with "
            "the 'error' field set."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "job_id": {
                    "type": "string",
                    "description": "The job_id returned by submit_screen.",
                },
            },
            "required": ["job_id"],
            "additionalProperties": False,
        }

    def execute(self, input: dict[str, Any], ctx: ToolContext) -> str:
        from ..screen_jobs import get_screen_job_manager

        job_id = input.get("job_id")
        if not job_id or not isinstance(job_id, str):
            return json.dumps({"error": "job_id is required"})
        out = get_screen_job_manager().result(job_id)
        return json.dumps(out, ensure_ascii=False, indent=2)


def register_screen_tools() -> list[Tool]:
    """Return the P3 product-surface tools for the registry."""
    return [
        ScreenVerdictTool(),
        SubmitScreenTool(),
        GetJobStatusTool(),
        GetJobResultTool(),
    ]
