"""ML 工具集 — 生物数据机器学习分析

GN-3（2026-10-07 G 系列一期）：修复数据泄漏与验证单位。
- 划分发生在任何有拟合行为的填补/标准化/特征选择之前；
- 用 sklearn Pipeline 让每一折独立 fit（填补/标准化统计量只来自训练集）；
- 分类分层划分、回归普通划分，均记录 seed；可选 group_col，holdout/CV 内分组不跨集合，
  group/id 列不进特征；组数/类别不足时说明无法评估，不用普通随机分割绕过；
- 最终 holdout 只评估一次，不混入调参/CV；
- 保留 metrics/feature_importance 字段，新增 split_policy、train/test/group 数量、
  实际特征清单与验证范围。
"""
import sys
import json
import csv
import numpy as np


ML_POLICY_VERSION = "genie.ml_pipeline.v3"


def _finite_split(count):
    return int(count) if count is not None else 0


def op_ml_pipeline(args):
    """通用 ML 管道：读 CSV → 先划分 → Pipeline（每折独立 fit）→ 训练 → holdout 评估。"""
    import pandas as pd
    from sklearn.model_selection import (train_test_split, cross_val_score,
                                         StratifiedKFold, KFold, GroupKFold,
                                         GroupShuffleSplit)
    from sklearn.pipeline import Pipeline
    from sklearn.impute import SimpleImputer
    from sklearn.preprocessing import StandardScaler, LabelEncoder
    from sklearn.metrics import accuracy_score, r2_score, mean_squared_error

    path = args.get('path')
    target = args.get('target')
    task = args.get('task', 'classification')  # classification | regression
    model_type = args.get('model', 'random_forest')
    test_size = args.get('test_size', 0.2)
    cv = args.get('cv', 5)
    seed = args.get('seed', 42)
    group_col = args.get('group_col')
    exclude_cols = args.get('exclude_cols') or []
    if isinstance(exclude_cols, str):
        exclude_cols = [c.strip() for c in exclude_cols.split(',') if c.strip()]

    if not path or not target:
        return {'error': 'path and target required'}
    if isinstance(seed, bool) or not isinstance(seed, int) or seed < 0:
        return {'error': 'seed 必须是非负整数', 'code': 'PARAMETER_INVALID'}
    if isinstance(cv, bool) or not isinstance(cv, int) or cv < 0 or cv == 1:
        return {'error': 'cv 必须为 0（关闭）或 >=2 的整数', 'code': 'PARAMETER_INVALID'}
    if isinstance(test_size, bool) or not isinstance(test_size, (float, int)) or not 0 < test_size < 1:
        return {'error': 'test_size 必须在 (0,1) 内', 'code': 'PARAMETER_INVALID'}
    if not isinstance(exclude_cols, list) or any(not isinstance(c, str) for c in exclude_cols):
        return {'error': 'exclude_cols 必须是列名数组', 'code': 'PARAMETER_INVALID'}
    try:
        with open(path, 'r', encoding='utf-8-sig', newline='') as source:
            header = next(csv.reader(source))
        if len(header) != len(set(header)):
            return {'error': 'CSV 重复表头（含重复 target）', 'code': 'INPUT_INVALID'}
        df = pd.read_csv(path)
    except Exception as e:
        return {'error': f'CSV 读取失败: {type(e).__name__}: {e}', 'code': 'INPUT_READ_FAILED'}
    if target not in df.columns:
        return {'error': f'target column "{target}" not found', 'columns': list(df.columns)}
    if group_col is not None and group_col not in df.columns:
        return {'error': f'group_col "{group_col}" not found', 'columns': list(df.columns)}
    if group_col == target:
        return {'error': 'group_col 不能等于 target'}
    if df[target].isna().any():
        return {'error': 'target 含缺失值', 'code': 'INPUT_INVALID'}
    if group_col and (df[group_col].isna().any() or df[group_col].astype(str).str.strip().eq('').any()):
        return {'error': 'group_col 含缺失值', 'code': 'INPUT_INVALID'}
    if target in exclude_cols or (group_col and group_col in exclude_cols):
        return {'error': 'exclude_cols 不能包含 target 或 group_col', 'code': 'PARAMETER_INVALID'}
    unknown_excluded = sorted(set(exclude_cols) - set(df.columns))
    if unknown_excluded:
        return {'error': f'exclude_cols 不存在: {unknown_excluded}', 'code': 'INPUT_INVALID'}

    # 重复 target 显式处理：target 列名不得同时出现在特征列（防御性）
    y_raw = df[target]
    # 分离特征与目标；group/id 列不进特征
    drop_cols = [target, *exclude_cols]
    groups = None
    if group_col is not None:
        groups = df[group_col].astype(str).to_numpy()
        drop_cols.append(group_col)
    X = df.drop(columns=drop_cols)

    # 只保留数值特征列
    nonnumeric = list(X.select_dtypes(exclude=[np.number]).columns)
    X = X.select_dtypes(include=[np.number])
    if X.shape[1] == 0:
        return {'error': 'no numeric feature columns found (after excluding target/group)'}

    if np.isinf(X.to_numpy(dtype=float)).any():
        return {'error': '数值特征含 Inf', 'code': 'INPUT_INVALID'}
    feature_list = list(X.columns)

    # 编码目标（分类任务、字符串标签）
    le = None
    y = y_raw
    if task == 'classification' and y_raw.dtype == 'object':
        le = LabelEncoder()
        y = pd.Series(le.fit_transform(y_raw), index=df.index)

    # 模型
    from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
    from sklearn.svm import SVC, SVR
    from sklearn.linear_model import LogisticRegression, LinearRegression
    models = {
        'classification': {
            'random_forest': RandomForestClassifier(n_estimators=100, random_state=seed),
            'svm': SVC(kernel='rbf', random_state=seed),
            'logistic': LogisticRegression(max_iter=1000, random_state=seed),
        },
        'regression': {
            'random_forest': RandomForestRegressor(n_estimators=100, random_state=seed),
            'svm': SVR(kernel='rbf'),
            'linear': LinearRegression(),
        },
    }
    model = models.get(task, {}).get(model_type)
    if model is None:
        return {'error': f'unknown model: {model_type} for {task}'}

    # 划分策略：先划分（任何 fit 之前）
    split_policy = {'task': task, 'seed': seed, 'test_size': test_size,
                    'group_col': group_col, 'policy_version': ML_POLICY_VERSION,
                    'note': ('划分发生在任何填补/标准化之前；分类分层、回归普通；'
                             'group_col 时组不跨集合；最终 holdout 仅评估一次，'
                             'CV 仅在训练集上进行')}

    n_groups = None
    if groups is not None:
        n_groups = len(set(groups.tolist()))
        split_policy['n_groups'] = n_groups
        if n_groups < 2:
            return {'error': f'group_col 只有 {n_groups} 个组，无法做分组评估（不能用普通随机分割绕过）',
                    'split_policy': split_policy}
        # 分组 holdout：组不跨集合
        gss = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=seed)
        try:
            tr_idx, te_idx = next(gss.split(X, y, groups=groups))
        except ValueError as e:
            return {'error': f'分组 holdout 不可评估: {e}', 'code': 'EVALUATION_UNAVAILABLE'}
        X_train, X_test = X.iloc[tr_idx], X.iloc[te_idx]
        y_train, y_test = y.iloc[tr_idx], y.iloc[te_idx]
        split_policy['split'] = 'group_shuffle'
        split_policy['train_groups'] = int(len(set(groups[tr_idx].tolist())))
        split_policy['test_groups'] = int(len(set(groups[te_idx].tolist())))
    else:
        stratify = (y if task == 'classification' else None)
        if task == 'classification':
            vc = y.value_counts()
            if (vc < 2).any():
                return {'error': '类别样本数 <2，无法有效分层划分',
                        'code': 'EVALUATION_UNAVAILABLE', 'split_policy': split_policy}
        try:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=test_size, random_state=seed, stratify=stratify)
        except ValueError as e:
            return {'error': f'holdout 不可评估: {e}', 'code': 'EVALUATION_UNAVAILABLE'}
        split_policy['split'] = 'stratified' if stratify is not None else 'random'

    if task == 'classification':
        expected = set(y.unique())
        if set(y_train.unique()) != expected or set(y_test.unique()) != expected:
            return {'error': '训练或测试集缺少类别，holdout 不可评估',
                    'code': 'EVALUATION_UNAVAILABLE', 'split_policy': split_policy}
    split_policy['train_indices'] = [int(i) for i in X_train.index]
    split_policy['test_indices'] = [int(i) for i in X_test.index]
    split_policy['exclude_cols'] = exclude_cols
    split_policy['excluded_nonnumeric'] = nonnumeric
    split_policy['all_missing_in_train'] = [c for c in X_train if X_train[c].isna().all()]

    # Pipeline：每一折独立 fit 填补/标准化/模型
    pipeline = Pipeline([
        ('imputer', SimpleImputer(strategy='median', keep_empty_features=True)),
        ('scaler', StandardScaler()),
        ('model', model),
    ])

    # CV（仅在训练集上；分组/分层/普通按任务与 group_col）
    cv_result = {'cv': 'disabled', 'reason': 'cv=0'} if cv == 0 else None
    if cv > 0:
        try:
            if groups is not None:
                n_train_groups = len(set(groups[X_train.index].tolist()))
                n_splits = min(cv, n_train_groups)
                if n_splits < 2:
                    raise ValueError('holdout 后训练集不足两个组')
                cv_splitter = GroupKFold(n_splits=n_splits)
                cv_result = {'cv': 'group_kfold', 'n_splits': n_splits}
                splits = list(cv_splitter.split(X_train, y_train, groups=groups[X_train.index]))
            elif task == 'classification':
                n_splits = min(cv, int(y_train.value_counts().min()))
                if n_splits < 2:
                    raise ValueError('训练集最小类别不足两个样本')
                cv_splitter = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=seed)
                cv_result = {'cv': 'stratified_kfold', 'n_splits': n_splits}
                splits = list(cv_splitter.split(X_train, y_train))
            else:
                n_splits = min(cv, len(X_train))
                if n_splits < 2:
                    raise ValueError('训练样本不足两个')
                cv_splitter = KFold(n_splits=n_splits, shuffle=True, random_state=seed)
                cv_result = {'cv': 'kfold', 'n_splits': n_splits}
                splits = list(cv_splitter.split(X_train, y_train))
            for fit_idx, val_idx in splits:
                if task == 'classification' and len(set(y_train.iloc[fit_idx])) < 2:
                    raise ValueError('CV 折训练集仅一类')
                if task == 'regression' and len(val_idx) < 2:
                    raise ValueError('CV 折验证集少于两行，R2 不可估计')
            cv_result['folds'] = [
                {'train_indices': [int(i) for i in X_train.iloc[fit_idx].index],
                 'validation_indices': [int(i) for i in X_train.iloc[val_idx].index]}
                for fit_idx, val_idx in splits]
            cv_scores = cross_val_score(pipeline, X_train, y_train, cv=splits,
                                        scoring=('accuracy' if task == 'classification' else 'r2'),
                                        error_score='raise')
            if not np.isfinite(cv_scores).all():
                raise ValueError('CV 某折分数非有限')
            cv_result['cv_mean'] = round(float(cv_scores.mean()), 4)
            cv_result['cv_std'] = round(float(cv_scores.std()), 4)
        except Exception as e:
            return {'error': f'CV 不可评估: {type(e).__name__}: {e}',
                    'code': 'EVALUATION_UNAVAILABLE', 'split_policy': split_policy,
                    'cv': {'cv': 'unavailable', 'reason': str(e)}}

    # 训练（Pipeline 整体 fit，填补统计量只来自 X_train）
    try:
        pipeline.fit(X_train, y_train)
    except Exception as e:
        return {'error': f'最终训练失败: {type(e).__name__}: {e}', 'code': 'FIT_FAILED',
                'split_policy': split_policy}

    # 最终 holdout 评估（仅一次）
    try:
        y_pred = pipeline.predict(X_test)
    except Exception as e:
        return {'error': f'holdout 预测失败: {type(e).__name__}: {e}', 'code': 'PREDICT_FAILED'}

    if task == 'classification':
        metrics = {
            'accuracy': round(accuracy_score(y_test, y_pred), 4),
            'train_size': len(X_train), 'test_size': len(X_test),
            'n_features': len(feature_list),
        }
        if cv_result and 'cv_mean' in cv_result:
            metrics['cv_mean'] = cv_result['cv_mean']
            metrics['cv_std'] = cv_result['cv_std']
    else:
        metrics = {
            'r2': round(r2_score(y_test, y_pred), 4) if len(X_test) >= 2 else None,
            'r2_status': 'estimable' if len(X_test) >= 2 else 'not_estimable_single_test_row',
            'rmse': round(float(np.sqrt(mean_squared_error(y_test, y_pred))), 4),
            'train_size': len(X_train), 'test_size': len(X_test),
            'n_features': len(feature_list),
        }
        if cv_result and 'cv_mean' in cv_result:
            metrics['cv_mean'] = cv_result['cv_mean']
            metrics['cv_std'] = cv_result['cv_std']

    importance = None
    final_model = pipeline.named_steps['model']
    transformed_n_features = int(pipeline.named_steps['imputer'].transform(X_train.iloc[:1]).shape[1])
    if transformed_n_features != len(feature_list):
        return {'error': '特征变换后维度与 features_used 不一致', 'code': 'FEATURE_CONTRACT_FAILED'}
    if hasattr(final_model, 'feature_importances_'):
        imp = final_model.feature_importances_
        if len(imp) != len(feature_list):
            return {'error': 'feature_importance 维度不一致', 'code': 'FEATURE_CONTRACT_FAILED'}
        importance = dict(sorted(zip(feature_list, imp.tolist()), key=lambda x: -x[1])[:10])

    return {
        'task': task,
        'model': model_type,
        'metrics': metrics,
        'feature_importance': importance,
        'features_used': feature_list,
        'n_transformed_features': transformed_n_features,
        'excluded_columns': {'explicit': exclude_cols, 'group': group_col, 'nonnumeric': nonnumeric},
        'split_policy': split_policy,
        'cv': cv_result,
        'validation_scope': {
            'pipeline_steps': ['imputer(median)', 'scaler(standard)', 'model'],
            'holdout_evaluated_once': True,
            'cv_on_train_only': True,
            'note': ('填补/标准化统计量只来自训练集；每一折独立 fit；'
                     '最终 holdout 仅评估一次，未混入调参/CV'),
        },
    }
