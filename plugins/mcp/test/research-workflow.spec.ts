import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
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
  const ensureResearchContext = vi.fn(async ({ sessionId, target }: { sessionId: string; target?: string }) => store.ensureResearchContext({ sessionId, rootPath: root, projectName: 'Workflow project', target }))
  const autoApproveResearchGate1 = vi.fn(async ({ studyId }: { sessionId: string; studyId: string; expectedVersion: number }) => {
    const study = store.getResearchStudy(studyId)!
    return { status: 'approved' as const, study: { ...study, gate1: 'approved', currentFreezeId: 'freeze-test' }, blockers: [], ruleVersion: 'test-rule-v1', freeze: { id: 'freeze-test' } }
  })
  const execute = vi.fn(async (id: string) => ({ target: id, content: [], value: { structuredContent: id === 'r.submit.script' ? { id: 'job-1', status: 'queued' } : id === 'r.get.job' ? { status: remoteStatus, progress: 25 } : id === 'r.get.job.manifest' ? { files: [{ path: 'plot.png', sha256: 'digest' }] } : {} } }))
  const workflowRequest = vi.fn(async (_action: string, args: any) => { const op = rWorkflows.modules.find(m => m.id === args.workflow_id)?.operations.find(o => o.id === args.operation); if (!op) throw new Error('Operation not registered'); return op })
  const backend = { workflowRequest, ensureConnected: vi.fn(async () => undefined), executeCompactCapability: execute } as any
  const research = { ensureResearchContext, autoApproveResearchGate1 }
  const service = new ResearchWorkflowService(store, join(root, 'workflows'), backend, undefined, () => research)
  const exec = { signal: new AbortController().signal, agent: { session: { id: 'workflow-session', header: { cwd: root } } } } as any
  return { root, store, service, backend, execute, exec, ensureResearchContext, autoApproveResearchGate1, status: (value: string) => { remoteStatus = value } }
}
const input = { operation: 'r.submit.script', arguments: { project_id: 'demo', code: 'print(1)', confirm: true }, request_id: 'submission-1' }
it('submits once, persists remote IDs, resumes queries and returns checksummed manifests', async () => {
  const f = await fixture()
  const [first, same] = await Promise.all([f.service.run('r.compute', input, f.exec), f.service.run('r.compute', input, f.exec)])
  expect(first.run_id).toBe(same.run_id); expect(first.remote_id).toBe('job-1')
  expect(f.execute.mock.calls.filter(([id]) => id === 'r.submit.script')).toHaveLength(1)
  const restored = new ResearchWorkflowService(f.store, join(f.root, 'workflows'), f.backend, undefined, () => ({ ensureResearchContext: f.ensureResearchContext, autoApproveResearchGate1: f.autoApproveResearchGate1 } as any))
  f.status('succeeded')
  const done = await restored.status(String(first.run_id), f.exec)
  expect(done.status).toBe('succeeded'); expect(JSON.stringify(done)).toContain('digest')
  await restored.status(String(first.run_id), f.exec)
  expect(f.execute.mock.calls.filter(([id]) => id === 'r.submit.script')).toHaveLength(1)
})
it('binds an optional research task to the durable remote Run and reconciles its terminal state', async () => {
  const f = await fixture()
  const project = f.store.createProject({ name: 'Workflow project', rootPath: f.root })
  const study = f.store.createResearchStudy({ projectId: project.id, title: 'Workflow study', budget: { maxRemoteThreads: 1, maxTokens: 100 } })
  const task = f.store.createResearchTask({ projectId: project.id, studyId: study.id, name: 'Remote analysis', kind: 'mr', exploratory: true, budget: { remoteThreads: 1, tokens: 100 } })
  const run = await f.service.run('r.compute', { ...input, research_task_id: task.id }, f.exec)
  expect(run.research_task_id).toBe(task.id)
  expect(f.store.getResearchStudy(study.id) && f.store.listResearchTasks(study.id)[0]?.status).toBe('running')
  f.status('succeeded')
  await f.service.status(String(run.run_id), f.exec)
  expect(f.store.listResearchTasks(study.id)[0]?.status).toBe('succeeded')
})
it('blocks confirmatory task execution before gate one and freeze', async () => {
  const f = await fixture()
  const project = f.store.createProject({ name: 'Gated project', rootPath: f.root })
  const study = f.store.createResearchStudy({ projectId: project.id, title: 'Gated study', budget: { maxTokens: 100 } })
  const task = f.store.createResearchTask({ projectId: project.id, studyId: study.id, name: 'Confirmatory', kind: 'runner', budget: { tokens: 10 } })
  f.autoApproveResearchGate1.mockResolvedValueOnce({ status: 'blocked', study, blockers: [{ code: 'PLAN_INCOMPLETE', message: 'Analysis plan is incomplete.' }], ruleVersion: 'test-rule-v1' } as any)
  const result = await f.service.run('r.compute', { ...input, research_task_id: task.id }, f.exec)
  expect(result).toMatchObject({ status: 'blocked', stage: 'pre-run-gate1', system_validation: 'blocked', study_id: study.id })
  expect(result.blockers).toEqual([{ code: 'PLAN_INCOMPLETE', message: 'Analysis plan is incomplete.' }])
  expect(f.store.listRuns(project.id)).toHaveLength(0)
})

