"""Regenerate `data/` for the crispr-screen example.

The data is SIMULATED, not experimental. Everything below is drawn from a
single seeded numpy Generator, so re-running this script reproduces the
committed CSVs byte for byte.

Generative model (overdispersed Poisson counts on a pooled knockout library):

  1. Each guide gets a plasmid abundance  a_g ~ LogNormal(0, 0.35).
  2. Each gene gets a true log2 fold change: 0 for neutral genes, a draw from U(-2.2, -0.6)
     for `essential` genes and U(0.5, 1.6) for `resistance` genes.
  3. Each guide gets an efficiency  e_g ~ U(0.30, 1.0); its own effect is
     `gene_lfc * e_g`, so guides within a gene disagree in magnitude.
  4. Control counts ~ Poisson(depth * s_r * a_g * n_g / sum(...)), treated
     counts use `a_g * 2^guide_lfc` instead. `s_r` is a per-replicate depth
     factor and `n_g` a per-observation LogNormal(0, 0.18) overdispersion term,
     so a t-test on the guide-level fold changes has real work to do.

Usage:  python generate_data.py [output_dir]
"""

from __future__ import annotations

import pathlib
import sys

import numpy as np

SEED = 20260726

N_GENES = 300
GUIDES_PER_GENE = 4
N_NON_TARGETING = 40
N_ESSENTIAL = 15
N_RESISTANCE = 8
REPLICATES = 3
LIBRARY_DEPTH = 6_000_000

NON_TARGETING = "NON_TARGETING"


def write_csv(path: pathlib.Path, header: list[str], rows: list[list[str]]) -> None:
    """Write pre-formatted rows with LF endings so bytes never depend on the OS."""
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(",".join(header) + "\n")
        for row in rows:
            fh.write(",".join(row) + "\n")


def generate(out_dir: pathlib.Path) -> None:
    rng = np.random.default_rng(SEED)
    data_dir = out_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    genes = [f"SIMG{i:04d}" for i in range(1, N_GENES + 1)]

    # Planted hits: draw indices, then sort so the truth table is stable.
    picked = rng.choice(N_GENES, size=N_ESSENTIAL + N_RESISTANCE, replace=False)
    essential_idx = sorted(int(i) for i in picked[:N_ESSENTIAL])
    resistance_idx = sorted(int(i) for i in picked[N_ESSENTIAL:])

    true_lfc = np.zeros(N_GENES)
    true_class = ["neutral"] * N_GENES
    for i in essential_idx:
        true_lfc[i] = -rng.uniform(0.6, 2.2)
        true_class[i] = "essential"
    for i in resistance_idx:
        true_lfc[i] = rng.uniform(0.5, 1.6)
        true_class[i] = "resistance"

    # Guide table: targeting guides first (gene order), then non-targeting.
    guide_gene: list[str] = []
    guide_id: list[str] = []
    guide_lfc: list[float] = []
    for i, gene in enumerate(genes):
        for k in range(1, GUIDES_PER_GENE + 1):
            guide_gene.append(gene)
            guide_id.append(f"{gene}_sg{k}")
            guide_lfc.append(true_lfc[i] * rng.uniform(0.30, 1.0))
    for k in range(1, N_NON_TARGETING + 1):
        guide_gene.append(NON_TARGETING)
        guide_id.append(f"NTC_sg{k:02d}")
        guide_lfc.append(0.0)

    n_guides = len(guide_id)
    lfc = np.asarray(guide_lfc)
    abundance = np.exp(rng.normal(0.0, 0.35, size=n_guides))

    depth_factor = rng.uniform(0.85, 1.15, size=2 * REPLICATES)
    control_p = abundance / abundance.sum()
    treated_p = abundance * np.power(2.0, lfc)
    treated_p = treated_p / treated_p.sum()

    columns: dict[str, np.ndarray] = {}
    for arm, probs in (("control", control_p), ("treated", treated_p)):
        for r in range(REPLICATES):
            factor = depth_factor[(0 if arm == "control" else REPLICATES) + r]
            noise = np.exp(rng.normal(0.0, 0.18, size=n_guides))
            mean = LIBRARY_DEPTH * factor * probs * noise
            columns[f"{arm}_r{r + 1}"] = rng.poisson(mean)

    count_names = list(columns.keys())
    rows = [
        [guide_id[i], guide_gene[i]] + [str(int(columns[c][i])) for c in count_names]
        for i in range(n_guides)
    ]
    write_csv(data_dir / "guide_counts.csv", ["guide_id", "gene"] + count_names, rows)

    truth_rows = [
        [genes[i], true_class[i], f"{true_lfc[i]:.4f}"]
        for i in range(N_GENES)
        if true_class[i] != "neutral"
    ]
    truth_rows.sort(key=lambda r: r[0])
    write_csv(
        data_dir / "simulation_truth.csv",
        ["gene", "true_class", "true_log2_fold_change"],
        truth_rows,
    )


if __name__ == "__main__":
    target = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent
    generate(target)
    print(f"wrote {target / 'data'}")
