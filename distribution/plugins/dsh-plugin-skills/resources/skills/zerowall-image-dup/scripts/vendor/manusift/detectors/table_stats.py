"""Statistical detectors for fabricated tabular data (T4-T7).

A surprising number of
data-fabrication cases come
down to the numbers, not the
text. Authors who fabricate
their datasets often:
  * Pick numbers "at random"
    that do not follow Benford's
    law (humans are bad at
    producing truly random
    leading digits).
  * Re-use the same row twice
    instead of producing a new
    one.
  * Generate values that are
    too "clean" (outliers are
    missing because humans
    unconsciously avoid
    ugly extremes).
  * Round to the nearest 0 or 5
    because that is what humans
    do when typing.

This module exposes four
detectors, one per category:

  * ``BenfordDetector`` -- checks
    each numeric column against
    Benford's law using a
    chi-squared goodness-of-fit
    test. A p-value below 0.01
    is a strong signal of
    fabrication.
  * ``DuplicateRowDetector`` --
    flags rows that are
    byte-identical to another
    row in the same table.
  * ``OutlierDetector`` --
    reports the per-column
    Z-score of every value. A
    suspiciously low fraction
    of |Z| > 3 suggests the
    values were generated to
    look "normal".
  * ``RoundBiasDetector`` --
    reports the fraction of
    values ending in 0 or 5.
    Truly random data has
    ~20% of values ending in
    0 or 5; hand-typed data
    often has > 35%.

All four are statistical and
deterministic -- no LLM, no
network. They run in
milliseconds and never modify
the input. The detectors are
plug-and-play: any table
representation that has a
``headers`` attribute and a
``rows`` attribute (list of
list of strings / numbers) can
be analysed.

The four detectors share a
common base class so the
report writer can render them
in a single section. Each
finding's ``severity`` is a
function of how badly the
table violates the expected
distribution; the cutoff
constants are hard-coded but
``MANUSIFT_BENFORD_ALPHA`` and
similar env vars can be added
later.

Borrowed from Benford's law
(1938) and the recent
academic-integrity literature
on fabricated data (Springer
2021, Stats journal).
"""
from __future__ import annotations

import json
import math
import re
import statistics
from collections import Counter
from typing import Any

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult


def _format_table_label(
    table: Any, t_index: int, *,
    suffix: str = "",
) -> str:
    """Build a human-friendly table label for a detector finding.

    R-2026-06-19
    (Phase
    C):
    preferred
    label
    is
    ``"Fig {fig_name} in {sheet_name}"``
    (e.g.
    ``"Fig Fig.S1a in Sfig.2"``)
    so the
    user
    can
    see
    *which
    fig* a
    finding
    belongs
    to.
    Falls
    back to
    ``"Table {sheet_name} #{t_index+1}"``
    for
    sheets
    without
    fig
    headers
    (the
    legacy
    case).

    ``suffix``
    is an
    optional
    short
    string
    appended
    after the
    label
    (e.g.
    ``"column 'A'"``)
    so the
    caller
    doesn't
    have to
    worry
    about
    separators.
    """
    fig_name = getattr(table, "fig_name", "") or ""
    sheet_name = getattr(table, "sheet_name", "") or ""
    if fig_name:
        # R-2026-06-19 (Phase C): the
        # detector's fig-boundary
        # regex (in safe_read_b.py)
        # matches ``"Fig.S1a"`` /
        # ``"Table S1"`` /
        # ``"Tab.1"`` /
        # ``"Figure 2"`` / etc.
        # We trust that regex and
        # treat *any* match
        # as already self-
        # descriptive -- the
        # only adjustment we
        # may want is to
        # prefix
        # ``"Fig "`` if the
        # name does NOT start
        # with a fig/table
        # keyword (rare; the
        # detector regex
        # guarantees it
        # does).
        first_word = re.match(
            r"^[A-Za-z]+", fig_name
        )
        if first_word and first_word.group(0).lower() in (
            "fig", "figure", "tab", "table",
        ):
            label = fig_name
        else:
            label = f"Fig {fig_name}"
        if sheet_name:
            label = f"{label} in {sheet_name}"
    else:
        # No fig header -- fall back to "Table {sheet} #{n}".
        if sheet_name:
            label = f"Table {sheet_name} #{t_index + 1}"
        else:
            label = f"Table #{t_index + 1}"
    if suffix:
        return f"{label} {suffix}"
    return label


