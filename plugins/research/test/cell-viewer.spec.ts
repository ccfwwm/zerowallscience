import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import { CellViewerService } from '../src/host/cell-viewer.js'
import { validateCellSelection } from '../src/shared/cell-selection.js'

const run = promisify(execFile)
const python = process.env.ZEROWALL_CELL_PYTHON || process.env.ZEROWALL_PYTHON || 'python'
const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })

it('validates embedding-space polygons before reading data', () => {
  const geometry = { embedding: 'X_umap', axes: [0,1], polygon: [[0,0],[1,0],[1,1],[0,1]] }
  expect(validateCellSelection(geometry)).toEqual(geometry)
  for (const patch of [{ axes: [1,2] }, { polygon: [[0,0],[1,1],[2,2]] }, { polygon: [[0,0],[Infinity,0],[1,1]] }, { embedding: '' }]) expect(() => validateCellSelection({ ...geometry, ...patch })).toThrow()
})

it('reads nullable-string dataframe indexes without rewriting the H5AD', async () => {
  const root = await (await import('node:fs/promises')).mkdtemp(join(tmpdir(), 'cells-nullable-index-'))
  const path = join(root, 'nullable.h5ad'); const store = new ResearchStore(join(root, 'db.sqlite'))
  cleanup.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'Nullable indexes', rootPath: root })
  const asset = store.createDataAsset({ projectId: project.id, name: 'nullable.h5ad', uri: pathToFileURL(path).href, location: 'local', mediaType: 'application/x-h5ad' })
  await run(python, ['-c', `import h5py,numpy as np,sys
with h5py.File(sys.argv[1], 'w') as f:
 f.attrs['encoding-type']='anndata'; f.create_dataset('X',data=[[1.,0.],[0.,2.]])
 for group, names in [('obs',['cell1','cell2']),('var',['G1','G2'])]:
  parent=f.create_group(group); parent.attrs['_index']='_index'; idx=parent.create_group('_index'); idx.attrs['encoding-type']='nullable-string-array'; idx.create_dataset('values',data=np.array(names,dtype=h5py.string_dtype())); idx.create_dataset('mask',data=np.zeros(len(names),dtype='bool'))
 raw=f.create_group('raw'); raw.create_dataset('X',data=[[1.,0.],[0.,2.]])
 raw_var=raw.create_group('var'); raw_var.attrs['_index']='_index'; idx=raw_var.create_group('_index'); idx.attrs['encoding-type']='nullable-string-array'; idx.create_dataset('values',data=np.array(['G1','G2'],dtype=h5py.string_dtype())); idx.create_dataset('mask',data=np.zeros(2,dtype='bool'))
 f.create_group('obsm').create_dataset('X_umap',data=[[0.,1.],[1.,0.]])
`, path])
  const service = new CellViewerService(store)
  const opened = await service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id, gene: 'G2' })
  expect(opened.preview?.summary.varNames).toEqual(['G1', 'G2'])
  expect(opened.preview?.cells.map(cell => cell.id)).toEqual(['cell1', 'cell2'])
  expect(opened.preview?.expression?.values.map(row => row.value)).toEqual([0, 2])
}, 30000)

