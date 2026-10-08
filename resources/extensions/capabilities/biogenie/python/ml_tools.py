"""ML 工具集 — 生物数据机器学习分析"""
import sys
import json
import numpy as np


def op_ml_pipeline(args):
    """通用 ML 管道：读 CSV → 训练 → 评估 → 返回指标。"""
    import pandas as pd
    from sklearn.model_selection import train_test_split, cross_val_score
    from sklearn.preprocessing import StandardScaler, LabelEncoder
    from sklearn.metrics import accuracy_score, r2_score, mean_squared_error

    path = args.get('path')
    target = args.get('target')
    task = args.get('task', 'classification')  # classification | regression
    model_type = args.get('model', 'random_forest')  # random_forest | svm | logistic | linear
    test_size = args.get('test_size', 0.2)
    cv = args.get('cv', 5)

    if not path or not target:
        return {'error': 'path and target required'}

    df = pd.read_csv(path)
    if target not in df.columns:
        return {'error': f'target column "{target}" not found', 'columns': list(df.columns)}

    # 分离特征和目标
    y = df[target]
    X = df.drop(columns=[target])

    # 只保留数值列
    X = X.select_dtypes(include=[np.number])
    if X.shape[1] == 0:
        return {'error': 'no numeric feature columns found'}

    # 编码目标（分类任务）
    le = None
    if task == 'classification' and y.dtype == 'object':
        le = LabelEncoder()
        y = le.fit_transform(y)

    # 填充缺失值
    X = X.fillna(X.median())

    # 划分数据集
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_size, random_state=42)

    # 标准化
    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    # 选择模型
    from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
    from sklearn.svm import SVC, SVR
    from sklearn.linear_model import LogisticRegression, LinearRegression

    models = {
        'classification': {
            'random_forest': RandomForestClassifier(n_estimators=100, random_state=42),
            'svm': SVC(kernel='rbf', random_state=42),
            'logistic': LogisticRegression(max_iter=1000, random_state=42),
        },
        'regression': {
            'random_forest': RandomForestRegressor(n_estimators=100, random_state=42),
            'svm': SVR(kernel='rbf'),
            'linear': LinearRegression(),
        },
    }

    model = models.get(task, {}).get(model_type)
    if model is None:
        return {'error': f'unknown model: {model_type} for {task}'}

    # 训练
    model.fit(X_train_s, y_train)

    # 预测
    y_pred = model.predict(X_test_s)

    # 评估
    if task == 'classification':
        metrics = {
            'accuracy': round(accuracy_score(y_test, y_pred), 4),
            'train_size': len(X_train),
            'test_size': len(X_test),
            'n_features': X.shape[1],
        }
        # 交叉验证
        if cv > 0 and len(X) >= cv * 2:
            cv_scores = cross_val_score(model, scaler.transform(X), y, cv=min(cv, len(X) // 2), scoring='accuracy')
            metrics['cv_mean'] = round(cv_scores.mean(), 4)
            metrics['cv_std'] = round(cv_scores.std(), 4)
    else:
        metrics = {
            'r2': round(r2_score(y_test, y_pred), 4),
            'rmse': round(float(np.sqrt(mean_squared_error(y_test, y_pred))), 4),
            'train_size': len(X_train),
            'test_size': len(X_test),
            'n_features': X.shape[1],
        }

    # 特征重要性（tree-based 模型）
    importance = None
    if hasattr(model, 'feature_importances_'):
        imp = model.feature_importances_
        importance = dict(sorted(zip(X.columns.tolist(), imp.tolist()), key=lambda x: -x[1])[:10])

    return {
        'task': task,
        'model': model_type,
        'metrics': metrics,
        'feature_importance': importance,
        'features_used': list(X.columns),
    }
