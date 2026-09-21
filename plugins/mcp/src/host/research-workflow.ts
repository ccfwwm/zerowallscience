import { randomUUID, createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import { ResearchStore } from '@zerowallscience/research-store'
import type { LocalScienceWorkflow, ResearchTaskRecord } from '@zerowallscience/research-store/types'
import { rWorkflows } from '../shared/r-workflows.js'
import type { ZeroWallMcpService } from './index.js'

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type ObjectValue = { [key: string]: Json }
type Lifecycle = { id_fields: readonly string[]; argument: string; status: string; cancel?: string; manifest?: string; log?: string }
type Operation = { lifecycle?: Lifecycle | null; query_allowed?: boolean; id: string; public_tool: string; summary: string; input_schema: unknown; requires_confirmation: boolean }
type Module = { id: string; skill: string; groups: readonly string[]; operations: readonly Operation[] }
interface State { run_id: string; workflow_id: string; operation: string; workspace: string; request_id: string; fingerprint: string; research_task_id?: string; remote_id?: string; remote_key?: string; remote_project?: string; status_operation?: string; cancel_operation?: string; manifest_operation?: string; result?: ObjectValue; submission?: ObjectValue; lifecycle?: Lifecycle | null }
declare module '@deepseek-ai/cordis' {
  interface Context { researchWorkflow: { get(): ResearchWorkflowService } }
  interface Context { localScienceWorkflow: LocalScienceWorkflow }
}
const modules: readonly Module[] = rWorkflows.modules
const object = (value: unknown): ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {}
const scalar = (value: unknown): unknown => Array.isArray(value) && value.length === 1 ? value[0] : value
const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v !== null && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, value]) => [k, canonical(value)])) : v
const terminal = new Set(['succeeded', 'failed', 'cancelled', 'timed_out'])

export function workflowPayload(value: unknown): ObjectValue {
  const result = object(value)
  if (result.structuredContent) return object(result.structuredContent)
  if (Array.isArray(result.content)) {
    const text = result.content.map(object).find(block => block.type === 'text')?.text
    if (typeof text === 'string') { try { return object(JSON.parse(text)) } catch { return { text } } }
  }
  return result
}

