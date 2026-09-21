import { mkdtemp, writeFile, readFile, mkdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import { ScienceViewerService } from '../src/host/science-viewer.js'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'science-viewer-'))
  const store = new ResearchStore(join(root, 'research.sqlite'))
  cleanup.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const path = join(root, 'reference.fasta')
  await writeFile(path, '>reference\nATGGAATTCTAA\n')
  const project = store.createProject({ name: 'Sequence', rootPath: root })
  const asset = store.createDataAsset({ projectId: project.id, name: 'reference', uri: pathToFileURL(path).href, mediaType: 'text/x-fasta', location: 'local' })
  const service = new ScienceViewerService(store)
  const request = { sessionId: 'session' }
  return { root, store, path, project, asset, service, request }
}

describe('science viewer asset-to-artifact chain', () => {
  it('opens, selects, analyzes and exports reproducible output without a study', async () => {
    const { store, project, asset, service, request } = await fixture()
    const opened = await service.execute(project, { ...request, action: 'open', assetId: asset.id })
    expect(opened.window?.sequence).toBe('ATGGAATTCTAA')
    const saved = await service.execute(project, { ...request, action: 'save', viewerId: opened.viewer!.id, expectedVersion: 1, state: { recordIndex: 0, start: 4, count: 6, selectionStart: 4, selectionEnd: 9 } })
    expect(saved.window).toMatchObject({ sequence: 'GAATTC', start: 4, end: 9 })
    const result = await service.execute(project, { ...request, action: 'export', viewerId: saved.viewer!.id, expectedVersion: 2, operation: 'translate' })
    expect(result.analysis?.sequence).toBe('EF')
    const bytes = await readFile(fileURLToPath(result.artifact!.uri))
    expect(result.artifact!.checksum).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(JSON.parse(bytes.toString())).toMatchObject({ assetId: asset.id, viewerVersion: 2, analysis: { start: 4, end: 9, sequence: 'EF' } })
    expect(await readFile(fileURLToPath(String(result.artifact!.metadata.fastaUri)), 'utf8')).toContain('\nEF\n')
    expect(store.listResearchStudies(project.id)).toEqual([])
    expect(store.listArtifacts(project.id)).toHaveLength(1)
  })
  it('rejects stale analysis, invalid selection and changed sources', async () => {
    const { path, project, asset, service, request } = await fixture()
    const { viewer } = await service.execute(project, { ...request, action: 'open', assetId: asset.id })
    await expect(service.execute(project, { ...request, action: 'analyze', viewerId: viewer!.id, expectedVersion: 0, operation: 'translate' })).rejects.toThrow('revision conflict')
    await expect(service.execute(project, { ...request, action: 'save', viewerId: viewer!.id, expectedVersion: 1, state: { recordIndex: 0, start: 1, count: 12, selectionStart: 1, selectionEnd: 13 } })).rejects.toThrow('Selection')
    await writeFile(path, '>reference\nATGTAATTCTAA\n')
    await expect(service.execute(project, { ...request, action: 'read', viewerId: viewer!.id })).rejects.toThrow('Source file changed')
  })
  it('blocks other project assets and junction escapes on read and export', async () => {
    const { root, store, path, project, asset, service, request } = await fixture()
    const outside = await mkdtemp(join(tmpdir(), 'science-outside-'))
    cleanup.push(async () => { await rm(outside, { recursive: true, force: true }) })
    const foreign = store.createProject({ name: 'Other', rootPath: outside })
    await expect(service.execute(foreign, { ...request, action: 'open', assetId: asset.id })).rejects.toThrow('active project')
    await writeFile(join(outside, 'escape.fa'), '>outside\nATG\n')
    await symlink(outside, join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
    const escaped = store.createDataAsset({ ...asset, uri: pathToFileURL(join(root, 'escape', 'escape.fa')).href })
    await expect(service.execute(project, { ...request, action: 'open', assetId: escaped.id })).rejects.toThrow('outside')
    const { viewer } = await service.execute(project, { ...request, action: 'open', assetId: asset.id })
    await symlink(outside, join(root, '.zerowall'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(service.execute(project, { ...request, action: 'export', viewerId: viewer!.id, expectedVersion: 1, operation: 'translate' })).rejects.toThrow('outside')
    expect(await readFile(path, 'utf8')).toContain('ATGGAATTC')
  })
  it('enforces byte limits and registered checksums', async () => {
    const { root, store, project, asset, service, request } = await fixture()
    const mismatch = store.createDataAsset({ ...asset, checksumAlgorithm: 'sha256', checksum: '0'.repeat(64) })
    await expect(service.execute(project, { ...request, action: 'open', assetId: mismatch.id })).rejects.toThrow('checksum')
    await mkdir(join(root, 'large'))
    const path = join(root, 'large', 'oversize.fa')
    await writeFile(path, '>large\n' + 'A'.repeat(16 * 1024 * 1024))
    const large = store.createDataAsset({ ...asset, uri: pathToFileURL(path).href })
    await expect(service.execute(project, { ...request, action: 'open', assetId: large.id })).rejects.toThrow('16 MiB')
  })
})
