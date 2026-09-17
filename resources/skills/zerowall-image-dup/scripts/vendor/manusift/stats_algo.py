"""Open-source statistical forensics algorithms (pure Python, no scipy).

Ported / reimplemented from well-known academic-integrity and forensic-
accounting methods for use by ManuSift detectors:

* **GRIM** — Brown & Heathers (2016/2017), *Social Psychological and
  Personality Science*. Integer-response means must be multiples of
  ``1/(n * n_items)`` after accounting for reported decimals.
  Community refs: ``phoughton/grim_test``, ``rsprite2``, Wikipedia GRIM.

* **GRIMMER-lite** — Heathers & Brown extensions for SD consistency
  (bounds only; full SPRITE enumeration is optional and expensive).
  Community refs: ``pysprite``, ``rsprite2``.

* **DEBIT** — Heathers & Brown (2019): for binary 0/1 data the sample SD
  is fully determined by the reported proportion and N,
  ``sd = sqrt(p * (1 - p) * N / (N - 1))``.  Closed-form, so any
  deviation beyond rounding slack is inconsistent.

* **statcheck** — Nuijten et al.: reported p-values are recomputed from
  the reported test statistic (t / F / chi2 / z) using the *rounding
  interval* method of statcheck's ``error_test.R``: the reported
  statistic implies an interval ``stat +/- 0.5 * 10^-test_dec``, whose
  endpoints give a p-interval ``[low_p, up_p]``; the reported p must
  round into that interval.  Special rules: ``p = .000`` is always an
  error (pZeroError), one-tailed exemption when the text declares
  one-sided/directional tests, and a ``decision_error`` flag when the
  reported and recomputed significance at alpha = .05 disagree.

* **Benford** — first-digit law with:
  - chi-square goodness-of-fit (classic),
  - MAD + Excess MAD (Nigrini 2012; Barney & Schulzke 2016),
  as in ``erdogant/benfordslaw`` / forensic accounting practice.

* **Last-digit uniformity** — forensic accounting: hand-typed data
  often over-represents 0 and 5.

* **Robust outliers** — MAD/IQR gates (PyOD-style robust stats) as
  a complement to z-score "too clean" checks.

These functions are **deterministic, dependency-light**, and safe to
import from detectors without pulling scipy/torch.
"""
from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any, Iterable, Sequence


# ---------------------------------------------------------------------------
# GRIM (Brown & Heathers)
# ---------------------------------------------------------------------------


def grim_consistent(
    mean: float,
    n: int,
    *,
    decimals: int = 2,
    n_items: int = 1,
) -> bool:
    """Return True if ``mean`` is a possible average of ``n`` integer scores.

    Each observation is the sum of ``n_items`` integer item responses
    (Likert multi-item scale); total granularity is ``n * n_items``.

    Implementation matches the standard community formulation:
    there must exist an integer total sum ``S`` such that
    ``S / (n * n_items)`` rounds to ``mean`` at ``decimals`` places
    (half-up / interval interpretation via ±0.5 ulp).
    """
    if n < 1 or n_items < 1 or decimals < 0:
        return True
    if math.isnan(mean) or math.isinf(mean):
        return True
    total = n * n_items
    gran = 10.0 ** (-decimals)
    # Values in (mean - gran/2, mean + gran/2] map to ``mean`` when rounded
    # to ``decimals`` (ties: accept either side with a small epsilon).
    half = 0.5 * gran
    lower = (mean - half) * total
    upper = (mean + half) * total
    # Integer S with lower < S <= upper  (or closed both sides with eps)
    s_min = math.ceil(lower + 1e-12)
    s_max = math.floor(upper + 1e-12)
    if s_min <= s_max:
        return True
    # Also accept exact equality at the half-granularity boundary
    # (some packages use closed intervals).
    s_min2 = math.ceil(lower - 1e-12)
    s_max2 = math.floor(upper - 1e-12)
    return s_min2 <= s_max2


def grim_from_sample(
    values: Sequence[float],
    reported_mean: float,
    decimals: int,
) -> bool:
    """GRIM when raw values are available: use n = len(values).

    Still checks the *reported* mean against n, not the sample mean
    (fabrication often invents a mean that cannot arise from n integers).
    """
    if not values:
        return True
    return grim_consistent(reported_mean, len(values), decimals=decimals, n_items=1)


