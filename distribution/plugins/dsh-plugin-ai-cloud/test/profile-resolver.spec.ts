import { describe, expect, it } from 'vitest'
import { resolveManagedProfiles } from '../src/cloud/host/profile-resolver.js'

describe('managed AI Cloud profile resolver', () => {
  it('builds public pi-ai providers from account model routes', () => {
    const profiles = resolveManagedProfiles({
      'zerowall-ai-cloud-7': {
        displayName: 'ZeroWall AI Cloud - Research',
        api: 'openai-completions',
        baseURL: 'https://code.aicodeme.xyz/v1',
        defaultInput: ['text', 'image'],
        models: [{ id: 'gpt-5.6', input: ['text', 'image'], maxTokens: 32_000, contextWindow: 128_000 }],
      },
    })

    const profile = profiles.get('zerowall-ai-cloud-7')!
    expect(profile.provider).toBe('zerowall-ai-cloud-7')
    expect(profile.baseURL).toBe('https://code.aicodeme.xyz/v1')
    expect(profile.configuredMaxTokens.get('gpt-5.6')).toBe(32_000)
    expect(profile.maxRequestImages).toBe(50)
    expect(profile.imageOffloadCountQuantum).toBe(10)
    expect(profile.piProvider).toBeDefined()
    const provider = profile.piProvider!
    expect(provider.getModels()).toHaveLength(1)
    expect(provider.getModels()[0]).toMatchObject({ id: 'gpt-5.6', provider: 'zerowall-ai-cloud-7', api: 'openai-completions' })
  })

  it('rejects incomplete or untrusted route metadata before registration', () => {
    expect(() => resolveManagedProfiles({ broken: { api: 'openai-completions', baseURL: '', models: [] } })).toThrow('incomplete')
  })

  it('honors image limits and rejects an offload count larger than the request limit', () => {
    const route = {
      api: 'openai-completions' as const,
      baseURL: 'https://example.test/v1',
      models: [{ id: 'test' }],
      maxRequestImages: 3,
    }
    expect(resolveManagedProfiles({ test: route }).get('test')).toMatchObject({
      maxRequestImages: 3, imageOffloadCountQuantum: 3,
    })
    expect(resolveManagedProfiles({ test: { ...route, imageOffloadCountQuantum: 2 } }).get('test')?.imageOffloadCountQuantum).toBe(2)
    expect(() => resolveManagedProfiles({ test: { ...route, imageOffloadCountQuantum: 4 } })).toThrow('exceeds maxRequestImages')
    expect(() => resolveManagedProfiles({ test: { ...route, maxRequestImages: 0 } })).toThrow('maxRequestImages must be a positive safe integer')
    expect(() => resolveManagedProfiles({ test: { ...route, imageOffloadCountQuantum: 0 } })).toThrow('imageOffloadCountQuantum')
  })
})
