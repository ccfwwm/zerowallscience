import { randomUUID } from 'node:crypto'
import { registerEnvironmentTool } from './environment-tool.js'
import { registerBioLocal } from './bio-local.js'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { statSync } from 'node:fs'
import { access, lstat, readFile, mkdir, writeFile, rm } from 'node:fs/promises'
import { delimiter, isAbsolute, join, relative, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'zerowall-python'
export const inject = ['tools']

interface PythonArgs { code: string; description: string; timeoutMs?: number; workdir?: string }
interface PythonResult { exitCode: number; timedOut: boolean; stdout: string; stderr: string; python: string }
interface RArgs { code: string; description: string; timeoutMs?: number; workdir?: string }
interface RResult { exitCode: number; timedOut: boolean; stdout: string; stderr: string; rscript: string }
interface CurrentRecord { overlayPath?: string; root?: unknown; health?: unknown; manifest?: Manifest; runtimeRoot?: string; runtimeExecutable?: string; runtimeSitePackages?: string }
interface Manifest {
  version?: unknown
  python?: { version?: unknown; relativeExecutable?: unknown; relativeSitePackages?: unknown }
}

const MAX_OUTPUT = 1024 * 1024
const DEFAULT_TIMEOUT = 30_000
const MAX_TIMEOUT = 10 * 60_000
const R_DEFAULT_TIMEOUT = 60_000

function environmentRoot(): string | undefined {
  const value = process.env.ZEROWALL_PYTHON_ROOT?.trim() ?? process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT?.trim()
  return value === undefined || value === '' ? undefined : resolve(value)
}

export async function resolveManagedPython(): Promise<{ executable: string; root: string; sitePackages: string; overlayPath: string }> {
  const root = environmentRoot()
  if (root === undefined) throw new Error('PYTHON_ENVIRONMENT_UNAVAILABLE: ZeroWall Python root is not configured.')
  let current: CurrentRecord
  try {
    current = JSON.parse(await readFile(join(root, 'current.json'), 'utf8')) as CurrentRecord
  } catch {
    throw new Error('PYTHON_ENVIRONMENT_UNAVAILABLE: ZeroWall Python is not installed or current.json is unreadable.')
  }
  if (current.health !== 'ready' || typeof current.root !== 'string' || current.root.trim() === '') {
    throw new Error('PYTHON_ENVIRONMENT_UNAVAILABLE: ZeroWall Python is not healthy. Retry initialization.')
  }
  // Pin each task and its lease to the immutable snapshot. The public Python
  // junction is for discovery; updates must not redirect a running task.
  const installRoot = resolve(current.root)
  const manifest = current.manifest ?? JSON.parse(await readFile(join(installRoot, 'manifest.json'), 'utf8')) as Manifest
  const relativeExecutable = manifest.python?.relativeExecutable
  const relativeSitePackages = manifest.python?.relativeSitePackages
  if (typeof relativeExecutable !== 'string' || relativeExecutable.trim() === '' || isAbsolute(relativeExecutable)
    || typeof relativeSitePackages !== 'string' || relativeSitePackages.trim() === '' || isAbsolute(relativeSitePackages)) {
    throw new Error('PYTHON_ENVIRONMENT_UNAVAILABLE: ZeroWall Python manifest does not contain a safe executable.')
  }
  const executable = resolve(installRoot, relativeExecutable)
  const sitePackages = resolve(installRoot, relativeSitePackages)
  const runtime = typeof manifest.python?.version === 'string' ? manifest.python.version.match(/^\d+\.\d+/u)?.[0] ?? '3.12' : '3.12'
  const overlayPath = relativeSitePackages === 'Python/Lib/site-packages' ? sitePackages : current.overlayPath ?? resolve(root, 'python-overlay', `python-${runtime.replace(/[^A-Za-z0-9.-]/gu, '-')}`)
  const isContained = (candidate: string): boolean => {
    const containment = relative(installRoot, candidate)
    return containment !== '..' && !containment.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(containment)
  }
  if (!isContained(executable) || !isContained(sitePackages)) {
    throw new Error('PYTHON_ENVIRONMENT_UNAVAILABLE: Python executable escapes the managed environment.')
  }
  const info = await lstat(executable).catch(() => undefined)
  if (info === undefined || !info.isFile() || info.isSymbolicLink()) {
    throw new Error('PYTHON_ENVIRONMENT_UNAVAILABLE: ZeroWall Python executable is missing.')
  }
  const siteInfo = await lstat(sitePackages).catch(() => undefined)
  if (siteInfo === undefined || !siteInfo.isDirectory() || siteInfo.isSymbolicLink()) {
    throw new Error('PYTHON_ENVIRONMENT_UNAVAILABLE: ZeroWall Python site-packages is missing.')
  }
  return { executable, root: installRoot, sitePackages, overlayPath }
}

function bounded(value: string): string { return value.length <= MAX_OUTPUT ? value : value.slice(-MAX_OUTPUT) }

export function pythonChildEnvironment(sitePackages: string): NodeJS.ProcessEnv {
  const env = { ...process.env }
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
  const leaseDirectory = join(environmentRoot()!, 'leases')
  await mkdir(leaseDirectory, { recursive: true })
  const lease = join(leaseDirectory, `${process.pid}-${randomUUID()}.json`)
  await writeFile(lease, JSON.stringify({ pid: process.pid, snapshot: resolved.root, kind: 'python', createdAt: new Date().toISOString() }))
  const controller = new AbortController()
  const abort = () => controller.abort()
  exec.signal.addEventListener('abort', abort, { once: true })
  try { return await new Promise<PythonResult>((resolveResult, reject) => {
    // Old embeddable installations ignore PYTHONPATH; retain their import
    // bridge until migration. Shared layouts have just one package directory.
    const bootstrap = `import sys\nsys.path[:0] = ${JSON.stringify([...new Set([resolved.overlayPath, resolved.sitePackages])])}\n${args.code}`
    const child = spawn(resolved.executable, ['-c', bootstrap], {
      cwd: workdir,
      windowsHide: true,
      env: { ...pythonChildEnvironment(resolved.sitePackages), ZEROWALL_PYTHON_OVERLAY: resolved.overlayPath, ZEROWALL_NODE: process.execPath, ZEROWALL_INTEGRITY_WORKER: createRequire(import.meta.url).resolve('@zerowallscience/integrity-runtime/worker').replace(/app\.asar([\\/])/u, 'app.asar.unpacked$1'), PYTHONNOUSERSITE: '1', PYTHONPATH: [...new Set([resolved.overlayPath, resolved.sitePackages])].join(delimiter) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''; let stderr = ''; let timedOut = false; let settled = false
    const finish = (fn: () => void) => { if (settled) return; settled = true; clearTimeout(timer); exec.signal.removeEventListener('abort', abort); fn() }
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs)
    controller.signal.addEventListener('abort', () => { child.kill() }, { once: true })
    child.stdout.on('data', chunk => { stdout = bounded(stdout + String(chunk)) })
    child.stderr.on('data', chunk => { stderr = bounded(stderr + String(chunk)) })
    child.once('error', error => finish(() => reject(error)))
    child.once('exit', (exitCode, signal) => finish(() => resolveResult({ exitCode: exitCode ?? -1, timedOut, stdout, stderr, python: resolved.executable })))
  })
  } finally { await rm(lease, { force: true }).catch(() => undefined) }
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
  registerEnvironmentTool(ctx)
  registerBioLocal(ctx, runPython)
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
        },
      },
      render: (_args, value) => [{ type: 'text', text: `Python exit=${String(value.exitCode)}${value.timedOut ? ' (timed out)' : ''}\nstdout:\n${value.stdout}\nstderr:\n${value.stderr}` }],
    },
    async execute(args, exec) {
      const input = args as PythonArgs
      if (input.code.trim() === '' || input.description.trim() === '') throw new Error('Python code and description are required.')
      return await runPython(input, exec)
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
