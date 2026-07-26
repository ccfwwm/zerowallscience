"""Regenerate `data/` for the immunotherapy example.

The data is SIMULATED, not experimental. These are NOT real patients. No trial,
cohort, registry, hospital, or published dataset is behind these numbers, and no
row corresponds to any person. Nothing here should be read as clinical evidence
about checkpoint inhibitors.

Generative model (logistic response + exponential time-to-event):

  1. Draw covariates independently: age ~ Normal(63, 10) clipped to [30, 88];
     tumor mutational burden ~ LogNormal(log 6, 0.75) mut/Mb; PD-L1 TPS as a
     mixture (40% near 0, 60% U(1, 95)); LDH ratio ~ LogNormal(0, 0.35);
     prior therapy lines ~ {0,1,2,3}; ECOG ~ {0,1,2}; tumor type from a fixed
     3-way split.
  2. Response probability is logistic in those covariates with fixed
     coefficients (`data/simulation_truth.csv`); responders are Bernoulli draws.
  3. Progression-free survival is exponential with a hazard that falls for
     responders and rises with ECOG, LDH and prior lines. Administrative
     censoring at 24 months plus a 7% dropout rate.

Usage:  python generate_data.py [output_dir]
"""

from __future__ import annotations

import pathlib
import sys

import numpy as np

SEED = 20260726

N_PATIENTS = 400
MAX_FOLLOWUP_MONTHS = 24.0
DROPOUT_RATE = 0.07
TUMOR_TYPES = ["cutaneous_melanoma", "nsclc", "renal_cell"]
TUMOR_WEIGHTS = [0.40, 0.35, 0.25]

# Response model on standardized-ish natural units. Kept in one place so the
# truth file and the generator can never disagree.
COEFFS = {
    "intercept": 0.30,
    "log2_tmb": 0.62,
    "pdl1_tps_per_10": 0.21,
    "ldh_ratio": -0.85,
    "prior_lines": -0.34,
    "ecog": -0.55,
    "age_per_10y": -0.28,
}

# Hazard model for progression-free survival (months^-1).
BASE_HAZARD = 0.115
RESPONDER_HAZARD_MULTIPLIER = 0.28


def write_csv(path: pathlib.Path, header: list[str], rows: list[list[str]]) -> None:
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(",".join(header) + "\n")
        for row in rows:
            fh.write(",".join(row) + "\n")


def generate(out_dir: pathlib.Path) -> None:
    rng = np.random.default_rng(SEED)
    data_dir = out_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    n = N_PATIENTS
    age = np.clip(rng.normal(63.0, 10.0, size=n), 30.0, 88.0)
    tmb = np.exp(rng.normal(np.log(6.0), 0.75, size=n))
    high_pdl1 = rng.random(n) > 0.40
    pdl1 = np.where(high_pdl1, rng.uniform(1.0, 95.0, size=n), rng.uniform(0.0, 1.0, size=n))
    ldh = np.exp(rng.normal(0.0, 0.35, size=n))
    prior_lines = rng.choice([0, 1, 2, 3], size=n, p=[0.35, 0.34, 0.21, 0.10])
    ecog = rng.choice([0, 1, 2], size=n, p=[0.45, 0.42, 0.13])
    tumor = rng.choice(len(TUMOR_TYPES), size=n, p=TUMOR_WEIGHTS)

    logit = (
        COEFFS["intercept"]
        + COEFFS["log2_tmb"] * np.log2(np.minimum(tmb, 40.0))
        + COEFFS["pdl1_tps_per_10"] * (pdl1 / 10.0)
        + COEFFS["ldh_ratio"] * ldh
        + COEFFS["prior_lines"] * prior_lines
        + COEFFS["ecog"] * ecog
        + COEFFS["age_per_10y"] * (age / 10.0)
    )
    prob = 1.0 / (1.0 + np.exp(-logit))
    responder = (rng.random(n) < prob).astype(int)

    hazard = (
        BASE_HAZARD
        * np.where(responder == 1, RESPONDER_HAZARD_MULTIPLIER, 1.0)
        * np.exp(0.22 * ecog + 0.30 * (ldh - 1.0) + 0.12 * prior_lines)
    )
    # Exponential draw from a uniform, so the stream stays simple and explicit.
    event_time = -np.log(rng.random(n)) / hazard
    dropout_time = -np.log(rng.random(n)) / (DROPOUT_RATE if DROPOUT_RATE > 0 else 1e9)
    censor_time = np.minimum(dropout_time, MAX_FOLLOWUP_MONTHS)
    observed = np.minimum(event_time, censor_time)
    progressed = (event_time <= censor_time).astype(int)

    best_response = []
    for i in range(n):
        u = rng.random()
        if responder[i] == 1:
            best_response.append("CR" if u < 0.22 else "PR")
        else:
            best_response.append("SD" if u < 0.45 else "PD")

    rows = []
    for i in range(n):
        rows.append(
            [
                f"SIMPT{i + 1:04d}",
                TUMOR_TYPES[int(tumor[i])],
                f"{age[i]:.1f}",
                str(int(ecog[i])),
                str(int(prior_lines[i])),
                f"{tmb[i]:.2f}",
                f"{pdl1[i]:.1f}",
                f"{ldh[i]:.3f}",
                str(int(responder[i])),
                best_response[i],
                f"{observed[i]:.3f}",
                str(int(progressed[i])),
            ]
        )
    write_csv(
        data_dir / "patients.csv",
        [
            "patient_id",
            "tumor_type",
            "age_years",
            "ecog",
            "prior_therapy_lines",
            "tmb_mut_per_mb",
            "pdl1_tps_percent",
            "ldh_ratio_uln",
            "responder",
            "best_response",
            "pfs_months",
            "progressed",
        ],
        rows,
    )

    truth_rows = [["intercept", f"{COEFFS['intercept']:.4f}"]]
    truth_rows += [
        [name, f"{COEFFS[name]:.4f}"] for name in sorted(COEFFS) if name != "intercept"
    ]
    truth_rows.append(["base_hazard_per_month", f"{BASE_HAZARD:.4f}"])
    truth_rows.append(["responder_hazard_multiplier", f"{RESPONDER_HAZARD_MULTIPLIER:.4f}"])
    write_csv(data_dir / "simulation_truth.csv", ["term", "true_value"], truth_rows)


if __name__ == "__main__":
    target = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent
    generate(target)
    print(f"wrote {target / 'data'}")
