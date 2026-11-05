import { mkdtemp, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import React from 'react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiCloudImageGenerator } from '../src/host/generator.js'
import { apply, createImageConfiguration, renderImageResult } from '../src/host/index.js'
import { AiCloudClient } from '@zerowallscience/plugin-account'
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

it('exposes preflight and task overrides through the registered tool schemas and execution boundary', async () => {
  const definitions = new Map<string, any>(), disposers: (() => void)[] = []
  vi.spyOn(AiCloudClient.prototype, 'current').mockResolvedValue(signedIn())
  const preflight = vi.spyOn(AiCloudImageGenerator.prototype, 'describeConfiguration').mockResolvedValue({ model: 'gpt-image-2', protocol: 'openai' } as any)
  const generate = vi.spyOn(AiCloudImageGenerator.prototype, 'generate').mockResolvedValue({} as any)
  const edit = vi.spyOn(AiCloudImageGenerator.prototype, 'edit').mockResolvedValue({} as any)
  try {
    const environment = { readImageModelSelection: async () => undefined }
    apply({ effect: (factory: () => () => void) => disposers.push(factory()), on: () => {}, get: (name: string) => name === 'zerowallEnvironment' ? environment : {}, provide: () => {}, tools: { register: (definition: any) => definitions.set(definition.name, definition) } } as any)
    const workspace = await root(), signal = new AbortController().signal
    const exec = { agent: { session: { header: { cwd: workspace }, snapshotEvents: () => [] } }, signal }
    const options = definitions.get('image_generation_options')
    expect(await options.execute({}, exec)).toMatchObject({ protocol: 'openai' })
    expect(options.output.render({}, { protocol: 'openai' })[0].text).toContain('openai')
    expect(preflight).toHaveBeenCalledOnce()
    expect(generate).not.toHaveBeenCalled(); expect(edit).not.toHaveBeenCalled()
    await definitions.get('generate_image').execute({ prompt: 'exact', output_path: 'exact.png', size: '3840x2160', quality: 'max' }, exec)
    expect(generate).toHaveBeenCalledWith({ prompt: 'exact', outputPath: 'exact.png', requireSize: true, size: '3840x2160', quality: 'max' }, workspace, signal)
    await definitions.get('edit_image').execute({ prompt: 'edit', output_path: 'edit.png', input_paths: ['source.png'], image_size: '2K', aspect_ratio: '16:9' }, exec)
    expect(edit).toHaveBeenCalledWith({ prompt: 'edit', outputPath: 'edit.png', requireSize: true, inputPaths: ['source.png'], imageSize: '2K', aspectRatio: '16:9' }, workspace, signal)
    await definitions.get('generate_image').execute({ prompt: 'defaults', output_path: 'defaults.png' }, exec)
    expect(generate.mock.calls.at(-1)![0]).toEqual({ prompt: 'defaults', outputPath: 'defaults.png', requireSize: true })
    expect(preflight).toHaveBeenCalledOnce()
  } finally { disposers.forEach(dispose => dispose()); vi.restoreAllMocks() }
})

it.each(['generate', 'edit'] as const)('preserves group 57 OpenAI 3840x2160/high on the %s request boundary and receipt', async operation => {
  const workspace = await root(), png = await raster('png', 3840, 2160), secrets = new MemorySecrets()
  secrets.values.set('zerowall.ai-cloud.group.57', 'host-only-secret')
  await writeFile(join(workspace, 'source.png'), await raster())
  const model = { providerId: 'zerowall-ai-cloud-57', groupId: '57', groupName: 'OpenAI', modelId: 'gpt-image-2.5-sunburst-4k', baseUrl: 'https://code.aicodeme.xyz/v1', capability: 'image-generation' as const, imageProtocol: 'gemini' as const }
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    expect(String(url)).toBe(`https://code.aicodeme.xyz/v1/images/${operation === 'edit' ? 'edits' : 'generations'}`)
    if (operation === 'generate') expect(JSON.parse(String(init?.body))).toEqual({ model: model.modelId, prompt: 'exact canvas', size: '3840x2160', quality: 'high' })
    else {
      const form = init!.body as FormData
      expect(form.get('size')).toBe('3840x2160'); expect(form.get('quality')).toBe('high')
      expect(form.get('model')).toBe(model.modelId); expect(form.getAll('image[]')).toHaveLength(1)
      expect(form.has('aspect_ratio')).toBe(false); expect(form.has('image_size')).toBe(false)
    }
    return imageResponse(png, { quality: 'high' })
  })
  const service = new AiCloudImageGenerator({ secrets, account: { current: async () => ({ ...signedIn(), models: [model], mediaModels: [], groups: [{ groupId: '57', groupName: 'OpenAI', protocol: 'openai', protocolSource: 'group-type' }] }) }, imageModel: async () => ({ ...model, resolution: '2K', aspectRatio: '1:1' }), imageQuality: async () => 'low', fetch: fetcher })
  const input = { prompt: 'exact canvas', outputPath: `${operation}.png`, size: '3840 × 2160', quality: 'high' as const }
  const result = operation === 'generate' ? await service.generate(input, workspace) : await service.edit({ ...input, inputPaths: ['source.png'] }, workspace)
  expect(result).toMatchObject({ model: model.modelId, groupId: '57', requestedSize: '3840x2160', requestedQuality: 'high', actualWidth: 3840, actualHeight: 2160 })
  expect(JSON.parse(await readFile(result.receiptPath!, 'utf8'))).toMatchObject({ requestedSize: '3840x2160', requestedQuality: 'high', actualWidth: 3840, actualHeight: 2160 })
  expect(fetcher).toHaveBeenCalledOnce()
})

