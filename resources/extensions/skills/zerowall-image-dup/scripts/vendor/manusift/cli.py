"""ManuSift product CLI — interactive pi agent + batch screen.

Product shape (2026-07):
  **agent** Interactive integrity-screening agent (pi harness); the
  default when ``manusift`` is run with no arguments.
  **screen** Strong offline batch screening.

Examples::

    manusift                       # launch the pi agent (interactive)
    manusift agent -p "screen C:/papers/paper.pdf"
    manusift screen paper.pdf
    manusift screen paper.pdf --data-paths ./source_data
    manusift screen paper.pdf --suites fast          # light triage only
    manusift screen paper.pdf --no-llm --lang zh
    manusift toolserver --list-tools

Default suite is **deep** (full pipeline). Use ``--suites core`` or
``fast`` only when you explicitly want a lighter pass.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from collections.abc import Sequence
from pathlib import Path

# ---------------------------------------------------------------------------
# Suites: named detector allow-lists for batch screen
# ---------------------------------------------------------------------------

# Maps suite name -> detector *names* (detector.name), empty = full pipeline.
# ``deep`` is an alias of ``full`` (all pipeline detectors) — the product
# default after "直接深度审查" product decision.
SUITE_DETECTORS: dict[str, set[str] | None] = {
    "full": None,  # all pipeline detectors
    "deep": None,  # alias of full — default deep screen
    "core": {
        "metadata",
        "pdf_metadata",
        "image_dup",
        "image_forensics",
        "image_sift_copymove",
        "table_benford",
        "table_duplicate_row",
        "table_near_duplicate_row",
        "table_cross_copy",
        "table_outlier",
        "table_round_bias",
        "table_relationships",
        "table_file_metadata",
        "table_highlight_focus",
        "table_forensics",
        "stat_grim",
        "text_patterns",
        "ref_duplicate",
        "compliance",
        "supplementary",
    },
    "image": {
        "image_dup",
        "image_forensics",
        "image_noise_inconsistency",
        "image_sift_copymove",
        "panel_dup",
        "panel_duplicate",
        "page_raster_dup",
        "ai_generated_figure",
    },
    "table": {
        "table_benford",
        "table_duplicate_row",
        "table_near_duplicate_row",
        "table_cross_copy",
        "table_outlier",
        "table_round_bias",
        "table_relationships",
        "table_file_metadata",
        "table_highlight_focus",
        "table_forensics",
        "stat_grim",
        "stat_pvalue",
        "stat_percent",
        "figure_grim",
        "figure_stat_text",
        "figure_table_ocr",
        "figure_table_consistency",
        "source_data_consistency",
        "supplementary",
    },
    "fast": {
        "metadata",
        "pdf_metadata",
        "image_dup",
        "table_duplicate_row",
        "table_benford",
        "text_patterns",
        "ref_duplicate",
    },
}


def _copy_companions(materials_dir: Path, data_paths: Sequence[Path]) -> list[str]:
    """Copy companion files/dirs into job materials/. Returns copied paths."""
    materials_dir.mkdir(parents=True, exist_ok=True)
    copied: list[str] = []
    for raw in data_paths:
        p = raw if raw.is_absolute() else (Path.cwd() / raw)
        p = p.resolve()
        if not p.exists():
            continue
        if p.is_file():
            dest = materials_dir / p.name
            if dest.resolve() != p:
                shutil.copy2(p, dest)
            copied.append(str(dest))
        elif p.is_dir():
            for f in p.rglob("*"):
                if not f.is_file():
                    continue
                if f.suffix.lower() not in {
                    ".xlsx",
                    ".xlsm",
                    ".csv",
                    ".tsv",
                    ".json",
                    ".zip",
                    ".pdf",
                }:
                    continue
                # Keep flat name; collide → suffix
                dest = materials_dir / f.name
                if dest.exists() and dest.stat().st_size == f.stat().st_size:
                    copied.append(str(dest))
                    continue
                if dest.exists():
                    stem, suf = f.stem, f.suffix
                    n = 2
                    while dest.exists():
                        dest = materials_dir / f"{stem}_{n}{suf}"
                        n += 1
                shutil.copy2(f, dest)
                copied.append(str(dest))
    return copied


def cmd_screen(args: argparse.Namespace) -> int:
    """B: batch integrity screen → findings.json + report.html."""
    from .config import get_settings
    from .contracts import JobState
    from .pipeline import run_pipeline
    from .trace import bind_trace_id, configure_logging, new_trace_id
    from .workspace import JobPaths

    configure_logging()
    pdf = args.pdf if args.pdf.is_absolute() else (Path.cwd() / args.pdf)
    pdf = pdf.resolve()
    if not pdf.is_file():
        print(json.dumps({"ok": False, "error": f"PDF not found: {pdf}"}, ensure_ascii=False))
        return 2

    # Settings is a frozen pydantic model — configure via env, then reload.
    if args.workspace:
        ws = Path(args.workspace)
        if not ws.is_absolute():
            ws = Path.cwd() / ws
        os.environ["MANUSIFT_WORKSPACE_DIR"] = str(ws.resolve())
    if args.no_llm:
        os.environ["MANUSIFT_LLM_MAX_CONCURRENCY"] = "0"
    if getattr(args, "lang", None):
        os.environ["MANUSIFT_REPORT_LANGUAGE"] = args.lang

    # --deep forces full pipeline regardless of --suites
    suite = (getattr(args, "suites", None) or "deep").lower().strip()
    if getattr(args, "deep", False):
        suite = "deep"
    if suite not in SUITE_DETECTORS:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": f"unknown suite {suite!r}",
                    "suites": sorted(SUITE_DETECTORS),
                },
                ensure_ascii=False,
            )
        )
        return 2

    allow = SUITE_DETECTORS.get(suite)
    if allow is not None:
        # Build skip list = pipeline detectors not in suite (via env).
        if hasattr(get_settings, "cache_clear"):
            get_settings.cache_clear()
        from .pipeline import _pipeline_detector_classes

        all_names = {cls().name for cls in _pipeline_detector_classes()}
        skip = sorted(all_names - allow)
        os.environ["MANUSIFT_BENCHMARK_SKIP_DETECTORS"] = ",".join(skip)

    if hasattr(get_settings, "cache_clear"):
        get_settings.cache_clear()
    settings = get_settings()
    settings.workspace_dir.mkdir(parents=True, exist_ok=True)

    tid = args.trace_id or new_trace_id()
    bind_trace_id(tid)
    paths = JobPaths.for_trace(tid, settings.workspace_dir)
    paths.ensure()
    paths.original.write_bytes(pdf.read_bytes())

    materials = paths.materials_dir
    data_paths = list(args.data_paths or [])
    # If user passed a directory as only companion, use it; also default
    # to PDF parent when --with-sidecar is set.
    if args.with_sidecar:
        data_paths.append(pdf.parent)
    copied = _copy_companions(materials, data_paths) if data_paths else []

    job = JobState(trace_id=tid, status="queued", source_filename=pdf.name)
    result = run_pipeline(paths.original, paths, job)

    report_path = paths.report_html
    # Prefer zh narrative if present (render path may write report.zh.html)
    for cand in (
        paths.output_dir / "report.zh.html",
        paths.output_dir / f"report.{args.lang}.html",
        paths.report_html,
    ):
        if cand.is_file():
            report_path = cand
            break

    summary = {
        "ok": job.status == "done" and paths.findings_json.is_file(),
        "product": "B+C",
        "mode": "screen",
        "trace_id": tid,
        "pdf": str(pdf),
        "suite": suite,
        "status": job.status,
        "finding_count": int(getattr(job, "finding_count", 0) or 0),
        "detectors_run": list(result.detectors_run),
        "duration_ms": result.duration_ms,
        "llm_calls": result.llm_calls,
        "companions_copied": len(copied),
        "findings_json": str(paths.findings_json.resolve()),
        "report_html": str(report_path.resolve()),
        "llm_report_html": str(paths.llm_report_html.resolve()),
        "llm_report_md": str(paths.llm_report_md.resolve()),
        "llm_report_json": str(paths.llm_report_json.resolve()),
        "llm_briefing_html": str(paths.llm_briefing_html.resolve()),
        "llm_briefing_md": str(paths.llm_briefing_md.resolve()),
        "investigation_pairs_html": str(
            paths.investigation_pairs_html.resolve()
        ),
        "investigation_pairs_md": str(
            paths.investigation_pairs_md.resolve()
        ),
        "investigation_pairs_json": str(
            paths.investigation_pairs_json.resolve()
        ),
        "investigation_plain_html": str(
            paths.investigation_plain_html.resolve()
        ),
        "investigation_plain_md": str(
            paths.investigation_plain_md.resolve()
        ),
        "job_dir": str(paths.root.resolve()),
    }
    if job.status == "failed":
        summary["ok"] = False

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if summary.get("ok") else 1


def cmd_agent(args: argparse.Namespace) -> int:
    """Launch the interactive pi agent with the ManuSift extension.

    Runs the standalone branded agent
    (``node agent/bin/manusift-agent.mjs``, pi SDK) when available;
    otherwise wraps plain ``pi`` with the project extension and skills.
    ``MANUSIFT_PI`` forces the plain-pi path.
    """
    import subprocess

    root = Path(__file__).resolve().parents[1]
    extra = list(getattr(args, "pi_args", None) or [])

    # Preferred: the standalone branded agent (pi SDK).
    node_exe = shutil.which("node")
    entry = root / "agent" / "bin" / "manusift-agent.mjs"
    deps_ok = (root / "agent" / "node_modules").is_dir()
    if not os.environ.get("MANUSIFT_PI") and node_exe and entry.is_file():
        if not deps_ok:
            print(
                "manusift-agent dependencies missing; run:\n"
                f"  cd {root / 'agent'} && npm install --ignore-scripts\n"
                "Falling back to plain pi.",
                file=sys.stderr,
            )
        else:
            try:
                return int(subprocess.call([node_exe, str(entry), *extra]))
            except KeyboardInterrupt:
                return 130

    pi_exe = os.environ.get("MANUSIFT_PI") or shutil.which("pi")
    if not pi_exe:
        print(
            "Neither the standalone agent nor pi is available.\n"
            "Install pi with:  npm install -g @earendil-works/pi-coding-agent\n"
            f"and the agent with:  cd {root / 'agent'} && npm install --ignore-scripts",
            file=sys.stderr,
        )
        return 1
    cmd = [pi_exe]
    # From the repo root pi auto-discovers .pi/extensions and .pi/skills;
    # from anywhere else, pass them explicitly.
    if Path.cwd().resolve() != root:
        ext_dir = root / ".pi" / "extensions" / "manusift"
        if ext_dir.is_dir():
            cmd += ["-e", str(ext_dir)]
        skills_dir = root / ".pi" / "skills"
        if skills_dir.is_dir():
            for sk in sorted(skills_dir.iterdir()):
                if (sk / "SKILL.md").is_file():
                    cmd += ["--skill", str(sk)]
    cmd += extra
    try:
        return int(subprocess.call(cmd))
    except KeyboardInterrupt:
        return 130


def cmd_toolserver(args: argparse.Namespace) -> int:
    """Launch the JSON-lines stdio tool bridge (pi extension backend)."""
    from .toolserver import main as toolserver_main

    argv: list[str] = []
    if args.trace_id:
        argv.extend(["--trace-id", args.trace_id])
    if args.list_tools:
        argv.append("--list-tools")
    toolserver_main(argv)
    return 0


def cmd_suites(_: argparse.Namespace) -> int:
    print(
        json.dumps(
            {
                "suites": {
                    k: (sorted(v) if v is not None else "all_pipeline_detectors")
                    for k, v in SUITE_DETECTORS.items()
                }
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="manusift",
        description=(
            "ManuSift paper-integrity screener — batch CLI (B) + "
            "pi agent tool bridge (see docs/pi-agent.md). "
            "Conversational agent UI is provided by pi, not this CLI."
        ),
    )
    sub = p.add_subparsers(dest="command", required=False)

    # --- screen ---
    sp = sub.add_parser(
        "screen",
        help="Batch-screen a PDF (+ optional source data) → report + findings",
    )
    sp.add_argument("pdf", type=Path, help="Path to paper PDF")
    sp.add_argument(
        "--data-paths",
        nargs="*",
        type=Path,
        default=None,
        help="Companion files or directories (XLSX/CSV/…)",
    )
    sp.add_argument(
        "--with-sidecar",
        action="store_true",
        help="Also scan the PDF's parent directory for companion data",
    )
    sp.add_argument(
        "--suites",
        default="deep",
        choices=sorted(SUITE_DETECTORS),
        help=(
            "Detector suite (default: deep = full pipeline). "
            "Use core/fast for a lighter triage pass."
        ),
    )
    sp.add_argument(
        "--deep",
        action="store_true",
        help="Force deep screen (full pipeline; same as --suites deep/full)",
    )
    sp.add_argument("--trace-id", default=None, help="Reuse/force job id")
    sp.add_argument("--workspace", type=Path, default=None, help="Workspace root")
    sp.add_argument(
        "--no-llm",
        action="store_true",
        help="Skip LLM enrichment of findings",
    )
    sp.add_argument(
        "--lang",
        default="zh",
        help="Preferred report language code (zh/en) when available",
    )
    sp.set_defaults(func=cmd_screen)

    # --- agent (pi) ---
    agp = sub.add_parser(
        "agent",
        help="Launch the interactive pi agent (default when no command given)",
    )
    agp.add_argument(
        "pi_args",
        nargs=argparse.REMAINDER,
        help="Extra arguments passed through to pi (e.g. -p \"...\")",
    )
    agp.set_defaults(func=cmd_agent)

    # --- toolserver (pi bridge) ---
    tp = sub.add_parser(
        "toolserver",
        help="Start the JSON-lines stdio tool bridge (used by the pi extension)",
    )
    tp.add_argument("--trace-id", default=None)
    tp.add_argument("--list-tools", action="store_true")
    tp.set_defaults(func=cmd_toolserver)

    # --- suites ---
    lp = sub.add_parser("suites", help="List detector suites for screen")
    lp.set_defaults(func=cmd_suites)

    # --- analyze (compat alias) ---
    ap = sub.add_parser(
        "analyze",
        help="Alias for 'screen' (legacy manusift-analyze)",
    )
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--data-paths", nargs="*", type=Path, default=None)
    ap.add_argument("--with-sidecar", action="store_true")
    ap.add_argument(
        "--suites",
        default="deep",
        choices=sorted(SUITE_DETECTORS),
    )
    ap.add_argument(
        "--deep",
        action="store_true",
        help="Force deep screen (full pipeline)",
    )
    ap.add_argument("--trace-id", default=None)
    ap.add_argument("--workspace", type=Path, default=None)
    ap.add_argument("--no-llm", action="store_true")
    ap.add_argument("--lang", default="zh")
    ap.set_defaults(func=cmd_screen)

    return p


def main(argv: list[str] | None = None) -> int:
    # Backward compat: `manusift-analyze paper.pdf` historically had no subcommand.
    # If first arg looks like a PDF path, treat as `screen`.
    raw = list(argv) if argv is not None else sys.argv[1:]
    if raw and not raw[0].startswith("-"):
        cmd = raw[0]
        if cmd.endswith(".pdf") or Path(cmd).suffix.lower() == ".pdf":
            raw = ["screen", *raw]
        elif cmd not in (
            "screen",
            "agent",
            "toolserver",
            "suites",
            "analyze",
            "help",
        ) and Path(cmd).is_file() and Path(cmd).suffix.lower() == ".pdf":
            raw = ["screen", *raw]

    parser = build_parser()
    if not raw:
        # Bare ``manusift`` launches the interactive pi agent.
        raw = ["agent"]
    if raw[0] == "agent":
        # Bypass argparse: everything after ``agent`` goes to pi verbatim
        # (argparse REMAINDER would reject leading options like ``-p``).
        return int(cmd_agent(argparse.Namespace(pi_args=raw[1:])))

    args = parser.parse_args(raw)
    if not getattr(args, "command", None) and not hasattr(args, "func"):
        parser.print_help()
        return 0
    if not hasattr(args, "func"):
        parser.print_help()
        return 0
    return int(args.func(args))


def app() -> int:
    """Legacy name used by some launchers."""
    return main()


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
