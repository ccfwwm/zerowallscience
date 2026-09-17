"""P4a: recover tabular numbers from figure-region OCR.

Existing ``figure_stat_text`` / ``figure_grim`` only flag isolated
stat tokens. This detector:

  1. OCR figure regions (EasyOCR, best-effort).
  2. Rebuild a coarse grid using detection bboxes (y-cluster → rows).
  3. Emit findings when a numeric table-like grid is recovered.
  4. Optionally cross-check OCR numbers against companion XLSX/CSV
     tables already attached to ``ParsedDoc.tables``.

Honest limits: OCR on dense scientific figures is noisy; findings are
screening signals, not proof of misconduct.
"""
from __future__ import annotations

import logging
import os
import re
from collections import Counter
from importlib.util import find_spec
from typing import Any, Iterable

from ..contracts import ExtractedTable, Finding, ParsedDoc
from .base import DetectorResult

log = logging.getLogger(__name__)

_HAS_EASYOCR = find_spec("easyocr") is not None
_HAS_FITZ = find_spec("fitz") is not None

_MAX_PAGES = int(os.environ.get("MANUSIFT_FIGURE_TABLE_OCR_MAX_PAGES", "12") or "12")
_MAX_REGIONS = int(os.environ.get("MANUSIFT_FIGURE_TABLE_OCR_MAX_REGIONS", "24") or "24")
_MIN_CONF = float(os.environ.get("MANUSIFT_FIGURE_TABLE_OCR_MIN_CONF", "0.35") or "0.35")
_MIN_ROWS = 2
_MIN_COLS = 2
_MIN_NUMERIC_CELLS = 6

