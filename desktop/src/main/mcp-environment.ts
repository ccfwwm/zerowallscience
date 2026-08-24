import { createHash, verify } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { access, lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import JSZip from 'jszip'
import type { McpEnvironmentStatus } from '../shared/contracts.js'

export interface McpEnvironmentManifest {
  schema: 2
  /** Stable MCP runtime identity, independent of the desktop app version. */
  environmentVersion?: string
  /** @deprecated old releases used the desktop app version here. */
  version?: string
  contentRevision?: number
  environmentId: 'claude-science-mcp'
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

export interface McpEnvironmentControllerOptions {
  root: string
  manifestUrl: string
  publicKey: string
  /** Trusted verification keys by manifest key id. */
  publicKeys?: Record<string, string>
  fetcher?: typeof fetch
  healthCheck?(root: string, manifest: McpEnvironmentManifest): Promise<void>
  publish(status: McpEnvironmentStatus): void
}

export const MCP_ENVIRONMENT_KEYRING: Record<string, string> = {
  'stable-1': `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAu8wAGfgRWqQBdIGcbkwPlBq01SjgEMybgNh3xVv0ej4=\n-----END PUBLIC KEY-----`,
  'stable-2': `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAUvKwSI31zGGut3nRi4kRqZGg8eBJskIrfa8Xmp/7VJw=\n-----END PUBLIC KEY-----`,
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
    const manifest = await this.readInstalledManifest(selected)
    await this.verifyHealth(selected, manifest)
    await mkdir(this.options.root, { recursive: true })
    await this.writeCurrent({ mode: 'manual', environmentVersion: environmentVersion(manifest), contentRevision: contentRevision(manifest), root: selected, slot: 'manual', health: 'ready', manifest, installedAt: new Date().toISOString() })
    return this.set(environmentStatus('manual', manifest, selected, 'manual', false, false))
  }

  private async install(): Promise<McpEnvironmentStatus> {
    try {
      if (process.platform !== 'win32' || process.arch !== 'x64') return this.set({ phase: 'unavailable', message: 'Managed scientific MCP environments are currently available on Windows x64 only.' })
      if (this.options.publicKey.trim() === '') throw new Error('The MCP environment verification key is not configured.')
      await this.cleanupTemporaryInstallations()
      this.set({ phase: 'checking', progress: 0, message: '正在检查科研 MCP 环境' })
      const fetcher = this.options.fetcher ?? fetch
      const manifestResponse = await fetcher(this.options.manifestUrl, { cache: 'no-store' })
      if (!manifestResponse.ok) throw new Error(`MCP environment manifest returned HTTP ${manifestResponse.status}.`)
      const manifest = validateManifest(await manifestResponse.json())
      if (!verifyManifestWithKeyring(manifest, this.options.publicKey, this.options.publicKeys)) throw new Error('MCP environment manifest signature is invalid.')
      await this.migrateLegacyCurrent(manifest)
      const installed = await this.installedRoot(manifest)
      if (installed !== undefined) return this.set(environmentStatus('ready', manifest, installed.root, installed.slot, false, installed.rollbackAvailable))
      this.set({ phase: 'downloading', environmentVersion: environmentVersion(manifest), version: environmentVersion(manifest), progress: 5, message: '正在同步科研 MCP 环境' })
      const archiveResponse = await fetcher(manifest.archiveUrl, { cache: 'no-store' })
      if (!archiveResponse.ok) throw new Error(`MCP environment archive returned HTTP ${archiveResponse.status}.`)
      const archive = Buffer.from(await archiveResponse.arrayBuffer())
      this.set({ phase: 'verifying', environmentVersion: environmentVersion(manifest), version: environmentVersion(manifest), contentRevision: contentRevision(manifest), progress: 70, message: '正在验证科研 MCP 环境' })
      if (archive.byteLength !== manifest.archiveSize || sha256(archive) !== manifest.archiveSha256) throw new Error('MCP environment archive hash or size is invalid.')
      const current = await readCurrent(this.options.root)
      const currentSlot = current?.slot === 'a' || current?.slot === 'b' ? current.slot : undefined
      const targetSlot: 'a' | 'b' = currentSlot === 'a' ? 'b' : 'a'
      const target = join(this.options.root, 'slots', targetSlot)
      const temporary = `${target}.tmp-${process.pid}-${Date.now()}`
      await rm(temporary, { recursive: true, force: true })
      await mkdir(temporary, { recursive: true })
      this.set({ phase: 'installing', environmentVersion: environmentVersion(manifest), version: environmentVersion(manifest), contentRevision: contentRevision(manifest), currentSlot: targetSlot, progress: 80, message: '正在安装科研 MCP 环境' })
      try {
        await extractZip(archive, temporary)
        await this.verifyHealth(temporary, manifest)
        await writeFile(join(temporary, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
        await mkdir(dirname(target), { recursive: true })
        await rm(target, { recursive: true, force: true })
        await rename(temporary, target)
      } catch (error) {
        await rm(temporary, { recursive: true, force: true })
        throw error
      }
      await mkdir(this.options.root, { recursive: true })
      if (current !== undefined && current.root && current.health === 'ready' && (current.slot === 'a' || current.slot === 'b')) {
        await this.writeCurrent({ ...current, root: current.root, slot: current.slot, rollbackAvailable: true, rollbackAt: new Date().toISOString() }, 'rollback.json')
      }
      await this.writeCurrent({ mode: 'managed', environmentVersion: environmentVersion(manifest), contentRevision: contentRevision(manifest), archiveSha256: manifest.archiveSha256, root: target, slot: targetSlot, manifest, health: 'ready', installedAt: new Date().toISOString(), rollbackAvailable: current?.health === 'ready' && current.slot !== 'manual' })
      return this.set(environmentStatus('ready', manifest, target, targetSlot, true, current?.health === 'ready' && current.slot !== 'manual'))
    } catch (error) {
      const retained = await this.currentHealthyRoot()
      if (retained !== undefined) return this.set(environmentStatus('ready', retained.manifest, retained.root, retained.slot, false, retained.rollbackAvailable))
      return this.set({ phase: 'failed', message: sanitizeError(error) })
    }
  }

  private async cleanupTemporaryInstallations(): Promise<void> {
    for (const directory of [join(this.options.root, 'slots'), join(this.options.root, 'versions')]) {
      let entries
      try { entries = await readdir(directory, { withFileTypes: true }) } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
      await Promise.all(entries.filter(entry => entry.isDirectory() && entry.name.includes('.tmp-')).map(entry => rm(join(directory, entry.name), { recursive: true, force: true })))
    }
  }

  private async currentHealthyRoot(): Promise<{ root: string; slot: 'a' | 'b' | 'manual'; manifest: McpEnvironmentManifest; rollbackAvailable: boolean } | undefined> {
    try {
      const record = await readCurrent(this.options.root)
      if (typeof record?.root !== 'string' || record.health !== 'ready') return undefined
      const manifest = await this.readInstalledManifest(record.root)
      await this.verifyHealth(record.root, manifest)
      const slot = record.slot === 'a' || record.slot === 'b' ? record.slot : 'manual'
      return { root: record.root, slot, manifest, rollbackAvailable: record.rollbackAvailable === true }
    } catch { return undefined }
  }

  private async installedRoot(manifest: McpEnvironmentManifest): Promise<{ root: string; slot: 'a' | 'b' | 'manual'; rollbackAvailable: boolean } | undefined> {
    try {
      const record = await readCurrent(this.options.root)
      if (typeof record?.root !== 'string' || record.health !== 'ready') return undefined
      const installed = await this.readInstalledManifest(record.root)
      if (environmentVersion(installed) !== environmentVersion(manifest) || contentRevision(installed) !== contentRevision(manifest) || installed.archiveSha256 !== manifest.archiveSha256) return undefined
      await this.verifyHealth(record.root, installed)
      const slot = record.slot === 'a' || record.slot === 'b' ? record.slot : 'manual'
      return { root: record.root, slot, rollbackAvailable: record.rollbackAvailable === true }
    } catch { return undefined }
  }

  private async migrateLegacyCurrent(manifest: McpEnvironmentManifest): Promise<void> {
    const record = await readCurrent(this.options.root)
    if (record === undefined || typeof record.root !== 'string' || record.slot === 'a' || record.slot === 'b' || record.slot === 'manual') return
    const legacyRoot = resolve(record.root)
    try {
      const installed = await this.readInstalledManifest(legacyRoot)
      await this.verifyHealth(legacyRoot, installed)
      const target = join(this.options.root, 'slots', 'a')
      await mkdir(dirname(target), { recursive: true })
      if (!(await pathExists(target))) await rename(legacyRoot, target)
      await this.writeCurrent({ ...record, mode: 'managed', root: target, slot: 'a', environmentVersion: environmentVersion(installed), contentRevision: contentRevision(installed), archiveSha256: installed.archiveSha256, manifest: installed, health: 'ready', rollbackAvailable: false })
      await rm(join(this.options.root, 'versions'), { recursive: true, force: true })
    } catch {
      // Leave the legacy directory untouched; the normal installer will create a fresh slot.
    }
  }

  private async readInstalledManifest(root: string, expectedVersion?: string): Promise<McpEnvironmentManifest> {
    const record = await readFile(join(this.options.root, 'current.json'), 'utf8')
      .then(value => JSON.parse(value) as { manifest?: unknown })
      .catch((): { manifest?: unknown } => ({}))
    const embedded = await readFile(join(root, 'manifest.json'), 'utf8').then(value => JSON.parse(value) as unknown, () => undefined)
    for (const candidate of [record.manifest, embedded]) if (candidate !== undefined) {
      const manifest = validateManifest(candidate)
      if ((expectedVersion === undefined || environmentVersion(manifest) === expectedVersion || manifest.version === expectedVersion) && verifyManifestWithKeyring(manifest, this.options.publicKey, this.options.publicKeys)) return manifest
    }
    throw new Error('The selected MCP environment has no signed schema 2 manifest. Select a managed environment installed by ZeroWall Science.')
  }

  private async verifyHealth(root: string, manifest: McpEnvironmentManifest): Promise<void> {
    await assertEnvironmentFiles(root, manifest)
    await (this.options.healthCheck ?? verifyMcpEnvironmentHealth)(root, manifest)
  }

  private set(status: McpEnvironmentStatus): McpEnvironmentStatus { this.status = status; this.options.publish(this.current()); return this.current() }

  private async writeCurrent(record: Record<string, unknown>, fileName = 'current.json'): Promise<void> {
    await mkdir(this.options.root, { recursive: true })
    const current = join(this.options.root, fileName)
    const temporary = `${current}.tmp-${process.pid}-${Date.now()}`
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
    await rename(temporary, current)
  }
}

export function validateManifest(value: unknown): McpEnvironmentManifest {
  if (value === null || typeof value !== 'object') throw new Error('MCP environment manifest must be an object.')
  const item = value as Record<string, unknown>
  if (item.schema !== 2 || item.environmentId !== 'claude-science-mcp' || item.platform !== 'win32' || item.architecture !== 'x64') throw new Error('MCP environment manifest identity or target is invalid.')
  if ((typeof item.environmentVersion !== 'string' || item.environmentVersion.trim() === '') && (typeof item.version !== 'string' || item.version.trim() === '')) throw new Error('MCP environment manifest field environmentVersion is required.')
  for (const key of ['archiveUrl', 'archiveSha256']) if (typeof item[key] !== 'string' || item[key] === '') throw new Error(`MCP environment manifest field ${key} is required.`)
  if (!String(item.archiveUrl).startsWith('https://')) throw new Error('MCP environment archive URL must use HTTPS.')
  if (!/^[a-f0-9]{64}$/u.test(String(item.archiveSha256)) || !Number.isSafeInteger(item.archiveSize) || Number(item.archiveSize) <= 0) throw new Error('MCP environment archive metadata is invalid.')
  const signature = item.signature as Record<string, unknown> | undefined
  if (signature?.algorithm !== 'ed25519' || typeof signature.value !== 'string' || signature.value.length === 0 || typeof signature.keyId !== 'string' || signature.keyId.length === 0) throw new Error('MCP environment signature is invalid.')
  const pythonHealth = item.pythonHealth as Record<string, unknown> | undefined
  const sci = item.sci as Record<string, unknown> | undefined
  const mcp = item.mcp as Record<string, unknown> | undefined
  if (!Array.isArray(pythonHealth?.imports) || !pythonHealth.imports.every(item => typeof item === 'string') || typeof pythonHealth.bioServer !== 'string' || typeof pythonHealth.ketcherServer !== 'string') throw new Error('MCP environment Python health metadata is invalid.')
  const python = item.python as Record<string, unknown> | undefined
  if (typeof python?.version !== 'string' || typeof python.relativeExecutable !== 'string' || typeof python.relativeSitePackages !== 'string' || !Array.isArray(python.modules) || !python.modules.every(value => typeof value === 'string') || python.supportsZeroWallTool !== true) throw new Error('MCP environment Python runtime metadata is invalid.')
  if (typeof item.skillsRoot !== 'string' || item.skillsRoot.trim() === '' || typeof sci?.version !== 'string' || typeof sci.nodeMinimum !== 'string' || typeof sci.cli !== 'string' || typeof sci.mcp !== 'string') throw new Error('MCP environment SciMaster metadata is invalid.')
  if (item.contentRevision !== undefined && (!Number.isSafeInteger(item.contentRevision) || Number(item.contentRevision) < 1)) throw new Error('MCP environment content revision is invalid.')
  if (typeof mcp?.sciMasterVersion !== 'string' || !Array.isArray(mcp.servers) || !mcp.servers.every(item => typeof item === 'string')) throw new Error('MCP environment server metadata is invalid.')
  return value as McpEnvironmentManifest
}

export function canonicalManifest(manifest: McpEnvironmentManifest): Buffer {
  const { signature: _signature, ...unsigned } = manifest
  return Buffer.from(JSON.stringify(unsigned))
}

export function verifyManifest(manifest: McpEnvironmentManifest, publicKey: string): boolean {
  return verify(null, canonicalManifest(manifest), publicKey, Buffer.from(manifest.signature.value, 'base64'))
}

export function verifyManifestWithKeyring(manifest: McpEnvironmentManifest, currentKey: string, keyring: Record<string, string> = {}): boolean {
  const key = keyring[manifest.signature.keyId] ?? (manifest.signature.keyId === 'stable-1' ? currentKey : undefined)
  return key !== undefined && verifyManifest(manifest, key)
}

function environmentVersion(manifest: McpEnvironmentManifest): string {
  return manifest.environmentVersion ?? manifest.version ?? 'legacy'
}

function environmentStatus(phase: McpEnvironmentStatus['phase'], manifest: McpEnvironmentManifest, root: string, slot: 'a' | 'b' | 'manual', updated: boolean, rollbackAvailable: boolean): McpEnvironmentStatus {
  return { phase, environmentVersion: environmentVersion(manifest), contentRevision: contentRevision(manifest), currentSlot: slot, updated, rollbackAvailable, version: environmentVersion(manifest), progress: phase === 'ready' || phase === 'manual' ? 100 : undefined, message: root, python: pythonStatus(manifest) }
}

function pythonStatus(manifest: McpEnvironmentManifest): NonNullable<McpEnvironmentStatus['python']> {
  return { ready: true, version: manifest.python.version, sitePackages: manifest.python.relativeSitePackages }
}

function contentRevision(manifest: McpEnvironmentManifest): number { return manifest.contentRevision ?? 1 }

interface CurrentEnvironmentRecord {
  mode?: string
  environmentVersion?: string
  version?: string
  contentRevision?: number
  archiveSha256?: string
  root?: string
  slot?: 'a' | 'b' | 'manual'
  health?: string
  manifest?: unknown
  rollbackAvailable?: boolean
  installedAt?: string
}

async function readCurrent(root: string): Promise<CurrentEnvironmentRecord | undefined> {
  try { return JSON.parse(await readFile(join(root, 'current.json'), 'utf8')) as CurrentEnvironmentRecord } catch { return undefined }
}

async function pathExists(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
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

async function assertRegularFile(path: string): Promise<void> {
  await access(path)
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`MCP environment entry must be a regular file: ${path}`)
}

export async function assertEnvironmentFiles(root: string, manifest: McpEnvironmentManifest): Promise<void> {
  const paths = [
    manifest.python.relativeExecutable,
    'bio-tools/run_server.py',
    'ketcher-chemistry/server.js',
    manifest.sci.cli,
    manifest.sci.mcp,
  ].map(path => join(root, path))
  await Promise.all(paths.map(assertRegularFile))
  const sitePackages = await lstat(join(root, manifest.python.relativeSitePackages))
  if (!sitePackages.isDirectory() || sitePackages.isSymbolicLink()) throw new Error(`MCP environment Python site-packages directory is invalid: ${join(root, manifest.python.relativeSitePackages)}`)
  const skills = join(root, manifest.skillsRoot)
  const info = await lstat(skills)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`MCP environment Skills directory is invalid: ${skills}`)
}

interface ProcessResult { stdout: string; stderr: string }

function execute(command: string, args: string[], cwd: string, input?: string, extraEnv: Record<string, string> = {}): Promise<ProcessResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, env: { ...process.env, ...extraEnv, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'pipe' })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error(`MCP health check timed out: ${args.at(-1) ?? command}`)) }, 15_000)
    child.stdout.setEncoding('utf8').on('data', value => { stdout += value })
    child.stderr.setEncoding('utf8').on('data', value => { stderr += value })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolveResult({ stdout, stderr }) : reject(new Error((stderr || stdout || `process exited ${code}`).trim().slice(0, 500))) })
    if (input !== undefined) child.stdin.end(input)
  })
}

