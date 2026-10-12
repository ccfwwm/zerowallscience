"""DE and preranked GSEA operations. Formal backend versions are pinned by R2."""
import csv
import hashlib
import importlib.metadata as metadata
import json
import io
import os
import re
import tempfile
from contextlib import redirect_stdout, redirect_stderr

import numpy as np
import pandas as pd

DE_METHOD_PYDESEQ2 = "genie.de.pydeseq2.v2"
DE_METHOD_WELCH = "genie.de.welch.v2"
GSEA_METHOD_PRERANK = "genie.gsea.prerank.v2"
SUPPORTED_PYDESEQ2 = "0.5.4"
SUPPORTED_GSEAPY = "1.3.1"


def _sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def _read_csv(path, **kwargs):
    """Check the physical header before pandas can mangle duplicate names."""
    with open(path, "r", encoding="utf-8-sig", newline="") as source:
        header = next(csv.reader(source))
    first_is_index = kwargs.get('index_col') == 0
    if not header or any(not h.strip() for h in (header[1:] if first_is_index else header)):
        raise ValueError("CSV 表头含空列名")
    if len(header) != len(set(header)):
        raise ValueError("CSV 重复表头: " + repr([x for x in header if header.count(x) > 1][:5]))
    return pd.read_csv(path, **kwargs)


def _write_table(df, path):
    payload = df.to_csv(index=False, float_format="%.17g").encode("utf-8")
    digest = hashlib.sha256(payload).hexdigest()
    if path:
        directory = os.path.dirname(os.path.abspath(path))
        os.makedirs(directory, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix=".genie-", suffix=".csv", dir=directory)
        try:
            with os.fdopen(fd, "wb") as target:
                target.write(payload)
                target.flush()
                os.fsync(target.fileno())
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    return {"path": path, "n_rows": int(len(df)), "sha256": digest,
            "persisted": bool(path)}


def _read_gmt(path):
    sets, original_sizes = {}, {}
    with open(path, 'r', encoding='utf-8-sig') as source:
        for line_number, line in enumerate(source, 1):
            if not line.strip():
                continue
            fields = line.rstrip('\r\n').split('\t')
            if len(fields) < 3 or not fields[0].strip():
                raise ValueError(f'GMT 第 {line_number} 行缺名称或基因')
            term = fields[0]
            if term in sets:
                raise ValueError(f'GMT 重复集合名 {term!r}')
            genes = [x for x in fields[2:] if x]
            if not genes:
                raise ValueError(f'GMT 空集合 {term!r}')
            sets[term] = list(dict.fromkeys(genes))
            original_sizes[term] = len(genes)
    if not sets:
        raise ValueError('GMT 不含集合')
    return sets, original_sizes


def _validate_counts(counts, meta):
    """GN-1：raw counts 校验。返回 (counts_clean, errors)。"""
    errors = []
    if counts.shape[0] == 0 or counts.shape[1] == 0:
        errors.append("counts 矩阵为空")
        return counts, errors
    # 重复 gene / sample
    if counts.index.duplicated().any():
        errors.append(f"重复基因行：{list(counts.index[counts.index.duplicated()])[:5]}")
    if counts.columns.duplicated().any():
        errors.append(f"重复样本列：{list(counts.columns[counts.columns.duplicated()])[:5]}")
    # 有限 + 非负整数（拒绝 TPM/归一化浮点冒充 counts）
    try:
        arr = counts.to_numpy(dtype=float)
    except (TypeError, ValueError):
        errors.append("counts 含非数值")
        return counts, errors
    if not np.isfinite(arr).all():
        errors.append("counts 含 NaN/Inf（非有限数）")
    if (arr < 0).any():
        errors.append("counts 含负值（raw counts 必须非负）")
    if (arr != np.floor(arr)).any() or (arr > 2**53).any():
        errors.append("counts 含非整数（疑似 TPM/归一化浮点冒充 raw counts）")
    # meta 校验
    for col in ("sample",):
        if col not in meta.columns:
            errors.append(f"meta_file 缺少必需列 '{col}'，实际列: {list(meta.columns)}")
    if "sample" in meta.columns:
        if meta["sample"].isna().any() or meta["sample"].astype(str).str.strip().eq("").any():
            errors.append("meta sample 含空值")
        if meta["sample"].duplicated().any():
            errors.append("meta sample 重复")
        if set(meta["sample"].astype(str)) != set(counts.columns.astype(str)):
            errors.append("counts/meta 样本集合不一致（缺/多样本均拒绝）")
    return counts, errors


