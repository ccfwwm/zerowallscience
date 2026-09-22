import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import type { JsonObject } from '../../../store/src/domain.js'
import { ResearchWorkflowService } from '../../mcp/src/host/research-workflow.js'
import { rWorkflows } from '../../mcp/src/shared/r-workflows.js'
import { NHANES_SURVEY_RUNNER, NhanesSurveyService, prepareNhanesSurvey } from '../src/host/nhanes-runner.js'

function contract(): JsonObject {
  return { applicability: 'usable', sourceStatus: 'supported', source: 'fixture-codebook', fullDataset: true, previewTruncated: false,
    datasets: [{ cycle: '2017-2018', component: 'Demographics', dataset: 'DEMO_J', weight: 'WTINT2YR', codebook: 'fixture-codebook' }],
    weight: 'WTINT2YR', strata: 'SDMVSTRA', psu: 'SDMVPSU', key: 'SEQN', availableVariables: ['SEQN', 'WTINT2YR', 'SDMVSTRA', 'SDMVPSU', 'RIDAGEYR', 'RIAGENDR'],
    isolatedPsuHandling: 'survey-option-recorded', lonelyPsu: 'fail', specialMissingCodes: { RIDAGEYR: [], RIAGENDR: [] } }
}
const summary = { kind: 'summary', variable: 'RIDAGEYR' }

