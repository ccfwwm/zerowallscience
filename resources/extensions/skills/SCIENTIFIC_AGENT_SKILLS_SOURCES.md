# Scientific Agent Skills source snapshot

ZeroWall Science vendors a selected, adapted snapshot of
[`K-Dense-AI/scientific-agent-skills`](https://github.com/K-Dense-AI/scientific-agent-skills):

- Upstream version: `2.63.0`
- Upstream commit: `13385c7c4db02fdcc84a020752c07cce91ef780e`
- Upstream license: MIT, Copyright 2025 K-Dense Inc.
- Imported packages: 129
- Layout: `skills/<name>/SKILL.md`, with upstream scripts, references, assets,
  templates, and per-package license files retained where present

The imported package names are:

```text
adaptyv, aeon, analytical-method-validation, anndata, arboreto, astropy,
benchling-integration, bids, biopython, bioservices, bulk-rnaseq,
cellxgene-census, cirq, clinical-decision-support, clinical-reports, cobrapy,
dask, datamol, deepchem, deepspot-m, deeptools, depmap, dnanexus-integration,
esm, etetoolkit, experimental-design, exploratory-data-analysis, flowio,
fluidsim, geniml, genomic-coordinates, genomic-intelligence, geomaster,
geopandas, gget, ginkgo-cloud-lab, glycoengineering, gtars, histolab,
hugging-science, hypogenic, hypothesis-generation, imaging-data-commons,
iso-standards-readiness, labarchive-integration, lamindb,
latchbio-integration, latex-posters, liteparse, markdown-mermaid-writing,
markitdown, matchms, matlab, matplotlib, medchem, molecular-dynamics, molfeat,
ncats-arax, networkx, neurokit2, neuropixels-analysis, nextflow,
omero-integration, onekgpd, ontology-term-resolution, open-notebook, openpiv,
opentrons-integration, optimize-for-gpu, pacsomatic, pathml,
pathogen-variant-surveillance, pathway-enrichment, peer-review, pennylane,
phylogenetics, pkpd-modeling, polars, polars-bio, primekg,
protocolsio-integration, pufferlib, pydeseq2, pydicom, pyhealth, pylabrobot,
pymatgen, pymc, pymoo, pyopenms, pysam, pytdc, pytorch-lightning, pyzotero,
qiskit, qutip, rdkit, relsa-severity-assessment, research-grants, rowan,
scanpy, scholar-evaluation, scientific-brainstorming,
scientific-critical-thinking, scikit-bio, scikit-learn, scikit-survival,
scvelo, seaborn, shap, simpy, stable-baselines3, statistical-analysis,
statistical-power, statsmodels, sympy, tamarind, tiledbvcf,
timesfm-forecasting, torch-geometric, torchdrug, transformers,
treatment-plans, umap-learn, uncertainty-and-units, usfiscaldata, vaex,
venue-templates, zarr-python
```

The following upstream packages are intentionally not imported:

```text
arbor, autoskill, bgpt-paper-search, citation-management,
consciousness-council, database-lookup, dhdna-profiler, docx, exa-search,
generate-image, get-available-resources, infographics, market-research-reports,
modal, paper-lookup, paperclip, paperzilla, parallel-web, pdf, pi-agent, pptx,
pptx-posters, research-lookup, scientific-schematics, scientific-slides,
scientific-visualization, scientific-writing, what-if-oracle, xlsx
```

`diffdock`, `literature-review`, and `scvi-tools` also exist upstream, but the
existing ZeroWall-adapted packages remain authoritative and were not replaced.

## Adaptation boundary

ZeroWall metadata and execution contracts were added to each imported
`SKILL.md`. Host-specific tool names and cross-skill references were mapped to
the current ZeroWall tools and bundled workflows. Credentials use the existing
Settings/Keyring path, long-running work uses ExecutionContext and Run Manager,
and external writes or equipment actions remain approval-gated. No upstream
plugin manifest, MCP configuration, repository-level test harness, runtime, or
model weights are included.

License fields inside individual skills often describe the scientific package,
service, dataset, or model used by that workflow. Those dependencies and data
remain under their own terms and are not redistributed merely because their
usage is documented here.
