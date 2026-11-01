import { existsSync } from 'node:fs'
import { lstat, realpath } from 'node:fs/promises'
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path'

export interface PythonRuntimePaths { root: string; executable: string; sitePackages: string; snapshotRoot: string }

const PYTHON_LAUNCHERS = [
  'python.exe', 'python3.exe', 'pythonw.exe', 'python.cmd', 'python.bat', 'python.ps1', 'python3.cmd', 'python3.bat', 'python3.ps1',
  'py.exe', 'py.cmd', 'py.bat', 'py.ps1', 'pip.exe', 'pip3.exe', 'pip.cmd', 'pip3.cmd', 'pip.bat', 'pip3.bat', 'pip.ps1', 'pip3.ps1',
] as const
const EXTERNAL_PYTHON_DIRECTORY = /(?:^|[\\/])(?:python(?:\d+(?:\.\d+)?)?|py(?:thon)?(?:\d+(?:\.\d+)?)?|conda|mamba|(?:\.?)venv|virtualenv|windowsapps)(?:[\\/]|$)/iu

/** Remove ambient Windows Python/Conda launcher directories from child PATHs. */
export function filterExternalPythonPath(pathValue: string | undefined): string | undefined {
  if (!pathValue) return pathValue
  return pathValue.split(delimiter).filter(segment => {
    const candidate = segment.trim()
    if (!candidate || EXTERNAL_PYTHON_DIRECTORY.test(candidate)) return false
    return !PYTHON_LAUNCHERS.some(name => existsSync(join(candidate, name)))
  }).join(delimiter)
}

/** Legacy ROOT variables name the management directory, never an interpreter. */
export function configuredPythonRuntimeRoot(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env.ZEROWALL_PYTHON_RUNTIME_ROOT?.trim()
  const manager = env.ZEROWALL_PYTHON_MANAGEMENT_ROOT?.trim() || env.ZEROWALL_PYTHON_ROOT?.trim() || env.ZEROWALL_MCP_ENVIRONMENT_ROOT?.trim()
  const root = explicit || (manager && (basename(manager).toLowerCase() === '.zerowall'
    ? dirname(resolve(manager)) : basename(manager).toLowerCase() === 'zerowall-python' ? join(dirname(resolve(manager)), 'Python') : undefined))
  if (!root || /(?:^|[\\/])(?:\.zerowall|slots)(?:[\\/]|$)/iu.test(root)) return undefined
  return resolve(root)
}

/** Actual files are authoritative. Old current.json cannot redirect execution. */
export async function resolveFixedPythonRuntime(root = configuredPythonRuntimeRoot()): Promise<PythonRuntimePaths> {
  if (!root || /(?:^|[\\/])(?:\.zerowall|slots)(?:[\\/]|$)/iu.test(root)) throw new Error('PYTHON_ENVIRONMENT_UNAVAILABLE: fixed Python root is not configured.')
  root = resolve(root)
  const executable = join(root, 'python.exe'); const sitePackages = join(root, 'Lib', 'site-packages')
  const entries = await Promise.all([root, executable, sitePackages].map(async path => ({ path, info: await lstat(path).catch(() => undefined) })))
  for (const [index, entry] of entries.entries()) {
    if (!entry.info || entry.info.isSymbolicLink() || (index === 1 ? !entry.info.isFile() : !entry.info.isDirectory())) throw new Error(`PYTHON_ENVIRONMENT_UNAVAILABLE: fixed Python ${index === 1 ? 'executable' : 'directory'} is missing or unsafe.`)
    const local = relative(await realpath(root), await realpath(entry.path))
    if (local === '..' || local.startsWith('..\\') || local.startsWith('../') || isAbsolute(local)) throw new Error('PYTHON_ENVIRONMENT_UNAVAILABLE: runtime files escape the fixed Python root.')
  }
  return { root, executable, sitePackages, snapshotRoot: root }
}
