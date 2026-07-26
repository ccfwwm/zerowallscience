"""enzyme-engineering workflow: additive vs epistatic ridge model, then design.

Fits a ridge regression on one-hot mutation features, compares it against a
model with pairwise interaction terms by cross-validated R2, recovers the
additive effects, and ranks the unmeasured double mutants as design candidates.

Deterministic: fixed CV folds from a sorted variant list, seeded RNG, Agg
backend.

Usage:  python workflow.py [output_dir]
"""

from __future__ import annotations

import itertools
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
LAMBDA_GRID = [0.01, 0.03, 0.1, 0.3, 1.0, 3.0, 10.0, 30.0]
MIN_PAIR_OBSERVATIONS = 5
TOP_N_DESIGNS = 10

COST_NOTE = (
    "Runs on the local Python kernel; no model or API calls, so the monetary "
    "cost is zero. Only wall-clock duration is meaningful here."
)


def ridge_fit(x: np.ndarray, y: np.ndarray, lam: float) -> np.ndarray:
    """Closed-form ridge with an unpenalized intercept (column 0 is all ones)."""
    penalty = np.eye(x.shape[1]) * lam
    penalty[0, 0] = 0.0
    return np.linalg.solve(x.T @ x + penalty, x.T @ y)


def cv_predictions(x: np.ndarray, y: np.ndarray, folds: np.ndarray, lam: float) -> np.ndarray:
    pred = np.empty_like(y)
    for f in range(N_FOLDS):
        test = folds == f
        beta = ridge_fit(x[~test], y[~test], lam)
        pred[test] = x[test] @ beta
    return pred


def r2(y: np.ndarray, pred: np.ndarray) -> float:
    return float(1.0 - ((y - pred) ** 2).sum() / ((y - y.mean()) ** 2).sum())


def select_lambda(x: np.ndarray, y: np.ndarray, folds: np.ndarray) -> tuple[float, float]:
    best = (LAMBDA_GRID[0], -np.inf)
    for lam in LAMBDA_GRID:
        score = r2(y, cv_predictions(x, y, folds, lam))
        if score > best[1]:
            best = (lam, score)
    return best