_NUM_RE = re.compile(
    r"^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?%?$"
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
    if not t or not _NUM_RE.match(t if not t.startswith(".") else "0" + t):
        # also accept bare .5
        if re.fullmatch(r"[+-]?\.\d+", t or ""):
            t = "0" + t if not t.startswith(("+", "-")) else t[0] + "0" + t[1:]
        else:
            try:
                return float(t)
            except (TypeError, ValueError):
                return None
    try:
        return float(t)
    except (TypeError, ValueError):
        return None


def _bbox_center(box: Any) -> tuple[float, float]:
    """EasyOCR box is 4 points [[x,y],...]."""
    try:
        xs = [float(p[0]) for p in box]
        ys = [float(p[1]) for p in box]
        return (sum(xs) / len(xs), sum(ys) / len(ys))
    except Exception:  # noqa: BLE001
        return (0.0, 0.0)


def cluster_ocr_to_grid(
    detections: list[tuple[Any, str, float]],
    *,
    y_tol: float | None = None,
) -> list[list[str]]:
    """Group (bbox, text, conf) detections into row-major grid of cell texts."""
    items: list[tuple[float, float, str]] = []
    for box, text, conf in detections:
        t = (text or "").strip()
        if not t:
            continue
        cx, cy = _bbox_center(box)
        items.append((cy, cx, t))
    if not items:
        return []
    items.sort(key=lambda x: (x[0], x[1]))
    # adaptive y tolerance from median vertical gap
    if y_tol is None:
        if len(items) >= 2:
            ys = sorted(i[0] for i in items)
            gaps = [
                ys[i + 1] - ys[i]
                for i in range(len(ys) - 1)
                if ys[i + 1] > ys[i]
            ]
            med = sorted(gaps)[len(gaps) // 2] if gaps else 12.0
            y_tol = max(8.0, min(40.0, med * 0.6 if med > 0 else 12.0))
        else:
            y_tol = 12.0

    packed: list[tuple[float, list[tuple[float, str]]]] = []
    for cy, cx, t in items:
        placed = False
        for i, (ry, cells) in enumerate(packed):
            if abs(cy - ry) <= y_tol:
                cells.append((cx, t))
                packed[i] = ((ry * (len(cells) - 1) + cy) / len(cells), cells)
                placed = True
                break
        if not placed:
            packed.append((cy, [(cx, t)]))

    grid: list[list[str]] = []
    for _ry, cells in packed:
        cells.sort(key=lambda c: c[0])
        grid.append([c[1] for c in cells])
    return grid


def grid_numeric_stats(grid: list[list[str]]) -> dict[str, Any]:
    nums: list[float] = []
    n_cells = 0
    for row in grid:
        for cell in row:
            n_cells += 1
            v = _parse_number(cell)
            if v is not None:
                nums.append(v)
    n_rows = len(grid)
    n_cols = max((len(r) for r in grid), default=0)
    return {
        "n_rows": n_rows,
        "n_cols": n_cols,
        "n_cells": n_cells,
        "n_numeric": len(nums),
        "numbers": nums,
        "numeric_ratio": (len(nums) / n_cells) if n_cells else 0.0,
    }


def is_table_like(stats: dict[str, Any]) -> bool:
    return (
        int(stats.get("n_rows") or 0) >= _MIN_ROWS
        and int(stats.get("n_cols") or 0) >= _MIN_COLS
        and int(stats.get("n_numeric") or 0) >= _MIN_NUMERIC_CELLS
        and float(stats.get("numeric_ratio") or 0) >= 0.35
    )


def numbers_from_extracted_tables(
    tables: Iterable[ExtractedTable | Any],
    *,
    kinds: set[str] | None = None,
) -> list[float]:
    out: list[float] = []
    for t in tables:
        sk = str(getattr(t, "source_kind", "") or "")
        if kinds is not None and sk not in kinds:
            continue
        rows = getattr(t, "rows", None) or []
        headers = getattr(t, "headers", None) or []
        for cell in list(headers) + [c for row in rows for c in row]:
            v = _parse_number(str(cell))
            if v is not None:
                out.append(v)
    return out


def round_key(v: float, nd: int = 4) -> float:
    try:
        return round(float(v), nd)
    except (TypeError, ValueError):
        return 0.0


def ocr_vs_source_mismatch(
    ocr_nums: list[float],
    source_nums: list[float],
    *,
    min_ocr: int = 8,
) -> dict[str, Any] | None:
    """Return mismatch summary if OCR values are largely absent from source data."""
    if len(ocr_nums) < min_ocr or len(source_nums) < 3:
        return None
    src = Counter(round_key(v) for v in source_nums)
    ocr = Counter(round_key(v) for v in ocr_nums)
    missing = 0
    for k, c in ocr.items():
        have = src.get(k, 0)
        if have < c:
            missing += c - have
    miss_frac = missing / max(1, sum(ocr.values()))
    if miss_frac < 0.45:
        return None
    return {
        "ocr_n": sum(ocr.values()),
        "source_n": sum(src.values()),
        "missing_count": missing,
        "missing_fraction": round(miss_frac, 4),
        "unique_ocr": len(ocr),
        "unique_source": len(src),
    }


def _column_zero_variance(grid: list[list[str]]) -> list[dict[str, Any]]:
    """Detect constant numeric columns in OCR grid."""
    if not grid:
        return []
    n_cols = max(len(r) for r in grid)
    hits: list[dict[str, Any]] = []
    for c in range(n_cols):
        vals: list[float] = []
        for row in grid:
            if c >= len(row):
                continue
            v = _parse_number(row[c])
            if v is not None:
                vals.append(v)
        if len(vals) >= 4 and len(set(round_key(v, 6) for v in vals)) == 1:
            hits.append({"column": c + 1, "n": len(vals), "value": vals[0]})
    return hits


class FigureTableOCRDetector:
    """Recover table-like numeric grids from figure OCR (P4a)."""

    name = "figure_table_ocr"

    def __init__(self) -> None:
        self._reader: Any = None

    def _get_reader(self) -> Any:
        if self._reader is None:
            if not _HAS_EASYOCR:
                return None
            try:
                import easyocr  # type: ignore
            except ImportError:  # pragma: no cover
                return None
            try:
                self._reader = easyocr.Reader(["en"], gpu=False, verbose=False)
            except Exception:  # noqa: BLE001
                return None
        return self._reader

    def run(self, doc: ParsedDoc) -> DetectorResult:
        if not _env_flag("MANUSIFT_FIGURE_TABLE_OCR", True):
            return DetectorResult(detector=self.name, findings=[], ok=True)
        if not _HAS_FITZ or not _HAS_EASYOCR:
            log.warning("figure_table_ocr: PyMuPDF/EasyOCR missing — no-op")
            return DetectorResult(detector=self.name, findings=[], ok=True)

        reader = self._get_reader()
        if reader is None:
            return DetectorResult(detector=self.name, findings=[], ok=True)

        try:
            import fitz  # type: ignore

            pdf = fitz.open(doc.source_path)
        except Exception as exc:  # noqa: BLE001
            log.warning("figure_table_ocr: open failed: %s", exc)
            return DetectorResult(detector=self.name, findings=[], ok=True)

        from .page_raster_dup import _extract_figure_regions

        source_nums = numbers_from_extracted_tables(
            getattr(doc, "tables", None) or [],
            kinds={"xlsx", "csv"},
        )
        findings: list[Finding] = []
        regions_done = 0
        pages_done = 0

        for page_idx in range(len(pdf)):
            if pages_done >= _MAX_PAGES or regions_done >= _MAX_REGIONS:
                break
            try:
                page = pdf[page_idx]
                regions = _extract_figure_regions(page)
            except Exception:  # noqa: BLE001
                continue
            if not regions:
                continue
            pages_done += 1
            for r_idx, (crop, _bbox) in enumerate(regions):
                if regions_done >= _MAX_REGIONS:
                    break
                regions_done += 1
                try:
                    import numpy as np

                    arr = np.array(crop.convert("RGB"))
                    raw_dets = reader.readtext(arr)
                except Exception as exc:  # noqa: BLE001
                    log.debug("OCR fail p%d r%d: %s", page_idx + 1, r_idx, exc)
                    continue

                dets = [
                    (box, text, float(conf))
                    for box, text, conf in raw_dets
                    if float(conf) >= _MIN_CONF
                ]
                grid = cluster_ocr_to_grid(dets)
                stats = grid_numeric_stats(grid)
                if not is_table_like(stats):
                    continue

                loc = f"Page {page_idx + 1}/region {r_idx}"
                preview = [
                    row[:8] for row in grid[:6]
                ]
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity="low",
                        title="Figure region OCR recovered a numeric table-like grid",
                        evidence=(
                            f"{loc}: OCR grid {stats['n_rows']}×{stats['n_cols']} "
                            f"with {stats['n_numeric']} numeric cells "
                            f"(ratio={stats['numeric_ratio']:.2f})."
                        ),
                        location=loc,
                        raw={
                            "kind": "ocr_table_recovered",
                            "page": page_idx + 1,
                            "region": r_idx,
                            "n_rows": stats["n_rows"],
                            "n_cols": stats["n_cols"],
                            "n_numeric": stats["n_numeric"],
                            "numeric_ratio": stats["numeric_ratio"],
                            "grid_preview": preview,
                            "source_kind": "ocr",
                        },
                    )
                )

                for hit in _column_zero_variance(grid):
                    findings.append(
                        Finding.make(
                            trace_id=doc.trace_id,
                            detector=self.name,
                            severity="medium",
                            title="OCR figure table column has zero variance",
                            evidence=(
                                f"{loc} column {hit['column']} is constant "
                                f"({hit['value']}) over n={hit['n']} OCR cells."
                            ),
                            location=f"{loc}, column {hit['column']}",
                            raw={
                                "kind": "ocr_column_zero_variance",
                                "page": page_idx + 1,
                                "region": r_idx,
                                **hit,
                            },
                        )
                    )

                mm = ocr_vs_source_mismatch(stats["numbers"], source_nums)
                if mm:
                    sev = "high" if mm["missing_fraction"] >= 0.7 else "medium"
                    findings.append(
                        Finding.make(
                            trace_id=doc.trace_id,
                            detector=self.name,
                            severity=sev,  # type: ignore[arg-type]
                            title=(
                                "OCR figure numbers largely absent from "
                                "companion Source Data"
                            ),
                            evidence=(
                                f"{loc}: {mm['missing_fraction']:.0%} of OCR "
                                f"values (n={mm['ocr_n']}) not found in "
                                f"xlsx/csv companions (n={mm['source_n']})."
                            ),
                            location=loc,
                            raw={
                                "kind": "ocr_vs_source_mismatch",
                                "page": page_idx + 1,
                                "region": r_idx,
                                **mm,
                            },
                        )
                    )

        try:
            pdf.close()
        except Exception:  # noqa: BLE001
            pass
        return DetectorResult(detector=self.name, findings=findings, ok=True)