def _parse_design(design, meta):
    """Only additive categorical formulas are supported in this release."""
    d = (design or "~condition").strip()
    if not re.fullmatch(r"~?\s*[A-Za-z_]\w*(?:\s*\+\s*[A-Za-z_]\w*)*", d):
        raise ValueError("design 仅支持分类因子的加性公式（如 ~ type + condition）；交互/变换暂不支持")
    factors = [f.strip() for f in d.lstrip("~").split("+")]
    if len(factors) != len(set(factors)):
        raise ValueError("design 重复因子")
    for f in factors:
        if f not in meta.columns:
            raise ValueError(f"design 因子 {f!r} 不在 meta 中")
        if meta[f].isna().any() or meta[f].astype(str).str.strip().eq("").any():
            raise ValueError(f"design 因子 {f!r} 含空值")
        if pd.api.types.is_numeric_dtype(meta[f]):
            raise ValueError(f"design 因子 {f!r} 是数值协变量；本版不支持连续协变量自动转类别")
        if meta[f].nunique() < 2:
            raise ValueError(f"design 因子 {f!r} 只有一个水平")
    matrix = pd.concat([pd.Series(1., index=meta.index, name="intercept"),
                        pd.get_dummies(meta[factors].astype(str), drop_first=True, dtype=float)], axis=1)
    if np.linalg.matrix_rank(matrix.to_numpy(dtype=float)) < matrix.shape[1]:
        raise ValueError("design 秩亏/因子完全混杂，无法估计")
    return factors


