import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createSystemMessage, createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ResearchStore } from '../../research-store/src/index.js'
import { installResearchRuntimeProvenance, observedModelUsage, runtimePolicyFingerprint } from '../src/host/runtime-provenance.js'
import { SCIENCE_SYSTEM_PROMPT_VERSION } from '../../base/src/host/index.js'

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
    // coreVersion tracks SCIENCE_SYSTEM_PROMPT_VERSION, the constant the Host
    // actually reports; the literal pin has to move with it or a prompt bump
    // reads as a provenance regression instead of a rename.
    expect(first).toMatchObject({ coreVersion: SCIENCE_SYSTEM_PROMPT_VERSION, skillContextCount: 1 })
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

  it('records full ordered Skill hashes and usage against the active workspace', async () => {
    const ctx = new Context(), store = new ResearchStore(':memory:')
    try {
      const a = store.createProject({ name: 'runtime-a', rootPath: 'C:/runtime-a' })
      const b = store.createProject({ name: 'runtime-b', rootPath: 'C:/runtime-b' })
      installResearchRuntimeProvenance(ctx, store, session => session === 'a' ? a : session === 'b' ? b : undefined)
      const options = request()
      options.messages.push(...Array.from({ length: 23 }, () => request().messages[1]!))
      await consume(ctx, options)
      await consume(ctx, request('b'))
      await consume(ctx, request('no-workspace'))
      const events = store.listAuditEvents(a.id).filter(event => event.action.startsWith('research-runtime.'))
      expect(events.filter(event => event.action === 'research-runtime.skill-context')).toHaveLength(24)
      expect(events.find(event => event.action === 'research-runtime.request')?.details.skillContextCount).toBe(24)
      expect(events.filter(event => event.action === 'research-runtime.outcome').at(-1)?.details).toMatchObject({ status: 'completed', totalUnits: 16, complete: true })
      expect(events.every(event => event.projectId === a.id && event.details.workspaceId === a.id)).toBe(true)
      expect(store.listAuditEvents(b.id).filter(event => event.action.startsWith('research-runtime.'))).toHaveLength(3)
      expect(store.exportResearchSnapshot(a.id).auditEvents.some(event => event.action === 'research-runtime.request')).toBe(true)
      expect(JSON.stringify(events)).not.toContain('private instructions')
    } finally { await ctx.fiber.dispose(); store.close() }
  })

  it('pins a request to its starting workspace and preserves failures and absent terminal usage', async () => {
    const ctx = new Context(), store = new ResearchStore(':memory:')
    try {
      const a = store.createProject({ name: 'runtime-a', rootPath: 'C:/runtime-a' })
      const b = store.createProject({ name: 'runtime-b', rootPath: 'C:/runtime-b' })
      let active = a
      installResearchRuntimeProvenance(ctx, store, () => active)
      const run = async () => {
        for await (const _ of ctx.waterfall(ctx as never, 'llm/stream', request(), async function* () {
          active = b
          throw new Error('upstream credential=do-not-store')
        })) { /* rejected upstream */ }
      }
      await expect(run()).rejects.toThrow('upstream')
      expect(store.listAuditEvents(b.id).filter(event => event.action.startsWith('research-runtime.'))).toEqual([])
      const events = store.listAuditEvents(a.id).filter(event => event.action.startsWith('research-runtime.'))
      expect(events.find(event => event.action === 'research-runtime.outcome')?.details).toMatchObject({ status: 'failed', totalUnits: null, complete: false })
      expect(JSON.stringify(events)).not.toContain('do-not-store')
      active = a
      await consume(ctx, request(), [])
      expect(store.listAuditEvents(a.id).some(event => event.action === 'research-runtime.outcome' && event.details.status === 'incomplete-stream')).toBe(true)
    } finally { await ctx.fiber.dispose(); store.close() }
  })
})
