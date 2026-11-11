/** Feed discovery and immutable staging for signed Host Runtime archives. */

import { createHash, createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { access, mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { gt } from 'semver'
import { ReadEntry, x as extractTar } from 'tar'
import { hostRuntimePath, HOST_RUNTIME_ARCHIVE_PATH, parseHostRuntimeManifest, verifyHostRuntimeManifest,
  verifyHostRuntimeDirectory, type HostRuntimeCompatibility, type HostRuntimeManifest, type HostRuntimeState,
  writeHostRuntimeState } from './host-runtime.ts'
import type { HostRuntimeUpdateState } from './ipc.ts'

/** Public signed pointer to one Host Runtime release. */
export interface HostRuntimeFeed {
  readonly schemaVersion: 1
  readonly product: 'zerowall-science'
  readonly manifest: HostRuntimeManifest
  readonly archiveUrl: string
  readonly signature: { readonly algorithm: 'ed25519'; readonly keyId: string; readonly value: string }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Parse a signed Host Runtime feed pointer. */
export function parseHostRuntimeFeed(value: unknown): HostRuntimeFeed {
  if (!record(value) || value.schemaVersion !== 1 || value.product !== 'zerowall-science'
    || typeof value.archiveUrl !== 'string' || !/^https:\/\//u.test(value.archiveUrl)
    || !record(value.manifest) || !record(value.signature) || value.signature.algorithm !== 'ed25519'
    || typeof value.signature.keyId !== 'string' || value.signature.keyId.length === 0
    || typeof value.signature.value !== 'string' || value.signature.value.length === 0) {
    throw new Error('host runtime: invalid feed')
  }
  return { schemaVersion: 1, product: 'zerowall-science', manifest: parseHostRuntimeManifest(value.manifest),
    archiveUrl: value.archiveUrl, signature: { algorithm: 'ed25519', keyId: value.signature.keyId, value: value.signature.value } }
}

/** Canonical signed bytes for one feed pointer. */
export function hostRuntimeFeedPayload(feed: HostRuntimeFeed): string {
  const { signature: _signature, ...payload } = feed
  return JSON.stringify(payload)
}

/** Fetch and verify a Host Runtime feed pointer. */
export async function fetchHostRuntimeFeed(feedUrl: string, expected: HostRuntimeCompatibility, publicKey: string | Buffer,
  keyId?: string, fetcher: typeof fetch = fetch): Promise<HostRuntimeFeed> {
  const response = await fetcher(feedUrl, { redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`host runtime: feed HTTP ${response.status}`)
  const feed = parseHostRuntimeFeed(await response.json())
  const key = createPublicKey(publicKey)
  if (keyId !== undefined && feed.signature.keyId !== keyId) throw new Error('host runtime: feed signing key mismatch')
  if (!verifySignature(null, Buffer.from(hostRuntimeFeedPayload(feed)), key, Buffer.from(feed.signature.value, 'base64'))) {
    throw new Error('host runtime: feed signature mismatch')
  }
  const manifest = verifyHostRuntimeManifest(feed.manifest, publicKey)
  if (keyId !== undefined && manifest.signature.keyId !== keyId) throw new Error('host runtime: manifest signing key mismatch')
  if (manifest.productVersion !== expected.productVersion || manifest.dshVersion !== expected.dshVersion
    || manifest.hostProtocolVersion !== expected.hostProtocolVersion || manifest.electronVersion !== expected.electronVersion
    || manifest.nodeAbi !== expected.nodeAbi || manifest.libreOfficeKitVersion !== expected.libreOfficeKitVersion
    || manifest.pnpmVersion !== expected.pnpmVersion || manifest.pythonVersion !== expected.pythonVersion
    || manifest.platform !== expected.platform || manifest.arch !== expected.arch) {
    throw new Error('host runtime: feed compatibility mismatch')
  }
  return { ...feed, manifest }
}

async function download(url: string, destination: string, expectedBytes: number,
  expectedSha256: string, fetcher: typeof fetch): Promise<void> {
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(15 * 60_000) })
  if (!response.ok || response.body === null) throw new Error(`host runtime: archive HTTP ${response.status}`)
  const digest = createHash('sha256')
  let bytes = 0
  async function* checkedChunks(): AsyncGenerator<Buffer> {
    if (response.body === null) throw new Error('host runtime: missing archive body')
    for await (const chunk of response.body) {
      const buffer = Buffer.from(chunk)
      bytes += buffer.length
      if (bytes > expectedBytes) throw new Error('host runtime: archive exceeds declared size')
      digest.update(buffer)
      yield buffer
    }
  }
  await pipeline(checkedChunks(), createWriteStream(destination, { flags: 'wx', mode: 0o600 }))
  if (bytes !== expectedBytes) throw new Error('host runtime: archive size mismatch')
  if (digest.digest('hex') !== expectedSha256) throw new Error('host runtime: archive digest mismatch')
}

function archivePath(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/\/+$/u, '')
  if (normalized === '' || normalized.startsWith('/') || normalized.includes(':')
    || normalized.split('/').some(part => part === '' || part === '.' || part === '..')) {
    throw new Error('host runtime: archive path traversal')
  }
  return normalized
}

/** Download, extract and verify one immutable Host Runtime archive into the store. */
export async function stageHostRuntime(feed: HostRuntimeFeed, storeRoot: string, state: HostRuntimeState,
  expected: HostRuntimeCompatibility, publicKey: string | Buffer, keyId?: string,
  fetcher: typeof fetch = fetch): Promise<HostRuntimeState> {
  verifyHostRuntimeManifest(feed.manifest, publicKey)
  if (state.pending?.phase === 'activating') throw new Error('host runtime: activation is awaiting renderer confirmation')
  const versionRoot = hostRuntimePath(storeRoot, feed.manifest.runtimeVersion)
  await mkdir(storeRoot, { recursive: true })
  try {
    const installed = await verifyHostRuntimeDirectory(versionRoot, expected, publicKey, keyId)
    if (installed.runtimeVersion !== feed.manifest.runtimeVersion) throw new Error('host runtime: installed version mismatch')
    if (installed.payload.sha256 !== feed.manifest.payload.sha256) throw new Error('host runtime: immutable version digest mismatch')
    const next: HostRuntimeState = { ...state, pending: { version: installed.runtimeVersion, path: installed.runtimeVersion, phase: 'staged' } }
    await writeHostRuntimeState(storeRoot, next)
    return next
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  const staging = `${versionRoot}.staging-${randomUUID()}`
  await mkdir(staging, { recursive: true })
  const archive = join(staging, 'archive.tgz')
  try {
    await download(feed.archiveUrl, archive, feed.manifest.payload.bytes, feed.manifest.payload.sha256, fetcher)
    let unsafeArchive: Error | undefined
    await extractTar({ file: archive, cwd: staging, strip: 1, strict: true, preservePaths: false, unlink: true,
      maxDepth: 64, filter: (path, entry) => {
        try {
          const safePath = archivePath(path)
          const member = safePath.split('/')[1]
          if (member === '.update' || member === 'host-runtime.json' || member === 'archive.tgz') {
            throw new Error('host runtime: reserved archive entry')
          }
          if (!(entry instanceof ReadEntry) || (entry.type !== 'File' && entry.type !== 'OldFile' && entry.type !== 'Directory')) {
            throw new Error('host runtime: unsupported archive entry')
          }
        } catch (error) {
          unsafeArchive = error instanceof Error ? error : new Error(String(error))
          return false
        }
        return true
      } })
    if (unsafeArchive !== undefined) throw unsafeArchive
    if (feed.manifest.payload.path !== HOST_RUNTIME_ARCHIVE_PATH) throw new Error('host runtime: invalid archive manifest path')
    const verified = verifyHostRuntimeManifest(feed.manifest, publicKey)
    if (keyId !== undefined && verified.signature.keyId !== keyId) throw new Error('host runtime: archive signing key mismatch')
    if (verified.productVersion !== expected.productVersion) throw new Error('host runtime: archive compatibility mismatch')
    await mkdir(join(staging, '.update'), { recursive: true })
    await rename(archive, join(staging, ...HOST_RUNTIME_ARCHIVE_PATH.split('/')))
    await writeFile(join(staging, 'host-runtime.json'), `${JSON.stringify(verified, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    await verifyHostRuntimeDirectory(staging, expected, publicKey, keyId)
    await access(join(staging, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'index.js'))
    try { await access(versionRoot); throw new Error('host runtime: immutable version already exists') }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
    await rename(staging, versionRoot)
    const next: HostRuntimeState = { ...state, pending: { version: verified.runtimeVersion,
      path: verified.runtimeVersion, phase: 'staged' } }
    await writeHostRuntimeState(storeRoot, next)
    return next
  } catch (error) {
    try {
      await writeFile(join(staging, 'failure.json'), JSON.stringify({ at: new Date().toISOString(),
        code: 'HOST_RUNTIME_STAGE_FAILED', message: error instanceof Error ? error.message : String(error), feed }, null, 2) + '\n', { flag: 'wx' })
      const failures = join(storeRoot, 'failures')
      await mkdir(failures, { recursive: true })
      await rename(staging, join(failures, `${feed.manifest.runtimeVersion}-${randomUUID()}`))
    } catch (evidenceError) { throw new AggregateError([error, evidenceError], 'Host staging failed; failure evidence remains in the staging directory') }
    throw error
  }
}

/** Coordinates user-authorized Host Runtime discovery and staging independently of the EXE updater. */
export class HostRuntimeUpdateCoordinator {
  private current: HostRuntimeUpdateState
  private feed: HostRuntimeFeed | undefined
  private readonly listeners = new Set<(state: HostRuntimeUpdateState) => void>()
  private operation: Promise<HostRuntimeUpdateState> | undefined

  /** @param activeVersion - Runtime selected by the last successful Bootstrap launch. */
  constructor(activeVersion?: string) { this.current = { phase: 'idle', ...(activeVersion === undefined ? {} : { activeVersion }) } }

  /** @returns A copy safe to expose to the renderer. */
  get state(): HostRuntimeUpdateState { return { ...this.current } }

  /** Subscribe to operation progress and terminal states. */
  subscribe(listener: (state: HostRuntimeUpdateState) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private publish(state: HostRuntimeUpdateState): HostRuntimeUpdateState {
    this.current = state
    for (const listener of this.listeners) listener(this.state)
    return this.state
  }

  /** Record the runtime selected by Bootstrap after a successful launch. */
  setActiveVersion(version: string | undefined): HostRuntimeUpdateState {
    const { activeVersion: _activeVersion, candidateVersion: _candidateVersion, ...withoutActiveVersion } = this.current
    return this.publish({ ...withoutActiveVersion, phase: 'idle', ...(version === undefined ? {} : { activeVersion: version }) })
  }

  /** Discover a compatible signed runtime without downloading its archive. */
  check(feedUrl: string, expected: HostRuntimeCompatibility, publicKey: string | Buffer,
    keyId?: string, fetcher: typeof fetch = fetch): Promise<HostRuntimeUpdateState> {
    if (this.operation !== undefined) return this.operation
    const operation = this.checkFeed(feedUrl, expected, publicKey, keyId, fetcher).finally(() => { this.operation = undefined })
    this.operation = operation
    return operation
  }

  private async checkFeed(feedUrl: string, expected: HostRuntimeCompatibility, publicKey: string | Buffer,
    keyId?: string, fetcher: typeof fetch = fetch): Promise<HostRuntimeUpdateState> {
    if (this.current.phase === 'staged') return this.state
    this.feed = undefined
    const { message: _message, ...withoutMessage } = this.current
    this.publish({ ...withoutMessage, phase: 'checking' })
    try {
      this.feed = await fetchHostRuntimeFeed(feedUrl, expected, publicKey, keyId, fetcher)
      const newer = this.current.activeVersion === undefined || gt(this.feed.manifest.runtimeVersion, this.current.activeVersion)
      this.publish({ ...this.current, phase: newer ? 'available' : 'idle', candidateVersion: this.feed.manifest.runtimeVersion })
    } catch (error) { this.publish({ ...this.current, phase: 'error', message: error instanceof Error ? error.message : String(error) }) }
    return this.state
  }

  /** Download and stage the previously discovered signed runtime for the next restart. */
  stage(storeRoot: string, state: HostRuntimeState, expected: HostRuntimeCompatibility,
    publicKey: string | Buffer, keyId?: string, fetcher: typeof fetch = fetch): Promise<HostRuntimeUpdateState> {
    if (this.operation !== undefined) return this.operation
    const operation = this.stageFeed(storeRoot, state, expected, publicKey, keyId, fetcher).finally(() => { this.operation = undefined })
    this.operation = operation
    return operation
  }

  private async stageFeed(storeRoot: string, state: HostRuntimeState, expected: HostRuntimeCompatibility,
    publicKey: string | Buffer, keyId?: string, fetcher: typeof fetch = fetch): Promise<HostRuntimeUpdateState> {
    if (this.feed === undefined) throw new Error('host runtime: check required before download')
    const { message: _message, ...withoutMessage } = this.current
    this.publish({ ...withoutMessage, phase: 'downloading', candidateVersion: this.feed.manifest.runtimeVersion })
    try {
      await stageHostRuntime(this.feed, storeRoot, state, expected, publicKey, keyId, fetcher)
      this.publish({ ...this.current, phase: 'staged' })
    } catch (error) { this.publish({ ...this.current, phase: 'error', message: error instanceof Error ? error.message : String(error) }) }
    return this.state
  }
}