it.each(['generate', 'edit'] as const)('replays mixed-protocol conversation arguments through exactly one OpenAI %s request', async operation => {
  const workspace = await root(), png = await raster(), secrets = new MemorySecrets()
  secrets.values.set('zerowall.ai-cloud.group.57', 'host-only-secret')
  await writeFile(join(workspace, 'source.png'), png)
  const model = { providerId: 'zerowall-ai-cloud-57', groupId: '57', groupName: 'OpenAI', modelId: 'gpt-image-2.5-sunburst-4k', baseUrl: 'https://code.aicodeme.xyz/v1', capability: 'image-generation' as const }
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    expect(url).toBe(`https://code.aicodeme.xyz/v1/images/${operation === 'generate' ? 'generations' : 'edits'}`)
    const params = init!.body instanceof FormData ? Object.fromEntries(init!.body) : JSON.parse(String(init!.body))
    expect(params).toMatchObject({ model: model.modelId, size: '3840x2160', quality: 'max' })
    expect(params).not.toHaveProperty('image_size')
    expect(params).not.toHaveProperty('aspect_ratio')
    expect(params).not.toHaveProperty('generationConfig')
    return imageResponse(png)
  })
  const service = new AiCloudImageGenerator({ secrets, account: { current: async () => ({ ...signedIn(), models: [model], mediaModels: [] }) }, imageModel: async () => model, imageQuality: async () => 'max', fetch: fetcher })
  const request = { prompt: 'replay of attached conversation', outputPath: 'replay.png', requireSize: true, size: '3840x2160', imageSize: '4K', aspectRatio: '16:9' }
  const result = operation === 'generate' ? await service.generate(request, workspace) : await service.edit({ ...request, inputPaths: ['source.png'] }, workspace)
  expect(result).toMatchObject({ requestedSize: '3840x2160', requestedQuality: 'max' })
  expect(fetcher).toHaveBeenCalledOnce()
})

it('exposes only the selected protocol fields and fresh configured quality in each model request', async () => {
  const definitions = new Map<string, any>(), hooks = new Map<string, any>(), disposers: (() => void)[] = []
  let protocol: 'openai' | 'gemini' = 'openai'
  let quality = 'max'
  vi.spyOn(AiCloudClient.prototype, 'current').mockResolvedValue(signedIn())
  vi.spyOn(AiCloudImageGenerator.prototype, 'describeConfiguration').mockImplementation(async () => ({ protocol, configuredQuality: quality, model: 'selected-model', groupId: '57' }) as any)
  try {
    apply({ effect: (factory: () => () => void) => disposers.push(factory()), on: (name: string, hook: any) => hooks.set(name, hook), get: (name: string) => name === 'zerowallEnvironment' ? { readImageModelSelection: async () => undefined } : {}, provide: () => {}, tools: { register: (definition: any) => definitions.set(definition.name, definition) } } as any)
    const preStep = async () => {
      const assembly = { tools: [...definitions.values()].map(definition => ({ name: definition.name, description: definition.description, parameters: definition.parameters })) }
      const result = await hooks.get('system-prompt/assemble')(assembly, {}, async () => assembly)
      for (const tool of result.tools.filter((tool: any) => ['generate_image', 'edit_image'].includes(tool.name))) {
        expect(tool.parameters.properties).not.toHaveProperty(protocol === 'openai' ? 'image_size' : 'size')
        expect(tool.description).toContain(`quality=${quality}`)
      }
    }
    await preStep()
    for (const name of ['generate_image', 'edit_image']) {
      const schema = definitions.get(name)
      expect(schema.parameters.properties).toHaveProperty('size')
      expect(schema.parameters.properties).toHaveProperty('quality')
      expect(schema.parameters.properties).not.toHaveProperty('image_size')
      expect(schema.parameters.properties).not.toHaveProperty('aspect_ratio')
      expect(schema.description).toContain('quality=max')
    }
    protocol = 'gemini'
    await preStep()
    for (const name of ['generate_image', 'edit_image']) {
      const schema = definitions.get(name)
      expect(schema.parameters.properties).toHaveProperty('image_size')
      expect(schema.parameters.properties).toHaveProperty('aspect_ratio')
      expect(schema.parameters.properties).not.toHaveProperty('size')
      expect(schema.parameters.properties).not.toHaveProperty('quality')
    }
    protocol = 'openai'; quality = 'xhigh'
    await preStep()
    expect(definitions.get('generate_image').description).toContain('quality=xhigh')
    expect(definitions.get('generate_image').parameters.properties).not.toHaveProperty('image_size')
  } finally { disposers.forEach(dispose => dispose()); vi.restoreAllMocks() }
})