it('selects across all 100,005 cells and streams a collection beyond the preview', async () => {
  const root = await (await import('node:fs/promises')).mkdtemp(join(tmpdir(), 'cells-selection-'))
  const path = join(root, 'selection.h5ad'); const store = new ResearchStore(join(root, 'db.sqlite')); let service = new CellViewerService(store)
  cleanup.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'Selection', rootPath: root })
  const asset = store.createDataAsset({ projectId: project.id, name: 'selection', uri: pathToFileURL(path).href, location: 'local', mediaType: 'application/x-h5ad' })
  await run(python, ['-c', `import h5py,sys,numpy as np
n=100005
with h5py.File(sys.argv[1], 'w') as f:
 f.attrs['encoding-type']='anndata'
 f.create_dataset('X',shape=(n,2),dtype='float32',chunks=(1000,2))
 f.create_group('obs').create_dataset('_index',data=['cell,'+str(i) for i in range(n)])
 f.create_group('var').create_dataset('_index',data=['A','B'])
 o=f.create_group('obsm'); o.create_dataset('X_umap',data=np.column_stack([np.arange(n),np.arange(n)%2]),chunks=(1000,2)); o.create_dataset('X_pca',data=np.column_stack([np.arange(n),np.arange(n)%2]))
`, path])
  let result = await service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id, cellLimit: 2, embeddingLimit: 2 })
  const geometry = { embedding: 'X_umap', axes: [0,1] as [0,1], polygon: [[25000,-1],[74999,-1],[74999,2],[25000,2]] as Array<[number,number]> }
  result = await service.execute(project, { sessionId: 's', action: 'select', viewerId: result.viewer!.id, expectedVersion: result.viewer!.version, selection: geometry })
  expect(result.selection).toMatchObject({ count: 50000, total: 100005, scope: 'all-observations', boundary: 'included', previewIndices: [], sample: [{ index: 25000, id: 'cell,25000' }, ...result.selection!.sample.slice(1)] })
  expect(result.selection?.sample).toHaveLength(100)
  expect(result.viewer?.state.selection).toEqual(geometry)
  service = new CellViewerService(store) // Resume from persisted state, not component memory.
  result = await service.execute(project, { sessionId: 's', action: 'export_selection', viewerId: result.viewer!.id, expectedVersion: result.viewer!.version })
  const csv = await readFile(fileURLToPath(result.artifact!.uri), 'utf8')
  expect(csv.trim().split(/\r?\n/)).toHaveLength(50001)
  expect(csv).toContain('25000,"cell,25000"')
  expect(csv).toContain('74999,"cell,74999"')
  expect(csv).not.toContain('75000,"cell,75000"')
  const manifest = JSON.parse(await readFile(fileURLToPath(String(result.artifact!.metadata.manifestUri)), 'utf8'))
  expect(manifest.selection).toMatchObject({ geometry, count: 50000 })
  expect(manifest.csv.sha256).toBe(result.artifact?.checksum)
  const camera = { zoom: 2, panX: -.5, panY: .25 }
  result = await service.execute(project, { sessionId: 's', action: 'read', viewerId: result.viewer!.id, expectedVersion: result.viewer!.version, embeddingLimit: 100000, gene: 'A', camera })
  expect(result.preview?.cells).toHaveLength(2)
  expect(result.preview?.embedding?.points).toHaveLength(100000)
  expect(result.preview?.embedding?.points.at(-1)).toMatchObject({ index: 99999, x: 99999, y: 1 })
  expect(result.preview?.expression?.values).toHaveLength(100000)
  expect(result.selection?.previewIndices).toHaveLength(50000)
  expect(result.viewer?.state.camera).toEqual(camera)
  result = await service.execute(project, { sessionId: 's', action: 'read', viewerId: result.viewer!.id, expectedVersion: result.viewer!.version, embedding: 'X_pca' })
  expect(result.selection).toBeUndefined(); expect(result.viewer?.state.selection).toBeNull()
  expect(result.viewer?.state.camera).toEqual({ zoom: 1, panX: 0, panY: 0 })
  await expect(service.execute(project, { sessionId: 's', action: 'export_selection', viewerId: result.viewer!.id, expectedVersion: result.viewer!.version })).rejects.toThrow('Save a cell selection')
}, 30000)

it('persists camera with compare-and-swap without accessing source data', async () => {
  const root = await (await import('node:fs/promises')).mkdtemp(join(tmpdir(), 'cell-camera-'))
  const db = join(root, 'db.sqlite'); const store = new ResearchStore(db)
  cleanup.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'Camera', rootPath: root })
  const foreign = store.createProject({ name: 'Foreign', rootPath: join(root, 'other') })
  const asset = store.createDataAsset({ projectId: project.id, name: 'absent.h5ad', uri: pathToFileURL(join(root, 'absent.h5ad')).href, location: 'local', mediaType: 'application/x-h5ad' })
  const viewer = store.createViewerSession({ projectId: project.id, assetId: asset.id, tool: 'cells', state: { embedding: 'X_umap' } })
  const service = new CellViewerService(store); const camera = { zoom: 3, panX: .5, panY: -.25 }
  const saved = await service.execute(project, { sessionId: 's', action: 'view', viewerId: viewer.id, expectedVersion: 1, camera })
  expect(saved.preview).toBeUndefined()
  expect(saved.viewer).toMatchObject({ version: 2, state: { camera, embedding: 'X_umap' } })
  const reconnected = new ResearchStore(db)
  try { expect(reconnected.listViewerSessions(project.id)[0]?.state.camera).toEqual(camera) } finally { reconnected.close() }
  await expect(service.execute(project, { sessionId: 's', action: 'view', viewerId: viewer.id, expectedVersion: 1, camera })).rejects.toThrow('revision conflict')
  await expect(service.execute(foreign, { sessionId: 's', action: 'view', viewerId: viewer.id, expectedVersion: 2, camera })).rejects.toThrow('active project')
  await expect(service.execute(project, { sessionId: 's', action: 'view', viewerId: viewer.id, expectedVersion: 2, camera: { ...camera, zoom: Infinity } })).rejects.toThrow('Invalid cell camera')
  expect(store.listViewerSessions(project.id)[0]?.version).toBe(2)
})

