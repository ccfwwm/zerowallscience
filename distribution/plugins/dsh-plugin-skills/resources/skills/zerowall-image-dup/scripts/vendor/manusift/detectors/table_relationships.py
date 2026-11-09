"""Relationship checks for suspicious tabular data patterns.

These checks are screening signals, not misconduct findings. They point a
reviewer to table relationships that are unusually exact for independent
experimental data: copied columns, fixed offsets, mirror symmetry, repeated
decimal tails, integer-shift decimal-tail reuse, concentrated one- or two-digit
terminal patterns within and across tables, high duplicate rates, improbable
repeated values, three-column arithmetic identities, and zero-variance columns.

Excel-fabrication upgrades (2026-07, s41586-oriented):
clean non-zero fixed offsets (A = B + c) promote to **high** when n is solid;
``partial_fixed_offset`` catches ≥90% row-wise shared diffs; perfect two-decimal
tail reuse promotes to high; paper-level ``excel_fabrication_span`` aggregates
cross-figure Source Data fingerprints. Calibration keeps blank Nature replicate
headers from burying these signals (see ``finding_calibration``).

Statistical additions (2026-07, see ``_statistical_column_findings``):
(near-)arithmetic sequences via sorted-gap CV / rank R^2 with index-axis
guards, dominant-spacing (modal-gap) series, Poisson duplicate-excess tests
(BH-corrected per table), and mixed decimal-precision screening.

P1 thresholds (env / profile)
-----------------------------
``MANUSIFT_TABLE_THRESHOLD_PROFILE`` = ``strict`` | ``default`` | ``sensitive``

  * **default** — balanced for SI numeric tables (slightly looser than
    the original 4/0.75 gates so small n=3–5 lab tables still screen).
  * **sensitive** — catch weaker fabrication patterns (more FP risk).
  * **strict** — original conservative gates (fewer FPs).

Individual overrides (win over profile)::

  MANUSIFT_TABLE_MIN_COLUMN_VALUES
  MANUSIFT_TABLE_MIN_DIGIT_VALUES
  MANUSIFT_TABLE_MIN_DUPLICATE_FRACTION
  MANUSIFT_TABLE_MIN_PAIR_DIGIT_FRACTION
  MANUSIFT_TABLE_MIN_CONCENTRATION_FRACTION
"""
from __future__ import annotations

import json
import os
import re
import statistics
from collections import Counter
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult
from .table_stats import (
    _bh_adjust,
    _format_table_label,
    _poisson_tail,
    _safe_tables,
    _severity_for_q,
)


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return max(1, int(raw))
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        v = float(raw)
    except ValueError:
        return default
    return min(1.0, max(0.05, v))


def _profile_defaults() -> dict[str, float | int]:
    """Return base thresholds for the active profile."""
    profile = (
        os.environ.get("MANUSIFT_TABLE_THRESHOLD_PROFILE", "default")
        .strip()
        .lower()
        or "default"
    )
    # min_col, min_digit, dup_frac, pair_digit, concentration
    profiles: dict[str, dict[str, float | int]] = {
        # Original conservative gates (pre-P1).
        "strict": {
            "min_column": 4,
            "min_digit": 6,
            "dup": 0.75,
            "pair_digit": 0.90,
            "concentration": 0.75,
        },
        # P1 default: SI-friendly (n=3 parallel groups still screen).
        "default": {
            "min_column": 3,
            "min_digit": 5,
            "dup": 0.70,
            "pair_digit": 0.85,
            "concentration": 0.70,
        },
        # Catch weaker signals; expect more review noise.
        "sensitive": {
            "min_column": 3,
            "min_digit": 4,
            "dup": 0.60,
            "pair_digit": 0.80,
            "concentration": 0.60,
        },
    }
    return profiles.get(profile, profiles["default"])


def _load_thresholds() -> tuple[int, int, float, float, float]:
    base = _profile_defaults()
    return (
        _env_int(
            "MANUSIFT_TABLE_MIN_COLUMN_VALUES",
            int(base["min_column"]),
        ),
        _env_int(
            "MANUSIFT_TABLE_MIN_DIGIT_VALUES",
            int(base["min_digit"]),
        ),
        _env_float(
            "MANUSIFT_TABLE_MIN_DUPLICATE_FRACTION",
            float(base["dup"]),
        ),
        _env_float(
            "MANUSIFT_TABLE_MIN_PAIR_DIGIT_FRACTION",
            float(base["pair_digit"]),
        ),
        _env_float(
            "MANUSIFT_TABLE_MIN_CONCENTRATION_FRACTION",
            float(base["concentration"]),
        ),
    )


(
    MIN_COLUMN_VALUES,
    MIN_DIGIT_VALUES,
    MIN_DUPLICATE_FRACTION,
    MIN_PAIR_DIGIT_FRACTION,
    MIN_CONCENTRATION_FRACTION,
) = _load_thresholds()


def reload_thresholds() -> None:
    """Re-read env thresholds (tests / runtime reconfiguration)."""
    global MIN_COLUMN_VALUES, MIN_DIGIT_VALUES
    global MIN_DUPLICATE_FRACTION, MIN_PAIR_DIGIT_FRACTION
    global MIN_CONCENTRATION_FRACTION
    (
        MIN_COLUMN_VALUES,
        MIN_DIGIT_VALUES,
        MIN_DUPLICATE_FRACTION,
        MIN_PAIR_DIGIT_FRACTION,
        MIN_CONCENTRATION_FRACTION,
    ) = _load_thresholds()


# Statistical column checks (2026-07 research-backed additions).
# Sorted-gap arithmetic-sequence test: CV of sorted first differences
# or value-vs-rank R^2. Modal-gap variant catches "almost" arithmetic
# series (a dominant repeated spacing) that CV misses.
_SEQ_MIN_VALUES = 8
_SEQ_CV_MAX = 0.05
_SEQ_R2_MIN = 0.999
_MODAL_GAP_MIN_COUNT = 5
_MODAL_GAP_MIN_FRACTION = 0.5
# Duplicate-excess test: expected collisions E ~ C(n,2)/R where R is
# the number of representable values at the column's decimal
# precision; Poisson upper tail on the observed duplicate pairs.
_DUP_EXCESS_MIN_VALUES = 8
_DUP_EXCESS_MIN_PAIRS = 3
# Mixed decimal-precision check (heuristic, low severity only).
_PRECISION_MIN_VALUES = 8
_PRECISION_MODE_MAX_FRACTION = 0.95
_PRECISION_MIN_LEVEL_COUNT = 2


def _decimal_cell(cell: Any) -> Decimal | None:
    text = str(cell).strip()
    if not text:
        return None
    try:
        return Decimal(text.replace(",", "").rstrip("%"))
    except InvalidOperation:
        return None


def _numeric_columns(table: Any) -> dict[int, list[Decimal]]:
    headers = getattr(table, "headers", []) or []
    rows = getattr(table, "rows", []) or []
    out: dict[int, list[Decimal]] = {}
    for col in range(len(headers)):
        values: list[Decimal] = []
        for row in rows:
            if col >= len(row):
                continue
            value = _decimal_cell(row[col])
            if value is not None:
                values.append(value)
        if len(values) >= MIN_COLUMN_VALUES:
            out[col] = values
    return out


def _numeric_columns_with_texts(table: Any) -> dict[int, tuple[list[Decimal], list[str]]]:
    """Numeric columns with the raw cell strings kept alongside.

    The statistical checks below (duplicate excess, decimal
    precision) need the *reported* text: ``Decimal``/float parsing
    collapses trailing zeros and would hide precision signals."""
    headers = getattr(table, "headers", []) or []
    rows = getattr(table, "rows", []) or []
    out: dict[int, tuple[list[Decimal], list[str]]] = {}
    for col in range(len(headers)):
        values: list[Decimal] = []
        texts: list[str] = []
        for row in rows:
            if col >= len(row):
                continue
            text = str(row[col]).strip()
            value = _decimal_cell(text)
            if value is not None:
                values.append(value)
                texts.append(text)
        if len(values) >= 2:
            out[col] = (values, texts)
    return out


