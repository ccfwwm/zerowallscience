import { createHash, verify } from 'node:crypto'
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import JSZip from 'jszip'
import type { McpEnvironmentStatus } from '../shared/contracts.js'

export interface McpEnvironmentManifest {
  schema: 1
  environmentId: 'claude-science-mcp'
  version: string
  platform: 'win32'
  architecture: 'x64'
  archiveUrl: string
  archiveSha256: string
  archiveSize: number
  python: { version: string; relativeExecutable: string }
  mcp: { bioToolsVersion: string; ketcherChemistryVersion: string; toolCount: number; licenseToolCount: number }
  source: { claudeScienceRuntime: string; sourceHashes: Record<string, string> }
  signature: { algorithm: 'ed25519'; keyId: string; value: string }
}

export interface McpEnvironmentControllerOptions {
  root: string
  manifestUrl: string
  publicKey: string
  fetcher?: typeof fetch
  publish(status: McpEnvironmentStatus): void
}

export class McpEnvironmentController {
  private status: McpEnvironmentStatus = { phase: 'idle' }
  private operation?: Promise<McpEnvironmentStatus>

  constructor(private readonly options: McpEnvironmentControllerOptions) {}

  current(): McpEnvironmentStatus { return { ...this.status } }

  initialize(): Promise<McpEnvironmentStatus> {
    if (this.operation !== undefined) return this.operation
    this.operation = this.install().finally(() => { this.operation = undefined })
    return this.operation
  }

  retry(): Promise<McpEnvironmentStatus> { return this.initialize() }

