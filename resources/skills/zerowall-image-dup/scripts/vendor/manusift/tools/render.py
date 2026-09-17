"""LLM-facing ``render_report`` tool (R-audit, 2026-06).

The integrity-report skill
(``data/skills/integrity_report.md``)
specifies that the LLM should:

  1. Call the analysis
     tools (metadata,
     list_findings, etc.).
  2. Reason over the
     evidence.
  3. Write a markdown
     document.
  4. **Call this tool**
     with the markdown
     string.

This tool takes the
markdown, renders it to
the final HTML report,
writes the files to the
job's workspace, and
returns absolute paths the
LLM can quote in its
confirmation message. PDF
export remains an optional
side artifact when the
runtime can support it.

Design choices:

  * The markdown is
    passed as a string
    parameter (not as a
    file path). LLM tool
    calls are not great
    at "create a file then
    read it back"; passing
    the content inline is
    the pattern Claude
    Code and OpenAI Deep
    Research both use.

  * ``trace_id`` is
    required so the tool
    knows where to write
    the files. The LLM
    gets this from the
    ``current_pdf`` /
    job it is running
    against; the agent
    loop fills it in via
    ``ctx.current_pdf``.

  * On Windows without
    GTK, the PDF step
    fails cleanly -- the
    tool returns
    ``pdf_path=None``
    rather than raising,
    so the user still
    gets .md + .html.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
from typing import Any, Mapping

from ..report import save_narrative_report
from ..workspace import JobPaths
from .tool import Tool, ToolContext


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# P1.1 (R-2026-06-14): the report
# schema version is re-exported
# from ``manusift.report.__init__``
# (the single source of truth) so
# the constant is importable from
# either the ``manusift.report`` or
# ``manusift.tools.render`` package
# without creating a circular import.
from ..report import REPORT_VERSION


def _json_safe(value: Any, *, depth: int = 0) -> Any:
    if depth > 5:
        return repr(value)
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        if len(value) > 2000:
            return value[:2000] + "...<truncated>"
        return value
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {
            str(k): _json_safe(v, depth=depth + 1)
            for k, v in value.items()
        }
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(v, depth=depth + 1) for v in value]
    return repr(value)


def _ctx_metadata(ctx: ToolContext | None) -> dict[str, Any]:
    metadata = getattr(ctx, "metadata", None)
    if isinstance(metadata, dict):
        return metadata
    if isinstance(metadata, Mapping):
        return dict(metadata)
    return {}


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        ),
        encoding="utf-8",
    )


def _normalise_tool_call(call: Any) -> dict[str, Any]:
    if isinstance(call, dict):
        safe = _json_safe(call)
        assert isinstance(safe, dict)
        return safe
    return {"raw": _json_safe(call)}


def _tool_summary_payload(
    trace_id: str,
    metadata: dict[str, Any],
) -> dict[str, Any]:
    raw_calls = metadata.get("tool_calls")
    if not isinstance(raw_calls, list):
        raw_calls = metadata.get("audit_records")
    if not isinstance(raw_calls, list):
        raw_calls = []
    calls = [_normalise_tool_call(c) for c in raw_calls]
    names = [
        str(c.get("tool") or c.get("tool_name") or "unknown")
        for c in calls
    ]
    failures = [
        c for c in calls
        if c.get("ok") is False or c.get("error")
    ]
    return {
        "report_version": REPORT_VERSION,
        "trace_id": trace_id,
        "generated_at": _utc_now_iso(),
        "total_calls": len(calls),
        "counts_by_tool": dict(Counter(names)),
        "failures": failures,
        "calls": calls,
    }


def _copy_evidence_assets(
    trace_id: str,
    metadata: dict[str, Any],
    assets_dir: Path,
) -> dict[str, Any]:
    assets_dir.mkdir(parents=True, exist_ok=True)
    raw_assets = metadata.get("evidence_assets")
    if not isinstance(raw_assets, list):
        raw_assets = metadata.get("assets")
    if not isinstance(raw_assets, list):
        raw_assets = []
    manifest_assets: list[dict[str, Any]] = []
    for idx, item in enumerate(raw_assets):
        if not isinstance(item, dict):
            manifest_assets.append(
                {"id": f"asset-{idx}", "raw": _json_safe(item)}
            )
            continue
        entry = _json_safe(item)
        assert isinstance(entry, dict)
        source = item.get("path") or item.get("source_path")
        if isinstance(source, str) and source:
            src = Path(source)
            entry["source_path"] = str(src)
            if src.exists() and src.is_file():
                dst = assets_dir / src.name
                if src.resolve() != dst.resolve():
                    shutil.copy2(src, dst)
                entry["copied_path"] = str(dst)
                entry["size_bytes"] = dst.stat().st_size
        manifest_assets.append(entry)
    data_sources = metadata.get("data_sources")
    if not isinstance(data_sources, list):
        data_sources = []
    return {
        "report_version": REPORT_VERSION,
        "trace_id": trace_id,
        "generated_at": _utc_now_iso(),
        "assets": manifest_assets,
        "data_sources": _json_safe(data_sources),
    }


class RenderReportTool:
    """Render the LLM's
    markdown report to
    the final HTML report
    on disk.

    The tool takes the
    full markdown body as
    ``input.markdown``.
    The renderer follows
    ``manusift.report.narrative``
    and writes three files
    to the job's workspace:

      * ``report.md`` --
        the markdown source
      * ``report.html`` --
        the styled HTML
        (overwrites the old
        flat-dump)
      * ``report.pdf`` --
        optional best-effort
        side artifact; on
        runtimes without
        weasyprint / GTK
        this stays ``null``.
    """

    name: str = "render_report"

    def description(self) -> str:
        return (
            "Render a markdown integrity report into the final HTML report "
            "on disk. The LLM calls this after collecting "
            "evidence via the analysis tools and writing a "
            "narrative markdown document (typically 600-1500 "
            "words, with sections 'Executive Summary', "
            "'Paper Under Review', 'Diagnostic Surface', "
            "'Key Findings', 'Knowledge-Base Cross-References', "
            "'Recommended Next Steps', 'Disclaimer'). The "
            "tool returns the absolute paths to the written "
            ".md and .html files; .pdf may also be present as "
            "an optional side artifact when the runtime supports "
            "WeasyPrint. Use this to produce the final HTML report "
            "for the user. "
            "Supports multiple languages via the ``language`` "
            "parameter: ``\"en\"`` (default), ``\"zh\"`` "
            "(Simplified Chinese), ``\"ja\"``, ``\"ko\"``. "
            "English reports save to ``report.md`` / "
            "``report.html``; Chinese saves to ``report.zh.md`` "
            "/ ``report.zh.html`` so both can coexist in the "
            "same job. The HTML uses a CJK font fallback chain "
            "(PingFang SC -> Microsoft YaHei -> Noto Sans CJK) "
            "and the verdict keyword in the LLM-written "
            "markdown should be ``high concern`` / ``medium "
            "concern`` / ``low concern`` for English reports, "
            "or ``高关注`` / ``中关注`` / ``低关注`` for "
            "Chinese reports -- both forms are styled."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "trace_id": {
                    "type": "string",
                    "description": (
                        "The trace_id of the job whose "
                        "findings the report covers. "
                        "Required: the tool needs this "
                        "to know where to write the files."
                    ),
                },
                "markdown": {
                    "type": "string",
                    "description": (
                        "The full markdown report body. "
                        "Should be 600-1500 words with the "
                        "sections listed in the "
                        "``integrity_report`` skill. Pass "
                        "the markdown inline rather than "
                        "as a file path -- the LLM has it "
                        "in its context already."
                    ),
                },
                "include_pdf": {
                    "type": "boolean",
                    "description": (
                        "Optional. Set to ``false`` to "
                        "skip PDF rendering on "
                        "environments without weasyprint "
                        "(Windows without GTK, for "
                        "example). Defaults to ``true``."
                    ),
                    "default": True,
                },
                "language": {
                    "type": "string",
                    "description": (
                        "Output language for the report. "
                        "``\"en\"`` (default): English, "
                        "sections and verdict keywords in "
                        "English, file suffix ``.md``. "
                        "``\"zh\"``: Simplified Chinese, "
                        "use ``## 执行摘要``, ``## 关键发现``, "
                        "``## 知识库交叉引用``, ``## 建议下一步``, "
                        "``## 免责声明`` etc., and "
                        "``**高关注**`` / ``**中关注**`` / "
                        "``**低关注**`` for verdicts. File "
                        "suffix ``.zh.md``. The HTML "
                        "carries ``<html lang=\"zh-Hans\">`` "
                        "and a CJK font fallback chain."
                    ),
                    "enum": ["en", "zh", "ja", "ko"],
                    "default": "en",
                },
            },
            "required": ["trace_id", "markdown"],
            "additionalProperties": False,
        }

    def execute(
        self,
        input: dict[str, Any],
        ctx: ToolContext,
    ) -> str:
        trace_id = (input.get("trace_id") or "").strip()
        if not trace_id:
            return json.dumps(
                {"error": "trace_id is required"}
            )
        markdown = input.get("markdown")
        if not isinstance(markdown, str) or not markdown.strip():
            return json.dumps(
                {"error": "markdown is required and must be a non-empty string"}
            )
        include_pdf = bool(
            input.get("include_pdf", True)
        )
        # Default to
        # English so
        # callers that
        # never heard of
        # the i18n work
        # still get the
        # same behaviour
        # they always
        # did.
        language = (input.get("language") or "en").strip().lower()
        if language not in ("en", "zh", "ja", "ko"):
            language = "en"
        # Resolve the
        # output
        # directory.
        # The
        # canonical
        # job-workspace
        # layout
        # lives at
        # ``<workspace_dir>/<trace_id>/``
        # so we use
        # ``JobPaths``
        # which is
        # already
        # the
        # source of
        # truth
        # elsewhere
        # in the
        # project.
        from ..config import get_settings
        settings = get_settings()
        paths = JobPaths.for_trace(
            trace_id, settings.workspace_dir
        )
        paths.ensure()
        try:
            out = save_narrative_report(
                markdown,
                out_dir=paths.output_dir,
                trace_id=trace_id,
                include_pdf=include_pdf,
                language=language,
            )
        except Exception as exc:  # noqa: BLE001
            return json.dumps(
                {
                    "error": (
                        f"{type(exc).__name__}: {exc}"
                    ),
                    "trace_id": trace_id,
                }
            )
        metadata = _ctx_metadata(ctx)
        current_pdf = getattr(ctx, "current_pdf", None)
        source_pdf = (
            metadata.get("pdf_path")
            if isinstance(metadata.get("pdf_path"), str)
            else current_pdf
        )
        generated_at = _utc_now_iso()
        report_json_path = paths.output_dir / "report.json"
        raw_trace_path = paths.output_dir / "raw_trace.json"
        tool_summary_path = paths.output_dir / "tool_summary.json"
        evidence_assets_dir = paths.output_dir / "evidence_assets"
        evidence_manifest_path = evidence_assets_dir / "manifest.json"
        # P1.1 content hash: the bundle-level
        # sha256 of the markdown body. We
        # compute it after we have the
        # finalised markdown so it includes any
        # normalisation the renderer does.
        # Stored both as ``markdown_sha256``
        # (per the existing contract) and
        # ``content_hash`` (the bundle-level
        # identifier downstream tools can
        # use to dedup or compare).
        bundle_content_hash = hashlib.sha256(
            markdown.encode("utf-8")
        ).hexdigest()
        word_count = len(markdown.split())
        markdown_sha256 = hashlib.sha256(
            markdown.encode("utf-8")
        ).hexdigest()
        tool_summary = _tool_summary_payload(trace_id, metadata)
        evidence_manifest = _copy_evidence_assets(
            trace_id,
            metadata,
            evidence_assets_dir,
        )
        paths_payload = {
            "markdown": out["md"],
            "html": out["html"],
            "pdf": out["pdf"],
            "report_json": str(report_json_path),
            "raw_trace": str(raw_trace_path),
            "tool_summary": str(tool_summary_path),
            "evidence_manifest": str(evidence_manifest_path),
            "evidence_assets_dir": str(evidence_assets_dir),
        }
        report_payload = {
            "report_version": REPORT_VERSION,
            "trace_id": trace_id,
            "language": language,
            "generated_at": generated_at,
            "word_count": word_count,
            "markdown_sha256": markdown_sha256,
            "content_hash": bundle_content_hash,
            "source_pdf": source_pdf,
            "data_sources": _json_safe(
                metadata.get("data_sources", [])
            ),
            "paths": paths_payload,
            "artifact_contract": {
                "markdown": "report.md",
                "html": "report.html",
                "report_json": "report.json",
                "raw_trace": "raw_trace.json",
                "tool_summary": "tool_summary.json",
                "evidence_assets": "evidence_assets/",
            },
        }
        raw_trace_payload = {
            "report_version": REPORT_VERSION,
            "trace_id": trace_id,
            "generated_at": generated_at,
            "context": {
                "trace_id": getattr(ctx, "trace_id", None),
                "current_pdf": current_pdf,
                "metadata": _json_safe(metadata),
            },
            "render_input": {
                "trace_id": trace_id,
                "language": language,
                "include_pdf": include_pdf,
                "markdown_sha256": markdown_sha256,
                "markdown_word_count": word_count,
                "markdown_preview": markdown[:500],
            },
        }
        _write_json(evidence_manifest_path, evidence_manifest)
        _write_json(tool_summary_path, tool_summary)
        _write_json(raw_trace_path, raw_trace_payload)
        _write_json(report_json_path, report_payload)
        # Note for
        # future
        # debugging:
        # paths.output_dir
        # == the
        # same dir
        # the
        # /api/upload
        # pipeline
        # writes
        # findings.json
        # +
        # report.html
        # to, so
        # the
        # web
        # endpoint
        # and the
        # tool
        # produce
        # the
        # same
        # files
        # in
        # the
        # same
        # location.
        return json.dumps(
            {
                "trace_id": trace_id,
                "language": language,
                "markdown_path": out["md"],
                "html_path": out["html"],
                "pdf_path": out["pdf"],
                "report_json_path": str(report_json_path),
                "raw_trace_path": str(raw_trace_path),
                "tool_summary_path": str(tool_summary_path),
                "evidence_manifest_path": str(evidence_manifest_path),
                "evidence_assets_dir": str(evidence_assets_dir),
                "word_count": word_count,
                "note": (
                    "PDF is null if the runtime lacks weasyprint / GTK; "
                    "the .md + .html are always produced. "
                    "Open the HTML in any browser or the "
                    "Markdown in any text editor."
                )
                if out["pdf"] is None
                else None,
            },
            ensure_ascii=False,
        )


def register_render_tools() -> list[Tool]:
    """Return the render tool
    for the registry.

    Built on every call (not
    module-level) so a
    test can monkey-patch
    the report renderer
    without poisoning the
    rest of the session.
    """
    return [RenderReportTool()]
