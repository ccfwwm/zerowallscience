"""Statistical consistency detectors (P0.2-P0.4).

A surprising number of
fabrication cases in
academic papers are caught
not by a sophisticated
algorithm but by *grade-
school arithmetic*. A mean
computed from a Likert-scale
questionnaire has to be a
multiple of 1/N. A
percentage reported in a
table has to be a multiple
of 100/n. A p-value that
comes from an F-test on a
small sample has to be one
of a small set of values.

This module layers three
detectors on the same input
format -- a column of
numbers -- but each catches
a different kind of fraud:

  * **GRIM (Granularity-
    Related Inconsistency of
    Means)**: for a column
    of N discrete values
    whose true mean is
    reported to ``d`` decimal
    places, the value
    ``mean * N`` must be a
    multiple of ``1/10**d``.
    If it is not, the mean
    cannot have come from
    that sample -- either
    the sample size is
    wrong, the granularity
    is wrong, or the mean
    is fabricated. The test
    is from Brown and Heene
    (2017) and is the
    standard tool for
    catching survey-data
    fabrication.

  * **Percent-times-N
    divisibility**: a
    percentage column
    reported to ``d``
    decimal places must be a
    multiple of ``(100 *
    10**d) / N``. E.g. if
    30 out of 50 responded
    "yes", the percentage is
    60.00; if 30.5 out of
    50 responded "yes", the
    percentage is 61.00 --
    which is *not* a
    multiple of 2 (= 100 /
    50). A 60.5% would also
    fail.

  * **p-value plausibility**:
    when a paper reports a
    correlation ``r`` and a
    sample size ``N``, the
    exact two-tailed p-value
    can be recomputed. We
    implement the
    ``scipy.stats.pearsonr``
    formula. A reported
    p-value that disagrees
    with the recomputed one
    is a strong fabrication
    signal.

The detectors accept a
``doc.tables`` field. We do
not currently extract
numerical tables from the
PDF text -- that is a
separate problem (T5) --
so for now the detectors
are run *only* when the
caller has attached tables
to the document. The
helper
``extract_numbers_from_text``
can pull simple column
data from running text if
needed.

Borrowed from Brown and
Heene (2017), "The GRIM
Test", and the R package
``statcheck`` for the
p-value recomputation.
"""
from __future__ import annotations

import json
import math
import re
from typing import Any

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult


# ---------- number parsing ----------

# Match floats (incl. scientific
# notation) but not years or
# p-values with leading zeros.
_NUMBER = re.compile(
    r"-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?"
)


def _safe_float(s: str) -> float | None:
    """Parse a string as a
    float; return None on
    failure. We do not use
    ``float()`` directly
    because we want to handle
    ``NaN`` and ``inf``
    gracefully (those are
    never valid statistics)."""
    try:
        v = float(s)
    except (TypeError, ValueError):
        return None
    if math.isnan(v) or math.isinf(v):
        return None
    return v


def _decimal_places(s: str) -> int:
    """Infer the number of
    decimal places in a
    string representation of
    a number. ``"3.14"`` -> 2;
    ``"3"`` -> 0; ``"3.140"``
    -> 3. We count the digits
    *after* the dot, including
    trailing zeros, because a
    reported ``"3.140"``
    carries the implication
    that the author measured
    to three decimal places
    even if the value happens
    to end in zero. GRIM is
    about *reported*
    precision, not effective
    precision."""
    if "." in s:
        after = s.split(".", 1)[1]
        return len(after)
    if "e" in s or "E" in s:
        # Scientific notation
        # -- the decimal
        # places depend on
        # the exponent. We
        # treat it as 0 for
        # simplicity.
        return 0
    return 0


# ---------- GRIM test ----------


def _grim_test(
    values: list[float], reported_mean: float, decimals: int
) -> bool:
    """Return True if the reported mean is GRIM-consistent with n.

    Delegates to :func:`manusift.stats_algo.grim_from_sample`, the
    Brown & Heathers (2016) formulation used by open-source tools
    (``grim_test``, ``rsprite2``): there must exist an integer total
    sum that rounds to the reported mean at ``decimals`` places.
    """
    if not values:
        return True
    from ..stats_algo import grim_from_sample

    return grim_from_sample(values, reported_mean, decimals)


