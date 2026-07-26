# CRISPR screen — pooled knockout hit calling

**The data in this example is simulated, not experimental.** No cell line,
accession, lab, or published screen is behind these numbers. `generate_data.py`
draws every count from a seeded generator, so the point of the example is the
analysis — normalization, an empirical null, FDR control, and a hit list you can
score against a known answer.

A pooled knockout screen is a good end-to-end workload: it is a real statistical
problem (thousands of noisy guide-level measurements, a handful of true hits),
it finishes in under a second, and because the planted effects are known you can
check the pipeline instead of only admiring its output.

## Data

`data/guide_counts.csv` — 1240 guides × 6 sequencing libraries.

- Columns: `guide_id`, `gene`, then `control_r1..r3` and `treated_r1..r3` raw
  read counts. 300 target genes at 4 guides each, plus 40 non-targeting
  controls (`gene == NON_TARGETING`), which are the screen's null.
- Generative model, seed `20260726`: guide abundance `a ~ LogNormal(0, 0.35)`;
  a true per-gene log2 fold change (0 for neutral genes, `U(-2.2, -0.6)` for 15
  `essential` genes, `U(0.5, 1.6)` for 8 `resistance` genes); per-guide
  efficiency `e ~ U(0.30, 1.0)` scaling that effect, so guides within a gene
  disagree; counts `~ Poisson` at 6M reads per library with a per-replicate
  depth factor and a `LogNormal(0, 0.18)` overdispersion term.
- `data/simulation_truth.csv` — the planted genes and their true fold changes.
  This is the answer key, not an observation. Real screens do not ship one.

## Suggested workflow

1. Normalize counts to CPM, log2 with a pseudocount, and take each guide's
   treated-minus-control fold change. Centre on the non-targeting median.
2. Score genes by their mean guide fold change. Test them against an empirical
   null built by resampling non-targeting guides — a 4-guide t-test has no power
   once guide efficiency varies, which is why real screens do it this way.
3. Apply Benjamini-Hochberg, call hits at FDR < 0.05, and report recall and
   precision against `simulation_truth.csv`.
4. Save a volcano plot and a gene score table with every number from code.

## Reproduce

```bash
python generate_data.py    # rewrites data/ byte-identically from the seed
python workflow.py         # writes results/ and figures/
```

`baseline/results.json` holds the golden numbers and the measured runtime.
`python scripts/verify-examples.py` from the repo root checks this example
against it.
