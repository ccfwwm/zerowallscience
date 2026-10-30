import { randomUUID, createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import { ResearchStore } from '@zerowallscience/research-store'
import type { LocalScienceWorkflow, RunStatus } from '@zerowallscience/research-store/types'
import { rWorkflows } from '../shared/r-workflows.js'
import { rejectToolUniverseSecretArguments } from './tooluniverse-transport.js'
import type { ZeroWallMcpService } from './index.js'

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type ObjectValue = { [key: string]: Json }
type Lifecycle = { id_fields: readonly string[]; argument: string; status: string; cancel?: string; manifest?: string; log?: string }
type Operation = { lifecycle?: Lifecycle | null; query_allowed?: boolean; effects?: string; execution?: string; id: string; public_tool: string; summary: string; input_schema: unknown; requires_confirmation: boolean }
type Module = { id: string; skill: string; groups: readonly string[]; operations: readonly Operation[] }
interface State { run_id: string; workflow_id: string; operation: string; workspace: string; request_id: string; fingerprint: string; request_fingerprint?: string; research_task_id?: string; research_run_id?: string; remote_id?: string; remote_key?: string; remote_project?: string; status_operation?: string; cancel_operation?: string; manifest_operation?: string; result?: ObjectValue; submission?: ObjectValue; lifecycle?: Lifecycle | null; status?: string; progress?: number; artifacts?: Array<{ name: string; uri: string; mediaType?: string }>; error?: string | null }
declare module '@deepseek-ai/cordis' {
  interface Context { researchWorkflow: { get(): ResearchWorkflowService } }
  interface Context { localScienceWorkflow: LocalScienceWorkflow }
}
const modules: readonly Module[] = rWorkflows.modules
const object = (value: unknown): ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {}
const scalar = (value: unknown): unknown => Array.isArray(value) && value.length === 1 ? value[0] : value
const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v !== null && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, value]) => [k, canonical(value)])) : v
const terminal = new Set(['succeeded', 'failed', 'cancelled', 'timed_out'])

export function normalizeJsonArguments(value: unknown): ObjectValue {
  const ancestors = new WeakSet<object>()
  const visit = (item: unknown, inArray = false): Json => {
    if (item === undefined && inArray) return null
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item
    if (typeof item === 'number' && Number.isFinite(item)) return Object.is(item, -0) ? 0 : item
    if (Array.isArray(item)) {
      if (Object.getPrototypeOf(item) !== Array.prototype || ancestors.has(item)) throw new Error('TOOL_ARGUMENTS_NOT_JSON_SERIALIZABLE')
      for (const key of Reflect.ownKeys(item)) {
        if (key === 'length') continue
        if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= item.length) throw new Error('TOOL_ARGUMENTS_NOT_JSON_SERIALIZABLE')
        const descriptor = Object.getOwnPropertyDescriptor(item, key)
        if (!descriptor?.enumerable || !('value' in descriptor)) throw new Error('TOOL_ARGUMENTS_NOT_JSON_SERIALIZABLE')
      }
      ancestors.add(item)
      const result = Array.from({ length: item.length }, (_, index) => Object.hasOwn(item, index) ? visit(item[index], true) : null)
      ancestors.delete(item)
      return result
    }
    if (typeof item === 'object' && item !== null) {
      const prototype = Object.getPrototypeOf(item)
      if ((prototype !== Object.prototype && prototype !== null) || ancestors.has(item)) throw new Error('TOOL_ARGUMENTS_NOT_JSON_SERIALIZABLE')
      ancestors.add(item)
      const result: ObjectValue = {}
      for (const key of Reflect.ownKeys(item)) {
        if (typeof key !== 'string') throw new Error('TOOL_ARGUMENTS_NOT_JSON_SERIALIZABLE')
        const descriptor = Object.getOwnPropertyDescriptor(item, key)
        if (!descriptor?.enumerable || !('value' in descriptor)) throw new Error('TOOL_ARGUMENTS_NOT_JSON_SERIALIZABLE')
        if (descriptor.value !== undefined) Object.defineProperty(result, key, { value: visit(descriptor.value), enumerable: true, configurable: true, writable: true })
      }
      ancestors.delete(item)
      return result
    }
    throw new Error('TOOL_ARGUMENTS_NOT_JSON_SERIALIZABLE')
  }
  const result = visit(value)
  if (result === null || Array.isArray(result) || typeof result !== 'object') throw new Error('TOOL_ARGUMENTS_MUST_BE_JSON_OBJECT')
  return result
}