it.each(['generate', 'edit'] as const)('blocks a missing conversation size before billing and uses fresh configured quality for %s', async operation => {
  const workspace = await root(), secrets = new MemorySecrets()
  await writeFile(join(workspace, 'source.png'), await raster())
  secrets.values.set('zerowall.ai-cloud.group.57', 'host-only-secret')
  const model = { providerId: 'zerowall-ai-cloud-57', groupId: '57', groupName: 'Images', modelId: 'gpt-image-2.5-sunburst-4k', baseUrl: 'https://code.aicodeme.xyz/v1', capability: 'image-generation' as const }
  let resolution = 'auto'
  let quality: 'max' | 'xhigh' = 'max'
  const fetcher = vi.fn<typeof fetch>(async () => imageResponse(await raster()))
  const service = new AiCloudImageGenerator({ secrets, account: { current: async () => ({ ...signedIn(), models: [model], mediaModels: [] }) }, imageModel: async () => ({ ...model, resolution }), imageQuality: async () => quality, fetch: fetcher })
  const run = (input: { outputPath: string; size?: string; aspectRatio?: string }) => {
    const request = { prompt: 'conversation dimensions', requireSize: true, ...input }
    return operation === 'generate' ? service.generate(request, workspace) : service.edit({ ...request, inputPaths: ['source.png'] }, workspace)
  }
  for (resolution of ['auto', '', '4K']) {
    await expect(run({ outputPath: 'missing.png', aspectRatio: '16:9' })).rejects.toThrow('IMAGE_SIZE_REQUIRED')
    await expect(run({ outputPath: 'blank.png', size: ' ' })).rejects.toThrow('IMAGE_SIZE_REQUIRED')
    expect(fetcher).not.toHaveBeenCalled()
  }
  const explicit = await run({ outputPath: 'explicit.png', size: '3840×2160' })
  expect(explicit).toMatchObject({ requestedSize: '3840x2160', requestedQuality: 'max' })
  resolution = '2048x1152'; quality = 'xhigh'
  const configured = await run({ outputPath: 'configured.png' })
  expect(configured).toMatchObject({ requestedSize: '2048x1152', requestedQuality: 'xhigh' })
  expect(fetcher).toHaveBeenCalledTimes(2)
  for (const [index, [, init]] of fetcher.mock.calls.entries()) {
    const body = init!.body
    const params = body instanceof FormData ? Object.fromEntries(body) : JSON.parse(String(body))
    expect(params).toMatchObject({ size: index === 0 ? '3840x2160' : '2048x1152', quality: index === 0 ? 'max' : 'xhigh' })
    expect(params).not.toHaveProperty('image_size')
    expect(params).not.toHaveProperty('requireSize')
  }
})

it.each([
  ['native', 'generate'], ['native', 'edit'], ['media', 'generate'], ['media', 'edit'],
] as const)('sends explicit auto size and quality on the %s %s wire request', async (route, operation) => {
  const workspace = await root(), secrets = new MemorySecrets()
  await writeFile(join(workspace, 'source.png'), await raster())
  const mediaModel = signedIn().mediaModels[0]!
  secrets.values.set(`zerowall.ai-cloud.group.${mediaModel.groupId}`, 'host-only-secret')
  const model = route === 'media' ? { ...mediaModel, sizes: [] } : { ...mediaModel, capability: 'image-generation' as const }
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    const body = init!.body
    const params = body instanceof FormData ? Object.fromEntries(body) : JSON.parse(String(body))
    expect(params).toMatchObject({ model: model.modelId, size: 'auto', quality: 'auto' })
    expect(params).not.toHaveProperty('image_size')
    return imageResponse(await raster(), { quality: 'auto' })
  })
  const mediaCacheDir = await root()
  const service = new AiCloudImageGenerator({ secrets, mediaCacheDir, account: { current: async () => ({ ...signedIn(), models: route === 'native' ? [model as any] : [], mediaModels: route === 'media' ? [model as AiCloudMediaModel] : [] }) }, imageModel: async () => model, imageQuality: async () => 'max', fetch: fetcher })
  const request = { prompt: 'user accepts automatic parameters', outputPath: 'auto.png', size: 'auto', quality: 'auto' as const, requireSize: true }
  const result = operation === 'generate' ? await service.generate(request, workspace) : await service.edit({ ...request, inputPaths: ['source.png'] }, workspace)
  expect(result).toMatchObject({ requestedSize: 'auto', requestedQuality: 'auto' })
  expect(fetcher).toHaveBeenCalledOnce()
})