def main(out_dir: pathlib.Path) -> dict:
    started = time.perf_counter()

    base = pathlib.Path(__file__).resolve().parent
    results_dir = out_dir / "results"
    figures_dir = out_dir / "figures"
    results_dir.mkdir(parents=True, exist_ok=True)
    figures_dir.mkdir(parents=True, exist_ok=True)

    variants = pd.read_csv(base / "data" / "variant_activity.csv")
    variants = variants.sort_values("variant", kind="stable").reset_index(drop=True)
    truth = pd.read_csv(base / "data" / "simulation_truth.csv")
    held_out = pd.read_csv(base / "data" / "held_out_doubles_truth.csv")
    held_out = held_out.sort_values("variant", kind="stable").reset_index(drop=True)

    rep_cols = sorted(c for c in variants.columns if c.endswith("_log2_activity"))
    y = variants[rep_cols].to_numpy(dtype=float).mean(axis=1)

    mutation_lists = [
        [] if row == "none" else sorted(row.split(";")) for row in variants["mutations"]
    ]
    mutations = sorted({m for row in mutation_lists for m in row})
    index = {m: i for i, m in enumerate(mutations)}

    n = len(variants)
    single = np.zeros((n, len(mutations)))
    for r, row in enumerate(mutation_lists):
        for m in row:
            single[r, index[m]] = 1.0
    design_additive = np.column_stack([np.ones(n), single])

    # Interaction columns, but only for pairs seen often enough to estimate.
    pair_counts: dict[tuple[str, str], int] = {}
    for row in mutation_lists:
        for pair in itertools.combinations(row, 2):
            pair_counts[pair] = pair_counts.get(pair, 0) + 1
    pairs = sorted(p for p, c in pair_counts.items() if c >= MIN_PAIR_OBSERVATIONS)
    inter = np.zeros((n, len(pairs)))
    pair_index = {p: i for i, p in enumerate(pairs)}
    for r, row in enumerate(mutation_lists):
        for pair in itertools.combinations(row, 2):
            if pair in pair_index:
                inter[r, pair_index[pair]] = 1.0
    design_epistatic = np.column_stack([design_additive, inter])

    # Deterministic folds: shuffle a sorted index with a seeded generator.
    rng = np.random.default_rng(SEED)
    order = rng.permutation(n)
    folds = np.empty(n, dtype=int)
    folds[order] = np.arange(n) % N_FOLDS

    lam_add, r2_add = select_lambda(design_additive, y, folds)
    lam_epi, r2_epi = select_lambda(design_epistatic, y, folds)

    beta_add = ridge_fit(design_additive, y, lam_add)
    beta_epi = ridge_fit(design_epistatic, y, lam_epi)
    fitted_additive = beta_epi[1 : 1 + len(mutations)]

    true_additive = truth[truth["term_type"] == "additive"].set_index("mutation_a")["true_effect_log2"]
    true_vector = np.array([float(true_additive[m]) for m in mutations])
    rho = stats.spearmanr(fitted_additive, true_vector).statistic
    pearson = stats.pearsonr(fitted_additive, true_vector).statistic

    # Design step: score every unmeasured double with the epistatic model.
    held_pairs = [
        tuple(sorted((row.mutation_a, row.mutation_b))) for row in held_out.itertuples()
    ]
    x_new = np.zeros((len(held_pairs), design_epistatic.shape[1]))
    x_new[:, 0] = 1.0
    for r, (a, b) in enumerate(held_pairs):
        x_new[r, 1 + index[a]] = 1.0
        x_new[r, 1 + index[b]] = 1.0
        if (a, b) in pair_index:
            x_new[r, 1 + len(mutations) + pair_index[(a, b)]] = 1.0
    predicted = x_new @ beta_epi

    designs = pd.DataFrame(
        {
            "variant": held_out["variant"],
            "predicted_log2_activity": predicted,
            "true_log2_activity": held_out["true_log2_activity"].astype(float),
        }
    )
    designs = designs.sort_values(
        ["predicted_log2_activity", "variant"], ascending=[False, True], kind="stable"
    ).reset_index(drop=True)
    designs.to_csv(results_dir / "designs.csv", index=False, lineterminator="\n")

    true_rank = designs.sort_values(
        ["true_log2_activity", "variant"], ascending=[False, True], kind="stable"
    )
    overlap = len(
        set(designs.head(TOP_N_DESIGNS)["variant"]) & set(true_rank.head(TOP_N_DESIGNS)["variant"])
    )

    results = {
        "n_variants": int(n),
        "n_mutations": int(len(mutations)),
        "n_interaction_terms": int(len(pairs)),
        "min_pair_observations": MIN_PAIR_OBSERVATIONS,
        "lambda_additive": lam_add,
        "lambda_epistatic": lam_epi,
        "cv_r2_additive": round(r2_add, 6),
        "cv_r2_epistatic": round(r2_epi, 6),
        "cv_r2_gain_from_epistasis": round(r2_epi - r2_add, 6),
        "spearman_fitted_vs_true_additive": round(float(rho), 6),
        "pearson_fitted_vs_true_additive": round(float(pearson), 6),
        "n_held_out_doubles": int(len(designs)),
        "held_out_pearson": round(
            float(stats.pearsonr(designs["predicted_log2_activity"], designs["true_log2_activity"]).statistic),
            6,
        ),
        "held_out_rmse": round(
            float(np.sqrt(((designs["predicted_log2_activity"] - designs["true_log2_activity"]) ** 2).mean())),
            6,
        ),
        f"top{TOP_N_DESIGNS}_overlap_with_truth": overlap,
        "best_design": {
            "variant": str(designs.loc[0, "variant"]),
            "predicted_log2_activity": round(float(designs.loc[0, "predicted_log2_activity"]), 6),
            "true_log2_activity": round(float(designs.loc[0, "true_log2_activity"]), 6),
        },
    }

    fig, axes = plt.subplots(1, 3, figsize=(14, 4.2))
    pred_add = cv_predictions(design_additive, y, folds, lam_add)
    pred_epi = cv_predictions(design_epistatic, y, folds, lam_epi)
    axes[0].scatter(y, pred_add, s=14, alpha=0.6, label=f"additive (R2={r2_add:.3f})", color="#9aa5b1")
    axes[0].scatter(y, pred_epi, s=14, alpha=0.6, label=f"+epistasis (R2={r2_epi:.3f})", color="#2f6fdb")
    lims = [min(y.min(), pred_add.min()), max(y.max(), pred_add.max())]
    axes[0].plot(lims, lims, color="#333", lw=0.8, ls="--")
    axes[0].set_xlabel("measured log2 activity")
    axes[0].set_ylabel("cross-validated prediction")
    axes[0].set_title("Model comparison")
    axes[0].legend(fontsize=8)

    axes[1].scatter(true_vector, fitted_additive, s=26, color="#2f6fdb")
    blims = [min(true_vector.min(), fitted_additive.min()), max(true_vector.max(), fitted_additive.max())]
    axes[1].plot(blims, blims, color="#333", lw=0.8, ls="--")
    axes[1].set_xlabel("true additive effect")
    axes[1].set_ylabel("fitted effect")
    axes[1].set_title(f"Effect recovery (rho={rho:.3f})")

    axes[2].scatter(
        designs["true_log2_activity"], designs["predicted_log2_activity"], s=18, color="#d1495b"
    )
    axes[2].set_xlabel("true log2 activity")
    axes[2].set_ylabel("predicted")
    axes[2].set_title(f"Held-out doubles (n={len(designs)})")
    fig.suptitle("Simulated enzyme variant landscape (not experimental data)")
    fig.tight_layout()
    fig.savefig(figures_dir / "model_and_designs.png", dpi=150)
    plt.close(fig)

    payload = {
        "example": "enzyme-engineering",
        "seed": SEED,
        "data_is_simulated": True,
        "results": results,
        "metrics": {
            "duration_seconds": round(time.perf_counter() - started, 3),
            "cost_usd": 0.0,
            "cost_note": COST_NOTE,
        },
        "artifacts": [
            "results/designs.csv",
            "results/results.json",
            "figures/model_and_designs.png",
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
        f"{r['n_variants']} variants; CV R2 additive={r['cv_r2_additive']} -> "
        f"epistatic={r['cv_r2_epistatic']}; best design {r['best_design']['variant']}; "
        f"{out['metrics']['duration_seconds']}s"
    )
