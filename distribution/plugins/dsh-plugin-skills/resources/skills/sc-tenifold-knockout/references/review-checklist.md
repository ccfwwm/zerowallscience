# Review checklist

## Data

- [ ] Counts are raw, non-negative, integer-like values.
- [ ] Genes are rows, cells are columns, and gene identifiers are unique.
- [ ] The target gene exists with a documented expression fraction.
- [ ] Sample, donor, condition, and cell-type fields are present or explicitly
      unavailable.
- [ ] Non-tumor selection and any malignant-cell exclusion are documented.
- [ ] QC was inspected per sample and filtering is reversible.

## Computation

- [ ] `scTenifoldKnk` and dependency versions are recorded in `session-info.txt`.
- [ ] Parameters, seed, input checksum, and execution context are recorded.
- [ ] WT/KO networks and differential table are non-empty and parseable.
- [ ] Multiple seeds/subsamples or an explicit exploratory limitation are shown.
- [ ] Warnings and failed strata are retained in the review artifact.

## Biology and manuscript

- [ ] Gene/pathway statements were checked with license-clear public sources.
- [ ] Text distinguishes virtual network perturbation from real gene editing.
- [ ] Figures have matching source tables and provenance.
- [ ] No result is described as experimentally validated without wet-lab data.
- [ ] Limitations, replication, batch effects, and alternative explanations are
      included.

## Experimental follow-up

- [ ] Candidate ranking is based on stability and effect size, not p-value alone.
- [ ] Controls, biological replicates, randomization, readouts, and acceptance
      criteria are specified.
- [ ] A qualified scientist approves the protocol and biosafety assessment.
