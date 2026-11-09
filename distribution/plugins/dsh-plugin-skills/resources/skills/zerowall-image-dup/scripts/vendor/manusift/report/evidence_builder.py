"""Evidence Builder (R-2026-06-12).

The
``build_evidence_index``
function
takes
the
output
of
a
ManuSift
run
(the
``findings.json``
the
benchmark
script
already
writes
under
``manusift_run/``)
and
turns
it
into
an
``EvidenceIndex``
that
the
report
renderer
can
consume.

It also writes
the visual assets
(crops, side-by-side
images, overlays)
to disk so the
renderer can link
to them.

The builder is split
out from the renderer
because:

  * Asset generation
    (PIL drawing,
    cropping, side-by-
    side composition)
    is slow and the
    renderer should be
    fast.
  * The builder needs
    access to the raw
    PDF (to re-derive
    panel images for
    panel_dup findings)
    while the renderer
    only needs the
    ``EvidenceIndex``
    + the rendered
    asset paths."""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from . import data_evidence
from . import visual_evidence
from .evidence import (
    DETECTOR_CATEGORY,
    EvidenceIndex,
    FindingType,
    MetadataFinding,
    NumericalFinding,
    Severity,
    VisualFinding,
)


def _read_findings(findings_path: Path) -> tuple[dict, list[dict]]:
    """Load a ``findings.json`` produced by the benchmark script.

    The schema is::

        {
          "trace_id": "...",
          "detectors_run": [...],
          "llm_calls": int,
          "duration_ms": int,
          "findings": [
             {"finding_id": "...", "detector": "...",
              "severity": "...", "title": "...", "evidence": "...",
              "location": "...", "raw": {...}, "llm_verdict": ...},
             ...
          ]
        }
    """

    data = json.loads(findings_path.read_text(encoding="utf-8"))
    return data, data.get("findings", [])


def _classify(finding: dict) -> FindingType:
    """Map a finding to a coarse category.

    R-2026-06-12: the
    user spec wants the
    evidence map to
    group findings into
    Visual / Numerical /
    Metadata / Reference
    / Compliance. We
    use the
    ``DETECTOR_CATEGORY``
    map in ``evidence``
    for the lookup.
    """

    det = finding.get("detector", "")
    return DETECTOR_CATEGORY.get(det, FindingType.UNKNOWN)


