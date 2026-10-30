import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { JsonObject, ProjectRecord } from '@zerowallscience/research-store/types'
import type { GeneticAnalysisRequest, GeneticRefreshRequest } from '../shared/types.js'
import { validateGeneticContract } from './genetic-contract.js'
import { containedFile } from './science-viewer.js'

export const GENETIC_RUNNER = '7.0.0-genetics.2'
export interface GeneticWorkflow {
  run(id: string, parameters: JsonObject, exec: ToolRunContext): Promise<JsonObject>
  status(id: string, exec: ToolRunContext): Promise<JsonObject>
  query(id: string, parameters: JsonObject, exec: ToolRunContext): Promise<JsonObject>
}
export type GeneticDownload = (input: { projectId: string; remotePath: string; localPath: string }, exec: ToolRunContext) => Promise<JsonObject>
const object = (value: unknown): JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}
const scalar = (value: unknown): unknown => Array.isArray(value) && value.length === 1 ? value[0] : value
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const json = (value: unknown): JsonObject => JSON.parse(JSON.stringify(value)) as JsonObject
const terminal = new Set(['succeeded', 'failed', 'timed_out', 'cancelled'])
const estimate = (value: unknown): boolean => {
  const item = object(value)
  return ['beta', 'se', 'ci_low', 'ci_high', 'p_value'].every(key => typeof item[key] === 'number' && Number.isFinite(item[key])) && Number(item.se) > 0 && Number(item.ci_low) <= Number(item.beta) && Number(item.beta) <= Number(item.ci_high) && Number(item.p_value) >= 0 && Number(item.p_value) <= 1
}
export function numericalResult(request: JsonObject, result: JsonObject): boolean {
  if (request.analysis === 'contrast_scan') {
    const exposures = (Array.isArray(request.exposures) ? request.exposures : []).map(object)
    const outcomes = (Array.isArray(request.outcomes) ? request.outcomes : []).map(object)
    const panel = object(request.outcome_panel)
    const layers = object(result.layers)
    const landscape = object(layers.landscape)
    const adjusted = object(layers.adjusted)
    const univariable = (Array.isArray(landscape.results) ? landscape.results : []).map(object)
    const mvmr = (Array.isArray(adjusted.results) ? adjusted.results : []).map(object)
    const coverage = object(result.coverage)
    const expectedUnivariable = outcomes.length * exposures.length
    const expectedMvmr = outcomes.length
    if (exposures.length !== 2 || outcomes.length < 1 || outcomes.length > 100 || result.analysis !== 'contrast_scan'
      || landscape.status !== 'complete' || adjusted.status !== 'complete'
      || coverage.complete !== true || coverage.expected_univariable !== expectedUnivariable
      || coverage.completed_univariable !== expectedUnivariable || coverage.expected_mvmr !== expectedMvmr
      || coverage.completed_mvmr !== expectedMvmr || coverage.expected_contrasts !== expectedMvmr
      || coverage.completed_contrasts !== expectedMvmr || univariable.length !== expectedUnivariable || mvmr.length !== expectedMvmr) return false
    const exposureIds = exposures.map(item => item.id)
    const outcomeIds = outcomes.map(item => item.id)
    if (exposureIds.some(id => typeof id !== 'string') || new Set(exposureIds).size !== exposureIds.length
      || outcomeIds.some(id => typeof id !== 'string') || new Set(outcomeIds).size !== outcomeIds.length) return false
    const uvPairs = new Set<string>()
    for (const row of univariable) {
      const pair = `${String(row.outcome_id)}\u0000${String(row.exposure_id)}`
      const outcome = outcomes.find(item => item.id === row.outcome_id)
      if (!outcome || !exposureIds.includes(row.exposure_id as string) || uvPairs.has(pair)
        || row.status !== 'succeeded' || row.outcome_panel_id !== panel.id
        || row.outcome_panel_version !== panel.version || !estimate(row) || !Number.isInteger(row.instruments) || Number(row.instruments) < 2) return false
      uvPairs.add(pair)
    }
    if (uvPairs.size !== expectedUnivariable || outcomes.some(outcome => exposureIds.some(id => !uvPairs.has(`${String(outcome.id)}\u0000${String(id)}`)))) return false
    const threshold = Number(request.min_conditional_f)
    if (!Number.isFinite(threshold) || threshold < 10) return false
    const adjustedIds = new Set<string>()
    for (const row of mvmr) {
      const outcome = outcomes.find(item => item.id === row.outcome_id)
      const effects = (Array.isArray(row.effects) ? row.effects : []).map(object)
      const strength = (Array.isArray(row.conditional_f_statistics) ? row.conditional_f_statistics : []).map(object)
      const matrix = Array.isArray(row.coefficient_covariance) ? row.coefficient_covariance.map(value => Array.isArray(value) ? value.map(Number) : []) : []
      const difference = object(row.difference_test)
      const id = String(row.outcome_id)
      if (!outcome || adjustedIds.has(id) || row.status !== 'succeeded' || row.outcome_panel_id !== panel.id
        || row.outcome_panel_version !== panel.version || effects.length !== 2 || strength.length !== 2
        || effects.some((effect, index) => effect.exposure_id !== exposureIds[index] || !estimate(effect))
        || strength.some((item, index) => item.exposure_id !== exposureIds[index] || typeof item.f_statistic !== 'number'
          || !Number.isFinite(item.f_statistic) || item.f_statistic < threshold)
        || matrix.length !== 2 || matrix.some(values => values.length !== 2 || values.some(value => !Number.isFinite(value)))) return false
      for (let i = 0; i < 2; i++) {
        if (matrix[i]![i]! <= 0 || Math.abs(matrix[i]![i]! - Number(effects[i]!.se) ** 2) > 1e-7 * Math.max(1, matrix[i]![i]!)) return false
        for (let j = 0; j < 2; j++) if (Math.abs(matrix[i]![j]! - matrix[j]![i]!) > 1e-10 * Math.max(1, Math.abs(matrix[i]![j]!))) return false
      }
      const q = row.heterogeneity_Q; const p = row.heterogeneity_p; const df = row.heterogeneity_df
      if (typeof q !== 'number' || !Number.isFinite(q) || q < 0 || typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1
        || !Number.isInteger(row.instruments) || Number(row.instruments) <= 2 || df !== Number(row.instruments) - 2
        || !estimate(difference) || difference.exposure_a_id !== exposureIds[0] || difference.exposure_b_id !== exposureIds[1]
        || difference.unit !== exposures[0]!.unit
        || Math.abs(Number(difference.beta) - (Number(effects[0]!.beta) - Number(effects[1]!.beta))) > 1e-8 * Math.max(1, Math.abs(Number(difference.beta)))) return false
      adjustedIds.add(id)
    }
    return adjustedIds.size === expectedMvmr && outcomes.every(outcome => adjustedIds.has(String(outcome.id)))
  }
  if (request.analysis === 'mvmr') {
    const analysis = object(object(result.analyses).mvmr)
    const exposures = (Array.isArray(request.exposures) ? request.exposures : []).map(object)
    const effects = (Array.isArray(analysis.effects) ? analysis.effects : []).map(object)
    const strength = (Array.isArray(analysis.conditional_f_statistics) ? analysis.conditional_f_statistics : []).map(object)
    const matrix = Array.isArray(analysis.coefficient_covariance) ? analysis.coefficient_covariance.map(row => Array.isArray(row) ? row.map(Number) : []) : []
    const threshold = Number(request.min_conditional_f)
    if (exposures.length < 2 || effects.length !== exposures.length || strength.length !== exposures.length || !Number.isFinite(threshold) || threshold < 10) return false
    const ids = exposures.map(item => item.id)
    if (effects.some((effect, index) => effect.exposure_id !== ids[index] || !estimate(effect))) return false
    if (strength.some((item, index) => item.exposure_id !== ids[index] || typeof item.f_statistic !== 'number' || !Number.isFinite(item.f_statistic) || item.f_statistic < threshold)) return false
    if (matrix.length !== exposures.length || matrix.some(row => row.length !== exposures.length || row.some(value => !Number.isFinite(value)))) return false
    for (let i = 0; i < matrix.length; i++) {
      if (matrix[i]![i]! <= 0 || Math.abs(matrix[i]![i]! - Number(effects[i]!.se) ** 2) > 1e-7 * Math.max(1, matrix[i]![i]!)) return false
      for (let j = 0; j < matrix.length; j++) if (Math.abs(matrix[i]![j]! - matrix[j]![i]!) > 1e-10 * Math.max(1, Math.abs(matrix[i]![j]!))) return false
    }
    const q = analysis.heterogeneity_Q; const p = analysis.heterogeneity_p; const df = analysis.heterogeneity_df
    return typeof q === 'number' && Number.isFinite(q) && q >= 0 && typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1 && df === Number(analysis.instruments) - exposures.length && Number(analysis.instruments) > exposures.length
  }
  if (request.analysis === 'coloc') {
    const summary = object(result.summary); const probabilities = ['PP.H0.abf', 'PP.H1.abf', 'PP.H2.abf', 'PP.H3.abf', 'PP.H4.abf'].map(key => summary[key])
    return Number.isInteger(summary.nsnps) && Number(summary.nsnps) > 1 && probabilities.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1) && Math.abs(probabilities.reduce<number>((sum, value) => sum + Number(value), 0) - 1) < 1e-6
  }
  const analyses = object(result.analyses)
  return strings(request.methods).length > 0 && strings(request.methods).every(method => method === 'egger' ? estimate(object(analyses[method]).slope) && estimate(object(analyses[method]).intercept) : estimate(analyses[method]))
}

