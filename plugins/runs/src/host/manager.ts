import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ResearchStore } from '@zerowallscience/research-store'
import type { ExecutionContextRecord, RunRecord } from '@zerowallscience/research-store/types'

const REMOTE_PID_MARKER = '__ZEROWALL_REMOTE_PID__='
const EXIT_CODE_MARKER = '__ZEROWALL_EXIT_CODE__='
const TERMINAL_STATUSES = new Set<RunRecord['status']>(['succeeded', 'failed', 'cancelled', 'timed_out'])

export interface RunSubmission {
  projectId: string
  executionContextId?: string
  name: string
  command: string
  workingDirectory: string
  timeoutMs?: number
  inputs?: RunRecord['inputs']
  outputs?: RunRecord['outputs']
}

export interface RunLaunchSpec { executable: string; args: string[]; cwd?: string; logPath: string }
export interface RunProcess { pid: number; exited: Promise<{ code: number | null; signal: string | null }> }
export interface RunProcessAdapter {
  launch(spec: RunLaunchSpec): RunProcess
  isAlive(pid: number): boolean
  cancel(pid: number): Promise<void>
  pause(pid: number, context: ExecutionContextRecord): Promise<void>
  resume(pid: number, context: ExecutionContextRecord): Promise<void>
  isRemoteAlive?(context: ExecutionContextRecord, remotePid: string): Promise<boolean>
  cancelRemote?(context: ExecutionContextRecord, remotePid: string): Promise<void>
  pauseRemote?(context: ExecutionContextRecord, remotePid: string): Promise<void>
  resumeRemote?(context: ExecutionContextRecord, remotePid: string): Promise<void>
}
export interface RunJobProjector { update(run: RunRecord): void }

interface ActiveRun { pid?: number; timeout?: NodeJS.Timeout }

export class NodeRunProcessAdapter implements RunProcessAdapter {
  constructor(private readonly platform: NodeJS.Platform = process.platform) {}

  launch(spec: RunLaunchSpec): RunProcess {
    mkdirSync(dirname(spec.logPath), { recursive: true })
    const fd = openSync(spec.logPath, 'a')
    try {
      const child = spawn(spec.executable, spec.args, { cwd: spec.cwd, detached: true, windowsHide: true, stdio: ['ignore', fd, fd] })
      if (child.pid === undefined) throw new Error('Runner did not return a process id.')
      const exited = new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
        child.once('error', reject)
        child.once('exit', (code, signal) => resolve({ code, signal }))
      })
      child.unref()
      return { pid: child.pid, exited }
    } finally {
      closeSync(fd)
    }
  }

  isAlive(pid: number): boolean {
    try { process.kill(pid, 0); return true } catch { return false }
  }

  async cancel(pid: number): Promise<void> {
    if (this.platform === 'win32') await command('taskkill.exe', ['/PID', String(pid), '/T', '/F'])
    else process.kill(pid, 'SIGTERM')
  }

  async pause(pid: number, context: ExecutionContextRecord): Promise<void> {
    if (context.kind !== 'local') throw new Error('Remote runs must be paused using their remote process id.')
    if (this.platform === 'win32') throw new Error('Pausing local Windows runs is not supported.')
    process.kill(pid, 'SIGSTOP')
  }

  async resume(pid: number, context: ExecutionContextRecord): Promise<void> {
    if (context.kind !== 'local') throw new Error('Remote runs must be resumed using their remote process id.')
    if (this.platform === 'win32') throw new Error('Resuming local Windows runs is not supported.')
    process.kill(pid, 'SIGCONT')
  }

  isRemoteAlive(context: ExecutionContextRecord, remotePid: string): Promise<boolean> {
    return remoteCommand(context, ['kill', '-0', remotePid]).then(() => true, () => false)
  }

  cancelRemote(context: ExecutionContextRecord, remotePid: string): Promise<void> { return remoteCommand(context, ['kill', '-TERM', remotePid]) }
  pauseRemote(context: ExecutionContextRecord, remotePid: string): Promise<void> { return remoteCommand(context, ['kill', '-STOP', remotePid]) }
  resumeRemote(context: ExecutionContextRecord, remotePid: string): Promise<void> { return remoteCommand(context, ['kill', '-CONT', remotePid]) }
}

export class RunManager {
  private readonly active = new Map<string, ActiveRun>()
  private readonly leaseOwner = randomUUID()
  private heartbeatTimer: NodeJS.Timeout | undefined

