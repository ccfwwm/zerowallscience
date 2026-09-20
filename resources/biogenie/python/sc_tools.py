"""dsh-bio-genie — 单细胞 RNA-seq 质控（scanpy / scverse 最佳实践）

对标依据：anthropics/life-sciences 的 `single-cell-rna-qc` 技能（MAD 过滤 +
完整流水线 vs 模块化积木双路径）。本实现走真实 scanpy 计算，产出可复核的
指标表与图，不做任何近似或占位。

依赖（第二层按需自动安装，见 src/extra-deps.js EXTRA_DEPS.sc_qc）：
  scanpy / anndata / h5py —— 均为 py3-none-any 纯 Python wheel，
  但要求 Python ≥3.12（本插件引导器即 CPython 3.12）。
"""

import os
import json

# 物种 → 基因名前缀（线粒体 / 核糖体 / 血红蛋白），决定 QC 指标计算
GENE_PATTERNS = {
    'human': {'mt': 'MT-', 'ribo': ('RPS', 'RPL'), 'hb': ('^HB[AB]',)},
    'mouse': {'mt': 'mt-', 'ribo': ('Rps', 'Rpl'), 'hb': ('^Hb[ab]',)},
    'zebrafish': {'mt': 'mt-', 'ribo': ('rps', 'rpl'), 'hb': ('^hb[ab]',)},
}