it('handles concave polygons, included edge points and reversed vertex order', async () => {
  const root = await (await import('node:fs/promises')).mkdtemp(join(tmpdir(), 'cells-concave-'))
  const path = join(root, 'cells.h5ad'); const store = new ResearchStore(join(root, 'db.sqlite')); const service = new CellViewerService(store)
  cleanup.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'Concave', rootPath: root })
  const asset = store.createDataAsset({ projectId: project.id, name: 'cells', uri: pathToFileURL(path).href, location: 'local', mediaType: 'application/x-h5ad' })
  await run(python, ['-c', `import h5py,sys
with h5py.File(sys.argv[1], 'w') as f:
 f.attrs['encoding-type']='anndata'
 f.create_dataset('X',shape=(7,1),dtype='float32')
 f.create_group('obs').create_dataset('_index',data=['a','b','c','d','e','f','g'])
 f.create_group('var').create_dataset('_index',data=['A'])
 f.create_group('obsm').create_dataset('X_umap',data=[[0.,0.],[2.,0.],[1.,1.],[2.,2.],[.5,1.5],[1.5,1.5],[1.,2.]])
`, path])
  let result = await service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id })
  const polygon: Array<[number,number]> = [[0,0],[2,0],[2,1],[1,1],[1,2],[0,2]]
  for (const vertices of [polygon, polygon.slice().reverse()]) {
    result = await service.execute(project, { sessionId: 's', action: 'select', viewerId: result.viewer!.id, expectedVersion: result.viewer!.version, selection: { embedding: 'X_umap', axes: [0,1], polygon: vertices } })
    expect(result.selection?.previewIndices).toEqual([0,1,2,4,6])
    expect(result.selection?.count).toBe(5)
  }
  result = await service.execute(project, { sessionId: 's', action: 'select', viewerId: result.viewer!.id, expectedVersion: result.viewer!.version, selection: null })
  expect(result.selection).toBeUndefined(); expect(result.viewer?.state.selection).toBeNull()
}, 30000)

it('opens, reads, QC-analyzes and exports a backed H5AD without loading the matrix into Node', async () => {
  const root = await (await import('node:fs/promises')).mkdtemp(join(tmpdir(), 'cell-viewer-')); const projectRoot = join(root, 'project'); await mkdir(projectRoot); const path = join(projectRoot, 'cells.h5ad')
  const script = `import h5py, numpy as np, sys\np=sys.argv[1]\nwith h5py.File(p, 'w') as f:\n f.attrs['encoding-type']='anndata'; f.attrs['encoding-version']='0.9.0'\n f.create_dataset('X', data=np.array([[1,0,3],[0,2,0],[4,1,0],[0,0,5]], dtype='float32'))\n obs=f.create_group('obs'); obs.create_dataset('_index', data=np.array(['c1','c2','c3','c4'], dtype=h5py.string_dtype())); obs.create_dataset('condition', data=np.array(['A','A','B','B'], dtype=h5py.string_dtype()))\n var=f.create_group('var'); var.create_dataset('_index', data=np.array(['G1','G2','G3'], dtype=h5py.string_dtype()))\n obsm=f.create_group('obsm'); obsm.create_dataset('X_umap', data=np.array([[0,1],[1,0],[2,1],[3,0]], dtype='float32'))\n`
  await run(python, ['-c', script, path]); const store = new ResearchStore(join(root, 'store.sqlite')); const service = new CellViewerService(store); cleanup.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'Cells', rootPath: projectRoot }); const asset = store.createDataAsset({ projectId: project.id, name: 'cells.h5ad', uri: pathToFileURL(path).href, location: 'local', mediaType: 'application/x-h5ad' })
  const opened = await service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id, gene: 'G2', groupBy: 'condition' }); expect(opened.viewer?.tool).toBe('cells'); expect(opened.preview?.summary).toMatchObject({ nObs: 4, nVars: 3, varNames: ['G1', 'G2', 'G3'], embeddings: [{ key: 'X_umap', dimensions: 2 }] }); expect(opened.preview?.expression?.values.map(item => item.value)).toEqual([0, 2, 1, 0])
  const analyzed = await service.execute(project, { sessionId: 's', action: 'analyze', viewerId: opened.viewer!.id, expectedVersion: opened.viewer!.version, gene: 'G2', groupBy: 'condition' }); expect(analyzed.analysis?.qc.totalCounts).toMatchObject({ min: 2, max: 5, mean: 4 }); expect(analyzed.analysis?.groups).toEqual([{ group: 'A', cells: 2, meanTotalCounts: 3 }, { group: 'B', cells: 2, meanTotalCounts: 5 }]); expect(analyzed.viewer?.version).toBe(2)
  const exported = await service.execute(project, { sessionId: 's', action: 'export', viewerId: analyzed.viewer!.id, expectedVersion: analyzed.viewer!.version, gene: 'G2', groupBy: 'condition' }); expect(exported.artifact?.metadata.runner).toBe('zerowall-cell-viewer/7.0.0-1'); expect(JSON.parse(await readFile(fileURLToPath(exported.artifact!.uri), 'utf8'))).toMatchObject({ format: 'zerowall-cell-analysis', analysis: { qc: { cells: 4, genes: 3 } } })
}, 30000)