it('maps environment pixel resolution to OpenAI size and exposes safe fresh preflight metadata without generating', async () => {
  const workspace = await root(), secrets = new MemorySecrets()
  secrets.values.set('zerowall.ai-cloud.group.57', 'host-only-secret')
  const model = { providerId: 'zerowall-ai-cloud-57', groupId: '57', groupName: 'Images', modelId: 'gpt-image-2.5-sunburst-4k', baseUrl: 'https://code.aicodeme.xyz/v1', capability: 'image-generation' as const, imageProtocol: 'openai' as const, imageProtocolSource: 'openai-default' as const, qualities: ['high'] }
  let selection = { ...model, resolution: '3840x2160', aspectRatio: '1:1' }
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    expect(JSON.parse(String(init?.body))).toMatchObject({ size: '3840x2160', quality: 'high' })
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('resolution')
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('aspect_ratio')
    return imageResponse(await raster())
  })
  const service = new AiCloudImageGenerator({ secrets, account: { current: async () => ({ ...signedIn(), models: [model], mediaModels: [] }) }, imageModel: async () => selection, imageQuality: async () => 'high', fetch: fetcher })
  const preflight = await service.describeConfiguration()
  expect(preflight).toMatchObject({ model: model.modelId, groupId: '57', protocol: 'openai', protocolSource: 'model-prefix', defaults: { size: '3840x2160', quality: 'high' } })
  expect(JSON.stringify(preflight)).not.toContain('host-only-secret'); expect(fetcher).not.toHaveBeenCalled()
  await service.generate({ prompt: 'configured pixels', outputPath: 'pixels.png' }, workspace)
  selection = { ...selection, resolution: '2048x1152' }
  expect(await service.describeConfiguration()).toMatchObject({ defaults: { size: '2048x1152' } })
})

it('sends explicit OpenAI aspect ratio and prevents a changed ratio from reusing an old result', async () => {
  const workspace = await root(), secrets = new MemorySecrets()
  secrets.values.set('zerowall.ai-cloud.group.57', 'host-only-secret')
  const model = { providerId: 'zerowall-ai-cloud-57', groupId: '57', groupName: 'Images', modelId: 'gpt-image-2', baseUrl: 'https://code.aicodeme.xyz/v1', capability: 'image-generation' as const }
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => { expect(JSON.parse(String(init?.body)).aspect_ratio).toBe('16:9'); return imageResponse(await raster()) })
  const service = new AiCloudImageGenerator({ secrets, account: { current: async () => ({ ...signedIn(), models: [model], mediaModels: [] }) }, imageModel: async () => model, fetch: fetcher })
  const input = { prompt: 'ratio', outputPath: 'ratio.png', aspectRatio: '16:9' }
  expect(await service.generate(input, workspace)).toMatchObject({ requestedAspectRatio: '16:9' })
  expect(await service.generate(input, workspace)).toMatchObject({ cached: true })
  await expect(service.generate({ ...input, aspectRatio: '1:1' }, workspace)).rejects.toThrow('already exists')
  expect(fetcher).toHaveBeenCalledOnce()
})

it('preserves explicit size and quality on a media capability route', async () => {
  const workspace = await root()
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'gpt-image-2', size: '3840x2160', quality: 'xhigh' })
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('aspect_ratio')
    return imageResponse(await raster())
  })
  const result = await generator(fetcher, undefined, async () => 'low').generate({ prompt: 'media pixels', outputPath: 'media.png', size: '3840x2160', quality: 'xhigh', aspectRatio: '16:9' }, workspace)
  expect(result).toMatchObject({ requestedSize: '3840x2160', requestedQuality: 'xhigh', requestedAspectRatio: '16:9' })
})

