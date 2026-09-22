import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { JsonObject, ProjectRecord } from '@zerowallscience/research-store/types'
import type { GeneticAnalysisRequest, GeneticRefreshRequest } from '../shared/types.js'
import { validateGeneticContract } from './genetic-contract.js'
import { containedFile } from './science-viewer.js'

export const GENETIC_RUNNER = '7.0.0-genetics.1'
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
function numericalResult(request: JsonObject, result: JsonObject): boolean {
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
  if (!['mr', 'coloc'].includes(String(type))) errors.push('genetics.analysis must be mr or coloc.')
  if (Object.keys(settings).some(key => !['analysis', 'methods', 'min_f', 'egger_min_i2gx', 'priors'].includes(key))) errors.push('Analysis settings contain unsupported fields; prepared data belong in geneticInput.')
  const methods = type === 'coloc' ? ['coloc'] : strings(settings.methods).map(method => ({ wald: 'wald-ratio', ivw: 'ivw', egger: 'mr-egger' })[method])
  if (!methods.length || methods.some(method => !method)) errors.push('Explicit supported genetics methods are required.')
  if (type === 'mr' && (!Array.isArray(data.instruments) || data.instruments.length !== contract.instrumentCount)) errors.push('Declared instrumentCount must match prepared instrument rows.')
  const validations = methods.map(method => validateGeneticContract({ ...contract, method: method ?? '' }))
  if (validations.some(value => value.status !== 'usable')) errors.push('Genetic DatasetContract has unresolved method applicability.')
  const keys = type === 'mr' ? ['exposure', 'outcome', 'instruments', 'ld_independent', 'ld_source', 'sample_overlap', 'sample_overlap_source', 'harmonization_source'] : ['trait1', 'trait2', 'variants', 'region', 'complete_region', 'single_causal_variant_assumption']
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
      const task = this.store.listResearchTasks(study.id).find(item => item.id === input.taskId)
      if (!task || !strings(plan.payload.taskIds ?? plan.payload.researchTaskIds).includes(task.id)) throw new Error('Analysis plan does not bind this research task.')
      if (plan.version !== input.expectedPlanVersion) throw new Error(`Analysis plan revision conflict: current ${plan.version}.`)
      if (strings(plan.payload.inputs).length !== 1 || strings(plan.payload.inputs)[0] !== contract.id) throw new Error('The genetics plan must reference exactly this prepared dataset contract.')
      this.store.validateAnalysisPlan(plan.id)
      if (task.exploratory !== (plan.payload.exploratory === true)) throw new Error('Task and plan exploratory labels differ.')
      if (['blocked', 'archived', 'completed'].includes(study.status)) throw new Error('Study is not available for new execution.')
      const freeze = this.store.listStudyFreezes(study.id).find(item => item.id === study.currentFreezeId)
      if (!task.exploratory) {
        const frozenPlan = object(freeze?.snapshot.plan)
        const frozenContract = (Array.isArray(freeze?.snapshot.documents) ? freeze.snapshot.documents.map(object) : []).find(item => item.id === contract.id)
        if (study.gate1 !== 'approved' || study.currentPlanId !== plan.id || !freeze || frozenPlan.id !== plan.id || frozenPlan.version !== plan.version || hash(frozenPlan.payload) !== hash(plan.payload) || frozenContract?.version !== contract.version || hash(frozenContract?.payload) !== hash(contract.payload)) throw new Error('Confirmatory genetics requires the exact approved frozen plan and contract.')
      }
      const prepared = prepareGeneticAnalysis(contract.payload, object(plan.payload.genetics))
      if (prepared.status !== 'ready') return { runner: GENETIC_RUNNER, ...prepared }
      const runtime = object(plan.payload.geneticRuntime)
      const threads = runtime.threads ?? 1; const timeout = runtime.timeout_ms ?? 1800000
      if (!Number.isInteger(threads) || Number(threads) < 1 || Number(threads) > 8 || !Number.isInteger(timeout) || Number(timeout) < 1000 || Number(timeout) > 14400000) throw new Error('Genetics runtime limits are invalid.')
      const remoteProject = `zw-${createHash('sha256').update(resolve(project.rootPath)).digest('hex').slice(0, 24)}`
      const request: JsonObject = { ...object(prepared.request), exploratory: task.exploratory, study_id: study.id, task_id: task.id, plan_id: plan.id, ...(freeze ? { freeze_id: freeze.id } : {}) }
      const snapshot: JsonObject = { format: 'zerowall-genetics-request', runner: GENETIC_RUNNER, studyId: study.id, contractId: contract.id, contractVersion: contract.version, contract: contract.payload, planId: plan.id, planVersion: plan.version, plan: plan.payload, taskId: task.id, exploratory: task.exploratory, freezeId: freeze?.id ?? null, requestId: input.requestId, remoteProject, request, threads, timeout }
      const fingerprint = hash(snapshot)
      const prior = this.store.listAuditEvents(project.id).find(event => event.action === 'genetics.requested' && event.details.requestId === input.requestId)
      if (prior && prior.details.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_CONFLICT: requestId already belongs to another genetic analysis.')
      const directory = await this.directory(project, input.requestId)
      const path = join(directory, 'request.json'); const bytes = JSON.stringify({ ...snapshot, fingerprint }, null, 2)
      try { await writeFile(path, bytes, { flag: 'wx' }) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || await readFile(path, 'utf8') !== bytes) throw new Error('IDEMPOTENCY_CONFLICT: persisted genetics input differs.') }
      if (!prior) this.store.recordAuditEvent(project.id, 'genetics.requested', { requestId: input.requestId, fingerprint, studyId: study.id, planId: plan.id, contractId: contract.id, taskId: task.id })
      const workflow = this.workflow(); if (!workflow) throw new Error('Connect the rdatalinux research workflow first.')
      const remote = await workflow.run('r.genetics', { operation: 'r.genetics.run', request_id: input.requestId, research_task_id: task.id, arguments: { project_id: remoteProject, request_id: input.requestId, request, threads, timeout_ms: timeout, confirm: true } }, exec)
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
      for (const name of ['manifest.json', 'input.json', 'result.json']) {
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
      for (const name of ['input.json', 'result.json']) if (!methodFiles.some(file => file.path === name && file.sha256 === downloaded[name]!.sha256 && file.bytes === downloaded[name]!.bytes)) throw new Error('Method manifest does not certify downloaded input/result files.')
      const artifacts = Object.entries(downloaded).map(([name, file]) => this.store.listArtifacts(project.id).find(item => item.metadata.runner === GENETIC_RUNNER && item.runId === run.id && item.checksum === file.sha256 && item.name === `Genetics ${name}`) ?? this.store.createArtifact({ projectId: project.id, runId: run.id, name: `Genetics ${name}`, uri: pathToFileURL(file.path).href, mediaType: 'application/json', checksum: file.sha256, metadata: { runner: GENETIC_RUNNER, requestId: snapshot.requestId!, studyId: snapshot.studyId!, taskId: snapshot.taskId!, scientificReview: 'pending' } }))
      const study = this.store.getResearchStudy(String(snapshot.studyId))
      const current = !!study && !['archived', 'completed', 'blocked'].includes(study.status) && (study.currentFreezeId ?? null) === snapshot.freezeId && (snapshot.exploratory === true || study.gate1 === 'approved') && this.store.getResearchDocument(String(snapshot.planId))?.version === snapshot.planVersion && this.store.getResearchDocument(String(snapshot.contractId))?.version === snapshot.contractVersion
      const numericalValid = numericalResult(object(snapshot.request), result)
      const successful = run.status === 'succeeded' && method.analysis_complete === true && result.analysis_complete === true && method.status === 'succeeded' && result.status === 'succeeded' && numericalValid
      const resultArtifact = artifacts.find(item => item.name === 'Genetics result.json')!
      let evidence = this.store.listResearchDocuments(String(snapshot.studyId), 'evidence').find(item => item.payload.artifactId === resultArtifact.id)
      const summary: JsonObject = { analyses: result.analyses ?? {}, summary: result.summary ?? {}, stoppedMethods: result.stopped_methods ?? {}, excludedCount: Array.isArray(result.excluded) ? result.excluded.length : 0, includedCount: Array.isArray(result.included) ? result.included.length : 0, limitations: result.limitations ?? [], errors: result.errors ?? [], runtime: result.runtime ?? {} }
      if (successful && current && !evidence) evidence = this.store.registerResearchEvidence({ projectId: project.id, studyId: String(snapshot.studyId), payload: { runner: GENETIC_RUNNER, evidenceType: object(snapshot.request).analysis === 'coloc' ? 'regional-colocalization' : 'genetic-instrument-analysis', runId: run.id, artifactId: resultArtifact.id, artifactSha256: resultArtifact.checksum!, relatedArtifactIds: artifacts.map(item => item.id), planId: snapshot.planId!, contractId: snapshot.contractId!, freezeId: snapshot.freezeId!, exploratory: snapshot.exploratory!, needsReview: true, allowedClaim: 'Genetic support under the declared assumptions only; not proof of mediation, clinical mechanism or benefit.', result: summary } })
      return json({ ...base, analysisComplete: successful, inputsCurrent: current, methodStatus: result.status, artifacts, evidence: evidence ?? null, result: summary, ...(!current ? { error: 'Inputs or approval changed; historical artifacts retained without new scientific evidence.' } : result.status === 'succeeded' && !numericalValid ? { error: 'Required numerical estimates or uncertainty are absent/invalid; artifacts retained without evidence.' } : {}) })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.store.recordAuditEvent(project.id, 'genetics.artifact-retrieval-failed', { runId: run.id, requestId: snapshot.requestId!, error: message })
      return { ...base, artifactError: message }
    }
  }
}
