import { createHash, randomUUID } from 'node:crypto'
import { link, lstat, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import type { ImageAttachmentRef, ImageMediaType, SaveImageAttachment } from '@deepseek-ai/dsh-attachment'
import sharp from 'sharp'
import type { AccountSecretStore } from '@zerowallscience/plugin-account'
import type { AiCloudAccountSnapshot, AiCloudManagedModel } from '@zerowallscience/plugin-account/types'
import type { ImageGenerationQuality, ImageModelSelection } from '@zerowallscience/plugin-environment/types'
import { AiCloudMediaService, type ZeroWallMedia, type MediaRequest } from '@zerowallscience/plugin-ai-cloud'
import type { AiCloudMediaModel } from '@zerowallscience/plugin-account/types'
import { isImageGenerationGroup, uniqueMediaModels } from '@zerowallscience/plugin-account'
import { withPresentationLock } from './visual-assets.js'

const MAX_INPUT_IMAGES = 16
const MAX_INPUT_IMAGE_BYTES = 50 * 1024 * 1024
const MAX_OUTPUT_IMAGE_BYTES = 64 * 1024 * 1024
// `auto` is the transport fallback when no environment settings service is
// available. The normal ZeroWall environment schema supplies `medium`.
const DEFAULT_IMAGE_QUALITY: ImageGenerationQuality = 'auto'

const IMAGE_MEDIA_TYPES: Readonly<Record<string, ImageMediaType>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

const SHARP_MEDIA_TYPES: Readonly<Record<string, ImageMediaType>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

export interface GenerateImageInput {
  prompt: string
  outputPath: string
  model?: string
  size?: ImageSize
  quality?: ImageGenerationQuality
  overwrite?: boolean
}

export interface EditImageInput extends GenerateImageInput {
  inputPaths: string[]
  maskPath?: string
}

export interface ImageAttachmentValue {
  attachmentId: string
  mediaType: ImageMediaType
  bytes: number
  width: number
  height: number
  name?: string
}

export interface GenerateImageResult {
  path: string
  model: string
  providerId: string
  groupId: string
  bytes: number
  requestedSize: ImageSize
  actualWidth: number
  actualHeight: number
  quality: ImageGenerationQuality
  /** The quality requested at the API boundary (kept separate for audits). */
  requestedQuality: ImageGenerationQuality
  /** Provider-reported quality; never infer it from the request. */
  actualQuality: ImageGenerationQuality | 'unreported'
  revisedPrompt?: string
  image?: ImageAttachmentValue
  /** Stable attachment name used by cross-plugin consumers. */
  attachment?: ImageAttachmentValue
  previewWarning?: string
  sha256?: string
  receiptPath?: string
  promptHash?: string
  inputImageHashes?: string[]
  cached?: boolean
}

export interface AccountReader { current(): Promise<AiCloudAccountSnapshot> }
export interface ImageAttachmentWriter { saveImage(input: SaveImageAttachment): Promise<ImageAttachmentRef> }
export interface AiCloudImageGeneratorOptions {
  secrets: AccountSecretStore
  /** Isolated storage root for embedded consumers and tests. */
  mediaCacheDir?: string
  account: AccountReader
  fetch?: typeof fetch
  attachments?: () => ImageAttachmentWriter | undefined
  imageModel?: () => Promise<ImageModelSelection | undefined>
  imageQuality?: () => Promise<ImageGenerationQuality | undefined>
  media?: ZeroWallMedia
  retryDelayMs?: number
}

let activeImages = 0
const imageQueue: Array<() => void> = []
async function imageSlot<T>(action: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted()
  await new Promise<void>((accept, reject) => {
    const start = () => { signal?.removeEventListener('abort', abort); activeImages++; accept() }
    const abort = () => { const i = imageQueue.indexOf(start); if (i >= 0) imageQueue.splice(i, 1); reject(signal?.reason) }
    if (activeImages < 2) start()
    else { imageQueue.push(start); signal?.addEventListener('abort', abort, { once: true }) }
  })
  try { signal?.throwIfAborted(); return await action() } finally { activeImages--; imageQueue.shift()?.() }
}
export type ImageSize = 'auto' | `${number}x${number}`

interface InspectedImage {
  path: string
  data: Uint8Array
  mediaType: ImageMediaType
  width: number
  height: number
  hasAlpha: boolean
}

export class AiCloudImageGenerator {
  private readonly fetcher: typeof fetch
  private snapshot?: AiCloudAccountSnapshot
  private readonly media: ZeroWallMedia

  constructor(private readonly options: AiCloudImageGeneratorOptions) {
    this.fetcher = options.fetch ?? fetch
    this.media = options.media ?? new AiCloudMediaService({ current: () => options.account.current(), discoverModels: () => options.account.current() }, options.secrets, { fetch: this.fetcher, ...(options.mediaCacheDir?{cacheDir:options.mediaCacheDir}:{}) })
  }

  update(snapshot: AiCloudAccountSnapshot): void { this.snapshot = snapshot }

  /** Resolve the exact quality value that must be sent to the image API. */
  async resolveQuality(explicit?: ImageGenerationQuality): Promise<ImageGenerationQuality> {
    if (explicit !== undefined) {
      if (!isImageQuality(explicit)) throw new Error('quality must be auto, low, medium, high, xhigh, or max')
      return explicit
    }
    let configured: ImageGenerationQuality | undefined
    try { configured = await this.options.imageQuality?.() } catch { throw new Error('IMAGE_CONFIGURATION_UNAVAILABLE: 无法读取环境配置中的生图质量，请恢复配置服务后重试。') }
    if (configured !== undefined && !isImageQuality(configured)) throw new Error('IMAGE_CONFIGURATION_INVALID: 环境配置中的生图质量无效，请重新选择。')
    return configured ?? DEFAULT_IMAGE_QUALITY
  }

  async generate(input: GenerateImageInput, cwd: string, signal?: AbortSignal): Promise<GenerateImageResult> {
    return withPresentationLock(`image:${resolve(cwd, input.outputPath)}`, () => this.generateOnce(input, cwd, signal))
  }
  private async generateOnce(input: GenerateImageInput, cwd: string, signal?: AbortSignal): Promise<GenerateImageResult> {
    const prompt = nonEmptyPrompt(input.prompt)
    const size = validateImageSize(input.size)
    const quality = await this.resolveQuality(input.quality)
    const workspace = await workspaceRoot(cwd)
    const target = await safeOutputPath(workspace, input.outputPath, true)
    const model = await this.resolveModel(input.model)
    const requestHash = this.requestHash('generate', model, prompt, size, quality, []) + createHash('sha256').update(JSON.stringify(await this.readImageModel())).digest('hex')
    const cached = await this.cached(target, requestHash, signal)
    if (cached) return cached
    await safeOutputPath(workspace, input.outputPath, input.overwrite ?? false)
    try {
    const response = await this.imageResponse(model, { prompt, size, quality, requestId: 'image-' + createHash('sha256').update(target + requestHash).digest('hex') }, signal)
    const result = await this.finishResponse(response, workspace, target, model, size, quality, input.overwrite ?? false, signal)
    return await this.receipt(result, prompt, [], workspace, requestHash)
    } catch (error) {
      await this.recordFailure(workspace, target, { operation: 'generate_image', prompt, model: model.modelId, providerId: model.providerId, groupId: model.groupId, size, quality, inputImageHashes: [] }, error)
      throw error
    }
  }

  async edit(input: EditImageInput, cwd: string, signal?: AbortSignal): Promise<GenerateImageResult> {
    return withPresentationLock(`image:${resolve(cwd, input.outputPath)}`, () => this.editOnce(input, cwd, signal))
  }
  private async editOnce(input: EditImageInput, cwd: string, signal?: AbortSignal): Promise<GenerateImageResult> {
    const prompt = nonEmptyPrompt(input.prompt)
    const size = validateImageSize(input.size)
    const quality = await this.resolveQuality(input.quality)
    if (!Array.isArray(input.inputPaths) || input.inputPaths.length === 0) {
      throw new Error('input_paths must contain at least one image')
    }
    if (input.inputPaths.length > MAX_INPUT_IMAGES) {
      throw new Error(`input_paths accepts at most ${MAX_INPUT_IMAGES} images`)
    }

    const workspace = await workspaceRoot(cwd)
    const target = await safeOutputPath(workspace, input.outputPath, true)
    const images: InspectedImage[] = []
    for (let index = 0; index < input.inputPaths.length; index += 1) {
      images.push(await inspectInputImage(workspace, input.inputPaths[index]!, `input_paths[${index}]`, signal))
    }
    const maskPath = input.maskPath?.trim()
    const requestedMask = maskPath === undefined || maskPath.length === 0
      ? undefined
      : await inspectInputImage(workspace, maskPath, 'mask_path', signal)
    // Models sometimes echo the primary image path into mask_path for a
    // whole-image edit. The source image is not an alpha mask, so omit it.
    const mask = requestedMask !== undefined && !sameImagePath(requestedMask.path, images[0]!.path)
      ? requestedMask
      : undefined
    if (mask !== undefined) validateMask(mask, images[0]!)

    const model = await this.resolveModel(input.model)
    const requestHash = this.requestHash('edit', model, prompt, size, quality, images.map(image => image.data), mask?.data) + createHash('sha256').update(JSON.stringify(await this.readImageModel())).digest('hex')
    const cached = await this.cached(target, requestHash, signal)
    if (cached) return cached
    await safeOutputPath(workspace, input.outputPath, input.overwrite ?? false)
    try {
    const response = await this.imageResponse(model, { prompt, size, quality, requestId: 'image-' + createHash('sha256').update(target + requestHash).digest('hex'), references: images.map(image => ({ mediaType: image.mediaType, base64: Buffer.from(image.data).toString('base64'), name: basename(image.path) })), ...(mask ? { mask: { mediaType: mask.mediaType, base64: Buffer.from(mask.data).toString('base64') } } : {}) }, signal)
    const result = await this.finishResponse(response, workspace, target, model, size, quality, input.overwrite ?? false, signal)
    return await this.receipt(result, prompt, images.map(image => image.data), workspace, requestHash)
    } catch (error) {
      await this.recordFailure(workspace, target, { operation: 'edit_image', prompt, model: model.modelId, providerId: model.providerId, groupId: model.groupId, size, quality, inputPaths: images.map(image => image.path), inputImageHashes: images.map(image => createHash('sha256').update(image.data).digest('hex')) }, error)
      throw error
    }
  }

  private async recordFailure(workspace: string, output: string, request: object, error: unknown): Promise<void> {
    const path = await safeOutputPath(workspace, output + '.generation.failed.json', true, '.json')
    await atomicWrite(workspace, path, Buffer.from(JSON.stringify({ schemaVersion: 1, output, request, reason: errorMessage(error).slice(0, 1000), createdAt: new Date().toISOString() }, null, 2)), true)
  }

  private requestHash(operation: string, model: AiCloudManagedModel, prompt: string, size: ImageSize, quality: ImageGenerationQuality, inputs: Uint8Array[], mask?: Uint8Array): string {
    const digest = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
    return digest(Buffer.from(JSON.stringify({ operation, model: model.modelId, provider: model.providerId, group: model.groupId, endpoint: model.baseUrl, prompt, size, quality, inputs: inputs.map(digest), mask: mask ? digest(mask) : null })))
  }
  private async cached(target: string, requestHash: string, signal?: AbortSignal): Promise<GenerateImageResult | undefined> {
    signal?.throwIfAborted()
    try {
      const receipt = JSON.parse(await readFile(target + '.generation.json', 'utf8'))
      if (receipt.requestHash !== requestHash) return undefined
      const bytes = await readFile(target)
      if (createHash('sha256').update(bytes).digest('hex') !== receipt.sha256) return undefined
      const metadata = await sharp(bytes).metadata()
      if (metadata.width !== receipt.actualWidth || metadata.height !== receipt.actualHeight) return undefined
      const { prompt: _prompt, createdAt: _createdAt, requestHash: _requestHash, mediaType: _mediaType, ...result } = receipt
      // Attachment stores are session/runtime scoped. Refresh the reference.
      delete result.image; delete result.attachment
      const attachments = this.options.attachments?.()
      if (attachments) { const ref = await attachments.saveImage({ data: bytes, mediaType: 'image/png', name: basename(target) }); result.image = attachmentValue(ref); result.attachment = result.image }
      return { ...result, path: target, cached: true }
    } catch (error) { if (signal?.aborted) throw error; return undefined }
  }
  private async receipt(result: GenerateImageResult, prompt: string, inputs: Uint8Array[], workspace: string, requestHash: string): Promise<GenerateImageResult> {
    const hash = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex')
    const receiptPath = result.path + '.generation.json'
    const enriched = { ...result, sha256: hash(await readFile(result.path)), receiptPath, promptHash: hash(prompt), inputImageHashes: inputs.map(hash) }
    const target = await safeOutputPath(workspace, receiptPath, true, '.json')
    await atomicWrite(workspace, target, Buffer.from(JSON.stringify({ ...enriched, requestHash, mediaType: 'image/png', prompt, createdAt: new Date().toISOString() }, null, 2)), true)
    return enriched
  }

  async resolveModel(requested?: string): Promise<AiCloudManagedModel> {
    const snapshot = this.snapshot ?? await this.options.account.current()
    this.snapshot = snapshot
    const configured = await this.readImageModel()
    if (snapshot.status !== 'signedIn') throw new Error('请先登录 ZeroWall AI Cloud，再生成演示文稿视觉。')
    const imageModels: AiCloudManagedModel[] = [
      ...snapshot.models.filter(model => model.capability === 'image-generation' && isImageGenerationGroup(model.groupName) && !model.stale),
      ...uniqueMediaModels((snapshot.mediaModels ?? []).filter(model => model.mediaType === 'image' && isImageGenerationGroup(model.groupName) && !model.stale)),
    ]
    const selectedCandidates = configured?.modelId
      ? imageModels.filter(candidate => candidate.modelId === configured.modelId
        && candidate.providerId === configured.providerId && candidate.groupId === configured.groupId && (!configured.profileId || ('profileId' in candidate && candidate.profileId === configured.profileId)))
      : []
    const selected = selectedCandidates.length === 1 ? selectedCandidates[0] : undefined
    const requestedId = requested?.trim()
    if (requestedId) {
      if (selected?.modelId === requestedId) return selected
      if (configured?.modelId === requestedId && configured.profileId !== undefined
        && configured.providerId && configured.groupId
        && !selectedCandidates.length) {
        throw new Error('当前环境中的生图模型能力配置已失效，请在“环境配置”中重新选择具体配置。')
      }
      const candidates = imageModels.filter(model => model.modelId === requestedId)
      if (candidates.length > 1) throw new Error('该模型有多套能力配置，请在环境配置中选择具体配置。')
      const candidate = candidates[0]
      if (candidate) return candidate
      throw new Error(`当前账户没有可用的 ${requestedId} 生图模型，请在“环境配置”中刷新或选择生图模型。`)
    }
    if (selected) return selected
    throw new Error('请在环境配置中选择名称含“图片”或“生图”的分组中的生图模型；历史选择失效时需重新选择。')
  }

  private async imageResponse(model: AiCloudManagedModel, input: { prompt: string; size: ImageSize; quality: ImageGenerationQuality; requestId: string; references?: MediaRequest['references']; mask?: MediaRequest['mask'] }, signal?: AbortSignal): Promise<Response> {
    if (model.capability === 'media') return this.mediaResponse(model as AiCloudMediaModel, input, signal)
    const url = new URL(model.baseUrl)
    if (url.protocol !== 'https:' || !['hkcode.aicodeme.xyz', 'code.aicodeme.xyz', 'code.aicodeme.cn'].includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !['/v1', '/v1/'].includes(url.pathname)) throw new Error('IMAGE_UNTRUSTED_GATEWAY')
    if (input.quality !== 'auto' && model.qualities?.length && !model.qualities.includes(input.quality)) throw new Error('IMAGE_UNSUPPORTED_QUALITY: 当前模型不支持所选质量，请选择其他质量或自动。')
    const key = await this.options.secrets.get(`zerowall.ai-cloud.group.${model.groupId}`)
    if (!key?.trim()) throw new Error('IMAGE_CREDENTIAL_UNAVAILABLE: 请刷新账号。')
    const headers: Record<string, string> = { authorization: `Bearer ${key.trim()}`, 'Idempotency-Key': input.requestId }
    const parameters = { model: model.modelId, prompt: input.prompt, ...(input.size === 'auto' ? {} : { size: input.size }), ...(input.quality === 'auto' ? {} : { quality: input.quality }) }
    let body: string | FormData
    const editing = Boolean(input.references?.length)
    if (editing) {
      body = new FormData()
      for (const [name, value] of Object.entries(parameters)) body.set(name, value)
      for (const image of input.references!) body.append('image[]', new Blob([Buffer.from(image.base64, 'base64')], { type: image.mediaType }), image.name ?? 'reference.png')
      if (input.mask) body.set('mask', new Blob([Buffer.from(input.mask.base64, 'base64')], { type: input.mask.mediaType }), 'mask.png')
    } else { headers['content-type'] = 'application/json'; body = JSON.stringify(parameters) }
    return imageSlot(() => this.fetcher(`${url.origin}/v1/images/${editing ? 'edits' : 'generations'}`, { method: 'POST', headers, body, redirect: 'error', ...(signal ? { signal } : {}) }), signal)
  }

  private async mediaResponse(model: AiCloudMediaModel, input: { prompt: string; size: ImageSize; quality: ImageGenerationQuality; requestId: string; references?: MediaRequest['references']; mask?: MediaRequest['mask'] }, signal?: AbortSignal): Promise<Response> {
    const editing = (input.references?.length ?? 0) > 0
    const operation = model.operations.includes('gemini_image') ? 'gemini_image' : editing ? 'image_edit' : 'image'
    const configured = await this.readImageModel()
    const appliesParameters = configured !== undefined
      && configured.providerId === model.providerId
      && configured.groupId === model.groupId
      && configured.modelId === model.modelId
      && (configured.profileId === undefined || configured.profileId === model.profileId)
    const task = await imageSlot(async () => {
      const request: MediaRequest = { groupId: model.groupId, modelId: model.modelId, profileId: model.profileId, operation, requestId: input.requestId, prompt: input.prompt, parameters: { ...(input.size === 'auto' && !model.sizes.includes('auto') ? {} : { size: input.size }), ...(input.quality === 'auto' && !model.qualities.includes('auto') ? {} : { quality: input.quality }), ...(appliesParameters && configured?.resolution ? {resolution:configured.resolution} : {}), ...(appliesParameters && configured?.aspectRatio ? {aspect_ratio:configured.aspectRatio} : {}) }, ...(input.references ? { references: input.references } : {}), ...(input.mask ? { mask: input.mask } : {}), async: true }
      const submitted = await this.media.submit(request, signal)
      return ['completed', 'succeeded'].includes(submitted.status) ? submitted : this.media.wait(submitted.requestId, 600_000, signal)
    }, signal)
    if (!['completed', 'succeeded'].includes(task.status) || !task.artifacts.length) throw new Error('媒体任务未完成，请恢复原任务：' + task.requestId)
    const result = await this.media.download(task.requestId, task.artifacts[0]!.key, signal)
    return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(result.bytes).toString('base64'), revised_prompt: task.artifacts[0]?.revisedPrompt, quality: task.artifacts[0]?.quality }] }), { headers: { 'content-type': 'application/json' } })
  }

  private async readImageModel(): Promise<ImageModelSelection | undefined> {
    try { return await this.options.imageModel?.() }
    catch { throw new Error('IMAGE_CONFIGURATION_UNAVAILABLE: 无法读取环境配置中的生图模型，请恢复配置服务后重试。') }
  }

  private async finishResponse(
    response: Response,
    workspace: string,
    target: string,
    model: AiCloudManagedModel,
    requestedSize: ImageSize,
    quality: ImageGenerationQuality,
    overwrite: boolean,
    signal?: AbortSignal,
  ): Promise<GenerateImageResult> {
    if (!response.ok) {
      const action = response.status === 400 || response.status === 422 ? 'Correct the request parameters before retrying.' : response.status === 401 || response.status === 403 ? 'Refresh the account credentials.' : 'Keep successful assets and retry this request after checking the service.'
      throw new Error(`Image request failed (HTTP ${response.status}). ${action}`)
    }
    signal?.throwIfAborted()
    const decoded = await decodeImagePayload(await response.json() as unknown, this.fetcher, signal)
    const png = await normalizePng(decoded.bytes, signal)
    const metadata = await sharp(png, { failOn: 'error' }).metadata()
    if (!Number.isInteger(metadata.width) || !Number.isInteger(metadata.height)) {
      throw new Error('Generated image has no readable dimensions.')
    }
    await atomicWrite(workspace, target, png, overwrite)

    const base: GenerateImageResult = {
      path: target,
      model: model.modelId,
      providerId: model.providerId,
      groupId: model.groupId,
      bytes: png.byteLength,
      requestedSize,
      actualWidth: metadata.width,
      actualHeight: metadata.height,
      quality,
      requestedQuality: quality,
      actualQuality: decoded.actualQuality ?? 'unreported',
      ...(decoded.revisedPrompt === undefined ? {} : { revisedPrompt: decoded.revisedPrompt }),
    }
    const attachments = this.options.attachments?.()
    if (attachments === undefined) {
      return { ...base, previewWarning: 'Image preview is unavailable because no attachment service is mounted.' }
    }
    try {
      const ref = await attachments.saveImage({ data: png, mediaType: 'image/png', name: basename(target) })
      const attachment = attachmentValue(ref)
      return { ...base, image: attachment, attachment }
    } catch (error) {
      return { ...base, previewWarning: `Image was saved, but its conversation preview could not be stored: ${errorMessage(error)}` }
    }
  }
}

