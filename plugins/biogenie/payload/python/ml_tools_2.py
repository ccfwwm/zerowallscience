"""ML 工具集 — 降维、聚类、特征分析"""
import sys
import json
import numpy as np


def op_ml_reduce(args):
    """降维：PCA / t-SNE / UMAP（可选），返回降维坐标 + 方差解释。"""
    import pandas as pd
    from sklearn.preprocessing import StandardScaler

    path = args.get('path')
    method = args.get('method', 'pca')  # pca | tsne
    n_components = args.get('n_components', 2)
    perplexity = args.get('perplexity', 30)

    if not path:
        return {'error': 'path required'}

    df = pd.read_csv(path)
    X = df.select_dtypes(include=[np.number]).fillna(0)
    if X.shape[1] < 2:
        return {'error': 'need at least 2 numeric columns'}

    scaler = StandardScaler()
    X_s = scaler.fit_transform(X)

    if method == 'pca':
        from sklearn.decomposition import PCA
        pca = PCA(n_components=min(n_components, X.shape[1], X.shape[0]))
        coords = pca.fit_transform(X_s)
        result = {
            'method': 'pca',
            'n_components': coords.shape[1],
            'explained_variance_ratio': [round(v, 4) for v in pca.explained_variance_ratio_],
            'cumulative_variance': [round(v, 4) for v in np.cumsum(pca.explained_variance_ratio_).tolist()],
            'n_samples': coords.shape[0],
            'coordinates': coords.tolist(),
            'columns': list(X.columns),
        }
    elif method == 'tsne':
        from sklearn.manifold import TSNE
        tsne = TSNE(n_components=min(n_components, 3), perplexity=min(perplexity, X.shape[0] - 1), random_state=42)
        coords = tsne.fit_transform(X_s)
        result = {
            'method': 'tsne',
            'n_components': coords.shape[1],
            'perplexity': perplexity,
            'n_samples': coords.shape[0],
            'coordinates': coords.tolist(),
        }
    else:
        return {'error': f'unknown method: {method}'}

    return result


def op_ml_feature(args):
    """特征重要性分析：基于随机森林的特征排序 + 相关性矩阵。"""
    import pandas as pd
    from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
    from sklearn.preprocessing import LabelEncoder

    path = args.get('path')
    target = args.get('target')
    task = args.get('task', 'classification')
    top = args.get('top', 10)

    if not path or not target:
        return {'error': 'path and target required'}

    df = pd.read_csv(path)
    if target not in df.columns:
        return {'error': f'target "{target}" not found'}

    y = df[target]
    X = df.drop(columns=[target]).select_dtypes(include=[np.number]).fillna(0)

    if X.shape[1] == 0:
        return {'error': 'no numeric features'}

    if task == 'classification' and y.dtype == 'object':
        y = LabelEncoder().fit_transform(y)

    Model = RandomForestClassifier if task == 'classification' else RandomForestRegressor
    model = Model(n_estimators=100, random_state=42)
    model.fit(X, y)

    importances = model.feature_importances_
    top_features = sorted(zip(X.columns.tolist(), importances.tolist()), key=lambda x: -x[1])[:top]

    # 相关性矩阵（前 top 列）
    top_cols = [f for f, _ in top_features]
    corr = X[top_cols].corr().round(3).to_dict()

    return {
        'task': task,
        'target': target,
        'n_features': X.shape[1],
        'top_features': [{'name': n, 'importance': round(imp, 4)} for n, imp in top_features],
        'correlation_matrix': corr,
    }


def op_ml_cluster(args):
    """聚类分析：K-Means / 层次聚类，返回标签 + 轮廓系数。"""
    import pandas as pd
    from sklearn.preprocessing import StandardScaler
    from sklearn.cluster import KMeans, AgglomerativeClustering
    from sklearn.metrics import silhouette_score

    path = args.get('path')
    method = args.get('method', 'kmeans')  # kmeans | hierarchical
    n_clusters = args.get('n_clusters', 3)

    if not path:
        return {'error': 'path required'}

    df = pd.read_csv(path)
    X = df.select_dtypes(include=[np.number]).fillna(0)
    if X.shape[0] < n_clusters:
        return {'error': f'not enough samples ({X.shape[0]}) for {n_clusters} clusters'}

    scaler = StandardScaler()
    X_s = scaler.fit_transform(X)

    if method == 'kmeans':
        model = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    elif method == 'hierarchical':
        model = AgglomerativeClustering(n_clusters=n_clusters)
    else:
        return {'error': f'unknown method: {method}'}

    labels = model.fit_predict(X_s)
    sil = silhouette_score(X_s, labels) if len(set(labels)) > 1 else None

    # 每个簇的统计
    df_result = df.copy()
    df_result['cluster'] = labels.tolist()
    cluster_stats = {}
    for c in sorted(set(labels)):
        mask = labels == c
        cluster_stats[str(c)] = {
            'count': int(mask.sum()),
            'means': {col: round(float(X.loc[mask, col].mean()), 4) for col in X.columns[:5]},
        }

    return {
        'method': method,
        'n_clusters': n_clusters,
        'silhouette_score': round(sil, 4) if sil else None,
        'labels': labels.tolist(),
        'cluster_stats': cluster_stats,
        'n_samples': X.shape[0],
    }
