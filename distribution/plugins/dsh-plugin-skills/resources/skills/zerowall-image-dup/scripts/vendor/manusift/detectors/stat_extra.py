"""P6.2 statistical screening extras (PubPeer / forensic-stats aligned).

Three lightweight detectors, independent of the GRIM/statcheck core:

1. **stat_pvalue_pileup** — concentration of reported p-values just
   below α=0.05 (classic optional-stopping / selective reporting cue).
2. **stat_sprite** — summary-level mean±SD+n feasibility on discrete
   scales (SPRITE-*lite*; not full dataset reconstruction). Default OFF.
3. **stat_corr_psd** — correlation / covariance square tables that fail
   positive semi-definiteness (impossible fabricated matrices).

All emit findings only; they never delete data. Network is not used.
"""
from __future__ import annotations

import json
import math
import os
import re
from typing import Any

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult

# ---------- shared helpers ----------

_P_EQ_RE = re.compile(
    r"\bp\s*(?:=|≈|~)\s*(0?\.\d+(?:e-?\d+)?|\.\d+)\b",
    re.IGNORECASE,
)
_P_LT_RE = re.compile(
    r"\bp\s*(?:<|≤)\s*(0?\.\d+(?:e-?\d+)?|\.\d+)\b",
    re.IGNORECASE,
)
_MEAN_SD_N_RE = re.compile(
    r"(?:"
    r"(?:M|mean|Average)\s*[=≈]\s*"
    r"(?P<mean>-?\d+(?:\.\d+)?)"
    r".{0,40}?"
    r"(?:SD|S\.D\.|std(?:\.?\s*dev)?)\s*[=≈]?\s*"
    r"(?P<sd>\d+(?:\.\d+)?)"
    r".{0,40}?"
    r"(?:n|N)\s*[=≈]?\s*(?P<n>\d+)"
    r"|"
    r"(?P<mean2>-?\d+(?:\.\d+)?)\s*±\s*(?P<sd2>\d+(?:\.\d+)?)"
    r".{0,30}?"
    r"[\(\[]\s*(?:n|N)\s*[=≈]?\s*(?P<n2>\d+)\s*[\)\]]"
    r")",
    re.IGNORECASE | re.DOTALL,
)


def _env_on(name: str, default: bool = False) -> bool:
    raw = (os.environ.get(name) or "").strip().lower()
    if not raw:
        return default
    return raw not in {"0", "false", "off", "no"}


def _safe_float(s: Any) -> float | None:
    try:
        t = str(s).strip().replace(",", "")
        if t.startswith("."):
            t = "0" + t
        return float(t)
    except (TypeError, ValueError):
        return None


def _doc_text(doc: ParsedDoc) -> str:
    return " ".join(
        getattr(b, "text", "") or "" for b in (doc.text_blocks or [])
    )


def _collect_p_values(doc: ParsedDoc) -> list[dict[str, Any]]:
    """Exact p= reports (not only p<); include table p-columns."""
    out: list[dict[str, Any]] = []
    text = _doc_text(doc)
    for m in _P_EQ_RE.finditer(text):
        v = _safe_float(m.group(1))
        if v is None or not (0.0 < v < 1.0):
            continue
        out.append(
            {
                "p": v,
                "source": "text",
                "snippet": m.group(0)[:40],
            }
        )
    for t_idx, table in enumerate(getattr(doc, "tables", None) or []):
        headers = getattr(table, "headers", None) or []
        rows = getattr(table, "rows", None) or []
        p_cols = [
            i
            for i, h in enumerate(headers)
            if re.search(r"\bp\b|sig|p-value|p value", str(h or ""), re.I)
        ]
        for c in p_cols:
            for r_idx, row in enumerate(rows):
                if c >= len(row):
                    continue
                cell = str(row[c]).strip()
                # skip p<.05 style cells for pile-up (no exact value)
                if re.match(r"^[<>≤≥]", cell):
                    continue
                v = _safe_float(cell.lstrip("pP=").strip())
                if v is None or not (0.0 < v < 1.0):
                    continue
                out.append(
                    {
                        "p": v,
                        "source": f"table{t_idx + 1}",
                        "snippet": cell[:40],
                        "row": r_idx + 1,
                    }
                )
    return out


# ---------- 1. p-value pile-up ----------

_PILE_LO = 0.04
_PILE_HI = 0.05
_PILE_MIN_TOTAL = 8
_PILE_MIN_IN_BAND = 4
_PILE_MIN_FRAC = 0.35