export function workflowPayload(value: unknown): ObjectValue {
  const result = object(value)
  if (result.structuredContent) return object(result.structuredContent)
  if (Array.isArray(result.content)) {
    const text = result.content.map(object).find(block => block.type === 'text')?.text
    if (typeof text === 'string') { try { return object(JSON.parse(text)) } catch { return { text } } }
  }
  return result
}

/** Accept both the native Host envelope and clients that flatten query fields. */
export function normalizeWorkflowQuery(args: { operation?: unknown; parameters?: unknown }, workflowId?: string): ObjectValue {
  const parameters = object(args.parameters)
  const canonicalize = (value: unknown) => {
    if (typeof value !== 'string' || !value.trim()) return undefined
    const operation = value.trim()
    if (workflowId === 'tooluniverse') return ({ status: 'tooluniverse.status', catalog: 'tooluniverse.search', search: 'tooluniverse.search' } as Record<string, string>)[operation] ?? operation
    return operation
  }
  const topOperation = canonicalize(args.operation)
  const nestedOperation = canonicalize(parameters.operation)
  if (topOperation && nestedOperation && topOperation !== nestedOperation) throw new Error('OPERATION_CONFLICT: top-level operation and parameters.operation must match.')
  const operation = topOperation ?? nestedOperation
  if (!operation) throw new Error('OPERATION_REQUIRED: provide operation at the top level or inside parameters.operation.')
  if (workflowId === 'tooluniverse' && operation === 'tooluniverse.status') return { operation, arguments: {} }
  const nestedArguments = parameters.arguments
  const queryArguments = nestedArguments !== null && typeof nestedArguments === 'object' && !Array.isArray(nestedArguments)
    ? object(nestedArguments)
    : Object.fromEntries(Object.entries(parameters).filter(([key]) => !['operation', 'arguments', 'request_id'].includes(key))) as ObjectValue
  return { operation, arguments: queryArguments }
}

