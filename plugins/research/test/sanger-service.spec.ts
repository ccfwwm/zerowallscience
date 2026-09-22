import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import { SangerService } from '../src/host/sanger.js'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
function u32(value: number): number[] { return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255] }
function fixtureScf(): Uint8Array {
  const sampleCount = 4; const baseCount = 2; const sampleOffset = 128; const baseOffset = 128 + sampleCount * 4; const bytes = new Uint8Array(baseOffset + baseCount * 12)
  bytes.set([46, 115, 99, 102]); bytes.set(u32(sampleCount), 4); bytes.set(u32(sampleOffset), 8); bytes.set(u32(baseCount), 12); bytes.set(u32(baseOffset), 24); bytes.set([51, 46, 48, 48], 36); bytes.set(u32(1), 40)
  // Zero second differences produce flat traces; the base probability planes carry the calls.
  for (let index = 0; index < baseCount; index++) bytes.set(u32(index + 1), baseOffset + index * 4)
  const p = baseOffset + baseCount * 4; bytes.set([255, 220], p); bytes.set([0, 20], p + baseCount); bytes.set([0, 20], p + baseCount * 2); bytes.set([0, 20], p + baseCount * 3); bytes.set([65, 67], p + baseCount * 4)
  return bytes
}

it('opens, analyzes and exports a bounded SCF result with provenance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sanger-service-')); const projectRoot = join(root, 'project'); await mkdir(projectRoot); const store = new ResearchStore(join(root, 'store.sqlite')); const service = new SangerService(store)
  cleanups.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'Sanger', rootPath: projectRoot }); const path = join(projectRoot, 'read.scf'); await writeFile(path, fixtureScf()); const asset = store.createDataAsset({ projectId: project.id, name: 'Read', uri: pathToFileURL(path).href, location: 'local', mediaType: 'application/octet-stream' })
  const opened = await service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id }); expect(opened.trace?.bases.map(base => base.base)).toEqual(['A', 'C']); const viewer = opened.viewer!
  const analyzed = await service.execute(project, { sessionId: 's', action: 'analyze', viewerId: viewer.id, expectedVersion: viewer.version, threshold: .8, window: 2, reference: 'AC' }); expect(analyzed.analysis?.reference?.identity).toBe(1)
  const exported = await service.execute(project, { sessionId: 's', action: 'export', viewerId: viewer.id, expectedVersion: analyzed.viewer!.version, threshold: .8, window: 2 }); expect(exported.artifact?.metadata.runner).toBe('zerowall-sanger/7.0.0-2'); expect(JSON.parse(await readFile(fileURLToPath(exported.artifact!.uri), 'utf8')).format).toBe('zerowall-sanger-result')
  await writeFile(path, Buffer.concat([Buffer.from(fixtureScf()), Buffer.from([1])]))
  await expect(service.execute(project, { sessionId: 's', action: 'analyze', viewerId: viewer.id, expectedVersion: exported.viewer!.version })).rejects.toThrow('source changed')
})

it('rejects malformed AB1 input instead of silently treating it as SCF', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sanger-ab1-')); const projectRoot = join(root, 'project'); await mkdir(projectRoot); const store = new ResearchStore(join(root, 'store.sqlite')); const service = new SangerService(store); cleanups.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'Sanger', rootPath: projectRoot }); const path = join(projectRoot, 'read.ab1'); await writeFile(path, Buffer.alloc(128)); const asset = store.createDataAsset({ projectId: project.id, name: 'AB1', uri: pathToFileURL(path).href, location: 'local', mediaType: 'application/octet-stream' })
  await expect(service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id })).rejects.toThrow('AB1 header')
})

