"""P4b: PDF-extracted tables vs companion Source Data (XLSX/CSV).

Compares rounded numeric multisets between:

  * PDF-side tables: ``pdf_native``, ``pdf_plumber``, ``pdf_text_stat``
  * Companion tables: ``xlsx``, ``csv`` (+ filename-derived SI tags)

Flags:
  * PDF values largely missing from Source Data (possible mismatch /
    incomplete SI / transcription error)
  * Source Data values largely missing from PDF tables (informational —
    SI often contains extra panels)
  * **SI figure alignment** (2026-07): per Source_Data_Fig* / ED_Fig*
    file, report how well its numbers overlap PDF-side numbers (and
    PDF text mentioning that figure)

Does not require OCR. Complements ``figure_table_ocr`` which checks
OCR figure numbers against companions.
"""
from __future__ import annotations

import os
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult

_PDF_KINDS = frozenset({"pdf_native", "pdf_plumber", "pdf_text_stat", "ocr"})
_SRC_KINDS = frozenset({"xlsx", "csv", "json"})

_NUM_RE = re.compile(
    r"^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?%?$"
)

# Source_Data_Fig3_MOESM6.xlsx / Fig.S1A / ED_Fig2 / Extended_Data_Fig_4
_FIG_KEY_RE = re.compile(
    r"(?:"
    r"source[_\s-]?data[_\s-]?)?"
    r"(?:extended[_\s-]?data[_\s-]?)?"
    r"(?:ed[_\s-]?)?"
    r"fig(?:ure)?\.?\s*([sS]?\d+[a-zA-Z]?)",
    re.I,
)
_ED_KEY_RE = re.compile(
    r"(?:ed|extended[_\s-]?data)[_\s-]?fig(?:ure)?\.?\s*(\d+[a-zA-Z]?)",
    re.I,
)


def _env_flag(name: str, default: bool = True) -> bool:
    raw = (os.environ.get(name) or "").strip().lower()
    if not raw:
        return default
    return raw not in {"0", "false", "off", "no"}


def _parse_number(text: str) -> float | None:
    t = (text or "").strip().replace(",", "")
    if t.endswith("%"):
        t = t[:-1].strip()
    if not t:
        return None
    if t.startswith(".") and re.fullmatch(r"\.\d+", t):
        t = "0" + t
    try:
        if _NUM_RE.match(t) or re.fullmatch(r"[+-]?\d+(?:\.\d+)?", t):
            return float(t)
    except (TypeError, ValueError):
        return None
    try:
        return float(t)
    except (TypeError, ValueError):
        return None


def _round_key(v: float, nd: int = 4) -> float:
    return round(float(v), nd)


def _match_keys(v: float) -> set[float]:
    """Multi-precision keys so 1.2300 matches 1.23 in SI."""
    keys = {_round_key(v, 4), _round_key(v, 3), _round_key(v, 2)}
    # integers / near-integers also match at 0 decimals
    if abs(v) >= 1.0 and abs(v - round(v)) < 1e-6:
        keys.add(float(round(v)))
    return keys


def infer_fig_key(*parts: str) -> str | None:
    """Normalize a figure tag from path/sheet/fig_name → ``fig3`` / ``edfig2``."""
    blob = " ".join(p for p in parts if p)
    if not blob:
        return None
    m_ed = _ED_KEY_RE.search(blob)
    if m_ed:
        return f"edfig{m_ed.group(1).lower()}"
    m = _FIG_KEY_RE.search(blob)
    if m:
        tag = m.group(1).lower()
        if tag.startswith("s"):
            return f"figs{tag[1:]}"  # supplementary fig
        return f"fig{tag}"
    # bare filename like Source_Data_Fig1.xlsx
    stem = Path(blob).stem if ("/" in blob or "\\" in blob or "." in blob) else blob
    m2 = re.search(r"fig(?:ure)?[_\s-]*([sS]?\d+[a-zA-Z]?)", stem, re.I)
    if m2:
        tag = m2.group(1).lower()
        if tag.startswith("s"):
            return f"figs{tag[1:]}"
        return f"fig{tag}"
    return None


