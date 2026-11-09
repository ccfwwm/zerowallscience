/** Read package names from the configured index and versions from a PyPI JSON catalog. */
import { z } from 'zod'

const normalize = (value: string) => value.toLowerCase().replace(/[-_.]+/gu, '-')
const names = z.object({ projects: z.array(z.object({ name: z.string() })) })
const metadata = z.object({ info: z.object({ name: z.string(), summary: z.string().nullish(), version: z.string() }), releases: z.record(z.string(), z.array(z.object({ yanked: z.boolean().optional() }))) })

/** @param name - Package name. @param query - Partial words, ignoring Python separator variants. @returns Whether all words match. */
export function packageMatches(name: string, query: string): boolean {
  const value = normalize(name).replaceAll('-', '')
  const words = normalize(query.trim()).split(/\s+/u).map(word => word.replaceAll('-', '')).filter(Boolean)
  return words.length > 0 && words.every(word => {
    let cursor = 0
    for (const character of word) {
      cursor = value.indexOf(character, cursor)
      if (cursor < 0) return false
      cursor++
    }
    return true
  })
}

/** Cache only a completed name listing; failed requests remain retryable. */
export class PythonPackageCatalog {
  private listing: { index: string; result: Promise<string[]> } | undefined
  private readonly abort = new AbortController()
  constructor(private readonly jsonUrl: string, private readonly timeoutMs: number, private readonly fetcher: typeof fetch = fetch) {
    const url = new URL(jsonUrl)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Package metadata URL must use HTTPS without credentials.')
  }
  /** Stop outstanding lookups on plugin disposal. */
  dispose(): void { this.abort.abort() }
  private async body(url: string, accept: string): Promise<string> {
    const response = await this.fetcher(url, { headers: { Accept: accept }, signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(this.timeoutMs)]) })
    if (!response.ok || !response.body) throw new Error('Package catalog lookup failed (' + response.status + '). Retry or check the package index.')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let bytes = 0, text = ''
    try {
      while (true) {
        const part = await reader.read()
        if (part.done) break
        bytes += part.value.byteLength
        if (bytes > 128 * 1024 * 1024) throw new Error('Package catalog exceeds the supported size.')
        text += decoder.decode(part.value, { stream: true })
      }
      return text + decoder.decode()
    } finally { await reader.cancel() }
  }
  private async projects(index: string): Promise<string[]> {
    const text = await this.body(index.replace(/\/?$/u, '/'), 'application/vnd.pypi.simple.v1+json, text/html;q=0.9')
    if (text.trimStart().startsWith('{')) return names.parse(JSON.parse(text)).projects.map(row => row.name)
    return [...text.matchAll(/<a\b[^>]*>([^<]+)<\/a>/giu)].map(row => row[1]!.trim()).filter(name => /^[a-z0-9][a-z0-9._-]*$/iu.test(name))
  }
  /** @param index - Active installation index. @param query - Partial package name. @returns Ranked matching names. */
  async search(index: string, query: string): Promise<{ name: string }[]> {
    if (query.trim().length < 2 || query.length > 100) throw new Error('Enter 2–100 characters of a package name.')
    let listing = this.listing
    if (listing?.index !== index) {
      const result = this.projects(index)
      listing = { index, result }
      this.listing = listing
      void result.catch(() => { if (this.listing?.result === result) this.listing = undefined })
    }
    const projects = await listing.result
    const rank = (name: string) => normalize(name) === normalize(query) ? 0 : normalize(name).startsWith(normalize(query)) ? 1 : normalize(name).includes(normalize(query)) ? 2 : 3
    return projects.filter(name => packageMatches(name, query)).sort((a, b) => rank(a) - rank(b) || a.length - b.length || a.localeCompare(b)).slice(0, 30).map(name => ({ name }))
  }
  /** @param name - Exact selected package name. @returns Non-yanked versions, newest stable release first. */
  async versions(name: string): Promise<{ name: string; summary: string; latestVersion: string; versions: string[] }> {
    if (!/^[a-z0-9][a-z0-9._-]{0,99}$/iu.test(name)) throw new Error('Select a valid Python package name.')
    const value = metadata.parse(JSON.parse(await this.body(new URL(encodeURIComponent(normalize(name)) + '/json', this.jsonUrl.replace(/\/?$/u, '/')).href, 'application/json')))
    const versions = Object.entries(value.releases).filter(([, files]) => files.length > 0 && files.some(file => !file.yanked)).map(([version]) => version).sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
    if (versions.includes(value.info.version)) versions.splice(versions.indexOf(value.info.version), 1), versions.unshift(value.info.version)
    return { name: value.info.name, summary: value.info.summary ?? '', latestVersion: value.info.version, versions }
  }
}
