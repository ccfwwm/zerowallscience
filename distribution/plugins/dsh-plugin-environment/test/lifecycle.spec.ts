import { Context, FiberState } from '@deepseek-ai/cordis'
import SessionProjectionRegistry from '../../../../packages/session/session-projection/src/index.ts'
import { SecretBrokerClient } from '@zerowall/dsh-plugin-ai-cloud/secrets'
import { afterEach, expect, it, vi } from 'vitest'
import z from '@deepseek-ai/schemastery'
import { apply, inject, EnvironmentSettingsSchema } from '../src/host/index.js'
import { fetchOfficialEnvironment } from '../src/host/official-config.js'

vi.mock('../src/host/official-config.js', () => ({ fetchOfficialEnvironment: vi.fn() }))

const environment = { ...process.env }
const contexts: Context[] = []
afterEach(async () => {
  try { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) }
  finally {
    vi.restoreAllMocks()
    for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key]
    Object.assign(process.env, environment)
  }
})

async function fixture() {
  const ctx = new Context()
  contexts.push(ctx)
  const vault = new Map<string, string>()
  vi.spyOn(SecretBrokerClient.prototype, 'get').mockImplementation(async key => vault.get(key))
  vi.spyOn(SecretBrokerClient.prototype, 'set').mockImplementation(async (key, value) => { vault.set(key, value) })
  vi.spyOn(SecretBrokerClient.prototype, 'delete').mockImplementation(async key => { vault.delete(key) })
  await ctx.plugin(SessionProjectionRegistry).await()
  ctx.provide('credentials', {} as never)
  const replace = vi.fn(async () => { throw new Error('Startup must not reconcile profile configuration') })
  ctx.provide('settings', { describe: () => [], replace } as never)
  ctx.provide('llm', {} as never)
  ctx.provide('tokenMeter', {} as never)
  ctx.provide('agents', {} as never)
  const start = async () => {
    const fiber = ctx.plugin({ name: 'environment-lifecycle', inject, apply }, { get: () => z.resolve({}, EnvironmentSettingsSchema)[0] })
    await fiber.await()
    const service = ctx.get('zerowallEnvironment')!
    return { fiber, service }
  }
  return { ctx, vault, replace, start }
}

it('recovers and syncs the variable list without a Loader configuration transaction', async () => {
  const { vault, replace, start } = await fixture()
  vault.set('zerowall.environment.meta', JSON.stringify({ version: 1, variables: { ZW_ENV_RECOVERED: { source: 'user' } } }))
  vault.set('zerowall.environment.var.zw_env_recovered', 'retained')
  vi.mocked(fetchOfficialEnvironment).mockResolvedValue({ version: 'startup', variables: { ZW_ENV_SYNCED: 'official' } })
  const { fiber, service } = await start()
  await service.ready()
  expect(await service.listVariables()).toEqual(expect.arrayContaining([
    { name: 'ZW_ENV_RECOVERED', configured: true, source: 'user' },
    { name: 'ZW_ENV_SYNCED', configured: true, source: 'official' },
  ]))
  expect(JSON.parse(vault.get('zerowall.environment.meta')!).retiredVariablesRemoved).toBe(true)
  expect(replace).not.toHaveBeenCalled()
  await fiber.dispose()
})

it('drains admitted secure recovery when unloading immediately after activation', async () => {
  const { ctx, vault, replace, start } = await fixture()
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const stopping = Promise.withResolvers<void>()
  vi.spyOn(SecretBrokerClient.prototype, 'get').mockImplementationOnce(async () => {
    entered.resolve()
    await release.promise
    return undefined
  })
  vi.mocked(fetchOfficialEnvironment).mockImplementation(async (_fetcher, signal) => {
    expect(signal?.aborted).toBe(true)
    throw new Error('Initialization cancelled by unload')
  })
  const { fiber, service } = await start()
  await entered.promise
  ctx.on('internal/status', current => {
    if (current === fiber.ctx.fiber && current.state !== FiberState.ACTIVE) stopping.resolve()
  })
  let settled = false
  const disposal = fiber.dispose().then(() => { settled = true })
  try {
    await stopping.promise
    expect(settled).toBe(false)
  } finally {
    release.resolve()
  }
  await disposal
  await service.ready()
  expect(service.syncStatus()).toMatchObject({ state: 'failed', failure: 'official-unavailable' })
  expect(JSON.parse(vault.get('zerowall.environment.meta')!).retiredVariablesRemoved).toBe(true)
  expect(replace).not.toHaveBeenCalled()
})

it('aborts an offline official request and awaits its settlement before unloading', async () => {
  const { start } = await fixture()
  const entered = Promise.withResolvers<void>()
  const aborted = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  vi.mocked(fetchOfficialEnvironment).mockImplementation(async (_fetcher, signal) => {
    signal!.addEventListener('abort', () => { aborted.resolve() }, { once: true })
    entered.resolve()
    await release.promise
    throw new Error('Request aborted')
  })
  const { fiber, service } = await start()
  await entered.promise
  let settled = false
  const disposal = fiber.dispose().then(() => { settled = true })
  try {
    await aborted.promise
    expect(settled).toBe(false)
  } finally {
    release.resolve()
  }
  await disposal
  await service.ready()
  expect(service.syncStatus()).toMatchObject({ state: 'failed', failure: 'official-unavailable' })
})