def build_evidence_index(
    findings_path: Path,
    out_dir: Path,
    paper_id: str,
    pdf_path: Path | None = None,
) -> EvidenceIndex:
    """Build an EvidenceIndex from a findings.json file.

    Side effects: writes
    visual assets under
    ``out_dir/visual/finding_<id>/``
    and the per-finding
    JSON under
    ``out_dir/data/finding_data_<id>.{json,md}``.

    R-2026-06-12: the
    function does not
    raise if a single
    finding fails to
    render. The
    benchmark / TUI
    wants a usable
    report even when one
    detector produced
    garbage."""

    findings_path = Path(findings_path)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    visual_dir = out_dir / "visual"
    visual_dir.mkdir(parents=True, exist_ok=True)
    data_dir = out_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    manifest, findings = _read_findings(findings_path)
    index = EvidenceIndex(
        trace_id=manifest.get("trace_id", ""),
        paper_id=paper_id,
        detectors_run=manifest.get("detectors_run", []),
    )

    summary = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    visual_findings_for_json: list[dict] = []
    for raw in findings:
        try:
            explained = data_evidence.explain_finding(raw)
        except Exception:  # noqa: BLE001
            # Unparseable
            # finding
            # --
            # skip
            # rather
            # than
            # fail
            # the
            # whole
            # report.
            continue
        if explained is None:
            # No
            # explainer
            # --
            # turn
            # it
            # into
            # a
            # metadata
            # entry
            # so
            # it
            # still
            # shows
            # up
            # in
            # the
            # report.
            explained = MetadataFinding(
                finding_id=raw.get("finding_id", ""),
                severity=Severity.LOW,
                confidence=0.4,
                detector=raw.get("detector", "unknown"),
                summary=raw.get("title", ""),
                location=__import__("manusift.report.evidence", fromlist=["Location"]).Location(),
                reasoning=raw.get("evidence", ""),
                raw_finding=raw,
            )
        sev = explained.severity
        if hasattr(sev, "value"):
            sev = sev.value
        summary[sev] = summary.get(sev, 0) + 1

        # Generate
        # visual
        # assets
        # for
        # the
        # VisualFinding
        # type.
        if isinstance(explained, VisualFinding):
            explained = visual_evidence.build_visual_assets(
                finding=explained,
                out_dir=visual_dir,
                pdf_path=pdf_path,
            )
            index.visual_findings.append(explained)
            # Persist
            # a
            # per-finding
            # JSON
            # +
            # MD.
            try:
                from dataclasses import asdict
                data_path = data_dir / f"finding_data_{explained.finding_id}.json"
                data_path.write_text(
                    json.dumps(
                        asdict(explained),
                        indent=2,
                        ensure_ascii=False,
                        default=_json_default,
                    ),
                    encoding="utf-8",
                )
            except Exception:  # noqa: BLE001
                pass
            visual_findings_for_json.append(
                {
                    "finding_id": explained.finding_id,
                    "severity": explained.severity.value,
                    "detector": explained.detector,
                    "summary": explained.summary,
                    "assets": explained.assets,
                }
            )
        elif isinstance(explained, NumericalFinding):
            index.numerical_findings.append(explained)
            try:
                from dataclasses import asdict
                (data_dir / f"finding_data_{explained.finding_id}.json").write_text(
                    json.dumps(
                        asdict(explained),
                        indent=2,
                        ensure_ascii=False,
                        default=_json_default,
                    ),
                    encoding="utf-8",
                )
                # Also
                # write
                # a
                # Markdown
                # card
                # for
                # diffing.
                (data_dir / f"finding_data_{explained.finding_id}.md").write_text(
                    _numerical_finding_md(explained),
                    encoding="utf-8",
                )
            except Exception:  # noqa: BLE001
                pass
        elif isinstance(explained, MetadataFinding):
            index.metadata_findings.append(explained)
        else:  # pragma: no cover -- defensive
            index.metadata_findings.append(
                MetadataFinding(
                    finding_id=raw.get("finding_id", ""),
                    severity=Severity.LOW,
                    confidence=0.4,
                    detector=raw.get("detector", "unknown"),
                    summary=raw.get("title", ""),
                    location=__import__("manusift.report.evidence", fromlist=["Location"]).Location(),
                    reasoning=raw.get("evidence", ""),
                    raw_finding=raw,
                )
            )

    # Sort
    # visual
    # findings
    # by
    # severity
    # (critical
    # first)
    # and
    # then
    # by
    # confidence.
    sev_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    index.visual_findings.sort(
        key=lambda f: (sev_rank.get(f.severity.value, 9), -f.confidence)
    )
    index.numerical_findings.sort(
        key=lambda f: (sev_rank.get(f.severity.value, 9), -f.confidence)
    )
    index.metadata_findings.sort(
        key=lambda f: (sev_rank.get(f.severity.value, 9), -f.confidence)
    )
    index.summary = summary

    # Method
    # trace
    # --
    # short
    # version
    # of
    # the
    # manifest
    # (no
    # raw
    # JSON).
    index.method_trace = {
        "trace_id": manifest.get("trace_id", ""),
        "llm_calls": manifest.get("llm_calls", 0),
        "duration_ms": manifest.get("duration_ms", 0),
        "detectors_run": manifest.get("detectors_run", []),
        "findings_total": len(findings),
    }

    # Source
    # map
    # --
    # a
    # record
    # of
    # where
    # each
    # source
    # image
    # lives,
    # so
    # the
    # reviewer
    # can
    # open
    # the
    # original.
    source_map: dict[str, str] = {}
    for f in index.visual_findings:
        if f.location_a.source_image and f.location_a.source_image not in source_map:
            source_map[f.location_a.source_image] = f.location_a.source_image
        if f.location_b.source_image and f.location_b.source_image not in source_map:
            source_map[f.location_b.source_image] = f.location_b.source_image
    index.source_map = source_map

    # Write
    # the
    # visual_findings.json
    # manifest
    # for
    # the
    # evidence
    # root.
    (visual_dir / "visual_findings.json").write_text(
        json.dumps(visual_findings_for_json, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    # Source
    # map
    # file.
    prov_dir = out_dir / "provenance"
    prov_dir.mkdir(parents=True, exist_ok=True)
    (prov_dir / "source_map.json").write_text(
        json.dumps(source_map, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    return index


def _json_default(o: Any) -> Any:
    """JSON encoder fallback for numpy / int / etc.

    R-2026-06-12: when
    writing per-finding
    JSON, some detector
    fields (e.g. cell_a
    from image_forensics)
    are numpy intc
    scalars. ``json``
    can't serialise them
    directly. We fall
    back to a builtin
    python type."""

    # numpy
    if hasattr(o, "item"):
        try:
            return o.item()
        except Exception:  # noqa: BLE001
            pass
    if isinstance(o, (set, frozenset)):
        return list(o)
    if isinstance(o, Path):
        return str(o)
    raise TypeError(f"not serialisable: {type(o)}")


def _numerical_finding_md(f: NumericalFinding) -> str:
    """Render a numerical finding as a standalone Markdown card.

    R-2026-06-12: the
    spec asks for
    per-finding JSON and
    Markdown under
    ``evidence/data/``.
    The Markdown card
    mirrors the HTML
    card so the reviewer
    can read it in
    any viewer."""

    lines: list[str] = []
    lines.append(f"# {f.finding_id} — {f.summary}")
    lines.append("")
    lines.append(f"**Detector:** `{f.detector}` · **Severity:** {f.severity.value}")
    lines.append("")
    lines.append(f"## Test: {f.test_name}")
    lines.append("")
    lines.append(f.test_description)
    lines.append("")
    if f.input_values:
        lines.append("## Input values")
        lines.append("")
        for k, v in f.input_values.items():
            lines.append(f"- {k}: `{v}`")
        lines.append("")
    lines.append(f"## Expected constraint")
    lines.append("")
    lines.append(f"`{f.expected_constraint}`")
    lines.append("")
    lines.append(f"## Observed")
    lines.append("")
    lines.append(f"`{f.observed_value}`")
    lines.append("")
    lines.append(f"## Result: `{f.result}`")
    lines.append("")
    lines.append(f"## Reasoning")
    lines.append("")
    lines.append(f.reasoning)
    lines.append("")
    if f.limitations:
        lines.append("## Limitations")
        lines.append("")
        for l in f.limitations:
            lines.append(f"- {l}")
        lines.append("")
    return "\n".join(lines)