def collect_numbers(
    tables: Iterable[Any],
    *,
    kinds: frozenset[str],
) -> tuple[list[float], list[str]]:
    nums: list[float] = []
    labels: list[str] = []
    for t in tables:
        sk = str(getattr(t, "source_kind", "") or "")
        if sk not in kinds:
            continue
        fig = str(getattr(t, "fig_name", "") or "")
        sheet = str(getattr(t, "sheet_name", "") or "")
        tid = str(getattr(t, "table_id", "") or "")
        sp = str(getattr(t, "source_path", "") or "")
        label = fig or sheet or Path(sp).name or tid or sk
        labels.append(label)
        headers = getattr(t, "headers", None) or []
        rows = getattr(t, "rows", None) or []
        for cell in list(headers):
            v = _parse_number(str(cell))
            if v is not None:
                nums.append(v)
        for row in rows:
            for cell in row:
                v = _parse_number(str(cell))
                if v is not None:
                    nums.append(v)
    return nums, labels


def collect_by_fig_key(
    tables: Iterable[Any],
    *,
    kinds: frozenset[str],
) -> dict[str, list[float]]:
    """Group numeric cells by inferred SI/PDF figure key."""
    buckets: dict[str, list[float]] = defaultdict(list)
    for t in tables:
        sk = str(getattr(t, "source_kind", "") or "")
        if sk not in kinds:
            continue
        fig = str(getattr(t, "fig_name", "") or "")
        sheet = str(getattr(t, "sheet_name", "") or "")
        sp = str(getattr(t, "source_path", "") or "")
        key = infer_fig_key(fig, sheet, sp, Path(sp).name)
        if not key:
            key = "_untagged"
        headers = getattr(t, "headers", None) or []
        rows = getattr(t, "rows", None) or []
        for cell in list(headers):
            v = _parse_number(str(cell))
            if v is not None:
                buckets[key].append(v)
        for row in rows:
            for cell in row:
                v = _parse_number(str(cell))
                if v is not None:
                    buckets[key].append(v)
    return dict(buckets)


def multiset_missing_fraction(
    query: list[float],
    reference: list[float],
    *,
    multi_precision: bool = True,
) -> tuple[float, int, int]:
    """Fraction of query multiset counts not covered by reference."""
    if not query:
        return 0.0, 0, 0
    if multi_precision:
        # Expand reference into multi-precision bag
        ref: Counter[float] = Counter()
        for v in reference:
            for k in _match_keys(v):
                ref[k] += 1
        missing = 0
        total = 0
        for v in query:
            total += 1
            keys = _match_keys(v)
            # consume one matching key if any
            hit = False
            for k in keys:
                if ref.get(k, 0) > 0:
                    ref[k] -= 1
                    hit = True
                    break
            if not hit:
                missing += 1
        return (missing / total if total else 0.0), missing, total

    ref_c = Counter(_round_key(v) for v in reference)
    q = Counter(_round_key(v) for v in query)
    missing = 0
    total = 0
    for k, c in q.items():
        total += c
        have = ref_c.get(k, 0)
        if have < c:
            missing += c - have
    return (missing / total if total else 0.0), missing, total


def overlap_fraction(a: list[float], b: list[float]) -> float:
    """Fraction of a covered by b (1 - missing)."""
    miss, _, total = multiset_missing_fraction(a, b)
    if total == 0:
        return 0.0
    return 1.0 - miss