async function checkMcpServer(command: string, args: string[], cwd: string): Promise<void> {
  const initialize = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'zerowall-health', version: '1' } } })
  const initialized = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
  const tools = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
  await new Promise<void>((resolveCheck, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'pipe' })
    const lines = createInterface({ input: child.stdout })
    let phase: 'initialize' | 'tools' = 'initialize'
    const timer = setTimeout(() => { child.kill(); lines.close(); reject(new Error(`MCP server health check timed out: ${args.at(-1) ?? command}`)) }, 15_000)
    const finish = (error?: Error) => { clearTimeout(timer); lines.close(); child.kill(); error === undefined ? resolveCheck() : reject(error) }
    child.once('error', error => finish(error))
    child.stderr.resume()
    lines.on('line', line => {
      let reply: { id?: number; result?: unknown; error?: unknown }
      try { reply = JSON.parse(line) as typeof reply } catch { return }
      if (phase === 'initialize' && reply.id === 1) {
        if (reply.error !== undefined || reply.result === undefined) return finish(new Error(`MCP initialize failed: ${args.at(-1) ?? command}`))
        phase = 'tools'
        child.stdin.write(`${initialized}\n${tools}\n`)
      } else if (phase === 'tools' && reply.id === 2) {
        const result = reply.result as { tools?: unknown } | undefined
        if (reply.error !== undefined || result === undefined || !Array.isArray(result.tools)) return finish(new Error(`MCP tools/list failed: ${args.at(-1) ?? command}`))
        finish()
      }
    })
    child.stdin.write(`${initialize}\n`)
  })
}

