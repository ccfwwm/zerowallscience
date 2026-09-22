import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import { PILOT_CONDITIONS, PILOT_TASKS, PilotEvaluationService, type PilotSpec, type PilotOutcome } from '../src/host/pilot-evaluation.js'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const fn of cleanups.splice(0).reverse()) await fn() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'pilot-ledger-'))
  const store = new ResearchStore(join(root, 'test.sqlite'))
  cleanups.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  const project = store.createProject({ name: 'pilot test fixture', rootPath: root })
  const study = store.createResearchStudy({ projectId: project.id, title: 'No actual benchmark executions' })
  const checksum = 'a'.repeat(64)
  const input = store.createArtifact({ projectId: project.id, name: 'fixture input', uri: 'fixture:input', mediaType: 'application/json', checksum })
  const ref = { artifactId: input.id, checksum }
  const reference = store.createArtifact({ projectId: project.id, name: 'fixture reference', uri: 'fixture:reference', mediaType: 'application/json', checksum: 'c'.repeat(64) })
  const requestEvent = () => store.recordAuditEvent(project.id, 'research-runtime.request', { studyId: study.id, model: 'fixed-test-model', provider: 'test-provider', systemSha256: 'b'.repeat(64) })
  const spec: PilotSpec = {
    model: 'fixed-test-model', provider: 'test-provider', budgetPerTrial: { tokens: 1000, milliseconds: 30000, toolCalls: 10, computeSeconds: 100, humanMinutes: 10, costUsd: 1 },
    policyProvenanceIds: [requestEvent().id], runtimeHashes: { systemSha256: 'b'.repeat(64) },
    tasks: PILOT_TASKS.map(([taskId, _title, inputKind]) => ({ taskId, inputKind, split: 'pilot', inputs: [ref], reference: { artifactId: reference.id, checksum: reference.checksum! }, rubric: { engineering: 'artifact exists', science: 'manual review required' }, numericTolerance: 1e-8, requiredDeliverables: ['result manifest'], majorErrors: ['fabricated result'], expectedDisposition: 'analysis' })),
  }
  const service = new PilotEvaluationService(store)
  const evaluation = service.freeze(project.id, study.id, spec)
  const outcome = (): PilotOutcome => {
    const run = store.createRun({ projectId: project.id, name: 'test-only adapter fixture', command: 'fixture', workingDirectory: root, status: 'succeeded' })
    const artifact = store.createArtifact({ projectId: project.id, runId: run.id, name: 'fixture output', uri: 'fixture:output', mediaType: 'application/json', checksum })
    return { runId: run.id, artifacts: [{ artifactId: artifact.id, checksum }], model: spec.model, provider: spec.provider, disposition: 'analysis', policyProvenanceIds: [requestEvent().id], usage: { tokens: 100, milliseconds: 5, toolCalls: 1, computeSeconds: 0.1, humanMinutes: 0, costUsd: 0.01 } }
  }
  return { store, project, study, service, evaluation, spec, outcome }
}