class GrimTestDetector:
    """The GRIM test on every
    numerical column of every
    table attached to the
    document.

    A table in this codebase
    is a simple object with
    ``headers`` and ``rows``
    (see ``table_ocr`` for
    the OCR pipeline that
    produces them). The
    detector skips columns
    that look like
    identifiers (years, IDs)
    and focuses on the
    columns whose header
    contains the word
    "mean" or "average" or
    whose values cluster
    between 0 and 10
    (typical Likert means).

    R-2026-06-15 (T5.1):
    the original detector
    required the column to
    be labelled "mean" /
    "average" before running
    the GRIM check, which
    meant it fired 0 times on
    Frontiers papers (whose
    text doesn't write "mean=X"
    in the body).  We now
    ALSO run a *sensitive*
    GRIM check on every
    numeric column that has
    a sibling N column:
    ``value * n`` must be a
    multiple of ``1/10^decimals``.
    A real Frontiers figure
    table typically has
    ``n`` and a numeric value
    column (e.g. ``pct``,
    ``F``, ``p_value``,
    ``chi2``, etc.).  When
    the value column's
    reported decimal-places
    are not consistent with
    the N, we now emit a
    high-severity finding.

    2026-07 (statcheck/GRIM
    upgrade): three further
    guards.
    * GRIM is skipped for
      N > 200 -- the 1/N
      granularity is so fine
      there that the test has
      no discriminative power
      (known GRIM trap).
    * **DEBIT** (c): when a
      table reports a binary
      proportion, an SD and
      N, the SD is determined
      in closed form --
      ``sqrt(p(1-p) N/(N-1))``
      -- and any deviation is
      impossible (high).
    * **GRIMMER bound** (d):
      for a GRIM-consistent
      mean on an assumed
      Likert scale, the sample
      SD is bounded above by
      the all-endpoints split;
      a larger reported SD is
      impossible (high).
    """

    name = "stat_grim"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        findings: list[Finding] = []
        tables = getattr(doc, "tables", []) or []
        for t_idx, table in enumerate(tables):
            headers = getattr(table, "headers", [])
            rows = getattr(table, "rows", [])
            if not headers or not rows:
                continue
            n_col = _find_n_column(headers, -1)
            if n_col is None:
                # No N column in this
                # table -- we cannot
                # run any check that
                # requires a sample
                # size.  Skip the
                # table entirely.
                continue
            # Pull the N values
            # once per table -- we
            # will cross-check
            # every numeric column
            # against this N.
            n_values: list[int] = []
            for r_idx, row in enumerate(rows):
                if n_col >= len(row):
                    continue
                v = _safe_float(row[n_col])
                if v is None:
                    n_values.append(-1)
                else:
                    n_values.append(int(v))
            # ---- (a) original
            # mean-column check ----
            for c_idx, header in enumerate(headers):
                h = (header or "").lower()
                if c_idx == n_col:
                    continue
                if not any(
                    k in h
                    for k in (
                        "mean", "average", "m ", "avg"
                    )
                ):
                    continue
                # Mean-column GRIM test
                # (original behaviour)
                for r_idx, row in enumerate(rows):
                    if c_idx >= len(row):
                        continue
                    cell = str(row[c_idx]).strip()
                    v = _safe_float(cell)
                    if v is None:
                        continue
                    if r_idx >= len(n_values):
                        continue
                    n = n_values[r_idx]
                    if n < 2 or n > 200:
                        # 2026-07 (GRIM traps):
                        # above N≈200 the 1/N
                        # granularity is so fine
                        # that GRIM has no
                        # discriminative power --
                        # skip instead of firing
                        # on rounding noise.
                        continue
                    decimals = _decimal_places(cell)
                    if _grim_test(
                        [0.0] * n, v, decimals
                    ):
                        continue
                    findings.append(
                        Finding.make(
                            trace_id=doc.trace_id,
                            detector=self.name,
                            # 2026-07 (negative_controls_v1):
                            # a "mean" column may hold
                            # continuous data (assays,
                            # weights) where GRIM is not
                            # applicable, so this check is
                            # low-severity by design; only
                            # pct-like columns (integer-count
                            # domain) justify high below.
                            severity="low",
                            title=(
                                f"Table {t_idx + 1} "
                                f"column '{header}' "
                                f"value {cell} "
                                f"fails GRIM test for "
                                f"N={n} (decimals="
                                f"{decimals})"
                            ),
                            location=(
                                f"table {t_idx + 1}, "
                                f"column {c_idx + 1}"
                            ),
                            evidence=json.dumps(
                                {
                                    "check": "grim_mean",
                                    "table": t_idx + 1,
                                    "column": header,
                                    "row_index": r_idx,
                                    "reported_mean": v,
                                    "n": n,
                                    "decimals": decimals,
                                    "expected_product": v * n,
                                }
                            ),
                        )
                    )
            # ---- (b) T5.1: sensitive
            # GRIM check on EVERY
            # numeric column ----
            # For each column that is
            # not the N column itself,
            # try to interpret each
            # cell as a number.  If
            # the cell is a number with
            # 1+ decimal places, run
            # the GRIM test (value * n
            # must be a multiple of
            # 1/10^decimals).  This
            # catches the common case
            # where a Frontiers figure
            # table reports a
            # percentage with
            # inconsistent
            # decimal-places.
            for c_idx, header in enumerate(headers):
                if c_idx == n_col:
                    continue
                # Skip the mean columns
                # already covered by
                # (a) above -- the
                # original detector
                # is the more accurate
                # check when the column
                # is explicitly labelled
                # "mean".
                h = (header or "").lower()
                if any(
                    k in h
                    for k in (
                        "mean", "average", "m ", "avg"
                    )
                ):
                    continue
                # Skip the N column and
                # any column whose
                # header indicates an
                # identifier (year,
                # ID, sample / samplesize
                # -- same as the helper
                # above).
                if _is_identifier_column(h):
                    continue
                # 2026-07 (negative_controls_v1): also skip
                # statistical-quantity columns (p-values, test
                # statistics, dispersion, effect sizes) -- GRIM
                # is a category error there.
                if _is_stat_quantity_column(h):
                    continue
                # Per-cell check.
                for r_idx, row in enumerate(rows):
                    if c_idx >= len(row):
                        continue
                    cell = str(row[c_idx]).strip()
                    v = _safe_float(cell)
                    if v is None:
                        continue
                    if r_idx >= len(n_values):
                        continue
                    n = n_values[r_idx]
                    if n < 2 or n > 200:
                        # Same GRIM trap as the
                        # mean-column check above:
                        # N>200 has no
                        # discriminative power.
                        continue
                    decimals = _decimal_places(cell)
                    # The cell must have at
                    # least 1 decimal
                    # place for the GRIM
                    # test to be
                    # meaningful -- an
                    # integer cell is
                    # always GRIM-consistent
                    # regardless of n.
                    if decimals < 1:
                        continue
                    # Also skip very large
                    # or very small values
                    # -- GRIM is designed
                    # for values that are
                    # plausibly averages /
                    # percentages, not for
                    # raw counts.
                    if abs(v) > 1000:
                        continue
                    if _grim_test(
                        [0.0] * n, v, decimals
                    ):
                        continue
                    # 2026-07 (negative_controls_v1): only
                    # pct-like columns (counts expressed as
                    # percentages/proportions) are definitely
                    # in GRIM's integer domain and justify
                    # high; other decimal columns may be
                    # continuous means, so they stay low.
                    _pct_header = bool(
                        re.search(
                            r"\b(pct|percent|percentage|"
                            r"proportion|%)\b",
                            h,
                        )
                    )
                    findings.append(
                        Finding.make(
                            trace_id=doc.trace_id,
                            detector=self.name,
                            severity="high" if _pct_header else "low",
                            title=(
                                f"Table {t_idx + 1} "
                                f"column '{header}' "
                                f"value {cell} "
                                f"fails GRIM test for "
                                f"N={n} (decimals="
                                f"{decimals})"
                            ),
                            location=(
                                f"table {t_idx + 1}, "
                                f"column {c_idx + 1}, "
                                f"row {r_idx + 1}"
                            ),
                            evidence=json.dumps(
                                {
                                    "check": "grim_sensitive",
                                    "table": t_idx + 1,
                                    "column": header,
                                    "row_index": r_idx,
                                    "reported_value": v,
                                    "n": n,
                                    "decimals": decimals,
                                    "expected_product": v * n,
                                }
                            ),
                        )
                    )
            # ---- (c) 2026-07: DEBIT
            # (binary proportion/SD/N) and
            # (d) GRIMMER SD upper bound ----
            # Both are closed-form,
            # zero-false-positive checks, so
            # they fire at high severity --
            # but only under strict column
            # guards (see the helpers).
            findings.extend(
                self._scan_debit_rows(
                    doc, t_idx, headers, rows, n_values
                )
            )
            findings.extend(
                self._scan_grimmer_rows(
                    doc, t_idx, headers, rows, n_values
                )
            )
        return DetectorResult(
            detector=self.name, findings=findings, ok=True
        )

    # ---- (c) DEBIT: for binary 0/1 data
    # the SD is determined by the
    # proportion and N.
    def _scan_debit_rows(
        self,
        doc: ParsedDoc,
        t_idx: int,
        headers: list[str],
        rows: list[list[str]],
        n_values: list[int],
    ) -> list[Finding]:
        from ..stats_algo import debit_check

        out: list[Finding] = []
        sd_col = _find_sd_column(headers)
        prop_col = _find_binary_prop_column(headers)
        if sd_col is None or prop_col is None:
            return out
        for r_idx, row in enumerate(rows):
            if prop_col >= len(row) or sd_col >= len(row):
                continue
            if r_idx >= len(n_values):
                continue
            n = n_values[r_idx]
            if n < 2:
                continue
            p_cell = str(row[prop_col]).strip()
            s_cell = str(row[sd_col]).strip()
            p_val = _safe_float(p_cell)
            s_val = _safe_float(s_cell)
            if p_val is None or s_val is None:
                continue
            # Percentages are divided by 100
            # (and gain 2 decimal places of
            # proportion precision) before the
            # closed-form comparison.
            h_p = (headers[prop_col] or "").lower()
            p_dec = _decimal_places(p_cell)
            if (
                "%" in h_p
                or "percent" in h_p
                or "pct" in h_p
                or p_val > 1.0
            ):
                prop = p_val / 100.0
                prop_dec = p_dec + 2
            else:
                prop = p_val
                prop_dec = p_dec
            if not (0.0 <= prop <= 1.0):
                continue
            res = debit_check(
                prop,
                s_val,
                n,
                prop_dec=prop_dec,
                sd_dec=_decimal_places(s_cell),
            )
            if res["consistent"]:
                continue
            out.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="high",
                    title=(
                        f"Table {t_idx + 1} row {r_idx + 1}: "
                        f"reported SD {s_cell} impossible for "
                        f"binary proportion {p_cell} at N={n} "
                        f"(DEBIT; expected SD≈"
                        f"{res['expected_sd']:.4g})"
                    ),
                    location=(
                        f"table {t_idx + 1}, row {r_idx + 1}"
                    ),
                    evidence=json.dumps(
                        {
                            "check": "debit",
                            "table": t_idx + 1,
                            "row_index": r_idx,
                            "prop_column": headers[prop_col],
                            "sd_column": headers[sd_col],
                            "reported_prop": prop,
                            "reported_sd": s_val,
                            "n": n,
                            "expected_sd": res["expected_sd"],
                            "delta": res["delta"],
                            "tol": res["tol"],
                        }
                    ),
                )
            )
        return out

    # ---- (d) GRIMMER upper bound: the
    # sample SD of integer scale data with a
    # fixed mean is maximised when all
    # responses sit at the scale endpoints
    # (closed form). A reported SD above
    # that bound cannot exist.
    def _scan_grimmer_rows(
        self,
        doc: ParsedDoc,
        t_idx: int,
        headers: list[str],
        rows: list[list[str]],
        n_values: list[int],
    ) -> list[Finding]:
        from ..stats_algo import grim_consistent, grimmer_sd_max

        out: list[Finding] = []
        sd_col = _find_sd_column(headers)
        if sd_col is None:
            return out
        for c_idx, header in enumerate(headers):
            h = (header or "").lower()
            if c_idx == sd_col:
                continue
            if not any(
                k in h for k in ("mean", "average", "m ", "avg")
            ):
                continue
            for r_idx, row in enumerate(rows):
                if c_idx >= len(row) or sd_col >= len(row):
                    continue
                if r_idx >= len(n_values):
                    continue
                n = n_values[r_idx]
                if n < 2 or n > 200:
                    continue
                m_cell = str(row[c_idx]).strip()
                s_cell = str(row[sd_col]).strip()
                mean = _safe_float(m_cell)
                sd = _safe_float(s_cell)
                if mean is None or sd is None or sd < 0:
                    continue
                # Scale bounds follow the
                # heuristic already used by
                # ``grimmer_sd_possible``
                # (Likert 1-7 / 0-10); without
                # assumed bounds the SD cannot
                # be refuted.
                if 1.0 <= mean <= 7.0:
                    lo_b, hi_b = 1.0, 7.0
                elif 0.0 <= mean <= 10.0:
                    lo_b, hi_b = 0.0, 10.0
                else:
                    continue
                dec_m = _decimal_places(m_cell)
                dec_s = _decimal_places(s_cell)
                # Only judge means that are
                # GRIM-consistent, i.e. data
                # that plausibly ARE integer
                # scale responses; continuous
                # means are out of domain.
                if not grim_consistent(
                    mean, n, decimals=dec_m
                ):
                    continue
                half_m = 0.5 * 10.0 ** (-dec_m)
                bound = max(
                    grimmer_sd_max(
                        mean - half_m, n, lo_b, hi_b
                    ),
                    grimmer_sd_max(
                        mean + half_m, n, lo_b, hi_b
                    ),
                )
                slack = 0.5 * 10.0 ** (-dec_s)
                if sd <= bound + slack:
                    continue
                out.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity="high",
                        title=(
                            f"Table {t_idx + 1} row "
                            f"{r_idx + 1}: reported SD "
                            f"{s_cell} exceeds the maximum "
                            f"possible SD "
                            f"(≈{bound:.3g}) for mean "
                            f"{m_cell} on scale "
                            f"[{lo_b:g},{hi_b:g}] at "
                            f"N={n} (GRIMMER bound)"
                        ),
                        location=(
                            f"table {t_idx + 1}, "
                            f"row {r_idx + 1}"
                        ),
                        evidence=json.dumps(
                            {
                                "check": "grimmer_sd_bound",
                                "table": t_idx + 1,
                                "row_index": r_idx,
                                "mean_column": header,
                                "sd_column": headers[sd_col],
                                "reported_mean": mean,
                                "reported_sd": sd,
                                "n": n,
                                "scale_lo": lo_b,
                                "scale_hi": hi_b,
                                "sd_max": bound,
                            }
                        ),
                    )
                )
        return out


