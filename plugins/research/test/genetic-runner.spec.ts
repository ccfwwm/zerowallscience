import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JsonObject } from '../../../store/src/domain.js'
import { ResearchStore } from '../../../store/src/index.js'
import { ResearchWorkflowService } from '../../mcp/src/host/research-workflow.js'
import { rWorkflows } from '../../mcp/src/shared/r-workflows.js'
import { GENETIC_RUNNER, GeneticAnalysisService } from '../src/host/genetic-runner.js'

const sha = (value: string) => createHash('sha256').update(value).digest('hex')
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const clean of cleanups.splice(0).reverse()) await clean() })
async function fixture(exploratory = true) {
  const root = await mkdtemp(join(tmpdir(), 'genetic-host-'))
  const store = new ResearchStore(join(root, 'research.sqlite'))
  cleanups.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'Genetics', rootPath: root })
  const study = store.createResearchStudy({ projectId: project.id, title: 'Synthetic MR' })
  const trait = { trait: 'synthetic', ancestry: 'synthetic', genome_build: 'GRCh38', unit: 'SD', source: 'synthetic', sample_size: 10000 }
  const contract = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'dataset-contract', payload: {
    applicability: 'usable', sourceStatus: 'supported', source: 'synthetic', method: 'wald-ratio', exposureDefinition: 'X', outcomeDefinition: 'Y', ancestry: 'synthetic', genomeBuild: 'GRCh38', effectUnit: 'SD', sampleOverlapChecked: true, harmonized: true, instrumentCount: 1, minimumFStatistic: 100,
    geneticInput: { exposure: trait, outcome: trait, ld_independent: true, ld_source: 'fixture', sample_overlap: 'none', sample_overlap_source: 'fixture', harmonization_source: 'fixture', instruments: [{ snp: 'rs1', beta_exposure: .2, se_exposure: .01, beta_outcome: .1, se_outcome: .02, exposure_effect_allele: 'A', exposure_other_allele: 'G', outcome_effect_allele: 'A', outcome_other_allele: 'G', harmonization_status: 'aligned' }] },
  } })
  const task = store.createResearchTask({ projectId: project.id, studyId: study.id, name: 'Wald', kind: 'genetics', exploratory })
  const plan = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'analysis-plan', payload: { method: 'wald-ratio', inputs: [contract.id], taskIds: [task.id], stoppingConditions: ['invalid instruments'], exploratory, genetics: { analysis: 'mr', methods: ['wald'], min_f: 10 } } })
  const question = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'question', payload: { estimand: 'synthetic fixture' } })
  store.updateResearchStudy(study.id, { expectedVersion: store.getResearchStudy(study.id)!.version, currentQuestionId: question.id, currentPlanId: plan.id })
  let status = 'running'; let methodStatus = 'succeeded'; let altered = false; let corrupt = false; let missingNumbers = false
  const files = new Map<string, string>()
  const createFiles = (request: JsonObject) => {
    const inputText = JSON.stringify(altered ? { ...request, request_id: 'other-request' } : request)
    const resultText = JSON.stringify({ runner_contract: GENETIC_RUNNER, request_id: request.request_id, status: methodStatus, analysis_complete: methodStatus === 'succeeded', scientific_review: 'pending', analyses: missingNumbers ? {} : { wald: { beta: .5, se: .1, ci_low: .304, ci_high: .696, p_value: .0000005733 } }, runtime: { R: '4.3.2' }, included: [{ snp: 'rs1' }], excluded: [] })
    const entries = [{ path: 'input.json', sha256: sha(inputText), bytes: Buffer.byteLength(inputText) }, { path: 'result.json', sha256: sha(resultText), bytes: Buffer.byteLength(resultText) }]
    const manifest = JSON.stringify({ runner_contract: GENETIC_RUNNER, request_id: request.request_id, status: methodStatus, analysis_complete: methodStatus === 'succeeded', scientific_review: 'pending', files: entries, runner_sources: [{ path: 'runner.R', sha256: sha('fixture-r') }, { path: 'run.py', sha256: sha('fixture-python') }] })
    files.set('input.json', inputText); files.set('result.json', resultText); files.set('manifest.json', manifest)
  }
  const execute = vi.fn(async (id: string, args: any) => {
    let value: any = {}
    if (id === 'r.genetics.run') { createFiles({ ...args.request, request_id: args.request_id }); value = { job_id: 'genetics-job-1', status: 'queued' } }
    if (id === 'r.get.job') value = { status }
    if (id === 'r.get.job.manifest') value = { files: [...files.entries()].map(([name, text]) => ({ path: `genetics/${name}`, sha256: sha(text), bytes: Buffer.byteLength(text), mime_type: 'application/json' })) }
    return { target: id, content: [], value: { structuredContent: value } }
  })
  const backend = { ensureConnected: vi.fn(), executeCompactCapability: execute, workflowRequest: vi.fn(async (action: string, args: any) => {
    if (action === 'workflow_describe') return rWorkflows.modules.find(item => item.id === args.workflow_id)?.operations.find(item => item.id === args.operation)
    if (action === 'workflow_query') return (await execute(args.operation, args.arguments)).value.structuredContent
    throw new Error('Unsupported test workflow action')
  }) } as any
  const workflow = new ResearchWorkflowService(store, join(root, 'workflows'), backend)
  const download = vi.fn(async (request: { localPath: string; remotePath: string }) => {
    const name = request.remotePath.split('/').at(-1)!
    const content = files.get(name)!
    const path = join(root, request.localPath); await mkdir(dirname(path), { recursive: true }); await writeFile(path, corrupt && name === 'result.json' ? `${content} ` : content)
    return { sha256: sha(content), bytes: Buffer.byteLength(content) }
  })
  const service = new GeneticAnalysisService(store, () => workflow, download)
  const exec = { signal: new AbortController().signal, agent: { session: { header: { cwd: root } } } } as any
  const input = { studyId: study.id, contractId: contract.id, planId: plan.id, taskId: task.id, requestId: 'genetics-request-1', expectedPlanVersion: plan.version }
  return { root, store, project, study, contract, task, plan, execute, download, service, exec, input, status: (s: string) => { status = s }, method: (s: string) => { methodStatus = s }, alter: () => { altered = true }, corrupt: () => { corrupt = true }, omitNumbers: () => { missingNumbers = true } }
}

