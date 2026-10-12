import { configuredPythonRuntimeRoot, resolveFixedPythonRuntime } from '../../../python/src/shared/runtime-path.js'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { readFile, lstat } from 'node:fs/promises'
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
 * The desktop points ZEROWALL_PYTHON_ROOT at
 * `<LocalAppData>/ZeroWall Science/Python/.zerowall`, so the environment has to
 * be derived from it rather than from an Electron path: host
 * code runs inside the harness process, where electron is not importable.
 */
export function scienceEnvironmentRoot(): string | undefined {
  const root = configuredPythonRuntimeRoot()
  return root ? join(root, '.zerowall') : undefined
}

export function defaultSciencePythonRoot(): string | undefined { return configuredPythonRuntimeRoot() }

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
  return resolveFixedPythonRuntime().catch(() => undefined)
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
