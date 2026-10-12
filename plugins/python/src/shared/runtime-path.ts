import { lstat, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

export interface PythonRuntimePaths { root: string; executable: string; sitePackages: string; snapshotRoot: string }

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
