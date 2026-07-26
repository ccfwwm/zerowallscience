# Enzyme engineering — fitting an epistatic activity landscape

**The data in this example is simulated, not experimental.** There is no real
enzyme, PDB entry, assay, or published variant library behind these numbers. The
"positions" are indices into an imaginary 240-residue protein.
`generate_data.py` draws every measurement from a seeded generator.

The scientific question is one directed evolution actually faces: given a partly
measured variant library, does an additive model of mutation effects predict
activity, or do you need pairwise epistasis? Here you can answer it and then
check the answer, because the true effects are known.

## Data

`data/variant_activity.csv` — 451 variants × 3 replicate measurements.

- Columns: `variant` (e.g. `N82P+T228G`, or `WT`), `n_mutations`, `mutations`
  (semicolon-separated), and `rep1..rep3_log2_activity` — log2 activity relative
  to wild type.
- Composition: wild type, all 20 single mutants, 120 of the 190 possible double
  mutants, 200 triples, 110 quadruples. The 70 unmeasured doubles are the
  prediction target.
- Generative model, seed `20260726`: additive effects `b ~ Normal(0, 0.55)` per
  substitution; 45 of the 190 position pairs carry an epistatic term
  `g ~ Normal(0, 0.95)`; true log2 activity is `sum(b) + sum(g)` over the
  mutations present; each replicate adds `Normal(0, 0.18)` assay noise.
- `data/simulation_truth.csv` — the true additive and epistatic terms.
  `data/held_out_doubles_truth.csv` — true activity for the 70 unmeasured
  doubles. Both are answer keys, not observations.

## Suggested workflow

1. One-hot encode the mutations and fit a ridge regression on replicate-mean
   log2 activity, choosing the penalty by 5-fold cross-validated R2.
2. Add interaction columns for pairs observed at least 5 times and refit. The
   difference in cross-validated R2 is the evidence for epistasis — it is worth
   about +0.32 here, so the additive model is genuinely insufficient.
3. Check the fitted additive effects against `simulation_truth.csv` (Spearman)
   to confirm the model recovered the mechanism, not just the fit.
4. Score all 70 unmeasured doubles, rank them as design candidates, and report
   how many of the true top 10 the model found.

## Reproduce

```bash
python generate_data.py    # rewrites data/ byte-identically from the seed
python workflow.py         # writes results/ and figures/
```

`baseline/results.json` holds the golden numbers and the measured runtime.
`python scripts/verify-examples.py` from the repo root checks this example
against it.