  constructor(
    private readonly store: ResearchStore,
    private readonly runsDirectory: string,
    private readonly adapter: RunProcessAdapter = new NodeRunProcessAdapter(),
    private readonly projector?: RunJobProjector,
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly heartbeatIntervalMs = 10_000,
    private readonly leaseDurationMs = 30_000,
  ) { mkdirSync(runsDirectory, { recursive: true }) }

  async recover(): Promise<RunRecord[]> {
    const recovered: RunRecord[] = []
    for (const project of this.store.listProjects()) {
      for (const run of this.store.listRuns(project.id).filter(item => ['submitted', 'running', 'paused', 'cancelling'].includes(item.status))) {
        const context = this.context(run.projectId, run.executionContextId)
        const localAlive = run.pid !== undefined && this.adapter.isAlive(run.pid)
        const remoteAlive = !localAlive && context !== undefined && context.kind !== 'local' && run.remotePid !== undefined
          ? await this.remoteAlive(context, run.remotePid)
          : false
        if (localAlive || remoteAlive) {
          const updated = this.renew(run, readRemotePid(run))
          this.attach(updated, localAlive ? run.pid : undefined)
          recovered.push(updated)
          this.project(updated)
          continue
        }
        const exitCode = readExitCode(run)
        const updated = this.store.updateRun(run.id, exitCode === 0
          ? { status: 'succeeded', progress: 1, leaseExpiresAt: new Date().toISOString() }
          : { status: 'failed', leaseExpiresAt: new Date().toISOString(), error: exitCode === undefined
              ? 'Run process was not alive when ZeroWall Science recovered the project.'
              : `Recovered run exited with code ${String(exitCode)}.` })
        if (updated.status === 'succeeded') this.harvest(updated.id)
        recovered.push(updated)
        this.project(updated)
      }
    }
    return recovered
  }

  dispose(): void {
    if (this.heartbeatTimer !== undefined) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = undefined
    for (const entry of this.active.values()) if (entry.timeout !== undefined) clearTimeout(entry.timeout)
    this.active.clear()
  }

  submit(input: RunSubmission): RunRecord {
    const context = this.context(input.projectId, input.executionContextId)
    const logPath = join(this.runsDirectory, `${randomUUID()}.log`)
    const timeoutAt = input.timeoutMs === undefined ? undefined : new Date(Date.now() + checkedTimeout(input.timeoutMs)).toISOString()
    const created = this.store.createRun({
      projectId: input.projectId, ...(context === undefined ? {} : { executionContextId: context.id }), name: input.name,
      command: input.command, workingDirectory: input.workingDirectory, status: 'submitted', progress: 0,
      ...(timeoutAt === undefined ? {} : { timeoutAt }), logUri: pathToFileUri(logPath), inputs: input.inputs ?? [], outputs: input.outputs ?? [],
    })
    try {
      const process = this.adapter.launch(launchSpec(context, input.command, input.workingDirectory, logPath, this.platform))
      const running = this.store.updateRun(created.id, {
        status: 'running', pid: process.pid, heartbeatAt: new Date().toISOString(), leaseOwner: this.leaseOwner,
        leaseExpiresAt: this.leaseExpiry(),
      })
      this.attach(running, process.pid)
      void process.exited.then(result => this.finish(created.id, result.code, result.signal)).catch(error => this.fail(created.id, error))
      this.project(running)
      return running
    } catch (error) {
      const failed = this.store.updateRun(created.id, { status: 'failed', error: error instanceof Error ? error.message : String(error) })
      this.project(failed)
      return failed
    }
  }

  get(runId: string): RunRecord { return this.requiredRun(runId) }
  list(projectId: string): RunRecord[] { return this.store.listRuns(projectId) }

