import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { realpath, stat, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { ProjectRecord } from '@zerowallscience/research-store/types'
import type { ScientificEngineId, ScientificEngineLaunchResult } from '../shared/types.js'
import { containedFile } from './science-viewer.js'
import { fijiAnnotationAdapter, napariAnnotationAdapter } from './annotation-adapters.js'

export interface AnnotationBridgeSetup {
  viewerId: string; baseRevisionId: string; sourceSha256: string; directory: string; document: unknown
}

export function engineExecutable(engine: ScientificEngineId): string {
  if (engine === 'fiji') return process.env.ZEROWALL_FIJI_EXECUTABLE?.trim() || join(process.env.ZEROWALL_FIJI_PATH?.trim() || 'C:\\softworks\\fiji', process.platform === 'win32' ? 'fiji-windows-x64.exe' : 'fiji')
  if (engine === 'napari') return process.env.ZEROWALL_NAPARI_PYTHON?.trim() || join(process.env.LOCALAPPDATA || '', 'napari-0.9.1', 'envs', 'napari-0.9.1', 'python.exe')
  throw new Error('Unsupported native engine.')
}

export function engineArguments(engine: ScientificEngineId, assetPath?: string): string[] {
  // Jaunch consumes --allow-multiple; ImageJ Legacy also needs its own flag.
  if (engine === 'fiji') return ['--allow-multiple', '--forbid-single-instance', ...(assetPath ? [assetPath] : [])]
  if (engine === 'napari') return ['-m', 'napari', ...(assetPath ? [assetPath] : [])]
  throw new Error('Unsupported native engine.')
}

export async function engineEnvironment(engine: ScientificEngineId, executable: string): Promise<NodeJS.ProcessEnv> {
  const env = { ...process.env }
  if (engine !== 'napari' || process.platform !== 'win32') return env
  const prefix = dirname(executable)
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

  async launch(project: ProjectRecord, sessionId: string, engine: ScientificEngineId, assetId?: string, bridge?: AnnotationBridgeSetup): Promise<ScientificEngineLaunchResult> {
    if (this.disposed) throw new Error('Native engine service has stopped.')
    const executable = engineExecutable(engine)
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
        try { child = spawn(path, args, { cwd, env, shell: false, windowsHide: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }) }
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
