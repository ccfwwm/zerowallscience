"""Screen-verdict triage + asynchronous screen jobs (P3, MCP product surface).

This module backs the four product-level MCP tools (``screen_verdict``,
``submit_screen``, ``get_job_status``, ``get_job_result``). It is kept
free of heavy imports at module level so the tool registry can import it
on the MCP startup path; ``run_pipeline`` and friends are imported
lazily inside the functions that need them.

Verdict rule (written down here and in the ``screen_verdict`` tool
description + ``docs/mcp/README.md`` — keep all three in sync):

  * ``flagged`` — at least one **high**-severity issue.
  * ``suspect`` — no high issue, but at least
    ``Settings.screen_suspect_medium_issue_threshold`` (default 3)
    **medium**-severity issues.
  * ``clean``   — otherwise.

Issues (not raw findings) are the counting unit: the P1.1 aggregation
layer already collapses detector chatter on the same evidence object
into one issue, so one duplicated figure cannot inflate the verdict by
firing multiple detectors at once.

Score (0-1, severity-weighted, deliberately simple):

    score = min(1.0, (1.0*H + 0.4*M + 0.1*L) / 3.0)

where H/M/L are the issue counts by severity (``info`` weighs 0). One
high issue alone scores 0.333; three high issues (or an equivalent mix)
saturate the score at 1.0. Rounded to 3 decimals.

Async job model (P3.2):

  * ``submit_screen`` mints a job id (same string as the pipeline
    trace_id), persists a queued state file, and starts the pipeline on
    a daemon thread. The MCP loop thread is never blocked.
  * State machine: ``queued`` -> ``running`` -> ``done`` | ``failed``.
    A state file left in ``queued``/``running`` by a server restart is
    reported (and re-persisted) as ``failed`` with
    ``error="interrupted: server restarted"`` — completed jobs survive
    restarts because status and result are read from disk, not memory.
  * State file: ``<workspace>/_screen_jobs/<job_id>.json`` (schema
    ``manusift.screen_job.v1``), written atomically (tmp file +
    ``os.replace``) on every transition and every progress tick.
  * Progress source: the pipeline's ``on_step_complete`` hook — each
    finished detector increments ``steps_done``; ``progress_pct`` is
    ``floor(100 * steps_done / steps_total)`` capped at 99 until the
    run completes (skipped/cached detectors never fire the hook, so the
    count can legitimately stall below the total mid-run; it only needs
    to be monotonic, which it is because ``steps_done`` never
    decreases). The finished detector's name becomes ``stage``.
  * Result: the same payload ``screen_verdict`` returns, persisted to
    ``<workspace>/<trace_id>/output/screen_verdict.json``.
"""
from __future__ import annotations

import contextlib
import json
import os
import re
import sys
import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

VERDICT_SCHEMA = "manusift.screen_verdict.v1"
JOB_SCHEMA = "manusift.screen_job.v1"

# Severity weights for the score (see module docstring). ``info``
# findings are noise for triage purposes and weigh nothing.
_SEV_WEIGHT = {"high": 1.0, "medium": 0.4, "low": 0.1, "info": 0.0}
_SEV_RANK = {"info": 0, "low": 1, "medium": 2, "high": 3}
# Weighted sum at which the score pins to 1.0 (three high issues).
_SCORE_SATURATION = 3.0

_JOB_ID_RE = re.compile(r"[A-Za-z0-9_-]{1,64}")
_JOBS_DIRNAME = "_screen_jobs"
_VERDICT_FILENAME = "screen_verdict.json"


# ---------------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------------


def _workspace_dir() -> Path:
    from .config import get_settings

    return Path(get_settings().workspace_dir)


