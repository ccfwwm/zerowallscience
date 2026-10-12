import { resolveFixedPythonRuntime } from '../shared/runtime-path.js'
import { acquireRuntimeLease } from '../shared/runtime-leases.js'
import { createPythonResult, readPythonResult } from './result-store.js'
import { finished } from 'node:stream/promises'
import { randomUUID } from 'node:crypto'
import { registerEnvironmentTool } from './environment-tool.js'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { statSync } from 'node:fs'
import { access, lstat, readFile, mkdir, writeFile, rm, realpath } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { Service, type Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'zerowall-python'
export const inject = ['tools']

export interface PythonArgs { code: string; description: string; timeoutMs?: number; workdir?: string }
export interface PythonResult { exitCode: number; timedOut: boolean; stdout: string; stderr: string; python: string; cancelled?: boolean; result_id?: string }
type PythonExecution = { signal: AbortSignal; agent?: { session: { header: { cwd?: string } } } }
declare module '@deepseek-ai/cordis' { interface Context { zerowallPython: ZeroWallPythonService } }
export class ZeroWallPythonService extends Service {
  constructor(ctx: Context) { super(ctx, 'zerowallPython') }
  resolve() { return resolveFixedPythonRuntime() }
  run(args: PythonArgs, exec: PythonExecution) { return runPython(args, exec) }
  lease(root: string) { return acquireRuntimeLease(root) }
}
interface RArgs { code: string; description: string; timeoutMs?: number; workdir?: string }
interface RResult { exitCode: number; timedOut: boolean; stdout: string; stderr: string; rscript: string }
interface CurrentRecord { root?: unknown; health?: unknown; manifest?: Manifest; runtimeRoot?: string; runtimeExecutable?: string; runtimeSitePackages?: string; runtimeLayout?: { relativeExecutable?: unknown; relativeSitePackages?: unknown }; generation?: boolean }
interface Manifest {
  version?: unknown
  python?: { version?: unknown; relativeExecutable?: unknown; relativeSitePackages?: unknown }
}

const MAX_OUTPUT = 1024 * 1024
const DEFAULT_TIMEOUT = 30_000
const MAX_TIMEOUT = 10 * 60_000
const R_DEFAULT_TIMEOUT = 60_000

function environmentRoot(): string | undefined {
  const value = process.env.ZEROWALL_PYTHON_MANAGEMENT_ROOT?.trim() ?? process.env.ZEROWALL_PYTHON_ROOT?.trim() ?? process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT?.trim()
  return value === undefined || value === '' ? undefined : resolve(value)
}

export async function resolveManagedPython(): Promise<{ executable: string; root: string; sitePackages: string; snapshotRoot: string }> {
  return resolveFixedPythonRuntime()
}

function bounded(value: string): string { return value.length <= MAX_OUTPUT ? value : value.slice(-MAX_OUTPUT) }

export function pythonChildEnvironment(sitePackages: string): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of ['PYTHONHOME', 'PYTHONPATH', 'VIRTUAL_ENV', 'CONDA_PREFIX']) delete env[key]
  env.PYTHONNOUSERSITE = '1'; env.PYTHONIOENCODING = 'utf-8'; env.PYTHONUTF8 = '1'
  const ca = join(sitePackages, 'certifi', 'cacert.pem')
  const validFile = (path: string): boolean => { try { return statSync(path).isFile() } catch { return false } }
  for (const key of ['SSL_CERT_FILE', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE', 'PIP_CERT']) {
    let path = env[key]?.trim().replace(/^['"]|['"]$/gu, '')
    if (path && /^[A-Za-z]:\\/u.test(path)) path = path.replaceAll('\\\\', '\\')
    if (validFile(ca)) env[key] = ca
    else if (path && validFile(path)) env[key] = path
    else delete env[key]
  }
  return env
}

async function runPython(args: PythonArgs, exec: { signal: AbortSignal; agent?: { session: { header: { cwd?: string } } } }): Promise<PythonResult> {
  const resolved = await resolveManagedPython()
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > MAX_TIMEOUT) throw new Error(`Invalid timeoutMs: expected 100-${MAX_TIMEOUT}.`)
  const sessionCwd = exec.agent?.session.header.cwd
  const workspaceRoot = resolve(sessionCwd ?? resolved.root)
  const workdir = args.workdir === undefined || args.workdir.trim() === ''
    ? workspaceRoot
    : resolve(workspaceRoot, args.workdir)
  const workdirRelative = relative(workspaceRoot, workdir)
  if (workdirRelative === '..' || workdirRelative.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(workdirRelative)) {
    throw new Error('Python workdir must remain inside the current session workspace.')
  }
  const physicalRelative = relative(await realpath(workspaceRoot), await realpath(workdir))
  if (physicalRelative === '..' || physicalRelative.startsWith('..\\') || physicalRelative.startsWith('../') || isAbsolute(physicalRelative)) throw new Error('Python workdir resolves outside the current session workspace.')
  const releaseLease = await acquireRuntimeLease(resolved.root)
  const controller = new AbortController()
  const abort = () => controller.abort()
  exec.signal.addEventListener('abort', abort, { once: true })
  try {
    exec.signal.throwIfAborted()
    const stored = sessionCwd ? await createPythonResult(sessionCwd) : undefined
    return await new Promise<PythonResult>((resolveResult, reject) => {
    const bootstrap = `import sys\nif ${JSON.stringify(resolved.sitePackages)} not in sys.path: sys.path.insert(0, ${JSON.stringify(resolved.sitePackages)})\n${args.code}`
    const child = spawn(resolved.executable, ['-I', '-B', '-X', 'utf8', '-c', bootstrap], {
      cwd: workdir,
      windowsHide: true,
      env: { ...pythonChildEnvironment(resolved.sitePackages), ZEROWALL_NODE: process.execPath, ZEROWALL_INTEGRITY_WORKER: createRequire(import.meta.url).resolve('@zerowallscience/integrity-runtime/worker').replace(/app\.asar([\\/])/u, 'app.asar.unpacked$1'), PYTHONNOUSERSITE: '1', PYTHONPATH: resolved.sitePackages },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''; let stderr = ''; let timedOut = false; let settled = false; let spawnFailure: Error | undefined
    const finish = (fn: () => void) => { if (settled) return; settled = true; clearTimeout(timer); exec.signal.removeEventListener('abort', abort); fn() }
    const kill = () => { if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else child.kill() }
    const flushed = stored ? Promise.all([finished(child.stdout.pipe(stored.stdout)), finished(child.stderr.pipe(stored.stderr))]) : Promise.resolve()
    void flushed.catch(error => { kill(); finish(() => reject(error)) })
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs)
    controller.signal.addEventListener('abort', kill, { once: true })
    child.stdout.on('data', chunk => { stdout = bounded(stdout + String(chunk)) })
    child.stderr.on('data', chunk => { stderr = bounded(stderr + String(chunk)) })
    child.once('error', error => {
      spawnFailure = error
      // Failed spawn has no producer to end the two result streams.
      stored?.stdout.end(); stored?.stderr.end()
    })
    child.once('close', (exitCode) => { void flushed.then(async () => {
      const metadata = { exitCode: exitCode ?? -1, timedOut, python: resolved.executable, cancelled: exec.signal.aborted, ...(spawnFailure ? { error: spawnFailure.message } : {}) }
      await stored?.complete(metadata)
      exec.signal.throwIfAborted()
      if (spawnFailure) throw spawnFailure
      finish(() => resolveResult({ ...metadata, stdout, stderr, ...(stored ? { result_id: stored.id } : {}) }))
    }).catch(error => finish(() => reject(error))) })
    if (exec.signal.aborted) kill()
  })
  } finally { await releaseLease() }
}

function resolveRscript(): string {
  const configured = process.env.ZEROWALL_RSCRIPT?.trim()
  return configured === undefined || configured === '' ? 'Rscript' : configured
}

async function runR(args: RArgs, exec: { signal: AbortSignal; agent?: { session: { header: { cwd?: string } } } }): Promise<RResult> {
  const timeoutMs = args.timeoutMs ?? R_DEFAULT_TIMEOUT
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > MAX_TIMEOUT) throw new Error(`Invalid timeoutMs: expected 100-${MAX_TIMEOUT}.`)
  const sessionCwd = exec.agent?.session.header.cwd
  if (!sessionCwd) throw new Error('R workdir requires an active session workspace.')
  const workspaceRoot = resolve(sessionCwd)
  const workdir = args.workdir === undefined || args.workdir.trim() === '' ? workspaceRoot : resolve(workspaceRoot, args.workdir)
  const workdirRelative = relative(workspaceRoot, workdir)
  if (workdirRelative === '..' || workdirRelative.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(workdirRelative)) throw new Error('R workdir must remain inside the current session workspace.')
  const controller = new AbortController()
  const abort = () => controller.abort()
  exec.signal.addEventListener('abort', abort, { once: true })
  const rscript = resolveRscript()
  return await new Promise<RResult>((resolveResult, reject) => {
    const child = spawn(rscript, ['--vanilla', '-e', args.code], { cwd: workdir, windowsHide: true, env: { ...process.env, R_DEFAULT_PACKAGES: 'datasets,utils,grDevices,graphics,stats,methods,base' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''; let timedOut = false; let settled = false
    const finish = (fn: () => void) => { if (settled) return; settled = true; clearTimeout(timer); exec.signal.removeEventListener('abort', abort); fn() }
    const timer = setTimeout(() => { timedOut = true; child.kill() }, timeoutMs)
    controller.signal.addEventListener('abort', () => { child.kill() }, { once: true })
    child.stdout.on('data', chunk => { stdout = bounded(stdout + String(chunk)) })
    child.stderr.on('data', chunk => { stderr = bounded(stderr + String(chunk)) })
    child.once('error', error => finish(() => reject(error)))
    child.once('exit', (exitCode, signal) => finish(() => resolveResult({ exitCode: exitCode ?? -1, timedOut, stdout, stderr, rscript })))
  })
}

export function apply(ctx: Context): void {
  const python = new ZeroWallPythonService(ctx)
  registerEnvironmentTool(ctx)
  ctx.tools.register(defineTool({
    name: 'python',
    description: 'Execute Python in the signed ZeroWall Python runtime (科研默认环境，含科学计算、文献、Office 和生物信息学依赖). Uses the current session workspace unless workdir is explicitly needed.',
    parameters: {
      code: { type: 'string', required: true, description: 'Python source code to execute.' },
      description: { type: 'string', required: true, description: 'Short explanation of the computation.' },
      timeoutMs: { type: 'integer', description: 'Execution timeout in milliseconds, from 100 to 600000.' },
      workdir: { type: 'string', description: 'Optional relative path inside the session workspace.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          exitCode: { type: 'integer', required: true }, timedOut: { type: 'boolean', required: true },
          stdout: { type: 'string', required: true }, stderr: { type: 'string', required: true }, python: { type: 'string', required: true },
          result_id: { type: 'string' }, truncated: { type: 'boolean' }, cancelled: { type: 'boolean' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `Python exit=${String(value.exitCode)}${value.timedOut ? ' (timed out)' : ''}\nstdout:\n${value.stdout}\nstderr:\n${value.stderr}${value.result_id ? `\nFull result: python_result result_id=${value.result_id}` : ''}` }],
    },
    async execute(args, exec) {
      const input = args as PythonArgs
      if (input.code.trim() === '' || input.description.trim() === '') throw new Error('Python code and description are required.')
      const result = await python.run(input, exec)
      const workspace = exec.agent?.session.header.cwd
      const first = workspace && result.result_id ? await readPythonResult(workspace, result.result_id, 'stdout', 0, 4000) : undefined
      return { ...result, stdout: first?.text ?? result.stdout.slice(0, 4000), stderr: result.stderr.slice(-4000), truncated: (first ? first.total > 4000 : result.stdout.length > 4000) || result.stderr.length > 4000 }
    },
  }))
  ctx.tools.register(defineTool({
    name: 'python_result', description: 'Read a UTF-8 page of a completed Python result without executing it again. Offsets and totals are bytes; use next_offset for the next page.',
    parameters: { result_id: { type: 'string', required: true }, offset: { type: 'integer' }, limit: { type: 'integer' }, stream: { type: 'string', enum: ['stdout', 'stderr'] } },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      const workspace = exec.agent?.session.header.cwd
      if (!workspace || !/^[a-f0-9-]{36}$/u.test(args.result_id)) throw new Error('Invalid Python result reference.')
      return readPythonResult(workspace, args.result_id, args.stream ?? 'stdout', args.offset ?? 0, args.limit ?? 4000)
    },
  }))
  ctx.tools.register(defineTool({
    name: 'r',
    description: 'Execute short R code in the configured ZeroWall R environment. Use for package probes and small analysis steps; use a managed Run or SSH context for long single-cell jobs. The current session workspace is the only allowed working directory.',
    parameters: {
      code: { type: 'string', required: true, description: 'R source code to execute.' },
      description: { type: 'string', required: true, description: 'Short explanation of the computation.' },
      timeoutMs: { type: 'integer', description: 'Execution timeout in milliseconds, from 100 to 600000.' },
      workdir: { type: 'string', description: 'Optional relative path inside the session workspace.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          exitCode: { type: 'integer', required: true }, timedOut: { type: 'boolean', required: true },
          stdout: { type: 'string', required: true }, stderr: { type: 'string', required: true }, rscript: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `R exit=${String(value.exitCode)}${value.timedOut ? ' (timed out)' : ''}\nstdout:\n${value.stdout}\nstderr:\n${value.stderr}` }],
    },
    async execute(args, exec) {
      const input = args as RArgs
      if (input.code.trim() === '' || input.description.trim() === '') throw new Error('R code and description are required.')
      return await runR(input, exec)
    },
  }))
}

export default { name, inject, apply }