/** A Host service, shared by the model tool and code callers. Only registered catalog operations execute. */
export class ResearchWorkflowService {
  private readonly pending = new Map<string, Promise<ObjectValue>>()
  constructor(private readonly store: ResearchStore, private readonly directory: string, private readonly mcp: Pick<ZeroWallMcpService, 'ensureConnected' | 'executeCompactCapability' | 'workflowRequest'>, private readonly local: () => LocalScienceWorkflow | undefined = () => undefined) {}
  private localService(): LocalScienceWorkflow { const local=this.local();if(!local)throw new Error('Local Fiji workflow service is unavailable.');return local }
  private sessionId(exec:ToolRunContext):string {const id=exec.agent?.session.id;if(!id)throw new Error('An active conversation session is required.');return String(id)}
  list(): ObjectValue { return { workflows: [...modules.map(module => ({ workflow_id: module.id, skill: module.skill, operation_count: module.operations.length })), ...(this.local()?[this.localService().list()]:[])] } }
  describe(id: string, operation?: string): ObjectValue {
    if(id==='fiji')return this.localService().describe(operation)
    const module = this.module(id)
    if (operation) return JSON.parse(JSON.stringify(this.operation(module, operation))) as ObjectValue
    return { workflow_id: id, skill: module.skill, catalog_version: rWorkflows.catalog_version, parameters: { operation: 'Exact operation id below', arguments: 'Object validated against the live backend schema', request_id: 'Unique idempotency key, reuse only for the same submission' }, operations: module.operations.map(op => ({ id: op.id, summary: op.summary, requires_confirmation: op.requires_confirmation })) }
  }
  async search(id: string, query: string, offset: number, limit: number, exec: ToolRunContext): Promise<ObjectValue> {
    if(id==='fiji') { const operation=this.localService().describe();return {workflow_id:id,operations: offset>0 || limit<1 || (query && !JSON.stringify(operation).toLowerCase().includes(query.toLowerCase()))?[]:[operation]} }
    this.assertWorkflowId(id)
    return object(await this.mcp.workflowRequest('workflow_search', { workflow_id: id, query, offset, limit }, exec))
  }
  async describeLive(id: string, operation: string | undefined, exec: ToolRunContext): Promise<ObjectValue> {
    if(id==='fiji')return this.localService().describe(operation)
    this.assertWorkflowId(id)
    if (!operation) return this.search(id, '', 0, 25, exec)
    return object(await this.mcp.workflowRequest('workflow_describe', { workflow_id: id, operation }, exec))
  }
  async query(id: string, parameters: ObjectValue, exec: ToolRunContext): Promise<ObjectValue> {
    this.assertWorkflowId(id)
    const module = modules.find(item => item.id === id)
    const rawOperation = typeof parameters.operation === 'string' ? parameters.operation.trim() : ''
    const operationId = id === 'tooluniverse' && rawOperation === 'status' ? 'tooluniverse.status' : rawOperation
    if (!operationId) throw new Error('OPERATION_REQUIRED: provide an exact registered read operation.')
    const operation = module
      ? this.operation(module, operationId)
      : await this.describeLive(id, operationId, exec) as unknown as Operation
    if (operation.id !== operationId) throw new Error('Invalid live operation contract')
    if (operation.query_allowed !== true) throw new Error(`READ_ONLY_REQUIRED: ${operationId} must use run`)
    if (operationId === 'r.register.project') throw new Error('PROJECT_REGISTRATION_DISABLED: ZeroWall does not create or register remote projects.')
    const argumentsValue = this.withExistingProjectId(operation, normalizeJsonArguments(object(parameters.arguments)), exec)
    return object(await this.mcp.workflowRequest('workflow_query', { workflow_id: id, operation: operationId, arguments: argumentsValue }, exec))
  }
  private module(id: string): Module { const module = modules.find(item => item.id === id); if (!module) throw new Error(`UNKNOWN_WORKFLOW: ${id}`); return module }
  private assertWorkflowId(id: string): void {
    if (modules.some(module => module.id === id) || /^r\.[a-z][a-z0-9_-]{0,63}$/u.test(id)) return
    throw new Error(`UNKNOWN_WORKFLOW: ${id}`)
  }
  private operation(module: Module, id: string): Operation { const op = module.operations.find(item => item.id === id); if (!op) throw new Error(`Operation ${id} is not registered in ${module.id}`); return op }
  private workspace(exec: ToolRunContext): string {
    const cwd = exec.agent?.session.header.cwd
    if (cwd) return resolve(cwd)
    const database = process.env.ZEROWALL_RESEARCH_DB?.trim()
    if (database) return resolve(dirname(database), 'workspace')
    throw new Error('An active workspace is required.')
  }
  private withExistingProjectId(operation: Operation, args: ObjectValue, exec: ToolRunContext): ObjectValue {
    const schema = object(operation.input_schema)
    const required = Array.isArray(schema.required) ? schema.required : []
    if (!required.includes('project_id') || (typeof args.project_id === 'string' && args.project_id.trim())) return args
    const canonicalPath = (path: string) => {
      const value = resolve(path).replaceAll('\\', '/').replace(/\/+$/u, '')
      return process.platform === 'win32' ? value.toLowerCase() : value
    }
    const workspace = canonicalPath(this.workspace(exec))
    const matchingProjects = this.store.listProjects().filter(project => canonicalPath(project.rootPath) === workspace)
    const configuredIds = new Set(matchingProjects.map(project => {
      const value = this.store.getProjectPreferences(project.id).settings.rPlatformProjectId
      return typeof value === 'string' && /^[A-Za-z0-9._-]{1,128}$/u.test(value.trim()) ? value.trim() : ''
    }).filter(Boolean))
    if (configuredIds.size > 1) throw new Error('REMOTE_PROJECT_BINDING_AMBIGUOUS: multiple local projects at this workspace have different R Platform project IDs.')
    const projectId = configuredIds.values().next().value as string | undefined
    if (projectId) return { ...args, project_id: projectId }
    throw new Error('EXISTING_PROJECT_ID_REQUIRED: configure this project\'s existing R Platform project ID in project settings or supply an existing project_id. ZeroWall will not create or register a project.')
  }
  private projectsAt(workspace: string) {
    const canonicalPath = (path: string) => {
      const value = resolve(path).replaceAll('\\', '/').replace(/\/+$/u, '')
      return process.platform === 'win32' ? value.toLowerCase() : value
    }
    const canonicalWorkspace = canonicalPath(workspace)
    return this.store.listProjects().filter(project => canonicalPath(project.rootPath) === canonicalWorkspace)
  }
  private researchTarget(workspace: string, taskId: string) {
    const matchingProjects = this.projectsAt(workspace)
    for (const project of matchingProjects) {
      for (const study of this.store.listResearchStudies(project.id)) {
        const task = this.store.listResearchTasks(study.id).find(item => item.id === taskId)
        if (task) return { project, study, task }
      }
    }
    throw new Error('RESEARCH_TASK_NOT_FOUND: the supplied task must belong to an existing local project matching this workspace.')
  }
  private async syncResearchTask(state: State): Promise<void> {
    if (!state.research_task_id) return
    const { project, task: initialTask } = this.researchTarget(state.workspace, state.research_task_id)
    let run = state.research_run_id ? this.store.getRun(state.research_run_id) : this.store.listRuns(project.id).find(item =>
      item.leaseOwner === 'research-workflow' && item.inputs.some(input => input.name === 'workflow_run_id' && input.uri === state.run_id),
    )
    if (run && run.projectId !== project.id) throw new Error('Research workflow Run belongs to another project.')
    if (!run) {
      if (initialTask.status === 'running') throw new Error('RESEARCH_TASK_ALREADY_RUNNING: the task is bound to another Run.')
      run = this.store.createRun({
        projectId: project.id,
        name: `${state.workflow_id}: ${state.operation}`,
        command: 'research_workflow',
        workingDirectory: state.workspace,
        status: 'running',
        progress: Math.max(0, Math.min(0.99, state.progress ?? 0.1)),
        leaseOwner: 'research-workflow',
        ...(state.remote_id ? { remotePid: state.remote_id } : {}),
        inputs: [
          { name: 'workflow_run_id', uri: state.run_id },
          { name: 'request_id', uri: state.request_id },
          ...(state.remote_project ? [{ name: 'project_id', uri: state.remote_project }] : []),
        ],
      })
      state.research_run_id = run.id
      await this.save(state)
    } else {
      state.research_run_id = run.id
    }

    let task = this.researchTarget(state.workspace, state.research_task_id).task
    if (['succeeded', 'failed', 'cancelled'].includes(task.status)) {
      if (task.runId !== run.id) throw new Error('RESEARCH_TASK_TERMINAL: the task is already bound to another Run.')
    } else if (task.status === 'running') {
      if (task.runId !== run.id) throw new Error('RESEARCH_TASK_ALREADY_RUNNING: the task is bound to another Run.')
    } else if (['ready', 'failed', 'blocked'].includes(task.status)) {
      task = this.store.updateResearchTask(task.id, { expectedVersion: task.version, status: 'running', runId: run.id })
    } else if (task.runId !== run.id) {
      throw new Error(`RESEARCH_TASK_NOT_RUNNABLE: task is ${task.status} and is not bound to this workflow.`)
    }

    const nextRunStatus: RunStatus = state.status === 'submitted' ? 'submitted'
      : state.status === 'paused' ? 'paused'
        : state.status === 'cancelling' ? 'cancelling'
          : state.status === 'succeeded' ? 'succeeded'
            : state.status === 'cancelled' ? 'cancelled'
              : state.status === 'timed_out' ? 'timed_out'
                : state.status === 'failed' ? 'failed' : 'running'
    const latestRun = this.store.getRun(run.id)!
    const changes = {
      status: nextRunStatus,
      progress: state.progress ?? latestRun.progress,
      outputs: state.artifacts ?? latestRun.outputs,
      ...(state.remote_id ? { remotePid: state.remote_id } : {}),
      ...(state.error ? { error: state.error } : { error: '' }),
    }
    if (latestRun.status !== changes.status || latestRun.progress !== changes.progress
      || JSON.stringify(latestRun.outputs) !== JSON.stringify(changes.outputs)
      || latestRun.remotePid !== changes.remotePid || latestRun.error !== changes.error) {
      run = this.store.updateRun(run.id, changes)
    } else {
      run = latestRun
    }

    const nextTaskStatus = run.status === 'succeeded' ? 'succeeded'
      : ['failed', 'timed_out'].includes(run.status) ? 'failed'
        : run.status === 'cancelled' ? 'cancelled' : undefined
    task = this.researchTarget(state.workspace, state.research_task_id).task
    if (task.status === 'running' && nextTaskStatus) {
      this.store.updateResearchTask(task.id, { expectedVersion: task.version, status: nextTaskStatus })
    }
  }
  private path(id: string): string { if (!/^[a-f0-9-]{36}$/u.test(id)) throw new Error('Invalid workflow run id'); return join(this.directory, `${id}.json`) }
  private idFor(workspace: string, requestId: string): string {
    const hex = createHash('sha256').update(`${workspace}\0${requestId}`).digest('hex').slice(0, 32)
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  private async save(state: State): Promise<void> { await mkdir(this.directory, { recursive: true }); const target = this.path(state.run_id); const temp = `${target}.${randomUUID()}.tmp`; await writeFile(temp, JSON.stringify(state)); await rename(temp, target) }
  private async load(id: string, exec: ToolRunContext): Promise<State> {
    const state = JSON.parse(await readFile(this.path(id), 'utf8')) as State
    if (state.workspace !== this.workspace(exec)) throw new Error('Workflow belongs to another workspace')
    if (!state.status) {
      const legacy = this.store.getRun(id)
      state.status = legacy?.status ?? 'paused'
      state.progress = legacy?.progress ?? 0
      state.artifacts = legacy?.outputs ?? []
      state.error = legacy?.error ?? null
    }
    return state
  }
  private async call(id: string, args: ObjectValue, exec: ToolRunContext): Promise<ObjectValue> {
    await this.mcp.ensureConnected('rmcp')
    const result = await this.mcp.executeCompactCapability(id, args, exec)
    const payload = workflowPayload(result.value ?? { content: result.content })
    if (payload.ok === false || payload.isError === true) throw new Error(String(payload.error ?? 'Backend operation failed'))
    return payload
  }
  async run(id: string, parameters: ObjectValue, exec: ToolRunContext): Promise<ObjectValue> {
    if(id==='fiji')return this.localService().execute(this.sessionId(exec),'run',parameters)
    this.assertWorkflowId(id)
    const module = modules.find(item => item.id === id) ?? { id, skill: '', groups: [], operations: [] }
    const operationId = String(parameters.operation ?? '')
    const operation = await this.describeLive(id, operationId, exec) as unknown as Operation
    if (operation.id !== operationId) throw new Error('Invalid live operation contract')
    if (operation.id === 'r.register.project') throw new Error('PROJECT_REGISTRATION_DISABLED: ZeroWall does not create or register remote projects.')
    const args = { ...object(parameters.arguments) }
    if (id === 'tooluniverse') rejectToolUniverseSecretArguments(args)
    if (operation.requires_confirmation && args.confirm !== true) throw new Error('CONFIRMATION_REQUIRED: approve the concrete operation and any first remote upload.')
    if (args.api_key || args.token || args.password) throw new Error('Use the Host credential broker; workflow arguments must not contain credentials.')
    const resolvedArgs = this.withExistingProjectId(operation, args, exec)
    const workspace = this.workspace(exec)
    const requestId = parameters.request_id
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/u.test(requestId)) throw new Error('request_id is required for safe submission retries.')
    const properties = object(object(operation.input_schema).properties)
    if (['omicverse', 'tooluniverse'].includes(id) && 'request_id' in properties) resolvedArgs.request_id = createHash('sha256').update(requestId).digest('hex')
    const researchTaskId = parameters.research_task_id
    if (researchTaskId !== undefined && (typeof researchTaskId !== 'string' || !/^[a-f0-9-]{36}$/u.test(researchTaskId))) throw new Error('research_task_id must be an existing Research task UUID.')
    const key = `${workspace}:${requestId}`
    if (typeof researchTaskId === 'string') this.researchTarget(workspace, researchTaskId)
    // Concurrent callers with the same request cannot race past durable idempotency.
    const active = this.pending.get(key)
    if (active) { await active; return this.run(id, parameters, exec) }
    const task = this.submit(module, operation, resolvedArgs, workspace, requestId, exec, typeof researchTaskId === 'string' ? researchTaskId : undefined)
    this.pending.set(key, task)
    try { return await task } finally { this.pending.delete(key) }
  }
  private async submit(module: Module, operation: Operation, args: ObjectValue, workspace: string, requestId: string, exec: ToolRunContext, researchTaskId?: string): Promise<ObjectValue> {
    const fingerprint = createHash('sha256').update(JSON.stringify(canonical({ workflow: module.id, operation: operation.id, args, ...(researchTaskId ? { research_task_id: researchTaskId } : {}) }))).digest('hex')
    const runId = this.idFor(workspace, requestId)
    const statePath = this.path(runId)
    try {
      const existing = JSON.parse(await readFile(statePath, 'utf8')) as State
      if (existing.request_fingerprint !== fingerprint && existing.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_CONFLICT: request_id was already used with different workflow arguments.')
      const state = await this.load(runId, exec)
      await this.syncResearchTask(state)
      return this.view(state)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('IDEMPOTENCY_CONFLICT:')) throw error
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    const state: State = { run_id: runId, workflow_id: module.id, operation: operation.id, workspace, request_id: requestId, fingerprint, request_fingerprint: fingerprint, status: 'submitted', progress: 0.1, artifacts: [], lifecycle: operation.lifecycle ?? null, ...(researchTaskId ? { research_task_id: researchTaskId } : {}), ...(typeof args.project_id === 'string' ? { remote_project: args.project_id } : {}) }
    await this.save(state)
    try {
      if (module.id === 'r.compute') await this.call('r.runtime.capabilities', {}, exec)
      state.status = 'running'
      await this.save(state)
      state.result = await this.call(operation.id, args, exec)
      state.submission = state.result
      this.track(state)
      if (!state.remote_project) {
        const nested = object(scalar(state.result.job ?? state.result.run ?? state.result.download))
        const projectId = scalar(state.result.project_id ?? nested.project_id)
        if (typeof projectId === 'string' && projectId) state.remote_project = projectId
      }
      if (!state.remote_id) {
        state.status = 'succeeded'
        state.progress = 1
        state.artifacts = this.outputs(state)
        await this.save(state)
      } else {
        await this.save(state)
        await this.refresh(state, exec)
      }
    } catch (error) {
      state.status = state.remote_id ? 'paused' : 'failed'
      state.error = `${String(error)}; do not resubmit with a new request_id until remote job history has been checked.`
      await this.save(state)
    }
    await this.syncResearchTask(state)
    return this.view(state)
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
    if (terminal.has(state.status ?? '')) return
    if (!state.remote_id) return
    const args: ObjectValue = { ...(state.remote_project ? { project_id: state.remote_project } : {}), [state.remote_key!]: state.remote_id }
    const result = await this.call(state.status_operation!, args, exec)
    state.result = result
    const job = object(scalar(result.job ?? result.run ?? result.download))
    const status = String(scalar(result.status ?? job.status) ?? 'running')
    const mapped = ['complete', 'completed', 'success', 'succeeded'].includes(status) ? 'succeeded' : ['failed', 'error'].includes(status) ? 'failed' : ['cancelled', 'canceled'].includes(status) ? 'cancelled' : status === 'timed_out' ? 'timed_out' : state.status === 'cancelling' ? 'cancelling' : 'running'
    if (mapped === 'succeeded' && state.manifest_operation) state.result = { ...result, artifacts: await this.call(state.manifest_operation, args, exec) }
    const progress = Number(scalar(result.progress ?? job.progress) ?? 0.1)
    state.status = mapped
    state.progress = mapped === 'succeeded' ? 1 : Math.min(0.99, Math.max(0, Number.isFinite(progress) ? progress > 1 ? progress / 100 : progress : 0.1))
    state.error = mapped === 'failed' ? String(result.error ?? job.error ?? 'Remote job failed') : null
    state.artifacts = this.outputs(state)
    await this.save(state)
  }
  private outputs(state: State): Array<{ name: string; uri: string; mediaType?: string }> {
    const result = state.result ?? {}; const artifacts = object(result.artifacts ?? result.manifest)
    const files = artifacts.files ?? artifacts.outputs ?? object(artifacts.manifest).files
    const references = (Array.isArray(files) ? files : files ? [files] : []).map(object).filter(file => typeof scalar(file.path) === 'string').map(file => {
      const name = String(scalar(file.path))
      // R manifests name files relative to the job result directory.
      const rJob = ['r.get.job', 'r.get.sc.tenifold.run'].includes(state.status_operation ?? '') ? state.remote_id : ['figureya.get.job', 'r.geo.get.analysis.run', 'r.nhanes.get.analysis.run'].includes(state.status_operation ?? '') ? scalar(artifacts.job_id ?? result.job_id ?? object(result.job).id) : undefined
      const artifactRoot = scalar(artifacts.artifact_root)
      const projectPath = scalar(file.project_artifact_path)
      const path = typeof projectPath === 'string' ? projectPath : typeof artifactRoot === 'string' && name.startsWith(`${artifactRoot}/`) ? name : typeof rJob === 'string' ? `.zerowall/jobs/${rJob}/result/${name}` : state.status_operation === 'biomni.get.job' ? `biomni/${state.remote_id}/${name}` : name
      const encodedPath = path.split('/').map(encodeURIComponent).join('/')
      return { name, uri: state.remote_project ? `rmcp://${encodeURIComponent(state.remote_project)}/${encodedPath}` : `rmcp:/${encodedPath}`, mediaType: String(scalar(file.mime_type) ?? 'application/octet-stream') }
    })
    return [{ name: 'result', uri: pathToFileURL(this.path(state.run_id)).href, mediaType: 'application/json' }, ...references]
  }
  private view(state: State): ObjectValue { return { run_id: state.research_run_id ?? state.run_id, workflow_id: state.workflow_id, status: state.status ?? 'paused', progress: state.progress ?? 0, remote_id: state.remote_id ?? null, remote_key: state.remote_key ?? null, submission: state.submission ?? {}, artifacts: JSON.parse(JSON.stringify(state.artifacts ?? [])), result: state.result ?? {}, error: state.error ?? null } }
  async status(id: string, exec: ToolRunContext): Promise<ObjectValue> {
    const run = this.store.getRun(id)
    if (run?.leaseOwner === 'fiji-workflow') return this.localService().execute(this.sessionId(exec), 'status', {}, id)
    const workflowRunId = run?.leaseOwner === 'research-workflow'
      ? run.inputs.find(input => input.name === 'workflow_run_id')?.uri
      : id
    if (!workflowRunId) throw new Error('Research workflow Run is missing its durable workflow id.')
    const state = await this.load(workflowRunId, exec)
    await this.refresh(state, exec)
    await this.syncResearchTask(state)
    return this.view(state)
  }
  async cancel(id: string, confirm: boolean, exec: ToolRunContext): Promise<ObjectValue> {
    if (!confirm) throw new Error('CONFIRMATION_REQUIRED: cancel this workflow run.')
    const run = this.store.getRun(id)
    if (run?.leaseOwner === 'fiji-workflow') return this.localService().execute(this.sessionId(exec), 'cancel', {}, id)
    const workflowRunId = run?.leaseOwner === 'research-workflow'
      ? run.inputs.find(input => input.name === 'workflow_run_id')?.uri
      : id
    if (!workflowRunId) throw new Error('Research workflow Run is missing its durable workflow id.')
    const state = await this.load(workflowRunId, exec)
    if (terminal.has(state.status ?? '')) return this.view(state)
    if (!state.remote_id || !state.cancel_operation) throw new Error('No remote job id; inspect backend history before cancelling.')
    await this.call(state.cancel_operation, { ...(state.remote_project ? { project_id: state.remote_project } : {}), [state.remote_key!]: state.remote_id, confirm: true }, exec)
    state.status = 'cancelling'
    await this.save(state)
    await this.refresh(state, exec)
    await this.syncResearchTask(state)
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
    store = new ResearchStore(path)
    service = new ResearchWorkflowService(store, join(dirname(path), 'workflows'), mcp,()=>local)
    return service
  }
  // Code callers use the same service and must supply their ordinary ToolRunContext.
  ctx.provide('researchWorkflow', { get })
  ctx.effect(() => () => store?.close())
  ctx.tools.register(defineTool({
  name: 'research_workflow', description: 'List and inspect registered workflows; query, submit, track, or cancel work through the configured remote MCP connection. Query accepts operation at the top level or parameters.operation; arguments may be nested under parameters.arguments or supplied directly in parameters. ZeroWall does not create local Projects, Studies, Tasks, or register remote projects. If a backend operation requires project_id, provide an existing ID supplied by you or the service. Runner input schemas, permissions, confirmation, dependencies, budgets, and runtime availability remain enforced. Load the module skill first.',
    parameters: { action: { type: 'string', required: true, enum: ['list', 'search', 'describe', 'query', 'run', 'status', 'cancel'] }, workflow_id: { type: 'string' }, query: { type: 'string' }, offset: { type: 'number' }, limit: { type: 'number' }, offline: { type: 'boolean' }, operation: { type: 'string' }, parameters: { type: 'json' }, run_id: { type: 'string' }, confirm: { type: 'boolean' } },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      switch (args.action) {
        case 'list': return get().list()
        case 'describe': return args.offline ? { ...get().describe(args.workflow_id ?? '', args.operation), connected: false, verification: 'offline_unverified' } : get().describeLive(args.workflow_id ?? '', args.operation, exec)
        case 'search': return get().search(args.workflow_id ?? '', args.query ?? '', args.offset ?? 0, args.limit ?? 25, exec)
        case 'query': return get().query(args.workflow_id ?? '', normalizeWorkflowQuery(args, args.workflow_id ?? ''), exec)
        case 'run': return get().run(args.workflow_id ?? '', object(args.parameters), exec)
        case 'status': return get().status(args.run_id ?? '', exec)
        case 'cancel': return get().cancel(args.run_id ?? '', args.confirm === true, exec)
      }
    },
  }))
}