def grimmer_sd_max(mean: float, n: int, lo: float, hi: float) -> float:
    """Closed-form upper bound on the *sample* SD of ``n`` values bounded
    in ``[lo, hi]`` with the given mean.

    The variance of bounded data with a fixed mean is maximised when all
    mass sits at the two endpoints (a fraction ``q = (mean - lo) /
    (hi - lo)`` at ``hi``), giving population variance
    ``(mean - lo) * (hi - mean)``; the sample SD multiplies by
    ``n / (n - 1)``.  Because integer counts can only approximate the
    split, this closed form is a true upper bound: a reported SD above it
    (beyond rounding slack) is impossible -- zero-false-positive by
    design.
    """
    if n < 2 or hi <= lo:
        return 0.0
    m = min(max(mean, lo), hi)
    var = (m - lo) * (hi - m)
    return math.sqrt(var * n / (n - 1))


def grimmer_sd_possible(
    mean: float,
    sd: float,
    n: int,
    *,
    decimals_mean: int = 2,
    decimals_sd: int = 2,
    n_items: int = 1,
) -> bool:
    """Lightweight SD consistency (GRIMMER bound, not full SPRITE search).

    For integer data, sample variance has hard bounds given mean and n.
    Returns True if the reported SD could arise from some integer dataset
    with the given mean (GRIM-consistent) and n.

    Full SPRITE enumeration (Heathers) is O(large); this only checks
    mathematical bounds used by rsprite2-style tools as a fast pre-filter.
    The upper bound is mean-aware (``grimmer_sd_max``): all mass at the
    scale endpoints, which maximises variance for a fixed mean.
    """
    if n < 2 or sd < 0:
        return True
    if not grim_consistent(mean, n, decimals=decimals_mean, n_items=n_items):
        # Impossible mean → treat SD check as failed too
        return False
    total = n * n_items
    # Reconstruct nearest valid mean for bound calc
    gran_m = 10.0 ** (-decimals_mean)
    # Possible sum range for the mean
    half_m = 0.5 * gran_m
    s_lo = math.ceil((mean - half_m) * total + 1e-12)
    s_hi = math.floor((mean + half_m) * total + 1e-12)
    if s_lo > s_hi:
        return False
    # GRIMMER requires item min/max. Default Likert 1–7 if mean in [1,7].
    if 1.0 <= mean <= 7.0:
        lo_item, hi_item = 1, 7
    elif 0.0 <= mean <= 10.0:
        lo_item, hi_item = 0, 10
    else:
        # No assumed bounds — cannot refute SD
        return True

    # Max possible sample SD for n integers in [lo,hi] with mean ≈ mean:
    # all mass at the endpoints.  Mean-aware closed form (see
    # ``grimmer_sd_max``); take the max over the achievable mean range
    # [s_lo/total, s_hi/total] implied by the reported (rounded) mean.
    m_lo = s_lo / total
    m_hi = s_hi / total
    sd_max = max(
        grimmer_sd_max(m_lo, n, lo_item, hi_item),
        grimmer_sd_max(m_hi, n, lo_item, hi_item),
    )
    # Min SD ~ 0 if mean is achievable
    gran_s = 10.0 ** (-decimals_sd)
    # Allow half-granularity slack on reported SD
    if sd > sd_max + gran_s:
        return False
    return True


# ---------------------------------------------------------------------------
# DEBIT (Heathers & Brown 2019) — closed-form SD check for binary 0/1 data
# ---------------------------------------------------------------------------


