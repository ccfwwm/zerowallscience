import { describe, expect, it, vi } from 'vitest'
import { AiCloudClient, type AccountSecretStore } from '../src/host/index.js'

class MemorySecrets implements AccountSecretStore {
  readonly values = new Map<string, string>()
  async get(key: string): Promise<string | undefined> { return this.values.get(key) }
  async set(key: string, value: string): Promise<void> { this.values.set(key, value) }
  async delete(key: string): Promise<void> { this.values.delete(key) }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

describe('AI Cloud account client', () => {
  it('discovers groups when the gateway returns an array in data', async () => {
    const secrets = new MemorySecrets()
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/auth/login')) return json({ data: { access_token: 'session-token' } })
      if (url.endsWith('/auth/me')) return json({ data: { balance: 12.5, currency: 'CNY' } })
      if (url.endsWith('/groups/available')) return json({ code: 0, data: [{ id: 3, name: 'research', status: 'active' }] })
      if (url.includes('/keys?')) return json({ code: 0, data: { items: [{ group_id: 3, key: 'group-key', status: 'active' }] } })
      if (url.endsWith('/v1/models')) return json({ data: [{ id: 'science-model' }] })
      throw new Error(`Unexpected request: ${url} ${init?.method ?? 'GET'}`)
    })
    const client = new AiCloudClient({ secrets, fetch: fetcher, bases: ['https://code.aicodeme.xyz'] })

    const account = await client.login({ email: 'research@example.com', password: 'not-a-real-password' })

    expect(account.models).toEqual([expect.objectContaining({ groupId: '3', modelId: 'science-model' })])
    expect(await secrets.get('zerowall.ai-cloud.group.3')).toBe('group-key')
  })

