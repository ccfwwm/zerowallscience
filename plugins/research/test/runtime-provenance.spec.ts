import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createSystemMessage, createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ResearchStore } from '../../../store/src/index.js'
import { installResearchRuntimeProvenance, observedModelUsage, runtimePolicyFingerprint } from '../src/host/runtime-provenance.js'
import { ReportService } from '../src/host/report.js'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

function request(session = 'a'): GenerateOptions {
  return { provider: 'fixture-provider', model: 'fixed-fixture-version', sessionId: SessionId(session), system: 'secret prompt body',
    messages: [createSystemMessage('policy'), createUserMessage({ source: { kind: 'skill-invocation', name: 'fixture-skill', form: 'instructions' }, content: [{ type: 'text', text: 'private instructions' }] })] }
}
const terminal: StreamChunk[] = [{ type: 'usage', usage: { inputTokens: 5, outputTokens: 7, cacheReadTokens: 3, cacheWriteTokens: 1, totalTokens: 16 } }, { type: 'finish', reason: { kind: 'stop' } }]
async function consume(ctx: Context, options: GenerateOptions, chunks: StreamChunk[] = terminal): Promise<void> {
  for await (const _ of ctx.waterfall(ctx as never, 'llm/stream', options, async function* () { yield* chunks })) { /* exercise registered middleware */ }
}

