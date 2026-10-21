import { mkdtemp, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import React from 'react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiCloudImageGenerator } from '../src/host/generator.js'
import { createImageConfiguration, renderImageResult } from '../src/host/index.js'
import { recordVisualAsset } from '../src/host/visual-assets.js'
import type { AiCloudMediaModel } from '@zerowallscience/plugin-account/types'
import type { AccountSecretStore } from '@zerowallscience/plugin-account'
import { assertCredentialKey } from '../../../desktop/src/main/credentials/vault.js'

class MemorySecrets implements AccountSecretStore {
  readonly values = new Map<string, string>()
  async get(key: string): Promise<string | undefined> { assertCredentialKey(key); return this.values.get(key) }
  async set(key: string, value: string): Promise<void> { assertCredentialKey(key); this.values.set(key, value) }
  async delete(key: string): Promise<void> { assertCredentialKey(key); this.values.delete(key) }
}

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), 'zerowall-image-'))
  roots.push(value)
  return value
}

async function raster(format: 'png' | 'jpeg' | 'webp' = 'png', width = 8, height = 6, alpha = format === 'png'): Promise<Buffer> {
  let image = sharp({ create: { width, height, channels: alpha ? 4 : 3, background: alpha ? { r: 20, g: 40, b: 60, alpha: 0.5 } : { r: 20, g: 40, b: 60 } } })
  if (format === 'jpeg') image = image.jpeg()
  else if (format === 'webp') image = image.webp()
  else image = image.png()
  return await image.toBuffer()
}

function signedIn() {
  const models: AiCloudMediaModel[] = [{ providerId: 'zerowall-ai-cloud-7', groupId: '7', groupName: '图片音频视频分组', capability: 'media',
    modelId: 'gpt-image-2', baseUrl: 'https://code.aicodeme.xyz/v1', profileId: 'test-profile', version: '1', mediaType: 'image', operations: ['image','image_edit'], sizes: ['auto','1024x1024','2048x2048'], qualities: ['auto','low','medium','high'], resolutions: [], aspectRatios: [], duration: {}, materials: {mask:{max_count:1,max_file_bytes:50*1024*1024,formats:['file_png']},image: {max_count:16,max_file_bytes:50*1024*1024,formats:['file','data_url']}}, formats: [], pollSeconds: 1 }]
  return { status: 'signedIn' as const, email: 'image-fixture@example.test', gatewayBaseUrl: 'https://code.aicodeme.xyz', balanceFreshness: 'current' as const, lowBalance: false, models: [], mediaModels: models, mediaSync: { status: 'succeeded' as const, checkedAt: 'now', groups: models.map(m=>({groupId:m.groupId,groupName:m.groupName,checkedAt:'now',status:'succeeded' as const,count:1})) } }
}

it.each(['high', 'xhigh', 'max', 'auto'] as const)('uses the selected native image group with undeclared optional quality %s independently of media', async quality => {
  const workspace = await root()
  const secrets = new MemorySecrets()
  secrets.values.set('zerowall.ai-cloud.group.53', 'host-only-secret')
  const model = { providerId: 'zerowall-ai-cloud-53-responses', groupId: '53', groupName: '生图分组-gpt逆向', modelId: 'gpt-image-2.5', baseUrl: 'https://code.aicodeme.xyz/v1', capability: 'image-generation' as const, qualities: [] }
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    expect(url).toBe('https://code.aicodeme.xyz/v1/images/generations')
    expect(JSON.parse(String(init?.body))).toEqual({ model: 'gpt-image-2.5', prompt: 'full slide template', response_format: 'b64_json', ...(quality === 'auto' ? {} : { quality }) })
    return imageResponse(await raster(), { quality })
  })
  const media = { submit: vi.fn() }
  const service = new AiCloudImageGenerator({ secrets, account: { current: async () => ({ ...signedIn(), models: [model] }) }, imageModel: async () => model, imageQuality: async () => quality, fetch: fetcher, media: media as any })
  const result = await service.generate({ prompt: 'full slide template', outputPath: 'slide.png' }, workspace)
  expect(result).toMatchObject({ model: 'gpt-image-2.5', groupId: '53', requestedQuality: quality })
  expect(media.submit).not.toHaveBeenCalled()
  expect(fetcher).toHaveBeenCalledOnce()
})

