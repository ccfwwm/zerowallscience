import { expect, it, vi } from 'vitest'
import { AiCloudClient } from '../src/host/index.js'
import { accountGroupCatalog, resolveImageProtocol } from '../src/shared/types.js'

const base = 'https://hkcode.aicodeme.xyz'
const json = (data: unknown) => new Response(JSON.stringify({ data }))
const groups = [
  { id: 53, name: '生图分组-支持4k', platform: 'openai' },
  { id: 57, name: '图片自定义名称', platform: 'openai' },
  { id: 69, name: '生图分组-香蕉生图', platform: 'gemini' },
  { id: 70, name: '普通分组', platform: 'openai' },
]

it.each([
  ['gpt-image-2.5-sunburst-4k', undefined, 'openai', 'model-prefix'],
  [' GEMINI-image ', undefined, 'gemini', 'model-prefix'],
  ['private-image', undefined, 'openai', 'openai-default'],
  ['gemini-image', { protocol: 'openai', protocolSource: 'openai-default' }, 'gemini', 'model-prefix'],
  ['gemini-image', { platform: ' OpenAI-Compatible ' }, 'openai', 'group-type'],
  ['gpt-image', { platform: ' GOOGLE-GEMINI ' }, 'gemini', 'group-type'],
  ['gemini-image', { protocol: 'openai', protocolSource: 'group-type' }, 'openai', 'group-type'],
  ['gemini-image', { platform: 'unknown' }, 'gemini', 'model-prefix'],
] as const)('resolves %s using explicit group, prefix, then OpenAI default', (id, group, imageProtocol, imageProtocolSource) => {
  expect(resolveImageProtocol(id, group)).toEqual({ imageProtocol, imageProtocolSource })
})

it('repairs old default provenance for native and media routes without rewriting the cached session', async () => {
  const route = { providerId: 'fixture', groupId: '9', groupName: '图片', modelId: 'gemini-image', imageProtocol: 'openai', imageProtocolSource: 'openai-default' }
  const raw = JSON.stringify({ baseUrl: base, accessToken: 'fixture', groupIds: ['9'], groups: [{ groupId: '9', groupName: '图片', protocol: 'openai', protocolSource: 'openai-default', platform: 'unknown' }], models: [{ ...route, capability: 'image-generation' }], mediaModels: [{ ...route, capability: 'media', mediaType: 'image', profileId: 'fixture' }] })
  const client = new AiCloudClient({ secrets: { get: async key => key === 'zerowall.ai-cloud.session' ? raw : undefined, set: async () => { throw new Error('Unexpected write') }, delete: async () => { throw new Error('Unexpected delete') } }, fetch: vi.fn(async () => { throw new Error('offline') }) })
  const result = await client.current()
  expect(result.models[0]).toMatchObject({ modelId: 'gemini-image', imageProtocol: 'gemini', imageProtocolSource: 'model-prefix' })
  expect(result.mediaModels?.[0]).toMatchObject({ modelId: 'gemini-image', imageProtocol: 'gemini', imageProtocolSource: 'model-prefix' })
  expect(accountGroupCatalog({ ...result, groups: [] }).groups[0]).toMatchObject({ protocol: 'gemini', protocolSource: 'model-prefix' })
})

it('discovers every legacy image group from plain model rows, using platform for the protocol', async () => {
  const values = new Map([['zerowall.ai-cloud.session', JSON.stringify({ baseUrl: base, accessToken: 'fixture', models: [], groupIds: [] })]])
  const secrets = { get: async (key: string) => values.get(key), set: async (key: string, value: string) => { values.set(key, value) }, delete: async (key: string) => { values.delete(key) } }
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).endsWith('/groups/available')) return json(groups)
    if (String(url).includes('/keys?')) return json(groups.map(g => ({ group_id: g.id, key: `fixture-${g.id}` })))
    expect(String(url)).toBe(`${base}/v1/models`)
    const id = Number(new Headers(init?.headers).get('authorization')!.split('-').at(-1))
    return json(id === 69 ? [{ id: 'gemini-3.1-flash-image', type: 'model' }] : id === 70 ? [{ id: 'gpt-image-2.5' }, { id: 'chat-model', capability: 'chat' }] : [{ id: 'gpt-image-2.5', type: 'model' }, { id: 'private-image-model' }])
  })
  const result = await new AiCloudClient({ secrets, fetch: fetcher }).discoverModels()
  for (const id of ['53', '57', '69']) {
    const models = result.models.filter(model => model.groupId === id)
    expect(models.length).toBeGreaterThan(0)
    expect(models.every(model => model.capability === 'image-generation')).toBe(true)
    expect(models.every(model => model.imageProtocol === (id === '69' ? 'gemini' : 'openai'))).toBe(true)
  }
  expect(result.models.find(model => model.groupId === '70' && model.modelId === 'gpt-image-2.5')?.capability).toBe('image-generation')
  expect(result.models.find(model => model.modelId === 'chat-model')?.capability).not.toBe('image-generation')
  expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true)
})

it('repairs cached image classification and platform without changing the stored selection or credentials', async () => {
  const raw = JSON.stringify({ baseUrl: base, accessToken: 'fixture', groupIds: ['69'], groups: [{ groupId: '69', groupName: groups[2]!.name, platform: 'gemini', protocol: 'openai', protocolSource: 'openai-default' }], models: [{ providerId: 'legacy', groupId: '69', groupName: groups[2]!.name, modelId: 'private-image' }] })
  const values = new Map([['zerowall.ai-cloud.session', raw]])
  const client = new AiCloudClient({ secrets: { get: async key => values.get(key), set: async () => { throw new Error('Unexpected write') }, delete: async () => { throw new Error('Unexpected delete') } }, fetch: vi.fn(async () => { throw new Error('offline') }) })
  const result = await client.current()
  expect(result.models[0]).toMatchObject({ capability: 'image-generation', imageProtocol: 'gemini', imageProtocolSource: 'group-type' })
  expect(values.get('zerowall.ai-cloud.session')).toBe(raw)
})