def debit_check(
    prop: float,
    sd: float,
    n: int,
    *,
    tol: float | None = None,
    prop_dec: int | None = None,
    sd_dec: int | None = None,
) -> dict[str, Any]:
    """DEBIT: for binary 0/1 data the sample SD is *determined* by the
    reported proportion and N::

        sd = sqrt(prop * (1 - prop) * N / (N - 1))

    A reported (proportion, SD, N) triple whose SD deviates from this
    closed form beyond rounding slack cannot have come from binary data.

    ``tol`` is the absolute tolerance on the reported SD.  When not
    given it is derived from the reported decimal places: half an ulp of
    the reported SD (``sd_dec``) plus the SD movement caused by half an
    ulp of the reported proportion (``prop_dec``).

    Returns a dict ``{consistent, expected_sd, delta, tol}``; cases that
    cannot be refuted (bad inputs, ``n < 2``) return ``consistent=True``.
    """
    out: dict[str, Any] = {
        "consistent": True,
        "expected_sd": None,
        "delta": None,
        "tol": tol,
    }
    if prop is None or sd is None or n is None or n < 2:
        return out
    if not (0.0 <= prop <= 1.0) or sd < 0:
        return out
    expected = math.sqrt(prop * (1.0 - prop) * n / (n - 1))
    if tol is None:
        tol = 0.5 * 10.0 ** (-(sd_dec if sd_dec is not None else 2))
        if prop_dec is not None:
            h = 0.5 * 10.0 ** (-prop_dec)
            lo_p = min(max(prop - h, 0.0), 1.0)
            hi_p = min(max(prop + h, 0.0), 1.0)
            e_lo = math.sqrt(lo_p * (1.0 - lo_p) * n / (n - 1))
            e_hi = math.sqrt(hi_p * (1.0 - hi_p) * n / (n - 1))
            tol += max(abs(e_lo - expected), abs(e_hi - expected))
    delta = abs(sd - expected)
    out["consistent"] = delta <= tol + 1e-12
    out["expected_sd"] = expected
    out["delta"] = delta
    out["tol"] = tol
    return out


# ---------------------------------------------------------------------------
# Benford (first digit) — chi2 + MAD / Excess MAD
# ---------------------------------------------------------------------------

_BENFORD_P = [math.log10(1 + 1 / d) for d in range(1, 10)]
# Excess MAD constant C for first-digit test (Barney & Schulzke 2016 approx)
_EXCESS_MAD_C_FIRST = 21.27


def leading_digit(v: float) -> int | None:
    """First significant digit of |v|, or None if non-positive/non-finite."""
    if v is None or v == 0:
        return None
    try:
        a = abs(float(v))
    except (TypeError, ValueError):
        return None
    if a == 0 or math.isnan(a) or math.isinf(a):
        return None
    # Scientific: a = m * 10^e, 1 <= m < 10
    exp = math.floor(math.log10(a))
    m = a / (10**exp)
    d = int(m)
    if d < 1:
        d = 1
    if d > 9:
        d = 9
    return d


def leading_digit_counts(values: Iterable[float]) -> list[int]:
    """Counts for digits 1..9."""
    c = [0] * 9
    for v in values:
        d = leading_digit(v)
        if d is not None:
            c[d - 1] += 1
    return c


def chi2_sf_approx(x: float, df: int) -> float:
    """Upper-tail P(chi2_df > x) via regularized incomplete gamma.

    Computes Q(df/2, x/2) = 1 - P(df/2, x/2) using a series
    expansion below the mode and a Lentz continued fraction above
    it (Numerical Recipes ``gammq`` approach).  Replaces the
    previous implementation that erroneously returned the *lower*
    tail CDF with the wrong argument (x instead of x/2).
    """
    if x <= 0:
        return 1.0
    a = df / 2.0
    z = x / 2.0
    if z < a + 1.0:
        # Series expansion for P(a, z), then Q = 1 - P.
        term = 1.0 / a
        total = term
        for n in range(1, 300):
            term *= z / (a + n)
            total += term
            if abs(term) < 1e-14 * abs(total):
                break
        try:
            p = math.exp(-z + a * math.log(z) - math.lgamma(a)) * total
        except (ValueError, OverflowError):
            return 0.0
        return max(0.0, min(1.0, 1.0 - p))
    # Continued fraction (Lentz) for Q(a, z) directly.
    tiny = 1e-300
    b = z + 1.0 - a
    c = 1.0 / tiny
    d = 1.0 / b
    h = d
    for i in range(1, 300):
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
    try:
        q = math.exp(-z + a * math.log(z) - math.lgamma(a)) * h
    except (ValueError, OverflowError):
        return 0.0
    return max(0.0, min(1.0, q))