export function prepareGeneticAnalysis(contract: JsonObject, settings: JsonObject): JsonObject {
  const errors: string[] = []
  if (contract.applicability !== 'usable' || contract.sourceStatus !== 'supported' || typeof contract.source !== 'string' || !contract.source.trim()) errors.push('DatasetContract applicability and source must be verified.')
  const data = object(contract.geneticInput)
  const type = settings.analysis
  if (!['mr', 'mvmr', 'contrast_scan', 'coloc'].includes(String(type))) errors.push('genetics.analysis must be mr, mvmr, contrast_scan, or coloc.')
  if (Object.keys(settings).some(key => !['analysis', 'methods', 'min_f', 'min_conditional_f', 'egger_min_i2gx', 'priors'].includes(key))) errors.push('Analysis settings contain unsupported fields; prepared data belong in geneticInput.')
  const methods = type === 'coloc' ? ['coloc'] : type === 'mvmr' ? ['mvmr'] : type === 'contrast_scan' ? ['contrast_scan'] : strings(settings.methods).map(method => ({ wald: 'wald-ratio', ivw: 'ivw', egger: 'mr-egger' })[method])
  if (type !== 'contrast_scan' && (!methods.length || methods.some(method => !method))) errors.push('Explicit supported genetics methods are required.')
  if (type === 'mr' && (!Array.isArray(data.instruments) || data.instruments.length !== contract.instrumentCount)) errors.push('Declared instrumentCount must match prepared instrument rows.')
  if (type === 'mvmr' && (!Array.isArray(data.exposures) || data.exposures.length < 2 || !Array.isArray(data.instruments) || data.instruments.length !== contract.instrumentCount)) errors.push('MVMR requires at least two exposure definitions and an instrumentCount matching prepared rows.')
  const validations = type === 'contrast_scan' ? [] : methods.map(method => validateGeneticContract({ ...contract, method: method ?? '', ...(type === 'mvmr' ? { exposureCount: Array.isArray(data.exposures) ? data.exposures.length : 0, exposureDefinitions: data.exposures, instrumentCount: Array.isArray(data.instruments) ? data.instruments.length : 0 } : {}) }))
  if (type === 'contrast_scan') {
    const exposures = (Array.isArray(data.exposures) ? data.exposures : []).map(object)
    const panel = object(data.outcome_panel)
    const outcomes = (Array.isArray(data.outcomes) ? data.outcomes : []).map(object)
    const fieldText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
    const stableId = (value: unknown): value is string => fieldText(value) && /^[A-Za-z0-9._:-]{1,128}$/u.test(value)
    if (exposures.length !== 2) errors.push('contrast_scan requires exactly two prepared exposure definitions.')
    if (!fieldText(panel.id) || !fieldText(panel.source) || !fieldText(panel.version) || !fieldText(panel.ancestry) || !fieldText(panel.genome_build)) errors.push('contrast_scan requires a fixed outcome_panel id, source, version, ancestry, and genome_build.')
    const exposureIds = exposures.map(item => item.id)
    if (exposures.some(item => !stableId(item.id) || !fieldText(item.trait) || !fieldText(item.unit) || !fieldText(item.source)
      || !fieldText(item.ancestry) || !fieldText(item.genome_build) || typeof item.sample_size !== 'number' || !Number.isFinite(item.sample_size) || item.sample_size <= 0)) errors.push('Each contrast_scan exposure requires a stable ID, source, trait, unit, ancestry, genome build, and positive sample size.')
    if (new Set(exposureIds).size !== exposureIds.length) errors.push('contrast_scan exposure IDs must be unique.')
    if (exposures.length === 2 && (exposures[0]!.unit !== exposures[1]!.unit)) errors.push('Formal MVMR coefficient contrasts require both exposures to use the same declared unit.')
    if (exposures.some(item => item.ancestry !== panel.ancestry || item.genome_build !== panel.genome_build)) errors.push('All exposures and outcomes must share the fixed panel ancestry and genome build.')
    if (!Number.isFinite(settings.min_f) || Number(settings.min_f) < 10 || !Number.isFinite(settings.min_conditional_f) || Number(settings.min_conditional_f) < 10) errors.push('contrast_scan requires prespecified min_f and min_conditional_f thresholds of at least 10.')
    if (outcomes.length < 1 || outcomes.length > 100) errors.push('contrast_scan requires 1-100 outcomes from the fixed panel.')
    const outcomeIds = outcomes.map(item => item.id)
    if (outcomes.some(item => !stableId(item.id) || !fieldText(item.study_id) || !fieldText(item.trait) || !fieldText(item.unit)
      || typeof item.sample_size !== 'number' || !Number.isFinite(item.sample_size) || item.sample_size <= 0)) errors.push('Every contrast_scan outcome requires a stable ID, study, trait, unit, and positive sample size.')
    if (new Set(outcomeIds).size !== outcomeIds.length) errors.push('contrast_scan outcome IDs must be unique.')
    const mvmrValidations: JsonObject[] = []
    for (const [index, outcome] of outcomes.entries()) {
      const uv = (Array.isArray(outcome.univariable) ? outcome.univariable : []).map(object)
      const joint = object(outcome.mvmr)
      if (uv.length !== 2 || uv.some((item, position) => item.exposure_id !== exposureIds[position]
        || !fieldText(item.ld_source) || !fieldText(item.sample_overlap_source) || !fieldText(item.harmonization_source)
        || !Array.isArray(item.instruments) || item.instruments.length < 2)) errors.push(`Outcome ${String(outcome.id ?? index + 1)} must provide ordered UVMR inputs for both exposures, each with provenance and at least two instruments.`)
      if (!fieldText(joint.ld_source) || !fieldText(joint.harmonization_source) || !Array.isArray(joint.instruments)
        || joint.instruments.length <= 2) errors.push(`Outcome ${String(outcome.id ?? index + 1)} requires one jointly prepared MVMR input with more instruments than exposures.`)
      const overlap = object(joint.sample_overlap)
      if (overlap.exposure_outcome !== 'none' || !fieldText(overlap.exposure_outcome_source)
        || !['none', 'known'].includes(String(overlap.exposure_exposure)) || !fieldText(overlap.exposure_exposure_source)) errors.push(`Outcome ${String(outcome.id ?? index + 1)} requires reviewed exposure/outcome and exposure/exposure overlap declarations.`)
      mvmrValidations.push(validateGeneticContract({ ...contract, method: 'mvmr', outcomeDefinition: `${String(outcome.trait ?? '')} [${String(outcome.study_id ?? '')}]`,
        ancestry: typeof panel.ancestry === 'string' ? panel.ancestry : '', genomeBuild: typeof panel.genome_build === 'string' ? panel.genome_build : '',
        exposureCount: exposures.length, exposureDefinitions: exposures, instrumentCount: Array.isArray(joint.instruments) ? joint.instruments.length : 0 }))
    }
    if (mvmrValidations.some(value => value.status !== 'usable')) errors.push('Every contrast_scan outcome must satisfy the MVMR dataset contract, including independent-instrument count.')
    validations.push(...mvmrValidations)
  }
  if (validations.some(value => value.status !== 'usable')) errors.push('Genetic DatasetContract has unresolved method applicability.')
  const keys = type === 'mr' ? ['exposure', 'outcome', 'instruments', 'ld_independent', 'ld_source', 'sample_overlap', 'sample_overlap_source', 'harmonization_source'] : type === 'mvmr' ? ['exposures', 'outcome', 'instruments', 'ld_independent', 'ld_source', 'sample_overlap', 'harmonization_source'] : type === 'contrast_scan' ? ['exposures', 'outcome_panel', 'outcomes', 'min_f', 'min_conditional_f'] : ['trait1', 'trait2', 'variants', 'region', 'complete_region', 'single_causal_variant_assumption']
  for (const key of keys) if (data[key] === undefined) errors.push(`geneticInput.${key} is required.`)
  if (errors.length) return { status: 'blocked', errors, validations }
  return { status: 'ready', request: { ...Object.fromEntries(keys.map(key => [key, data[key]!])), ...settings, runner_contract: GENETIC_RUNNER }, validations }
}

