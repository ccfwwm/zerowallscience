import { randomUUID, createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import { ResearchStore } from '@zerowallscience/research-store'
import { rWorkflows } from '../shared/r-workflows.js'
import type { ZeroWallMcpService } from './index.js'

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type ObjectValue = { [key: string]: Json }
type Operation = { id: string; public_tool: string; summary: string; input_schema: unknown; requires_confirmation: boolean }
type Module = { id: string; skill: string; groups: readonly string[]; operations: readonly Operation[] }
interface State { run_id: string; workflow_id: string; operation: string; workspace: string; request_id: string; fingerprint: string; remote_id?: string; remote_key?: string; remote_project?: string; status_operation?: string; cancel_operation?: string; manifest_operation?: string; result?: ObjectValue }
declare module '@deepseek-ai/cordis' {
  interface Context { researchWorkflow: { get(): ResearchWorkflowService } }
}
const modules: readonly Module[] = rWorkflows.modules
const object = (value: unknown): ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {}
const scalar = (value: unknown): unknown => Array.isArray(value) && value.length === 1 ? value[0] : value
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
  constructor(private readonly store: ResearchStore, private readonly directory: string, private readonly mcp: Pick<ZeroWallMcpService, 'ensureConnected' | 'executeCompactCapability'>) {}
  list(): ObjectValue { return { workflows: modules.map(module => ({ workflow_id: module.id, skill: module.skill, operation_count: module.operations.length })) } }
  describe(id: string, operation?: string): ObjectValue {
    const module = this.module(id)
    if (operation) return JSON.parse(JSON.stringify(this.operation(module, operation))) as ObjectValue
    return { workflow_id: id, skill: module.skill, catalog_version: rWorkflows.catalog_version, parameters: { operation: 'Exact operation id below', arguments: 'Object validated against the live backend schema', request_id: 'Unique idempotency key, reuse only for the same submission' }, operations: module.operations.map(op => ({ id: op.id, summary: op.summary, requires_confirmation: op.requires_confirmation })) }
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
    return workflowPayload(result.value ?? { content: result.content })
  }
  async run(id: string, parameters: ObjectValue, exec: ToolRunContext): Promise<ObjectValue> {
    const module = this.module(id)
    const operation = this.operation(module, String(parameters.operation ?? ''))
    const args = object(parameters.arguments)
    if (operation.requires_confirmation && args.confirm !== true) throw new Error('CONFIRMATION_REQUIRED: approve the concrete operation and any first remote upload.')
    if (args.api_key || args.token || args.password) throw new Error('Use the Host credential broker; workflow arguments must not contain credentials.')
    const workspace = this.workspace(exec)
    const requestId = parameters.request_id
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/u.test(requestId)) throw new Error('request_id is required for safe submission retries.')
    const key = `${workspace}:${requestId}`
    // Concurrent callers with the same request cannot race past durable idempotency.
    const active = this.pending.get(key)
    if (active) { await active; return this.run(id, parameters, exec) }
    const task = this.submit(module, operation, args, workspace, requestId, exec)
    this.pending.set(key, task)
    try { return await task } finally { this.pending.delete(key) }
  }
  private async submit(module: Module, operation: Operation, args: ObjectValue, workspace: string, requestId: string, exec: ToolRunContext): Promise<ObjectValue> {
    const project = this.store.listProjects().find(item => resolve(item.rootPath) === workspace) ?? this.store.createProject({ name: workspace.split(/[\\/]/u).pop() || 'Research', rootPath: workspace })
    const fingerprint = createHash('sha256').update(JSON.stringify({ workflow: module.id, operation: operation.id, args })).digest('hex')
    const existing = this.store.listRuns(project.id).find(run => run.leaseOwner === 'research-workflow' && run.inputs.some(input => input.name === 'request_id' && input.uri === requestId))
    if (existing) { const state = await this.load(existing.id, exec); if (state.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_CONFLICT: request_id was already used for different parameters.'); return this.view(state) }
    const run = this.store.createRun({ projectId: project.id, name: `${module.id}: ${operation.id}`, command: 'research_workflow', workingDirectory: workspace, status: 'submitted', leaseOwner: 'research-workflow', inputs: [{ name: 'request_id', uri: requestId }] })
    const state: State = { run_id: run.id, workflow_id: module.id, operation: operation.id, workspace, request_id: requestId, fingerprint, ...(typeof args.project_id === 'string' ? { remote_project: args.project_id } : {}) }
    await this.save(state)
    try {
      // Health and precise capability lookup both run through the normal permission pipeline.
      if (module.id === 'r.compute' || module.id === 'sc.knockout') await this.call(module.id === 'sc.knockout' ? 'r.validate.sc.tenifold.runtime' : 'r.runtime.capabilities', {}, exec)
      if (module.id === 'r.compute' && operation.id === 'r.submit.script') await this.call('r.register.project', { project_id: args.project_id ?? '', name: args.project_id ?? '' }, exec)
      this.store.updateRun(run.id, { status: 'running', progress: 0.1 })
      state.result = await this.call(operation.id, args, exec)
      this.track(state)
      await this.save(state)
      if (!state.remote_id) this.store.updateRun(run.id, { status: 'succeeded', progress: 1, outputs: [{ name: 'result', uri: pathToFileURL(this.path(run.id)).href, mediaType: 'application/json' }] })
      else await this.refresh(state, exec)
      return this.view(state)
    } catch (error) {
      // Never replay an uncertain remote submission after timeout/disconnect.
      const current = this.store.getRun(run.id)!
      if (!terminal.has(current.status)) this.store.updateRun(run.id, { status: state.remote_id ? 'paused' : 'failed', error: `${String(error)}; do not resubmit with a new request_id until remote job history has been checked.` })
      await this.save(state)
      return this.view(state)
    }
  }
  private track(state: State): void {
    const result = state.result ?? {}; const nested = object(scalar(result.job ?? result.run ?? result.download))
    const pick = (name: string) => scalar(result[name] ?? nested[name])
    if (/\.(?:get|list|wait|cancel)\./u.test(state.operation)) return
    const downloadId = pick('download_job_id')
    if (typeof downloadId === 'string' && downloadId) {
      const prefix = state.workflow_id === 'biomni' ? 'biomni' : state.workflow_id
      state.remote_id = downloadId; state.remote_key = 'download_job_id'
      state.status_operation = prefix === 'r.geo' ? 'r.geo.wait.download' : `${prefix}.get.download.status`
      state.cancel_operation = `${prefix}.cancel.download`
      return
    }
    const asynchronous = pick('job_id') !== undefined || /(?:submit|run\.agent|call\.tool|run\.python|run\.plan|run\.analysis\.plan|generate\.|single\.cell\.)/u.test(state.operation)
    if (!asynchronous) return
    const id = pick('run_id') ?? pick('job_id') ?? pick('id')
    if (typeof id !== 'string' || !id) {
      if (['queued', 'pending', 'running'].includes(String(pick('status')))) throw new Error('Backend returned an active task without a usable task id; inspect backend history.')
      return
    }
    const prefix = state.workflow_id === 'biomni' ? 'biomni' : state.workflow_id === 'figureya' ? 'figureya' : state.operation.includes('run.analysis.plan') ? state.workflow_id : 'r'
    const analysis = prefix === 'r.geo' || prefix === 'r.nhanes'
    state.remote_id = id; state.remote_key = analysis || prefix === 'figureya' ? 'run_id' : 'job_id'
    state.status_operation = `${prefix}.get.${analysis ? 'analysis.run' : 'job'}`
    state.cancel_operation = prefix === 'figureya' ? 'figureya.cancel' : `${prefix}.cancel.${analysis ? 'analysis.run' : 'job'}`
    state.manifest_operation = `${prefix}.get.${analysis ? 'analysis.manifest' : prefix === 'figureya' ? 'manifest' : 'job.manifest'}`
  }
  private async refresh(state: State, exec: ToolRunContext): Promise<void> {
    const current = this.store.getRun(state.run_id)!
    if (!state.remote_id || terminal.has(current.status)) return
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
    this.store.updateRun(state.run_id, { status: mapped, progress: mapped === 'succeeded' ? 1 : Math.min(0.99, Math.max(0, Number.isFinite(progress) ? progress > 1 ? progress / 100 : progress : 0.1)), ...(mapped === 'failed' ? { error: String(result.error ?? job.error ?? 'Remote job failed') } : {}), outputs: [{ name: 'result', uri: pathToFileURL(this.path(state.run_id)).href, mediaType: 'application/json' }] })
  }
  private view(state: State): ObjectValue { const run = this.store.getRun(state.run_id)!; return { run_id: run.id, workflow_id: state.workflow_id, status: run.status, progress: run.progress, remote_id: state.remote_id ?? null, artifacts: JSON.parse(JSON.stringify(run.outputs)), result: state.result ?? {}, error: run.error ?? null } }
  async status(id: string, exec: ToolRunContext): Promise<ObjectValue> { const state = await this.load(id, exec); await this.refresh(state, exec); return this.view(state) }
  async cancel(id: string, confirm: boolean, exec: ToolRunContext): Promise<ObjectValue> {
    if (!confirm) throw new Error('CONFIRMATION_REQUIRED: cancel this workflow run.')
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
  const get = () => {
    if (service) return service
    const path = process.env.ZEROWALL_RESEARCH_DB; if (!path) throw new Error('Research database is unavailable')
    store = new ResearchStore(path); service = new ResearchWorkflowService(store, join(dirname(path), 'workflows'), mcp)
    return service
  }
  // Code callers use the same service and must supply their ordinary ToolRunContext.
  ctx.provide('researchWorkflow', { get })
  ctx.effect(() => () => store?.close())
  ctx.tools.register(defineTool({
    name: 'research_workflow', description: 'List/describe registered research workflows; submit once, inspect progress/artifact manifests, or cancel. Uses one existing rmcp connection. Load the module skill first.',
    parameters: { action: { type: 'string', required: true, enum: ['list', 'describe', 'run', 'status', 'cancel'] }, workflow_id: { type: 'string' }, operation: { type: 'string' }, parameters: { type: 'json' }, run_id: { type: 'string' }, confirm: { type: 'boolean' } },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      switch (args.action) {
        case 'list': return get().list()
        case 'describe': return get().describe(args.workflow_id ?? '', args.operation)
        case 'run': return get().run(args.workflow_id ?? '', object(args.parameters), exec)
        case 'status': return get().status(args.run_id ?? '', exec)
        case 'cancel': return get().cancel(args.run_id ?? '', args.confirm === true, exec)
      }
    },
  }))
}
