"""crispr-screen workflow: guide-level normalization -> gene scores -> hit calling.

Deterministic: the only RNG is seeded, every ordering-sensitive step sorts
first, and matplotlib runs on the Agg backend. Re-running overwrites
`results/` and `figures/` with identical content.

Usage:  python workflow.py [output_dir]
"""

from __future__ import annotations

import json
import pathlib
import sys
import time

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats

SEED = 20260726
FDR_CUTOFF = 0.05
PSEUDOCOUNT = 1.0
NULL_DRAWS = 50_000
NON_TARGETING = "NON_TARGETING"

COST_NOTE = (
    "Runs on the local Python kernel; no model or API calls, so the monetary "
    "cost is zero. Only wall-clock duration is meaningful here."
)


def bh_fdr(pvalues: np.ndarray) -> np.ndarray:
    """Benjamini-Hochberg adjusted p-values (stable sort keeps ties ordered)."""
    p = np.asarray(pvalues, dtype=float)
    n = p.size
    order = np.argsort(p, kind="stable")
    ranked = p[order] * n / np.arange(1, n + 1)
    monotone = np.minimum.accumulate(ranked[::-1])[::-1]
    out = np.empty(n, dtype=float)
    out[order] = np.clip(monotone, 0.0, 1.0)
    return out


