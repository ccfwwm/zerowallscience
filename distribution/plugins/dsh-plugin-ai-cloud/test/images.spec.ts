import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ZeroWallImages } from '../src/cloud/host/images.js'
import type { ZeroWallMedia, MediaTask } from '../src/cloud/shared/media.js'
import type { AiCloudMediaModel } from '../src/account/shared/types.js'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })
function setup() {
  const ctx = new Context()
  contexts.push(ctx)
  const task: MediaTask = { requestId: 'request-1234', account: 'test@example.invalid', gateway: 'https://example.invalid', selection: { groupId: '1', profileId: 'image', modelId: 'image-test', operation: 'image' }, parametersHash: 'digest', status: 'completed', artifacts: [{ key: 'image-1', mediaType: 'image/png' }], createdAt: '', updatedAt: '', diagnostics: { stage: 'accepted', requestHash: 'digest', request: { private: 'host-only' }, references: {} } }
  const media = {
    catalog: vi.fn<ZeroWallMedia['catalog']>(async () => ({ models: [], status: 'succeeded' })),
    submit: vi.fn<ZeroWallMedia['submit']>(async () => task),
    query: vi.fn<ZeroWallMedia['query']>(async () => task),
    download: vi.fn<ZeroWallMedia['download']>(async () => ({ bytes: new Uint8Array([1, 2, 3]), mediaType: 'image/png', sha256: 'digest' })),
    estimate: vi.fn<ZeroWallMedia['estimate']>(), wait: vi.fn<ZeroWallMedia['wait']>(), list: vi.fn<ZeroWallMedia['list']>(),
  }
  ctx.provide('zerowallMedia', media)
  return { media, api: new ZeroWallImages(ctx) }
}

describe('image panel Host API', () => {
  it('retains a task identity and omits Host diagnostics from the Client result', async () => {
    const { api, media } = setup()
    const input = { requestId: 'request-1234', groupId: '1', profileId: 'image', modelId: 'image-test', operation: 'image' as const, prompt: 'Test image' }
    expect(await api.generate(input)).toEqual({ requestId: input.requestId, status: 'completed', artifacts: [{ key: 'image-1', mediaType: 'image/png' }] })
    expect(media.submit).toHaveBeenCalledOnce()
    expect(media.submit).toHaveBeenCalledWith({ ...input, parameters: { n: 1 } })
    await api.query(input.requestId)
    expect(media.submit).toHaveBeenCalledOnce()
    expect(media.query).toHaveBeenCalledWith(input.requestId)
  })
  it('does not retry a failed paid submission', async () => {
    const { api, media } = setup()
    media.submit.mockRejectedValue(new Error('Unknown gateway outcome'))
    await expect(api.generate({ requestId: 'request-1234', groupId: '1', profileId: 'image', modelId: 'image-test', operation: 'image', prompt: 'Test' })).rejects.toThrow('Unknown gateway outcome')
    expect(media.submit).toHaveBeenCalledOnce()
  })
  it('exposes available image routes while omitting other media and stale routes', async () => {
    const { api, media } = setup()
    const image: AiCloudMediaModel = { groupId: '1', groupName: 'Images', modelId: 'image-test', profileId: 'image', mediaType: 'image', capability: 'media', version: '1', duration: {}, resolutions: [], aspectRatios: [], formats: [], materials: {}, pollSeconds: 5, operations: ['image'], sizes: [], qualities: [], providerId: 'host-route', baseUrl: 'https://example.invalid' }
    media.catalog.mockResolvedValue({ status: 'succeeded', models: [image, { ...image, stale: true }, { ...image, mediaType: 'video' }] })
    expect(await api.models()).toEqual([{ groupId: '1', groupName: 'Images', modelId: 'image-test', profileId: 'image', operation: 'image', sizes: [], qualities: [] }])
  })
  it('rejects active SVG content and oversized previews', async () => {
    const { api, media } = setup()
    media.download.mockResolvedValue({ bytes: new Uint8Array([1]), mediaType: 'image/svg+xml', sha256: 'digest' })
    await expect(api.imageData('request-1234', 'image-1')).rejects.toThrow('IMAGE_PREVIEW_UNSUPPORTED')
    media.download.mockResolvedValue({ bytes: new Uint8Array(8 * 1024 * 1024 + 1), mediaType: 'image/png', sha256: 'digest' })
    await expect(api.imageData('request-1234', 'image-1')).rejects.toThrow('IMAGE_PREVIEW_UNSUPPORTED')
  })
})
