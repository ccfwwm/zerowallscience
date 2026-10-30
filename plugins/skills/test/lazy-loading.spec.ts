import { Context } from '@deepseek-ai/cordis'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import { apply as applyNativeSkill } from '../../../deepseek-harness/packages/skill/tool-skill/src/index.ts'
import { ZeroWallCapabilitiesService } from '../src/host/index.js'

it('replaces the real DSH catalog hook with a shortlist while preserving explicit Skill invocation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zws-lazy-skills-'))
  vi.stubEnv('ZEROWALL_USER_SKILLS', join(directory, 'enabled'))
  const ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const skills = Array.from({ length: 267 }, (_, i) => ({ name: i === 0 ? 'paper-review' : 'unrelated-' + i, description: i === 0 ? 'Literature review' : 'Unrelated '.repeat(90), source: 'bundled', provider: 'fixture', invocation: { modelInvocable: true, userInvocable: true } }))
    const get = vi.fn(async (name: string) => ({ ...skills.find(item => item.name === name)!, content: '# Exact instructions loaded on demand' }))
    ctx.provide('skills', { list: async () => skills, snapshot: async () => ({ complete: true, skills }), get } as any)
    ctx.provide('workingDirectory', { ensure: async () => directory } as any)
    new ZeroWallCapabilitiesService(ctx)
    applyNativeSkill(ctx)
    const agent = { session: Session.create(SessionId('lazy-skills')), ctx } as any
    const signal = new AbortController().signal
    const step = (text: string) => {
      const messages = [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] })]
      return ctx.waterfall('agent/pre-step', { agent, messages, signal, turn: 1, step: 1 }, async () => ({ kind: 'enter' as const, messages }))
    }
    const first = await step('literature review')
    expect(first.kind).toBe('enter')
    if (first.kind !== 'enter') throw Error('unexpected veto')
    expect(JSON.stringify(first.messages).length).toBeLessThan(4000)
    expect(first.messages.filter(message => message.source?.kind === 'skill-catalog')).toHaveLength(1)
    expect(get).not.toHaveBeenCalled()
    const browse = await ctx.tools.execute({ name: 'skill_search', arguments: {}, callId: ToolCallId('browse'), signal, agent })
    expect(browse.value).toMatchObject({ categories: expect.arrayContaining([expect.objectContaining({ id: 'literature' })]) })
    expect(get).not.toHaveBeenCalled()
    const explicit = await step('/paper-review')
    expect(get).toHaveBeenCalledWith('paper-review', expect.objectContaining({ scope: agent }))
    expect(JSON.stringify(explicit)).toContain('Exact instructions loaded on demand')
  } finally { await ctx.fiber.dispose(); vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }) }
})
