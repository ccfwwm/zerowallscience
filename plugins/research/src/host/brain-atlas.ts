import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { DataAssetRecord, JsonObject, ProjectRecord, ViewerSessionRecord } from '@zerowallscience/research-store/types'
import type { BrainAtlasRequest, BrainAtlasResponse, BrainAtlasSummary, BrainCellAnalysis, BrainRegionResult, BrainSlice, ScientificEngineStatus } from '../shared/types.js'
import { containedFile } from './science-viewer.js'
import { BRAIN_GLOBE_RUNNER, BRAINRENDER_RUNNER, CELLFINDER_RUNNER } from './brainglobe-runner.js'
import {createBrainTransformContract} from './brain-transform.js'
import {BrainJobScope,settleRunner,stopBrainProcess} from './brain-process.js'
import {BRAIN_RESOURCE_GUARD} from './brain-resource-guard.js'
import { pythonChildEnvironment } from './python-env.js'

const RUNNER = 'zerowall-brainglobe/7.0.0-3'
const ATLAS = 'allen_mouse_25um'

export function validateBrainregOutputs(names: string[]): { valid: boolean; missing: string[] } {
  const lower = new Set(names.map(name => name.toLowerCase()))
  const missing: string[] = []
  if (!lower.has('brainreg.json')) missing.push('brainreg.json')
  if (!lower.has('registered_atlas.tiff') && !lower.has('registered_atlas.nii')) missing.push('registered_atlas.tiff|registered_atlas.nii')
  return { valid: missing.length === 0, missing }
}

/**
 * The managed-interpreter helpers now live in `managed-python.ts`, because HE
 * StarDist and the engine probes resolve the same environment. They stay
 * re-exported here under their original names so existing callers and tests
 * keep working.
 */
import {
  defaultAtlasDirectory,
  resolveManagedSciencePython as resolveManagedBrainPython,
  scienceBootstrap as brainBootstrap,
  scienceEnvironmentRoot as brainEnvironmentRoot,
  type ManagedSciencePython as ManagedBrainPython,
} from './managed-python.js'

export { defaultAtlasDirectory, resolveManagedBrainPython, brainBootstrap, brainEnvironmentRoot, type ManagedBrainPython }

/** Which of the four BrainGlobe distributions this interpreter can actually import. */
const BRAIN_PACKAGE_PROBE = 'import json, importlib.metadata as m\nnames=["brainglobe-atlasapi","brainreg","cellfinder","brainrender"]\ndef version(n):\n try: return m.version(n)\n except m.PackageNotFoundError: return None\nprint(json.dumps({"packages":{n:version(n) for n in names}}))'

export interface BrainAtlasStatus {
  installed: boolean; directory: string; name: string
  atlasVersion?: string | null; shape?: [number, number, number]; resolution?: [number, number, number]
  regionCount?: number; annotationBytes?: number; annotationSha256?: string
}

/**
 * The runner needs an atlas realpath to put in its config, so the directory is
 * created here rather than demanded from the operator. Nothing is downloaded by
 * this function: it only proves whether an installed atlas is already present,
 * and the atlas volume files are what distinguishes a real install from a stub.
 */
export async function atlasStatus(directory?: string): Promise<BrainAtlasStatus> {
  const target = directory ?? defaultAtlasDirectory()
  if (!target) return { installed: false, directory: '', name: ATLAS }
  const manifestPath = join(target, ATLAS, 'zerowall-atlas.json')
  let manifest: Record<string, unknown>
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown> } catch { return { installed: false, directory: target, name: ATLAS } }
  const files = Array.isArray(manifest.files) ? manifest.files as Array<Record<string, unknown>> : []
  const annotation = files.find(file => String(file.name ?? '').startsWith('annotation'))
  let volumeBytes = 0
  try { volumeBytes = (await stat(join(target, ATLAS, String(manifest.annotationFile ?? '')))).size } catch { volumeBytes = 0 }
  /** A manifest is not an install: it must still point at a non-empty volume. */
  const installed = volumeBytes > 0 && manifest.atlas === ATLAS
  return {
    installed, directory: target, name: ATLAS,
    ...(typeof manifest.atlasVersion === 'string' || manifest.atlasVersion === null ? { atlasVersion: manifest.atlasVersion as string | null } : {}),
    ...(Array.isArray(manifest.shape) && manifest.shape.length === 3 ? { shape: manifest.shape.map(Number) as [number, number, number] } : {}),
    ...(Array.isArray(manifest.resolution) && manifest.resolution.length === 3 ? { resolution: manifest.resolution.map(Number) as [number, number, number] } : {}),
    ...(typeof manifest.regionCount === 'number' ? { regionCount: manifest.regionCount } : {}),
    ...(annotation && typeof annotation.bytes === 'number' ? { annotationBytes: annotation.bytes } : {}),
    ...(annotation && typeof annotation.sha256 === 'string' ? { annotationSha256: annotation.sha256 } : {}),
  }
}

/**
 * Atlas download runs in its own bounded process rather than reusing
 * BRAIN_GLOBE_RUNNER: a half-downloaded atlas must not be able to fail the
 * viewer, and the atlasapi cache layout is version-dependent, so the script
 * verifies the real volume after the download instead of trusting the call.
 * Re-running it is cheap because atlasapi skips already-valid local volumes.
 */
export const BRAIN_ATLAS_INSTALL_RUNNER = BRAIN_RESOURCE_GUARD + String.raw`import configparser, hashlib, json, os, sys
from pathlib import Path

ATLAS = "allen_mouse_25um"

def fail(message):
    print(json.dumps({"error": str(message)}, ensure_ascii=False)); raise SystemExit(2)

try:
    request = json.load(sys.stdin)
    atlas_name = str(request.get("atlas", ATLAS))
    if atlas_name != ATLAS: fail("Only the Allen adult mouse 25 um atlas is enabled for managed installation.")
    directory = Path(str(request.get("atlasDirectory") or "")).resolve()
    if not str(directory): fail("A managed BrainGlobe atlas directory is required.")
    directory.mkdir(parents=True, exist_ok=True)
    config_dir = Path(str(request.get("configDirectory") or "")).resolve()
    config_dir.mkdir(parents=True, exist_ok=True)
    conf = configparser.ConfigParser()
    conf["default_dirs"] = {"brainglobe_dir": str(directory), "interm_download_dir": str(directory)}
    with (config_dir / "bg_config.conf").open("w") as handle: conf.write(handle)
    os.environ["BRAINGLOBE_CONFIG_DIR"] = str(config_dir)
    from importlib.metadata import version
    from brainglobe_atlasapi import BrainGlobeAtlas
    atlas = BrainGlobeAtlas(atlas_name, brainglobe_dir=str(directory), check_latest=False)
    annotation_path = Path(atlas.root_dir) / "annotation.tiff"
    if not annotation_path.is_file():
        candidates = sorted(Path(atlas.root_dir).glob("annotation.*"))
        if not candidates: fail("Downloaded atlas does not contain an annotation volume")
        annotation_path = candidates[0]
    digest = hashlib.sha256()
    with annotation_path.open("rb") as handle:
        for block in iter(lambda: handle.read(4 * 1024 * 1024), b""): digest.update(block)
    annotation = annotation_path.stat()
    if annotation.st_size == 0: fail("Downloaded annotation volume is empty")
    shape = [int(value) for value in atlas.shape]
    resolution = [float(value) for value in atlas.resolution]
    if len(shape) != 3 or any(value <= 0 for value in shape): fail("Downloaded atlas metadata has an invalid shape")
    if len(resolution) != 3 or any(value <= 0 for value in resolution): fail("Downloaded atlas metadata has an invalid resolution")
    metadata = atlas.metadata
    print(json.dumps({
        "atlas": atlas_name,
        "atlasVersion": str(metadata.get("version")) if metadata.get("version") is not None else None,
        "shape": shape,
        "resolution": resolution,
        "regionCount": len(atlas.structures),
        "rootDirectory": str(atlas.root_dir),
        "annotationFile": annotation_path.name,
        "builder": {"brainglobe-atlasapi": version("brainglobe-atlasapi")},
        "files": [{"name": annotation_path.name, "bytes": annotation.st_size, "sha256": digest.hexdigest()}],
        "notes": ["The atlas volume was downloaded into the managed directory and verified after download.", "Installation does not imply scientific review of any analysis that uses this atlas."],
    }, ensure_ascii=False))
except SystemExit:
    raise
except Exception as exc:
    fail(f"{type(exc).__name__}: {exc}")
`