  it('keeps the Anthropic route at the gateway root because the SDK appends /v1/messages', async () => {
    const secrets = new MemorySecrets()
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.endsWith('/auth/login')) return json({ data: { access_token: 'session-token' } })
      if (url.endsWith('/auth/me')) return json({ data: { balance: 1, currency: 'CNY' } })
      if (url.endsWith('/groups/available')) return json({ data: [{ id: 4, name: 'Claude', enabled: true }] })
      if (url.includes('/keys?')) return json({ data: { items: [{ group_id: 4, key: 'group-key' }] } })
      if (url.endsWith('/v1/models')) return json({ data: [{ id: 'claude-sonnet-4' }, { id: 'gpt-5.6-sol' }] })
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new AiCloudClient({ secrets, fetch: fetcher, bases: ['https://hkcode.aicodeme.xyz'] })
    const account = await client.login({ email: 'claude@example.com', password: 'test-password' })
    expect(account.models).toEqual([
      { providerId: 'zerowall-ai-cloud-4-messages', groupId: '4', groupName: 'Claude', modelId: 'claude-sonnet-4', baseUrl: 'https://hkcode.aicodeme.xyz' },
      { providerId: 'zerowall-ai-cloud-4-responses', groupId: '4', groupName: 'Claude', modelId: 'gpt-5.6-sol', baseUrl: 'https://hkcode.aicodeme.xyz/v1' },
    ])
  })

  it('keeps tokens in the secret broker and returns only managed model metadata', async () => {
    const secrets = new MemorySecrets()
    const calls: Array<{ url: string; authorization?: string; body?: string }> = []
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      const headers = new Headers(init?.headers)
      calls.push({ url, ...(headers.get('authorization') === null ? {} : { authorization: headers.get('authorization')! }), ...(typeof init?.body === 'string' ? { body: init.body } : {}) })
      if (url.endsWith('/api/v1/auth/login')) return json({ data: { access_token: 'session-token' } })
      if (url.endsWith('/api/v1/auth/me')) return json({ data: { user: { balance: '18.5', currency: 'CNY' } } })
      if (url.endsWith('/api/v1/groups/available')) return json({ data: { items: [{ id: 2, name: 'Research models', enabled: true }] } })
      if (url.includes('/api/v1/keys?page=')) return json({ data: { items: [] } })
      if (url.endsWith('/api/v1/keys')) return json({ data: { key: 'group-api-key' } })
      if (url.endsWith('/v1/models')) return json({ data: [{ id: 'deepseek-v4-flash' }, { id: 'kimi-k3' }] })
      throw new Error(`unexpected request ${url}`)
    }
    const client = new AiCloudClient({ secrets, fetch: fetcher, bases: ['https://code.aicodeme.xyz'] })
    const signedIn = await client.login({ email: 'researcher@example.com', password: 'test-password' })
    expect(signedIn).toEqual(expect.objectContaining({ status: 'signedIn', email: 'researcher@example.com', balance: 18.5 }))
    expect(JSON.stringify(signedIn)).not.toContain('session-token')
    expect(secrets.values.get('zerowall.ai-cloud.session')).toContain('session-token')
    expect(secrets.values.get('zerowall.ai-cloud.login')).toContain('test-password')

    const discovered = await client.discoverModels()
    expect(discovered.models).toEqual([
      { providerId: 'zerowall-ai-cloud-2-completions', groupId: '2', groupName: 'Research models', modelId: 'deepseek-v4-flash', baseUrl: 'https://code.aicodeme.xyz/v1' },
      { providerId: 'zerowall-ai-cloud-2-completions', groupId: '2', groupName: 'Research models', modelId: 'kimi-k3', baseUrl: 'https://code.aicodeme.xyz/v1' },
    ])
    expect(JSON.stringify(discovered)).not.toContain('group-api-key')
    expect(secrets.values.get('zerowall.ai-cloud.group.2')).toBe('group-api-key')
    expect(calls.find((call) => call.url.endsWith('/v1/models'))?.authorization).toBe('Bearer group-api-key')

    await client.logout()
    expect(secrets.values.size).toBe(0)
  })

  it('restores a saved login on startup and automatically discovers models', async () => {
    const secrets = new MemorySecrets()
    secrets.values.set('zerowall.ai-cloud.login', JSON.stringify({
      baseUrl: 'https://code.aicodeme.xyz', email: 'saved@example.com', password: 'saved-password',
    }))
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/auth/login')) {
        expect(init?.body).toBe(JSON.stringify({ email: 'saved@example.com', password: 'saved-password' }))
        return json({ data: { access_token: 'restored-token' } })
      }
      if (url.endsWith('/auth/me')) return json({ data: { balance: 9, currency: 'CNY' } })
      if (url.endsWith('/groups/available')) return json({ data: [{ id: 7, name: 'DeepSeek', enabled: true }] })
      if (url.includes('/keys?')) return json({ data: { items: [{ group_id: 7, key: 'saved-group-key' }] } })
      if (url.endsWith('/v1/models')) return json({ data: [{ id: 'deepseek-chat' }] })
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new AiCloudClient({ secrets, fetch: fetcher, bases: ['https://code.aicodeme.xyz'] })

    await expect(client.current()).resolves.toEqual(expect.objectContaining({
      status: 'signedIn', email: 'saved@example.com', models: [expect.objectContaining({ modelId: 'deepseek-chat' })],
    }))
    expect(secrets.values.get('zerowall.ai-cloud.session')).toContain('restored-token')
    expect(secrets.values.get('zerowall.ai-cloud.group.7')).toBe('saved-group-key')
  })

  it('restores an existing account through its saved gateway before the new default', async () => {
    const secrets = new MemorySecrets()
    secrets.values.set('zerowall.ai-cloud.login', JSON.stringify({
      baseUrl: 'https://code.aicodeme.xyz', email: 'saved@example.com', password: 'saved-password',
    }))
    const calls: string[] = []
    const fetcher: typeof fetch = async (input) => {
      const url = String(input)
      calls.push(url)
      if (!url.startsWith('https://code.aicodeme.xyz/')) throw new Error(`unexpected gateway ${url}`)
      if (url.endsWith('/auth/login')) return json({ data: { access_token: 'restored-token' } })
      if (url.endsWith('/auth/me')) return json({ data: { balance: 9 } })
      if (url.endsWith('/groups/available')) return json({ data: [] })
      if (url.includes('/keys?')) return json({ data: { items: [] } })
      throw new Error(`Unexpected request: ${url}`)
    }
    const client = new AiCloudClient({
      secrets, fetch: fetcher,
      bases: ['https://hkcode.aicodeme.xyz', 'https://code.aicodeme.xyz', 'https://code.aicodeme.cn'],
    })

    await expect(client.current()).resolves.toEqual(expect.objectContaining({
      status: 'signedIn', gatewayBaseUrl: 'https://code.aicodeme.xyz',
    }))
    expect(calls[0]).toBe('https://code.aicodeme.xyz/api/v1/auth/login')
  })

  it('keeps the managed group key when switching regional gateways for one account', async () => {
    const secrets = new MemorySecrets()
    secrets.values.set('zerowall.ai-cloud.login', JSON.stringify({
      baseUrl: 'https://code.aicodeme.xyz', email: 'saved@example.com', password: 'saved-password',
    }))
    secrets.values.set('zerowall.ai-cloud.group.2', 'shared-group-key')
    const fetcher: typeof fetch = async (input) => {
      const url = String(input)
      if (!url.startsWith('https://hkcode.aicodeme.xyz/')) throw new Error(`unexpected gateway ${url}`)
      if (url.endsWith('/auth/login')) return json({ data: { access_token: 'new-token' } })
      if (url.endsWith('/auth/me')) return json({ data: { balance: 2 } })
      if (url.endsWith('/groups/available')) return json({ data: [{ id: 2, name: 'Research', enabled: true }] })
      if (url.includes('/keys?')) return json({ data: { items: [{ group_id: 2, key: 'shared-group-key' }] } })
      if (url.endsWith('/v1/models')) return json({ data: [{ id: 'gpt-5.6' }] })
      throw new Error(`Unexpected request: ${url}`)
    }
    const client = new AiCloudClient({
      secrets, fetch: fetcher,
      bases: ['https://hkcode.aicodeme.xyz', 'https://code.aicodeme.xyz'],
    })

    await expect(client.selectGateway('https://hkcode.aicodeme.xyz')).resolves.toEqual(expect.objectContaining({
      status: 'signedIn', gatewayBaseUrl: 'https://hkcode.aicodeme.xyz',
    }))
    expect(secrets.values.get('zerowall.ai-cloud.group.2')).toBe('shared-group-key')
    expect(secrets.values.get('zerowall.ai-cloud.preferred-base')).toBe('https://hkcode.aicodeme.xyz')
  })

  it('re-authenticates once after a restored session is rejected', async () => {
    const secrets = new MemorySecrets()
    secrets.values.set('zerowall.ai-cloud.session', JSON.stringify({
      baseUrl: 'https://code.aicodeme.xyz', email: 'saved@example.com', accessToken: 'expired',
      balance: 1, currency: 'CNY', models: [], groupIds: [],
    }))
    secrets.values.set('zerowall.ai-cloud.login', JSON.stringify({
      baseUrl: 'https://code.aicodeme.xyz', email: 'saved@example.com', password: 'saved-password',
    }))
    let meCalls = 0
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.endsWith('/auth/me')) return ++meCalls === 1 ? json({ message: 'expired' }, 401) : json({ data: { balance: 4 } })
      if (url.endsWith('/auth/login')) return json({ data: { access_token: 'renewed' } })
      if (url.endsWith('/groups/available')) return json({ data: [] })
      if (url.includes('/keys?')) return json({ data: { items: [] } })
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new AiCloudClient({ secrets, fetch: fetcher, bases: ['https://code.aicodeme.xyz'] })

    await expect(client.current()).resolves.toEqual(expect.objectContaining({ status: 'signedIn', email: 'saved@example.com' }))
    expect(fetcher.mock.calls.filter(([input]) => String(input).endsWith('/auth/login'))).toHaveLength(1)
    expect(secrets.values.get('zerowall.ai-cloud.session')).toContain('renewed')
  })

  it('removes an invalid saved password and requires an explicit login', async () => {
    const secrets = new MemorySecrets()
    secrets.values.set('zerowall.ai-cloud.login', JSON.stringify({
      baseUrl: 'https://code.aicodeme.xyz', email: 'saved@example.com', password: 'wrong-password',
    }))
    const client = new AiCloudClient({
      secrets, bases: ['https://code.aicodeme.xyz'], fetch: async () => json({ message: 'invalid credentials' }, 401),
    })

    await expect(client.current()).resolves.toEqual(expect.objectContaining({ status: 'authExpired' }))
    expect(secrets.values.has('zerowall.ai-cloud.login')).toBe(false)
  })

  it('keeps saved credentials when automatic login is temporarily offline', async () => {
    const secrets = new MemorySecrets()
    const saved = JSON.stringify({
      baseUrl: 'https://code.aicodeme.xyz', email: 'saved@example.com', password: 'saved-password',
    })
    secrets.values.set('zerowall.ai-cloud.login', saved)
    const client = new AiCloudClient({
      secrets, bases: ['https://code.aicodeme.xyz'], fetch: async () => { throw new Error('offline') },
    })

    await expect(client.current()).resolves.toEqual(expect.objectContaining({ status: 'signedOut' }))
    expect(secrets.values.get('zerowall.ai-cloud.login')).toBe(saved)
  })

  it('marks a rejected restored session expired and deletes it', async () => {
    const secrets = new MemorySecrets()
    secrets.values.set('zerowall.ai-cloud.session', JSON.stringify({
      baseUrl: 'https://code.aicodeme.xyz', email: 'expired@example.com', accessToken: 'expired',
      balance: 1, currency: 'CNY', models: [], groupIds: [],
    }))
    const client = new AiCloudClient({ secrets, bases: ['https://code.aicodeme.xyz'], fetch: async () => json({ message: 'expired' }, 401) })
    await expect(client.current()).resolves.toEqual(expect.objectContaining({ status: 'authExpired' }))
    expect(secrets.values.has('zerowall.ai-cloud.session')).toBe(false)
  })

  it('parses the live checkout methods and enforces the desktop minimum', async () => {
    const secrets = new MemorySecrets()
    secrets.values.set('zerowall.ai-cloud.session', JSON.stringify({
      baseUrl: 'https://code.aicodeme.xyz', email: 'saved@example.com', accessToken: 'session-token',
      balance: 1, currency: 'CNY', models: [], groupIds: [],
    }))
    const client = new AiCloudClient({
      secrets, bases: ['https://code.aicodeme.xyz'], fetch: async (input) => {
        expect(String(input)).toContain('/api/v1/payment/checkout-info')
        return json({ data: {
          methods: {
            alipay: { payment_type: 'alipay', single_min: 0 },
            wxpay: { payment_type: 'wxpay', single_min: 0 },
          },
          global_min: 0,
          balance_disabled: false,
        } })
      },
    })

    await expect(client.checkoutInfo()).resolves.toEqual({
      enabled: true, minimumAmount: 10, paymentTypes: ['alipay', 'wxpay'],
    })
  })

  it('accepts the live create-order envelope and nested order lists', async () => {
    const secrets = new MemorySecrets()
    secrets.values.set('zerowall.ai-cloud.session', JSON.stringify({
      baseUrl: 'https://code.aicodeme.xyz', email: 'saved@example.com', accessToken: 'session-token',
      balance: 1, currency: 'CNY', models: [], groupIds: [],
    }))
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.endsWith('/payment/orders')) return json({ data: {
        order_id: 950, amount: 10, pay_amount: 10, status: 'PENDING', payment_type: 'alipay',
        out_trade_no: 'sub2_test', qr_code: 'https://payment.example/qr/950',
      } })
      if (url.includes('/payment/orders/my')) return json({ data: { items: [{
        id: 950, pay_amount: 10, status: 'EXPIRED', payment_type: 'alipay', out_trade_no: 'sub2_test',
      }] } })
      throw new Error(`Unexpected request: ${url}`)
    })
    const client = new AiCloudClient({ secrets, fetch: fetcher, bases: ['https://code.aicodeme.xyz'] })

    await expect(client.createOrder({ amount: 10, paymentType: 'alipay' })).resolves.toEqual(expect.objectContaining({
      id: 950, amount: 10, status: 'PENDING', outTradeNo: 'sub2_test',
    }))
    await expect(client.listOrders()).resolves.toEqual([expect.objectContaining({ id: 950, amount: 10, status: 'EXPIRED' })])
  })

  it('drops unsafe payment URLs while preserving a valid order', async () => {
    const secrets = new MemorySecrets()
    secrets.values.set('zerowall.ai-cloud.session', JSON.stringify({
      baseUrl: 'https://code.aicodeme.xyz', email: 'saved@example.com', accessToken: 'session-token',
      balance: 1, currency: 'CNY', models: [], groupIds: [],
    }))
    const client = new AiCloudClient({
      secrets, bases: ['https://code.aicodeme.xyz'], fetch: async () => json({ data: {
        order: { id: 3, amount: 20, status: 'PENDING', payment_type: 'wxpay', payment_url: 'javascript:alert(1)' },
      } }),
    })

    await expect(client.getOrder({ orderId: 3 })).resolves.toEqual({
      id: 3, outTradeNo: '', status: 'PENDING', amount: 20, paymentType: 'wxpay',
    })
  })
})
