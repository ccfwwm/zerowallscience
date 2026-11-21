/** Bounded shared metadata discovery; installation still verifies registry manifests. */
import { parseMarketIndex, type MarketIndex } from '@deepseek-ai/dsh-plugin-market-index'

/** One configured catalog, shared by simultaneous plugin checks until its cache expires. */
export class PluginUpdateIndex {
  private pending: Promise<MarketIndex> | undefined
  private cached: { index: MarketIndex; at: number } | undefined

  /** @param url - Deployment-owned format-1 catalog. @param timeoutMs - Network deadline. @param cacheMs - Reuse duration. */
  constructor(private readonly url: string, private readonly timeoutMs: number, private readonly cacheMs: number) {}

  /**
   * Read shared discovery metadata without installing packages; failed reads remain retryable.
   * @param lifetime - Manager teardown cancellation.
   * @returns Validated catalog.
   */
  read(lifetime: AbortSignal): Promise<MarketIndex> {
    if (this.cached !== undefined && Date.now() - this.cached.at < this.cacheMs) return Promise.resolve(this.cached.index)
    this.pending ??= this.fetch(lifetime).finally(() => { this.pending = undefined })
    return this.pending
  }

  private async fetch(lifetime: AbortSignal): Promise<MarketIndex> {
    const response = await fetch(this.url, { cache: 'no-store', redirect: 'error',
      signal: AbortSignal.any([lifetime, AbortSignal.timeout(this.timeoutMs)]), headers: { accept: 'application/json' } })
    if (!response.ok || response.body === null) throw new Error(`Plugin update catalog HTTP ${response.status}`)
    const chunks: Uint8Array[] = []; let bytes = 0
    for await (const chunk of response.body) {
      bytes += chunk.length
      if (bytes > 2 * 1024 * 1024) throw new Error('Plugin update catalog exceeds 2 MiB')
      chunks.push(chunk)
    }
    const index = parseMarketIndex(JSON.parse(Buffer.concat(chunks).toString('utf8')), this.url)
    this.cached = { index, at: Date.now() }
    return index
  }
}
