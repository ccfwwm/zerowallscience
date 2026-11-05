import type {} from '@zerowallscience/plugin-ai-cloud'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-attachment'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
import type { GenerateImageResult } from './generator.js'
import { AiCloudClient } from '@zerowallscience/plugin-account'
import { AiCloudImageGenerator } from './generator.js'
import { SecretBrokerClient } from '@zerowallscience/plugin-secrets'
import { installVisualAssets } from './visual-assets.js'

export * from './generator.js'
export const name = 'zerowall-image-generation'
type ImageEnvironmentSettings = {
  readImageModelSelection(): Promise<import('@zerowallscience/plugin-environment/types').ImageModelSelection | undefined>
  getImageQuality?(): Promise<import('@zerowallscience/plugin-environment/types').ImageGenerationQuality | undefined> | import('@zerowallscience/plugin-environment/types').ImageGenerationQuality | undefined
}

/** The standalone image skill reads only its own environment settings. */
export function createImageConfiguration(environment: ImageEnvironmentSettings) {
  return {
    imageModel: () => environment.readImageModelSelection(),
    imageQuality: async () => await environment.getImageQuality?.() ?? 'auto' as const,
  }
}
// The generator persists generated PNGs through the durable attachment store.
// Declare the service explicitly so Cordis does not reject ctx.get('attachments')
// in the composed Host loader.
export const inject = [
  'zerowallMedia','tools', 'zerowallEnvironment', 'attachments', 'llm']

export interface ResolvedImageModel {
  providerId: string
  groupId: string
  modelId: string
}

export interface ZeroWallImageGenerationService {
  resolveModel(model?: string): Promise<ResolvedImageModel>
  resolveQuality?(quality?: import('@zerowallscience/plugin-environment/types').ImageGenerationQuality): Promise<import('@zerowallscience/plugin-environment/types').ImageGenerationQuality>
  generate(input: Parameters<AiCloudImageGenerator['generate']>[0], cwd: string, signal?: AbortSignal): Promise<GenerateImageResult>
  edit(input: Parameters<AiCloudImageGenerator['edit']>[0], cwd: string, signal?: AbortSignal): Promise<GenerateImageResult>
}

declare module '@deepseek-ai/cordis' {
  interface Context { zerowallImageGeneration: ZeroWallImageGenerationService }
}

const IMAGE_OUTPUT_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    path: { type: 'string' as const, required: true },
    model: { type: 'string' as const, required: true },
    providerId: { type: 'string' as const, required: true },
    groupId: { type: 'string' as const, required: true },
    bytes: { type: 'integer' as const, required: true },
    requestedSize: { type: 'string' as const, required: true },
    requestedAspectRatio: { type: 'string' as const },
    requestedImageSize: { type: 'string' as const },
    actualWidth: { type: 'integer' as const, required: true },
    actualHeight: { type: 'integer' as const, required: true },
    quality: { type: 'string' as const, enum: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] as const, required: true },
    requestedQuality: { type: 'string' as const, enum: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] as const, required: true },
    actualQuality: { type: 'string' as const, enum: ['auto', 'low', 'medium', 'high', 'xhigh', 'max', 'unreported'] as const, required: true },
    modelInfo: {
      type: 'object' as const,
      additionalProperties: false,
      properties: {
        providerId: { type: 'string' as const, required: true },
        groupId: { type: 'string' as const, required: true },
        modelId: { type: 'string' as const, required: true },
      },
    },
    revisedPrompt: { type: 'string' as const },
    sha256: { type: 'string' as const },
    receiptPath: { type: 'string' as const },
    promptHash: { type: 'string' as const },
    inputImageHashes: { type: 'array' as const, items: { type: 'string' as const } },
    cached: { type: 'boolean' as const },
    resumedDownload: { type: 'boolean' as const },
    responseFormat: { type: 'string' as const, enum: ['url', 'b64_json'] as const },
    downloadTransport: { type: 'string' as const, enum: ['single', 'range'] as const },
    maskProtection: { type: 'object' as const, additionalProperties: false, properties: {
      sourceSha256: { type: 'string' as const, required: true },
      maskSha256: { type: 'string' as const, required: true },
      protectedPixels: { type: 'integer' as const, required: true },
      editablePixels: { type: 'integer' as const, required: true },
    } },
    timings: { type: 'object' as const, additionalProperties: false, properties: {
      providerMs: { type: 'integer' as const, required: true },
      downloadMs: { type: 'integer' as const, required: true },
      processingMs: { type: 'integer' as const, required: true },
      totalMs: { type: 'integer' as const, required: true },
    } },
    image: {
      type: 'object' as const,
      additionalProperties: false,
      properties: {
        attachmentId: { type: 'string' as const, required: true },
        mediaType: { type: 'string' as const, enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const, required: true },
        bytes: { type: 'integer' as const, required: true },
        width: { type: 'integer' as const, required: true },
        height: { type: 'integer' as const, required: true },
        name: { type: 'string' as const },
      },
    },
    attachment: {
      type: 'object' as const,
      additionalProperties: false,
      properties: {
        attachmentId: { type: 'string' as const, required: true },
        mediaType: { type: 'string' as const, enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const, required: true },
        bytes: { type: 'integer' as const, required: true },
        width: { type: 'integer' as const, required: true },
        height: { type: 'integer' as const, required: true },
        name: { type: 'string' as const },
      },
    },
    previewWarning: { type: 'string' as const },
  },
} as const