  log(runId: string, maxBytes = 256 * 1024): string {
    const run = this.requiredRun(runId)
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 4 * 1024 * 1024) throw new Error('Run log limit must be between 1 byte and 4 MiB.')
    if (run.logUri === undefined) return ''
    const path = fileUriToPath(run.logUri)
    if (!existsSync(path)) return ''
    const data = readFileSync(path)
    return data.subarray(Math.max(0, data.length - maxBytes)).toString('utf8')
  }

  updateProgress(runId: string, progress: number): RunRecord {
    const run = this.requiredRun(runId)
    if (!['submitted', 'running', 'paused'].includes(run.status)) throw new Error(`Run progress cannot be updated from ${run.status}.`)
    const updated = this.store.updateRun(run.id, { progress })
    this.project(updated)
    return updated
  }

  declareOutputs(runId: string, outputs: RunRecord['outputs']): RunRecord {
    const run = this.requiredRun(runId)
    if (TERMINAL_STATUSES.has(run.status)) throw new Error(`Run outputs cannot be changed from ${run.status}.`)
    const updated = this.store.updateRun(run.id, { outputs })
    this.project(updated)
    return updated
  }

  async cancel(runId: string): Promise<RunRecord> {
    const run = this.requiredRun(runId)
    if (!['submitted', 'running', 'paused'].includes(run.status)) throw new Error(`Run cannot be cancelled from ${run.status}.`)
    const cancelling = this.store.updateRun(run.id, { status: 'cancelling' })
    this.project(cancelling)
    try {
      const context = this.requiredContext(run)
      if (context.kind !== 'local' && run.remotePid !== undefined) await this.cancelRemote(context, run.remotePid)
      if (run.pid !== undefined && this.adapter.isAlive(run.pid)) await this.adapter.cancel(run.pid)
      const cancelled = this.store.updateRun(run.id, { status: 'cancelled', leaseExpiresAt: new Date().toISOString() })
      this.detach(run.id)
      this.project(cancelled)
      return cancelled
    } catch (error) {
      const failed = this.store.updateRun(run.id, { status: 'failed', error: error instanceof Error ? error.message : String(error) })
      this.detach(run.id)
      this.project(failed)
      return failed
    }
  }

  async pause(runId: string): Promise<RunRecord> {
    const run = this.requiredRun(runId)
    if (run.status !== 'running') throw new Error('Only a running process can be paused.')
    const context = this.requiredContext(run)
    if (context.kind === 'local') {
      if (run.pid === undefined) throw new Error('Local run process id is unavailable.')
      await this.adapter.pause(run.pid, context)
    } else {
      if (run.remotePid === undefined) throw new Error('Remote process id has not been observed yet.')
      await this.pauseRemote(context, run.remotePid)
    }
    const updated = this.store.updateRun(run.id, { status: 'paused', heartbeatAt: new Date().toISOString() })
    this.project(updated)
    return updated
  }

  async resume(runId: string): Promise<RunRecord> {
    const run = this.requiredRun(runId)
    if (run.status !== 'paused') throw new Error('Only a paused process can be resumed.')
    const context = this.requiredContext(run)
    if (context.kind === 'local') {
      if (run.pid === undefined) throw new Error('Local run process id is unavailable.')
      await this.adapter.resume(run.pid, context)
    } else {
      if (run.remotePid === undefined) throw new Error('Remote process id has not been observed yet.')
      await this.resumeRemote(context, run.remotePid)
    }
    const updated = this.store.updateRun(run.id, { status: 'running', heartbeatAt: new Date().toISOString(), leaseExpiresAt: this.leaseExpiry() })
    this.project(updated)
    return updated
  }

  harvest(runId: string): RunRecord {
    const run = this.requiredRun(runId)
    for (const output of run.outputs) {
      const exists = !output.uri.startsWith('file:') || existsSync(fileUriToPath(output.uri))
      if (exists && !this.store.listArtifacts(run.projectId).some(item => item.runId === run.id && item.uri === output.uri)) {
        this.store.createArtifact({ projectId: run.projectId, runId: run.id, name: output.name, uri: output.uri, mediaType: output.mediaType ?? '' })
      }
    }
    return run
  }

  private attach(run: RunRecord, pid: number | undefined): void {
    const active: ActiveRun = { ...(pid === undefined ? {} : { pid }) }
    if (run.timeoutAt !== undefined) {
      const remaining = Date.parse(run.timeoutAt) - Date.now()
      active.timeout = setTimeout(() => { void this.timeout(run.id) }, Math.max(0, remaining))
      active.timeout.unref()
    }
    this.active.set(run.id, active)
    this.ensureHeartbeat()
  }

  private detach(runId: string): void {
    const active = this.active.get(runId)
    if (active?.timeout !== undefined) clearTimeout(active.timeout)
    this.active.delete(runId)
    if (this.active.size === 0 && this.heartbeatTimer !== undefined) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }
  }

  private ensureHeartbeat(): void {
    if (this.heartbeatTimer !== undefined || this.active.size === 0) return
    this.heartbeatTimer = setInterval(() => { void this.heartbeat() }, this.heartbeatIntervalMs)
    this.heartbeatTimer.unref()
  }

  private async heartbeat(): Promise<void> {
    for (const [runId, active] of [...this.active]) {
      const run = this.requiredRun(runId)
      if (TERMINAL_STATUSES.has(run.status)) { this.detach(runId); continue }
      const context = this.context(run.projectId, run.executionContextId)
      const remotePid = run.remotePid ?? readRemotePid(run)
      const localAlive = active.pid !== undefined && this.adapter.isAlive(active.pid)
      const remoteAlive = !localAlive && context !== undefined && context.kind !== 'local' && remotePid !== undefined
        ? await this.remoteAlive(context, remotePid)
        : false
      if (!localAlive && !remoteAlive) {
        const exitCode = readExitCode(run)
        if (exitCode !== undefined) await this.finishRecovered(run, exitCode)
        else this.fail(run.id, new Error('Run process stopped without a persisted exit code.'))
        continue
      }
      const updated = this.renew(run, remotePid)
      this.project(updated)
    }
  }

  private renew(run: RunRecord, remotePid?: string): RunRecord {
    return this.store.renewRunLease(run.id, {
      leaseOwner: this.leaseOwner,
      heartbeatAt: new Date().toISOString(),
      leaseExpiresAt: this.leaseExpiry(),
      ...(remotePid === undefined ? {} : { remotePid }),
    })
  }

  private async finish(runId: string, code: number | null, signal: string | null): Promise<void> {
    if (!this.active.has(runId)) return
    this.detach(runId)
    const current = this.requiredRun(runId)
    if (TERMINAL_STATUSES.has(current.status)) return
    const status = code === 0 ? 'succeeded' : 'failed'
    const updated = this.store.updateRun(runId, {
      status, progress: code === 0 ? 1 : current.progress, leaseExpiresAt: new Date().toISOString(),
      ...(code === 0 ? {} : { error: `Process exited with ${signal ?? `code ${String(code)}`}.` }),
    })
    if (status === 'succeeded') this.harvest(runId)
    this.project(updated)
  }

  private async finishRecovered(run: RunRecord, exitCode: number): Promise<void> {
    this.detach(run.id)
    const updated = this.store.updateRun(run.id, exitCode === 0
      ? { status: 'succeeded', progress: 1, leaseExpiresAt: new Date().toISOString() }
      : { status: 'failed', leaseExpiresAt: new Date().toISOString(), error: `Recovered run exited with code ${String(exitCode)}.` })
    if (updated.status === 'succeeded') this.harvest(updated.id)
    this.project(updated)
  }

  private async timeout(runId: string): Promise<void> {
    const run = this.requiredRun(runId)
    if (!['submitted', 'running', 'paused'].includes(run.status)) return
    const context = this.requiredContext(run)
    if (context.kind !== 'local' && run.remotePid !== undefined) await this.cancelRemote(context, run.remotePid).catch(() => undefined)
    if (run.pid !== undefined && this.adapter.isAlive(run.pid)) await this.adapter.cancel(run.pid).catch(() => undefined)
    const updated = this.store.updateRun(run.id, { status: 'timed_out', error: 'Run exceeded its configured timeout.', leaseExpiresAt: new Date().toISOString() })
    this.detach(runId)
    this.project(updated)
  }

  private fail(runId: string, error: unknown): void {
    const run = this.requiredRun(runId)
    if (TERMINAL_STATUSES.has(run.status)) return
    const updated = this.store.updateRun(run.id, { status: 'failed', error: error instanceof Error ? error.message : String(error), leaseExpiresAt: new Date().toISOString() })
    this.detach(runId)
    this.project(updated)
  }

  private context(projectId: string, id: string | undefined): ExecutionContextRecord | undefined {
    if (id === undefined) return undefined
    const context = this.store.getExecutionContext(id)
    if (context === undefined || context.projectId !== projectId) throw new Error(`Execution context was not found: ${id}`)
    return context
  }

  private requiredContext(run: RunRecord): ExecutionContextRecord {
    return this.context(run.projectId, run.executionContextId) ?? { id: 'local', projectId: run.projectId, name: 'Local', kind: 'local', config: {}, version: 1, createdAt: run.createdAt, updatedAt: run.updatedAt }
  }

  private requiredRun(id: string): RunRecord { const run = this.store.getRun(id); if (run === undefined) throw new Error(`Run was not found: ${id}`); return run }
  private project(run: RunRecord): void { this.projector?.update(run) }
  private leaseExpiry(): string { return new Date(Date.now() + this.leaseDurationMs).toISOString() }
  private remoteAlive(context: ExecutionContextRecord, remotePid: string): Promise<boolean> { return this.adapter.isRemoteAlive?.(context, remotePid) ?? Promise.resolve(false) }
  private cancelRemote(context: ExecutionContextRecord, remotePid: string): Promise<void> { return this.adapter.cancelRemote?.(context, remotePid) ?? remoteCommand(context, ['kill', '-TERM', remotePid]) }
  private pauseRemote(context: ExecutionContextRecord, remotePid: string): Promise<void> { return this.adapter.pauseRemote?.(context, remotePid) ?? remoteCommand(context, ['kill', '-STOP', remotePid]) }
  private resumeRemote(context: ExecutionContextRecord, remotePid: string): Promise<void> { return this.adapter.resumeRemote?.(context, remotePid) ?? remoteCommand(context, ['kill', '-CONT', remotePid]) }
}

