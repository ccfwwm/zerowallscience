const MAX_BYTES = 256 * 1024 * 1024
const CHUNK = 1024 * 1024
import { mediaAbortable } from './media-abort.js'
import { mediaHttpError } from './media-retry.js'

async function bytes(response: Response, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  if (!response.ok || !response.body) { void response.body?.cancel().catch(() => {}); throw mediaHttpError('MEDIA_DOWNLOAD_HTTP', response) }
  if (Number(response.headers.get('content-length')) > limit) { void response.body.cancel().catch(() => {}); throw new Error('MEDIA_ARTIFACT_TOO_LARGE') }
  const reader = response.body.getReader(), parts: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const next = await mediaAbortable(reader.read(), signal); if (next.done) break
      size += next.value.byteLength
      if (size > limit) throw new Error('MEDIA_ARTIFACT_TOO_LARGE')
      parts.push(next.value)
    }
    return Buffer.concat(parts)
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock() }
}

/** Gateway task content supports ranges. Bounded chunks avoid restarting a
 * complete video on a transient timeout; external hosts never receive a key. */
export async function downloadMediaBytes(fetchPart: (headers: Record<string, string>, signal: AbortSignal) => Promise<Response>, signal: AbortSignal, ranged: boolean): Promise<Uint8Array> {
  const transfer = new AbortController()
  const transferSignal = AbortSignal.any([signal, transfer.signal])
  const readPart = async (start: number, end: number): Promise<{ data: Uint8Array; total?: number }> => {
    for (let attempt = 0; ; attempt++) {
      transferSignal.throwIfAborted()
      try {
        const partSignal = AbortSignal.any([transferSignal, AbortSignal.timeout(30_000)])
        const response = await mediaAbortable(fetchPart(ranged ? { range: `bytes=${start}-${end}` } : {}, partSignal), partSignal)
        // Preserve temporary HTTP failures before validating a successful range.
        // The ledger owns their backoff and persisted original-task continuation.
        if (!response.ok) { void response.body?.cancel().catch(() => {}); throw mediaHttpError('MEDIA_DOWNLOAD_HTTP', response) }
        if (response.status !== 206) {
          if (start !== 0) { void response.body?.cancel().catch(() => {}); throw new Error('MEDIA_INVALID_CONTENT_RANGE') }
          return { data: await bytes(response, MAX_BYTES, partSignal) }
        }
        const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') ?? '')
        const from = Number(match?.[1]), to = Number(match?.[2]), total = Number(match?.[3])
        if (!match || from !== start || to !== Math.min(end, total - 1) || !Number.isSafeInteger(total) || total < 1 || total > MAX_BYTES) { void response.body?.cancel().catch(() => {}); throw new Error('MEDIA_INVALID_CONTENT_RANGE') }
        const data = await bytes(response, to - from + 1, partSignal)
        if (data.length !== to - from + 1) throw new Error('MEDIA_TRUNCATED_ARTIFACT')
        return { data, total }
      } catch (error) {
        transferSignal.throwIfAborted()
        if (attempt >= 1 || !(error instanceof TypeError || error instanceof Error && error.name === 'TimeoutError')) throw error
      }
    }
  }
  try {
    const first = await readPart(0, CHUNK - 1)
    if (first.total === undefined || first.data.length === first.total) return first.data
    const total = first.total, parts: Uint8Array[] = [first.data]
    const count = Math.ceil(total / CHUNK); let cursor = 1
    await Promise.all(Array.from({ length: Math.min(4, count - 1) }, async () => {
      for (;;) {
        const index = cursor++; if (index >= count) return
        const part = await readPart(index * CHUNK, Math.min(total - 1, (index + 1) * CHUNK - 1))
        if (part.total !== total) throw new Error('MEDIA_INVALID_CONTENT_RANGE')
        parts[index] = part.data
      }
    }))
    return Buffer.concat(parts)
  } finally {
    // One invalid/exhausted chunk terminates this transfer's sibling requests.
    // A later reacquire creates a fresh controller and can retry the same task.
    transfer.abort()
  }
}