def _is_identifier_column(header: str) -> bool:
    """R-2026-06-15 (T5.1):
    return True if a column
    header looks like an
    identifier (year, ID, sample
    size) and the GRIM test
    should NOT be applied to it.

    Used by ``GrimTestDetector``
    to skip the sensitive-GRIM
    sub-check on columns that
    are clearly not averages
    (e.g. an "id" column, a
    "year" column, or a "p"
    column where p means page
    not p-value).
    """
    h = header.lower().strip()
    if not h:
        return True
    # year, id, p (page), t (time)
    if h in (
        "year", "id", "p", "t", "i",
        "dof", "df", "n", "k",
    ):
        return True
    if h.startswith("id_") or h.startswith("id-"):
        return True
    if h.startswith("year_") or h.startswith("year-"):
        return True
    return False


# 2026-07 (negative_controls_v1): the sensitive GRIM sub-check
# must NOT run on *statistical-quantity* columns. GRIM asks
# "could this decimal be the mean of N integers?" -- p-values,
# test statistics, effect sizes and dispersion measures are not
# means of integer observations, so the test is a category
# error there (it flagged p_value=0.05 at N=7 on a legitimate
# BMC paper: 0.05*7=0.35 is not an integer, which is expected
# and meaningless).
_STAT_QUANTITY_HEADERS = {
    "p_value", "p-value", "p value", "pvalue", "p(2-tailed)",
    "p (2-tailed)", "sig", "sig.", "significance",
    "t_value", "t-value", "t value", "t_stat", "t stat",
    "t_statistic", "t statistic", "t",
    "f_value", "f-value", "f value", "f_stat", "f stat",
    "f_statistic", "f statistic", "f",
    "chi2", "chi-square", "chi square", "χ²", "x2",
    "z", "z_value", "z-value", "z score", "z_score", "zscore",
    "sd", "std", "se", "sem", "stddev", "stdev",
    "standard deviation", "standard error",
    "r", "r2", "r^2", "rho", "tau",
    "or", "hr", "rr", "odds ratio", "hazard ratio",
    "risk ratio", "ci", "95% ci", "ci95",
    "effect size", "cohen's d", "cohens d", "d",
}


