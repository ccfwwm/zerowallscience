import { createHash, verify } from 'node:crypto'
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export interface McpEnvironmentManifest {
  schema: 2
  environmentId: string
  environmentVersion?: string
  /** @deprecated desktop releases used this field for the MCP version. */
  version?: string
  contentRevision?: number
  platform: 'win32'
  architecture: 'x64'
  archiveUrl: string
  archiveSha256: string
  archiveSize: number
  python: { version: string; relativeExecutable: string; relativeSitePackages: string; modules: string[]; supportsZeroWallTool: boolean }
  pythonHealth: { imports: string[]; bioServer: string; ketcherServer: string }
  skillsRoot: string
  sci: { version: string; nodeMinimum: string; cli: string; mcp: string }
  mcp: { bioToolsVersion: string; ketcherChemistryVersion: string; sciMasterVersion: string; toolCount: number; licenseToolCount: number; servers: string[] }
  source: { claudeScienceRuntime: string; sourceHashes: Record<string, string> }
  signature: { algorithm: 'ed25519'; keyId: string; value: string }
}

export type McpEnvironmentStatus =
  | { phase: 'idle' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'manual'; version?: string; message?: string; progress?: number }
  | { phase: 'failed'; version?: string; message: string }

export function validateMcpEnvironmentManifest(value: unknown): McpEnvironmentManifest {
  if (value === null || typeof value !== 'object') throw new Error('MCP environment manifest must be an object.')
  const item = value as Record<string, unknown>
  if (item.schema !== 2 || item.platform !== 'win32' || item.architecture !== 'x64') throw new Error('MCP environment manifest is not for Windows x64.')
  for (const key of ['environmentId', 'archiveUrl', 'archiveSha256']) if (typeof item[key] !== 'string' || item[key] === '') throw new Error(`MCP environment manifest field ${key} is required.`)
  if ((typeof item.environmentVersion !== 'string' || item.environmentVersion === '') && (typeof item.version !== 'string' || item.version === '')) throw new Error('MCP environment manifest field environmentVersion is required.')
  if (!/^https:\/\//u.test(String(item.archiveUrl))) throw new Error('MCP environment archive URL must use HTTPS.')
  if (!/^[a-f0-9]{64}$/u.test(String(item.archiveSha256))) throw new Error('MCP environment archive SHA-256 is invalid.')
  const python = item.python as Record<string, unknown> | undefined
  if (typeof python?.version !== 'string' || typeof python.relativeExecutable !== 'string' || typeof python.relativeSitePackages !== 'string' || !Array.isArray(python.modules) || python.supportsZeroWallTool !== true) throw new Error('MCP environment Python runtime metadata is invalid.')
  if (!Number.isSafeInteger(item.archiveSize) || Number(item.archiveSize) <= 0) throw new Error('MCP environment archive size is invalid.')
  const signature = item.signature
  if (signature === null || typeof signature !== 'object' || (signature as Record<string, unknown>).algorithm !== 'ed25519') throw new Error('MCP environment manifest signature is invalid.')
  const health = item.pythonHealth as Record<string, unknown> | undefined
  const sci = item.sci as Record<string, unknown> | undefined
  const mcp = item.mcp as Record<string, unknown> | undefined
  if (!Array.isArray(health?.imports) || typeof health.bioServer !== 'string' || typeof health.ketcherServer !== 'string') throw new Error('MCP environment Python health metadata is invalid.')
  if (typeof item.skillsRoot !== 'string' || typeof sci?.version !== 'string' || typeof sci.nodeMinimum !== 'string' || typeof sci.cli !== 'string' || typeof sci.mcp !== 'string') throw new Error('MCP environment SciMaster metadata is invalid.')
  if (typeof mcp?.sciMasterVersion !== 'string' || !Array.isArray(mcp.servers)) throw new Error('MCP environment server metadata is invalid.')
  return value as McpEnvironmentManifest
}

export function verifyMcpEnvironmentManifest(manifest: McpEnvironmentManifest, publicKey: string | Buffer): boolean {
  const { signature: _signature, ...unsigned } = manifest
  const payload = Buffer.from(JSON.stringify(unsigned))
  return verify(null, payload, publicKey, Buffer.from(manifest.signature.value, 'base64'))
}

export function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex') }

export interface McpEnvironmentStore {
  root: string
  currentPath?: string
  slotsPath(environmentSlot: 'a' | 'b'): string
  activePath?: string
  /** @deprecated compatibility helper for older integration callers. */
  versionPath(version: string): string
}

export function createMcpEnvironmentStore(userData: string): McpEnvironmentStore {
  const root = resolve(userData, 'mcp-environments')
  return { root, currentPath: join(root, 'current.json'), activePath: join(root, 'current.json'), slotsPath: slot => join(root, 'slots', slot), versionPath: version => join(root, 'versions', version) }
}

export async function installVerifiedArchive(store: McpEnvironmentStore, manifest: McpEnvironmentManifest, archive: Uint8Array, extract: (archive: Uint8Array, target: string) => Promise<void>): Promise<string> {
  if (archive.byteLength !== manifest.archiveSize || sha256(archive) !== manifest.archiveSha256) throw new Error('MCP environment archive hash or size does not match its manifest.')
  const current = store.currentPath === undefined ? undefined : await readFile(store.currentPath, 'utf8').then(value => JSON.parse(value) as { slot?: unknown; health?: unknown }).catch(() => undefined)
  const targetSlot: 'a' | 'b' = current?.slot === 'a' ? 'b' : 'a'
  const target = store.slotsPath(targetSlot)
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`
  await rm(temporary, { recursive: true, force: true })
  await mkdir(temporary, { recursive: true })
  try {
    await extract(archive, temporary)
    await access(join(temporary, manifest.python.relativeExecutable))
    await mkdir(resolve(target, '..'), { recursive: true })
    await rm(target, { recursive: true, force: true })
    await rename(temporary, target)
    await writeFile(store.currentPath!, `${JSON.stringify({ environmentVersion: manifest.environmentVersion ?? manifest.version, contentRevision: manifest.contentRevision ?? 1, slot: targetSlot, root: target, health: 'ready', manifest, installedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
    return target
  } catch (error) {
    await rm(temporary, { recursive: true, force: true })
    throw error
  }
}

export async function environmentIsReady(store: McpEnvironmentStore, manifest: McpEnvironmentManifest): Promise<boolean> {
  try {
    const current = store.currentPath === undefined ? undefined : JSON.parse(await readFile(store.currentPath, 'utf8')) as { root?: string; health?: string }
    if (current?.health !== 'ready' || typeof current.root !== 'string') return false
    await stat(join(current.root, manifest.python.relativeExecutable)); return true
  } catch { return false }
}

export function mcpEnvironmentVersion(manifest: McpEnvironmentManifest): string { return manifest.environmentVersion ?? manifest.version ?? 'legacy' }
