import { createHash, randomBytes } from 'node:crypto'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type { LitConfig } from '../config.ts'
import type { Paper } from '../types.ts'

type Row = { key: string; data: Record<string, any> }
const memories = new Map<string, { key: string; remember: boolean }>()
const pendingAuthorizations = new Map<string, Promise<{ key: string; remember: boolean }>>()
const keyOf = () => Array.from(randomBytes(8), b => '23456789ABCDEFGHIJKLMNPQRSTUVWXYZ'[b % 32]).join('')
export const titleKey = (text: string) => text.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
export const doiKey = (text: string) => text.replace(/^https?:\/\/(?:dx\.)?doi.org\//i, '').replace(/^doi:\s*/i, '').trim().toLowerCase()

/** Writes target Zotero's authenticated Local API, never the SQLite file. */
export class LocalZoteroWriter {
  private serverId = ''
  constructor(private cfg: LitConfig) {}
  private get grantId() { return `${this.cfg.zoteroApiBase}|${this.serverId}` }
  private get credential() { return credentialKey('zotero-harvest', 'zotero-api-' + createHash('sha256').update(this.grantId).digest('hex')) }
  async connect() {
    const response = await fetch(this.cfg.zoteroApiBase + '/api/', { redirect: 'error', signal: AbortSignal.timeout(this.cfg.httpTimeoutMs) })
    if (!response.ok) throw new Error(`Zotero Local API unavailable (HTTP ${response.status}). Enable it in Zotero settings.`)
    this.serverId = response.headers.get('Zotero-Server-ID') ?? ''
    if (!this.serverId) throw new Error('This Zotero version does not expose authenticated local writes. Update Zotero or use inbox mode for manual import.')
  }
  async read(path: string): Promise<any> {
    const response = await fetch(this.cfg.zoteroApiBase + path, { redirect: 'error', signal: AbortSignal.timeout(this.cfg.httpTimeoutMs), headers: { 'Zotero-API-Version': '3', 'Zotero-Server-ID': this.serverId } })
    if (!response.ok) throw new Error(`Zotero read failed (HTTP ${response.status})`)
    if (response.headers.get('Zotero-Server-ID') !== this.serverId) throw new Error('Zotero instance changed; operation stopped')
    return response.json()
  }
  private async storedGrant() {
    const memory = memories.get(this.grantId)
    if (memory) return memory
    const stored = await this.cfg.credentials?.readRecord(this.credential)
    const payload = stored?.kind === 'grant' ? stored.payload as { serverId?: unknown; key?: unknown } | null : null
    if (payload?.serverId === this.serverId && typeof payload.key === 'string') {
      const grant = { key: payload.key, remember: true }; memories.set(this.grantId, grant); return grant
    }
    // Previous builds could store a bare hash only when it began with a letter.
    const legacyId = createHash('sha256').update(this.grantId).digest('hex')
    if (/^[a-z]/.test(legacyId)) {
      const legacy = await this.cfg.credentials?.readRecord(credentialKey('zotero-harvest', legacyId))
      const value = legacy?.kind === 'grant' ? legacy.payload as { serverId?: unknown; key?: unknown } | null : null
      if (value?.serverId === this.serverId && typeof value.key === 'string' && value.key) {
        await this.cfg.credentials?.modifyRecord(this.credential, async () => ({ kind: 'grant', payload: value }))
        await this.cfg.credentials?.deleteRecord(credentialKey('zotero-harvest', legacyId))
        const grant = { key: value.key, remember: true }; memories.set(this.grantId, grant); return grant
      }
    }
  }
  async authorizationStatus() {
    const grant = await this.storedGrant()
    return { authorized: !!grant, remember: grant?.remember ?? false }
  }
  async requestAuthorization(force = false) {
    if (force) await this.invalidate()
    const grant = await this.authorize()
    return { authorized: true, remember: grant.remember }
  }
  private async authorize() {
    const existing = pendingAuthorizations.get(this.grantId)
    if (existing) return existing
    const pending = this.acquireGrant()
    pendingAuthorizations.set(this.grantId, pending)
    try { return await pending } finally { if (pendingAuthorizations.get(this.grantId) === pending) pendingAuthorizations.delete(this.grantId) }
  }
  private async acquireGrant() {
    const stored = await this.storedGrant()
    if (stored) return stored
    const response = await fetch(this.cfg.zoteroApiBase + '/api/local/authorize', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120000),
      headers: { 'Content-Type': 'application/json', 'Zotero-Server-ID': this.serverId },
      body: JSON.stringify({ appName: 'ZeroWall Science — Zotero Harvest' }),
    })
    if (!response.ok) throw new Error(`Zotero write authorization was denied or unavailable (HTTP ${response.status})`)
    const grant = await response.json() as { key: string; remember: boolean }
    if (typeof grant.key !== 'string' || !grant.key || response.headers.get('Zotero-Server-ID') !== this.serverId) throw new Error('Invalid Zotero authorization response')
    if (grant.remember) await this.cfg.credentials?.modifyRecord(this.credential, async () => ({ kind: 'grant', payload: { key: grant.key, serverId: this.serverId } }))
    memories.set(this.grantId, grant)
    return grant
  }
  private async invalidate() {
    memories.delete(this.grantId)
    await this.cfg.credentials?.deleteRecord(this.credential)
  }
  async write(path: string, body: unknown, form = false, headers: Record<string, string> = {}): Promise<any> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const grant = await this.authorize()
      let response: Response
      try {
        response = await fetch(this.cfg.zoteroApiBase + path, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(this.cfg.httpTimeoutMs),
          headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json',
            'Zotero-API-Version': '3', 'Zotero-Server-ID': this.serverId, 'Zotero-API-Key': grant.key, ...headers },
          body: form ? String(body) : JSON.stringify(body),
        })
      } finally { if (!grant.remember) memories.delete(this.grantId) }
      // Only a rejected authorization is retryable. Never replay an ambiguous write.
      if (response.status === 401 && attempt === 0) { await this.invalidate(); continue }
      if (!response.ok) throw new Error(`Zotero write failed (HTTP ${response.status}); no automatic replay was attempted`)
      if (response.headers.get('Zotero-Server-ID') !== this.serverId) throw new Error('Zotero instance changed during write')
      if (response.status === 204) return undefined
      return response.json()
    }
  }
  private created(result: any, key: string) {
    const row = result?.successful?.['0']
    if (row?.key === key) return row as Row
    if (result?.unchanged?.['0'] === key) return { key, data: {} }
    throw new Error(`Zotero rejected this item: ${result?.failed?.['0']?.message ?? 'invalid batch response'}`)
  }
  async find(paper: Paper): Promise<Row | undefined> {
    const queries = paper.doi ? [doiKey(paper.doi), paper.title] : [paper.title]
    for (const q of queries) {
      const query = new URLSearchParams({ q, qmode: 'everything', limit: '100', itemType: '-attachment || note' })
      const rows = await this.read('/api/users/0/items?' + query) as Row[]
      const match = rows.find(row => (paper.doi && row.data.DOI && doiKey(row.data.DOI) === doiKey(paper.doi))
        || (titleKey(row.data.title ?? '') === titleKey(paper.title) && (!paper.doi || !row.data.DOI)))
      if (match) return match
    }
  }
  async collection(name?: string): Promise<string | undefined> {
    if (!name) return undefined
    const matches: Row[] = []
    for (let start = 0; start < 10000; start += 100) {
      const rows = await this.read(`/api/users/0/collections?limit=100&start=${start}`) as Row[]
      matches.push(...rows.filter(row => row.key === name || row.data.name === name))
      if (rows.length < 100) break
    }
    if (matches.length > 1) throw new Error('Multiple Zotero collections have this name; supply the collection key')
    if (matches[0]) return matches[0].key
    const key = keyOf()
    return this.created(await this.write('/api/users/0/collections', [{ key, name, parentCollection: false }]), key).key
  }
  ref(key: string) { return `zotero://user/0/item/${key}?server=${encodeURIComponent(this.serverId)}` }
  async add(p: Paper, collection?: string) {
    const key = keyOf()
    const item = { key, itemType: 'journalArticle', title: p.title,
      creators: p.authors.map(name => ({ creatorType: 'author', name })),
      date: p.year ? String(p.year) : '', publicationTitle: p.venue ?? '', DOI: p.doi ? doiKey(p.doi) : '',
      url: p.url ?? '', abstractNote: p.abstract ?? '', tags: (p.keywords ?? []).map(tag => ({ tag })), collections: collection ? [collection] : [] }
    return this.created(await this.write('/api/users/0/items', [item]), key)
  }
  async attach(parentKey: string, bytes: Uint8Array) {
    const key = keyOf()
    this.created(await this.write('/api/users/0/items', [{ key, itemType: 'attachment', parentItem: parentKey,
      linkMode: 'imported_file', title: 'Full Text PDF', contentType: 'application/pdf', filename: 'paper.pdf' }]), key)
    const filePath = `/api/users/0/items/${key}/file`
    const headers = { 'If-None-Match': '*' }
    const form = new URLSearchParams({ md5: createHash('md5').update(bytes).digest('hex'), filename: 'paper.pdf',
      filesize: String(bytes.length), mtime: String(Date.now()), contentType: 'application/pdf' })
    const upload = await this.write(filePath, form, true, headers)
    if (!upload.exists) {
      const url = new URL(upload.url)
      if (url.origin !== this.cfg.zoteroApiBase || !/^\/api\/local\/uploads\/[A-Za-z0-9]+$/.test(url.pathname)) throw new Error('Zotero returned an unexpected upload destination')
      const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(this.cfg.httpTimeoutMs), headers: { 'Content-Type': 'application/octet-stream' }, body: Buffer.from(bytes) })
      if (!response.ok) throw new Error(`PDF upload failed (HTTP ${response.status})`)
      await this.write(filePath, new URLSearchParams({ upload: upload.uploadKey }), true, headers)
    }
    return key
  }
}
