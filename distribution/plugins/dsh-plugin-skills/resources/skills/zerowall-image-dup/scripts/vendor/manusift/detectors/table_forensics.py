"""Table-data forgery suite (near-dup, cross-copy, file meta, orchestrator).

Complements ``table_stats`` (Benford / exact dup / outlier / round-bias)
and ``table_relationships``. Designed as the tabular counterpart of
``image_forensics``: multi-signal, explainable, severity-gated.
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult
from .table_stats import (
    BenfordDetector,
    DuplicateRowDetector,
    OutlierDetector,
    RoundBiasDetector,
    _format_table_label,
    _safe_tables,
)

# Keywords that strongly suggest instrument bins / non-scale-free data
# where Benford's law does not apply (DLS, NTA, histograms, etc.).
_INSTRUMENT_KEYWORDS = re.compile(
    r"(?i)\b("
    r"dls|nta|nanoparticle\s*track|dynamic\s*light\s*scatter|"
    r"size\s*distrib|particle\s*size|diameter|"
    r"zeta\s*potential|histogram|bin(ned|ning)?|wavelength|"
    r"flow\s*cytom|fcs|fluorescence\s*intens|"
    r"mass\s*spectrom|mz|retention\s*time|chromatog"
    r")\b"
)

# Particle-size distribution figure/sheet context (Nature-style Source Data).
# e.g. Fig.S1a–f, Sfig.2 — often DLS/NTA multi-channel exports without
# the word "DLS" in the column header.
_PSD_CONTEXT = re.compile(
    r"(?i)("
    r"fig\.?\s*s0*1[a-f]\b|"  # Fig.S1a … Fig.S1f
    r"figure\s*s0*1[a-f]\b|"
    r"sfig\.?\s*2\b|"  # Sfig.2 packing of S1 panels
    r"supp(lementary)?\.?\s*fig\.?\s*2\b|"
    r"particle\s*size|size\s*distrib|psd\b"
    r")"
)

# DLS / PSD channel columns: intensity / number / volume (± %).
# Matched against header primarily; also against full label when PSD context.
_DLS_CHANNEL = re.compile(
    r"(?i)("
    r"\bintensity\b|\bintens\.?\b|"
    r"\bnumber\b|\bnum\.?\b|\bcount\b|"
    r"\bvolume\b|\bvol\.?\b|"
    r"%\s*(intensity|number|volume)|(intensity|number|volume)\s*%|"
    r"size\s*\(?\s*nm\s*\)?|diameter\s*\(?\s*nm\s*\)?|"
    r"\bd\.?\s*nm\b|\bdh\b|\bz[-\s]?average\b"
    r")"
)

# Explicit DLS/NTA toolkit phrases (always gate).
_DLS_EXPLICIT = re.compile(
    r"(?i)\b("
    r"dls|dynamic\s*light\s*scatter|nta|"
    r"nanoparticle\s*track(ing)?\s*analy"
    r")\b"
)

# Minimum sample sizes for Benford applicability.
BENFORD_MIN_N = 50
BENFORD_RELIABLE_N = 100


def _looks_like_size_bin_axis(values: list[float] | None) -> bool:
    """True if values look like DLS size bins (monotone, small positive steps)."""
    if not values or len(values) < BENFORD_MIN_N:
        return False
    pos = [v for v in values if v >= 0]
    if len(pos) < BENFORD_MIN_N:
        return False
    # Mostly non-decreasing
    rises = sum(1 for i in range(1, len(pos)) if pos[i] >= pos[i - 1] - 1e-12)
    if rises / (len(pos) - 1) < 0.95:
        return False
    # Span typically within a few decades of nm-scale bins, start near 0
    if pos[0] > 50:
        return False
    # Median step small relative to range (histogram axis)
    steps = [pos[i] - pos[i - 1] for i in range(1, min(len(pos), 200))]
    steps = [s for s in steps if s >= 0]
    if not steps:
        return False
    med = sorted(steps)[len(steps) // 2]
    span = pos[-1] - pos[0]
    if span <= 0:
        return False
    # Many tiny equal-ish steps → bin axis
    return med <= max(0.05 * span, 5.0) and span < 1e6


def assess_benford_applicability(
    *,
    n: int,
    values: list[float] | None = None,
    fig_name: str = "",
    sheet_name: str = "",
    header: str = "",
    observed_counts: list[int] | None = None,
    sibling_headers: list[str] | None = None,
) -> dict[str, Any]:
    """Return applicability verdict for a Benford test column.

    Keys:
      applicable (bool) — if False, detector should not emit a finding
      max_severity (str) — cap severity when applicable
      reasons (list[str]) — human-readable explainers
      flags (list[str]) — machine tags (instrument_binning, small_n, …)
    """
    reasons: list[str] = []
    flags: list[str] = []
    max_sev = "high"

    if n < BENFORD_MIN_N:
        return {
            "applicable": False,
            "max_severity": "low",
            "reasons": [
                f"n={n} < {BENFORD_MIN_N}; Benford test has no power"
            ],
            "flags": ["small_n"],
        }

    if n < BENFORD_RELIABLE_N:
        max_sev = "medium"
        reasons.append(
            f"n={n} < {BENFORD_RELIABLE_N}; severity capped at medium"
        )
        flags.append("moderate_n")

    fig = fig_name or ""
    sheet = sheet_name or ""
    hdr = header or ""
    label_blob = " ".join([fig, sheet, hdr])
    siblings = " ".join(sibling_headers or [])
    context_blob = " ".join([label_blob, siblings])

    psd_ctx = bool(_PSD_CONTEXT.search(label_blob) or _PSD_CONTEXT.search(siblings))
    dls_explicit = bool(_DLS_EXPLICIT.search(context_blob))
    channel_in_header = bool(_DLS_CHANNEL.search(hdr))
    channel_in_label = bool(_DLS_CHANNEL.search(label_blob))

    # --- DLS intensity / number / volume (and size-axis) hard gate ---
    # Residual high-severity false positives on Nature Source Data often
    # come from Fig.S1b/d/e columns whose headers are bare "intensity" /
    # "number" / "volume" or missing, with only fig_name=Fig.S1*.
    if dls_explicit:
        max_sev = "low"
        reasons.append(
            "explicit DLS/NTA wording in labels; Benford not applicable "
            "to instrument channel outputs"
        )
        flags.append("dls_explicit")

    if psd_ctx:
        max_sev = "low"
        reasons.append(
            "figure/sheet is a particle-size distribution panel "
            "(e.g. Fig.S1a–f / Sfig.2); DLS/NTA-style channels "
            "systematically violate Benford"
        )
        flags.append("psd_figure_context")

    if channel_in_header and (psd_ctx or dls_explicit or _INSTRUMENT_KEYWORDS.search(context_blob)):
        max_sev = "low"
        reasons.append(
            f"column header looks like a DLS/PSD channel ({hdr!r}: "
            "intensity/number/volume/size); cap severity at low"
        )
        flags.append("dls_channel")
    elif channel_in_header and not psd_ctx:
        # Bare "intensity"/"number"/"volume" without PSD context: still
        # downgrade (common DLS export), but keep as low not silent.
        max_sev = "low"
        reasons.append(
            f"column header matches DLS-style channel name ({hdr!r}); "
            "Benford false-positive risk high for intensity/number/volume"
        )
        flags.append("dls_channel_header")

    # Size-bin axis (first column of DLS export): 0, 0.008, 0.016, …
    if _looks_like_size_bin_axis(values):
        max_sev = "low"
        reasons.append(
            "values look like a size-bin axis (monotone small steps); "
            "not multi-scale free data for Benford"
        )
        flags.append("size_bin_axis")

    if _INSTRUMENT_KEYWORDS.search(label_blob):
        max_sev = "low"
        reasons.append(
            "column/fig/sheet name suggests instrument bins or "
            "bounded measurement (DLS/NTA/histogram/etc.); "
            "Benford often false-positive here"
        )
        flags.append("instrument_keyword")

    # Uniform mid-digit pattern (classic DLS intensity bins).
    if observed_counts and len(observed_counts) == 9:
        mid = observed_counts[1:]  # digits 2-9
        if mid and min(mid) > 0:
            mean_mid = sum(mid) / len(mid)
            if mean_mid > 0:
                cv = (statistics_pstdev(mid) / mean_mid) if mean_mid else 0.0
                # Very flat mid-digit counts + large n → binning
                if cv < 0.08 and n >= 200:
                    max_sev = "low"
                    reasons.append(
                        "leading-digit mid-bin counts nearly uniform "
                        f"(cv={cv:.3f}); likely instrument histogram bins"
                    )
                    flags.append("instrument_binning_pattern")
        # Dominant leading digit + PSD/DLS context → still low
        total = sum(observed_counts) or 1
        top = max(observed_counts)
        if top / total >= 0.45 and (psd_ctx or dls_explicit or "dls_channel" in flags):
            max_sev = "low"
            if "dls_skewed_channel" not in flags:
                reasons.append(
                    f"leading digit heavily skewed ({top}/{total}) under "
                    "DLS/PSD context; typical of intensity/number/volume channels"
                )
                flags.append("dls_skewed_channel")

    # Values confined to a narrow positive range (e.g. all in [1, 10))
    if values and len(values) >= BENFORD_MIN_N:
        pos = [v for v in values if v > 0]
        if len(pos) >= BENFORD_MIN_N:
            logs = [math.log10(v) for v in pos]
            span = max(logs) - min(logs)
            if span < 1.0:
                max_sev = "low"
                reasons.append(
                    f"values span <1 order of magnitude (log10 span={span:.2f}); "
                    "Benford assumes multi-scale free data"
                )
                flags.append("narrow_magnitude")
            # DLS intensity often spans >1 decade but is still instrument output
            elif span < 2.5 and (psd_ctx or dls_explicit or channel_in_header):
                max_sev = "low"
                reasons.append(
                    f"values span only {span:.2f} decades under DLS/PSD "
                    "context; treat as instrument channel not free-scale data"
                )
                flags.append("limited_magnitude_dls")

    return {
        "applicable": True,
        "max_severity": max_sev,
        "reasons": reasons,
        "flags": flags,
    }


def statistics_pstdev(xs: list[float | int]) -> float:
    if len(xs) < 2:
        return 0.0
    m = sum(xs) / len(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / len(xs))


def _cap_severity(sev: str, max_sev: str) -> str:
    order = {"low": 0, "medium": 1, "high": 2, "critical": 3}
    if order.get(sev, 0) <= order.get(max_sev, 2):
        return sev
    return max_sev


def _row_key(row: list[Any]) -> tuple[str, ...]:
    return tuple(str(c).strip() for c in row)


def _row_hamming(a: tuple[str, ...], b: tuple[str, ...]) -> int:
    n = max(len(a), len(b))
    diffs = 0
    for i in range(n):
        av = a[i] if i < len(a) else ""
        bv = b[i] if i < len(b) else ""
        if av != bv:
            diffs += 1
    return diffs


class NearDuplicateRowDetector:
    """Flag rows that differ by only 1–2 cells (copy-paste + tweak)."""

    name = "table_near_duplicate_row"
    # Cap pairwise work for large tables.
    MAX_ROWS = 400
    MAX_PAIRS_REPORTED = 25

    def run(self, doc: ParsedDoc) -> DetectorResult:
        findings: list[Finding] = []
        for t_index, table in enumerate(_safe_tables(doc)):
            rows = getattr(table, "rows", []) or []
            if len(rows) < 2:
                continue
            keys = [_row_key(r) for r in rows]
            # Drop exact duplicates from near-dup scan (exact has its own det).
            uniq_idx: dict[tuple[str, ...], int] = {}
            unique_keys: list[tuple[str, ...]] = []
            for k in keys:
                if k not in uniq_idx:
                    uniq_idx[k] = len(unique_keys)
                    unique_keys.append(k)
            if len(unique_keys) < 2:
                continue
            sample = unique_keys[: self.MAX_ROWS]
            min_cols = min(len(k) for k in sample) if sample else 0
            if min_cols < 3:
                continue
            pairs: list[dict[str, Any]] = []
            for i in range(len(sample)):
                for j in range(i + 1, len(sample)):
                    d = _row_hamming(sample[i], sample[j])
                    if 1 <= d <= 2:
                        pairs.append(
                            {
                                "row_a": list(sample[i])[:12],
                                "row_b": list(sample[j])[:12],
                                "diff_cells": d,
                            }
                        )
                        if len(pairs) >= self.MAX_PAIRS_REPORTED:
                            break
                if len(pairs) >= self.MAX_PAIRS_REPORTED:
                    break
            if not pairs:
                continue
            severity = "high" if any(p["diff_cells"] == 1 for p in pairs) else "medium"
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity=severity,
                    title=(
                        f"{_format_table_label(table, t_index)} has "
                        f"{len(pairs)} near-duplicate row pair(s)"
                    ),
                    location=_format_table_label(table, t_index),
                    evidence=json.dumps(
                        {
                            "pair_count": len(pairs),
                            "pairs_preview": pairs[:10],
                            "note": (
                                "Rows differ by 1–2 cells only; often "
                                "copy-paste with a single cell tweak."
                            ),
                        },
                        ensure_ascii=False,
                    ),
                )
            )
        return DetectorResult(
            detector=self.name, findings=findings, ok=True
        )


class CrossTableCopyDetector:
    """Detect identical data rows shared across different tables/sheets."""

    name = "table_cross_copy"
    MIN_ROW_LEN = 2
    MAX_SHARED_REPORT = 20

    def run(self, doc: ParsedDoc) -> DetectorResult:
        findings: list[Finding] = []
        tables = _safe_tables(doc)
        if len(tables) < 2:
            return DetectorResult(
                detector=self.name, findings=[], ok=True
            )

        # map row_hash -> list of (table_index, table_label, source)
        locations: dict[tuple[str, ...], list[dict[str, Any]]] = defaultdict(list)
        for t_index, table in enumerate(tables):
            rows = getattr(table, "rows", []) or []
            label = _format_table_label(table, t_index)
            tid = getattr(table, "table_id", "") or f"t{t_index}"
            path = getattr(table, "source_path", "") or ""
            sheet = getattr(table, "sheet_name", "") or ""
            seen_in_table: set[tuple[str, ...]] = set()
            for row in rows:
                key = _row_key(row)
                if len(key) < self.MIN_ROW_LEN:
                    continue
                # Skip all-empty
                if all(not c for c in key):
                    continue
                if key in seen_in_table:
                    continue
                seen_in_table.add(key)
                locations[key].append(
                    {
                        "table_index": t_index,
                        "table_id": tid,
                        "label": label,
                        "source_path": path,
                        "sheet_name": sheet,
                    }
                )

        shared: list[dict[str, Any]] = []
        for key, locs in locations.items():
            # Distinct tables (by table_id)
            distinct = {loc["table_id"] for loc in locs}
            if len(distinct) < 2:
                continue
            # Ignore pure header-like short tokens
            if sum(1 for c in key if c) < 2:
                continue
            shared.append(
                {
                    "row": list(key)[:12],
                    "tables": list(distinct)[:8],
                    "labels": [loc["label"] for loc in locs[:8]],
                    "n_tables": len(distinct),
                }
            )
            if len(shared) >= self.MAX_SHARED_REPORT:
                break

        if not shared:
            return DetectorResult(
                detector=self.name, findings=[], ok=True
            )

        multi = [s for s in shared if s["n_tables"] >= 3]
        severity = "high" if multi else "medium"
        findings.append(
            Finding.make(
                trace_id=doc.trace_id,
                detector=self.name,
                severity=severity,
                title=(
                    f"{len(shared)} row pattern(s) reused across "
                    f"multiple tables/sheets"
                ),
                location="cross-table",
                evidence=json.dumps(
                    {
                        "shared_count": len(shared),
                        "shared_preview": shared[:10],
                        "note": (
                            "Identical non-empty rows appear in multiple "
                            "tables. May be legitimate shared group labels "
                            "or copy-paste across sheets — review context."
                        ),
                    },
                    ensure_ascii=False,
                ),
            )
        )
        return DetectorResult(
            detector=self.name, findings=findings, ok=True
        )


class TableFileMetadataDetector:
    """Inspect companion spreadsheet file metadata (creator, timestamps)."""

    name = "table_file_metadata"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        findings: list[Finding] = []
        paths: dict[str, list[str]] = defaultdict(list)
        for t_index, table in enumerate(_safe_tables(doc)):
            path = str(getattr(table, "source_path", "") or "")
            if not path:
                continue
            kind = str(getattr(table, "source_kind", "") or "").lower()
            if kind not in ("xlsx", "csv", "tsv", "json", ""):
                # still allow by suffix
                pass
            p = Path(path)
            if p.suffix.lower() not in {".xlsx", ".xlsm", ".csv", ".tsv"}:
                continue
            paths[str(p.resolve()) if p.exists() else path].append(
                _format_table_label(table, t_index)
            )

        if not paths:
            return DetectorResult(
                detector=self.name, findings=[], ok=True
            )

        creators: list[str] = []
        meta_rows: list[dict[str, Any]] = []
        for path_str, labels in paths.items():
            p = Path(path_str)
            entry: dict[str, Any] = {
                "path": path_str,
                "labels": labels[:4],
                "exists": p.exists(),
            }
            if p.exists() and p.suffix.lower() in {".xlsx", ".xlsm"}:
                props = _read_xlsx_props(p)
                entry.update(props)
                if props.get("creator"):
                    creators.append(str(props["creator"]))
            elif p.exists():
                try:
                    st = p.stat()
                    entry["mtime"] = datetime.fromtimestamp(
                        st.st_mtime
                    ).isoformat(timespec="seconds")
                    entry["size"] = st.st_size
                except OSError:
                    pass
            meta_rows.append(entry)

        # Flag: multiple xlsx share identical creator + identical created second
        by_fingerprint: dict[str, list[str]] = defaultdict(list)
        for m in meta_rows:
            if not m.get("creator") and not m.get("created"):
                continue
            fp = f"{m.get('creator','')}|{m.get('created','')}"
            by_fingerprint[fp].append(m["path"])

        for fp, plist in by_fingerprint.items():
            if len(plist) < 3:
                continue
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="medium",
                    title=(
                        f"{len(plist)} spreadsheet files share identical "
                        f"creator/created fingerprint"
                    ),
                    location="source-data files",
                    evidence=json.dumps(
                        {
                            "fingerprint": fp,
                            "files": plist[:12],
                            "note": (
                                "Batch-identical spreadsheet metadata can "
                                "indicate a paper-mill template pack."
                            ),
                        },
                        ensure_ascii=False,
                    ),
                )
            )

        # Always emit a low informational summary so audit trail exists.
        findings.append(
            Finding.make(
                trace_id=doc.trace_id,
                detector=self.name,
                severity="low",
                title=f"audited metadata for {len(meta_rows)} data file(s)",
                location="source-data files",
                evidence=json.dumps(
                    {
                        "files": meta_rows[:20],
                        "unique_creators": sorted(set(creators))[:20],
                    },
                    ensure_ascii=False,
                    default=str,
                ),
            )
        )
        return DetectorResult(
            detector=self.name, findings=findings, ok=True
        )


def _read_xlsx_props(path: Path) -> dict[str, Any]:
    try:
        import openpyxl
    except ImportError:
        return {"error": "openpyxl missing"}
    try:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    except Exception as exc:  # noqa: BLE001
        return {"error": f"{type(exc).__name__}: {exc}"}
    try:
        props = wb.properties
        def _dt(v: Any) -> str | None:
            if v is None:
                return None
            if isinstance(v, datetime):
                return v.isoformat(timespec="seconds")
            return str(v)

        return {
            "creator": getattr(props, "creator", None) or "",
            "last_modified_by": getattr(props, "lastModifiedBy", None) or "",
            "created": _dt(getattr(props, "created", None)),
            "modified": _dt(getattr(props, "modified", None)),
            "title": getattr(props, "title", None) or "",
        }
    finally:
        try:
            wb.close()
        except Exception:  # noqa: BLE001
            pass


class TableForensicsDetector:
    """Agent-only orchestrator for the table-forgery suite.

    **Not** run in the offline pipeline (``PIPELINE_EXCLUDED``): batch
    screen already runs each component detector once. Invoking this
    class again would double-report. Prefer calling individual table_*
    tools, or this suite as a single agent convenience. See
    ``docs/DETECTOR_LAYERS.md``.

    Runs Benford (domain-gated), exact/near duplicate rows, cross-table
    copy, outlier, round-bias, relationships, file metadata, highlight.
    Emits component findings plus one summary risk score.
    """

    name = "table_forensics"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        from .table_relationships import TableRelationshipDetector

        from .table_highlight import TableHighlightFocusDetector

        components: list[Any] = [
            BenfordDetector(),
            DuplicateRowDetector(),
            NearDuplicateRowDetector(),
            CrossTableCopyDetector(),
            OutlierDetector(),
            RoundBiasDetector(),
            TableRelationshipDetector(),
            TableFileMetadataDetector(),
            TableHighlightFocusDetector(),
        ]
        all_findings: list[Finding] = []
        by_det: Counter = Counter()
        by_sev: Counter = Counter()
        for det in components:
            try:
                res = det.run(doc)
            except Exception as exc:  # noqa: BLE001
                all_findings.append(
                    Finding.make(
                        trace_id=getattr(doc, "trace_id", "") or "",
                        detector=self.name,
                        severity="low",
                        title=f"sub-detector {getattr(det, 'name', '?')} failed",
                        location="table_forensics",
                        evidence=json.dumps(
                            {"error": f"{type(exc).__name__}: {exc}"},
                            ensure_ascii=False,
                        ),
                    )
                )
                continue
            for f in res.findings or []:
                all_findings.append(f)
                by_det[f.detector] += 1
                by_sev[str(f.severity)] += 1

        # Risk score: weighted by severity, ignore pure informational low
        # file-meta "audited N files" noise slightly.
        score = 0.0
        actionable = 0
        for f in all_findings:
            sev = str(f.severity)
            if sev == "high":
                score += 0.25
                actionable += 1
            elif sev == "medium":
                score += 0.12
                actionable += 1
            elif sev == "low":
                # skip generic file-meta audit breadcrumb
                if f.detector == "table_file_metadata" and "audited metadata" in (
                    f.title or ""
                ):
                    continue
                score += 0.03
                actionable += 1
        score = min(1.0, score)

        if score >= 0.55 or by_sev.get("high", 0) >= 2:
            summary_sev = "high"
        elif score >= 0.25 or by_sev.get("medium", 0) >= 2:
            summary_sev = "medium"
        else:
            summary_sev = "low"

        n_tables = len(_safe_tables(doc))
        summary = Finding.make(
            trace_id=getattr(doc, "trace_id", "") or "",
            detector=self.name,
            severity=summary_sev,
            title=(
                f"table forensics: {actionable} signal(s) across "
                f"{n_tables} table(s); risk={score:.2f}"
            ),
            location="table_forensics",
            evidence=json.dumps(
                {
                    "risk_score": round(score, 3),
                    "n_tables": n_tables,
                    "actionable_findings": actionable,
                    "by_detector": dict(by_det),
                    "by_severity": dict(by_sev),
                    "suite": [getattr(d, "name", "?") for d in components],
                    "note": (
                        "Aggregate of table forgery detectors. "
                        "High risk requires multi-signal review; "
                        "Benford on instrument bins may be downgraded."
                    ),
                },
                ensure_ascii=False,
            ),
        )
        # Summary first for report skimming
        return DetectorResult(
            detector=self.name,
            findings=[summary, *all_findings],
            ok=True,
        )
