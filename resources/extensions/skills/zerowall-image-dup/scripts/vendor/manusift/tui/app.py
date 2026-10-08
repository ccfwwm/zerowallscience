"""ManuSift TUI — a textual app over the job workspace.

Layout::

    +----------------------------------------------------------+
    | Header (workspace, status, filter hint)                   |
    +---------------+-------------------+---------------------+
    | Jobs          | Job detail        | Findings            |
    | (filterable)  | (status, file,    | (severity, title,   |
    |               |  finding count)   |  detector, location)|
    +---------------+-------------------+---------------------+
    | Filter input (hidden until '/')                           |
    +----------------------------------------------------------+
    | Footer (key bindings)                                     |
    +----------------------------------------------------------+

Key bindings::

    /     focus the filter input
    s     cycle severity filter (all → high → medium → low → info → all)
    c     clear all filters
    r     reload jobs from disk
    o     open the selected job's HTML report in the default browser
    Enter same as ``o`` (when the jobs table is focused)
    Tab   move focus between jobs and findings
    q     quit
"""
from __future__ import annotations

import json
import webbrowser
from typing import Any, ClassVar

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal
from textual.reactive import reactive
from textual.widgets import DataTable, Footer, Header, Input, Static

from ..config import get_settings
from .data import SEVERITY_RANK, JobSummary, list_jobs, load_findings

# ---------- filter state ----------

class FilterState:
    """In-memory filter applied to the jobs list."""

    SEVERITIES: tuple[str, ...] = ("all", "high", "medium", "low", "info")

    def __init__(self) -> None:
        self.query: str = ""
        self.severity: str = "all"

    def cycle_severity(self) -> None:
        idx = self.SEVERITIES.index(self.severity)
        self.severity = self.SEVERITIES[(idx + 1) % len(self.SEVERITIES)]

    def description(self) -> str:
        parts: list[str] = []
        if self.query:
            parts.append(f'query="{self.query}"')
        if self.severity != "all":
            parts.append(f"severity≥{self.severity}")
        return " · ".join(parts) if parts else "no filter"


def _job_min_severity(job: JobSummary) -> str | None:
    """Return the minimum severity across the job's findings, or None
    if the job has no findings yet."""
    findings = load_findings(job)
    if not findings:
        return None
    ranks = [
        SEVERITY_RANK.get(f.get("severity", "info"), 99) for f in findings
    ]
    min_rank = min(ranks)
    for sev, rank in SEVERITY_RANK.items():
        if rank == min_rank:
            return sev
    return None


def _passes_filter(job: JobSummary, filt: FilterState) -> bool:
    if not job.matches(filt.query):
        return False
    if filt.severity != "all":
        threshold = SEVERITY_RANK.get(filt.severity, 0)
        min_sev = _job_min_severity(job)
        if min_sev is None:
            return False
        if SEVERITY_RANK.get(min_sev, 99) > threshold:
            return False
    return True


# ---------- widgets ----------

class JobsTable(DataTable):
    """Left pane: the list of jobs (already filtered by FilterState)."""

    BINDINGS: ClassVar[list[Binding]] = [
        Binding("o", "open_report", "Open report"),
        Binding("enter", "open_report", "Open report", show=False),
    ]

    def __init__(self, **kwargs: Any) -> None:
        """Add columns eagerly in ``__init__`` so they're guaranteed
        to be present regardless of when ``populate`` is called.
        This sidesteps a textual mount-ordering race we hit during
        back-to-back pytest runs: ``App.on_mount`` may run before
        ``DataTable.on_mount`` and our ``populate`` would then
        ``add_row`` into a column-less table — a silent no-op.
        """
        super().__init__(**kwargs)
        self.cursor_type = "row"
        self.zebra_stripes = True
        self.add_columns("trace_id", "status", "findings", "file", "when")

    def populate(self, jobs: list[JobSummary]) -> None:
        self.clear()
        for j in jobs:
            self.add_row(
                j.trace_id[:12],
                _status_label(j),
                str(j.finding_count),
                j.source_filename or "(none)",
                _fmt_time(j.created_at),
                key=j.trace_id,
            )

    def action_open_report(self) -> None:
        if self.row_count == 0:
            self.app.bell()
            return
        try:
            row_key = self.coordinate_to_cell_key(self.cursor_coordinate).row_key
        except Exception:  # noqa: BLE001
            return
        tid = row_key.value if row_key is not None else None
        if not tid:
            return
        for j in list_jobs():
            if j.trace_id == tid and j.has_report:
                webbrowser.open(j.report_path.as_uri())
                self.app.notify(f"Opened {tid} in browser")
                return
        self.app.notify("No report for that job", severity="warning")


