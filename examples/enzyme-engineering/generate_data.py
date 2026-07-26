"""Regenerate `data/` for the enzyme-engineering example.

The data is SIMULATED, not experimental. No real enzyme, PDB entry, or
published variant library is behind these numbers — the "positions" are indices
into an imaginary 240-residue protein.

Generative model (structure-free additive + pairwise epistatic landscape):

  1. 20 candidate substitutions at distinct positions. Each gets an additive
     effect  b_i ~ Normal(0, 0.55)  on log2 activity relative to wild type.
  2. 45 of the 190 position pairs get an epistatic term
     g_ij ~ Normal(0, 0.95), so the landscape is not a straight line.
  3. A variant's true log2 activity is  sum(b_i) + sum(g_ij over present pairs).
  4. Each variant is measured in 3 replicates with Normal(0, 0.18) assay noise.

The library is deliberately incomplete: only 120 of the 190 possible double
mutants are measured, which leaves the rest as a genuine prediction target.

Usage:  python generate_data.py [output_dir]
"""

from __future__ import annotations

import itertools
import pathlib
import sys

import numpy as np

SEED = 20260726

N_POSITIONS = 20
N_EPISTATIC_PAIRS = 45
N_DOUBLES = 120
N_TRIPLES = 200
N_QUADS = 110
REPLICATES = 3
ASSAY_SD = 0.18
AMINO_ACIDS = "ACDEFGHIKLMNPQRSTVWY"


def write_csv(path: pathlib.Path, header: list[str], rows: list[list[str]]) -> None:
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(",".join(header) + "\n")
        for row in rows:
            fh.write(",".join(row) + "\n")


def generate(out_dir: pathlib.Path) -> None:
    rng = np.random.default_rng(SEED)
    data_dir = out_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    positions = sorted(int(p) for p in rng.choice(np.arange(12, 232), size=N_POSITIONS, replace=False))
    wt_aa = [AMINO_ACIDS[i] for i in rng.integers(0, 20, size=N_POSITIONS)]
    mut_aa = []
    for i in range(N_POSITIONS):
        choice = AMINO_ACIDS[int(rng.integers(0, 20))]
        while choice == wt_aa[i]:
            choice = AMINO_ACIDS[int(rng.integers(0, 20))]
        mut_aa.append(choice)
    labels = [f"{wt_aa[i]}{positions[i]}{mut_aa[i]}" for i in range(N_POSITIONS)]

    additive = rng.normal(0.0, 0.55, size=N_POSITIONS)

    all_pairs = list(itertools.combinations(range(N_POSITIONS), 2))
    pair_idx = sorted(int(i) for i in rng.choice(len(all_pairs), size=N_EPISTATIC_PAIRS, replace=False))
    epistasis = {all_pairs[i]: float(v) for i, v in zip(pair_idx, rng.normal(0.0, 0.95, size=N_EPISTATIC_PAIRS))}

    def true_activity(mutations: tuple[int, ...]) -> float:
        value = float(additive[list(mutations)].sum())
        for a, b in itertools.combinations(sorted(mutations), 2):
            value += epistasis.get((a, b), 0.0)
        return value

    # Variant set: wild type, all singles, a subset of doubles, some higher orders.
    variants: list[tuple[int, ...]] = [()]
    variants += [(i,) for i in range(N_POSITIONS)]

    double_pick = sorted(int(i) for i in rng.choice(len(all_pairs), size=N_DOUBLES, replace=False))
    measured_doubles = [all_pairs[i] for i in double_pick]
    variants += measured_doubles

    seen: set[tuple[int, ...]] = set()
    for order, count in ((3, N_TRIPLES), (4, N_QUADS)):
        added = 0
        while added < count:
            combo = tuple(sorted(int(x) for x in rng.choice(N_POSITIONS, size=order, replace=False)))
            if combo in seen:
                continue
            seen.add(combo)
            variants.append(combo)
            added += 1

    rows: list[list[str]] = []
    for mutations in variants:
        name = "WT" if not mutations else "+".join(labels[i] for i in mutations)
        truth = true_activity(mutations)
        measured = truth + rng.normal(0.0, ASSAY_SD, size=REPLICATES)
        rows.append(
            [
                name,
                str(len(mutations)),
                ";".join(labels[i] for i in mutations) if mutations else "none",
                *[f"{v:.4f}" for v in measured],
            ]
        )
    rows.sort(key=lambda r: (int(r[1]), r[0]))
    write_csv(
        data_dir / "variant_activity.csv",
        ["variant", "n_mutations", "mutations", "rep1_log2_activity", "rep2_log2_activity", "rep3_log2_activity"],
        rows,
    )

    truth_rows = [["additive", labels[i], "", f"{additive[i]:.4f}"] for i in range(N_POSITIONS)]
    truth_rows += [
        ["epistatic", labels[a], labels[b], f"{epistasis[(a, b)]:.4f}"]
        for (a, b) in sorted(epistasis)
    ]
    write_csv(
        data_dir / "simulation_truth.csv",
        ["term_type", "mutation_a", "mutation_b", "true_effect_log2"],
        truth_rows,
    )

    # Held-out prediction target: the doubles nobody measured.
    unmeasured = [p for p in all_pairs if p not in set(measured_doubles)]
    held_rows = [
        [f"{labels[a]}+{labels[b]}", labels[a], labels[b], f"{true_activity((a, b)):.4f}"]
        for a, b in unmeasured
    ]
    held_rows.sort(key=lambda r: r[0])
    write_csv(
        data_dir / "held_out_doubles_truth.csv",
        ["variant", "mutation_a", "mutation_b", "true_log2_activity"],
        held_rows,
    )


if __name__ == "__main__":
    target = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent
    generate(target)
    print(f"wrote {target / 'data'}")