def _is_stat_quantity_column(header: str) -> bool:
    """True for columns holding p-values / test statistics /
    dispersion / effect-size quantities -- never GRIM targets."""
    h = header.lower().strip()
    if not h:
        return True
    if h in _STAT_QUANTITY_HEADERS:
        return True
    # "mean ± sd" composite headers: the cells do not parse as
    # plain floats anyway, but guard the header anyway.
    if "±" in h:
        return True
    return False


def _find_n_column(
    headers: list[str], exclude: int
) -> int | None:
    """Find the column index
    whose header is "n" or
    "sample" or "N"."""
    for i, h in enumerate(headers):
        if i == exclude:
            continue
        h_low = (h or "").lower().strip()
        if h_low in ("n", "sample", "samplesize", "size"):
            return i
    return None


# 2026-07 (DEBIT / GRIMMER bound checks): column finders for the
# closed-form SD checks.  Both are deliberately strict -- they are
# zero-false-positive designs, so they only run when the headers
# unambiguously declare the required quantities.
_SD_COLUMN_HEADERS = {
    "sd",
    "std",
    "stdev",
    "stddev",
    "sd.",
    "standard deviation",
    "standard dev",
}


def _find_sd_column(headers: list[str]) -> int | None:
    """Index of an explicit SD column, or None."""
    for i, h in enumerate(headers):
        if (h or "").lower().strip() in _SD_COLUMN_HEADERS:
            return i
    return None


