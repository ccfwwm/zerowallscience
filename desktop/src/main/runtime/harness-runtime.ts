import { spawnSync, type ChildProcess, type SpawnOptions } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'
import { createWriteStream, existsSync, type WriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { delimiter, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { RuntimePhase, RuntimeSnapshot } from '../../shared/contracts.js'

export interface HarnessRuntimeOptions {
  dshEntryPath: string
  nodeExecutablePath: string
  nodeEntryPath: string
  nodeResolverPath?: string
  runtimeModulesPath?: string
  /** Package/file used as the bare-module resolution anchor for the runtime closure. */
  runtimeAnchorPath?: string
  runAsNode: boolean
  dshPatchPath: string
  userDataPath: string
  dshHome: string
  userSkillsPath: string
  researchDbPath: string
  bundledSkillsPath: string
  mcpEnvironmentRoot: string
  brandIconPath?: string
  logPath: string
  /** Stable port record preserves the renderer origin across restarts. */
  portPath?: string
  launchProcess(executable: string, args: string[], options: SpawnOptions): HarnessChildProcess
  terminateProcessTree?(pid: number, force: boolean): void
  shutdownGracePeriodMs?: number
  shutdownForcePeriodMs?: number
  onChildStarted?(child: HarnessChildProcess): void
  onChanged(snapshot: RuntimeSnapshot): void
}

export type HarnessChildProcess = ChildProcess & { stdin: Writable; stdout: Readable; stderr: Readable }

export function buildHarnessArguments(port: number, patchPath: string): string[] {
  // Electron owns the renderer window.  The DSH web bundle opens the user's
  // default browser by default, which is both unnecessary and unreliable in
  // a packaged Windows app (it can emit a misleading "path not found" error
  // and leave the actual Electron window hidden).  Always keep browser
  // handoff disabled for the embedded Host.
  return ['web', '--patch', patchPath, '--host', '127.0.0.1', '--port', String(port), '--no-open']
}

export function buildHarnessSpawnOptions(
  launchDirectory: string,
  options: Pick<HarnessRuntimeOptions, 'dshEntryPath' | 'userDataPath' | 'dshHome' | 'userSkillsPath' | 'researchDbPath' | 'bundledSkillsPath' | 'mcpEnvironmentRoot' | 'brandIconPath' | 'runAsNode' | 'runtimeModulesPath' | 'nodeResolverPath' | 'runtimeAnchorPath'>,
  environment: NodeJS.ProcessEnv = process.env,
): SpawnOptions {
  const { ELECTRON_RUN_AS_NODE: _electron, ...parentEnvironment } = environment
  return {
    cwd: launchDirectory,
    env: {
      ...parentEnvironment,
      DSH_HOME: options.dshHome,
      ZEROWALL_USER_DATA_DIR: options.userDataPath,
      ZEROWALL_USER_SKILLS: options.userSkillsPath,
      DSH_BUNDLED_SKILL_DIR: options.bundledSkillsPath,
      ZEROWALL_RESEARCH_DB: options.researchDbPath,
      ZEROWALL_MCP_ENVIRONMENT_ROOT: options.mcpEnvironmentRoot,
      ZEROWALL_BUNDLED_SKILLS: options.bundledSkillsPath,
      // Managed MCP processes inherit these explicit mounts. They are roots,
      // never development-machine paths, and user skills may shadow bundled
      // names through the skill registry's normal priority rules.
      // Managed MCP processes inherit both read-only bundled Skills and the
      // user's editable Skills. Keep the legacy single-root variable pointed
      // at the bundled catalog while exposing an ordered roots list and
      // explicit roots for consumers that understand the richer contract.
      ZEROWALL_MCP_SKILLS: [options.bundledSkillsPath, options.userSkillsPath].join(delimiter),
      ZEROWALL_MCP_BUNDLED_SKILLS: options.bundledSkillsPath,
      ZEROWALL_MCP_USER_SKILLS: options.userSkillsPath,
      ...(options.brandIconPath === undefined ? {} : { ZEROWALL_BRAND_ICON: options.brandIconPath }),
      DSH_TELEMETRY_DISABLED: '1',
      NO_COLOR: '1',
      ...(options.runtimeModulesPath ? { NODE_PATH: options.runtimeModulesPath } : {}),
      ...(options.runAsNode ? {
        ELECTRON_RUN_AS_NODE: '1',
      } : {}),
      ...(options.runtimeAnchorPath || options.nodeResolverPath ? {
        ZEROWALL_RUNTIME_ANCHOR: pathToFileURL(options.runtimeAnchorPath ?? options.dshEntryPath).href,
      } : {}),
    },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  }
}

export class HarnessRuntime {
  private child?: HarnessChildProcess
  private logStream?: WriteStream
  private phase: RuntimePhase = 'idle'
  private message = 'Harness is not running.'
  private launchDirectory?: string
  private url?: string
  private authenticatedUrl?: string
  private readonly logLines: string[] = []

  constructor(private readonly options: HarnessRuntimeOptions) {}

  snapshot(): RuntimeSnapshot {
    return { phase: this.phase, message: this.message, launchDirectory: this.launchDirectory, url: this.url, logs: [...this.logLines] }
  }

  async start(launchDirectory: string): Promise<void> {
    await this.stop()
    this.launchDirectory = launchDirectory
    this.url = undefined
    this.authenticatedUrl = undefined

    await mkdir(dirname(this.options.logPath), { recursive: true })
    this.logStream = createWriteStream(this.options.logPath, { flags: 'a' })
    this.writeLog(`\n[desktop] starting ${new Date().toISOString()}`)
    this.writeLog(`[desktop] launch directory ${launchDirectory}`)

    for (const [label, path] of [
      ['Harness entry', this.options.dshEntryPath],
      ['Node runtime', this.options.nodeExecutablePath],
      ['Node bootstrap', this.options.nodeEntryPath],
      ...(this.options.nodeResolverPath ? [['Node ESM resolver', this.options.nodeResolverPath] as const] : []),
      ['ZeroWall patch', this.options.dshPatchPath],
      ['ZeroWall scientific skills', this.options.bundledSkillsPath],
    ] as const) {
      this.writeLog(`[desktop] ${label.toLowerCase()} ${path}`)
      if (!existsSync(path)) {
        this.fail(`${label} was not found: ${path}`)
        return
      }
    }

    await mkdir(launchDirectory, { recursive: true })
    await mkdir(this.options.dshHome, { recursive: true })
    await mkdir(this.options.userSkillsPath, { recursive: true })
    await mkdir(dirname(this.options.researchDbPath), { recursive: true })

    const port = await reservePort(await readPreferredPort(this.options.portPath))
    if (this.options.portPath !== undefined) {
      await writeFile(this.options.portPath, `${port}\n`, 'utf8').catch(() => undefined)
    }
    const url = `http://127.0.0.1:${port}`
    const args = [
      ...(this.options.nodeResolverPath ? ['--import', pathToFileURL(this.options.nodeResolverPath).href] : []),
      '--expose-internals',
      this.options.nodeEntryPath,
      this.options.dshEntryPath,
      ...buildHarnessArguments(port, this.options.dshPatchPath),
    ]
    this.writeLog(`[desktop] endpoint ${url}`)
    this.setState('starting', 'Starting ZeroWall Science agent runtime...')

    let child: HarnessChildProcess
    try {
      child = this.options.launchProcess(
        this.options.nodeExecutablePath,
        args,
        buildHarnessSpawnOptions(launchDirectory, this.options),
      )
    } catch (error) {
      this.fail(`Harness process creation failed: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
    this.child = child
    this.options.onChildStarted?.(child)
    child.stdout.on('data', (chunk: Buffer) => this.writeChunk('stdout', chunk))
    child.stderr.on('data', (chunk: Buffer) => this.writeChunk('stderr', chunk))
    child.once('error', (error) => {
      if (this.child !== child) return
      this.child = undefined
      this.fail(`Harness could not start: ${error.message}`)
    })
    child.once('exit', (code, signal) => {
      if (this.child !== child) return
      this.child = undefined
      this.fail(`Harness stopped unexpectedly (${signal ?? `exit ${String(code)}`}). Startup details: ${this.options.logPath}`)
    })

    const ready = await waitUntilReady(url, () => this.child === child && child.exitCode === null, process.platform === 'win32' ? 120_000 : 45_000)
    if (this.child !== child) return
    if (!ready) {
      await this.stopChild(child)
      this.fail('Harness did not become ready before the startup deadline.')
      return
    }
    // DSH alpha.1 protects the embedded web server with a per-run token.
    // Prefer the authenticated URL emitted by `dsh web`; the bare loopback
    // URL intentionally returns 401 and renders as a blank Electron window.
    this.url = this.authenticatedUrl ?? url
    this.writeLog(`[desktop] ready ${url}`)
    this.setState('ready', 'ZeroWall Science is ready.')
  }

  async stop(): Promise<void> {
    const child = this.child
    this.child = undefined
    if (child !== undefined) await this.stopChild(child)
    this.logStream?.end()
    this.logStream = undefined
    this.url = undefined
    if (this.phase !== 'failed') this.setState('idle', 'Harness is not running.')
  }

  private async stopChild(child: HarnessChildProcess): Promise<void> {
    if (child.exitCode !== null) return
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
    this.terminateChild(child, false)
    if (await waitForExit(exited, this.options.shutdownGracePeriodMs ?? 3_000)) return
    this.terminateChild(child, true)
    await waitForExit(exited, this.options.shutdownForcePeriodMs ?? 1_000)
  }

  private terminateChild(child: HarnessChildProcess, force: boolean): void {
    try {
      if (process.platform === 'win32' && child.pid !== undefined) {
        const terminate = this.options.terminateProcessTree ?? terminateWindowsProcessTree
        terminate(child.pid, force)
      } else {
        child.kill(force ? 'SIGKILL' : 'SIGTERM')
      }
    } catch {
      // Shutdown is best-effort and bounded by the desktop-level exit deadline.
    }
  }

  private setState(phase: RuntimePhase, message: string): void {
    this.phase = phase
    this.message = message
    this.options.onChanged(this.snapshot())
  }

  private fail(message: string): void {
    this.writeLog(`[desktop] failed ${message}`)
    this.setState('failed', message)
  }

  private writeChunk(source: string, chunk: Buffer): void {
    for (const line of chunk.toString('utf8').split(/\r?\n/)) {
      if (line.length === 0) continue
      this.writeLog(`[${source}] ${line}`)
      const match = /dsh web:\s+(https?:\/\/\S+)/u.exec(line)
      if (match?.[1] === undefined || !match[1].includes('?token=')) continue
      this.authenticatedUrl = match[1].replace(/[\])}>,.;]+$/u, '')
      // stdout can arrive just after the HTTP readiness probe. Reload the
      // already-created Electron window with the authenticated URL.
      if (this.phase === 'ready' && this.url !== this.authenticatedUrl) {
        this.url = this.authenticatedUrl
        this.options.onChanged(this.snapshot())
      }
    }
  }

  private writeLog(line: string): void {
    this.logLines.push(line)
    if (this.logLines.length > 200) this.logLines.splice(0, this.logLines.length - 200)
    this.logStream?.write(`${line}\n`)
  }
}

function terminateWindowsProcessTree(pid: number, force: boolean): void {
  const args = ['/PID', String(pid), '/T']
  if (force) args.push('/F')
  spawnSync('taskkill', args, { stdio: 'ignore', windowsHide: true })
}

async function waitForExit(exited: Promise<void>, timeoutMs: number): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      exited.then(() => true),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), timeoutMs)
        timeout.unref?.()
      }),
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

async function reservePort(preferredPort?: number): Promise<number> {
  if (preferredPort !== undefined) {
    try {
      return await listenPort(preferredPort)
    } catch {
      // Another process may still own the previous port; use a free one.
    }
  }
  return await listenPort(0)
}

async function listenPort(port: number): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port }, () => {
      const address = server.address()
      if (address === null || typeof address === 'string') return reject(new Error('Could not reserve a local port.'))
      server.close((error) => error === undefined ? resolve(address.port) : reject(error))
    })
  })
}

async function readPreferredPort(path: string | undefined): Promise<number | undefined> {
  if (path === undefined) return undefined
  try {
    const port = Number.parseInt((await readFile(path, 'utf8')).trim(), 10)
    return Number.isInteger(port) && port >= 1024 && port <= 65_535 ? port : undefined
  } catch {
    return undefined
  }
}

async function waitUntilReady(url: string, isAlive: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline && isAlive()) {
    try {
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(1_000) })
      if (response.status >= 200 && response.status < 500) return true
    } catch {
      // Expected while the Host is still binding.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}
