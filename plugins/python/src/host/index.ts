import { spawn } from 'node:child_process'
import { access, lstat, readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'zerowall-python'
export const inject = ['tools']

interface PythonArgs { code: string; description: string; timeoutMs?: number; workdir?: string }
interface PythonResult { exitCode: number; timedOut: boolean; stdout: string; stderr: string; python: string }
interface CurrentRecord { root?: unknown; health?: unknown; manifest?: Manifest }
interface Manifest {
  version?: unknown
  python?: { relativeExecutable?: unknown; relativeSitePackages?: unknown }
}

const MAX_OUTPUT = 1024 * 1024
const DEFAULT_TIMEOUT = 30_000
const MAX_TIMEOUT = 10 * 60_000

function environmentRoot(): string | undefined {
  const value = process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT?.trim()
  return value === undefined || value === '' ? undefined : resolve(value)
}

export async function resolveManagedPython(): Promise<{ executable: string; root: string; sitePackages: string }> {
  const root = environmentRoot()
  if (root === undefined) throw new Error('PYTHON_ENVIRONMENT_UNAVAILABLE: MCP environment root is not configured.')
  let current: CurrentRecord
  try {
    current = JSON.parse(await readFile(join(root, 'current.json'), 'utf8')) as CurrentRecord
  } catch {
    throw new Error('PYTHON_ENVIRONMENT_UNAVAILABLE: MCP environment is not installed or current.json is unreadable.')
  }
  if (current.health !== 'ready' || typeof current.root !== 'string' || current.root.trim() === '') {
    throw new Error('PYTHON_ENVIRONMENT_UNAVAILABLE: MCP Python environment is not healthy. Retry initialization.')
  }
  const installRoot = resolve(current.root)
  const manifest = current.manifest ?? JSON.parse(await readFile(join(installRoot, 'manifest.json'), 'utf8')) as Manifest
  const relativeExecutable = manifest.python?.relativeExecutable
  const relativeSitePackages = manifest.python?.relativeSitePackages
  if (typeof relativeExecutable !== 'string' || relativeExecutable.trim() === '' || isAbsolute(relativeExecutable)
    || typeof relativeSitePackages !== 'string' || relativeSitePackages.trim() === '' || isAbsolute(relativeSitePackages)) {
    throw new Error('PYTHON_ENVIRONMENT_UNAVAILABLE: manifest does not contain a safe Python executable.')
  }
  const executable = resolve(installRoot, relativeExecutable)
  const sitePackages = resolve(installRoot, relativeSitePackages)
  const isContained = (candidate: string): boolean => {
    const containment = relative(installRoot, candidate)
    return containment !== '..' && !containment.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(containment)
  }
  if (!isContained(executable) || !isContained(sitePackages)) {
    throw new Error('PYTHON_ENVIRONMENT_UNAVAILABLE: Python executable escapes the managed environment.')
  }
  const info = await lstat(executable).catch(() => undefined)
  if (info === undefined || !info.isFile() || info.isSymbolicLink()) {
    throw new Error('PYTHON_ENVIRONMENT_UNAVAILABLE: managed Python executable is missing.')
  }
  const siteInfo = await lstat(sitePackages).catch(() => undefined)
  if (siteInfo === undefined || !siteInfo.isDirectory() || siteInfo.isSymbolicLink()) {
    throw new Error('PYTHON_ENVIRONMENT_UNAVAILABLE: managed Python site-packages is missing.')
  }
  return { executable, root: installRoot, sitePackages }
}

function bounded(value: string): string { return value.length <= MAX_OUTPUT ? value : value.slice(-MAX_OUTPUT) }

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
  const controller = new AbortController()
  const abort = () => controller.abort()
  exec.signal.addEventListener('abort', abort, { once: true })
  return await new Promise<PythonResult>((resolveResult, reject) => {
    const child = spawn(resolved.executable, ['-c', args.code], {
      cwd: workdir,
      windowsHide: true,
      env: { ...process.env, PYTHONNOUSERSITE: '1', PYTHONPATH: resolved.sitePackages },
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
}

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'python',
    description: 'Execute Python code using the signed, healthy Python environment bundled with ZeroWall Science. The environment includes mcp, numpy, pandas, and httpx. Use the current session workspace unless workdir is explicitly needed.',
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
}

export default { name, inject, apply }
