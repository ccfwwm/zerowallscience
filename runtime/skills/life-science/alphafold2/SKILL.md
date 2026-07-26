---
name: alphafold2
description: >
  Protein structure prediction using AlphaFold2 (Jumper et al. 2021, Nature).
  Reach for this skill to predict 3D protein structure from amino acid sequence,
  to validate designed sequences, or to generate structural templates for
  downstream modeling tasks.
license: Apache-2.0
category: biomodels
requirements: [gpu]
metadata:
  third_party:
    - kind: weights
      name: AlphaFold2
      license: Apache-2.0
      terms_url: https://github.com/deepmind/alphafold/blob/main/LICENSE
    - kind: service
      name: ColabFold MSA server (api.colabfold.com)
      provider: Steinegger Lab
      info_url: https://github.com/sokrypton/ColabFold/wiki
---

# AlphaFold2

AlphaFold2 is the landmark neural network that revolutionized protein structure
prediction (Jumper et al. 2021, Nature). It predicts 3D atomic coordinates from
amino acid sequence with experimental-level accuracy for most single-domain
proteins. Use this skill when you need high-confidence structure predictions for
protein engineering, functional annotation, or structural biology workflows.

## Running it

```bash
# Basic prediction from FASTA
alphafold --fasta_paths=protein.fasta --output_dir=output/ --model_preset=monomer

# Multimer prediction
alphafold --fasta_paths=complex.fasta --output_dir=output/ --model_preset=multimer
```

Input: FASTA file with one or more protein sequences.
Output: PDB structures, confidence scores (pLDDT, pTM), MSA coverage, and PAE matrices.

## Model presets

- `monomer` — single-chain prediction (default)
- `monomer_casp14` — CASP14-era weights (legacy)
- `monomer_ptm` — includes predicted TM-score and PAE
- `multimer` — protein complex prediction (2+ chains)

For most use cases, use `monomer_ptm` for single chains and `multimer` for complexes.

## Interpreting confidence scores

- **pLDDT** (per-residue confidence): >90 = very high, 70-90 = confident, 50-70 = low, <50 = very low
- **pTM** (predicted TM-score): >0.5 indicates a likely correct fold
- **PAE** (predicted aligned error): Lower is better; shows domain boundaries and interaction confidence

## MSA generation

AlphaFold2 requires multiple sequence alignments (MSAs) for accurate predictions.
By default, it searches sequence databases (UniRef90, MGnify, BFD) to build MSAs.
For faster predictions, use ColabFold's MSA server with `--use_msa_server` or
pre-computed MSAs.

## Common issues

| Issue | Solution |
|---|---|
| Out of memory | Reduce `--max_template_date` or use `monomer_ptm` instead of full pipeline |
| Slow MSA search | Use `--use_precomputed_msas` or ColabFold's MSA server |
| Low confidence | Check MSA depth; proteins with few homologs predict poorly |
| Multimer fails | Ensure FASTA has multiple `>` entries; check stoichiometry |

## When to use alternatives

- **For speed without MSAs**: Use `esmfold2` (no MSA search, ~60× faster)
- **For protein-RNA-DNA-ligand complexes**: Use `chai1` or `boltz`
- **For open-source AlphaFold3 alternative**: Use `openfold3`
- **For protein-ligand docking**: Use `diffdock` after structure prediction

---

**Next:** Validate structures with Molprobity, visualize with PyMOL, or use as
templates for molecular dynamics or protein design.