# ---------- shared helpers ----------

def _coerce_number(s: str) -> float | None:
    """Try to interpret ``s`` as a
    float. Returns None for
    blanks, "n/a", or any
    non-numeric cell. We do not
    use ``float()`` directly
    because we want to keep the
    empty-string / dash cases
    separate from genuine
    conversion errors."""
    if s is None:
        return None
    t = str(s).strip()
    if not t:
        return None
    if t.lower() in {"n/a", "na", "null", "none", "-"}:
        return None
    # Strip thousands separators
    # and currency symbols; we
    # are not a money detector
    # so we just want the
    # number.
    cleaned = (
        t.replace(",", "")
         .replace("$", "")
         .replace("\u20ac", "")
    )
    # Handle scientific notation
    # and trailing percent.
    cleaned = cleaned.rstrip("%")
    try:
        return float(cleaned)
    except ValueError:
        return None


def _safe_tables(
    doc: Any,
    table_ids: list[str] | None = None,
) -> list[Any]:
    """Return ``doc.tables`` if it
    exists, else an empty list.
    The ``tables`` field is not
    part of the ``ParsedDoc``
    contract today, so we use a
    duck-typed accessor for
    forward compatibility.

    R-2026-06-19 (Phase D):
    accepts an optional
    ``table_ids`` filter. When
    provided, only tables whose
    ``table_id`` is in the list
    are returned. This is the
    per-fig detector-run
    mechanism: the LLM passes
    the table_id of a specific
    fig (e.g.
    ``"x:/path/to/foo.xlsx:Sfig.2:Fig.S1a"``)
    to scope the detector to
    that fig only. When
    ``table_ids`` is ``None``
    or empty, all tables are
    returned (legacy behavior).
    """
    tables = getattr(doc, "tables", []) or []
    if not table_ids:
        return tables
    selected = set(table_ids)
    return [t for t in tables if getattr(t, "table_id", "") in selected]


def _numeric_columns(
    headers: list[str],
    rows: list[list[str]],
) -> dict[int, list[float]]:
    """For every column index,
    collect the cells that parse
    as a float. Columns that
    have fewer than 2 numeric
    values are dropped -- there
    is no statistical test you
    can run on a single number.

    The result is a dict
    ``{col_index: [v0, v1, ...]}``.
    """
    out: dict[int, list[float]] = {}
    for col in range(len(headers)):
        values: list[float] = []
        for row in rows:
            if col >= len(row):
                continue
            v = _coerce_number(row[col])
            if v is not None:
                values.append(v)
        if len(values) >= 2:
            out[col] = values
    return out


# ---------- 1. Benford's law ----------

_BENFORD_EXPECTED = [
    math.log10(1 + 1 / d) for d in range(1, 10)
]
# = [0.301, 0.176, 0.125, 0.097, 0.079, 0.067,
#    0.058, 0.051, 0.046] (sums to 1.0).


