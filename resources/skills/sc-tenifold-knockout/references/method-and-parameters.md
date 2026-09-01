# Method and parameters

`scTenifoldKnk` builds a single-cell gene regulatory network from a raw counts
matrix, sets the target gene's outdegree edges to zero for the virtual KO, and
compares the WT and KO networks after denoising and manifold alignment. The
official output `diffRegulation` contains `gene`, `distance`, `Z`, `FC`,
`p.value`, and `p.adj`.

Recommended controls for non-tumor analyses:

- Keep the target gene plus a documented feature set; do not silently use a
  normalized matrix.
- Analyze one biologically coherent cell population at a time.
- Use at least two independent seeds and report stability across runs.
- Preserve donor/sample identity; cells from one donor are not independent
  biological replicates.
- Include a negative or non-targeting control when the study design permits it.

Important parameters:

- `gKO`: target gene symbol, which must be present in the matrix.
- `qc_mtThreshold`, `qc_minLSize`: package QC values; report them and inspect
  per-sample loss before applying any external filtering.
- `nc_nNet`, `nc_nCells`: number and size of network subsamples; increase only
  with adequate memory and record runtime.
- `td_K`: tensor decomposition rank; keep it fixed for comparisons unless a
  sensitivity analysis is explicitly reported.
- `seed`: set before every run and record it in the manifest.

Do not interpret a low `p.adj` alone as a causal biological claim. Require
effect-size review, stability, cell-type context, database evidence, and human
review before proposing an experiment.