describe('frozen 12 by 4 pilot execution ledger', () => {
  it('creates 48 pending cells without claiming executions or scores and rejects incomplete freezes', async () => {
    const f = await fixture()
    const summary = f.service.summary(f.project.id, f.evaluation.id)
    expect(summary.trials).toHaveLength(48)
    expect(summary.trials.every(t => t.status === 'not-run')).toBe(true)
    expect(summary.scoredTrials).toBe(0)
    expect(summary.scientificComparison).toBe('not-evaluated')
    expect(() => f.service.freeze(f.project.id, f.study.id, { ...f.spec, tasks: f.spec.tasks.slice(1) })).toThrow('twelve')
    expect(() => f.service.freeze(f.project.id, f.study.id, { ...f.spec, runtimeHashes: {} })).toThrow('provenance')
    expect(() => f.service.freeze(f.project.id, f.study.id, { ...f.spec, tasks: f.spec.tasks.map(t => ({ ...t, split: 'unseen' })) })).toThrow('split')
    expect(() => f.service.freeze(f.project.id, f.study.id, { ...f.spec, policyProvenanceIds: ['fabricated'] })).toThrow('actual matching')
    expect(() => f.service.freeze(f.project.id, f.study.id, { ...f.spec, runtimeHashes: { systemSha256: 'd'.repeat(64) } })).toThrow('recorded policy')
    expect(() => f.service.freeze(f.project.id, f.study.id, { ...f.spec, tasks: f.spec.tasks.map(t => ({ ...t, reference: t.inputs[0]! })) })).toThrow('separate')
  })
  it('requires a real adapter and a succeeded project Run; hides reference answers from the adapter', async () => {
    const f = await fixture(); const trial = f.service.summary(f.project.id, f.evaluation.id).trials[0]!
    await expect(f.service.execute(f.project.id, f.evaluation.id, trial.id, 1, {})).rejects.toThrow('No actual execution adapter')
    const adapter = vi.fn(async request => {
      expect(request.task).not.toHaveProperty('reference')
      expect(request.task).not.toHaveProperty('rubric')
      expect(request.spec).not.toHaveProperty('tasks')
      return f.outcome()
    })
    const done = await f.service.execute(f.project.id, f.evaluation.id, trial.id, 1, { [PILOT_CONDITIONS[0]]: adapter })
    expect(done.version).toBe(3)
    expect(f.service.summary(f.project.id, done.id).trials[0]?.status).toBe('completed')
    expect(f.service.summary(f.project.id, done.id).scoredTrials).toBe(0)
    await expect(f.service.execute(f.project.id, done.id, trial.id, done.version, { [PILOT_CONDITIONS[0]]: adapter })).rejects.toThrow('never blindly')
    expect(adapter).toHaveBeenCalledTimes(1)
  })
  it('preserves actual aggregate costs while classifying over-budget runs separately', async () => {
    const f = await fixture(); const trial = f.service.summary(f.project.id, f.evaluation.id).trials[0]!
    await f.service.execute(f.project.id, f.evaluation.id, trial.id, 1, { [PILOT_CONDITIONS[0]]: async () => { const o = f.outcome(); o.usage.tokens = 1001; return o } })
    const summary = f.service.summary(f.project.id, f.evaluation.id)
    expect(summary.trials[0]?.status).toBe('budget-exceeded')
    expect(summary.recordedCosts.tokens).toBe(1001)
  })
  it('does not count foreign or failed runs as completed and records unknown cost explicitly', async () => {
    const f = await fixture(); const trial = f.service.summary(f.project.id, f.evaluation.id).trials[0]!
    await f.service.execute(f.project.id, f.evaluation.id, trial.id, 1, { [PILOT_CONDITIONS[0]]: async () => ({ ...f.outcome(), runId: 'not-a-real-run' }) })
    const summary = f.service.summary(f.project.id, f.evaluation.id)
    expect(summary.trials[0]?.status).toBe('failed')
    expect(summary.unknownCostTrials).toBe(1)
  })
  it('rejects input changes after freezing, revision conflicts and cross-project reads', async () => {
    const f = await fixture(); const trial = f.service.summary(f.project.id, f.evaluation.id).trials[0]!
    await expect(f.service.execute(f.project.id, f.evaluation.id, trial.id, 2, {})).rejects.toThrow('revision')
    expect(() => f.service.summary('another-project', f.evaluation.id)).toThrow('project')
    const payload = structuredClone(f.evaluation.payload)
    ;(payload.spec as Record<string, unknown>).model = 'changed-model'
    f.store.updateResearchDocument(f.evaluation.id, { expectedVersion: 1, payload })
    expect(() => f.service.summary(f.project.id, f.evaluation.id)).toThrow('modified')
  })
  it('retains interruption without retrying unknown remote outcomes', async () => {
    const f = await fixture(); const trial = f.service.summary(f.project.id, f.evaluation.id).trials[0]!
    const controller = new AbortController()
    const promise = f.service.execute(f.project.id, f.evaluation.id, trial.id, 1, { [PILOT_CONDITIONS[0]]: async () => { controller.abort(); return await new Promise<PilotOutcome>(() => {}) } }, controller.signal)
    await promise
    expect(f.service.summary(f.project.id, f.evaluation.id).trials[0]?.status).toBe('interrupted')
    expect(f.service.summary(f.project.id, f.evaluation.id).unknownCostTrials).toBe(1)
  })
  it('detects edited trial states even when the original spec fingerprint is retained', async () => {
    const f = await fixture()
    const payload = structuredClone(f.evaluation.payload)
    ;(payload.trials as Array<Record<string, unknown>>)[0]!.status = 'completed'
    f.store.updateResearchDocument(f.evaluation.id, { expectedVersion: 1, payload })
    expect(() => f.service.summary(f.project.id, f.evaluation.id)).toThrow('checkpointed')
  })
  it('rejects invented outcome provenance rather than accepting an arbitrary nonempty ID', async () => {
    const f = await fixture(); const trial = f.service.summary(f.project.id, f.evaluation.id).trials[0]!
    await f.service.execute(f.project.id, f.evaluation.id, trial.id, 1, { [PILOT_CONDITIONS[0]]: async () => ({ ...f.outcome(), policyProvenanceIds: ['made-up'] }) })
    expect(f.service.summary(f.project.id, f.evaluation.id).trials[0]?.status).toBe('failed')
  })
})