function nonEmptyPrompt(raw: string): string {
  const prompt = raw.trim()
  if (!prompt) throw new Error('prompt must be a non-empty string')
  return prompt
}

export function validateImageSize(raw: string | undefined): ImageSize {
  const value = raw?.trim() || 'auto'
  if (value === 'auto') return value
  const match = /^(\d+)x(\d+)$/u.exec(value)
  if (match === null) throw new Error('size must be auto or a positive WIDTHxHEIGHT value, for example 2048x2048')
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error('size must use positive integer dimensions, for example 2048x2048')
  }
  if (width % 16 !== 0 || height % 16 !== 0) {
    throw new Error('size width and height must be multiples of 16')
  }
  const ratio = width / height
  if (ratio < 1 / 3 || ratio > 3) {
    throw new Error('size aspect ratio must be between 1:3 and 3:1')
  }
  // OpenAI permits up to 3840x2160 for landscape and the transposed
  // dimensions for portrait. Keep both axes bounded while allowing square
  // and custom 16:9/9:16 requests.
  const landscape = width >= height
  const maxWidth = landscape ? 3840 : 2160
  const maxHeight = landscape ? 2160 : 3840
  if (width > maxWidth || height > maxHeight) {
    throw new Error(`size exceeds the supported maximum of ${maxWidth}x${maxHeight}`)
  }
  return value as ImageSize
}