it('ensures study context for a public GEO download but never gates download on a draft contract', async () => {
  const f = await fixture()
  f.autoApproveResearchGate1.mockClear()
  const context = f.store.ensureResearchContext({ sessionId: 'workflow-session', rootPath: f.root, projectName: 'Workflow project' })
  const task = f.store.createResearchTask({ projectId: context.project.id, studyId: context.study.id, name: 'Confirmatory follow-up', kind: 'runner', budget: { tokens: 10 } })
  f.execute.mockImplementation(async id => ({ target: id, content: [], value: { structuredContent: id === 'r.geo.download' ? { job_id: 'geo-1', status: 'queued' } : {} } }))
  const result = await f.service.run('r.geo', { operation: 'r.geo.download', arguments: { accession: 'GSE1000' }, request_id: 'geo-download-pending', research_task_id: task.id }, f.exec)
  expect(result.status).toBe('running')
  expect(f.ensureResearchContext).toHaveBeenCalledWith({ sessionId: expect.any(String) })
  expect(f.autoApproveResearchGate1).not.toHaveBeenCalled()
  expect(f.execute).toHaveBeenCalledWith('r.geo.download', expect.any(Object), f.exec)
})

it('continues public data downloads for a blocked Study while keeping confirmatory analysis paused', async () => {
  const f = await fixture()
  const context = f.store.ensureResearchContext({ sessionId: 'workflow-session', rootPath: f.root, projectName: 'Workflow project' })
  f.store.updateResearchStudy(context.study.id, { expectedVersion: context.study.version, status: 'blocked' })
  f.execute.mockImplementation(async id => ({ target: id, content: [], value: { structuredContent: id === 'r.geo.download' ? { job_id: 'geo-blocked-study', status: 'queued' } : {} } }))

  const download = await f.service.run('r.geo', { operation: 'r.geo.download', arguments: { accession: 'GSE1000' }, request_id: 'download-blocked-study' }, f.exec)
  expect(download.status).toBe('running')
  expect(f.execute).toHaveBeenCalledWith('r.geo.download', expect.any(Object), f.exec)

  const analysis = await f.service.run('r.compute', input, f.exec)
  expect(analysis).toMatchObject({ status: 'blocked', stage: 'pre-run-gate1', study_id: context.study.id, blockers: [{ code: 'STUDY_BLOCKED' }] })
  expect(f.execute.mock.calls.some(([id]) => id === 'r.submit.script')).toBe(false)
  expect(f.autoApproveResearchGate1).not.toHaveBeenCalled()
})

it.each(['draft', 'blocked'] as const)('prefetches Biomni data for a %s Study without analysis approval while preserving confirmation', async status => {
  const f = await fixture()
  const context = f.store.ensureResearchContext({ sessionId: 'workflow-session', rootPath: f.root, projectName: 'Workflow project' })
  if (status === 'blocked') f.store.updateResearchStudy(context.study.id, { expectedVersion: context.study.version, status })
  const task = f.store.createResearchTask({ projectId: context.project.id, studyId: context.study.id, name: 'Confirmatory follow-up', kind: 'runner', budget: { tokens: 10 } })
  f.execute.mockImplementation(async id => ({ target: id, content: [], value: { structuredContent: id === 'biomni.prefetch.datalake' ? { job_id: 'biomni-download', status: 'queued' } : {} } }))
  const request = { operation: 'biomni.prefetch.datalake', arguments: { datasets: ['public-data'], confirm: false }, request_id: `biomni-prefetch-${status}`, research_task_id: task.id }

  await expect(f.service.run('biomni', request, f.exec)).rejects.toThrow('CONFIRMATION_REQUIRED')
  expect(f.execute).not.toHaveBeenCalled()
  const result = await f.service.run('biomni', { ...request, arguments: { ...request.arguments, confirm: true } }, f.exec)
  expect(result).toMatchObject({ status: 'running', remote_id: 'biomni-download' })
  expect(f.execute).toHaveBeenCalledWith('biomni.prefetch.datalake', expect.objectContaining({ confirm: true }), f.exec)
  expect(f.autoApproveResearchGate1).not.toHaveBeenCalled()
})

