import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { ProjectRecord } from '@zerowallscience/research-store/types'
import type { ScientificEngineConfig, ScientificEngineHealth, ScientificEngineId, ScientificEngineLaunchResult, ScientificEngineSource, ScientificEngineStatus } from '../shared/types.js'
import { containedFile } from './science-viewer.js'
import { fijiAnnotationAdapter, napariAnnotationAdapter } from './annotation-adapters.js'
import { probeBrainGlobe } from './brain-atlas.js'
import { heSegmentationModel } from './he-segmentation.js'
import { HE_STARDIST_MODEL } from './he-stardist-model.js'
import { resolveManagedSciencePython } from './managed-python.js'
import { pythonChildEnvironment } from './python-env.js'

export interface AnnotationBridgeSetup {
  viewerId: string; baseRevisionId: string; sourceSha256: string; directory: string; document: unknown
}

const FIJI_ENTRYPOINTS = process.platform === 'win32'
  ? ['fiji-windows-x64.exe', 'ImageJ-win64.exe', 'fiji.bat', 'fiji']
  : ['fiji', 'ImageJ-linux64', 'fiji.sh']

export function discoverFijiExecutable(configured?: string): string | undefined {
  const candidate = configured?.trim()
  const roots = candidate
    ? [candidate]
    : [process.env.ZEROWALL_FIJI_EXECUTABLE?.trim(), process.env.ZEROWALL_FIJI_PATH?.trim(), 'C:\\softworks\\Fiji', 'C:\\softworks\\fiji']
    .filter((value): value is string => Boolean(value))
  for (const value of roots) {
    const absolute = isAbsolute(value) ? value : resolve(value)
    try {
      if (statSync(absolute).isFile()) return absolute
      if (statSync(absolute).isDirectory()) {
        for (const entry of FIJI_ENTRYPOINTS) {
          const path = join(absolute, entry)
          if (existsSync(path) && statSync(path).isFile()) return path
        }
      }
    } catch { /* continue to the next configured/default candidate */ }
  }
  return undefined
}

export function engineExecutable(engine: ScientificEngineId, config?: Partial<ScientificEngineConfig>): string {
  if (engine === 'fiji') {
    if (config?.executablePath?.trim()) return config.executablePath.trim()
    if (config?.installDirectory?.trim()) return discoverFijiExecutable(config.installDirectory) ?? join(config.installDirectory.trim(), process.platform === 'win32' ? 'fiji-windows-x64.exe' : 'fiji')
    const environmentPath = process.env.ZEROWALL_FIJI_EXECUTABLE?.trim() || process.env.ZEROWALL_FIJI_PATH?.trim()
    if (environmentPath) {
      const discovered = discoverFijiExecutable(environmentPath)
      if (discovered) return discovered
      try { if (statSync(environmentPath).isDirectory()) return join(environmentPath, process.platform === 'win32' ? 'fiji-windows-x64.exe' : 'fiji') } catch { /* preserve explicit invalid path below */ }
      return environmentPath
    }
    return discoverFijiExecutable() ?? join('C:\\softworks\\Fiji', process.platform === 'win32' ? 'fiji-windows-x64.exe' : 'fiji')
  }
  if (engine === 'napari') return config?.executablePath?.trim() || config?.pythonPath?.trim() || process.env.ZEROWALL_NAPARI_PYTHON?.trim() || join(process.env.LOCALAPPDATA || '', 'napari-0.9.1', 'envs', 'napari-0.9.1', 'python.exe')
  if (config?.executablePath || config?.pythonPath) return config.executablePath ?? config.pythonPath!
  throw new Error('Unsupported native engine.')
}