it('rejects malformed H5AD input before creating a viewer', async () => {
  const root = await (await import('node:fs/promises')).mkdtemp(join(tmpdir(), 'cell-viewer-stale-')); const projectRoot = join(root, 'project'); await mkdir(projectRoot); const path = join(projectRoot, 'cells.h5ad'); await writeFile(path, Buffer.from('not-h5ad')); const store = new ResearchStore(join(root, 'store.sqlite')); const service = new CellViewerService(store); cleanup.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) }); const project = store.createProject({ name: 'Cells', rootPath: projectRoot }); const asset = store.createDataAsset({ projectId: project.id, name: 'cells.h5ad', uri: pathToFileURL(path).href, location: 'local', mediaType: 'application/x-h5ad' });
  await expect(service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id })).rejects.toThrow()
})

it.each(['csr', 'csc'])('reads %s-backed X with full QC while keeping the preview bounded', async encoding => {
  const root = await (await import('node:fs/promises')).mkdtemp(join(tmpdir(), 'cell-viewer-csr-')); const projectRoot = join(root, 'project'); await mkdir(projectRoot); const path = join(projectRoot, 'sparse.h5ad')
  const script = `import h5py, numpy as np, sys\np=sys.argv[1]\nwith h5py.File(p, 'w') as f:\n f.attrs['encoding-type']='anndata'\n x=f.create_group('X'); x.attrs['encoding-type']='csr_matrix'; x.attrs['shape']=(3,4); x.create_dataset('data', data=np.array([2,1,3,4], dtype='float32')); x.create_dataset('indices', data=np.array([1,3,0,2], dtype='int32')); x.create_dataset('indptr', data=np.array([0,2,3,4], dtype='int32'))\n o=f.create_group('obs'); o.attrs['_index']='cell_id'; o.create_dataset('cell_id', data=np.array(['a','b','c'], dtype=h5py.string_dtype())); v=f.create_group('var'); v.attrs['_index']='gene_id'; v.create_dataset('gene_id', data=np.array(['g1','g2','g3','g4'], dtype=h5py.string_dtype()))\n`
  const encoded = encoding === 'csr' ? script : script.replace("'csr_matrix'", "'csc_matrix'").replace('[2,1,3,4]', '[3,2,4,1]').replace('[1,3,0,2]', '[1,0,2,0]').replace('[0,2,3,4]', '[0,1,2,3,4]')
  await run(python, ['-c', encoded, path]); const store = new ResearchStore(join(root, 'store.sqlite')); const service = new CellViewerService(store); cleanup.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) }); const project = store.createProject({ name: 'CSR', rootPath: projectRoot }); const asset = store.createDataAsset({ projectId: project.id, name: 'sparse.h5ad', uri: pathToFileURL(path).href, location: 'local', mediaType: 'application/x-h5ad' })
  const opened = await service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id, cellLimit: 2, embeddingLimit: 2, gene: 'g3' }); expect(opened.preview?.summary.varNames).toEqual(['g1', 'g2', 'g3', 'g4']); expect(opened.preview?.expression?.values).toEqual([{ index: 0, value: 0 }, { index: 1, value: 0 }])
  const analyzed = await service.execute(project, { sessionId: 's', action: 'analyze', viewerId: opened.viewer!.id, expectedVersion: opened.viewer!.version, cellLimit: 2, embeddingLimit: 2, gene: 'g3' }); expect(analyzed.analysis?.qc.totalCounts).toMatchObject({ min: 3, max: 4, mean: 10 / 3 }); expect(analyzed.analysis?.gene).toMatchObject({ gene: 'g3', detectedCells: 1, max: 4 })
  expect(analyzed.preview).toMatchObject({ sampling: 'first-n', truncated: true })
  await expect(service.execute(project, { sessionId: 's', action: 'read', viewerId: opened.viewer!.id, expectedVersion: 1 })).rejects.toThrow('revision conflict')
  await writeFile(path, Buffer.concat([await readFile(path), Buffer.from([1])]))
  await expect(service.execute(project, { sessionId: 's', action: 'read', viewerId: opened.viewer!.id, expectedVersion: 2 })).rejects.toThrow('source changed')
})