export function renderImageResult(verb: 'Generated' | 'Edited', value: GenerateImageResult) {
  const warning = value.previewWarning === undefined ? '' : ` Preview warning: ${value.previewWarning}`
  const quality = value.actualQuality === 'unreported' ? `requested ${value.requestedQuality} quality; actual quality unreported by provider` : `${value.actualQuality} quality`
  const settings = value.requestedImageSize
    ? `requested ${value.requestedImageSize} tier${value.requestedAspectRatio ? `, ${value.requestedAspectRatio} aspect ratio` : ''}`
    : `${quality}, requested ${value.requestedSize}`
  const destination = value.path.replace(/\\/gu, '/').replace(/[%<>\r\n]/gu, character => encodeURIComponent(character))
  const markdown = `![${verb === 'Generated' ? 'Generated image' : 'Edited image'}](<${destination}>)`
  const timing = value.timings ? ` Timings (ms): provider=${value.timings.providerMs}, download=${value.timings.downloadMs}, processing=${value.timings.processingMs}, total=${value.timings.totalMs}.` : ''
  const recovery = value.cached ? ' Cached result; timings belong to the original generation.' : value.resumedDownload ? ' Resumed download; provider timing belongs to the original generation.' : ''
  const content = [{ type: 'text' as const, text: `${verb} ${value.path} with ${value.model} (${settings}; actual ${value.actualWidth}x${value.actualHeight}, ${value.bytes} bytes).${timing}${recovery}${warning}\n\nDisplay this saved image directly in your final reply by copying the following Markdown image embed verbatim, outside code/backticks. Do not return only a path or a download link:\n${markdown}` }]
  const attachment = value.attachment ?? value.image
  return attachment === undefined ? content : [
    ...content,
    { type: 'image' as const, attachment: attachment as ImageAttachmentRef },
  ]
}

function presentationMeta(value: GenerateImageResult): JsonValue {
  const meta: Record<string, JsonValue> = {
    path: value.path,
    model: value.model,
    providerId: value.providerId,
    groupId: value.groupId,
    requestedSize: value.requestedSize,
    ...(value.requestedAspectRatio ? { requestedAspectRatio: value.requestedAspectRatio } : {}),
    ...(value.requestedImageSize ? { requestedImageSize: value.requestedImageSize } : {}),
    actualWidth: value.actualWidth,
    actualHeight: value.actualHeight,
    quality: value.quality,
    requestedQuality: value.requestedQuality,
    actualQuality: value.actualQuality,
    modelInfo: { providerId: value.providerId, groupId: value.groupId, modelId: value.model },
    sha256: value.sha256 ?? null,
    receiptPath: value.receiptPath ?? null,
    promptHash: value.promptHash ?? null,
    inputImageHashes: value.inputImageHashes ?? [],
    responseFormat: value.responseFormat ?? null,
    timings: value.timings ? { ...value.timings } : null,
    resumedDownload: value.resumedDownload ?? false,
    downloadTransport: value.downloadTransport ?? null,
  }
  const attachmentValue = value.attachment ?? value.image
  if (attachmentValue !== undefined) {
    const image: Record<string, JsonValue> = {
      attachmentId: attachmentValue.attachmentId,
      mediaType: attachmentValue.mediaType,
      bytes: attachmentValue.bytes,
      width: attachmentValue.width,
      height: attachmentValue.height,
    }
    if (attachmentValue.name !== undefined) image.name = attachmentValue.name
    meta.image = image
    // `attachment` is the stable name used by the presentation and client
    // consumers; retain `image` above for backwards compatibility.
    meta.attachment = image
  }
  if (value.previewWarning !== undefined) meta.previewWarning = value.previewWarning
  return meta
}

