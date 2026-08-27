import { randomUUID } from 'node:crypto'
import { link, lstat, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import type { ImageAttachmentRef, ImageMediaType, SaveImageAttachment } from '@deepseek-ai/dsh-attachment'
import sharp from 'sharp'
import type { AccountSecretStore } from '@zerowallscience/plugin-account'
import type { AiCloudAccountSnapshot, AiCloudManagedModel } from '@zerowallscience/plugin-account/types'
import type { ImageGenerationQuality, ImageModelSelection } from '@zerowallscience/plugin-environment/types'

const KEY_PREFIX = 'zerowall.ai-cloud.group.'
const MAX_INPUT_IMAGES = 16
const MAX_INPUT_IMAGE_BYTES = 50 * 1024 * 1024
const MAX_OUTPUT_IMAGE_BYTES = 64 * 1024 * 1024
const DEFAULT_IMAGE_QUALITY: ImageGenerationQuality = 'medium'

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
  /** The quality reported by the provider, or the requested value when absent. */
  actualQuality: ImageGenerationQuality
  revisedPrompt?: string
  image?: ImageAttachmentValue
  /** Stable attachment name used by cross-plugin consumers. */
  attachment?: ImageAttachmentValue
  previewWarning?: string
}

export interface AccountReader { current(): Promise<AiCloudAccountSnapshot> }
export interface ImageAttachmentWriter { saveImage(input: SaveImageAttachment): Promise<ImageAttachmentRef> }
export interface AiCloudImageGeneratorOptions {
  secrets: AccountSecretStore
  account: AccountReader
  fetch?: typeof fetch
  attachments?: () => ImageAttachmentWriter | undefined
  imageModel?: () => Promise<ImageModelSelection | undefined>
  imageQuality?: () => Promise<ImageGenerationQuality | undefined>
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

  constructor(private readonly options: AiCloudImageGeneratorOptions) {
    this.fetcher = options.fetch ?? fetch
  }

  update(snapshot: AiCloudAccountSnapshot): void { this.snapshot = snapshot }

