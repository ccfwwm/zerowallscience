import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'

/**
 * The one managed Python environment every scientific engine runs in.
 *
 * BrainGlobe, HE StarDist and the engine probes all resolve their interpreter
 * through this module. There is deliberately no per-engine virtualenv: a second
 * environment would need its own dependency set, its own update path and its own
 * version drift, while the shared environment already carries the signed
 * manifest and the on-demand installer. An engine that needs a package adds it
 * to the research requirements instead of growing a private environment.
 */

/**
 * The desktop points ZEROWALL_PYTHON_ROOT at <userData>/zerowall-python, so the
 * environment has to be derived from it rather than from an Electron path: host
 * code runs inside the harness process, where electron is not importable.
 */
export function scienceEnvironmentRoot(): string | undefined {
  const value = process.env.ZEROWALL_PYTHON_ROOT?.trim() ?? process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT?.trim()
  if (value === undefined || value === '') return undefined
  try { return resolve(value) } catch { return undefined }
}

/** Default managed atlas directory; undefined when no managed root is configured at all. */
export function defaultAtlasDirectory(): string | undefined {
  const root = scienceEnvironmentRoot()
  return root === undefined ? undefined : join(root, 'brainglobe-managed')
}

export interface ManagedSciencePython { executable: string; root: string; sitePackages: string; overlayPath: string }
interface CurrentRecord { overlayPath?: unknown; root?: unknown; health?: unknown; manifest?: { python?: { version?: unknown; relativeExecutable?: unknown; relativeSitePackages?: unknown } } }

/**
 * Mirrors plugins/python resolveManagedPython, including the containment check:
 * a manifest that points outside the install root must never be executed, and
 * this resolver deliberately does not export the interpreter by writing an
 * environment variable, so callers cannot be silently redirected by one.
 */
export async function resolveManagedSciencePython(): Promise<ManagedSciencePython | undefined> {
  const root = scienceEnvironmentRoot()
  if (root === undefined) return undefined
  let current: CurrentRecord
  try { current = JSON.parse(await readFile(join(root, 'current.json'), 'utf8')) as CurrentRecord } catch { return undefined }
  if (current.health !== 'ready' || typeof current.root !== 'string' || current.root.trim() === '') return undefined
  const installRoot = resolve(current.root)
  const manifest = current.manifest ?? await readFile(join(installRoot, 'manifest.json'), 'utf8').then(text => JSON.parse(text) as CurrentRecord['manifest'], () => undefined)
  const relativeExecutable = manifest?.python?.relativeExecutable
  const relativeSitePackages = manifest?.python?.relativeSitePackages
  if (typeof relativeExecutable !== 'string' || relativeExecutable.trim() === '' || isAbsolute(relativeExecutable)) return undefined
  if (typeof relativeSitePackages !== 'string' || relativeSitePackages.trim() === '' || isAbsolute(relativeSitePackages)) return undefined
  const executable = resolve(installRoot, relativeExecutable)
  const sitePackages = resolve(installRoot, relativeSitePackages)
  const contained = (candidate: string): boolean => { const containment = relative(installRoot, candidate); return containment !== '..' && !containment.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(containment) }
  if (!contained(executable) || !contained(sitePackages)) return undefined
  const runtime = typeof manifest?.python?.version === 'string' ? manifest.python.version.match(/^\d+\.\d+/u)?.[0] ?? '3.12' : '3.12'
  const overlayPath = typeof current.overlayPath === 'string' && current.overlayPath.trim() !== '' ? current.overlayPath : join(root, 'python-overlay', `python-${runtime.replace(/[^A-Za-z0-9.-]/gu, '-')}`)
  try {
    const info = await stat(executable)
    if (!info.isFile()) return undefined
  } catch { return undefined }
  return { executable, root: installRoot, sitePackages, overlayPath }
}

/**
 * The managed interpreter is an embeddable build whose ._pth already carries
 * the overlay path, but -E/-P still make PYTHONPATH unreliable, so the overlay
 * and site-packages are inserted explicitly before runner code runs.
 */
export function scienceBootstrap(paths: ManagedSciencePython | undefined): string {
  return paths === undefined ? '' : `import sys as _zw_sys\nfor _zw_path in (${JSON.stringify(paths.overlayPath)}, ${JSON.stringify(paths.sitePackages)}):\n    if _zw_path not in _zw_sys.path: _zw_sys.path.insert(0, _zw_path)\n`
}