class PValuePileupDetector:
    """Flag over-representation of p in (0.04, 0.05] among exact p=.

    Screening signal only (not proof of p-hacking). Requires enough
    exact p= reports in a broad (0.001, 0.10] window so papers with
    two p=.04 values do not false-alarm.
    """

    name = "stat_pvalue_pileup"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        findings: list[Finding] = []
        if not _env_on("MANUSIFT_PVALUE_PILEUP_ENABLED", True):
            return DetectorResult(
                detector=self.name, findings=[], ok=True
            )
        vals = _collect_p_values(doc)
        # Analysis window: avoid flooding with p<.001-only papers
        window = [x for x in vals if 0.001 < x["p"] <= 0.10]
        if len(window) < _PILE_MIN_TOTAL:
            return DetectorResult(
                detector=self.name, findings=[], ok=True
            )
        in_band = [
            x for x in window if _PILE_LO < x["p"] <= _PILE_HI
        ]
        frac = len(in_band) / len(window)
        # Trigger: enough absolute pile-up, or high fraction of window.
        triggered = (
            len(in_band) >= _PILE_MIN_IN_BAND
            and frac >= _PILE_MIN_FRAC
        ) or (len(in_band) >= 6)
        if not triggered:
            return DetectorResult(
                detector=self.name, findings=[], ok=True
            )

        # Expected uniform share of (0.04,0.05] inside (0.001,0.10]
        expected_frac = (_PILE_HI - _PILE_LO) / (0.10 - 0.001)
        severity = (
            "high"
            if len(in_band) >= 6 or frac >= 0.5
            else "medium"
        )
        findings.append(
            Finding.make(
                trace_id=doc.trace_id,
                detector=self.name,
                severity=severity,  # type: ignore[arg-type]
                title=(
                    f"p-value pile-up near .05: {len(in_band)}/"
                    f"{len(window)} exact p in ({_PILE_LO}, {_PILE_HI}]"
                ),
                location="text+tables",
                evidence=json.dumps(
                    {
                        "check": "pvalue_pileup",
                        "n_window": len(window),
                        "n_in_band": len(in_band),
                        "fraction_in_band": round(frac, 4),
                        "expected_uniform_fraction": round(
                            expected_frac, 4
                        ),
                        "band": [_PILE_LO, _PILE_HI],
                        "examples": [x["p"] for x in in_band[:12]],
                        "pubpeer_pattern": "stat_phacking_cue",
                    }
                ),
                raw={
                    "check": "pvalue_pileup",
                    "n": len(in_band),
                    "n_window": len(window),
                    "fraction_in_band": round(frac, 4),
                    "pubpeer_pattern": "stat_phacking_cue",
                },
            )
        )
        return DetectorResult(
            detector=self.name, findings=findings, ok=True
        )


# ---------- 2. SPRITE-lite ----------


def _max_sd_discrete(
    mean: float, n: int, lo: float, hi: float
) -> float:
    """Max possible SD for n scores in [lo, hi] with given mean.

    Put as much mass as possible at the extremes while hitting mean.
    """
    if n < 2 or hi <= lo:
        return 0.0
    # Fraction at hi: let k at hi, n-k at lo → mean = (k*hi+(n-k)*lo)/n
    # For max variance, values only at endpoints.
    # mean = lo + f*(hi-lo) where f = proportion at hi
    f = (mean - lo) / (hi - lo) if hi > lo else 0.0
    f = max(0.0, min(1.0, f))
    # population variance of Bernoulli scaled
    var = f * (1.0 - f) * (hi - lo) ** 2
    # sample SD uses n-1
    return math.sqrt(var * n / (n - 1)) if n > 1 else 0.0


def _min_sd_discrete(mean: float, n: int, step: float = 1.0) -> float:
    """Rough lower SD bound: scores near mean on a grid."""
    if n < 2:
        return 0.0
    # If mean is integer and step=1, min SD can be 0.
    nearest = round(mean / step) * step
    if abs(mean - nearest) < 1e-9:
        return 0.0
    # Otherwise at least one point must sit off the mean grid cell.
    return 0.0  # soft: only enforce max SD in lite mode


