import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

export interface PythonLocation {
  managementRoot: string
  runtimeRoot: string
  locationPath: string
}

export interface PythonLocationOptions {
  localAppDataPath: string
  /** Roots of legacy defaults, used only to reject an old saved target. */
  legacyRoamingRoots?: string[]
  /** Packaged application directory. It is accepted only after a real write
   * probe; otherwise LocalAppData remains the safe default. */
  applicationInstallRoot?: string
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

async function readLocation(path: string): Promise<string | undefined> {
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as { runtimeRoot?: unknown }
    return typeof value.runtimeRoot === 'string' && value.runtimeRoot.trim() ? value.runtimeRoot : undefined
  } catch { return undefined }
}

/**
 * Resolve the managed runtime without reading any legacy Roaming pointer.
 * The signed base bundled with the installer creates the runtime at the
 * current explicit selection or the writable default.
 */
export async function resolvePythonLocation(options: PythonLocationOptions): Promise<PythonLocation> {
  const locationPath = join(options.localAppDataPath, 'ZeroWall Science', 'python-location.json')
  const defaultRuntimeRoot = join(options.localAppDataPath, 'ZeroWall Science', 'Python')

  // Python is deliberately independent from the desktop profile. Older
  // releases stored this pointer beside the Roaming profile and tried to
  // migrate the interpreter from there. Reading that file again reintroduces
  // the exact failure mode this runtime is meant to avoid: a missing or
  // half-migrated profile blocks a clean bundled install. The only persisted
  // setting we honor is the explicit LocalAppData pointer written by the
  // current runtime.
  let configured = await readLocation(locationPath)

  // A per-user NSIS installation is writable and keeps the bundled runtime
  // beside the application.  Prefer that location on a fresh install so the
  // first run does not depend on an AppData\Roaming profile.  Machine-wide
  // installs normally live under Program Files and fail the same real write
  // probe; those fall back to LocalAppData without blocking startup.
  let candidate = defaultRuntimeRoot
  // Probe the packaged install location up front. This is the fresh/default
  // target even when a previously selected path is now stale: a disconnected
  // drive or removed directory must not force the next launch back into the
  // old Roaming layout. A valid user-selected path still wins below.
  if (options.applicationInstallRoot) {
    const installRuntimeRoot = join(options.applicationInstallRoot, 'Python')
    try {
      await assertWritablePythonRuntimePath(installRuntimeRoot, options.applicationInstallRoot)
      candidate = resolve(installRuntimeRoot)
    } catch {
      // LocalAppData is the safe default for a non-writable installation
      // directory.  The selected path remains changeable from the panel.
    }
  }
  const freshDefaultRuntimeRoot = candidate
  let replacePointer = false
  if (configured) {
    try {
      const saved = normalizePythonRuntimePath(configured)
      const wasOldDefault = (options.legacyRoamingRoots ?? []).some(root => resolve(saved).toLowerCase() === resolve(root, 'Python').toLowerCase())
      if (wasOldDefault) {
        // Ignore a saved legacy destination and install the signed base in the
        // current default location. This does not read or copy the old profile.
        candidate = freshDefaultRuntimeRoot
        replacePointer = true
      } else {
        // A saved custom path may point to an unplugged drive, a removed
        // directory, or a machine-wide install that is no longer writable.
        // Do not let that stale pointer make the desktop start with a broken
        // Python manager. Probe the path and fall back to the fresh default;
        // the settings page can still select the original path again later.
        try {
          await assertWritablePythonRuntimePath(saved, options.applicationInstallRoot)
          candidate = saved
        } catch {
          candidate = freshDefaultRuntimeRoot
          replacePointer = true
        }
      }
    } catch (error) {
      console.warn('Ignoring invalid saved Python path:', error instanceof Error ? error.message : String(error))
      replacePointer = true
    }
  }

  if (candidate === resolve(dirname(candidate))) throw new Error('共享 Python 路径不能是磁盘根目录。')
  if (replacePointer && configured) {
    // Best effort: a missing/read-only Roaming profile never blocks desktop
    // startup. The active root is still the computed LocalAppData target.
    try {
      await mkdir(dirname(locationPath), { recursive: true })
      const temporary = `${locationPath}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, `${JSON.stringify({ runtimeRoot: candidate })}\n`, { flag: 'wx' })
        await rename(temporary, locationPath)
      } finally { await rm(temporary, { force: true }).catch(() => undefined) }
    } catch { /* the installer can still rebuild at candidate */ }
  }

  return {
    managementRoot: join(dirname(candidate), 'zerowall-python'),
    runtimeRoot: candidate,
    locationPath,
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
