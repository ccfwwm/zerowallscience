"""End-to-end pipeline: ingest -> detectors -> LLM enrich -> report.

The pipeline is a single function that takes a workspace path + a PDF
path, runs every stage, writes artifacts, and returns an
``AnalysisResult``. It is called from a FastAPI BackgroundTask.

Detector steps after PDF parse are **independent** (each receives the
same read-oriented ``ParsedDoc``). By default they run on a thread pool
(``MANUSIFT_DETECTOR_WORKERS``, default 4; set to 1 for serial).
"""
from __future__ import annotations

import json
import os
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Type

from .checkpoint import read_step_silent, write_step
from .config import get_settings
from .contracts import AnalysisResult, Finding, JobState, ParsedDoc
from .detectors import (
    DetectorResult,
    detector_name_for_class,
    iter_entrypoint_detectors,
    load_detector_class,
)
from .events import Event, get_bus
from .llm import get_llm_client
from .report.builder import build_report_html
from .trace import get_logger
from .workspace import JobPaths

log = get_logger(__name__)


def _detector_worker_count() -> int:
    """How many detectors may run at once (1 = serial).

    Env ``MANUSIFT_DETECTOR_WORKERS`` wins; else Settings.detector_workers;
    else 4. Values < 1 clamp to 1.
    """
    raw = (os.environ.get("MANUSIFT_DETECTOR_WORKERS") or "").strip()
    if raw:
        try:
            return max(1, int(raw))
        except ValueError:
            pass
    try:
        n = int(getattr(get_settings(), "detector_workers", 4) or 4)
    except Exception:  # noqa: BLE001
        n = 4
    return max(1, n)


def _run_detector_body(cls: Type[Any], doc: ParsedDoc) -> DetectorResult:
    """Execute one detector; isolate crashes. Thread-safe if ``doc`` is R/O."""
    name = cls.name
    t0 = time.time()
    try:
        res = cls().run(doc)
    except Exception as exc:  # noqa: BLE001 — isolation is the point
        log.exception("detector crashed", extra={"detector": name})
        crashed = Finding.make(
            trace_id=doc.trace_id,
            detector=name,
            severity="info",
            title=f"{name} crashed",
            evidence=(
                f"Detector raised: {type(exc).__name__}: {exc}"
            ),
            location="(pipeline)",
            raw={"exception": repr(exc)},
        )
        return DetectorResult(
            detector=name,
            ok=False,
            findings=[crashed],
            error=f"{type(exc).__name__}: {exc}",
            duration_ms=int((time.time() - t0) * 1000),
        )
    return DetectorResult(
        detector=res.detector,
        ok=res.ok,
        findings=res.findings,
        error=res.error,
        duration_ms=int((time.time() - t0) * 1000) or res.duration_ms,
    )


def _parse_pdf(pdf_path: Path, trace_id: str, workspace_dir: Path):
    from .ingest.pdf import parse_pdf

    return parse_pdf(
        pdf_path,
        trace_id=trace_id,
        workspace_dir=workspace_dir,
    )


def _enrich_with_llm(findings: list[Finding]) -> int:
    """Enrich high/medium findings (templates + cluster + batch).

    See :mod:`manusift.llm.enrichment` for modes:
    ``cluster_batch`` (default), ``cap``, ``off``.

    Returns number of LLM API units (batches or 1:1 calls). Mock client
    short-circuits with 0. ``llm_max_concurrency=0`` (CLI ``--no-llm``)
    skips client construction entirely so third-party installs without
    API keys never touch the LLM factory. Eligible findings (high/medium)
    are marked ``llm_skipped=True`` so downstream consumers know the
    enrichment was intentionally omitted.
    """
    from .llm.enrichment import enrich_findings

    settings = get_settings()
    max_concurrency = int(settings.llm_max_concurrency)
    if max_concurrency <= 0:
        # Mark eligible findings as skipped (no LLM call made).
        for f in findings:
            if f.severity in ("high", "medium"):
                object.__setattr__(f, "llm_skipped", True)
        return 0
    client = get_llm_client()
    return enrich_findings(
        findings,
        client,
        max_concurrency=max_concurrency,
        budget_seconds=float(settings.llm_enrichment_budget_seconds),
        per_call_timeout=float(settings.llm_call_timeout_seconds),
    )


