"""Figure-text vs. table cross-check (P2.5).

A common fraud signal is
that the *prose* of the
paper claims one value
("60% of patients
recovered") while the
*table* shows a different
value (58% or 65%). The
detector pulls every
percentage-like number
from the prose and the
table column, then matches
them by rounding to the
nearest 1%.

The detector does not
attempt to *align* prose
to table cells by name --
that would require a
proper table-parse +
semantic-matching
pipeline. The detector
*only* checks that the
distribution of
percentages in the prose
is consistent with the
distribution in the
table. If the prose
mentions "60%" three
times but the table has
no values around 60%, the
detector flags the
disagreement.

The detector is read-only
and uses a small list of
heuristics. It is not a
substitute for a human
reviewer; it surfaces
*likely* discrepancies so
the reviewer can
investigate.

Borrowed from the
``statcheck`` R package's
table-text cross-check.
"""
from __future__ import annotations

import json
import re
from collections import Counter
from typing import Any

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult


# Regexes for percentage
# values in text. The
# first matches plain
# ``60%``; the second
# matches the spelled-out
# form ``60 percent``.
_PCT_TEXT = re.compile(
    r"(?<!\d)(\d{1,3}(?:\.\d+)?)\s*(?:%|percent\b)"
)

# P4 (2026-07-18,
# figure_text_v1): tunable
# agreement tolerance, in
# percentage points. A
# prose value within
# ``PCT_TOLERANCE`` of the
# table cell is treated as
# the same value (covers
# rounding like "60%" for
# a 60.4 cell); beyond it
# is a mismatch.
PCT_TOLERANCE: float = 2.0

# An explicit (label,
# prose value, table
# value) mismatch is only
# reported as ``high``
# when the gap is large.
# Smaller gaps are
# ``medium`` so borderline
# rounding/unit quirks do
# not page a reviewer.
HIGH_MIN_GAP: float = 10.0

# Row labels that are too
# generic to anchor an
# explicit-pair match --
# "total" appears in
# almost every results
# prose and would FP.
_LABEL_STOPWORDS = frozenset({
    "total", "overall", "all",
    "mean", "average", "sum",
    "group", "groups", "value",
    "values", "n", "no",
})

_SENT_SPLIT = re.compile(
    r"(?<=[.!?])\s+"
)


def _extract_pcts_from_text(text: str) -> list[float]:
    """Return the list of
    percentage values in
    the prose (in [0, 100]
    only)."""
    out: list[float] = []
    for m in _PCT_TEXT.finditer(text):
        try:
            v = float(m.group(1))
        except (TypeError, ValueError):
            continue
        if 0 <= v <= 100:
            out.append(v)
    return out


def _extract_pcts_from_tables(
    tables: list[Any],
) -> list[float]:
    """Return the list of
    percentage values in
    every table cell. A
    cell is counted as a
    percentage if its header
    contains "%" or "percent"
    OR if the value lies in
    [0, 100] AND the column
    header suggests a
    proportion."""
    out: list[float] = []
    for table in tables:
        headers = getattr(table, "headers", [])
        rows = getattr(table, "rows", [])
        for c_idx, header in enumerate(headers):
            h = (header or "").lower()
            header_says_pct = (
                "%" in header
                or "percent" in h
            )
            for row in rows:
                if c_idx >= len(row):
                    continue
                cell = str(row[c_idx]).strip()
                # Strip a trailing
                # "%" if present.
                cell = cell.rstrip("%").strip()
                try:
                    v = float(cell)
                except (TypeError, ValueError):
                    continue
                if 0 <= v <= 100:
                    if header_says_pct:
                        out.append(v)
                    elif 0 <= v <= 1.0:
                        # Treat as a
                        # 0-1 proportion
                        # and convert.
                        out.append(v * 100.0)
                    else:
                        # Header is
                        # unknown; the
                        # value is in
                        # [1, 100] which
                        # is consistent
                        # with a
                        # percentage --
                        # accept.
                        out.append(v)
    return out