describe('strict NHANES request compilation', () => {
  it('compiles a verified contract without downloading or silently changing weights', () => {
    expect(prepareNhanesSurvey(contract(), summary)).toMatchObject({ status: 'ready', operation: 'r.nhanes.survey.summary', arguments: { runner_contract: NHANES_SURVEY_RUNNER, variable: 'RIDAGEYR', weight: 'WTINT2YR', cycle_strategy: 'single-cycle', datasets: [{ cycle: '2017-2018', domain: 'Demographics', dataset: 'DEMO_J', ensure_available: false }] } })
    expect(prepareNhanesSurvey(contract(), { kind: 'regression', outcome: 'RIDAGEYR', predictors: ['RIAGENDR'], family: 'gaussian' })).toMatchObject({ status: 'ready', operation: 'r.nhanes.survey.regression', arguments: { outcome: 'RIDAGEYR', predictors: ['RIAGENDR'], family: 'gaussian' } })
  })
  it.each([
    { fullDataset: false }, { previewTruncated: true }, { sourceStatus: 'unknown' }, { applicability: 'pending' }, { availableVariables: [] },
    { specialMissingCodes: {} }, { domainDesign: 'pre-filtered-subset' }, { lonelyPsu: 'silent' }, { key: 'SDMVPSU' },
  ])('blocks incomplete or unsuitable data %j', changes => {
    expect(prepareNhanesSurvey({ ...contract(), ...changes }, summary).status).toBe('blocked')
  })
  it('requires one task per cycle or exact official combination multipliers', () => {
    const base = contract()
    const combined = { ...base, datasets: [...base.datasets as JsonObject[], { ...(base.datasets as JsonObject[])[0], cycle: '2015-2016', dataset: 'DEMO_I' }] }
    expect(prepareNhanesSurvey(combined, summary).status).toBe('blocked')
    expect(prepareNhanesSurvey({ ...combined, cycleStrategy: 'per-cycle' }, summary).status).toBe('blocked')
    expect(prepareNhanesSurvey({ ...combined, cycleStrategy: 'official-combined', combinedWeightSource: 'official-rule' }, summary).status).toBe('blocked')
    expect(prepareNhanesSurvey({ ...combined, cycleStrategy: 'official-combined', combinedWeightSource: 'official-rule', cycleWeightMultipliers: { '2015-2016': .5, '2017-2018': .5 } }, summary)).toMatchObject({ status: 'ready', arguments: { cycle_strategy: 'official-combined', cycle_weight_multipliers: { '2015-2016': .5, '2017-2018': .5 } } })
  })
  it('requires DXX_H age bounds in both metadata and applied survey-domain filters', () => {
    const dxx = { ...contract(), datasets: [{ cycle: '2013-2014', component: 'Examination', dataset: 'DXX_H', codebook: 'fixture', weight: 'WTINT2YR', ageMin: 8, ageMax: 69 }] }
    expect(prepareNhanesSurvey(dxx, summary).status).toBe('blocked')
    expect(prepareNhanesSurvey({ ...dxx, domainDesign: 'survey-domain', domainExpression: 'RIDAGEYR >= 8 && RIDAGEYR <= 69', surveyDomain: [{ variable: 'RIDAGEYR', operator: 'gte', value: 8 }, { variable: 'RIDAGEYR', operator: 'lte', value: 69 }] }, summary).status).toBe('ready')
  })
  it('does not accept executable R expressions as variable names', () => {
    expect(prepareNhanesSurvey(contract(), { kind: 'regression', outcome: 'RIDAGEYR', predictors: ['system("x")'], family: 'gaussian' }).status).toBe('blocked')
  })
})

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const clean of cleanups.splice(0).reverse()) await clean() })
async function fixture(exploratory = true, certified = true) {
  const root = await mkdtemp(join(tmpdir(), 'nhanes-runner-'))
  const store = new ResearchStore(join(root, 'research.sqlite'))
  cleanups.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'Survey', rootPath: root })
  const study = store.createResearchStudy({ projectId: project.id, title: 'Synthetic runner test' })
  const data = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'dataset-contract', payload: contract() })
  const task = store.createResearchTask({ projectId: project.id, studyId: study.id, name: 'Age summary', kind: 'nhanes-survey', exploratory })
  const plan = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'analysis-plan', payload: { method: 'survey-summary', inputs: [data.id], taskIds: [task.id], stoppingConditions: ['invalid data'], exploratory, nhanesSurvey: summary } })
  const question = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'question', payload: { estimand: 'mean age' } })
  const latest = store.getResearchStudy(study.id)!
  store.updateResearchStudy(study.id, { expectedVersion: latest.version, currentQuestionId: question.id, currentPlanId: plan.id })
  const execute = vi.fn(async (id: string) => ({ target: id, content: [], value: { structuredContent: { ...(certified ? { runner_contract: NHANES_SURVEY_RUNNER, analysis_complete: true } : {}), mean: 41, standard_error: 1.2, scientific_review: 'pending' } } }))
  const backend = { workflowRequest: vi.fn(async (_action: string, args: any) => { const operation = rWorkflows.modules.find(m => m.id === args.workflow_id)?.operations.find(o => o.id === args.operation); if (!operation) throw new Error('Wrong workflow or operation'); return operation }), ensureConnected: vi.fn(), executeCompactCapability: execute } as any
  const workflow = new ResearchWorkflowService(store, join(root, 'workflows'), backend)
  const service = new NhanesSurveyService(store, () => workflow)
  const exec = { signal: new AbortController().signal, agent: { session: { header: { cwd: root } } } } as any
  const input = { studyId: study.id, contractId: data.id, planId: plan.id, taskId: task.id, requestId: 'survey-1', expectedPlanVersion: plan.version }
  return { root, store, project, study, data, task, plan, execute, backend, service, input, exec }
}