export async function verifyMcpEnvironmentHealth(root: string, manifest: McpEnvironmentManifest): Promise<void> {
  const python = join(root, manifest.python.relativeExecutable)
  const node = process.execPath
  const pythonVersion = await execute(python, ['--version'], root)
  const reported = `${pythonVersion.stdout}\n${pythonVersion.stderr}`
  const expected = manifest.python.version.match(/^\d+\.\d+/u)?.[0] ?? manifest.python.version
  if (!new RegExp(`Python ${expected.replace('.', '\\.')}(?:\\.|\\s|$)`, 'u').test(reported)) throw new Error(`Managed Python version does not match ${manifest.python.version}.`)
  await execute(python, ['-c', `import ${manifest.pythonHealth.imports.join(', ')}`], root, undefined, { PYTHONPATH: join(root, manifest.python.relativeSitePackages), PYTHONNOUSERSITE: '1' })
  await checkMcpServer(python, [join(root, 'bio-tools', 'run_server.py'), 'mcp_bio'], join(root, 'bio-tools'))
  await checkMcpServer(node, [join(root, 'ketcher-chemistry', 'server.js')], join(root, 'ketcher-chemistry'))
  await checkMcpServer(node, [join(root, manifest.sci.mcp)], join(root, 'sci'))
}
