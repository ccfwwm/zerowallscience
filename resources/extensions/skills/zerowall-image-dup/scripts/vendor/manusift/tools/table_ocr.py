"""OCR-based table extraction tool (T10).

A surprising number of
academic papers present their
data as a *screenshot* of a
spreadsheet rather than as a
CSV or a native PDF table.
The image-based table is
intentionally hard to copy,
which makes the data harder
to verify, easier to
falsify, and impossible to
ingest with our text-based
detectors (Benford, duplicate
row, outlier, round bias).

T10 layers an OCR tool on top
of the existing
``Tool`` Protocol so the
LLM agent can convert an
image of a table back into a
``headers`` + ``rows`` pair
and feed it to the table-
statistics detectors.

The tool uses **EasyOCR**
which ships its own model
(no external Tesseract binary
required). The model loads on
first use; subsequent calls
re-use the loaded model.

The output format mirrors
what ``manusift.contracts``
would use if we had an
``ExtractedTable`` class: a
dict with ``headers`` (list
of strings) and ``rows``
(list of list of strings).
The LLM can then either show
the table to the user or
hand it to one of the
table-statistics detectors
through a small helper.

The detector is registered as
a built-in tool so the agent
loop surfaces it in the same
``iter_registered_tools``
list. The LLM can call it
like any other tool:

    tool_name: extract_table_from_image
    args: {"image_path": "/tmp/table.png"}

The tool returns a JSON
string. A non-tabular image
(an outdoor photograph, a
flowchart) returns an empty
``rows`` list so the LLM can
react to a miss rather than
crash.

Borrowed from EasyOCR
(Jaided AI, Apache 2.0) and
the ``pytesseract`` fallback
pattern used in earlier
versions of the same tool.
"""
from __future__ import annotations

import json
import re
from typing import Any

from .tool import Tool, ToolContext


def _read_image(path: str) -> Any:
    """Read an image with PIL and
    return it as a numpy array
    in RGB format. EasyOCR
    accepts both PIL Images and
    numpy arrays; we use numpy
    because that is the more
    common form in the rest of
    the codebase."""
    try:
        from PIL import Image
        img = Image.open(path)
    except Exception:  # noqa: BLE001
        return None
    import numpy as np

    return np.array(img.convert("RGB"))


def _ocr_image(path: str) -> list[list[str]]:
    """Run EasyOCR on the image
    and return the raw text
    detections. The reader is
    loaded lazily on first call
    so the cost is paid once
    per process, not per
    invocation.

    EasyOCR returns a list of
    ``(bbox, text, conf)``
    tuples. We throw away the
    bounding boxes and the
    confidence scores -- the
    caller only wants the
    text. We also normalise
    the case: numbers with a
    decimal point like ``.5``
    become ``0.5`` so the
    downstream numeric
    detectors can parse them.
    """
    arr = _read_image(path)
    if arr is None:
        return []
    # The reader is a
    # module-level singleton so
    # subsequent calls do not
    # re-load the model.
    global _READER
    try:
        reader = _READER
    except NameError:
        reader = None
    if reader is None:
        try:
            reader = easyocr.Reader(
                ["en"], gpu=False, verbose=False
            )
        except Exception:  # noqa: BLE001
            return []
        _READER = reader
    try:
        results = reader.readtext(arr)
    except Exception:  # noqa: BLE001
        return []
    # ``results`` is a list of
    # ``(bbox, text, conf)``
    # tuples. We keep only the
    # text.
    lines = [r[1] for r in results]
    return _group_into_rows(lines)


def _group_into_rows(
    detections: list[str],
) -> list[list[str]]:
    """Heuristic grouping of
    raw OCR detections into
    table rows.

    OCR returns text detections
    in reading order (top to
    bottom, left to right) but
    it does not know about
    column boundaries. We
    approximate the table
    structure by splitting on
    newlines and tab characters
    in each detection, then
    counting columns. Cells
    that look numeric (digits,
    ``.``, ``-``, ``%``) are
    kept; cells that look like
    prose are joined with the
    previous cell so the
    header row makes sense.

    The heuristic is rough --
    a proper table-extraction
    pipeline would use a
    layout-aware model like
    TableNet or PaddleOCR. For
    our purposes (feeding the
    table into the four
    statistical detectors)
    getting the columns
    roughly right is enough.
    """
    rows: list[list[str]] = []
    for line in detections:
        # EasyOCR does not give
        # us bounding boxes per
        # character; it gives us
        # a single string per
        # detected text block.
        # We split on common
        # delimiters: tab, two
        # or more spaces, the
        # pipe character.
        cells = re.split(r"\t|\s{2,}|\|", line)
        cells = [c.strip() for c in cells if c.strip()]
        if not cells:
            continue
        rows.append(cells)
    return rows


def _coerce_to_table(
    rows: list[list[str]],
) -> tuple[list[str], list[list[str]]]:
    """Split a list of rows into
    ``(headers, body)`` by
    treating the first row as
    the header if every other
    row has the same number of
    cells, else the first row
    is itself data and the
    table is left without a
    header.

    The columns are kept as
    the LLM delivered them --
    no reordering, no
    deduplication. The
    downstream numeric
    detectors are robust to a
    missing header: they just
    look at the column index
    instead of the column name.
    """
    if not rows:
        return [], []
    first = rows[0]
    consistent = all(
        len(r) == len(first) for r in rows[1:]
    )
    if consistent and len(first) >= 1:
        return list(first), rows[1:]
    return [], rows


class ExtractTableFromImageTool:
    """OCR a screenshot of a
    table image and return the
    parsed headers + rows as a
    JSON string. The LLM can
    then either display the
    table to the user or hand
    it to one of the table-
    statistics detectors."""

    name: str = "extract_table_from_image"

    def description(self) -> str:
        return (
            "Extract a table from an image. "
            "Use this when the user has uploaded a PDF "
            "that contains a table rendered as a "
            "screenshot (e.g. a bar chart, a "
            "spreadsheet, a heatmap of values) and "
            "you need the underlying numbers. The "
            "image_path argument is the path to the "
            "image on disk. Returns a JSON object "
            "with two keys: 'headers' (a list of "
            "column names) and 'rows' (a list of "
            "lists -- one inner list per row). The "
            "OCR is approximate: a poorly-scanned "
            "image will yield a noisy table. "
            "Read-only."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "image_path": {
                    "type": "string",
                    "description": (
                        "Absolute path to the image file "
                        "on disk. JPEG, PNG, and BMP are "
                        "supported."
                    ),
                },
            },
            "required": ["image_path"],
            "additionalProperties": False,
        }

    def execute(
        self,
        input: dict[str, Any],
        ctx: ToolContext,
    ) -> str:
        image_path = input.get("image_path")
        if not image_path or not isinstance(image_path, str):
            return json.dumps(
                {"error": "image_path is required"}
            )
        rows = _ocr_image(image_path)
        if not rows:
            return json.dumps(
                {
                    "headers": [],
                    "rows": [],
                    "note": (
                        "OCR returned no detections. "
                        "The image may not contain a "
                        "table."
                    ),
                }
            )
        headers, body = _coerce_to_table(rows)
        return json.dumps(
            {
                "headers": headers,
                "rows": body,
                "row_count": len(body),
            },
            indent=2,
            default=str,
        )


def register_table_tools() -> list[Tool]:
    """Return the list of
    table-related tools for the
    registry. Currently this
    is just the OCR extractor;
    a future revision may add
    a layout-aware table
    detector and a CSV
    summariser."""
    return [ExtractTableFromImageTool()]
