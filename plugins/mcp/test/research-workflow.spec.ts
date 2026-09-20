import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { ResearchStore } from '@zerowallscience/research-store'
import { rWorkflows } from '../src/shared/r-workflows.js'
import { ResearchWorkflowService } from '../src/host/research-workflow.js'
const roots: string[] = []; const stores: ResearchStore[] = []
afterEach(async () => { stores.splice(0).forEach(s => s.close()); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'workflow-')); roots.push(root)
  const store = new ResearchStore(join(root, 'db.sqlite')); stores.push(store)
  let remoteStatus = 'running'
  const execute = vi.fn(async (id: string) => ({ target: id, content: [], value: { structuredContent: id === 'r.submit.script' ? { id: 'job-1', status: 'queued' } : id === 'r.get.job' ? { status: remoteStatus, progress: 25 } : id === 'r.get.job.manifest' ? { files: [{ path: 'plot.png', sha256: 'digest' }] } : {} } }))
  const workflowRequest = vi.fn(async (_action: string, args: any) => { const op = rWorkflows.modules.find(m => m.id === args.workflow_id)?.operations.find(o => o.id === args.operation); if (!op) throw new Error('Operation not registered'); return op })
  const backend = { workflowRequest, ensureConnected: vi.fn(async () => undefined), executeCompactCapability: execute } as any
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

it('routes GEO job_id to download status and preserves the original submission', async () => {
  const f = await fixture()
  f.execute.mockImplementation(async id => ({ target: id, content: [], value: { structuredContent: id === 'r.geo.download' ? { job_id: 'geo-download', status: 'queued', accession: 'GSE1000' } : id === 'r.geo.wait.download' ? { status: 'completed', files: ['matrix.gz'] } : {} } }))
  const run = await f.service.run('r.geo', { operation: 'r.geo.download', arguments: { accession: 'GSE1000' }, request_id: 'geo-download' }, f.exec)
  expect(run.status).toBe('succeeded')
  expect(run.submission).toMatchObject({ accession: 'GSE1000' })
  expect(f.execute).toHaveBeenCalledWith('r.geo.wait.download', expect.objectContaining({ download_job_id: 'geo-download' }), f.exec)
  expect(f.execute.mock.calls.some(([id]) => id === 'r.get.job')).toBe(false)
})
it('does not invent tasks for synchronous package operations and canonicalizes retry arguments', async () => {
  const f = await fixture()
  const args = { packages: ['Matrix'], confirm: true }
  const first = await f.service.run('r.packages', { operation: 'r.ensure.analysis.packages', arguments: args, request_id: 'packages' }, f.exec)
  const retry = await f.service.run('r.packages', { operation: 'r.ensure.analysis.packages', arguments: { confirm: true, packages: ['Matrix'] }, request_id: 'packages' }, f.exec)
  expect(first.status).toBe('succeeded'); expect(first.remote_id).toBeNull(); expect(retry.run_id).toBe(first.run_id)
})
it('treats wrapped upstream ok:false as failure', async () => {
  const f = await fixture()
  f.execute.mockResolvedValue({ target: '', content: [], value: { structuredContent: { ok: false, error: 'missing dependency' } } } as any)
  const result = await f.service.run('r.packages', { operation: 'r.ensure.analysis.packages', arguments: { packages: ['Matrix'], confirm: true }, request_id: 'failure' }, f.exec)
  expect(result.status).toBe('failed')
})
it('collects a singleton R manifest using the project-relative result path', async () => {
  const f = await fixture()
  f.execute.mockImplementation(async id => ({ target: id, content: [], value: { structuredContent: id === 'r.submit.script' ? { id: 'job-1', status: 'queued' } : id === 'r.get.job' ? { status: 'succeeded' } : id === 'r.get.job.manifest' ? { manifest: { files: { path: ['result.csv'], mime_type: ['text/csv'] } } } : {} } }))
  const run = await f.service.run('r.compute', input, f.exec)
  expect(run.artifacts).toContainEqual({ name: 'result.csv', uri: 'rmcp://demo/.zerowall/jobs/job-1/result/result.csv', mediaType: 'text/csv' })
})

it.each([
  { workflow: 'biomni', operation: 'biomni.call.tool', status: 'biomni.get.job', manifest: 'biomni.get.job.manifest', files: { outputs: [{ path: 'result.json' }] }, path: 'biomni/job-1/result.json' },
  { workflow: 'sc.knockout', operation: 'r.submit.sc.tenifold.knockout', status: 'r.get.sc.tenifold.run', manifest: 'r.get.sc.tenifold.manifest', files: { manifest: { files: [{ path: 'tables/diff_regulation.csv' }] } }, path: '.zerowall/jobs/job-1/result/tables/diff_regulation.csv' },
  { workflow: 'figureya', operation: 'figureya.run.plan', status: 'figureya.get.job', manifest: 'figureya.get.manifest', files: { job_id: 'r-job', files: [{ path: 'plot.png', project_artifact_path: 'figures/plan-1/plot.png' }] }, path: 'figures/plan-1/plot.png' },
])('collects downloadable artifacts for $workflow', async (sample) => {
  const f = await fixture()
  f.execute.mockImplementation(async id => ({ target: id, content: [], value: { structuredContent: id === sample.operation ? { job: { id: 'job-1', job_id: 'job-1', run_id: 'job-1', status: 'queued' } } : id === sample.status ? { status: 'succeeded' } : id === sample.manifest ? sample.files : {} } }))
  const run = await f.service.run(sample.workflow, { operation: sample.operation, arguments: { project_id: 'demo', confirm: true }, request_id: 'artifact' }, f.exec)
  expect(run.status).toBe('succeeded')
  expect(run.artifacts).toEqual(expect.arrayContaining([expect.objectContaining({ uri: `rmcp://demo/${sample.path}` })]))
})