const USER_CONFIG_FILE = join(process.env.LOCALAPPDATA || process.env.APPDATA || join(homedir(), '.zerowallscience'), 'ZeroWallScience', 'scientific-engines.json')
const engineName = (id: ScientificEngineId): string => ({ fiji: 'Fiji / ImageJ', napari: 'napari', 'brain-globe': 'BrainGlobe', 'he-python': 'HE Python', 'he-stardist': 'HE StarDist', 'remote-r': 'Remote R' }[id])
const windowsBatch = (path: string): boolean => process.platform === 'win32' && /\.(?:bat|cmd)$/iu.test(path)
const quoteCmd = (value: string): string => { if (value.includes('"')) throw new Error('Executable and arguments cannot contain double quotes.'); return `"${value}"` }
function spawnSpec(executable: string, args: string[]): { executable: string; args: string[]; shell: boolean } {
  if (!windowsBatch(executable)) return { executable, args, shell: false }
  return { executable: process.env.ComSpec?.trim() || 'cmd.exe', args: ['/d', '/s', '/c', [quoteCmd(executable), ...args.map(quoteCmd)].join(' ')], shell: false }
}

/** Streams the file so a multi-hundred-megabyte weight file is never buffered. */
async function hashFile(path: string, algorithm = 'sha256'): Promise<string> {
  const digest = createHash(algorithm)
  for await (const chunk of createReadStream(path, { highWaterMark: 1024 * 1024 })) digest.update(chunk as Buffer)
  return digest.digest('hex')
}

export function defaultScientificEngineConfig(id: ScientificEngineId): ScientificEngineConfig {
  const base: ScientificEngineConfig = { id, enabled: true, source: 'default', status: 'unknown' }
  if (id === 'fiji') return { ...base, installDirectory: 'C:\\softworks\\Fiji' }
  if (id === 'napari') { const pythonPath = process.env.ZEROWALL_NAPARI_PYTHON?.trim(); return pythonPath ? { ...base, pythonPath } : base }
  // Deliberately no default pythonPath for brain-globe: probe() delegates to the
  // BrainGlobe resolver, and a default path here would be reported as an
  // explicit user configuration that the resolveExecutable guard then trusts.
  return base
}

function safeConfig(value: unknown, id: ScientificEngineId): ScientificEngineConfig {
  const source = (value && typeof value === 'object' ? value : {}) as Partial<ScientificEngineConfig>
  const status: ScientificEngineHealth = ['unknown', 'available', 'invalid', 'degraded'].includes(String(source.status)) ? source.status! : 'unknown'
  const validSource: ScientificEngineSource = ['project', 'user', 'environment', 'discovered', 'default'].includes(String(source.source)) ? source.source! : 'user'
  return {
    ...defaultScientificEngineConfig(id), ...source, id, enabled: source.enabled !== false, status, source: validSource,
    ...(Array.isArray(source.capabilities) ? { capabilities: source.capabilities.map(String).slice(0, 64) } : {}),
  }
}

function mergeConfig(current: ScientificEngineConfig, input: Partial<ScientificEngineConfig> & { id: ScientificEngineId }, source: ScientificEngineSource): ScientificEngineConfig {
  const merged: Record<string, unknown> = { ...current, ...input, id: input.id, source }
  // A path change is a replacement, never a merge with a stale competing path.
  if (Object.prototype.hasOwnProperty.call(input, 'installDirectory')) delete merged.executablePath
  if (Object.prototype.hasOwnProperty.call(input, 'executablePath')) delete merged.installDirectory
  if (Object.prototype.hasOwnProperty.call(input, 'pythonPath')) delete merged.executablePath
  if (Object.prototype.hasOwnProperty.call(input, 'environmentPath')) { delete merged.executablePath; delete merged.pythonPath }
  return safeConfig(merged, input.id)
}

async function readUserConfigs(): Promise<Partial<Record<ScientificEngineId, ScientificEngineConfig>>> {
  try { return JSON.parse(await readFile(USER_CONFIG_FILE, 'utf8')) as Partial<Record<ScientificEngineId, ScientificEngineConfig>> } catch { return {} }
}

