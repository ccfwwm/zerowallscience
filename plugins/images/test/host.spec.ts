import { mkdtemp, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import React from 'react'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiCloudImageGenerator } from '../src/host/generator.js'
import type { AccountSecretStore } from '@zerowallscience/plugin-account'

class MemorySecrets implements AccountSecretStore {
  readonly values = new Map<string, string>()
  async get(key: string): Promise<string | undefined> { return this.values.get(key) }
  async set(key: string, value: string): Promise<void> { this.values.set(key, value) }
  async delete(key: string): Promise<void> { this.values.delete(key) }
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
  return {
    status: 'signedIn' as const,
    balanceFreshness: 'current' as const,
    lowBalance: false,
    models: [{
      providerId: 'zerowall-ai-cloud-7', groupId: '7', groupName: '生图', capability: 'image-generation',
      modelId: 'gpt-image-2', baseUrl: 'https://code.aicodeme.xyz/v1',
    }],
  }
}

function generator(fetcher: typeof fetch, attachment?: ImageAttachmentRef | Error, imageQuality?: () => Promise<'auto' | 'low' | 'medium' | 'high' | undefined>) {
  const secrets = new MemorySecrets()
  secrets.values.set('zerowall.ai-cloud.group.7', 'host-only-secret')
  return new AiCloudImageGenerator({
    secrets,
    account: { current: async () => signedIn() },
    fetch: fetcher,
    ...(imageQuality === undefined ? {} : { imageQuality }),
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

describe('AI Cloud image generation and editing', () => {
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
    expect((bodies[1] as FormData).get('quality')).toBe('medium')
    expect(JSON.parse(String(bodies[2]))).toMatchObject({ quality: 'auto' })
  })

  it('falls back to auto when environment quality is missing', async () => {
    const service = generator(vi.fn() as typeof fetch, undefined, async () => undefined)
    await expect(service.resolveQuality()).resolves.toBe('auto')
    const unavailable = generator(vi.fn() as typeof fetch, undefined, async () => { throw new Error('environment unavailable') })
    await expect(unavailable.resolveQuality()).resolves.toBe('auto')
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
    expect(JSON.parse(String(request.body))).toMatchObject({ model: 'gpt-image-2', prompt: 'A scientific cover', size: 'auto', quality: 'auto', output_format: 'png' })
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
      if (init?.body instanceof FormData) {
        expect(init.body.get('size')).toBe('2048x2048')
        expect(init.body.get('quality')).toBe('high')
      } else {
        expect(JSON.parse(String(init?.body))).toMatchObject({ size: '2048x2048', quality: 'low' })
      }
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

  it('sends repeated image[] multipart fields without an explicit content-type boundary', async () => {
    const workspace = await root()
    await writeFile(join(workspace, 'one.png'), await raster('png', 8, 6))
    await writeFile(join(workspace, 'two.webp'), await raster('webp', 5, 5))
    await writeFile(join(workspace, 'mask.png'), await raster('png', 8, 6, true))
    const png = await raster('png', 12, 10)
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const form = init?.body as FormData
      expect(form).toBeInstanceOf(FormData)
      expect(form.getAll('image[]')).toHaveLength(2)
      expect(form.get('mask')).toBeInstanceOf(File)
      expect(form.get('model')).toBe('gpt-image-2')
      expect(form.get('input_fidelity')).toBeNull()
      expect(new Headers(init?.headers).has('content-type')).toBe(false)
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
      const form = init?.body as FormData
      expect(form.get('mask')).toBeNull()
      expect(form.getAll('image[]')).toHaveLength(1)
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
      const form = init?.body as FormData
      expect(form.get('mask')).toBeNull()
      expect(form.getAll('image[]')).toHaveLength(1)
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
      .rejects.toThrow('could not be reached')
    await expect(service.generate({ prompt: 'spring', outputPath: 'spring-2.png' }, workspace))
      .rejects.not.toThrow('host-only-secret')
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
      .rejects.toThrow('HTTP 502')
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
    await expect(broken.generate({ prompt: 'x', outputPath: 'http.png' }, workspace)).rejects.toThrow('HTTP 429')
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
    await expect(service.generate({ prompt: 'x', outputPath: 'inside.png' }, workspace)).rejects.toThrow('no configured gpt-image-2')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