it('uses explicit Gemini task tier before defaults, reports timing, and rejects mixed protocol fields before billing', async () => {
  const workspace = await root(), secrets = new MemorySecrets()
  secrets.values.set('zerowall.ai-cloud.group.69', 'host-only-secret')
  const model = { providerId: 'zerowall-ai-cloud-69', groupId: '69', groupName: 'Images', modelId: 'gemini-image', baseUrl: 'https://code.aicodeme.xyz/v1', capability: 'image-generation' as const, imageProtocol: 'openai' as const, imageProtocolSource: 'openai-default' as const, imageSizes: ['1K', '4K'] }
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    expect(String(url)).toContain('/v1beta/models/gemini-image:generateContent')
    const body = JSON.parse(String(init?.body))
    expect(body.generationConfig.imageConfig).toEqual({ aspectRatio: '16:9', imageSize: '1K' })
    expect(JSON.stringify(body)).not.toContain('quality')
    await new Promise(resolve => setTimeout(resolve, 12))
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: (await raster()).toString('base64') } }] } }] }))
  })
  const service = new AiCloudImageGenerator({ secrets, account: { current: async () => ({ ...signedIn(), models: [model], mediaModels: [] }) }, imageModel: async () => ({ ...model, imageSize: '4K', aspectRatio: '1:1' }), fetch: fetcher })
  await expect(service.generate({ prompt: 'pixels on Gemini', outputPath: 'bad.png', size: '3840x2160' }, workspace)).rejects.toThrow('IMAGE_PROTOCOL_PARAMETER_MISMATCH')
  expect(fetcher).not.toHaveBeenCalled()
  const result = await service.generate({ prompt: 'explicit tier', outputPath: 'gemini.png', imageSize: '1k', aspectRatio: '16:9' }, workspace)
  expect(result).toMatchObject({ requestedSize: 'auto', requestedImageSize: '1K', requestedAspectRatio: '16:9' })
  expect(result.timings!.providerMs).toBeGreaterThanOrEqual(10)
  expect(result.timings!.totalMs).toBeGreaterThanOrEqual(result.timings!.providerMs)
  const openai = generator(vi.fn() as typeof fetch)
  await expect(openai.generate({ prompt: 'wrong tier', outputPath: 'wrong.png', imageSize: '4K' }, workspace)).rejects.toThrow('IMAGE_PROTOCOL_PARAMETER_MISMATCH')
})

it('exposes allowlisted provider parameter alternatives for repair without leaking provider error text', async () => {
  const workspace = await root(), secrets = new MemorySecrets()
  secrets.values.set('zerowall.ai-cloud.group.57', 'host-only-secret')
  const model = { providerId: 'zerowall-ai-cloud-57', groupId: '57', groupName: 'Images', modelId: 'gpt-image-2', baseUrl: 'https://code.aicodeme.xyz/v1', capability: 'image-generation' as const }
  const service = new AiCloudImageGenerator({ secrets, account: { current: async () => ({ ...signedIn(), models: [model], mediaModels: [] }) }, imageModel: async () => model, fetch: vi.fn(async () => new Response(JSON.stringify({ error: { param: 'size', message: 'private-signed-url', allowed_values: ['2048x1152', 'auto', 'private-signed-url'] } }), { status: 400 })) })
  await expect(service.generate({ prompt: 'retry advice', outputPath: 'repair.png' }, workspace)).rejects.toThrow('parameter=size; supported=2048x1152,auto')
  expect(await readFile(join(workspace, 'repair.png.generation.failed.json'), 'utf8')).not.toContain('private-signed-url')
})

it('recovers a Gemini URL download with the same parameters without a second generation POST', async () => {
  const workspace = await root(), secrets = new MemorySecrets(), png = await raster()
  secrets.values.set('zerowall.ai-cloud.group.69', 'host-only-secret')
  const model = { providerId: 'zerowall-ai-cloud-69', groupId: '69', groupName: 'Images', modelId: 'gemini-image', baseUrl: 'https://code.aicodeme.xyz/v1', capability: 'image-generation' as const }
  let downloading = false
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method === 'POST') return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ fileData: { fileUri: 'https://cdn.example.test/private-image.png?signature=private' } }] } }] }))
    if (!downloading) throw new Error('offline')
    return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } })
  })
  const service = new AiCloudImageGenerator({ secrets, account: { current: async () => ({ ...signedIn(), models: [model], mediaModels: [] }) }, imageModel: async () => model, fetch: fetcher })
  const input = { prompt: 'recover', outputPath: 'gemini-recover.png', imageSize: '4K', aspectRatio: '16:9' }
  await expect(service.generate(input, workspace)).rejects.toThrow('IMAGE_DOWNLOAD_FAILED')
  expect(await readFile(join(workspace, input.outputPath + '.generation.failed.json'), 'utf8')).not.toContain('signature=private')
  downloading = true
  const result = await service.generate(input, workspace)
  expect(result.resumedDownload).toBe(true)
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  expect([...secrets.values.keys()].filter(key => key.includes('image-pending'))).toEqual([])
})

it.each(['low', 'medium', 'high', 'xhigh', 'max', 'auto'] as const)('preserves native image quality %s even when the advisory catalog lists fewer levels', async quality => {
  const workspace = await root()
  const secrets = new MemorySecrets()
  secrets.values.set('zerowall.ai-cloud.group.53', 'host-only-secret')
  const model = { providerId: 'zerowall-ai-cloud-53-responses', groupId: '53', groupName: '生图分组-gpt逆向', modelId: 'gpt-image-2.5', baseUrl: 'https://code.aicodeme.xyz/v1', capability: 'image-generation' as const, qualities: ['low', 'medium', 'high'] }
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    expect(url).toBe('https://code.aicodeme.xyz/v1/images/generations')
    expect(JSON.parse(String(init?.body))).toEqual({ model: 'gpt-image-2.5', prompt: 'full slide template', size: 'auto', quality })
    return imageResponse(await raster(), { quality })
  })
  const media = { submit: vi.fn() }
  const service = new AiCloudImageGenerator({ secrets, account: { current: async () => ({ ...signedIn(), models: [model] }) }, imageModel: async () => model, imageQuality: async () => quality, fetch: fetcher, media: media as any })
  const result = await service.generate({ prompt: 'full slide template', outputPath: 'slide.png' }, workspace)
  expect(result).toMatchObject({ model: 'gpt-image-2.5', groupId: '53', requestedQuality: quality })
  expect(media.submit).not.toHaveBeenCalled()
  expect(fetcher).toHaveBeenCalledOnce()
})

