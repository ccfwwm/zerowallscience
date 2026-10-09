import type { ContentBlock } from '@deepseek-ai/dsh-llm'

export interface StoredResult {
  readonly ref: string
  readonly tool: string
  readonly text: string
  readonly content: readonly ContentBlock[]
}

interface AgentStore {
  readonly entries: Map<string, StoredResult>
  characters: number
}

const stores = new Map<string, AgentStore>()
const MAX_ENTRIES = 32
const MAX_STORE_CHARACTERS = 1_000_000

export function dropAgentResults(agentId: string): void {
  stores.delete(agentId)
}

export function dropAllResults(): void {
  stores.clear()
}

function textOf(content: readonly ContentBlock[]): string {
  return content.map(block => block.type === 'text' ? block.text : `[${block.type}]`).join('\n')
}

function store(agentId: string, tool: string, content: readonly ContentBlock[]): StoredResult | undefined {
  try {
    const text = textOf(content)
    if (text.length > MAX_STORE_CHARACTERS) return undefined
    const bucket = stores.get(agentId) ?? { entries: new Map(), characters: 0 }
    while (bucket.entries.size >= MAX_ENTRIES || bucket.characters + text.length > MAX_STORE_CHARACTERS) {
      const oldest = bucket.entries.keys().next().value
      if (oldest === undefined) return undefined
      const removed = bucket.entries.get(oldest)
      bucket.entries.delete(oldest)
      bucket.characters -= removed?.text.length ?? 0
    }
    const ref = `${agentId}:${tool}:${bucket.entries.size}:${text.length}`
    const entry: StoredResult = { ref, tool, text, content }
    bucket.entries.set(ref, entry)
    bucket.characters += text.length
    stores.set(agentId, bucket)
    return entry
  } catch {
    return undefined
  }
}

export function readStoredResult(
  agentId: string,
  ref: string,
  request: { mode: 'full' | 'range' | 'search'; start?: number; end?: number; keyword?: string },
): { ok: true; text: string } | { ok: false; message: string } {
  const entry = stores.get(agentId)?.entries.get(ref)
  if (entry === undefined) {
    return {
      ok: false,
      message: `result ${JSON.stringify(ref)} is not available in this session. It was never stored, belongs to another agent, or did not survive reload.`,
    }
  }
  if (request.mode === 'full') return { ok: true, text: entry.text }
  if (request.mode === 'search') {
    const keyword = request.keyword ?? ''
    if (keyword === '') return { ok: false, message: 'keyword is required for search' }
    const lines = entry.text.split('\n')
    const hits = lines
      .map((line, index) => ({ line, index }))
      .filter(item => item.line.includes(keyword))
      .slice(0, 40)
    return { ok: true, text: hits.map(item => `${item.index + 1}: ${item.line}`).join('\n') }
  }
  const start = Math.max(0, request.start ?? 0)
  const end = Math.max(start, request.end ?? start)
  return { ok: true, text: entry.text.slice(start, end) }
}

function category(tool: string): 'test' | 'lint' | 'log' | 'list' | 'source' | 'generic' {
  if (/test|vitest|jest|pytest/i.test(tool)) return 'test'
  if (/lint|typecheck|tsc|diagnostic/i.test(tool)) return 'lint'
  if (/log|bash|shell|terminal|exec/i.test(tool)) return 'log'
  if (/list|glob|grep|search/i.test(tool)) return 'list'
  if (/read|diff|patch|edit|write/i.test(tool)) return 'source'
  return 'generic'
}

function preview(tool: string, text: string, maxCharacters: number): string {
  const kind = category(tool)
  if (kind === 'test') {
    const failed = /fail|error|assert/i.test(text)
    if (!failed) return text.split('\n').slice(0, 12).join('\n').slice(0, maxCharacters)
    return text.split('\n').filter(line => /fail|error|assert|at /i.test(line)).join('\n').slice(0, maxCharacters)
  }
  if (kind === 'lint') {
    return text.split('\n').filter(line => /error|warning|:\d+|TS\d+/i.test(line)).join('\n').slice(0, maxCharacters)
  }
  if (kind === 'log') {
    const lines = text.split('\n').filter((line, index, all) => index === 0 || line !== all[index - 1])
    const head = lines.slice(0, 20)
    const tail = lines.slice(-20)
    return [...head, '…', ...tail].join('\n').slice(0, maxCharacters)
  }
  if (kind === 'list') {
    const lines = text.split('\n')
    return [`total: ${lines.length}`, ...lines.slice(0, 30)].join('\n').slice(0, maxCharacters)
  }
  const head = text.slice(0, Math.floor(maxCharacters / 2))
  const tail = text.slice(-Math.floor(maxCharacters / 4))
  return `${head}\n…\n${tail}`
}

/**
 * Budget the model-facing content of one direct dispatch.
 * The canonical program value is not an input and is never rewritten.
 * Non-text blocks are preserved. Storage failure returns the original content.
 */
export function budgetDispatchContent(
  agentId: string,
  tool: string,
  content: readonly ContentBlock[],
  maxCharacters: number,
): ContentBlock[] {
  const nonText = content.filter(block => block.type !== 'text')
  const text = textOf(content.filter(block => block.type === 'text'))
  if (text.length <= maxCharacters) return [...content]
  const stored = store(agentId, tool, content)
  if (stored === undefined) return [...content]
  const footer = `\n\n[result truncated for model text; original retained as ${stored.ref}. Call tool_result_read with this ref.]`
  const room = Math.max(0, maxCharacters - footer.length)
  const body = preview(tool, text, room)
  const rendered = `${body}${footer}`
  if (rendered.length >= text.length) return [...content]
  return [
    { type: 'text', text: rendered },
    ...nonText,
  ]
}