it('automatically validates the ensured study before formal async analysis and returns recoverable blockers without submitting', async () => {
  const f = await fixture()
  f.autoApproveResearchGate1.mockImplementationOnce(async ({ studyId }) => ({ status: 'blocked', study: f.store.getResearchStudy(studyId)!, blockers: [{ code: 'DATA_CONTRACT_PENDING', message: 'Data source and variables remain unknown.' }], ruleVersion: 'test-rule-v1' }) as any)
  const result = await f.service.run('r.compute', input, f.exec)
  expect(result).toMatchObject({ status: 'blocked', stage: 'pre-run-gate1', system_validation: 'blocked', recovery: expect.stringContaining('下载可继续') })
  expect(f.autoApproveResearchGate1).toHaveBeenCalledWith({ sessionId: expect.any(String), studyId: expect.any(String), expectedVersion: expect.any(Number) })
  expect(f.execute.mock.calls.some(([id]) => id === 'r.submit.script')).toBe(false)
  expect(f.store.listRuns(f.store.ensureResearchContext({ sessionId: 'workflow-session', rootPath: f.root, projectName: 'Workflow project' }).project.id).length).toBe(0)
})

it('rechecks frozen source bytes before each new confirmatory submission and preserves the original freeze', async () => {
  const f = await fixture()
  const { project, study } = f.store.ensureResearchContext({ sessionId: 'workflow-session', rootPath: f.root, projectName: 'Workflow project' })
  const source = join(f.root, 'verified.csv')
  await writeFile(source, 'x,y\n1,2\n')
  const asset = f.store.createDataAsset({ projectId: project.id, name: 'Verified input', uri: pathToFileURL(source).href, location: 'local', mediaType: 'text/csv' })
  const contract = f.store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'dataset-contract', payload: { applicability: 'usable', sourceStatus: 'supported', source: asset.uri, assetId: asset.id, availableVariables: ['x', 'y'] } })
  const question = f.store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'question', payload: { population: 'Synthetic adults', outcome: 'y', estimand: 'mean difference' } })
  const plan = f.store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'analysis-plan', payload: { method: 'linear regression', inputs: [contract.id], stoppingConditions: ['Stop if x or y are missing'], exploratory: false } })
  f.store.updateResearchStudy(study.id, { expectedVersion: f.store.getResearchStudy(study.id)!.version, currentQuestionId: question.id, currentPlanId: plan.id })
  expect(f.store.verifyDatasetContractSource(contract.id).status).toBe('verified')
  const approved = f.store.approveResearchGateAutomatically(study.id, f.store.getResearchStudy(study.id)!.version)
  expect(approved.status).toBe('approved')
  const freeze = f.store.listStudyFreezes(study.id)
  f.autoApproveResearchGate1.mockImplementation((async ({ studyId }) => {
    f.store.verifyDatasetContractSource(contract.id)
    return f.store.approveResearchGateAutomatically(studyId, f.store.getResearchStudy(studyId)!.version)
  }) as any)

  const first = await f.service.run('r.compute', input, f.exec)
  expect(first.status).toBe('running')
  await writeFile(source, 'x,y\n9,8\n')
  const blocked = await f.service.run('r.compute', { ...input, request_id: 'changed-frozen-source' }, f.exec)
  expect(blocked).toMatchObject({ status: 'blocked', stage: 'pre-run-gate1', study_id: study.id, blockers: [{ code: 'CONTRACT_PROVENANCE_UNVERIFIED' }] })
  expect(f.autoApproveResearchGate1).toHaveBeenCalledTimes(2)
  expect(f.execute.mock.calls.filter(([id]) => id === 'r.submit.script')).toHaveLength(1)
  expect(f.store.listRuns(project.id)).toHaveLength(1)
  expect(f.store.listStudyFreezes(study.id)).toEqual(freeze)
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