# DEBIT's closed form only applies to binary 0/1 data, so the
# proportion column header must ALSO say the outcome is binary -- a
# bare "%" is not enough (continuous percentages such as "body fat %"
# would be false positives).
_PROP_HEADER_RE = re.compile(
    r"(\b(pct|percent|percentage|proportion|rate)\b|%)",
    re.IGNORECASE,
)
_BINARY_OUTCOME_RE = re.compile(
    r"(yes|no\b|binary|0/1|response|respond|event|success|failure|"
    r"prevalence|incidence|positive|negative|female|male|surviv|"
    r"mortality|smok|disease|infect|vaccin)",
    re.IGNORECASE,
)


def _find_binary_prop_column(headers: list[str]) -> int | None:
    """Index of a proportion/percent column whose header signals a
    binary outcome (DEBIT domain), or None."""
    for i, h in enumerate(headers):
        h_low = (h or "").lower()
        if _PROP_HEADER_RE.search(h_low) and _BINARY_OUTCOME_RE.search(
            h_low
        ):
            return i
    return None


# ---------- percent * n divisibility ----------


class PercentDivisibilityDetector:
    """For every column whose
    header mentions
    "percent" or "%", check
    that ``value * n / 100``
    is an integer for the
    reported sample size.

    We need the
    sample-size column to
    look up N for each row.
    """

    name = "stat_percent"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        findings: list[Finding] = []
        tables = getattr(doc, "tables", []) or []
        for t_idx, table in enumerate(tables):
            headers = getattr(table, "headers", [])
            rows = getattr(table, "rows", [])
            if not headers or not rows:
                continue
            for c_idx, header in enumerate(headers):
                h = (header or "").lower()
                if not (
                    "%" in header
                    or "percent" in h
                    or "proportion" in h
                ):
                    continue
                n_col = _find_n_column(headers, c_idx)
                if n_col is None:
                    continue
                for r_idx, row in enumerate(rows):
                    if c_idx >= len(row) or n_col >= len(row):
                        continue
                    cell = str(row[c_idx]).strip()
                    pct = _safe_float(cell)
                    if pct is None:
                        continue
                    n = int(float(row[n_col]))
                    expected = pct * n / 100
                    if abs(expected - round(expected)) < 1e-9:
                        continue
                    findings.append(
                        Finding.make(
                            trace_id=doc.trace_id,
                            detector=self.name,
                            severity="high",
                            title=(
                                f"Table {t_idx + 1} "
                                f"column '{header}' "
                                f"value {pct}% does not "
                                f"correspond to a whole "
                                f"number of N={n} cases"
                            ),
                            location=(
                                f"table {t_idx + 1}, "
                                f"column {c_idx + 1}, "
                                f"row {r_idx + 1}"
                            ),
                            evidence=json.dumps(
                                {
                                    "table": t_idx + 1,
                                    "column": header,
                                    "row": r_idx + 1,
                                    "percent": pct,
                                    "n": n,
                                    "expected_count": expected,
                                }
                            ),
                        )
                    )
        return DetectorResult(
            detector=self.name,
            findings=findings,
            ok=True,
        )


# ---------- p-value plausibility ----------


def _pearson_p(r: float, n: int) -> float:
    """Compute the two-tailed
    p-value for a Pearson
    correlation ``r`` with
    ``n`` observations.

    Formula:
        t = r * sqrt((n-2) / (1 - r**2))
        p = 2 * (1 - t_cdf(|t|, n - 2))

    We use the regularised
    incomplete beta function
    to avoid pulling in
    scipy. The implementation
    follows the Numerical
    Recipes routine.
    """
    if n < 3 or abs(r) >= 1.0:
        # r == 1.0 or -1.0
        # implies a perfect
        # correlation -- the
        # p-value is 0.0.
        return 0.0
    t2 = (r * r) * (n - 2) / (1.0 - r * r)
    t = math.sqrt(t2)
    # Use the identity
    # p = I_x(a/2, b/2) where
    # x = df / (df + t^2),
    # a = df, b = 1.
    df = n - 2
    x = df / (df + t2)
    return _regularized_incomplete_beta(
        x, df / 2.0, 0.5
    )


def _regularized_incomplete_beta(
    x: float, a: float, b: float
) -> float:
    """The regularised
    incomplete beta function
    ``I_x(a, b)`` for
    ``a > 0``, ``b > 0``,
    ``0 <= x <= 1``.

    Implementation: a simple
    continued-fraction
    expansion that is good to
    ~1e-6 -- well within the
    tolerance we need for
    p-value recomputation.
    """
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    # Use the symmetry
    # ``I_x(a, b) = 1 -
    # I_{1-x}(b, a)`` to keep
    # ``x`` below 0.5 -- the
    # continued fraction is
    # more accurate there.
    if x > 0.5:
        return 1.0 - _regularized_incomplete_beta(
            1.0 - x, b, a
        )
    # Continued fraction
    # from Numerical Recipes.
    qab = a + b
    qap = a + 1.0
    qam = a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < 1e-30:
        d = 1e-30
    d = 1.0 / d
    h = d
    for m in range(1, 200):
        m2 = 2 * m
        # Even step
        aa = m * (b - m) * x / (
            (qam + m2) * (a + m2)
        )
        d = 1.0 + aa * d
        if abs(d) < 1e-30:
            d = 1e-30
        c = 1.0 + aa / c
        if abs(c) < 1e-30:
            c = 1e-30
        d = 1.0 / d
        h *= d * c
        # Odd step
        aa = -(a + m) * (qab + m) * x / (
            (a + m2) * (qap + m2)
        )
        d = 1.0 + aa * d
        if abs(d) < 1e-30:
            d = 1e-30
        c = 1.0 + aa / c
        if abs(c) < 1e-30:
            c = 1e-30
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < 1e-12:
            break
    # Final scaling.
    lbeta = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
    front = math.exp(
        lbeta + a * math.log(x) + b * math.log(1 - x)
    )
    return front * h / a