/** A Host service, shared by the model tool and code callers. Only registered catalog operations execute. */
export class ResearchWorkflowService {
  private readonly pending = new Map<string, Promise<ObjectValue>>()
  constructor(private readonly store: ResearchStore, private readonly directory: string, private readonly mcp: Pick<ZeroWallMcpService, 'ensureConnected' | 'executeCompactCapability' | 'workflowRequest'>, private readonly local: () => LocalScienceWorkflow | undefined = () => undefined) {}
  private localService(): LocalScienceWorkflow { const local=this.local();if(!local)throw new Error('Local Fiji workflow service is unavailable.');return local }
  private sessionId(exec:ToolRunContext):string {const id=exec.agent?.session.id;if(!id)throw new Error('An active project session is required.');return String(id)}
  list(): ObjectValue { return { workflows: [...modules.map(module => ({ workflow_id: module.id, skill: module.skill, operation_count: module.operations.length })), ...(this.local()?[this.localService().list()]:[])] } }
  describe(id: string, operation?: string): ObjectValue {
    if(id==='fiji')return this.localService().describe(operation)
    const module = this.module(id)
    if (operation) return JSON.parse(JSON.stringify(this.operation(module, operation))) as ObjectValue
    return { workflow_id: id, skill: module.skill, catalog_version: rWorkflows.catalog_version, parameters: { operation: 'Exact operation id below', arguments: 'Object validated against the live backend schema', request_id: 'Unique idempotency key, reuse only for the same submission' }, operations: module.operations.map(op => ({ id: op.id, summary: op.summary, requires_confirmation: op.requires_confirmation })) }
  }
  async search(id: string, query: string, offset: number, limit: number, exec: ToolRunContext): Promise<ObjectValue> {
    if(id==='fiji') { const operation=this.localService().describe();return {workflow_id:id,operations: offset>0 || limit<1 || (query && !JSON.stringify(operation).toLowerCase().includes(query.toLowerCase()))?[]:[operation]} }
    this.module(id)
    return object(await this.mcp.workflowRequest('workflow_search', { workflow_id: id, query, offset, limit }, exec))
  }
  async describeLive(id: string, operation: string | undefined, exec: ToolRunContext): Promise<ObjectValue> {
    if(id==='fiji')return this.localService().describe(operation)
    this.module(id)
    if (!operation) return this.search(id, '', 0, 25, exec)
    return object(await this.mcp.workflowRequest('workflow_describe', { workflow_id: id, operation }, exec))
  }
  async query(id: string, parameters: ObjectValue, exec: ToolRunContext): Promise<ObjectValue> {
    this.module(id)
    return object(await this.mcp.workflowRequest('workflow_query', { workflow_id: id, operation: parameters.operation, arguments: object(parameters.arguments) }, exec))
  }
  private module(id: string): Module { const module = modules.find(item => item.id === id); if (!module) throw new Error(`UNKNOWN_WORKFLOW: ${id}`); return module }
  private operation(module: Module, id: string): Operation { const op = module.operations.find(item => item.id === id); if (!op) throw new Error(`Operation ${id} is not registered in ${module.id}`); return op }
  private workspace(exec: ToolRunContext): string { const cwd = exec.agent?.session.header.cwd; if (!cwd) throw new Error('An active workspace is required.'); return resolve(cwd) }
  private path(id: string): string { if (!/^[a-f0-9-]{36}$/u.test(id)) throw new Error('Invalid workflow run id'); return join(this.directory, `${id}.json`) }
  private async save(state: State): Promise<void> { await mkdir(this.directory, { recursive: true }); const target = this.path(state.run_id); const temp = `${target}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(state)); await rename(temp, target) }
  private async load(id: string, exec: ToolRunContext): Promise<State> { const state = JSON.parse(await readFile(this.path(id), 'utf8')) as State; if (state.workspace !== this.workspace(exec)) throw new Error('Workflow belongs to another workspace'); return state }
  private async call(id: string, args: ObjectValue, exec: ToolRunContext): Promise<ObjectValue> {
    await this.mcp.ensureConnected('rmcp')
    const result = await this.mcp.executeCompactCapability(id, args, exec)
    const payload = workflowPayload(result.value ?? { content: result.content })
    if (payload.ok === false || payload.isError === true) throw new Error(String(payload.error ?? 'Backend operation failed'))
    return payload
  }
  async run(id: string, parameters: ObjectValue, exec: ToolRunContext): Promise<ObjectValue> {
    if (parameters.research_task_id !== undefined && (typeof parameters.research_task_id !== 'string' || !parameters.research_task_id.trim())) throw new Error('research_task_id must be a nonempty string.')
    if(id==='fiji')return this.localService().execute(this.sessionId(exec),'run',parameters)
    const module = this.module(id)
    const operationId = String(parameters.operation ?? '')
    const operation = await this.describeLive(id, operationId, exec) as unknown as Operation
    if (operation.id !== operationId) throw new Error('Invalid live operation contract')
    const args = { ...object(parameters.arguments) }
    const researchTaskId = typeof parameters.research_task_id === 'string' ? parameters.research_task_id : undefined
    if (operation.requires_confirmation && args.confirm !== true) throw new Error('CONFIRMATION_REQUIRED: approve the concrete operation and any first remote upload.')
    if (args.api_key || args.token || args.password) throw new Error('Use the Host credential broker; workflow arguments must not contain credentials.')
    const workspace = this.workspace(exec)
    const requestId = parameters.request_id
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/u.test(requestId)) throw new Error('request_id is required for safe submission retries.')
    const properties = object(object(operation.input_schema).properties)
    if ('project_id' in properties && !args.project_id && operation.query_allowed !== true) args.project_id = `zw-${createHash('sha256').update(workspace).digest('hex').slice(0, 24)}`
    if (id === 'omicverse' && 'request_id' in properties) args.request_id = createHash('sha256').update(requestId).digest('hex')
    const key = `${workspace}:${requestId}`
    // Concurrent callers with the same request cannot race past durable idempotency.
    const active = this.pending.get(key)
    if (active) { await active; return this.run(id, parameters, exec) }
    const task = this.submit(module, operation, args, workspace, requestId, exec, researchTaskId)
    this.pending.set(key, task)
    try { return await task } finally { this.pending.delete(key) }
  }
  private async submit(module: Module, operation: Operation, args: ObjectValue, workspace: string, requestId: string, exec: ToolRunContext, researchTaskId?: string): Promise<ObjectValue> {
    const project = this.store.listProjects().find(item => resolve(item.rootPath) === workspace) ?? this.store.createProject({ name: workspace.split(/[\\/]/u).pop() || 'Research', rootPath: workspace })
    const researchTask = researchTaskId === undefined ? undefined : this.findResearchTask(project.id, researchTaskId)
    const fingerprint = createHash('sha256').update(JSON.stringify(canonical({ workflow: module.id, operation: operation.id, args, ...(researchTaskId === undefined ? {} : { research_task_id: researchTaskId }) }))).digest('hex')
    const existing = this.store.listRuns(project.id).find(run => run.leaseOwner === 'research-workflow' && run.inputs.some(input => input.name === 'request_id' && input.uri === requestId))
    if (existing) { const state = await this.load(existing.id, exec); if (state.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_CONFLICT: request_id was already used for different parameters.'); return this.view(state) }
    if (researchTask) {
      const study = this.store.getResearchStudy(researchTask.studyId)!
      if (['archived', 'completed', 'blocked'].includes(study.status)) throw new Error('The research study is not available for execution.')
      if (!researchTask.exploratory && (!study.currentFreezeId || study.gate1 !== 'approved')) throw new Error('Confirmatory tasks require gate one approval and a frozen study plan.')
    }
    const run = this.store.createRun({ projectId: project.id, name: `${module.id}: ${operation.id}`, command: 'research_workflow', workingDirectory: workspace, status: 'submitted', leaseOwner: 'research-workflow', inputs: [{ name: 'request_id', uri: requestId }] })
    const state: State = { run_id: run.id, workflow_id: module.id, operation: operation.id, workspace, request_id: requestId, fingerprint, ...(researchTask === undefined ? {} : { research_task_id: researchTask.id }), lifecycle: operation.lifecycle ?? null, ...(typeof args.project_id === 'string' ? { remote_project: args.project_id } : {}) }
    await this.save(state)
    try {
      if (researchTask !== undefined) this.store.updateResearchTask(researchTask.id, { expectedVersion: researchTask.version, status: 'running', runId: run.id })
      await this.save(state)
      // Health and precise capability lookup both run through the normal permission pipeline.
      if (module.id === 'r.compute' || module.id === 'sc.knockout') await this.call(module.id === 'sc.knockout' ? 'r.validate.sc.tenifold.runtime' : 'r.runtime.capabilities', {}, exec)
      if (operation.query_allowed !== true && operation.id !== 'r.register.project' && typeof args.project_id === 'string') await this.call('r.register.project', { project_id: args.project_id, name: args.project_id }, exec)
      this.store.updateRun(run.id, { status: 'running', progress: 0.1 })
      state.result = await this.call(operation.id, args, exec)
      state.submission = state.result
      this.track(state)
      await this.save(state)
      if (!state.remote_id) {
        this.store.updateRun(run.id, { status: 'succeeded', progress: 1, outputs: this.outputs(state) })
        this.reconcileBoundTask(state)
      }
      else await this.refresh(state, exec)
      return this.view(state)
    } catch (error) {
      // Never replay an uncertain remote submission after timeout/disconnect.
      const current = this.store.getRun(run.id)!
      if (!terminal.has(current.status)) this.store.updateRun(run.id, { status: state.remote_id ? 'paused' : 'failed', error: `${String(error)}; do not resubmit with a new request_id until remote job history has been checked.` })
      if (!state.remote_id) this.reconcileBoundTask(state)
      await this.save(state)
      return this.view(state)
    }
  }
  private track(state: State): void {
    const result = state.result ?? {}; const nested = object(scalar(result.job ?? result.run ?? result.download))
    const lifecycle = state.lifecycle
    if (!lifecycle) return
    const identifier = lifecycle.id_fields.map(key => scalar(result[key] ?? nested[key])).find(value => typeof value === 'string' && value)
    if (typeof identifier !== 'string') {
      if (['queued', 'pending', 'running'].includes(String(scalar(result.status ?? nested.status)))) throw new Error('Backend returned an active task without its declared task id; inspect history.')
      return
    }
    state.remote_id = identifier; state.remote_key = lifecycle.argument
    state.status_operation = lifecycle.status; if (lifecycle.cancel) state.cancel_operation = lifecycle.cancel; if (lifecycle.manifest) state.manifest_operation = lifecycle.manifest
  }

  private async refresh(state: State, exec: ToolRunContext): Promise<void> {
    const current = this.store.getRun(state.run_id)!
    if (terminal.has(current.status)) { this.reconcileBoundTask(state); return }
    if (!state.remote_id) return
    const args: ObjectValue = { ...(state.remote_project ? { project_id: state.remote_project } : {}), [state.remote_key!]: state.remote_id }
    const result = await this.call(state.status_operation!, args, exec)
    state.result = result
    const job = object(scalar(result.job ?? result.run ?? result.download))
    const status = String(scalar(result.status ?? job.status) ?? 'running')
    const mapped = ['complete', 'completed', 'success', 'succeeded'].includes(status) ? 'succeeded' : ['failed', 'error'].includes(status) ? 'failed' : ['cancelled', 'canceled'].includes(status) ? 'cancelled' : status === 'timed_out' ? 'timed_out' : current.status === 'cancelling' ? 'cancelling' : 'running'
    if (mapped === 'succeeded' && state.manifest_operation) state.result = { ...result, artifacts: await this.call(state.manifest_operation, args, exec) }
    await this.save(state)
    if (current.status === 'paused') this.store.updateRun(state.run_id, { status: 'running' })
    const progress = Number(scalar(result.progress ?? job.progress) ?? 0.1)
    this.store.updateRun(state.run_id, { status: mapped, progress: mapped === 'succeeded' ? 1 : Math.min(0.99, Math.max(0, Number.isFinite(progress) ? progress > 1 ? progress / 100 : progress : 0.1)), ...(mapped === 'failed' ? { error: String(result.error ?? job.error ?? 'Remote job failed') } : {}), outputs: this.outputs(state) })
    if (terminal.has(mapped)) this.reconcileBoundTask(state)
  }
  private outputs(state: State): Array<{ name: string; uri: string; mediaType: string }> {
    const result = state.result ?? {}; const artifacts = object(result.artifacts ?? result.manifest)
    const files = artifacts.files ?? artifacts.outputs ?? object(artifacts.manifest).files
    const references = (Array.isArray(files) ? files : files ? [files] : []).map(object).filter(file => typeof scalar(file.path) === 'string').map(file => {
      const name = String(scalar(file.path))
      // R manifests name files relative to the job result directory.
      const rJob = ['r.get.job', 'r.get.sc.tenifold.run'].includes(state.status_operation ?? '') ? state.remote_id : ['figureya.get.job', 'r.geo.get.analysis.run', 'r.nhanes.get.analysis.run'].includes(state.status_operation ?? '') ? scalar(artifacts.job_id ?? result.job_id ?? object(result.job).id) : undefined
      const artifactRoot = scalar(artifacts.artifact_root)
      const projectPath = scalar(file.project_artifact_path)
      const path = typeof projectPath === 'string' ? projectPath : typeof artifactRoot === 'string' && name.startsWith(`${artifactRoot}/`) ? name : typeof rJob === 'string' ? `.zerowall/jobs/${rJob}/result/${name}` : state.status_operation === 'biomni.get.job' ? `biomni/${state.remote_id}/${name}` : name
      return { name, uri: `rmcp://${encodeURIComponent(state.remote_project ?? '')}/${path.split('/').map(encodeURIComponent).join('/')}`, mediaType: String(scalar(file.mime_type) ?? 'application/octet-stream') }
    })
    return [{ name: 'result', uri: pathToFileURL(this.path(state.run_id)).href, mediaType: 'application/json' }, ...references]
  }
  private view(state: State): ObjectValue { const run = this.store.getRun(state.run_id)!; return { run_id: run.id, workflow_id: state.workflow_id, status: run.status, research_task_id: state.research_task_id ?? null, progress: run.progress, remote_id: state.remote_id ?? null, remote_key: state.remote_key ?? null, submission: state.submission ?? {}, artifacts: JSON.parse(JSON.stringify(run.outputs)), result: state.result ?? {}, error: run.error ?? null } }
  private findResearchTask(projectId: string, id: string): ResearchTaskRecord {
    const task = this.store.listResearchStudies(projectId).flatMap(study => this.store.listResearchTasks(study.id)).find(item => item.id === id)
    if (!task || task.projectId !== projectId) throw new Error('Research task is not in the active project.')
    return task
  }
  private reconcileBoundTask(state: State): void {
    if (!state.research_task_id) return
    const run = this.store.getRun(state.run_id)
    if (!run) return
    const task = this.findResearchTask(run.projectId, state.research_task_id)
    if (task.runId === run.id) this.store.reconcileResearchTaskRun(task.id)
  }
  async status(id: string, exec: ToolRunContext): Promise<ObjectValue> { if(this.store.getRun(id)?.leaseOwner==='fiji-workflow')return this.localService().execute(this.sessionId(exec),'status',{},id); const state = await this.load(id, exec); await this.refresh(state, exec); return this.view(state) }
  async cancel(id: string, confirm: boolean, exec: ToolRunContext): Promise<ObjectValue> {
    if (!confirm) throw new Error('CONFIRMATION_REQUIRED: cancel this workflow run.')
    if(this.store.getRun(id)?.leaseOwner==='fiji-workflow')return this.localService().execute(this.sessionId(exec),'cancel',{},id)
    const state = await this.load(id, exec); const run = this.store.getRun(id)!
    if (terminal.has(run.status)) return this.view(state)
    if (!state.remote_id || !state.cancel_operation) throw new Error('No remote job id; inspect backend history before cancelling.')
    await this.call(state.cancel_operation, { ...(state.remote_project ? { project_id: state.remote_project } : {}), [state.remote_key!]: state.remote_id, confirm: true }, exec)
    this.store.updateRun(id, { status: 'cancelling' })
    await this.refresh(state, exec)
    return this.view(state)
  }
}