class BenfordDetector:
    """Apply the Benford goodness-
    of-fit test to every numeric
    column. A p-value below
    ``0.01`` triggers a
    ``medium`` finding; below
    ``0.001`` triggers ``high``.

    Domain gating (2026-07):
    skip or downgrade when n is
    small, values span <1 decade,
    or fig/sheet/header looks like
    DLS/NTA/histogram instrument
    bins — common false positives
    in nanotech Source Data.
    """

    name = "table_benford"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        # Lazy import avoids circular import at module load
        # (table_forensics imports helpers from this module).
        from .table_forensics import (
            assess_benford_applicability,
            _cap_severity,
        )

        findings: list[Finding] = []
        for t_index, table in enumerate(_safe_tables(doc)):
            headers = getattr(table, "headers", []) or []
            rows = getattr(table, "rows", []) or []
            fig_name = getattr(table, "fig_name", "") or ""
            sheet_name = getattr(table, "sheet_name", "") or ""
            cols = _numeric_columns(headers, rows)
            for col_idx, values in cols.items():
                from ..stats_algo import benford_analyze

                analysis = benford_analyze(values, alpha=0.01)
                pvalue = float(analysis.get("pvalue") or 1.0)
                excess = float(analysis.get("excess_mad") or 0.0)
                conf = str(analysis.get("conformity_mad") or "")
                # Fire on chi2 reject OR MAD nonconforming (Nigrini/Barney)
                mad_bad = conf == "nonconforming" or excess > 0.004
                if pvalue >= 0.01 and not mad_bad:
                    continue
                observed_list = list(analysis.get("counts") or [0] * 9)
                header = (
                    headers[col_idx]
                    if col_idx < len(headers)
                    else ""
                )
                gate = assess_benford_applicability(
                    n=int(analysis.get("n") or len(values)),
                    values=values,
                    fig_name=fig_name,
                    sheet_name=sheet_name,
                    header=str(header),
                    observed_counts=observed_list,
                    sibling_headers=[str(h) for h in headers],
                )
                if not gate.get("applicable", True):
                    continue
                if pvalue < 0.001 or excess > 0.008:
                    severity = "high"
                elif pvalue < 0.01 or mad_bad:
                    severity = "medium"
                else:
                    severity = "low"
                severity = _cap_severity(
                    severity, str(gate.get("max_severity") or "high")
                )
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity=severity,
                        title=(
                            f"{_format_table_label(table, t_index)} column "
                            f"'{headers[col_idx]}' violates "
                            f"Benford's law"
                        ),
                        location=(
                            f"{_format_table_label(table, t_index)}, column "
                            f"{col_idx} ('{headers[col_idx]}')"
                        ),
                        evidence=json.dumps(
                            {
                                "n": analysis.get("n"),
                                "chi2": analysis.get("chi2"),
                                "pvalue": pvalue,
                                "mad": analysis.get("mad"),
                                "excess_mad": excess,
                                "conformity_mad": conf,
                                "method": "chi2+mad",
                                "source": (
                                    "Brown–style first-digit + Nigrini MAD "
                                    "/ Barney Excess MAD (open-source "
                                    "benfordslaw-compatible)"
                                ),
                                "expected": [
                                    round(x, 4)
                                    for x in _BENFORD_EXPECTED
                                ],
                                "observed": observed_list,
                                "applicability": gate,
                                "algo_flags": analysis.get("flags") or [],
                            }
                        ),
                    )
                )
        return DetectorResult(
            detector=self.name, findings=findings, ok=True
        )


def _chi2_sf(x: float, k: int) -> float:
    """Survival function P(chi2_k > x).

    Delegates to ``_chi2_sf_exact`` (correct upper-tail
    implementation using series + Lentz CF).  The previous
    inline series returned the *lower* tail CDF with the
    wrong argument (x instead of x/2), inverting p-values.
    Kept as a thin alias so legacy callers (_benford_chi2)
    remain source-compatible."""
    return _chi2_sf_exact(x, k)


# ---------- shared tail probabilities / multiple testing ----------

def _binom_tail(k: int, n: int, p: float) -> float:
    """Upper tail ``P(X >= k)`` for ``X ~ Binomial(n, p)``.

    Pure-Python (log-PMF + upward recurrence) so the detectors stay
    scipy-free like ``manusift.stats_algo``. Callers gate on effect
    size first, so ``k`` is always well above ``n * p`` and the
    recurrence converges in a handful of terms.
    """
    if k <= 0:
        return 1.0
    if k > n or p <= 0.0:
        return 0.0
    if p >= 1.0:
        return 1.0
    log_pmf = (
        math.lgamma(n + 1)
        - math.lgamma(k + 1)
        - math.lgamma(n - k + 1)
        + k * math.log(p)
        + (n - k) * math.log1p(-p)
    )
    pmf = math.exp(log_pmf)
    total = pmf
    x = k
    while x < n:
        nxt = pmf * (n - x) / (x + 1) * p / (1.0 - p)
        total += nxt
        # Terms grow until the mode; only stop once they shrink again.
        if nxt < pmf and nxt < 1e-14 * max(total, 1e-300):
            break
        pmf = nxt
        x += 1
    return min(1.0, total)


def _poisson_tail(k: int, lam: float) -> float:
    """Upper tail ``P(X >= k)`` for ``X ~ Poisson(lam)``."""
    if k <= 0:
        return 1.0
    if lam <= 0.0:
        return 0.0
    pmf = math.exp(-lam + k * math.log(lam) - math.lgamma(k + 1))
    total = pmf
    x = k
    while x < k + 100000:
        nxt = pmf * lam / (x + 1)
        total += nxt
        if nxt < pmf and nxt < 1e-14 * max(total, 1e-300):
            break
        pmf = nxt
        x += 1
    return min(1.0, total)