def op_deseq2_python(args):
    """差异表达分析。backend: 'pydeseq2'（默认，正式）| 'legacy_welch'（旧近似，显式）。

    单因素：design 默认 ~condition，contrast "trt_vs_ctrl"。
    多因素：design "~ type + condition" + factor/num/den（显式比较因子、分子、分母）。
    旧 group1_vs_group2 语法继续支持且方向不变。
    """
    counts_file = args.get('counts_file')
    meta_file = args.get('meta_file')
    contrast = args.get('contrast', 'trt_vs_ctrl')
    out_csv = args.get('out_csv')
    backend = args.get('backend', 'pydeseq2')
    design = args.get('design')
    factor = args.get('factor', 'condition')
    num = args.get('numerator')
    den = args.get('denominator')

    if not counts_file or not meta_file:
        return {'error': 'counts_file and meta_file required', 'code': 'INPUT_REQUIRED'}
    if out_csv and os.path.abspath(out_csv) in {os.path.abspath(counts_file), os.path.abspath(meta_file)}:
        return {'error': 'out_csv 不得覆盖原 counts/meta 输入', 'code': 'OUTPUT_CONFLICT'}
    if backend not in ('pydeseq2', 'legacy_welch'):
        return {'error': f"unknown backend {backend!r}（pydeseq2 | legacy_welch）", 'code': 'BACKEND_INVALID'}

    try:
        counts = _read_csv(counts_file, index_col=0)
        meta = _read_csv(meta_file)
    except Exception as e:
        return {'error': f'读取失败: {type(e).__name__}: {e}', 'code': 'INPUT_READ_FAILED'}

    counts, errs = _validate_counts(counts, meta)
    if errs:
        return {'error': 'counts/meta 校验失败：' + '; '.join(errs), 'code': 'INPUT_INVALID'}

    if factor not in meta.columns:
        return {'error': f'factor {factor!r} 不在 meta 中', 'code': 'DESIGN_INVALID'}
    if bool(num) != bool(den):
        return {'error': 'numerator 与 denominator 必须成对提供', 'code': 'CONTRAST_INVALID'}
    try:
        factors = _parse_design(design or f"~{factor}", meta)
    except ValueError as e:
        return {'error': str(e), 'code': 'DESIGN_INVALID'}
    if factor not in factors:
        return {'error': f'factor {factor!r} 不在 design 中', 'code': 'DESIGN_INVALID'}

    # 解析比较（单因素 group1_vs_group2 或多因素 num/den）
    if num and den:
        group1, group2 = num, den
    else:
        parts = contrast.split('_vs_')
        if len(parts) != 2 or not all(parts):
            return {'error': f'Invalid contrast format: {contrast}. Use "group1_vs_group2"'}
        group1, group2 = parts
    if str(group1) == str(group2):
        return {'error': 'contrast 两个水平不能相同', 'code': 'CONTRAST_INVALID'}
    if group1 not in meta[factor].astype(str).unique() or group2 not in meta[factor].astype(str).unique():
        return {'error': f'factor {factor!r} 分组缺失：{group1}/{group2}。'
                         f'实际水平: {list(meta[factor].astype(str).unique())}'}

    # 样本顺序（显式保存）；不静默取交集删除样本
    samples1 = meta[meta[factor].astype(str) == str(group1)]['sample'].tolist()
    samples2 = meta[meta[factor].astype(str) == str(group2)]['sample'].tolist()
    sample_order = meta['sample'].astype(str).tolist()

    if backend == 'legacy_welch':
        return _deseq2_welch(counts, meta, samples1, samples2, group1, group2,
                             factor, factors, out_csv)

    # ---- pydeseq2 正式后端 ----
    try:
        from pydeseq2.dds import DeseqDataSet
        from pydeseq2.ds import DeseqStats
        pydeseq2_version = metadata.version("pydeseq2")
    except (ImportError, metadata.PackageNotFoundError) as e:
        return {'error': f'pydeseq2 未安装（按需依赖）：{e}。'
                         f'正式后端不可用时不静默降级；显式 backend="legacy_welch" 可用旧近似',
                'code': 'DEPENDENCY_MISSING', 'backend': backend, 'method': DE_METHOD_PYDESEQ2,
                'dependency_missing': 'pydeseq2'}
    if pydeseq2_version != SUPPORTED_PYDESEQ2:
        return {'error': f'pydeseq2 {pydeseq2_version} 未核验；仅支持 {SUPPORTED_PYDESEQ2}',
                'code': 'DEPENDENCY_VERSION_UNSUPPORTED', 'backend': backend}
    try:
        design_formula = "~" + " + ".join(factors)
        # All matched samples, including levels outside the contrast, participate in the fit.
        counts_adata = counts[sample_order].T  # samples × genes
        meta_sub = meta.assign(sample=meta['sample'].astype(str)).set_index('sample').loc[sample_order].copy()
        for f in factors:
            meta_sub[f] = meta_sub[f].astype(str)

        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            dds = DeseqDataSet(counts=counts_adata, metadata=meta_sub,
                               design=design_formula, refit_cooks=True, n_cpus=1, quiet=True)
            dds.deseq2()
            stat_res = DeseqStats(dds, contrast=[factor, str(group1), str(group2)],
                                  cooks_filter=True, independent_filter=True, n_cpus=1, quiet=True)
            stat_res.summary()
        res = stat_res.results_df.copy()
        res = res.reset_index()
        res = res.rename(columns={res.columns[0]: 'gene'})
        res = res[['gene', 'baseMean', 'log2FoldChange', 'lfcSE', 'stat', 'pvalue', 'padj']]
        res = res.sort_values(['padj', 'gene'], kind='mergesort', na_position='last')
    except Exception as e:
        import traceback
        return {'error': f'pydeseq2 运行失败：{type(e).__name__}: {e}', 'code': 'BACKEND_FAILED',
                'backend': backend, 'method': DE_METHOD_PYDESEQ2,
                'traceback_tail': traceback.format_exc()[-800:]}

    try:
        out_info = _write_table(res, out_csv)
    except Exception as e:
        return {'error': f'完整 DE 表写入失败：{type(e).__name__}: {e}', 'code': 'OUTPUT_WRITE_FAILED'}

    sig = res[(res['padj'] < 0.05) & (res['log2FoldChange'].abs() > 1)]
    out = {
        'n_genes': len(res),
        'n_samples': len(sample_order),
        'n_estimable_stat': int(res['stat'].notna().sum()),
        'n_pvalue_missing': int(res['pvalue'].isna().sum()),
        'n_padj_missing': int(res['padj'].isna().sum()),
        'n_up': int((sig['log2FoldChange'] > 0).sum()),
        'n_down': int((sig['log2FoldChange'] < 0).sum()),
        'top_genes': json.loads(res.head(10).to_json(orient='records')),
        'summary': {
            'mean_baseMean': round(float(res['baseMean'].mean()), 2),
            'median_padj': round(float(res['padj'].median()), 4) if res['padj'].notna().any() else None,
        },
        'method': {
            'name': 'PyDESeq2 negative-binomial GLM, dispersion fit and Wald test (unshrunken LFC)',
            'method_version': DE_METHOD_PYDESEQ2,
            'backend': 'pydeseq2',
            'backend_version': pydeseq2_version,
            'design': design_formula,
            'factor': factor,
            'contrast': [factor, str(group1), str(group2)],
            'sample_order': sample_order,
            'sample_scope': 'all matched counts/meta samples; no implicit level subsetting',
            'counts_sha256': _sha(counts_file), 'meta_sha256': _sha(meta_file),
            'normalization': 'median-of-ratios (DESeq2)',
            'dispersion': 'empirical Bayes shrinkage (DESeq2)',
            'lfc_shrinkage': 'none; DeseqStats.lfc_shrink not called',
            'test': 'Wald test on NB GLM',
            'multiple_testing': 'Benjamini-Hochberg FDR',
            'threshold': 'padj < 0.05 且 |log2FC| > 1',
            'filtering': 'no hard low-count filter; refit_cooks=True, cooks_filter=True, independent_filter=True, alpha=0.05',
            'n_cpus': 1,
            'equivalence_note': '不声称与任意 R DESeq2 版本数值完全等价（跨实现差异另报）',
        },
    }
    out['out_csv'] = out_info
    if not out_csv:
        out['full_results'] = json.loads(res.to_json(orient='records'))
    return out


