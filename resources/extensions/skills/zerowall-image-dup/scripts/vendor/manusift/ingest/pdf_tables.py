"""PDF table extraction with Fig/Table caption alignment (P2).

Two sources:

1. **PyMuPDF** ``page.find_tables()`` — vector-ruled tables (fast).
2. **pdfplumber** fallback — whitespace / line tables when (1) is empty
   on a page (common in author-export / some journals).

After geometry is known, scan page text *above* the table for a caption
matching ``Fig. 3b`` / ``Table S1`` / ``Figure 2a`` and set
``ExtractedTable.fig_name`` so table detectors can label findings as
``Fig Fig.3b`` rather than anonymous ``pdf0-t0``.

No Camelot (Ghostscript) hard dep — pdfplumber is already in
``pyproject.toml``.
"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

from ..contracts import ExtractedTable
from ..trace import get_logger

log = get_logger(__name__)

# Captions like: Fig. 3b | Figure 2a | Table S1 | Tab.1c | Fig.S2d
_CAPTION_RE = re.compile(
    r"(?i)\b("
    r"(?:fig(?:ure)?|tab(?:le)?)\.?\s*[Ss]?\d+[a-z]?"
    r")"
    r"(?:\b|[.:)\]])"
)

# Slightly looser second pass for "Fig 3 b" spaced panel letters
_CAPTION_LOOSE_RE = re.compile(
    r"(?i)\b("
    r"(?:fig(?:ure)?|tab(?:le)?)\.?\s*[Ss]?\d+\s*[a-z]"
    r")"
)


def _short_id(*parts: str) -> str:
    h = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()
    return h[:12]


def _norm_caption(raw: str) -> str:
    """Normalise caption text into a compact fig_name."""
    s = re.sub(r"\s+", " ", raw.strip())
    # Drop trailing punctuation
    s = s.rstrip(".:);]")
    # Collapse "Fig 3 b" → "Fig.3b"
    s = re.sub(
        r"(?i)^(fig(?:ure)?|tab(?:le)?)\.?\s*([Ss]?)(\d+)\s*([a-z]?)$",
        lambda m: (
            f"{'Fig' if m.group(1).lower().startswith('fig') else 'Table'}"
            f".{m.group(2)}{m.group(3)}{m.group(4)}"
        ),
        s,
    )
    return s


def _page_caption_candidates(
    page: Any,
) -> list[tuple[float, float, float, float, str]]:
    """Return list of (x0,y0,x1,y1,text) caption-like blocks on a fitz page."""
    out: list[tuple[float, float, float, float, str]] = []
    try:
        blocks = page.get_text("blocks")
    except Exception:  # noqa: BLE001
        return out
    for b in blocks:
        if len(b) < 5:
            continue
        x0, y0, x1, y1, text = b[0], b[1], b[2], b[3], str(b[4] or "")
        # First 200 chars usually enough for captions
        head = text.strip().replace("\n", " ")[:240]
        if not head:
            continue
        m = _CAPTION_RE.search(head) or _CAPTION_LOOSE_RE.search(head)
        if not m:
            continue
        out.append((float(x0), float(y0), float(x1), float(y1), _norm_caption(m.group(1))))
    return out


def match_caption_to_bbox(
    captions: list[tuple[float, float, float, float, str]],
    table_bbox: tuple[float, float, float, float],
    *,
    max_gap: float = 120.0,
) -> str:
    """Pick the caption whose bottom is just above the table top.

    Prefers captions that horizontally overlap the table and sit within
    ``max_gap`` points above it. Falls back to nearest above if none
    overlap in x.
    """
    if not captions:
        return ""
    tx0, ty0, tx1, ty1 = table_bbox
    best: tuple[float, str] | None = None  # (distance, name)
    for x0, y0, x1, y1, name in captions:
        # Caption should be above table (caption bottom <= table top + small slack)
        if y1 > ty0 + 8:
            continue
        gap = ty0 - y1
        if gap < -8 or gap > max_gap:
            continue
        # Horizontal overlap fraction
        overlap = max(0.0, min(x1, tx1) - max(x0, tx0))
        width = max(1.0, min(x1 - x0, tx1 - tx0))
        score = gap  # smaller gap better
        if overlap / width < 0.15:
            score += 40.0  # penalise non-overlapping
        if best is None or score < best[0]:
            best = (score, name)
    return best[1] if best else ""


def _rows_from_matrix(data: list[list[Any]]) -> tuple[list[str], list[list[str]]] | None:
    if not data or len(data) < 2:
        return None
    header_row = data[0]
    ncols = max(len(r) for r in data)
    if all(h is None or str(h).strip() == "" for h in header_row):
        headers = [f"col_{c}" for c in range(ncols)]
        body = data
    else:
        headers = ["" if h is None else str(h) for h in header_row]
        headers += [""] * (ncols - len(headers))
        body = data[1:]
    rows: list[list[str]] = []
    for r in body:
        cells = ["" if v is None else str(v) for v in r]
        cells += [""] * (ncols - len(cells))
        if not any(c.strip() for c in cells):
            continue
        rows.append(cells[:ncols])
    if not rows:
        return None
    return headers[:ncols], rows


def extract_native_tables_with_captions(
    pdf_doc: Any,
    pdf_path: Path | str,
) -> list[ExtractedTable]:
    """PyMuPDF find_tables + caption → fig_name."""
    out: list[ExtractedTable] = []
    sp = str(pdf_path)
    try:
        for p_index in range(len(pdf_doc)):
            page = pdf_doc[p_index]
            captions = _page_caption_candidates(page)
            try:
                tabs = page.find_tables()
            except Exception as exc:  # noqa: BLE001
                log.info(
                    "find_tables failed",
                    extra={"page": p_index, "err": str(exc)},
                )
                continue
            for t_index, tab in enumerate(tabs):
                try:
                    data = tab.extract()
                except Exception as exc:  # noqa: BLE001
                    log.info(
                        "pdf-native table extract failed",
                        extra={
                            "err": str(exc),
                            "page": p_index,
                            "index": t_index,
                        },
                    )
                    continue
                parsed = _rows_from_matrix(data or [])
                if parsed is None:
                    continue
                headers, rows = parsed
                # Table bbox from PyMuPDF Table object
                bbox_t: tuple[float, float, float, float] | None = None
                try:
                    bb = getattr(tab, "bbox", None)
                    if bb is not None and len(bb) >= 4:
                        bbox_t = (
                            float(bb[0]),
                            float(bb[1]),
                            float(bb[2]),
                            float(bb[3]),
                        )
                except Exception:  # noqa: BLE001
                    bbox_t = None
                fig_name = ""
                bbox_dict: dict[str, int] | None = None
                if bbox_t is not None:
                    fig_name = match_caption_to_bbox(captions, bbox_t)
                    bbox_dict = {
                        "top": int(bbox_t[1]),
                        "bottom": int(bbox_t[3]),
                        "left": int(bbox_t[0]),
                        "right": int(bbox_t[2]),
                    }
                out.append(
                    ExtractedTable(
                        table_id=f"pdf{p_index}-t{t_index}",
                        source_kind="pdf_native",
                        source_path=sp,
                        sheet_name=f"page_{p_index + 1}",
                        source_index=p_index,
                        headers=headers,
                        rows=rows,
                        fig_name=fig_name,
                        bbox=bbox_dict,
                    )
                )
    except Exception as exc:  # noqa: BLE001
        log.info("pdf-native table scan failed", extra={"err": str(exc)})
    return out


def extract_pdfplumber_tables(
    pdf_path: Path | str,
    *,
    skip_pages: set[int] | None = None,
) -> list[ExtractedTable]:
    """pdfplumber fallback for pages without native tables.

    ``skip_pages`` is 0-based page indices that already have native tables.
    """
    try:
        import pdfplumber
    except ImportError:  # pragma: no cover
        return []

    sp = str(pdf_path)
    skip = skip_pages or set()
    out: list[ExtractedTable] = []
    try:
        with pdfplumber.open(sp) as pdf:
            for p_index, page in enumerate(pdf.pages):
                if p_index in skip:
                    continue
                try:
                    tables = page.extract_tables() or []
                except Exception as exc:  # noqa: BLE001
                    log.info(
                        "pdfplumber extract_tables failed",
                        extra={"page": p_index, "err": str(exc)},
                    )
                    continue
                # Caption candidates from page words
                captions: list[tuple[float, float, float, float, str]] = []
                try:
                    words = page.extract_words() or []
                    # Build rough lines
                    line_map: dict[int, list[dict]] = {}
                    for w in words:
                        key = int(float(w.get("top", 0)))
                        line_map.setdefault(key, []).append(w)
                    for top, ws in line_map.items():
                        ws = sorted(ws, key=lambda x: float(x.get("x0", 0)))
                        text = " ".join(str(w.get("text", "")) for w in ws)
                        m = _CAPTION_RE.search(text) or _CAPTION_LOOSE_RE.search(
                            text
                        )
                        if not m:
                            continue
                        x0 = min(float(w.get("x0", 0)) for w in ws)
                        x1 = max(float(w.get("x1", 0)) for w in ws)
                        y0 = min(float(w.get("top", 0)) for w in ws)
                        y1 = max(float(w.get("bottom", 0)) for w in ws)
                        captions.append(
                            (x0, y0, x1, y1, _norm_caption(m.group(1)))
                        )
                except Exception:  # noqa: BLE001
                    pass

                for t_index, matrix in enumerate(tables):
                    if not matrix:
                        continue
                    parsed = _rows_from_matrix(matrix)
                    if parsed is None:
                        continue
                    headers, rows = parsed
                    # pdfplumber table objects may lack bbox when using
                    # extract_tables(); try find_tables for geometry.
                    fig_name = ""
                    bbox_dict: dict[str, int] | None = None
                    try:
                        found = page.find_tables() or []
                        if t_index < len(found):
                            bb = found[t_index].bbox  # x0, top, x1, bottom
                            bbox_t = (
                                float(bb[0]),
                                float(bb[1]),
                                float(bb[2]),
                                float(bb[3]),
                            )
                            fig_name = match_caption_to_bbox(captions, bbox_t)
                            bbox_dict = {
                                "top": int(bbox_t[1]),
                                "bottom": int(bbox_t[3]),
                                "left": int(bbox_t[0]),
                                "right": int(bbox_t[2]),
                            }
                    except Exception:  # noqa: BLE001
                        pass
                    if not fig_name and captions:
                        # Fall back: first caption on page above mid-height
                        fig_name = captions[0][4]
                    out.append(
                        ExtractedTable(
                            table_id=(
                                f"plumb{p_index}-t{t_index}-"
                                f"{_short_id(sp, str(p_index), str(t_index))}"
                            ),
                            source_kind="pdf_plumber",
                            source_path=sp,
                            sheet_name=f"page_{p_index + 1}",
                            source_index=p_index,
                            headers=headers,
                            rows=rows,
                            fig_name=fig_name,
                            bbox=bbox_dict,
                        )
                    )
    except Exception as exc:  # noqa: BLE001
        log.info("pdfplumber table scan failed", extra={"err": str(exc)})
    return out


def extract_text_layer_tables(
    pdf_doc: Any,
    pdf_path: Path | str,
) -> list[ExtractedTable]:
    """Parse Frontiers-style ``TABLE N | title`` blocks from the text layer.

    ``page.find_tables()`` often returns nothing for author-export PDFs
    where table cells are laid out as plain text. This recovers those
    tables so ``table_duplicate_row`` and friends have rows to inspect.
    """
    sp = str(pdf_path)
    out: list[ExtractedTable] = []
    try:
        n_pages = len(pdf_doc)
    except Exception:  # noqa: BLE001
        return out

    table_start = re.compile(
        r"(?im)^\s*TABLE\s+(\d+[A-Za-z]?)\s*[|.—:\-–]?\s*(.*)$"
    )
    for p_index in range(n_pages):
        try:
            page = pdf_doc[p_index]
            text = page.get_text("text") or ""
        except Exception:  # noqa: BLE001
            continue
        lines = text.splitlines()
        i = 0
        while i < len(lines):
            m = table_start.match(lines[i].strip())
            if not m:
                i += 1
                continue
            table_no = m.group(1)
            title = (m.group(2) or "").strip()
            # Collect body until next section heading / figure / footer.
            body: list[str] = []
            j = i + 1
            while j < len(lines):
                ln = lines[j].strip()
                if not ln:
                    j += 1
                    continue
                if re.match(
                    r"(?i)^(FIGURE|TABLE|DISCUSSION|RESULTS|"
                    r"METHODS|REFERENCES|Frontiers in)\b",
                    ln,
                ):
                    break
                if re.match(
                    r"(?i)^\d+\s*$",
                    ln,
                ) and j > i + 2:
                    # lonely page number
                    break
                body.append(ln)
                j += 1
                if len(body) > 80:
                    break
            rows = _body_lines_to_rows(body)
            if len(rows) >= 2:
                # First row as headers if it has fewer pure-numbers.
                headers = rows[0]
                data = rows[1:]
                if not data:
                    i = j
                    continue
                out.append(
                    ExtractedTable(
                        table_id=f"pdf_text_table:p{p_index}:t{table_no}",
                        source_kind="pdf_text_table",
                        source_path=sp,
                        sheet_name=f"Table {table_no}",
                        source_index=p_index,
                        headers=headers,
                        rows=data,
                        fig_name=f"Table {table_no}",
                    )
                )
            i = max(j, i + 1)
    if out:
        log.info(
            "text-layer table extract: %d table(s) from %s",
            len(out),
            Path(sp).name,
        )
    return out


def _body_lines_to_rows(body: list[str]) -> list[list[str]]:
    """Turn Frontiers multi-line table body into rectangular rows.

    Strategy: group consecutive lines into a row when a line starts
    with a non-numeric label (Cross / Co-transformed / GFP / Overall)
    or when the previous group already has enough numeric tokens.
    Fallback: one line = one row split on 2+ spaces.
    """
    if not body:
        return []
    # Prefer multi-space / tab splits.
    simple: list[list[str]] = []
    for ln in body:
        parts = re.split(r"\s{2,}|\t+", ln)
        parts = [p.strip() for p in parts if p.strip()]
        if len(parts) >= 2:
            simple.append(parts)
        else:
            # Single-cell continuation line — append to last row.
            if simple:
                simple[-1][-1] = (simple[-1][-1] + " " + ln).strip()
            else:
                simple.append([ln])
    # If most lines are single-cell, rebuild by numeric-heavy grouping.
    if simple and sum(1 for r in simple if len(r) >= 3) < 2:
        grouped: list[list[str]] = []
        buf: list[str] = []
        start_re = re.compile(
            r"(?i)^(cross|co-transformed|gfp|overall|nd-|control|"
            r"sample|group|treatment|line)\b"
        )
        for ln in body:
            if start_re.match(ln) and buf:
                grouped.append([" ".join(buf)])
                buf = [ln]
            else:
                buf.append(ln)
        if buf:
            grouped.append([" ".join(buf)])
        # Split each group into cells by numbers/tokens.
        rebuilt: list[list[str]] = []
        for g in grouped:
            text = g[0]
            # Label + number tokens.
            tokens = re.findall(
                r"[A-Za-z][A-Za-z0-9#()\-/%.,\s]{2,40}?(?=\s+\d)|"
                r"\d+(?:\.\d+)?(?:\s*\(\d+(?:\.\d+)?%?\))?|"
                r"ND|–|-",
                text,
            )
            tokens = [t.strip() for t in tokens if t.strip()]
            if len(tokens) >= 2:
                rebuilt.append(tokens)
            else:
                rebuilt.append([text])
        if len(rebuilt) >= 2:
            return rebuilt
    return simple


def extract_pdf_tables(
    pdf_doc: Any,
    pdf_path: Path | str,
    *,
    use_plumber_fallback: bool = True,
) -> list[ExtractedTable]:
    """Full PDF table path: native + optional pdfplumber gap-fill + text."""
    native = extract_native_tables_with_captions(pdf_doc, pdf_path)
    if not use_plumber_fallback:
        # Still attach text-layer tables.
        native.extend(extract_text_layer_tables(pdf_doc, pdf_path))
        return native
    # Skip pages that already have at least one native table
    pages_with = {t.source_index for t in native}
    # Only run plumber on empty pages, or always if native totally empty
    env_force = (
        os_environ_flag("MANUSIFT_PDF_PLUMBER_ALWAYS")
    )
    if env_force:
        skip: set[int] = set()
    else:
        skip = pages_with
    plumber = extract_pdfplumber_tables(pdf_path, skip_pages=skip)
    # Dedup: if plumber table looks identical to native (same page+headers+first row)
    seen = {
        (
            t.source_index,
            tuple(t.headers),
            tuple(t.rows[0]) if t.rows else (),
        )
        for t in native
    }
    for t in plumber:
        key = (
            t.source_index,
            tuple(t.headers),
            tuple(t.rows[0]) if t.rows else (),
        )
        if key in seen:
            continue
        native.append(t)
        seen.add(key)
    # Text-layer Frontiers tables (TABLE N | …).
    for t in extract_text_layer_tables(pdf_doc, pdf_path):
        key = (
            t.source_index,
            tuple(t.headers),
            tuple(t.rows[0]) if t.rows else (),
        )
        if key in seen:
            continue
        native.append(t)
        seen.add(key)
    return native


def os_environ_flag(name: str) -> bool:
    import os

    return os.environ.get(name, "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
