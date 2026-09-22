import { createHash } from 'node:crypto'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { JsonObject, ResearchDocumentRecord } from '@zerowallscience/research-store/types'

export const PILOT_VERSION = '7.0.0-pilot-evaluation.1'
export const PILOT_CONDITIONS = ['generic-agent', 'generic-agent-with-scientific-rules', 'expert-fixed-workflow', 'zerowall-full'] as const
export type PilotCondition = typeof PILOT_CONDITIONS[number]
export const PILOT_TASKS = [
  ['nhanes-weighted', '人口统计：合格 NHANES 加权估计', 'real-data'],
  ['nhanes-dxx-age-stop', '人口统计：DXX_H 年龄冲突停止', 'injected-error'],
  ['phenotype-match', '临床与 GWAS：肥胖和明确脱发表型匹配', 'real-data'],
  ['phenotype-mismatch', '临床与 GWAS：不同脱发表型错配', 'injected-error'],
  ['mr-reference', 'MR：公开汇总统计与敏感性分析', 'real-data'],
  ['mr-inapplicable', 'MR：单工具或弱工具方法阻断', 'injected-error'],
  ['coloc-reference', 'QTL：完整区域共定位参考', 'real-data'],
  ['coloc-insufficient', 'QTL：lead SNP 或必要字段不足', 'injected-error'],
  ['paired-rna', '供者设计：配对 RNA 与时间模型', 'real-data'],
  ['singlecell-pseudoreplication', '供者设计：单细胞供者与伪重复', 'injected-error'],
  ['obesity-alopecia-evidence', '证据综合：肥胖与脱发适用分支', 'real-data'],
  ['unsupported-mechanism', '证据综合：手术表达响应主张越界', 'injected-error'],
] as const
export interface PilotBudget { tokens: number; milliseconds: number; toolCalls: number; computeSeconds: number; humanMinutes: number; costUsd: number }
export interface PilotArtifactRef { artifactId: string; checksum: string }
export interface PilotTaskSpec {
  taskId: string; split: 'development' | 'pilot' | 'unseen'; inputKind: 'real-data' | 'injected-error'
  inputs: PilotArtifactRef[]; reference: PilotArtifactRef; rubric: JsonObject; numericTolerance: number | null
  requiredDeliverables: string[]; majorErrors: string[]; expectedDisposition: 'analysis' | 'justified-stop' | 'audit'
}
export interface PilotSpec {
  model: string; provider: string; budgetPerTrial: PilotBudget; tasks: PilotTaskSpec[]
  policyProvenanceIds: string[]; runtimeHashes: Record<string, string>
}
export interface PilotOutcome {
  runId: string; artifacts: PilotArtifactRef[]; model: string; provider: string
  usage: PilotBudget; disposition: 'analysis' | 'justified-stop' | 'audit'
  policyProvenanceIds: string[]
}
export interface PilotAdapterRequest { trialId: string; condition: PilotCondition; task: Pick<PilotTaskSpec, 'taskId' | 'inputs' | 'requiredDeliverables'>; spec: Omit<PilotSpec, 'tasks'>; freezeHash: string; signal: AbortSignal }
export type PilotAdapter = (request: PilotAdapterRequest) => Promise<PilotOutcome>
type TrialState = 'not-run' | 'running' | 'completed' | 'failed' | 'interrupted' | 'budget-exceeded'
interface Trial { id: string; taskId: string; condition: PilotCondition; status: TrialState; startedAt?: string; finishedAt?: string; outcome?: PilotOutcome; error?: string; scoring: 'not-scored' }
interface PilotPayload { schema: typeof PILOT_VERSION; spec: PilotSpec; freezeHash: string; frozenAt: string; trials: Trial[] }

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
}
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex')
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as JsonObject
const budgetKeys = ['tokens', 'milliseconds', 'toolCalls', 'computeSeconds', 'humanMinutes', 'costUsd'] as const
function budget(value: PilotBudget, positive: boolean) {
  for (const key of budgetKeys) if (typeof value?.[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < 0 || (positive && ['tokens', 'milliseconds', 'toolCalls'].includes(key) && value[key] === 0)) throw new Error(`Explicit finite ${key} budget/accounting is required.`)
}
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.length > 0 && value.every(v => typeof v === 'string' && v.trim()) }

/** Execution ledger only: no default fake adapter, automatic scoring, or inferred trial results. */
export class PilotEvaluationService {
  constructor(private readonly store: ResearchStore) {}
  catalog() { return { version: PILOT_VERSION, conditions: [...PILOT_CONDITIONS], tasks: PILOT_TASKS.map(([id, title, inputKind]) => ({ id, title, inputKind })), plannedTrialCount: 48, status: 'requires-frozen-inputs-and-budget' } }

