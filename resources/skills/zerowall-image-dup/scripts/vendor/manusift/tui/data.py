"""TUI data loader.

Reads ``data/jobs/<tid>/`` directly. No HTTP, no LLM, no FastAPI.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from ..config import get_settings
from ..workspace import JobPaths

SEVERITY_RANK = {"high": 0, "medium": 1, "low": 2, "info": 3}


@dataclass(frozen=True)
class JobSummary:
    trace_id: str
    status: str
    source_filename: str
    created_at: float
    finished_at: float | None
    error: str | None
    finding_count: int
    duration_ms: int
    detectors_run: list[str]
    llm_calls: int
    report_path: Path
    findings_path: Path

    @property
    def has_report(self) -> bool:
        return self.report_path.exists()

    @property
    def has_findings(self) -> bool:
        return self.findings_path.exists()

    def matches(self, query: str) -> bool:
        """Case-insensitive substring search across the fields a
        user is most likely to type: trace_id, filename, status,
        detector names."""
        if not query:
            return True
        q = query.lower()
        haystacks = [
            self.trace_id,
            self.source_filename,
            self.status,
            " ".join(self.detectors_run),
        ]
        return any(q in h.lower() for h in haystacks)


def list_jobs(workspace_dir: Path | None = None) -> list[JobSummary]:
    """Return one JobSummary per sub-directory of ``workspace_dir``,
    sorted newest first."""
    ws = workspace_dir or get_settings().workspace_dir
    if not ws.exists():
        return []
    summaries: list[JobSummary] = []
    for entry in sorted(ws.iterdir()):
        if not entry.is_dir():
            continue
        s = _read_job_summary(entry)
        if s is not None:
            summaries.append(s)
    summaries.sort(key=lambda s: s.created_at, reverse=True)
    return summaries


def _read_job_summary(job_dir: Path) -> JobSummary | None:
    paths = JobPaths(trace_id=job_dir.name, root=job_dir)
    job_json = paths.job_json
    if not job_json.exists():
        return None
    try:
        data = json.loads(job_json.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    detectors_run: list[str] = list(data.get("detectors_run", []))
    finding_count = int(data.get("finding_count", 0))
    llm_calls = 0
    findings_path = paths.findings_json
    if findings_path.exists():
        try:
            fdata = json.loads(findings_path.read_text(encoding="utf-8"))
            detectors_run = list(fdata.get("detectors_run", detectors_run))
            llm_calls = int(fdata.get("llm_calls", 0))
        except (OSError, json.JSONDecodeError):
            pass

    return JobSummary(
        trace_id=data.get("trace_id", job_dir.name),
        status=data.get("status", "unknown"),
        source_filename=data.get("source_filename", ""),
        created_at=float(data.get("created_at", 0.0)),
        finished_at=data.get("finished_at"),
        error=data.get("error"),
        finding_count=finding_count,
        duration_ms=int(data.get("duration_ms", 0)),
        detectors_run=detectors_run,
        llm_calls=llm_calls,
        report_path=paths.report_html,
        findings_path=findings_path,
    )


def load_findings(job: JobSummary) -> list[dict]:
    if not job.findings_path.exists():
        return []
    try:
        data = json.loads(job.findings_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return list(data.get("findings", []))
