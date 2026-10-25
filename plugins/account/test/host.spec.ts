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
  it('persists gateway descriptions and standard multipliers, including zero, and reads metadata without network or secret writes', async () => {
    const secrets = new MemorySecrets()
    secrets.values.set('zerowall.ai-cloud.session', JSON.stringify({ baseUrl: 'https://code.aicodeme.xyz', email: 'test@example.com', accessToken: 'fixture', balance: 1, currency: 'CNY', models: [], groupIds: [] }))
    const fetcher = vi.fn<typeof fetch>(async input => {
      const url = String(input)
      if (url.endsWith('/groups/available')) return json({ data: [
        { id: 1, name: 'Economy', description: 'Platform supplied\nDetails', rate_multiplier: 0 },
        { id: 2, name: 'Pro', rate_multiplier: '0.6', description: null },
        { id: 3, name: 'Unknown', rate_multiplier: null },
        { id: 4, name: 'Invalid', rate_multiplier: -2 },
      ] })
      if (url.includes('/keys?')) return json({ data: [1, 2, 3, 4].map(group_id => ({ group_id, key: `fixture-${group_id}` })) })
      if (url.endsWith('/v1/models')) return json({ data: [{ id: 'gpt-fixture' }] })
      throw new Error('Unexpected request')
    })
    const client = new AiCloudClient({ secrets, fetch: fetcher })
    const result = await client.discoverModels()
    expect(result.groups).toEqual([
      { groupId: '1', groupName: 'Economy', description: 'Platform supplied\nDetails', rateMultiplier: 0 },
      { groupId: '2', groupName: 'Pro', rateMultiplier: 0.6 },
      { groupId: '3', groupName: 'Unknown' }, { groupId: '4', groupName: 'Invalid' },
    ])
    const stored = [...secrets.values]
    fetcher.mockClear()
    const catalog = await client.groupCatalog()
    expect(catalog.groups).toEqual(result.groups)
    expect(catalog.routes[0]).toEqual({ providerId: 'zerowall-ai-cloud-1-responses', groupId: '1', modelId: 'gpt-fixture' })
    expect(JSON.stringify(catalog)).not.toContain('fixture-1')
    expect(fetcher).not.toHaveBeenCalled()
    expect([...secrets.values]).toEqual(stored)
    await client.logout()
    await expect(client.groupCatalog()).resolves.toEqual({ groups: [], routes: [] })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('reads legacy group names without login restoration, discovery, or a made-up multiplier', async () => {
    const secrets = new MemorySecrets()
    secrets.values.set('zerowall.ai-cloud.session', JSON.stringify({ baseUrl: 'https://code.aicodeme.xyz', email: 'test@example.com', accessToken: 'fixture', models: [{ providerId: 'legacy', groupId: '7', groupName: 'Legacy', modelId: 'gpt-fixture' }], groupIds: ['7'] }))
    const fetcher = vi.fn<typeof fetch>()
    const client = new AiCloudClient({ secrets, fetch: fetcher })
    await expect(client.groupCatalog()).resolves.toMatchObject({ groups: [{ groupId: '7', groupName: 'Legacy' }] })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('coalesces model sync, reports partial failure with retained stale models and rejects a late response after logout', async () => {
    const secrets = new MemorySecrets()
    const previous = { providerId: 'zerowall-ai-cloud-2-completions', groupId: '2', groupName: 'Old', modelId: 'deepseek-old', baseUrl: 'https://code.aicodeme.xyz/v1' }
    secrets.values.set('zerowall.ai-cloud.session', JSON.stringify({ baseUrl: 'https://code.aicodeme.xyz', email: 'test@example.com', accessToken: 'fixture', balance: 1, currency: 'CNY', models: [previous], groupIds: ['2'] }))
    let delayed: ((value: Response) => void) | undefined
    let block = false
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/groups/available')) return json({ data: [{ id: 1, name: 'New', enabled: true }, { id: 2, name: 'Old', enabled: true }] })
      if (url.includes('/keys?')) return json({ data: { items: [{ group_id: 1, key: 'one' }, { group_id: 2, key: 'two' }] } })
      if (url.endsWith('/v1/models')) {
        if (block) return new Promise<Response>(resolve => { delayed = resolve })
        if (new Headers(init?.headers).get('authorization')?.endsWith('two')) return json({ message: 'unavailable' }, 503)
        return json({ data: [{ id: 'gpt-6-fixture', context_window: 32000, max_output_tokens: 4000 }] })
      }
      throw new Error('Unexpected fixture endpoint')
    })
    const client = new AiCloudClient({ secrets, fetch: fetcher })
    const [a, b] = await Promise.all([client.discoverModels(), client.discoverModels()])
    expect(a).toEqual(b)
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/groups/available'))).toHaveLength(1)
    expect(a.modelSync).toMatchObject({ status: 'partial', groups: [{ status: 'succeeded', count: 1 }, { status: 'failed', count: 1, error: 'HTTP 503' }] })
    expect(a.models.find(model => model.groupId === '2')).toMatchObject({ ...previous, stale: true })
    expect(a.models.find(model => model.groupId === '1')).toMatchObject({ contextWindow: 32000, maxOutputTokens: 4000, capacitySource: 'gateway' })
    block = true
    const late = client.discoverModels(); const rejected = expect(late).rejects.toThrow('ACCOUNT_STATE_CHANGED')
    await expect.poll(() => !!delayed).toBe(true)
    await client.logout(); delayed!(json({ data: [{ id: 'late' }] }))
    await rejected
    expect(secrets.values.has('zerowall.ai-cloud.session')).toBe(false)
  })
  it('uses the same normalized email, gateway and exact password for verification and registration', async () => {
    const secrets = new MemorySecrets()
    let issuedEmail = ''
    let issuedGateway = ''
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input))
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
      if (url.pathname.endsWith('/settings/public')) return json({ data: { registration_enabled: true, email_verify_enabled: true } })
      if (url.pathname.endsWith('/auth/send-verify-code')) {
        issuedEmail = body.email
        issuedGateway = url.origin
        return json({ data: { countdown: 45 } })
      }
      if (url.pathname.endsWith('/auth/register')) {
        expect(url.origin).toBe(issuedGateway)
        expect(body).toEqual({ email: issuedEmail, password: ' password with spaces ', verify_code: '012345' })
        return json({ data: { access_token: 'test-token' } })
      }
      if (url.pathname.endsWith('/auth/me')) return json({ data: { balance: 1 } })
      throw new Error('No model catalog in this fixture')
    })
    const client = new AiCloudClient({ secrets, fetch: fetcher, bases: ['https://hkcode.aicodeme.xyz', 'https://code.aicodeme.xyz'] })
    const sent = await client.sendCode({ email: ' User@Example.COM ', gatewayBaseUrl: 'https://code.aicodeme.xyz' })
    expect(sent.countdown).toBe(45)
    const account = await client.register({ email: 'USER@example.com', password: ' password with spaces ', verificationCode: '012345', gatewayBaseUrl: sent.gatewayBaseUrl })
    expect(account).toMatchObject({ status: 'signedIn', email: 'user@example.com', gatewayBaseUrl: sent.gatewayBaseUrl })
  })

  it('does not fail over or change credentials after reset email failure', async () => {
    const secrets = new MemorySecrets()
    secrets.values.set('existing', 'preserved')
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('fetch failed'))
    const client = new AiCloudClient({ secrets, fetch: fetcher, bases: ['https://hkcode.aicodeme.xyz', 'https://code.aicodeme.xyz'] })
    await expect(client.forgotPassword({ email: 'user@example.com', gatewayBaseUrl: 'https://code.aicodeme.xyz' })).rejects.toThrow('fetch failed')
    expect(fetcher).toHaveBeenCalledOnce()
    expect([...secrets.values]).toEqual([['existing', 'preserved']])
    await expect(client.forgotPassword({ email: 'user@example.com', gatewayBaseUrl: 'https://untrusted.example' })).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it.each(['turnstile_enabled', 'tencent_captcha_enabled', 'aliyun_captcha_enabled'])('honors the Sub2API captcha flag %s', async (flag) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ data: { registration_enabled: true, email_verify_enabled: true, password_reset_enabled: true, [flag]: true } }))
    const client = new AiCloudClient({ secrets: new MemorySecrets(), fetch: fetcher })
    await expect(client.publicConfig()).resolves.toMatchObject({ captchaEnabled: true, passwordResetEnabled: true })
    fetcher.mockResolvedValue(json({ data: { registration_enabled: true, email_verify_enabled: true, [flag]: true } }))
    await expect(client.register({ email: 'user@example.com', password: 'password', verificationCode: '012345' })).rejects.toThrow('native registration is not available')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('normalizes the email and keeps verification requests on the selected gateway', async () => {
    const secrets = new MemorySecrets()
    const calls: Array<{ url: string; body?: string }> = []
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), body: typeof init?.body === 'string' ? init.body : undefined })
      if (String(input).endsWith('/auth/send-verify-code')) return json({ data: { countdown: 60 } })
      if (String(input).endsWith('/auth/forgot-password')) return json({ data: { message: 'sent' } })
      throw new Error(`Unexpected request: ${String(input)}`)
    }
    const client = new AiCloudClient({ secrets, fetch: fetcher, bases: ['https://hkcode.aicodeme.xyz', 'https://code.aicodeme.xyz'] })

    await expect(client.sendCode({ email: ' User@Example.COM ', gatewayBaseUrl: 'https://code.aicodeme.xyz' })).resolves.toEqual({ countdown: 60, gatewayBaseUrl: 'https://code.aicodeme.xyz' })
    await expect(client.forgotPassword({ email: ' User@Example.COM ', gatewayBaseUrl: 'https://code.aicodeme.xyz' })).resolves.toBeUndefined()
    expect(calls).toEqual([
      expect.objectContaining({ url: 'https://code.aicodeme.xyz/api/v1/auth/send-verify-code', body: JSON.stringify({ email: 'user@example.com' }) }),
      expect.objectContaining({ url: 'https://code.aicodeme.xyz/api/v1/auth/forgot-password', body: JSON.stringify({ email: 'user@example.com' }) }),
    ])
  })

  it('does not replay a one-time registration code through another gateway', async () => {
    const secrets = new MemorySecrets()
    const calls: string[] = []
    const fetcher: typeof fetch = async (input) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('/settings/public')) return json({ data: { registration_enabled: true, email_verify_enabled: true, invitation_code_enabled: false, turnstile_enabled: false } })
      if (url.endsWith('/auth/register')) return json({ message: 'invalid or expired verification code' }, 400)
      throw new Error(`Unexpected request: ${url}`)
    }
    const client = new AiCloudClient({ secrets, fetch: fetcher, bases: ['https://hkcode.aicodeme.xyz', 'https://code.aicodeme.xyz'] })
    await expect(client.register({ email: 'user@example.com', password: 'secret-123', verificationCode: '123456', gatewayBaseUrl: 'https://code.aicodeme.xyz' })).rejects.toThrow(/invalid or expired/)
    expect(calls.filter(url => url.endsWith('/auth/register'))).toEqual(['https://code.aicodeme.xyz/api/v1/auth/register'])
  })
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
    expect(secrets.values.has('zerowall.ai-cloud.session')).toBe(false)
    expect(secrets.values.get('zerowall.ai-cloud.login')).toContain('test-password')
    await expect(client.current()).resolves.toEqual(expect.objectContaining({ status: 'signedOut' }))
  })

  it('removes saved credentials when rememberPassword is disabled', async () => {
    const secrets = new MemorySecrets()
    const fetcher: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('/auth/login')) return json({ data: { access_token: 'session-token' } })
      if (url.endsWith('/auth/me')) return json({ data: { balance: 1 } })
      throw new Error(`unexpected request ${url}`)
    }
    const client = new AiCloudClient({ secrets, fetch: fetcher, bases: ['https://code.aicodeme.xyz'] })
    await client.login({ email: 'no-save@example.com', password: 'password', rememberPassword: false })
    expect(secrets.values.has('zerowall.ai-cloud.login')).toBe(false)
  })

  it('keeps last-known models for one timed-out group while refreshing the remaining catalog', async () => {
    const secrets = new MemorySecrets()
    let refresh = false
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      const authorization = new Headers(init?.headers).get('authorization')
      if (url.endsWith('/auth/login')) return json({ data: { access_token: 'session-token' } })
      if (url.endsWith('/auth/me')) return json({ data: { balance: 1, currency: 'CNY' } })
      if (url.endsWith('/groups/available')) return json({ data: [
        { id: 1, name: 'Fast', enabled: true }, { id: 2, name: 'Slow', enabled: true },
      ] })
      if (url.includes('/keys?')) return json({ data: { items: [
        { group_id: 1, key: 'group-one' }, { group_id: 2, key: 'group-two' },
      ] } })
      if (url.endsWith('/v1/models') && authorization === 'Bearer group-one') {
        return json({ data: [{ id: refresh ? 'fresh-model' : 'first-model' }] })
      }
      if (url.endsWith('/v1/models') && authorization === 'Bearer group-two') {
        if (refresh) throw new Error('signal timed out')
        return json({ data: [{ id: 'retained-model' }] })
      }
      throw new Error(`unexpected request ${url}`)
    }
    const client = new AiCloudClient({ secrets, fetch: fetcher, bases: ['https://code.aicodeme.xyz'] })

    await expect(client.login({ email: 'researcher@example.com', password: 'test-password' })).resolves.toMatchObject({
      models: [
        expect.objectContaining({ groupId: '1', modelId: 'first-model' }),
        expect.objectContaining({ groupId: '2', modelId: 'retained-model' }),
      ],
    })
    refresh = true

    await expect(client.discoverModels()).resolves.toMatchObject({
      models: [
        expect.objectContaining({ groupId: '1', modelId: 'fresh-model' }),
        expect.objectContaining({ groupId: '2', modelId: 'retained-model' }),
      ],
    })
    expect(await secrets.get('zerowall.ai-cloud.group.2')).toBe('group-two')
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

  it('coalesces concurrent current calls while restoring a saved login', async () => {
    const secrets = new MemorySecrets()
    secrets.values.set('zerowall.ai-cloud.login', JSON.stringify({
      baseUrl: 'https://code.aicodeme.xyz', email: 'local-fixture@example.invalid', password: 'local-only-fixture',
    }))
    let finishLogin: ((response: Response) => void) | undefined
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.endsWith('/auth/login')) return new Promise<Response>(resolve => { finishLogin = resolve })
      if (url.endsWith('/auth/me')) return json({ data: { balance: 9, currency: 'CNY' } })
      if (url.endsWith('/groups/available')) return json({ data: [] })
      if (url.includes('/keys?')) return json({ data: { items: [] } })
      throw new Error(`Unexpected fixture endpoint: ${url}`)
    })
    const client = new AiCloudClient({ secrets, fetch: fetcher, bases: ['https://code.aicodeme.xyz'] })

    const first = client.current()
    await expect.poll(() => finishLogin !== undefined).toBe(true)
    const second = client.current()
    expect(fetcher.mock.calls.filter(([input]) => String(input).endsWith('/auth/login'))).toHaveLength(1)

    finishLogin!(json({ data: { access_token: 'local-only-session-fixture' } }))
    const [a, b] = await Promise.all([first, second])
    expect(a).toEqual(b)
    expect(a).toMatchObject({ status: 'signedIn', email: 'local-fixture@example.invalid' })
    expect(fetcher.mock.calls.filter(([input]) => String(input).endsWith('/groups/available'))).toHaveLength(1)
    expect(fetcher.mock.calls.filter(([input]) => String(input).includes('/keys?'))).toHaveLength(1)
  })

  it('does not restore a saved login after logout invalidates an in-flight current call', async () => {
    const secrets = new MemorySecrets()
    secrets.values.set('zerowall.ai-cloud.login', JSON.stringify({
      baseUrl: 'https://code.aicodeme.xyz', email: 'local-fixture@example.invalid', password: 'local-only-fixture',
    }))
    let finishLogin: ((response: Response) => void) | undefined
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith('/auth/login')) return new Promise<Response>(resolve => { finishLogin = resolve })
      throw new Error(`Unexpected fixture endpoint: ${String(input)}`)
    })
    const client = new AiCloudClient({ secrets, fetch: fetcher, bases: ['https://code.aicodeme.xyz'] })

    const current = client.current()
    await expect.poll(() => finishLogin !== undefined).toBe(true)
    await client.logout()
    finishLogin!(json({ data: { access_token: 'local-only-session-fixture' } }))

    await expect(current).rejects.toThrow('ACCOUNT_STATE_CHANGED')
    expect(secrets.values.has('zerowall.ai-cloud.session')).toBe(false)
    expect(secrets.values.get('zerowall.ai-cloud.manual-signout')).toBe('1')
    expect(fetcher.mock.calls.filter(([input]) => String(input).endsWith('/auth/login'))).toHaveLength(1)
  })

  it('does not let an older automatic restore overwrite a newer explicit login', async () => {
    const secrets = new MemorySecrets()
    secrets.values.set('zerowall.ai-cloud.login', JSON.stringify({
      baseUrl: 'https://code.aicodeme.xyz', email: 'restore-fixture@example.invalid', password: 'restore-fixture',
    }))
    let finishRestore: ((response: Response) => void) | undefined
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as { email?: string } : undefined
      if (url.endsWith('/auth/login') && body?.email === 'restore-fixture@example.invalid') {
        return new Promise<Response>(resolve => { finishRestore = resolve })
      }
      if (url.endsWith('/auth/login') && body?.email === 'manual-fixture@example.invalid') {
        return json({ data: { access_token: 'manual-session-fixture' } })
      }
      if (url.endsWith('/auth/me')) return json({ data: { balance: 3 } })
      if (url.endsWith('/groups/available')) return json({ data: [] })
      if (url.includes('/keys?')) return json({ data: { items: [] } })
      throw new Error(`Unexpected fixture endpoint: ${url}`)
    })
    const client = new AiCloudClient({ secrets, fetch: fetcher, bases: ['https://code.aicodeme.xyz'] })

    const restore = client.current()
    await expect.poll(() => finishRestore !== undefined).toBe(true)
    const explicitLogin = client.login({ email: 'manual-fixture@example.invalid', password: 'manual-fixture' })
    await expect(explicitLogin).resolves.toMatchObject({ status: 'signedIn', email: 'manual-fixture@example.invalid' })
    finishRestore!(json({ data: { access_token: 'restore-session-fixture' } }))

    await expect(restore).rejects.toThrow('ACCOUNT_STATE_CHANGED')
    await expect(client.current()).resolves.toMatchObject({ status: 'signedIn', email: 'manual-fixture@example.invalid' })
    const stored = JSON.parse(secrets.values.get('zerowall.ai-cloud.session')!) as { email: string; accessToken: string }
    expect(stored).toMatchObject({ email: 'manual-fixture@example.invalid', accessToken: 'manual-session-fixture' })
  })

  it('waits for an explicit login before current reads a missing session', async () => {
    const secrets = new MemorySecrets()
    secrets.values.set('zerowall.ai-cloud.login', JSON.stringify({
      baseUrl: 'https://code.aicodeme.xyz', email: 'old-fixture@example.invalid', password: 'old-fixture',
    }))
    let finishLogin: ((response: Response) => void) | undefined
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as { email?: string } : undefined
      if (url.endsWith('/auth/login') && body?.email === 'new-fixture@example.invalid') {
        return new Promise<Response>(resolve => { finishLogin = resolve })
      }
      if (url.endsWith('/auth/login')) throw new Error('Unexpected automatic restore login')
      if (url.endsWith('/auth/me')) return json({ data: { balance: 3 } })
      if (url.endsWith('/groups/available')) return json({ data: [] })
      if (url.includes('/keys?')) return json({ data: { items: [] } })
      throw new Error(`Unexpected fixture endpoint: ${url}`)
    })
    const client = new AiCloudClient({ secrets, fetch: fetcher, bases: ['https://code.aicodeme.xyz'] })

    const login = client.login({ email: 'new-fixture@example.invalid', password: 'new-fixture' })
    await expect.poll(() => finishLogin !== undefined).toBe(true)
    const current = client.current()
    expect(fetcher.mock.calls.filter(([input]) => String(input).endsWith('/auth/login'))).toHaveLength(1)
    finishLogin!(json({ data: { access_token: 'new-session-fixture' } }))

    await expect(login).resolves.toMatchObject({ status: 'signedIn', email: 'new-fixture@example.invalid' })
    await expect(current).resolves.toMatchObject({ status: 'signedIn', email: 'new-fixture@example.invalid' })
    expect(fetcher.mock.calls.filter(([input]) => String(input).endsWith('/auth/login'))).toHaveLength(1)
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