class SpriteLiteDetector:
    """Summary feasibility for mean±SD (n) on a bounded discrete scale.

    Full SPRITE enumerates datasets; this lite check only tests whether
    the reported SD exceeds the maximum possible under endpoint mass
    for an assumed scale (default 1–5 Likert unless headers imply %).
    Gated by ``MANUSIFT_SPRITE_ENABLED`` (default off).
    """

    name = "stat_sprite"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        findings: list[Finding] = []
        if not _env_on("MANUSIFT_SPRITE_ENABLED", False):
            return DetectorResult(
                detector=self.name, findings=[], ok=True
            )
        text = _doc_text(doc)
        hits: list[dict[str, Any]] = []
        for m in _MEAN_SD_N_RE.finditer(text):
            gd = m.groupdict()
            mean = _safe_float(gd.get("mean") or gd.get("mean2"))
            sd = _safe_float(gd.get("sd") or gd.get("sd2"))
            n_raw = gd.get("n") or gd.get("n2")
            if mean is None or sd is None or not n_raw:
                continue
            n = int(n_raw)
            if n < 3 or sd < 0:
                continue
            hits.append(
                {
                    "mean": mean,
                    "sd": sd,
                    "n": n,
                    "snippet": m.group(0)[:80].replace("\n", " "),
                }
            )
        # Dedup by rounded triple
        seen: set[tuple[float, float, int]] = set()
        for h in hits:
            key = (round(h["mean"], 4), round(h["sd"], 4), h["n"])
            if key in seen:
                continue
            seen.add(key)
            mean, sd, n = h["mean"], h["sd"], h["n"]
            # Scale guess: prefer Likert when mean sits in 1–5 even if SD
            # is large (impossible SD is exactly what we want to catch).
            if 1.0 <= mean <= 5.0 and sd <= 4.5:
                lo, hi = 1.0, 5.0
                scale = "1-5"
            elif 0 <= mean <= 100 and mean >= 10:
                lo, hi = 0.0, 100.0
                scale = "0-100"
            elif 0 <= mean <= 10 and sd <= 6:
                lo, hi = 0.0, 10.0
                scale = "0-10"
            else:
                # open-ended: only check SD vs mean magnitude soft bound
                if sd > abs(mean) * 3 + 10:
                    findings.append(
                        Finding.make(
                            trace_id=doc.trace_id,
                            detector=self.name,
                            severity="low",
                            title=(
                                f"Summary SD unusually large vs mean "
                                f"(M={mean}, SD={sd}, n={n})"
                            ),
                            location="text",
                            evidence=json.dumps(
                                {
                                    "check": "sprite_lite_loose",
                                    **h,
                                }
                            ),
                            raw={
                                "check": "sprite_lite_loose",
                                "mean": mean,
                                "sd": sd,
                                "n": n,
                            },
                        )
                    )
                continue
            if mean < lo - 1e-6 or mean > hi + 1e-6:
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity="high",
                        title=(
                            f"Mean {mean} outside assumed scale "
                            f"[{lo}, {hi}] (n={n})"
                        ),
                        location="text",
                        evidence=json.dumps(
                            {
                                "check": "sprite_lite_mean_oor",
                                "scale": scale,
                                **h,
                            }
                        ),
                        raw={
                            "check": "sprite_lite_mean_oor",
                            "mean": mean,
                            "sd": sd,
                            "n": n,
                            "scale": scale,
                        },
                    )
                )
                continue
            max_sd = _max_sd_discrete(mean, n, lo, hi)
            if sd > max_sd + 1e-6:
                findings.append(
                    Finding.make(
                        trace_id=doc.trace_id,
                        detector=self.name,
                        severity="high",
                        title=(
                            f"SD={sd} exceeds max feasible {max_sd:.3g} "
                            f"for M={mean}, n={n} on scale {scale}"
                        ),
                        location="text",
                        evidence=json.dumps(
                            {
                                "check": "sprite_lite_sd_max",
                                "scale": scale,
                                "max_sd": max_sd,
                                **h,
                                "pubpeer_pattern": "stat_impossible_summary",
                            }
                        ),
                        raw={
                            "check": "sprite_lite_sd_max",
                            "mean": mean,
                            "sd": sd,
                            "n": n,
                            "max_sd": max_sd,
                            "scale": scale,
                            "pubpeer_pattern": "stat_impossible_summary",
                        },
                    )
                )
        return DetectorResult(
            detector=self.name, findings=findings, ok=True
        )


# ---------- 3. correlation matrix PSD ----------


def _is_corr_like_header(h: str) -> bool:
    t = (h or "").lower()
    return bool(
        re.search(r"corr|pearson|spearman|r\b|matrix|covar", t)
    )