class SourceDataConsistencyDetector:
    """Cross-check PDF table numbers against companion Source Data / SI."""

    name = "source_data_consistency"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        if not _env_flag("MANUSIFT_SOURCE_DATA_CONSISTENCY", True):
            return DetectorResult(detector=self.name, findings=[], ok=True)

        tables = getattr(doc, "tables", None) or []
        pdf_nums, pdf_labels = collect_numbers(tables, kinds=_PDF_KINDS)
        src_nums, src_labels = collect_numbers(tables, kinds=_SRC_KINDS)
        src_by_fig = collect_by_fig_key(tables, kinds=_SRC_KINDS)
        pdf_by_fig = collect_by_fig_key(tables, kinds=_PDF_KINDS)

        # Also harvest figure mentions from PDF text for soft SI alignment
        text_blob = "\n".join(
            str(getattr(b, "text", "") or "")
            for b in (getattr(doc, "text_blocks", None) or [])
        )
        text_fig_keys = set()
        for m in re.finditer(
            r"(?:extended\s+data\s+)?fig(?:ure)?\.?\s*([sS]?\d+[a-zA-Z]?)",
            text_blob,
            re.I,
        ):
            tag = m.group(1).lower()
            if tag.startswith("s"):
                text_fig_keys.add(f"figs{tag[1:]}")
            else:
                text_fig_keys.add(f"fig{tag}")
        for m in re.finditer(
            r"extended\s+data\s+fig(?:ure)?\.?\s*(\d+[a-zA-Z]?)",
            text_blob,
            re.I,
        ):
            text_fig_keys.add(f"edfig{m.group(1).lower()}")

        findings: list[Finding] = []

        if not src_nums:
            if len(pdf_nums) >= 20:
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity="info",
                        title="No companion Source Data numbers to cross-check",
                        evidence=(
                            f"PDF-side tables contributed {len(pdf_nums)} numeric "
                            "cells, but no xlsx/csv companion numbers were attached."
                        ),
                        location="companions",
                        raw={
                            "kind": "no_source_data",
                            "check": "source_data_si_align",
                            "pdf_numeric_cells": len(pdf_nums),
                            "pdf_tables": pdf_labels[:20],
                        },
                    )
                )
            return DetectorResult(
                detector=self.name,
                findings=findings,
                ok=True,
                stats={"n_src": 0, "n_pdf": len(pdf_nums)},
            )

        # ----- SI inventory + per-figure alignment -----
        si_alignments: list[dict[str, Any]] = []
        poor_si: list[dict[str, Any]] = []
        for fig_key, snums in sorted(src_by_fig.items()):
            if fig_key == "_untagged" or len(snums) < 6:
                continue
            # Prefer PDF table bucket with same key; else full PDF multiset
            pref = pdf_by_fig.get(fig_key) or []
            pool = pref if len(pref) >= 4 else pdf_nums
            if len(pool) < 4:
                continue
            # SI → PDF coverage (how many SI numbers appear in PDF)
            cov = overlap_fraction(snums, pool)
            # PDF-bucket → SI coverage when we have a dedicated PDF fig table
            cov_pdf = (
                overlap_fraction(pref, snums) if len(pref) >= 4 else None
            )
            rec = {
                "fig_key": fig_key,
                "si_cells": len(snums),
                "pdf_pool_cells": len(pool),
                "si_to_pdf_overlap": round(cov, 4),
                "pdf_to_si_overlap": (
                    round(cov_pdf, 4) if cov_pdf is not None else None
                ),
                "mentioned_in_text": fig_key in text_fig_keys
                or fig_key.replace("edfig", "fig") in text_fig_keys,
            }
            si_alignments.append(rec)
            # Poor SI alignment: SI numbers mostly absent from PDF extracts
            # but figure is claimed in the paper text → review signal
            if (
                cov < 0.15
                and len(snums) >= 12
                and len(pool) >= 20
                and rec["mentioned_in_text"]
            ):
                poor_si.append(rec)

        # Cap SI alignment findings
        for rec in poor_si[:8]:
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="medium",
                    title=(
                        f"SI Source Data for {rec['fig_key']} poorly "
                        f"aligns with PDF table numbers"
                    ),
                    evidence=(
                        f"Companion numbers for {rec['fig_key']} "
                        f"(n={rec['si_cells']}) overlap PDF-extracted values "
                        f"at only {rec['si_to_pdf_overlap']:.0%}. "
                        "Figure is mentioned in the manuscript text. "
                        "Possible incomplete SI, wrong figure mapping, or "
                        "PDF table extraction missing the plotted values."
                    ),
                    location=f"SI {rec['fig_key']} ↔ PDF tables",
                    raw={
                        "kind": "si_fig_poor_align",
                        "check": "source_data_si_align",
                        "pubpeer_pattern": "source_data_vs_figure_mismatch",
                        **rec,
                    },
                )
            )

        # Global multiset checks (original behaviour, multi-precision)
        if len(pdf_nums) >= 8:
            miss_frac, miss_n, total = multiset_missing_fraction(
                pdf_nums, src_nums
            )
            if miss_frac >= 0.35 and miss_n >= 10:
                sev = "high" if miss_frac >= 0.65 else "medium"
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity=sev,  # type: ignore[arg-type]
                        title="PDF table numbers largely absent from Source Data",
                        evidence=(
                            f"{miss_frac:.0%} of PDF-extracted numeric cells "
                            f"({miss_n}/{total}) have no matching value in companion "
                            f"xlsx/csv (source cells={len(src_nums)}). "
                            "Possible incomplete SI, transcription error, or "
                            "PDF/table extraction noise."
                        ),
                        location="PDF tables ↔ Source Data",
                        raw={
                            "kind": "pdf_missing_in_source",
                            "check": "source_data_si_align",
                            "missing_fraction": round(miss_frac, 4),
                            "missing_count": miss_n,
                            "pdf_total": total,
                            "source_total": len(src_nums),
                            "pdf_tables": pdf_labels[:20],
                            "source_tables": src_labels[:20],
                            "si_alignments": si_alignments[:20],
                        },
                    )
                )

            inv_frac, inv_n, inv_total = multiset_missing_fraction(
                src_nums, pdf_nums
            )
            if inv_frac >= 0.55 and inv_n >= 30 and len(pdf_nums) >= 20:
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity="low",
                        title=(
                            "Source Data contains many numbers not seen "
                            "in PDF tables"
                        ),
                        evidence=(
                            f"{inv_frac:.0%} of Source Data numeric cells "
                            f"({inv_n}/{inv_total}) are not present in PDF-extracted "
                            "tables. Often normal for multi-panel SI; review if PDF "
                            "tables claim to fully report the same experiments."
                        ),
                        location="Source Data ↔ PDF tables",
                        raw={
                            "kind": "source_extra_vs_pdf",
                            "check": "source_data_si_align",
                            "missing_fraction": round(inv_frac, 4),
                            "missing_count": inv_n,
                            "source_total": inv_total,
                            "pdf_total": len(pdf_nums),
                            "si_alignments": si_alignments[:20],
                        },
                    )
                )

            # Plausible global overlap + SI fig map summary
            if not findings and len(pdf_nums) >= 20 and len(src_nums) >= 20:
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity="info",
                        title=(
                            "PDF tables and Source Data numeric overlap "
                            "looks plausible"
                        ),
                        evidence=(
                            f"PDF numeric cells={len(pdf_nums)}, "
                            f"source={len(src_nums)}; "
                            f"PDF→source missing fraction={miss_frac:.0%}. "
                            f"SI figure tags aligned: "
                            f"{len(si_alignments)} "
                            f"({', '.join(r['fig_key'] for r in si_alignments[:8])}"
                            f"{'…' if len(si_alignments) > 8 else ''})."
                        ),
                        location="PDF tables ↔ Source Data",
                        raw={
                            "kind": "overlap_ok",
                            "check": "source_data_si_align",
                            "missing_fraction": round(miss_frac, 4),
                            "pdf_total": len(pdf_nums),
                            "source_total": len(src_nums),
                            "si_alignments": si_alignments[:20],
                            "si_fig_keys": sorted(
                                k for k in src_by_fig if k != "_untagged"
                            )[:30],
                        },
                    )
                )
        elif src_nums and si_alignments:
            # PDF extracted few numbers but SI is rich — still report inventory
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="info",
                    title="Source Data SI attached; PDF tables sparse",
                    evidence=(
                        f"Companion xlsx/csv contributed {len(src_nums)} numeric "
                        f"cells across {len(si_alignments)} figure-tagged SI "
                        f"files, but PDF-side tables only had {len(pdf_nums)} "
                        "numbers — SI alignment is limited by PDF extraction."
                    ),
                    location="Source Data SI",
                    raw={
                        "kind": "si_present_pdf_sparse",
                        "check": "source_data_si_align",
                        "source_total": len(src_nums),
                        "pdf_total": len(pdf_nums),
                        "si_alignments": si_alignments[:20],
                    },
                )
            )

        # Always leave a lightweight SI inventory when source present and
        # nothing else fired (so smoke/gold can see the detector ran).
        if src_nums and not findings:
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="info",
                    title="Source Data / SI companions inventoried",
                    evidence=(
                        f"Attached {len(src_labels)} companion table(s), "
                        f"{len(src_nums)} numeric cells; "
                        f"figure tags: "
                        f"{sorted(k for k in src_by_fig if k != '_untagged')[:12]}."
                    ),
                    location="companions",
                    raw={
                        "kind": "si_inventory",
                        "check": "source_data_si_align",
                        "source_total": len(src_nums),
                        "pdf_total": len(pdf_nums),
                        "si_fig_keys": sorted(
                            k for k in src_by_fig if k != "_untagged"
                        )[:30],
                        "si_alignments": si_alignments[:20],
                    },
                )
            )

        return DetectorResult(
            detector=self.name,
            findings=findings,
            ok=True,
            stats={
                "n_src": len(src_nums),
                "n_pdf": len(pdf_nums),
                "n_si_fig_keys": len(
                    [k for k in src_by_fig if k != "_untagged"]
                ),
                "n_si_alignments": len(si_alignments),
            },
        )