/** Async method adapter over the same durable workflow and r_files used by Agents. */
export class GeneticAnalysisService {
  private readonly pending = new Map<string, Promise<JsonObject>>()
  constructor(private readonly store: ResearchStore, private readonly workflow: () => GeneticWorkflow | undefined, private readonly download: GeneticDownload) {}
  private async locked(key: string, action: () => Promise<JsonObject>): Promise<JsonObject> {
    const existing = this.pending.get(key)
    if (existing) { await existing; return this.locked(key, action) }
    const work = action(); this.pending.set(key, work)
    try { return await work } finally { this.pending.delete(key) }
  }
  private async directory(project: ProjectRecord, requestId: string): Promise<string> {
    const root = await realpath(project.rootPath)
    let directory = root
    for (const component of ['.zerowall', 'genetics', hash({ projectId: project.id, requestId })]) { directory = join(directory, component); await mkdir(directory, { recursive: true }); await containedFile(root, directory) }
    return directory
  }
  async execute(project: ProjectRecord, input: GeneticAnalysisRequest, exec: ToolRunContext): Promise<JsonObject> {
    if (!/^[A-Za-z0-9_.:-]{1,128}$/u.test(input.requestId)) throw new Error('A stable genetics requestId is required.')
    return this.locked(`${project.id}:request:${input.requestId}`, async () => {
      const study = this.store.getResearchStudy(input.studyId)
      const contract = this.store.getResearchDocument(input.contractId); const plan = this.store.getResearchDocument(input.planId)
      if (!study || study.projectId !== project.id || !contract || contract.studyId !== study.id || contract.kind !== 'dataset-contract' || !plan || plan.studyId !== study.id || plan.kind !== 'analysis-plan') throw new Error('Genetic study, plan and contract must belong to the active project.')
      if (study.currentPlanId !== plan.id) throw new Error('Genetics analysis plan is not the current plan for this study.')
      const task = this.store.listResearchTasks(study.id).find(item => item.id === input.taskId)
      if (!task || !strings(plan.payload.taskIds ?? plan.payload.researchTaskIds).includes(task.id)) throw new Error('Analysis plan does not bind this research task.')
      if (plan.version !== input.expectedPlanVersion) throw new Error(`Analysis plan revision conflict: current ${plan.version}.`)
      if (strings(plan.payload.inputs).length !== 1 || strings(plan.payload.inputs)[0] !== contract.id) throw new Error('The genetics plan must reference exactly this prepared dataset contract.')
      this.store.validateAnalysisPlan(plan.id)
      if (task.exploratory !== (plan.payload.exploratory === true)) throw new Error('Task and plan exploratory labels differ.')
      if (['archived', 'completed'].includes(study.status)) throw new Error('Study is not available for new execution.')
      const freeze = this.store.listStudyFreezes(study.id).find(item => item.id === study.currentFreezeId)
      const prepared = prepareGeneticAnalysis(contract.payload, object(plan.payload.genetics))
      if (prepared.status !== 'ready') return { runner: GENETIC_RUNNER, ...prepared }
      const runtime = object(plan.payload.geneticRuntime)
      const threads = runtime.threads ?? 1; const timeout = runtime.timeout_ms ?? 1800000
      if (!Number.isInteger(threads) || Number(threads) < 1 || Number(threads) > 8 || !Number.isInteger(timeout) || Number(timeout) < 1000 || Number(timeout) > 14400000) throw new Error('Genetics runtime limits are invalid.')
      const configuredRemoteProject = this.store.getProjectPreferences(project.id).settings.rPlatformProjectId
      const remoteProject = typeof configuredRemoteProject === 'string' ? configuredRemoteProject.trim() : ''
      const inputHashes = { contractSha256: hash(contract.payload), planSha256: hash(plan.payload) }
      const request: JsonObject = { ...object(prepared.request), exploratory: task.exploratory, study_id: study.id, task_id: task.id, plan_id: plan.id, ...(freeze ? { freeze_id: freeze.id } : {}) }
      const snapshot: JsonObject = { format: 'zerowall-genetics-request', runner: GENETIC_RUNNER, studyId: study.id, contractId: contract.id, contractVersion: contract.version, contract: contract.payload, planId: plan.id, planVersion: plan.version, plan: plan.payload, inputHashes, taskId: task.id, exploratory: task.exploratory, freezeId: freeze?.id ?? null, requestId: input.requestId, remoteProject, request, threads, timeout }
      const fingerprint = hash(snapshot)
      const prior = this.store.listAuditEvents(project.id).find(event => event.action === 'genetics.requested' && event.details.requestId === input.requestId)
      if (prior && prior.details.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_CONFLICT: requestId already belongs to another genetic analysis.')
      const directory = await this.directory(project, input.requestId)
      const path = join(directory, 'request.json'); const bytes = JSON.stringify({ ...snapshot, fingerprint }, null, 2)
      try { await writeFile(path, bytes, { flag: 'wx' }) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || await readFile(path, 'utf8') !== bytes) throw new Error('IDEMPOTENCY_CONFLICT: persisted genetics input differs.') }
      if (!prior) this.store.recordAuditEvent(project.id, 'genetics.requested', { requestId: input.requestId, fingerprint, studyId: study.id, planId: plan.id, contractId: contract.id, taskId: task.id })
      const workflow = this.workflow(); if (!workflow) throw new Error('Connect the rdatalinux research workflow first.')
      const remote = await workflow.run('r.genetics', { operation: 'r.genetics.run', request_id: input.requestId, research_task_id: task.id, arguments: { ...(remoteProject ? { project_id: remoteProject } : {}), request_id: input.requestId, request, threads, timeout_ms: timeout, confirm: true } }, exec)
      const run = this.store.getRun(String(remote.run_id))
      if (!run || run.projectId !== project.id || this.store.listResearchTasks(study.id).find(item => item.id === task.id)?.runId !== run.id) throw new Error('Genetics workflow did not return its bound project Run.')
      if (!this.store.listAuditEvents(project.id).some(event => event.action === 'genetics.submitted' && event.details.runId === run.id)) this.store.recordAuditEvent(project.id, 'genetics.submitted', { requestId: input.requestId, studyId: study.id, taskId: task.id, runId: run.id, remoteId: remote.remote_id ?? null })
      return this.locked(`${project.id}:run:${run.id}`, () => this.collect(project, snapshot, remote, exec))
    })
  }
  async refresh(project: ProjectRecord, input: GeneticRefreshRequest, exec: ToolRunContext): Promise<JsonObject> {
    return this.locked(`${project.id}:run:${input.runId}`, async () => {
      const study = this.store.getResearchStudy(input.studyId); const run = this.store.getRun(input.runId)
      if (!study || study.projectId !== project.id || !run || run.projectId !== project.id) throw new Error('Genetic Run is outside the active study project.')
      const events = this.store.listAuditEvents(project.id)
      const requestId = run.inputs.find(item => item.name === 'request_id')?.uri
      // A Host may restart after the durable workflow submission but before its
      // acknowledgement is recorded here. Reconcile the already-bound Run only.
      const event = events.find(item => item.action === 'genetics.submitted' && item.details.runId === run.id && item.details.studyId === study.id)
        ?? (run.leaseOwner === 'research-workflow' ? events.find(item => item.action === 'genetics.requested' && item.details.requestId === requestId && item.details.studyId === study.id && this.store.listResearchTasks(study.id).some(task => task.id === item.details.taskId && task.runId === run.id)) : undefined)
      if (!event || typeof event.details.requestId !== 'string') throw new Error('No saved genetics submission binds this Run to the study.')
      const path = join(await this.directory(project, event.details.requestId), 'request.json')
      const snapshot = object(JSON.parse(await readFile(await containedFile(await realpath(project.rootPath), path), 'utf8')))
      const { fingerprint, ...original } = snapshot
      const requestEvent = this.store.listAuditEvents(project.id).find(item => item.action === 'genetics.requested' && item.details.requestId === event.details.requestId)
      if (fingerprint !== hash(original) || fingerprint !== requestEvent?.details.fingerprint || snapshot.studyId !== study.id || snapshot.taskId !== event.details.taskId) throw new Error('Persisted genetics request provenance mismatch.')
      const workflow = this.workflow(); if (!workflow) throw new Error('Connect the rdatalinux research workflow first.')
      return this.collect(project, snapshot, await workflow.status(run.id, exec), exec)
    })
  }
  private async collect(project: ProjectRecord, snapshot: JsonObject, remote: JsonObject, exec: ToolRunContext): Promise<JsonObject> {
    snapshot = { ...snapshot, remoteProject: remote.remote_project ?? snapshot.remoteProject ?? null }
    const run = this.store.getRun(String(remote.run_id))
    if (!run || run.projectId !== project.id || remote.workflow_id !== 'r.genetics') throw new Error('Unexpected genetics workflow Run.')
    const base = json({ runner: GENETIC_RUNNER, status: run.status, run, remoteId: remote.remote_id ?? null, analysisComplete: false, evidence: null, needsReview: true })
    if (!terminal.has(run.status)) return base
    if (typeof remote.remote_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(remote.remote_id)) return { ...base, error: 'No valid remote job identifier; retain logs and reconcile before retrying.' }
    const workflow = this.workflow()!
    const directory = await this.directory(project, String(snapshot.requestId))
    try {
      const envelope = await workflow.query('r.genetics', { operation: 'r.get.job.manifest', arguments: { project_id: snapshot.remoteProject!, job_id: remote.remote_id } }, exec)
      const outer = object(envelope.manifest ?? envelope)
      const files = (Array.isArray(outer.files) ? outer.files : outer.files ? [outer.files] : []).map(object)
      const downloaded: Record<string, { path: string; sha256: string; bytes: number }> = {}
      const analysis = object(snapshot.request).analysis
      const requiredFiles = ['manifest.json', 'input.json', 'result.json', ...(analysis === 'contrast_scan' ? ['contrast-scan-univariable.tsv', 'contrast-scan-adjusted.tsv'] : [])]
      for (const name of requiredFiles) {
        const entry = files.find(file => scalar(file.path) === `genetics/${name}`)
        const expectedHash = String(scalar(entry?.sha256) ?? ''); const expectedBytes = Number(scalar(entry?.bytes))
        if (!entry || !/^[a-f0-9]{64}$/u.test(expectedHash) || !Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > (name === 'manifest.json' ? 1048576 : 64 * 1024 ** 2)) throw new Error(`Missing or invalid genetics/${name} in remote job manifest.`)
        const localName = `${run.id}-${expectedHash}-${name}`
        const relativePath = `.zerowall/genetics/${hash({ projectId: project.id, requestId: snapshot.requestId })}/${localName}`
        await this.download({ projectId: String(snapshot.remoteProject), remotePath: `.zerowall/jobs/${remote.remote_id}/result/genetics/${name}`, localPath: relativePath }, exec)
        const path = await containedFile(await realpath(project.rootPath), join(directory, localName))
        if ((await stat(path)).size !== expectedBytes) throw new Error(`Downloaded ${name} byte size differs from job manifest.`)
        const bytes = await readFile(path); const actualHash = createHash('sha256').update(bytes).digest('hex')
        if (actualHash !== expectedHash) throw new Error(`Downloaded ${name} SHA-256 differs from job manifest.`)
        downloaded[name] = { path, sha256: actualHash, bytes: expectedBytes }
      }
      const method = object(JSON.parse(await readFile(downloaded['manifest.json']!.path, 'utf8')))
      const actualInput = object(JSON.parse(await readFile(downloaded['input.json']!.path, 'utf8')))
      const result = object(JSON.parse(await readFile(downloaded['result.json']!.path, 'utf8')))
      const sources = (Array.isArray(method.runner_sources) ? method.runner_sources : []).map(object)
      if (!['runner.R', 'run.py'].every(name => sources.some(source => source.path === name && typeof source.sha256 === 'string' && /^[a-f0-9]{64}$/u.test(source.sha256)))) throw new Error('Method manifest lacks versioned runner source hashes.')
      if (hash(actualInput) !== hash({ ...object(snapshot.request), request_id: snapshot.requestId }) || method.runner_contract !== GENETIC_RUNNER || result.runner_contract !== GENETIC_RUNNER || method.request_id !== snapshot.requestId || result.request_id !== snapshot.requestId) throw new Error('Returned genetics input/result does not match the submitted request.')
      const methodFiles = (Array.isArray(method.files) ? method.files : []).map(object)
      for (const name of requiredFiles.filter(item => item !== 'manifest.json')) if (!methodFiles.some(file => file.path === name && file.sha256 === downloaded[name]!.sha256 && file.bytes === downloaded[name]!.bytes)) throw new Error(`Method manifest does not certify downloaded genetics/${name}.`)
      const artifacts = Object.entries(downloaded).map(([name, file]) => this.store.listArtifacts(project.id).find(item => item.metadata.runner === GENETIC_RUNNER && item.runId === run.id && item.checksum === file.sha256 && item.name === `Genetics ${name}`) ?? this.store.createArtifact({ projectId: project.id, runId: run.id, name: `Genetics ${name}`, uri: pathToFileURL(file.path).href, mediaType: name.endsWith('.tsv') ? 'text/tab-separated-values' : 'application/json', checksum: file.sha256, metadata: { runner: GENETIC_RUNNER, requestId: snapshot.requestId!, studyId: snapshot.studyId!, taskId: snapshot.taskId!, scientificReview: 'pending' } }))
      const study = this.store.getResearchStudy(String(snapshot.studyId))
      const currentPlan = this.store.getResearchDocument(String(snapshot.planId))
      const currentContract = this.store.getResearchDocument(String(snapshot.contractId))
      const inputHashes = object(snapshot.inputHashes)
      const current = !!study && !['archived', 'completed'].includes(study.status) && study.currentPlanId === snapshot.planId && currentPlan?.version === snapshot.planVersion && hash(currentPlan?.payload ?? {}) === inputHashes.planSha256 && currentContract?.version === snapshot.contractVersion && hash(currentContract?.payload ?? {}) === inputHashes.contractSha256
      const numericalValid = numericalResult(object(snapshot.request), result)
      const successful = run.status === 'succeeded' && method.analysis_complete === true && result.analysis_complete === true && method.status === 'succeeded' && result.status === 'succeeded' && numericalValid
      const resultArtifact = artifacts.find(item => item.name === 'Genetics result.json')!
      let evidence = this.store.listResearchDocuments(String(snapshot.studyId), 'evidence').find(item => item.payload.artifactId === resultArtifact.id)
      const summary: JsonObject = { analysis: result.analysis ?? object(snapshot.request).analysis ?? null, analyses: result.analyses ?? {}, layers: result.layers ?? {}, coverage: result.coverage ?? {}, outcome_panel: result.outcome_panel ?? {}, summary: result.summary ?? {}, stoppedMethods: result.stopped_methods ?? {}, excludedCount: Array.isArray(result.excluded) ? result.excluded.length : 0, includedCount: Array.isArray(result.included) ? result.included.length : 0, limitations: result.limitations ?? [], errors: result.errors ?? [], runtime: result.runtime ?? {} }
      if (successful && current && !evidence) evidence = this.store.registerResearchEvidence({ projectId: project.id, studyId: String(snapshot.studyId), payload: { runner: GENETIC_RUNNER, evidenceType: object(snapshot.request).analysis === 'contrast_scan' ? 'two-exposure-outcome-panel-scan' : object(snapshot.request).analysis === 'coloc' ? 'regional-colocalization' : object(snapshot.request).analysis === 'mvmr' ? 'multivariable-genetic-analysis' : 'genetic-instrument-analysis', runId: run.id, artifactId: resultArtifact.id, artifactSha256: resultArtifact.checksum!, relatedArtifactIds: artifacts.map(item => item.id), planId: snapshot.planId!, contractId: snapshot.contractId!, freezeId: snapshot.freezeId!, exploratory: snapshot.exploratory!, needsReview: true, allowedClaim: 'Genetic support under the declared assumptions only; not proof of mediation, clinical mechanism or benefit.', result: summary } })
      return json({ ...base, analysisComplete: successful, inputsCurrent: current, methodStatus: result.status, artifacts, evidence: evidence ?? null, result: summary, ...(!current ? { error: 'The research plan or data contract changed; historical artifacts retained without new scientific evidence.' } : result.status === 'succeeded' && !numericalValid ? { error: 'Required numerical estimates or uncertainty are absent/invalid; artifacts retained without evidence.' } : {}) })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.store.recordAuditEvent(project.id, 'genetics.artifact-retrieval-failed', { runId: run.id, requestId: snapshot.requestId!, error: message })
      return { ...base, artifactError: message }
    }
  }
}