def _bh_adjust(pvals: list[float]) -> list[float]:
    """Benjamini-Hochberg adjusted p-values (same order as input).

    Every per-column digit/duplicate test in this module is corrected
    against the family of all tests run on the same table -- without
    this, screening dozens of columns would false-positive by
    construction.
    """
    m = len(pvals)
    order = sorted(range(m), key=lambda i: pvals[i])
    qvals = [1.0] * m
    prev = 1.0
    for rank_from_end, i in enumerate(reversed(order)):
        rank = m - rank_from_end
        prev = min(prev, pvals[i] * m / rank)
        qvals[i] = min(1.0, prev)
    return qvals


def _severity_for_q(q: float) -> str | None:
    """Severity discipline (2026-07 research review):

    * corrected p < 0.001 -> ``high``
    * corrected p < 0.01  -> ``medium``
    * corrected p < 0.05  -> ``low`` (screening hint)
    * otherwise           -> no finding

    A single weak signal must never be reported as ``high``.
    """
    if q < 0.001:
        return "high"
    if q < 0.01:
        return "medium"
    if q < 0.05:
        return "low"
    return None


def _chi2_sf_exact(x: float, df: int) -> float:
    """Survival function of the chi-squared distribution with ``df``
    degrees of freedom.

    Regularized upper incomplete gamma ``Q(df/2, x/2)``: series
    expansion below the mode, Lentz continued fraction above it
    (Numerical Recipes ``gammq``). Unlike the older ``_chi2_sf``
    above (kept for the legacy ``_benford_chi2`` helper), this is a
    true upper tail for all x, which the terminal-digit uniformity
    test needs for mid-range chi2 values.
    """
    if x <= 0:
        return 1.0
    a = df / 2.0
    z = x / 2.0
    if z < a + 1.0:
        term = 1.0 / a
        total = term
        for n in range(1, 1000):
            term *= z / (a + n)
            total += term
            if abs(term) < 1e-14 * abs(total):
                break
        p = math.exp(-z + a * math.log(z) - math.lgamma(a)) * total
        return max(0.0, min(1.0, 1.0 - p))
    tiny = 1e-300
    b = z + 1.0 - a
    c = 1.0 / tiny
    d = 1.0 / b
    h = d
    for i in range(1, 1000):
        an = -i * (i - a)
        b += 2.0
        d = an * d + b
        if abs(d) < tiny:
            d = tiny
        c = b + an / c
        if abs(c) < tiny:
            c = tiny
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < 1e-14:
            break
    q = math.exp(-z + a * math.log(z) - math.lgamma(a)) * h
    return max(0.0, min(1.0, q))


# ---------- 2. Duplicate-row detection ----------

def _row_key_exact(row: list[Any]) -> tuple[str, ...]:
    return tuple(str(c).strip() for c in row)


def _row_key_numeric(row: list[Any]) -> tuple[str, ...] | None:
    """Normalize a row to its numeric tokens (order-preserving).

    Used to catch near-duplicates that differ only in labels /
    whitespace / ND placeholders.
    """
    nums: list[str] = []
    for c in row:
        s = str(c).strip()
        if not s or s.upper() in {"ND", "N/A", "NA", "-", "–", "—"}:
            continue
        for m in re.findall(r"\d+(?:\.\d+)?", s):
            nums.append(m)
    if len(nums) < 2:
        return None
    return tuple(nums)


class DuplicateRowDetector:
    """Find rows that are byte-identical or numerically identical
    to another row in the same table. Also scans the PDF text
    layer for repeated multi-number lines (table-like dups when
    formal extraction failed)."""

    name = "table_duplicate_row"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        findings: list[Finding] = []
        for t_index, table in enumerate(_safe_tables(doc)):
            rows = getattr(table, "rows", []) or []
            if not rows:
                continue
            # Exact string rows.
            counts = Counter(_row_key_exact(row) for row in rows)
            dup_groups = [
                (row, n) for row, n in counts.items() if n > 1 and any(row)
            ]
            # Numeric near-dups (same number multiset).
            num_counts: Counter[tuple[str, ...]] = Counter()
            for row in rows:
                nk = _row_key_numeric(row)
                if nk is not None:
                    num_counts[nk] += 1
            num_dups = [
                (row, n) for row, n in num_counts.items() if n > 1
            ]
            if not dup_groups and not num_dups:
                continue
            severity = (
                "high"
                if any(n >= 3 for _, n in dup_groups)
                or any(n >= 3 for _, n in num_dups)
                else "medium"
            )
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity=severity,
                    title=(
                        f"{_format_table_label(table, t_index)} has "
                        f"{len(dup_groups) + len(num_dups)} duplicate "
                        f"row group(s)"
                    ),
                    location=_format_table_label(table, t_index),
                    evidence=json.dumps(
                        {
                            "duplicate_groups": [
                                {
                                    "row": list(row),
                                    "occurrences": n,
                                }
                                for row, n in dup_groups
                            ],
                            "numeric_duplicate_groups": [
                                {
                                    "numbers": list(row),
                                    "occurrences": n,
                                }
                                for row, n in num_dups
                            ],
                        }
                    ),
                )
            )
        # Text-layer fallback: repeated multi-number lines that look
        # like table body rows (when formal tables were empty).
        if not findings:
            findings.extend(_text_layer_duplicate_rows(doc))
        return DetectorResult(
            detector=self.name, findings=findings, ok=True
        )


