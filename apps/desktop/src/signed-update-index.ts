/** Authenticated, bounded Qiniu discovery and offline recovery of an authorized installer. */
import { createHash, createPublicKey, verify } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, mkdir, rename, writeFile, stat, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { gt, valid } from 'semver'
import type { AppUpdater, UpdateInfo } from 'electron-updater'
import { Provider, resolveFiles, type ProviderRuntimeOptions } from 'electron-updater/out/providers/Provider.js'
import type { ResourceUpdateTrust } from './resource-update.ts'

/** Signed discovery payload; immutable artifact identity survives mutable pointer replacement. */
export interface DesktopUpdateIndex {
  readonly schema: 1
  readonly platform: 'win-x64'
  readonly channel: 'stable'
  readonly version: string
  readonly releaseDate: string
  readonly releaseNotes: string
  readonly installer: { readonly url: string; readonly bytes: number; readonly sha256: string; readonly sha512: string }
  readonly plugins: Readonly<Record<string, string>>
}

/**
 * @param value - Untrusted JSON from Qiniu or the local authorization receipt.
 * @param trust - Embedded release verification key.
 * @returns Signature-verified, validated discovery data.
 */
export function verifyDesktopUpdateIndex(value: unknown, trust: ResourceUpdateTrust): DesktopUpdateIndex {
  if (!record(value) || value.keyId !== trust.keyId || typeof value.signature !== 'string'
    || !verify(null, Buffer.from(JSON.stringify(value.payload)), createPublicKey(trust.publicKey), Buffer.from(value.signature, 'base64'))) throw new Error('Update index signature mismatch')
  const p = value.payload
  if (!record(p) || p.schema !== 1 || p.platform !== 'win-x64' || p.channel !== 'stable'
    || typeof p.version !== 'string' || valid(p.version) === null || p.version.includes('-')
    || typeof p.releaseDate !== 'string' || !Number.isFinite(Date.parse(p.releaseDate))
    || typeof p.releaseNotes !== 'string' || p.releaseNotes.length > 32_768 || !record(p.installer) || !record(p.plugins)) throw new Error('Invalid update index')
  const i = p.installer
  if (i.url !== `https://zerowall.chengxunkeji.cn/stable/releases/${p.version}/zerowall-science-${p.version}-win-x64.exe`
    || typeof i.bytes !== 'number' || !Number.isSafeInteger(i.bytes) || i.bytes <= 0
    || typeof i.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(i.sha256)
    || typeof i.sha512 !== 'string' || !/^[A-Za-z0-9+/]{86}==$/u.test(i.sha512)) throw new Error('Invalid update installer identity')
  const plugins: Record<string, string> = {}
  for (const [name, version] of Object.entries(p.plugins)) {
    if (typeof version !== 'string' || valid(version) === null) throw new Error('Invalid bundled plugin version')
    plugins[name] = version
  }
  return { schema: 1, platform: 'win-x64', channel: 'stable', version: p.version, releaseDate: p.releaseDate,
    releaseNotes: p.releaseNotes, installer: { url: i.url, bytes: i.bytes, sha256: i.sha256, sha512: i.sha512 }, plugins }
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }

/** Owns one signed candidate and a receipt written only after the user-authorized download verifies. */
export class SignedDesktopUpdates {
  private envelope: unknown
  private index: DesktopUpdateIndex | undefined
  private offline = false

  /**
   * @param trust - Embedded release key.
   * @param receipt - Application-owned readiness receipt.
   * @param url - Official metadata URL.
   */
  constructor(private readonly trust: ResourceUpdateTrust, private readonly receipt: string,
    private readonly url = 'https://zerowall.chengxunkeji.cn/stable/updates/v1/win-x64.json') {}

  /**
   * Configure the pinned updater's documented custom-provider API; file transfers retain its cache and progress.
   * @param updater - Main-owned platform updater.
   */
  configure(updater: AppUpdater): void {
    const latest = () => this.latest()
    class SignedProvider extends Provider<UpdateInfo> {
      constructor(_options: object, _updater: AppUpdater, runtime: ProviderRuntimeOptions) { super(runtime) }
      async getLatestVersion(): Promise<UpdateInfo> { return latest() }
      resolveFiles(info: UpdateInfo) { return resolveFiles(info, new URL('https://zerowall.chengxunkeji.cn/')) }
    }
    updater.setFeedURL({ provider: 'custom', updateProvider: SignedProvider })
  }

  private async latest(): Promise<UpdateInfo> {
    if (!this.offline) {
      const response = await fetch(`${this.url}?check=${Date.now()}`, { redirect: 'error', signal: AbortSignal.timeout(8_000), cache: 'no-store' })
      if (!response.ok || response.body === null) throw new Error('Update index unavailable')
      const chunks: Uint8Array[] = []; let bytes = 0
      for await (const chunk of response.body) {
        bytes += chunk.length
        if (bytes > 64 * 1024) throw new Error('Update index exceeds limit')
        chunks.push(chunk)
      }
      const envelope: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      this.index = verifyDesktopUpdateIndex(envelope, this.trust)
      this.envelope = envelope
    }
    const index = this.index
    if (index === undefined) throw new Error('No authenticated update index')
    return { version: index.version, path: index.installer.url, sha512: index.installer.sha512,
      releaseDate: index.releaseDate, releaseNotes: index.releaseNotes,
      files: [{ url: index.installer.url, size: index.installer.bytes, sha512: index.installer.sha512 }] }
  }

  /**
   * Verify the installer, then durably remember the user's authorization for the next launch.
   * @param paths - Updater-owned downloaded file.
   * @param version - User-confirmed target.
   */
  async prepared(paths: readonly string[], version: string): Promise<void> {
    const index = this.index
    if (index?.version !== version || paths.length !== 1 || paths[0] === undefined) throw new Error('Prepared update identity mismatch')
    await this.verifyFile(paths[0], index)
    await mkdir(dirname(this.receipt), { recursive: true })
    await writeFile(this.receipt + '.tmp', JSON.stringify({ schema: 1, envelope: this.envelope, path: paths[0] }) + '\n', { flush: true, mode: 0o600 })
    await rename(this.receipt + '.tmp', this.receipt)
  }

  /**
   * Restore only complete, authentic newer installers. Invalid receipts fail visibly without authorizing installation.
   * @param installedVersion - Actual application version.
   * @returns Whether a verified offline installation can be attempted before Host startup.
   */
  async restore(installedVersion: string): Promise<boolean> {
    let text: string
    try { text = await readFile(this.receipt, 'utf8') } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
      throw error
    }
    const value: unknown = JSON.parse(text)
    if (!record(value) || value.schema !== 1 || typeof value.path !== 'string') throw new Error('Invalid prepared update receipt')
    const index = verifyDesktopUpdateIndex(value.envelope, this.trust)
    if (!gt(index.version, installedVersion)) { await rm(this.receipt); return false }
    await this.verifyFile(value.path, index)
    const cache: unknown = JSON.parse(await readFile(join(dirname(value.path), 'update-info.json'), 'utf8'))
    if (!record(cache) || cache.fileName !== basename(value.path) || cache.sha512 !== index.installer.sha512) throw new Error('Prepared updater cache metadata is incomplete')
    this.index = index; this.envelope = value.envelope; this.offline = true
    return true
  }

  private async verifyFile(path: string, index: DesktopUpdateIndex): Promise<void> {
    if ((await stat(path)).size !== index.installer.bytes) throw new Error('Prepared installer size mismatch')
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
    if (hash.digest('hex') !== index.installer.sha256) throw new Error('Prepared installer digest mismatch')
  }
}