def _persist_findings(paths: JobPaths, result: AnalysisResult) -> None:
    payload = {
        "trace_id": result.trace_id,
        "detectors_run": result.detectors_run,
        "llm_calls": result.llm_calls,
        "duration_ms": result.duration_ms,
        "findings": [f.__dict__ for f in result.findings],
    }
    paths.findings_json.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _persist_job_state(paths: JobPaths, state: JobState) -> None:
    paths.job_json.write_text(
        json.dumps(state.__dict__, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# Detector list — the source of truth for both the pipeline and
# the web layer's /progress endpoint. The web layer imports
# ``detector_names_for_progress`` to avoid a circular import
# (pipeline -> web) and the test/UI drift this comment warns
# about. The built-in detectors come first; third-party
# detectors registered as entry points (Step H4) are appended
# in the order returned by ``iter_entrypoint_detectors``.
_BUILTIN_DETECTOR_CLASS_NAMES: list[str] = [
    "MetadataDetector",
    # R-2026-06-15 (Phase 3, real-case benchmark): the
    # ``PdfMetadataDetector`` is now first in the
    # list so it runs on every case. Previously
    # it was missing from this list entirely,
    # which is why the gap report's "expected
    # but zero findings" list included
    # ``pdf_metadata``. The detector code in
    # ``manusift/detectors/pdf_metadata.py`` was
    # complete; the bug was that the offline
    # pipeline never instantiates it. This is a
    # 1-line fix: just add the class name here.
    "PdfMetadataDetector",
    # R-2026-06-15 (Phase 3, real-case benchmark):
    # the supplementary-data detector is now
    # in the offline pipeline. Previously it
    # was missing; the gap report notes that
    # "this detector reads XLSX/CSV companion
    # files, which are not in the PDF. With
    # only the PDF, the detector has nothing to
    # do." -- but the detector also reads the
    # data-availability section of the paper
    # to surface a "raw data unavailable"
    # structural finding (P2-D3 below). With
    # the PDF-only case, it can at least fire
    # the "no data availability statement"
    # finding.
    "SupplementaryFileDetector",
    # R-2026-06-15 (Phase 3, real-case benchmark):
    # the author-emails / non-academic-email
    # detector is now in the offline pipeline.
    # It looks for ``@gmail.com`` /
    # ``@yahoo.com`` / ``@hotmail.com`` in the
    # author affiliation block (a paper-mill
    # red flag per the "Hindawi 511-paper
    # paper-mill" 2023 retraction). Closes the
    # ``author_emails`` gap.
    "AuthorEmailAnalyzer",
    # R-2026-06-15 (Phase 3, real-case benchmark):
    # the data-availability / compliance
    # detector is now in the offline pipeline.
    # Closes the ``compliance`` gap (the
    # detector reads the data-availability
    # statement for red-flag phrasing like
    # "available upon reasonable request").
    "ComplianceStatementDetector",
    # R-2026-06-15 (Phase 3, real-case benchmark):
    # the image SIFT keypoint copymove detector
    # is now in the offline pipeline. Closes
    # the ``image_sift_copymove`` gap (Frontiers
    # figures often lack enough SIFT keypoints
    # but the detector still fires on bar
    # charts with axis ticks).
    "SiftCopyMoveDetector",
    # R-2026-06-15 (Phase 3, real-case benchmark):
    # the duplicate-reference detector is now
    # in the offline pipeline. Closes the
    # ``ref_duplicate`` gap. Note: ref_duplicate
    # catches "the same paper cited twice with
    # different DOIs" (a paper-mill red flag
    # where 2+ authors recycle one reference).
    "DuplicateReferenceDetector",
    # R-2026-06-15 (Phase 3, real-case benchmark):
    # the reference-format anomaly detector is
    # now in the offline pipeline. Closes the
    # ``ref_format_anomaly`` gap.
    "ReferenceFormatAnomalyDetector",
    # R-2026-06-15 (Phase 3, real-case benchmark):
    # the GRIM (granularity-related inconsistency
    # of means) statistical detector is now
    # in the offline pipeline. Closes the
    # ``stat_grim`` gap. The detector reads
    # table-extracted values and runs the GRIM
    # test on every percentage. It can ALSO
    # be run on figure OCR text (figure_stat_text
    # writes the OCR-pass results to the
    # shared evidence store, so stat_grim
    # picks them up after). Phase 3 wired
    # figure_stat_text's output into stat_grim's
    # input.
    "GrimTestDetector",
    # R-2026-06-15 (Phase 3, real-case benchmark):
    # the p-value consistency detector. Closes
    # the ``stat_pvalue`` gap.
    "PValueConsistencyDetector",
    # P6.2 PubPeer stats: p-pile-up, SPRITE-lite (gated), corr PSD
    "PValuePileupDetector",
    "SpriteLiteDetector",
    "CorrelationMatrixPSDDetector",
    # R-2026-06-15 (Phase 3, real-case benchmark):
    # the percent-divisibility detector. Closes
    # the ``stat_percent`` gap.
    "PercentDivisibilityDetector",
    "TableRelationshipDetector",
    # B+C product: tabular forgery suite in offline pipeline
    # (was agent-only; batch CLI must run these without chat).
    "BenfordDetector",
    "DuplicateRowDetector",
    "NearDuplicateRowDetector",
    "CrossTableCopyDetector",
    "OutlierDetector",
    "RoundBiasDetector",
    "TableFileMetadataDetector",
    # P0 deep-screen: author highlighter fills → focused table checks
    "TableHighlightFocusDetector",
    # P4b / 2026-07: PDF table numbers ↔ companion Source Data
    # (xlsx/csv SI). No-op when materials/ is empty; runs SI
    # fig-key alignment when Source_Data_Fig*.xlsx is present.
    "SourceDataConsistencyDetector",
    # R-2026-06-15 (Phase 3, real-case benchmark):
    # the noise-inconsistency detector (catches
    # images where the noise floor is different
    # across regions, a sign of stitching
    # panels from different sources). Closes
    # the ``image_noise_inconsistency`` gap.
    "NoiseInconsistencyDetector",
    # R-2026-06-15 (Phase 3, real-case benchmark):
    # the panel-segmentation detector. Closes
    # the ``panel_duplicate`` gap. (Note: the
    # detector is named ``PanelSegmentationDetector``
    # in the registry but publishes under
    # ``panel_duplicate``; this is the
    # detector that finds "this paper has
    # 1 panel that is identical to another
    # panel in the same paper".)
    "PanelSegmentationDetector",
    # R-2026-06-13: AI-generated-figure detector runs early (after
        # metadata) so the AI-tool fingerprint and prompt-token probes
        # have the /Info + XMP in hand before the heavier image
        # detectors run. Closes the case_011 (Frontiers AI-figure
        # retraction) gap; aligned with the P0-AI patch.
        "AIGeneratedFigureDetector",
    # R-2026-06-13: paper-mill / peer-review authorship-signal
        # detector. Pure text matching on the byline; closes the
        # case_032 (Frontiers 122-paper peer-review network) gap;
        # aligned with the P0-PEER patch.
        "PaperMillAuthorshipDetector",
        "ImageDuplicateDetector",
        "CrossPaperImageDetector",
    "ImageForensicsDetector",
    "TextPatternDetector",
    # 2026-07 (fraud_web_v1): run the two cheap text
    # detectors that caught real paper-mill signals the
    # pipeline was missing -- tortured phrases
    # (web_sci_01) and non-standard template headings
    # (web_plos_02 / web_sci_01). Both are pure text
    # scans and run right after TextPatternDetector.
    "TorturedPhrasesDetector",
    "PaperMillTemplateDetector",
    # R-2026-06-12: data-availability-concern detector reads
        # the paper's data-availability section for red-flag
        # phrasing (e.g. "raw data are not available",
        # "available upon reasonable request"). Pure text
        # classification, no LLM. Inserted after the offline
        # detectors because it only needs the parsed text.
    "DataAvailabilityConcernDetector",
    # R-2026-06-12: page-raster duplicate detector renders
    # every page to a bitmap and hashes the figure
    # regions. This catches image-duplication in Frontiers
    # and other modern-PDF papers where figures are
    # embedded as vector drawings (not raster images) and
    # the existing image_dup detector sees 0 candidates.
    # Slow-ish (~50-200ms per page) so it runs after the
    # pure-text detectors.
    "PageRasterDuplicateDetector",
    # R-2026-06-12: panel-duplicate detector splits each
    # figure region into constituent panels using
    # whitespace-gap detection, then hashes each panel
    # independently. This catches panel-level duplications
    # (e.g. Figure 1A == Figure 1B) that the whole-figure
    # hash misses. Closes the case_005 Frontiers gap.
    "PanelDuplicateDetector",
    # R-2026-06-12: figure-body stat-text detector runs
    # EasyOCR on each figure region and emits findings
    # for recognised text fragments that look like
    # statistical descriptors (n=, p<0.05, mean+/-SD,
    # percentages, significance markers). Slow (~5-30s
    # per case) so it runs last among the local
    # detectors. Provides the evidence base for the
    # case_004 "sample size" not_testable target.
    "FigureStatTextDetector",
    # R-2026-06-12: figure-body GRIM consistency detector
    # reuses the same OCR pass as figure_stat_text and
    # GRIM-checks every recognised percentage in the
    # figure body. A GRIM-inconsistent percentage cannot
    # be reconciled with a wide range of plausible sample
    # sizes (N in [3, 100]). Closes the case_004 "sample
    # size" and "data interpretation" not_testable targets.
    "FigureGRIMDetector",
    # P4 (2026-07-18, figure_text_v1 synthetic
    # benchmark): chart bar extractor and the
    # figure-text vs table cross-check join the
    # offline pipeline. Both are local-only
    # (OpenCV bar geometry / pure text+table
    # comparison, no OCR model, no network), so
    # they run right after the figure stat
    # detectors. chart_data_extract is a
    # low-severity extraction signal;
    # figure_table_consistency gained an
    # explicit-pair strong-evidence path
    # (PCT_TOLERANCE / HIGH_MIN_GAP in
    # figure_table_consistency.py). The chart
    # extractor can be turned off via
    # ``MANUSIFT_CHART_EXTRACT_ENABLED=0``.
    "ChartDataExtractorDetector",
    "FigureTextCrossCheckDetector",
    # 2026-07-18: forest-plot rule pipeline
    # (CI order/asymmetry checks + null-line
    # geometry cross-validation). Can be
    # turned off via
    # ``MANUSIFT_FOREST_PLOT_ENABLED=0``.
    "ForestPlotDetector",
    # P2-D1 — the Crossref citation-network
    # detector runs last because it is the
    # only network-dependent step. Putting it
    # after the offline detectors means a
    # Crossref outage cannot delay the local
    # checks. The operator can opt out via
    # ``MANUSIFT_CROSSREF_ENABLED=0``.
    "CitationNetworkDetector",
    # P2.2 — the OpenAlex cited-retraction
    # detector is the second network-dependent
    # step. It is opt-IN
    # (``MANUSIFT_OPENALEX_ENABLED=1``, default
    # off) so eval runs stay fully offline; when
    # enabled it runs next to the Crossref step
    # for the same outage-isolation reason.
    "CitedRetractionDetector",
]


# Registry vs pipeline vs agent-only: see docs/DETECTOR_LAYERS.md.
# PIPELINE_EXCLUDED makes every intentional offline exclusion
# explicit; tests/test_pipeline_detector_coverage.py hard-fails if a
# registry class is neither in the pipeline list nor documented here.
#
#   key: registry class name; value: why it does not run offline
#   (and where the capability lives instead).
PIPELINE_EXCLUDED: dict[str, str] = {
    "AHashDetector": (
        "Agent-only single-algo probe (imagehash_dup). Primary path is "
        "image_dup multi-pass (pHash+aHash/dHash+geo+region+LC). "
        "Do not extend imagehash_dup — extend image_dup. "
        "See docs/DETECTOR_LAYERS.md."
    ),
    "DHashDetector": (
        "Agent-only single-algo probe; covered by image_dup secondary. "
        "See docs/DETECTOR_LAYERS.md."
    ),
    "PHashDetector": (
        "Agent-only single-algo probe; covered by image_dup primary. "
        "See docs/DETECTOR_LAYERS.md."
    ),
    "WHashDetector": (
        "Agent-only wavelet hash probe; not in image_dup multi-pass "
        "(cost). Call on demand only. See docs/DETECTOR_LAYERS.md."
    ),
    "SsimDuplicateDetector": (
        "Agent-only whole-image SSIM. Overlaps image_forensics / "
        "panel_duplicate panel SSIM; no benchmark lift for pipeline. "
        "See docs/DETECTOR_LAYERS.md."
    ),
    "ImageStatisticsDetector": (
        "Agent-only global image-statistics probe. "
        "See docs/DETECTOR_LAYERS.md."
    ),
    "FigureTableOCRDetector": (
        "Heavy OCR; off in eval (MANUSIFT_FIGURE_TABLE_OCR=0). "
        "Enable explicitly for scanned-table papers."
    ),
    "TableForensicsDetector": (
        "Agent-only orchestrator that re-runs pipeline table detectors "
        "(benford, dup rows, relationships, …) + risk summary. "
        "Would double-report if added to offline pipeline. "
        "See docs/DETECTOR_LAYERS.md."
    ),
}


def _pipeline_detector_classes() -> list[type]:
    """Return the built-in detector classes followed by any
    third-party detectors registered as entry points. The
    entry-point look-up is done lazily (every call) so a
    plugin installed *during* the process lifetime is picked
    up on the next pipeline run.

    Honors the ``benchmark_skip_detectors`` settings field:
    a comma-separated list of detector names that the
    pipeline should skip. Used by benchmark / eval runners
    that do not need slow OCR or Crossref calls. The skip
    list is NOT applied to the agent-loop tool registry (LLM-
    visible detectors) -- only to the offline pipeline.
    """
    try:
        from .config import get_settings
        skip = {
            s.strip() for s in (
                get_settings().benchmark_skip_detectors or ""
            ).split(",") if s.strip()
        }
    except Exception:  # noqa: BLE001
        skip = set()

    out: list[type] = []
    for class_name in _BUILTIN_DETECTOR_CLASS_NAMES:
        det_name = detector_name_for_class(class_name)
        if det_name in skip:
            continue
        out.append(load_detector_class(class_name))
    for plugin in iter_entrypoint_detectors():
        plugin_name = getattr(plugin, "name", None)
        if plugin_name in skip:
            continue
        out.append(type(plugin))
    return out


def detector_names_for_progress() -> list[str]:
    """Return the ordered list of detector names the pipeline
    runs. The web layer's /progress endpoint uses this so the
    'total_steps' field is consistent with the actual detector
    list. Always equal to ``[d().name for d in _pipeline_detector_classes()]``
    but does not require a Settings instance."""
    names = [
        detector_name_for_class(class_name)
        for class_name in _BUILTIN_DETECTOR_CLASS_NAMES
    ]
    for plugin in iter_entrypoint_detectors():
        names.append(plugin.name)
    return names


def run_pipeline(
    pdf_path: Path,
    paths: JobPaths,
    job_state: JobState,
    on_step_complete: Callable[[DetectorResult, JobState], None] | None = None,
) -> AnalysisResult:
    """Execute the full analysis. Side-effects: writes the job
    artifacts under ``paths`` (output/job.json, output/findings.json,
    output/report.html, steps/NN_*.json) and mutates ``job_state``
    in place.

    ``on_step_complete`` is an optional hook called immediately
    after each detector step finishes and its checkpoint has been
    written. The web layer uses it to update the in-memory job
    registry so the progress endpoint can answer without
    re-reading the steps/ directory. Errors raised by the hook
    are swallowed — progress is a UI nicety, not a critical
    signal, and the pipeline must not abort because of it.
    """
    settings = get_settings()
    t0 = time.time()

    log.info("pipeline start", extra={"pdf": str(pdf_path)})
    # R-2026-06-13: emit job.started is done below, after the
    # detector class list is known, so the payload includes the
    # real ``detector_count`` for the TUI's progress bar.
    job_state.status = "running"
    _persist_job_state(paths, job_state)
    # R-2026-06-13: pre-compute the detector list once so the
    # ``job.started`` event can include the total detector count.
    # This is what the TUI's DetectorTraceBlock uses to render a
    # count-based progress bar (``12/38 done``) instead of an
    # indeterminate spinner.
    try:
        _detector_classes = _pipeline_detector_classes()
    except Exception:  # noqa: BLE001
        # Fallback to a tiny list -- the loop body will re-resolve
        # and the trace will just show 0/total.
        _detector_classes = []
    _detector_total = len(_detector_classes)
    # R-2026-06-13: pre-compute the detector list once so the
    # ``job.started`` event can include the total detector count.
    # This is what the TUI's DetectorTraceBlock uses to render a
    # count-based progress bar (``12/38 done``) instead of an
    # indeterminate spinner.
    # R-2026-06-13: subscribe a DetectorTraceListener on the
    # bus for the duration of this run. The listener builds an
    # in-memory DetectorTrace that the TUI's DetectorTraceBlock
    # widget subscribes to via the same listener pattern. The
    # trace is also written to ``detector_summary.json`` at the
    # end of the run (after the loop body). We always
    # unsubscribe in a finally block so a crashed pipeline does
    # not leave a dangling listener on the bus.
    from .detector_trace import (
        DetectorTrace,
        DetectorTraceListener,
        write_summary,
    )
    _det_trace = DetectorTrace(
        trace_id=job_state.trace_id, total=_detector_total
    )
    _det_listener = DetectorTraceListener(_det_trace)
    get_bus().subscribe(_det_listener)
    # The job.started event below is re-emitted below with the
    # total count. We use a one-shot variable to skip the
    # re-emission if the original emit was deferred to here.
    _job_started_emitted = False
    if _detector_total:
        try:
            get_bus().emit(Event(
                "job.started",
                {
                    "trace_id": job_state.trace_id,
                    "filename": pdf_path.name,
                    "detector_count": _detector_total,
                },
            ))
            _job_started_emitted = True
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "job.started event emission failed",
                extra={"err": str(exc)},
            )

    try:
        doc = _parse_pdf(
            pdf_path,
            trace_id=job_state.trace_id,
            workspace_dir=paths.root.parent,
        )

        # P6.3: pull figures from companion SI PDFs in materials/
        try:
            from .ingest.companion_pdf import merge_companion_pdf_images

            doc = merge_companion_pdf_images(doc, paths)
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "companion SI image merge failed",
                extra={"err": str(exc)},
            )

        # Checkpoint-aware detector loop (serial or threaded).
        #
        # Each detector is independent on a shared read-oriented
        # ParsedDoc. Workers > 1 use ThreadPoolExecutor for run();
        # skip/cache handling stays on the main thread; step writes
        # and bus events are serialized under a lock. Final results
        # are ordered by pipeline index for deterministic findings.
        from .detector_trace import (
            emit_done,
            emit_error,
            emit_skipped,
            emit_started,
            should_skip_detector,
        )

        n_workers = _detector_worker_count()
        log.info(
            "detector concurrency",
            extra={"workers": n_workers, "detectors": len(_detector_classes)},
        )

        results_by_idx: dict[int, DetectorResult] = {}
        names_by_idx: dict[int, str] = {}
        to_run: list[tuple[int, Type[Any], str, Path]] = []
        side_lock = threading.Lock()

        def _persist_and_notify(
            idx: int,
            name: str,
            step_file: Path,
            res: DetectorResult,
            *,
            skipped: bool = False,
            skip_reason: str | None = None,
            cached: bool = False,
        ) -> None:
            try:
                write_step(step_file, res)
            except OSError as exc:  # pragma: no cover
                log.warning(
                    "could not write step file",
                    extra={"path": str(step_file), "err": str(exc)},
                )
            results_by_idx[idx] = res
            names_by_idx[idx] = name
            payload: dict[str, Any] = {
                "trace_id": job_state.trace_id,
                "detector": name,
                "ok": res.ok,
                "duration_ms": res.duration_ms,
                "findings_count": len(res.findings),
            }
            if skipped:
                payload["skipped"] = True
                payload["skip_reason"] = skip_reason
            if cached:
                payload["cached"] = True
            try:
                get_bus().emit(Event("job.step_completed", payload))
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "job.step_completed event emission failed",
                    extra={"err": str(exc)},
                )
            if on_step_complete is not None:
                try:
                    on_step_complete(res, job_state)
                except Exception as exc:  # noqa: BLE001
                    log.warning(
                        "on_step_complete hook raised",
                        extra={"err": str(exc)},
                    )

        for idx, cls in enumerate(_detector_classes):
            name = cls.name
            step_file = paths.step_path(idx, name)
            _is_builtin = cls.__name__ in _BUILTIN_DETECTOR_CLASS_NAMES
            skip_it, skip_reason = should_skip_detector(
                name, doc, is_builtin=_is_builtin
            )
            if skip_it:
                try:
                    emit_skipped(job_state.trace_id, name, skip_reason)
                except Exception:  # noqa: BLE001
                    pass
                res = DetectorResult(
                    detector=name, ok=True, findings=[], duration_ms=0
                )
                _persist_and_notify(
                    idx, name, step_file, res, skipped=True, skip_reason=skip_reason
                )
                continue
            cached_res = (
                read_step_silent(step_file) if step_file.exists() else None
            )
            if cached_res is not None and cached_res.ok:
                log.info(
                    "detector step cached; skipping rerun",
                    extra={"detector": name, "step": str(step_file.name)},
                )
                try:
                    emit_started(job_state.trace_id, name)
                    emit_done(
                        job_state.trace_id,
                        name,
                        int(getattr(cached_res, "duration_ms", 0) or 0),
                        len(cached_res.findings),
                    )
                except Exception:  # noqa: BLE001
                    pass
                _persist_and_notify(
                    idx, name, step_file, cached_res, cached=True
                )
                continue
            to_run.append((idx, cls, name, step_file))

        def _execute_one(
            item: tuple[int, Type[Any], str, Path],
        ) -> tuple[int, str, Path, DetectorResult]:
            idx, cls, name, step_file = item
            with side_lock:
                try:
                    emit_started(job_state.trace_id, name)
                except Exception:  # noqa: BLE001
                    pass
            res = _run_detector_body(cls, doc)
            with side_lock:
                if not res.ok and res.error:
                    try:
                        emit_error(
                            job_state.trace_id,
                            name,
                            res.error or "",
                            int(res.duration_ms or 0),
                        )
                    except Exception:  # noqa: BLE001
                        pass
                else:
                    try:
                        emit_done(
                            job_state.trace_id,
                            name,
                            int(res.duration_ms or 0),
                            len(res.findings),
                        )
                    except Exception:  # noqa: BLE001
                        pass
            return idx, name, step_file, res

        if to_run:
            if n_workers <= 1 or len(to_run) == 1:
                for item in to_run:
                    idx, name, step_file, res = _execute_one(item)
                    with side_lock:
                        _persist_and_notify(idx, name, step_file, res)
            else:
                workers = min(n_workers, len(to_run))
                with ThreadPoolExecutor(max_workers=workers) as pool:
                    futs = {
                        pool.submit(_execute_one, item): item[0]
                        for item in to_run
                    }
                    for fut in as_completed(futs):
                        try:
                            idx, name, step_file, res = fut.result()
                        except Exception as exc:  # noqa: BLE001
                            # Should be rare — body already isolates
                            i = futs[fut]
                            name = _detector_classes[i]().name
                            step_file = paths.step_path(i, name)
                            res = DetectorResult(
                                detector=name,
                                ok=False,
                                findings=[],
                                error=repr(exc),
                                duration_ms=0,
                            )
                            idx = i
                        with side_lock:
                            _persist_and_notify(idx, name, step_file, res)

        # Deterministic order = pipeline registration order
        detectors_run = [
            names_by_idx[i]
            for i in sorted(names_by_idx)
        ]
        results = [results_by_idx[i] for i in sorted(results_by_idx)]

        # Flatten DetectorResult envelopes into the list of Finding
        # objects the rest of the pipeline + report builder expects.
        findings: list[Finding] = []
        for r in results:
            findings.extend(r.findings)
        if any(not r.ok for r in results):
            failed = [r.detector for r in results if not r.ok]
            log.warning(
                "some detectors failed",
                extra={"failed": failed, "results": len(results)},
            )

        # P6.3: append this paper's figure pHashes to the local index
        # so later screens can detect cross-paper reuse.
        try:
            if (os.environ.get("MANUSIFT_FINGERPRINT_AUTO_INDEX") or "1").strip().lower() not in {
                "0",
                "false",
                "off",
                "no",
            }:
                from .knowledge.fingerprint_index import index_paper_images

                # Same resolver as cross_paper_image (avoid "original" stem).
                try:
                    from .detectors.cross_paper_image import (
                        _paper_id as _fp_paper_id,
                    )

                    paper_key = _fp_paper_id(doc) or job_state.trace_id
                except Exception:  # noqa: BLE001
                    paper_key = (
                        str((doc.metadata or {}).get("doi") or "")
                        or Path(doc.source_path).stem
                        or job_state.trace_id
                    )
                if str(paper_key).strip().lower() in {
                    "original",
                    "paper",
                    "main",
                    "",
                }:
                    paper_key = job_state.trace_id
                n_idx = index_paper_images(
                    paper_id=paper_key,
                    images=doc.images,
                    source="main",
                    path=None,
                )
                log.info(
                    "fingerprint index updated",
                    extra={"paper_id": paper_key, "n": n_idx},
                )
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "fingerprint auto-index failed",
                extra={"err": str(exc)},
            )

        # P0: severity recalibration + pair-cluster demotion (no drops).
        try:
            from .report.finding_calibration import (
                calibrate_findings,
                calibration_stats,
            )

            # P1.3: first-page text gives the whitelist layer a shot at
            # resolving the document publisher from the DOI (PDF metadata
            # rarely carries one).
            _front_text = "\n".join(
                b.text for b in doc.text_blocks if b.page < 2
            )
            findings = calibrate_findings(
                findings,
                metadata=doc.metadata,
                text=_front_text,
            )
            log.info(
                "finding calibration",
                extra=calibration_stats(findings),
            )
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "finding calibration failed",
                extra={"err": str(exc)},
            )

        # P1.1: aggregate findings into issues (view only — the flat
        # findings list is untouched and every finding is kept). Failure
        # here must never break the pipeline.
        issues: list = []
        try:
            from .report.finding_aggregation import aggregate_findings

            issues = aggregate_findings(findings)
            log.info(
                "finding aggregation",
                extra={"issues": len(issues), "findings": len(findings)},
            )
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "finding aggregation failed",
                extra={"err": str(exc)},
            )

        # P1.2: LLM adjudication — second-pass verdicts on high issues,
        # between aggregation and enrichment. ``explainable`` issues are
        # demoted high→medium (never dropped). Off by default; failures
        # must never break the pipeline.
        try:
            from .llm.adjudication import adjudicate_issues

            adj_findings, adj_issues = adjudicate_issues(findings, issues)
            if adj_findings is not findings:
                findings = adj_findings
                issues = adj_issues
                log.info(
                    "llm adjudication applied",
                    extra={"issues": len(issues), "findings": len(findings)},
                )
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "llm adjudication failed",
                extra={"err": str(exc)},
            )

        # Persist issues.json once (after aggregation + adjudication)
        # to avoid redundant serialization when adjudication rewrites.
        if issues:
            try:
                paths.issues_json.write_text(
                    json.dumps(
                        {
                            "trace_id": job_state.trace_id,
                            "schema": "manusift.issues.v1",
                            "issue_count": len(issues),
                            "finding_count": len(findings),
                            "issues": [i.to_dict() for i in issues],
                        },
                        ensure_ascii=False,
                        indent=2,
                    ),
                    encoding="utf-8",
                )
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "issues.json write failed",
                    extra={"err": str(exc)},
                )

        llm_calls = _enrich_with_llm(findings)

        # R-2026-06-13: build the detector summary from the
        # in-memory trace (same data the TUI's
        # DetectorTraceBlock consumes) and pass it to the
        # report builder. The builder renders it as the
        # ``Detector summary`` block at the top of the
        # report. If the trace is empty (legacy / non-
        # detector callers), the block is omitted -- the
        # meta line still lists the detector names.
        try:
            detector_summary_dict = _det_trace.to_summary()
        except Exception:  # noqa: BLE001
            detector_summary_dict = {}

        html = build_report_html(
            trace_id=job_state.trace_id,
            findings=findings,
            detectors_run=detectors_run,
            llm_calls=llm_calls,
            settings=settings,
            detector_summary=detector_summary_dict,
        )
        paths.report_html.write_text(html, encoding="utf-8")

        # Standalone LLM interpretation report (separate from detector report).
        try:
            from .report.llm_report import write_llm_reports

            lang = settings.report_language or "zh"
            write_llm_reports(
                root_dir=paths.output_dir,
                trace_id=job_state.trace_id,
                findings=findings,
                llm_calls=llm_calls,
                language=str(lang),
            )
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "llm_report write failed",
                extra={"err": str(exc)},
            )

        duration_ms = int((time.time() - t0) * 1000)
        result = AnalysisResult(
            trace_id=job_state.trace_id,
            findings=findings,
            detectors_run=detectors_run,
            llm_calls=llm_calls,
            duration_ms=duration_ms,
        )
        _persist_findings(paths, result)

        job_state.status = "done"
        job_state.finished_at = time.time()
        job_state.detectors_run = detectors_run
        job_state.finding_count = len(findings)
        job_state.duration_ms = duration_ms
        _persist_job_state(paths, job_state)

        log.info(
            "pipeline done",
            extra={"findings": len(findings), "ms": duration_ms},
        )
        # E3: emit job.completed. A
        # webhook consumer that just
        # listens for this event can
        # skip the per-step events and
        # be notified when the job is
        # fully done.
        try:
            get_bus().emit(Event(
                "job.completed",
                {
                    "trace_id": job_state.trace_id,
                    "total_findings": len(findings),
                    "llm_calls": 0,
                    "duration_ms": duration_ms,
                },
            ))
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "job.completed event emission failed",
                extra={"err": str(exc)},
            )
        # R-2026-06-13: write the detector-trace summary to disk
        # AND unsubscribe the listener. The summary is what the
        # HTML report loader uses to render the final
        # ``detectors 38/38 done · 5 findings · 7 skipped · 0
        # errors`` block.
        try:
            write_summary(
                paths.output_dir / "detector_summary.json", _det_trace
            )
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "detector_summary.json write failed",
                extra={"err": str(exc)},
            )
        try:
            get_bus().unsubscribe(_det_listener)
        except Exception:  # noqa: BLE001
            pass
        return result

    except Exception as exc:  # noqa: BLE001 — the route needs the error message
        log.exception("pipeline failed")
        job_state.status = "failed"
        job_state.finished_at = time.time()
        job_state.error = f"{type(exc).__name__}: {exc}"
        _persist_job_state(paths, job_state)
        # E3: emit job.failed. A
        # webhook consumer that listens
        # for this event can page the
        # operator. The original
        # exception is preserved on
        # ``error`` so a downstream
        # system can route on the
        # exception type.
        try:
            get_bus().emit(Event(
                "job.failed",
                {
                    "trace_id": job_state.trace_id,
                    "error": str(exc),
                },
            ))
        except Exception as emit_exc:  # noqa: BLE001
            log.warning(
                "job.failed event emission failed",
                extra={"err": str(emit_exc)},
            )
        # R-2026-06-13: even on failure, write a partial detector
        # summary so the report HTML can show what got done
        # before the crash.
        try:
            write_summary(
                paths.output_dir / "detector_summary.json", _det_trace
            )
        except Exception:  # noqa: BLE001
            pass
        try:
            get_bus().unsubscribe(_det_listener)
        except Exception:  # noqa: BLE001
            pass
        raise
