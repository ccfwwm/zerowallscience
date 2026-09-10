#!/usr/bin/env python3
"""Bootstrap a literature task from an already-parsed MinerU directory.

Purpose
-------
When a paper has already been parsed by MinerU (a directory that contains
``full.md`` plus ``images/`` and usually ``meta.json``), there is no reason to
re-analyse the paths by hand or to re-submit the PDF.  This script performs the
first two pipeline steps in one shot and fully automatically:

    1. ``analyze``        - create the task directory and register the local PDF
    2. ``ingest-mineru``  - attach the existing MinerU result tree

Usage
-----
    python scripts/bootstrap_parsed.py <parsed-dir> [options]
    python scripts/bootstrap_parsed.py parsed_papers/P001_xxx
    python scripts/bootstrap_parsed.py parsed_papers --all
    python scripts/bootstrap_parsed.py parsed_papers/P001_xxx --resume

Options
-------
    --output DIR   task directory (default: literature/<same folder name>)
    --pdf FILE     explicit source PDF (default: auto-resolved, see below)
    --all          treat <parsed-dir> as a parent and bootstrap every subfolder
    --resume       run ``resume`` after ingest to expand cited-by immediately
    --force        re-run even when the task already reached a later stage

Task directory
--------------
By default the task directory keeps the SAME NAME as the parsed folder, so
``parsed_papers/P001_2005Foo`` becomes ``literature/P001_2005Foo``.  Numbering
such as ``P001`` therefore stays aligned with
``parsed_papers/_<mapping>_pXXX_to_PDF.csv`` without any manual argument.

PDF resolution order
--------------------
    1. ``--pdf`` when given
    2. ``meta.json`` -> ``source_pdf_abs``
    3. ``meta.json`` -> ``source_pdf`` resolved against the workspace root
    4. the pXXX mapping CSV in the parsed parent directory
    5. any ``*.pdf`` inside the parsed directory
    6. ``*_origin.pdf`` inside the MinerU run directory named by ``meta.json``

All console output is ASCII-safe JSON so that terminals with a legacy code page
cannot mangle it.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import literature_pipeline as lp  # noqa: E402


# --------------------------------------------------------------------------
# discovery helpers
# --------------------------------------------------------------------------

def find_full_md(parsed_dir: Path) -> Path | None:
    """Return the single full.md of a parsed directory, if there is one."""
    direct = parsed_dir / "full.md"
    if direct.is_file():
        return direct
    matches = [p for p in parsed_dir.rglob("full.md") if p.is_file()]
    return matches[0] if len(matches) == 1 else None


def load_meta(parsed_dir: Path) -> dict:
    path = parsed_dir / "meta.json"
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def workspace_root(parsed_dir: Path) -> Path:
    """Best-effort workspace root: the parent of the parsed parent directory."""
    return parsed_dir.parent.parent if parsed_dir.parent.parent.is_dir() else Path.cwd()


def pdf_from_mapping_csv(parsed_dir: Path, paper_id: str) -> Path | None:
    """Look the paper id up in the pXXX -> PDF mapping CSV, if one exists."""
    if not paper_id:
        return None
    root = parsed_dir.parent
    candidates = [p for p in root.glob("*.csv") if p.name.endswith("_pXXX_to_PDF.csv")]
    if not candidates:
        candidates = [p for p in root.glob("*_to_PDF.csv")]
    for csv_path in candidates:
        try:
            rows = list(csv.DictReader(csv_path.read_text(encoding="utf-8").splitlines()))
        except (OSError, ValueError):
            continue
        for row in rows:
            if str(row.get("id", "")).strip().lower() != paper_id.lower():
                continue
            rel = str(row.get("orig_relpath", "")).strip()
            if rel:
                resolved = (workspace_root(parsed_dir) / rel).resolve()
                if resolved.is_file():
                    return resolved
    return None


def resolve_pdf(parsed_dir: Path, meta: dict, explicit: Path | None) -> Path | None:
    """Resolve the original PDF for a parsed directory."""
    if explicit:
        candidate = explicit.resolve()
        return candidate if candidate.is_file() else None

    absolute = str(meta.get("source_pdf_abs", "")).strip()
    if absolute and Path(absolute).is_file():
        return Path(absolute).resolve()

    relative = str(meta.get("source_pdf", "")).strip()
    if relative:
        candidate = (workspace_root(parsed_dir) / relative).resolve()
        if candidate.is_file():
            return candidate

    from_csv = pdf_from_mapping_csv(parsed_dir, str(meta.get("id", "")).strip())
    if from_csv:
        return from_csv

    local = sorted(p for p in parsed_dir.glob("*.pdf") if p.is_file())
    if local:
        return local[0].resolve()

    run_dir = str(meta.get("run_dir", "")).strip()
    if run_dir:
        run_path = (workspace_root(parsed_dir) / run_dir).resolve()
        origins = sorted(run_path.glob("*_origin.pdf")) if run_path.is_dir() else []
        if origins:
            return origins[0].resolve()
    return None


def default_output(parsed_dir: Path) -> Path:
    """Task directory next to the workspace, keeping the parsed folder name."""
    return Path("literature") / parsed_dir.name


# --------------------------------------------------------------------------
# pipeline drivers (in-process, so no non-ASCII path ever hits a shell)
# --------------------------------------------------------------------------

def analyze_namespace(pdf: Path, output: Path, timeout: float, no_tsg: bool) -> argparse.Namespace:
    return argparse.Namespace(
        input=str(pdf),
        output=output,
        article_slug=None,
        directions="cited-by",
        max_papers=None,
        all_references=False,
        all_cited_by=True,
        download_pdfs=True,
        download_workers=4,
        enrich_authors=False,
        author_search="all",
        include_target=False,
        allow_tsg=False,
        no_tsg=no_tsg,
        timeout=timeout,
    )


def target_row(task: "lp.Task") -> dict:
    """Return the target paper row of a task state, or an empty dict."""
    for row in task.load().get("papers", []):
        if row.get("direction") == "target":
            return row if isinstance(row, dict) else {}
    return {}


def target_identity(task: "lp.Task") -> str:
    row = target_row(task)
    return str(row.get("key") or row.get("doi") or row.get("pmid") or "")


def target_is_parsed(task: "lp.Task") -> bool:
    """True when the task already carries an ingested MinerU result.

    The check looks at the target paper itself rather than at a stage name
    whitelist, because a task can legitimately sit at many different stages
    (initialized, author_enriching, report_building, complete ...) while still
    being fully bootstrapped, and a brand new task starts at ``initialized``.
    """
    row = target_row(task)
    if not row:
        return False
    if str(row.get("parse_status", "")) != "mineru_parsed":
        return False
    parsed_text = str(row.get("parsed_text_path", "")).strip()
    return bool(parsed_text) and Path(parsed_text).is_file()


def target_pdf_ready(task: "lp.Task") -> bool:
    """True when the task already holds the target PDF under downloads/."""
    row = target_row(task)
    pdf_path = str(row.get("pdf_path", "")).strip() if row else ""
    return bool(pdf_path) and Path(pdf_path).is_file()


def bootstrap_one(parsed_dir: Path, *, output: Path | None, pdf: Path | None,
                  timeout: float, no_tsg: bool, do_resume: bool, force: bool) -> dict:
    result: dict = {"parsed_dir": str(parsed_dir)}

    full_md = find_full_md(parsed_dir)
    if full_md is None:
        result["status"] = "skipped"
        result["reason"] = "no unique full.md in parsed directory"
        return result

    meta = load_meta(parsed_dir)
    source_pdf = resolve_pdf(parsed_dir, meta, pdf)
    if source_pdf is None:
        result["status"] = "error"
        result["reason"] = "source PDF could not be resolved"
        return result

    task_dir = Path(output) if output else default_output(parsed_dir)
    result["task"] = str(task_dir)
    result["pdf"] = str(source_pdf)

    task = lp.Task(task_dir)

    if target_is_parsed(task) and not force:
        result["status"] = "already_bootstrapped"
        result["stage"] = task.load().get("stage", "")
        return result

    if force or not target_pdf_ready(task):
        code = lp.run_analyze(analyze_namespace(source_pdf, task_dir, timeout, no_tsg))
        if code != 0:
            result["status"] = "error"
            result["reason"] = f"analyze exited with {code}"
            return result

    identity = target_identity(task)
    if not identity:
        result["status"] = "error"
        result["reason"] = "no target paper in task state after analyze"
        return result

    state = task.load()
    paper = lp.ingest_mineru_result(
        task,
        state,
        identity,
        parsed_dir.resolve(),
        str(meta.get("mineru_task_id", "")).strip() or parsed_dir.name,
        str(meta.get("mineru_api", "")).strip() or "mineru",
    )
    result["paper_key"] = paper.key
    result["parse_status"] = paper.parse_status
    result["stage"] = task.load().get("stage", "")
    result["status"] = "bootstrapped"

    if do_resume:
        resume_args = argparse.Namespace(
            task=task_dir, timeout=timeout, partial=False,
            no_tsg=no_tsg, allow_tsg=False, from_evidence_dir=None,
            download_workers=4,
        )
        result["resume_exit_code"] = lp.run_resume(resume_args)
        result["stage"] = task.load().get("stage", "")
    return result


# --------------------------------------------------------------------------
# entry point
# --------------------------------------------------------------------------

def iter_parsed_dirs(root: Path, batch: bool) -> list[Path]:
    if not batch:
        return [root]
    return sorted(p for p in root.iterdir() if p.is_dir() and find_full_md(p) is not None)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Create a literature task from an already-parsed MinerU directory")
    parser.add_argument("parsed_dir", type=Path,
                        help="parsed MinerU directory, or its parent together with --all")
    parser.add_argument("--output", type=Path, default=None,
                        help="task directory; default literature/<parsed folder name>")
    parser.add_argument("--pdf", type=Path, default=None, help="explicit source PDF")
    parser.add_argument("--all", action="store_true", dest="batch",
                        help="bootstrap every parsed subfolder of parsed_dir")
    parser.add_argument("--resume", action="store_true",
                        help="run resume right after ingest to expand cited-by")
    parser.add_argument("--force", action="store_true",
                        help="re-run even when the task already advanced past ingest")
    parser.add_argument("--timeout", type=float, default=30)
    parser.add_argument("--no-tsg", action="store_true")
    args = parser.parse_args(argv)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    root = args.parsed_dir
    if not root.is_dir():
        print(json.dumps({"status": "error", "reason": "parsed_dir is not a directory",
                          "parsed_dir": str(root)}), file=sys.stderr)
        return 2

    targets = iter_parsed_dirs(root, args.batch)
    if not targets:
        print(json.dumps({"status": "error", "reason": "no parsed directory found",
                          "parsed_dir": str(root)}), file=sys.stderr)
        return 2
    if args.batch and (args.output or args.pdf):
        print(json.dumps({"status": "error",
                          "reason": "--output/--pdf cannot be combined with --all"}),
              file=sys.stderr)
        return 2

    results = [
        bootstrap_one(item, output=args.output, pdf=args.pdf, timeout=args.timeout,
                      no_tsg=args.no_tsg, do_resume=args.resume, force=args.force)
        for item in targets
    ]
    failed = sum(1 for row in results if row.get("status") == "error")
    print(json.dumps({"count": len(results), "failed": failed, "results": results},
                     ensure_ascii=True, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
