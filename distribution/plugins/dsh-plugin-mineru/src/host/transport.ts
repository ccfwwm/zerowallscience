/** Cancellable HTTP, bounded retries and service-owned request budgets. */
import type { MineruConfig } from '../shared/types.ts'
import { MineruError } from './errors.ts'

/** Wait without retaining an abort listener after settlement. @param ms - Delay. @param signal - Operation lifetime. */
export async function sleepAbort(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  await new Promise<void>((done, reject) => {
    const finish = (): void => { signal.removeEventListener('abort', abort); done() }
    const timer = setTimeout(finish, ms)
    const abort = (): void => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
  })
}

/** Fetch with retry only after explicit rejection; transport failures never repeat a submission.
 * @param url - Validated endpoint or signed upload/result URL.
 * @param init - Request fields.
 * @param signal - Operation lifetime.
 * @returns The response, including a final non-success status.
 */
export async function request(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted()
    let response: Response
    try { response = await fetch(url, { ...init, signal }) }
    catch (error) {
      signal.throwIfAborted()
      throw new MineruError(init.method === 'POST' ? 'MINERU_SUBMISSION_UNKNOWN' : 'MINERU_NETWORK',
        init.method === 'POST' ? 'MinerU 提交结果未知；请先检查服务端任务，避免重复提交。' : 'MinerU 网络请求失败；保留任务编号后重试查询。', undefined, { cause: error })
    }
    if (response.status !== 429 || attempt === 3) return response
    const header = response.headers.get('retry-after')
    const seconds = header === null ? NaN : Number(header)
    const delay = Number.isFinite(seconds) ? seconds * 1000 : header ? Date.parse(header) - Date.now() : 500 * 2 ** attempt
    await response.body?.cancel()
    await sleepAbort(Math.max(0, Math.min(Number.isFinite(delay) ? delay : 500 * 2 ** attempt, 60_000)), signal)
  }
}

/** Decode the external API envelope. @param response - API response. @returns Validated object data. */
export async function responseData(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) throw new MineruError(`MINERU_HTTP_${response.status}`, `MinerU 请求失败（HTTP ${response.status}）；检查认证、配额或服务地址。`)
  let value: unknown
  try { value = await response.json() }
  catch (error) { throw new MineruError('MINERU_INVALID_RESPONSE', 'MinerU 返回了无效 JSON。', undefined, { cause: error }) }
  return payloadData(value)
}

/** Validate a MinerU JSON envelope. @param value - External JSON. @returns Response data. */
export function payloadData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MineruError('MINERU_INVALID_RESPONSE', 'MinerU 返回格式无效。')
  const record = value as Record<string, unknown>
  if (record.code !== undefined && record.code !== 0 && record.code !== '0') {
    const code = String(record.code)
    const hint = ['A0202', 'A0211'].includes(code) ? '认证失败，请更新 Token。' : code === '-60018' ? '当日配额已满，请稍后恢复。' : '请检查文件、配额与解析选项。'
    throw new MineruError('MINERU_API', `MinerU API 错误 ${code.replace(/[^A-Za-z0-9_-]/gu, '').slice(0, 32)}；${hint}`)
  }
  const data = record.data ?? record
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new MineruError('MINERU_INVALID_RESPONSE', 'MinerU 返回 data 无效。')
  return data as Record<string, unknown>
}

/** Download bounded artifacts. @param url - Result URL. @param signal - Lifetime. @param limit - Byte limit. @returns Bytes. */
export async function downloadBytes(url: string, signal: AbortSignal, limit = 512 * 1024 * 1024): Promise<Uint8Array> {
  const response = await request(url, { method: 'GET' }, signal)
  if (!response.ok || !response.body) throw new MineruError('MINERU_DOWNLOAD', 'MinerU 结果下载失败；可用原任务编号重新收集。')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      total += part.value.byteLength
      if (total > limit) throw new MineruError('MINERU_RESULT_TOO_LARGE', 'MinerU 结果超过大小限制。')
      chunks.push(part.value)
    }
  } finally { await reader.cancel(); reader.releaseLock() }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

/** A service lifetime owns its queues and UTC-day submission counter. */
export class RequestBudget {
  private submitTail: Promise<void> = Promise.resolve()
  private pollTail: Promise<void> = Promise.resolve()
  private nextSubmit = 0
  private nextPoll = 0
  private day = ''
  private count = 0

  /** Reserve request slots. @param cfg - Current configuration. @param kind - API request category. @param count - Files submitted. @param signal - Lifetime. */
  async acquire(cfg: MineruConfig, kind: 'submit' | 'poll', count: number, signal: AbortSignal): Promise<void> {
    const pending = kind === 'submit' ? this.submitTail : this.pollTail
    const operation = pending.catch(() => undefined).then(async () => {
      signal.throwIfAborted()
      const now = Date.now()
      await sleepAbort(Math.max(0, (kind === 'submit' ? this.nextSubmit : this.nextPoll) - now), signal)
      if (kind === 'submit') {
        const day = new Date().toISOString().slice(0, 10)
        if (day !== this.day) { this.day = day; this.count = 0 }
        if (this.count + count > cfg.dailyLimit) throw new MineruError('MINERU_DAILY_LIMIT', '本进程 MinerU 每日提交上限已达到；请稍后恢复。')
        this.count += count
        this.nextSubmit = Date.now() + Math.ceil(60_000 * count / cfg.submitRatePerMinute)
      } else this.nextPoll = Date.now() + Math.ceil(60_000 / cfg.pollRatePerMinute)
    })
    if (kind === 'submit') this.submitTail = operation
    else this.pollTail = operation
    await operation
  }
}
