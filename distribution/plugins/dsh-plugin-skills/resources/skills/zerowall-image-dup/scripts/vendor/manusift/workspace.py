"""Per-job file layout.

All artifacts for one analysis live under::

    <workspace_dir>/<trace_id>/
        inputs/
            original.pdf       uploaded file
            materials/         companion data files (Source_Data_*.xlsx, ...)
        steps/
            00_metadata.json   per-detector checkpoints (Step H3)
            01_image_dup.json
            02_image_forensics.json
            03_text_patterns.json
            images/            rasters extracted from the PDF at ingest
        output/
            job.json           job state + summary
            findings.json      AnalysisResult (raw, for evals)
            issues.json        aggregated issue view (P1.1)
            report.html        human-readable report
            llm_report.*       standalone LLM interpretation report
            llm_briefing.*     human-oriented editorial briefing
            investigation_*    pairs-localization / plain reports

Each ``steps/NN_<name>.json`` is the serialized ``DetectorResult``
for that step. The pipeline reads them at startup so a job that
crashed mid-run can be resumed: detectors whose step file is
present and ``ok=True`` are skipped. (Borrowed from LangGraph's
"checkpoint per super-step" pattern, but per-file rather than per-
graph because our pipeline is a flat sequence, not a graph.)

The directory is created lazily on first access. We never write
outside this directory.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


def cache_dir(workspace_dir: Path) -> Path:
    """Shared cache directory for cross-job HTTP caches.

    The Crossref / OpenAlex / link-check caches are shared across
    jobs (they are keyed by DOI / URL, not by trace) so they live
    next to the workspace, under ``<workspace_dir>/../cache/``
    (``data/cache/`` for the default ``./data/jobs`` workspace).
    """
    return workspace_dir.parent / "cache"


@dataclass(frozen=True)
class JobPaths:
    trace_id: str
    root: Path

    @classmethod
    def for_trace(cls, trace_id: str, workspace_dir: Path) -> JobPaths:
        return cls(trace_id=trace_id, root=workspace_dir / trace_id)

    def ensure(self) -> None:
        self.inputs_dir.mkdir(parents=True, exist_ok=True)
        self.steps_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    @property
    def inputs_dir(self) -> Path:
        return self.root / "inputs"

    @property
    def materials_dir(self) -> Path:
        """Companion data files uploaded alongside the PDF."""
        return self.inputs_dir / "materials"

    @property
    def output_dir(self) -> Path:
        return self.root / "output"

    @property
    def original(self) -> Path:
        return self.inputs_dir / "original.pdf"

    @property
    def job_json(self) -> Path:
        return self.output_dir / "job.json"

    @property
    def findings_json(self) -> Path:
        return self.output_dir / "findings.json"

    @property
    def issues_json(self) -> Path:
        """Aggregated issue view (P1.1) alongside findings.json."""
        return self.output_dir / "issues.json"

    @property
    def report_html(self) -> Path:
        return self.output_dir / "report.html"

    @property
    def llm_report_html(self) -> Path:
        """Standalone LLM interpretation report (not merged into report.html)."""
        return self.output_dir / "llm_report.html"

    @property
    def llm_report_md(self) -> Path:
        return self.output_dir / "llm_report.md"

    @property
    def llm_report_json(self) -> Path:
        return self.output_dir / "llm_report.json"

    @property
    def llm_briefing_html(self) -> Path:
        """Human-oriented editorial briefing (preferred for reading)."""
        return self.output_dir / "llm_briefing.html"

    @property
    def llm_briefing_md(self) -> Path:
        return self.output_dir / "llm_briefing.md"

    @property
    def investigation_plain_html(self) -> Path:
        """Formal concise screening report (secondary human entry)."""
        return self.output_dir / "investigation_plain.html"

    @property
    def investigation_plain_md(self) -> Path:
        return self.output_dir / "investigation_plain.md"

    @property
    def investigation_pairs_html(self) -> Path:
        """Pairs-localization report (primary human entry)."""
        return self.output_dir / "investigation_pairs.html"

    @property
    def investigation_pairs_md(self) -> Path:
        return self.output_dir / "investigation_pairs.md"

    @property
    def investigation_pairs_json(self) -> Path:
        return self.output_dir / "investigation_pairs.json"

    @property
    def steps_dir(self) -> Path:
        return self.root / "steps"

    @property
    def images_dir(self) -> Path:
        """Rasters extracted from the PDF, written at ingest time."""
        return self.steps_dir / "images"

    def step_path(self, index: int, detector: str) -> Path:
        """Per-detector checkpoint file. ``index`` is the 0-based
        position in the pipeline's detector list (so files sort
        naturally in shell listings). ``detector`` is the
        detector's name."""
        safe = "".join(c if c.isalnum() or c in ("_", "-") else "_" for c in detector)
        return self.steps_dir / f"{index:02d}_{safe}.json"

    def list_step_files(self) -> list[Path]:
        """Return step checkpoint files in pipeline order.

        Returns an empty list if ``steps/`` does not exist yet.
        Files that do not match the ``NN_<name>.json`` pattern are
        ignored (defensive — the directory is shared with the
        user and could in theory have unrelated files)."""
        if not self.steps_dir.exists():
            return []
        out: list[Path] = []
        for p in sorted(self.steps_dir.iterdir()):
            name = p.name
            if not (name.endswith(".json") and len(name) >= 4 and name[2] == "_"):
                continue
            out.append(p)
        return out