def _deseq2_welch(counts, meta, samples1, samples2, group1, group2, factor, factors, out_csv):
    """旧 Welch 近似（显式 legacy_welch），方法与局限如实声明。"""
    from scipy.stats import ttest_ind, false_discovery_control
    if len(samples1) < 2 or len(samples2) < 2:
        return {'error': f'每组至少需要 2 个样本才能做方差近似（当前 {group1}={len(samples1)}，'
                         f'{group2}={len(samples2)}）',
                'hint': '单样本组无法做 t 检验；请补充重复，或改用 pydeseq2 正式后端。'}
    lib = counts.astype(float)
    pos = lib[(lib > 0).all(axis=1)]
    if len(pos) > 0:
        geo = np.exp(np.log(pos).mean(axis=1))
        ratios = pos.div(geo, axis=0)
        size_factors = {c: float(round(float(np.median(ratios[c])), 6)) for c in lib.columns}
    else:
        size_factors = {c: 1.0 for c in lib.columns}
    norm = lib.div(pd.Series(size_factors), axis='columns')
    results = []
    for gene in counts.index:
        raw1 = lib.loc[gene, samples1].values.astype(float)
        raw2 = lib.loc[gene, samples2].values.astype(float)
        if np.mean(raw1) < 1 and np.mean(raw2) < 1:
            continue
        y1 = norm.loc[gene, samples1].values.astype(float)
        y2 = norm.loc[gene, samples2].values.astype(float)
        log2fc = np.log2((np.mean(y1) + 1) / (np.mean(y2) + 1))
        t_stat, pvalue = ttest_ind(np.log2(y1 + 1), np.log2(y2 + 1), equal_var=False)
        results.append({'gene': gene, 'baseMean': round(float(np.mean(np.concatenate([y1, y2]))), 2),
                        'log2FoldChange': round(float(log2fc), 4), 'pvalue': float(pvalue)})
    df = pd.DataFrame(results)
    if len(df) == 0:
        return {'error': 'No genes passed low-expression filter'}
    df['padj'] = false_discovery_control(df['pvalue'], method='bh')
    df = df.sort_values('padj')
    out_info = None
    if out_csv:
        try:
            import os
            os.makedirs(os.path.dirname(os.path.abspath(out_csv)), exist_ok=True)
            df.to_csv(out_csv, index=False)
            out_info = {'out_csv': out_csv, 'n_rows': int(len(df))}
        except Exception as e:
            out_info = {'out_csv': out_csv, 'error': f'{type(e).__name__}: {e}'}
    sig = df[(df['padj'] < 0.05) & (df['log2FoldChange'].abs() > 1)]
    out = {
        'n_genes': len(df),
        'n_up': int((sig['log2FoldChange'] > 0).sum()),
        'n_down': int((sig['log2FoldChange'] < 0).sum()),
        'top_genes': df.head(10).to_dict('records'),
        'summary': {'mean_baseMean': round(df['baseMean'].mean(), 2),
                    'median_padj': round(df['padj'].median(), 4)},
        'method': {
            'name': 'median-of-ratios normalization + Welch t-test on log2(normalized+1)',
            'method_version': DE_METHOD_WELCH,
            'backend': 'legacy_welch',
            'normalization': 'median-of-ratios size factors',
            'test': 'Welch t-test (unequal variance) on log2(normalized+1)',
            'multiple_testing': 'Benjamini-Hochberg FDR',
            'threshold': 'padj < 0.05 且 |log2FC| > 1',
            'limitations': ('非完整 DESeq2：无 NB GLM / 离散度估计 / LFC 收缩；'
                            '小样本（每组 <4）下 p 值近似，用于筛选排序而非定量结论'),
        },
        'size_factors': size_factors,
    }
    if out_info:
        out['out_csv'] = out_info
    return out


