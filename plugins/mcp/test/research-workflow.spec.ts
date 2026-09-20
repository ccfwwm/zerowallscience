import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { ResearchStore } from '@zerowallscience/research-store'
import { ResearchWorkflowService } from '../src/host/research-workflow.js'
const roots: string[] = []; const stores: ResearchStore[] = []
afterEach(async () => { stores.splice(0).forEach(s => s.close()); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'workflow-')); roots.push(root)
  const store = new ResearchStore(join(root, 'db.sqlite')); stores.push(store)
  let remoteStatus = 'running'
  const execute = vi.fn(async (id: string) => ({ target: id, content: [], value: { structuredContent: id === 'r.submit.script' ? { id: 'job-1', status: 'queued' } : id === 'r.get.job' ? { status: remoteStatus, progress: 25 } : id === 'r.get.job.manifest' ? { files: [{ path: 'plot.png', sha256: 'digest' }] } : {} } }))
  const backend = { ensureConnected: vi.fn(async () => undefined), executeCompactCapability: execute } as any
  const service = new ResearchWorkflowService(store, join(root, 'workflows'), backend)
  const exec = { signal: new AbortController().signal, agent: { session: { header: { cwd: root } } } } as any
  return { root, store, service, backend, execute, exec, status: (value: string) => { remoteStatus = value } }
}
const input = { operation: 'r.submit.script', arguments: { project_id: 'demo', code: 'print(1)', confirm: true }, request_id: 'submission-1' }
it('submits once, persists remote IDs, resumes queries and returns checksummed manifests', async () => {
  const f = await fixture()
  const [first, same] = await Promise.all([f.service.run('r.compute', input, f.exec), f.service.run('r.compute', input, f.exec)])
  expect(first.run_id).toBe(same.run_id); expect(first.remote_id).toBe('job-1')
  expect(f.execute.mock.calls.filter(([id]) => id === 'r.submit.script')).toHaveLength(1)
  const restored = new ResearchWorkflowService(f.store, join(f.root, 'workflows'), f.backend)
  f.status('succeeded')
  const done = await restored.status(String(first.run_id), f.exec)
  expect(done.status).toBe('succeeded'); expect(JSON.stringify(done)).toContain('digest')
  await restored.status(String(first.run_id), f.exec)
  expect(f.execute.mock.calls.filter(([id]) => id === 'r.submit.script')).toHaveLength(1)
})
it('rejects unconfirmed mutations, invalid operations, conflicting idempotency keys and another workspace', async () => {
  const f = await fixture()
  await expect(f.service.run('r.compute', { ...input, arguments: { ...input.arguments, confirm: false } }, f.exec)).rejects.toThrow('CONFIRMATION_REQUIRED')
  await expect(f.service.run('r.files', input, f.exec)).rejects.toThrow('not registered')
  const run = await f.service.run('r.compute', input, f.exec)
  await expect(f.service.run('r.compute', { ...input, arguments: { ...input.arguments, code: 'different' } }, f.exec)).rejects.toThrow('IDEMPOTENCY_CONFLICT')
  await expect(f.service.status(String(run.run_id), { ...f.exec, agent: { session: { header: { cwd: tmpdir() } } } })).rejects.toThrow('another workspace')
})
it('keeps uncertain submissions durable without retrying remote computation', async () => {
  const f = await fixture()
  f.execute.mockImplementation(async id => { if (id === 'r.submit.script') throw new Error('disconnected after submit'); return { target: id, content: [], value: { structuredContent: {} } } })
  const failed = await f.service.run('r.compute', input, f.exec)
  expect(failed.status).toBe('failed')
  expect((await f.service.run('r.compute', input, f.exec)).run_id).toBe(failed.run_id)
  expect(f.execute.mock.calls.filter(([id]) => id === 'r.submit.script')).toHaveLength(1)
})
it('allows a remote completion racing cancellation without inventing cancelled state', async () => {
  const f = await fixture(); const run = await f.service.run('r.compute', input, f.exec)
  f.status('succeeded')
  const result = await f.service.cancel(String(run.run_id), true, f.exec)
  expect(result.status).toBe('succeeded')
})
it('tracks downloads and nested advanced analysis jobs with their exact status contracts', async () => {
  const f = await fixture()
  f.execute.mockImplementation(async id => ({ target: id, content: [], value: { structuredContent: id === 'r.nhanes.ensure.available' ? { status: 'queued', download_job_id: 'download-1' } : id === 'r.nhanes.get.download.status' ? { status: 'running', progress: 10 } : {} } }))
  const result = await f.service.run('r.nhanes', { operation: 'r.nhanes.ensure.available', arguments: { project_id: 'demo', dataset: 'DEMO' }, request_id: 'download' }, f.exec)
  expect(result.remote_id).toBe('download-1'); expect(result.status).toBe('running')
  expect(f.execute).toHaveBeenCalledWith('r.nhanes.get.download.status', expect.objectContaining({ download_job_id: 'download-1' }), f.exec)
})
