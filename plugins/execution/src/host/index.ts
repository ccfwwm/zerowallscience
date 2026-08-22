import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { spawn } from 'node:child_process'
import { ResearchStore } from '@zerowallscience/research-store'
import type { CreateExecutionContextInput, ExecutionContextRecord, UpdateExecutionContextInput } from '@zerowallscience/research-store/types'
import type {} from 'zod'

export interface ExecutionCapabilities { platform: NodeJS.Platform; local: true; wsl: boolean; ssh: true }
export interface ExecutionProbe { ok: boolean; contextId?: string; platform: string; message: string; details: Record<string, string> }
export interface ExecutionCommandRequest { projectId: string; contextId?: string; command: string; workingDirectory?: string; timeoutMs?: number }
export interface ExecutionCommandResult { contextId?: string; exitCode: number | null; signal: string | null; stdout: string; stderr: string; durationMs: number; timedOut: boolean }

declare module '@deepseek-ai/cordis' { interface Context { zerowallExecution: ZeroWallExecutionService } }

export class ZeroWallExecutionService extends TypertRemoteService {
  private readonly store: ResearchStore
  constructor(ctx: Context) {
    super(ctx, 'zerowallExecution')
    const path = process.env.ZEROWALL_RESEARCH_DB?.trim()
    if (!path) throw new Error('ZEROWALL_RESEARCH_DB is required.')
    this.store = new ResearchStore(path)
    ctx.effect(() => () => this.store.close(), 'zerowall-execution: close research store')
  }

  @Remote('capabilities') capabilities(): ExecutionCapabilities { return { platform: process.platform, local: true, wsl: process.platform === 'win32', ssh: true } }
  @Remote('list') list(projectId: string): ExecutionContextRecord[] { return this.store.listExecutionContexts(projectId) }
  @Remote('get') get(id: string): ExecutionContextRecord {
    const context = this.store.getExecutionContext(id)
    if (context === undefined) throw new Error(`Execution context was not found: ${id}`)
    return context
  }
  @Remote('create') create(input: CreateExecutionContextInput): ExecutionContextRecord {
    if (input.kind === 'wsl' && process.platform !== 'win32') throw new Error('WSL execution contexts are available only on Windows.')
    return this.store.createExecutionContext(input)
  }
  @Remote('update') update(input: { id: string; changes: UpdateExecutionContextInput }): ExecutionContextRecord {
    if (input.changes.kind === 'wsl' && process.platform !== 'win32') throw new Error('WSL execution contexts are available only on Windows.')
    return this.store.updateExecutionContext(input.id, input.changes)
  }
  @Remote('deleteConnection') deleteConnection(id: string): void { this.store.deleteExecutionContext(id) }
  @Remote('probe') async probe(input: { projectId: string; contextId?: string }): Promise<ExecutionProbe> {
    const context = input.contextId === undefined ? undefined : this.store.listExecutionContexts(input.projectId).find(item => item.id === input.contextId)
    if (input.contextId !== undefined && context === undefined) throw new Error(`Execution context was not found: ${input.contextId}`)
    try {
      const result = await probeCommand(context)
      return { ok: true, ...(context === undefined ? {} : { contextId: context.id }), platform: context?.kind ?? 'local', message: 'Connection verified.', details: result }
    } catch (error) {
      return { ok: false, ...(context === undefined ? {} : { contextId: context.id }), platform: context?.kind ?? 'local', message: error instanceof Error ? error.message : String(error), details: {} }
    }
  }
  @Remote('command') async command(input: ExecutionCommandRequest): Promise<ExecutionCommandResult> {
    const context = input.contextId === undefined ? undefined : this.store.getExecutionContext(input.contextId)
    if (context !== undefined && context.projectId !== input.projectId) throw new Error('Execution context does not belong to the project.')
    if (input.contextId !== undefined && context === undefined) throw new Error(`Execution context was not found: ${input.contextId}`)
    const commandText = input.command.trim()
    if (commandText === '') throw new Error('Execution command is required.')
    const timeoutMs = input.timeoutMs ?? 30_000
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10 * 60_000) throw new Error('Execution command timeout must be between 100 ms and 10 minutes.')
    return await executeCommand(context, commandText, input.workingDirectory?.trim() ?? '', timeoutMs)
  }
}

