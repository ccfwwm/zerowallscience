"""immunotherapy workflow: response model + Kaplan-Meier survival comparison.

Fits a logistic regression (IRLS, no sklearn) for response on the biomarkers,
reports odds ratios and cross-validated ROC AUC, then splits the cohort at the
median TMB and compares progression-free survival with Kaplan-Meier curves and
a log-rank test.

Reminder: the cohort is simulated. Nothing here is clinical evidence.

Deterministic: fixed CV folds from a seeded permutation, sorted keys, Agg
backend.

Usage:  python workflow.py [output_dir]
"""

from __future__ import annotations

import json
import pathlib
import sys
import time

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats

SEED = 20260726
N_FOLDS = 5
IRLS_STEPS = 60
IRLS_TOL = 1e-10
RIDGE = 1e-6  # keeps the IRLS solve well conditioned

FEATURES = [
    "log2_tmb",
    "pdl1_per_10",
    "ldh_ratio_uln",
    "prior_therapy_lines",
    "ecog",
    "age_per_10y",
]

COST_NOTE = (
    "Runs on the local Python kernel; no model or API calls, so the monetary "
    "cost is zero. Only wall-clock duration is meaningful here."
)


def fit_logistic(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Iteratively reweighted least squares. Column 0 of `x` must be the intercept."""
    beta = np.zeros(x.shape[1])
    penalty = np.eye(x.shape[1]) * RIDGE
    penalty[0, 0] = 0.0
    for _ in range(IRLS_STEPS):
        eta = np.clip(x @ beta, -30.0, 30.0)
        p = 1.0 / (1.0 + np.exp(-eta))
        w = np.clip(p * (1.0 - p), 1e-8, None)
        z = eta + (y - p) / w
        step = np.linalg.solve((x * w[:, None]).T @ x + penalty, (x * w[:, None]).T @ z)
        if np.max(np.abs(step - beta)) < IRLS_TOL:
            beta = step
            break
        beta = step
    return beta


def roc_auc(y: np.ndarray, score: np.ndarray) -> float:
    """Rank-based AUC with tie correction (Mann-Whitney U identity)."""
    pos = y == 1
    n_pos = int(pos.sum())
    n_neg = int((~pos).sum())
    ranks = stats.rankdata(score)
    return float((ranks[pos].sum() - n_pos * (n_pos + 1) / 2.0) / (n_pos * n_neg))


def kaplan_meier(times: np.ndarray, events: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    order = np.lexsort((-events, times))
    times, events = times[order], events[order]
    unique = np.unique(times[events == 1])
    survival = 1.0
    xs, ys = [0.0], [1.0]
    for t in unique:
        at_risk = int((times >= t).sum())
        died = int(((times == t) & (events == 1)).sum())
        survival *= 1.0 - died / at_risk
        xs.append(float(t))
        ys.append(survival)
    return np.asarray(xs), np.asarray(ys)


def median_survival(xs: np.ndarray, ys: np.ndarray) -> float | None:
    below = np.where(ys <= 0.5)[0]
    return float(xs[below[0]]) if below.size else None


def logrank(t1: np.ndarray, e1: np.ndarray, t2: np.ndarray, e2: np.ndarray) -> tuple[float, float]:
    """Two-sample log-rank statistic and p-value (chi2, 1 df)."""
    times = np.unique(np.concatenate([t1[e1 == 1], t2[e2 == 1]]))
    observed = 0.0
    expected = 0.0
    variance = 0.0
    for t in times:
        n1 = float((t1 >= t).sum())
        n2 = float((t2 >= t).sum())
        d1 = float(((t1 == t) & (e1 == 1)).sum())
        d2 = float(((t2 == t) & (e2 == 1)).sum())
        n, d = n1 + n2, d1 + d2
        if n <= 1 or d == 0:
            continue
        observed += d1
        expected += d * n1 / n
        variance += d * (n1 / n) * (n2 / n) * (n - d) / (n - 1)
    if variance <= 0:
        return 0.0, 1.0
    chi2 = (observed - expected) ** 2 / variance
    return float(chi2), float(stats.chi2.sf(chi2, 1))


def main(out_dir: pathlib.Path) -> dict:
    started = time.perf_counter()

    base = pathlib.Path(__file__).resolve().parent
    results_dir = out_dir / "results"
    figures_dir = out_dir / "figures"
    results_dir.mkdir(parents=True, exist_ok=True)
    figures_dir.mkdir(parents=True, exist_ok=True)

    patients = pd.read_csv(base / "data" / "patients.csv")
    patients = patients.sort_values("patient_id", kind="stable").reset_index(drop=True)
    truth = pd.read_csv(base / "data" / "simulation_truth.csv").set_index("term")["true_value"]

    patients["log2_tmb"] = np.log2(np.minimum(patients["tmb_mut_per_mb"], 40.0))
    patients["pdl1_per_10"] = patients["pdl1_tps_percent"] / 10.0
    patients["age_per_10y"] = patients["age_years"] / 10.0

    y = patients["responder"].to_numpy(dtype=float)
    x = np.column_stack([np.ones(len(patients))] + [patients[f].to_numpy(dtype=float) for f in FEATURES])

    beta = fit_logistic(x, y)
    in_sample_auc = roc_auc(y.astype(int), x @ beta)

    rng = np.random.default_rng(SEED)
    order = rng.permutation(len(patients))
    folds = np.empty(len(patients), dtype=int)
    folds[order] = np.arange(len(patients)) % N_FOLDS
    cv_score = np.empty(len(patients))
    for f in range(N_FOLDS):
        test = folds == f
        cv_score[test] = x[test] @ fit_logistic(x[~test], y[~test])
    cv_auc = roc_auc(y.astype(int), cv_score)

    coefficients = [
        {
            "term": "intercept",
            "coefficient": round(float(beta[0]), 6),
            "odds_ratio": round(float(np.exp(beta[0])), 6),
            "true_value": round(float(truth["intercept"]), 4),
        }
    ]
    truth_names = {
        "log2_tmb": "log2_tmb",
        "pdl1_per_10": "pdl1_tps_per_10",
        "ldh_ratio_uln": "ldh_ratio",
        "prior_therapy_lines": "prior_lines",
        "ecog": "ecog",
        "age_per_10y": "age_per_10y",
    }
    for i, name in enumerate(FEATURES, start=1):
        coefficients.append(
            {
                "term": name,
                "coefficient": round(float(beta[i]), 6),
                "odds_ratio": round(float(np.exp(beta[i])), 6),
                "true_value": round(float(truth[truth_names[name]]), 4),
            }
        )
    pd.DataFrame(coefficients).to_csv(
        results_dir / "response_model.csv", index=False, lineterminator="\n"
    )

    fitted = np.array([c["coefficient"] for c in coefficients[1:]])
    true_vector = np.array([c["true_value"] for c in coefficients[1:]])

    # Survival, primary split: the model's own cross-validated response score.
    # Using out-of-fold scores keeps the stratification honest — no patient is
    # ranked by a model that saw them.
    score_median = float(np.median(cv_score))
    high = cv_score >= score_median
    t_high = patients.loc[high, "pfs_months"].to_numpy(dtype=float)
    e_high = patients.loc[high, "progressed"].to_numpy(dtype=int)
    t_low = patients.loc[~high, "pfs_months"].to_numpy(dtype=float)
    e_low = patients.loc[~high, "progressed"].to_numpy(dtype=int)
    x_high, y_high = kaplan_meier(t_high, e_high)
    x_low, y_low = kaplan_meier(t_low, e_low)
    chi2, p_logrank = logrank(t_high, e_high, t_low, e_low)

    # Secondary split: TMB alone, a single marker rather than the whole model.
    tmb_median = float(patients["tmb_mut_per_mb"].median())
    tmb_high = patients["tmb_mut_per_mb"] >= tmb_median
    chi2_tmb, p_tmb = logrank(
        patients.loc[tmb_high, "pfs_months"].to_numpy(dtype=float),
        patients.loc[tmb_high, "progressed"].to_numpy(dtype=int),
        patients.loc[~tmb_high, "pfs_months"].to_numpy(dtype=float),
        patients.loc[~tmb_high, "progressed"].to_numpy(dtype=int),
    )

    response_rate = float(y.mean())
    results = {
        "n_patients": int(len(patients)),
        "response_rate": round(response_rate, 6),
        "n_responders": int(y.sum()),
        "n_progressed": int(patients["progressed"].sum()),
        "censoring_rate": round(float(1.0 - patients["progressed"].mean()), 6),
        "in_sample_auc": round(in_sample_auc, 6),
        "cv_auc": round(cv_auc, 6),
        "n_cv_folds": N_FOLDS,
        "coefficients": coefficients,
        "pearson_fitted_vs_true_coefficients": round(
            float(stats.pearsonr(fitted, true_vector).statistic), 6
        ),
        "tmb_median_mut_per_mb": round(tmb_median, 6),
        "survival": {
            "split": "median cross-validated response score",
            "n_high_score": int(high.sum()),
            "n_low_score": int((~high).sum()),
            "median_pfs_high_score_months": median_survival(x_high, y_high),
            "median_pfs_low_score_months": median_survival(x_low, y_low),
            "logrank_chi2": round(chi2, 6),
            "logrank_p": round(p_logrank, 8),
            "tmb_only_logrank_chi2": round(chi2_tmb, 6),
            "tmb_only_logrank_p": round(p_tmb, 8),
        },
        "response_rate_by_tumor_type": {
            str(k): round(float(v), 6)
            for k, v in sorted(patients.groupby("tumor_type")["responder"].mean().items())
        },
        "best_response_counts": {
            str(k): int(v) for k, v in sorted(patients["best_response"].value_counts().items())
        },
    }

    fig, axes = plt.subplots(1, 2, figsize=(11, 4.4))
    tpr = []
    fpr = []
    for cut in np.sort(np.unique(cv_score))[::-1]:
        called = cv_score >= cut
        tpr.append(float((called & (y == 1)).sum() / max((y == 1).sum(), 1)))
        fpr.append(float((called & (y == 0)).sum() / max((y == 0).sum(), 1)))
    axes[0].plot([0, 1], [0, 1], ls="--", lw=0.8, color="#333")
    axes[0].plot(fpr, tpr, color="#2f6fdb", lw=1.6)
    axes[0].set_xlabel("false positive rate")
    axes[0].set_ylabel("true positive rate")
    axes[0].set_title(f"Response ROC (CV AUC = {cv_auc:.3f})")

    axes[1].step(x_high, y_high, where="post", color="#2f6fdb", lw=1.6, label="high response score")
    axes[1].step(x_low, y_low, where="post", color="#d1495b", lw=1.6, label="low response score")
    axes[1].axhline(0.5, color="#333", lw=0.7, ls=":")
    axes[1].set_ylim(0, 1.02)
    axes[1].set_xlabel("months")
    axes[1].set_ylabel("progression-free survival")
    axes[1].set_title(f"Kaplan-Meier (log-rank p = {p_logrank:.2e})")
    axes[1].legend(fontsize=8)
    fig.suptitle("SIMULATED cohort - not real patients, not clinical evidence")
    fig.tight_layout()
    fig.savefig(figures_dir / "response_and_survival.png", dpi=150)
    plt.close(fig)

    payload = {
        "example": "immunotherapy",
        "seed": SEED,
        "data_is_simulated": True,
        "results": results,
        "metrics": {
            "duration_seconds": round(time.perf_counter() - started, 3),
            "cost_usd": 0.0,
            "cost_note": COST_NOTE,
        },
        "artifacts": [
            "results/response_model.csv",
            "results/results.json",
            "figures/response_and_survival.png",
        ],
    }
    with open(results_dir / "results.json", "w", encoding="utf-8", newline="\n") as fh:
        json.dump(payload, fh, indent=2)
        fh.write("\n")
    return payload


if __name__ == "__main__":
    target = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent
    out = main(target)
    r = out["results"]
    print(
        f"{r['n_patients']} simulated patients, ORR={r['response_rate']:.3f}, "
        f"CV AUC={r['cv_auc']}, log-rank p={r['survival']['logrank_p']}, "
        f"{out['metrics']['duration_seconds']}s"
    )