it('keeps repeated multipart image fields and the mask on the independent native image route', async () => {
  const workspace = await root(), png = await raster()
  await writeFile(join(workspace, 'source.png'), png)
  await writeFile(join(workspace, 'mask.png'), png)
  const secrets = new MemorySecrets()
  secrets.values.set('zerowall.ai-cloud.group.53', 'host-only-secret')
  const model = { providerId: 'zerowall-ai-cloud-53-responses', groupId: '53', groupName: '生图分组-gpt逆向', modelId: 'gpt-image-2.5', baseUrl: 'https://code.aicodeme.xyz/v1', capability: 'image-generation' as const, qualities: [] }
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    expect(url).toBe('https://code.aicodeme.xyz/v1/images/edits')
    const form = init?.body as FormData
    expect(form).toBeInstanceOf(FormData)
    expect(form.getAll('image[]')).toHaveLength(1)
    expect(Buffer.from(await (form.get('image[]') as File).arrayBuffer())).toEqual(png)
    expect(Buffer.from(await (form.get('mask') as File).arrayBuffer())).toEqual(png)
    expect(form.get('quality')).toBe('high')
    expect(new Headers(init?.headers).has('content-type')).toBe(false)
    return imageResponse(png)
  })
  const media = { submit: vi.fn() }
  const service = new AiCloudImageGenerator({ secrets, account: { current: async () => ({ ...signedIn(), models: [model] }) }, imageModel: async () => model, fetch: fetcher, media: media as any })
  await service.edit({ prompt: 'native edit', inputPaths: ['source.png'], maskPath: 'mask.png', outputPath: 'edited.png', quality: 'high' }, workspace)
  expect(media.submit).not.toHaveBeenCalled()
  expect(fetcher).toHaveBeenCalledOnce()
})

function generator(fetcher: typeof fetch, attachment?: ImageAttachmentRef | Error, imageQuality?: () => Promise<'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined>, models = signedIn().mediaModels, downloadTimeoutMs?: number) {
  const mediaCacheDir=mkdtempSync(join(tmpdir(),'images-media-test-'));roots.push(mediaCacheDir)
  const secrets = new MemorySecrets()
  for (const model of models) secrets.values.set(`zerowall.ai-cloud.group.${model.groupId}`, 'host-only-secret')
  return new AiCloudImageGenerator({
    secrets,
    mediaCacheDir,
    retryDelayMs: 0,
    account: { current: async () => ({ ...signedIn(), mediaModels: models, mediaSync: {...signedIn().mediaSync,groups:models.map(m=>({groupId:m.groupId,groupName:m.groupName,checkedAt:'now',status:'succeeded' as const,count:1}))} }) },
    imageModel: async () => ({providerId:models[0]!.providerId,groupId:models[0]!.groupId,modelId:models[0]!.modelId}),
    fetch: fetcher,
    ...(imageQuality === undefined ? {} : { imageQuality }),
    ...(downloadTimeoutMs === undefined ? {} : { downloadTimeoutMs }),
    ...(attachment === undefined ? {} : {
      attachments: () => ({
        saveImage: async () => {
          if (attachment instanceof Error) throw attachment
          return attachment
        },
      }),
    }),
  })
}

function imageResponse(data: Uint8Array, extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    data: [{ b64_json: Buffer.from(data).toString('base64'), ...extra }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

it.each(['high', 'xhigh', 'max'] as const)('sends the exact environment quality %s and preserves the provider-reported quality', async quality => {
  const workspace = await root(), png = await raster()
  const models = signedIn().mediaModels.map(model => ({ ...model, modelId: 'gpt-image-2.5-4k', qualities: [] }))
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    expect(JSON.parse(String(init?.body)).quality).toBe(quality)
    return imageResponse(png, { quality })
  })
  const result = await generator(fetcher, undefined, async () => quality, models).generate({ prompt: 'template', outputPath: `${quality}.png` }, workspace)
  expect(result.requestedQuality).toBe(quality)
  expect(result.actualQuality).toBe(quality)
  expect(fetcher).toHaveBeenCalledOnce()
})