def op_gsea_python(args):
    """GSEA 富集分析（GSEApy 正式 prerank）。

    输入：de_results_file（完整排序表，非仅 DEG）+ ranking_column（默认 stat，
    不隐式回退）+ gene_set_file（GMT）或 gene_sets 命名库。
    输出 ES/NES/nominal p/FDR/leading edge/集合交集规模与完整结果落盘。
    """
    de_file = args.get('de_results_file')
    gene_set_file = args.get('gene_set_file')
    gene_sets = args.get('gene_sets')
    ranking_column = args.get('ranking_column', 'stat')
    out_csv = args.get('out_csv')
    seed = args.get('seed', 42)
    permutation_num = args.get('permutation_num', 1000)
    min_size = args.get('min_size', 15)
    max_size = args.get('max_size', 500)
    species = args.get('species')
    id_namespace = args.get('id_namespace')
    set_species = args.get('gene_set_species')
    set_id_namespace = args.get('gene_set_id_namespace')

    if not de_file:
        return {'error': 'de_results_file required'}
    if out_csv and os.path.abspath(out_csv) in {os.path.abspath(de_file),
                                                 os.path.abspath(gene_set_file) if gene_set_file else ''}:
        return {'error': 'out_csv 不得覆盖 rank/GMT 输入', 'code': 'OUTPUT_CONFLICT'}
    if not gene_set_file and not gene_sets:
        return {'error': 'gene_set_file（GMT）或 gene_sets（命名库）至少提供一项；'
                         '本工具不再回退到三个示例集合'}
    if bool(gene_set_file) == bool(gene_sets):
        return {'error': 'gene_set_file 与 gene_sets 必须二选一', 'code': 'INPUT_INVALID'}
    for key, value, lower in [('seed', seed, 0), ('permutation_num', permutation_num, 1),
                               ('min_size', min_size, 1), ('max_size', max_size, 1)]:
        if isinstance(value, bool) or not isinstance(value, int) or value < lower:
            return {'error': f'{key} 必须是 >= {lower} 的整数', 'code': 'PARAMETER_INVALID'}
    if max_size < min_size:
        return {'error': 'max_size 小于 min_size', 'code': 'PARAMETER_INVALID'}
    if species and set_species and species.casefold() != set_species.casefold():
        return {'error': f'物种冲突: rank={species}, gene_set={set_species}', 'code': 'REFERENCE_CONFLICT'}
    if id_namespace and set_id_namespace and id_namespace.casefold() != set_id_namespace.casefold():
        return {'error': f'基因 ID 命名空间冲突: rank={id_namespace}, gene_set={set_id_namespace}',
                'code': 'REFERENCE_CONFLICT'}

    try:
        de = _read_csv(de_file)
    except Exception as e:
        return {'error': f'读取失败: {type(e).__name__}: {e}'}
    if 'gene' not in de.columns:
        return {'error': f'de_results_file 缺 gene 列，实际列: {list(de.columns)}'}
    if ranking_column not in de.columns:
        return {'error': f'ranking_column {ranking_column!r} 不在结果表中，实际列: {list(de.columns)}'}

    n_input = len(de)
    if de['gene'].isna().any() or de['gene'].astype(str).str.strip().eq('').any():
        return {'error': 'gene ID 含空值', 'code': 'INPUT_INVALID'}
    if de['gene'].duplicated().any():
        return {'error': f'重复 gene ID（默认拒绝）：{list(de["gene"][de["gene"].duplicated()])[:5]}。'
                         f'需显式聚合策略才允许'}
    try:
        ranks = pd.to_numeric(de[ranking_column], errors='raise')
    except (TypeError, ValueError) as e:
        return {'error': f'ranking_column 非数值: {e}', 'code': 'INPUT_INVALID'}
    if np.isinf(ranks.to_numpy(dtype=float)).any():
        return {'error': f'ranking_column {ranking_column!r} 含 Inf', 'code': 'INPUT_INVALID'}
    n_missing_rank = int(ranks.isna().sum())
    de = de.loc[ranks.notna()].copy()
    de[ranking_column] = ranks[ranks.notna()].astype(float)
    if de.empty:
        return {'error': '没有可估计的排序值', 'code': 'NO_RANKABLE_GENES'}
    de = de.sort_values([ranking_column, 'gene'], ascending=[False, True], kind='mergesort')
    n_ties = int(de[ranking_column].duplicated().sum())

    try:
        import gseapy as gp
        gseapy_version = metadata.version("gseapy")
    except (ImportError, metadata.PackageNotFoundError) as e:
        return {'error': f'gseapy 未安装（按需依赖）：{e}', 'code': 'DEPENDENCY_MISSING',
                'dependency_missing': 'gseapy'}
    if gseapy_version != SUPPORTED_GSEAPY:
        return {'error': f'gseapy {gseapy_version} 未核验；仅支持 {SUPPORTED_GSEAPY}',
                'code': 'DEPENDENCY_VERSION_UNSUPPORTED'}

    try:
        if gene_set_file:
            sets, raw_sizes = _read_gmt(gene_set_file)
            gmt_desc = {'source': 'user_gmt', 'path': gene_set_file,
                        'byte_sha256': _sha(gene_set_file),
                        'source_version': args.get('gene_set_version'),
                        'source_name': args.get('gene_set_source'),
                        'license_info_source': args.get('gene_set_license_source')}
        else:
            if 'Hallmark' in gene_sets and ((species and species.casefold() not in ('human', 'homo sapiens'))
                                           or (id_namespace and id_namespace.casefold() not in ('symbol', 'gene_symbol'))):
                return {'error': 'MSigDB Hallmark 命名库仅接受 human/gene_symbol 声明',
                        'code': 'REFERENCE_CONFLICT'}
            organism = species or 'Human'
            sets = gp.get_library(name=gene_sets, organism=organism, max_size=100000000)
            if not sets:
                raise ValueError('命名库为空')
            raw_sizes = {k: len(v) for k, v in sets.items()}
            content = json.dumps({k: sorted(v) for k, v in sorted(sets.items())},
                                 ensure_ascii=False, separators=(',', ':')).encode('utf-8')
            gmt_desc = {'source': 'gseapy_library', 'library': gene_sets,
                        'organism': organism, 'resolved_content_sha256': hashlib.sha256(content).hexdigest(),
                        'source_version': args.get('gene_set_version'),
                        'license_info_source': args.get('gene_set_license_source')}
    except Exception as e:
        return {'error': f'基因集解析失败：{type(e).__name__}: {e}', 'code': 'GENE_SET_UNAVAILABLE'}

    if gene_set_file and species and set_species and species.casefold() != set_species.casefold():
        return {'error': 'GMT 物种声明冲突', 'code': 'REFERENCE_CONFLICT'}
    if gene_set_file and id_namespace and set_id_namespace and id_namespace.casefold() != set_id_namespace.casefold():
        return {'error': 'GMT ID 声明冲突', 'code': 'REFERENCE_CONFLICT'}
    if gene_sets and 'Hallmark' in gene_sets:
        set_species, set_id_namespace = 'human', 'gene_symbol'
    gmt_desc.update({'rank_species': species, 'rank_id_namespace': id_namespace,
                     'gene_set_species': set_species, 'gene_set_id_namespace': set_id_namespace,
                     'identity_status': 'declared_match' if species and id_namespace and set_species and set_id_namespace else 'unverified'})
    ranked = de.set_index('gene')[ranking_column].astype(float)
    ranked_genes = set(ranked.index)
    set_stats = {name: {'original_size': raw_sizes[name],
                        'unique_size': len(genes),
                        'intersection_size': len(ranked_genes.intersection(genes))}
                 for name, genes in sets.items()}
    effective_sets = {name: genes for name, genes in sets.items()
                      if min_size <= set_stats[name]['intersection_size'] <= max_size
                      and set_stats[name]['intersection_size'] < len(ranked)}
    gmt_desc.update({'n_sets_raw': len(sets), 'n_sets_effective': len(effective_sets),
                     'set_statistics': set_stats})

    try:
        if effective_sets:
            pre_res = gp.prerank(rnk=ranked, gene_sets=effective_sets,
                                 min_size=min_size, max_size=max_size,
                                 permutation_num=permutation_num, seed=seed,
                                 threads=1, no_plot=True, outdir=None)
            res_df = pre_res.res2d.copy()
        else:
            res_df = pd.DataFrame(columns=['Term', 'ES', 'NES', 'NOM p-val', 'FDR q-val', 'Lead_genes'])
    except Exception as e:
        import traceback
        return {'error': f'gseapy prerank 运行失败：{type(e).__name__}: {e}', 'code': 'BACKEND_FAILED',
                'traceback_tail': traceback.format_exc()[-800:]}

    if len(res_df):
        res_df['original_set_size'] = res_df['Term'].map(lambda x: set_stats[str(x)]['original_size'])
        res_df['intersection_size'] = res_df['Term'].map(lambda x: set_stats[str(x)]['intersection_size'])
    else:
        res_df['original_set_size'] = pd.Series(dtype='int64')
        res_df['intersection_size'] = pd.Series(dtype='int64')
    try:
        out_info = _write_table(res_df, out_csv)
    except Exception as e:
        return {'error': f'完整 GSEA 表写入失败：{type(e).__name__}: {e}', 'code': 'OUTPUT_WRITE_FAILED'}

    # 标准化结果字段（gseapy res2d 列名 Term/ES/NES/NOM p-val/FDR q-val/Lead_genes）
    def _col(df, *names):
        for n in names:
            if n in df.columns:
                return n
        return None
    term_c = _col(res_df, 'Term')
    es_c = _col(res_df, 'ES')
    nes_c = _col(res_df, 'NES')
    nom_c = _col(res_df, 'NOM p-val', 'NOM p')
    fdr_c = _col(res_df, 'FDR q-val', 'FDR q-val')
    lead_c = _col(res_df, 'Lead_genes')

    top = []
    for _, row in res_df.head(10).iterrows():
        entry = {'pathway': row.get(term_c) if term_c else None,
                 'ES': row.get(es_c) if es_c else None,
                 'NES': row.get(nes_c) if nes_c else None,
                 'nominal_p': row.get(nom_c) if nom_c else None,
                 'FDR': row.get(fdr_c) if fdr_c else None,
                 'leading_edge': row.get(lead_c) if lead_c else None}
        top.append(entry)

    out = {
        'status': 'complete' if len(res_df) else 'no_effective_sets',
        'n_pathways': len(res_df),
        'top_pathways': top,
        'n_input_rows': n_input,
        'n_rankable_rows': len(ranked),
        'n_excluded_missing_rank': n_missing_rank,
        'n_tied_rank_values': n_ties,
        'method': {
            'name': 'GSEApy prerank (formal GSEA)',
            'method_version': GSEA_METHOD_PRERANK,
            'backend': 'gseapy',
            'backend_version': gseapy_version,
            'ranking_column': ranking_column,
            'ranking_note': (f'全量排序：{len(ranked)} 个受检基因；'
                             f'排名列 {ranking_column}（未取 DEG/top10）'),
            'rank_input_sha256': _sha(de_file),
            'tie_policy': 'score descending, gene ID ascending (stable mergesort)',
            'missing_policy': 'exclude NA rank, reject infinite rank and duplicate gene',
            'seed': seed, 'permutation_num': permutation_num,
            'min_size': min_size, 'max_size': max_size,
            'gmt': gmt_desc,
            'note': 'NES 为 GSEApy 正式标准化富集分数（不使用 ES×10 简化）',
        },
        'out_csv': out_info,
        'note': 'GSEApy prerank；零有效集合时输出空完整表，不能解释为阴性富集证据',
    }
    if not out_csv:
        out['full_results'] = json.loads(res_df.to_json(orient='records'))
    return out