def _text_layer_duplicate_rows(doc: ParsedDoc) -> list[Finding]:
    """Scan text blocks for repeated numeric-heavy lines."""
    lines: list[str] = []
    for b in getattr(doc, "text_blocks", None) or []:
        t = getattr(b, "text", "") or ""
        for ln in t.splitlines():
            s = re.sub(r"\s+", " ", ln).strip()
            if len(s) < 12:
                continue
            # Skip journal footers / running headers.
            if re.search(
                r"(?i)frontiers in|volume \d|article \d{3,}|doi:|"
                r"january|february|march|april|may|june|july|"
                r"august|september|october|november|december|"
                r"www\.frontiersin",
                s,
            ):
                continue
            nums = re.findall(r"\d+(?:\.\d+)?", s)
            if len(nums) < 3:
                continue
            lines.append(s)
    if not lines:
        return []
    counts = Counter(lines)
    dups = [(ln, n) for ln, n in counts.items() if n > 1]
    if not dups:
        # Also: same numeric signature, different labels.
        sig_counts: Counter[tuple[str, ...]] = Counter()
        sig_examples: dict[tuple[str, ...], str] = {}
        for ln in lines:
            sig = tuple(re.findall(r"\d+(?:\.\d+)?", ln))
            if len(sig) >= 3:
                sig_counts[sig] += 1
                sig_examples.setdefault(sig, ln)
        dups = [
            (sig_examples[sig], n)
            for sig, n in sig_counts.items()
            if n > 1
        ]
    if not dups:
        return []
    return [
        Finding.make(
            trace_id=doc.trace_id,
            detector="table_duplicate_row",
            severity="medium",
            title=(
                f"Text layer has {len(dups)} repeated multi-number "
                f"row(s) (table-like duplicate signal)"
            ),
            location="text",
            evidence=json.dumps(
                {
                    "duplicate_groups": [
                        {"row": [ln], "occurrences": n}
                        for ln, n in dups[:10]
                    ],
                    "source": "text_layer",
                }
            ),
        )
    ]


# ---------- 3. Outlier detection ----------

class OutlierDetector:
    """Detect "too clean" numeric columns (fabrication / over-smoothing).

    Combines classical z-score tails with robust MAD z-scores and IQR
    fences (PyOD-style robust anomaly features, without sklearn).
    """

    name = "table_outlier"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        from ..stats_algo import iqr_outlier_fraction, robust_z_scores

        findings: list[Finding] = []
        for t_index, table in enumerate(_safe_tables(doc)):
            headers = getattr(table, "headers", []) or []
            rows = getattr(table, "rows", []) or []
            cols = _numeric_columns(headers, rows)
            for col_idx, values in cols.items():
                if len(values) < 30:
                    continue
                mean = statistics.fmean(values)
                stdev = statistics.pstdev(values)
                if stdev == 0:
                    continue
                z = [(v - mean) / stdev for v in values]
                extreme = sum(1 for x in z if abs(x) > 3)
                ratio = extreme / len(values)
                rz = robust_z_scores(values)
                extreme_mad = sum(1 for x in rz if abs(x) > 3.5)
                mad_ratio = extreme_mad / len(values)
                iqr_info = iqr_outlier_fraction(values)
                iqr_frac = float(iqr_info.get("outlier_frac") or 0.0)
                # "Too clean": classical AND robust tails both sparse
                too_clean = ratio <= 0.001 and mad_ratio <= 0.001
                # Also flag if IQR finds zero outliers on large n
                # while classical expects some under normality
                if len(values) >= 80 and iqr_frac == 0.0 and ratio <= 0.002:
                    too_clean = True
                if not too_clean:
                    continue
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity="low",
                        title=(
                            f"{_format_table_label(table, t_index)} column "
                            f"'{headers[col_idx]}' has "
                            f"suspiciously few outliers"
                        ),
                        location=(
                            f"{_format_table_label(table, t_index)}, column "
                            f"{col_idx} ('{headers[col_idx]}')"
                        ),
                        evidence=json.dumps(
                            {
                                "n": len(values),
                                "mean": mean,
                                "stdev": stdev,
                                "extreme_count": extreme,
                                "extreme_ratio": ratio,
                                "mad_extreme_count": extreme_mad,
                                "mad_extreme_ratio": mad_ratio,
                                "iqr": iqr_info,
                                "method": "zscore+mad+iqr",
                            }
                        ),
                    )
                )
        return DetectorResult(
            detector=self.name, findings=findings, ok=True
        )