def _round_to(v: float, step: float) -> int:
    """Round a value to the
    nearest ``step`` and
    return the integer
    bucket."""
    return int(round(v / step)) * int(step)


def _table_pct_cells(
    tables: list[Any],
) -> list[dict[str, Any]]:
    """Flatten every
    percentage cell into
    ``{label, column,
    value}`` dicts. The
    ``label`` is the row's
    first cell (the row
    header); rows whose
    label is missing,
    numeric, or a generic
    stopword are skipped
    because they cannot be
    anchored to prose
    without FP risk."""
    out: list[dict[str, Any]] = []
    for table in tables:
        headers = getattr(table, "headers", []) or []
        rows = getattr(table, "rows", []) or []
        pct_cols = [
            i for i, h in enumerate(headers)
            if "%" in (h or "")
            or "percent" in (h or "").lower()
        ]
        if not pct_cols:
            continue
        for row in rows:
            if not row:
                continue
            label = str(row[0]).strip()
            if (
                len(label) < 3
                or not re.search(r"[A-Za-z]", label)
                or label.lower() in _LABEL_STOPWORDS
            ):
                continue
            for ci in pct_cols:
                if ci >= len(row):
                    continue
                cell = str(row[ci]).rstrip("%").strip()
                try:
                    tv = float(cell)
                except (TypeError, ValueError):
                    continue
                if not (0 <= tv <= 100):
                    continue
                # R-2026-07-18 (negative_controls ctrl_f1000_01):
                # skip structural total rows -- "All CPs ... 100%"
                # is the percentage-of-base denominator, not a
                # measured proportion. Prose subset statistics
                # ("approximately 40% of all CPs did not ...")
                # mis-anchor to the shared label and produce a
                # guaranteed spurious max-gap mismatch.
                if tv == 100.0 and label.lower().split()[0] in _LABEL_STOPWORDS:
                    continue
                out.append({
                    "label": label,
                    "column": str(headers[ci]),
                    "value": tv,
                })
    return out


def _nearest_pct(
    sentence: str, label: str
) -> float | None:
    """Return the percentage
    value in ``sentence``
    closest (in characters)
    to the first occurrence
    of ``label``, or
    ``None`` when the
    sentence has no
    percentage. Proximity
    pairing avoids the
    "treatment 60% vs
    control 45%" trap where
    one sentence carries
    several values."""
    pos = sentence.lower().find(label.lower())
    if pos < 0:
        return None
    best: float | None = None
    best_dist: int | None = None
    for m in _PCT_TEXT.finditer(sentence):
        try:
            v = float(m.group(1))
        except (TypeError, ValueError):
            continue
        if not (0 <= v <= 100):
            continue
        dist = abs(m.start() - pos)
        if best_dist is None or dist < best_dist:
            best_dist = dist
            best = v
    return best


def _explicit_pair_mismatches(
    text: str, tables: list[Any]
) -> list[dict[str, Any]]:
    """Find (label, prose
    value, table value)
    triples where a
    sentence naming a table
    row reports a
    percentage that
    disagrees with the
    table cell by more than
    ``PCT_TOLERANCE``. This
    is the strong-evidence
    path: an explicit
    numeric pair, not a
    distribution shift."""
    cells = _table_pct_cells(tables)
    if not cells:
        return []
    sentences = _SENT_SPLIT.split(text)
    out: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for cell in cells:
        for sent in sentences:
            pv = _nearest_pct(sent, cell["label"])
            if pv is None:
                continue
            gap = abs(pv - cell["value"])
            if gap <= PCT_TOLERANCE:
                continue
            key = (cell["label"], cell["column"])
            if key in seen:
                continue
            seen.add(key)
            out.append({
                "label": cell["label"],
                "column": cell["column"],
                "prose_value": pv,
                "table_value": cell["value"],
                "gap": round(gap, 2),
                "sentence": sent.strip()[:200],
            })
            break
    return out