  private artifact(projectId: string, ref: PilotArtifactRef, runId?: string) {
    if (!ref || !/^[a-f0-9]{64}$/i.test(ref.checksum)) throw new Error('A SHA-256 artifact reference is required.')
    const artifact = this.store.listArtifacts(projectId).find(item => item.id === ref.artifactId)
    if (!artifact || artifact.projectId !== projectId || artifact.checksum?.toLowerCase() !== ref.checksum.toLowerCase() || (runId && artifact.runId !== runId)) throw new Error('Pilot artifact provenance does not match the project, checksum or Run.')
  }
  private policies(studyId: string, ids: string[], model: string, provider: string, runtimeHashes?: Record<string, string>) {
    const events = this.store.listResearchRuntimeEvents(studyId)
    const selected = ids.map(id => events.find(event => event.id === id && event.action === 'research-runtime.request'))
    if (!ids.length || new Set(ids).size !== ids.length || selected.some(event => !event || event.details.model !== model || event.details.provider !== provider)) throw new Error('Policy provenance must reference actual matching request events in this study.')
    for (const [key, value] of Object.entries(runtimeHashes ?? {})) {
      if (!['systemSha256', 'contextSha256', 'skillsSha256', 'toolSchemaSha256'].includes(key) || !selected.some(event => event?.details[key] === value)) throw new Error('Runtime hash does not match the recorded policy request.')
    }
  }
  private checkpoint(document: ResearchDocumentRecord) {
    this.store.recordAuditEvent(document.projectId, 'pilot-evaluation.checkpoint', { studyId: document.studyId, evaluationId: document.id, version: document.version, payloadSha256: hash(document.payload) })
    return document
  }
  freeze(projectId: string, studyId: string, spec: PilotSpec): ResearchDocumentRecord {
    budget(spec.budgetPerTrial, true)
    if (!spec.model?.trim() || !spec.provider?.trim() || !strings(spec.policyProvenanceIds) || !Object.keys(spec.runtimeHashes ?? {}).length || Object.values(spec.runtimeHashes).some(v => !/^[a-f0-9]{64}$/i.test(v))) throw new Error('Fixed model/provider and actual policy/runtime provenance are required.')
    this.policies(studyId, spec.policyProvenanceIds, spec.model, spec.provider, spec.runtimeHashes)
    if (spec.tasks.length !== 12 || new Set(spec.tasks.map(t => t.taskId)).size !== 12) throw new Error('Exactly twelve unique benchmark tasks are required.')
    for (const task of spec.tasks) {
      const definition = PILOT_TASKS.find(([id]) => id === task.taskId)
      if (!definition || definition[2] !== task.inputKind || task.split !== 'pilot') throw new Error('Pilot task identity, source kind or dataset split is invalid.')
      if (!task.inputs?.length || !strings(task.requiredDeliverables) || !strings(task.majorErrors) || !Object.keys(task.rubric ?? {}).length || !['analysis', 'justified-stop', 'audit'].includes(task.expectedDisposition) || (task.numericTolerance !== null && (!Number.isFinite(task.numericTolerance) || task.numericTolerance < 0))) throw new Error('Task input, scoring rules, tolerance and expected disposition must be frozen.')
      for (const ref of [...task.inputs, task.reference]) this.artifact(projectId, ref)
      if (task.inputs.some(ref => ref.artifactId === task.reference.artifactId || ref.checksum === task.reference.checksum)) throw new Error('Reference answers must be separate from execution inputs.')
    }
    const frozen = JSON.parse(JSON.stringify(spec)) as PilotSpec
    const trials: Trial[] = frozen.tasks.flatMap(task => PILOT_CONDITIONS.map(condition => ({ id: `${task.taskId}:${condition}`, taskId: task.taskId, condition, status: 'not-run', scoring: 'not-scored' })))
    return this.checkpoint(this.store.createResearchDocument({ projectId, studyId, kind: 'evaluation', payload: json({ schema: PILOT_VERSION, spec: frozen, freezeHash: hash(frozen), frozenAt: new Date().toISOString(), trials }) }))
  }
  private read(projectId: string, evaluationId: string): { document: ResearchDocumentRecord; payload: PilotPayload } {
    const document = this.store.getResearchDocument(evaluationId)
    if (!document || document.projectId !== projectId || document.kind !== 'evaluation' || document.payload.schema !== PILOT_VERSION) throw new Error('Pilot evaluation does not belong to this project.')
    const payload = document.payload as unknown as PilotPayload
    if (hash(payload.spec) !== payload.freezeHash) throw new Error('Frozen pilot input was modified; create a new evaluation version.')
    const checkpoint = this.store.listAuditEvents(projectId).find(event => event.action === 'pilot-evaluation.checkpoint' && event.details.evaluationId === document.id && event.details.version === document.version)
    if (!checkpoint || checkpoint.details.payloadSha256 !== hash(document.payload)) throw new Error('Pilot evaluation changed outside its checkpointed service.')
    const expected = new Set(PILOT_TASKS.flatMap(([id]) => PILOT_CONDITIONS.map(condition => `${id}:${condition}`)))
    if (payload.trials.length !== 48 || new Set(payload.trials.map(t => t.id)).size !== 48 || payload.trials.some(t => !expected.has(t.id) || t.id !== `${t.taskId}:${t.condition}` || !['not-run', 'running', 'completed', 'failed', 'interrupted', 'budget-exceeded'].includes(t.status) || t.scoring !== 'not-scored')) throw new Error('Pilot trial identities or states are invalid.')
    return { document, payload }
  }
  async execute(projectId: string, evaluationId: string, trialId: string, expectedVersion: number, adapters: Partial<Record<PilotCondition, PilotAdapter>>, signal?: AbortSignal): Promise<ResearchDocumentRecord> {
    const { document, payload } = this.read(projectId, evaluationId)
    if (document.version !== expectedVersion) throw new Error('Pilot evaluation revision conflict.')
    const trial = payload.trials.find(t => t.id === trialId)
    if (!trial) throw new Error('Unknown pilot trial.')
    if (trial.status !== 'not-run') throw new Error('A started trial must be reconciled, never blindly re-executed.')
    if (payload.trials.some(t => t.status === 'running')) throw new Error('Reconcile the current running trial before starting another.')
    const adapter = adapters[trial.condition]
    if (!adapter) throw new Error(`No actual execution adapter registered for ${trial.condition}.`)
    if (signal?.aborted) throw new Error('Pilot execution was cancelled before dispatch.')
    const task = payload.spec.tasks.find(t => t.taskId === trial.taskId)!
    for (const ref of [...task.inputs, task.reference]) this.artifact(projectId, ref)
    trial.status = 'running'; trial.startedAt = new Date().toISOString()
    const running = this.checkpoint(this.store.updateResearchDocument(document.id, { expectedVersion: document.version, payload: json(payload) }))
    const controller = new AbortController(); const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error('Pilot execution interrupted; remote outcome requires reconciliation.')), { once: true })
      timer = setTimeout(abort, payload.spec.budgetPerTrial.milliseconds)
    })
    const started = performance.now()
    try {
      // Pass a deep copy: an adapter cannot rewrite the frozen ledger while running.
      const { tasks: _tasks, ...executionSpec } = payload.spec
      const request = JSON.parse(JSON.stringify({ trialId, condition: trial.condition, task: { taskId: task.taskId, inputs: task.inputs, requiredDeliverables: task.requiredDeliverables }, spec: executionSpec, freezeHash: payload.freezeHash })) as Omit<PilotAdapterRequest, 'signal'>
      const outcome = await Promise.race([adapter({ ...request, signal: controller.signal }), stop])
      budget(outcome.usage, false)
      if (outcome.model !== payload.spec.model || outcome.provider !== payload.spec.provider || !strings(outcome.policyProvenanceIds)) throw new Error('Actual model/provider or policy provenance differs from the frozen trial.')
      this.policies(document.studyId, outcome.policyProvenanceIds, outcome.model, outcome.provider)
      if (!['analysis', 'justified-stop', 'audit'].includes(outcome.disposition)) throw new Error('Actual disposition is required.')
      const run = this.store.getRun(outcome.runId)
      if (!run || run.projectId !== projectId || run.status !== 'succeeded' || !outcome.artifacts.length) throw new Error('Completed trial requires a succeeded project Run and real output artifacts.')
      if (payload.trials.some(t => t.outcome?.runId === outcome.runId)) throw new Error('A Run cannot be reused to pretend that independent pilot trials executed.')
      for (const ref of outcome.artifacts) this.artifact(projectId, ref, outcome.runId)
      outcome.usage.milliseconds = Math.max(outcome.usage.milliseconds, performance.now() - started)
      trial.outcome = outcome
      trial.status = budgetKeys.some(key => outcome.usage[key] > payload.spec.budgetPerTrial[key]) ? 'budget-exceeded' : 'completed'
    } catch (error) {
      trial.status = controller.signal.aborted ? 'interrupted' : 'failed'
      trial.error = error instanceof Error ? error.message.slice(0, 1000) : 'Execution failed; inspect the retained Run.'
    } finally {
      if (timer) clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
    trial.finishedAt = new Date().toISOString()
    return this.checkpoint(this.store.updateResearchDocument(document.id, { expectedVersion: running.version, payload: json(payload) }))
  }
  summary(projectId: string, evaluationId: string) {
    const { document, payload } = this.read(projectId, evaluationId)
    const totals = Object.fromEntries(budgetKeys.map(key => [key, payload.trials.reduce((n, t) => n + (t.outcome?.usage[key] ?? 0), 0)]))
    return { evaluationId, version: document.version, freezeHash: payload.freezeHash, trials: payload.trials.map(t => ({ id: t.id, status: t.status, scoring: t.scoring })), recordedCosts: totals, unknownCostTrials: payload.trials.filter(t => t.status !== 'not-run' && !t.outcome).length, scoredTrials: 0, scientificComparison: 'not-evaluated' }
  }
}