def benford_analyze(
    values: Sequence[float],
    *,
    alpha: float = 0.05,
) -> dict[str, Any]:
    """Full first-digit Benford analysis (chi2 + MAD + Excess MAD).

    Returns dict with keys:
      n, counts, expected_probs, chi2, pvalue, mad, expected_mad,
      excess_mad, conformity_mad, significant_chi2, flags
    """
    counts = leading_digit_counts(values)
    n = sum(counts)
    out: dict[str, Any] = {
        "n": n,
        "counts": counts,
        "expected_probs": list(_BENFORD_P),
        "chi2": 0.0,
        "pvalue": 1.0,
        "mad": 0.0,
        "expected_mad": 0.0,
        "excess_mad": 0.0,
        "conformity_mad": "insufficient data",
        "significant_chi2": False,
        "flags": [],
    }
    if n < 1:
        return out

    # Chi-square
    chi2 = 0.0
    for i, obs in enumerate(counts):
        exp = _BENFORD_P[i] * n
        if exp > 0:
            chi2 += (obs - exp) ** 2 / exp
    p = chi2_sf_approx(chi2, 8)
    out["chi2"] = chi2
    out["pvalue"] = p
    out["significant_chi2"] = p < alpha

    # MAD = mean_k |p_obs - p_exp|
    mad = 0.0
    for i, obs in enumerate(counts):
        mad += abs(obs / n - _BENFORD_P[i])
    mad /= 9.0
    expected_mad = 1.0 / math.sqrt(_EXCESS_MAD_C_FIRST * n)
    excess = mad - expected_mad
    out["mad"] = mad
    out["expected_mad"] = expected_mad
    out["excess_mad"] = excess

    # Nigrini-style bands scaled for first digit (coarser than first-two)
    if excess < 0:
        conf = "close conformity"
    elif excess < 0.002:
        conf = "acceptable conformity"
    elif excess < 0.004:
        conf = "marginally acceptable conformity"
    else:
        conf = "nonconforming"
        out["flags"].append("benford_mad_nonconforming")
    out["conformity_mad"] = conf
    if out["significant_chi2"]:
        out["flags"].append("benford_chi2_reject")
    return out


# ---------------------------------------------------------------------------
# Last-digit forensic test
# ---------------------------------------------------------------------------


def last_digit_counts(values: Sequence[float]) -> list[int]:
    """Counts of last integer digit 0..9 after stripping trailing zeros loosely."""
    c = [0] * 10
    for v in values:
        try:
            a = abs(float(v))
        except (TypeError, ValueError):
            continue
        if math.isnan(a) or math.isinf(a):
            continue
        # Scale to integer cents-like if float
        x = a
        # Up to 6 decimal places
        for _ in range(6):
            if abs(x - round(x)) < 1e-9:
                break
            x *= 10
        dig = int(round(x)) % 10
        c[dig] += 1
    return c


def last_digit_round_bias(values: Sequence[float]) -> dict[str, Any]:
    """Fraction ending in 0 or 5; chi2 vs uniform last digits."""
    counts = last_digit_counts(values)
    n = sum(counts)
    if n < 1:
        return {
            "n": 0,
            "round_ratio": 0.0,
            "chi2": 0.0,
            "pvalue": 1.0,
            "counts": counts,
        }
    round_n = counts[0] + counts[5]
    ratio = round_n / n
    # Uniform expectation n/10 each
    chi2 = 0.0
    exp = n / 10.0
    for obs in counts:
        chi2 += (obs - exp) ** 2 / exp
    p = chi2_sf_approx(chi2, 9)
    return {
        "n": n,
        "round_ratio": ratio,
        "chi2": chi2,
        "pvalue": p,
        "counts": counts,
        "flags": (
            ["last_digit_round_bias"]
            if ratio > 0.35
            else []
        )
        + (["last_digit_nonuniform"] if p < 0.01 else []),
    }


# ---------------------------------------------------------------------------
# Robust outlier stats (PyOD-inspired, no sklearn)
# ---------------------------------------------------------------------------