def _normal_two_tailed_p(t_abs: float) -> float:
    """Two-tailed p-value for |t| under the normal
    approximation. Valid for df ≳ 30; used only as a
    coarse screen with wide tolerance bands (0.15)."""
    return math.erfc(t_abs / math.sqrt(2.0))


# Table-column header patterns for the table-based t/p
# consistency scan (2026-07, fraud_web_v1 web_cureus_01):
# papers routinely report t- and p-values as table columns
# instead of inline "t(df) = x, p = y" text, which the
# statcheck-style regexes cannot see.
_T_HEADER_RE = re.compile(
    r"^(t|t-value|t value|t-stat(?:istic)?|t stat(?:istic)?|"
    r"t score|t-score|z|z-value|z value|z score|z-score|wald)\b.*$",
    re.IGNORECASE,
)
_P_HEADER_RE = re.compile(
    r"^(p|p-value|p value|p-value \(2-tailed\)|sig\.?|"
    r"p \(2-tailed\)|p \(two-tailed\))\b.*$",
    re.IGNORECASE,
)


class PValueConsistencyDetector:
    """Recompute the p-value
    for every (r, n) pair
    reported in the text and
    compare to the reported
    p-value.

    The detector scans
    ``doc.text_blocks`` for
    patterns like
    ``"r = 0.42, p < 0.001"``
    or
    ``"r(48) = 0.42, p = .003"``.
    For each match it pulls
    out the reported ``r``,
    the reported ``p``, and
    the sample size ``N`` (from
    the degrees of freedom in
    parentheses, when given;
    otherwise from a sibling
    "N = ..." in the same
    sentence). It then
    computes the
    recomputed p-value and
    flags any disagreement
    above a 0.005 tolerance
    (to account for rounding
    in the original report).

    It also runs the
    statcheck-style scan
    (``stats_algo.extract_statcheck_hits``)
    over t / F / χ² / z
    reports using the
    rounding-interval
    decision of the R
    statcheck package, with
    pZeroError, one-tailed
    exemption and
    decision-error flags
    surfaced in the finding
    title/evidence.
    """

    name = "stat_pvalue"

    # ``r(48) = .42, p = .003``
    # is a common style. The
    # regex captures the
    # three numbers. We also
    # accept
    # ``r = .42, p < .001``.
    _RE_R_P = re.compile(
        r"r\s*[\(\[]?\s*(\d+)?\s*[\)\]]?\s*=\s*"
        r"(-?\d*\.?\d+).{0,60}?"
        r"p\s*[<=]\s*\.?(\d+(?:\.\d+)?(?:e-?\d+)?)"
    )

    def run(self, doc: ParsedDoc) -> DetectorResult:
        findings: list[Finding] = []
        text = "".join(
            getattr(b, "text", "") for b in doc.text_blocks
        )
        # Early return only when there is nothing to scan at
        # all: the table-based t/p scan below must run even
        # for documents whose text layer is empty (tables
        # live in ``doc.tables``, not in text blocks).
        if not text and not getattr(doc, "tables", None):
            return DetectorResult(
                detector=self.name,
                findings=findings,
                ok=True,
            )
        for match in self._RE_R_P.finditer(text):
            df_text, r_text, p_text = match.groups()
            r = _safe_float(r_text)
            p_reported = _safe_float(p_text)
            if r is None or p_reported is None:
                continue
            # N is the df + 2 (Pearson df = n - 2). If the
            # report did not include the df in parens we
            # cannot recompute; skip.
            if df_text is None:
                continue
            n = int(df_text) + 2
            if n < 3:
                continue
            p_recomputed = _pearson_p(r, n)
            # The reported p might
            # be "< 0.001" -- a
            # ceiling, not the
            # exact value. The
            # comparison only
            # flags a finding when
            # the recomputed
            # p-value is
            # *substantially*
            # different from the
            # reported one.
            # A 0.01 tolerance
            # covers most rounding.
            if (
                abs(p_reported - p_recomputed) < 0.01
            ):
                continue
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="high",
                    title=(
                        f"Reported p={p_reported:.3g} "
                        f"disagrees with recomputed "
                        f"p={p_recomputed:.3g} for "
                        f"r={r}, n={n}"
                    ),
                    location="text",
                    evidence=json.dumps(
                        {
                            "r": r,
                            "n": n,
                            "p_reported": p_reported,
                            "p_recomputed": p_recomputed,
                            "match": match.group(0)[:80],
                        }
                    ),
                )
            )
        # statcheck-style t / F / χ² / z + p (Nuijten et al. R package,
        # rounding-interval decision)
        from ..stats_algo import extract_statcheck_hits

        for hit in extract_statcheck_hits(text):
            if not hit.get("inconsistent"):
                continue
            flags: list[str] = []
            if hit.get("p_zero_error"):
                flags.append("p reported as exactly 0")
            if hit.get("decision_error"):
                flags.append(
                    "decision error: significance reverses at alpha=.05"
                )
            suffix = f" ({'; '.join(flags)})" if flags else ""
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity="high",
                    title=(
                        f"statcheck: reported p inconsistent with "
                        f"{hit.get('stat')}={hit.get('value')} "
                        f"(computed p≈{float(hit.get('p_computed') or 0):.3g})"
                        f"{suffix}"
                    ),
                    location="text",
                    evidence=json.dumps(
                        {
                            **{k: hit[k] for k in hit if k != "span"},
                            "match": str(hit.get("span") or "")[:120],
                            "method": "statcheck_t_F_chi2_z",
                            "source": "Nuijten et al. statcheck-compatible",
                        },
                        ensure_ascii=False,
                        default=str,
                    ),
                )
            )
        findings.extend(self._scan_table_tp_pairs(doc))
        findings.extend(self._scan_summary_stat_blocks(doc))
        return DetectorResult(
            detector=self.name,
            findings=findings,
            ok=True,
        )

    @staticmethod
    def _plain_decimal(cell: str) -> float | None:
        """Parse a cell that is ONLY a decimal number
        (rejects '4 ± 0.8', percents, units, and multi-dot
        extraction garbles like '-0.1.267')."""
        s = (cell or "").strip()
        if not re.fullmatch(r"-?\d+\.\d+", s):
            return None
        try:
            return float(s)
        except ValueError:
            return None

    def _scan_table_tp_pairs(self, doc: ParsedDoc) -> list[Finding]:
        """Recompute p from t for tables that declare
        ``t-value`` / ``p-value`` columns.

        Precision guards: a pair only counts when the
        reported p differs from the normal-approx
        recomputation by > 0.15, and a table only fires
        with ≥ 2 inconsistent pairs (high) or a single
        extreme one (Δ > 0.35, medium)."""
        out: list[Finding] = []
        for table in getattr(doc, "tables", []) or []:
            headers = [
                (h or "").strip().lower()
                for h in getattr(table, "headers", []) or []
            ]
            if not headers:
                continue
            t_idx = [i for i, h in enumerate(headers) if _T_HEADER_RE.match(h)]
            p_idx = [i for i, h in enumerate(headers) if _P_HEADER_RE.match(h)]
            if not t_idx or not p_idx:
                continue
            ti, pi = t_idx[0], p_idx[0]
            inconsistent: list[dict[str, Any]] = []
            for row in getattr(table, "rows", []) or []:
                if ti >= len(row) or pi >= len(row):
                    continue
                t_val = self._plain_decimal(row[ti])
                p_val = self._plain_decimal(row[pi])
                if t_val is None or p_val is None:
                    continue
                if not (0.05 <= abs(t_val) <= 30.0):
                    continue
                if not (0.0 < p_val < 1.0):
                    continue
                p_recomputed = _normal_two_tailed_p(abs(t_val))
                delta = abs(p_val - p_recomputed)
                if delta > 0.15:
                    inconsistent.append(
                        {
                            "t": t_val,
                            "p_reported": p_val,
                            "p_recomputed": round(p_recomputed, 4),
                            "delta": round(delta, 4),
                            "row": [str(c)[:40] for c in row[:6]],
                        }
                    )
            if len(inconsistent) >= 2:
                severity = "high"
            elif inconsistent and inconsistent[0]["delta"] > 0.35:
                severity = "medium"
            else:
                continue
            out.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity=severity,
                    title=(
                        f"Table {getattr(table, 'table_id', '?')}: "
                        f"{len(inconsistent)} reported t/p pair(s) "
                        f"inconsistent with recomputed p"
                    ),
                    location="table",
                    evidence=json.dumps(
                        {
                            "table_id": getattr(table, "table_id", ""),
                            "headers": headers,
                            "inconsistent_pairs": inconsistent[:10],
                            "method": "normal_approx_two_tailed",
                            "tolerance": 0.15,
                            "note": (
                                "df not recoverable from the table; "
                                "coarse screen, wide tolerance"
                            ),
                        },
                        ensure_ascii=False,
                        default=str,
                    ),
                )
            )
        return out