export function registerResearchWorkflow(ctx: Context, mcp: ZeroWallMcpService): void {
  let service: ResearchWorkflowService | undefined; let store: ResearchStore | undefined
  let local:LocalScienceWorkflow|undefined
  ctx.inject(['localScienceWorkflow'],scope=>{local=scope.localScienceWorkflow;scope.effect(()=>()=>{local=undefined})})
  const get = () => {
    if (service) return service
    const path = process.env.ZEROWALL_RESEARCH_DB; if (!path) throw new Error('Research database is unavailable')
    store = new ResearchStore(path); service = new ResearchWorkflowService(store, join(dirname(path), 'workflows'), mcp,()=>local)
    return service
  }
  // Code callers use the same service and must supply their ordinary ToolRunContext.
  ctx.provide('researchWorkflow', { get })
  ctx.effect(() => () => store?.close())
  ctx.tools.register(defineTool({
    name: 'research_workflow', description: 'List/describe registered research workflows; submit once, inspect progress/artifact manifests, or cancel. Remote methods use the existing rmcp connection; Fiji runs through the local Host scientific service. Load the module skill first.',
    parameters: { action: { type: 'string', required: true, enum: ['list', 'search', 'describe', 'query', 'run', 'status', 'cancel'] }, workflow_id: { type: 'string' }, query: { type: 'string' }, offset: { type: 'number' }, limit: { type: 'number' }, offline: { type: 'boolean' }, operation: { type: 'string' }, parameters: { type: 'json' }, research_task_id: { type: 'string', description: 'Optional existing research task to reserve and reconcile with this Run.' }, run_id: { type: 'string' }, confirm: { type: 'boolean' } },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      switch (args.action) {
        case 'list': return get().list()
        case 'describe': return args.offline ? { ...get().describe(args.workflow_id ?? '', args.operation), connected: false, verification: 'offline_unverified' } : get().describeLive(args.workflow_id ?? '', args.operation, exec)
        case 'search': return get().search(args.workflow_id ?? '', args.query ?? '', args.offset ?? 0, args.limit ?? 25, exec)
        case 'query': return get().query(args.workflow_id ?? '', object(args.parameters), exec)
        case 'run': return get().run(args.workflow_id ?? '', { ...object(args.parameters), ...(args.research_task_id === undefined ? {} : { research_task_id: String(args.research_task_id) }) }, exec)
        case 'status': return get().status(args.run_id ?? '', exec)
        case 'cancel': return get().cancel(args.run_id ?? '', args.confirm === true, exec)
      }
    },
  }))
}
