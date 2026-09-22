"""Deterministic synthetic CSR AnnData fixture and independent SciPy reference.

No biological claims. Schema is AnnData 0.1.0 with dataframe/categorical/CSR
encodings; only h5py, NumPy and SciPy are needed to reproduce this fixture.
"""
import csv
import hashlib
import json
import sys
from pathlib import Path
import h5py
import numpy as np
from scipy.sparse import csr_matrix


def strings(group, name, data):
    ds = group.create_dataset(name, data=data, dtype=h5py.string_dtype())
    ds.attrs.update({'encoding-type': 'string-array', 'encoding-version': '0.2.0'})
    return ds


def make(root):
    n, p = 100000, 256
    rows = np.arange(n)
    indices = np.column_stack((rows % p, (rows + 1) % p))
    data = np.tile([1, 2], (n, 1))
    order = np.argsort(indices, axis=1)
    indices = np.take_along_axis(indices, order, axis=1).astype('int32').ravel()
    data = np.take_along_axis(data, order, axis=1).astype('int32').ravel()
    indptr = np.arange(0, 2*n+1, 2, dtype='int32')
    path = root / 'synthetic-100k-csr.h5ad'
    with h5py.File(path, 'w') as f:
        f.attrs.update({'encoding-type': 'anndata', 'encoding-version': '0.1.0'})
        x = f.create_group('X')
        x.attrs.update({'encoding-type': 'csr_matrix', 'encoding-version': '0.1.0', 'shape': [n, p]})
        for name, arr in [('indices', indices), ('data', data), ('indptr', indptr)]:
            x.create_dataset(name, data=arr, chunks=True, compression='gzip')
        obs = f.create_group('obs')
        obs.attrs.update({'encoding-type': 'dataframe', 'encoding-version': '0.2.0', '_index': '_index', 'column-order': ['donor', 'group']})
        strings(obs, '_index', ['cell_'+str(i) for i in rows])
        for name, count in [('donor', 20), ('group', 4)]:
            g = obs.create_group(name)
            g.attrs.update({'encoding-type': 'categorical', 'encoding-version': '0.2.0', 'ordered': False})
            g.create_dataset('codes', data=(rows % count).astype('int8'))
            strings(g, 'categories', [name+'_'+str(i) for i in range(count)])
        var = f.create_group('var')
        var.attrs.update({'encoding-type': 'dataframe', 'encoding-version': '0.2.0', '_index': '_index', 'column-order': np.array([], dtype=h5py.string_dtype())})
        strings(var, '_index', ['G'+str(i) for i in range(p)])
        obsm = f.create_group('obsm')
        obsm.attrs.update({'encoding-type': 'dict', 'encoding-version': '0.1.0'})
        # Structured embedding keeps the independent selection oracle analytic.
        xy = np.column_stack((rows % 1000, rows // 1000)).astype('float32')
        ds = obsm.create_dataset('X_umap', data=xy, chunks=(1000, 2), compression='gzip')
        ds.attrs.update({'encoding-type': 'array', 'encoding-version': '0.2.0'})
    return {'path': str(path), 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'nObs': n, 'nVars': p, 'nonzeroEntries': int(len(data)), 'denseFloat64Bytes': n*p*8, 'synthetic': True}


def check(root, manifest_path, selection_manifest, csv_path):
    manifest = json.loads(Path(manifest_path).read_text(encoding='utf-8'))
    selection = json.loads(Path(selection_manifest).read_text(encoding='utf-8'))['selection']
    with h5py.File(root / 'synthetic-100k-csr.h5ad', 'r') as f:
        x = f['X']; matrix = csr_matrix((x['data'][:], x['indices'][:], x['indptr'][:]), shape=tuple(x.attrs['shape']))
        totals = np.asarray(matrix.sum(axis=1)).ravel()
        detected = matrix.getnnz(axis=1)
        gene = matrix[:, 7].toarray().ravel()
        xy = f['obsm/X_umap'][:]
        donor = f['obs/donor/codes'][:]
    analysis = manifest['analysis']
    for key, arr in [('totalCounts', totals), ('detectedGenes', detected)]:
        for stat, expected in [('min', arr.min()), ('max', arr.max()), ('mean', arr.mean())]:
            np.testing.assert_allclose(analysis['qc'][key][stat], expected, rtol=0, atol=1e-12)
    assert analysis['gene']['detectedCells'] == np.count_nonzero(gene)
    np.testing.assert_allclose(analysis['gene']['mean'], gene.mean(), rtol=0, atol=1e-12)
    np.testing.assert_array_equal([v['value'] for v in manifest['preview']['expression']['values']], gene)
    for item in analysis['groups']:
        index = int(item['group'].split('_')[1]); keep = donor == index
        assert item['cells'] == np.count_nonzero(keep)
        assert item['meanTotalCounts'] == totals[keep].mean()
    # UI uses a rectangular polygon: compare against direct interval predicates,
    # independently of the production ray-crossing implementation.
    polygon = np.array(selection['geometry']['polygon'])
    assert len(np.unique(polygon[:, 0])) == 2 and len(np.unique(polygon[:, 1])) == 2
    expected = np.flatnonzero((xy[:, 0] >= polygon[:, 0].min()) & (xy[:, 0] <= polygon[:, 0].max()) & (xy[:, 1] >= polygon[:, 1].min()) & (xy[:, 1] <= polygon[:, 1].max()))
    with open(csv_path, newline='', encoding='utf-8') as handle:
        rows = list(csv.DictReader(handle))
    np.testing.assert_array_equal([int(row['observation_index_0based']) for row in rows], expected)
    assert all(row['cell_id'] == 'cell_'+str(i) for row, i in zip(rows, expected))
    assert selection['count'] == len(expected)
    return {'status': 'passed', 'oracle': 'SciPy CSR matrix sums/getnnz/column; NumPy rectangular interval selection', 'tolerance': {'absolute': 1e-12, 'relative': 0}, 'selectedCells': len(expected), 'geneDetectedCells': int(np.count_nonzero(gene)), 'geneMean': float(gene.mean()), 'donors': len(np.unique(donor)), 'versions': {'numpy': np.__version__, 'h5py': h5py.__version__}}


root = Path(sys.argv[2])
result = make(root) if sys.argv[1] == 'make' else check(root, *sys.argv[3:])
print(json.dumps(result))