_MEAN_SD_RE = re.compile(r"(-?\d+(?:\.\d+)?)\s*±\s*(\d+(?:\.\d+)?)")
_INT_TOKEN_RE = re.compile(r"(?<![\d.])(\d{1,5})(?![\d.])")
_F_HEADER_RE = re.compile(
    r"^(f|f-value|f value|f-stat(?:istic)?|f stat(?:istic)?)\b.*$",
    re.IGNORECASE,
)
_N_BLOCK_HEADER_RE = re.compile(
    r"^(n|sample|sample size|samplesize|number|count|n \(\%\))$",
    re.IGNORECASE,
)


def _f_sf(f_stat: float, d1: int, d2: int) -> float:
    """Survival function of the F distribution via the
    regularized incomplete beta: sf = I_{d2/(d2+d1*f)}(d2/2, d1/2)."""
    if f_stat <= 0 or d1 < 1 or d2 < 1:
        return 1.0
    x = d2 / (d2 + d1 * f_stat)
    return _regularized_incomplete_beta(x, d2 / 2.0, d1 / 2.0)


def _parse_group_row(row: list[str], n_idx: int | None, msd_idx: int | None) -> dict:
    label = ""
    n_val: int | None = None
    mean: float | None = None
    sd: float | None = None
    joined = " ".join(str(c) for c in row if c)
    m = _MEAN_SD_RE.search(joined)
    if m:
        mean = float(m.group(1))
        sd = float(m.group(2))
    # N: prefer the dedicated N column, else first bare integer
    # token in the joined row (merged-cell layouts like
    # 'Female 172 3.9 ± 0.8').
    if n_idx is not None and n_idx < len(row):
        tok = _INT_TOKEN_RE.search(str(row[n_idx]))
        if tok:
            n_val = int(tok.group(1))
    if n_val is None:
        before_msd = joined[: m.start()] if m else joined
        tok = _INT_TOKEN_RE.search(before_msd)
        if tok:
            n_val = int(tok.group(1))
    # Label: leading non-numeric text.
    first = next((str(c) for c in row if str(c).strip()), "")
    label = re.sub(r"[\d\s±.,%-]", "", first)[:40]
    return {"label": label, "n": n_val, "mean": mean, "sd": sd}


