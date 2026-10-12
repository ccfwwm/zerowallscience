"""统计分析工具"""
import sys
import json
import numpy as np


def op_stats_test(args):
    """统计检验：t-test / Mann-Whitney / ANOVA / 卡方，自动检测数据类型。"""
    import pandas as pd
    from scipy import stats

    path = args.get('path')
    group_col = args.get('group_col')
    value_col = args.get('value_col')
    test_type = args.get('test_type', 'auto')  # auto | ttest | mannwhitney | anova | chi2

    if not path or not group_col or not value_col:
        return {'error': 'path, group_col, value_col required'}

    df = pd.read_csv(path)
    if group_col not in df.columns or value_col not in df.columns:
        return {'error': f'column not found: {group_col} or {value_col}'}

    groups = df[group_col].unique()
    if len(groups) < 2:
        return {'error': f'need at least 2 groups, found {len(groups)}'}

    # 自动选择检验方法
    if test_type == 'auto':
        if len(groups) == 2:
            # 检查正态性
            data_groups = [df[df[group_col] == g][value_col].dropna() for g in groups]
            normal = all(stats.shapiro(d[:5000])[1] > 0.05 for d in data_groups if len(d) > 2)
            test_type = 'ttest' if normal else 'mannwhitney'
        else:
            test_type = 'anova'

    # 执行检验
    data_groups = [df[df[group_col] == g][value_col].dropna() for g in groups]
    data_groups = [d for d in data_groups if len(d) > 0]

    if test_type == 'ttest' and len(data_groups) == 2:
        stat, p = stats.ttest_ind(data_groups[0], data_groups[1])
        test_name = 'Independent t-test'
    elif test_type == 'mannwhitney' and len(data_groups) == 2:
        stat, p = stats.mannwhitneyu(data_groups[0], data_groups[1], alternative='two-sided')
        test_name = 'Mann-Whitney U'
    elif test_type == 'anova' and len(data_groups) >= 2:
        stat, p = stats.f_oneway(*data_groups)
        test_name = 'One-way ANOVA'
    elif test_type == 'chi2':
        contingency = pd.crosstab(df[group_col], df[value_col])
        stat, p, dof, expected = stats.chi2_contingency(contingency)
        test_name = 'Chi-squared'
    else:
        return {'error': f'invalid test: {test_type} for {len(groups)} groups'}

    # 效应量
    effect_size = None
    if len(data_groups) == 2 and test_type in ('ttest', 'mannwhitney'):
        pooled_std = np.sqrt((np.var(data_groups[0], ddof=1) + np.var(data_groups[1], ddof=1)) / 2)
        if pooled_std > 0:
            cohens_d = (np.mean(data_groups[0]) - np.mean(data_groups[1])) / pooled_std
            effect_size = {'cohens_d': round(float(cohens_d), 4)}

    # 各组描述统计（仅数值列；chi2 场景 value_col 是分类变量，mean/std 无意义且会炸）
    desc = {}
    numeric = all(pd.api.types.is_numeric_dtype(d) for d in data_groups)
    for g, d in zip(groups, data_groups):
        entry = {'n': len(d)}
        if numeric:
            entry.update({
                'mean': round(float(d.mean()), 4),
                'std': round(float(d.std()), 4),
                'median': round(float(d.median()), 4),
            })
        else:
            vc = d.value_counts()
            entry.update({
                'categories': {str(k): int(v) for k, v in vc.items()},
                'note': 'value_col 为分类变量：仅计数，无数值统计',
            })
        desc[str(g)] = entry

    return {
        'test': test_name,
        'statistic': round(float(stat), 4),
        'p_value': float(f'{p:.2e}') if p < 0.001 else round(float(p), 4),
        'significant': bool(p < 0.05),
        'effect_size': effect_size,
        'group_stats': desc,
        'n_groups': len(groups),
        'n_total': len(df),
    }
