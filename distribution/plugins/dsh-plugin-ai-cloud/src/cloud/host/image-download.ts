import { externalArtifact } from './artifact-network.js'

export type ImageArtifactFetch = (url: URL, signal: AbortSignal, headers?: Record<string, string>) => Promise<Response>
const LIMIT = 64 * 1024 * 1024
const RANGE_BYTES = 256 * 1024

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason) }
    const cleanup = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    promise.then(value => { cleanup(); resolve(value) }, error => { cleanup(); reject(error) })
  })
}

/** One paid generation can have several safe, credential-free CDN transfers. */
export async function downloadImageBytes(url: URL, options: { signal?: AbortSignal; fetch?: ImageArtifactFetch; timeoutMs?: number; slowAfterMs?: number } = {}): Promise<{ bytes: Uint8Array; transport: 'single' | 'range'; attempts: number }> {
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw new Error('IMAGE_UNSAFE_DOWNLOAD_URL')
  const signal = AbortSignal.any([...(options.signal ? [options.signal] : []), AbortSignal.timeout(options.timeoutMs ?? 600_000)])
  const fetcher = options.fetch ?? externalArtifact
  let attempts = 0
  const request = async (headers: Record<string, string>, requestSignal: AbortSignal) => {
    attempts++
    return abortable(fetcher(url, requestSignal, { 'Accept-Encoding': 'identity', ...headers }), requestSignal)
  }
  const single = async (allowRange: boolean): Promise<{ bytes: Uint8Array; transport: 'single' | 'range'; attempts: number }> => {
    const controller = new AbortController()
    const transferSignal = AbortSignal.any([signal, controller.signal])
    const response = await request({}, transferSignal)
    if (!response.ok || response.status === 206 || !response.body) { void response.body?.cancel(); throw new Error(`IMAGE_DOWNLOAD_HTTP_${response.status}`) }
    const total = Number(response.headers.get('content-length'))
    if (total > LIMIT) { void response.body.cancel(); throw new Error('IMAGE_DOWNLOAD_TOO_LARGE') }
    const canRange = allowRange && Number.isSafeInteger(total) && total > RANGE_BYTES * 2
      && (!response.headers.get('content-encoding') || response.headers.get('content-encoding') === 'identity')
    const validator = response.headers.get('etag')?.replace(/^W\/.*$/, '') || response.headers.get('last-modified') || undefined
    const reader = response.body.getReader(), chunks: Uint8Array[] = []
    let size = 0, slowTimer: ReturnType<typeof setTimeout> | undefined
    const slow = new Promise<'slow'>(resolve => { if (canRange) slowTimer = setTimeout(() => resolve('slow'), options.slowAfterMs ?? 5000) })
    try {
      for (;;) {
        const read = abortable(reader.read(), transferSignal)
        const next = canRange ? await Promise.race([read, slow]) : await read
        if (next === 'slow') {
          // Preserve the prefix; request only bytes that have not arrived yet.
          // Fast downloads finish before this timer and need one connection.
          if (size < 512 * 1024) {
            controller.abort(); void reader.cancel().catch(() => {})
            try { return await ranged(total, Buffer.concat(chunks), validator) }
            catch (error) { signal.throwIfAborted(); if (!(error instanceof RangeUnavailable)) throw error; return single(false) }
          }
          // The connection is progressing quickly. Consume the pending read.
          const pending = await read
          if (pending.done) break
          size += pending.value.length; chunks.push(pending.value)
        } else {
          if (next.done) break
          size += next.value.length; chunks.push(next.value)
        }
        if (size > LIMIT) throw new Error('IMAGE_DOWNLOAD_TOO_LARGE')
        // The timer is only an initial throughput decision, not a deadline.
        if (slowTimer && size >= 512 * 1024) { clearTimeout(slowTimer); slowTimer = undefined }
      }
      if (total > 0 && size !== total && !response.headers.get('content-encoding')) {
        if (canRange && size < total) return ranged(total, Buffer.concat(chunks), validator)
        throw new Error('IMAGE_DOWNLOAD_TRUNCATED')
      }
      return { bytes: Buffer.concat(chunks), transport: 'single', attempts }
    } finally { if (slowTimer) clearTimeout(slowTimer); controller.abort(); void reader.cancel().catch(() => {}) }
  }
  const ranged = async (total: number, prefix: Buffer, validator?: string): Promise<{ bytes: Uint8Array; transport: 'range'; attempts: number }> => {
    const bytes = Buffer.alloc(total); prefix.copy(bytes)
    const controller = new AbortController(), rangeSignal = AbortSignal.any([signal, controller.signal])
    let next = prefix.length
    const worker = async () => {
      while (next < total) {
        let offset = next; const end = Math.min(total - 1, next + RANGE_BYTES - 1); next = end + 1
        for (let retry = 0; offset <= end; retry++) {
          const partSignal = AbortSignal.any([rangeSignal, AbortSignal.timeout(75_000)])
          let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
          try {
            const response = await request({ Range: `bytes=${offset}-${end}`, ...(validator ? { 'If-Range': validator } : {}) }, partSignal)
            if (response.status !== 206 || response.headers.get('content-range') !== `bytes ${offset}-${end}/${total}` || (response.headers.get('content-encoding') && response.headers.get('content-encoding') !== 'identity')) {
              void response.body?.cancel(); throw new RangeUnavailable()
            }
            if (!response.body) throw new Error('IMAGE_DOWNLOAD_EMPTY')
            reader = response.body.getReader()
            for (;;) {
              const chunk = await abortable(reader.read(), partSignal)
              if (chunk.done) break
              if (chunk.value.length > end - offset + 1) throw new RangeUnavailable()
              bytes.set(chunk.value, offset); offset += chunk.value.length
            }
            if (offset <= end) throw new Error('IMAGE_DOWNLOAD_TRUNCATED')
          } catch (error) {
            rangeSignal.throwIfAborted()
            if (error instanceof RangeUnavailable || retry >= 2) throw error
            // A reset or truncated response retries only the missing tail of
            // this segment, while completed segments remain in the buffer.
          } finally { void reader?.cancel().catch(() => {}) }
        }
      }
    }
    try { await Promise.all(Array.from({ length: Math.min(8, Math.ceil((total - prefix.length) / RANGE_BYTES)) }, worker)) }
    finally { controller.abort() }
    return { bytes, transport: 'range', attempts }
  }
  try { return await single(true) }
  catch (error) {
    if (options.signal?.aborted) throw options.signal.reason
    if (signal.aborted) throw new Error('IMAGE_DOWNLOAD_TIMEOUT: 已生成的图片仍可用原请求恢复下载。')
    throw new Error('IMAGE_DOWNLOAD_FAILED: 请用相同提示词、输出路径和参数恢复下载，不要重新生成。', { cause: error })
  }
}

class RangeUnavailable extends Error {}
