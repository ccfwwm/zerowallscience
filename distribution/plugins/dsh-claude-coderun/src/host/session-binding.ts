import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

/** Independent from CLI generations and disposable resource projections. */
export interface ClaudeSessionBinding {
  schema: 1
  nativeId: string
  cwd: string
  initialized: boolean
  submitted: string[]
  pending?: { uuid: string; keys: string[] }
  state: 'idle' | 'submitted' | 'running' | 'failed' | 'stopped'
}

export class ClaudeSessionBindings {
  constructor(private readonly configDir: string) {}
  private file(id: string): string { return join(this.configDir, 'bindings', `${createHash('sha256').update(id).digest('hex')}.json`) }
  async load(id: string, cwd: string): Promise<{ binding: ClaudeSessionBinding; recovery?: string }> {
    let previous: ClaudeSessionBinding | undefined
    try {
      const file = this.file(id), info = await lstat(file)
      if (!info.isFile() || info.isSymbolicLink() || info.size > 256_000) throw new Error('Invalid Claude binding file.')
      previous = JSON.parse(await readFile(file, 'utf8')) as ClaudeSessionBinding
      if (previous.schema !== 1 || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/u.test(previous.nativeId)
        || typeof previous.cwd !== 'string' || !Array.isArray(previous.submitted) || !previous.submitted.every(key => typeof key === 'string')) throw new Error('Invalid Claude binding.')
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    if (previous?.pending && (!/^[\da-f-]{36}$/u.test(previous.pending.uuid) || !Array.isArray(previous.pending.keys)
      || !previous.pending.keys.every(key => typeof key === 'string'))) throw new Error('Invalid Claude pending input.')
    // The CLI can persist its first input before our init/progress write survives
    // a crash. Inspect the transcript even for an uninitialized binding.
    const transcript = previous ? await this.transcript(previous.nativeId) : undefined
    if (previous?.cwd === cwd && (!previous.initialized || transcript)) {
      if (transcript && (previous.pending || !previous.initialized)) {
        const input = createReadStream(transcript)
        const lines = createInterface({ input, crlfDelay: Infinity })
        try {
          for await (const line of lines) {
            let message: { type?: string; uuid?: string }
            try { message = JSON.parse(line) } catch { continue /* An interrupted final JSONL write is not evidence of delivery. */ }
            if (message.type !== 'user' && message.type !== 'assistant') continue
            previous.initialized = true
            if (message.type === 'user' && previous.pending && message.uuid === previous.pending.uuid) {
              previous.submitted = [...new Set([...previous.submitted, ...previous.pending.keys])]
              delete previous.pending
              break
            }
          }
        } finally { lines.close(); input.destroy() }
        await this.save(id, previous)
      }
      return { binding: previous }
    }
    const binding: ClaudeSessionBinding = { schema: 1, nativeId: randomUUID(), cwd, initialized: false, submitted: [], state: 'idle' }
    await this.save(id, binding)
    return { binding, ...(previous ? { recovery: 'Claude 原生记录缺失或工作目录改变；已从当前 ZeroWall 历史重建独立会话。' } : {}) }
  }
  async save(id: string, binding: ClaudeSessionBinding): Promise<void> {
    const file = this.file(id), temporary = `${file}.${randomUUID()}.tmp`
    await mkdir(join(this.configDir, 'bindings'), { recursive: true, mode: 0o700 })
    await writeFile(temporary, JSON.stringify(binding), { mode: 0o600, flag: 'wx' })
    try { await rename(temporary, file) } finally { await rm(temporary, { force: true }) }
  }
  private async transcript(nativeId: string): Promise<string | undefined> {
    const root = join(this.configDir, 'projects')
    const directories = await readdir(root, { withFileTypes: true }).catch(error => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    for (const directory of directories) {
      if (!directory.isDirectory() || directory.isSymbolicLink()) continue
      const info = await lstat(join(root, directory.name, `${nativeId}.jsonl`)).catch(error => {
        if (error.code === 'ENOENT') return undefined
        throw error
      })
      if (info?.isFile() && !info.isSymbolicLink() && info.size > 0) return join(root, directory.name, `${nativeId}.jsonl`)
    }
    return undefined
  }
}

export function inputKey(value: unknown): string {
  const message = value as { id?: unknown }
  return createHash('sha256').update(typeof message?.id === 'string' ? message.id : JSON.stringify(value)).digest('hex')
}