  async generate(input: GenerateImageInput, cwd: string, signal?: AbortSignal): Promise<GenerateImageResult> {
    const prompt = nonEmptyPrompt(input.prompt)
    const size = validateImageSize(input.size)
    const quality = await this.resolveQuality(input.quality)
    const workspace = await workspaceRoot(cwd)
    const target = await safeOutputPath(workspace, input.outputPath, input.overwrite ?? false)
    const model = await this.resolveModel(input.model)
    const response = await this.requestImage(`${trustedBaseUrl(model.baseUrl)}/images/generations`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await this.credential(model)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: model.modelId,
        prompt,
        size,
        quality,
        output_format: 'png',
      }),
      ...(signal === undefined ? {} : { signal }),
    }, 'generation')
    return await this.finishResponse(response, workspace, target, model, size, quality, input.overwrite ?? false, signal)
  }

  async edit(input: EditImageInput, cwd: string, signal?: AbortSignal): Promise<GenerateImageResult> {
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
    const target = await safeOutputPath(workspace, input.outputPath, input.overwrite ?? false)
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
    const form = new FormData()
    form.set('model', model.modelId)
    form.set('prompt', prompt)
    form.set('size', size)
    form.set('quality', quality)
    form.set('output_format', 'png')
    for (const image of images) {
      form.append('image[]', new Blob([Buffer.from(image.data)], { type: image.mediaType }), basename(image.path))
    }
    if (mask !== undefined) {
      form.set('mask', new Blob([Buffer.from(mask.data)], { type: mask.mediaType }), basename(mask.path))
    }

    const response = await this.requestImage(`${trustedBaseUrl(model.baseUrl)}/images/edits`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await this.credential(model)}` },
      body: form,
      ...(signal === undefined ? {} : { signal }),
    }, 'edit')
    return await this.finishResponse(response, workspace, target, model, size, quality, input.overwrite ?? false, signal)
  }

  async resolveModel(requested?: string): Promise<AiCloudManagedModel> {
    const snapshot = this.snapshot ?? await this.options.account.current()
    this.snapshot = snapshot
    const configured = await this.options.imageModel?.()
    if (snapshot.status !== 'signedIn') throw new Error('请先登录 ZeroWall AI Cloud，再生成演示文稿视觉。')
    const imageModels = stableImageModels(snapshot.models)
    const selected = configured?.modelId
      ? imageModels.find(candidate => candidate.modelId === configured.modelId
        && candidate.providerId === configured.providerId && candidate.groupId === configured.groupId)
      : undefined
    const requestedId = requested?.trim()
    if (requestedId) {
      if (selected?.modelId === requestedId) return selected
      const candidate = imageModels.find(model => model.modelId === requestedId)
      if (candidate) return candidate
      throw new Error(`当前账户没有可用的 ${requestedId} 生图模型，请在“环境配置”中刷新或选择生图模型。`)
    }
    if (selected) return selected
    const fallback = imageModels.find(model => model.modelId === 'gpt-image-2')
    if (fallback) return fallback
    throw new Error('当前账户没有可用的 gpt-image-2（no configured gpt-image-2），请在“环境配置”中选择生图模型。')
  }

  private async resolveQuality(explicit?: ImageGenerationQuality): Promise<ImageGenerationQuality> {
    if (explicit !== undefined) {
      if (!isImageQuality(explicit)) throw new Error('quality must be auto, low, medium, or high')
      return explicit
    }
    const configured = await this.options.imageQuality?.()
    return isImageQuality(configured) ? configured : DEFAULT_IMAGE_QUALITY
  }

  private async credential(model: AiCloudManagedModel): Promise<string> {
    const key = await this.options.secrets.get(`${KEY_PREFIX}${model.groupId}`)
    if (!key?.trim()) throw new Error(`生图模型 ${model.modelId} 所属分组没有配置凭据，请刷新账户模型列表后重试。`)
    return key.trim()
  }

  private async requestImage(url: string, init: RequestInit, operation: 'generation' | 'edit'): Promise<Response> {
    try {
      return await this.fetcher(url, init)
    } catch (error) {
      if (isAbortError(error) || (init.signal?.aborted ?? false)) throw error
      const code = errorCode(error)
      const detail = code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT'
        ? 'The image endpoint timed out before returning a response.'
        : 'The image endpoint could not be reached.'
      throw new Error(`Image ${operation} failed before receiving a response. ${detail} Check the configured AI Cloud node and retry.`, { cause: error })
    }
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
    if (!response.ok) throw new Error(`Image request failed (HTTP ${response.status}).`)
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
      actualQuality: decoded.actualQuality ?? quality,
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
  return value === 'auto' || value === 'low' || value === 'medium' || value === 'high'
}

function selectImageModel(snapshot: AiCloudAccountSnapshot, requested: string, configured?: ImageModelSelection): AiCloudManagedModel {
  if (snapshot.status !== 'signedIn') throw new Error('Sign in to ZeroWall AI Cloud before generating or editing images.')
  const candidates = snapshot.models.filter(candidate =>
    candidate.capability === 'image-generation'
    && isImageGenerationGroup(candidate.groupName)
    && candidate.modelId === requested
    && (configured === undefined || (candidate.providerId === configured.providerId && candidate.groupId === configured.groupId)),
  )
  if (candidates.length > 1) throw new Error(`The AI Cloud image model ${requested} is ambiguous across the 生图 groups. Refresh the account model list.`)
  const model = candidates[0]
  if (model === undefined) throw new Error(`当前 AI Cloud 账户没有配置生图模型 ${requested}，请刷新账户模型列表。`)
  return model
}

function stableImageModels(models: AiCloudManagedModel[]): AiCloudManagedModel[] {
  return models
    .filter(model => model.capability === 'image-generation' && isImageGenerationGroup(model.groupName))
    .sort((left, right) => left.groupName.localeCompare(right.groupName, 'zh-CN')
      || left.groupId.localeCompare(right.groupId, undefined, { numeric: true })
      || left.providerId.localeCompare(right.providerId)
      || left.modelId.localeCompare(right.modelId))
}

function isImageGenerationGroup(name: string): boolean {
  return name.trim().includes('生图')
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

async function safeOutputPath(root: string, raw: string, overwrite: boolean): Promise<string> {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('output_path must be a non-empty PNG path')
  rejectParentTraversal(trimmed, 'output_path')
  const target = resolve(root, trimmed)
  assertInside(root, target, 'output_path')
  if (extname(target).toLowerCase() !== '.png') throw new Error('output_path must use the .png extension')
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
