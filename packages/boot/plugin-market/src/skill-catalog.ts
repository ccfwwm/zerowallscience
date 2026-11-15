/** Bounded skill catalog downloads delegated to the application's existing importer. */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import semver from 'semver'
import { z } from 'zod'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { httpsUrl, parseSkills, readObject } from './skill-catalog-io.ts'
import type { MarketSkill, MarketSkillCatalog, MarketSkillInstaller } from './skill-catalog-types.ts'

/** One service-owned queue protects imports and their version receipts. */
export class SkillCatalog {
  private installer: MarketSkillInstaller | undefined
  private entries: MarketSkill[] = []
  private fetchedAt = ''
  private pending: Promise<unknown> = Promise.resolve()
  private readonly abort = new AbortController()
  private readonly receipts = new Map<string, string>()
  private readonly ready: Promise<void>
  private receiptFailure: unknown
  private inventory: readonly string[] = []

  constructor(private readonly options: {
    url: string
    root: string
    timeoutMs: number
    maxCatalogBytes: number
    maxSkillBytes: number
  }, private readonly fetcher: typeof fetch = fetch) {
    httpsUrl.parse(options.url)
    this.ready = this.loadReceipts().catch((error: unknown) => { this.receiptFailure = error })
  }

  /**
   * Register the application importer for its owned lifetime.
   * @param installer - Application-owned import capability.
   * @returns Removal of this registration after pending imports settle.
   */
  register(installer: MarketSkillInstaller): () => Promise<void> {
    if (this.abort.signal.aborted) throw new Error('Skill catalog disposed')
    if (this.installer !== undefined) throw new Error('A skill importer is already registered')
    this.installer = installer
    return async () => { if (this.installer === installer) this.installer = undefined; await this.pending }
  }

  /**
   * Read the online catalog with current installation facts.
   * @param refresh - Fetch new metadata when true.
   * @returns Current listings with a retained failure diagnostic.
   */
  read(refresh: boolean): Promise<MarketSkillCatalog> {
    return this.enqueue(async () => {
      await this.ready
      if (this.receiptFailure !== undefined) return this.failed('catalog', this.receiptFailure)
      try {
        if (this.installer === undefined) return await this.snapshot()
        if (refresh || !this.fetchedAt) await this.refresh()
        return await this.snapshot()
      } catch (error) { return this.failed('catalog', error) }
    })
  }

  /**
   * Verify and import one selected archive.
   * @param id - Selected catalog id.
   * @param version - Confirmed exact version.
   * @returns Committed listing or actionable failure.
   */
  install(id: string, version: string): Promise<MarketSkillCatalog> {
    return this.enqueue(async () => {
      await this.ready
      if (this.receiptFailure !== undefined) return this.failed('catalog', this.receiptFailure)
      const installer = this.installer
      if (installer === undefined || this.abort.signal.aborted) return this.failed('unavailable', 'The skill importer is unavailable.')
      try { await this.refresh() } catch (error) { return this.failed('catalog', error) }
      const skill = this.entries.find(row => row.id === id && row.version === version)
      if (skill === undefined) return this.failed('changed', 'The listing changed. Refresh and select the skill again.')
      const path = join(this.options.root, randomUUID() + '.zip')
      let importing = false
      try {
        await mkdir(this.options.root, { recursive: true })
        const bytes = await readObject(skill.url, this.options.maxSkillBytes, this.signal(), this.fetcher)
        if (bytes.byteLength !== skill.bytes || createHash('sha256').update(bytes).digest('hex') !== skill.sha256) {
          return this.failed('integrity', 'Skill archive length or SHA-256 does not match the catalog.')
        }
        if (this.installer !== installer || this.signal().aborted) return this.failed('unavailable', 'The skill importer was removed.')
        await writeFile(path, bytes, { flag: 'wx', mode: 0o600 })
        importing = true
        await installer.install(path, skill.names)
        const next = new Map(this.receipts).set(skill.id, skill.version)
        await writeFileAtomic(join(this.options.root, 'skills.json'), JSON.stringify(Object.fromEntries(next), null, 2) + '\n', { mode: 0o600 })
        this.receipts.set(skill.id, skill.version)
        return await this.snapshot()
      } catch (error) { return this.failed(importing ? 'partial' : 'install', error) }
      finally { await rm(path, { force: true }) }
    })
  }

  /**
   * Abort owned downloads and wait for active imports.
   * @returns Completion after owned downloads and imports settle.
   */
  async dispose(): Promise<void> {
    this.abort.abort(new Error('Skill catalog disposed'))
    await this.pending
    await this.ready
  }

  private signal(): AbortSignal { return AbortSignal.any([this.abort.signal, AbortSignal.timeout(this.options.timeoutMs)]) }
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const operation = this.pending.then(task)
    this.pending = operation.catch(() => undefined)
    return operation
  }
  private async refresh(): Promise<void> {
    const entries = parseSkills(await readObject(this.options.url, this.options.maxCatalogBytes, this.signal(), this.fetcher))
    this.entries = entries
    this.fetchedAt = new Date().toISOString()
  }
  private async snapshot(): Promise<MarketSkillCatalog> {
    this.inventory = await this.installer?.installed() ?? this.inventory
    return this.view()
  }
  private view(): MarketSkillCatalog {
    const installed = new Set(this.inventory)
    return { available: this.installer !== undefined && !this.abort.signal.aborted, fetchedAt: this.fetchedAt,
      entries: this.entries.map((skill) => {
        const version = this.receipts.get(skill.id)
        const present = skill.names.every(name => installed.has(name))
        return { ...skill, ...version === undefined ? {} : { installedVersion: version },
          status: !present ? 'available' : version !== undefined && semver.gt(skill.version, version) ? 'update' : 'installed' }
      }) }
  }
  private failed(code: NonNullable<MarketSkillCatalog['error']>['code'], error: unknown): MarketSkillCatalog {
    return { ...this.view(), error: { code, diagnostic: error instanceof Error ? error.message : String(error) } }
  }
  private async loadReceipts(): Promise<void> {
    try {
      const values = z.record(z.string(), z.string().refine(value => semver.valid(value) !== null)).parse(JSON.parse(await readFile(join(this.options.root, 'skills.json'), 'utf8')))
      for (const [id, version] of Object.entries(values)) this.receipts.set(id, version)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    }
  }
}