it('rejects invalid options, non-finite data and external links without registering results', async () => {
  const root = await (await import('node:fs/promises')).mkdtemp(join(tmpdir(), 'cells-validation-'))
  const path = join(root, 'validation.h5ad'); const store = new ResearchStore(join(root, 'db.sqlite')); const service = new CellViewerService(store)
  cleanup.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'Validation', rootPath: root })
  const asset = store.createDataAsset({ projectId: project.id, name: 'validation', uri: pathToFileURL(path).href, location: 'local', mediaType: 'application/x-h5ad' })
  await run(python, ['-c', `import h5py,sys
with h5py.File(sys.argv[1], 'w') as f:
 f.attrs['encoding-type']='anndata'
 f.create_dataset('X', data=[[1.,0.],[0.,2.]])
 f.create_group('obs').create_dataset('_index',data=['cell1','cell2'])
 f.create_group('var').create_dataset('_index',data=['A','B'])
`, path])
  for (const cellLimit of [0, -1, 1.5, 10001]) await expect(service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id, cellLimit })).rejects.toThrow('integer')
  for (const options of [{ gene: 'missing' }, { embedding: 'missing' }, { groupBy: 'missing' }]) await expect(service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id, ...options })).rejects.toThrow()
  expect(store.listViewerSessions(project.id)).toHaveLength(0)
  await run(python, ['-c', "import h5py,sys; f=h5py.File(sys.argv[1],'r+'); f['X'][1,1]=float('nan'); f.close()", path])
  await expect(service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id, gene: 'B' })).rejects.toThrow('Non-finite')
  await run(python, ['-c', "import h5py,sys; f=h5py.File(sys.argv[1],'r+'); f['linked']=h5py.ExternalLink('outside.h5','/secret'); f.close()", path])
  await expect(service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id })).rejects.toThrow('links')
  expect(store.listArtifacts(project.id)).toHaveLength(0)
  expect(store.listViewerSessions(project.id)).toHaveLength(0)
}, 20000)

it('keeps empty CSR rows and rejects duplicate indices across a cached storage boundary', async () => {
  const root = await (await import('node:fs/promises')).mkdtemp(join(tmpdir(), 'cells-cache-'))
  const path = join(root, 'cache.h5ad'); const store = new ResearchStore(join(root, 'db.sqlite')); const service = new CellViewerService(store)
  cleanup.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'Sparse cache', rootPath: root })
  const asset = store.createDataAsset({ projectId: project.id, name: 'cache', uri: pathToFileURL(path).href, location: 'local', mediaType: 'application/x-h5ad' })
  await run(python, ['-c', `import h5py,numpy as np,sys
with h5py.File(sys.argv[1],'w') as f:
 f.attrs['encoding-type']='anndata'
 x=f.create_group('X');x.attrs['encoding-type']='csr_matrix';x.attrs['shape']=[3,200000]
 x.create_dataset('data',data=np.ones(300000,dtype='int32'))
 x.create_dataset('indices',data=np.concatenate([np.arange(200000),np.arange(100000)]).astype('int32'))
 x.create_dataset('indptr',data=[0,200000,200000,300000])
 f.create_group('obs').create_dataset('_index',data=['a','empty','c'])
 f.create_group('var').create_dataset('_index',data=['G'+str(i) for i in range(200000)])
`, path])
  const opened = await service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id, gene: 'G62144' })
  const analyzed = await service.execute(project, { sessionId: 's', action: 'analyze', viewerId: opened.viewer!.id, expectedVersion: opened.viewer!.version })
  expect(analyzed.preview?.expression?.values.map(v => v.value)).toEqual([1, 0, 1])
  expect(analyzed.analysis?.qc.totalCounts).toEqual({ min: 0, max: 200000, mean: 100000 })
  expect(analyzed.analysis?.qc.detectedGenes).toEqual({ min: 0, max: 200000, mean: 100000 })
  await run(python, ['-c', "import h5py,sys;f=h5py.File(sys.argv[1],'r+');f['X/indices'][262144]=62143;f.close()", path])
  await expect(service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id, gene: 'G62144' })).rejects.toThrow('sorted, unique')
  expect(store.listArtifacts(project.id)).toHaveLength(0)
}, 20000)