def _fraction_len(text: str) -> int | None:
    """Number of decimal places in a plain numeric cell string.

    Returns ``None`` for scientific-notation or non-plain cells.
    NOTE: xlsx ingest goes through ``str(cell.value)``, so trailing
    zeros of *float* cells are already lost upstream; this measures
    significant reported decimals, not display formatting."""
    t = text.strip().lstrip("+-").rstrip("%")
    if "e" in t.lower():
        return None
    if "." not in t:
        return 0
    frac = t.split(".", 1)[1]
    return len(frac) if frac.isdigit() else None


def _cell_texts(table: Any, col: int) -> list[str]:
    rows = getattr(table, "rows", []) or []
    out: list[str] = []
    for row in rows:
        if col < len(row):
            text = str(row[col]).strip()
            if text:
                out.append(text)
    return out


def _decimal_tail(text: str, places: int = 2) -> str | None:
    if "." not in text:
        return None
    tail = text.split(".", 1)[1]
    if len(tail) < places:
        return None
    return tail[:places]


def _integer_digit_changes(left: str, right: str) -> int | None:
    left_digits = [c for c in left.split(".", 1)[0] if c.isdigit()]
    right_digits = [c for c in right.split(".", 1)[0] if c.isdigit()]
    # ponytail: equal-length integer-part heuristic; upgrade path is a
    # Levenshtein-style digit edit distance if source data show inserted
    # or deleted integer digits with copied decimal tails.
    if not left_digits or len(left_digits) != len(right_digits):
        return None
    return sum(a != b for a, b in zip(left_digits, right_digits))


def _terminal_digit(text: str) -> str | None:
    for char in reversed(text.strip()):
        if char.isdigit():
            return char
    return None


def _ones_matches_first_decimal(text: str) -> bool:
    if "." not in text:
        return False
    left, right = text.split(".", 1)
    left_digits = [c for c in left if c.isdigit()]
    right_digits = [c for c in right if c.isdigit()]
    return bool(left_digits and right_digits and left_digits[-1] == right_digits[0])


def _round_decimal(value: Decimal, places: str = "0.000001") -> Decimal:
    try:
        if not value.is_finite():
            return value
        return value.quantize(Decimal(places), rounding=ROUND_HALF_UP)
    except Exception:  # noqa: BLE001 — InvalidOperation on extreme magnitudes
        return value

# --- Excel-style fabrication severity helpers (s41586-oriented) ---
# Partial fixed-offset: modal row-wise difference covers most pairs.
_PARTIAL_OFFSET_MIN_FRAC = 0.90
_PARTIAL_OFFSET_MIN_N = 6
# Perfect decimal-tail match → high when n is large enough.
_PERFECT_TAIL_HIGH_MIN_N = 6
# Non-zero fixed offset promoted to high when n is solid + offset is "clean".
_CLEAN_OFFSET_HIGH_MIN_N = 8
# Paper-level span summary thresholds.
_EXCEL_SPAN_MIN_HITS = 5
_EXCEL_SPAN_MIN_TABLES = 2
# PubPeer / Source-Data paste: exact value-run reuse length.
_SEQ_REUSE_WINDOW = 5
_SEQ_REUSE_MAX_FINDINGS = 40
# Parallel replicate columns that are element-wise identical.
_IDENTICAL_REPS_MIN_COLS = 3
_IDENTICAL_REPS_MIN_ROWS = 3
_EXCEL_FABRICATION_CHECKS = frozenset(
    {
        "fixed_offset",
        "partial_fixed_offset",
        "cross_table_fixed_offset",
        "cross_table_partial_fixed_offset",
        "cross_table_repeated_values",
        "matching_decimal_tails",
        "cross_table_matching_decimal_tails",
        "integer_shift_decimal_tail_reuse",
        "integer_part_digit_change_decimal_tail_reuse",
        "high_duplicate_rate",
        "multi_column_high_duplicate_rate",
        "three_column_additive_relationship",
        "three_column_subtractive_relationship",
        "sequence_reuse",
        "identical_parallel_replicates",
        "fixed_ratio",
    }
)

# Constant multiplicative relation A ≈ k·B (PubPeer-style fabricated series).
_FIXED_RATIO_MIN_N = 6
_FIXED_RATIO_REL_ERR = Decimal("0.002")  # 0.2% relative tolerance on k


def _is_clean_offset(offset: Decimal) -> bool:
    """True for offsets typical of hand-edited spreadsheets.

    Integers, single-decimal tenths (0.1, 1.5), or two-decimal
    multiples of 0.05 — typical of hand-edited / "Excel-typed" series.
    """
    a = abs(offset)
    if a == 0:
        return True
    if a == a.to_integral_value():
        return True
    tenths = a.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    if a == tenths:
        return True
    hundredths = a.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if a == hundredths:
        try:
            cents = int((a * 100).to_integral_value())
        except (InvalidOperation, ValueError):
            return False
        return cents % 5 == 0
    return False


def _fixed_offset_severity(offset: Decimal, n: int) -> str:
    """Severity for exact row-wise fixed offsets (copy or A=B+c)."""
    if offset == 0:
        return "high"
    if n >= _CLEAN_OFFSET_HIGH_MIN_N and _is_clean_offset(offset):
        return "high"
    if n >= MIN_COLUMN_VALUES:
        return "medium"
    return "low"


def _pubpeer_tag(check: str) -> dict[str, str]:
    """Lightweight taxonomy tag for report / aggregation layers."""
    mapping = {
        "fixed_offset": "source_data_group_copy_or_shift",
        "partial_fixed_offset": "source_data_group_copy_or_shift",
        "cross_table_fixed_offset": "source_data_group_copy_or_shift",
        "cross_table_partial_fixed_offset": "source_data_group_copy_or_shift",
        "cross_table_repeated_values": "source_data_group_copy_or_shift",
        "matching_decimal_tails": "source_data_decimal_tail_reuse",
        "cross_table_matching_decimal_tails": "source_data_decimal_tail_reuse",
        "integer_shift_decimal_tail_reuse": "source_data_decimal_tail_reuse",
        "sequence_reuse": "source_data_block_paste",
        "identical_parallel_replicates": "source_data_zero_biological_variance",
        "excel_fabrication_span": "source_data_systemic_excel_fingerprint",
        "high_duplicate_rate": "source_data_group_copy_or_shift",
        "multi_column_high_duplicate_rate": "source_data_group_copy_or_shift",
        "fixed_ratio": "source_data_group_copy_or_shift",
    }
    tag = mapping.get(check)
    return {"pubpeer_pattern": tag} if tag else {}


def _quantize_seq(values: list[Decimal], places: int = 6) -> list[str]:
    q = Decimal(10) ** -places
    out: list[str] = []
    for v in values:
        try:
            out.append(str(v.quantize(q, rounding=ROUND_HALF_UP)))
        except (InvalidOperation, ValueError):
            out.append(str(v))
    return out


def _decimal_tail_severity(matching: int, n_pairs: int) -> str:
    """Perfect two-decimal-tail reuse across parallel groups → high."""
    if n_pairs <= 0:
        return "low"
    if matching == n_pairs and n_pairs >= _PERFECT_TAIL_HIGH_MIN_N:
        return "high"
    if matching / n_pairs >= MIN_CONCENTRATION_FRACTION:
        return "medium"
    return "low"


def _modal_offset(
    diffs: list[Decimal],
) -> tuple[Decimal, int] | None:
    if not diffs:
        return None
    counts = Counter(diffs)
    offset, count = counts.most_common(1)[0]
    return offset, count


def _is_variability_header(header: str) -> bool:
    # ponytail: header-name heuristic; upgrade path is a configurable
    # variability-column vocabulary from labeled manuscript tables.
    normalized = "".join(char.lower() if char.isalnum() else " " for char in header)
    tokens = set(normalized.split())
    compact = "".join(normalized.split())
    return bool(tokens & {"sd", "std", "stdev", "sem"} or "standarddeviation" in compact)


def _json_ready(value: Any) -> Any:
    if isinstance(value, Decimal):
        as_int = int(value)
        if value == as_int:
            return as_int
        return float(value)
    if isinstance(value, list):
        return [_json_ready(item) for item in value]
    if isinstance(value, dict):
        return {key: _json_ready(item) for key, item in value.items()}
    return value