it('requires fresh revisions and both unchanged sources for bidirectional review', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sanger-review-')); const store = new ResearchStore(join(root, 'store.sqlite')); const service = new SangerService(store)
  cleanups.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'Review', rootPath: root })
  const views = []
  for (const name of ['forward', 'reverse']) {
    const path = join(root, `${name}.scf`); await writeFile(path, name === 'reverse' ? Buffer.concat([Buffer.from(fixtureScf()), Buffer.from([2])]) : fixtureScf())
    const asset = store.createDataAsset({ projectId: project.id, name, uri: pathToFileURL(path).href, location: 'local', mediaType: 'application/octet-stream' })
    views.push((await service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id })).viewer!)
  }
  const request = { sessionId: 's', action: 'review' as const, viewerId: views[0]!.id, reverseViewerId: views[1]!.id, expectedVersion: 1, expectedReverseVersion: 1, threshold: 0, window: 1 }
  expect((await service.execute(project, request)).review?.status).toBe('discordant')
  await expect(service.execute(project, { ...request, expectedReverseVersion: 0 })).rejects.toThrow('revision conflict')
  await expect(service.execute(project, { ...request, reverseViewerId: views[0]!.id })).rejects.toThrow('distinct')
  await writeFile(join(root, 'reverse.scf'), Buffer.concat([Buffer.from(fixtureScf()), Buffer.from([1])]))
  await expect(service.execute(project, request)).rejects.toThrow('source changed')
})

it('preserves manual IUPAC revisions, rejects stale edits and invalidates derived figures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sanger-edits-')); const store = new ResearchStore(join(root, 'store.sqlite')); const service = new SangerService(store)
  cleanups.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'Edits', rootPath: root }); const path = join(root, 'read.scf'); await writeFile(path, fixtureScf())
  const asset = store.createDataAsset({ projectId: project.id, name: 'Read', uri: pathToFileURL(path).href, location: 'local', mediaType: 'application/octet-stream' })
  const opened = await service.execute(project, { sessionId: 's', action: 'open', assetId: asset.id }); const viewer = opened.viewer!
  const original = await service.execute(project, { sessionId: 's', action: 'export', viewerId: viewer.id, expectedVersion: viewer.version, threshold: 0 })
  const figure = store.createArtifact({ projectId: project.id, name: 'Derived figure', uri: pathToFileURL(join(root, 'figure.svg')).href, mediaType: 'image/svg+xml', metadata: { sourceArtifactIds: [original.artifact!.id], needsReview: false } })
  const study = store.createResearchStudy({ projectId: project.id, title: 'Trace review' }); const evidence = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'evidence', payload: { artifactId: figure.id, needsReview: false } }); const claim = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'claim', payload: { evidenceIds: [evidence.id], needsReview: false } })
  const revision = { sessionId: 's', action: 'revise' as const, viewerId: viewer.id, expectedVersion: original.viewer!.version, edits: [{ position: 1, from: 'A' as const, to: 'R' as const, reason: 'Manual mixed-peak review' }] }
  const revised = await service.execute(project, revision)
  expect(revised.trace!.bases[0]).toMatchObject({ base: 'R', quality: null, peak: 1 })
  expect(revised.analysis!.trim.sequence).toBe('RC')
  expect(revised.trace!.channels).toEqual(opened.trace!.channels)
  expect(store.listArtifacts(project.id).find(a => a.id === figure.id)!.metadata.needsReview).toBe(true)
  expect(store.getResearchDocument(evidence.id)!.payload.needsReview).toBe(true); expect(store.getResearchDocument(claim.id)!.payload.needsReview).toBe(true)
  await expect(service.execute(project, revision)).rejects.toThrow('revision conflict')
  await expect(service.execute(project, { ...revision, expectedVersion: revised.viewer!.version })).rejects.toThrow('current base')
  await expect(service.execute(project, { ...revision, expectedVersion: revised.viewer!.version, edits: [{ position: 2, from: 'C', to: 'T', reason: '' }] })).rejects.toThrow('reason')
  const restored = await service.execute(project, { sessionId: 's', action: 'analyze', viewerId: viewer.id, expectedVersion: revised.viewer!.version })
  expect(restored.analysis!.trim.sequence).toBe('RC')
  const exported = await service.execute(project, { sessionId: 's', action: 'export', viewerId: viewer.id, expectedVersion: restored.viewer!.version })
  const data = JSON.parse(await readFile(fileURLToPath(exported.artifact!.uri), 'utf8'))
  expect(data.editHistory[0].edits[0].reason).toBe('Manual mixed-peak review')
  expect(exported.artifact!.metadata.needsReview).toBe(true)
  expect(await readFile(path)).toEqual(Buffer.from(fixtureScf()))
})
