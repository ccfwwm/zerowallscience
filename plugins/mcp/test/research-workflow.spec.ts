import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { ResearchStore } from '@zerowallscience/research-store'
import { rWorkflows } from '../src/shared/r-workflows.js'
import { normalizeJsonArguments, normalizeWorkflowQuery, ResearchWorkflowService } from '../src/host/research-workflow.js'
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
it('normalizes top-level, nested and flattened workflow query envelopes without losing operations', () => {
  expect(normalizeWorkflowQuery({ operation: 'tooluniverse.status', parameters: { project_id: 'p' } })).toEqual({ operation: 'tooluniverse.status', arguments: { project_id: 'p' } })
  expect(normalizeWorkflowQuery({ operation: 'tooluniverse.status', parameters: { project_id: 'f0071be9-525d-452d-af77-a28f7deea60' } }, 'tooluniverse')).toEqual({ operation: 'tooluniverse.status', arguments: {} })
  expect(normalizeWorkflowQuery({ parameters: { operation: 'tooluniverse.search', arguments: { query: 'UniProt' } } })).toEqual({ operation: 'tooluniverse.search', arguments: { query: 'UniProt' } })
  expect(normalizeWorkflowQuery({ operation: 'status', parameters: { project_id: 'p' } }, 'tooluniverse')).toEqual({ operation: 'tooluniverse.status', arguments: {} })
  expect(normalizeWorkflowQuery({ parameters: { operation: 'catalog', query: 'UniProt' } }, 'tooluniverse')).toEqual({ operation: 'tooluniverse.search', arguments: { query: 'UniProt' } })
  expect(() => normalizeWorkflowQuery({ parameters: { project_id: 'p' } })).toThrow('OPERATION_REQUIRED')
  expect(() => normalizeWorkflowQuery({ operation: 'tooluniverse.status', parameters: { operation: 'tooluniverse.search' } })).toThrow('OPERATION_CONFLICT')
})
it('drops undefined object properties while preserving JSON array semantics', () => {
  expect(normalizeJsonArguments({ omitted: undefined, nested: { omitted: undefined, value: 2 }, items: [undefined, 'x'] })).toEqual({ nested: { value: 2 }, items: [null, 'x'] })
  expect(normalizeJsonArguments({ value: -0, sparse: Array(2) })).toEqual({ value: 0, sparse: [null, null] })
  expect(() => normalizeJsonArguments({ unsupported: 1n })).toThrow('TOOL_ARGUMENTS_NOT_JSON_SERIALIZABLE')
  expect(() => normalizeJsonArguments({ unsupported: Number.POSITIVE_INFINITY })).toThrow('TOOL_ARGUMENTS_NOT_JSON_SERIALIZABLE')
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic
  expect(() => normalizeJsonArguments(cyclic)).toThrow('TOOL_ARGUMENTS_NOT_JSON_SERIALIZABLE')
})
it('queries ToolUniverse status without provisioning an unrelated research context', async () => {
  const f = await fixture()
  f.backend.workflowRequest.mockResolvedValueOnce({ status: 'ok', version: '1.5.7' })
  const query = normalizeWorkflowQuery({ operation: 'tooluniverse.status', parameters: { project_id: 'f0071be9-525d-452d-af77-a28f7deea60' } }, 'tooluniverse')
  await expect(f.service.query('tooluniverse', query, f.exec)).resolves.toEqual({ status: 'ok', version: '1.5.7' })
  expect(f.backend.workflowRequest).toHaveBeenCalledWith('workflow_query', { workflow_id: 'tooluniverse', operation: 'tooluniverse.status', arguments: {} }, f.exec)
  expect(f.ensureResearchContext).not.toHaveBeenCalled()
})
it('queries FAERS connectivity without provisioning a remote analysis project', async () => {
  const f = await fixture()
  f.backend.workflowRequest.mockResolvedValueOnce({ installed: true, connected: true })
  const query = normalizeWorkflowQuery({ operation: 'r.faerskit.status' }, 'r.faerskit')
  await expect(f.service.query('r.faerskit', query, f.exec)).resolves.toEqual({ installed: true, connected: true })
  expect(f.backend.workflowRequest).toHaveBeenCalledWith('workflow_query', { workflow_id: 'r.faerskit', operation: 'r.faerskit.status', arguments: {} }, f.exec)
  expect(f.ensureResearchContext).not.toHaveBeenCalled()
})
it('injects ToolUniverse project/idempotency context and rejects nested secrets before persistence', async () => {
  const f = await fixture()
  const value = { operation: 'tooluniverse.run.tool', arguments: { tool_name: 'UniProt_get_entry_by_accession', tool_arguments: { accession: 'P05067' }, confirm: true }, request_id: 'tu-1' }
  f.execute.mockImplementation(async id => ({ target: id, content: [], value: { structuredContent: id === 'tooluniverse.run.tool' ? { job_id: 'tu-job', status: 'queued' } : id === 'tooluniverse.get.job' ? { status: 'succeeded' } : {} } }))
  const result = await f.service.run('tooluniverse', value, f.exec)
  expect(result.remote_id).toBe('tu-job')
  const submitted = f.execute.mock.calls.find(([id]) => id === 'tooluniverse.run.tool') as unknown as [string, Record<string, unknown>]
  expect(submitted[1].request_id).toMatch(/^[a-f0-9]{64}$/u)
  expect(submitted[1].project_id).toMatch(/^zw-/u)
  const before = f.store.listRuns(f.store.listProjects()[0]!.id).length
  await expect(f.service.run('tooluniverse', { ...value, request_id: 'tu-secret', arguments: { ...value.arguments, tool_arguments: { api_key: 'forbidden-test-value' } } }, f.exec)).rejects.toThrow('CREDENTIAL_ARGUMENT_FORBIDDEN')
  expect(f.store.listRuns(f.store.listProjects()[0]!.id)).toHaveLength(before)
})
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
it('keeps FAERS jobs active, resumes their R lifecycle and exposes project-relative artifacts', async () => {
  const f = await fixture()
  let status = 'running'
  f.execute.mockImplementation(async id => ({ target: id, content: [], value: { structuredContent:
    id === 'r.faerskit.analyze' ? { job_id: 'faers-job-1', status: 'queued' } :
    id === 'r.get.job' ? { status, progress: 25 } :
    id === 'r.get.job.manifest' ? { files: [{ path: 'faerskit/metformin/signals.csv', sha256: 'faers-digest', mime_type: 'text/csv' }] } : {} } }))
  const request = { operation: 'r.faerskit.analyze', arguments: { fun: 'AFun', drug: 'METFORMIN', year: [141, 244], path: 'faerskit/metformin', confirm: true }, request_id: 'faers-1' }
  expect(f.service.list().workflows).toEqual(expect.arrayContaining([expect.objectContaining({ workflow_id: 'r.faerskit', skill: 'zerowall-faerskit' })]))
  await expect(f.service.run('r.faerskit', { ...request, arguments: { ...request.arguments, confirm: false } }, f.exec)).rejects.toThrow('CONFIRMATION_REQUIRED')
  const [first, retry] = await Promise.all([f.service.run('r.faerskit', request, f.exec), f.service.run('r.faerskit', request, f.exec)])
  expect(first).toMatchObject({ status: 'running', remote_id: 'faers-job-1', remote_key: 'job_id' })
  expect(first.run_id).toBe(retry.run_id)
  expect(f.execute.mock.calls.filter(([id]) => id === 'r.faerskit.analyze')).toHaveLength(1)
  expect(f.execute.mock.calls.some(([id]) => id === 'r.get.job.manifest')).toBe(false)
  const restored = new ResearchWorkflowService(f.store, join(f.root, 'workflows'), f.backend, undefined, () => ({ ensureResearchContext: f.ensureResearchContext, autoApproveResearchGate1: f.autoApproveResearchGate1 } as any))
  status = 'succeeded'
  const done = await restored.status(String(first.run_id), f.exec)
  expect(done.status).toBe('succeeded')
  expect(JSON.stringify(done.result)).toContain('faers-digest')
  const submission = f.execute.mock.calls.find(([id]) => id === 'r.faerskit.analyze') as unknown as [string, Record<string, unknown>]
  expect(done.artifacts).toEqual(expect.arrayContaining([expect.objectContaining({ uri: `rmcp://${submission[1].project_id}/.zerowall/jobs/faers-job-1/result/faerskit/metformin/signals.csv`, mediaType: 'text/csv' })]))
  await restored.status(String(first.run_id), f.exec)
  expect(f.execute.mock.calls.filter(([id]) => id === 'r.faerskit.analyze')).toHaveLength(1)
})
it('cancels FAERS through the shared remote R job contract', async () => {
  const f = await fixture()
  let status = 'running'
  f.execute.mockImplementation(async id => {
    if (id === 'r.cancel.job') status = 'cancelled'
    return { target: id, content: [], value: { structuredContent: id === 'r.faerskit.analyze' ? { job_id: 'faers-cancel', status: 'queued' } : { status } } }
  })
  const run = await f.service.run('r.faerskit', { operation: 'r.faerskit.analyze', arguments: { fun: 'KFun', age: [65, 90], confirm: true }, request_id: 'faers-cancel-1' }, f.exec)
  const cancelled = await f.service.cancel(String(run.run_id), true, f.exec)
  expect(cancelled.status).toBe('cancelled')
  expect(f.execute.mock.calls.find(([id]) => id === 'r.cancel.job')).toEqual(['r.cancel.job', expect.objectContaining({ job_id: 'faers-cancel', confirm: true }), f.exec])
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
