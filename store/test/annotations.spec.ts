import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import { ResearchStore, type ImageAnnotations } from '../src/index.js'

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup() })
const payload: ImageAnnotations = { coordinates: { convention: 'pixel-edge-top-left', width: 100, height: 80, pages: 2, calibration: null }, rois: [{ id: 'r1', name: 'ROI 1', page: 0, kind: 'rectangle', x: 10, y: 20, width: 8, height: 8 }] }
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'annotation-store-')); const path = join(root, 'store.sqlite')
  const store = new ResearchStore(path)
  cleanups.push(() => { store.close(); rmSync(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'Image', rootPath: root })
  const asset = store.createDataAsset({ projectId: project.id, name: 'image', uri: 'file:///image.tif', location: 'local', mediaType: 'image/tiff' })
  const input = { projectId: project.id, assetId: asset.id, sourceSha256: 'a'.repeat(64), expectedRevisionId: null, origin: 'workbench' as const, payload }
  return { root, path, store, project, asset, input }
}
it('preserves native/workbench conflicts across connections and never overwrites a head', () => {
  const { path, store, project, input } = fixture()
  const second = new ResearchStore(path); cleanups.push(() => second.close())
  const first = store.createAnnotationRevision(input)
  const updated = store.createAnnotationRevision({ ...input, expectedRevisionId: first.head.id, payload: { ...payload, rois: [] } })
  const native = second.createAnnotationRevision({ ...input, expectedRevisionId: first.head.id, origin: 'fiji' })
  expect(native).toMatchObject({ conflict: true, head: { id: updated.head.id }, revision: { status: 'conflict', origin: 'fiji', baseRevisionId: first.head.id } })
  expect(store.listAnnotationRevisions(project.id)).toHaveLength(3)
  const resolved = store.createAnnotationRevision({ ...input, expectedRevisionId: native.head.id, payload: native.revision.payload })
  expect(resolved).toMatchObject({ conflict: false, revision: { revision: 4, status: 'accepted' } })
  expect(store.listAnnotationRevisions(project.id)[2]?.status).toBe('conflict')
  const db = new DatabaseSync(path)
  try { expect(() => db.prepare('UPDATE annotation_revisions SET status=? WHERE id=?').run('accepted', native.revision.id)).toThrow('immutable') } finally { db.close() }
})
it('isolates assets, source hashes, geometry and numeric coordinates', () => {
  const { store, project, input } = fixture()
  const first = store.createAnnotationRevision(input)
  const foreign = store.createProject({ name: 'Foreign', rootPath: 'C:/other' })
  expect(() => store.createAnnotationRevision({ ...input, projectId: foreign.id })).toThrow('belong')
  expect(() => store.createAnnotationRevision({ ...input, sourceSha256: 'b'.repeat(64), expectedRevisionId: first.head.id })).toThrow('different source')
  expect(() => store.createAnnotationRevision({ ...input, expectedRevisionId: first.head.id, payload: { ...payload, coordinates: { ...payload.coordinates, width: 200 } } })).toThrow('geometry')
  for (const roi of [{ ...payload.rois[0], x: NaN }, { ...payload.rois[0], x: 99 }, { ...payload.rois[0], page: 2 }]) {
    expect(() => store.createAnnotationRevision({ ...input, payload: { ...payload, rois: [roi as any] } })).toThrow()
  }
  expect(store.listAnnotationRevisions(project.id)).toHaveLength(1)
})
it('collects a native return atomically and idempotently across database connections', () => {
  const {store,path,project,input}=fixture()
  const first=store.createAnnotationRevision(input)
  const native={...input,expectedRevisionId:first.head.id,origin:'napari' as const}
  const artifact={projectId:project.id,name:'Native return',uri:'file:///native-return.json',mediaType:'application/json',checksum:'b'.repeat(64)}
  const result=store.collectNativeAnnotation(native,'launch-1',artifact)
  const second=new ResearchStore(path);cleanups.push(()=>second.close())
  const replay=second.collectNativeAnnotation(native,'launch-1',artifact)
  expect(replay.annotationSave.revision.id).toBe(result.annotationSave.revision.id)
  expect(replay.artifact.id).toBe(result.artifact.id)
  expect(store.listAnnotationRevisions(project.id)).toHaveLength(2)
  expect(store.listArtifacts(project.id)).toHaveLength(1)
  expect(()=>second.collectNativeAnnotation(native,'launch-1',{...artifact,checksum:'c'.repeat(64)})).toThrow('different content')
  expect(()=>store.collectNativeAnnotation({...native,expectedRevisionId:result.annotationSave.head.id},'launch-2',{...artifact,uri:''})).toThrow()
  expect(store.listAnnotationRevisions(project.id)).toHaveLength(2)
  expect(store.listAuditEvents(project.id).filter(item=>item.action==='science-annotation.collected')).toHaveLength(1)
})
it('invalidates annotation-derived artifacts, evidence and claims only when a new head is accepted', () => {
  const { store, project, asset, input } = fixture()
  const first = store.createAnnotationRevision(input)
  const artifact = store.createArtifact({ projectId: project.id, name: 'measurement', uri: 'file:///measurement.json', mediaType: 'application/json', metadata: { sourceAssetId: asset.id, annotationRevisionId: first.head.id } })
  const study = store.createResearchStudy({ projectId: project.id, title: 'Image study' })
  const evidence = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'evidence', payload: { artifactId: artifact.id } })
  const claim = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'claim', payload: { evidenceIds: [evidence.id] } })
  store.createAnnotationRevision(input)
  expect(store.listArtifacts(project.id)[0]!.metadata.needsReview).toBeUndefined()
  store.createAnnotationRevision({ ...input, expectedRevisionId: first.head.id, payload: { ...payload, rois: [] } })
  expect(store.listArtifacts(project.id)[0]!.metadata.needsReview).toBe(true)
  expect(store.getResearchDocument(evidence.id)!.payload.needsReview).toBe(true)
  expect(store.getResearchDocument(claim.id)!.payload.needsReview).toBe(true)
})
it('round-trips revision branches and remaps artifact and viewer references, rejecting corrupt ancestry', () => {
  const { store, project, asset, input } = fixture()
  const first = store.createAnnotationRevision(input)
  store.createAnnotationRevision({ ...input, expectedRevisionId: first.head.id })
  store.createAnnotationRevision({ ...input, expectedRevisionId: first.head.id, origin: 'napari' })
  store.createArtifact({ projectId: project.id, name: 'ROI export', uri: 'file:///rois.json', mediaType: 'application/json', metadata: { sourceAssetId: asset.id, annotationRevisionId: first.head.id } })
  store.createViewerSession({ projectId: project.id, assetId: asset.id, tool: 'image', state: { annotationRevisionId: first.head.id } })
  const snapshot = store.exportResearchSnapshot(project.id)
  if (snapshot.version !== 3) throw new Error('Expected v3')
  snapshot.annotationRevisions!.reverse()
  const imported = store.importResearchSnapshot(snapshot)
  const revisions = store.listAnnotationRevisions(imported.id)
  expect(revisions.map(revision => revision.status)).toEqual(['accepted','accepted','conflict'])
  expect(revisions[1]!.baseRevisionId).toBe(revisions[0]!.id)
  expect(store.listArtifacts(imported.id)[0]!.metadata.annotationRevisionId).toBe(revisions[0]!.id)
  expect(store.listViewerSessions(imported.id)[0]!.state.annotationRevisionId).toBe(revisions[0]!.id)
  snapshot.annotationRevisions![0]!.baseRevisionId = 'missing'
  expect(() => store.importResearchSnapshot(snapshot)).toThrow('base revision')
  expect(store.listProjects()).toHaveLength(2)
})
it('backs up schema 11 before migration and reads old snapshots without annotation fields', () => {
  const { path, store, project } = fixture()
  const snapshot = store.exportResearchSnapshot(project.id)
  if (snapshot.version !== 3) throw new Error('Expected v3')
  delete snapshot.annotationRevisions
  expect(store.listAnnotationRevisions(store.importResearchSnapshot(snapshot).id)).toEqual([])
  const db = new DatabaseSync(path)
  db.exec('DROP TABLE annotation_revisions; DELETE FROM schema_migrations WHERE version>=12'); db.close()
  const migrated = new ResearchStore(path)
  try { expect(migrated.schemaVersion()).toBe(16); expect(existsSync(`${path}.pre-research-v16.sqlite`)).toBe(true) } finally { migrated.close() }
})
