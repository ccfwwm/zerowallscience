import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-attachment'
import { defineTool, type JsonValue } from '@deepseek-ai/dsh-tools'
import type { GenerateImageResult } from './generator.js'
import { AiCloudClient } from '@zerowallscience/plugin-account'
import { AiCloudImageGenerator } from './generator.js'
import { SecretBrokerClient } from '@zerowallscience/plugin-secrets'

export * from './generator.js'
export const name = 'zerowall-image-generation'
export const inject = ['tools']

const IMAGE_OUTPUT_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    path: { type: 'string' as const, required: true },
    model: { type: 'string' as const, required: true },
    bytes: { type: 'integer' as const, required: true },
    revisedPrompt: { type: 'string' as const },
    image: {
      type: 'object' as const,
      additionalProperties: false,
      properties: {
        attachmentId: { type: 'string' as const, required: true },
        mediaType: { type: 'string' as const, enum: ['image/png'] as const, required: true },
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
  return [{ type: 'text' as const, text: `${verb} ${value.path} with ${value.model} (${value.bytes} bytes).${warning}` }]
}

function presentationMeta(value: GenerateImageResult): JsonValue {
  const meta: Record<string, JsonValue> = {
    path: value.path,
    model: value.model,
  }
  if (value.image !== undefined) {
    const image: Record<string, JsonValue> = {
      attachmentId: value.image.attachmentId,
      mediaType: value.image.mediaType,
      bytes: value.image.bytes,
      width: value.image.width,
      height: value.image.height,
    }
    if (value.image.name !== undefined) image.name = value.image.name
    meta.image = image
  }
  if (value.previewWarning !== undefined) meta.previewWarning = value.previewWarning
  return meta
}

export function apply(ctx: Context): void {
  const secrets = new SecretBrokerClient()
  const account = new AiCloudClient({ secrets })
  const generator = new AiCloudImageGenerator({
    secrets,
    account,
    attachments: () => ctx.get('attachments'),
  })
  ctx.on('zerowall/account-updated', snapshot => generator.update(snapshot))
  void account.current().then(snapshot => generator.update(snapshot)).catch(() => undefined)

  ctx.tools.register(defineTool({
    name: 'generate_image',
    description: 'Generate a new PNG with the configured ZeroWall AI Cloud gpt-image-2 model. Use edit_image instead when the user wants to modify an existing image.',
    parameters: {
      prompt: { type: 'string', required: true, description: 'Detailed image-generation prompt.' },
      output_path: { type: 'string', required: true, description: 'New PNG path inside the current session working directory.' },
      model: { type: 'string', description: 'Configured image model id. Defaults to gpt-image-2.' },
      size: { type: 'string', enum: ['auto', '1024x1024', '1536x1024', '1024x1536'] },
      quality: { type: 'string', enum: ['auto', 'low', 'medium', 'high'] },
      overwrite: { type: 'boolean', description: 'Replace an existing output file. Defaults to false.' },
    },
    output: {
      schema: IMAGE_OUTPUT_SCHEMA,
      render: (_args, value) => renderResult('Generated', value),
      presentationMeta: (_args, value) => presentationMeta(value),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const cwd = exec.agent?.session.header.cwd
      if (!cwd) throw new Error('generate_image requires a session working directory')
      return await generator.generate({
        prompt: args.prompt,
        outputPath: args.output_path,
        ...(args.model === undefined ? {} : { model: args.model }),
        ...(args.size === undefined ? {} : { size: args.size }),
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
    description: 'Edit one or more existing PNG, JPEG, or WebP images with gpt-image-2 while following the requested changes and preserving referenced content where instructed.',
    parameters: {
      prompt: { type: 'string', required: true, description: 'Detailed edit instruction, including what must remain unchanged.' },
      input_paths: { type: 'array', required: true, items: { type: 'string' }, description: 'One to sixteen source image paths inside the session working directory.' },
      mask_path: { type: 'string', description: 'Optional independent alpha mask matching the first input image format and dimensions. Omit this field entirely for whole-image edits; never send an empty string or repeat input_paths[0] as the mask.' },
      output_path: { type: 'string', required: true, description: 'PNG output path inside the current session working directory.' },
      model: { type: 'string', description: 'Configured image model id. Defaults to gpt-image-2.' },
      size: { type: 'string', enum: ['auto', '1024x1024', '1536x1024', '1024x1536'] },
      quality: { type: 'string', enum: ['auto', 'low', 'medium', 'high'] },
      overwrite: { type: 'boolean', description: 'Replace an existing output file, including a source image. Defaults to false.' },
    },
    output: {
      schema: IMAGE_OUTPUT_SCHEMA,
      render: (_args, value) => renderResult('Edited', value),
      presentationMeta: (_args, value) => presentationMeta(value),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const cwd = exec.agent?.session.header.cwd
      if (!cwd) throw new Error('edit_image requires a session working directory')
      return await generator.edit({
        prompt: args.prompt,
        inputPaths: args.input_paths,
        outputPath: args.output_path,
        ...(args.mask_path?.trim() ? { maskPath: args.mask_path.trim() } : {}),
        ...(args.model === undefined ? {} : { model: args.model }),
        ...(args.size === undefined ? {} : { size: args.size }),
        ...(args.quality === undefined ? {} : { quality: args.quality }),
        ...(args.overwrite === undefined ? {} : { overwrite: args.overwrite }),
      }, cwd, exec.signal)
    },
    presentCall: args => ({
      card: 'generic',
      title: `Edit image ${args.output_path}`,
      kind: 'edit',
      locations: [...args.input_paths.map(path => ({ path })), { path: args.output_path }],
    }),
  }))
}

export default { name, inject, apply }
