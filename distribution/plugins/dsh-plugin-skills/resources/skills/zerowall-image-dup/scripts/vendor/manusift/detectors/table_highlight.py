"""Table highlight-focus detector (P0 deep-screen).

Authors / journals often mark suspicious or source-of-truth cells with
yellow (or other) fills in SI spreadsheets. ManuSift already extracts
those into ``ExtractedTable.highlighted_cells`` during XLSX ingest.

This detector **closes the loop**:

1. Inventory every table that has visible fills.
2. Focus numeric forensics on highlighted columns / rows
   (duplicate values, fixed offsets, perfect arithmetic, zero SD-like
   concentration on marked cells).
3. Surface findings that name the fig (``fig_name``) and cell coords
   so a reviewer can jump straight to the author's marks.

Not a misconduct verdict — a prioritization + local-pattern screen.
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult
from .table_stats import _format_table_label, _safe_tables

# Common "highlighter" RGB fills (case-insensitive, no #).
# Includes Excel standard yellows and light amber themes used in SI.
_YELLOW_LIKE = {
    "FFFF00",
    "FFFFFF00",
    "FFFF99",
    "FFEB9C",
    "FFF2CC",
    "FFC000",
    "FFD966",
    "FFE699",
    "FFFFCC",
    "00FFFF00",  # some xlsx store AARRGGBB
}

MIN_MARKED_VALUES = 3


def _decimal_cell(cell: Any) -> Decimal | None:
    text = str(cell).strip()
    if not text:
        return None
    try:
        return Decimal(text.replace(",", "").rstrip("%"))
    except InvalidOperation:
        return None


def _round_d(value: Decimal, places: str = "0.000001") -> Decimal:
    return value.quantize(Decimal(places), rounding=ROUND_HALF_UP)


def _is_yellow_like(fill: str | None) -> bool:
    if not fill:
        return False
    f = str(fill).upper().replace("#", "")
    if f in _YELLOW_LIKE:
        return True
    # AARRGGBB → RRGGBB
    if len(f) == 8 and f[2:] in _YELLOW_LIKE:
        return True
    # Loose: high R+G, low B → yellowish
    if len(f) == 6:
        try:
            r, g, b = int(f[0:2], 16), int(f[2:4], 16), int(f[4:6], 16)
            if r >= 200 and g >= 180 and b <= 160:
                return True
        except ValueError:
            pass
    return False


def _json(payload: dict[str, Any]) -> str:
    def conv(v: Any) -> Any:
        if isinstance(v, Decimal):
            if v == int(v):
                return int(v)
            return float(v)
        if isinstance(v, list):
            return [conv(x) for x in v]
        if isinstance(v, dict):
            return {k: conv(x) for k, x in v.items()}
        return v

    return json.dumps(conv(payload), ensure_ascii=False)


class TableHighlightFocusDetector:
    """Prioritize author-highlighted spreadsheet cells for deep table checks."""

    name = "table_highlight_focus"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        findings: list[Finding] = []
        tables = _safe_tables(doc)
        n_with_hl = 0
        n_hl_cells = 0
        n_yellow = 0

        for t_index, table in enumerate(tables):
            cells = list(getattr(table, "highlighted_cells", None) or [])
            if not cells:
                continue
            n_with_hl += 1
            n_hl_cells += len(cells)
            label = _format_table_label(table, t_index)
            headers = list(getattr(table, "headers", None) or [])
            rows = list(getattr(table, "rows", None) or [])
            fig_name = getattr(table, "fig_name", "") or ""
            table_id = getattr(table, "table_id", "") or ""

            yellow = [c for c in cells if _is_yellow_like(str(c.get("fill") or ""))]
            n_yellow += len(yellow)
            fills = Counter(str(c.get("fill") or "?") for c in cells)

            # --- 1) Inventory finding ---
            sev = "medium" if yellow or len(cells) >= 5 else "low"
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity=sev,  # type: ignore[arg-type]
                    title=(
                        f"{label}: {len(cells)} highlighted cell(s)"
                        + (f" ({len(yellow)} yellow-like)" if yellow else "")
                    ),
                    location=label,
                    evidence=_json(
                        {
                            "check": "highlight_inventory",
                            "table_id": table_id,
                            "fig_name": fig_name,
                            "n_highlighted": len(cells),
                            "n_yellow_like": len(yellow),
                            "fill_counts": dict(fills.most_common(8)),
                            "sample_cells": [
                                {
                                    "row": c.get("row"),
                                    "col": c.get("col"),
                                    "source_row": c.get("source_row"),
                                    "source_col": c.get("source_col"),
                                    "value": c.get("value"),
                                    "fill": c.get("fill"),
                                }
                                for c in cells[:12]
                            ],
                        }
                    ),
                    raw={
                        "kind": "highlight_inventory",
                        "table_id": table_id,
                        "fig_name": fig_name,
                        "n_highlighted": len(cells),
                        "n_yellow_like": len(yellow),
                    },
                )
            )

            # --- 2) Column-focused checks on highlighted columns ---
            by_col: dict[int, list[dict[str, Any]]] = defaultdict(list)
            for c in cells:
                try:
                    col = int(c.get("col", -1))
                except (TypeError, ValueError):
                    continue
                if col < 0:
                    continue
                by_col[col].append(c)

            for col, col_cells in sorted(by_col.items()):
                header = (
                    headers[col]
                    if col < len(headers)
                    else f"col_{col + 1}"
                )
                values: list[Decimal] = []
                texts: list[str] = []
                for c in col_cells:
                    val = c.get("value")
                    if val is None:
                        # fall back to table grid
                        r = c.get("row")
                        try:
                            ri = int(r) if r is not None else -1
                        except (TypeError, ValueError):
                            ri = -1
                        if 0 <= ri < len(rows) and col < len(rows[ri]):
                            val = rows[ri][col]
                    text = str(val or "").strip()
                    if not text:
                        continue
                    texts.append(text)
                    d = _decimal_cell(text)
                    if d is not None:
                        values.append(d)

                if len(values) >= MIN_MARKED_VALUES:
                    # Improbable exact repeats among marked cells
                    most_val, most_n = Counter(values).most_common(1)[0]
                    if most_n / len(values) >= 0.75 and most_n >= MIN_MARKED_VALUES:
                        findings.append(
                            Finding.make(
                                trace_id=doc.trace_id,
                                detector=self.name,
                                severity="high",
                                title=(
                                    f"{label} highlighted column '{header}' "
                                    f"repeats value {most_val} in {most_n}/"
                                    f"{len(values)} marked cells"
                                ),
                                location=f"{label}, highlighted col {col + 1}",
                                evidence=_json(
                                    {
                                        "check": "highlight_column_repeated_values",
                                        "column": header,
                                        "col_index": col,
                                        "n_marked_numeric": len(values),
                                        "repeated_value": most_val,
                                        "repeat_count": most_n,
                                        "fig_name": fig_name,
                                        "table_id": table_id,
                                    }
                                ),
                                raw={
                                    "kind": "highlight_column_repeated_values",
                                    "column": header,
                                    "repeat_count": most_n,
                                    "n": len(values),
                                },
                            )
                        )
                    # Zero variance on marked cells
                    if len(set(values)) == 1:
                        findings.append(
                            Finding.make(
                                trace_id=doc.trace_id,
                                detector=self.name,
                                severity="medium",
                                title=(
                                    f"{label} highlighted column '{header}' "
                                    "has zero variance among marked cells"
                                ),
                                location=f"{label}, highlighted col {col + 1}",
                                evidence=_json(
                                    {
                                        "check": "highlight_column_zero_variance",
                                        "column": header,
                                        "value": values[0],
                                        "n": len(values),
                                        "fig_name": fig_name,
                                    }
                                ),
                                raw={
                                    "kind": "highlight_column_zero_variance",
                                    "column": header,
                                },
                            )
                        )
                    # Near-perfect arithmetic on marked numeric sequence
                    # (only when marks are in increasing row order)
                    ordered = sorted(
                        col_cells,
                        key=lambda x: int(x.get("row") or 0),
                    )
                    seq: list[Decimal] = []
                    for c in ordered:
                        d = _decimal_cell(c.get("value"))
                        if d is None:
                            r = c.get("row")
                            try:
                                ri = int(r) if r is not None else -1
                            except (TypeError, ValueError):
                                ri = -1
                            if 0 <= ri < len(rows) and col < len(rows[ri]):
                                d = _decimal_cell(rows[ri][col])
                        if d is not None:
                            seq.append(d)
                    if len(seq) >= 4:
                        diffs = [
                            _round_d(seq[i + 1] - seq[i])
                            for i in range(len(seq) - 1)
                        ]
                        if len(set(diffs)) == 1 and diffs[0] != 0:
                            findings.append(
                                Finding.make(
                                    trace_id=doc.trace_id,
                                    detector=self.name,
                                    severity="medium",
                                    title=(
                                        f"{label} highlighted column '{header}' "
                                        "forms an arithmetic progression"
                                    ),
                                    location=f"{label}, highlighted col {col + 1}",
                                    evidence=_json(
                                        {
                                            "check": "highlight_arithmetic_progression",
                                            "column": header,
                                            "step": diffs[0],
                                            "n": len(seq),
                                            "fig_name": fig_name,
                                        }
                                    ),
                                    raw={
                                        "kind": "highlight_arithmetic_progression",
                                        "step": str(diffs[0]),
                                    },
                                )
                            )

            # --- 3) Pair of highlighted columns: fixed offset ---
            col_items = sorted(by_col.items())
            col_values: dict[int, list[Decimal]] = {}
            for col, col_cells in col_items:
                vals: list[Decimal] = []
                for c in sorted(col_cells, key=lambda x: int(x.get("row") or 0)):
                    d = _decimal_cell(c.get("value"))
                    if d is None:
                        r = c.get("row")
                        try:
                            ri = int(r) if r is not None else -1
                        except (TypeError, ValueError):
                            ri = -1
                        if 0 <= ri < len(rows) and col < len(rows[ri]):
                            d = _decimal_cell(rows[ri][col])
                    if d is not None:
                        vals.append(d)
                if len(vals) >= MIN_MARKED_VALUES:
                    col_values[col] = vals

            col_keys = sorted(col_values)
            for i, left_col in enumerate(col_keys):
                for right_col in col_keys[i + 1 :]:
                    left = col_values[left_col]
                    right = col_values[right_col]
                    n = min(len(left), len(right))
                    if n < MIN_MARKED_VALUES:
                        continue
                    left, right = left[:n], right[:n]
                    diffs = [_round_d(right[j] - left[j]) for j in range(n)]
                    if len(set(diffs)) == 1:
                        lh = (
                            headers[left_col]
                            if left_col < len(headers)
                            else f"col_{left_col + 1}"
                        )
                        rh = (
                            headers[right_col]
                            if right_col < len(headers)
                            else f"col_{right_col + 1}"
                        )
                        findings.append(
                            Finding.make(
                                trace_id=doc.trace_id,
                                detector=self.name,
                                severity="high" if diffs[0] == 0 else "medium",
                                title=(
                                    f"{label} highlighted columns '{lh}' and "
                                    f"'{rh}' have fixed offset {diffs[0]}"
                                ),
                                location=(
                                    f"{label}, highlighted cols "
                                    f"{left_col + 1} & {right_col + 1}"
                                ),
                                evidence=_json(
                                    {
                                        "check": "highlight_fixed_offset",
                                        "left_column": lh,
                                        "right_column": rh,
                                        "offset": diffs[0],
                                        "n": n,
                                        "fig_name": fig_name,
                                        "table_id": table_id,
                                    }
                                ),
                                raw={
                                    "kind": "highlight_fixed_offset",
                                    "offset": str(diffs[0]),
                                    "n": n,
                                },
                            )
                        )

        if n_with_hl == 0:
            return DetectorResult(detector=self.name, findings=[], ok=True)

        summary = Finding.make(
            trace_id=doc.trace_id,
            detector=self.name,
            severity="medium" if n_yellow or n_hl_cells >= 10 else "low",
            title=(
                f"table highlight focus: {n_hl_cells} marked cell(s) across "
                f"{n_with_hl} table(s)"
                + (f"; {n_yellow} yellow-like" if n_yellow else "")
            ),
            location="table_highlight_focus",
            evidence=_json(
                {
                    "check": "highlight_summary",
                    "n_tables_with_highlights": n_with_hl,
                    "n_highlighted_cells": n_hl_cells,
                    "n_yellow_like": n_yellow,
                    "n_component_findings": len(findings),
                    "note": (
                        "Author/editor fills prioritize these cells for "
                        "manual review; component checks scan only marked "
                        "columns for copy/offset/AP patterns."
                    ),
                }
            ),
            raw={
                "kind": "highlight_summary",
                "n_tables_with_highlights": n_with_hl,
                "n_highlighted_cells": n_hl_cells,
                "n_yellow_like": n_yellow,
            },
        )
        return DetectorResult(
            detector=self.name,
            findings=[summary, *findings],
            ok=True,
        )