class JobDetail(Static):
    """Middle pane: details for the currently selected job."""

    def render_job(self, job: JobSummary | None) -> None:
        if job is None:
            self.update("[dim]No job selected.[/dim]")
            return
        when = _fmt_time(job.created_at)
        finished = _fmt_time(job.finished_at) if job.finished_at else "—"
        detectors = ", ".join(job.detectors_run) or "—"
        lines = [
            f"[b]{job.trace_id}[/b]",
            f"status   : {_status_label(job)}",
            f"file     : {job.source_filename or '(none)'}",
            f"created  : {when}",
            f"finished : {finished}",
            f"duration : {job.duration_ms} ms",
            f"findings : {job.finding_count}",
            f"llm_calls: {job.llm_calls}",
            f"detectors: {detectors}",
            f"error    : {job.error or '—'}",
            f"report   : {job.report_path}",
        ]
        self.update("\n".join(lines))


class FindingsTable(DataTable):
    """Right pane: findings of the currently selected job, optionally
    pre-filtered by severity (>= the active FilterState.severity)."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.cursor_type = "row"
        self.zebra_stripes = True
        self.add_columns("sev", "detector", "kind", "title", "location")

    def populate(self, job: JobSummary | None, min_severity: str) -> None:
        self.clear()
        if job is None or not job.has_findings:
            return
        # "all" means show everything; otherwise only show findings
        # at or above the chosen severity.
        threshold = SEVERITY_RANK.get(min_severity, 0) if min_severity != "all" else None
        for f in load_findings(job):
            sev = f.get("severity", "info")
            if threshold is not None and SEVERITY_RANK.get(sev, 99) > threshold:
                continue
            raw = f.get("raw", {}) or {}
            kind = raw.get("kind") or raw.get("check") or ""
            self.add_row(
                sev,
                f.get("detector", "?"),
                str(kind),
                f.get("title", ""),
                f.get("location", ""),
                key=f.get("finding_id", ""),
            )

    def on_data_table_row_highlighted(self, message: DataTable.RowHighlighted) -> None:  # noqa: F821
        if message.row_key is None or message.row_key.value is None:
            return
        fid = message.row_key.value
        job = self.app.selected_job
        if job is None:
            return
        for f in load_findings(job):
            if f.get("finding_id") == fid:
                self.app.show_finding(f)
                return


class FindingDetail(Static):
    """Bottom-right pane: full body of the highlighted finding."""

    def render_finding(self, f: dict | None) -> None:
        if f is None:
            self.update("[dim]Highlight a finding to see its evidence & raw data.[/dim]")
            return
        verdict = f.get("llm_verdict") or ""
        skipped = f.get("llm_skipped", False)
        llm_block = ""
        if verdict:
            llm_block = f"\n[green]LLM review[/green]\n  {verdict}\n"
        elif skipped:
            llm_block = "\n[dim]LLM review skipped (no key or call failed).[/dim]\n"

        raw = f.get("raw", {}) or {}
        raw_repr = json.dumps(raw, ensure_ascii=False, indent=2)
        self.update(
            f"[b]{f.get('title','')}[/b]\n"
            f"  detector: {f.get('detector','')}\n"
            f"  severity: {f.get('severity','')}\n"
            f"  location: {f.get('location','')}\n\n"
            f"[b]evidence[/b]\n  {f.get('evidence','')}\n"
            f"{llm_block}\n"
            f"[b]raw[/b]\n  {raw_repr}"
        )


# ---------- app ----------

class ManuSiftApp(App):
    """The TUI app."""

    CSS = """
    Screen { layout: vertical; }
    #panes { height: 1fr; }
    #pane-jobs    { width: 40%; border: round $primary; }
    #pane-detail  { width: 60%; border: round $primary; }
    DataTable { height: 1fr; }
    JobDetail, FindingDetail { padding: 1 1; height: auto; }
    #filter-row { height: 3; padding: 0 1; }
    #filter-input { width: 1fr; }
    #filter-status { width: auto; padding: 1 2; color: $accent; }
    """

    BINDINGS: ClassVar[list[Binding]] = [
        Binding("q", "quit", "Quit"),
        Binding("ctrl+c", "quit", "Quit", show=False),
        Binding("slash", "focus_filter", "Filter"),
        Binding("s", "cycle_severity", "Severity"),
        Binding("c", "clear_filter", "Clear filter"),
        Binding("r", "reload", "Reload"),
        Binding("tab", "focus_next", "Next pane"),
    ]

    selected_job: reactive[JobSummary | None] = reactive(None)
    filter: reactive[FilterState] = reactive(
        FilterState(),  # default value
        init=False,     # don't fire watch on first assignment
        always_update=True,
    )

    def __init__(self) -> None:
        super().__init__()

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with Horizontal(id="panes"):
            with Horizontal(id="pane-jobs"):
                yield JobsTable(id="jobs")
            with Horizontal(id="pane-detail"):
                yield JobDetail(id="detail")
        with Horizontal(id="panes2"):
            with Horizontal(id="pane-findings"):
                yield FindingsTable(id="findings")
            with Horizontal(id="pane-finding-detail"):
                yield FindingDetail(id="finding-detail")
        with Horizontal(id="filter-row"):
            yield Input(
                placeholder="type to filter jobs (trace_id, file, status, detector)…",
                id="filter-input",
            )
            yield Static("", id="filter-status")
        yield Footer()

    def on_mount(self) -> None:
        self.title = "ManuSift"
        self.sub_title = (
            f"workspace = {get_settings().workspace_dir}    "
            "/=filter  s=severity  c=clear  r=reload  o=open  q=quit"
        )
        # Each App instance must own its own FilterState object.
        # textual's ``reactive(FilterState(), ...)`` evaluates the
        # default *once* at class-definition time, so a query typed
        # into app #1's filter input (which mutates
        # ``self.filter.query``) would otherwise leak into app #2
        # mounted later in the same process (e.g. back-to-back
        # pytest tests). We swap in a fresh FilterState on the
        # next message-pump tick — after the widget tree is up
        # and watch_filter can run safely.
        self.call_later(self._init_filter)

    def _init_filter(self) -> None:
        # Always swap in a fresh FilterState. The class-level
        # default was a single shared object — see the comment in
        # ``on_mount`` for the full diagnosis. Swapping here is
        # safe because the widget tree is fully mounted and the
        # watch_filter callback can run normally.
        self.filter = FilterState()
        # Proceed with the normal first refresh.
        self._refresh_jobs()
        self.query_one("#filter-status", Static).update(
            self.filter.description()
        )

    # ---- actions ----

    def action_focus_filter(self) -> None:
        self.query_one("#filter-input", Input).focus()

    def action_cycle_severity(self) -> None:
        # Replace the FilterState so watch_filter fires; copy current
        # query into the new object so we don't lose it.
        new = FilterState()
        new.query = self.filter.query
        new.severity = self.filter.severity
        new.cycle_severity()
        self.filter = new  # watch_filter will refresh jobs + findings + status

    def action_clear_filter(self) -> None:
        self.query_one("#filter-input", Input).value = ""
        # Assigning a new FilterState triggers watch_filter, which
        # refreshes everything in one place.
        self.filter = FilterState()

    def action_reload(self) -> None:
        self._refresh_jobs()
        self.notify("Reloaded from disk")

    def action_focus_next(self) -> None:
        # Cycle focus: jobs -> findings -> jobs.
        focused = self.focused
        if focused is None or focused.id == "jobs":
            self.query_one("#findings", FindingsTable).focus()
        else:
            self.query_one("#jobs", JobsTable).focus()

    # ---- filter input wiring ----

    def on_input_changed(self, message: Input.Changed) -> None:  # noqa: F821
        if message.input.id != "filter-input":
            return
        self.filter.query = message.value
        # Re-populate jobs (live filter). The findings list will
        # refresh on selection or on severity cycle.
        self._refresh_jobs()
        self.query_one("#filter-status", Static).update(
            self.filter.description()
        )

    def on_input_submitted(self, message: Input.Submitted) -> None:  # noqa: F821
        if message.input.id != "filter-input":
            return
        # Return focus to the jobs table for keyboard navigation.
        self.query_one("#jobs", JobsTable).focus()

    # ---- selection wiring ----

    def on_data_table_row_highlighted(  # noqa: F821
        self, message: DataTable.RowHighlighted
    ) -> None:
        if message.control.id != "jobs":
            return
        if message.row_key is None or message.row_key.value is None:
            return
        tid = message.row_key.value
        for j in list_jobs():
            if j.trace_id == tid:
                self.selected_job = j
                return

    def watch_selected_job(self, job: JobSummary | None) -> None:
        self.query_one("#detail", JobDetail).render_job(job)
        self.query_one("#findings", FindingsTable).populate(
            job, self.filter.severity
        )
        self.query_one("#finding-detail", FindingDetail).render_finding(None)

    def watch_filter(self, _new: FilterState) -> None:
        """When the filter object is replaced (clear, action_*), refresh
        both panes — the jobs list (filtered) AND the findings table
        (severity-filtered) for the currently selected job."""
        self._refresh_jobs()
        # Re-populate findings so the severity change shows up.
        self.query_one("#findings", FindingsTable).populate(
            self.selected_job, self.filter.severity
        )
        self.query_one("#filter-status", Static).update(
            self.filter.description()
        )

    def show_finding(self, f: dict | None) -> None:
        self.query_one("#finding-detail", FindingDetail).render_finding(f)

    # ---- helpers ----

    def _refresh_jobs(self) -> None:
        filt = self.filter
        all_jobs = list_jobs()
        visible = [j for j in all_jobs if _passes_filter(j, filt)]
        self.query_one("#jobs", JobsTable).populate(visible)
        # Update the sub-title so the user sees the filter status.
        total = len(all_jobs)
        shown = len(visible)
        suffix = f"  |  filter: {filt.description()}  |  {shown}/{total} jobs" if filt.query or filt.severity != "all" else f"  |  {total} jobs"
        self.sub_title = (
            f"workspace = {get_settings().workspace_dir}{suffix}"
        )
        # If the previously selected job is no longer visible, clear.
        if self.selected_job and not _passes_filter(self.selected_job, filt):
            self.selected_job = None


# ---------- formatting helpers ----------

def _fmt_time(ts: float | None) -> str:
    if not ts:
        return "—"
    import datetime as _dt
    return _dt.datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")


def _status_label(job: JobSummary) -> str:
    s = job.status
    if s == "done":
        return f"[green]{s}[/green]"
    if s == "failed":
        return f"[red]{s}[/red]"
    if s == "running":
        return f"[yellow]{s}[/yellow]"
    return f"[dim]{s}[/dim]"


def main() -> int:
    ManuSiftApp().run()
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
