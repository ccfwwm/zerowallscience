import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { JsonObject, ProjectRecord } from '@zerowallscience/research-store/types'
import { validateNhanesContract } from './nhanes-contract.js'
import { containedFile } from './science-viewer.js'
import type { NhanesSurveyRequest } from '../shared/types.js'

export const NHANES_SURVEY_RUNNER = '7.0.0-nhanes-survey.1'
export interface NhanesWorkflow { run(id: string, parameters: JsonObject, exec: ToolRunContext): Promise<JsonObject> }
const object = (value: unknown): JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value
const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const column = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,79}$/u.test(value)
const nonemptyStrings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item.trim()) : []

/** Compile a declared contract to the strict remote API. No model-authored R expressions execute. */
export function prepareNhanesSurvey(contract: JsonObject, analysis: JsonObject): JsonObject {
  const validation = validateNhanesContract(contract)
  const errors: string[] = []
  if (validation.status !== 'usable') errors.push(`DatasetContract is ${String(validation.status)}.`)
  if (contract.applicability !== 'usable' || contract.sourceStatus !== 'supported' || !text(contract.source)) errors.push('DatasetContract source and applicability must be verified.')
  if (contract.previewTruncated !== false || contract.fullDataset !== true) errors.push('Formal analysis requires fullDataset=true and previewTruncated=false.')
  const kind = analysis.kind
  if (!['summary', 'regression'].includes(String(kind))) errors.push('nhanesSurvey.kind must be summary or regression.')
  const variables = kind === 'summary' ? [analysis.variable, ...(analysis.groupBy ? [analysis.groupBy] : [])] : [analysis.outcome, ...Array.isArray(analysis.predictors) ? analysis.predictors : []]
  if (!variables.length || variables.some(item => !column(item))) errors.push('Analysis variables must be explicit valid column names.')
  if (kind === 'regression' && (!Array.isArray(analysis.predictors) || analysis.predictors.length < 1 || analysis.predictors.length > 50 || !['gaussian', 'binomial', 'quasibinomial'].includes(String(analysis.family)))) errors.push('Regression requires 1–50 predictors and an explicit supported family.')
  const datasets = (Array.isArray(contract.datasets) ? contract.datasets : []).map(object)
  if (!datasets.length || datasets.length > 10) errors.push('Use 1–10 declared NHANES datasets.')
  const cycles = [...new Set(datasets.map(item => text(item.cycle)))]
  if (cycles.some(cycle => !/^\d{4}-\d{4}$/u.test(cycle))) errors.push('Dataset cycle must use YYYY-YYYY.')
  if (datasets.some(item => !text(item.component) || !text(item.dataset) || !text(item.codebook))) errors.push('Each dataset requires component, exact dataset and codebook source.')
  const designVariables = [contract.weight, contract.strata, contract.psu, contract.key]
  if (designVariables.some(item => !column(item))) errors.push('weight, strata, psu and key must be explicit column names.')
  if (new Set(designVariables).size !== 4) errors.push('weight, strata, psu and key must be distinct variables.')
  const available = new Set(nonemptyStrings(contract.availableVariables))
  const domains = Array.isArray(contract.surveyDomain) ? contract.surveyDomain.map(object) : []
  if (contract.domainDesign === 'pre-filtered-subset') errors.push('Pre-filtered subsets cannot replace the complete survey design.')
  if (text(contract.domainExpression) && !domains.length) errors.push('Domain expressions require equivalent structured surveyDomain filters.')
  if (domains.length && contract.domainDesign !== 'survey-domain') errors.push('surveyDomain requires domainDesign=survey-domain.')
  if (domains.length > 20 || domains.some(item => !column(item.variable) || !['eq', 'gte', 'lte'].includes(String(item.operator)) || !['number', 'string'].includes(typeof item.value))) errors.push('surveyDomain must contain at most 20 safe variable/operator/value filters.')
  const required = [...new Set([...variables, ...designVariables, ...domains.map(item => item.variable)])]
  for (const variable of required) if (typeof variable === 'string' && !available.has(variable)) errors.push(`Variable ${variable} is not in the verified availableVariables.`)
  const missingCodes = object(contract.specialMissingCodes)
  for (const variable of [...new Set([...variables, ...domains.map(item => item.variable)])]) {
    if (typeof variable !== 'string') continue
    if (!Array.isArray(missingCodes[variable])) errors.push(`Declare specialMissingCodes.${variable}, using [] only when verified absent.`)
  }
  if (Object.entries(missingCodes).some(([key, values]) => !column(key) || !available.has(key) || !Array.isArray(values) || values.some(item => !['number', 'string'].includes(typeof item)))) errors.push('Special missing codes must reference verified variables and scalar codes.')
  if (!['fail', 'adjust', 'average', 'certainty', 'remove'].includes(String(contract.lonelyPsu))) errors.push('An explicit lonelyPsu policy is required.')
  const strategy = cycles.length === 1 ? 'single-cycle' : contract.cycleStrategy
  if (cycles.length > 1 && strategy === 'per-cycle') errors.push('Split per-cycle estimation into one research task and request per cycle.')
  if (cycles.length > 1 && strategy === 'official-combined') {
    const multipliers = object(contract.cycleWeightMultipliers)
    if (!text(contract.combinedWeightSource) || cycles.some(cycle => typeof multipliers[cycle] !== 'number' || Number(multipliers[cycle]) <= 0) || Object.keys(multipliers).some(cycle => !cycles.includes(cycle))) errors.push('Combined cycles require an official source and exact positive cycleWeightMultipliers for every cycle.')
  }
  const dxx = datasets.find(item => text(item.dataset).toUpperCase().replace(/\.[^.]+$/u, '') === 'DXX_H')
  if (dxx) {
    const ageMin = Number(contract.ageMin ?? dxx.ageMin); const ageMax = Number(contract.ageMax ?? dxx.ageMax)
    const lower = domains.some(item => item.variable === 'RIDAGEYR' && item.operator === 'gte' && item.value === ageMin)
    const upper = domains.some(item => item.variable === 'RIDAGEYR' && item.operator === 'lte' && item.value === ageMax)
    if (!lower || !upper) errors.push('DXX_H declared age bounds must be applied as RIDAGEYR survey-domain filters.')
  }
  if (errors.length) return { status: 'blocked', runner: NHANES_SURVEY_RUNNER, validation, errors }
  const args: JsonObject = {
    runner_contract: NHANES_SURVEY_RUNNER,
    datasets: datasets.map(item => ({ cycle: item.cycle!, domain: item.component!, dataset: item.dataset!, ensure_available: false })),
    weight: contract.weight!, strata: contract.strata!, psu: contract.psu!, key: contract.key!, all: false,
    missing_codes: missingCodes, survey_domain: domains, lonely_psu: contract.lonelyPsu!, cycle_strategy: String(strategy),
    ...(cycles.length > 1 ? { combined_weight_source: contract.combinedWeightSource!, cycle_weight_multipliers: contract.cycleWeightMultipliers! } : {}),
    ...(kind === 'summary' ? { variable: analysis.variable!, ...(analysis.groupBy ? { group_by: analysis.groupBy } : {}) } : { outcome: analysis.outcome!, predictors: analysis.predictors!, family: analysis.family! }),
  }
  return { status: 'ready', runner: NHANES_SURVEY_RUNNER, operation: `r.nhanes.survey.${String(kind)}`, arguments: args, validation }
}

