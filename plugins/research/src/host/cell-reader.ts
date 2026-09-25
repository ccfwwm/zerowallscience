// Bundled source is executed with -E -P -c; requests are JSON on stdin, never Python code.
export const CELL_READER = String.raw`
import json, sys, math, csv
import numpy as np
import h5py

BLOCK = 262144

def scalar(value):
    if isinstance(value, np.generic): value = value.item()
    if isinstance(value, bytes): return value.decode('utf-8', 'strict')
    if isinstance(value, float) and not math.isfinite(value): return None
    if isinstance(value, (str, int, float, bool)) or value is None: return value
    raise ValueError('Unsupported metadata scalar')

def local_tree(group, seen=None):
    seen = set() if seen is None else seen
    address = h5py.h5o.get_info(group.id).addr
    if address in seen: return
    seen.add(address)
    for key in group:
        if not isinstance(group.get(key, getlink=True), h5py.HardLink):
            raise ValueError('H5AD links outside the local object tree are unsupported')
        obj = group[key]
        if isinstance(obj, h5py.Group): local_tree(obj, seen)
        elif obj.is_virtual or obj.external: raise ValueError('External/virtual HDF5 datasets are unsupported')

def values(ds, start=0, stop=None):
    if not isinstance(ds, h5py.Dataset) or ds.ndim != 1: raise ValueError('Expected a one-dimensional metadata column')
    stop = ds.shape[0] if stop is None else stop
    return [scalar(v) for v in ds[start:stop]]

def index_key(group):
    key = scalar(group.attrs.get('_index', '_index'))
    if key not in group: raise ValueError('Missing declared dataframe index: ' + str(key))
    return key

def column(group, key, start, stop):
    obj = group[key]
    if isinstance(obj, h5py.Dataset): return values(obj, start, stop)
    encoding = scalar(obj.attrs.get('encoding-type', ''))
    if encoding == 'categorical':
        codes = obj['codes'][start:stop]
        if codes.dtype.kind not in 'iu': raise ValueError('Categorical codes must be integers')
        cats = obj['categories']
        if np.any(codes < -1) or np.any(codes >= cats.shape[0]): raise ValueError('Invalid categorical code')
        lookup = {int(c): scalar(cats[int(c)]) for c in np.unique(codes) if c >= 0}
        return [lookup[int(c)] if c >= 0 else None for c in codes]
    if encoding in ('nullable-integer', 'nullable-boolean', 'nullable-string-array'):
        data = values(obj['values'], start, stop); mask = obj['mask'][start:stop]
        return [None if missing else v for v, missing in zip(data, mask)]
    raise ValueError('Unsupported obs column encoding: ' + str(encoding))

def column_size(obj):
    ds = obj if isinstance(obj, h5py.Dataset) else obj.get('codes', obj.get('values'))
    if ds is None or ds.ndim != 1: raise ValueError('Unsupported metadata column shape')
    if isinstance(obj, h5py.Group) and 'mask' in obj and obj['mask'].shape != ds.shape: raise ValueError('Nullable mask shape mismatch')
    return ds.shape[0]

def index_values(group, start=0, stop=None):
    key = index_key(group)
    size = column_size(group[key])
    entries = column(group, key, start, size if stop is None else stop)
    if any(entry is None for entry in entries): raise ValueError('Declared dataframe index contains missing values')
    return entries

def inspect(f):
    if scalar(f.attrs.get('encoding-type', '')) != 'anndata' or any(k not in f for k in ('obs', 'var', 'X')):
        raise ValueError('Not a supported AnnData file: anndata encoding, obs, var and X are required')
    local_tree(f)
    x = f['X']; shape = x.shape if isinstance(x, h5py.Dataset) else x.attrs.get('shape', ())
    if len(shape) != 2 or any(int(v) != v or v < 1 for v in shape): raise ValueError('AnnData X must have two nonempty dimensions')
    n, p = map(int, shape)
    if n > 2000000 or p > 200000: raise ValueError('Dataset exceeds local reader dimension limits')
    if isinstance(x, h5py.Dataset):
        if x.dtype.kind not in 'fiu': raise ValueError('X must be a real numeric matrix')
    else:
        enc = scalar(x.attrs.get('encoding-type', ''))
        if enc not in ('csr_matrix', 'csc_matrix'): raise ValueError('Unsupported sparse encoding')
        major, minor = (n, p) if enc == 'csr_matrix' else (p, n)
        if any(k not in x for k in ('indptr', 'indices', 'data')): raise ValueError('Incomplete sparse matrix')
        if x['indptr'].shape != (major+1,) or x['indices'].shape != x['data'].shape or x['data'].ndim != 1: raise ValueError('Sparse shape mismatch')
        if x['data'].dtype.kind not in 'fiu' or x['indices'].dtype.kind not in 'iu' or x['indptr'].dtype.kind not in 'iu': raise ValueError('Invalid sparse numeric types')
        ptr = x['indptr'][:]
        if ptr[0] != 0 or ptr[-1] != x['data'].shape[0] or np.any(ptr[1:] < ptr[:-1]): raise ValueError('Invalid sparse pointers')
    columns = {}
    for name, size in (('obs', n), ('var', p)):
        g = f[name]; idx = index_key(g)
        if len(g) > 257: raise ValueError('Too many metadata columns for bounded preview')
        if any(column_size(g[k]) != size for k in g): raise ValueError(name + ' column length does not match X')
        columns[name] = [{'name': k, 'kind': str(g[k].dtype) if isinstance(g[k], h5py.Dataset) else scalar(g[k].attrs.get('encoding-type', 'unknown'))} for k in g if k != idx]
    embeddings = []
    for key, obj in f.get('obsm', {}).items():
        if isinstance(obj, h5py.Dataset) and obj.ndim == 2 and obj.shape[1] >= 2:
            if obj.shape[0] != n or obj.dtype.kind not in 'fiu': raise ValueError('Embedding dimensions/type do not match obs')
            embeddings.append({'key': key, 'dimensions': obj.shape[1]})
    return {'encodingType': 'anndata', 'nObs': n, 'nVars': p, 'obsColumns': columns['obs'], 'varColumns': columns['var'], 'varNames': index_values(f['var'], 0, min(p, 10000)), 'varNamesTruncated': p > 10000, 'embeddings': embeddings, 'backed': True}

def numeric(data):
    data = np.asarray(data, dtype=np.float64)
    if not np.isfinite(data).all(): raise ValueError('Non-finite expression values cannot be treated as zero')
    return data

def matrix_statistics(x, n, p, gene, full, limit):
    count = n if full else limit
    totals = np.zeros(count); detected = np.zeros(count, dtype=np.int64); expression = np.zeros(count)
    if isinstance(x, h5py.Dataset):
        if not full:
            if gene is not None: expression[:] = numeric(x[:count, gene])
            return totals, detected, expression
        rows = max(1, BLOCK // p)
        for start in range(0, n, rows):
            stop = min(n, start + rows); block = numeric(x[start:stop, :])
            totals[start:stop] = block.sum(axis=1); detected[start:stop] = np.count_nonzero(block, axis=1)
            if gene is not None: expression[start:stop] = block[:, gene]
    else:
        csr = scalar(x.attrs['encoding-type']) == 'csr_matrix'; ptr = x['indptr'][:]
        # Cache bounded contiguous sparse storage blocks. Per-row HDF5 reads turn
        # a 100k-cell CSR preview into hundreds of thousands of dataset accesses.
        cache_start = -1; cached_ix = None; cached_data = None
        majors = range(n if full else count) if csr else (range(p) if full else ([] if gene is None else [gene]))
        bound = p if csr else n
        for major in majors:
            previous = -1
            start = int(ptr[major]); end = int(ptr[major+1])
            while start < end:
                block_start = start // BLOCK * BLOCK
                if cache_start != block_start:
                    cache_start = block_start
                    cached_ix = np.asarray(x['indices'][block_start:block_start+BLOCK], dtype=np.int64)
                    cached_data = numeric(x['data'][block_start:block_start+BLOCK])
                stop = min(end, block_start + BLOCK)
                ix = cached_ix[start-block_start:stop-block_start]; data = cached_data[start-block_start:stop-block_start]
                # Reject noncanonical sparse input rather than dropping duplicate entries silently.
                if len(ix) and (ix[0] <= previous or ix[-1] >= bound or np.any(ix[1:] <= ix[:-1])): raise ValueError('Sparse indices must be sorted, unique and in bounds')
                if len(ix): previous = int(ix[-1])
                if csr:
                    if full: totals[major] += data.sum(); detected[major] += np.count_nonzero(data)
                    if gene is not None: expression[major] += data[ix == gene].sum()
                else:
                    keep = ix < count; ix, data = ix[keep], data[keep]
                    if full: totals[ix] += data; detected[ix] += (data != 0)
                    if major == gene: expression[ix] = data
                start = stop
    if not np.isfinite(totals).all(): raise ValueError('Expression sum overflow')
    return totals, detected, expression

def stats(values):
    return {'min': float(np.min(values)), 'max': float(np.max(values)), 'mean': float(np.mean(values))}

def peak_memory():
    if sys.platform == 'win32':
        import ctypes
        from ctypes import wintypes
        class Counters(ctypes.Structure):
            _fields_ = [('cb', wintypes.DWORD), ('PageFaultCount', wintypes.DWORD)] + [(name, ctypes.c_size_t) for name in ('PeakWorkingSetSize', 'WorkingSetSize', 'QuotaPeakPagedPoolUsage', 'QuotaPagedPoolUsage', 'QuotaPeakNonPagedPoolUsage', 'QuotaNonPagedPoolUsage', 'PagefileUsage', 'PeakPagefileUsage')]
        counters = Counters(); counters.cb = ctypes.sizeof(counters)
        kernel = ctypes.WinDLL('kernel32', use_last_error=True); kernel.GetCurrentProcess.restype = wintypes.HANDLE
        query = ctypes.WinDLL('psapi', use_last_error=True).GetProcessMemoryInfo
        query.argtypes = [wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD]
        if query(kernel.GetCurrentProcess(), ctypes.byref(counters), counters.cb): return int(counters.PeakWorkingSetSize)
        return None
    import resource
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(value if sys.platform == 'darwin' else value * 1024)

def selected_points(points, polygon):
    x, y = points[:,0], points[:,1]
    inside = np.zeros(len(points), dtype=bool); boundary = np.zeros(len(points), dtype=bool)
    for i, (ax,ay) in enumerate(polygon):
        bx,by = polygon[(i+1)%len(polygon)]
        cross = (x-ax)*(by-ay)-(y-ay)*(bx-ax)
        boundary |= (np.abs(cross) <= 1e-10) & (x >= min(ax,bx)-1e-10) & (x <= max(ax,bx)+1e-10) & (y >= min(ay,by)-1e-10) & (y <= max(ay,by)+1e-10)
        if ay != by: inside ^= ((ay > y) != (by > y)) & (x < ax + (y-ay)*(bx-ax)/(by-ay))
    return inside | boundary

def selection_result(f, info, geometry, preview_limit, export_path=None):
    emb = geometry['embedding']; n = info['nObs']
    if emb not in [e['key'] for e in info['embeddings']]: raise ValueError('Unknown selection embedding: ' + emb)
    if geometry['axes'] != [0,1]: raise ValueError('Selection axes must be [0,1]')
    result = {'geometry': geometry, 'count': 0, 'total': n, 'scope': 'all-observations', 'boundary': 'included', 'tolerance': 1e-10, 'previewIndices': [], 'sample': []}
    output = open(export_path, 'x', encoding='utf-8', newline='') if export_path else None
    try:
        writer = csv.writer(output) if output else None
        if writer: writer.writerow(['observation_index_0based', 'cell_id'])
        ds = f['obsm'][emb]; obs = f['obs']
        for start in range(0,n,10000):
            stop = min(n,start+10000); points = numeric(ds[start:stop,:2]); indices = np.flatnonzero(selected_points(points, geometry['polygon']))
            result['count'] += int(len(indices))
            result['previewIndices'].extend(int(start+i) for i in indices if start+i < preview_limit)
            if writer or len(result['sample']) < 100:
                ids = index_values(obs,start,stop)
                for i in indices:
                    index = int(start+i); cell_id = str(ids[int(i)])
                    if len(result['sample']) < 100: result['sample'].append({'index': index, 'id': cell_id})
                    if writer: writer.writerow([index,cell_id])
    finally:
        if output: output.close()
    return result

def main(req):
    with h5py.File(req['path'], 'r') as f:
        info = inspect(f); n, p = info['nObs'], info['nVars']; limit = min(req['cellLimit'], n); emb_limit = min(req['embeddingLimit'], n)
        obs = f['obs']; ids = index_values(obs, 0, limit)
        cols = {c['name']: column(obs, c['name'], 0, limit) for c in info['obsColumns']}
        group = req.get('groupBy')
        if group and group not in cols: raise ValueError('Unknown obs group column: ' + group)
        result = {'summary': info, 'cells': [{'index': i, 'id': str(ids[i]), 'obs': {k: v[i] for k, v in cols.items()}} for i in range(limit)], 'sampling': 'first-n', 'truncated': limit < n}
        geometry = req.get('selection')
        if req['action'] == 'export_selection' and not geometry: raise ValueError('Save a cell selection before exporting')
        if geometry: result['selection'] = selection_result(f, info, geometry, emb_limit, req.get('selectionOutput'))
        emb = req.get('embedding') or next((e['key'] for e in info['embeddings'] if 'umap' in e['key'].lower()), info['embeddings'][0]['key'] if info['embeddings'] else None)
        if emb:
            if emb not in [e['key'] for e in info['embeddings']]: raise ValueError('Unknown embedding: ' + emb)
            points = []
            for start in range(0,emb_limit,10000):
                stop = min(emb_limit,start+10000); arr = numeric(f['obsm'][emb][start:stop,:3]); groups = column(obs,group,start,stop) if group else None
                for i,row in enumerate(arr): points.append({'index': start+i, 'x': float(row[0]), 'y': float(row[1]), **({'z': float(row[2])} if len(row) > 2 else {}), **({'group': groups[i]} if groups is not None else {})})
            result['embedding'] = {'key': emb, 'dimensions': f['obsm'][emb].shape[1], 'points': points}
        gene = req.get('gene'); gene_index = None
        if gene:
            matches = []; var = f['var']
            for start in range(0, p, 10000): matches.extend(start+i for i,v in enumerate(index_values(var, start, min(p,start+10000))) if v == gene)
            if len(matches) != 1: raise ValueError('Gene must match exactly one var index entry: ' + gene)
            gene_index = matches[0]
        full = req['action'] in ('analyze', 'export')
        if full or gene:
            expression_limit = max(limit,emb_limit)
            totals, detected, expression = matrix_statistics(f['X'], n, p, gene_index, full, expression_limit)
            if gene: result['expression'] = {'gene': gene, 'values': [{'index': i, 'value': float(v)} for i,v in enumerate(expression[:expression_limit])]}
            if full:
                analysis = {'qc': {'cells': n, 'genes': p, 'totalCounts': stats(totals), 'detectedGenes': stats(detected), 'notes': ['Whole-X descriptive statistics; preview truncation does not truncate analysis.', 'X scale is unverified: sums are not necessarily raw counts; detected means nonzero, not a biological marker.', 'No normalization, imputation or group inference was performed.']}}
                if gene: analysis['gene'] = {'gene': gene, 'cells': n, 'detectedCells': int(np.count_nonzero(expression)), 'mean': float(np.mean(expression)), 'max': float(np.max(expression))}
                if group:
                    buckets = {}
                    for start in range(0,n,10000):
                        vals = column(obs, group, start, min(n,start+10000))
                        for i,v in enumerate(vals):
                            key = json.dumps(v, ensure_ascii=False); bucket = buckets.setdefault(key, [v,0,0.0]); bucket[1] += 1; bucket[2] += float(totals[start+i])
                            if len(buckets) > 10000: raise ValueError('Group column exceeds 10000 categories')
                    analysis['groups'] = [{'group': v[0], 'cells': v[1], 'meanTotalCounts': v[2]/v[1]} for v in buckets.values()]
                result['analysis'] = analysis
        result['runtime'] = {'python': sys.version.split()[0], 'h5py': h5py.__version__, 'numpy': np.__version__, 'matrixBlockElements': BLOCK, 'peakResidentMemoryBytes': peak_memory()}
        print(json.dumps(result, ensure_ascii=True, allow_nan=False))

try:
    main(json.load(sys.stdin))
except Exception as exc:
    print(json.dumps({'error': str(exc)}, ensure_ascii=True))
    sys.exit(1)
`