describe('persisted survey execution and evidence', () => {
  it('uses the actual workflow, binds the Run and preserves synchronous results without inventing remote IDs', async () => {
    const f = await fixture()
    const result = await f.service.execute(f.project, f.input, f.exec)
    expect(result).toMatchObject({ status: 'succeeded', analysisComplete: true, remoteId: null, needsReview: true, evidence: { payload: { needsReview: true, evidenceType: 'observational-survey' } } })
    expect(f.backend.workflowRequest).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ workflow_id: 'r.nhanes', operation: 'r.nhanes.survey.summary' }), expect.anything())
    const artifact = result.artifact as JsonObject
    const manifest = JSON.parse(await readFile(fileURLToPath(String(artifact.uri)), 'utf8'))
    expect(manifest).toMatchObject({ taskId: f.task.id, contractId: f.data.id, planId: f.plan.id, scientificReview: 'pending', remoteId: null, result: { mean: 41 } })
    expect(f.store.listResearchTasks(f.study.id)[0]).toMatchObject({ runId: manifest.runId, status: 'succeeded', attempt: 1 })
    const again = await f.service.execute(f.project, f.input, f.exec)
    expect((again.artifact as JsonObject).id).toBe(artifact.id)
    expect(f.execute.mock.calls.filter(([id]) => id === 'r.nhanes.survey.summary')).toHaveLength(1)
    expect(f.store.listResearchDocuments(f.study.id, 'evidence')).toHaveLength(1)
  })
  it('retains uncertified backend output as an artifact without registering scientific evidence', async () => {
    const f = await fixture(true, false)
    expect(await f.service.execute(f.project, f.input, f.exec)).toMatchObject({ status: 'succeeded', analysisComplete: false, evidence: null })
    expect(f.store.listArtifacts(f.project.id)).toHaveLength(1)
  })
  it('blocks confirmatory computation until human gate one and exact plan freeze', async () => {
    const f = await fixture(false)
    await expect(f.service.execute(f.project, f.input, f.exec)).rejects.toThrow('approved frozen')
    expect(f.execute).not.toHaveBeenCalled()
    const latest = f.store.getResearchStudy(f.study.id)!
    const approved = f.store.approveResearchGate(f.study.id, 1, 'approved', latest.version, 'Synthetic fixture review')
    const freeze = f.store.freezeResearchStudy(f.study.id, approved.version)
    expect(f.store.getResearchStudy(f.study.id)).toMatchObject({ gate1: 'approved', currentPlanId: f.plan.id, currentFreezeId: freeze.id })
    const result = await f.service.execute(f.project, f.input, f.exec)
    const manifest = JSON.parse(await readFile(fileURLToPath(String((result.artifact as JsonObject).uri)), 'utf8'))
    expect(manifest).toMatchObject({ freezeId: freeze.id, exploratory: false })
  })
  it('rejects a task absent from the persisted plan', async () => {
    const f = await fixture()
    f.store.updateResearchDocument(f.plan.id, { expectedVersion: f.plan.version, payload: { ...f.plan.payload, taskIds: [] } })
    await expect(f.service.execute(f.project, { ...f.input, expectedPlanVersion: 2 }, f.exec)).rejects.toThrow('research task')
    expect(f.execute).not.toHaveBeenCalled()
  })
  it('detects idempotency conflicts when an exploratory contract changes', async () => {
    const f = await fixture()
    await f.service.execute(f.project, f.input, f.exec)
    f.store.updateResearchDocument(f.data.id, { expectedVersion: f.data.version, payload: { ...f.data.payload, source: 'new-codebook' } })
    await expect(f.service.execute(f.project, f.input, f.exec)).rejects.toThrow('IDEMPOTENCY_CONFLICT')
    expect(f.execute.mock.calls.filter(([id]) => id === 'r.nhanes.survey.summary')).toHaveLength(1)
  })
  it('retains historical output without new evidence when inputs change during execution', async () => {
    const f = await fixture()
    const original = f.execute.getMockImplementation()!
    f.execute.mockImplementation(async (id: string) => {
      if (id === 'r.nhanes.survey.summary') f.store.updateResearchDocument(f.data.id, { expectedVersion: f.data.version, payload: { ...f.data.payload, source: 'amended-source' } })
      return original(id)
    })
    const result = await f.service.execute(f.project, f.input, f.exec)
    expect(result).toMatchObject({ status: 'succeeded', analysisComplete: true, inputsCurrent: false, evidence: null })
    expect(result.error).toContain('changed during execution')
    const manifest = JSON.parse(await readFile(fileURLToPath(String((result.artifact as JsonObject).uri)), 'utf8'))
    expect(manifest).toMatchObject({ inputsCurrent: false, contractVersion: 1 })
    expect(f.store.listResearchDocuments(f.study.id, 'evidence')).toEqual([])
  })
  it('persists a reasonable stop and never calls the backend for truncated data', async () => {
    const f = await fixture()
    f.store.updateResearchDocument(f.data.id, { expectedVersion: f.data.version, payload: { ...f.data.payload, previewTruncated: true } })
    expect(await f.service.execute(f.project, f.input, f.exec)).toMatchObject({ status: 'blocked', runner: NHANES_SURVEY_RUNNER })
    expect(f.execute).not.toHaveBeenCalled()
    expect(f.store.listResearchDocuments(f.study.id, 'observation')).toHaveLength(0)
  })
})