# ---------- 4. Round-number bias ----------

# Thresholds for the hypothesis-tested terminal-digit checks.
# References: Al-Marzouki et al. 2005 (BMJ), Beber & Scacco 2012,
# Preece 1981 -- last digits of honestly reported measurements are
# ~uniform over 0-9, so each digit is expected at 10%, 0/5 together
# at 20%, and any specific two-digit terminal pair at 1%.
_TERMINAL_DIGIT_MIN_N = 30
_TERMINAL_UNIFORM_EFFECT = 1.5  # max digit count >= 1.5x uniform expectation
_TERMINAL_FIVE_MIN_FRAC = 0.15  # effect gate before testing digit 5 vs 10%
_TERMINAL_ROUND_MIN_FRAC = 0.30  # effect gate before testing {0,5} vs 20%
_TERMINAL_PAIR_MIN_COUNT = 5
_TERMINAL_PAIR_EFFECT = 3.0  # top pair count >= 3x the 1% expectation
_TERMINAL_PAIR_BONFERRONI = 100  # selecting the max of 100 pairs


def _numeric_text_columns(
    headers: list[str],
    rows: list[list[str]],
) -> dict[int, list[str]]:
    """Like ``_numeric_columns`` but keeps the raw cell *strings*.

    Terminal-digit and precision analysis must work on the reported
    text, not on parsed floats: parsing collapses trailing zeros
    (``"1.50"`` -> ``1.5``) and destroys the very signal under test.
    """
    out: dict[int, list[str]] = {}
    for col in range(len(headers)):
        texts: list[str] = []
        for row in rows:
            if col >= len(row):
                continue
            text = str(row[col]).strip()
            if _coerce_number(text) is not None:
                texts.append(text)
        if len(texts) >= 2:
            out[col] = texts
    return out


def _last_digit_of_text(text: str) -> str | None:
    """Last digit character of a numeric cell string."""
    for char in reversed(text.strip()):
        if char.isdigit():
            return char
    return None


def _fraction_of_text(text: str) -> str:
    """Fraction digits of a plain decimal cell string (``""`` if none).

    Scientific-notation cells are excluded (their mantissa digits are
    not the reported terminal digits)."""
    t = text.strip().lstrip("+-").rstrip("%")
    if "e" in t.lower() or "." not in t:
        return ""
    frac = t.split(".", 1)[1]
    return frac if frac.isdigit() else ""


