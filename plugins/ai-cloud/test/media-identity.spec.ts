import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import type { AiCloudAccountSnapshot } from '@zerowallscience/plugin-account/types'
import { apply } from '../src/host/index.js'

it('pauses original media without another account network call and revokes local ownership on logout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'media-identity-'))
  const ctx = new Context()
  vi.stubEnv('DSH_HOME', root)
  try {
    await ctx.plugin(LlmRuntime)
    const signedIn = { status: 'signedIn', email: 'fixture@example.test', gatewayBaseUrl: 'https://hkcode.aicodeme.xyz', models: [], balanceFreshness: 'current', lowBalance: false }
    const current = vi.fn(async () => signedIn)
    ctx.provide('zerowallAccount', { current } as never)
    apply(ctx)
    const scope = { sessionId: 'fixture-session', cwd: root, projectId: 'fixture-project' }
    const task = { requestId: 'original-request-0001', taskId: 'mt_original', selection: { groupId: '99', modelId: 'original', profileId: 'profile', operation: 'video' }, status: 'completed', artifacts: [] }
    ctx.zerowallMedia.list = vi.fn(async () => [task] as any)
    ctx.zerowallMedia.query = vi.fn(() => new Promise(() => {}))
    const job = await ctx.zerowallMediaJobs.recover(scope, task.requestId)
    current.mockImplementation(() => new Promise(() => {}))
    const paused = await ctx.zerowallMediaJobs.pause(scope, job.id)
    expect(paused).toMatchObject({ requestId: task.requestId, taskId: task.taskId, collection: 'paused', state: 'completed' })
    expect(current).toHaveBeenCalledOnce()
    ctx.emit('zerowall/account-updated', { status: 'signedOut', models: [], balanceFreshness: 'current', lowBalance: false })
    await expect(ctx.zerowallMediaJobs.pause(scope, job.id)).rejects.toThrow('MEDIA_SIGN_IN_REQUIRED')
    expect(current).toHaveBeenCalledOnce()
  } finally {
    await ctx.fiber.dispose()
    vi.unstubAllEnvs()
    await rm(root, { recursive: true, force: true })
  }
})

it.each(['logout', 'account-change', 'gateway-change'] as const)('keeps a newer %s publication when the bootstrap account response arrives late', async transition => {
  const root = await mkdtemp(join(tmpdir(), 'media-identity-race-'))
  const ctx = new Context()
  vi.stubEnv('DSH_HOME', root)
  try {
    await ctx.plugin(LlmRuntime)
    const stale: AiCloudAccountSnapshot = {
      status: 'signedIn', email: 'old@example.test', gatewayBaseUrl: 'https://hkcode.aicodeme.xyz', balanceFreshness: 'current', lowBalance: false,
      models: [{ providerId: 'zerowall-ai-cloud-99', groupId: '99', groupName: 'Old', modelId: 'fixture-old', baseUrl: 'https://hkcode.aicodeme.xyz/v1' }],
    }
    const published: AiCloudAccountSnapshot = transition === 'logout'
      ? { status: 'signedOut', models: [], balanceFreshness: 'current', lowBalance: false }
      : {
        ...stale,
        email: transition === 'account-change' ? 'new@example.test' : stale.email!,
        gatewayBaseUrl: transition === 'gateway-change' ? 'https://code.aicodeme.xyz' : stale.gatewayBaseUrl!,
        models: [{ providerId: 'zerowall-ai-cloud-100', groupId: '100', groupName: 'New', modelId: 'fixture-new', baseUrl: 'https://code.aicodeme.xyz/v1' }],
      }
    let resolveBootstrap!: (snapshot: AiCloudAccountSnapshot) => void
    const bootstrap = new Promise<AiCloudAccountSnapshot>(resolve => { resolveBootstrap = resolve })
    const current = vi.fn(() => bootstrap)
    ctx.provide('zerowallAccount', { current } as never)
    apply(ctx)
    await ctx.parallel('zerowall/account-updated', published)
    const scope = { sessionId: 'fixture-session', cwd: root, projectId: 'fixture-project' }
    const job = transition === 'logout' ? undefined : await ctx.zerowallMediaJobs.prepare(scope, { kind: 'video', prompt: 'fixture draft' })
    resolveBootstrap(stale)
    await bootstrap
    await Promise.resolve()
    expect(ctx.llm.listProviders().map(provider => provider.id)).toEqual(transition === 'logout' ? [] : ['zerowall-ai-cloud-100'])
    if (job) {
      expect(await ctx.zerowallMediaJobs.list(scope)).toHaveLength(1)
      expect((await ctx.zerowallMediaJobs.pause(scope, job.id)).collection).toBe('paused')
    } else {
      await expect(ctx.zerowallMediaJobs.prepare(scope, { kind: 'video', prompt: 'fixture draft' })).rejects.toThrow('MEDIA_SIGN_IN_REQUIRED')
    }
    expect(current).toHaveBeenCalledOnce()
  } finally {
    await ctx.fiber.dispose()
    vi.unstubAllEnvs()
    await rm(root, { recursive: true, force: true })
  }
})