async function probeCommand(context: ExecutionContextRecord | undefined): Promise<Record<string, string>> {
  if (context?.kind === 'wsl') return await capture('wsl.exe', ['-d', String(context.config.distro), '--', 'sh', '-lc', 'printf ZEROWALL_WSL_OK'])
  if (context?.kind === 'ssh') {
    const args = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10']
    if (typeof context.config.port === 'number') args.push('-p', String(context.config.port))
    if (typeof context.config.privateKeyPath === 'string') args.push('-i', context.config.privateKeyPath)
    const target = `${typeof context.config.user === 'string' && context.config.user ? `${context.config.user}@` : ''}${String(context.config.host)}`
    args.push(target, 'printf ZEROWALL_SSH_OK')
    return await capture('ssh', args)
  }
  return { runtime: process.version, platform: process.platform, arch: process.arch }
}

async function capture(executable: string, args: string[]): Promise<Record<string, string>> {
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('Execution context probe timed out.')) }, 15_000)
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve({ stdout: stdout.trim() }) : reject(new Error(stderr.trim() || `Probe exited with ${String(code)}.`)) })
  })
}

export function executionCommandSpec(context: ExecutionContextRecord | undefined, commandText: string, cwd: string, platform: NodeJS.Platform = process.platform): { executable: string; args: string[]; cwd?: string } {
  if (context?.kind === 'wsl') {
    const script = cwd === '' ? commandText : `cd ${posixQuote(cwd)} && ${commandText}`
    return { executable: 'wsl.exe', args: ['-d', String(context.config.distro), '--', 'sh', '-lc', script] }
  }
  if (context?.kind === 'ssh') {
    const args = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10']
    if (typeof context.config.port === 'number') args.push('-p', String(context.config.port))
    if (typeof context.config.privateKeyPath === 'string') args.push('-i', context.config.privateKeyPath)
    const target = `${typeof context.config.user === 'string' && context.config.user ? `${context.config.user}@` : ''}${String(context.config.host)}`
    const script = cwd === '' ? commandText : `cd ${posixQuote(cwd)} && ${commandText}`
    args.push(target, 'sh', '-lc', script)
    return { executable: 'ssh', args }
  }
  return platform === 'win32'
    ? { executable: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', commandText], ...(cwd === '' ? {} : { cwd }) }
    : { executable: '/bin/sh', args: ['-lc', commandText], ...(cwd === '' ? {} : { cwd }) }
}

async function executeCommand(context: ExecutionContextRecord | undefined, commandText: string, cwd: string, timeoutMs: number): Promise<ExecutionCommandResult> {
  const spec = executionCommandSpec(context, commandText, cwd)
  const startedAt = Date.now()
  return await new Promise((resolve, reject) => {
    const child = spawn(spec.executable, spec.args, { cwd: spec.cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''; let timedOut = false
    const append = (current: string, chunk: unknown) => `${current}${String(chunk)}`.slice(-1024 * 1024)
    const timer = setTimeout(() => { timedOut = true; child.kill() }, timeoutMs)
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk) })
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk) })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', (exitCode, signal) => {
      clearTimeout(timer)
      resolve({ ...(context === undefined ? {} : { contextId: context.id }), exitCode, signal, stdout, stderr, durationMs: Date.now() - startedAt, timedOut })
    })
  })
}

function posixQuote(value: string): string { return `'${value.replaceAll("'", `'\\''`)}'` }

export function apply(ctx: Context): void {
  ctx.plugin(ZeroWallExecutionService)
}

export default { apply }
