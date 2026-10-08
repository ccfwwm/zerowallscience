"""T5: numeric-table extraction from PDF text (R-2026-06-15).

The Phase 3 + Phase 4 v2 benchmarks both
identified the same gap: the
``stat_grim`` / ``stat_pvalue`` / ``stat_percent``
detectors produce 0 findings on Frontiers
papers because Frontiers tables are mostly
*image-only* -- the numbers live inside figure
bodies, not in PyMuPDF-detectable vector
tables.

This module is the T5 fix: scan the PDF's
text layer (not the images) for *stat
descriptors* -- sentences or short paragraphs
that name a sample size ``n``, a mean, a
standard deviation, a p-value, or a
percentage -- and group them into
``ExtractedTable`` records the existing
detectors can already consume.

Inputs
------

  * a PDF path
  * the PDF's ``TextBlock`` list
    (``ParsedDoc.text_blocks``) -- we re-use
    the same blocks the rest of the pipeline
    already extracts, so we get text + bbox
    + page for free.

Outputs
-------

  * a list of ``ExtractedTable`` records
    with the standard
    ``headers`` / ``rows`` / ``source_kind``
    fields.  ``source_kind`` is set to a
    new value ``"pdf_text_stat"`` so the
    detectors and the report renderer can
    distinguish synthetic tables from
    real ones.

Detectors that benefit
----------------------

  * ``GrimTestDetector`` -- now has the
    means + sample sizes it needs
  * ``PValueConsistencyDetector`` -- now
    has the p-values
  * ``PercentDivisibilityDetector`` -- now
    has the percentages
  * ``OutlierDetector`` -- the synthetic
    tables are not as numeric as the
    real ones, but the per-row values
    still produce outlier findings for
    inconsistent N / p-value combos

Design contract
---------------

  * The extractor is conservative: it only
    emits a row when it can identify at
    least one stat descriptor
    (``n=``, ``mean=``, ``p=``, ``%``,
    ``SD``, ``SEM``, ``±``).  Garbage
    text never becomes a row.
  * Rows are grouped by their PARENT
    PARAGRAPH: a sentence that contains
    multiple descriptors produces one
    row with multiple columns.  A
    multi-sentence paragraph becomes
    one table with multiple rows.
  * No LLM. No external OCR.  Pure
    regex + light parsing.

This module is pure-Python and depends only
on ``re`` and ``pathlib``; it does not even
need PyMuPDF because the ``text_blocks``
are already extracted by the upstream
ingestion.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from ..contracts import ExtractedTable, TextBlock

log = logging.getLogger(__name__)


# ---- Regex patterns ----
# Each pattern captures (column_name, raw_value,
# normalised_value).  The patterns are
# deliberately tolerant (case-insensitive, allow
# ± / +/- / +- , allow ±SD written as "±
# 0.5", allow "M=4.20" and "M = 4.20").

# Sample size: n=10, n = 10, N=12, N = 12, sample
# size = 24, samples n=20
_SAMPLE_SIZE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "n",
        re.compile(
            r"\b(?:n|N|sample\s*size|total\s*n|subjects)\s*"
            r"[=:]\s*(\d{1,5})\b",
            re.IGNORECASE,
        ),
    ),
)

# Mean: mean=4.20, mean ± SD, M=4.20, mean (SD),
# M ± 0.5, mean of 4.20
_MEAN_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "mean",
        re.compile(
            r"\b(?:mean|average|avg|M)\s*(?:of|=|:)?\s*"
            r"(?:[a-zA-Z\-]+?\s+)?"
            r"(-?\d+\.\d{1,4})\b",
            re.IGNORECASE,
        ),
    ),
)

# Standard deviation / SEM / SE / CI:
# SD=0.5, ± SD 0.5, mean ± 0.5, SE = 0.3
_SD_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "sd",
        re.compile(
            r"\b(?:SD|S\.D\.|SEM|S\.E\.M|SE|S\.E\.|"
            r"std\.?\s*dev\.?|CI)\s*[=:]?\s*"
            r"(-?\d+\.\d{1,4})\b",
            re.IGNORECASE,
        ),
    ),
)

# p-value: p<0.05, p = 0.04, p=0.04, P<0.001,
# p < .001, p-value 0.04
_PVALUE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "p_value",
        re.compile(
            r"\b(?:p|P|p[-\s]*value|significance)\s*"
            r"(?:[<>]=?|=|is|was)\s*"
            r"(\.?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\b",
            re.IGNORECASE,
        ),
    ),
)

# Percentage: 95.0%, 7.5%, 100 %
# Captures the raw number and we strip the %
# in the post-process step.
_PCT_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "pct",
        re.compile(
            r"(-?\d+(?:\.\d+)?)\s*%",
        ),
    ),
)

# t / F / chi-square statistic: t(20) = 2.45,
# F(2, 18) = 3.4, chi^2 = 5.6
_STATISTIC_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "t",
        re.compile(
            r"\bt\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\)\s*[=:]\s*"
            r"(-?\d+\.\d{1,4})\b",
            re.IGNORECASE,
        ),
    ),
    (
        "F",
        re.compile(
            r"\bF\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\)\s*[=:]\s*"
            r"(-?\d+\.\d{1,4})\b",
        ),
    ),
    (
        "chi2",
        re.compile(
            r"\b(?:chi[- ]?square|χ²|chi2|χ2)\s*"
            r"[=:]?\s*(-?\d+\.\d{1,4})\b",
            re.IGNORECASE,
        ),
    ),
    (
        "r",
        re.compile(
            r"\br\s*=\s*(-?\d+\.\d{1,4})\b",
        ),
    ),
)

_FIG_LABEL_RE = re.compile(
    r"\b(?:fig|figure)\.?\s*([Ss]?\d+[A-Za-z]?)\b",
    re.IGNORECASE,
)


# ---- Internal row representation ----


@dataclass
class _StatRow:
    """One row of a synthetic stat-extracted
    table.  Each field is the raw string
    captured by the regex; if the row has
    no value for a column, the field is
    ``None``.
    """

    n: str | None = None
    mean: str | None = None
    sd: str | None = None
    p_value: str | None = None
    pct: str | None = None
    t: str | None = None
    F: str | None = None
    chi2: str | None = None
    r: str | None = None
    context: str = ""  # the surrounding sentence (truncated)
    fig_name: str = ""
    page: int = 0

    def is_empty(self) -> bool:
        return not any(
            getattr(self, f.name)
            for f in self.__dataclass_fields__.values()
            if f.name
            in {
                "n", "mean", "sd", "p_value", "pct",
                "t", "F", "chi2", "r",
            }
        )

    def to_row_dict(self) -> dict[str, str]:
        return {
            k: v
            for k, v in (
                ("n", self.n),
                ("mean", self.mean),
                ("sd", self.sd),
                ("p_value", self.p_value),
                ("pct", self.pct),
                ("t", self.t),
                ("F", self.F),
                ("chi2", self.chi2),
                ("r", self.r),
            )
            if v is not None
        }


# ---- Extraction core ----


_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z(])")


def _split_sentences(text: str) -> list[str]:
    """Split a paragraph into sentences on
    common sentence-end punctuation.  This is
    intentionally simple: a full NLP
    sentence-splitter is out of scope for T5.
    """
    if not text:
        return []
    s = _SENTENCE_SPLIT.split(text)
    return [x.strip() for x in s if x.strip()]


def _fig_name_from_text(text: str) -> str:
    m = _FIG_LABEL_RE.search(text)
    if not m:
        return ""
    return f"Fig.{m.group(1)}"


def _match_patterns(
    text: str,
    patterns: tuple[tuple[str, re.Pattern[str]], ...],
) -> dict[str, str]:
    """Run a list of (column_name, regex) tuples
    against the text and return the first match
    per column.
    """
    out: dict[str, str] = {}
    for col, pat in patterns:
        m = pat.search(text)
        if not m:
            continue
        # group 1 is the value (all our patterns
        # put the value in group 1)
        if m.lastindex and m.lastindex >= 1:
            out[col] = m.group(1)
    return out


def _row_from_sentence(
    sentence: str, page: int, fig_name: str = ""
) -> _StatRow | None:
    """Try to construct a ``_StatRow`` from a
    single sentence.  Returns None if the
    sentence contains no stat descriptors.
    """
    # Combine ALL patterns at once.  We use
    # findall (via the per-pattern matchers
    # above) but track which pattern fired
    # first so we only keep the first match
    # per column.
    n = _match_patterns(sentence, _SAMPLE_SIZE_PATTERNS)
    mean = _match_patterns(sentence, _MEAN_PATTERNS)
    sd = _match_patterns(sentence, _SD_PATTERNS)
    p = _match_patterns(sentence, _PVALUE_PATTERNS)
    pct = _match_patterns(sentence, _PCT_PATTERNS)
    stat = _match_patterns(sentence, _STATISTIC_PATTERNS)

    row = _StatRow(
        n=n.get("n"),
        mean=mean.get("mean"),
        sd=sd.get("sd"),
        p_value=p.get("p_value"),
        pct=pct.get("pct"),
        t=stat.get("t"),
        F=stat.get("F"),
        chi2=stat.get("chi2"),
        r=stat.get("r"),
        context=sentence[:200],
        fig_name=fig_name or _fig_name_from_text(sentence),
        page=page,
    )
    if row.is_empty():
        return None
    return row


# ---- Synthetic table assembly ----


def _merge_n_propagation(
    rows: list[_StatRow],
) -> list[_StatRow]:
    """R-2026-06-15 (T5.2):
    propagate ``n`` forward to
    subsequent rows in the
    same page until we hit a
    new ``n`` or another
    "row-block boundary".

    A Frontiers paper typically
    writes its stat descriptors
    across 2-3 sentences:

      "Group A (n=20) had a
       response rate of 50%.
       p<0.05. The treatment
       effect was 23.4%."

    The original extractor
    (T5 first commit) split
    this into 3 separate rows
    -- each missing the n,
    the value, or both -- and
    the GRIM test could not
    run.  This pass walks the
    rows in order and **propagates
    the most recent n forward**
    to any row that has a
    value column but no n of
    its own.

    A new n starts a new "row
    block"; we don't propagate
    across block boundaries.

    Rows with neither n nor any
    value (e.g. an empty
    descriptor) are dropped
    here.
    """
    if not rows:
        return []
    out: list[_StatRow] = []
    current_n: str | None = None
    for r in rows:
        # If this row has its
        # own n, it starts a
        # new block.
        if r.n is not None:
            current_n = r.n
            out.append(r)
            continue
        # Otherwise: propagate
        # the current n if this
        # row has any value
        # column.
        if current_n is not None and not r.is_empty():
            # Build a copy with
            # the inherited n.
            propagated = _StatRow(
                n=current_n,
                mean=r.mean,
                sd=r.sd,
                p_value=r.p_value,
                pct=r.pct,
                t=r.t,
                F=r.F,
                chi2=r.chi2,
                r=r.r,
                context=r.context,
                fig_name=r.fig_name,
                page=r.page,
            )
            out.append(propagated)
        elif not r.is_empty():
            out.append(r)
        # If a row has neither n
        # nor any value, drop it
        # entirely.
    return out


def _assemble_table(
    rows: list[_StatRow], page: int, fig_name: str = ""
) -> ExtractedTable | None:
    """Build an ``ExtractedTable`` from a list
    of stat rows.  All rows on the same page
    become a single synthetic table so the
    detector sees a coherent column structure.
    """
    if not rows:
        return None
    # Headers: the union of the column names
    # present in at least one row.  We use
    # a fixed canonical order so the report
    # is consistent across cases.
    canonical_order = [
        "n",
        "mean",
        "sd",
        "p_value",
        "pct",
        "t",
        "F",
        "chi2",
        "r",
    ]
    headers = [
        h
        for h in canonical_order
        if any(getattr(r, h) is not None for r in rows)
    ]
    if not headers:
        return None
    table_rows: list[list[str]] = []
    for r in rows:
        d = r.to_row_dict()
        table_rows.append([d.get(h, "") for h in headers])
    return ExtractedTable(
        table_id=(
            f"pdf_text_stat:p{page}:{fig_name}"
            if fig_name
            else f"pdf_text_stat:p{page}"
        ),
        source_kind="pdf_text_stat",
        source_path="(text-layer extraction)",
        sheet_name="",
        # The 0-based page where the rows were
        # found; the contract is that
        # ``source_index`` is the 0-based page
        # for PDF-native tables.
        source_index=max(0, page - 1),
        headers=headers,
        rows=table_rows,
        fig_name=fig_name,
    )


def _block_page(block: TextBlock) -> int:
    """Extract the 1-based page number from a
    ``TextBlock``.  The block's ``bbox`` is a
    sequence of 4 numbers; the contract is
    that the page is exposed via the
    block's ``page`` attribute (some blocks
    carry it; others do not).  We default to
    page 0 (unknown) when the attribute is
    missing.
    """
    return int(getattr(block, "page", 0) or 0)


# ---- Public API ----


def extract_tables_from_text(
    text_blocks: Iterable[TextBlock],
    source_path: str = "",
    max_tables: int = 50,
) -> list[ExtractedTable]:
    """Pull synthetic ``ExtractedTable``
    records from the PDF's text layer.

    The extractor walks every ``TextBlock``,
    splits it into sentences, and tries to
    match a stat descriptor regex in each
    sentence.  All rows on the same page
    become one synthetic table.  Tables are
    capped at ``max_tables`` (50 by default)
    to keep the downstream detector pass
    bounded.

    Parameters
    ----------
    text_blocks
        The list of ``TextBlock`` already
        extracted from the PDF (typically
        ``ParsedDoc.text_blocks``).
    source_path
        The original PDF path.  Stored on
        each ``ExtractedTable`` for
        debuggability.
    max_tables
        Cap on the number of synthetic
        tables emitted.  Each table is
        per-page; with 50 pages of dense
        text you could in principle get
        50 tables, which is enough for any
        real paper.

    Returns
    -------
    list[ExtractedTable]
        The synthetic tables.  Empty list if
        the text layer has no stat
        descriptors (e.g. a figure-only
        paper).
    """
    if not text_blocks:
        return []
    # Group sentences by page
    per_group_rows: dict[tuple[int, str], list[_StatRow]] = {}
    for block in text_blocks:
        text = getattr(block, "text", "") or ""
        if not text:
            continue
        page = _block_page(block)
        fig_name = _fig_name_from_text(text)
        for sent in _split_sentences(text):
            r = _row_from_sentence(sent, page, fig_name)
            if r is not None:
                per_group_rows.setdefault((page, r.fig_name), []).append(r)
    # R-2026-06-15 (T5.2):
    # for each page, run the
    # row-block merge so that
    # n=X propagates forward
    # to subsequent value-only
    # rows.  This is the data-
    # quality fix the T5.1
    # GRIM test needs in order
    # to actually fire on
    # Frontiers papers (whose
    # text doesn't put n and
    # value in the same sentence).
    for key in list(per_group_rows.keys()):
        per_group_rows[key] = _merge_n_propagation(
            per_group_rows[key]
        )
    out: list[ExtractedTable] = []
    for page, fig_name in sorted(per_group_rows):
        t = _assemble_table(per_group_rows[(page, fig_name)], page, fig_name)
        if t is not None:
            out.append(t)
            if len(out) >= max_tables:
                break
    log.info(
        "extract_tables_from_text: %d table(s) from %d page(s) "
        "(source=%s)",
        len(out),
        len({page for page, _ in per_group_rows}),
        source_path or "<unknown>",
    )
    return out


def extract_tables_from_pdf_path(
    pdf_path: str | Path,
) -> list[ExtractedTable]:
    """Convenience: open the PDF, run the
    PDF ingestion's text-block extraction,
    then call ``extract_tables_from_text``.

    This is the right entry-point for
    callers that have a PDF path but not a
    pre-parsed ``ParsedDoc`` (e.g. unit
    tests, the
    ``manusift/ingest/pdf.py`` upgrade
    path).
    """
    try:
        import fitz  # type: ignore
    except ImportError:
        log.warning(
            "extract_tables_from_pdf_path: PyMuPDF missing -- "
            "no-op"
        )
        return []
    try:
        pdf = fitz.open(str(pdf_path))
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "extract_tables_from_pdf_path: failed to open %s: %s",
            pdf_path,
            exc,
        )
        return []
    blocks: list[TextBlock] = []
    try:
        for p_index, page in enumerate(pdf, start=1):
            try:
                # Use the "blocks" dict so we
                # get the page number for free.
                for b in page.get_text("blocks") or []:
                    if not b or len(b) < 5:
                        continue
                    x0, y0, x1, y1, text = b[:5]
                    if not text or not text.strip():
                        continue
                    blocks.append(
                        TextBlock(
                            page=p_index,
                            bbox=(x0, y0, x1, y1),
                            text=text,
                        )
                    )
            except Exception:  # noqa: BLE001
                continue
    finally:
        pdf.close()
    return extract_tables_from_text(blocks, source_path=str(pdf_path))
