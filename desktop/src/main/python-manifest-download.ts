/** Retry transient transport failures, retaining signature/JSON validation as a hard gate. */
export async function downloadPythonManifest(url: string, fetcher: typeof fetch = fetch): Promise<unknown> {
  const limit = 16 * 1024 ** 2
  for (let attempt = 0; ; attempt++) {
    let bytes: Uint8Array[]
    try {
      const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(90_000) })
      if (!response.ok) {
        await response.body?.cancel()
        const error = new Error(`MCP environment manifest returned HTTP ${response.status}.`)
        if (response.status !== 429 && response.status < 500) throw error
        throw new TypeError(error.message)
      }
      if (!response.body) throw new Error('Python manifest response has no body.')
      const reader = response.body.getReader()
      bytes = []; let size = 0
      try {
        while (true) {
          const next = await reader.read()
          if (next.done) break
          size += next.value.byteLength
          if (size > limit) {
            await reader.cancel()
            throw new Error('Python manifest exceeds 16 MiB size limit.')
          }
          bytes.push(next.value)
        }
      } finally { reader.releaseLock() }
    } catch (error) {
      const transient = error instanceof TypeError || error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
      if (!transient || attempt >= 2) throw error
      await new Promise(accept => setTimeout(accept, 500 * 2 ** attempt))
      continue
    }
    // A malformed or untrusted document must fail instead of being retried.
    return JSON.parse(Buffer.concat(bytes).toString('utf8')) as unknown
  }
}