def _table_to_float_matrix(
    headers: list[str], rows: list[list[Any]]
) -> tuple[list[str], list[list[float]]] | None:
    """Try to read a square numeric matrix (optional leading label col)."""
    if not headers or not rows:
        return None
    # Case A: first column is labels, remaining k columns form k×k
    if len(headers) >= 3:
        labels = []
        mat: list[list[float]] = []
        for row in rows:
            if len(row) < 2:
                continue
            labels.append(str(row[0]).strip())
            nums: list[float] = []
            ok = True
            for cell in row[1 : len(headers)]:
                v = _safe_float(cell)
                if v is None:
                    ok = False
                    break
                nums.append(v)
            if ok and nums:
                mat.append(nums)
        k = len(headers) - 1
        if len(mat) == k and all(len(r) == k for r in mat):
            return labels or [f"v{i}" for i in range(k)], mat
    # Case B: pure numeric square, headers are names
    mat2: list[list[float]] = []
    for row in rows:
        nums = []
        ok = True
        for cell in row[: len(headers)]:
            v = _safe_float(cell)
            if v is None:
                ok = False
                break
            nums.append(v)
        if ok and nums:
            mat2.append(nums)
    k2 = len(headers)
    if len(mat2) == k2 and all(len(r) == k2 for r in mat2):
        return [str(h) for h in headers], mat2
    return None


def _min_eigenvalue(mat: list[list[float]]) -> float | None:
    n = len(mat)
    if n == 0:
        return None
    try:
        import numpy as np

        a = np.array(mat, dtype=float)
        if a.shape != (n, n):
            return None
        # Symmetrize small asymmetry from rounding
        a = 0.5 * (a + a.T)
        w = np.linalg.eigvalsh(a)
        return float(w.min())
    except Exception:  # noqa: BLE001
        return None


class CorrelationMatrixPSDDetector:
    """Flag square correlation-like tables that are not PSD."""

    name = "stat_corr_psd"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        findings: list[Finding] = []
        if not _env_on("MANUSIFT_CORR_PSD_ENABLED", True):
            return DetectorResult(
                detector=self.name, findings=[], ok=True
            )
        tables = getattr(doc, "tables", None) or []
        for t_idx, table in enumerate(tables):
            headers = list(getattr(table, "headers", None) or [])
            rows = list(getattr(table, "rows", None) or [])
            fig = str(getattr(table, "fig_name", "") or "")
            sheet = str(getattr(table, "sheet_name", "") or "")
            label_blob = " ".join(
                [fig, sheet, " ".join(str(h) for h in headers)]
            )
            parsed = _table_to_float_matrix(headers, rows)
            if parsed is None:
                continue
            names, mat = parsed
            n = len(mat)
            if n < 3 or n > 40:
                continue
            # Require corr-like context OR diagonal ~1 (correlation matrix)
            diag = [mat[i][i] for i in range(n)]
            diag_ok = all(abs(d - 1.0) < 0.05 for d in diag) or all(
                abs(d - 1.0) < 0.15 for d in diag
            )
            corrish = _is_corr_like_header(label_blob) or diag_ok
            if not corrish:
                continue
            # Values should look like correlations if we use diag~1 path
            flat = [v for row in mat for v in row]
            if any(abs(v) > 1.05 for v in flat) and not _is_corr_like_header(
                label_blob
            ):
                # likely covariance or other matrix
                if not _is_corr_like_header(label_blob):
                    continue
            min_ev = _min_eigenvalue(mat)
            if min_ev is None:
                continue
            # Allow tiny numerical noise
            if min_ev >= -1e-6:
                continue
            severity = "high" if min_ev < -0.05 else "medium"
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity=severity,  # type: ignore[arg-type]
                    title=(
                        f"Table {t_idx + 1} correlation-like matrix is "
                        f"not positive semi-definite "
                        f"(λ_min={min_ev:.4g})"
                    ),
                    location=f"table {t_idx + 1}"
                    + (f" ({sheet})" if sheet else ""),
                    evidence=json.dumps(
                        {
                            "check": "corr_matrix_not_psd",
                            "n": n,
                            "min_eigenvalue": min_ev,
                            "variables": names[:20],
                            "diag": diag,
                            "pubpeer_pattern": "stat_impossible_corr_matrix",
                        }
                    ),
                    raw={
                        "check": "corr_matrix_not_psd",
                        "n": n,
                        "min_eigenvalue": min_ev,
                        "pubpeer_pattern": "stat_impossible_corr_matrix",
                    },
                )
            )
        return DetectorResult(
            detector=self.name, findings=findings, ok=True
        )
