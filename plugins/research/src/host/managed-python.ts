import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'

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
  const explicit = process.env.ZEROWALL_PYTHON_ROOT?.trim() || process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT?.trim()
  // Host-side tests and non-Electron workers do not inherit the desktop's
  // environment variables. Resolve the same application-wide runtime from
  // the normal user-data location in that case. An explicit value still wins
  // (including an explicit missing path), so callers cannot silently fall
  // back to another interpreter after a configured runtime fails.
  const value = explicit || (() => {
    // Roaming is not guaranteed to exist on locked-down or first-run Windows
    // profiles. Keep this fallback aligned with the desktop resolver: the
    // desktop passes the exact install/custom path through ZEROWALL_PYTHON_ROOT.
    const localAppData = process.env.LOCALAPPDATA?.trim()
    return localAppData ? join(localAppData, 'ZeroWall Science', 'zerowall-python') : undefined
  })()
  if (value === undefined || value === '') return undefined
  try { return resolve(value) } catch { return undefined }
}

/** Stable Python paths used by the desktop installer and scientific runners. */
export function defaultSciencePythonRoot(): string | undefined {
  const managerRoot = scienceEnvironmentRoot()
  if (managerRoot) {
    try {
      const current = JSON.parse(readFileSync(join(managerRoot, 'current.json'), 'utf8')) as CurrentRecord
      const within = typeof current.root === 'string' ? relative(join(managerRoot, 'slots'), current.root) : '..'
      if (current.generation === true && current.health === 'ready' && !within.startsWith('..') && !isAbsolute(within) && current.runtimeRoot === current.root) {
        retainScienceSnapshot(managerRoot, current.root as string)
        return join(current.root as string, 'Python')
      }
    } catch { /* Preserve the existing first-run fallback. */ }
    // desktop/src/main/index.ts points the installer at <userData>/zerowall-python;
    // the interpreter itself is deliberately kept at the sibling <userData>/Python.
    if (basename(managerRoot).toLowerCase() === 'zerowall-python') return join(resolve(managerRoot, '..'), 'Python')
    if (basename(managerRoot).toLowerCase() === 'python') return managerRoot
  }
  const localAppData = process.env.LOCALAPPDATA?.trim()
  return localAppData ? join(localAppData, 'ZeroWall Science', 'Python') : undefined
}

export function defaultSciencePythonExecutable(): string | undefined {
  const root = defaultSciencePythonRoot()
  return root ? join(root, process.platform === 'win32' ? 'python.exe' : 'bin', ...(process.platform === 'win32' ? [] : ['python'])) : undefined
}

export function defaultSciencePythonSitePackages(): string | undefined {
  const root = defaultSciencePythonRoot()
  return root ? join(root, 'Lib', 'site-packages') : undefined
}

/** Default managed atlas directory; undefined when no managed root is configured at all. */
export function defaultAtlasDirectory(): string | undefined {
  const root = scienceEnvironmentRoot()
  return root === undefined ? undefined : join(root, 'brainglobe-managed')
}

export interface ManagedSciencePython { executable: string; root: string; sitePackages: string }
interface CurrentRecord {
  root?: unknown
  generation?: boolean
  runtimeRoot?: unknown
  runtimeExecutable?: unknown
  runtimeSitePackages?: unknown
  runtimeLayout?: { relativeExecutable?: unknown; relativeSitePackages?: unknown }
  health?: unknown
  manifest?: { python?: { version?: unknown; relativeExecutable?: unknown; relativeSitePackages?: unknown } }
}

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
  const within = typeof current.root === 'string' ? relative(join(root, 'slots'), current.root) : '..'
  const generation = current.generation === true && within !== '..' && !within.startsWith('..\\') && !within.startsWith('../') && !isAbsolute(within)
  const runtimeRoot = generation ? resolve(current.root as string) : resolve(root, '..')
  if (typeof current.runtimeRoot !== 'string' || resolve(current.runtimeRoot) !== runtimeRoot) return undefined
  if (manifest?.python?.relativeExecutable !== 'Python/python.exe' || manifest?.python?.relativeSitePackages !== 'Python/Lib/site-packages') return undefined
  const stablePythonRoot = join(runtimeRoot, 'Python')
  const executable = join(stablePythonRoot, 'python.exe')
  const sitePackages = join(stablePythonRoot, 'Lib', 'site-packages')
  const contained = (root: string, candidate: string): boolean => { const containment = relative(root, candidate); return containment !== '..' && !containment.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(containment) }
  if (!contained(stablePythonRoot, executable) || !contained(stablePythonRoot, sitePackages)) return undefined
  try {
    const info = await stat(executable)
    if (!info.isFile()) return undefined
  } catch { return undefined }
  if (generation) retainScienceSnapshot(root, installRoot)
  return { executable, root: stablePythonRoot, sitePackages }
}

/** Scientific runners share a Host. Conservatively keep every snapshot used
 * by that Host until it exits; the collector removes dead process leases. */
function retainScienceSnapshot(managerRoot: string, snapshot: string): void {
  const directory = join(managerRoot, 'leases')
  const id = createHash('sha256').update(resolve(snapshot)).digest('hex').slice(0, 20)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, `${process.pid}-science-${id}.json`), JSON.stringify({ pid: process.pid, snapshot, kind: 'research-host', createdAt: new Date().toISOString() }))
}

/**
 * Add only the shared site-packages path before runner code runs.
 */
export function scienceBootstrap(paths: ManagedSciencePython | undefined): string {
  return paths === undefined ? '' : `import sys as _zw_sys\nif ${JSON.stringify(paths.sitePackages)} not in _zw_sys.path: _zw_sys.path.insert(0, ${JSON.stringify(paths.sitePackages)})\n`
}