def main(out_dir: pathlib.Path) -> dict:
    started = time.perf_counter()
    np.random.seed(SEED)  # nothing here samples, but pin it anyway

    base = pathlib.Path(__file__).resolve().parent
    results_dir = out_dir / "results"
    figures_dir = out_dir / "figures"
    results_dir.mkdir(parents=True, exist_ok=True)
    figures_dir.mkdir(parents=True, exist_ok=True)

    counts = pd.read_csv(base / "data" / "guide_counts.csv")
    counts = counts.sort_values("guide_id", kind="stable").reset_index(drop=True)
    truth = pd.read_csv(base / "data" / "simulation_truth.csv")

    control_cols = sorted(c for c in counts.columns if c.startswith("control_"))
    treated_cols = sorted(c for c in counts.columns if c.startswith("treated_"))

    # Counts per million, then log2 with a pseudocount.
    raw = counts[control_cols + treated_cols].to_numpy(dtype=float)
    cpm = raw / raw.sum(axis=0, keepdims=True) * 1e6
    log_cpm = np.log2(cpm + PSEUDOCOUNT)
    n_ctrl = len(control_cols)
    guide_lfc = log_cpm[:, n_ctrl:].mean(axis=1) - log_cpm[:, :n_ctrl].mean(axis=1)

    frame = pd.DataFrame(
        {"guide_id": counts["guide_id"], "gene": counts["gene"], "guide_lfc": guide_lfc}
    )
    ntc = frame.loc[frame["gene"] == NON_TARGETING, "guide_lfc"].to_numpy()
    # Centre on the non-targeting guides: that is the screen's own null.
    ntc_median = float(np.median(ntc))
    frame["guide_lfc"] = frame["guide_lfc"] - ntc_median
    ntc = ntc - ntc_median

    targets = frame[frame["gene"] != NON_TARGETING]
    genes = sorted(targets["gene"].unique())
    gene_lfc = np.empty(len(genes))
    guides_per_gene = np.empty(len(genes), dtype=int)
    for i, gene in enumerate(genes):
        values = targets.loc[targets["gene"] == gene, "guide_lfc"].to_numpy()
        gene_lfc[i] = values.mean()
        guides_per_gene[i] = values.size

    # Empirical null: what does the mean of k random non-targeting guides look
    # like? A 4-guide Welch t-test has no power when guide efficiency varies,
    # so score genes against the screen's own null instead. Seeded, hence
    # reproducible; two-sided p with the standard +1 correction.
    rng = np.random.default_rng(SEED)
    gene_p = np.empty(len(genes))
    for k in sorted(set(int(v) for v in guides_per_gene)):
        draws = rng.choice(ntc, size=(NULL_DRAWS, k), replace=True).mean(axis=1)
        null = np.sort(np.abs(draws))
        rows = guides_per_gene == k
        extreme = null.size - np.searchsorted(null, np.abs(gene_lfc[rows]), side="left")
        gene_p[rows] = (extreme + 1) / (null.size + 1)

    gene_fdr = bh_fdr(gene_p)
    scores = pd.DataFrame(
        {"gene": genes, "gene_lfc": gene_lfc, "p_value": gene_p, "fdr": gene_fdr}
    )
    truth_lfc = dict(zip(truth["gene"], truth["true_log2_fold_change"]))
    truth_class = dict(zip(truth["gene"], truth["true_class"]))
    scores["true_class"] = [truth_class.get(g, "neutral") for g in scores["gene"]]
    scores["true_log2_fold_change"] = [float(truth_lfc.get(g, 0.0)) for g in scores["gene"]]
    scores["call"] = np.where(
        (scores["fdr"] < FDR_CUTOFF) & (scores["gene_lfc"] < 0),
        "depleted",
        np.where((scores["fdr"] < FDR_CUTOFF) & (scores["gene_lfc"] > 0), "enriched", "none"),
    )
    scores = scores.sort_values(["gene_lfc", "gene"], kind="stable").reset_index(drop=True)
    scores.to_csv(results_dir / "gene_scores.csv", index=False, lineterminator="\n")

    called = scores["call"] != "none"
    is_hit = scores["true_class"] != "neutral"
    depleted_ok = (scores["call"] == "depleted") & (scores["true_class"] == "essential")
    enriched_ok = (scores["call"] == "enriched") & (scores["true_class"] == "resistance")
    n_essential = int((scores["true_class"] == "essential").sum())
    n_resistance = int((scores["true_class"] == "resistance").sum())

    rho = stats.spearmanr(scores["gene_lfc"], scores["true_log2_fold_change"]).statistic
    top = scores.head(5)

    results = {
        "n_guides": int(len(frame)),
        "n_non_targeting_guides": int(len(ntc)),
        "n_genes": int(len(genes)),
        "non_targeting_lfc_sd": round(float(ntc.std(ddof=1)), 6),
        "null_draws_per_guide_count": NULL_DRAWS,
        "n_called_hits": int(called.sum()),
        "n_called_depleted": int((scores["call"] == "depleted").sum()),
        "n_called_enriched": int((scores["call"] == "enriched").sum()),
        "n_true_essential": n_essential,
        "n_true_resistance": n_resistance,
        "recall_essential": round(float(depleted_ok.sum() / n_essential), 6),
        "recall_resistance": round(float(enriched_ok.sum() / n_resistance), 6),
        "precision": round(float((called & is_hit).sum() / called.sum()), 6),
        "n_false_positives": int((called & ~is_hit).sum()),
        "spearman_lfc_vs_truth": round(float(rho), 6),
        "top_depleted_genes": [
            {
                "gene": str(r.gene),
                "gene_lfc": round(float(r.gene_lfc), 6),
                "fdr": round(float(r.fdr), 6),
                "true_class": str(r.true_class),
            }
            for r in top.itertuples()
        ],
    }

    fig, axes = plt.subplots(1, 2, figsize=(11, 4.5))
    colors = scores["true_class"].map(
        {"neutral": "#9aa5b1", "essential": "#2f6fdb", "resistance": "#d1495b"}
    )
    axes[0].scatter(
        scores["gene_lfc"], -np.log10(scores["p_value"]), c=colors, s=18, edgecolors="none"
    )
    axes[0].axhline(
        -np.log10(max(scores.loc[called, "p_value"].max(), 1e-300)) if called.any() else 0,
        color="#333",
        lw=0.8,
        ls="--",
    )
    axes[0].set_xlabel("gene log2 fold change (treated / control)")
    axes[0].set_ylabel("-log10 p")
    axes[0].set_title(f"Volcano (dashed = FDR {FDR_CUTOFF})")

    axes[1].hist(ntc, bins=20, alpha=0.75, label="non-targeting guides", color="#9aa5b1")
    essential_genes = set(scores.loc[scores["true_class"] == "essential", "gene"])
    axes[1].hist(
        targets.loc[targets["gene"].isin(essential_genes), "guide_lfc"],
        bins=20,
        alpha=0.75,
        label="guides in essential genes",
        color="#2f6fdb",
    )
    axes[1].set_xlabel("guide log2 fold change")
    axes[1].set_ylabel("guides")
    axes[1].set_title("Guide-level separation")
    axes[1].legend(fontsize=8)
    fig.suptitle("Simulated pooled CRISPR knockout screen (not experimental data)")
    fig.tight_layout()
    fig.savefig(figures_dir / "volcano.png", dpi=150)
    plt.close(fig)

    payload = {
        "example": "crispr-screen",
        "seed": SEED,
        "data_is_simulated": True,
        "fdr_cutoff": FDR_CUTOFF,
        "results": results,
        "metrics": {
            "duration_seconds": round(time.perf_counter() - started, 3),
            "cost_usd": 0.0,
            "cost_note": COST_NOTE,
        },
        "artifacts": ["results/gene_scores.csv", "results/results.json", "figures/volcano.png"],
    }
    with open(results_dir / "results.json", "w", encoding="utf-8", newline="\n") as fh:
        json.dump(payload, fh, indent=2)
        fh.write("\n")
    return payload


if __name__ == "__main__":
    target = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent
    out = main(target)
    r = out["results"]
    print(
        f"{r['n_genes']} genes, {r['n_called_hits']} hits at FDR<{FDR_CUTOFF}; "
        f"recall essential={r['recall_essential']}, precision={r['precision']}, "
        f"{out['metrics']['duration_seconds']}s"
    )
