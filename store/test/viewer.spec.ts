import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { ResearchStore } from '../src/index.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'science-view-store-')); roots.push(root)
  const path = join(root, 'research.sqlite')
  const store = new ResearchStore(path)
  const project = store.createProject({ name: 'Sequence', rootPath: root })
  const asset = store.createDataAsset({ projectId: project.id, name: 'reference', uri: 'file:///reference.fa', location: 'local', mediaType: 'text/x-fasta' })
  return { store, path, project, asset }
}

describe('persistent viewer sessions', () => {
  it('persists without a study and rejects concurrent writes and foreign assets', () => {
    const { store, path, project, asset } = fixture()
    const foreign = store.createProject({ name: 'Foreign', rootPath: `${project.rootPath}/foreign` })
    expect(() => store.createViewerSession({ projectId: foreign.id, assetId: asset.id, tool: 'sequence' })).toThrow('belong')
    const viewer = store.createViewerSession({ projectId: project.id, assetId: asset.id, tool: 'sequence', state: { start: 1 } })
    store.updateViewerSession(project.id, viewer.id, { expectedVersion: 1, state: { start: 9 } })
    expect(() => store.updateViewerSession(project.id, viewer.id, { expectedVersion: 1, state: {} })).toThrow('revision conflict')
    expect(() => store.updateViewerSession(foreign.id, viewer.id, { expectedVersion: 2, state: {} })).toThrow('belong')
    expect(store.listResearchStudies(project.id)).toEqual([])
    store.close()
    const reopened = new ResearchStore(path)
    expect(reopened.listViewerSessions(project.id)[0]).toMatchObject({ version: 2, state: { start: 9 } })
    reopened.close()
  })
  it('remaps viewer and asset identities in snapshots without requiring studies', () => {
    const { store, project, asset } = fixture()
    const original = store.createViewerSession({ projectId: project.id, assetId: asset.id, tool: 'sequence', state: { start: 7 } })
    const snapshot = store.exportResearchSnapshot(project.id)
    const imported = store.importResearchSnapshot(snapshot)
    const viewer = store.listViewerSessions(imported.id)[0]!
    expect(viewer.id).not.toBe(original.id)
    expect(viewer.assetId).toBe(store.listDataAssets(imported.id)[0]!.id)
    expect(viewer).toMatchObject({ projectId: imported.id, state: { start: 7 }, version: 1 })
    store.close()
  })
  it('backs up v10 metadata before adding the viewer table', () => {
    const { store, path, project } = fixture()
    store.close()
    const db = new DatabaseSync(path)
    db.exec('DROP TABLE annotation_revisions; DROP TABLE viewer_sessions; DELETE FROM schema_migrations WHERE version >= 11')
    db.close()
    const migrated = new ResearchStore(path)
    expect(migrated.schemaVersion()).toBe(17)
    expect(migrated.listViewerSessions(project.id)).toEqual([])
    expect(existsSync(`${path}.pre-research-v17.sqlite`)).toBe(true)
    migrated.close()
  })
  it('preserves v14 viewers during the cells migration and remaps cell snapshots', () => {
    const { store, path, project, asset } = fixture()
    const oldView = store.createViewerSession({ projectId: project.id, assetId: asset.id, tool: 'image', state: { page: 0 } })
    store.close()
    const db = new DatabaseSync(path)
    db.exec(`CREATE TABLE old_viewers (id TEXT PRIMARY KEY, project_id TEXT, asset_id TEXT, tool TEXT CHECK(tool IN ('sequence','image','flow')), state_json TEXT, version INTEGER, created_at TEXT, updated_at TEXT);
      INSERT INTO old_viewers SELECT * FROM viewer_sessions;
      DROP TABLE viewer_sessions; ALTER TABLE old_viewers RENAME TO viewer_sessions;
      DELETE FROM schema_migrations WHERE version >= 15;`)
    db.close()
    const migrated = new ResearchStore(path)
    try {
      expect(migrated.listViewerSessions(project.id)).toContainEqual(oldView)
      migrated.createViewerSession({ projectId: project.id, assetId: asset.id, tool: 'cells', state: { gene: 'A', embedding: 'X_pca' } })
      migrated.createViewerSession({ projectId: project.id, assetId: asset.id, tool: 'flow', state: { transform: 'arcsinh' } })
      const imported = migrated.importResearchSnapshot(migrated.exportResearchSnapshot(project.id))
      expect(migrated.listViewerSessions(imported.id).find(v => v.tool === 'cells')).toMatchObject({ state: { gene: 'A', embedding: 'X_pca' } })
      expect(migrated.listViewerSessions(imported.id).find(v => v.tool === 'flow')).toMatchObject({ state: { transform: 'arcsinh' } })
      expect(existsSync(`${path}.pre-research-v17.sqlite`)).toBe(true)
    } finally { migrated.close() }
  })
})