/** A service-level caller of research_workflow; its Run remains the single execution authority. */
export class NhanesSurveyService {
  private readonly pending = new Map<string, Promise<JsonObject>>()
  constructor(private readonly store: ResearchStore, private readonly workflow: () => NhanesWorkflow | undefined) {}
  async execute(project: ProjectRecord, input: NhanesSurveyRequest, exec: ToolRunContext): Promise<JsonObject> {
    if (!/^[A-Za-z0-9_.:-]{1,128}$/u.test(input.requestId)) throw new Error('A stable NHANES requestId is required.')
    const key = `${project.id}:${input.requestId}`
    const prior = this.pending.get(key)
    if (prior) { await prior; return this.execute(project, input, exec) }
    const pending = this.submit(project, input, exec)
    this.pending.set(key, pending)
    try { return await pending } finally { this.pending.delete(key) }
  }
  private async submit(project: ProjectRecord, input: NhanesSurveyRequest, exec: ToolRunContext): Promise<JsonObject> {
    const study = this.store.getResearchStudy(input.studyId)
    if (!study || study.projectId !== project.id) throw new Error('Research study is not in the active project.')
    const contract = this.store.getResearchDocument(input.contractId)
    const plan = this.store.getResearchDocument(input.planId)
    const task = this.store.listResearchTasks(study.id).find(item => item.id === input.taskId)
    if (!contract || contract.studyId !== study.id || contract.kind !== 'dataset-contract' || !plan || plan.studyId !== study.id || plan.kind !== 'analysis-plan' || !task) throw new Error('Contract, plan and task must belong to this study.')
    if (plan.version !== input.expectedPlanVersion) throw new Error(`Analysis plan revision conflict: current ${plan.version}.`)
    if (!Array.isArray(plan.payload.inputs) || plan.payload.inputs.length !== 1 || plan.payload.inputs[0] !== contract.id) throw new Error('NHANES analysis plan must reference exactly this dataset contract.')
    this.store.validateAnalysisPlan(plan.id)
    const taskRefs = nonemptyStrings(plan.payload.taskIds ?? plan.payload.researchTaskIds)
    if (!taskRefs.includes(task.id)) throw new Error('Analysis plan does not reference this research task.')
    if (task.exploratory !== (plan.payload.exploratory === true)) throw new Error('Task and analysis plan exploratory labels must agree.')
    if (['blocked', 'archived', 'completed'].includes(study.status)) throw new Error('Study is unavailable for execution.')
    const freeze = study.currentFreezeId
      ? this.store.listStudyFreezes(study.id).find(item => item.id === study.currentFreezeId)
      : undefined
    const frozenPlan = freeze ? object(object(freeze.snapshot).plan) : undefined
    const frozenPayload = object(frozenPlan?.payload)
    if (!task.exploratory && (!freeze || study.gate1 !== 'approved' || study.currentPlanId !== plan.id || frozenPlan?.id !== plan.id || frozenPlan.version !== plan.version)) throw new Error('Confirmatory NHANES execution requires the approved frozen current plan.')
    if (!task.exploratory) {
      const frozenDocuments = Array.isArray(freeze?.snapshot.documents) ? freeze.snapshot.documents.map(object) : []
      const frozenContract = frozenDocuments.find(item => item.id === contract.id)
      if (digest(frozenPayload) !== digest(plan.payload) || frozenContract?.version !== contract.version || digest(frozenContract?.payload) !== digest(contract.payload)) throw new Error('Plan or dataset contract differs from the approved frozen snapshot.')
    }
    const analysis = object(plan.payload.nhanesSurvey)
    const prepared = prepareNhanesSurvey(contract.payload, analysis)
    const fingerprint = digest({ runner: NHANES_SURVEY_RUNNER, studyId: study.id, contractId: contract.id, contractVersion: contract.version, contract: contract.payload, planId: plan.id, planVersion: plan.version, freezeId: freeze?.id ?? null, freezeVersion: freeze?.version ?? null, analysis, taskId: task.id })
    // Execution bookkeeping must not be a mutable research observation: creating an
    // observation invalidates Gate 1 in the store, including for an approved freeze.
    // Keep the idempotency record in the audit log instead, which is append-only and
    // does not alter the scientific plan state.
    const previous = this.store.listAuditEvents(project.id).find(event => event.action === 'nhanes-survey.requested' && event.details.runner === NHANES_SURVEY_RUNNER && event.details.requestId === input.requestId)
    if (previous && previous.details.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_CONFLICT: requestId was used for another NHANES plan or contract.')
    if (!previous) this.store.recordAuditEvent(project.id, 'nhanes-survey.requested', { runner: NHANES_SURVEY_RUNNER, requestId: input.requestId, fingerprint, taskId: task.id, contractId: contract.id, planId: plan.id, freezeId: study.currentFreezeId ?? null, status: prepared.status!, errors: prepared.errors ?? [] })
    if (prepared.status !== 'ready') return { status: 'blocked', runner: NHANES_SURVEY_RUNNER, observationId: null, errors: prepared.errors!, validation: prepared.validation! }
    const workflow = this.workflow()
    if (!workflow) throw new Error('The rdatalinux research workflow is unavailable; connect rmcp first.')
    const remote = await workflow.run('r.nhanes', { operation: prepared.operation!, request_id: input.requestId, research_task_id: task.id, arguments: prepared.arguments! }, exec)
    const run = typeof remote.run_id === 'string' ? this.store.getRun(remote.run_id) : undefined
    if (!run || run.projectId !== project.id || this.store.listResearchTasks(study.id).find(item => item.id === task.id)?.runId !== run.id) throw new Error('Remote workflow did not return its bound project Run; inspect history before retrying.')
    const result = object(remote.result)
    const successful = run.status === 'succeeded' && result.runner_contract === NHANES_SURVEY_RUNNER && result.analysis_complete === true
    const currentStudy = this.store.getResearchStudy(study.id)
    const inputsCurrent = this.store.getResearchDocument(contract.id)?.version === contract.version
      && this.store.getResearchDocument(plan.id)?.version === plan.version
      && currentStudy?.currentFreezeId === study.currentFreezeId
      && !!currentStudy && !['blocked', 'archived', 'completed'].includes(currentStudy.status)
      && (task.exploratory || currentStudy.gate1 === 'approved')
    const staleReason = inputsCurrent ? null : 'Research inputs, freeze or authorization changed during execution. Historical output retained; no new scientific evidence registered.'
    const artifactKey = `${input.requestId}:${run.version}`
    let artifact = this.store.listArtifacts(project.id).find(item => item.metadata.runner === NHANES_SURVEY_RUNNER && item.metadata.artifactKey === artifactKey)
    if (!artifact) {
      const root = await realpath(project.rootPath)
      const parent = join(root, '.zerowall'); await mkdir(parent, { recursive: true }); await containedFile(root, parent)
      const base = join(parent, 'nhanes-survey'); await mkdir(base, { recursive: true }); await containedFile(root, base)
      const directory = join(base, digest({ studyId: study.id, artifactKey })); await mkdir(directory, { recursive: true }); await containedFile(root, directory)
      const manifest: JsonObject = { format: 'zerowall-nhanes-survey-result', runner: NHANES_SURVEY_RUNNER, studyId: study.id, taskId: task.id, runId: run.id, remoteId: remote.remote_id ?? null, requestId: input.requestId, fingerprint, contractId: contract.id, contractVersion: contract.version, planId: plan.id, planVersion: plan.version, freezeId: study.currentFreezeId ?? null, exploratory: task.exploratory, executionStatus: run.status, scientificReview: 'pending', analysisComplete: successful, inputsCurrent, staleReason, parameters: prepared.arguments!, result, remoteArtifacts: remote.artifacts ?? [], error: remote.error ?? null }
      const path = join(directory, 'manifest.json'); const bytes = `${JSON.stringify(manifest, null, 2)}\n`
      try { await writeFile(path, bytes, { flag: 'wx' }) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || await readFile(path, 'utf8') !== bytes) throw error }
      artifact = this.store.createArtifact({ projectId: project.id, runId: run.id, name: 'NHANES survey result manifest', uri: pathToFileURL(path).href, mediaType: 'application/json', checksum: createHash('sha256').update(bytes).digest('hex'), metadata: { runner: NHANES_SURVEY_RUNNER, artifactKey, requestId: input.requestId, fingerprint, studyId: study.id, taskId: task.id, scientificReview: 'pending', analysisComplete: successful, inputsCurrent, staleReason } })
    }
    let evidence = this.store.listResearchDocuments(study.id, 'evidence').find(doc => doc.payload.artifactId === artifact.id)
    if (successful && inputsCurrent && artifact.metadata.inputsCurrent !== false && !evidence) evidence = this.store.registerResearchEvidence({ projectId: project.id, studyId: study.id, payload: { runner: NHANES_SURVEY_RUNNER, evidenceType: 'observational-survey', runId: run.id, artifactId: artifact.id, artifactSha256: artifact.checksum ?? null, remoteId: remote.remote_id ?? null, contractId: contract.id, planId: plan.id, exploratory: task.exploratory, needsReview: true, allowedClaim: 'Survey-weighted description or association only; causal interpretation is not established.', result } })
    return JSON.parse(JSON.stringify({ status: run.status, runner: NHANES_SURVEY_RUNNER, run, remoteId: remote.remote_id ?? null, artifact, evidence: evidence ?? null, observationId: null, analysisComplete: successful, inputsCurrent, needsReview: true, ...(staleReason ? { error: staleReason } : !successful && run.status === 'succeeded' ? { error: 'Backend did not certify the strict runner contract. Result retained for inspection; no evidence registered.' } : {}) })) as JsonObject
  }
}
