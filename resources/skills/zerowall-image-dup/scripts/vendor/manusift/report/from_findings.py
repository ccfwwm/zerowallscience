"""CLI entry to regenerate reports from findings.json.

Primary: investigation_pairs (+ optional llm_report / plain).
See docs/REPORT_PATH.md.

"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def regenerate(
    path: Path,
    *,
    calibrate: bool = True,
    language: str = "zh",
    source_name: str = "",
) -> dict[str, str]:
    from .finding_calibration import calibrate_findings, calibration_stats
    from .investigation_pairs import findings_from_json, write_investigation_pairs
    from .llm_report import write_llm_reports
    from .plain_investigation import write_plain_investigation

    if path.is_dir():
        # Accept either the job dir (artifacts live in its ``output/``
        # subdir, see ``workspace.JobPaths``) or the output dir itself.
        out = path / "output"
        if (out / "findings.json").is_file():
            root = out
        else:
            root = path
        findings_path = root / "findings.json"
    else:
        findings_path = path
        root = path.parent

    if not findings_path.is_file():
        raise FileNotFoundError(f"findings.json not found: {findings_path}")

    trace_id, findings, llm_calls = findings_from_json(findings_path)
    if calibrate:
        findings = calibrate_findings(findings)
        stats = calibration_stats(findings)
        cal_path = root / "findings_calibrated.json"
        raw = json.loads(findings_path.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            raw["findings"] = [
                {
                    "finding_id": f.finding_id,
                    "trace_id": f.trace_id,
                    "detector": f.detector,
                    "severity": f.severity,
                    "title": f.title,
                    "evidence": f.evidence,
                    "location": f.location,
                    "raw": f.raw,
                    "llm_verdict": f.llm_verdict,
                    "llm_skipped": f.llm_skipped,
                }
                for f in findings
            ]
            raw["calibration_stats"] = stats
            cal_path.write_text(
                json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        else:
            stats = {}
    else:
        stats = calibration_stats(findings)

    tid = trace_id or root.name
    paths = write_llm_reports(
        root_dir=root,
        trace_id=tid,
        findings=findings,
        llm_calls=llm_calls,
        language=language,
    )
    # ensure pairs/plain even if llm_report path failed partially
    if "pairs_html" not in paths:
        paths.update(
            write_investigation_pairs(
                root_dir=root,
                trace_id=tid,
                findings=findings,
                llm_calls=llm_calls,
                language=language,
                source_name=source_name,
            )
        )
    if "plain_html" not in paths:
        paths.update(
            write_plain_investigation(
                root_dir=root,
                trace_id=tid,
                findings=findings,
                llm_calls=llm_calls,
                language=language,
                source_name=source_name,
            )
        )
    paths["calibration_stats"] = json.dumps(stats, ensure_ascii=False)
    return paths


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Regenerate ManuSift human reports from findings.json")
    p.add_argument("path", type=Path, help="Job directory or findings.json path")
    p.add_argument(
        "--no-calibrate",
        action="store_true",
        help="Skip P0 severity calibration",
    )
    p.add_argument("--language", default="zh")
    p.add_argument("--source-name", default="")
    args = p.parse_args(argv)
    try:
        paths = regenerate(
            args.path,
            calibrate=not args.no_calibrate,
            language=args.language,
            source_name=args.source_name,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(paths, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