/**
 * Probe the explicit BrainGlobe interpreter or, when that is unset, the managed
 * ZeroWall interpreter. The bare "python" fallback is never probed: reporting a
 * system Python as the BrainGlobe environment would be a false claim.
 */
export async function probeBrainGlobe(): Promise<ScientificEngineStatus> {
  const explicit = process.env.ZEROWALL_BRAINGLOBE_PYTHON?.trim()
  let executable = explicit
  let managed = false
  if (!executable) {
    const resolved = await resolveManagedBrainPython()
    if (!resolved) return { id: 'brainglobe', name: 'BrainGlobe managed environment', available: false, reason: '未找到 ZeroWall 集成 Python 环境；BrainGlobe 与 napari 共用此环境，不会创建独立环境。' }
    executable = resolved.executable
    managed = true
  }
  try { await access(executable) } catch { return { id: 'brainglobe', name: 'BrainGlobe managed environment', available: false, path: executable, reason: `未找到受管理 Python：${executable}` } }
  const atlas = await atlasStatus()
  return await new Promise(resolvePromise => {
    // spawn() throws synchronously for a non-executable path on Windows, so an
    // unusable interpreter must be reported rather than escaping the executor.
    let child: ReturnType<typeof spawn>
    try { child = spawn(executable!, ['-E', '-P', '-c', BRAIN_PACKAGE_PROBE], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) }
    catch (cause) { resolvePromise({ id: 'brainglobe', name: 'BrainGlobe managed environment', available: false, path: executable!, reason: cause instanceof Error ? cause.message : String(cause) }); return }
    let output = ''; let error = ''; let settled = false
    const finish = (result: ScientificEngineStatus): void => { if (settled) return; settled = true; resolvePromise(result) }
    const base = { id: 'brainglobe', name: 'BrainGlobe managed environment', path: executable!, ...(managed ? { source: 'environment' as const } : {}) }
    const timer = setTimeout(() => { child.kill(); finish({ ...base, available: false, reason: 'BrainGlobe 环境探测超时。' }) }, 8000)
    child.stdout!.on('data', chunk => { output += String(chunk).slice(0, 8000) })
    child.stderr!.on('data', chunk => { error = (error + String(chunk)).slice(-2000) })
    child.on('error', cause => { clearTimeout(timer); finish({ ...base, available: false, reason: cause.message, diagnostic: error }) })
    child.on('close', code => {
      clearTimeout(timer)
      if (code !== 0) { finish({ ...base, available: false, reason: error.trim() || `BrainGlobe Python exited with code ${code}.` }); return }
      let packages: Record<string, string | null>
      try { packages = (JSON.parse(output.trim()) as { packages?: Record<string, string | null> }).packages ?? {} } catch { finish({ ...base, available: false, reason: 'BrainGlobe 环境版本输出不可解析。' }); return }
      const missing = Object.entries(packages).filter(([, version]) => version == null).map(([name]) => name)
      const version = Object.entries(packages).map(([name, value]) => `${name}=${value ?? 'missing'}`).join(', ')
      const atlasDiagnostic = atlas.installed ? `图谱：${atlas.name} ${atlas.atlasVersion ?? ''} ${atlas.shape ? `${atlas.shape.join('×')} 体素` : ''}`.trim() : `图谱：未安装（${atlas.directory}）`
      finish({ ...base, available: missing.length === 0, status: missing.length === 0 ? (atlas.installed ? 'available' : 'degraded') : 'degraded', version, reason: missing.length ? `缺少 BrainGlobe 组件：${missing.join(', ')}` : atlas.installed ? 'BrainGlobe 组件与图谱均已就绪。' : `BrainGlobe 组件已安装，但托管图谱尚未下载：${atlas.directory}`, diagnostic: atlasDiagnostic })
    })
  })
}

export function parseBrainregMetadata(text: string): { valid: boolean; metadata?: JsonObject; error?: string } {
  try {
    const value = JSON.parse(text) as unknown
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return { valid: false, error: 'brainreg.json must contain a JSON object.' }
    return { valid: true, metadata: value as JsonObject }
  } catch (error) {
    return { valid: false, error: `brainreg.json is not valid JSON: ${String(error)}` }
  }
}

export interface BrainregOutputAudit {
  valid: boolean
  missing: string[]
  empty: string[]
  files: Array<{ name: string; bytes: number; sha256: string }>
  metadata?: JsonObject
  metadataError?: string
}

/**
 * Audit a completed brainreg directory before it is registered as a scientific
 * artifact.  A successful process exit alone is insufficient: required files
 * must be present, non-empty and the metadata must be parseable.  Hashes are
 * recorded so a later reviewer can prove which registration output was used.
 */
export async function auditBrainregOutputDirectory(directory: string): Promise<BrainregOutputAudit> {
  const entries = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isFile()).map(entry => entry.name).sort()
  const required = validateBrainregOutputs(entries)
  const files: BrainregOutputAudit['files'] = []
  const empty: string[] = []
  for (const name of entries) {
    const path = join(directory, name)
    const info = await stat(path)
    if (info.size === 0) empty.push(name)
    const hash = createHash('sha256')
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(path)
      stream.on('data', chunk => hash.update(chunk))
      stream.on('error', reject)
      stream.on('end', () => resolve())
    })
    files.push({ name, bytes: info.size, sha256: hash.digest('hex') })
  }
  let metadata: JsonObject | undefined
  let metadataError: string | undefined
  const metadataPath = join(directory, 'brainreg.json')
  if (entries.some(name => name.toLowerCase() === 'brainreg.json')) {
    const parsed = parseBrainregMetadata(await readFile(metadataPath, 'utf8'))
    if (parsed.valid) metadata = parsed.metadata
    else metadataError = parsed.error ?? 'brainreg.json could not be parsed.'
  }
  return {
    valid: required.valid && empty.length === 0 && metadataError === undefined,
    missing: required.missing,
    empty,
    files,
    ...(metadata === undefined ? {} : { metadata }),
    ...(metadataError === undefined ? {} : { metadataError }),
  }
}