class FigureTextCrossCheckDetector:
    """Check that the
    distribution of
    percentages in the
    prose matches the
    distribution in the
    tables."""

    name = "figure_table_consistency"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        text = " ".join(
            getattr(b, "text", "") for b in doc.text_blocks
        )
        tables = getattr(doc, "tables", []) or []
        text_pcts = _extract_pcts_from_text(text)
        table_pcts = _extract_pcts_from_tables(tables)
        if not text_pcts or not table_pcts:
            # Without both
            # numbers we cannot
            # compare. The
            # detector is silent.
            return DetectorResult(
                detector=self.name, findings=[], ok=True
            )
        # P4 (2026-07-18,
        # figure_text_v1):
        # strong-evidence
        # path first -- an
        # explicit (label,
        # prose value, table
        # value) mismatch.
        # ``high`` only for a
        # large gap (clear
        # numeric pair, well
        # beyond tolerance);
        # smaller gaps stay
        # ``medium``. When
        # explicit pairs are
        # found we skip the
        # weaker distribution
        # check below to
        # avoid double-
        # reporting the same
        # disagreement.
        pairs = _explicit_pair_mismatches(text, tables)
        if pairs:
            max_gap = max(p["gap"] for p in pairs)
            severity = (
                "high" if max_gap >= HIGH_MIN_GAP
                else "medium"
            )
            finding = Finding.make(
                trace_id=doc.trace_id,
                detector=self.name,
                severity=severity,
                title=(
                    f"Prose percentage(s) disagree "
                    f"with table values for "
                    f"{len(pairs)} labelled row(s)"
                ),
                location="text vs tables",
                evidence=json.dumps({
                    "kind": "explicit_pair_mismatch",
                    "tolerance": PCT_TOLERANCE,
                    "pairs": pairs[:5],
                }),
            )
            return DetectorResult(
                detector=self.name,
                findings=[finding],
                ok=True,
            )
        # Round each
        # percentage to the
        # nearest 1% and
        # compare the
        # distributions.
        text_buckets = Counter(
            _round_to(v, 1) for v in text_pcts
        )
        table_buckets = Counter(
            _round_to(v, 1) for v in table_pcts
        )
        # Find the top
        # text values. If
        # ANY of them
        # appears in the
        # table (within
        # ``PCT_TOLERANCE``,
        # so rounding like
        # "60%" vs a 61.4
        # cell does not FP),
        # stay silent. The
        # bar for flagging
        # is deliberately
        # high -- zero
        # overlap between
        # the headline prose
        # values and the
        # tables -- because
        # real papers cite
        # many percentages
        # that never live in
        # tables (the old
        # ``len(text_pcts)//5``
        # quota FP'd on a
        # negative-controls
        # paper with 40 prose
        # percentages,
        # 2026-07-18 P4).
        common: list[int] = []
        for bucket, _ in text_buckets.most_common(5):
            if any(
                abs(bucket - tv) <= PCT_TOLERANCE
                for tv in table_pcts
            ):
                common.append(bucket)
        if common:
            return DetectorResult(
                detector=self.name, findings=[], ok=True
            )
        # No overlap at all
        # between the top
        # text percentages
        # and the table
        # percentages.
        finding = Finding.make(
            trace_id=doc.trace_id,
            detector=self.name,
            severity="medium",
            title=(
                "Prose percentages and table "
                "percentages disagree"
            ),
            location="text vs tables",
            evidence=json.dumps(
                {
                    "text_pcts": text_pcts,
                    "text_buckets": dict(text_buckets),
                    "table_buckets": dict(table_buckets),
                    "common_buckets": common,
                }
            ),
        )
        return DetectorResult(
            detector=self.name,
            findings=[finding],
            ok=True,
        )