it('resumes matching successful requests without another generation and preserves the selected parameters', async () => {
  const workspace = await root(), png = await raster(), fetcher = vi.fn(async () => imageResponse(png))
  const first = await generator(fetcher as typeof fetch).generate({ prompt: 'verified concept', outputPath: 'cached.png', quality: 'medium' }, workspace)
  const restored = await generator(fetcher as typeof fetch).generate({ prompt: 'verified concept', outputPath: 'cached.png', quality: 'medium' }, workspace)
  expect(fetcher).toHaveBeenCalledOnce(); expect(restored.cached).toBe(true); expect(restored.sha256).toBe(first.sha256)
  await expect(generator(fetcher as typeof fetch).generate({ prompt: 'verified concept', outputPath: 'cached.png', quality: 'high' }, workspace)).rejects.toThrow('already exists')
})
it('allows ten concurrent jobs by default and deduplicates concurrent identical targets', async () => {
  const workspace = await root(), png = await raster(); let active = 0, maximum = 0
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  const fetcher = vi.fn(async () => { active++; maximum = Math.max(maximum, active); if (active === 10) started.resolve(); await release.promise; active--; return imageResponse(png) })
  const service = generator(fetcher as typeof fetch)
  const pending = Promise.all([...Array.from({ length: 12 }, (_, index) => index + 1), 3].map(number => service.generate({ prompt: `concept ${number}`, outputPath: `parallel-${number}.png` }, workspace)))
  await started.promise
  expect(maximum).toBe(10)
  release.resolve()
  await pending
  expect(maximum).toBe(10); expect(fetcher).toHaveBeenCalledTimes(12)
})
it('honors a prompt-selected lower concurrency limit without forwarding it to the provider', async () => {
  const workspace = await root(), png = await raster(); let active = 0, maximum = 0
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  const fetcher = vi.fn(async (_url, init) => {
    active++; maximum = Math.max(maximum, active)
    if (active === 3) started.resolve()
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('concurrency')
    await release.promise; active--; return imageResponse(png)
  })
  const service = generator(fetcher as typeof fetch)
  const pending = Promise.all(Array.from({ length: 6 }, (_, index) => service.generate({ prompt: `limited ${index}`, outputPath: `limited-${index}.png`, concurrency: 3 }, workspace)))
  await started.promise
  expect(maximum).toBe(3)
  release.resolve()
  await pending
  expect(maximum).toBe(3); expect(fetcher).toHaveBeenCalledTimes(6)
})
it('renders a durable image block alongside the assistant-facing Markdown embed', () => {
  const result = renderImageResult('Generated', {
    path: 'C:\\workspace\\images\\final image.png', model: 'gpt-image-2', providerId: 'provider', groupId: 'group',
    bytes: 12, requestedSize: 'auto', actualWidth: 4, actualHeight: 3, quality: 'auto', requestedQuality: 'auto', actualQuality: 'auto',
    image: { attachmentId: 'sha256:' + 'a'.repeat(64), mediaType: 'image/png', bytes: 12, width: 4, height: 3, name: 'final image.png' },
  })
  expect(result).toHaveLength(2)
  expect(result[0]).toMatchObject({ type: 'text' })
  expect((result[0] as { text: string }).text).toContain('![Generated image](<C:/workspace/images/final image.png>)')
  expect(result[1]).toMatchObject({ type: 'image', attachment: { mediaType: 'image/png', width: 4, height: 3 } })
})
it('recovers transient 503 with the original idempotency key and rejects definitive parameter errors', async () => {
  const workspace = await root(), png = await raster()
  const transient = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(imageResponse(png))
  const recovering = generator(transient as typeof fetch)
  await expect(recovering.generate({ prompt: 'concept', outputPath: 'retry.png' }, workspace)).rejects.toThrow('MEDIA_SUBMISSION_UNCERTAIN')
  await recovering.generate({ prompt: 'concept', outputPath: 'retry.png' }, workspace)
  expect(new Headers(transient.mock.calls[0]?.[1]?.headers).get('Idempotency-Key')).toBe(new Headers(transient.mock.calls[1]?.[1]?.headers).get('Idempotency-Key'))
  expect(transient).toHaveBeenCalledTimes(2)
  const invalid = vi.fn(async () => new Response('sensitive response', { status: 400 }))
  await expect(generator(invalid as typeof fetch).generate({ prompt: 'concept', outputPath: 'bad.png' }, workspace)).rejects.toThrow('MEDIA_HTTP_400')
  expect(invalid).toHaveBeenCalledOnce()
  expect(await readFile(join(workspace, 'bad.png.generation.failed.json'), 'utf8')).not.toContain('sensitive response')
})