describe('research runtime policy provenance', () => {
  it('hashes delivered policy and Skill content without persisting source text', () => {
    const first = runtimePolicyFingerprint(request())
    const copy = runtimePolicyFingerprint(request())
    expect(copy).toEqual(first)
    expect(first).toMatchObject({ coreVersion: '7.0.0-core.2', contextVersion: '7.0.0-context.1', skillContextCount: 1 })
    expect(JSON.stringify(first)).not.toContain('private instructions')
    expect(JSON.stringify(first)).not.toContain('secret prompt body')
    const changed = request()
    changed.messages[1] = createUserMessage({ source: { kind: 'skill-invocation', name: 'fixture-skill', form: 'instructions' }, content: [{ type: 'text', text: 'changed user override' }] })
    expect(runtimePolicyFingerprint(changed).skillsSha256).not.toBe(first.skillsSha256)
    expect(runtimePolicyFingerprint(changed).systemSha256).toBe(first.systemSha256)
  })

  it('never turns missing, inconsistent or negative counters into complete zero cost', () => {
    expect(observedModelUsage(undefined)).toMatchObject({ complete: false, totalUnits: null, monetaryCost: null })
    expect(observedModelUsage({ inputTokens: 2, outputTokens: 3 })).toMatchObject({ complete: false, totalUnits: null })
    expect(observedModelUsage({ inputTokens: 2, outputTokens: 3, totalTokens: 5 })).toMatchObject({ complete: true, totalUnits: 5, cacheReadUnits: null })
    expect(observedModelUsage({ inputTokens: 2, outputTokens: 3, cacheReadTokens: 4, cacheWriteTokens: 1, totalTokens: 9 })).toMatchObject({ complete: false, totalUnits: null, countersConsistent: false })
    expect(observedModelUsage({ inputTokens: -1, outputTokens: 3 })).toMatchObject({ complete: false, uncachedInputUnits: null })
  })

  it('records full ordered Skill hashes, per-study requests and usage through the real stream hook', async () => {
    const ctx = new Context(), store = new ResearchStore(':memory:')
    try {
      const project = store.createProject({ name: 'runtime', rootPath: 'C:/runtime' })
      const a = store.createResearchStudy({ projectId: project.id, title: 'A' })
      const b = store.createResearchStudy({ projectId: project.id, title: 'B' })
      installResearchRuntimeProvenance(ctx, store, session => session === 'a' ? a : session === 'b' ? b : undefined)
      const options = request()
      options.messages.push(...Array.from({ length: 23 }, () => request().messages[1]!))
      await consume(ctx, options)
      await consume(ctx, request('b'))
      await consume(ctx, request('no-study'))
      const events = store.listResearchRuntimeEvents(a.id)
      expect(events.filter(event => event.action === 'research-runtime.skill-context')).toHaveLength(24)
      expect(events.find(event => event.action === 'research-runtime.request')?.details.skillContextCount).toBe(24)
      expect(events.at(-1)?.details).toMatchObject({ status: 'completed', totalUnits: 16, complete: true })
      expect(events.every(event => event.projectId === project.id && event.details.studyId === a.id)).toBe(true)
      expect(store.listResearchRuntimeEvents(b.id)).toHaveLength(3)
      expect(store.exportResearchSnapshot(project.id).auditEvents.some(event => event.action === 'research-runtime.request')).toBe(true)
      expect(JSON.stringify(events)).not.toContain('private instructions')
    } finally { await ctx.fiber.dispose(); store.close() }
  })

  it('pins a request to its starting study and preserves failures and absent terminal usage', async () => {
    const ctx = new Context(), store = new ResearchStore(':memory:')
    try {
      const project = store.createProject({ name: 'runtime', rootPath: 'C:/runtime' })
      const a = store.createResearchStudy({ projectId: project.id, title: 'A' })
      const b = store.createResearchStudy({ projectId: project.id, title: 'B' })
      let active = a
      installResearchRuntimeProvenance(ctx, store, () => active)
      const run = async () => {
        for await (const _ of ctx.waterfall(ctx as never, 'llm/stream', request(), async function* () {
          active = b
          throw new Error('upstream credential=do-not-store')
        })) { /* rejected upstream */ }
      }
      await expect(run()).rejects.toThrow('upstream')
      expect(store.listResearchRuntimeEvents(b.id)).toEqual([])
      const events = store.listResearchRuntimeEvents(a.id)
      expect(events.at(-1)?.details).toMatchObject({ status: 'failed', totalUnits: null, complete: false })
      expect(JSON.stringify(events)).not.toContain('do-not-store')
      await consume(ctx, request(), [])
      expect(store.listResearchRuntimeEvents(b.id).at(-1)?.details.status).toBe('incomplete-stream')
    } finally { await ctx.fiber.dispose(); store.close() }
  })

  it('includes the observed policy in immutable freezes and exported report manifests', async () => {
    const root = await mkdtemp(join(tmpdir(), 'research-policy-'))
    const ctx = new Context(), store = new ResearchStore(':memory:')
    try {
      const project = store.createProject({ name: 'runtime', rootPath: root })
      let study = store.createResearchStudy({ projectId: project.id, title: 'A' })
      const contract = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'dataset-contract', payload: { applicability: 'usable', sourceStatus: 'supported', source: 'fixture' } })
      const question = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'question', payload: { text: 'fixture' } })
      const plan = store.createResearchDocument({ projectId: project.id, studyId: study.id, kind: 'analysis-plan', payload: { inputs: [contract.id], method: 'description', assumptions: { independent: true }, parameters: {}, stoppingConditions: ['missing-data'], exploratory: false, budget: { maxTokens: 100 } } })
      study = store.updateResearchStudy(study.id, { expectedVersion: store.getResearchStudy(study.id)!.version, currentQuestionId: question.id, currentPlanId: plan.id })
      installResearchRuntimeProvenance(ctx, store, () => store.getResearchStudy(study.id))
      await consume(ctx, request())
      study = store.approveResearchGate(study.id, 1, 'approved', store.getResearchStudy(study.id)!.version, 'fixture validation')
      const freeze = store.freezeResearchStudy(study.id, study.version)
      expect(freeze.snapshot.runtimeProvenance).toHaveLength(3)
      await consume(ctx, request())
      expect(store.listStudyFreezes(study.id)[0]!.snapshot.runtimeProvenance).toHaveLength(3)
      const exported = await new ReportService(store).generate(project, study.id)
      const manifest = JSON.parse(await readFile(fileURLToPath(exported.manifest.uri), 'utf8'))
      expect(manifest.version).toBe(2)
      expect(manifest.runtimeProvenance).toHaveLength(6)
      expect(manifest.runtimeProvenance[1].details.systemSha256).toMatch(/^[a-f0-9]{64}$/u)
    } finally { await ctx.fiber.dispose(); store.close(); await rm(root, { recursive: true, force: true }) }
  })
})
