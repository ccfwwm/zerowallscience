import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import { CellViewerService } from '../src/host/cell-viewer.js'

const sample = process.env.ZEROWALL_CELL_SAMPLE

it.skipIf(!sample)('opens a real nullable-index H5AD without rewriting its indexes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zerowall-cell-sample-'))
  const store = new ResearchStore(join(root, 'store.sqlite'))
  try {
    const project = store.createProject({ name: 'Sample', rootPath: dirname(sample!) })
    const asset = store.createDataAsset({ projectId: project.id, name: 'sample.h5ad', uri: pathToFileURL(sample!).href, location: 'local', mediaType: 'application/x-h5ad' })
    const opened = await new CellViewerService(store).execute(project, { sessionId: 'sample', action: 'open', assetId: asset.id })
    expect(opened.preview?.summary.nObs).toBeGreaterThan(0)
    expect(opened.preview?.summary.nVars).toBeGreaterThan(0)
    expect(opened.preview?.embedding?.points.length).toBeGreaterThan(0)
  } finally {
    store.close()
    await rm(root, { recursive: true, force: true })
  }
}, 120000)