def robust_z_scores(values: Sequence[float]) -> list[float]:
    """Modified z-score using median absolute deviation (Iglewicz & Hoaglin)."""
    xs = [float(v) for v in values]
    if not xs:
        return []
    med = sorted(xs)[len(xs) // 2]
    abs_dev = sorted(abs(x - med) for x in xs)
    mad = abs_dev[len(abs_dev) // 2]
    if mad < 1e-12:
        # All equal
        return [0.0] * len(xs)
    # 0.6745 makes MAD consistent with sigma for normal data
    return [0.6745 * (x - med) / mad for x in xs]


def iqr_outlier_fraction(values: Sequence[float], k: float = 1.5) -> dict[str, Any]:
    """Fraction of values outside [Q1 - k*IQR, Q3 + k*IQR]."""
    xs = sorted(float(v) for v in values)
    n = len(xs)
    if n < 4:
        return {"n": n, "outlier_frac": 0.0, "n_outliers": 0}
    q1 = xs[n // 4]
    q3 = xs[(3 * n) // 4]
    iqr = q3 - q1
    if iqr <= 0:
        return {"n": n, "outlier_frac": 0.0, "n_outliers": 0, "iqr": iqr}
    lo, hi = q1 - k * iqr, q3 + k * iqr
    n_out = sum(1 for x in xs if x < lo or x > hi)
    return {
        "n": n,
        "outlier_frac": n_out / n,
        "n_outliers": n_out,
        "iqr": iqr,
        "q1": q1,
        "q3": q3,
    }


# ---------------------------------------------------------------------------
# statcheck-style statistic extraction (t / F / chi2 / z + p)
# ---------------------------------------------------------------------------

# Patterns inspired by the R package ``statcheck`` (Nuijten et al.).
# The statistic may carry an operator (=, <, >; ≤/≥ are normalised away
# before matching) and the reported p is kept as a *string* so the
# rounding-interval decision can use its decimal places.
_RE_T = re.compile(
    r"\bt\s*\(\s*(\d+(?:\.\d+)?)\s*\)\s*([=<>])\s*"
    r"([-−]?\d+(?:\.\d+)?)"
    r"(?:\s*,\s*p\s*([=<>])\s*(\d*\.?\d+))?",
    re.I,
)
_RE_F = re.compile(
    r"\bF\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)\s*([=<>])\s*"
    r"(\d+(?:\.\d+)?)"
    r"(?:\s*,\s*p\s*([=<>])\s*(\d*\.?\d+))?",
    re.I,
)
_RE_CHI2 = re.compile(
    r"(?:χ|chi)\s*²?\s*(?:\(\s*(\d+(?:\.\d+)?)\s*\))?\s*([=<>])\s*"
    r"(\d+(?:\.\d+)?)"
    r"(?:\s*,\s*p\s*([=<>])\s*(\d*\.?\d+))?",
    re.I,
)
# z statistics have no df: ``z = 1.96, p = .05``.  The ``z`` must be a
# standalone token -- preceded by a non-letter/non-digit, and not part
# of ``z-score`` or an identifier like ``Az`` -- to avoid false matches.
_RE_Z = re.compile(
    r"(?<![A-Za-z0-9_.])[zZ]\s*([=<>])\s*(-?\d+(?:\.\d+)?)"
    r"(?:\s*,\s*p\s*([=<>])\s*(\d*\.?\d+))?"
)

# One-tailed exemption context (statcheck: correct for one-sided tests
# when the paper declares them anywhere in the text).
_ONE_TAILED_RE = re.compile(r"one[- ](?:sided|tailed)|directional", re.I)


def _t_survival(t: float, df: float) -> float:
    """Two-tailed p for Student's t via incomplete beta."""
    if df <= 0:
        return 1.0
    t2 = t * t
    x = df / (df + t2)
    # I_x(df/2, 1/2)
    return _reg_inc_beta(x, df / 2.0, 0.5)


def _reg_inc_beta(x: float, a: float, b: float) -> float:
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    if x > 0.5:
        return 1.0 - _reg_inc_beta(1.0 - x, b, a)
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
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < 1e-30:
            d = 1e-30
        c = 1.0 + aa / c
        if abs(c) < 1e-30:
            c = 1e-30
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
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
    try:
        lbeta = math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
        front = math.exp(lbeta + a * math.log(x) + b * math.log(1 - x))
        return front * h / a
    except (ValueError, OverflowError):
        return 1.0


def _chi2_survival(x: float, df: float) -> float:
    return chi2_sf_approx(x, int(max(1, round(df))))


def _dec_count(s: str | None, default: int = 2) -> int:
    """Decimal places in a reported-number string (trailing zeros count)."""
    if not s:
        return default
    s = s.strip().lstrip("+-")
    if "." in s:
        return len(s.split(".", 1)[1])
    return 0


def _p_float(s: str | None) -> float | None:
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _reported_significance(p_rep: float, p_op: str) -> bool | None:
    """Significance at alpha=.05 *as reported* (None = undetermined)."""
    if p_op == "=":
        return p_rep < 0.05
    if p_op == "<":
        return True if p_rep <= 0.05 else None
    if p_op == ">":
        return False if p_rep >= 0.05 else None
    return None


def _recomputed_significance(low_p: float, up_p: float) -> bool | None:
    """Significance at alpha=.05 implied by the recomputed p-interval."""
    if up_p < 0.05:
        return True
    if low_p >= 0.05:
        return False
    return None


def _interval_inconsistent(
    p_rep: float,
    p_op: str,
    p_dec: int,
    low_p: float,
    up_p: float,
    mid_p: float,
    tol: float,
) -> bool:
    """statcheck ``error_test.R`` rounding-interval decision.

    ``p = x``: x (reported at ``p_dec`` decimals) must fall inside the
    recomputed p-interval ``[low_p, up_p]`` after rounding the interval
    to ``p_dec``; a miss counts only when the gap beyond the interval
    exceeds the tolerance floor ``max(tol, 10% relative)`` -- a guard
    for the approximate p routines used here.
    ``p < x``: inconsistent only when even the smallest recomputed p is
    clearly >= x.  ``p > x``: only when the largest recomputed p is
    clearly <= x.
    """
    eps = 1e-9
    if p_op == "=":
        lo_r = round(low_p, p_dec)
        up_r = round(up_p, p_dec)
        if lo_r - eps <= p_rep <= up_r + eps:
            return False
        gap = max(lo_r - p_rep, p_rep - up_r)
        return gap > max(tol, 0.1 * max(p_rep, mid_p, 1e-12))
    half_ulp = 0.5 * 10.0 ** (-p_dec)
    if p_op == "<":
        return low_p - p_rep > half_ulp
    if p_op == ">":
        return p_rep - up_p > half_ulp
    return False


def _judge_statcheck(
    p_of: Any,
    stat_val: float,
    stat_op: str,
    test_dec: int,
    p_rep: float | None,
    p_op: str | None,
    p_dec: int,
    *,
    one_tailed_text: bool,
    allow_one_tailed: bool,
    tol: float = 0.01,
) -> dict[str, Any]:
    """Decide consistency for one parsed statistic/p pair.

    ``p_of`` maps |statistic| -> two-tailed p.  Returns the flags
    ``inconsistent``, ``decision_error``, ``p_zero_error``,
    ``one_tailed_exempt`` plus the recomputed interval
    ``p_low`` / ``p_up``.
    """
    res: dict[str, Any] = {
        "inconsistent": False,
        "decision_error": False,
        "p_zero_error": False,
        "one_tailed_exempt": False,
        "p_low": None,
        "p_up": None,
    }
    if p_rep is None or p_op is None:
        return res
    a = abs(stat_val)
    h = 0.5 * 10.0 ** (-test_dec)
    lo_s, hi_s = max(0.0, a - h), a + h
    # p is a decreasing function of |stat|
    low_p, up_p = p_of(hi_s), p_of(lo_s)
    mid_p = p_of(a)
    # An operator on the *statistic* (e.g. t > 2.1) only widens the
    # possible p range in the compatible direction, so reports that
    # agree with that direction are never flagged.
    if stat_op == ">":
        low_p = 0.0
    elif stat_op == "<":
        up_p = 1.0
    res["p_low"], res["p_up"] = low_p, up_p
    if p_op == "=" and p_rep == 0.0:
        # pZeroError: a p-value is never exactly 0.
        res["inconsistent"] = True
        res["p_zero_error"] = True
    else:
        res["inconsistent"] = _interval_inconsistent(
            p_rep, p_op, p_dec, low_p, up_p, mid_p, tol
        )
    # One-tailed exemption: the text declares one-sided/directional
    # tests and the pair becomes consistent when p is recomputed
    # one-tailed (only meaningful for symmetric statistics: t and z).
    if (
        res["inconsistent"]
        and not res["p_zero_error"]
        and allow_one_tailed
        and one_tailed_text
    ):
        low1, up1 = p_of(hi_s) / 2.0, min(1.0, p_of(lo_s) / 2.0)
        mid1 = mid_p / 2.0
        if stat_op == ">":
            low1 = 0.0
        elif stat_op == "<":
            up1 = 1.0
        if not _interval_inconsistent(
            p_rep, p_op, p_dec, low1, up1, mid1, tol
        ):
            res["inconsistent"] = False
            res["one_tailed_exempt"] = True
    # decision_error: reported and recomputed significance at
    # alpha = .05 point in opposite directions.
    if res["inconsistent"]:
        rep_sig = _reported_significance(p_rep, p_op)
        rec_sig = _recomputed_significance(low_p, up_p)
        if rep_sig is not None and rec_sig is not None:
            res["decision_error"] = rep_sig != rec_sig
    return res


def extract_statcheck_hits(text: str) -> list[dict[str, Any]]:
    """Parse t/F/χ²/z + optional p from free text (statcheck-style).

    Each hit carries ``stat``, ``value``, ``stat_op``, ``p_reported``,
    ``p_op``, ``p_computed`` (midpoint recomputation), the recomputed
    rounding interval ``p_low`` / ``p_up``, and the flags
    ``inconsistent``, ``decision_error``, ``p_zero_error`` and
    ``one_tailed_exempt``.  Reports of the form ``p = ns`` carry no
    number and are never judged.
    """
    hits: list[dict[str, Any]] = []
    if not text:
        return hits
    # Normalize unicode minus / dashes and inequality operators
    text = (
        text.replace("−", "-")
        .replace("–", "-")
        .replace("≤", "<")
        .replace("≥", ">")
    )
    one_tailed = bool(_ONE_TAILED_RE.search(text))

    for m in _RE_T.finditer(text):
        try:
            df = float(m.group(1))
            tval = float(m.group(3))
        except ValueError:
            continue
        p_rep = _p_float(m.group(5))
        stat_op = m.group(2) or "="
        j = _judge_statcheck(
            lambda s, df=df: _t_survival(abs(s), df),
            tval,
            stat_op,
            _dec_count(m.group(3)),
            p_rep,
            m.group(4),
            _dec_count(m.group(5)),
            one_tailed_text=one_tailed,
            allow_one_tailed=True,
        )
        hits.append(
            {
                "stat": "t",
                "df": df,
                "value": tval,
                "stat_op": stat_op,
                "p_reported": p_rep,
                "p_op": m.group(4),
                "p_computed": _t_survival(abs(tval), df),
                "span": m.group(0),
                **j,
            }
        )

    for m in _RE_F.finditer(text):
        try:
            d1, d2 = float(m.group(1)), float(m.group(2))
            fval = float(m.group(4))
        except ValueError:
            continue
        p_rep = _p_float(m.group(6))
        stat_op = m.group(3) or "="

        def _f_p(f: float, d1: float = d1, d2: float = d2) -> float:
            x = d2 / (d2 + d1 * f) if f >= 0 else 1.0
            return _reg_inc_beta(x, d2 / 2.0, d1 / 2.0)

        j = _judge_statcheck(
            _f_p,
            fval,
            stat_op,
            _dec_count(m.group(4)),
            p_rep,
            m.group(5),
            _dec_count(m.group(6)),
            one_tailed_text=one_tailed,
            allow_one_tailed=False,
        )
        hits.append(
            {
                "stat": "F",
                "df1": d1,
                "df2": d2,
                "value": fval,
                "stat_op": stat_op,
                "p_reported": p_rep,
                "p_op": m.group(5),
                "p_computed": _f_p(fval),
                "span": m.group(0),
                **j,
            }
        )

    for m in _RE_CHI2.finditer(text):
        try:
            df = float(m.group(1) or 1)
            cval = float(m.group(3))
        except ValueError:
            continue
        p_rep = _p_float(m.group(5))
        stat_op = m.group(2) or "="
        j = _judge_statcheck(
            lambda s, df=df: _chi2_survival(s, df),
            cval,
            stat_op,
            _dec_count(m.group(3)),
            p_rep,
            m.group(4),
            _dec_count(m.group(5)),
            one_tailed_text=one_tailed,
            allow_one_tailed=False,
        )
        hits.append(
            {
                "stat": "chi2",
                "df": df,
                "value": cval,
                "stat_op": stat_op,
                "p_reported": p_rep,
                "p_op": m.group(4),
                "p_computed": _chi2_survival(cval, df),
                "span": m.group(0),
                **j,
            }
        )

    for m in _RE_Z.finditer(text):
        try:
            zval = float(m.group(2))
        except ValueError:
            continue
        p_rep = _p_float(m.group(4))
        stat_op = m.group(1) or "="
        j = _judge_statcheck(
            lambda s: math.erfc(abs(s) / math.sqrt(2.0)),
            zval,
            stat_op,
            _dec_count(m.group(2)),
            p_rep,
            m.group(3),
            _dec_count(m.group(4)),
            one_tailed_text=one_tailed,
            allow_one_tailed=True,
        )
        hits.append(
            {
                "stat": "z",
                "value": zval,
                "stat_op": stat_op,
                "p_reported": p_rep,
                "p_op": m.group(3),
                "p_computed": math.erfc(abs(zval) / math.sqrt(2.0)),
                "span": m.group(0),
                **j,
            }
        )

    return hits