export function launchSpec(context: ExecutionContextRecord | undefined, commandText: string, cwd: string, logPath: string, platform: NodeJS.Platform): RunLaunchSpec {
  if (context?.kind === 'wsl') {
    return { executable: 'wsl.exe', args: ['-d', String(context.config.distro), '--', 'sh', '-lc', remoteWrapper(commandText, cwd)], logPath }
  }
  if (context?.kind === 'ssh') {
    const args = sshPrefix(context)
    args.push(sshTarget(context), 'sh', '-lc', remoteWrapper(commandText, cwd))
    return { executable: 'ssh', args, logPath }
  }
  if (platform === 'win32') {
    const wrapped = `& { ${commandText} }; $zwCode = $LASTEXITCODE; if ($null -eq $zwCode) { $zwCode = 0 }; Write-Output "${EXIT_CODE_MARKER}$zwCode"; exit $zwCode`
    return { executable: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', wrapped], ...(cwd ? { cwd } : {}), logPath }
  }
  return { executable: '/bin/sh', args: ['-lc', localPosixWrapper(commandText)], ...(cwd ? { cwd } : {}), logPath }
}

function remoteWrapper(commandText: string, cwd: string): string {
  const changeDirectory = cwd === '' ? '' : `cd ${posixQuote(cwd)} || exit $?; `
  return `${changeDirectory}sh -lc ${posixQuote(commandText)} & zw_pid=$!; printf '${REMOTE_PID_MARKER}%s\\n' "$zw_pid"; wait "$zw_pid"; zw_code=$?; printf '${EXIT_CODE_MARKER}%s\\n' "$zw_code"; exit "$zw_code"`
}

function localPosixWrapper(commandText: string): string {
  return `sh -lc ${posixQuote(commandText)}; zw_code=$?; printf '${EXIT_CODE_MARKER}%s\\n' "$zw_code"; exit "$zw_code"`
}

function readRemotePid(run: RunRecord): string | undefined { return readMarker(run, REMOTE_PID_MARKER) }
function readExitCode(run: RunRecord): number | undefined {
  const value = readMarker(run, EXIT_CODE_MARKER)
  if (value === undefined || !/^\d+$/.test(value)) return undefined
  return Number(value)
}

function readMarker(run: RunRecord, marker: string): string | undefined {
  if (run.logUri === undefined) return undefined
  const path = fileUriToPath(run.logUri)
  if (!existsSync(path)) return undefined
  const tail = readFileSync(path).subarray(-64 * 1024).toString('utf8')
  const values = [...tail.matchAll(new RegExp(`${marker}([^\\r\\n]+)`, 'g'))]
  return values.at(-1)?.[1]?.trim()
}

function checkedTimeout(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 30 * 24 * 60 * 60_000) throw new Error('Run timeout must be between 1 ms and 30 days.')
  return value
}

