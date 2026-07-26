"""extremophile workflow: logistic growth fits -> cardinal temperature model.

Two-stage fit. Stage 1 fits a logistic curve to every strain/temperature/
replicate OD600 series and extracts mu_max. Stage 2 fits the Ratkowsky
square-root model to mu_max against temperature and reports each strain's
cardinal temperatures, then scores them against the known truth.

Deterministic: fixed initial guesses (no random starts), sorted grouping keys,
Agg backend.

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
from scipy.optimize import curve_fit

MIN_OD_FOR_FIT = 0.15  # curves that never get here have nothing to fit
MAX_FEV = 20000

COST_NOTE = (
    "Runs on the local Python kernel; no model or API calls, so the monetary "
    "cost is zero. Only wall-clock duration is meaningful here."
)


def logistic(t: np.ndarray, capacity: float, mu: float, od0: float) -> np.ndarray:
    return capacity / (1.0 + ((capacity - od0) / od0) * np.exp(-mu * t))


def ratkowsky(temp: np.ndarray, b: float, t_min: float, t_max: float, c: float) -> np.ndarray:
    root = b * (temp - t_min) * (1.0 - np.exp(c * (temp - t_max)))
    return np.where(root > 0.0, root**2, 0.0)


def r_squared(y: np.ndarray, pred: np.ndarray) -> float:
    return float(1.0 - ((y - pred) ** 2).sum() / ((y - y.mean()) ** 2).sum())


def main(out_dir: pathlib.Path) -> dict:
    started = time.perf_counter()

    base = pathlib.Path(__file__).resolve().parent
    results_dir = out_dir / "results"
    figures_dir = out_dir / "figures"
    results_dir.mkdir(parents=True, exist_ok=True)
    figures_dir.mkdir(parents=True, exist_ok=True)

    curves = pd.read_csv(base / "data" / "growth_curves.csv")
    curves = curves.sort_values(
        ["strain", "temperature_c", "replicate", "time_h"], kind="stable"
    ).reset_index(drop=True)
    truth = pd.read_csv(base / "data" / "simulation_truth.csv").set_index("strain")

    # Stage 1: per-curve logistic fits.
    fits: list[dict] = []
    skipped = 0
    for (strain, temp, rep), group in curves.groupby(
        ["strain", "temperature_c", "replicate"], sort=True
    ):
        group = group.sort_values("time_h", kind="stable")
        t = group["time_h"].to_numpy(dtype=float)
        od = group["od600"].to_numpy(dtype=float)
        if od.max() < MIN_OD_FOR_FIT:
            skipped += 1
            continue
        try:
            popt, _ = curve_fit(
                logistic,
                t,
                od,
                p0=[max(od.max(), 0.1), 0.3, max(od[0], 0.01)],
                bounds=([0.01, 1e-4, 1e-4], [5.0, 5.0, 1.0]),
                maxfev=MAX_FEV,
            )
        except (RuntimeError, ValueError):
            skipped += 1
            continue
        fits.append(
            {
                "strain": strain,
                "temperature_c": int(temp),
                "replicate": int(rep),
                "capacity_od": float(popt[0]),
                "mu_max_per_h": float(popt[1]),
                "od0": float(popt[2]),
                "fit_r2": r_squared(od, logistic(t, *popt)),
            }
        )

    fit_frame = pd.DataFrame(fits).sort_values(
        ["strain", "temperature_c", "replicate"], kind="stable"
    ).reset_index(drop=True)
    fit_frame.to_csv(results_dir / "growth_rate_fits.csv", index=False, lineterminator="\n")

    # Stage 2: cardinal temperature model per strain.
    per_strain: dict[str, dict] = {}
    cardinal_params: dict[str, list[float]] = {}
    summaries: list[pd.DataFrame] = []
    for strain in sorted(fit_frame["strain"].unique()):
        subset = fit_frame[fit_frame["strain"] == strain]
        summary = (
            subset.groupby("temperature_c", sort=True)["mu_max_per_h"]
            .agg(["mean", "std", "count"])
            .reset_index()
        )
        summary.insert(0, "strain", strain)
        summaries.append(summary)

        temps = summary["temperature_c"].to_numpy(dtype=float)
        mus = summary["mean"].to_numpy(dtype=float)
        popt, _ = curve_fit(
            ratkowsky,
            temps,
            mus,
            p0=[0.02, temps.min() - 10.0, temps.max() + 10.0, 0.4],
            bounds=([1e-4, 0.0, temps.max(), 0.01], [1.0, temps.min(), 150.0, 5.0]),
            maxfev=MAX_FEV,
        )
        b, t_min, t_max, c = (float(v) for v in popt)
        cardinal_params[strain] = [b, t_min, t_max, c]
        grid = np.arange(t_min, t_max + 0.01, 0.01)
        mu_grid = ratkowsky(grid, b, t_min, t_max, c)
        best = int(np.argmax(mu_grid))
        t_opt, mu_opt = float(grid[best]), float(mu_grid[best])

        per_strain[strain] = {
            "n_temperatures_fitted": int(len(summary)),
            "t_min_c": round(t_min, 4),
            "t_opt_c": round(t_opt, 4),
            "t_max_c": round(t_max, 4),
            "mu_max_per_h": round(mu_opt, 6),
            "cardinal_fit_r2": round(r_squared(mus, ratkowsky(temps, *popt)), 6),
            "t_opt_abs_error_c": round(abs(t_opt - float(truth.loc[strain, "true_t_opt_c"])), 4),
            "t_max_abs_error_c": round(abs(t_max - float(truth.loc[strain, "true_t_max_c"])), 4),
            "mu_max_abs_error_per_h": round(
                abs(mu_opt - float(truth.loc[strain, "true_mu_max_per_h"])), 6
            ),
        }

    pd.concat(summaries, ignore_index=True).rename(
        columns={"mean": "mu_max_mean", "std": "mu_max_sd", "count": "n_replicates"}
    ).to_csv(results_dir / "mu_by_temperature.csv", index=False, lineterminator="\n")

    results = {
        "n_readings": int(len(curves)),
        "n_curves_total": int(len(curves) // len(sorted(curves["time_h"].unique()))),
        "n_curves_fitted": int(len(fit_frame)),
        "n_curves_skipped_low_od": int(skipped),
        "min_od_for_fit": MIN_OD_FOR_FIT,
        "median_logistic_fit_r2": round(float(fit_frame["fit_r2"].median()), 6),
        "strains": {k: per_strain[k] for k in sorted(per_strain)},
        "max_t_opt_abs_error_c": round(
            max(v["t_opt_abs_error_c"] for v in per_strain.values()), 4
        ),
    }

    fig, axes = plt.subplots(1, 2, figsize=(11, 4.4))
    palette = ["#2f6fdb", "#d1495b", "#3f8f5f", "#b07d2b", "#7a4fb5", "#2b8c9e"]
    strain_names = sorted(curves["strain"].unique())
    show = strain_names[0]
    subset = curves[(curves["strain"] == show) & (curves["replicate"] == 1)]
    for i, temp in enumerate(sorted(subset["temperature_c"].unique())[::2]):
        line = subset[subset["temperature_c"] == temp].sort_values("time_h", kind="stable")
        axes[0].plot(
            line["time_h"], line["od600"], marker="o", ms=3, lw=1.2,
            color=palette[i % len(palette)], label=f"{temp} C",
        )
    axes[0].set_xlabel("time (h)")
    axes[0].set_ylabel("OD600")
    axes[0].set_title(f"{show} growth curves (rep 1)")
    axes[0].legend(fontsize=7, ncol=2)

    for i, strain in enumerate(strain_names):
        summary = fit_frame[fit_frame["strain"] == strain].groupby(
            "temperature_c", sort=True
        )["mu_max_per_h"].mean()
        color = palette[i % len(palette)]
        axes[1].scatter(summary.index, summary.to_numpy(), color=color, s=26, label=strain)
        p = per_strain[strain]
        grid = np.linspace(p["t_min_c"], p["t_max_c"], 400)
        axes[1].plot(grid, ratkowsky(grid, *cardinal_params[strain]), color=color, lw=1.4)
        axes[1].axvline(p["t_opt_c"], color=color, ls=":", lw=1.0)
    axes[1].set_xlabel("temperature (C)")
    axes[1].set_ylabel("mu_max (1/h)")
    axes[1].set_title("Cardinal temperature model")
    axes[1].legend(fontsize=8)
    fig.suptitle("Simulated thermophile growth (not experimental data)")
    fig.tight_layout()
    fig.savefig(figures_dir / "growth_and_cardinal.png", dpi=150)
    plt.close(fig)

    payload = {
        "example": "extremophile",
        "seed": 20260726,
        "data_is_simulated": True,
        "results": results,
        "metrics": {
            "duration_seconds": round(time.perf_counter() - started, 3),
            "cost_usd": 0.0,
            "cost_note": COST_NOTE,
        },
        "artifacts": [
            "results/growth_rate_fits.csv",
            "results/mu_by_temperature.csv",
            "results/results.json",
            "figures/growth_and_cardinal.png",
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
    for name, s in r["strains"].items():
        print(f"{name}: Topt={s['t_opt_c']} C (error {s['t_opt_abs_error_c']}), R2={s['cardinal_fit_r2']}")
    print(f"{r['n_curves_fitted']} curves fitted, {r['n_curves_skipped_low_od']} skipped, {out['metrics']['duration_seconds']}s")
