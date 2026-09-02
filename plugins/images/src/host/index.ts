import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-attachment'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
import { validateImageSize, type GenerateImageResult } from './generator.js'
import { AiCloudClient } from '@zerowallscience/plugin-account'
import { AiCloudImageGenerator } from './generator.js'
import { SecretBrokerClient } from '@zerowallscience/plugin-secrets'

export * from './generator.js'
export const name = 'zerowall-image-generation'
// The generator persists generated PNGs through the durable attachment store.
// Declare the service explicitly so Cordis does not reject ctx.get('attachments')
// in the composed Host loader.
export const inject = ['tools', 'zerowallEnvironment', 'attachments']

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
    actualWidth: { type: 'integer' as const, required: true },
    actualHeight: { type: 'integer' as const, required: true },
    quality: { type: 'string' as const, enum: ['auto', 'low', 'medium', 'high'] as const, required: true },
    requestedQuality: { type: 'string' as const, enum: ['auto', 'low', 'medium', 'high'] as const, required: true },
    actualQuality: { type: 'string' as const, enum: ['auto', 'low', 'medium', 'high'] as const, required: true },
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

function renderResult(verb: 'Generated' | 'Edited', value: GenerateImageResult) {
  const warning = value.previewWarning === undefined ? '' : ` Preview warning: ${value.previewWarning}`
  return [{ type: 'text' as const, text: `${verb} ${value.path} with ${value.model} at ${value.actualQuality} quality (${value.actualWidth}x${value.actualHeight}, requested ${value.requestedSize}, ${value.bytes} bytes).${warning}` }]
}

function presentationMeta(value: GenerateImageResult): JsonValue {
  const meta: Record<string, JsonValue> = {
    path: value.path,
    model: value.model,
    providerId: value.providerId,
    groupId: value.groupId,
    requestedSize: value.requestedSize,
    actualWidth: value.actualWidth,
    actualHeight: value.actualHeight,
    quality: value.quality,
    requestedQuality: value.requestedQuality,
    actualQuality: value.actualQuality,
    modelInfo: { providerId: value.providerId, groupId: value.groupId, modelId: value.model },
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
  const secrets = new SecretBrokerClient()
  const account = new AiCloudClient({ secrets })
  const environment = ctx.get('zerowallEnvironment') as {
    readImageModelSelection(): Promise<import('@zerowallscience/plugin-environment/types').ImageModelSelection | undefined>
    getImageQuality?(): import('@zerowallscience/plugin-environment/types').ImageGenerationQuality
  }
  const generator = new AiCloudImageGenerator({
    secrets,
    account,
    attachments: () => ctx.get('attachments'),
    imageModel: () => environment.readImageModelSelection(),
    imageQuality: async () => environment.getImageQuality?.() ?? 'auto',
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

  ctx.tools.register(defineTool({
    name: 'generate_image',
      description: '使用环境配置中选择的生图模型生成 PNG。需要修改已有图片时请使用 edit_image。',
    parameters: {
      prompt: { type: 'string', required: true, description: 'Detailed image-generation prompt.' },
      output_path: { type: 'string', required: true, description: 'New PNG path inside the current session working directory.' },
        model: { type: 'string', description: '可选的生图模型 ID；未填写时使用环境配置或账户目录中的唯一可用模型。' },
      size: { type: 'string', description: 'auto 或 WIDTHxHEIGHT，例如 2048x2048；不要假设 1024x1024 是最大尺寸。' },
      quality: { type: 'string', enum: ['auto', 'low', 'medium', 'high'], description: 'Optional explicit override. Omit unless the user requested a quality level; the environment setting is otherwise authoritative (default: medium). Image dimensions do not imply high quality.' },
      overwrite: { type: 'boolean', description: 'Replace an existing output file. Defaults to false.' },
    },
    output: {
      schema: IMAGE_OUTPUT_SCHEMA,
      render: (_args, value) => renderResult('Generated', value as GenerateImageResult),
      presentationMeta: (_args, value) => presentationMeta(value as GenerateImageResult),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const cwd = exec.agent?.session.header.cwd
      if (!cwd) throw new Error('generate_image requires a session working directory')
      return await generator.generate({
        prompt: args.prompt,
        outputPath: args.output_path,
        ...(args.model === undefined ? {} : { model: args.model }),
        ...(args.size === undefined ? {} : { size: validateImageSize(args.size) }),
        ...(args.quality === undefined ? {} : { quality: args.quality }),
        ...(args.overwrite === undefined ? {} : { overwrite: args.overwrite }),
      }, cwd, exec.signal)
    },
    presentCall: args => ({
      card: 'generic',
      title: `Generate image ${args.output_path}`,
      kind: 'edit',
      locations: [{ path: args.output_path }],
    }),
  }))

  ctx.tools.register(defineTool({
    name: 'edit_image',
    description: '使用环境配置中选择的生图模型编辑 PNG、JPEG 或 WebP 图片，并按请求保留被引用内容。',
    parameters: {
      prompt: { type: 'string', required: true, description: 'Detailed edit instruction, including what must remain unchanged.' },
      input_paths: { type: 'array', items: { type: 'string' }, description: 'Optional source image paths inside the session working directory.' },
      input_attachment_ids: { type: 'array', items: { type: 'string' }, description: 'Optional image attachment IDs from the current conversation.' },
      mask_path: { type: 'string', description: 'Optional independent alpha mask matching the first input image format and dimensions. Omit this field entirely for whole-image edits; never send an empty string or repeat input_paths[0] as the mask.' },
      output_path: { type: 'string', required: true, description: 'PNG output path inside the current session working directory.' },
        model: { type: 'string', description: '可选的生图模型 ID；未填写时使用环境配置或账户目录中的唯一可用模型。' },
      size: { type: 'string', description: 'auto 或 WIDTHxHEIGHT，例如 2048x2048；不要假设 1024x1024 是最大尺寸。' },
      quality: { type: 'string', enum: ['auto', 'low', 'medium', 'high'], description: 'Optional explicit override. Omit unless the user requested a quality level; the environment setting is otherwise authoritative (default: medium). Image dimensions do not imply high quality.' },
      overwrite: { type: 'boolean', description: 'Replace an existing output file, including a source image. Defaults to false.' },
    },
    output: {
      schema: IMAGE_OUTPUT_SCHEMA,
      render: (_args, value) => renderResult('Edited', value as GenerateImageResult),
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
        ...(args.mask_path?.trim() ? { maskPath: args.mask_path.trim() } : {}),
        ...(args.model === undefined ? {} : { model: args.model }),
        ...(args.size === undefined ? {} : { size: validateImageSize(args.size) }),
        ...(args.quality === undefined ? {} : { quality: args.quality }),
        ...(args.overwrite === undefined ? {} : { overwrite: args.overwrite }),
      }, cwd, exec.signal) } finally { await Promise.all(attachmentPaths.map(path => unlink(path).catch(() => undefined))) }
    },
    presentCall: args => ({
      card: 'generic',
      title: `Edit image ${args.output_path}`,
      kind: 'edit',
      locations: [...(args.input_paths ?? []).map(path => ({ path })), { path: args.output_path }],
    }),
  }))
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
    const path = join(root, `input-${index}.${extension}`)
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
