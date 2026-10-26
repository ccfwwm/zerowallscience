import { expect, it } from 'vitest'
import { AiCloudClient, type AccountSecretStore } from '../src/host/index.js'

// Diagnostic regressions: freeze product bytes while reproducing startup races
// with synthetic tokens only. These assertions describe the observed defect.
class MemorySecrets implements AccountSecretStore {
  readonly values = new Map<string, string>()
  async get(key: string) { return this.values.get(key) }
  async set(key: string, value: string) { this.values.set(key, value) }
  async delete(key: string) { this.values.delete(key) }
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status })
const base = 'https://code.aicodeme.xyz'
const model = { providerId: 'zerowall-ai-cloud-25-messages', groupId: '25', groupName: 'Claude', modelId: 'claude-opus-4-6', baseUrl: base }
const seed = () => {
  const secrets = new MemorySecrets()
  secrets.values.set('zerowall.ai-cloud.login', JSON.stringify({ baseUrl: base, email: 'local@example.invalid', password: 'local-only' }))
  return secrets
}

it('reproduces an expired-session restore joining discovery for the old token', async () => {
  const secrets = seed()
  secrets.values.set('zerowall.ai-cloud.session', JSON.stringify({ baseUrl: base, email: 'local@example.invalid', accessToken: 'old-fixture',
    balance: 1, currency: 'CNY', models: [model], groupIds: ['25'] }))
  let releaseModels!: (value: Response) => void
  let groups = 0
  const client = new AiCloudClient({ secrets, bases: [base], fetch: async (input, init) => {
    const url = String(input), authorization = (init?.headers as Record<string, string>)?.authorization
    if (url.endsWith('/auth/me')) return authorization === 'Bearer old-fixture' ? json({}, 401) : json({ balance: 2 })
    if (url.endsWith('/auth/login')) return json({ access_token: 'new-fixture' })
    if (url.endsWith('/groups/available')) { ++groups; return json([{ id: 25, name: 'Claude', enabled: true }]) }
    if (url.includes('/keys?')) return json({ items: [{ group_id: 25, key: 'local-only-key' }] })
    if (url.endsWith('/v1/models')) return new Promise<Response>(resolve => { releaseModels = resolve })
    throw new Error('Unexpected synthetic endpoint')
  } })
  const oldDiscovery = client.discoverModels()
  const oldRejected = expect(oldDiscovery).rejects.toThrow('ACCOUNT_STATE_CHANGED')
  await expect.poll(() => typeof releaseModels).toBe('function')
  const restored = client.current()
  await expect.poll(() => JSON.parse(secrets.values.get('zerowall.ai-cloud.session') ?? '{}').accessToken).toBe('new-fixture')
  releaseModels(json([{ id: model.modelId }]))
  await oldRejected
  await expect(restored).resolves.toMatchObject({ status: 'signedIn', models: [{ ...model, stale: true }], modelSync: { status: 'failed' } })
  expect(groups).toBe(1)
})

it('reproduces two startup clients overwriting a completed catalog after both restore a missing session', async () => {
  const secrets = seed()
  let loginA!: (value: Response) => void, loginB!: (value: Response) => void, modelsA!: (value: Response) => void
  const fetcher = (label: 'a' | 'b'): typeof fetch => async input => {
    const url = String(input)
    if (url.endsWith('/auth/login')) return new Promise<Response>(resolve => { if (label === 'a') loginA = resolve; else loginB = resolve })
    if (url.endsWith('/auth/me')) return json({ balance: 2 })
    if (url.endsWith('/groups/available')) return json([{ id: 25, name: 'Claude', enabled: true }])
    if (url.includes('/keys?')) return json({ items: [{ group_id: 25, key: 'local-only-key' }] })
    if (url.endsWith('/v1/models')) return label === 'a' ? new Promise<Response>(resolve => { modelsA = resolve }) : json([{ id: model.modelId }])
    throw new Error('Unexpected synthetic endpoint')
  }
  const a = new AiCloudClient({ secrets, bases: [base], fetch: fetcher('a') })
  const b = new AiCloudClient({ secrets, bases: [base], fetch: fetcher('b') })
  const first = a.current(), second = b.current()
  await expect.poll(() => typeof loginA === 'function' && typeof loginB === 'function').toBe(true)
  loginA(json({ access_token: 'a-fixture' }))
  await expect.poll(() => typeof modelsA).toBe('function')
  loginB(json({ access_token: 'b-fixture' }))
  await expect(second).resolves.toMatchObject({ status: 'signedIn', modelSync: { status: 'succeeded' } })
  modelsA(json([{ id: model.modelId }]))
  await expect(first).resolves.toMatchObject({ status: 'signedIn', models: [{ ...model, stale: true }], modelSync: { status: 'failed' } })
  const stored = JSON.parse(secrets.values.get('zerowall.ai-cloud.session')!)
  expect(stored.models).toMatchObject([{ modelId: model.modelId, stale: true }])
  expect(stored.modelSync.status).toBe('failed')
})