export function apply(ctx: Context): void {
  installVisualAssets(ctx)
  const secrets = new SecretBrokerClient()
  const account = new AiCloudClient({ secrets })
  const environment = ctx.get('zerowallEnvironment') as ImageEnvironmentSettings
  const generator = new AiCloudImageGenerator({
    secrets,
    account,
    media: ctx.get('zerowallMedia')!,
    attachments: () => ctx.get('attachments'),
    ...createImageConfiguration(environment),
  })
  ctx.on('zerowall/account-updated', snapshot => generator.update(snapshot))
  void account.current().then(snapshot => generator.update(snapshot)).catch(() => undefined)
  const service: ZeroWallImageGenerationService = {
    resolveModel: async model => {
      const resolved = await generator.resolveModel(model)
      return { providerId: resolved.providerId, groupId: resolved.groupId, modelId: resolved.modelId }
    },
    resolveQuality: quality => generator.resolveQuality(quality),
    generate: (input, cwd, signal) => generator.generate(input, cwd, signal),
    edit: (input, cwd, signal) => generator.edit(input, cwd, signal),
  }
  ctx.provide('zerowallImageGeneration', service)

  let configuration: Awaited<ReturnType<typeof generator.describeConfiguration>> | undefined
  const refreshConfiguration = async () => {
    configuration = await generator.describeConfiguration()
    return configuration
  }
  // Project only the currently selected protocol into each request. Keep the
  // execution schema compatible with calls already recorded in old sessions.
  const imageTools = new Map<string, ToolDefinition>()
  const protocolTool = (definition: ToolDefinition): ToolDefinition => {
    const projected: ToolDefinition = {
      ...definition,
      get description() {
        return configuration
          ? `${definition.name === 'edit_image' ? '编辑现有图片' : '生成图片'}，返回 PNG 和真实回执。已有对话尺寸直接执行，确实缺失才询问。当前配置：protocol=${configuration.protocol}；model=${configuration.model}；group=${configuration.groupId}；quality=${configuration.configuredQuality}。${configuration.protocol === 'gemini' ? '仅使用 image_size 档位和 aspect_ratio；不要构造像素 size 或 quality。' : '仅使用像素 size 和 quality；没有任务质量覆盖时使用上述环境质量，不猜 auto。不要构造 image_size 或 aspect_ratio。'}`
          : `${definition.description} 配置尚未就绪时先查询 image_generation_options，不猜测协议或质量。`
      },
      get parameters() {
        const schema = definition.parameters
        const excluded = configuration?.protocol === 'gemini' ? ['size', 'quality'] : ['image_size', 'aspect_ratio']
        return { ...schema, properties: Object.fromEntries(Object.entries(schema.properties ?? {}).filter(([key]) => !excluded.includes(key))) }
      },
    }
    imageTools.set(definition.name, projected)
    return projected
  }
  // Assembly has already collected native schemas when this waterfall runs;
  // replace these two projections in the same assembly, including the first
  // step after an Environment change. Getter-only refresh would be one step late.
  ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    try { await refreshConfiguration() } catch { configuration = undefined }
    const assembly = await next()
    return { ...assembly, tools: assembly.tools.map(tool => {
      const current = imageTools.get(tool.name)
      return current ? { ...tool, description: current.description, parameters: current.parameters } : tool
    }) }
  }, { prepend: true })

  ctx.tools.register(defineTool({
    name: 'image_generation_options',
    description: '只读查询当前生图模型、分组、实际协议、尺寸和质量。仅在本轮尚无配置快照或参数错误时查询一次；已有尺寸直接构建生图请求，不要求展示确认单。不会生图、收费、修改设置或返回凭据。',
    parameters: {},
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    isConcurrencySafe: () => true,
    async execute() { return await refreshConfiguration() },
  }))

  ctx.tools.register(protocolTool(defineTool({
    name: 'generate_image',
    description: '生成独立 PNG 与真实回执，适用于普通生图和 PPT/报告配图。从当前对话提取尺寸及画面要求，尺寸已给出就直接调用，不重复确认。GPT/OpenAI 必须用 size 和 quality，质量取用户指定值或当前环境值；确实缺少尺寸时先询问，不能静默传 auto。模型、分组与协议实时读取环境，Gemini 使用 image_size 和 aspect_ratio。修改已有图使用 edit_image。',
    parameters: {
      prompt: { type: 'string', required: true, description: 'Detailed image-generation prompt.' },
      output_path: { type: 'string', required: true, description: 'New PNG path inside the current session working directory.' },
      size: { type: 'string', description: 'GPT/OpenAI 的像素尺寸。从当前任务的对话、附件规格或已确认页面规格提取，例如 4K 16:9 → 3840x2160；必须传给工具，不能只写进 prompt 或改为 auto。确实缺失则先询问；仅用户明确选择自动尺寸时传 auto。不传 image_size。' },
      image_size: { type: 'string', enum: ['512', '1K', '2K', '4K'], description: '仅 Gemini 协议的任务分辨率档位；明确要求时传入。不能代替 OpenAI 的像素 size。' },
      quality: { type: 'string', enum: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'], description: 'GPT/OpenAI 必须发送质量：使用用户指定值或本轮环境配置中的质量，保留 high/xhigh/max 等原值；auto 也原样发送，不能删除字段。Host 为旧调用补齐当前环境质量。Gemini 不发送此字段。' },
      aspect_ratio: { type: 'string', description: '任务画幅比例，例如 16:9。Gemini 使用此字段；GPT/OpenAI 应由对话中的分辨率和比例构建像素 size，不能仅传比例让尺寸退回 auto。' },
      overwrite: { type: 'boolean', description: 'Replace an existing output file. Defaults to false.' },
      concurrency: { type: 'integer', description: 'Maximum concurrent image jobs in this batch (integer 1–10, default 10). When the user specifies a limit, pass the same value to every generate_image/edit_image call in the batch.' },
    },
    output: {
      schema: IMAGE_OUTPUT_SCHEMA,
      render: (_args, value) => renderImageResult('Generated', value as GenerateImageResult),
      presentationMeta: (_args, value) => presentationMeta(value as GenerateImageResult),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const cwd = exec.agent?.session.header.cwd
      if (!cwd) throw new Error('generate_image requires a session working directory')
      return await generator.generate({
        prompt: args.prompt,
        outputPath: args.output_path,
        requireSize: true,
        ...(args.size === undefined ? {} : { size: args.size }),
        ...(args.image_size === undefined ? {} : { imageSize: args.image_size }),
        ...(args.quality === undefined ? {} : { quality: args.quality }),
        ...(args.aspect_ratio === undefined ? {} : { aspectRatio: args.aspect_ratio }),
        ...(args.overwrite === undefined ? {} : { overwrite: args.overwrite }),
        ...(args.concurrency === undefined ? {} : { concurrency: args.concurrency }),
      }, cwd, exec.signal)
    },
    presentCall: args => ({
      card: 'generic',
      title: `Generate image ${args.output_path}`,
      kind: 'edit',
      locations: [{ path: args.output_path }],
    }),
  })))

  ctx.tools.register(protocolTool(defineTool({
    name: 'edit_image',
    description: '编辑 PNG、JPEG 或 WebP，返回 PNG 与真实回执。从当前对话或已确认规格提取尺寸，已给出就直接调用，不重复确认。GPT/OpenAI 必须用 size 和 quality；质量取用户指定值或当前环境值，确实缺少尺寸先询问，不能静默传 auto。模型、分组与协议实时读取环境；Gemini 使用 image_size 和 aspect_ratio。',
    parameters: {
      prompt: { type: 'string', required: true, description: 'Detailed edit instruction, including what must remain unchanged.' },
      input_paths: { type: 'array', items: { type: 'string' }, description: 'Optional source image paths inside the session working directory.' },
      input_attachment_ids: { type: 'array', items: { type: 'string' }, description: 'Optional image attachment IDs from the current conversation.' },
      mask_path: { type: 'string', description: 'Optional independent alpha mask matching the first input image format and dimensions. Omit this field entirely for whole-image edits; never send an empty string or repeat input_paths[0] as the mask.' },
      preserve_outside_mask: { type: 'boolean', description: 'For protected local background repair, retain source dimensions and copy every opaque-mask source pixel back into the result. Requires mask_path. Transparent mask pixels are editable; provider output with different dimensions is rejected.' },
      output_path: { type: 'string', required: true, description: 'PNG output path inside the current session working directory.' },
      size: { type: 'string', description: 'GPT/OpenAI 的目标像素尺寸，从对话或已确认规格提取，例如 3840x2160；要求保持原尺寸时可读取主图宽高。确实缺失先询问，不默认 auto；仅用户明确选择自动尺寸时传 auto。不传 image_size。' },
      image_size: { type: 'string', enum: ['512', '1K', '2K', '4K'], description: '仅 Gemini 协议的任务分辨率档位；未明确指定则省略。' },
      quality: { type: 'string', enum: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'], description: 'GPT/OpenAI 必须发送用户指定或当前环境质量，保留 high/xhigh/max，auto 也原样发送，不能删除字段。Host 为旧调用补齐当前环境质量。Gemini 不发送此字段。' },
      aspect_ratio: { type: 'string', description: '任务画幅比例，例如 16:9。Gemini 使用此字段；GPT/OpenAI 应构建像素 size，不能仅传比例让尺寸退回 auto。' },
      overwrite: { type: 'boolean', description: 'Replace an existing output file, including a source image. Defaults to false.' },
      concurrency: { type: 'integer', description: 'Maximum concurrent image jobs in this batch (integer 1–10, default 10). Use the same value for every generate_image/edit_image call in the batch.' },
    },
    output: {
      schema: IMAGE_OUTPUT_SCHEMA,
      render: (_args, value) => renderImageResult('Edited', value as GenerateImageResult),
      presentationMeta: (_args, value) => presentationMeta(value as GenerateImageResult),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const cwd = exec.agent?.session.header.cwd
      if (!cwd) throw new Error('edit_image requires a session working directory')
      const attachmentPaths = await materializeAttachments(exec.agent?.session.snapshotEvents() ?? [], args.input_attachment_ids, cwd, ctx)
      try { return await generator.edit({
        prompt: args.prompt,
        inputPaths: [...(args.input_paths ?? []), ...attachmentPaths],
        outputPath: args.output_path,
        requireSize: true,
        ...(args.size === undefined ? {} : { size: args.size }),
        ...(args.image_size === undefined ? {} : { imageSize: args.image_size }),
        ...(args.quality === undefined ? {} : { quality: args.quality }),
        ...(args.mask_path?.trim() ? { maskPath: args.mask_path.trim() } : {}),
        ...(args.preserve_outside_mask === undefined ? {} : { preserveOutsideMask: args.preserve_outside_mask }),
        ...(args.aspect_ratio === undefined ? {} : { aspectRatio: args.aspect_ratio }),
        ...(args.overwrite === undefined ? {} : { overwrite: args.overwrite }),
        ...(args.concurrency === undefined ? {} : { concurrency: args.concurrency }),
      }, cwd, exec.signal) } finally { await Promise.all(attachmentPaths.map(path => unlink(path).catch(() => undefined))) }
    },
    presentCall: args => ({
      card: 'generic',
      title: `Edit image ${args.output_path}`,
      kind: 'edit',
      locations: [...(args.input_paths ?? []).map(path => ({ path })), { path: args.output_path }],
    }),
  })))
}

async function materializeAttachments(
  events: readonly unknown[],
  ids: readonly string[] | undefined,
  cwd: string,
  ctx: Context,
): Promise<string[]> {
  if (!ids || ids.length === 0) return []
  if (ids.length > 16) throw new Error('input_attachment_ids accepts at most 16 images')
  const attachments = ctx.get('attachments') as { readImage(ref: ImageAttachmentRef): Promise<{ ref: ImageAttachmentRef; data: Uint8Array }> }
  const paths: string[] = []
  const root = join(cwd, '.zerowall', 'image-inputs')
  await mkdir(root, { recursive: true })
  for (const [index, id] of ids.entries()) {
    const ref = findAttachmentRef(events, id)
    if (!ref) throw new Error(`图片附件 ${id} 未在当前会话中找到，无法用于编辑。`)
    const stored = await attachments.readImage(ref)
    const extension = ref.mediaType === 'image/jpeg' ? 'jpg' : ref.mediaType.slice('image/'.length)
    const path = join(root, `input-${randomUUID()}-${index}.${extension}`)
    await writeFile(path, stored.data)
    paths.push(path)
  }
  return paths
}

function findAttachmentRef(value: unknown, id: string): ImageAttachmentRef | undefined {
  if (!value || typeof value !== 'object') return undefined
  if (Array.isArray(value)) { for (const item of value) { const found = findAttachmentRef(item, id); if (found) return found } return undefined }
  const record = value as Record<string, unknown>
  if (record.attachmentId === id && typeof record.mediaType === 'string' && typeof record.bytes === 'number' && typeof record.width === 'number' && typeof record.height === 'number') return record as unknown as ImageAttachmentRef
  for (const child of Object.values(record)) { const found = findAttachmentRef(child, id); if (found) return found }
  return undefined
}