def _atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    """Write JSON atomically: tmp file in the same directory + replace.

    Progress ticks come from a background thread while a poll reads the
    same file; a half-written state file must never be observable.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(
        f"{path.name}.{os.getpid()}.{threading.get_ident()}.tmp"
    )
    tmp.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    os.replace(tmp, path)


def _read_json(path: Path) -> dict[str, Any] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


# ---------------------------------------------------------------------------
# verdict computation
# ---------------------------------------------------------------------------


def compute_verdict(
    issues: list[dict[str, Any]],
    *,
    trace_id: str,
    report_path: str,
    suspect_medium_threshold: int = 3,
    top_n: int = 5,
) -> dict[str, Any]:
    """Turn the aggregated issue list into the triage payload.

    ``issues`` are ``Issue.to_dict()`` dicts. The verdict rule and score
    formula are written down in the module docstring; this function is
    their single implementation. Pure — no I/O, no settings lookup — so
    unit tests drive it directly.
    """
    counts = {"high": 0, "medium": 0, "low": 0, "info": 0}
    for issue in issues:
        sev = str(issue.get("severity") or "info")
        counts[sev if sev in counts else "info"] += 1

    if counts["high"] >= 1:
        verdict = "flagged"
    elif counts["medium"] >= suspect_medium_threshold:
        verdict = "suspect"
    else:
        verdict = "clean"

    weighted = sum(counts[sev] * w for sev, w in _SEV_WEIGHT.items())
    score = round(min(1.0, weighted / _SCORE_SATURATION), 3)

    ranked = sorted(
        issues,
        key=lambda i: (
            -_SEV_RANK.get(str(i.get("severity") or "info"), 0),
            -int(i.get("member_count") or 0),
            str(i.get("issue_id") or ""),
        ),
    )
    top_issues = [
        {
            "issue_id": i.get("issue_id"),
            "severity": i.get("severity"),
            "title": i.get("title"),
            "detectors": list(i.get("detectors") or []),
            "member_count": int(i.get("member_count") or 0),
        }
        for i in ranked[: max(0, top_n)]
    ]

    return {
        "schema": VERDICT_SCHEMA,
        "trace_id": trace_id,
        "verdict": verdict,
        "score": score,
        "top_issues": top_issues,
        "counts_by_severity": counts,
        "issue_count": len(issues),
        "report_path": report_path,
    }


def _verdict_knobs() -> tuple[int, int]:
    """(suspect_medium_threshold, top_n) from Settings, with fallbacks."""
    try:
        from .config import get_settings

        s = get_settings()
        return (
            int(getattr(s, "screen_suspect_medium_issue_threshold", 3)),
            int(getattr(s, "screen_top_issues", 5)),
        )
    except Exception:  # noqa: BLE001
        return 3, 5


def _verdict_from_issues_dicts(
    issues: list[dict[str, Any]], *, trace_id: str, report_path: str
) -> dict[str, Any]:
    threshold, top_n = _verdict_knobs()
    return compute_verdict(
        issues,
        trace_id=trace_id,
        report_path=report_path,
        suspect_medium_threshold=threshold,
        top_n=top_n,
    )


def _verdict_path(trace_id: str, workspace_dir: Path) -> Path:
    return workspace_dir / trace_id / "output" / _VERDICT_FILENAME


def verdict_for_trace(
    trace_id: str, *, workspace_dir: Path | None = None
) -> dict[str, Any]:
    """Compute (or reuse) the verdict for an already-analysed trace.

    Resolution order: a previously-written ``screen_verdict.json``
    wins; otherwise the pipeline's ``issues.json`` is reduced to a
    verdict; otherwise ``findings.json`` is re-aggregated through the
    P1.1 layer. Raises ``FileNotFoundError`` when the trace has no
    usable artifacts (caller turns that into an error payload).
    """
    ws = workspace_dir or _workspace_dir()
    from .workspace import JobPaths

    paths = JobPaths.for_trace(trace_id, ws)
    report_path = str(paths.report_html.resolve())

    cached = _read_json(_verdict_path(trace_id, ws))
    if cached is not None:
        return cached

    issues_doc = _read_json(paths.issues_json)
    if issues_doc is not None and isinstance(issues_doc.get("issues"), list):
        verdict = _verdict_from_issues_dicts(
            issues_doc["issues"],
            trace_id=trace_id,
            report_path=report_path,
        )
    elif paths.findings_json.is_file():
        from .report.finding_aggregation import aggregate_findings
        from .report.investigation_pairs import findings_from_json

        _tid, finding_objs, _n = findings_from_json(paths.findings_json)
        issues = [i.to_dict() for i in aggregate_findings(finding_objs)]
        verdict = _verdict_from_issues_dicts(
            issues, trace_id=trace_id, report_path=report_path
        )
    else:
        raise FileNotFoundError(
            f"no screen artifacts for trace {trace_id!r} under {ws}"
        )

    try:
        _atomic_write_json(_verdict_path(trace_id, ws), verdict)
    except OSError:
        pass  # the payload is still returned; caching is best-effort
    return verdict


_SI_PDF_NAME_RE = re.compile(
    r"(supplement|si[_-]|moesm|supporting.?info|appendix)",
    re.IGNORECASE,
)


def _copy_sidecar_data(pdf_dir: Path, materials_dir: Path) -> list[str]:
    """Copy companion data + SI PDFs next to the source PDF into materials/.

    Copies XLSX/CSV/TSV/JSON (Source Data) and supplementary PDFs
    (``*Supplementary*``, ``*MOESM*``, …) so the pipeline can merge SI
    figures with the main PDF (P6.3). Returns the copied file names.
    """
    from .ingest.xlsx import discover_companion_files

    copied: list[str] = []
    if not pdf_dir.is_dir():
        return copied
    materials_dir.mkdir(parents=True, exist_ok=True)
    for fp in discover_companion_files(pdf_dir):
        try:
            dest = materials_dir / fp.name
            if dest.exists():
                continue
            dest.write_bytes(fp.read_bytes())
            copied.append(fp.name)
        except OSError:
            continue
    # Companion SI PDFs (not covered by data-file discovery).
    try:
        main_name = ""
        # Prefer not re-copying the main paper if named similarly.
        for fp in sorted(pdf_dir.iterdir()):
            if not fp.is_file() or fp.suffix.lower() != ".pdf":
                continue
            if not _SI_PDF_NAME_RE.search(fp.name):
                continue
            dest = materials_dir / fp.name
            if dest.exists():
                continue
            try:
                dest.write_bytes(fp.read_bytes())
                copied.append(fp.name)
            except OSError:
                continue
    except OSError:
        pass
    return copied


def run_screen(
    pdf_path: Path,
    *,
    trace_id: str | None = None,
    use_llm: bool = False,
    include_sidecar: bool = True,
    workspace_dir: Path | None = None,
    on_step_complete: Callable[[Any, Any], None] | None = None,
) -> dict[str, Any]:
    """Run the full pipeline on ``pdf_path`` and return the verdict.

    Mirrors the CLI screen path (``manusift/cli.py``): copy the PDF
    into the job workspace, build a ``JobState``, call
    ``run_pipeline``. LLM enrichment is disabled by default
    (``MANUSIFT_LLM_MAX_CONCURRENCY=0`` for the duration of the run);
    LLM adjudication is already opt-in upstream
    (``MANUSIFT_LLM_ADJUDICATE``, default off), so the default screen
    is fully deterministic and offline apart from the user's own
    detector config (e.g. Crossref). The env override is process-wide
    while held, but every screen job writes the same value, so
    concurrent jobs do not conflict.
    """
    from .contracts import JobState
    from .pipeline import run_pipeline
    from .report.finding_aggregation import aggregate_findings
    from .trace import new_trace_id
    from .workspace import JobPaths

    ws = workspace_dir or _workspace_dir()
    pdf_path = Path(pdf_path).resolve()
    tid = trace_id or new_trace_id()

    ws.mkdir(parents=True, exist_ok=True)
    paths = JobPaths.for_trace(tid, ws)
    paths.ensure()
    paths.original.write_bytes(pdf_path.read_bytes())
    sidecar = _copy_sidecar_data(pdf_path.parent, paths.materials_dir) if include_sidecar else []

    job = JobState(trace_id=tid, status="queued", source_filename=pdf_path.name)

    old_concurrency = os.environ.get("MANUSIFT_LLM_MAX_CONCURRENCY")
    if not use_llm:
        os.environ["MANUSIFT_LLM_MAX_CONCURRENCY"] = "0"
    try:
        result = run_pipeline(
            paths.original, paths, job, on_step_complete=on_step_complete
        )
    finally:
        if not use_llm:
            if old_concurrency is None:
                os.environ.pop("MANUSIFT_LLM_MAX_CONCURRENCY", None)
            else:
                os.environ["MANUSIFT_LLM_MAX_CONCURRENCY"] = old_concurrency

    issues = [i.to_dict() for i in aggregate_findings(result.findings)]
    verdict = _verdict_from_issues_dicts(
        issues,
        trace_id=tid,
        report_path=str(paths.report_html.resolve()),
    )
    verdict["duration_ms"] = result.duration_ms
    verdict["sidecar_files"] = len(sidecar)
    _atomic_write_json(_verdict_path(tid, ws), verdict)
    return verdict


# ---------------------------------------------------------------------------
# async screen jobs
# ---------------------------------------------------------------------------


class ScreenJobManager:
    """Thread-per-job screen runner with disk-backed state.

    One process-wide instance (``get_screen_job_manager``) is shared by
    the MCP tools. Job state lives on disk
    (``<workspace>/_screen_jobs/<job_id>.json``) so a server restart
    never loses completed jobs; the in-memory ``_live`` set only tracks
    which jobs have a running thread *in this process* — a state file
    that says ``running`` without a live thread means the previous
    process died mid-job.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._live: set[str] = set()

    # -- paths ---------------------------------------------------------

    def _jobs_dir(self) -> Path:
        return _workspace_dir() / _JOBS_DIRNAME

    def _state_path(self, job_id: str) -> Path:
        return self._jobs_dir() / f"{job_id}.json"

    # -- submit ---------------------------------------------------------

    def submit(self, pdf_path: str, *, use_llm: bool = False) -> dict[str, Any]:
        """Validate the PDF, persist a queued state, start the thread."""
        from .trace import new_trace_id

        pdf = Path(pdf_path).expanduser()
        if not pdf.is_absolute():
            pdf = (Path.cwd() / pdf).resolve()
        if not pdf.is_file():
            return {"error": "pdf_not_found", "path": str(pdf_path)}
        if pdf.suffix.lower() != ".pdf":
            return {"error": "not_a_pdf", "path": str(pdf_path)}

        job_id = new_trace_id()
        now = time.time()
        state: dict[str, Any] = {
            "schema": JOB_SCHEMA,
            "job_id": job_id,
            "trace_id": job_id,
            "status": "queued",
            "progress_pct": 0,
            "stage": "queued",
            "steps_done": 0,
            "steps_total": 0,
            "pdf": str(pdf),
            "use_llm": bool(use_llm),
            "created_at": now,
            "started_at": None,
            "finished_at": None,
            "error": None,
            "result_path": None,
        }
        with self._lock:
            self._live.add(job_id)
        try:
            _atomic_write_json(self._state_path(job_id), state)
        except OSError as exc:
            with self._lock:
                self._live.discard(job_id)
            return {"error": "state_write_failed", "detail": str(exc)}

        thread = threading.Thread(
            target=self._run_job,
            args=(job_id, pdf, bool(use_llm)),
            name=f"screen-job-{job_id}",
            daemon=True,
        )
        thread.start()
        return {
            "job_id": job_id,
            "status": "queued",
            "poll": {"tool": "get_job_status", "arguments": {"job_id": job_id}},
        }

    # -- worker -----------------------------------------------------------

    def _persist(self, state: dict[str, Any]) -> None:
        try:
            _atomic_write_json(self._state_path(state["job_id"]), state)
        except OSError:
            pass  # progress is a nicety; never kill the job over it

    def _run_job(self, job_id: str, pdf: Path, use_llm: bool) -> None:
        state = _read_json(self._state_path(job_id)) or {}
        if state.get("job_id") != job_id:
            state = {"job_id": job_id, "trace_id": job_id}
        try:
            from .pipeline import _pipeline_detector_classes

            steps_total = len(_pipeline_detector_classes())
        except Exception:  # noqa: BLE001
            steps_total = 0
        state.update(
            {
                "schema": JOB_SCHEMA,
                "status": "running",
                "stage": "starting",
                "steps_total": steps_total,
                "started_at": time.time(),
            }
        )
        self._persist(state)

        def _hook(res: Any, _job_state: Any) -> None:
            state["steps_done"] = int(state.get("steps_done") or 0) + 1
            state["stage"] = str(getattr(res, "detector", "") or "detector")
            total = int(state.get("steps_total") or 0)
            if total > 0:
                state["progress_pct"] = min(
                    99, int(100 * state["steps_done"] / total)
                )
            self._persist(state)

        try:
            # Same stdout discipline as the MCP server's call_tool:
            # library prints from this background thread must never
            # reach the JSON-RPC channel.
            with contextlib.redirect_stdout(sys.stderr):
                # The verdict payload is persisted by run_screen
                # itself (screen_verdict.json); result() reads it
                # back from disk.
                run_screen(
                    pdf,
                    trace_id=job_id,
                    use_llm=use_llm,
                    on_step_complete=_hook,
                )
        except Exception as exc:  # noqa: BLE001
            state.update(
                {
                    "status": "failed",
                    "stage": "failed",
                    "finished_at": time.time(),
                    "error": f"{type(exc).__name__}: {exc}",
                }
            )
        else:
            state.update(
                {
                    "status": "done",
                    "progress_pct": 100,
                    "stage": "done",
                    "finished_at": time.time(),
                    "error": None,
                    "result_path": str(
                        _verdict_path(job_id, _workspace_dir()).resolve()
                    ),
                }
            )
        finally:
            # Persist the terminal state BEFORE leaving the live set.
            # The reverse order races with status(): a poll landing in
            # the gap would read the stale "running" file, see no live
            # thread, and wrongly re-stamp the finished job as
            # "interrupted: server restarted".
            self._persist(state)
            with self._lock:
                self._live.discard(job_id)

    # -- poll / result ---------------------------------------------------

    def status(self, job_id: str) -> dict[str, Any]:
        """Return the current state, reconciling dead processes.

        A ``queued``/``running`` state file whose job has no live
        thread in this process belongs to a crashed/restarted server:
        mark it ``failed`` (``interrupted``) and persist that, so
        polling clients are not stuck waiting forever.
        """
        if not _JOB_ID_RE.fullmatch(str(job_id or "")):
            return {"error": "invalid_job_id", "job_id": job_id}
        state = _read_json(self._state_path(str(job_id)))
        if state is None:
            return {"error": "unknown_job", "job_id": job_id}
        with self._lock:
            alive = str(job_id) in self._live
        if not alive and state.get("status") in ("queued", "running"):
            state["status"] = "failed"
            state["stage"] = "failed"
            state["finished_at"] = time.time()
            state["error"] = "interrupted: server restarted"
            self._persist(state)
        return state

    def result(self, job_id: str) -> dict[str, Any]:
        """Return the verdict payload when done, else the status."""
        state = self.status(job_id)
        if state.get("error") and "status" not in state:
            return state
        if state.get("status") != "done":
            return state
        result_path = state.get("result_path")
        payload = (
            _read_json(Path(result_path)) if result_path else None
        )
        if payload is None:
            payload = _read_json(
                _verdict_path(str(job_id), _workspace_dir())
            )
        if payload is None:
            state = dict(state)
            state["status"] = "failed"
            state["error"] = "result file missing"
            return state
        return payload


_MANAGER: ScreenJobManager | None = None
_MANAGER_LOCK = threading.Lock()


def get_screen_job_manager() -> ScreenJobManager:
    """Process-wide manager shared by all four screen tools."""
    global _MANAGER
    with _MANAGER_LOCK:
        if _MANAGER is None:
            _MANAGER = ScreenJobManager()
        return _MANAGER