def _terminal_digit_tests(texts: list[str]) -> list[dict[str, Any]]:
    """Run the terminal-digit hypothesis tests on one scope of cells.

    Returns a list of test records ``{"check", "p", "detail"}``;
    tests whose effect-size gate fails are skipped entirely (this
    keeps large-n instrument columns from going "significant" on
    trivial deviations). P-values are *raw*: the caller BH-corrects
    them across the table family.
    """
    records: list[dict[str, Any]] = []
    digit_counts: Counter[str] = Counter()
    for text in texts:
        digit = _last_digit_of_text(text)
        if digit is not None:
            digit_counts[digit] += 1
    n_digits = sum(digit_counts.values())
    if n_digits >= _TERMINAL_DIGIT_MIN_N:
        exp = n_digits / 10.0
        top_digit, top_count = digit_counts.most_common(1)[0]
        if top_count >= _TERMINAL_UNIFORM_EFFECT * exp:
            chi2 = sum(
                (digit_counts.get(str(d), 0) - exp) ** 2 / exp
                for d in range(10)
            )
            records.append(
                {
                    "check": "terminal_digit_uniformity",
                    "p": _chi2_sf_exact(chi2, 9),
                    "detail": {
                        "n": n_digits,
                        "chi2": round(chi2, 4),
                        "top_digit": [top_digit, top_count],
                        "counts": {
                            str(d): digit_counts.get(str(d), 0)
                            for d in range(10)
                        },
                    },
                }
            )
        five = digit_counts.get("5", 0)
        if five / n_digits >= _TERMINAL_FIVE_MIN_FRAC:
            records.append(
                {
                    "check": "terminal_digit_five_bias",
                    "p": _binom_tail(five, n_digits, 0.1),
                    "detail": {
                        "n": n_digits,
                        "digit": "5",
                        "count": five,
                        "fraction": round(five / n_digits, 4),
                        "expected_fraction": 0.1,
                    },
                }
            )
        round_ = digit_counts.get("0", 0) + five
        if round_ / n_digits >= _TERMINAL_ROUND_MIN_FRAC:
            records.append(
                {
                    "check": "terminal_digit_round_bias",
                    "p": _binom_tail(round_, n_digits, 0.2),
                    "detail": {
                        "n": n_digits,
                        "digits": ["0", "5"],
                        "count": round_,
                        "fraction": round(round_ / n_digits, 4),
                        "expected_fraction": 0.2,
                    },
                }
            )
    # Last-two-decimal-digit pair concentration (Beber & Scacco
    # style): test the single most frequent pair against its 1%
    # null with a Bonferroni x100 for max-selection. We deliberately
    # do NOT chi-square over all 100 pairs -- power is far too low.
    pair_counts: Counter[str] = Counter()
    for text in texts:
        frac = _fraction_of_text(text)
        if len(frac) >= 2:
            pair_counts[frac[-2:]] += 1
    m = sum(pair_counts.values())
    if m >= _TERMINAL_DIGIT_MIN_N and pair_counts:
        pair, k = pair_counts.most_common(1)[0]
        if k >= _TERMINAL_PAIR_MIN_COUNT and k >= _TERMINAL_PAIR_EFFECT * m / 100.0:
            p = _binom_tail(k, m, 0.01) * _TERMINAL_PAIR_BONFERRONI
            records.append(
                {
                    "check": "terminal_digit_pair_binomial",
                    "p": min(1.0, p),
                    "detail": {
                        "n": m,
                        "pair": pair,
                        "count": k,
                        "expected_fraction": 0.01,
                        "bonferroni_pairs": _TERMINAL_PAIR_BONFERRONI,
                    },
                }
            )
    return records