describe('genetics durable Host adapter', () => {
  it('submits once, refreshes the actual workflow, verifies downloaded files and registers pending evidence', async () => {
    const f = await fixture()
    const first = await f.service.execute(f.project, f.input, f.exec)
    expect(first).toMatchObject({ status: 'running', analysisComplete: false, evidence: null, remoteId: 'genetics-job-1' })
    const id = String((first.run as JsonObject).id)
    await f.service.execute(f.project, f.input, f.exec)
    expect(f.execute.mock.calls.filter(([operation]) => operation === 'r.genetics.run')).toHaveLength(1)
    f.status('succeeded')
    const done = await f.service.refresh(f.project, { studyId: f.study.id, runId: id }, f.exec)
    expect(done).toMatchObject({ status: 'succeeded', analysisComplete: true, inputsCurrent: true, result: { analyses: { wald: { beta: .5, se: .1 } } }, evidence: { payload: { needsReview: true, evidenceType: 'genetic-instrument-analysis' } } })
    expect(f.download).toHaveBeenCalledTimes(3)
    expect(f.download).toHaveBeenCalledWith(expect.objectContaining({ remotePath: '.zerowall/jobs/genetics-job-1/result/genetics/result.json' }), f.exec)
    expect(f.store.listArtifacts(f.project.id)).toHaveLength(3)
    await f.service.refresh(f.project, { studyId: f.study.id, runId: id }, f.exec)
    expect(f.store.listResearchDocuments(f.study.id, 'evidence')).toHaveLength(1)
    expect(f.store.listArtifacts(f.project.id)).toHaveLength(3)
  })
  it('preserves blocked/partial method artifacts without scientific evidence', async () => {
    const f = await fixture(); f.method('partial'); f.status('failed')
    const done = await f.service.execute(f.project, f.input, f.exec)
    expect(done).toMatchObject({ status: 'failed', methodStatus: 'partial', analysisComplete: false, evidence: null })
    expect(f.store.listArtifacts(f.project.id)).toHaveLength(3)
  })
  it('rejects mutated download bytes even if remote computation succeeded', async () => {
    const f = await fixture(); f.status('succeeded'); f.corrupt()
    const done = await f.service.execute(f.project, f.input, f.exec)
    expect(done).toMatchObject({ status: 'succeeded', analysisComplete: false, evidence: null, artifactError: expect.stringContaining('byte size') })
    expect(f.store.listResearchDocuments(f.study.id, 'evidence')).toHaveLength(0)
  })
  it('rejects a validly checksummed result belonging to another request', async () => {
    const f = await fixture(); f.status('succeeded'); f.alter()
    const done = await f.service.execute(f.project, f.input, f.exec)
    expect(done).toMatchObject({ analysisComplete: false, artifactError: expect.stringContaining('does not match') })
  })
  it('retains historical artifacts after a plan revision, without attaching new evidence to it', async () => {
    const f = await fixture(); const first = await f.service.execute(f.project, f.input, f.exec)
    f.store.updateResearchDocument(f.plan.id, { expectedVersion: f.plan.version, payload: { ...f.plan.payload, stoppingConditions: ['revised stop'] } })
    f.status('succeeded')
    const done = await f.service.refresh(f.project, { studyId: f.study.id, runId: String((first.run as JsonObject).id) }, f.exec)
    expect(done).toMatchObject({ analysisComplete: true, inputsCurrent: false, evidence: null })
    expect(f.store.listArtifacts(f.project.id)).toHaveLength(3)
  })
  it('enforces the exact frozen plan and persisted task binding before confirmatory submission', async () => {
    const f = await fixture(false)
    await expect(f.service.execute(f.project, f.input, f.exec)).rejects.toThrow('approved frozen')
    expect(f.execute).not.toHaveBeenCalled()
    const approved = f.store.approveResearchGate(f.study.id, 1, 'approved', f.store.getResearchStudy(f.study.id)!.version, 'Synthetic review')
    f.store.freezeResearchStudy(f.study.id, approved.version)
    expect(await f.service.execute(f.project, f.input, f.exec)).toMatchObject({ status: 'running' })
    expect(f.store.getResearchStudy(f.study.id)?.gate1).toBe('approved')
  })
  it('rejects cross-project refresh and tampered local provenance', async () => {
    const f = await fixture(); const first = await f.service.execute(f.project, f.input, f.exec)
    const id = String((first.run as JsonObject).id)
    const foreign = f.store.createProject({ name: 'Other', rootPath: join(f.root, 'other') })
    await expect(f.service.refresh(foreign, { studyId: f.study.id, runId: id }, f.exec)).rejects.toThrow('outside')
    const requested = f.store.listAuditEvents(f.project.id).find(event => event.action === 'genetics.requested')!
    expect(requested.details.fingerprint).toMatch(/^[a-f0-9]{64}$/)
    const path = join(f.root, '.zerowall', 'genetics', sha(JSON.stringify({ projectId: f.project.id, requestId: f.input.requestId })), 'request.json')
    const snapshot = JSON.parse(await readFile(path, 'utf8')); snapshot.planVersion = 99
    await writeFile(path, JSON.stringify(snapshot))
    await expect(f.service.refresh(f.project, { studyId: f.study.id, runId: id }, f.exec)).rejects.toThrow('provenance mismatch')
  })
  it('restores an already-submitted Run after acknowledgement is interrupted, without resubmitting it', async () => {
    const f = await fixture()
    const record = f.store.recordAuditEvent.bind(f.store)
    const spy = vi.spyOn(f.store, 'recordAuditEvent').mockImplementation((projectId, action, details, entityId) => {
      if (action === 'genetics.submitted') throw new Error('Simulated Host acknowledgement interruption')
      return record(projectId, action, details, entityId)
    })
    await expect(f.service.execute(f.project, f.input, f.exec)).rejects.toThrow('acknowledgement')
    spy.mockRestore()
    const run = f.store.listRuns(f.project.id)[0]!
    f.status('succeeded')
    expect(await f.service.refresh(f.project, { studyId: f.study.id, runId: run.id }, f.exec)).toMatchObject({ status: 'succeeded', analysisComplete: true })
    expect(f.execute.mock.calls.filter(([operation]) => operation === 'r.genetics.run')).toHaveLength(1)
  })
  it('does not accept success flags without actual numerical estimates and uncertainty', async () => {
    const f = await fixture(); f.status('succeeded'); f.omitNumbers()
    expect(await f.service.execute(f.project, f.input, f.exec)).toMatchObject({ status: 'succeeded', analysisComplete: false, evidence: null, error: expect.stringContaining('numerical') })
    expect(f.store.listArtifacts(f.project.id)).toHaveLength(3)
  })
})