  async selectManual(root: string): Promise<McpEnvironmentStatus> {
    const selected = resolve(root)
    const python = join(selected, 'bio-tools', 'python', 'python.exe')
    const bio = join(selected, 'bio-tools', 'run_server.py')
    const ketcher = join(selected, 'ketcher-chemistry', 'server.js')
    await Promise.all([python, bio, ketcher].map(async path => {
      await access(path)
      const info = await stat(path)
      if (!info.isFile()) throw new Error(`Selected MCP environment entry is not a regular file: ${path}`)
    }))
    await mkdir(this.options.root, { recursive: true })
    await writeFile(join(this.options.root, 'current.json'), `${JSON.stringify({ mode: 'manual', root: selected, installedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
    return this.set({ phase: 'manual', message: selected })
  }

  private async install(): Promise<McpEnvironmentStatus> {
    try {
      if (process.platform !== 'win32' || process.arch !== 'x64') return this.set({ phase: 'unavailable', message: 'Managed scientific MCP environments are currently available on Windows x64 only.' })
      if (this.options.publicKey.trim() === '') throw new Error('The MCP environment verification key is not configured.')
      this.set({ phase: 'downloading', progress: 0, message: '正在获取科研 MCP 环境清单' })
      const fetcher = this.options.fetcher ?? fetch
      const manifestResponse = await fetcher(this.options.manifestUrl, { cache: 'no-store' })
      if (!manifestResponse.ok) throw new Error(`MCP environment manifest returned HTTP ${manifestResponse.status}.`)
      const manifest = validateManifest(await manifestResponse.json())
      if (!verifyManifest(manifest, this.options.publicKey)) throw new Error('MCP environment manifest signature is invalid.')
      const installed = await this.installedRoot(manifest.version)
      if (installed !== undefined) return this.set({ phase: 'ready', version: manifest.version, progress: 100, message: installed })
      this.set({ phase: 'downloading', version: manifest.version, progress: 5, message: '正在下载科研 MCP 环境' })
      const archiveResponse = await fetcher(manifest.archiveUrl, { cache: 'no-store' })
      if (!archiveResponse.ok) throw new Error(`MCP environment archive returned HTTP ${archiveResponse.status}.`)
      const archive = Buffer.from(await archiveResponse.arrayBuffer())
      this.set({ phase: 'verifying', version: manifest.version, progress: 70, message: '正在验证科研 MCP 环境' })
      if (archive.byteLength !== manifest.archiveSize || sha256(archive) !== manifest.archiveSha256) throw new Error('MCP environment archive hash or size is invalid.')
      const target = join(this.options.root, 'versions', manifest.version)
      const temporary = `${target}.tmp-${process.pid}-${Date.now()}`
      await rm(temporary, { recursive: true, force: true })
      await mkdir(temporary, { recursive: true })
      this.set({ phase: 'installing', version: manifest.version, progress: 80, message: '正在安装科研 MCP 环境' })
      try {
        await extractZip(archive, temporary)
        await Promise.all([
          access(join(temporary, manifest.python.relativeExecutable)),
          access(join(temporary, 'bio-tools', 'run_server.py')),
          access(join(temporary, 'ketcher-chemistry', 'server.js')),
        ])
        await mkdir(dirname(target), { recursive: true })
        await rm(target, { recursive: true, force: true })
        await rename(temporary, target)
      } catch (error) {
        await rm(temporary, { recursive: true, force: true })
        throw error
      }
      await mkdir(this.options.root, { recursive: true })
      await writeFile(join(this.options.root, 'current.json'), `${JSON.stringify({ mode: 'managed', version: manifest.version, root: target, manifest, installedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
      return this.set({ phase: 'ready', version: manifest.version, progress: 100, message: target })
    } catch (error) {
      return this.set({ phase: 'failed', message: sanitizeError(error) })
    }
  }

  private async installedRoot(version: string): Promise<string | undefined> {
    try {
      const record = JSON.parse(await readFile(join(this.options.root, 'current.json'), 'utf8')) as { version?: unknown; root?: unknown }
      if (record.version !== version || typeof record.root !== 'string') return undefined
      await Promise.all([
        access(join(record.root, 'bio-tools', 'python', 'python.exe')),
        access(join(record.root, 'bio-tools', 'run_server.py')),
        access(join(record.root, 'ketcher-chemistry', 'server.js')),
      ])
      return record.root
    } catch { return undefined }
  }

  private set(status: McpEnvironmentStatus): McpEnvironmentStatus { this.status = status; this.options.publish(this.current()); return this.current() }
}

export function validateManifest(value: unknown): McpEnvironmentManifest {
  if (value === null || typeof value !== 'object') throw new Error('MCP environment manifest must be an object.')
  const item = value as Record<string, unknown>
  if (item.schema !== 1 || item.environmentId !== 'claude-science-mcp' || item.platform !== 'win32' || item.architecture !== 'x64') throw new Error('MCP environment manifest identity or target is invalid.')
  for (const key of ['version', 'archiveUrl', 'archiveSha256']) if (typeof item[key] !== 'string' || item[key] === '') throw new Error(`MCP environment manifest field ${key} is required.`)
  if (!String(item.archiveUrl).startsWith('https://')) throw new Error('MCP environment archive URL must use HTTPS.')
  if (!/^[a-f0-9]{64}$/u.test(String(item.archiveSha256)) || !Number.isSafeInteger(item.archiveSize) || Number(item.archiveSize) <= 0) throw new Error('MCP environment archive metadata is invalid.')
  const signature = item.signature as Record<string, unknown> | undefined
  if (signature?.algorithm !== 'ed25519' || typeof signature.value !== 'string' || typeof signature.keyId !== 'string') throw new Error('MCP environment signature is invalid.')
  return value as McpEnvironmentManifest
}

export function canonicalManifest(manifest: McpEnvironmentManifest): Buffer {
  const { signature: _signature, ...unsigned } = manifest
  return Buffer.from(JSON.stringify(unsigned))
}

export function verifyManifest(manifest: McpEnvironmentManifest, publicKey: string): boolean {
  return verify(null, canonicalManifest(manifest), publicKey, Buffer.from(manifest.signature.value, 'base64'))
}

async function extractZip(archive: Uint8Array, target: string): Promise<void> {
  const zip = await JSZip.loadAsync(archive)
  for (const entry of Object.values(zip.files)) {
    const name = normalize(entry.name.replaceAll('/', '\\'))
    if (entry.dir) continue
    if (isAbsolute(name) || name === '..' || name.startsWith(`..\\`)) throw new Error('MCP environment archive contains an unsafe path.')
    const path = resolve(target, name)
    if (relative(target, path).startsWith('..')) throw new Error('MCP environment archive escapes its installation directory.')
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, await entry.async('nodebuffer'), { flag: 'wx' })
  }
}

function sha256(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex') }
function sanitizeError(error: unknown): string { return (error instanceof Error ? error.message : String(error)).replace(/https?:\/\/[^\s]+/gu, '[download-url]').slice(0, 500) }