it('uses Gemini wire format for a Gemini group even when the model name looks OpenAI-like', async () => {
  const workspace = await root(), secrets = new MemorySecrets()
  secrets.values.set('zerowall.ai-cloud.group.53', 'host-only-secret')
  const model = { providerId: 'zerowall-ai-cloud-53', groupId: '53', groupName: 'route', modelId: 'gpt-looking-image', baseUrl: 'https://code.aicodeme.xyz/v1', capability: 'image-generation' as const, imageProtocol: 'gemini' as const, qualities: [] }
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    expect(url).toBe('https://code.aicodeme.xyz/v1beta/models/gpt-looking-image:generateContent')
    const body = JSON.parse(String(init?.body))
    expect(body.contents[0].parts[0].text).toBe('gemini page')
    expect(body.prompt).toBeUndefined()
    expect(body.size).toBeUndefined()
    expect(body.generationConfig.imageConfig).toEqual({ imageSize: '4K' })
    expect(JSON.stringify(body)).not.toContain('quality')
    expect(JSON.stringify(body)).not.toContain('xhigh')
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: (await raster()).toString('base64') } }] } }] }), { status: 200 })
  })
  const result = await new AiCloudImageGenerator({ secrets, account: { current: async () => ({ ...signedIn(), models: [model] }) }, imageModel: async () => model, imageQuality: () => { throw new Error('Gemini must not read OpenAI quality') }, fetch: fetcher }).generate({ prompt: 'gemini page', outputPath: 'gemini.png' }, workspace)
  expect(result.model).toBe('gpt-looking-image')
  expect(result.requestedImageSize).toBe('4K')
  expect(JSON.parse(await readFile(result.receiptPath!, 'utf8')).requestedImageSize).toBe('4K')
  expect(fetcher).toHaveBeenCalledOnce()
})

it('uses upstream image capabilities for gemini-nano-banana-2.1 without a model-name special case', async () => {
  const workspace = await root(), secrets = new MemorySecrets()
  secrets.values.set('zerowall.ai-cloud.group.53', 'host-only-secret')
  const model = { providerId: 'zerowall-ai-cloud-53', groupId: '53', groupName: 'any-name', modelId: 'gemini-nano-banana-2.1', baseUrl: 'https://code.aicodeme.xyz/v1', capability: 'image-generation' as const, imageProtocol: 'gemini' as const, imageSizes: ['2048'], aspectRatios: ['16:9'], qualities: [] }
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    expect(url).toBe('https://code.aicodeme.xyz/v1beta/models/gemini-nano-banana-2.1:generateContent')
    const body = JSON.parse(String(init?.body))
    expect(body.generationConfig.imageConfig).toEqual({ aspectRatio: '16:9', imageSize: '2K' })
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: (await raster()).toString('base64') } }] } }] }), { status: 200 })
  })
  let selection = { providerId: model.providerId, groupId: model.groupId, modelId: model.modelId, imageSize: '' }
  const service = new AiCloudImageGenerator({ secrets, account: { current: async () => ({ ...signedIn(), models: [model] }) }, imageModel: async () => selection, fetch: fetcher })
  await expect(service.generate({ prompt: 'nano banana page', outputPath: 'unsupported.png' }, workspace)).rejects.toThrow('IMAGE_SIZE_UNSUPPORTED')
  expect(fetcher).not.toHaveBeenCalled()
  selection = { ...selection, imageSize: '2K' }
  await service.generate({ prompt: 'nano banana page', outputPath: 'nano.png', aspectRatio: '16:9' }, workspace)
  expect(fetcher).toHaveBeenCalledOnce()
})