def _as_json(payload: dict[str, Any]) -> str:
    return json.dumps(_json_ready(payload), ensure_ascii=False)


# ---------- statistical column checks (2026-07) ----------

def _is_pure_index_or_axis(values: list[Decimal], sorted_values: list[Decimal]) -> bool:
    """FP guard for the sequence checks.

    Pure index sequences (consecutive integers such as 1..n or
    0..n-1) and strictly increasing all-integer axes (year / day /
    dose-number columns) are *expected* to be perfectly regular, so
    the arithmetic-sequence checks must not fire on them."""
    if not all(v == v.to_integral_value() for v in sorted_values):
        return False
    ints = [int(v) for v in sorted_values]
    if ints == list(range(ints[0], ints[0] + len(ints))):
        return True
    return all(values[i] < values[i + 1] for i in range(len(values) - 1))


def _is_axis_like(values: list[Decimal]) -> bool:
    """FP guard: monotonic, near-regularly-spaced column.

    Instrument bin axes and regular sampling grids (DLS/NTA size
    bins, fixed-step time axes) are non-decreasing with (nearly)
    constant spacing *by design* -- regular spacing there is not a
    fabrication signal. A column like ``0.5, 1, 3, 5, 12, 24, 36``
    (irregular early spacing, dominant later spacing) is NOT
    axis-like and still reaches the checks.

    Also treats a column made of K >= 2 verbatim repeats of the
    same block as structural (repeated instrument sweeps share the
    same bin grid, e.g. two 1803-bin NTA scans stacked in one
    column)."""
    n = len(values)
    if n < 3:
        return False
    for k in (2, 3, 4):
        if n % k:
            continue
        chunk = n // k
        if chunk < 3:
            continue
        first = values[:chunk]
        if all(
            values[i * chunk : (i + 1) * chunk] == first
            for i in range(1, k)
        ):
            return True
    if not all(values[i] <= values[i + 1] for i in range(n - 1)):
        return False
    nz = [
        values[i + 1] - values[i]
        for i in range(n - 1)
        if values[i + 1] != values[i]
    ]
    if len(nz) < 2:
        return False
    gf = [float(g) for g in nz]
    mean = statistics.fmean(gf)
    return mean > 0 and statistics.pstdev(gf) / mean < 0.05


def _sequence_check(values: list[Decimal], texts: list[str]) -> dict[str, Any] | None:
    """Detect (near-)arithmetic sequences in one column.

    Two statistics on the *sorted* values (order-independent):

    * ``arithmetic_sequence_sorted`` -- CV of sorted first
      differences < 0.05, or value-vs-rank linear regression
      R^2 > 0.999. Severity ``medium``.
    * ``modal_gap_sequence`` -- a dominant repeated spacing (mode
      gap in >= 50% of nonzero gaps, >= 5 occurrences). Severity
      ``medium``, downgraded to ``low`` when the modal gap equals
      the column's quantization step (dense two-decimal data hits
      adjacent lattice points by chance).

    Columns already caught by the raw-order ``arithmetic_progression``
    / ``near_perfect_arithmetic_progression`` checks above are skipped
    so the same signal is not reported twice.
    """
    n = len(values)
    if n < _SEQ_MIN_VALUES or len(set(values)) == 1:
        return None
    raw_diffs = [
        _round_decimal(values[i + 1] - values[i]) for i in range(n - 1)
    ]
    if len(set(raw_diffs)) == 1:
        return None  # covered by ``arithmetic_progression``
    top_raw, top_raw_count = Counter(raw_diffs).most_common(1)[0]
    if top_raw != 0 and top_raw_count / len(raw_diffs) >= 0.8:
        return None  # covered by ``near_perfect_arithmetic_progression``
    sv = sorted(values)
    if _is_pure_index_or_axis(values, sv) or _is_axis_like(values):
        return None
    gaps = [sv[i + 1] - sv[i] for i in range(n - 1)]
    nz_gaps = [g for g in gaps if g != 0]
    if len(nz_gaps) < 2:
        return None
    floats = [float(v) for v in sv]
    mean_rank = (n - 1) / 2.0
    mean_val = statistics.fmean(floats)
    sxx = sum((i - mean_rank) ** 2 for i in range(n))
    syy = sum((v - mean_val) ** 2 for v in floats)
    r2 = 0.0
    if sxx > 0 and syy > 0:
        sxy = sum(
            (i - mean_rank) * (v - mean_val) for i, v in enumerate(floats)
        )
        r2 = (sxy * sxy) / (sxx * syy)
    gap_floats = [float(g) for g in nz_gaps]
    gap_mean = statistics.fmean(gap_floats)
    cv = (
        statistics.pstdev(gap_floats) / gap_mean if gap_mean > 0 else None
    )
    if (cv is not None and cv < _SEQ_CV_MAX) or r2 > _SEQ_R2_MIN:
        return {
            "check": "arithmetic_sequence_sorted",
            "severity": "medium",
            "n": n,
            "gap_cv": round(cv, 5) if cv is not None else None,
            "rank_r2": round(r2, 6),
        }
    counts = Counter(nz_gaps)
    mode_gap, mode_count = counts.most_common(1)[0]
    if (
        mode_count >= _MODAL_GAP_MIN_COUNT
        and mode_count / len(nz_gaps) >= _MODAL_GAP_MIN_FRACTION
        and len(counts) >= 2
    ):
        precs = [p for p in (_fraction_len(t) for t in texts) if p is not None]
        step = Decimal(1).scaleb(-max(precs)) if precs else None
        on_lattice = step is not None and abs(mode_gap - step) < step / 2
        return {
            "check": "modal_gap_sequence",
            "severity": "low" if on_lattice else "medium",
            "n": n,
            "modal_gap": mode_gap,
            "mode_count": mode_count,
            "nonzero_gaps": len(nz_gaps),
            "mode_fraction": round(mode_count / len(nz_gaps), 4),
            "on_quantization_lattice": on_lattice,
        }
    return None


def _precision_check(texts: list[str]) -> dict[str, Any] | None:
    """Flag columns mixing decimal-precision levels.

    The decimal-places distribution within a column should be
    (nearly) constant for one instrument; a mode share < 95% with
    >= 2 precision levels that each occur >= 2 times is a screening
    signal. Heuristic only -- always severity ``low``."""
    if len(texts) < _PRECISION_MIN_VALUES:
        return None
    precs = [p for p in (_fraction_len(t) for t in texts) if p is not None]
    if len(precs) < _PRECISION_MIN_VALUES:
        return None
    counts = Counter(precs)
    levels = {
        p: c for p, c in counts.items() if c >= _PRECISION_MIN_LEVEL_COUNT
    }
    if len(levels) < 2:
        return None
    mode_places, mode_count = counts.most_common(1)[0]
    if mode_count / len(precs) >= _PRECISION_MODE_MAX_FRACTION:
        return None
    return {
        "check": "mixed_decimal_places",
        "severity": "low",
        "n": len(precs),
        "precision_counts": {str(p): c for p, c in sorted(counts.items())},
        "mode_places": mode_places,
        "mode_fraction": round(mode_count / len(precs), 4),
    }