class RoundBiasDetector:
    """Last-digit forensic bias (0/5 over-representation).

    Two layers:

    * Hypothesis-tested terminal-digit checks (2026-07): per column
      and pooled per table -- last-digit uniformity (chi2, 9 df),
      digit-5 bias and 0/5 bias (binomial vs 0.1 / 0.2), and most-
      frequent last-two-decimal-digit pair (binomial vs 0.01,
      Bonferroni x100). All p-values in a table are BH-corrected as
      one family; severity follows the corrected p (``<0.001`` high,
      ``<0.01`` medium, ``<0.05`` low). Requires n>=30 per scope.
    * Legacy ratio heuristic via
      :func:`manusift.stats_algo.last_digit_round_bias`, kept for
      small columns (n 10-29) where the chi-square/binomial tests
      are underpowered. Columns already flagged by the statistical
      layer are not double-reported.
    """

    name = "table_round_bias"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        from ..stats_algo import last_digit_round_bias

        findings: list[Finding] = []
        for t_index, table in enumerate(_safe_tables(doc)):
            headers = getattr(table, "headers", []) or []
            rows = getattr(table, "rows", []) or []
            label = _format_table_label(table, t_index)
            text_cols = _numeric_text_columns(headers, rows)
            covered = self._statistical_findings(
                doc, table, t_index, label, headers, text_cols, findings
            )
            # Legacy heuristic for columns the statistical layer did
            # not cover (mostly n < 30).
            cols = _numeric_columns(headers, rows)
            for col_idx, values in cols.items():
                if col_idx in covered or len(values) < 10:
                    continue
                analysis = last_digit_round_bias(values)
                ratio = float(analysis.get("round_ratio") or 0.0)
                flags = list(analysis.get("flags") or [])
                # Fire if 0/5 bias OR strong non-uniform last digits
                if ratio <= 0.35 and "last_digit_nonuniform" not in flags:
                    continue
                severity = "high" if ratio > 0.6 else "medium"
                if ratio <= 0.35 and "last_digit_nonuniform" in flags:
                    severity = "low"
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity=severity,
                        title=(
                            f"{_format_table_label(table, t_index)} column "
                            f"'{headers[col_idx]}' shows "
                            f"round-number / last-digit bias"
                        ),
                        location=(
                            f"{_format_table_label(table, t_index)}, column "
                            f"{col_idx} ('{headers[col_idx]}')"
                        ),
                        evidence=json.dumps(
                            {
                                "n": analysis.get("n"),
                                "round_ratio": ratio,
                                "last_digit_counts": analysis.get("counts"),
                                "last_digit_chi2": analysis.get("chi2"),
                                "last_digit_pvalue": analysis.get("pvalue"),
                                "flags": flags,
                                "method": "last_digit_forensics",
                            }
                        ),
                    )
                )
        return DetectorResult(
            detector=self.name, findings=findings, ok=True
        )

    def _statistical_findings(
        self,
        doc: ParsedDoc,
        table: Any,
        t_index: int,
        label: str,
        headers: list[str],
        text_cols: dict[int, list[str]],
        findings: list[Finding],
    ) -> set[int]:
        """Run the BH-corrected terminal-digit tests for one table.

        Appends at most one finding per scope (per column, plus one
        pooled per-table finding when the table has >= 2 numeric
        columns -- small lab tables only reach n>=30 when pooled).
        Returns the set of column indices that received a finding so
        the legacy layer does not double-report them.
        """
        records: list[dict[str, Any]] = []
        for col_idx, texts in sorted(text_cols.items()):
            if len(texts) < _TERMINAL_DIGIT_MIN_N:
                continue
            for rec in _terminal_digit_tests(texts):
                rec["scope"] = ("column", col_idx)
                records.append(rec)
        if len(text_cols) >= 2:
            pooled = [t for texts in text_cols.values() for t in texts]
            if len(pooled) >= _TERMINAL_DIGIT_MIN_N:
                for rec in _terminal_digit_tests(pooled):
                    rec["scope"] = ("table", None)
                    records.append(rec)
        if not records:
            return set()
        qvals = _bh_adjust([float(rec["p"]) for rec in records])
        for rec, q in zip(records, qvals):
            rec["q_bh"] = q
        # Group by scope; emit one finding per significant scope.
        by_scope: dict[tuple[str, Any], list[dict[str, Any]]] = {}
        for rec in records:
            sev = _severity_for_q(float(rec["q_bh"]))
            if sev is not None:
                by_scope.setdefault(rec["scope"], []).append(rec)
        covered: set[int] = set()
        for (scope, col_idx), scope_records in sorted(
            by_scope.items(), key=lambda item: str(item[0])
        ):
            best_q = min(float(r["q_bh"]) for r in scope_records)
            severity = _severity_for_q(best_q) or "low"
            checks = [str(r["check"]) for r in scope_records]
            if scope == "column":
                header = (
                    headers[col_idx] if col_idx < len(headers) else f"col_{col_idx + 1}"
                )
                title = (
                    f"{label} column '{header}' shows statistically "
                    f"improbable terminal digits"
                )
                location = f"{label}, column {col_idx} ('{header}')"
                covered.add(col_idx)
            else:
                title = (
                    f"{label} shows statistically improbable terminal "
                    f"digits (pooled across columns)"
                )
                location = label
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity=severity,
                    title=title,
                    location=location,
                    evidence=json.dumps(
                        {
                            "method": (
                                "terminal_digit_hypothesis_tests "
                                "(uniformity chi2 / binomial 5-bias / "
                                "binomial 0,5-bias / pair binomial), "
                                "BH-corrected per table"
                            ),
                            "scope": scope,
                            "checks": checks,
                            "tests": [
                                {
                                    "check": r["check"],
                                    "p_raw": r["p"],
                                    "q_bh": round(float(r["q_bh"]), 6),
                                    **r["detail"],
                                }
                                for r in scope_records
                            ],
                            "family_size": len(records),
                        }
                    ),
                )
            )
        return covered
