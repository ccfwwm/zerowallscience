"""differential_recipes.py — 差异分析出版级配方（Volcano / MA 双模）。

设计原则（对齐插件「代码出事实、agent 做编排」契约）：
- 输入 = 真实计算产物（effect size / p 值 / padj / base mean），**数字必须是上游工具**（如
  bio_stats / DESeq2 语义化输出）算出来的，本模块不重新计算统计量；
- 视觉规则内置 Nature 语义（灰色背景基因 → 彩色显著基因 → 黑色标注关键基因），
  即 Tier A/B/C 视觉层级；阈值线内置于数据解释结构；
- NS 永远 #BDBDBD；up=#D55E00 vermillion；down=#0072B2 blue——同一语义全篇同色；
- 自动标注只标「top effect / top significance / 用户指定 gene」，绝不标 Top-N 全集。

Usage（bio_python 桥内直接调）：
    from figurelib.differential_recipes import differential_plot
    fig, axes, meta = differential_plot(
        df, effect_col='log2FC', p_col='pvalue', padj_col='padj',
        base_mean_col='baseMean', label_col='gene_name', mode='volcano',
        out_file='figures/volcano.pdf', journal='nature')
    # 返回 meta 含 n_sig_up/n_sig_down/labeled_genes——供图注与 caption 引用

mode='volcano' → x=effect size, y=-log10(p)（或 padj）
mode='ma'      → x=base mean (log10), y=effect size（差异 vs 表达量）
"""
from __future__ import annotations

import os
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

# ---- 语义色板（同 pub-figure 语义 token；全篇一致） ----
SEM_NEUTRAL = '#BDBDBD'   # NS / 背景基因
SEM_UP = '#D55E00'        # vermillion（上调）
SEM_DOWN = '#0072B2'      # blue（下调）
SEM_HIGHLIGHT = '#000000'  # 黑（重点标注）

# Okabe-Ito 上白底可辨清单（color_palettes.OKABE_ITO_ON_WHITE 同源）
_PALETTES = {
    'nature': {'up': SEM_UP, 'down': SEM_DOWN, 'ns': SEM_NEUTRAL, 'highlight': SEM_HIGHLIGHT},
}


def _resolve_journal_colors(journal: str | None) -> dict:
    if journal and journal in _PALETTES:
        return _PALETTES[journal]
    return _PALETTES['nature']


