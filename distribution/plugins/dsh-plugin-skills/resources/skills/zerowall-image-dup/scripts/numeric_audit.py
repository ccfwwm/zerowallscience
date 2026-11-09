"""Auditable B1-B5 checks for spreadsheet, delimited, PDF-table and OCR values.

These are screening rules. They preserve the originating coordinate and never
make an integrity verdict without human review.
"""
from __future__ import annotations

import ast
import csv
import re
from collections import Counter, defaultdict
from dataclasses import asdict, is_dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Iterable


_NUMBER = re.compile(r"(?<![A-Za-z0-9])[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?(?![A-Za-z0-9])")
_CYCLE = re.compile(r"(?P<chunk>\d{2,4})\1{2,}")
_FIG = re.compile(r"\b(?:extended\s+data\s+)?fig(?:ure)?\.?\s*(S?\d+[A-Za-z]?)", re.I)
_CELL_REF = re.compile(r"\$?([A-Z]{1,3})\$?(\d+)", re.I)
_UNIT = re.compile(r"(?<![A-Za-z])(?:%|mmol\s*/\s*l|nmol\s*/\s*l|umol\s*/\s*l|μmol\s*/\s*l|mg\s*/\s*ml|ug\s*/\s*ml|μg\s*/\s*ml|ng\s*/\s*ml|mm|cm|ml|μl|ul|\u00b5l|s|ms|h|days?)(?![A-Za-z])", re.I)