export class BrainAtlasService {
  /**
   * The single in-flight BrainGlobe operation, or undefined when the runner is
   * free. This was a boolean, which reported only that *something* held the
   * runner — never what, and never for how long, so a caller that leaked the
   * flag was indistinguishable from a genuine concurrent request.
   */
  private active: { action: string; startedAt: number } | undefined
  private jobs=new BrainJobScope()
  constructor(private readonly store: ResearchStore, private readonly options: { pythonPath?: string; atlasDirectory?: string } = {}) {}

  /** Claim the runner, or refuse with the holder's identity and elapsed time. */
  private acquire(action: string): void {
    if (this.active) {
      const seconds = Math.round((Date.now() - this.active.startedAt) / 1000)
      throw new Error(`BrainGlobe runner is busy with ${this.active.action} (running ${seconds}s); retry after it finishes.`)
    }
    this.active = { action, startedAt: Date.now() }
  }
  private release(): void { this.active = undefined }

  /**
   * Whether the shared environment can actually import the BrainGlobe stack.
   *
   * This runs *before* the runner slot is claimed. A missing dependency used to
   * be discovered inside `run()` — several seconds into a failing interpreter
   * start, while the slot was held — so the next request was rejected as
   * "runner is busy" and the real reason never reached the user. Probing first
   * means the caller is told the truth: which packages are missing, and where to
   * install them.
   */
  private dependencyProbe: { checkedAt: number; missing: string[] } | undefined
  private async missingBrainDependencies(): Promise<string[]> {
    const cached = this.dependencyProbe
    // The installed package set is stable within a session and the probe costs a
    // process start, so a click must not re-run it every time.
    if (cached && Date.now() - cached.checkedAt < 60_000) return cached.missing
    const { executable, bootstrap } = await this.interpreter()
    const missing = await new Promise<string[]>(resolvePromise => {
      let child: ReturnType<typeof spawn>
      try { child = spawn(executable, ['-E', '-P', '-c', bootstrap + BRAIN_PACKAGE_PROBE], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: pythonChildEnvironment() }) }
      catch { resolvePromise(['Python 解释器无法启动']); return }
      let output = ''
      const timer = setTimeout(() => { stopBrainProcess(child); resolvePromise(['依赖探测超时']) }, 20_000)
      child.stdout?.on('data', chunk => { output = (output + String(chunk)).slice(0, 8000) })
      child.on('error', () => { clearTimeout(timer); resolvePromise(['Python 解释器无法启动']) })
      child.on('close', () => {
        clearTimeout(timer)
        try {
          const packages = (JSON.parse(output.trim()) as { packages?: Record<string, string | null> }).packages ?? {}
          resolvePromise(Object.entries(packages).filter(([, version]) => version == null).map(([name]) => name))
          // Unparseable output is a runner problem, not a dependency one: report
          // nothing missing rather than blocking on a probe that misfired.
        } catch { resolvePromise([]) }
      })
    })
    this.dependencyProbe = { checkedAt: Date.now(), missing }
    return missing
  }

  private async assertBrainDependencies(): Promise<void> {
    const missing = await this.missingBrainDependencies()
    if (missing.length === 0) return
    throw new Error(`脑图谱运行环境缺少依赖：${missing.join('、')}。请到「设置 → Python 环境」点击「一键同步」安装科研依赖，装完再回到脑图谱。该引擎与全软件共用同一个 Python 环境，不会创建独立环境。`)
  }

  /**
   * Interpreters are resolved per call, not cached, because the managed
   * environment is replaced in place by the desktop installer and a stale
   * absolute path would keep pointing at a retired generation.
   * Precedence: explicit option, dedicated env var, managed environment, bare python.
   */
  private async interpreter(): Promise<{ executable: string; bootstrap: string }> {
    const explicit = this.options.pythonPath ?? process.env.ZEROWALL_BRAINGLOBE_PYTHON?.trim()
    if (explicit) return { executable: explicit, bootstrap: '' }
    const managed = await resolveManagedBrainPython()
    if (managed) return { executable: managed.executable, bootstrap: brainBootstrap(managed) }
    return { executable: process.env.ZEROWALL_PYTHON?.trim() || 'python', bootstrap: '' }
  }

  /**
   * The managed directory is created lazily so BrainGlobe works out of the box
   * without the operator exporting ZEROWALL_BRAINGLOBE_DIR; the explicit
   * variable still wins for a user-managed atlas on another volume.
   */
  private async atlasDirectory(purpose: string): Promise<string> {
    // Truthiness, not ??: a blank ZEROWALL_BRAINGLOBE_DIR is not nullish and
    // would otherwise short-circuit past the managed default.
    const directory = this.options.atlasDirectory?.trim() || process.env.ZEROWALL_BRAINGLOBE_DIR?.trim() || defaultAtlasDirectory()
    if (!directory) throw new Error(`ZEROWALL_BRAINGLOBE_DIR is required for ${purpose}; install the managed atlas first.`)
    this.jobs.assertActive(); await mkdir(directory, { recursive: true })
    return directory
  }
  private get activeStore():ResearchStore{this.jobs.assertActive();return this.store}
  /**
   * Download the managed atlas into the resolved directory and verify it.
   * Idempotent: atlasapi short-circuits when the local volume already validates,
   * so a second call reports already-present rather than re-downloading.
   */
  async installAtlas(options: { atlasDirectory?: string } = {}): Promise<JsonObject> {
    // The download needs brainglobe-atlasapi, so it fails the same way an
    // analysis does; checking first keeps that failure actionable.
    await this.assertBrainDependencies()
    this.acquire('installAtlas')
    try { return await this.jobs.run(() => this.installAtlasOne(options)) } finally { this.release() }
  }

  private async installAtlasOne(options: { atlasDirectory?: string }): Promise<JsonObject> {
    const directory = options.atlasDirectory?.trim() || await this.atlasDirectory('managed atlas installation')
    const before = await atlasStatus(directory)
    const { executable, bootstrap } = await this.interpreter()
    // The atlasapi config lives inside the managed directory so the download
    // cannot silently fall back to a developer ~/.brainglobe cache.
    const configDirectory = join(directory, 'config')
    this.jobs.assertActive(); await mkdir(configDirectory, { recursive: true })
    const child = this.jobs.spawn(executable, ['-E', '-P', '-c', bootstrap + BRAIN_ATLAS_INSTALL_RUNNER], { shell: false, detached: process.platform !== 'win32', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: pythonChildEnvironment(undefined, { OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1' }) })
    const chunks: Buffer[] = []; let stderr = ''; let size = 0; let failure: Error | undefined
    const output = await new Promise<string>((resolvePromise, reject) => {
      const timer = setTimeout(() => { failure = new Error('Managed atlas download exceeded the 20-minute limit.'); stopBrainProcess(child) }, 20 * 60 * 1000)
      child.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 16 * 1024 * 1024) { failure = new Error('Managed atlas install output exceeds 16 MiB.'); stopBrainProcess(child) } else chunks.push(chunk) })
      child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-8000) })
      child.on('error', error => { clearTimeout(timer); reject(error) })
      // The download spawns helper processes that can outlive the direct child
      // while holding the inherited pipes; 'close' would then never fire and
      // installAtlas would keep its busy flag set for the rest of the session.
      const settle = settleRunner(child, code => {
        clearTimeout(timer)
        if (failure) { reject(failure); return }
        if (code === null) { reject(new Error(stderr.trim() || 'Managed atlas installer exited without reporting a status.')); return }
        const text = Buffer.concat(chunks).toString('utf8')
        if (code !== 0) reject(new Error(stderr.trim() || text.slice(0, 8000) || `Managed atlas installer exited with ${code}`))
        else resolvePromise(text)
      })
      child.on('exit', code => settle.gone(code))
      child.stdin.end(JSON.stringify({ atlas: ATLAS, atlasDirectory: directory, configDirectory }))
    })
    let reported: JsonObject
    try {
      reported = JSON.parse(output) as JsonObject
      if (reported.error) throw new Error(String(reported.error))
    } catch (error) {
      if (error instanceof Error && error.message && !error.message.startsWith('Unexpected token')) throw error
      throw new Error('Managed atlas installer returned invalid JSON.')
    }
    const verified = await atlasStatus(directory)
    if (!verified.installed) throw new Error(`Managed atlas verification failed; no non-empty annotation volume was found in ${directory}.`)
    const manifest = { format: 'zerowall-managed-atlas', version: 1, runner: `${RUNNER}+atlasapi`, atlas: ATLAS, atlasVersion: verified.atlasVersion ?? null, shape: verified.shape ?? null, resolution: verified.resolution ?? null, regionCount: verified.regionCount ?? null, annotationFile: reported.annotationFile ?? null, files: Array.isArray(reported.files) ? reported.files : [], builder: reported.builder ?? {}, installedAt: new Date().toISOString(), scientificReview: 'pending', notes: ['The atlas volume was downloaded by brainglobe_atlasapi into the managed directory and verified on disk.', 'Installing the atlas is not scientific review of any analysis that used it.'] }
    const manifestPath = join(directory, ATLAS, 'zerowall-atlas.json')
    const text = JSON.stringify(manifest, null, 2) + '\n'
    this.jobs.assertActive(); await writeFile(manifestPath, text, { flag: 'w' })
    const status = before.installed ? 'already-present' : 'installed'
    return { atlas: { status, directory, name: ATLAS, atlasVersion: verified.atlasVersion ?? null, shape: verified.shape ?? null, resolution: verified.resolution ?? null, regionCount: verified.regionCount ?? null, annotationBytes: verified.annotationBytes ?? null, annotationSha256: verified.annotationSha256 ?? null, manifestPath, notes: [`Managed atlas ${status === 'installed' ? 'was downloaded and verified' : 'was already present and re-verified'} at ${directory}.`, 'Cell detection, registration and regional claims still require scientific review.'] } } as unknown as JsonObject
  }

  dispose():Promise<void>{return this.jobs.dispose()}

  async execute(project: ProjectRecord, request: BrainAtlasRequest): Promise<BrainAtlasResponse> {
    // Checked before the slot is claimed: a missing dependency must be reported
    // as a missing dependency, not as a concurrent operation.
    await this.assertBrainDependencies()
    this.acquire(request.action)
    try { return await this.jobs.run(()=>this.executeOne(project, request)) } finally { this.release() }
  }

  private async executeOne(project: ProjectRecord, request: BrainAtlasRequest): Promise<BrainAtlasResponse> {
    if (!['open', 'read', 'analyze', 'export', 'cells', 'trajectory', 'register', 'cellfinder', 'render'].includes(request.action)) throw new Error('Unsupported BrainGlobe action.')
    if (request.atlas !== undefined && request.atlas !== ATLAS) throw new Error('Only allen_mouse_25um is enabled in the first BrainGlobe runner.')
    if (request.action === 'register') return await this.register(project, request)
    if (request.action === 'cellfinder') return await this.cellfinder(project, request)
    if (request.action === 'render') return await this.render(project, request)
    const asset = this.atlasAsset(project)
    if (request.action === 'open') {
      const result = await this.run({ operation: 'summary', maxRegions: 256 })
      const summary = this.expectSummary(result.summary)
      const viewer = this.activeStore.createViewerSession({ projectId: project.id, assetId: asset.id, tool: 'brain', state: { atlas: ATLAS, atlasVersion: summary.version, axis: 0, index: 0, downsample: 8, runner: RUNNER } })
      return { summary, viewer }
    }
    const viewer = this.viewer(project, request.viewerId)
    if (request.expectedVersion !== viewer.version) throw new Error(`Brain viewer revision conflict: current ${viewer.version}.`)
    const state = viewer.state
    if (request.action === 'read') {
      const result = await this.run({ operation: 'summary', maxRegions: 256 })
      return { summary: this.expectSummary(result.summary), viewer }
    }
    const params = { atlas: ATLAS, ...this.persistedParams(state, request) }
    const operation = request.action === 'cells' ? 'coordinates' : request.action === 'trajectory' ? 'trajectory' : request.region ? 'region' : request.coordinates ? 'coordinates' : 'slice'
    const result = await this.run({ ...params, operation, ...(request.action === 'analyze' && request.region ? { includeVoxelCount: true } : {}) })
    const updatedState: JsonObject = { ...state, ...(operation === 'slice' ? { axis: params.axis, index: params.index, downsample: params.downsample } : {}), ...(request.region ? { region: request.region } : {}) }
    const updated = this.activeStore.updateViewerSession(project.id, viewer.id, { expectedVersion: viewer.version, state: updatedState })
    const response: BrainAtlasResponse = { viewer: updated, ...(result.slice ? { slice: result.slice as unknown as BrainSlice } : {}), ...(result.region ? { region: result.region as unknown as BrainRegionResult } : {}), ...(result.analysis ? { analysis: result.analysis as unknown as BrainCellAnalysis } : {}) }
    if (request.action !== 'export') return response
    const directory = await this.exportDirectory(project); const manifest = JSON.stringify({ format: 'zerowall-brain-analysis', version: 1, runner: RUNNER, atlas: ATLAS, atlasVersion: state.atlasVersion ?? null, sourceAssetId: asset.id, viewerId: updated.id, viewerVersion: updated.version, parameters: { operation, ...params }, result: { ...(result.slice ? { slice: result.slice } : {}), ...(result.region ? { region: result.region } : {}), ...(result.analysis ? { analysis: result.analysis } : {}) }, scientificReview: 'pending' }, null, 2) + '\n'; const path = join(directory, 'result.json'); this.jobs.assertActive(); await writeFile(path, manifest, { flag: 'wx' }); const artifact = this.activeStore.createArtifact({ projectId: project.id, name: 'BrainGlobe atlas analysis', uri: pathToFileURL(path).href, mediaType: 'application/json', checksum: createHash('sha256').update(manifest).digest('hex'), metadata: { runner: RUNNER, atlas: ATLAS, atlasVersion: state.atlasVersion ?? null, viewerId: updated.id, viewerVersion: updated.version, scientificReview: 'pending' } })
    return { ...response, artifact }
  }

  private atlasAsset(project: ProjectRecord): DataAssetRecord {
    const existing = this.activeStore.listDataAssets(project.id).find(item => item.uri === `brainatlas://${ATLAS}`)
    if (existing) return existing
    return this.activeStore.createDataAsset({ projectId: project.id, name: 'Allen mouse CCF 25 um atlas', uri: `brainatlas://${ATLAS}`, location: 'web', mediaType: 'application/x-brainglobe-atlas', provenance: { atlas: ATLAS, runner: RUNNER, source: 'BrainGlobe atlasapi' } })
  }

  private viewer(project: ProjectRecord, id?: string): ViewerSessionRecord {
    const viewer = this.activeStore.listViewerSessions(project.id).find(item => item.id === id && item.tool === 'brain')
    if (!viewer) throw new Error('BrainGlobe viewer is not in the active project.')
    return viewer
  }

  private persistedParams(state: JsonObject, request: BrainAtlasRequest): { axis: 0 | 1 | 2; index: number; downsample: number; region?: string; coordinates?: Array<[number, number, number]>; coordinateUnits?: 'voxel' | 'micron'; maxCells?: number } {
    const axis = request.axis ?? (Number.isInteger(state.axis) ? Number(state.axis) : 0); if (![0, 1, 2].includes(axis)) throw new Error('Brain atlas axis must be 0, 1 or 2.')
    const index = request.index ?? (Number.isInteger(state.index) ? Number(state.index) : 0); if (!Number.isSafeInteger(index) || index < 0) throw new Error('Brain atlas slice index must be a non-negative integer.')
    const downsample = request.downsample ?? (Number.isInteger(state.downsample) ? Number(state.downsample) : 8); if (!Number.isSafeInteger(downsample) || downsample < 1 || downsample > 64) throw new Error('Brain atlas downsample must be between 1 and 64.')
    const coordinates = request.coordinates
    if(request.maxCells!==undefined&&(!Number.isSafeInteger(request.maxCells)||request.maxCells<1||request.maxCells>100000))throw new Error('maxCells must be an integer from 1 to 100000.')
    if(request.coordinateUnits!==undefined&&!['voxel','micron'].includes(request.coordinateUnits))throw new Error('Atlas coordinate units must be voxel or micron.')
    if(coordinates!==undefined&&(!Array.isArray(coordinates)||coordinates.some(point=>!Array.isArray(point)||point.length!==3||point.some(value=>typeof value!=='number'||!Number.isFinite(value)))))throw new Error('Coordinates require finite numeric atlas AP,SI,RL axis triplets; sample x,y,z requires a validated transform.')
    if (coordinates !== undefined && coordinates.length > (request.maxCells ?? 100000)) throw new Error('Brain coordinate count exceeds maxCells.')
    return { axis: axis as 0 | 1 | 2, index, downsample, ...(request.region === undefined ? {} : { region: request.region }), ...(coordinates === undefined ? {} : { coordinates }), ...(request.coordinateUnits === undefined ? {} : { coordinateUnits: request.coordinateUnits }), ...(request.maxCells === undefined ? {} : { maxCells: request.maxCells }) }
  }

  private expectSummary(value: unknown): BrainAtlasSummary { if (!value || typeof value !== 'object' || !Array.isArray((value as BrainAtlasSummary).regions)) throw new Error('BrainGlobe runner returned an invalid atlas summary.'); return value as BrainAtlasSummary }

  private async exportDirectory(project: ProjectRecord): Promise<string> { const root = await realpath(project.rootPath); const raw = join(root, '.zerowall', 'science-exports', randomUUID()); this.jobs.assertActive(); await mkdir(raw, { recursive: true }); return containedFile(root, raw) }

  private async run(request: JsonObject): Promise<JsonObject> {
    const { executable, bootstrap } = await this.interpreter()
    const atlasDir = await this.atlasDirectory('BrainGlobe analysis')
    return await new Promise((resolve, reject) => {
      const child = this.jobs.spawn(executable, ['-E', '-P', '-c', bootstrap + BRAIN_GLOBE_RUNNER], { shell: false, detached: process.platform !== 'win32', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: pythonChildEnvironment(undefined, { OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1' }) })
      const chunks: Buffer[] = []; let stderr = ''; let size = 0; let failure: Error | undefined
      const timer = setTimeout(() => { failure = new Error('BrainGlobe runner exceeded the 180-second limit.'); stopBrainProcess(child) }, 180000)
      child.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 64 * 1024 * 1024) { failure = new Error('BrainGlobe output exceeds 64 MiB.'); stopBrainProcess(child) } else chunks.push(chunk) })
      child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-8000) })
      child.on('error', error => { clearTimeout(timer); reject(error) })
      // NiftyReg workers can outlive the direct child while holding the pipes,
      // so settlement follows 'exit' instead of waiting on an unbounded 'close'.
      const settle = settleRunner(child, code => { clearTimeout(timer); const output = Buffer.concat(chunks).toString('utf8'); if (failure) reject(failure); else if (code === null) reject(new Error(stderr.trim() || 'BrainGlobe runner exited without reporting a status.')); else if (code !== 0) reject(new Error(stderr.trim() || output.slice(0, 8000) || `BrainGlobe runner exited with ${code}`)); else { try { const parsed = JSON.parse(output) as JsonObject; if (parsed.error) reject(new Error(String(parsed.error))); else resolve(parsed) } catch { reject(new Error('BrainGlobe runner returned invalid JSON.')) } } })
      child.on('exit', code => settle.gone(code))
      child.stdin.end(JSON.stringify({ ...request, brainglobeDir: atlasDir }))
    })
  }

  private async cellfinder(project: ProjectRecord, request: BrainAtlasRequest): Promise<BrainAtlasResponse> {
    if (!request.assetId) throw new Error('cellfinder requires a registered local signal volume assetId.')
    const signal = this.activeStore.listDataAssets(project.id).find(item => item.id === request.assetId)
    if (!signal || signal.location !== 'local' || !signal.uri.startsWith('file:')) throw new Error('cellfinder signal must be a local project asset.')
    const signalPath = await containedFile(project.rootPath, fileURLToPath(signal.uri))
    const signalInfo = await stat(signalPath)
    if (!signalInfo.isFile()) throw new Error('cellfinder signal asset must be a regular .npy or TIFF file.')
    if (!/\.(?:npy|tiff?)$/iu.test(signalPath)) throw new Error('cellfinder accepts only .npy or .tif/.tiff signal assets.')
    const background = request.backgroundAssetId === undefined ? undefined : this.activeStore.listDataAssets(project.id).find(item => item.id === request.backgroundAssetId)
    if (request.backgroundAssetId !== undefined && (!background || background.location !== 'local' || !background.uri.startsWith('file:'))) throw new Error('cellfinder background must be a local project asset.')
    const backgroundPath = background ? await containedFile(project.rootPath, fileURLToPath(background.uri)) : undefined
    if (backgroundPath && !/\.(?:npy|tiff?)$/iu.test(backgroundPath)) throw new Error('cellfinder accepts only .npy or .tif/.tiff background assets.')
    const voxelSizes = request.voxelSizes ?? [5, 1, 1]
    if (voxelSizes.length !== 3 || voxelSizes.some(value => !Number.isFinite(value) || value <= 0 || value > 10000)) throw new Error('cellfinder voxelSizes must contain three positive micron values.')
    const nFreeCpus = request.nFreeCpus ?? 2
    if (!Number.isSafeInteger(nFreeCpus) || nFreeCpus < 0 || nFreeCpus > 64) throw new Error('cellfinder nFreeCpus must be an integer between 0 and 64.')
    const startPlane = request.startPlane ?? 0
    const endPlane = request.endPlane
    if (!Number.isSafeInteger(startPlane) || startPlane < 0 || (endPlane !== undefined && (!Number.isSafeInteger(endPlane) || endPlane <= startPlane))) throw new Error('cellfinder plane bounds must be non-negative integers with endPlane greater than startPlane.')
    const root = await realpath(project.rootPath)
    const outputDirectoryRaw = join(root, '.zerowall', 'science-exports', randomUUID(), 'cellfinder')
    this.jobs.assertActive(); await mkdir(outputDirectoryRaw, { recursive: true })
    const outputDirectory = await containedFile(root, outputDirectoryRaw)
    const sourceSha256=await this.sha256File(signalPath)
    const backgroundSha256=backgroundPath?await this.sha256File(backgroundPath):undefined
    const result = await this.runCellfinder({ signalPath, ...(backgroundPath ? { backgroundPath } : {}), voxelSizes, nFreeCpus, startPlane, ...(endPlane === undefined ? {} : { endPlane }), skipClassification: request.skipClassification ?? true })
    if(await this.sha256File(signalPath)!==sourceSha256||(backgroundPath&&await this.sha256File(backgroundPath)!==backgroundSha256))throw new Error('Cellfinder input changed during execution; output is not registered.')
    const analysis = result.analysis as JsonObject
    const manifestValue = { format: 'zerowall-cellfinder-detection', version: 1, runner: `${RUNNER}+cellfinder`, sourceAssetId: signal.id, ...(background ? { backgroundAssetId: background.id } : {}), sourceSha256: await this.sha256File(signalPath), ...(backgroundPath ? { backgroundSha256: await this.sha256File(backgroundPath) } : {}), outputDirectory, parameters: { voxelSizes, nFreeCpus, startPlane, endPlane: endPlane ?? null, skipClassification: request.skipClassification ?? true }, analysis, scientificReview: 'pending', notes: ['Detection was executed by cellfinder in the managed BrainGlobe environment.', 'Coordinates are retained as raw cellfinder pixel coordinates; atlas registration and regional claims require a separate verified transform.', 'Detection-only mode does not provide classification probabilities.'] }
    const manifest = JSON.stringify(manifestValue, null, 2) + '\n'
    const manifestPath = join(outputDirectory, 'zerowall-cellfinder.json')
    this.jobs.assertActive(); await writeFile(manifestPath, manifest, { flag: 'wx' })
    const artifact = this.activeStore.createArtifact({ projectId: project.id, name: 'BrainGlobe cellfinder detection', uri: pathToFileURL(manifestPath).href, mediaType: 'application/json', checksum: createHash('sha256').update(manifest).digest('hex'), metadata: { runner: `${RUNNER}+cellfinder`, sourceAssetId: signal.id, ...(background ? { backgroundAssetId: background.id } : {}), scientificReview: 'pending' } })
    const cells = Array.isArray(analysis.cells) ? analysis.cells : []
    return { analysis: { total: cells.length, mapped: 0, outside: cells.length, byRegion: [], cells: cells.map((item, index) => { const row = item as Record<string, unknown>; return { index, coordinate: [Number(row.x), Number(row.y), Number(row.z)] as [number, number, number], regionId: 'unregistered', acronym: 'unregistered', hemisphere: 'unknown' } }), notes: ['Cellfinder coordinates are not atlas-mapped.', 'The detection output is pending scientific review.'] }, cellfinder: { status: 'succeeded', detected: cells.length, sourceAssetId: signal.id, ...(background ? { backgroundAssetId: background.id } : {}), voxelSizes, notes: ['Cellfinder detection completed; output is pending scientific review.', 'Use brain_cells/trajectory only after a validated atlas transform is available.'] }, artifact }
  }

  private async sha256File(path: string): Promise<string> {
    const hash = createHash('sha256')
    await new Promise<void>((resolve, reject) => { const stream = createReadStream(path); stream.on('data', chunk => hash.update(chunk)); stream.on('error', reject); stream.on('end', resolve) })
    return hash.digest('hex')
  }

  private async runCellfinder(request: JsonObject): Promise<JsonObject> {
    const { executable, bootstrap } = await this.interpreter()
    const atlasDir = await this.atlasDirectory('cellfinder analysis')
    return await new Promise((resolve, reject) => {
      const child = this.jobs.spawn(executable, ['-E', '-P', '-c', bootstrap + CELLFINDER_RUNNER], { shell: false, detached: process.platform !== 'win32', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: pythonChildEnvironment(undefined, { OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1' }) })
      const chunks: Buffer[] = []; let stderr = ''; let size = 0; let failure: Error | undefined
      const timer = setTimeout(() => { failure = new Error('cellfinder runner exceeded the 300-second limit.'); stopBrainProcess(child) }, 300000)
      child.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 64 * 1024 * 1024) { failure = new Error('cellfinder output exceeds 64 MiB.'); stopBrainProcess(child) } else chunks.push(chunk) })
      child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-12000) })
      child.on('error', error => { clearTimeout(timer); reject(error) })
      // The torch worker cellfinder starts outlives the direct child and holds
      // the inherited pipes, so settlement follows 'exit' rather than 'close'.
      const settle = settleRunner(child, code => { clearTimeout(timer); const output = Buffer.concat(chunks).toString('utf8'); if (failure) reject(failure); else if (code === null) reject(new Error(stderr.trim() || 'cellfinder runner exited without reporting a status.')); else if (code !== 0) reject(new Error(stderr.trim() || output.slice(0, 8000) || `cellfinder runner exited with ${code}`)); else { try { const parsed = JSON.parse(output) as JsonObject; if (parsed.error) reject(new Error(String(parsed.error))); else resolve(parsed) } catch { reject(new Error('cellfinder runner returned invalid JSON.')) } } })
      child.on('exit', code => settle.gone(code))
      child.stdin.end(JSON.stringify({ ...request, brainglobeDir: atlasDir }))
    })
  }

  private async render(project: ProjectRecord, request: BrainAtlasRequest): Promise<BrainAtlasResponse> {
    const regions = (request.brainRegions ?? []).map(value => String(value).trim()).filter(Boolean).slice(0, 16)
    const coordinates = request.coordinates ?? []
    if (regions.length === 0 && coordinates.length === 0) throw new Error('brainrender requires at least one brain region or coordinate.')
    if (coordinates.length > 10000) throw new Error('brainrender coordinate count exceeds 10000.')
    if (coordinates.length > 0 && request.coordinateUnits !== undefined && request.coordinateUnits !== 'micron') throw new Error('brainrender coordinates must be declared in micron units; map voxel coordinates first.')
    const pointRadius = request.brainPointRadius ?? 20
    if (!Number.isFinite(pointRadius) || pointRadius < 1 || pointRadius > 200) throw new Error('brainrender point radius must be between 1 and 200 microns.')
    const root = await realpath(project.rootPath)
    const outputDirectoryRaw = join(root, '.zerowall', 'science-exports', randomUUID(), 'brainrender')
    this.jobs.assertActive(); await mkdir(outputDirectoryRaw, { recursive: true })
    const outputDirectory = await containedFile(root, outputDirectoryRaw)
    const result = await this.runBrainrender({ outputDirectory, regions, coordinates, title: request.brainTitle ?? 'ZeroWall Science BrainGlobe', pointRadius })
    const scene = result.scene as Record<string, unknown>
    const pngPath = await containedFile(root, String(scene.png ?? ''))
    const htmlPath = await containedFile(root, String(scene.html ?? ''))
    const pngInfo = await stat(pngPath); const htmlInfo = await stat(htmlPath)
    if (!pngInfo.isFile() || pngInfo.size === 0 || !htmlInfo.isFile() || htmlInfo.size === 0) throw new Error('brainrender returned empty or missing scene outputs.')
    const pngChecksum=await this.sha256File(pngPath);const htmlChecksum=await this.sha256File(htmlPath)
    const pngArtifact = this.activeStore.createArtifact({ projectId: project.id, name: 'BrainGlobe 3D scene PNG', uri: pathToFileURL(pngPath).href, mediaType: 'image/png', checksum: pngChecksum, metadata: { runner: `${RUNNER}+brainrender`, atlas: ATLAS, scientificReview: 'pending' } })
    const htmlArtifact = this.activeStore.createArtifact({ projectId: project.id, name: 'BrainGlobe 3D scene HTML', uri: pathToFileURL(htmlPath).href, mediaType: 'text/html', checksum: htmlChecksum, metadata: { runner: `${RUNNER}+brainrender`, atlas: ATLAS, scientificReview: 'pending' } })
    const manifestValue = { format: 'zerowall-brainrender-scene', version: 1, runner: `${RUNNER}+brainrender`, atlas: ATLAS, outputDirectory, regions, coordinates, coordinateUnits: coordinates.length > 0 ? 'micron' : null, pngArtifactId: pngArtifact.id, htmlArtifactId: htmlArtifact.id, scene, scientificReview: 'pending', notes: ['The scene was rendered by brainrender using the managed Allen mouse 25 um atlas.', 'A visualization artifact is not anatomical or mechanistic evidence.', 'Coordinates are retained as supplied and must have a separately validated registration transform for regional claims.'] }
    const manifest = JSON.stringify(manifestValue, null, 2) + '\n'
    const manifestPath = join(outputDirectory, 'zerowall-brainrender.json')
    this.jobs.assertActive(); await writeFile(manifestPath, manifest, { flag: 'wx' })
    const artifact = this.activeStore.createArtifact({ projectId: project.id, name: 'BrainGlobe 3D scene manifest', uri: pathToFileURL(manifestPath).href, mediaType: 'application/json', checksum: createHash('sha256').update(manifest).digest('hex'), metadata: { runner: `${RUNNER}+brainrender`, atlas: ATLAS, pngArtifactId: pngArtifact.id, htmlArtifactId: htmlArtifact.id, scientificReview: 'pending' } })
    return { rendering: { status: 'succeeded', outputDirectory, pngUri: pathToFileURL(pngPath).href, htmlUri: pathToFileURL(htmlPath).href, regions, coordinateCount: coordinates.length, notes: ['brainrender scene PNG and HTML were generated.', 'Results remain pending scientific review.'] }, artifact }
  }

  private async runBrainrender(request: JsonObject): Promise<JsonObject> {
    const { executable, bootstrap } = await this.interpreter()
    const atlasDir = await this.atlasDirectory('brainrender')
    return await new Promise((resolve, reject) => {
      const child = this.jobs.spawn(executable, ['-E', '-P', '-c', bootstrap + BRAINRENDER_RUNNER], { shell: false, detached: process.platform !== 'win32', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: pythonChildEnvironment(undefined, { OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1', MPLBACKEND: 'Agg' }) })
      const chunks: Buffer[] = []; let stderr = ''; let size = 0; let failure: Error | undefined
      const timer = setTimeout(() => { failure = new Error('brainrender runner exceeded the 180-second limit.'); stopBrainProcess(child) }, 180000)
      child.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 16 * 1024 * 1024) { failure = new Error('brainrender output exceeds 16 MiB.'); stopBrainProcess(child) } else chunks.push(chunk) })
      child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-12000) })
      child.on('error', error => { clearTimeout(timer); reject(error) })
      // brainrender starts a rendering worker that can hold the pipes past exit.
      const settle = settleRunner(child, code => { clearTimeout(timer); const output = Buffer.concat(chunks).toString('utf8'); if (failure) reject(failure); else if (code === null) reject(new Error(stderr.trim() || 'brainrender runner exited without reporting a status.')); else if (code !== 0) reject(new Error(stderr.trim() || output.slice(0, 8000) || `brainrender runner exited with ${code}`)); else { try { const parsed = JSON.parse(output) as JsonObject; if (parsed.error) reject(new Error(String(parsed.error))); else resolve(parsed) } catch { reject(new Error('brainrender runner returned invalid JSON.')) } } })
      child.on('exit', code => settle.gone(code))
      child.stdin.end(JSON.stringify({ ...request, brainglobeDir: atlasDir }))
    })
  }

  private async register(project: ProjectRecord, request: BrainAtlasRequest): Promise<BrainAtlasResponse> {
    if (!request.assetId) throw new Error('brainreg requires a registered image-stack assetId.')
    const source = this.activeStore.listDataAssets(project.id).find(item => item.id === request.assetId)
    if (!source) throw new Error('brainreg input asset is not in the active project.')
    if (source.location !== 'local' || !source.uri.startsWith('file:')) throw new Error('brainreg requires a materialized local image stack.')
    const inputPath = await containedFile(project.rootPath, fileURLToPath(source.uri))
    const inputInfo = await stat(inputPath)
    if(!inputInfo.isFile()&&!inputInfo.isDirectory())throw new Error('Brainreg input must be a TIFF stack or directory of TIFF slices.')
    if(inputInfo.isFile()&&!/\.tiff?$/iu.test(inputPath))throw new Error('Brainreg accepts a TIFF stack; arbitrary text lists are not accepted.')
    const sourceFiles=inputInfo.isFile()?[inputPath]:(await readdir(inputPath,{withFileTypes:true})).filter(entry=>entry.isFile()&&/\.tiff?$/iu.test(entry.name)).map(entry=>join(inputPath,entry.name)).sort()
    if(!sourceFiles.length||sourceFiles.length>10000)throw new Error('Brainreg requires between 1 and 10000 TIFF files.')
    const sourceManifest=[]
    for(const file of sourceFiles){const safe=await containedFile(project.rootPath,file);const info=await stat(safe);sourceManifest.push({path:safe,bytes:info.size,sha256:await this.sha256File(safe)})}
    const voxelSizes = request.voxelSizes ?? [25, 25, 25]
    if (voxelSizes.length !== 3 || voxelSizes.some(value => !Number.isFinite(value) || value <= 0 || value > 10000)) throw new Error('brainreg voxelSizes must contain three positive micron values.')
    const orientation = request.orientation?.trim()
    if (!orientation || !/^[a-z]{3}$/u.test(orientation)||!['ap','si','rl'].every(pair=>[...orientation].filter(c=>pair.includes(c)).length===1)) throw new Error('brainreg orientation must select one axis from each AP, SI and RL pair, such as asr.')
    const nFreeCpus = request.nFreeCpus ?? 2
    if (!Number.isSafeInteger(nFreeCpus) || nFreeCpus < 0 || nFreeCpus > 64) throw new Error('brainreg nFreeCpus must be an integer between 0 and 64.')
    const root = await realpath(project.rootPath)
    const outputDirectoryRaw = join(root, '.zerowall', 'science-exports', randomUUID(), 'brainreg')
    this.jobs.assertActive(); await mkdir(outputDirectoryRaw, { recursive: true })
    const outputDirectory = await containedFile(root, outputDirectoryRaw)
    // brainreg accepts a directory of image slices or a text file listing
    // those slices.  Passing a single TIFF directly is ambiguous and can
    // make the CLI treat it as a directory, so materialise an input manifest
    // for file assets while retaining directories as-is.
    const inputArgument = join(outputDirectory, 'brainreg-inputs.txt')
    this.jobs.assertActive(); await writeFile(inputArgument,sourceManifest.map(file=>file.path).join('\n')+'\n',{flag:'wx'})
    const atlasDirectory=await this.atlasDirectory('registration')
    // Resolve the CPU count inside the same Python/psutil used by brainreg.
    // Explicitly bind its atlas config so it cannot select another installation.
    const launcher=BRAIN_RESOURCE_GUARD+`import sys,os,runpy,configparser\nfrom pathlib import Path\nimport psutil\noutput=Path(sys.argv[2]);config=output/'atlas-config';config.mkdir(exist_ok=True)\nc=configparser.ConfigParser();c['default_dirs']={'brainglobe_dir':os.environ['ZEROWALL_BRAINGLOBE_DIR'],'interm_download_dir':os.environ['ZEROWALL_BRAINGLOBE_DIR']}\nwith (config/'bg_config.conf').open('w') as f:c.write(f)\nos.environ['BRAINGLOBE_CONFIG_DIR']=str(config)\nargs=sys.argv[1:];i=args.index('--n-free-cpus')+1;args[i]=str(max(int(args[i]),(psutil.cpu_count() or 1)-8));sys.argv=['brainreg']+args\nrunpy.run_module('brainreg.core.cli',run_name='__main__')`
    const { executable: python, bootstrap } = await this.interpreter()
    const args = ['-E', '-P', '-c',bootstrap+launcher,inputArgument, outputDirectory, '--atlas', ATLAS, '--voxel-sizes', ...voxelSizes.map(String), '--orientation', orientation, '--n-free-cpus', String(nFreeCpus)]
    const startedAt = Date.now()
    await new Promise<void>((resolve, reject) => {
      const child = this.jobs.spawn(python, args, { shell: false, detached: process.platform !== 'win32', windowsHide: true, cwd: dirname(inputPath), stdio: ['ignore', 'pipe', 'pipe'], env: pythonChildEnvironment(undefined, { ZEROWALL_BRAINGLOBE_DIR: atlasDirectory, OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1' }) })
      let stderr = ''; let stdout = ''; let timedOut = false
      const timer = setTimeout(() => { timedOut = true; stopBrainProcess(child); reject(new Error('brainreg exceeded the 30-minute bounded runner limit.')) }, 30 * 60 * 1000)
      child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-12000) })
      child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-12000) })
      child.on('error', error => { clearTimeout(timer); reject(error) })
      // NiftyReg is started as a grandchild and keeps the inherited pipes open
      // after brainreg itself is reaped; 'close' alone would never fire here.
      const settle = settleRunner(child, code => { clearTimeout(timer); if (timedOut) return; if (code === null) reject(new Error(`brainreg exited without reporting a status: ${(stderr || stdout).trim().slice(-8000)}`)); else if (code !== 0) reject(new Error(`brainreg exited with ${code}: ${(stderr || stdout).trim().slice(-8000)}`)); else resolve() })
      child.on('exit', code => settle.gone(code))
    })
    const outputAudit = await auditBrainregOutputDirectory(outputDirectory)
    if (!outputAudit.valid) {
      const reasons = [...outputAudit.missing.map(item => `missing ${item}`), ...outputAudit.empty.map(item => `empty ${item}`), ...(outputAudit.metadataError ? [outputAudit.metadataError] : [])]
      throw new Error(`brainreg exited successfully but output audit failed: ${reasons.join('; ')}`)
    }
    const transform=await createBrainTransformContract(outputDirectory,this.jobs)
    for(const file of sourceManifest)if(await this.sha256File(file.path)!==file.sha256)throw new Error('Brainreg input changed during execution; output is not registered.')
    const result = { format: 'zerowall-brainreg-registration', version: 1, runner: `${RUNNER}+brainreg`, atlas: ATLAS, sourceAssetId: source.id, sourceUri: source.uri, sourceSize: inputInfo.size, parameters: { voxelSizes, orientation, nFreeCpus,maxThreads:8 },transform, outputDirectory, outputFiles: outputAudit.files, brainregMetadata: outputAudit.metadata ?? {}, outputAudit: { status: 'ready-for-review', requiredOutputs: ['brainreg.json', 'registered_atlas.tiff|registered_atlas.nii'], emptyFiles: outputAudit.empty }, durationMs: Date.now() - startedAt, scientificReview: 'pending', notes: ['Registration was executed by the managed brainreg CLI.', 'Required output files were present, non-empty and hashed; brainreg.json was parsed.', 'Registration quality, anatomical alignment and downstream cell detection require scientific review.', 'The output directory is retained for brainreg metadata and registered volumes.'] }
    const manifest = JSON.stringify({...result,sourceManifest}, null, 2) + '\n'
    const manifestPath = join(outputDirectory, 'zerowall-registration.json')
    this.jobs.assertActive(); await writeFile(manifestPath, manifest, { flag: 'wx' })
    const artifact = this.activeStore.createArtifact({ projectId: project.id, name: 'BrainGlobe brainreg registration', uri: pathToFileURL(manifestPath).href, mediaType: 'application/json', checksum: createHash('sha256').update(manifest).digest('hex'), metadata: { runner: `${RUNNER}+brainreg`, atlas: ATLAS, sourceAssetId: source.id, outputDirectory, scientificReview: 'pending' } })
    return { registration: { status: 'succeeded', outputDirectory, command: [python, ...args], notes: result.notes }, artifact }
  }
}
