import { mkdtemp, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { ResearchStore } from '@zerowallscience/research-store'
import { rWorkflows } from '../src/shared/r-workflows.js'
import { normalizeJsonArguments, normalizeWorkflowQuery, ResearchWorkflowService } from '../src/host/research-workflow.js'
const roots: string[] = []; const stores: ResearchStore[] = []
afterEach(async () => { stores.splice(0).forEach(s => s.close()); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture(sessionId = 'workflow-session') {
  const root = await mkdtemp(join(tmpdir(), 'workflow-')); roots.push(root)
  const store = new ResearchStore(join(root, 'db.sqlite')); stores.push(store)
  let remoteStatus = 'running'
  const execute = vi.fn(async (id: string, args: any = {}) => ({ target: id, content: [], value: { structuredContent: id === 'r.ensure.project' ? { project_id: `zw-${args.binding_key}`, managed: true, scope: 'conversation' } : id === 'r.submit.script' ? { id: 'job-1', status: 'queued' } : id === 'r.get.job' ? { status: remoteStatus, progress: 25 } : id === 'r.get.job.manifest' ? { files: [{ path: 'plot.png', sha256: 'digest' }] } : {} } }))
  const workflowRequest = vi.fn(async (_action: string, args: any) => { const op = rWorkflows.modules.find(m => m.id === args.workflow_id)?.operations.find(o => o.id === args.operation); if (!op) throw new Error('Operation not registered'); return op })
  const backend = { workflowRequest, ensureConnected: vi.fn(async () => undefined), executeCompactCapability: execute } as any
  const service = new ResearchWorkflowService(store, join(root, 'workflows'), backend)
  const exec = { signal: new AbortController().signal, agent: { session: { id: sessionId, header: { cwd: root } } } } as any
  return { root, store, service, backend, execute, exec, status: (value: string) => { remoteStatus = value } }
}
const input = { operation: 'r.submit.script', arguments: { project_id: 'demo', code: 'print(1)', confirm: true }, request_id: 'submission-1' }
const conversationProject = (sessionId = 'workflow-session') => `zw-${createHash('sha256').update(`zerowall-rmcp-conversation:v1|${sessionId}`).digest('hex')}`
it('normalizes top-level, nested and flattened workflow query envelopes without losing operations', () => {
  expect(normalizeWorkflowQuery({ operation: 'tooluniverse.status', parameters: { project_id: 'p' } })).toEqual({ operation: 'tooluniverse.status', arguments: { project_id: 'p' } })
  expect(normalizeWorkflowQuery({ operation: 'r.faerskit.lookup', arguments: { drug: 'Citalopram', ptname: 'Torsade de pointes' } }, 'r.faerskit')).toEqual({ operation: 'r.faerskit.lookup', arguments: { drug: 'Citalopram', ptname: 'Torsade de pointes' } })
  expect(normalizeWorkflowQuery({ operation: 'tooluniverse.status', parameters: { project_id: 'f0071be9-525d-452d-af77-a28f7deea60' } }, 'tooluniverse')).toEqual({ operation: 'tooluniverse.status', arguments: {} })
  expect(normalizeWorkflowQuery({ parameters: { operation: 'tooluniverse.search', arguments: { query: 'UniProt' } } })).toEqual({ operation: 'tooluniverse.search', arguments: { query: 'UniProt' } })
  expect(normalizeWorkflowQuery({ operation: 'status', parameters: { project_id: 'p' } }, 'tooluniverse')).toEqual({ operation: 'tooluniverse.status', arguments: {} })
  expect(normalizeWorkflowQuery({ parameters: { operation: 'catalog', query: 'UniProt' } }, 'tooluniverse')).toEqual({ operation: 'tooluniverse.search', arguments: { query: 'UniProt' } })
  expect(() => normalizeWorkflowQuery({ parameters: { project_id: 'p' } })).toThrow('OPERATION_REQUIRED')
  expect(() => normalizeWorkflowQuery({ operation: 'tooluniverse.status', parameters: { operation: 'tooluniverse.search' } })).toThrow('OPERATION_CONFLICT')
})
it('keeps project binding out of user-facing operation catalogs and describes it as automatic', async () => {
  const f = await fixture()
  const descriptions = rWorkflows.modules.map(module => f.service.describe(module.id))
  expect(JSON.stringify(descriptions)).not.toContain('r.register.project')
  expect(JSON.stringify(descriptions)).not.toContain('r.ensure.project')
  const detail = await f.service.describeLive('r.compute', 'r.register.project', f.exec)
  expect(detail.execution).toBe('host_managed')
  expect(JSON.stringify(detail)).not.toContain('project_id')
})
it('drops undefined object properties while preserving JSON array semantics', () => {
  expect(normalizeJsonArguments({ omitted: undefined, nested: { omitted: undefined, value: 2 }, items: [undefined, 'x'] })).toEqual({ nested: { value: 2 }, items: [null, 'x'] })
  expect(normalizeJsonArguments({ value: -0, sparse: Array(2) })).toEqual({ value: 0, sparse: [null, null] })
  expect(() => normalizeJsonArguments({ unsupported: 1n })).toThrow('TOOL_ARGUMENTS_NOT_JSON_SERIALIZABLE')
  expect(() => normalizeJsonArguments({ unsupported: Number.POSITIVE_INFINITY })).toThrow('TOOL_ARGUMENTS_NOT_JSON_SERIALIZABLE')
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic
  expect(() => normalizeJsonArguments(cyclic)).toThrow('TOOL_ARGUMENTS_NOT_JSON_SERIALIZABLE')
})
it('queries ToolUniverse status without creating local project records', async () => {
  const f = await fixture()
  f.backend.workflowRequest.mockResolvedValueOnce({ status: 'ok', version: '1.5.7' })
  const query = normalizeWorkflowQuery({ operation: 'tooluniverse.status', parameters: { project_id: 'f0071be9-525d-452d-af77-a28f7deea60' } }, 'tooluniverse')
  await expect(f.service.query('tooluniverse', query, f.exec)).resolves.toEqual({ status: 'ok', version: '1.5.7' })
  expect(f.backend.workflowRequest).toHaveBeenCalledWith('workflow_query', { workflow_id: 'tooluniverse', operation: 'tooluniverse.status', arguments: {} }, f.exec)
  expect(f.store.listProjects()).toHaveLength(0)
})
it('queries FAERS connectivity without creating local project records', async () => {
  const f = await fixture()
  f.backend.workflowRequest.mockResolvedValueOnce({ installed: true, connected: true })
  const query = normalizeWorkflowQuery({ operation: 'r.faerskit.status' }, 'r.faerskit')
  await expect(f.service.query('r.faerskit', query, f.exec)).resolves.toEqual({ installed: true, connected: true })
  expect(f.backend.workflowRequest).toHaveBeenCalledWith('workflow_query', { workflow_id: 'r.faerskit', operation: 'r.faerskit.status', arguments: {} }, f.exec)
  expect(f.store.listProjects()).toHaveLength(0)
})
it('forwards top-level lookup arguments to the remote read operation', async () => {
  const f = await fixture()
  const query = normalizeWorkflowQuery({ operation: 'r.faerskit.lookup', arguments: { drug: 'Citalopram', ptname: 'Torsade de pointes', field: 'drugname', limit: 20 } }, 'r.faerskit')
  f.backend.workflowRequest.mockResolvedValueOnce({ matching_case_count: 1 })
  await expect(f.service.query('r.faerskit', query, f.exec)).resolves.toEqual({ matching_case_count: 1 })
  expect(f.backend.workflowRequest).toHaveBeenCalledWith('workflow_query', { workflow_id: 'r.faerskit', operation: 'r.faerskit.lookup', arguments: { drug: 'Citalopram', ptname: 'Torsade de pointes', field: 'drugname', limit: 20 } }, f.exec)
})
it('filters host-managed operations from frozen search responses without mutating them', async () => {
  const f = await fixture()
  const response = Object.freeze({
    workflow_id: 'r.faerskit',
    total: 2,
    capabilities: Object.freeze([Object.freeze({ id: 'r.faerskit.lookup' }), Object.freeze({ id: 'r.ensure.project' })]),
  })
  f.backend.workflowRequest.mockResolvedValueOnce(response)
  await expect(f.service.search('r.faerskit', '', 0, 25, f.exec)).resolves.toEqual({
    workflow_id: 'r.faerskit',
    total: 2,
    capabilities: [{ id: 'r.faerskit.lookup' }],
  })
  expect(response.capabilities).toHaveLength(2)
})
it('adds only a request id to ToolUniverse calls and rejects nested secrets before persistence', async () => {
  const f = await fixture()
  const value = { operation: 'tooluniverse.run.tool', arguments: { project_id: 'existing-tu-project', tool_name: 'UniProt_get_entry_by_accession', tool_arguments: { accession: 'P05067' }, confirm: true }, request_id: 'tu-1' }
  f.execute.mockImplementation(async (id, args: any = {}) => ({ target: id, content: [], value: { structuredContent: id === 'r.ensure.project' ? { project_id: `zw-${args.binding_key}` } : id === 'tooluniverse.run.tool' ? { job_id: 'tu-job', status: 'queued' } : id === 'tooluniverse.get.job' ? { status: 'succeeded' } : {} } }))
  const result = await f.service.run('tooluniverse', value, f.exec)
  expect(result.remote_id).toBe('tu-job')
  const submitted = f.execute.mock.calls.find(([id]) => id === 'tooluniverse.run.tool') as unknown as [string, Record<string, unknown>]
  expect(submitted[1].request_id).toMatch(/^[a-f0-9]{64}$/u)
  expect(submitted[1].project_id).toBe(conversationProject())
  expect(f.store.listProjects()).toHaveLength(0)
  expect(f.execute.mock.calls.some(([id]) => id === 'r.register.project')).toBe(false)
  await expect(f.service.run('tooluniverse', { ...value, request_id: 'tu-secret', arguments: { ...value.arguments, tool_arguments: { api_key: 'forbidden-test-value' } } }, f.exec)).rejects.toThrow('CREDENTIAL_ARGUMENT_FORBIDDEN')
  expect(f.store.listProjects()).toHaveLength(0)
})
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
it('keeps FAERS jobs active, resumes their R lifecycle and exposes project-relative artifacts', async () => {
  const f = await fixture()
  let status = 'running'
  f.execute.mockImplementation(async (id, args: any = {}) => ({ target: id, content: [], value: { structuredContent:
    id === 'r.ensure.project' ? { project_id: `zw-${args.binding_key}` } :
    id === 'r.faerskit.analyze' ? { job_id: 'faers-job-1', status: 'queued' } :
    id === 'r.get.job' ? { status, progress: 25 } :
    id === 'r.get.job.manifest' ? { files: [{ path: 'faerskit/metformin/signals.csv', sha256: 'faers-digest', mime_type: 'text/csv' }] } : {} } }))
  const request = { operation: 'r.faerskit.analyze', arguments: { project_id: 'existing-faers-project', fun: 'faers_analyze_drug', drug: 'METFORMIN', year: [141, 244], path: 'faerskit/metformin', confirm: true }, request_id: 'faers-1' }
  expect(f.service.list().workflows).toEqual(expect.arrayContaining([expect.objectContaining({ workflow_id: 'r.faerskit', skill: 'zerowall-faerskit' })]))
  await expect(f.service.run('r.faerskit', { ...request, arguments: { ...request.arguments, confirm: false } }, f.exec)).rejects.toThrow('CONFIRMATION_REQUIRED')
  const [first, retry] = await Promise.all([f.service.run('r.faerskit', request, f.exec), f.service.run('r.faerskit', request, f.exec)])
  expect(first).toMatchObject({ status: 'running', remote_id: 'faers-job-1', remote_key: 'job_id' })
  expect(first.run_id).toBe(retry.run_id)
  expect(f.execute.mock.calls.filter(([id]) => id === 'r.faerskit.analyze')).toHaveLength(1)
  expect(f.execute.mock.calls.some(([id]) => id === 'r.get.job.manifest')).toBe(false)
  const collect = vi.fn(async (projectId: string, jobId: string) => ({ status: 'complete', localRoot: `downloads/faerskit/${jobId}`, verifiedFiles: 1, projectId }))
  const restored = new ResearchWorkflowService(f.store, join(f.root, 'workflows'), f.backend, undefined, collect)
  status = 'succeeded'
  const done = await restored.status(String(first.run_id), f.exec)
  expect(done.status).toBe('succeeded')
  expect(JSON.stringify(done.result)).toContain('faers-digest')
  expect(collect).toHaveBeenCalledWith(conversationProject(), 'faers-job-1', f.exec)
  expect(done.result.local_delivery).toMatchObject({ status: 'complete', localRoot: 'downloads/faerskit/faers-job-1' })
  const submission = f.execute.mock.calls.find(([id]) => id === 'r.faerskit.analyze') as unknown as [string, Record<string, unknown>]
  expect(done.artifacts).toEqual(expect.arrayContaining([expect.objectContaining({ uri: `rmcp://${conversationProject()}/.zerowall/jobs/faers-job-1/result/faerskit/metformin/signals.csv`, mediaType: 'text/csv' })]))
  expect(f.execute.mock.calls.some(([id]) => id === 'r.register.project')).toBe(false)
  await restored.status(String(first.run_id), f.exec)
  expect(f.execute.mock.calls.filter(([id]) => id === 'r.faerskit.analyze')).toHaveLength(1)
})
it('recreates the automatic project binding and retries only an explicit pre-submission project 404', async () => {
  const f = await fixture()
  let submitted = 0
  f.execute.mockImplementation(async (id: string, args: any = {}) => {
    if (id === 'r.ensure.project') return { target: id, content: [], value: { structuredContent: { project_id: `zw-${args.binding_key}`, managed: true } } }
    if (id === 'r.faerskit.analyze' && submitted++ === 0) throw new Error('R service returned 404: {"error":["Project was not found."]}')
    return { target: id, content: [], value: { structuredContent: id === 'r.faerskit.analyze' ? { job_id: 'faers-job-recovered', status: 'queued' } : {} } }
  })
  const result = await f.service.run('r.faerskit', {
    operation: 'r.faerskit.analyze',
    arguments: { project_id: 'temporary-id', fun: 'faers_analyze_drug', drug: 'CITALOPRAM', confirm: true },
    request_id: 'faers-project-recovery',
  }, f.exec)
  expect(result).toMatchObject({ status: 'running', remote_id: 'faers-job-recovered', remote_project: conversationProject() })
  expect(f.execute.mock.calls.filter(([id]) => id === 'r.ensure.project')).toHaveLength(2)
  expect(f.execute.mock.calls.filter(([id]) => id === 'r.faerskit.analyze')).toHaveLength(2)
  const submissions = f.execute.mock.calls.filter(([id]) => id === 'r.faerskit.analyze') as unknown as [string, Record<string, unknown>][]
  expect(submissions.map(([, args]) => args.project_id)).toEqual([conversationProject(), conversationProject()])
})
it('repairs a missing project while resuming FAERS status and manifest reads without resubmitting the analysis', async () => {
  const f = await fixture()
  let statusCalls = 0
  let manifestCalls = 0
  f.execute.mockImplementation(async (id: string, args: any = {}) => {
    if (id === 'r.ensure.project') return { target: id, content: [], value: { structuredContent: { project_id: `zw-${args.binding_key}`, managed: true } } }
    if (id === 'r.faerskit.analyze') return { target: id, content: [], value: { structuredContent: { job_id: 'faers-job-resumed', status: 'queued' } } }
    if (id === 'r.get.job' && ++statusCalls === 1) throw new Error('R service returned 404: {"error":["Project was not found."]}')
    if (id === 'r.get.job') return { target: id, content: [], value: { structuredContent: { status: 'succeeded', progress: 100 } } }
    if (id === 'r.get.job.manifest' && ++manifestCalls === 1) throw new Error('R service returned 404: {"error":["Project was not found."]}')
    if (id === 'r.get.job.manifest') return { target: id, content: [], value: { structuredContent: { files: [{ path: 'signals.csv', sha256: 'verified' }] } } }
    return { target: id, content: [], value: { structuredContent: {} } }
  })
  const result = await f.service.run('r.faerskit', {
    operation: 'r.faerskit.analyze',
    arguments: { fun: 'faers_analyze_drug', drug: 'CITALOPRAM', confirm: true },
    request_id: 'faers-project-resume-recovery',
  }, f.exec)
  expect(result).toMatchObject({ status: 'succeeded', remote_id: 'faers-job-resumed', remote_project: conversationProject() })
  expect(statusCalls).toBe(2)
  expect(manifestCalls).toBe(2)
  expect(f.execute.mock.calls.filter(([id]) => id === 'r.ensure.project')).toHaveLength(3)
  expect(f.execute.mock.calls.filter(([id]) => id === 'r.faerskit.analyze')).toHaveLength(1)
})
it('cancels FAERS through the shared remote R job contract', async () => {
  const f = await fixture()
  let status = 'running'
  f.execute.mockImplementation(async (id, args: any = {}) => {
    if (id === 'r.cancel.job') status = 'cancelled'
    return { target: id, content: [], value: { structuredContent: id === 'r.ensure.project' ? { project_id: `zw-${args.binding_key}` } : id === 'r.faerskit.analyze' ? { job_id: 'faers-cancel', status: 'queued' } : { status } } }
  })
  const run = await f.service.run('r.faerskit', { operation: 'r.faerskit.analyze', arguments: { project_id: 'existing-faers-project', fun: 'faers_describe_population', age: [65, 90], confirm: true }, request_id: 'faers-cancel-1' }, f.exec)
  const cancelled = await f.service.cancel(String(run.run_id), true, f.exec)
  expect(cancelled.status).toBe('cancelled')
  expect(f.execute.mock.calls.find(([id]) => id === 'r.cancel.job')).toEqual(['r.cancel.job', expect.objectContaining({ project_id: conversationProject(), job_id: 'faers-cancel', confirm: true }), f.exec])
})
it('runs remote workflows without creating local Projects, Studies, Tasks, or Runs', async () => {
  const f = await fixture()
  const result = await f.service.run('r.compute', input, f.exec)
  expect(result.status).toBe('running')
  expect(f.execute).toHaveBeenCalledWith('r.submit.script', expect.objectContaining({ project_id: conversationProject() }), f.exec)
  expect(f.execute.mock.calls.some(([id]) => id === 'r.register.project')).toBe(false)
  expect(f.store.listProjects()).toHaveLength(0)
})

it('automatically registers a durable isolated binding when a required project id is omitted', async () => {
  const f = await fixture()
  f.backend.workflowRequest.mockResolvedValueOnce({ id: 'r.geo.download', query_allowed: false, requires_confirmation: true,
    input_schema: { type: 'object', properties: { project_id: { type: 'string' } }, required: ['project_id'] } })
  const run = await f.service.run('r.geo', { operation: 'r.geo.download', arguments: { accession: 'GSE1000', confirm: true }, request_id: 'missing-project-id' }, f.exec)
  expect(run.remote_project).toBe(conversationProject())
  expect(f.execute).toHaveBeenCalledWith('r.ensure.project', expect.objectContaining({ binding_key: createHash('sha256').update('zerowall-rmcp-conversation:v1|workflow-session').digest('hex') }), f.exec)
  expect(f.execute).toHaveBeenCalledWith('r.geo.download', expect.objectContaining({ project_id: run.remote_project }), f.exec)
  expect(f.store.listProjects()).toHaveLength(0)
})

it('runs a live R workflow that is not present in the local catalog snapshot and binds optional project fields', async () => {
  const f = await fixture()
  const operation = {
    id: 'r.genetics.run', query_allowed: false, requires_confirmation: true, lifecycle: null,
    input_schema: { type: 'object', properties: { project_id: { type: 'string' } }, required: [] },
  }
  f.backend.workflowRequest.mockImplementation(async (action: string, args: any) => {
    if (action === 'workflow_describe' && args.workflow_id === 'r.genetics' && args.operation === 'r.genetics.run') return operation
    throw new Error('Unexpected live workflow request')
  })
  const result = await f.service.run('r.genetics', {
    operation: 'r.genetics.run', arguments: { project_id: 'workspace-project', confirm: true }, request_id: 'genetics-live',
  }, f.exec)
  expect(result).toMatchObject({ workflow_id: 'r.genetics', status: 'succeeded' })
  expect(f.execute).toHaveBeenCalledWith('r.genetics.run', expect.objectContaining({ project_id: conversationProject() }), f.exec)
})

it('uses the conversation binding instead of a workspace project preference', async () => {
  const f = await fixture()
  const project = f.store.createProject({ name: 'NHANES', rootPath: f.root })
  f.store.updateProjectSettings(project.id, { rPlatformProjectId: 'nhanes-existing-project' })
  await f.service.run('r.nhanes', {
    operation: 'r.nhanes.ensure.available', arguments: { dataset: 'DEMO' }, request_id: 'nhanes-bound-project',
  }, f.exec)
  expect(f.execute).toHaveBeenCalledWith('r.nhanes.ensure.available', expect.objectContaining({ project_id: conversationProject() }), f.exec)
})

it('reuses a conversation binding after reconnection and isolates conversations in the same workspace', async () => {
  const f = await fixture()
  const args = { operation: 'r.submit.script', arguments: { code: 'print(1)', confirm: true }, request_id: 'automatic-1' }
  const [a, b] = await Promise.all([f.service.run('r.compute', args, f.exec), f.service.run('r.compute', args, f.exec)])
  expect(a.remote_project).toBe(b.remote_project)
  expect(f.execute.mock.calls.filter(([id]) => id === 'r.ensure.project')).toHaveLength(1)
  const restored = new ResearchWorkflowService(f.store, join(f.root, 'workflows'), f.backend)
  const retry = await restored.run('r.compute', { ...args, arguments: { ...args.arguments, project_id: '已有ID' } }, f.exec)
  expect(retry.remote_project).toBe(a.remote_project)
  expect(f.execute.mock.calls.filter(([id]) => id === 'r.submit.script')).toHaveLength(1)
  expect(f.execute.mock.calls.filter(([id]) => id === 'r.ensure.project')).toHaveLength(2)
  const otherExec = { ...f.exec, agent: { ...f.exec.agent, session: { ...f.exec.agent.session, id: 'other-conversation' } } } as any
  const other = await f.service.run('r.compute', args, otherExec)
  expect(other.remote_project).not.toBe(a.remote_project)
  expect(other.run_id).not.toBe(a.run_id)
  expect(f.execute.mock.calls.filter(([id]) => id === 'r.ensure.project')).toHaveLength(3)
})

it('preserves the automatic id after registration failure and submits no computation until retry succeeds', async () => {
  const f = await fixture()
  const original = f.execute.getMockImplementation()!
  f.execute.mockImplementationOnce(async () => { throw new Error('service unavailable') })
  const args = { operation: 'r.submit.script', arguments: { code: 'print(1)', confirm: true }, request_id: 'automatic-retry' }
  await expect(f.service.run('r.compute', args, f.exec)).rejects.toThrow('service unavailable')
  const registered = `zw-${(f.execute.mock.calls[0] as unknown as [string, {binding_key: string}])[1].binding_key}`
  expect(f.execute).toHaveBeenCalledTimes(1)
  f.execute.mockImplementation(original)
  expect((await f.service.run('r.compute', args, f.exec)).remote_project).toBe(registered)
})

it('maps legacy project registration requests to the automatic conversation binding', async () => {
  const f = await fixture()
  await expect(f.service.run('r.compute', { operation: 'r.register.project', arguments: { project_id: 'my-project', name: 'Mine' }, request_id: 'register-project' }, f.exec)).resolves.toHaveProperty('status', 'succeeded')
  expect(f.execute).toHaveBeenCalledWith('r.ensure.project', expect.objectContaining({ binding_key: createHash('sha256').update('zerowall-rmcp-conversation:v1|workflow-session').digest('hex') }), f.exec)
  expect(f.store.listProjects()).toHaveLength(0)
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
  f.execute.mockImplementation(async (id, args: any = {}) => { if (id === 'r.submit.script') throw new Error('disconnected after submit'); return { target: id, content: [], value: { structuredContent: id === 'r.ensure.project' ? { project_id: `zw-${args.binding_key}` } : {} } } })
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
  f.execute.mockImplementation(async (id, args: any = {}) => ({ target: id, content: [], value: { structuredContent: id === 'r.ensure.project' ? { project_id: `zw-${args.binding_key}` } : id === 'r.nhanes.ensure.available' ? { status: 'queued', download_job_id: 'download-1' } : id === 'r.nhanes.get.download.status' ? { status: 'running', progress: 10 } : {} } }))
  const result = await f.service.run('r.nhanes', { operation: 'r.nhanes.ensure.available', arguments: { project_id: 'demo', dataset: 'DEMO' }, request_id: 'download' }, f.exec)
  expect(result.remote_id).toBe('download-1'); expect(result.status).toBe('running')
  expect(f.execute).toHaveBeenCalledWith('r.nhanes.get.download.status', expect.objectContaining({ download_job_id: 'download-1' }), f.exec)
})

it('ignores placeholder research_task_id values for ordinary FAERS remote workflows', async () => {
  const f = await fixture()
  f.execute.mockImplementation(async (id, args: any = {}) => ({
    target: id, content: [], value: { structuredContent: id === 'r.ensure.project' ? { project_id: 'zw-placeholder-project' } : id === 'r.faerskit.analyze' ? { job_id: 'faers-job-placeholder', status: 'succeeded' } : {} },
  }))
  const result = await f.service.run('r.faerskit', {
    operation: 'r.faerskit.analyze',
    research_task_id: 'placeholder-task-id',
    arguments: { project_id: 'existing-faers-project', fun: 'faers_analyze_drug', drug: 'METFORMIN', confirm: true },
    request_id: 'faers-placeholder',
  }, f.exec)
  expect(result.status).toBe('running')
  expect(result.error).toBeNull()
})

it('routes GEO job_id to download status and preserves the original submission', async () => {
  const f = await fixture()
  f.execute.mockImplementation(async (id, args: any = {}) => ({ target: id, content: [], value: { structuredContent: id === 'r.ensure.project' ? { project_id: `zw-${args.binding_key}` } : id === 'r.geo.download' ? { job_id: 'geo-download', status: 'queued', accession: 'GSE1000' } : id === 'r.geo.wait.download' ? { status: 'completed', files: ['matrix.gz'] } : {} } }))
  const run = await f.service.run('r.geo', { operation: 'r.geo.download', arguments: { project_id: 'existing-geo-project', accession: 'GSE1000' }, request_id: 'geo-download' }, f.exec)
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
  f.execute.mockImplementation(async (id, args: any = {}) => ({ target: id, content: [], value: { structuredContent: id === 'r.ensure.project' ? { project_id: `zw-${args.binding_key}` } : { ok: false, error: 'missing dependency' } } } as any))
  const result = await f.service.run('r.packages', { operation: 'r.ensure.analysis.packages', arguments: { packages: ['Matrix'], confirm: true }, request_id: 'failure' }, f.exec)
  expect(result.status).toBe('failed')
})
it('collects a singleton R manifest using the project-relative result path', async () => {
  const f = await fixture()
  f.execute.mockImplementation(async (id, args: any = {}) => ({ target: id, content: [], value: { structuredContent: id === 'r.ensure.project' ? { project_id: `zw-${args.binding_key}` } : id === 'r.submit.script' ? { id: 'job-1', status: 'queued' } : id === 'r.get.job' ? { status: 'succeeded' } : id === 'r.get.job.manifest' ? { manifest: { files: { path: ['result.csv'], mime_type: ['text/csv'] } } } : {} } }))
  const run = await f.service.run('r.compute', input, f.exec)
  expect(run.artifacts).toContainEqual({ name: 'result.csv', uri: `rmcp://${conversationProject()}/.zerowall/jobs/job-1/result/result.csv`, mediaType: 'text/csv' })
})

it.each([
  { workflow: 'biomni', operation: 'biomni.call.tool', status: 'biomni.get.job', manifest: 'biomni.get.job.manifest', files: { outputs: [{ path: 'result.json' }] }, path: 'biomni/job-1/result.json' },
  { workflow: 'omicverse', operation: 'omicverse.run.singlecell', status: 'omicverse.get.job', manifest: 'omicverse.get.job.manifest', files: { outputs: [{ path: 'result.json' }] }, path: 'result.json' },
  { workflow: 'figureya', operation: 'figureya.run.plan', status: 'figureya.get.job', manifest: 'figureya.get.manifest', files: { job_id: 'r-job', files: [{ path: 'plot.png', project_artifact_path: 'figures/plan-1/plot.png' }] }, path: 'figures/plan-1/plot.png' },
])('collects downloadable artifacts for $workflow', async (sample) => {
  const f = await fixture()
  f.execute.mockImplementation(async (id, args: any = {}) => ({ target: id, content: [], value: { structuredContent: id === 'r.ensure.project' ? { project_id: `zw-${args.binding_key}` } : id === sample.operation ? { job: { id: 'job-1', job_id: 'job-1', run_id: 'job-1', status: 'queued' } } : id === sample.status ? { status: 'succeeded' } : id === sample.manifest ? sample.files : {} } }))
  const run = await f.service.run(sample.workflow, { operation: sample.operation, arguments: { project_id: 'demo', confirm: true }, request_id: 'artifact' }, f.exec)
  expect(run.status).toBe('succeeded')
  expect(run.artifacts).toEqual(expect.arrayContaining([expect.objectContaining({ uri: `rmcp://${conversationProject()}/${sample.path}` })]))
})
it('registers aggregate queries and snapshot render jobs with the shared R lifecycle', async () => {
  const f = await fixture()
  const module = rWorkflows.modules.find(m => m.id === 'r.faerskit')!
  const query = module.operations.find(op => op.id === 'r.faerskit.query')!
  expect(query.query_allowed).toBe(true)
  f.backend.workflowRequest.mockResolvedValueOnce({ matching_reports: 3, rows: [] })
  await expect(f.service.query('r.faerskit', { operation: 'r.faerskit.query', arguments: { query: 'sex', drug: 'Citalopram', drugEffect: 'PS', year: '2026Q1' } }, f.exec)).resolves.toHaveProperty('matching_reports', 3)
  expect(f.backend.workflowRequest).toHaveBeenCalledWith('workflow_query', { workflow_id: 'r.faerskit', operation: 'r.faerskit.query', arguments: { query: 'sex', drug: 'Citalopram', drugEffect: 'PS', year: '2026Q1' } }, f.exec)
  for (const operation of ['r.faerskit.plot', 'r.faerskit.report']) {
    const op = module.operations.find(value => value.id === operation)!
    expect(op.query_allowed).toBe(false)
    expect(op.lifecycle?.status).toBe('r.get.job')
    f.execute.mockImplementation(async (id, args: any = {}) => ({ target: id, content: [], value: { structuredContent: id === 'r.ensure.project' ? { project_id: `zw-${args.binding_key}` } : id === operation ? { job_id: 'render-job', status: 'queued' } : {} } }))
    const run = await f.service.run('r.faerskit', { operation, arguments: { project_id: 'snapshot-project', source_job_id: 'original-analysis', confirm: true }, request_id: operation }, f.exec)
    expect(run.remote_id).toBe('render-job')
  }
})
