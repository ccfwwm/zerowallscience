/** Explicit Python locations published by the dependency environment owner. */
import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path'

/** A prepared dependency environment; the bundled base interpreter remains immutable. */
export interface PythonRuntimePaths { root: string; executable: string; sitePackages: string; snapshotRoot: string }

/** Read configured paths without guessing an installation directory or platform layout. */
export function pythonRuntimePaths(env: NodeJS.ProcessEnv = process.env): PythonRuntimePaths {
  const root = env.ZEROWALL_PYTHON_ENV_ROOT?.trim()
  const executable = env.ZEROWALL_PYTHON_EXECUTABLE?.trim()
  const sitePackages = env.ZEROWALL_PYTHON_SITE_PACKAGES?.trim()
  if (!root || !executable || !sitePackages || ![root, executable, sitePackages].every(isAbsolute)) {
    throw new Error('PYTHON_ENVIRONMENT_UNAVAILABLE: Python dependencies are not ready; retry preparation in Python settings.')
  }
  return { root: resolve(root), executable: resolve(executable), sitePackages: resolve(sitePackages), snapshotRoot: resolve(root) }
}

/** Validate the selected environment; no old-runtime discovery is performed. */
export async function resolvePythonRuntime(env: NodeJS.ProcessEnv = process.env): Promise<PythonRuntimePaths> {
  const paths = pythonRuntimePaths(env)
  for (const [path, file] of [[paths.root, false], [paths.executable, true], [paths.sitePackages, false]] as const) {
    const info = await stat(path)
    if (file ? !info.isFile() : !info.isDirectory()) throw new Error('PYTHON_ENVIRONMENT_UNAVAILABLE: a configured Python resource is missing.')
  }
  return paths
}

/** Remove ambient Python launchers while preserving unrelated command directories. */
export function filterExternalPythonPath(value: string | undefined): string | undefined {
  return value?.split(delimiter).filter(directory => directory.trim() &&
    !/(?:^|[\\/])(?:windowsapps|conda|mamba|\.venv|venv)(?:[\\/]|$)/iu.test(directory) &&
    !['python.exe', 'python3.exe', 'python', 'python3', 'py.exe'].some(name => existsSync(join(directory, name)))).join(delimiter)
}

/** Build a child environment from explicit paths, excluding ambient Python overrides. */
export function pythonRuntimeEnvironment(paths: PythonRuntimePaths, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...base }
  for (const key of ['PYTHONHOME', 'PYTHONPATH', 'VIRTUAL_ENV', 'CONDA_PREFIX', 'CONDA_DEFAULT_ENV', 'ZEROWALL_PYTHON_ROOT', 'ZEROWALL_PYTHON_RUNTIME_ROOT', 'ZEROWALL_PYTHON_MANAGEMENT_ROOT', 'ZEROWALL_MCP_ENVIRONMENT_ROOT']) delete env[key]
  const key = Object.keys(env).find(name => name.toUpperCase() === 'PATH') ?? 'PATH'
  env[key] = [dirname(paths.executable), filterExternalPythonPath(env[key])].filter(Boolean).join(delimiter)
  env.VIRTUAL_ENV = paths.root
  env.PYTHONNOUSERSITE = '1'
  env.PYTHONUTF8 = '1'
  env.PYTHONIOENCODING = 'utf-8'
  env.ZEROWALL_PYTHON_ENV_ROOT = paths.root
  env.ZEROWALL_PYTHON_EXECUTABLE = paths.executable
  env.ZEROWALL_PYTHON_SITE_PACKAGES = paths.sitePackages
  return env
}
