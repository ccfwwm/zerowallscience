import type { AttachmentStore, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { LlmError, type ContentBlock, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { Context as PiContext, ImageContent, Message as PiMessage, TextContent, Tool as PiTool } from '@earendil-works/pi-ai'

function zeroUsage() {
  return {
    input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function parseArguments(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : { value: parsed }
  } catch { return { raw: value } }
}

function textOf(blocks: readonly ContentBlock[]): string {
  return blocks.map(block => block.type === 'text' ? block.text : block.type === 'file' ? `[File: ${block.attachment.name}]` : '').join('')
}

async function contentOf(
  blocks: readonly ContentBlock[],
  attachments: AttachmentStore | undefined,
  signal?: AbortSignal,
): Promise<string | (TextContent | ImageContent)[]> {
  if (!blocks.some(block => block.type === 'image')) return textOf(blocks)
  if (attachments === undefined) throw new LlmError('opencode2dsh image input requires the durable attachment service.', 'UNSUPPORTED_CONTENT')
  const content: (TextContent | ImageContent)[] = []
  for (const block of blocks) {
    if (block.type === 'text') {
      if (block.text !== '') content.push({ type: 'text', text: block.text })
    } else if (block.type === 'file') {
      content.push({ type: 'text', text: `[File: ${block.attachment.name}]` })
    } else if (block.type === 'image') {
      const stored = await attachments.readImage(block.attachment as ImageAttachmentRef, signal)
      content.push({ type: 'image', data: Buffer.from(stored.data).toString('base64'), mimeType: stored.ref.mediaType })
    }
  }
  return content
}

export async function toPiContext(options: GenerateOptions, attachments?: AttachmentStore): Promise<PiContext> {
  const toolNames = new Map<string, string>()
  const messages: PiMessage[] = []
  for (const message of options.messages) {
    if (message.role === 'system') {
      const text = textOf(message.content)
      if (text !== '') messages.push({ role: 'user', content: text, timestamp: 0 })
      continue
    }
    if (message.role === 'assistant') {
      const content: Extract<PiMessage, { role: 'assistant' }>['content'] = []
      for (const block of message.content) {
        if (block.type === 'text') content.push({ type: 'text', text: block.text })
        else if (block.type === 'reasoning') content.push({ type: 'thinking', thinking: block.text })
        else if (block.type === 'tool-call') {
          toolNames.set(block.id, block.name)
          content.push({ type: 'toolCall', id: block.id, name: block.name, arguments: parseArguments(block.arguments) })
        }
      }
      messages.push({
        role: 'assistant', content, api: 'openai-completions',
        provider: message.source.kind === 'model' ? message.source.provider : options.provider,
        model: message.source.kind === 'model' ? message.source.model : options.model,
        usage: zeroUsage(), stopReason: content.some(block => block.type === 'toolCall') ? 'toolUse' : 'stop', timestamp: 0,
      })
      continue
    }
    const regular = message.content.filter(block => block.type !== 'tool-result')
    const content = await contentOf(regular, attachments, options.signal)
    const results = message.content.filter((block): block is Extract<ContentBlock, { type: 'tool-result' }> => block.type === 'tool-result')
    if ((typeof content === 'string' ? content.length > 0 : content.length > 0) || results.length === 0) {
      messages.push({ role: 'user', content, timestamp: 0 })
    }
    for (const result of results) {
      const resultContent = await contentOf(result.content, attachments, options.signal)
      messages.push({
        role: 'toolResult', toolCallId: result.toolCallId,
        toolName: toolNames.get(result.toolCallId) ?? 'unknown',
        content: typeof resultContent === 'string' ? [{ type: 'text', text: resultContent || '(no output)' }] : resultContent,
        isError: result.isError ?? false, timestamp: 0,
      })
    }
  }
  const tools = options.tools?.map(tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters }) as PiTool)
  return {
    ...(options.system === undefined ? {} : { systemPrompt: options.system }),
    messages,
    ...(tools === undefined || tools.length === 0 ? {} : { tools }),
  }
}