describe('AI Cloud image generation and editing', () => {
  it('keeps standalone image skill settings separate from media selections', async () => {
    const readImageModelSelection = vi.fn().mockResolvedValue({ providerId: 'env-provider', groupId: 'env-group', modelId: 'env-image' })
    const getImageQuality = vi.fn().mockResolvedValue('high')
    const readMediaModelSelections = vi.fn().mockResolvedValue({ image: { selection: { providerId: 'media-provider', groupId: 'media-group', modelId: 'media-image' }, parameters: { quality: 'low' } } })
    const config = createImageConfiguration({ readImageModelSelection, getImageQuality, readMediaModelSelections } as any)
    await expect(config.imageModel()).resolves.toMatchObject({ modelId: 'env-image' })
    await expect(config.imageQuality()).resolves.toBe('high')
    expect(readImageModelSelection).toHaveBeenCalledOnce()
    expect(getImageQuality).toHaveBeenCalledOnce()
    expect(readMediaModelSelections).not.toHaveBeenCalled()
  })
  it('records a seed/style edit as a verified independent presentation asset', async () => {
    const workspace = await root()
    const png = await raster()
    const service = generator(vi.fn(async () => imageResponse(png, { revised_prompt: 'Scientific visual without labels' })) as typeof fetch)
    const style = await service.generate({ prompt: 'scientific style', outputPath: 'style.png' }, workspace)
    await recordVisualAsset(workspace, { manifest: 'visual-assets.json', image: style.path, assetId: 'style-1', role: 'style-candidate' })
    const seed = await service.generate({ prompt: 'scientific seed', outputPath: 'seed.png' }, workspace)
    const edited = await service.edit({ prompt: 'preserve seed, use style second', inputPaths: [seed.path, style.path], outputPath: 'final.png' }, workspace)
    const asset = await recordVisualAsset(workspace, { manifest: 'visual-assets.json', image: edited.path, assetId: 'slide-1-art', role: 'illustration', slideNumber: 1, styleReferenceIds: ['style-1'], sourceSeedPath: seed.path })
    expect(asset).toMatchObject({ model: edited.model, width: 8, height: 6, requestedQuality: edited.requestedQuality, actualQuality: edited.actualQuality, revisedPrompt: 'Scientific visual without labels' })
    expect(asset.inputImageHashes).toHaveLength(2)
    expect(asset.sha256).toBe(edited.sha256)
    expect(JSON.parse(await readFile(join(workspace, 'visual-assets.json'), 'utf8')).assets).toHaveLength(2)
    await writeFile(edited.path, 'corrupted asset')
    await expect(recordVisualAsset(workspace, { manifest: 'visual-assets.json', image: edited.path, assetId: 'bad', role: 'illustration' })).rejects.toThrow()
  })
  it('resolves environment quality for generate and edit, while explicit quality wins', async () => {
    const workspace = await root()
    const png = await raster()
    await writeFile(join(workspace, 'source.png'), png)
    const bodies: Array<string | FormData> = []
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(init?.body as string | FormData)
      return imageResponse(png)
    })
    const service = generator(fetcher as typeof fetch, undefined, async () => 'medium')
    await service.generate({ prompt: 'configured', outputPath: 'configured.png' }, workspace)
    await service.edit({ prompt: 'configured edit', inputPaths: ['source.png'], outputPath: 'configured-edit.png' }, workspace)
    await service.generate({ prompt: 'explicit', outputPath: 'explicit.png', quality: 'auto' }, workspace)
    expect(JSON.parse(String(bodies[0]))).toMatchObject({ quality: 'medium' })
    expect(JSON.parse(String(bodies[1]))).toMatchObject({ quality: 'medium', images: [`data:image/png;base64,${png.toString('base64')}`] })
    expect(JSON.parse(String(bodies[2]))).toMatchObject({ quality: 'auto' })
  })

  it('uses auto when environment quality is missing and reports unavailable settings', async () => {
    const service = generator(vi.fn() as typeof fetch, undefined, async () => undefined)
    await expect(service.resolveQuality()).resolves.toBe('auto')
    const unavailable = generator(vi.fn() as typeof fetch, undefined, async () => { throw new Error('environment unavailable') })
    await expect(unavailable.resolveQuality()).rejects.toThrow('IMAGE_CONFIGURATION_UNAVAILABLE')
  })

  it('passes an explicit model override and rejects a model unavailable to the account', async () => {
    const workspace = await root()
    const png = await raster()
    const models = [
      ...signedIn().mediaModels,
      { ...signedIn().mediaModels[0]!, providerId: 'zerowall-ai-cloud-8', groupId: '8', modelId: 'gpt-image-2-pro' },
    ]
    const fetcher = vi.fn(async () => imageResponse(png))
    const service = generator(fetcher as typeof fetch, undefined, undefined, models)
    await service.generate({ prompt: 'override', outputPath: 'override.png', model: 'gpt-image-2-pro' }, workspace)
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://code.aicodeme.xyz/v1/images/generations')
    expect(JSON.parse(String((fetcher.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({ model: 'gpt-image-2-pro' })
    await expect(service.generate({ prompt: 'invalid', outputPath: 'invalid.png', model: 'missing-model' }, workspace))
      .rejects.toThrow('当前账户没有可用的 missing-model 生图模型')
  })

  it('uses the configured gpt-image-2 Image API and persists preview metadata', async () => {
    const workspace = await root()
    const png = await raster()
    const ref = {
      attachmentId: `sha256:${'a'.repeat(64)}` as ImageAttachmentRef['attachmentId'],
      mediaType: 'image/png' as const,
      bytes: png.byteLength,
      width: 8,
      height: 6,
      name: 'cover.png',
    }
    const fetcher = vi.fn(async () => imageResponse(png, { revised_prompt: 'refined' }))
    const service = generator(fetcher as typeof fetch, ref)

    const result = await service.generate({ prompt: 'A scientific cover', outputPath: 'art/cover.png' }, workspace)

    expect(result).toMatchObject({ model: 'gpt-image-2', quality: 'auto', revisedPrompt: 'refined', image: { attachmentId: ref.attachmentId } })
    expect((await sharp(await readFile(result.path)).metadata()).format).toBe('png')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://code.aicodeme.xyz/v1/images/generations')
    const request = fetcher.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(request.body))).toMatchObject({ model: 'gpt-image-2', prompt: 'A scientific cover', size: 'auto', quality: 'auto' })
    expect(String(request.body)).not.toContain('messages')
    expect(JSON.stringify(result)).not.toContain('host-only-secret')
  })

  it('accepts the attachment store normalized preview format for a PNG output', async () => {
    const workspace = await root()
    const png = await raster()
    const ref = {
      attachmentId: `sha256:${'b'.repeat(64)}` as ImageAttachmentRef['attachmentId'],
      mediaType: 'image/jpeg' as const,
      bytes: 123,
      width: 1536,
      height: 1536,
      name: 'large.png',
    }
    const service = generator(vi.fn(async () => imageResponse(png)) as typeof fetch, ref)

    const result = await service.generate({ prompt: 'A large image', outputPath: 'large.png', size: '2048x2048' }, workspace)

    expect(result.previewWarning).toBeUndefined()
    expect(result.image).toMatchObject({ attachmentId: ref.attachmentId, mediaType: 'image/jpeg', width: 1536, height: 1536 })
    expect((await sharp(await readFile(result.path)).metadata()).format).toBe('png')
  })

  it('accepts custom larger sizes and sends them for generation and edit requests', async () => {
    const workspace = await root()
    const png = await raster()
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body).toMatchObject({ size: '2048x2048', quality: body.images ? 'high' : 'low' })
      if (body.images) expect(body.images).toEqual([`data:image/png;base64,${png.toString('base64')}`])
      return imageResponse(png)
    })
    const service = generator(fetcher as typeof fetch)
    await service.generate({ prompt: 'large', outputPath: 'large.png', size: '2048x2048', quality: 'low' }, workspace)
    await writeFile(join(workspace, 'source.png'), png)
    await service.edit({ prompt: 'large edit', inputPaths: ['source.png'], outputPath: 'edited.png', size: '2048x2048', quality: 'high' }, workspace)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('rejects malformed custom sizes before network access', async () => {
    const workspace = await root()
    const fetcher = vi.fn()
    const service = generator(fetcher as typeof fetch)
    await expect(service.generate({ prompt: 'bad', outputPath: 'bad.png', size: '2048' as never }, workspace)).rejects.toThrow('WIDTHxHEIGHT')
    await expect(service.generate({ prompt: 'bad', outputPath: 'bad-2.png', size: '0x2048' as never }, workspace)).rejects.toThrow('positive integer')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('sends complete canonical image and mask arrays for administrator template serialization', async () => {
    const workspace = await root()
    await writeFile(join(workspace, 'one.png'), await raster('png', 8, 6))
    await writeFile(join(workspace, 'two.webp'), await raster('webp', 5, 5))
    await writeFile(join(workspace, 'mask.png'), await raster('png', 8, 6, true))
    const png = await raster('png', 12, 10)
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body.images).toEqual([
        `data:image/png;base64,${(await readFile(join(workspace, 'one.png'))).toString('base64')}`,
        `data:image/webp;base64,${(await readFile(join(workspace, 'two.webp'))).toString('base64')}`,
      ])
      expect(body.masks).toEqual([{ url: `data:image/png;base64,${(await readFile(join(workspace, 'mask.png'))).toString('base64')}` }])
      expect(body.model).toBe('gpt-image-2')
      expect(body).not.toHaveProperty('input_fidelity')
      expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
      return imageResponse(png)
    })
    const service = generator(fetcher as typeof fetch)

    const result = await service.edit({
      prompt: 'Keep the composition and change the colors',
      inputPaths: ['one.png', 'two.webp'],
      maskPath: 'mask.png',
      outputPath: 'edited.png',
    }, workspace)

    expect(fetcher.mock.calls[0]?.[0]).toBe('https://code.aicodeme.xyz/v1/images/edits')
    expect(result.previewWarning).toContain('no attachment service')
    expect((await sharp(await readFile(result.path)).metadata()).format).toBe('png')
  })

  it('omits the mask field when an edit request provides no mask', async () => {
    const workspace = await root()
    await writeFile(join(workspace, 'source.png'), await raster('png', 8, 6))
    const png = await raster('png', 8, 6)
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body).not.toHaveProperty('masks')
      expect(body.images).toEqual([`data:image/png;base64,${(await readFile(join(workspace, 'source.png'))).toString('base64')}`])
      return imageResponse(png)
    })
    const service = generator(fetcher as typeof fetch)

    await service.edit({
      prompt: 'Keep the composition and change the background to winter',
      inputPaths: ['source.png'],
      maskPath: '   ',
      outputPath: 'edited.png',
    }, workspace)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('omits a model-echoed primary image path instead of treating it as an alpha mask', async () => {
    const workspace = await root()
    await writeFile(join(workspace, 'source.png'), await raster('png', 8, 6, false))
    const png = await raster('png', 8, 6)
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body).not.toHaveProperty('masks')
      expect(body.images).toEqual([`data:image/png;base64,${(await readFile(join(workspace, 'source.png'))).toString('base64')}`])
      return imageResponse(png)
    })
    const service = generator(fetcher as typeof fetch)

    await service.edit({
      prompt: 'Change the season while keeping the composition',
      inputPaths: ['source.png'],
      maskPath: 'source.png',
      outputPath: 'edited.png',
    }, workspace)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('classifies an unreachable image endpoint without exposing credentials', async () => {
    const workspace = await root()
    const fetcher = vi.fn(async () => { throw Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' }) })
    const service = generator(fetcher as typeof fetch)

    await expect(service.generate({ prompt: 'spring', outputPath: 'spring.png' }, workspace))
      .rejects.toThrow('MEDIA_SUBMISSION_UNCERTAIN')
    await expect(service.generate({ prompt: 'spring', outputPath: 'spring-2.png' }, workspace))
      .rejects.not.toThrow('host-only-secret')
    const failure = JSON.parse(await readFile(join(workspace, 'spring.png.generation.failed.json'), 'utf8'))
    expect(failure.request).toMatchObject({ operation: 'generate_image', prompt: 'spring', model: 'gpt-image-2', quality: 'auto' })
    expect(failure.reason).toContain('MEDIA_SUBMISSION_UNCERTAIN')
    expect(JSON.stringify(failure)).not.toContain('host-only-secret')
  })

  it('enforces image count, byte, format, mask, and traversal limits before network access', async () => {
    const workspace = await root()
    const fetcher = vi.fn()
    const service = generator(fetcher as typeof fetch)

    await expect(service.edit({ prompt: 'x', inputPaths: Array.from({ length: 17 }, (_, i) => `${i}.png`), outputPath: 'out.png' }, workspace))
      .rejects.toThrow('at most 16')
    await expect(service.edit({ prompt: 'x', inputPaths: ['../outside.png'], outputPath: 'out.png' }, workspace))
      .rejects.toThrow("must not contain '..'")

    await writeFile(join(workspace, 'oversized.png'), Buffer.alloc(1))
    await truncate(join(workspace, 'oversized.png'), 50 * 1024 * 1024 + 1)
    await expect(service.edit({ prompt: 'x', inputPaths: ['oversized.png'], outputPath: 'out.png' }, workspace))
      .rejects.toThrow('50 MiB')

    await writeFile(join(workspace, 'wrong.png'), await raster('jpeg'))
    await expect(service.edit({ prompt: 'x', inputPaths: ['wrong.png'], outputPath: 'out.png' }, workspace))
      .rejects.toThrow('extension does not match')

    await writeFile(join(workspace, 'source.png'), await raster('png', 8, 6))
    await writeFile(join(workspace, 'wrong-size.png'), await raster('png', 7, 6, true))
    await expect(service.edit({ prompt: 'x', inputPaths: ['source.png'], maskPath: 'wrong-size.png', outputPath: 'out.png' }, workspace))
      .rejects.toThrow('same dimensions')

    await writeFile(join(workspace, 'opaque.png'), await raster('png', 8, 6, false))
    await expect(service.edit({ prompt: 'x', inputPaths: ['source.png'], maskPath: 'opaque.png', outputPath: 'out.png' }, workspace))
      .rejects.toThrow('alpha channel')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects symlink escapes for inputs and output parents', async () => {
    const workspace = await root()
    const outside = await root()
    await writeFile(join(outside, 'source.png'), await raster())
    await symlink(outside, join(workspace, 'escape'), 'junction')
    const fetcher = vi.fn()
    const service = generator(fetcher as typeof fetch)

    await expect(service.edit({ prompt: 'x', inputPaths: ['escape/source.png'], outputPath: 'out.png' }, workspace))
      .rejects.toThrow('inside the current session')
    await expect(service.generate({ prompt: 'x', outputPath: 'escape/out.png' }, workspace))
      .rejects.toThrow('inside the current session')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('protects existing files by default and can atomically replace a source after the request succeeds', async () => {
    const workspace = await root()
    const original = await raster('png', 8, 6)
    const replacement = await raster('png', 3, 4)
    await writeFile(join(workspace, 'source.png'), original)
    const failed = generator(vi.fn(async () => new Response('bad', { status: 502 })) as typeof fetch)

    await expect(failed.edit({ prompt: 'x', inputPaths: ['source.png'], outputPath: 'source.png', overwrite: true }, workspace))
      .rejects.toThrow('MEDIA_SUBMISSION_UNCERTAIN')
    expect(Buffer.compare(await readFile(join(workspace, 'source.png')), original)).toBe(0)

    const service = generator(vi.fn(async () => imageResponse(replacement)) as typeof fetch)
    await expect(service.edit({ prompt: 'x', inputPaths: ['source.png'], outputPath: 'source.png' }, workspace))
      .rejects.toThrow('already exists')
    const result = await service.edit({ prompt: 'x', inputPaths: ['source.png'], outputPath: 'source.png', overwrite: true }, workspace)
    expect(await sharp(await readFile(result.path)).metadata()).toMatchObject({ width: 3, height: 4, format: 'png' })
  })

  it('supports URL payloads, cancellation, HTTP errors, and preview-only failures', async () => {
    const workspace = await root()
    const png = await raster()
    const fetcher = vi.fn(async (url: string | URL | Request) => String(url).includes('/images/generations')
      ? new Response(JSON.stringify({ data: [{ url: 'https://cdn.example.test/image.png' }] }), { status: 200 })
      : new Response(png, { status: 200, headers: { 'content-length': String(png.byteLength) } }))
    const service = generator(fetcher as typeof fetch, new Error('attachment disk full'))
    const result = await service.generate({ prompt: 'x', outputPath: 'url.png' }, workspace)
    expect(result.previewWarning).toContain('attachment disk full')
    expect(await readFile(result.path)).toHaveLength(result.bytes)

    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    await expect(service.generate({ prompt: 'x', outputPath: 'cancelled.png' }, workspace, controller.signal)).rejects.toThrow('cancelled')

    const broken = generator(vi.fn(async () => new Response('bad', { status: 429 })) as typeof fetch)
    await expect(broken.generate({ prompt: 'x', outputPath: 'http.png' }, workspace)).rejects.toThrow('MEDIA_HTTP_429')
  })

  it('bounds a CDN URL that never finishes delivering the image', async () => {
    const workspace = await root()
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('/images/generations')) {
        return new Response(JSON.stringify({ data: [{ url: 'https://cdn.example.test/stalled.png' }] }), { status: 200 })
      }
      await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('timed out', 'TimeoutError')), { once: true })
      })
      throw new Error('unreachable')
    })
    const secrets = new MemorySecrets()
    secrets.values.set('zerowall.ai-cloud.group.57', 'test-only')
    const model = { providerId: 'zerowall-ai-cloud-57-responses', groupId: '57', groupName: '生图分组-AZ-非常稳定', modelId: 'gpt-image-2.5-sunburst', baseUrl: 'https://code.aicodeme.xyz/v1', capability: 'image-generation' as const }
    const service = new AiCloudImageGenerator({ secrets, account: { current: async () => ({ ...signedIn(), models: [model] }) }, imageModel: async () => model, fetch: fetcher as typeof fetch, downloadTimeoutMs: 10 })
    await expect(service.generate({ prompt: 'stalled CDN', outputPath: 'stalled.png' }, workspace))
      .rejects.toThrow('IMAGE_DOWNLOAD_TIMEOUT')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).not.toHaveProperty('response_format')
    const png = await raster()
    fetcher.mockImplementationOnce(async () => new Response(png))
    const recovered = await service.generate({ prompt: 'stalled CDN', outputPath: 'stalled.png' }, workspace)
    expect(recovered.resumedDownload).toBe(true)
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/images/generations'))).toHaveLength(1)
    expect(await readFile(recovered.receiptPath!, 'utf8')).not.toContain('cdn.example.test')
    expect([...secrets.values.keys()].some(key => key.startsWith('zerowall.ai-cloud.image-pending.'))).toBe(false)
  })

  it('rejects paths outside the session and unconfigured image models before network access', async () => {
    const workspace = await root()
    const fetcher = vi.fn()
    const service = new AiCloudImageGenerator({
      secrets: new MemorySecrets(),
      account: { current: async () => ({ status: 'signedIn', balanceFreshness: 'current', lowBalance: false, models: [] }) },
      fetch: fetcher as typeof fetch,
    })
    await expect(service.generate({ prompt: 'x', outputPath: '../outside.png' }, workspace)).rejects.toThrow("must not contain '..'")
    await expect(service.generate({ prompt: 'x', outputPath: 'inside.png' }, workspace)).rejects.toThrow('名称含“图片”或“生图”的分组')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