def _duplicate_excess_record(
    values: list[Decimal], texts: list[str], header: str = ""
) -> dict[str, Any] | None:
    """Poisson test for excess exact duplicates in one scope.

    Infer the column's decimal precision ``d``, count representable
    values ``R = span / 10^-d + 1``, expected collision pairs
    ``E = C(n,2) / R`` (birthday problem), and take the Poisson
    upper tail of the observed duplicate pairs. The raw p-value is
    BH-corrected by the caller across the table family.

    Columns whose top value already exceeds
    ``MIN_DUPLICATE_FRACTION`` are skipped -- the deterministic
    ``improbable_repeated_values`` check above reports those.
    """
    n = len(values)
    if n < _DUP_EXCESS_MIN_VALUES:
        return None
    counts = Counter(values)
    top_value, top_count = counts.most_common(1)[0]
    if top_count / n >= MIN_DUPLICATE_FRACTION:
        return None  # covered by ``improbable_repeated_values``
    if _is_axis_like(values):
        return None  # instrument bin axis / sampling grid
    header_l = header.lower()
    if "p-value" in header_l or "p value" in header_l:
        # P-value columns legitimately repeat rounded thresholds
        # (0.05, 0.01, 1.000); collision counts are meaningless there.
        return None
    precs = [p for p in (_fraction_len(t) for t in texts) if p is not None]
    if not precs:
        return None
    step = Decimal(1).scaleb(-min(max(precs), 8))
    span = max(values) - min(values)
    if span == 0:
        return None  # constant column -- covered by ``zero_variance``
    # Effective value count: the uniform-occupancy (birthday) null
    # only makes sense over the range where the data actually live.
    # Min-max span is inflated by outliers and would make collisions
    # look impossible for concentrated data (e.g. instrument count
    # columns), so use 3x IQR capped by the observed span instead.
    sv = sorted(values)
    iqr = sv[(3 * len(sv)) // 4] - sv[len(sv) // 4]
    effective_span = min(max(iqr * 3, step), span)
    r_values = (
        int((effective_span / step).to_integral_value(rounding=ROUND_HALF_UP))
        + 1
    )
    if r_values < 2:
        return None
    lo, hi = min(values), max(values)
    dup_pairs = sum(
        c * (c - 1) // 2
        for v, c in counts.items()
        if c > 1 and v != 0 and v != lo and v != hi
    )
    # Exact-zero ties are excluded: 0.0 is the floor value of most
    # instruments (below-threshold readings), so zero collisions are
    # expected. Ties at the observed min/max are excluded for the
    # same reason: floor/ceiling effects (detection limits,
    # saturation, P-values rounded to 1.000) legitimately clamp many
    # measurements to the range boundary. Zero-*dominated* columns
    # are still reported by the ``improbable_repeated_values``
    # fraction check above.
    if dup_pairs < _DUP_EXCESS_MIN_PAIRS:
        return None
    expected = (n * (n - 1) / 2.0) / r_values
    return {
        "check": "duplicate_excess",
        "p": _poisson_tail(dup_pairs, expected),
        "n": n,
        "duplicate_pairs": dup_pairs,
        "expected_pairs": round(expected, 4),
        "representable_values": r_values,
        "decimal_places": min(max(precs), 8),
        "top_value": top_value,
        "top_count": top_count,
    }


class TableRelationshipDetector:
    """Flag exact arithmetic relationships across manuscript data tables."""

    name = "table_relationships"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        findings: list[Finding] = []
        tables = _safe_tables(doc)
        for t_index, table in enumerate(tables):
            headers = getattr(table, "headers", []) or []
            cols = _numeric_columns(table)
            label = _format_table_label(table, t_index)
            findings.extend(self._column_findings(doc, table, t_index, label, headers, cols))
            findings.extend(self._pair_findings(doc, table, t_index, label, headers, cols))
            findings.extend(self._multi_column_findings(doc, label, headers, cols))
            findings.extend(self._triple_findings(doc, label, headers, cols))
            findings.extend(
                self._identical_parallel_replicate_findings(
                    doc, label, headers, cols
                )
            )
            findings.extend(self._statistical_column_findings(doc, table, t_index, label, headers))
        findings.extend(self._cross_table_findings(doc, tables))
        findings.extend(self._cross_table_terminal_digit_findings(doc, tables))
        findings.extend(self._sequence_reuse_findings(doc, tables))
        findings.extend(self._excel_fabrication_span_findings(doc, findings))
        return DetectorResult(detector=self.name, findings=findings, ok=True)

    def _identical_parallel_replicate_findings(
        self,
        doc: ParsedDoc,
        label: str,
        headers: list[str],
        cols: dict[int, list[Decimal]],
    ) -> list[Finding]:
        """Flag ≥3 columns that are element-wise identical (zero variance).

        Common PubPeer Source-Data cue: claimed biological/technical
        replicates with perfectly identical numbers.
        """
        findings: list[Finding] = []
        items = sorted(cols.items())
        if len(items) < _IDENTICAL_REPS_MIN_COLS:
            return findings
        # Greedy groups of consecutive column indices that match fully.
        i = 0
        while i < len(items):
            col_i, vals_i = items[i]
            if len(vals_i) < _IDENTICAL_REPS_MIN_ROWS:
                i += 1
                continue
            group = [col_i]
            j = i + 1
            while j < len(items):
                col_j, vals_j = items[j]
                n = min(len(vals_i), len(vals_j))
                if n < _IDENTICAL_REPS_MIN_ROWS:
                    break
                if vals_i[:n] == vals_j[:n]:
                    group.append(col_j)
                    j += 1
                else:
                    # allow non-consecutive only one skip? keep consecutive-only
                    break
            if len(group) >= _IDENTICAL_REPS_MIN_COLS:
                names = [
                    headers[c] if c < len(headers) else f"col_{c + 1}"
                    for c in group
                ]
                n = len(vals_i)
                findings.append(
                    self._finding(
                        doc,
                        "high",
                        (
                            f"{label} columns {names} are identical parallel "
                            f"replicates (zero scatter)"
                        ),
                        f"{label}, columns "
                        + ", ".join(str(c + 1) for c in group),
                        {
                            "check": "identical_parallel_replicates",
                            "n": n,
                            "column_count": len(group),
                            "columns": names,
                            "left_column": names[0],
                            "right_column": names[-1],
                            **_pubpeer_tag("identical_parallel_replicates"),
                        },
                    )
                )
                i = j
            else:
                i += 1
        # Also non-consecutive: any set of 3+ columns with identical values
        # (PubPeer often has rep columns interspersed with means).
        if len(findings) == 0 and len(items) >= _IDENTICAL_REPS_MIN_COLS:
            seen_sig: dict[tuple[str, ...], list[int]] = {}
            for col, vals in items:
                if len(vals) < _IDENTICAL_REPS_MIN_ROWS:
                    continue
                sig = tuple(_quantize_seq(vals))
                seen_sig.setdefault(sig, []).append(col)
            for sig, col_list in seen_sig.items():
                if len(col_list) < _IDENTICAL_REPS_MIN_COLS:
                    continue
                names = [
                    headers[c] if c < len(headers) else f"col_{c + 1}"
                    for c in col_list
                ]
                findings.append(
                    self._finding(
                        doc,
                        "high",
                        (
                            f"{label} columns {names} share identical "
                            f"replicate values"
                        ),
                        f"{label}, columns "
                        + ", ".join(str(c + 1) for c in col_list),
                        {
                            "check": "identical_parallel_replicates",
                            "n": len(sig),
                            "column_count": len(col_list),
                            "columns": names,
                            "layout": "non_consecutive",
                            "left_column": names[0],
                            "right_column": names[-1],
                            **_pubpeer_tag("identical_parallel_replicates"),
                        },
                    )
                )
        return findings

    def _sequence_reuse_findings(
        self,
        doc: ParsedDoc,
        tables: list[Any],
    ) -> list[Finding]:
        """Exact contiguous value-run reuse across columns / tables.

        PubPeer Source-Data threads often show the same multi-cell paste
        block appearing in another sheet or condition column.
        """
        window = _SEQ_REUSE_WINDOW
        # map window signature -> list of loci
        index: dict[tuple[str, ...], list[dict[str, Any]]] = {}
        prepared: list[tuple[str, list[str], dict[int, list[Decimal]]]] = []
        for t_index, table in enumerate(tables):
            cols = _numeric_columns(table)
            if not cols:
                continue
            label = _format_table_label(table, t_index)
            headers = getattr(table, "headers", []) or []
            prepared.append((label, headers, cols))
            for col, values in cols.items():
                if len(values) < window:
                    continue
                q = _quantize_seq(values)
                header = headers[col] if col < len(headers) else f"col_{col + 1}"
                for start in range(0, len(q) - window + 1):
                    sig = tuple(q[start : start + window])
                    # skip pure constant windows (often pad zeros)
                    if len(set(sig)) <= 1:
                        continue
                    index.setdefault(sig, []).append(
                        {
                            "table": label,
                            "column": header,
                            "col_index": col,
                            "start": start,
                            "n": len(values),
                        }
                    )

        findings: list[Finding] = []
        seen_pairs: set[tuple[str, str, str]] = set()
        for sig, loci in index.items():
            if len(findings) >= _SEQ_REUSE_MAX_FINDINGS:
                break
            if len(loci) < 2:
                continue
            # distinct (table, column) pairs only
            distinct: list[dict[str, Any]] = []
            keys: set[tuple[str, str]] = set()
            for loc in loci:
                k = (str(loc["table"]), str(loc["column"]))
                if k in keys:
                    continue
                keys.add(k)
                distinct.append(loc)
            if len(distinct) < 2:
                continue
            left, right = distinct[0], distinct[1]
            pair_key = tuple(
                sorted(
                    (
                        f"{left['table']}|{left['column']}",
                        f"{right['table']}|{right['column']}",
                    )
                )
            ) + (sig[0],)
            if pair_key in seen_pairs:
                continue
            seen_pairs.add(pair_key)  # type: ignore[arg-type]
            same_table = left["table"] == right["table"]
            severity = "high" if not same_table else "medium"
            findings.append(
                self._finding(
                    doc,
                    severity,
                    (
                        f"{left['table']} and {right['table']} reuse the same "
                        f"{window}-value numeric sequence"
                    ),
                    (
                        f"{left['table']} col '{left['column']}' "
                        f"@row {left['start'] + 1} ↔ "
                        f"{right['table']} col '{right['column']}' "
                        f"@row {right['start'] + 1}"
                    ),
                    {
                        "check": "sequence_reuse",
                        "n": window,
                        "window": window,
                        "sequence": list(sig),
                        "left_table": left["table"],
                        "right_table": right["table"],
                        "left_column": left["column"],
                        "right_column": right["column"],
                        "left_start": left["start"],
                        "right_start": right["start"],
                        "locus_count": len(distinct),
                        **_pubpeer_tag("sequence_reuse"),
                    },
                )
            )
        return findings

    def _excel_fabrication_span_findings(
        self,
        doc: ParsedDoc,
        findings: list[Finding],
    ) -> list[Finding]:
        """Paper-level cluster: same Excel-style checks across multiple tables.

        Fabricated numeric fingerprints (fixed offset, identical decimal
        tails, column copies) spanning several source-data sheets / figures.
        """
        hits = [
            f
            for f in findings
            if isinstance(f.raw, dict)
            and str(f.raw.get("check") or "") in _EXCEL_FABRICATION_CHECKS
        ]
        if len(hits) < _EXCEL_SPAN_MIN_HITS:
            return []
        tables: set[str] = set()
        checks: Counter[str] = Counter()
        high_hits = 0
        pattern_tags: Counter[str] = Counter()
        for f in hits:
            raw = f.raw if isinstance(f.raw, dict) else {}
            checks[str(raw.get("check") or "")] += 1
            tag = str(raw.get("pubpeer_pattern") or "")
            if tag:
                pattern_tags[tag] += 1
            if f.severity == "high":
                high_hits += 1
            for key in ("left_table", "right_table"):
                label = str(raw.get(key) or "").strip()
                if label:
                    tables.add(label)
            # Within-table findings: use fig/host from location prefix
            if not raw.get("left_table") and f.location:
                host = re.split(
                    r",\s*columns?\b", f.location, maxsplit=1, flags=re.I
                )[0].strip()
                if host:
                    tables.add(host)
        if len(tables) < _EXCEL_SPAN_MIN_TABLES:
            return []
        # High only when several *member* findings are already high.
        # table_count alone promoted legit multi-table papers (negative
        # controls 2026-07: excel span high FP on PLOS/SciRep tables).
        severity = "high" if high_hits >= 3 else "medium"
        top_checks = [
            {"check": c, "count": n} for c, n in checks.most_common(8)
        ]
        return [
            self._finding(
                doc,
                severity,
                (
                    f"Excel-style fabricated numeric patterns span "
                    f"{len(tables)} tables ({len(hits)} signals)"
                ),
                "paper-level source-data aggregate",
                {
                    "check": "excel_fabrication_span",
                    "n": len(hits),
                    "table_count": len(tables),
                    "high_member_count": high_hits,
                    "tables": sorted(tables)[:40],
                    "top_checks": top_checks,
                    "pubpeer_patterns": [
                        {"pattern": p, "count": c}
                        for p, c in pattern_tags.most_common(8)
                    ],
                    **_pubpeer_tag("excel_fabrication_span"),
                },
            )
        ]

    def _column_findings(
        self,
        doc: ParsedDoc,
        table: Any,
        t_index: int,
        label: str,
        headers: list[str],
        cols: dict[int, list[Decimal]],
    ) -> list[Finding]:
        findings: list[Finding] = []
        for col, values in cols.items():
            header = headers[col] if col < len(headers) else f"col_{col + 1}"
            if _is_variability_header(header):
                zero_rows = [row_index + 1 for row_index, value in enumerate(values) if value == 0]
                if zero_rows:
                    findings.append(
                        self._finding(
                            doc,
                            "high",
                            f"{label} column '{header}' contains zero standard deviation entries",
                            f"{label}, column {col + 1} ('{header}')",
                            {
                                "check": "zero_standard_deviation_entries",
                                "n": len(values),
                                "column": header,
                                "zero_count": len(zero_rows),
                                "rows": zero_rows,
                            },
                        )
                    )
                if len(set(values)) == 1 and values[0] != 0:
                    findings.append(
                        self._finding(
                            doc,
                            "medium",
                            f"{label} column '{header}' has constant standard deviation",
                            f"{label}, column {col + 1} ('{header}')",
                            {
                                "check": "constant_standard_deviation",
                                "n": len(values),
                                "column": header,
                                "value": values[0],
                            },
                        )
                    )
            if len(set(values)) == 1:
                findings.append(
                    self._finding(
                        doc,
                        "medium",
                        f"{label} column '{header}' has zero variance",
                        f"{label}, column {col + 1} ('{header}')",
                        {"check": "zero_variance", "n": len(values), "value": values[0]},
                    )
                )
            else:
                value, count = Counter(values).most_common(1)[0]
                if count / len(values) >= MIN_DUPLICATE_FRACTION:
                    findings.append(
                        self._finding(
                            doc,
                            "high",
                            f"{label} column '{header}' has improbable repeated values",
                            f"{label}, column {col + 1} ('{header}')",
                            {
                                "check": "improbable_repeated_values",
                                "n": len(values),
                                "repeated_value": value,
                                "repeat_count": count,
                            },
                        )
                    )

            if len(values) >= 6:
                diffs = [_round_decimal(values[i + 1] - values[i]) for i in range(len(values) - 1)]
                if len(set(diffs)) == 1 and diffs[0] != 0:
                    findings.append(
                        self._finding(
                            doc,
                            "medium",
                            f"{label} column '{header}' forms an arithmetic progression",
                            f"{label}, column {col + 1} ('{header}')",
                            {"check": "arithmetic_progression", "n": len(values), "step": diffs[0]},
                        )
                    )
                else:
                    step, matching = Counter(diffs).most_common(1)[0]
                    # ponytail: one-mode-diff heuristic; upgrade path is a
                    # calibrated residual model if labeled table cases show
                    # too many near-linear experimental series.
                    if step != 0 and matching / len(diffs) >= 0.8:
                        findings.append(
                            self._finding(
                                doc,
                                "medium",
                                (
                                    f"{label} column '{header}' forms a "
                                    "near-perfect arithmetic progression"
                                ),
                                f"{label}, column {col + 1} ('{header}')",
                                {
                                    "check": "near_perfect_arithmetic_progression",
                                    "n": len(values),
                                    "step": step,
                                    "matching_diffs": matching,
                                    "total_diffs": len(diffs),
                                },
                            )
                        )

            texts = _cell_texts(table, col)
            digit_counts = Counter(d for d in (_terminal_digit(t) for t in texts) if d is not None)
            total_digits = sum(digit_counts.values())
            if total_digits >= MIN_DIGIT_VALUES:
                digit, count = digit_counts.most_common(1)[0]
                if count / total_digits >= MIN_CONCENTRATION_FRACTION:
                    findings.append(
                        self._finding(
                            doc,
                            "medium",
                            f"{label} column '{header}' shows terminal digit concentration",
                            f"{label}, column {col + 1} ('{header}')",
                            {
                                "check": "terminal_digit_concentration",
                                "n": total_digits,
                                "top_digits": [[digit, count]],
                            },
                        )
                    )
                elif len(digit_counts) >= 2:
                    top_two = digit_counts.most_common(2)
                    combined = sum(count for _, count in top_two)
                    if combined / total_digits >= MIN_PAIR_DIGIT_FRACTION:
                        findings.append(
                            self._finding(
                                doc,
                                "medium",
                                f"{label} column '{header}' shows terminal digit pair concentration",
                                f"{label}, column {col + 1} ('{header}')",
                                {
                                    "check": "terminal_digit_pair_concentration",
                                    "n": total_digits,
                                    "top_digits": [[digit, count] for digit, count in top_two],
                                    "combined_fraction": combined / total_digits,
                                },
                            )
                        )
                matches = sum(1 for text in texts if _ones_matches_first_decimal(text))
                if (
                    matches >= MIN_DIGIT_VALUES
                    and matches / len(texts) >= MIN_CONCENTRATION_FRACTION
                ):
                    findings.append(
                        self._finding(
                            doc,
                            "medium",
                            f"{label} column '{header}' ones digit mirrors first decimal digit",
                            f"{label}, column {col + 1} ('{header}')",
                            {
                                "check": "ones_decimal_mirror",
                                "n": len(texts),
                                "matches": matches,
                            },
                        )
                    )
        return findings

    def _pair_findings(
        self,
        doc: ParsedDoc,
        table: Any,
        t_index: int,
        label: str,
        headers: list[str],
        cols: dict[int, list[Decimal]],
    ) -> list[Finding]:
        findings: list[Finding] = []
        items = sorted(cols.items())
        for left_i, (left_col, left_values) in enumerate(items):
            for right_col, right_values in items[left_i + 1 :]:
                n = min(len(left_values), len(right_values))
                if n < MIN_COLUMN_VALUES:
                    continue
                left = left_values[:n]
                right = right_values[:n]
                left_header = headers[left_col] if left_col < len(headers) else f"col_{left_col + 1}"
                right_header = headers[right_col] if right_col < len(headers) else f"col_{right_col + 1}"
                diffs = [_round_decimal(right[i] - left[i]) for i in range(n)]
                if len(set(diffs)) == 1:
                    findings.append(
                        self._finding(
                            doc,
                            _fixed_offset_severity(diffs[0], n),
                            f"{label} columns '{left_header}' and '{right_header}' have a fixed offset",
                            f"{label}, columns {left_col + 1} and {right_col + 1}",
                            {
                                "check": "fixed_offset",
                                "n": n,
                                "left_column": left_header,
                                "right_column": right_header,
                                "offset": diffs[0],
                                "match_fraction": 1.0,
                            },
                        )
                    )
                else:
                    modal = _modal_offset(diffs)
                    if modal is not None:
                        modal_off, modal_count = modal
                        frac = modal_count / n
                        if (
                            n >= _PARTIAL_OFFSET_MIN_N
                            and modal_count >= MIN_COLUMN_VALUES
                            and frac >= _PARTIAL_OFFSET_MIN_FRAC
                        ):
                            findings.append(
                                self._finding(
                                    doc,
                                    _fixed_offset_severity(modal_off, modal_count),
                                    (
                                        f"{label} columns '{left_header}' and "
                                        f"'{right_header}' have a partial fixed offset"
                                    ),
                                    f"{label}, columns {left_col + 1} and {right_col + 1}",
                                    {
                                        "check": "partial_fixed_offset",
                                        "n": n,
                                        "matching_pairs": modal_count,
                                        "match_fraction": round(frac, 4),
                                        "left_column": left_header,
                                        "right_column": right_header,
                                        "offset": modal_off,
                                    },
                                )
                            )

                # Constant multiplicative relation A ≈ k·B (k not 0/1).
                ratios: list[Decimal] = []
                for i in range(n):
                    if left[i] == 0:
                        continue
                    try:
                        ratio = right[i] / left[i]
                    except Exception:  # noqa: BLE001
                        continue
                    if not ratio.is_finite():
                        continue
                    # Skip absurd magnitudes (quantize would InvalidOperation).
                    if abs(ratio) > Decimal("1e12") or abs(ratio) < Decimal("1e-12"):
                        continue
                    ratios.append(_round_decimal(ratio, "0.000001"))
                if len(ratios) >= _FIXED_RATIO_MIN_N:
                    r0 = ratios[0]
                    if r0 != 0 and r0 != 1 and all(
                        abs(r - r0) <= abs(r0) * _FIXED_RATIO_REL_ERR
                        for r in ratios
                    ):
                        findings.append(
                            self._finding(
                                doc,
                                "high" if len(ratios) >= 8 else "medium",
                                (
                                    f"{label} columns '{left_header}' and "
                                    f"'{right_header}' have a fixed ratio"
                                ),
                                f"{label}, columns {left_col + 1} and {right_col + 1}",
                                {
                                    "check": "fixed_ratio",
                                    "n": len(ratios),
                                    "ratio": r0,
                                    "left_column": left_header,
                                    "right_column": right_header,
                                    "match_fraction": 1.0,
                                },
                            )
                        )

                exact = sum(1 for i in range(n) if left[i] == right[i])
                if n > exact >= MIN_COLUMN_VALUES and exact / n >= MIN_DUPLICATE_FRACTION:
                    findings.append(
                        self._finding(
                            doc,
                            "high",
                            f"{label} columns '{left_header}' and '{right_header}' have a high duplicate rate",
                            f"{label}, columns {left_col + 1} and {right_col + 1}",
                            {
                                "check": "high_duplicate_rate",
                                "n": n,
                                "matching_pairs": exact,
                                "left_column": left_header,
                                "right_column": right_header,
                            },
                        )
                    )

                sums = [_round_decimal(right[i] + left[i]) for i in range(n)]
                if len(set(sums)) == 1:
                    findings.append(
                        self._finding(
                            doc,
                            "medium",
                            f"{label} columns '{left_header}' and '{right_header}' are mirror-symmetric",
                            f"{label}, columns {left_col + 1} and {right_col + 1}",
                            {
                                "check": "mirror_symmetry",
                                "n": n,
                                "left_column": left_header,
                                "right_column": right_header,
                                "sum": sums[0],
                            },
                        )
                    )

                left_tails = [_decimal_tail(t) for t in _cell_texts(table, left_col)]
                right_tails = [_decimal_tail(t) for t in _cell_texts(table, right_col)]
                left_texts = _cell_texts(table, left_col)
                right_texts = _cell_texts(table, right_col)
                tail_pairs = [
                    (a, b) for a, b in zip(left_tails, right_tails) if a is not None and b is not None
                ]
                matching = sum(1 for a, b in tail_pairs if a == b)
                if (
                    len(tail_pairs) >= MIN_COLUMN_VALUES
                    and matching / len(tail_pairs) >= MIN_CONCENTRATION_FRACTION
                ):
                    tail_sev = _decimal_tail_severity(matching, len(tail_pairs))
                    findings.append(
                        self._finding(
                            doc,
                            tail_sev,
                            f"{label} columns '{left_header}' and '{right_header}' have matching decimal tails",
                            f"{label}, columns {left_col + 1} and {right_col + 1}",
                            {
                                "check": "matching_decimal_tails",
                                "n": len(tail_pairs),
                                "matching_pairs": matching,
                                "left_column": left_header,
                                "right_column": right_header,
                                "match_fraction": round(matching / len(tail_pairs), 4),
                            },
                        )
                    )
                    integer_offset = diffs[0]
                    if (
                        matching == len(tail_pairs)
                        and len(set(diffs)) == 1
                        and integer_offset == integer_offset.to_integral_value()
                        and 0 < abs(integer_offset) <= 9
                    ):
                        findings.append(
                            self._finding(
                                doc,
                                "high" if len(tail_pairs) >= _PERFECT_TAIL_HIGH_MIN_N else "medium",
                                (
                                    f"{label} columns '{left_header}' and '{right_header}' "
                                    "show integer-shift decimal-tail reuse"
                                ),
                                f"{label}, columns {left_col + 1} and {right_col + 1}",
                                {
                                    "check": "integer_shift_decimal_tail_reuse",
                                    "n": len(tail_pairs),
                                    "matching_pairs": matching,
                                    "left_column": left_header,
                                    "right_column": right_header,
                                    "integer_offset": integer_offset,
                                    "decimal_places": 2,
                                },
                            )
                        )
                    digit_changes = [
                        _integer_digit_changes(a, b)
                        for a, b in zip(left_texts, right_texts)
                    ]
                    if (
                        matching == len(tail_pairs)
                        and digit_changes
                        and all(change == 1 for change in digit_changes)
                    ):
                        findings.append(
                            self._finding(
                                doc,
                                "medium",
                                (
                                    f"{label} columns '{left_header}' and '{right_header}' "
                                    "show integer-part digit-change decimal-tail reuse"
                                ),
                                f"{label}, columns {left_col + 1} and {right_col + 1}",
                                {
                                    "check": "integer_part_digit_change_decimal_tail_reuse",
                                    "n": len(tail_pairs),
                                    "matching_pairs": matching,
                                    "left_column": left_header,
                                    "right_column": right_header,
                                    "changed_integer_digits": 1,
                                    "decimal_places": 2,
                                },
                            )
                        )
        return findings

    def _multi_column_findings(
        self,
        doc: ParsedDoc,
        label: str,
        headers: list[str],
        cols: dict[int, list[Decimal]],
    ) -> list[Finding]:
        findings: list[Finding] = []
        items = sorted(cols.items())
        # ponytail: cubic scan over manuscript table columns; upgrade path is
        # connected-component clustering if source-data workbooks show dozens
        # of numeric columns where this becomes noisy or slow.
        for left_i, (a_col, a_values) in enumerate(items):
            for right_i in range(left_i + 1, len(items)):
                b_col, b_values = items[right_i]
                for c_col, c_values in items[right_i + 1 :]:
                    n = min(len(a_values), len(b_values), len(c_values))
                    if n < MIN_COLUMN_VALUES:
                        continue
                    matching = sum(
                        1
                        for i in range(n)
                        if a_values[i] == b_values[i] == c_values[i]
                    )
                    if matching / n < MIN_DUPLICATE_FRACTION:
                        continue
                    col_indices = [a_col, b_col, c_col]
                    col_names = [
                        headers[col] if col < len(headers) else f"col_{col + 1}"
                        for col in col_indices
                    ]
                    findings.append(
                        self._finding(
                            doc,
                            "high",
                            f"{label} columns {col_names} show multi-column high duplicate rate",
                            f"{label}, columns {a_col + 1}, {b_col + 1}, {c_col + 1}",
                            {
                                "check": "multi_column_high_duplicate_rate",
                                "n": n,
                                "matching_rows": matching,
                                "columns": col_names,
                            },
                        )
                    )
        return findings

    def _triple_findings(
        self,
        doc: ParsedDoc,
        label: str,
        headers: list[str],
        cols: dict[int, list[Decimal]],
    ) -> list[Finding]:
        findings: list[Finding] = []
        items = sorted(cols.items())
        for a_i, (a_col, a_values) in enumerate(items):
            for b_i, (b_col, b_values) in enumerate(items):
                if b_i == a_i:
                    continue
                for c_col, c_values in items:
                    if c_col in {a_col, b_col}:
                        continue
                    n = min(len(a_values), len(b_values), len(c_values))
                    if n < MIN_COLUMN_VALUES:
                        continue
                    a_header = headers[a_col] if a_col < len(headers) else f"col_{a_col + 1}"
                    b_header = headers[b_col] if b_col < len(headers) else f"col_{b_col + 1}"
                    c_header = headers[c_col] if c_col < len(headers) else f"col_{c_col + 1}"
                    additive = all(
                        _round_decimal(a_values[i] + b_values[i]) == c_values[i]
                        for i in range(n)
                    )
                    if additive:
                        findings.append(
                            self._finding(
                                doc,
                                "high",
                                (
                                    f"{label} columns '{a_header}', '{b_header}', "
                                    f"and '{c_header}' show an additive relationship"
                                ),
                                f"{label}, columns {a_col + 1}, {b_col + 1}, {c_col + 1}",
                                {
                                    "check": "three_column_additive_relationship",
                                    "n": n,
                                    "formula": f"{a_header} + {b_header} = {c_header}",
                                    "left_column": a_header,
                                    "right_column": b_header,
                                    "result_column": c_header,
                                },
                            )
                        )
                    subtractive = all(
                        _round_decimal(a_values[i] - b_values[i]) == c_values[i]
                        for i in range(n)
                    )
                    if subtractive:
                        findings.append(
                            self._finding(
                                doc,
                                "high",
                                (
                                    f"{label} columns '{a_header}', '{b_header}', "
                                    f"and '{c_header}' show a subtractive relationship"
                                ),
                                f"{label}, columns {a_col + 1}, {b_col + 1}, {c_col + 1}",
                                {
                                    "check": "three_column_subtractive_relationship",
                                    "n": n,
                                    "formula": f"{a_header} - {b_header} = {c_header}",
                                    "left_column": a_header,
                                    "right_column": b_header,
                                    "result_column": c_header,
                                },
                            )
                        )
        return findings

    def _cross_table_findings(
        self,
        doc: ParsedDoc,
        tables: list[Any],
    ) -> list[Finding]:
        findings: list[Finding] = []
        prepared: list[tuple[int, Any, str, list[str], dict[int, list[Decimal]]]] = []
        for t_index, table in enumerate(tables):
            cols = _numeric_columns(table)
            if cols:
                prepared.append(
                    (
                        t_index,
                        table,
                        _format_table_label(table, t_index),
                        getattr(table, "headers", []) or [],
                        cols,
                    )
                )
        for left_i, (left_idx, left_table, left_label, left_headers, left_cols) in enumerate(prepared):
            for right_idx, right_table, right_label, right_headers, right_cols in prepared[left_i + 1 :]:
                for left_col, left_values in left_cols.items():
                    for right_col, right_values in right_cols.items():
                        n = min(len(left_values), len(right_values))
                        if n < MIN_COLUMN_VALUES:
                            continue
                        left_header = (
                            left_headers[left_col]
                            if left_col < len(left_headers)
                            else f"col_{left_col + 1}"
                        )
                        right_header = (
                            right_headers[right_col]
                            if right_col < len(right_headers)
                            else f"col_{right_col + 1}"
                        )
                        exact = sum(
                            1
                            for i in range(n)
                            if left_values[i] == right_values[i]
                        )
                        diffs = [
                            _round_decimal(right_values[i] - left_values[i])
                            for i in range(n)
                        ]
                        if len(set(diffs)) == 1:
                            findings.append(
                                self._finding(
                                    doc,
                                    _fixed_offset_severity(diffs[0], n),
                                    (
                                        f"{left_label} and {right_label} "
                                        "show cross-table fixed offset"
                                    ),
                                    (
                                        f"{left_label}, column {left_col + 1} "
                                        f"to {right_label}, column {right_col + 1}"
                                    ),
                                    {
                                        "check": "cross_table_fixed_offset",
                                        "n": n,
                                        "offset": diffs[0],
                                        "match_fraction": 1.0,
                                        "left_table": left_label,
                                        "right_table": right_label,
                                        "left_column": left_header,
                                        "right_column": right_header,
                                    },
                                )
                            )
                        else:
                            modal = _modal_offset(diffs)
                            if modal is not None:
                                modal_off, modal_count = modal
                                frac = modal_count / n
                                if (
                                    n >= _PARTIAL_OFFSET_MIN_N
                                    and modal_count >= MIN_COLUMN_VALUES
                                    and frac >= _PARTIAL_OFFSET_MIN_FRAC
                                ):
                                    findings.append(
                                        self._finding(
                                            doc,
                                            _fixed_offset_severity(
                                                modal_off, modal_count
                                            ),
                                            (
                                                f"{left_label} and {right_label} "
                                                "show cross-table partial fixed offset"
                                            ),
                                            (
                                                f"{left_label}, column {left_col + 1} "
                                                f"to {right_label}, column "
                                                f"{right_col + 1}"
                                            ),
                                            {
                                                "check": "cross_table_partial_fixed_offset",
                                                "n": n,
                                                "matching_pairs": modal_count,
                                                "match_fraction": round(frac, 4),
                                                "offset": modal_off,
                                                "left_table": left_label,
                                                "right_table": right_label,
                                                "left_column": left_header,
                                                "right_column": right_header,
                                            },
                                        )
                                    )
                        if exact / n >= MIN_DUPLICATE_FRACTION:
                            findings.append(
                                self._finding(
                                    doc,
                                    "high",
                                    (
                                        f"{left_label} and {right_label} "
                                        "show cross-table repeated values"
                                    ),
                                    (
                                        f"{left_label}, column {left_col + 1} "
                                        f"to {right_label}, column {right_col + 1}"
                                    ),
                                    {
                                        "check": "cross_table_repeated_values",
                                        "n": n,
                                        "matching_pairs": exact,
                                        "left_table": left_label,
                                        "right_table": right_label,
                                        "left_column": left_header,
                                        "right_column": right_header,
                                    },
                                )
                            )

                        left_tails = [_decimal_tail(t) for t in _cell_texts(left_table, left_col)]
                        right_tails = [_decimal_tail(t) for t in _cell_texts(right_table, right_col)]
                        tail_pairs = [
                            (a, b)
                            for a, b in zip(left_tails, right_tails)
                            if a is not None and b is not None
                        ]
                        matching = sum(1 for a, b in tail_pairs if a == b)
                        if (
                            len(tail_pairs) >= MIN_COLUMN_VALUES
                            and matching / len(tail_pairs)
                            >= MIN_CONCENTRATION_FRACTION
                        ):
                            findings.append(
                                self._finding(
                                    doc,
                                    _decimal_tail_severity(
                                        matching, len(tail_pairs)
                                    ),
                                    (
                                        f"{left_label} and {right_label} "
                                        "show cross-table matching decimal tails"
                                    ),
                                    (
                                        f"{left_label}, column {left_col + 1} "
                                        f"to {right_label}, column {right_col + 1}"
                                    ),
                                    {
                                        "check": "cross_table_matching_decimal_tails",
                                        "n": len(tail_pairs),
                                        "matching_pairs": matching,
                                        "match_fraction": round(
                                            matching / len(tail_pairs), 4
                                        ),
                                        "left_table": left_label,
                                        "right_table": right_label,
                                        "left_column": left_header,
                                        "right_column": right_header,
                                    },
                                )
                            )
        return findings

    def _cross_table_terminal_digit_findings(
        self,
        doc: ParsedDoc,
        tables: list[Any],
    ) -> list[Finding]:
        labels: list[str] = []
        digit_counts: Counter[str] = Counter()
        for t_index, table in enumerate(tables):
            table_has_digits = False
            for col in _numeric_columns(table):
                for text in _cell_texts(table, col):
                    if _decimal_cell(text) is None:
                        continue
                    digit = _terminal_digit(text)
                    if digit is None:
                        continue
                    digit_counts[digit] += 1
                    table_has_digits = True
            if table_has_digits:
                labels.append(_format_table_label(table, t_index))

        total_digits = sum(digit_counts.values())
        if len(labels) < 2 or total_digits < MIN_DIGIT_VALUES:
            return []

        top_digits = digit_counts.most_common(2)
        combined = sum(count for _, count in top_digits)
        threshold = (
            MIN_CONCENTRATION_FRACTION
            if len(top_digits) == 1
            else MIN_PAIR_DIGIT_FRACTION
        )
        if combined / total_digits < threshold:
            return []

        return [
            self._finding(
                doc,
                "medium",
                "Cross-table terminal digit concentration across source tables",
                ", ".join(labels),
                {
                    "check": "cross_table_terminal_digit_concentration",
                    "n": total_digits,
                    "top_digits": [[digit, count] for digit, count in top_digits],
                    "combined_fraction": combined / total_digits,
                    "tables": labels,
                },
            )
        ]

    def _statistical_column_findings(
        self,
        doc: ParsedDoc,
        table: Any,
        t_index: int,
        label: str,
        headers: list[str],
    ) -> list[Finding]:
        """Research-backed per-column statistical checks (2026-07).

        * ``arithmetic_sequence_sorted`` / ``modal_gap_sequence`` --
          (near-)arithmetic series via sorted-gap CV / rank R^2 and
          dominant-spacing mode (deterministic, no p-value).
        * ``mixed_decimal_places`` -- precision-level mixing
          (heuristic, low only).
        * ``duplicate_excess`` -- Poisson collision-excess test per
          column, plus one pooled per-table scope (catches values
          re-used across parallel group columns); p-values are
          BH-corrected as one family per table.
        """
        findings: list[Finding] = []
        cols = _numeric_columns_with_texts(table)
        for col, (values, texts) in sorted(cols.items()):
            header = headers[col] if col < len(headers) else f"col_{col + 1}"
            location = f"{label}, column {col + 1} ('{header}')"
            seq = _sequence_check(values, texts)
            if seq is not None:
                severity = str(seq.pop("severity"))
                title = (
                    f"{label} column '{header}' forms an arithmetic sequence"
                    if seq["check"] == "arithmetic_sequence_sorted"
                    else f"{label} column '{header}' shows a dominant repeated spacing"
                )
                findings.append(
                    self._finding(doc, severity, title, location, seq)
                )
            prec = _precision_check(texts)
            if prec is not None:
                findings.append(
                    self._finding(
                        doc,
                        str(prec.pop("severity")),
                        f"{label} column '{header}' mixes decimal precision levels",
                        location,
                        prec,
                    )
                )
        # p-value family: duplicate-excess per column + pooled table.
        records: list[dict[str, Any]] = []
        for col, (values, texts) in sorted(cols.items()):
            header = headers[col] if col < len(headers) else f"col_{col + 1}"
            rec = _duplicate_excess_record(values, texts, header=header)
            if rec is not None:
                rec["scope"] = ("column", col)
                records.append(rec)
        if len(cols) >= 2:
            # Exclude axis-like columns from the pooled scope --
            # their ties are structural (repeated sweeps share the
            # same bin grid), not copied data. P-value columns are
            # excluded too (rounded thresholds repeat legitimately).
            data_cols = []
            for col, (values, texts) in cols.items():
                col_header = (
                    headers[col] if col < len(headers) else ""
                ).lower()
                if "p-value" in col_header or "p value" in col_header:
                    continue
                if _is_axis_like(values):
                    continue
                data_cols.append((values, texts))
            all_values = [v for values, _ in data_cols for v in values]
            all_texts = [t for _, texts in data_cols for t in texts]
            rec = _duplicate_excess_record(all_values, all_texts)
            if rec is not None:
                rec["scope"] = ("table", None)
                records.append(rec)
        if not records:
            return findings
        qvals = _bh_adjust([float(rec["p"]) for rec in records])
        for rec, q in zip(records, qvals):
            severity = _severity_for_q(q)
            if severity is None:
                continue
            scope, col = rec.pop("scope")
            rec["p_raw"] = rec.pop("p")
            rec["q_bh"] = round(q, 6)
            rec["family_size"] = len(records)
            if scope == "column":
                header = headers[col] if col < len(headers) else f"col_{col + 1}"
                title = (
                    f"{label} column '{header}' has statistically "
                    f"improbable duplicate values"
                )
                location = f"{label}, column {col + 1} ('{header}')"
                rec["column"] = header
            else:
                title = (
                    f"{label} has statistically improbable duplicate "
                    f"values across columns"
                )
                location = label
            findings.append(self._finding(doc, severity, title, location, rec))
        return findings

    def _finding(
        self,
        doc: ParsedDoc,
        severity: str,
        title: str,
        location: str,
        evidence: dict[str, Any],
    ) -> Finding:
        # ponytail: deterministic heuristics only; upgrade path is calibrated
        # per-domain thresholds once ManuSift has labeled table-forensics cases.
        payload = dict(evidence)
        check = str(payload.get("check") or "")
        if check and "pubpeer_pattern" not in payload:
            payload.update(_pubpeer_tag(check))
        return Finding.make(
            trace_id=doc.trace_id,
            detector=self.name,
            severity=severity,  # type: ignore[arg-type]
            title=title,
            location=location,
            evidence=_as_json(payload),
            raw=_json_ready(payload),
        )