function isImageQuality(value: unknown): value is ImageGenerationQuality {
  return value === 'auto' || value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh' || value === 'max'
}

async function workspaceRoot(cwd: string): Promise<string> {
  if (!isAbsolute(cwd)) throw new Error('The session working directory must be absolute.')
  const root = await realpath(cwd)
  if (!(await stat(root)).isDirectory()) throw new Error('The session working directory must be a directory.')
  return root
}

function rejectParentTraversal(raw: string, label: string): void {
  if (raw.split(/[\\/]+/u).includes('..')) throw new Error(`${label} must not contain '..' path segments`)
}

function assertInside(root: string, target: string, label: string): void {
  const rel = relative(root, target)
  if (rel === '..' || rel.startsWith(`..\\`) || rel.startsWith('../') || isAbsolute(rel)) {
    throw new Error(`${label} must stay inside the current session working directory`)
  }
}

async function safeOutputPath(root: string, raw: string, overwrite: boolean, expectedExtension = '.png'): Promise<string> {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('output_path must be a non-empty PNG path')
  rejectParentTraversal(trimmed, 'output_path')
  const target = resolve(root, trimmed)
  assertInside(root, target, 'output_path')
  if (extname(target).toLowerCase() !== expectedExtension) throw new Error(`output_path must use the ${expectedExtension} extension`)
  await assertExistingAncestorInside(root, dirname(target), 'output_path')
  try {
    const info = await lstat(target)
    const resolved = await realpath(target)
    assertInside(root, resolved, 'output_path')
    if (!info.isFile() && !info.isSymbolicLink()) throw new Error('output_path must name a file')
    if (!overwrite) throw new Error('output_path already exists; set overwrite=true to replace it')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  return target
}

async function assertExistingAncestorInside(root: string, start: string, label: string): Promise<void> {
  let current = start
  for (;;) {
    try {
      const resolved = await realpath(current)
      assertInside(root, resolved, label)
      return
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
      const parent = dirname(current)
      if (parent === current) throw error
      current = parent
    }
  }
}

async function inspectInputImage(root: string, raw: string, label: string, signal?: AbortSignal): Promise<InspectedImage> {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error(`${label} must be a non-empty image path`)
  rejectParentTraversal(trimmed, label)
  const declared = IMAGE_MEDIA_TYPES[extname(trimmed).toLowerCase()]
  if (declared === undefined) throw new Error(`${label} must use PNG, JPEG, or WebP`)
  const requested = resolve(root, trimmed)
  assertInside(root, requested, label)
  const path = await realpath(requested)
  assertInside(root, path, label)
  const info = await stat(path)
  if (!info.isFile()) throw new Error(`${label} must name a regular file`)
  if (info.size > MAX_INPUT_IMAGE_BYTES) throw new Error(`${label} exceeds the 50 MiB limit`)
  signal?.throwIfAborted()
  const data = new Uint8Array(await readFile(path, signal === undefined ? undefined : { signal }))
  signal?.throwIfAborted()
  let metadata: { format?: string; width?: number; height?: number; hasAlpha?: boolean }
  try {
    const image = sharp(data, { failOn: 'error', limitInputPixels: false })
    metadata = await image.metadata()
    await image.raw().toBuffer()
  } catch (error) {
    throw new Error(`${label} is not a valid PNG, JPEG, or WebP image`, { cause: error })
  }
  const mediaType = SHARP_MEDIA_TYPES[metadata.format ?? '']
  if (mediaType === undefined || metadata.width === undefined || metadata.height === undefined) {
    throw new Error(`${label} is not a supported PNG, JPEG, or WebP image`)
  }
  if (mediaType !== declared) throw new Error(`${label} extension does not match the actual image format`)
  return { path, data, mediaType, width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha === true }
}

function validateMask(mask: InspectedImage, primary: InspectedImage): void {
  if (mask.mediaType !== primary.mediaType) throw new Error('mask_path must use the same image format as input_paths[0]')
  if (mask.width !== primary.width || mask.height !== primary.height) {
    throw new Error('mask_path must have the same dimensions as input_paths[0]')
  }
  if (!mask.hasAlpha) throw new Error('mask_path must contain an alpha channel')
}

function sameImagePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

function trustedBaseUrl(raw: string): string {
  const url = new URL(raw)
  const trustedHost = ['hkcode.aicodeme.xyz', 'code.aicodeme.xyz', 'code.aicodeme.cn'].includes(url.hostname)
  if (url.protocol !== 'https:' || !trustedHost || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/v1') {
    throw new Error('The configured image model endpoint is not a trusted ZeroWall AI Cloud URL.')
  }
  return url.toString().replace(/\/$/u, '')
}

async function decodeImagePayload(
  payload: unknown,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{ bytes: Uint8Array; revisedPrompt?: string; actualQuality?: ImageGenerationQuality }> {
  if (!isRecord(payload) || !Array.isArray(payload.data) || !isRecord(payload.data[0])) throw new Error('Image request returned no image.')
  const item = payload.data[0]
  const revisedPrompt = typeof item.revised_prompt === 'string' && item.revised_prompt.trim() ? item.revised_prompt : undefined
  const actualQuality = isImageQuality(item.quality) ? item.quality : isImageQuality(item.actual_quality) ? item.actual_quality : undefined
  if (typeof item.b64_json === 'string' && item.b64_json.length > 0) {
    return { bytes: Buffer.from(item.b64_json, 'base64'), ...(revisedPrompt === undefined ? {} : { revisedPrompt }), ...(actualQuality === undefined ? {} : { actualQuality }) }
  }
  if (typeof item.url === 'string') {
    const url = new URL(item.url)
    if (url.protocol !== 'https:') throw new Error('Image request returned an unsafe image URL.')
    let response: Response
    try {
      response = await fetcher(url, signal === undefined ? {} : { signal })
    } catch (error) {
      if (isAbortError(error) || (signal?.aborted ?? false)) throw error
      throw new Error('Generated image download failed before receiving a response. Check the image CDN connection and retry.', { cause: error })
    }
    if (!response.ok) throw new Error(`Generated image download failed (HTTP ${response.status}).`)
    const length = Number(response.headers.get('content-length'))
    if (Number.isFinite(length) && length > MAX_OUTPUT_IMAGE_BYTES) throw new Error('Generated image exceeds the 64 MiB safety limit.')
    return { bytes: new Uint8Array(await response.arrayBuffer()), ...(revisedPrompt === undefined ? {} : { revisedPrompt }), ...(actualQuality === undefined ? {} : { actualQuality }) }
  }
  throw new Error('Image request returned neither image bytes nor a download URL.')
}

async function normalizePng(data: Uint8Array, signal?: AbortSignal): Promise<Uint8Array> {
  signal?.throwIfAborted()
  let png: Buffer
  try {
    png = await sharp(data, { failOn: 'error', limitInputPixels: false }).png().toBuffer()
  } catch (error) {
    throw new Error('Image request returned invalid raster bytes.', { cause: error })
  }
  signal?.throwIfAborted()
  if (png.byteLength > MAX_OUTPUT_IMAGE_BYTES) throw new Error('Generated image exceeds the 64 MiB safety limit.')
  return png
}

async function atomicWrite(root: string, target: string, data: Uint8Array, overwrite: boolean): Promise<void> {
  const parent = dirname(target)
  await mkdir(parent, { recursive: true })
  assertInside(root, await realpath(parent), 'output_path')
  const temporary = resolve(parent, `.${basename(target)}.${randomUUID()}.tmp`)
  await writeFile(temporary, data, { flag: 'wx', mode: 0o600 })
  try {
    if (overwrite) {
      await rename(temporary, target)
    } else {
      await link(temporary, target)
      await unlink(temporary)
    }
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    if (!overwrite && error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      throw new Error('output_path already exists; set overwrite=true to replace it', { cause: error })
    }
    throw error
  }
}

function attachmentValue(ref: ImageAttachmentRef): ImageAttachmentValue {
  return {
    attachmentId: String(ref.attachmentId),
    mediaType: ref.mediaType,
    bytes: ref.bytes,
    width: ref.width,
    height: ref.height,
    ...(ref.name === undefined ? {} : { name: ref.name }),
  }
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
    || error instanceof Error && error.name === 'AbortError'
}

function errorCode(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}
