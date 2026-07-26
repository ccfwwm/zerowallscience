# Immunotherapy response — biomarker model and survival split

**The data in this example is simulated. These are not real patients.** No
trial, cohort, registry, hospital, or published dataset is behind these numbers,
and no row corresponds to any person. Nothing here is clinical evidence about
checkpoint inhibitors, and none of it should inform a treatment decision.
`generate_data.py` draws every value from a seeded generator.

What the example is actually for: a response model plus a time-to-event analysis
is the standard shape of a translational oncology dataset, and it exercises
logistic regression, cross-validated AUC, Kaplan-Meier estimation, and a
log-rank test — implemented directly on numpy and scipy, no extra dependencies.

## Data

`data/patients.csv` — 400 simulated patients, one row each.

- Columns: `patient_id`, `tumor_type`, `age_years`, `ecog`,
  `prior_therapy_lines`, `tmb_mut_per_mb`, `pdl1_tps_percent`,
  `ldh_ratio_uln`, `responder`, `best_response` (CR/PR/SD/PD), `pfs_months`,
  `progressed` (1 = event, 0 = censored).
- Generative model, seed `20260726`: covariates drawn independently (age
  `Normal(63, 10)`; TMB `LogNormal(log 6, 0.75)`; PD-L1 TPS as a 40/60 mixture
  of near-zero and `U(1, 95)`; LDH `LogNormal(0, 0.35)`). Response is a
  Bernoulli draw from a logistic model with the fixed coefficients in
  `data/simulation_truth.csv`. Progression-free survival is exponential with a
  hazard that falls to 0.28x for responders and rises with ECOG, LDH, and prior
  lines, then administrative censoring at 24 months plus 7% dropout.
- `data/simulation_truth.csv` — the true coefficients. An answer key, not an
  observation.

## Suggested workflow

1. Fit logistic regression (IRLS) for response on log2 TMB, PD-L1, LDH, prior
   lines, ECOG, and age. Report odds ratios and 5-fold cross-validated ROC AUC.
2. Compare fitted coefficients against `simulation_truth.csv`. They correlate at
   about 0.94, but individual terms are noisy — age and prior lines are only
   weakly identified at n = 400. That is the honest result at this sample size,
   not a bug to tune away.
3. Split the cohort at the median **out-of-fold** response score and compare
   progression-free survival with Kaplan-Meier curves and a log-rank test. Using
   out-of-fold scores matters: ranking patients with a model that saw them
   inflates the separation.
4. Repeat the split on TMB alone for contrast. It still separates the curves
   (p = 0.027), but far less sharply than the full model (p = 3.8e-07) — a
   single marker carries part of the signal, not all of it.

## Reproduce

```bash
python generate_data.py    # rewrites data/ byte-identically from the seed
python workflow.py         # writes results/ and figures/
```

`baseline/results.json` holds the golden numbers and the measured runtime.
`python scripts/verify-examples.py` from the repo root checks this example
against it.