def op_sc_qc(args):
    """单细胞 RNA-seq 质控：指标计算 → MAD 离群过滤 → 出图 → 保存过滤后数据。

    args:
      input_file (str, 必填): .h5ad（AnnData）或 10X Cell Ranger 的 .h5
      output_dir (str): 输出目录（默认工作区 sc_qc/）
      species (str): human | mouse | zebrafish | other（默认 human；决定 MT-/Rps 前缀）
      mad_counts / mad_genes / mad_mt (float): MAD 阈值（默认 5 / 5 / 3）
      min_genes (int): 细胞最少检出基因数（默认 200）
      min_cells (int): 基因最少被检出细胞数（默认 3）
      mt_cap (float): 线粒体比例硬上限（可选，叠加在 MAD 之上）
      apply_filter (bool): 是否保存过滤后的 h5ad（默认 True）
      make_plots (bool): 是否输出图（默认 True）
      max_cells (int): 细胞数上限保护，超出随机下采样（默认 200000）
    """
    try:
        import numpy as np
        import anndata as ad
        import scanpy as sc
    except ImportError as e:
        raise RuntimeError(
            f'单细胞质控依赖未就绪（{e}）。scanpy/anndata/h5py 属第二层按需依赖，'
            f'经插件语义化工具 bio_sc_qc 调用时会自动安装；若你是直接调用 Python '
            f'（绕过插件层），请先执行：uv pip install scanpy anndata h5py') from e

    path = args.get('input_file')
    if not path or not os.path.exists(path):
        raise FileNotFoundError(f'输入文件不存在: {path!r}（需 .h5ad 或 10X .h5）')

    species = (args.get('species') or 'human').lower()
    pat = GENE_PATTERNS.get(species, GENE_PATTERNS['human'])
    mad_counts = float(args.get('mad_counts', 5))
    mad_genes = float(args.get('mad_genes', 5))
    mad_mt = float(args.get('mad_mt', 3))
    min_genes = int(args.get('min_genes', 200))
    min_cells = int(args.get('min_cells', 3))
    mt_cap = args.get('mt_cap')
    max_cells = int(args.get('max_cells', 200000))
    apply_filter = args.get('apply_filter', True)
    make_plots = args.get('make_plots', True)

    # ---- 读取（自动识别 10X .h5 与 .h5ad）----
    if path.lower().endswith('.h5ad'):
        adata = ad.read_h5ad(path)
    else:
        adata = sc.read_10x_h5(path)
        adata.var_names_make_unique()
    fmt = 'h5ad' if path.lower().endswith('.h5ad') else '10x_h5'

    n_cells_raw = int(adata.n_obs)
    n_genes_raw = int(adata.n_vars)
    downsampled = False
    if n_cells_raw > max_cells:
        import numpy as _np
        rng = _np.random.default_rng(0)
        keep = rng.choice(n_cells_raw, size=max_cells, replace=False)
        adata = adata[sorted(keep)].copy()
        downsampled = True

    adata.var['mt'] = adata.var_names.str.startswith(pat['mt'])
    adata.var['ribo'] = adata.var_names.str.startswith(tuple(pat['ribo']))
    try:
        adata.var['hb'] = adata.var_names.str.match(list(pat['hb']))
    except Exception:
        adata.var['hb'] = False

    sc.pp.calculate_qc_metrics(adata, qc_vars=['mt', 'ribo', 'hb'],
                               percent_top=None, log1p=False, inplace=True)

    def _mad_mask(vals, nmads, *, side='both', log=True):
        """中位数绝对偏差离群掩码（scverse 推荐做法）。返回 True = 保留。"""
        v = np.asarray(vals, dtype=float)
        if log:
            v = np.log1p(v)
        med = np.median(v)
        mad = np.median(np.abs(v - med))
        if mad == 0:
            return np.ones(len(v), dtype=bool)
        lo, hi = med - nmads * mad, med + nmads * mad
        if side == 'lower':
            return v >= lo
        if side == 'upper':
            return v <= hi
        return (v >= lo) & (v <= hi)

    mask_counts = _mad_mask(adata.obs['total_counts'], mad_counts)
    mask_genes = _mad_mask(adata.obs['n_genes_by_counts'], mad_genes)
    mask_mt = _mad_mask(adata.obs['pct_counts_mt'], mad_mt, side='upper')
    mask_min = adata.obs['n_genes_by_counts'].values >= min_genes
    mask = mask_counts & mask_genes & mask_mt & mask_min
    if mt_cap is not None:
        mask &= adata.obs['pct_counts_mt'].values <= float(mt_cap)

    def _thr(vals, nmads, *, side='both'):
        v = np.log1p(np.asarray(vals, dtype=float))
        med = np.median(v)
        mad = np.median(np.abs(v - med))
        if mad == 0:
            return None, None
        lo, hi = med - nmads * mad, med + nmads * mad
        f = np.expm1
        if side == 'lower':
            return float(f(lo)), None
        if side == 'upper':
            return None, float(f(hi))
        return float(f(lo)), float(f(hi))

    c_lo, c_hi = _thr(adata.obs['total_counts'], mad_counts)
    g_lo, g_hi = _thr(adata.obs['n_genes_by_counts'], mad_genes)
    _, m_hi = _thr(adata.obs['pct_counts_mt'], mad_mt, side='upper')

    n_keep = int(mask.sum())
    n_drop = int(len(mask) - n_keep)

    out_dir = args.get('output_dir') or 'sc_qc'
    os.makedirs(out_dir, exist_ok=True)

    result = {
        'input_file': os.path.abspath(path),
        'input_format': fmt,
        'species': species,
        'cells_raw': n_cells_raw,
        'genes_raw': n_genes_raw,
        'downsampled': downsampled,
        'cells_after_filter': n_keep,
        'cells_removed': n_drop,
        'cells_retained_fraction': round(n_keep / max(1, len(mask)), 4),
        'qc_before': {
            'median_counts_per_cell': float(np.median(adata.obs['total_counts'])),
            'median_genes_per_cell': float(np.median(adata.obs['n_genes_by_counts'])),
            'median_pct_mt': round(float(np.median(adata.obs['pct_counts_mt'])), 4),
            'median_pct_ribo': round(float(np.median(adata.obs['pct_counts_ribo'])), 4),
            'median_pct_hb': round(float(np.median(adata.obs['pct_counts_hb'])), 4),
            'n_genes_detected_in_zero_cells': int((adata.var['n_cells_by_counts'] == 0).sum()),
        },
        'thresholds': {
            'mad_nmads': {'counts': mad_counts, 'genes': mad_genes, 'mt': mad_mt},
            'counts_range': [c_lo, c_hi],
            'genes_range': [g_lo, g_hi],
            'pct_mt_max': m_hi,
            'min_genes_abs': min_genes,
            'mt_cap_abs': mt_cap,
        },
        'filter_breakdown': {
            'failed_counts_mad': int((~mask_counts).sum()),
            'failed_genes_mad': int((~mask_genes).sum()),
            'failed_mt_mad': int((~mask_mt).sum()),
            'failed_min_genes': int((~mask_min).sum()),
        },
        'gene_patterns_used': {'mt_prefix': pat['mt'], 'ribo_prefixes': list(pat['ribo'])},
    }

    # ---- 基因过滤 + 保存 ----
    adata_f = adata[mask].copy()
    genes_before = int(adata_f.n_vars)
    sc.pp.filter_genes(adata_f, min_cells=min_cells)
    result['genes_after_filter'] = int(adata_f.n_vars)
    result['genes_removed_low_detection'] = genes_before - int(adata_f.n_vars)

    if apply_filter:
        filtered_path = os.path.join(out_dir, os.path.basename(path).rsplit('.', 1)[0] + '_filtered.h5ad')
        adata_f.write_h5ad(filtered_path)
        result['filtered_file'] = os.path.abspath(filtered_path)
        # 保留 QC 注释的未过滤副本（供用户回溯）
        withqc = adata.copy()
        withqc.obs['qc_pass'] = mask
        withqc_path = os.path.join(out_dir, os.path.basename(path).rsplit('.', 1)[0] + '_with_qc.h5ad')
        withqc.write_h5ad(withqc_path)
        result['with_qc_file'] = os.path.abspath(withqc_path)

    # ---- 图 ----
    if make_plots:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt

        def _panel(ax, x, y, title, xlabel, ylabel, keep):
            ax.scatter(x[keep], y[keep], s=2, c='#2b6cb0', alpha=0.5, linewidths=0)
            ax.scatter(x[~keep], y[~keep], s=2, c='#c53030', alpha=0.5, linewidths=0)
            ax.set_title(title, fontsize=9)
            ax.set_xlabel(xlabel, fontsize=8)
            ax.set_ylabel(ylabel, fontsize=8)
            ax.tick_params(labelsize=7)

        obs = adata.obs
        tc = obs['total_counts'].values
        ng = obs['n_genes_by_counts'].values
        pm = obs['pct_counts_mt'].values

        fig, axes = plt.subplots(2, 3, figsize=(13, 7.5))
        _panel(axes[0, 0], tc, ng, '计数 vs 基因数', 'total counts', 'n genes', mask)
        axes[0, 1].hist(np.log1p(tc), bins=60, color='#4a5568')
        if c_lo:
            axes[0, 1].axvline(np.log1p(c_lo), color='#c53030', ls='--', lw=1)
        if c_hi:
            axes[0, 1].axvline(np.log1p(c_hi), color='#c53030', ls='--', lw=1)
        axes[0, 1].set_title('每细胞总计数（log1p，红=阈值）', fontsize=9)
        axes[0, 1].set_xlabel('log1p(total counts)', fontsize=8)
        axes[0, 1].tick_params(labelsize=7)

        axes[0, 2].hist(ng, bins=60, color='#4a5568')
        if g_lo:
            axes[0, 2].axvline(g_lo, color='#c53030', ls='--', lw=1)
        if g_hi:
            axes[0, 2].axvline(g_hi, color='#c53030', ls='--', lw=1)
        axes[0, 2].set_title('每细胞基因数（红=阈值）', fontsize=9)
        axes[0, 2].set_xlabel('n genes', fontsize=8)
        axes[0, 2].tick_params(labelsize=7)

        axes[1, 0].hist(pm, bins=60, color='#4a5568')
        if m_hi:
            axes[1, 0].axvline(m_hi, color='#c53030', ls='--', lw=1)
        axes[1, 0].set_title('线粒体比例 %', fontsize=9)
        axes[1, 0].set_xlabel('% MT', fontsize=8)
        axes[1, 0].tick_params(labelsize=7)

        pr = obs['pct_counts_ribo'].values
        axes[1, 1].hist(pr, bins=60, color='#4a5568')
        axes[1, 1].set_title('核糖体比例 %', fontsize=9)
        axes[1, 1].set_xlabel('% ribo', fontsize=8)
        axes[1, 1].tick_params(labelsize=7)

        # top 基因表达占比
        topn = min(20, adata.n_vars)
        idx = np.argsort(np.asarray(adata.X.sum(axis=0)).ravel())[::-1][:topn]
        names = adata.var_names[idx]
        vals = np.asarray(adata.X[:, idx].sum(axis=0)).ravel()
        axes[1, 2].barh(range(topn), vals[::-1], color='#2b6cb0')
        axes[1, 2].set_yticks(range(topn))
        axes[1, 2].set_yticklabels([str(n)[:22] for n in names[::-1]], fontsize=5)
        axes[1, 2].set_title(f'表达量 Top{topn} 基因', fontsize=9)
        axes[1, 2].tick_params(labelsize=7)

        fig.suptitle(
            f"scRNA-seq QC — {os.path.basename(path)}  |  {n_cells_raw} → {n_keep} cells "
            f"(removed {n_drop})", fontsize=11)
        fig.tight_layout(rect=(0, 0, 1, 0.96))
        qc_fig = os.path.join(out_dir, 'qc_metrics.png')
        fig.savefig(qc_fig, dpi=300)
        plt.close(fig)
        result['qc_figure'] = os.path.abspath(qc_fig)

        # 过滤前后对比（保留细胞 vs 丢弃细胞的分布）
        fig2, axes2 = plt.subplots(1, 3, figsize=(12, 3.6))
        for ax, (vals, name) in zip(axes2, [(tc, 'total counts'), (ng, 'n genes'),
                                            (pm, '% MT')]):
            ax.hist(vals[mask], bins=50, alpha=0.75, label=f'keep (n={n_keep})',
                    color='#2b6cb0')
            ax.hist(vals[~mask], bins=50, alpha=0.75, label=f'removed (n={n_drop})',
                    color='#c53030')
            ax.set_title(name, fontsize=9)
            ax.legend(fontsize=6)
            ax.tick_params(labelsize=7)
        fig2.suptitle('过滤前后分布对比', fontsize=10)
        fig2.tight_layout(rect=(0, 0, 1, 0.93))
        cmp_fig = os.path.join(out_dir, 'qc_before_after.png')
        fig2.savefig(cmp_fig, dpi=300)
        plt.close(fig2)
        result['comparison_figure'] = os.path.abspath(cmp_fig)

    result['output_dir'] = os.path.abspath(out_dir)
    result['note'] = (
        'MAD 过滤按 scverse 最佳实践：先 log1p 再算中位数绝对偏差，'
        '默认 5/5/3 MAD（计数/基因数/线粒体%），叠加绝对下限 min_genes。'
        '阈值与各条件淘汰数见 thresholds 与 filter_breakdown，便于调参复核。'
        '物种前缀决定线粒体基因识别（human=MT-，mouse=mt-），选错会导致 MT% 恒为 0。')
    return result
