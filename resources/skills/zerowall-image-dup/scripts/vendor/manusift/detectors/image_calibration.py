"""Offline image-threshold calibration (RSIID / RSIIL style) — P1.

Scientific image forgery benchmarks (e.g. Recod.ai RSIID / RSIIL,
Kaggle scientific image integrity challenges) are used to **tune**
ManuSift thresholds, not as runtime dependencies.

Workflow
--------
1. Run your detector bank on a labeled set (forged vs clean).
2. Call :func:`suggest_thresholds` with per-image scores + labels.
3. Write JSON via :func:`save_calibration`.
4. Detectors read thr through :func:`load_calibration`.

Default path (override with ``MANUSIFT_IMAGE_CALIBRATION``)::

    <workspace>/.manusift/image_calibration.json

Env keys written into the JSON may include::

    photoholmes_score_thr
    sift_min_cluster
    sift_min_inliers
    cross_sift_min_inliers
    jpeg_ghost_thr
    notes
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Iterable, Sequence


def _default_path() -> Path:
    env = os.environ.get("MANUSIFT_IMAGE_CALIBRATION", "").strip()
    if env:
        return Path(env)
    # Prefer repo-local if present, else cwd
    for cand in (
        Path.cwd() / ".manusift" / "image_calibration.json",
        Path.home() / ".manusift" / "image_calibration.json",
    ):
        if cand.is_file():
            return cand
    return Path.cwd() / ".manusift" / "image_calibration.json"


def load_calibration(path: Path | None = None) -> dict[str, Any]:
    """Load calibration JSON; empty dict if missing."""
    p = path or _default_path()
    try:
        if not p.is_file():
            return {}
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def save_calibration(
    data: dict[str, Any],
    path: Path | None = None,
) -> Path:
    """Write calibration JSON; returns path written."""
    p = path or _default_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        **data,
        "schema": "manusift.image_calibration.v1",
    }
    p.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return p


def suggest_thresholds(
    scores: Sequence[float],
    labels: Sequence[int],
    *,
    target_fpr: float = 0.05,
) -> dict[str, Any]:
    """Suggest a score threshold from labeled scores.

    ``labels[i]`` is 1 for forged / 0 for clean. Returns thr that
    keeps empirical FPR ≤ ``target_fpr`` when possible, else the
    Youden-like max(TPR-FPR) thr.

    Pure-Python; no sklearn dependency.
    """
    if len(scores) != len(labels) or not scores:
        return {"error": "empty_or_mismatch", "n": len(scores)}
    pairs = sorted(zip(scores, labels), key=lambda x: x[0])
    # Candidate thresholds = unique scores
    uniq = sorted({float(s) for s, _ in pairs})
    best_youden = (-1.0, uniq[0] if uniq else 0.5)
    best_fpr: tuple[float, float] | None = None  # (fpr, thr)
    n_pos = sum(1 for _, y in pairs if y)
    n_neg = len(pairs) - n_pos
    if n_neg == 0 or n_pos == 0:
        return {
            "n": len(pairs),
            "n_pos": n_pos,
            "n_neg": n_neg,
            "photoholmes_score_thr": 0.55,
            "note": "single-class labels; kept default thr",
        }
    for thr in uniq:
        tp = fp = 0
        for s, y in pairs:
            if s >= thr:
                if y:
                    tp += 1
                else:
                    fp += 1
        tpr = tp / n_pos
        fpr = fp / n_neg
        youden = tpr - fpr
        if youden > best_youden[0]:
            best_youden = (youden, thr)
        if fpr <= target_fpr:
            if best_fpr is None or fpr < best_fpr[0] or (
                fpr == best_fpr[0] and tpr > 0
            ):
                # among FPR-ok, prefer higher thr that still has TPR
                best_fpr = (fpr, thr)
    thr_out = best_fpr[1] if best_fpr is not None else best_youden[1]
    return {
        "n": len(pairs),
        "n_pos": n_pos,
        "n_neg": n_neg,
        "target_fpr": target_fpr,
        "photoholmes_score_thr": float(thr_out),
        "youden_thr": float(best_youden[1]),
        "youden_score": float(best_youden[0]),
        "fpr_constrained_thr": (
            float(best_fpr[1]) if best_fpr is not None else None
        ),
        "notes": (
            "Calibrate on RSIID/RSIIL-style labeled scientific images; "
            "save via save_calibration() and point MANUSIFT_IMAGE_CALIBRATION."
        ),
    }


def apply_calibration_to_env(cal: dict[str, Any] | None = None) -> dict[str, str]:
    """Map known calibration keys onto process env (returns applied)."""
    data = cal if cal is not None else load_calibration()
    applied: dict[str, str] = {}
    mapping = {
        "photoholmes_score_thr": "MANUSIFT_PHOTOHOLMES_SCORE_THR",
        "sift_min_cluster": "MANUSIFT_SIFT_MIN_CLUSTER",
        "sift_min_inliers": "MANUSIFT_SIFT_MIN_INLIERS",
        "cross_sift_min_inliers": "MANUSIFT_SIFT_CROSS_INLIERS",
        "jpeg_ghost_thr": "MANUSIFT_JPEG_GHOST_THR",
    }
    for src, env_key in mapping.items():
        if src in data and data[src] is not None:
            os.environ[env_key] = str(data[src])
            applied[env_key] = str(data[src])
    return applied
