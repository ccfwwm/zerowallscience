import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { ResearchStore } from '../src/index.js'

it('reserves an experiment request atomically across store connections and separates workflow owners', () => {
  const root = mkdtempSync(join(tmpdir(), 'scientific-reservation-')); const path = join(root, 'store.sqlite')
  const first = new ResearchStore(path); const second = new ResearchStore(path)
  try {
    const project = first.createProject({ name: 'Experiment', rootPath: root })
    const input = { projectId: project.id, name: 'Native scratch', command: 'fiji.scratch-wound.v2', workingDirectory: root, status: 'running' as const, leaseOwner: 'fiji-experiment' }
    const a = first.reserveScientificRun(input, 'same-request', 'a'.repeat(64)); const b = second.reserveScientificRun(input, 'same-request', 'a'.repeat(64))
    expect(a.created).toBe(true); expect(b.created).toBe(false); expect(b.run.id).toBe(a.run.id)
    expect(() => second.reserveScientificRun(input, 'same-request', 'b'.repeat(64))).toThrow('IDEMPOTENCY_CONFLICT')
    expect(second.reserveScientificRun({ ...input, leaseOwner: 'fiji-workflow' }, 'same-request', 'a'.repeat(64)).created).toBe(true)
    expect(first.listRuns(project.id)).toHaveLength(2)
  } finally { second.close(); first.close(); rmSync(root, { recursive: true, force: true }) }
})

it('rolls back all experiment artifacts when completion contains an invalid artifact', () => {
  const root = mkdtempSync(join(tmpdir(), 'scientific-finish-')); const store = new ResearchStore(join(root, 'store.sqlite'))
  try {
    const project = store.createProject({ name: 'Experiment', rootPath: root })
    const other = store.createProject({ name: 'Other', rootPath: join(root, 'other') })
    const run = store.reserveScientificRun({ projectId: project.id, name: 'Native tube', command: 'fiji.tube-formation.v2', workingDirectory: root, status: 'running', leaseOwner: 'fiji-experiment' }, 'finish-request', 'a'.repeat(64)).run
    const artifact = { projectId: project.id, runId: run.id, name: 'result.json', uri: 'file:///result.json', mediaType: 'application/json', checksum: 'b'.repeat(64) }
    expect(() => store.finishScientificRun(project.id, run.id, [artifact, { ...artifact, projectId: other.id, name: 'wrong.json' }])).toThrow('Artifact run/project mismatch')
    expect(store.listArtifacts(project.id)).toHaveLength(0); expect(store.getRun(run.id)?.status).toBe('running')
    expect(store.finishScientificRun(project.id, run.id, [artifact]).status).toBe('succeeded')
    expect(store.finishScientificRun(project.id, run.id, [artifact]).status).toBe('succeeded'); expect(store.listArtifacts(project.id)).toHaveLength(1)
  } finally { store.close(); rmSync(root, { recursive: true, force: true }) }
})