def _pick_labels(df: pd.DataFrame, effect_col: str, padj_col: str | None,
                 alpha: float, top_k: int = 5, user_labels: list[str] | None = None,
                 label_col: str | None = None) -> set:
    """标注预算：top effect + top significance + 用户点名。绝不全标。"""
    chosen = set()
    if user_labels:
        for name in user_labels:
            chosen.update(df.index[df[label_col] == name] if label_col else
                          df.index[df.index.astype(str) == str(name)])
    if padj_col and padj_col in df:
        sig = df[df[padj_col] < alpha]
    else:
        sig = df
    if len(sig):
        # top effect（正/负各取）
        k = min(top_k, max(1, len(sig) // 10))
        chosen.update(sig.nlargest(k, effect_col).index)
        chosen.update(sig.nsmallest(k, effect_col).index)
        # top significance
        p_use = padj_col if (padj_col and padj_col in df) else None
        pcol_candidates = [c for c in df.columns if c.lower() in ('pvalue', 'p_val', 'p')]
        pcol = p_use or (pcol_candidates[0] if pcol_candidates else None)
        if pcol:
            chosen.update(sig.nsmallest(k, pcol).index)
    return {c for c in chosen if not pd.isna(c)}


def differential_plot(dz_frame: pd.DataFrame | str, *, effect_col: str = 'log2FC',
                      p_col: str = 'pvalue', padj_col: str | None = 'padj',
                      base_mean_col: str | None = None, label_col: str | None = None,
                      mode: str = 'volcano', alpha: float = 0.05,
                      effect_threshold: float = 1.0, use_padj: bool = True,
                      user_labels: list[str] | None = None, top_k: int = 5,
                      out_file: str | None = None, journal: str = 'nature',
                      ax=None) -> tuple:
    """差异分析事实图（Volcano 或 MA）。返回 (fig, ax, meta)。

    参数：
      dz_frame: DataFrame 或 CSV/TSV 路径。必需列：effect（log2FC 等）、p/padj。
                MA 模式还需 base_mean 列。
      mode: 'volcano' | 'ma'
      alpha: 显著性阈值（padj 或 p，按 use_padj 定）
      effect_threshold: effect 绝对值阈值（volcano 竖线；MA 图同用）
      user_labels: 要标注的基因/条目名列表（annotation budget 由本模块控制）
      top_k: 每类自动标注上限
      out_file: 落盘路径（有值即自动 export）
      journal: 'nature' 预设（其余回退 nature 色板并 WARN）

    返回 meta ={n_sig_up, n_sig_down, n_total, thresholds, labeled:[...], out_file}
    """
    if isinstance(dz_frame, str):
        sep = '\t' if dz_frame.endswith(('.tsv', '.txt')) else ','
        df = pd.read_csv(dz_frame, sep=sep)
    else:
        df = dz_frame.copy()
    if effect_col not in df.columns:
        raise ValueError(f'effect 列 {effect_col!r} 不存在；columns={list(df.columns)[:12]}')
    if p_col not in df.columns:
        raise ValueError(f'p 值列 {p_col!r} 不存在')
    if mode == 'ma' and not (base_mean_col and base_mean_col in df.columns):
        raise ValueError("mode='ma' 需要 base_mean_col")

    colors = _resolve_journal_colors(journal)
    if journal not in _PALETTES:
        print(f"[warn] journal={journal!r} 无专用色板，用 nature 语义色（保守）", file=sys.stderr)

    # 分类（统计语义决定颜色，非装饰）
    if use_padj and padj_col and padj_col in df:
        sig_mask = df[padj_col] < alpha
        sig_basis = f'padj < {alpha}'
    else:
        sig_mask = df[p_col] < alpha
        sig_basis = f'{p_col} < {alpha}'
    eff_mask = df[effect_col].abs() > effect_threshold
    up_mask = sig_mask & eff_mask & (df[effect_col] > 0)
    down_mask = sig_mask & eff_mask & (df[effect_col] < 0)
    ns_mask = ~(up_mask | down_mask)

    y_vals = df[effect_col].to_numpy()
    if mode == 'volcano':
        p_use = df[padj_col] if (use_padj and padj_col and padj_col in df) else df[p_col]
        p_use = np.clip(p_use, 1e-300, None)
        x = y_vals
        y = -np.log10(p_use.to_numpy())
    elif mode == 'ma':
        if not base_mean_col:
            raise ValueError("mode='ma' 需要 base_mean_col")
        m = np.log10(np.clip(df[base_mean_col].to_numpy(), 1e-2, None))
        x, y = m, y_vals
    else:
        raise ValueError(f"mode 只支持 volcano/ma，收到 {mode!r}")

    if ax is None:
        fig, ax = plt.subplots(figsize=(3.5, 3.0) if journal == 'nature' else (4.4, 3.4))
    else:
        fig = ax.figure

    # Tier C：全 NS 灰背景 + Tier A/B 彩色显著
    ax.scatter(x, y, s=6, c=SEM_NEUTRAL, alpha=.6, lw=0, label=None)
    if down_mask.any():
        ax.scatter(x[down_mask.to_numpy()], y[down_mask.to_numpy()], s=8,
                   c=SEM_DOWN, alpha=.9, lw=0, label=f'down ({int(down_mask.sum())})')
    if up_mask.any():
        ax.scatter(x[up_mask.to_numpy()], y[up_mask.to_numpy()], s=8,
                   c=SEM_UP, alpha=.9, lw=0, label=f'up ({int(up_mask.sum())})')

    # 阈值线（数据解释结构，进图）
    ax.axhline(-np.log10(alpha), color='#444444', lw=.5, ls='--', zorder=1)
    if mode == 'volcano':
        for v in (-effect_threshold, effect_threshold):
            ax.axvline(v, color='#444444', lw=.5, ls='--', zorder=1)

    # 标注预算（Tier A highlight）；有 adjustText 时自动避碰，无则静态 offset 回退
    label_idx = _pick_labels(df, effect_col, padj_col if use_padj else None,
                             alpha, top_k=top_k, user_labels=user_labels,
                             label_col=label_col or 'name')
    labeled = []
    annotations = []
    try:
        labels_arr = df[label_col].astype(str).to_numpy() if label_col else \
            df.index.astype(str).to_numpy()
        pos_map = {idx: i for i, idx in enumerate(df.index)}
        for idx in label_idx:
            i = pos_map.get(idx)
            if i is None:
                continue
            nm = str(labels_arr[i])
            if not nm or nm == 'nan':
                continue
            annotations.append((nm, x[i], y[i]))
            labeled.append(nm)
    except Exception as e:  # 标注失败不拖垮出图
        print(f"[warn] label pass failed: {type(e).__name__}: {e}", file=sys.stderr)
    if annotations:
        try:
            from adjustText import adjust_text
            texts = [ax.annotate(nm, (xi, yi), fontsize=6, color=SEM_HIGHLIGHT)
                     for nm, xi, yi in annotations]
            adjust_text(texts, ax=ax, expand=(1.15, 1.25),
                        arrowprops=dict(arrowstyle='-', color='#333333', lw=.4))
        except ImportError:
            # 第二层未装（adjustText）：静态 offset 兜底
            for nm, xi, yi in annotations:
                ax.annotate(nm, (xi, yi), textcoords='offset points',
                            xytext=(3, 3), fontsize=6, color=SEM_HIGHLIGHT,
                            ha='left', va='bottom')
        except Exception as e:
            print(f"[warn] adjust_text failed, fallback static: {type(e).__name__}: {e}",
                  file=sys.stderr)

    # 轴标签（含语义单位）
    if mode == 'volcano':
        ax.set_xlabel(f'{effect_col}')
        ax.set_ylabel(r'$-\log_{10}$(' + ('padj' if (use_padj and padj_col and padj_col in df)
                                          else p_col) + ')')
    else:
        ax.set_xlabel(f'log10({base_mean_col})' if base_mean_col else 'log10(mean expression)')
        ax.set_ylabel(effect_col)

    leg = ax.legend(loc='best', frameon=False, fontsize=6, handletextpad=.2,
                    borderaxespad=.2) if (up_mask.any() or down_mask.any()) else None

    # 截断 y 上界防 p=0 极端值压缩主体
    if mode == 'volcano' and len(y) and np.isfinite(y).any():
        q999 = np.nanquantile(y[np.isfinite(y)], 0.999)
        ymax = min(np.nanmax(y[np.isfinite(y)]), max(q999, 3.0) * 1.15)
        ax.set_ylim(top=max(ymax, 4))
    ax.margins(x=.04)

    meta = {
        'mode': mode,
        'n_total': int(len(df)),
        'n_sig_up': int(up_mask.sum()),
        'n_sig_down': int(down_mask.sum()),
        'sig_basis': sig_basis,
        'effect_threshold': effect_threshold,
        'alpha': alpha,
        'colors': {'up': SEM_UP, 'down': SEM_DOWN, 'ns': SEM_NEUTRAL},
        'labeled': labeled[:20],
        'caption_fragments': [
            f'Sig. = {sig_basis} and |{effect_col}| > {effect_threshold}',
            f'NS: {SEM_NEUTRAL}; up: {SEM_UP}; down: {SEM_DOWN}',
        ],
    }
    if out_file:
        from figurelib.export_figure import export_figure
        exported = export_figure(fig, os.path.splitext(out_file)[0],
                                 formats=[os.path.splitext(out_file)[1].lstrip('.') or 'pdf'],
                                 dpi=300)
        meta['exported_files'] = exported
        meta['out_file'] = exported[0] if exported else out_file
        # 审稿人复现代码 bundle（出图即落盘，agent 零操作）
        try:
            import inspect as _inspect
            _caller = _inspect.currentframe().f_back
            from figurelib.repro_script import script_snapshot, write_repro_bundle
            _fn = f'{type(self).__module__}.differential_plot' if False else \
                'figurelib.differential_recipes.differential_plot'
            _call_kwargs = {
                'effect_col': effect_col, 'p_col': p_col, 'padj_col': padj_col,
                'base_mean_col': base_mean_col, 'label_col': label_col,
                'mode': mode, 'alpha': alpha, 'effect_threshold': effect_threshold,
                'use_padj': use_padj, 'user_labels': list(user_labels or []),
                'top_k': top_k, 'out_file': out_file, 'journal': journal,
            }
            _script = script_snapshot(_caller, _fn, _call_kwargs,
                                      header_note=f'Figure: {os.path.basename(out_file)} (volcano/MA, autogenerated)')
            _repro = write_repro_bundle(exported[0] if exported else out_file, fig, _script,
                                        data_ref=None,
                                        meta={'n_sig_up': meta['n_sig_up'],
                                              'n_sig_down': meta['n_sig_down'],
                                              'mode': mode, 'alpha': alpha,
                                              'effect_threshold': effect_threshold})
            meta['repro_script'] = _repro['script']
            meta['repro_readme'] = _repro['readme']
            meta['repro_note'] = '复现代码已随图落盘（审稿人索要代码时直接交付）'
        except Exception as _e:  # 复现 bundle 失败不拖垮出图
            print(f'[warn] repro bundle failed: {type(_e).__name__}: {_e}', file=sys.stderr)
            meta['repro_script'] = None
    return fig, ax, meta


# 别名（符合 GPT 所述"两个模板应共用同一数据语义"）
volcano_plot = lambda *a, **k: differential_plot(*a, mode='volcano', **k)
ma_plot = lambda *a, **k: differential_plot(*a, mode='ma', **k)


def _demo(out_dir: str = './differential_demo') -> None:
    """合成 DE 数据（真实分布），出 volcano + MA 验证配方与导出。"""
    import os
    import string
    rng = np.random.default_rng(11)
    n = 3000
    effect = rng.normal(0, .7, n)
    effect[:30] += rng.uniform(1.5, 3.2, 30)      # 30 up
    effect[30:80] -= rng.uniform(1.5, 3.0, 50)    # 50 down
    base = rng.lognormal(4, 1.2, n)
    pv = np.clip(rng.f(2, 18, n) / 8, 1e-20, 1)
    pv[:90] = np.clip(rng.f(2, 18, 90) / 300, 1e-12, 0.03)
    padj = np.minimum(1, pv * n / np.maximum(1, np.arange(1, n + 1)))
    genes = ['.'.join(rng.choice(list(string.ascii_uppercase), 3)) + f'G{i}' for i in range(n)]
    df = pd.DataFrame({'gene': genes, 'log2FC': effect, 'pvalue': pv, 'padj': padj,
                       'baseMean': base})
    os.makedirs(out_dir, exist_ok=True)
    for mode in ('volcano', 'ma'):
        fig, ax, meta = differential_plot(
            df, effect_col='log2FC', p_col='pvalue', padj_col='padj',
            base_mean_col='baseMean', label_col='gene', mode=mode,
            user_labels=[genes[0], genes[5]],
            out_file=os.path.join(out_dir, f'{mode}.pdf'))
        plt.close(fig)
        print(mode, '->', meta['out_file'],
              f"up={meta['n_sig_up']} down={meta['n_sig_down']} labeled={len(meta['labeled'])}")


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--demo', action='store_true')
    ap.add_argument('--out', default='./differential_demo')
    a = ap.parse_args()
    if a.demo:
        _demo(a.out)