def _decimal(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    raw = str(value).strip().replace(",", "")
    if raw.endswith("%"):
        raw = raw[:-1]
    try:
        number = Decimal(raw)
        return number if number.is_finite() else None
    except (InvalidOperation, ValueError):
        return None


def _canonical(number: Decimal) -> str:
    normalized = number.normalize()
    if normalized == normalized.to_integral():
        return str(normalized.quantize(Decimal(1)))
    return format(normalized, "f")


def _coordinate_row(sheet: str, cell: str, page: int | None, bbox: Any,
                    raw: str, value: Decimal, source_file: str, role: str = "table") -> dict[str, Any]:
    decimals = len(raw.split(".", 1)[1].rstrip("%")) if "." in raw else 0
    return {"source_file": source_file, "sheet": sheet, "cell": cell, "page": page,
            "bbox": bbox, "raw": raw, "value": value, "decimals": decimals, "role": role}


def _xlsx_rows(path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    try:
        import openpyxl
    except Exception as error:  # noqa: BLE001
        return [], [], [f"openpyxl unavailable: {error}"]
    try:
        values_wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
        formulas_wb = openpyxl.load_workbook(path, data_only=False, read_only=True)
    except Exception as error:  # noqa: BLE001
        return [], [], [str(error)]
    values: list[dict[str, Any]] = []
    formula_rows: list[dict[str, Any]] = []
    errors: list[str] = []
    try:
        for sheet_name in formulas_wb.sheetnames:
            ws = formulas_wb[sheet_name]
            value_ws = values_wb[sheet_name]
            rows: dict[int, dict[int, Any]] = {}
            figure_headers: list[tuple[int, int, str]] = []
            sheet_formulas: list[dict[str, Any]] = []
            for row_index, (formula_row, cached_row) in enumerate(zip(ws.iter_rows(), value_ws.iter_rows()), 1):
                current = {cell.column: cell.value for cell in formula_row if cell.value is not None}
                if not current:
                    continue
                rows[row_index] = current
                for col, value in current.items():
                    if isinstance(value, str) and (match := _FIG.search(value)):
                        figure_headers.append((row_index, col, match.group(1).upper()))
                for cell in formula_row:
                    value = cell.value
                    if value is None:
                        continue
                    col = cell.column
                    cached = cached_row[col - 1].value if col <= len(cached_row) else None
                    if isinstance(value, str) and value.startswith("="):
                        sheet_formulas.append({"source_file": str(path), "sheet": sheet_name,
                                               "cell": cell.coordinate, "formula": value,
                                               "cached": cached, "number_format": cell.number_format})
                        continue
                    if hasattr(value, "year") and hasattr(value, "month"):
                        continue
                    number = _decimal(value)
                    if number is None or not (isinstance(value, (int, float, Decimal)) or _NUMBER.fullmatch(str(value).strip())):
                        continue
                    raw = str(value).strip()
                    headers = [str(rows.get(r, {}).get(col) or "").strip().lower()
                               for r in range(1, min(row_index, 4) + 1)]
                    if any(re.fullmatch(r"(?:sample\s*(?:id|name)|(?:patient|subject|record)\s*id|accession(?:\s*number)?|date|timestamp|file\s*code)", h)
                           for h in headers):
                        continue
                    entry = _coordinate_row(sheet_name, cell.coordinate, None, None, raw, number, str(path))
                    entry["row_context"] = " ".join(str(current.get(c) or "")
                                                     for c in range(max(1, col - 2), col + 2))
                    entry["row_label"] = str(current.get(1, ""))
                    nearby_figures = (header for header in figure_headers if header[1] <= col)
                    nearest = max(nearby_figures, key=lambda x: (x[0], x[1]), default=None)
                    if nearest:
                        entry["figure"] = nearest[2]
                    values.append(entry)
            if sheet_formulas:
                cells = {f"{_column_name(c)}{r}": v for r, cols in rows.items() for c, v in cols.items()}
                for item in sheet_formulas:
                    item["cells"] = cells
                formula_rows.extend(sheet_formulas)
    except Exception as error:  # noqa: BLE001
        errors.append(f"{sheet_name}: {error}")
    finally:
        formulas_wb.close()
        values_wb.close()
    return values, formula_rows, errors


def _column_name(index: int) -> str:
    out = ""
    while index:
        index, rem = divmod(index - 1, 26)
        out = chr(65 + rem) + out
    return out


def _csv_rows(path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    values: list[dict[str, Any]] = []
    errors: list[str] = []
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as stream:
            dialect = "\t" if path.suffix.lower() == ".tsv" else ","
            for row_index, row in enumerate(csv.reader(stream, delimiter=dialect), 1):
                for col_index, value in enumerate(row, 1):
                    number = _decimal(value)
                    if number is None or not _NUMBER.fullmatch(value.strip()):
                        continue
                    coordinate = f"{_column_name(col_index)}{row_index}"
                    entry = _coordinate_row(path.stem, coordinate, None, None, value.strip(), number, str(path))
                    entry["row_context"] = " ".join(row)
                    entry["row_label"] = row[0] if row else ""
                    values.append(entry)
    except Exception as error:  # noqa: BLE001
        errors.append(str(error))
    return values, [], errors


def _eval_ast(node: ast.AST) -> Decimal:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return Decimal(str(node.value))
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        value = _eval_ast(node.operand)
        return value if isinstance(node.op, ast.UAdd) else -value
    if isinstance(node, ast.BinOp):
        left, right = _eval_ast(node.left), _eval_ast(node.right)
        if isinstance(node.op, ast.Add): return left + right
        if isinstance(node.op, ast.Sub): return left - right
        if isinstance(node.op, ast.Mult): return left * right
        if isinstance(node.op, ast.Div): return left / right
        if isinstance(node.op, ast.Pow) and right == right.to_integral(): return left ** int(right)
    raise ValueError("unsupported formula expression")


def _column_number(column: str) -> int:
    result = 0
    for char in column.upper():
        result = result * 26 + ord(char) - 64
    return result


def _calculate_formula(formula: str, cells: dict[str, Any]) -> Decimal:
    expression = formula.lstrip("=").replace("^", "**")
    ttest = re.fullmatch(r"TTEST\((\$?[A-Z]{1,3}\$?\d+):(\$?[A-Z]{1,3}\$?\d+),(\$?[A-Z]{1,3}\$?\d+):(\$?[A-Z]{1,3}\$?\d+),([12]),([123])\)", expression, re.I)
    if ttest:
        from scipy import stats
        def values_between(first: str, last: str) -> list[float]:
            a, b = _CELL_REF.fullmatch(first), _CELL_REF.fullmatch(last)
            if not a or not b:
                raise ValueError("invalid TTEST range")
            values = []
            for row in range(int(a.group(2)), int(b.group(2)) + 1):
                for col in range(_column_number(a.group(1)), _column_number(b.group(1)) + 1):
                    number = _decimal(cells.get(f"{_column_name(col)}{row}"))
                    if number is not None:
                        values.append(float(number))
            return values
        a = values_between(ttest.group(1), ttest.group(2))
        b = values_between(ttest.group(3), ttest.group(4))
        if min(len(a), len(b)) < 2:
            raise ValueError("TTEST needs at least two observations per group")
        test_type = int(ttest.group(6))
        if test_type == 1:
            if len(a) != len(b):
                raise ValueError("paired TTEST groups have different lengths")
            statistic, pvalue = stats.ttest_rel(a, b)
        else:
            statistic, pvalue = stats.ttest_ind(a, b, equal_var=test_type == 2)
        if int(ttest.group(5)) == 1:
            pvalue /= 2
        result = _decimal(pvalue)
        if result is None:
            raise ValueError("TTEST produced a nonfinite result")
        return result
    def sum_range(match: re.Match[str]) -> str:
        first, last = match.group(1).upper(), match.group(2).upper()
        a, b = _CELL_REF.fullmatch(first), _CELL_REF.fullmatch(last)
        if not a or not b:
            raise ValueError("invalid SUM range")
        c0, c1 = _column_number(a.group(1)), _column_number(b.group(1))
        r0, r1 = int(a.group(2)), int(b.group(2))
        total = Decimal(0)
        for row in range(min(r0, r1), max(r0, r1) + 1):
            for col in range(min(c0, c1), max(c0, c1) + 1):
                total += _decimal(cells.get(f"{_column_name(col)}{row}")) or Decimal(0)
        return str(total)
    expression = re.sub(r"SUM\(\s*(\$?[A-Z]{1,3}\$?\d+)\s*:\s*(\$?[A-Z]{1,3}\$?\d+)\s*\)", sum_range, expression, flags=re.I)
    def cell_value(match: re.Match[str]) -> str:
        token = match.group(0).upper().replace("$", "")
        # Keep scientific notation's exponent marker intact by refusing a
        # match embedded in a numeric literal.
        value = _decimal(cells.get(token))
        if value is None:
            raise ValueError(f"cell {token} has no cached numeric value")
        return str(value)
    expression = _CELL_REF.sub(cell_value, expression)
    # Excel function names and strings are intentionally not evaluated.
    if re.search(r"[A-Za-z_]", expression):
        raise ValueError("formula contains an unsupported function or name")
    return _eval_ast(ast.parse(expression, mode="eval").body)


def _finding(detector: str, source: dict[str, Any], observed: Any, expected: Any,
             recalculation: str, confidence: str, title: str, evidence: str,
             related: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {"detector": detector, "source_file": source["source_file"], "sheet": source.get("sheet", ""),
            "cell": source.get("cell", ""), "page": source.get("page"), "bbox": source.get("bbox"),
            "observed": str(observed), "expected": str(expected), "recalculation": recalculation,
            "confidence": confidence, "needs_manual_review": True, "title": title,
            "evidence": evidence, "related_sources": related or []}


def audit(paths: Iterable[str | Path], *, tables: Iterable[Any] = (),
          text_blocks: Iterable[Any] = (), ocr_records: Iterable[dict[str, Any]] = ()) -> dict[str, Any]:
    """Run conservative numerical checks and return coverage plus findings."""
    findings: list[dict[str, Any]] = []
    numeric: list[dict[str, Any]] = []
    formulas: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    data_files = [Path(p) for p in paths if Path(p).suffix.lower() in {".xlsx", ".csv", ".tsv"}]
    for path in sorted(set(data_files), key=str):
        if path.suffix.lower() == ".xlsx":
            values, formula_rows, issues = _xlsx_rows(path)
        else:
            values, formula_rows, issues = _csv_rows(path)
        numeric.extend(values)
        formulas.extend(formula_rows)
        errors.extend({"source_file": str(path), "reason": issue} for issue in issues)

    # Native and MinerU table cells join the same long-tail number index.
    for table in tables:
        record = asdict(table) if is_dataclass(table) else dict(table) if isinstance(table, dict) else {}
        rows = record.get("rows") or []
        source_file = str(record.get("source_path") or "")
        sheet = str(record.get("sheet_name") or "")
        page = record.get("source_index")
        for ri, row in enumerate(rows, 1):
            for ci, raw_value in enumerate(row, 1):
                raw = str(raw_value or "").strip()
                number = _decimal(raw)
                if number is None or not _NUMBER.fullmatch(raw):
                    continue
                entry = _coordinate_row(sheet, f"R{ri}C{ci}", page, record.get("bbox"), raw, number, source_file)
                entry["row_label"] = str(row[0]) if row else ""
                entry["row_context"] = " ".join(str(cell) for cell in row)
                numeric.append(entry)

    for record in ocr_records:
        source_file = str(record.get("source_file") or "")
        page = record.get("page")
        for item in record.get("numbers", []):
            raw = str(item.get("text") or "").strip()
            number = _decimal(raw)
            if number is None:
                continue
            confidence = item.get("confidence")
            try:
                confidence = float(confidence)
            except (TypeError, ValueError):
                confidence = 0.0
            entry = _coordinate_row("OCR", f"{record.get('image_id') or 'image'}:{item.get('index', '')}",
                                    page, item.get("bbox"), raw, number, source_file, "ocr")
            entry["confidence"] = confidence
            numeric.append(entry)

    # Keep text-layer values in the same index as spreadsheet and OCR values.
    # This lets B2 see figure labels and long-tail values from PDF text too.
    text_values: list[dict[str, Any]] = []
    formula_text_candidates = 0
    for block in text_blocks:
        record = asdict(block) if is_dataclass(block) else dict(block) if isinstance(block, dict) else {}
        text = str(record.get("text") or "")
        if re.search(r"(?:[A-Za-z]\w*\s*=\s*[^\n]{2,40}[+*/^]|[A-Za-z]\w*\s*/\s*[A-Za-z]\w*\s*=)", text):
            formula_text_candidates += 1
        fig_match = _FIG.search(text)
        for match in _NUMBER.finditer(text):
            raw = match.group(0)
            number = _decimal(raw)
            if number is None or "." not in raw or len(raw.split(".", 1)[1].rstrip("%")) < 6:
                continue
            text_values.append({"source_file": str(record.get("source_file") or ""), "sheet": "PDF text",
                                "cell": "", "page": record.get("page"), "bbox": record.get("bbox"),
                                "raw": raw, "value": number, "decimals": len(raw.split(".", 1)[1].rstrip("%")),
                                "role": "pdf_text", "figure": fig_match.group(1) if fig_match else None,
                                "row_context": text})
    numeric.extend(text_values)

    low_confidence_ocr_numbers = 0
    # OCR numbers remain source-linked, but low-confidence readings are not
    # admitted as arithmetic evidence. They are counted for coverage instead.
    # B1: cyclic decimal fragments, retaining every workbook coordinate.
    cycles: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for value in numeric:
        fraction = value["raw"].split(".", 1)[1].rstrip("%") if "." in value["raw"] else ""
        match = _CYCLE.search(fraction)
        if match and not (value.get("role") == "ocr" and value.get("confidence", 0) < 0.65):
            chunk = match.group("chunk")
            cycles[chunk].append(value)
    # Emit one auditable finding per concrete source coordinate, after the
    # count is known, so confidence and aggregate counts do not depend on order.
    for chunk, group in cycles.items():
        for value in group:
            related = [{"source_file": item["source_file"], "sheet": item["sheet"],
                        "cell": item["cell"], "page": item["page"], "observed": item["raw"]}
                       for item in group]
            findings.append(_finding("B1", value, value["raw"], f"repeated fractional fragment {chunk}",
                                     f"fractional digits contain {chunk} repeated at least three times; {len(group)} occurrence(s) were individually enumerated",
                                     "medium" if len(group) >= 2 else "low",
                                     "循环小数片段需核对", f"{value['raw']} contains repeated fragment {chunk}; exact source coordinate retained.", related))

    # B2: exact long-tail values repeated at distinct sheet/file/page sources.
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for value in numeric:
        if value["decimals"] >= 8 and not (value.get("role") == "ocr" and value.get("confidence", 0) < 0.65):
            groups[_canonical(value["value"])].append(value)
    for number, group in groups.items():
        locations = {(x["source_file"], x["sheet"], x["cell"], x["page"]) for x in group}
        if len(locations) < 2:
            continue
        figures = {x.get("figure") for x in group if x.get("figure")}
        if len(figures) < 2:
            continue
        related = []
        for x in group:
            context = " ".join((x.get("sheet", ""), Path(x["source_file"]).stem if x["source_file"] else "",
                                x.get("row_context", "")))
            figure = x.get("figure") or (_FIG.search(context).group(1) if _FIG.search(context) else None)
            unit = _UNIT.search(context)
            related.append({"source_file": x["source_file"], "sheet": x["sheet"], "cell": x["cell"],
                            "page": x["page"], "observed": x["raw"],
                            "unit": unit.group(0) if unit else None, "figure": figure,
                            "ocr_confidence": x.get("confidence")})
        findings.append(_finding("B2", group[0], number, "independent source values or documented shared source",
                                 f"exact value {number} appears at {len(locations)} distinct sheet/file/page locations; matching alone is not evidence of error",
                                 "low", "跨来源长尾数值相同", "Inspect the linked figures, units, and source-data lineage.", related))

    # B3: formula outputs with cached values are recomputed using Decimal.
    formula_evaluated = formula_checked = formula_failed = 0
    for item in formulas:
        try:
            expected = _calculate_formula(item["formula"], item.get("cells", {}))
            formula_evaluated += 1
            observed = _decimal(item.get("cached"))
            if observed is None:
                continue
            fmt = str(item.get("number_format") or "")
            section = fmt.split(";", 1)[0]
            decimals = len(re.search(r"\.([0#?]+)", section).group(1)) if re.search(r"\.([0#?]+)", section) else len(str(item.get("cached")).split(".", 1)[1]) if "." in str(item.get("cached")) else 0
            quantum = Decimal(1).scaleb(-decimals)
            rounded = expected.quantize(quantum, rounding=ROUND_HALF_UP)
            formula_checked += 1
            # Compare against the displayed rounding interval. A cached value
            # is allowed to differ from the full-precision result by half of
            # its declared display unit, but not beyond that interval.
            tolerance = max(quantum / 2, abs(expected) * Decimal("0.00000001")) + Decimal("0.0000000001")
            if abs(observed - expected) > tolerance:
                src = {"source_file": item["source_file"], "sheet": item["sheet"], "cell": item["cell"], "page": None, "bbox": None}
                findings.append(_finding("B3", src, observed, rounded,
                                         f"{item['formula']} => {expected}; displayed rounding={decimals} decimals, expected interval [{expected-tolerance}, {expected+tolerance}], cached differs by {observed - expected}",
                                         "medium", "公式缓存值与复算不一致", "Formula arithmetic was recomputed from workbook cells using Decimal."))
        except Exception as error:  # noqa: BLE001
            formula_failed += 1

    # B4: repeated numeric row vectors and unusually inconsistent precision.
    by_sheet: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    by_column: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    by_row: dict[tuple[str, str, int], dict[str, dict[str, Any]]] = defaultdict(dict)
    for value in numeric:
        if value.get("role") == "ocr" and value.get("confidence", 0) < 0.65:
            continue
        by_sheet[(value["source_file"], value["sheet"])].append(value)
        cell = re.fullmatch(r"([A-Z]+)(\d+)", value["cell"])
        if cell:
            col_name, row_number = cell.group(1).upper(), int(cell.group(2))
            by_column[(value["source_file"], value["sheet"], col_name)].append(value)
            by_row[(value["source_file"], value["sheet"], row_number)][col_name] = value
        else:
            table_cell = re.fullmatch(r"R(\d+)C(\d+)", value["cell"], re.I)
            if table_cell:
                row_number, col_number = int(table_cell.group(1)), int(table_cell.group(2))
                col_name = _column_name(col_number)
                by_column[(value["source_file"], value["sheet"], col_name)].append(value)
                by_row[(value["source_file"], value["sheet"], row_number)][col_name] = value

    # B4a/B4b/B4c: exact repeated numeric row vectors are listed with both
    # coordinates. They are low-confidence review cues, never verdicts.
    row_vectors: dict[tuple[str, str, tuple[tuple[str, str], ...]], list[tuple[int, dict[str, dict[str, Any]]]]] = defaultdict(list)
    for (source_file, sheet, row_number), row_values in by_row.items():
        if len(row_values) < 3:
            continue
        vector = tuple(sorted((col, _canonical(item["value"])) for col, item in row_values.items()))
        row_vectors[(source_file, sheet, vector)].append((row_number, row_values))
    for (source_file, sheet, vector), repeated in row_vectors.items():
        if len(repeated) < 2:
            continue
        locations = [f"{_column_name(_column_number(col))}{row}" for row, _ in repeated for col, _ in vector]
        for row_number, row_values in repeated:
            source = next(iter(row_values.values()))
            findings.append(_finding("B4", source, vector, "unique row vectors or a documented replicate design",
                                     f"identical numeric vector appears in rows {[row for row, _ in repeated]} at {', '.join(locations)}",
                                     "low", "表格数值行逐项重复", "Exact row equality can be legitimate; compare raw records, sample identities and the declared n.",
                                     [{"source_file": source_file, "sheet": sheet, "row": row,
                                       "values": {col: item["raw"] for col, item in row_values.items()}}
                                      for row, row_values in repeated]))
    # A figure's adjacent experimental groups are often stored as columns,
    # with each gene/condition occupying a separate contiguous row block.
    # Compare complete vectors within a block so shared single values do not
    # become duplicate findings.
    for (source_file, sheet), values_in_sheet in by_sheet.items():
        by_col: dict[str, list[tuple[int, dict[str, Any]]]] = defaultdict(list)
        for item in values_in_sheet:
            match = re.fullmatch(r"([A-Z]+)(\d+)", item["cell"])
            if match:
                by_col[match.group(1)].append((int(match.group(2)), item))
        runs: list[tuple[str, list[tuple[int, dict[str, Any]]]]] = []
        for col, rows in by_col.items():
            rows.sort(key=lambda entry: entry[0])
            run: list[tuple[int, dict[str, Any]]] = []
            for row, item in rows:
                if run and row != run[-1][0] + 1:
                    if len(run) >= 2:
                        runs.append((col, run))
                    run = []
                run.append((row, item))
            if len(run) >= 2:
                runs.append((col, run))
        blocks: dict[tuple[int, int], list[tuple[str, list[tuple[int, dict[str, Any]]]]]] = defaultdict(list)
        for col, run in runs:
            blocks[(run[0][0], run[-1][0])].append((col, run))
        counted_starts: set[int] = set()
        for (first, last), columns in blocks.items():
            if len(columns) < 2:
                continue
            for left_index, (left_col, left) in enumerate(columns):
                for right_col, right in columns[left_index + 1:]:
                    if len(left) < 3 or any(_canonical(a[1]["value"]) != _canonical(b[1]["value"])
                                          for a, b in zip(left, right)):
                        continue
                    series = [item["value"] for _, item in left]
                    # Shared dose/time axes and constant controls are expected
                    # to repeat between panels.
                    if len(set(series)) < 3 or len(series) >= 5 and (all(a < b for a, b in zip(series, series[1:])) or all(a > b for a, b in zip(series, series[1:]))):
                        continue
                    source = left[0][1]
                    related = [{"source_file": source_file, "sheet": sheet, "cell": item["cell"],
                                "observed": item["raw"]} for _, item in left + right]
                    findings.append(_finding("B4", source,
                        f"{left_col}{first}:{left_col}{last} = {right_col}{first}:{right_col}{last}",
                        "distinct measurements or documented shared control",
                        f"B4a: {len(left)} row-aligned values are identical in both columns; "
                        f"coordinates={','.join(item['cell'] for _, item in left + right)}",
                        "low", "跨组逐项数值相同", "Check whether the groups intentionally share a control series.", related))
            for col, run in columns:
                repeated = defaultdict(list)
                for _, item in run:
                    if item["decimals"] >= 6:
                        repeated[_canonical(item["value"])].append(item)
                for number, repeated_items in repeated.items():
                    if len(repeated_items) < 2:
                        continue
                    source = repeated_items[0]
                    findings.append(_finding("B4", source, number,
                        "independent high-precision measurements or documented quantization",
                        f"B4c: {len(repeated_items)} exact values at >=6 decimal places in "
                        f"{col}{first}:{col}{last}: {','.join(item['cell'] for item in repeated_items)}",
                        "low", "组内高精度数值重复", "Inspect the instrument precision and source measurements.",
                        [{"source_file": source_file, "sheet": sheet, "cell": item["cell"],
                          "observed": item["raw"]} for item in repeated_items]))
            # A visibly shorter adjacent group is an n cue, not proof of an
            # incorrect declared n. Report the concrete cell counts only.
            if first in counted_starts:
                continue
            counted_starts.add(first)
            neighbor_runs = sorted(((col, run) for col, run in runs
                                    if run[0][0] == first and len(run) >= 2),
                                   key=lambda entry: _column_number(entry[0]))
            islands: list[list[tuple[str, list[tuple[int, dict[str, Any]]]]]] = []
            for col, run in neighbor_runs:
                if not islands or _column_number(col) > _column_number(islands[-1][-1][0]) + 1:
                    islands.append([])
                islands[-1].append((col, run))
            for island in islands:
                lengths = {len(run) for _, run in island}
                if len(lengths) < 2 or len(island) < 3:
                    continue
                source = island[0][1][0][1]
                counts = {col: len(run) for col, run in island}
                findings.append(_finding("B4", source, counts,
                    "equal group sizes only if the study declares equal n",
                    f"B4b: adjacent numeric groups beginning at row {first} have different counts: {counts}",
                    "low", "相邻组数据项数不齐", "Compare the stated sample sizes and missing-value policy."))
    for key, column in by_column.items():
        precision_counts = Counter(x["decimals"] for x in column if x["decimals"] > 0)
        if len(precision_counts) < 2:
            continue
        common_precision, common_count = precision_counts.most_common(1)[0]
        if common_count < 4:
            continue
        for item in column:
            if item["decimals"] >= max(common_precision + 4, 6):
                findings.append(_finding("B4", item, item["raw"], f"precision close to common {common_precision}-decimal values",
                                         f"column precision counts={dict(precision_counts)}",
                                         "low", "数值精度分布异常", "Mixed precision may reflect legitimate calculations; inspect the source and rounding policy."))

    # B5: check only explicitly labelled totals, plus an explicit 100% row.
    # Operands must be the immediately preceding contiguous block, preventing
    # unrelated earlier groups from being added into the comparison.
    b5_checked = 0
    for key, values_in_sheet in by_sheet.items():
        cells: dict[tuple[int, int], dict[str, Any]] = {}
        row_items: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for item in values_in_sheet:
            match = re.fullmatch(r"([A-Z]+)(\d+)", item["cell"])
            if match:
                row, col = int(match.group(2)), _column_number(match.group(1))
            else:
                table_cell = re.fullmatch(r"R(\d+)C(\d+)", item["cell"], re.I)
                if not table_cell:
                    continue
                row, col = int(table_cell.group(1)), int(table_cell.group(2))
            cells[(row, col)] = item
            row_items[row].append(item)
        for item in values_in_sheet:
            match = re.fullmatch(r"([A-Z]+)(\d+)", item["cell"])
            if match:
                row, col = int(match.group(2)), _column_number(match.group(1))
            else:
                table_cell = re.fullmatch(r"R(\d+)C(\d+)", item["cell"], re.I)
                if not table_cell:
                    continue
                row, col = int(table_cell.group(1)), int(table_cell.group(2))
            if item.get("role") not in {"table"}:
                continue
            row_label = item.get("row_label", "")
            is_total = bool(re.search(r"\b(total|sum|overall|combined)\b", row_label, re.I))
            is_percent_total = item["raw"].endswith("%") and bool(re.search(r"\b(total|sum|overall|combined)\b", row_label, re.I))
            if not (is_total or is_percent_total):
                continue
            operands = []
            previous = row - 1
            while previous > 0 and (previous, col) in cells:
                previous_label = cells[(previous, col)].get("row_label", "")
                if re.search(r"\b(total|sum|overall|combined)\b", previous_label, re.I):
                    break
                candidate = cells[(previous, col)]
                if is_percent_total and not candidate["raw"].endswith("%"):
                    break
                operands.append(candidate["value"])
                previous -= 1
            if operands:
                b5_checked += 1
                expected = sum(operands, Decimal(0))
                target = expected
                observed = item["value"]
                if is_percent_total:
                    tolerance = Decimal("0.5")
                else:
                    decimals = item["decimals"]
                    tolerance = Decimal(1).scaleb(-decimals) / 2 if decimals else Decimal("0.000001")
                if abs(observed - target) > tolerance:
                    kind = "百分比总和" if is_percent_total else "表格总计"
                    findings.append(_finding("B5", item, item["raw"], target,
                                             f"immediately preceding contiguous values in column {_column_name(col)} sum to {expected}; tolerance={tolerance}",
                                             "medium", f"{kind}与分项合计不一致", "Only a visibly labelled total or explicit 100% row is checked; inspect grouping and rounding."))

    for record in ocr_records:
        for item in record.get("numbers", []):
            try:
                if float(item.get("confidence", 0)) < 0.65:
                    low_confidence_ocr_numbers += 1
            except (TypeError, ValueError):
                low_confidence_ocr_numbers += 1

    detector_status = {
        "B1": "done" if numeric else "not_applicable",
        "B2": "done" if numeric or text_values else "not_applicable",
        "B3": "not_evaluated" if formula_text_candidates or formula_failed else "done" if formula_checked else "not_evaluated" if formulas else "not_applicable",
        "B4": "done" if numeric else "not_applicable",
        "B5": "done" if b5_checked else "not_evaluated" if numeric else "not_applicable",
    }
    if errors:
        for name in detector_status:
            detector_status[name] = "not_evaluated"
    return {"findings": findings, "detectors": detector_status,
            "sources": [{"path": str(p), "status": "failed" if any(e["source_file"] == str(p) for e in errors) else "scanned"}
                        for p in sorted(set(data_files), key=str)],
            "errors": errors, "numeric_cells": len(numeric), "formula_cells": len(formulas),
            "formulas_recalculated": formula_evaluated, "formulas_checked": formula_checked, "formula_failures": formula_failed,
            "text_numeric_candidates": len(text_values), "text_formula_candidates": formula_text_candidates,
            "B5_recalculations": b5_checked,
            "cycle_groups": {k: len(v) for k, v in cycles.items()},
            "cycle_occurrences": sum(len(v) for v in cycles.values()),
            "low_confidence_ocr_numbers": low_confidence_ocr_numbers}