def _scan_summary_stat_blocks_impl(self, doc: ParsedDoc) -> list[Finding]:
    """Recompute Welch-t / one-way ANOVA-F (and F→p) from the
    summary statistics reported in group-comparison tables
    (variable | group | N | mean ± SD [| t | F | p]).

    Ground truth: the retracted Cureus EDI paper
    (fraud_web_v1 web_cureus_01) reports Male 156 4±0.8 vs
    Female 172 3.9±0.8 with t=1.61 -- the Welch recompute is
    t≈1.13, a 0.48 gap that the editors' "incorrect
    relationships between t- and p-values" notice refers to.

    Precision guards: means/SDs in papers are rounded, so a
    block only counts when |Δt| > 0.35 (Welch) or
    |ΔF| > 0.35 * max(1, |F|) (ANOVA); a table fires high with
    ≥ 2 mismatched blocks or one |Δt| > 0.6, else medium.
    """
    out: list[Finding] = []
    for table in getattr(doc, "tables", []) or []:
        headers = [
            (h or "").strip().lower()
            for h in getattr(table, "headers", []) or []
        ]
        if not headers:
            continue
        msd_idx = next(
            (i for i, h in enumerate(headers) if "±" in h or "mean" in h),
            None,
        )
        if msd_idx is None:
            continue
        n_idx = next(
            (i for i, h in enumerate(headers) if _N_BLOCK_HEADER_RE.match(h)),
            None,
        )
        t_idx = next(
            (i for i, h in enumerate(headers) if _T_HEADER_RE.match(h)),
            None,
        )
        f_idx = next(
            (i for i, h in enumerate(headers) if _F_HEADER_RE.match(h)),
            None,
        )
        p_idx = next(
            (i for i, h in enumerate(headers) if _P_HEADER_RE.match(h)),
            None,
        )
        if t_idx is None and f_idx is None:
            continue

        # Group rows into variable blocks: a row whose first
        # cell is non-empty starts a new block.
        blocks: list[dict] = []
        cur: dict | None = None
        for row in getattr(table, "rows", []) or []:
            if not row:
                continue
            first = str(row[0]).strip()
            if first:
                cur = {"var": first, "rows": [], "t": None, "f": None, "p": None}
                blocks.append(cur)
            if cur is None:
                continue
            g = _parse_group_row(row, n_idx, msd_idx)
            if g["mean"] is not None:
                cur["rows"].append(g)
            for idx, key in ((t_idx, "t"), (f_idx, "f"), (p_idx, "p")):
                if idx is not None and idx < len(row) and cur[key] is None:
                    v = PValueConsistencyDetector._plain_decimal(row[idx])
                    if v is not None:
                        cur[key] = v

        mismatches: list[dict[str, Any]] = []
        for blk in blocks:
            groups = [
                g for g in blk["rows"]
                if g["n"] and g["n"] >= 3
                and g["mean"] is not None
                and g["sd"] is not None and g["sd"] > 0
            ]
            if len(groups) < 2:
                continue
            k = len(groups)
            ns = [g["n"] for g in groups]
            means = [g["mean"] for g in groups]
            sds = [g["sd"] for g in groups]
            # ---- Welch t (k=2) vs reported t ----
            if k == 2 and blk["t"] is not None:
                se2 = sds[0] ** 2 / ns[0] + sds[1] ** 2 / ns[1]
                if se2 > 0:
                    t_welch = (means[0] - means[1]) / math.sqrt(se2)
                    delta = abs(t_welch - blk["t"])
                    if delta > 0.35:
                        mismatches.append({
                            "kind": "welch_t",
                            "variable": blk["var"],
                            "reported": blk["t"],
                            "recomputed": round(t_welch, 3),
                            "delta": round(delta, 3),
                        })
            # ---- one-way ANOVA F (k>=2) vs reported F ----
            if blk["f"] is not None:
                n_tot = sum(ns)
                if n_tot > k:
                    grand = sum(n * m for n, m in zip(ns, means)) / n_tot
                    ssb = sum(n * (m - grand) ** 2 for n, m in zip(ns, means))
                    ssw = sum((n - 1) * s * s for n, s in zip(ns, sds))
                    if ssw > 0:
                        f_re = (ssb / (k - 1)) / (ssw / (n_tot - k))
                        delta_f = abs(f_re - blk["f"])
                        if delta_f > 0.35 * max(1.0, abs(blk["f"])):
                            mismatches.append({
                                "kind": "anova_f",
                                "variable": blk["var"],
                                "reported": blk["f"],
                                "recomputed": round(f_re, 3),
                                "delta": round(delta_f, 3),
                            })
                        # ---- F -> p ----
                        if blk["p"] is not None:
                            p_re = _f_sf(f_re, k - 1, n_tot - k)
                            delta_p = abs(p_re - blk["p"])
                            if delta_p > 0.15:
                                mismatches.append({
                                    "kind": "f_to_p",
                                    "variable": blk["var"],
                                    "reported": blk["p"],
                                    "recomputed": round(p_re, 4),
                                    "delta": round(delta_p, 4),
                                })
        if not mismatches:
            continue
        if len(mismatches) >= 2 or any(
            m["kind"] == "welch_t" and m["delta"] > 0.6 for m in mismatches
        ):
            severity = "high"
        else:
            severity = "medium"
        out.append(
            Finding.make(
                trace_id=doc.trace_id,
                detector=self.name,
                severity=severity,
                title=(
                    f"Table {getattr(table, 'table_id', '?')}: "
                    f"{len(mismatches)} summary-stat recompute "
                    f"mismatch(es) (Welch t / ANOVA F)"
                ),
                location="table",
                evidence=json.dumps(
                    {
                        "table_id": getattr(table, "table_id", ""),
                        "headers": headers,
                        "mismatches": mismatches[:10],
                        "method": "summary_stat_recompute",
                        "tolerances": {"welch_t": 0.35, "anova_f": "0.35rel", "f_to_p": 0.15},
                    },
                    ensure_ascii=False,
                    default=str,
                ),
            )
        )
    return out


# Attach as a method of PValueConsistencyDetector (kept here so
# the parsing helpers stay module-level and unit-testable).
PValueConsistencyDetector._scan_summary_stat_blocks = (
    _scan_summary_stat_blocks_impl
)