it('uses OpenAI Images wire format for an OpenAI group even when the model name looks Gemini-like', async () => {
  const workspace = await root(), secrets = new MemorySecrets()
  secrets.values.set('zerowall.ai-cloud.group.53', 'host-only-secret')
  const model = { providerId: 'zerowall-ai-cloud-53', groupId: '53', groupName: 'route', modelId: 'gemini-looking-image', baseUrl: 'https://code.aicodeme.xyz/v1', capability: 'image-generation' as const, imageProtocol: 'openai' as const, qualities: [] }
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    expect(url).toBe('https://code.aicodeme.xyz/v1/images/generations')
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'gemini-looking-image', prompt: 'openai page' })
    return imageResponse(await raster())
  })
  await new AiCloudImageGenerator({ secrets, account: { current: async () => ({ ...signedIn(), models: [model] }) }, imageModel: async () => model, fetch: fetcher }).generate({ prompt: 'openai page', outputPath: 'openai.png' }, workspace)
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
it('describes Gemini output with the requested tier and ratio', () => {
  const result = renderImageResult('Generated', {
    path: 'C:/workspace/image.png', model: 'gemini-image', providerId: 'provider', groupId: 'group',
    bytes: 12, requestedSize: 'auto', requestedImageSize: '4K', requestedAspectRatio: '16:9',
    actualWidth: 3840, actualHeight: 2160, quality: 'auto', requestedQuality: 'auto', actualQuality: 'unreported',
  })
  const text = (result[0] as { text: string }).text
  expect(text).toContain('requested 4K tier, 16:9 aspect ratio; actual 3840x2160')
  expect(text).not.toContain('quality')
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
  it('uses current environment quality unless the task explicitly requests another value', async () => {
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
    expect(JSON.parse(String(bodies[2]))).toHaveProperty('quality', 'auto')
  })

  it('uses auto when environment quality is missing and reports unavailable settings', async () => {
    const service = generator(vi.fn() as typeof fetch, undefined, async () => undefined)
    await expect(service.resolveQuality()).resolves.toBe('auto')
    const unavailable = generator(vi.fn() as typeof fetch, undefined, async () => { throw new Error('environment unavailable') })
    await expect(unavailable.resolveQuality()).rejects.toThrow('IMAGE_CONFIGURATION_UNAVAILABLE')
  })

  it('applies updated model and OpenAI defaults on the same generator without stale overrides', async () => {
    const workspace = await root()
    const png = await raster()
    const models = [
      { providerId: 'zerowall-ai-cloud-7', groupId: '7', groupName: 'Images', modelId: 'image-a', baseUrl: 'https://code.aicodeme.xyz/v1', capability: 'image-generation' as const, imageProtocol: 'openai' as const, resolutions: ['1K', '2K'], aspectRatios: ['1:1', '16:9'], qualities: ['low', 'medium', 'high'] },
      { providerId: 'zerowall-ai-cloud-8', groupId: '8', groupName: 'Images', modelId: 'image-b', baseUrl: 'https://code.aicodeme.xyz/v1', capability: 'image-generation' as const, imageProtocol: 'openai' as const, resolutions: ['1K', '2K'], aspectRatios: ['1:1', '16:9'], qualities: ['low', 'medium', 'high'] },
    ]
    const secrets = new MemorySecrets()
    secrets.values.set('zerowall.ai-cloud.group.7', 'host-only-secret')
    secrets.values.set('zerowall.ai-cloud.group.8', 'host-only-secret')
    let selection = { providerId: models[0]!.providerId, groupId: models[0]!.groupId, modelId: models[0]!.modelId, resolution: '1K', aspectRatio: '1:1' }
    let quality: 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' = 'medium'
    const bodies: Record<string, unknown>[] = []
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return imageResponse(png)
    })
    const service = new AiCloudImageGenerator({
      secrets,
      account: { current: async () => ({ ...signedIn(), models, mediaModels: [] }) },
      imageModel: async () => selection,
      imageQuality: async () => quality,
      fetch: fetcher,
    })

    await service.generate({ prompt: 'first', outputPath: 'first.png', model: 'image-b' }, workspace)
    selection = { providerId: models[1]!.providerId, groupId: models[1]!.groupId, modelId: models[1]!.modelId, resolution: '2K', aspectRatio: '16:9' }
    quality = 'high'
    await service.generate({ prompt: 'second', outputPath: 'second.png', model: 'image-a' }, workspace)

    expect(bodies[0]).toMatchObject({ model: 'image-a', quality: 'medium', resolution: '1K', aspect_ratio: '1:1' })
    expect(bodies[0]).not.toHaveProperty('size')
    expect(bodies[1]).toMatchObject({ model: 'image-b', quality: 'high', resolution: '2K', aspect_ratio: '16:9' })
    expect(bodies[1]).not.toHaveProperty('size')

    selection = { providerId: models[0]!.providerId, groupId: models[0]!.groupId, modelId: models[0]!.modelId, resolution: '', aspectRatio: '1:1' }
    quality = 'auto'
    await service.generate({ prompt: 'default settings', outputPath: 'default-settings.png', model: 'image-b' }, workspace)
    expect(bodies[2]).toMatchObject({ model: 'image-a', prompt: 'default settings', aspect_ratio: '1:1' })
    expect(bodies[2]).toHaveProperty('size', 'auto')
    expect(bodies[2]).not.toHaveProperty('resolution')
    expect(bodies[2]).toHaveProperty('quality', 'auto')
  })

  it('uses the current Gemini model, ratio, and image size on the same generator', async () => {
    const workspace = await root()
    const png = await raster()
    const models = [
      { providerId: 'zerowall-ai-cloud-7', groupId: '7', groupName: 'Gemini', modelId: 'gemini-image-a', baseUrl: 'https://code.aicodeme.xyz/v1', capability: 'image-generation' as const, imageProtocol: 'gemini' as const, imageSizes: ['1K', '2K', '4K'], aspectRatios: ['1:1', '4:3', '16:9'] },
      { providerId: 'zerowall-ai-cloud-8', groupId: '8', groupName: 'Gemini', modelId: 'gemini-image-b', baseUrl: 'https://code.aicodeme.xyz/v1', capability: 'image-generation' as const, imageProtocol: 'gemini' as const, imageSizes: ['1K', '2K', '4K'], aspectRatios: ['1:1', '4:3', '16:9'] },
    ]
    const secrets = new MemorySecrets()
    secrets.values.set('zerowall.ai-cloud.group.7', 'host-only-secret')
    secrets.values.set('zerowall.ai-cloud.group.8', 'host-only-secret')
    let selection = { providerId: models[0]!.providerId, groupId: models[0]!.groupId, modelId: models[0]!.modelId, imageSize: '1K', aspectRatio: '1:1' }
    const bodies: Array<{ url: string; body: any }> = []
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      bodies.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: png.toString('base64') } }] } }] }), { status: 200 })
    })
    const service = new AiCloudImageGenerator({
      secrets,
      account: { current: async () => ({ ...signedIn(), models, mediaModels: [] }) },
      imageModel: async () => selection,
      fetch: fetcher,
    })

    await service.generate({ prompt: 'first', outputPath: 'gemini-first.png', model: 'gemini-image-b' }, workspace)
    selection = { providerId: models[1]!.providerId, groupId: models[1]!.groupId, modelId: models[1]!.modelId, imageSize: '4K', aspectRatio: '16:9' }
    await service.generate({ prompt: 'second', outputPath: 'gemini-second.png', model: 'gemini-image-a' }, workspace)

    expect(bodies[0]?.url).toContain('/models/gemini-image-a:generateContent')
    expect(bodies[0]?.body.generationConfig.imageConfig).toEqual({ aspectRatio: '1:1', imageSize: '1K' })
    expect(bodies[1]?.url).toContain('/models/gemini-image-b:generateContent')
    expect(bodies[1]?.body.generationConfig.imageConfig).toEqual({ aspectRatio: '16:9', imageSize: '4K' })

    selection = { providerId: models[1]!.providerId, groupId: models[1]!.groupId, modelId: models[1]!.modelId, imageSize: '', aspectRatio: '16:9' }
    await service.generate({ prompt: 'default size', outputPath: 'gemini-default-size.png' }, workspace)
    expect(bodies[2]?.body.generationConfig.imageConfig).toEqual({ aspectRatio: '16:9', imageSize: '4K' })
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
    expect(JSON.parse(String(request.body))).toMatchObject({ model: 'gpt-image-2', prompt: 'A scientific cover', size: 'auto' })
    expect(JSON.parse(String(request.body))).toHaveProperty('quality', 'auto')
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

  it('uses the current environment resolution and quality for media generation and edits', async () => {
    const workspace = await root()
    const png = await raster()
    const model = { ...signedIn().mediaModels[0]!, resolutions: ['2K'] }
    const secrets = new MemorySecrets()
    secrets.values.set(`zerowall.ai-cloud.group.${model.groupId}`, 'host-only-secret')
    const requests: any[] = []
    const media = {
      submit: vi.fn(async (request: any) => { requests.push(request); return { requestId: request.requestId, status: 'completed', artifacts: [{ key: 'image.png' }] } }),
      download: vi.fn(async () => ({ bytes: png, mediaType: 'image/png' })),
    }
    const service = new AiCloudImageGenerator({
      secrets,
      account: { current: async () => ({ ...signedIn(), mediaModels: [model] }) },
      imageModel: async () => ({ providerId: model.providerId, groupId: model.groupId, modelId: model.modelId, profileId: model.profileId, resolution: '2K' }),
      imageQuality: async () => 'high',
      media: media as any,
    })
    await service.generate({ prompt: 'large', outputPath: 'large.png' }, workspace)
    await writeFile(join(workspace, 'source.png'), png)
    await service.edit({ prompt: 'large edit', inputPaths: ['source.png'], outputPath: 'edited.png' }, workspace)
    expect(requests).toHaveLength(2)
    expect(requests[0]?.parameters).toEqual({ quality: 'high', resolution: '2K' })
    expect(requests[1]?.parameters).toEqual({ quality: 'high', resolution: '2K' })
    expect(requests[1]?.references).toHaveLength(1)
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