function pathToFileUri(path: string): string { return `file:///${path.replaceAll('\\', '/').replace(/^\//, '')}` }
function fileUriToPath(uri: string): string { return decodeURIComponent(new URL(uri).pathname).replace(/^\/([A-Za-z]:)/, '$1') }
function posixQuote(value: string): string { return `'${value.replaceAll("'", `'\\''`)}'` }

async function command(executable: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${executable} exited with ${String(code)}.`)))
  })
}

function sshPrefix(context: ExecutionContextRecord): string[] {
  const args = ['-o', 'BatchMode=yes']
  if (typeof context.config.port === 'number') args.push('-p', String(context.config.port))
  if (typeof context.config.privateKeyPath === 'string') args.push('-i', context.config.privateKeyPath)
  return args
}

function sshTarget(context: ExecutionContextRecord): string {
  return `${typeof context.config.user === 'string' && context.config.user ? `${context.config.user}@` : ''}${String(context.config.host)}`
}

function remoteCommand(context: ExecutionContextRecord, remoteArgs: string[]): Promise<void> {
  if (context.kind === 'wsl') return command('wsl.exe', ['-d', String(context.config.distro), '--', ...remoteArgs])
  if (context.kind === 'ssh') return command('ssh', [...sshPrefix(context), sshTarget(context), ...remoteArgs])
  return Promise.reject(new Error('Remote command requires an SSH or WSL execution context.'))
}
