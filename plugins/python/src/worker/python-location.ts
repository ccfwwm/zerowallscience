import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

export interface PythonLocation {
  managementRoot: string
  runtimeRoot: string
  locationPath: string
  source: 'install-default' | 'user-selected'
}

export interface PythonLocationOptions {
  localAppDataPath: string
  /** Roots of legacy defaults, used only to reject an old saved target. */
  legacyRoamingRoots?: (string[]) | undefined
  /** Actual main executable directory. Resolution is read-only; permission
   * checks happen only when the user explicitly installs or changes paths. */
  applicationInstallRoot?: (string) | undefined
}

export function normalizePythonRuntimePath(input: string): string {
  const value = input.trim()
  if (value === '' || value.includes('\0')) throw new Error('共享 Python 路径无效。')
  const selected = resolve(value)
  if (selected === dirname(selected)) throw new Error('共享 Python 路径不能是磁盘根目录。')
  return basename(selected).toLowerCase() === 'python' ? selected : join(selected, 'Python')
}

function pathWithin(root: string, candidate: string): boolean {
  const resolvedRoot = resolve(root)
  const resolvedCandidate = resolve(candidate)
  const rel = relative(resolvedRoot, resolvedCandidate)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(rel))
}

async function readLocation(path: string): Promise<{ runtimeRoot: string; source?: (string) | undefined } | undefined> {
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as { runtimeRoot?: (unknown) | undefined; source?: (string) | undefined }
    return typeof value.runtimeRoot === 'string' && value.runtimeRoot.trim() ? { runtimeRoot: value.runtimeRoot, source: value.source } : undefined
  } catch { return undefined }
}

/**
 * Resolve the managed runtime without reading any legacy Roaming pointer.
 * The signed base bundled with the installer creates the runtime at the
 * current explicit selection or the actual installation directory. No old
 * runtime is read, copied, migrated or removed by location resolution.
 */
export async function resolvePythonLocation(options: PythonLocationOptions): Promise<PythonLocation> {
  const locationPath = join(options.localAppDataPath, 'ZeroWall Science', 'python-location.json')
  const defaultRuntimeRoot = join(options.applicationInstallRoot ?? dirname(process.execPath), 'Python')
  const configured = await readLocation(locationPath)
  let candidate = defaultRuntimeRoot
  let source: PythonLocation['source'] = 'install-default'
  if (configured) {
    try {
      const saved = normalizePythonRuntimePath(configured.runtimeRoot)
      const oldDefaults = [join(options.localAppDataPath, 'ZeroWall Science'), join(options.localAppDataPath, 'ZeroWallScience'), ...(options.legacyRoamingRoots ?? [])]
      const wasOldDefault = oldDefaults.some(root => resolve(saved).toLowerCase() === resolve(root, 'Python').toLowerCase())
      const privateRuntime = /(?:^|[\\/])(?:\.zerowall|slots)(?:[\\/]|$)/iu.test(saved)
      if (!privateRuntime && configured.source !== 'install-default' && (!wasOldDefault || configured.source === 'user-selected')) {
        candidate = saved
        source = 'user-selected'
      }
    } catch (error) {
      console.warn('Ignoring invalid saved Python path:', error instanceof Error ? error.message : String(error))
    }
  }

  if (candidate === resolve(dirname(candidate))) throw new Error('共享 Python 路径不能是磁盘根目录。')
  return {
    // Keep the interpreter and every package in the one user-visible Python
    // directory.  Transaction journals, plans and logs are implementation
    // details below the same directory so a user never has to distinguish a
    // slot, generation or second environment.
    managementRoot: join(candidate, '.zerowall'),
    runtimeRoot: candidate,
    locationPath,
    source,
  }
}

/** Test actual write access up front. The install directory is allowed when a
 * per-user installation made it writable; Program Files will fail this probe
 * and the caller can choose LocalAppData or another data directory. */
export async function assertWritablePythonRuntimePath(runtimeRoot: string, applicationInstallRoot?: string): Promise<void> {
  const selected = resolve(runtimeRoot)
  const inInstallDirectory = applicationInstallRoot !== undefined && pathWithin(applicationInstallRoot, selected)
  const existing = await lstat(selected).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  })
  if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) throw new Error('共享 Python 路径必须是真实目录，不能是文件或目录联接。')
  // A path check must not create an empty Python directory before the signed
  // archive is installed. Probe the parent on first run; probe Python itself
  // when it already exists so a changed ACL is still detected.
  const probeDirectory = existing ? selected : dirname(selected)
  try {
    await mkdir(probeDirectory, { recursive: true })
  } catch (error) {
    if (inInstallDirectory) {
      throw new Error('软件安装目录不可写。请以可写的用户安装位置运行，或选择 LocalAppData/其他数据目录。', { cause: error })
    }
    throw error
  }
  const probe = join(probeDirectory, `.zerowall-python-write-${randomUUID()}.tmp`)
  try {
    await writeFile(probe, 'ok', { flag: 'wx' })
  } catch (error) {
    if (inInstallDirectory) {
      throw new Error('软件安装目录不可写。请以可写的用户安装位置运行，或选择 LocalAppData/其他数据目录。', { cause: error })
    }
    throw error
  } finally { await rm(probe, { force: true }).catch(() => undefined) }
}
