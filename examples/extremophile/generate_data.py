"""Regenerate `data/` for the extremophile example.

The data is SIMULATED, not experimental. The two "strains" are inventions with
placeholder names; no culture collection, isolate, or published growth study is
behind these numbers.

Generative model (logistic growth with a temperature-dependent rate):

  1. Each strain has Ratkowsky square-root cardinal parameters
     (b, Tmin, Tmax, c). Its maximum growth rate at temperature T is
        mu(T) = [b (T - Tmin) (1 - exp(c (T - Tmax)))]^2,   clipped at 0.
  2. OD600 follows logistic growth from OD0 to a carrying capacity K that
     shrinks as mu falls:  OD(t) = K / (1 + ((K - OD0)/OD0) exp(-mu t)).
  3. Each reading gets multiplicative LogNormal(0, 0.05) biological noise and
     additive Normal(0, 0.004) reader noise, floored at the blank.

Each strain is assayed over its own temperature block. The coldest and hottest
wells grow too little to fit, which is what the workflow's per-curve quality gate
is for.

Usage:  python generate_data.py [output_dir]
"""

from __future__ import annotations

import pathlib
import sys

import numpy as np

SEED = 20260726

TIME_POINTS = list(range(0, 31))  # hourly OD600 readings, 0-30 h
REPLICATES = 3
OD0 = 0.02
BLANK = 0.005

# Each strain is assayed over its own temperature block, the way a real plate
# would be laid out: covering the viable range plus edge points that fail.
# name -> (b, Tmin, Tmax, c, K_max, temperatures)
STRAINS = {
    "ZW-THERM-01": (
        0.0280, 32.0, 79.0, 0.42, 1.15,
        [40, 45, 50, 55, 58, 61, 64, 67, 70, 73, 76, 79, 82],
    ),
    "ZW-HYPER-02": (
        0.0215, 55.0, 97.0, 0.38, 0.95,
        [60, 65, 70, 75, 78, 81, 84, 87, 90, 93, 96, 99],
    ),
}


def write_csv(path: pathlib.Path, header: list[str], rows: list[list[str]]) -> None:
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(",".join(header) + "\n")
        for row in rows:
            fh.write(",".join(row) + "\n")


def ratkowsky(temp: np.ndarray | float, b: float, t_min: float, t_max: float, c: float) -> np.ndarray:
    root = b * (np.asarray(temp, dtype=float) - t_min) * (1.0 - np.exp(c * (np.asarray(temp, dtype=float) - t_max)))
    return np.where(root > 0.0, root**2, 0.0)


def optimum(b: float, t_min: float, t_max: float, c: float) -> tuple[float, float]:
    """Topt by fine grid search — deterministic and good to 0.01 degrees."""
    grid = np.arange(t_min, t_max + 0.01, 0.01)
    mu = ratkowsky(grid, b, t_min, t_max, c)
    i = int(np.argmax(mu))
    return float(grid[i]), float(mu[i])


def generate(out_dir: pathlib.Path) -> None:
    rng = np.random.default_rng(SEED)
    data_dir = out_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    rows: list[list[str]] = []
    for strain in sorted(STRAINS):
        b, t_min, t_max, c, k_max, temperatures = STRAINS[strain]
        _, mu_peak = optimum(b, t_min, t_max, c)
        for temp in temperatures:
            mu = float(ratkowsky(temp, b, t_min, t_max, c))
            # Carrying capacity tracks how happy the culture is.
            capacity = 0.06 + (k_max - 0.06) * (mu / mu_peak if mu_peak > 0 else 0.0)
            for rep in range(1, REPLICATES + 1):
                for t in TIME_POINTS:
                    if mu <= 0.0:
                        od = OD0
                    else:
                        od = capacity / (1.0 + ((capacity - OD0) / OD0) * np.exp(-mu * t))
                    od *= float(np.exp(rng.normal(0.0, 0.05)))
                    od += float(rng.normal(0.0, 0.004))
                    rows.append(
                        [strain, str(temp), str(rep), str(t), f"{max(od, BLANK):.4f}"]
                    )
    write_csv(
        data_dir / "growth_curves.csv",
        ["strain", "temperature_c", "replicate", "time_h", "od600"],
        rows,
    )

    truth_rows = []
    for strain in sorted(STRAINS):
        b, t_min, t_max, c, _, _ = STRAINS[strain]
        t_opt, mu_opt = optimum(b, t_min, t_max, c)
        truth_rows.append(
            [strain, f"{t_min:.2f}", f"{t_opt:.2f}", f"{t_max:.2f}", f"{mu_opt:.6f}", f"{b:.4f}", f"{c:.4f}"]
        )
    write_csv(
        data_dir / "simulation_truth.csv",
        ["strain", "true_t_min_c", "true_t_opt_c", "true_t_max_c", "true_mu_max_per_h", "true_b", "true_c"],
        truth_rows,
    )


if __name__ == "__main__":
    target = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent
    generate(target)
    print(f"wrote {target / 'data'}")