async function writeUserConfig(config: ScientificEngineConfig): Promise<void> {
  await mkdir(dirname(USER_CONFIG_FILE), { recursive: true })
  const existing = await readUserConfigs()
  existing[config.id] = config
  const temporary = `${USER_CONFIG_FILE}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(existing, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' })
  const { rename, rm } = await import('node:fs/promises')
  try { await rename(temporary, USER_CONFIG_FILE) } catch (error) { await rm(temporary, { force: true }); throw error }
}

async function deleteUserConfig(id: ScientificEngineId): Promise<void> {
  const existing = await readUserConfigs(); delete existing[id]
  const temporary = `${USER_CONFIG_FILE}.${process.pid}.${randomUUID()}.tmp`
  await mkdir(dirname(USER_CONFIG_FILE), { recursive: true })
  const { rename, rm } = await import('node:fs/promises')
  await writeFile(temporary, JSON.stringify(existing, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' })
  try { await rename(temporary, USER_CONFIG_FILE) } catch (error) { await rm(temporary, { force: true }); throw error }
}

export function engineArguments(engine: ScientificEngineId, assetPath?: string): string[] {
  // Jaunch consumes --allow-multiple; ImageJ Legacy also needs its own flag.
  if (engine === 'fiji') return ['--allow-multiple', '--forbid-single-instance', ...(assetPath ? [assetPath] : [])]
  if (engine === 'napari') return ['-m', 'napari', ...(assetPath ? [assetPath] : [])]
  throw new Error('Unsupported native engine.')
}

/**
 * Where a Python prefix keeps its site-packages, asked of the prefix instead of
 * assumed. `Lib/site-packages` is the CPython-on-Windows shape, but an
 * embeddable distribution lists `site-packages` directly in its `pythonXY._pth`
 * file, and that file — not a literal — is what decides which `certifi` the
 * child imports. The earlier literal made the napari launch look for a
 * certificate under a directory that a flat distribution does not have, so the
 * sanitizer fell back to dropping every CA variable.
 *
 * Returns the first directory that actually holds a `certifi` package, or the
 * conventional path when nothing does, so the caller keeps its old behaviour for
 * a prefix this cannot classify.
 */
function interpreterSitePackages(prefix: string): string {
  const found: string[] = []
  try {
    for (const name of readdirSync(prefix).filter(entry => entry.endsWith('._pth')).sort()) {
      let content: string
      try { content = readFileSync(join(prefix, name), 'utf8') } catch { continue }
      for (const raw of content.split(/\r?\n/u)) {
        const line = raw.trim()
        // `import site` and comments are directives, not search directories.
        if (line === '' || line.startsWith('#') || line.startsWith('import ')) continue
        const entry = resolve(prefix, line.replace(/[\\/]+$/u, ''))
        const local = relative(prefix, entry)
        if (local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) continue
        if (basename(entry) === 'site-packages' && !found.includes(entry)) found.push(entry)
      }
    }
  } catch { /* fall through to the conventional layouts below */ }
  for (const candidate of [...found, join(prefix, 'Lib', 'site-packages'), join(prefix, 'site-packages')]) {
    if (existsSync(join(candidate, 'certifi'))) return candidate
  }
  return join(prefix, 'Lib', 'site-packages')
}

export async function engineEnvironment(engine: ScientificEngineId, executable: string): Promise<NodeJS.ProcessEnv> {
  // napari is the one native engine backed by Python, so it is the one that
  // honours SSL_CERT_FILE et al. Sanitize here — this function feeds both the
  // GUI launch and the version probe — or an inherited dead CA path from an
  // earlier runtime layout kills the first outbound request in the child.
  const prefix = engine === 'napari' ? dirname(executable) : undefined
  const env = pythonChildEnvironment(prefix ? interpreterSitePackages(prefix) : undefined)
  if (engine !== 'napari' || process.platform !== 'win32' || prefix === undefined) return env
  // Mirror the installed Conda cwp.py shortcut wrapper, only in the child.
  if (await stat(join(prefix, 'conda-meta')).then(info => info.isDirectory(), () => false)) {
    const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH'
    const paths = [prefix, join(prefix, 'Library', 'mingw-w64', 'bin'), join(prefix, 'Library', 'usr', 'bin'), join(prefix, 'Library', 'bin'), join(prefix, 'Scripts')]
    env[pathKey] = [...paths, env[pathKey] ?? ''].join(delimiter)
    env.CONDA_PREFIX = prefix
  }
  env.PYTHONFAULTHANDLER = '1'
  return env
}

/** Tracks only launches owned by this Host; a launcher exiting is not a GUI readiness signal. */
export class NativeEngineService {
  private readonly live = new Map<string, { child: ChildProcess; record: ScientificEngineLaunchResult }>()
  private readonly pending = new Set<string>()
  private disposed = false

  constructor(private readonly store: ResearchStore) {}

  async getConfig(projectId: string | undefined, engine: ScientificEngineId): Promise<ScientificEngineConfig> {
    if (projectId) {
      const events = this.store.listAuditEvents(projectId).filter(event => event.action === 'science-engine.config' && event.details.id === engine)
      const latest = events.at(-1)?.details
      if (latest && latest.reset !== true) return safeConfig(latest, engine)
    }
    const user = await readUserConfigs()
    if (user[engine]) return safeConfig(user[engine], engine)
    const env = this.environmentConfig(engine)
    if (env) return env
    const defaults = defaultScientificEngineConfig(engine)
    const discovered = engine === 'fiji' ? discoverFijiExecutable(defaults.installDirectory) : undefined
    return safeConfig({ ...defaults, ...(discovered ? { executablePath: discovered, installDirectory: dirname(discovered), source: 'discovered' as const, status: 'available' as const } : {}) }, engine)
  }

  async setConfig(projectId: string | undefined, input: Partial<ScientificEngineConfig> & { id: ScientificEngineId }): Promise<ScientificEngineConfig> {
    const current = await this.getConfig(projectId, input.id)
    const config = mergeConfig(current, input, projectId ? 'project' : 'user')
    if (projectId) this.store.recordAuditEvent(projectId, 'science-engine.config', config as unknown as import('@zerowallscience/research-store/types').JsonObject)
    else await writeUserConfig(config)
    return config
  }

  async resetConfig(projectId: string | undefined, id: ScientificEngineId): Promise<ScientificEngineConfig> {
    if (projectId) this.store.recordAuditEvent(projectId, 'science-engine.config', { id, reset: true })
    else await deleteUserConfig(id)
    return this.getConfig(projectId, id)
  }

  async resolveExecutable(projectId: string | undefined, engine: ScientificEngineId): Promise<{ config: ScientificEngineConfig; executable: string }> {
    const config = await this.getConfig(projectId, engine)
    if (config.enabled === false) throw new Error(`${engineName(engine)} 已禁用，请在引擎设置中启用。`)
    const explicit = Boolean(config.executablePath?.trim() || config.installDirectory?.trim() || config.pythonPath?.trim() || config.environmentPath?.trim()) && config.source !== 'default' && config.source !== 'discovered'
    const executable = engineExecutable(engine, config)
    if (explicit && !existsSync(executable)) throw new Error(`${engineName(engine)} 的显式路径无效：${executable}。不会回退到其他引擎路径。`)
    return { config, executable }
  }

  private environmentConfig(id: ScientificEngineId): ScientificEngineConfig | undefined {
    const value = id === 'fiji' ? (process.env.ZEROWALL_FIJI_EXECUTABLE?.trim() || process.env.ZEROWALL_FIJI_PATH?.trim()) : id === 'napari' ? process.env.ZEROWALL_NAPARI_PYTHON?.trim() : id === 'brain-globe' ? process.env.ZEROWALL_BRAINGLOBE_PYTHON?.trim() : undefined
    if (!value) return undefined
    return safeConfig(id === 'fiji' ? { id, enabled: true, ...(existsSync(value) && statSync(value).isDirectory() ? { installDirectory: value } : { executablePath: value }), source: 'environment' } : { id, enabled: true, pythonPath: value, source: 'environment' }, id)
  }

  async probe(projectId: string | undefined, id: ScientificEngineId): Promise<ScientificEngineStatus> {
    const config = await this.getConfig(projectId, id)
    const name = engineName(id)
    if (config.enabled === false) return { id, name, available: false, status: 'invalid', source: config.source, reason: '引擎已禁用。' }
    // BrainGlobe has no single executable of its own: it runs in the managed
    // ZeroWall interpreter. Resolving it through engineExecutable would throw
    // "Unsupported native engine." whenever nothing is configured, which is the
    // state every fresh install starts in.
    if (id === 'brain-globe') return { ...await probeBrainGlobe(), id, name }
    // HE StarDist lives in the same shared interpreter, so it resolves the same
    // way. Only the frozen model weights stay in their own directory.
    if (id === 'he-stardist') return { ...await this.probeHeStarDist(config), id, name }
    // HE Python has no interpreter of its own either: it reports the shared
    // environment, which is also what the HE panel actually runs.
    if (id === 'he-python') return { ...await this.probeHePython(config), id, name }
    let executable: string
    try { executable = (await this.resolveExecutable(projectId, id)).executable } catch (error) { const configuredPath = config.executablePath ?? config.installDirectory ?? config.pythonPath; return { id, name, available: false, status: 'invalid', source: config.source, ...(configuredPath ? { path: configuredPath } : {}), reason: String(error) } }
    if (!existsSync(executable)) return { id, name, available: false, status: 'invalid', source: config.source, path: executable, reason: `未找到入口：${executable}` }
    if (id === 'fiji') return this.probeFiji(config, executable)
    if (id === 'napari') return this.probePython(config, executable, id)
    if (id === 'remote-r') return { id, name, available: Boolean(config.remoteEndpoint), status: config.remoteEndpoint ? 'unknown' : 'invalid', source: config.source, ...(config.remoteEndpoint ? { path: config.remoteEndpoint } : {}), reason: config.remoteEndpoint ? '远程端点已配置；服务健康需由远端 Gateway 合成检查确认。' : '未配置远程 R 端点。' }
    return { id, name, available: false, status: 'unknown', source: config.source, reason: '未配置探测器。' }
  }

  async resolveFijiJava(projectId?: string): Promise<{ executable: string; jars: string }> {
    const config = await this.getConfig(projectId, 'fiji')
    const root = config.installDirectory ?? dirname(engineExecutable('fiji', config))
    let executable = config.javaPath ?? process.env.ZEROWALL_FIJI_JAVA?.trim()
    if (!executable) {
      const runtime = join(root, 'java', process.platform === 'win32' ? 'win64' : 'linux-amd64')
      const children = await (await import('node:fs/promises')).readdir(runtime).catch(() => [])
      for (const child of children.sort()) { const candidate = join(runtime, child, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'); if (existsSync(candidate)) { executable = candidate; break } }
      executable ??= join(runtime, process.platform === 'win32' ? 'java.exe' : 'java')
    }
    if (!existsSync(executable)) throw new Error(`Fiji bundled Java was not found: ${executable}`)
    return { executable, jars: join(root, 'jars', '*') }
  }

  private async probePython(config: ScientificEngineConfig, executable: string, id: ScientificEngineId): Promise<ScientificEngineStatus> {
    const code = id === 'napari' ? 'import napari; print(napari.__version__)' : 'import sys; print(sys.version.split()[0])'
    return this.runProbe(id, engineName(id), executable, ['-c', code], config)
  }

  /**
   * The shared interpreter, as the HE panel sees it. An explicit override still
   * wins, so an operator running a user-managed Python keeps that answer rather
   * than being told about an environment they are not using.
   */
  private async probeHePython(config: ScientificEngineConfig, id: ScientificEngineId = 'he-python'): Promise<ScientificEngineStatus> {
    const name = engineName(id)
    const explicit = config.pythonPath?.trim() || config.executablePath?.trim() || process.env.ZEROWALL_HE_STARDIST_PYTHON?.trim()
    const managed = explicit ? undefined : await resolveManagedSciencePython()
    const executable = explicit ?? managed?.executable
    if (!executable) return { id, name, available: false, status: 'invalid', source: config.source, reason: '未找到受管理的 ZeroWall Python 环境；HE 引擎共用该环境，不创建独立 venv。' }
    if (!existsSync(executable)) return { id, name, available: false, status: 'invalid', source: config.source, path: executable, reason: `未找到 Python：${executable}` }
    const probe = await this.runProbe(id, name, executable, ['-c', 'import sys; print(sys.version.split()[0])'], config)
    return { ...probe, ...(explicit ? {} : { source: 'environment' as const }), diagnostic: `${probe.diagnostic ?? ''} 共享 ZeroWall Python：${executable}`.trim().slice(-8000) }
  }

  /**
   * HE StarDist reports the shared interpreter, then proves the frozen weights
   * are present and intact. A run cannot start without either, so reporting the
   * interpreter alone would claim a working engine that fails on first use.
   */
  private async probeHeStarDist(config: ScientificEngineConfig): Promise<ScientificEngineStatus> {
    const probe = await this.probeHePython(config, 'he-stardist')
    if (!probe.available) return { ...probe, id: 'he-stardist', name: engineName('he-stardist') }
    const modelDirectory = config.modelPath?.trim() || heSegmentationModel()
    const missing: string[] = []
    for (const file of HE_STARDIST_MODEL.files) {
      const path = join(modelDirectory, file.path)
      try {
        const info = await stat(path)
        if (!info.isFile()) { missing.push(file.path); continue }
        if (await hashFile(path) !== file.sha256) missing.push(`${file.path}(哈希不符)`)
      } catch { missing.push(file.path) }
    }
    const base = { ...probe, id: 'he-stardist' as const, name: engineName('he-stardist') }
    if (missing.length) return { ...base, available: false, status: 'degraded', source: config.source, reason: `StarDist 权重未就绪：${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` 等 ${missing.length} 项` : ''}。目录：${modelDirectory}`, path: modelDirectory }
    return { ...base, status: 'available', reason: `共享 ZeroWall Python 与冻结 StarDist 权重均已就绪。`, path: modelDirectory, capabilities: ['he-stardist', HE_STARDIST_MODEL.name] }
  }

  private async probeFiji(config: ScientificEngineConfig, executable: string): Promise<ScientificEngineStatus> {
    const root = config.installDirectory ?? dirname(executable)
    let java = config.javaPath ?? process.env.ZEROWALL_FIJI_JAVA?.trim()
    if (!java) {
      const runtime = join(root, 'java', process.platform === 'win32' ? 'win64' : 'linux-amd64')
      const children = await (await import('node:fs/promises')).readdir(runtime).catch(() => [])
      for (const child of children.sort()) {
        const candidate = join(runtime, child, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
        if (existsSync(candidate)) { java = candidate; break }
      }
      java ??= join(runtime, process.platform === 'win32' ? 'java.exe' : 'java')
    }
    const jars = join(root, 'jars', '*')
    const jarNames = (await import('node:fs/promises')).readdir(join(root, 'jars')).then(items => items.filter(item => /^(?:imagej|ij|fiji)-.*\.jar$/iu.test(item)).slice(0, 32)).catch(() => [])
    if (!existsSync(java)) return { id: 'fiji', name: engineName('fiji'), available: false, status: 'degraded', source: config.source, path: executable, diagnostic: `Fiji 入口存在，但 bundled Java 不存在：${java}`, reason: '未找到 Fiji bundled Java。' }
    const result = await this.runProbe('fiji', engineName('fiji'), java, ['-version'], config)
    const names = await jarNames
    return { ...result, path: executable, diagnostic: `${result.diagnostic ?? ''} Java=${java}; jars=${names.join(', ')}`.slice(-8000), capabilities: ['fiji-java', 'imagej', ...names] }
  }

  private runProbe(id: ScientificEngineId, name: string, executable: string, args: string[], config: ScientificEngineConfig): Promise<ScientificEngineStatus> {
    return new Promise(resolve => {
      const spec = spawnSpec(executable, args)
      const child = spawn(spec.executable, spec.args, { shell: spec.shell, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: pythonChildEnvironment() })
      let output = ''; let error = ''; const timer = setTimeout(() => { child.kill(); resolve({ id, name, available: false, status: 'invalid', source: config.source, path: executable, reason: '版本探测超时。', diagnostic: error.slice(-4000) }) }, 10000)
      child.stdout.on('data', chunk => { output += String(chunk).slice(0, 8000) }); child.stderr.on('data', chunk => { error += String(chunk).slice(-4000) })
      child.on('error', err => { clearTimeout(timer); resolve({ id, name, available: false, status: 'invalid', source: config.source, path: executable, reason: err.message, diagnostic: error.slice(-4000) }) })
      child.on('close', code => { clearTimeout(timer); const version = (output || error).trim().split(/\r?\n/u).find(Boolean); resolve({ id, name, available: code === 0, status: code === 0 ? 'available' : 'invalid', source: config.source, path: executable, ...(version ? { version } : {}), reason: code === 0 ? '版本探测通过。' : `版本探测失败（退出码 ${code ?? 'unknown'}）。`, diagnostic: error.slice(-4000) }) })
    })
  }

  async configs(projectId?: string): Promise<ScientificEngineConfig[]> {
    const ids: ScientificEngineId[] = ['fiji', 'napari', 'brain-globe', 'he-python', 'he-stardist', 'remote-r']
    return Promise.all(ids.map(id => this.getConfig(projectId, id)))
  }

  async launch(project: ProjectRecord, sessionId: string, engine: ScientificEngineId, assetId?: string, bridge?: AnnotationBridgeSetup): Promise<ScientificEngineLaunchResult> {
    if (this.disposed) throw new Error('Native engine service has stopped.')
    const resolved = await this.resolveExecutable(project.id, engine)
    const executable = resolved.executable
    if (resolved.config.enabled === false) throw new Error(`${engineName(engine)} 已禁用，请在引擎设置中启用。`)
    if (!existsSync(executable)) throw new Error(`${engineName(engine)} 未找到可执行入口：${executable}。请检查引擎设置中的目录或可执行文件路径。`)
    const key = `${project.id}:${engine}`
    if (this.pending.has(key)) throw new Error('An engine launch is already pending for this project.')
    this.pending.add(key)
    try {
      const path = await realpath(executable)
      if (!(await stat(path)).isFile()) throw new Error('Engine executable must be a regular file.')
      const cwd = await realpath(project.rootPath)
      const env = await engineEnvironment(engine, path)
      let assetPath: string | undefined
      if (assetId !== undefined) {
        const asset = this.store.listDataAssets(project.id).find(item => item.id === assetId)
        if (!asset) throw new Error('Asset is not in the active project.')
        if (asset.location !== 'local' || !asset.uri.startsWith('file:')) throw new Error('Materialize remote assets through r_files before opening a native engine.')
        assetPath = await containedFile(cwd, fileURLToPath(asset.uri))
        // Never pass macros, scripts or arbitrary documents to Fiji's command-line file opener.
        if (!/\.(tiff?|png|jpe?g|bmp)$/iu.test(assetPath) || !(await stat(assetPath)).isFile()) throw new Error('Native image opening currently accepts regular TIFF, PNG, JPEG or BMP files. Other formats require a validated adapter.')
      }
      if (this.disposed) throw new Error('Native engine service has stopped.')
      const record: ScientificEngineLaunchResult = { launchId: randomUUID(), id: engine, projectId: project.id, sessionId, lifecycleRevision: 0, path, started: false, status: 'starting', guiReady: 'unverified', createdAt: new Date().toISOString(), ...(assetId === undefined ? {} : { assetId }), message: '正在启动本地引擎。' }
      let args = engineArguments(engine, assetPath)
      if (bridge) {
        if (!assetPath) throw new Error('An image asset is required for annotation exchange.')
        const directory = await containedFile(cwd, bridge.directory)
        const script = engine === 'napari' ? napariAnnotationAdapter : fijiAnnotationAdapter
        const scriptPath = join(directory, 'zerowall-annotation-adapter.py')
        const requestPath = join(directory, 'native-request.json'); const returnPath = join(directory, 'native-return.json')
        await writeFile(scriptPath, script, { flag: 'wx' })
        await writeFile(requestPath, JSON.stringify({ bridgeId: record.launchId, sourcePath: assetPath, returnPath, document: bridge.document }), { flag: 'wx' })
        env.ZEROWALL_ANNOTATION_REQUEST = requestPath
        env.ZEROWALL_ANNOTATION_AUTORUN = '1'
        record.annotationBridge = { viewerId: bridge.viewerId, baseRevisionId: bridge.baseRevisionId, sourceSha256: bridge.sourceSha256, returnPath, adapterSha256: createHash('sha256').update(script).digest('hex') }
        args = engine === 'napari' ? [scriptPath] : ['--allow-multiple', '--forbid-single-instance', '--run', scriptPath]
      }
      this.persist(record)
      return await new Promise<ScientificEngineLaunchResult>((resolve, reject) => {
        let child: ChildProcess
        try { const spec = spawnSpec(path, args); child = spawn(spec.executable, spec.args, { cwd, env, shell: spec.shell, windowsHide: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }) }
        catch (error) {
          record.status = 'failed'; record.message = String(error); this.persist(record); reject(error); return
        }
        this.live.set(record.launchId, { child, record })
        const capture = (bytes: Buffer) => { record.diagnosticTail = ((record.diagnosticTail ?? '') + bytes.toString('utf8')).slice(-8000) }
        child.stdout?.on('data', capture); child.stderr?.on('data', capture)
        child.once('spawn', () => {
          record.started = true; record.status = 'spawned'
          if (child.pid !== undefined) record.pid = child.pid
          record.message = '进程已启动；请在本机窗口检查图像与 GUI。此状态不代表分析完成。'
          this.persist(record); child.unref(); resolve({ ...record })
        })
        child.once('error', error => {
          record.status = 'failed'; record.message = error.message; record.finishedAt = new Date().toISOString()
          this.persist(record); this.live.delete(record.launchId); reject(error)
        })
        child.once('close', (code, signal) => {
          record.status = code === 0 ? 'exited' : 'failed'; record.finishedAt = new Date().toISOString()
          if (code !== null) record.exitCode = code
          record.message = `启动进程已结束（${code ?? signal ?? '未知'}）；原生窗口状态需在本机核对。`
          this.persist(record); this.live.delete(record.launchId)
        })
      })
    } finally { this.pending.delete(key) }
  }

  list(projectId: string): ScientificEngineLaunchResult[] {
    const records = new Map<string, ScientificEngineLaunchResult>()
    for (const event of this.store.listAuditEvents(projectId)) {
      if (event.action !== 'science-engine.lifecycle') continue
      const record = event.details as unknown as ScientificEngineLaunchResult
      if (typeof record.launchId !== 'string' || record.projectId !== projectId) continue
      if ((records.get(record.launchId)?.lifecycleRevision ?? -1) < record.lifecycleRevision) records.set(record.launchId, { ...record })
    }
    return Array.from(records.values(), (record): ScientificEngineLaunchResult => {
      if (record.status === 'starting' || record.status === 'spawned') {
        const owned = this.live.get(record.launchId)
        return owned ? { ...owned.record } : { ...record, status: 'unobserved', message: 'Host 已重启或停止跟踪；原生窗口可能仍在运行，不能按历史 PID 判定状态。' }
      }
      return record
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  dispose(): void {
    // Do not discard unsaved native edits or kill a process from a reused historical PID.
    for (const { child, record } of this.live.values()) {
      record.status = 'unobserved'; record.message = 'Host 已停止跟踪，原生窗口保留。'
      this.persist(record); child.stdout?.destroy(); child.stderr?.destroy(); child.unref()
    }
    this.live.clear(); this.disposed = true
  }

  private persist(record: ScientificEngineLaunchResult): void {
    if (!this.disposed) {
      record.lifecycleRevision++
      this.store.recordAuditEvent(record.projectId, 'science-engine.lifecycle', { ...record })
    }
  }
}
