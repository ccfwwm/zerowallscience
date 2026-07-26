# Extremophile growth — cardinal temperatures from OD600 curves

**The data in this example is simulated, not experimental.** The two strains are
inventions with placeholder names; no culture collection, isolate, accession, or
published growth study is behind these numbers. `generate_data.py` draws every
reading from a seeded generator.

The workload is a two-stage curve fit, which is where a lot of real microbial
physiology lives: fit growth curves to get a rate, then fit a temperature model
to the rates. It exercises `scipy.optimize`, a per-curve quality gate, and
error propagation across two fitting stages.

## Data

`data/growth_curves.csv` — 2325 OD600 readings.

- Columns: `strain`, `temperature_c`, `replicate`, `time_h`, `od600`. Two
  strains, each assayed over its own temperature block (13 and 12 setpoints),
  3 replicates, hourly readings from 0 to 30 h. Blank is 0.005.
- Generative model, seed `20260726`: each strain has Ratkowsky square-root
  cardinal parameters, giving `mu(T) = [b (T - Tmin)(1 - exp(c (T - Tmax)))]^2`.
  OD follows logistic growth from OD0 = 0.02 to a carrying capacity that shrinks
  as `mu` falls. Each reading gets `LogNormal(0, 0.05)` biological noise and
  `Normal(0, 0.004)` reader noise.
- The coldest and hottest wells barely grow — 21 of the 75 curves never reach
  OD 0.15 and are legitimately unfittable. That is deliberate.
- `data/simulation_truth.csv` — the true cardinal parameters. An answer key, not
  an observation.

## Suggested workflow

1. Fit a logistic model to every strain/temperature/replicate series and pull
   out `mu_max`. Skip curves that never clear OD 0.15 and report how many.
2. Average `mu_max` across replicates per temperature, then fit the Ratkowsky
   square-root model per strain to get Tmin, Topt, Tmax.
3. Compare recovered Topt against `simulation_truth.csv`. Both strains land
   within 0.2 C here, so the pipeline is doing what it claims.
4. Plot the growth curves and the `mu` vs temperature fit side by side.

## Reproduce

```bash
python generate_data.py    # rewrites data/ byte-identically from the seed
python workflow.py         # writes results/ and figures/
```

`baseline/results.json` holds the golden numbers and the measured runtime.
`python scripts/verify-examples.py` from the repo root checks this example
against it.
