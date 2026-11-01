import { existsSync, lstatSync, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { filterExternalPythonPath } from '../../../python/src/shared/runtime-path.js'

/**
 * CA overrides that make `requests`/`pip`/`urllib` abandon their bundled
 * certificates. Kept in sync with the desktop sanitizer in
 * `desktop/src/main/python-mirror.ts`; this module exists because the research
 * plugin cannot import from the desktop package.
 */
export const PYTHON_CA_ENV_KEYS = ['SSL_CERT_FILE', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE', 'PIP_CERT'] as const

function cleanCaPath(value: string): string {
  let path = value.trim().replace(/^['"]|['"]$/gu, '')
  // Values may have crossed JSON/shell boundaries twice. Only collapse a
  // repeated Windows separator; do not interpret arbitrary escape sequences.
  if (/^[A-Za-z]:\\/u.test(path)) path = path.replaceAll('\\\\', '\\')
  return path
}

/** A CA path is usable only when it is a real, non-empty, non-symlink file. */
export function usableCaFile(path: string | undefined): path is string {
  if (!path) return false
  try {
    if (!existsSync(path)) return false
    const info = statSync(path)
    if (!info.isFile() || info.size === 0) return false
    return !lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * Strip inherited CA overrides that no longer resolve, optionally pinning a
 * known-good bundle to all four aliases.
 *
 * Scientific runners spawn Python with `{ ...process.env }`. When the Electron
 * process itself inherited a CA path from an earlier runtime layout — a slot
 * directory that has since been replaced — that dead path is copied verbatim
 * into every child, and the first outbound request dies with
 * "Could not find a suitable TLS CA certificate bundle" before reaching any
 * analysis code. Cleaning at the spawn site means no runner can reintroduce it.
 */
export function pythonChildEnvironment(sitePackages?: string, extra?: NodeJS.ProcessEnv, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, ...extra }
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH')
  const inheritedPath = filterExternalPythonPath(pathKey ? env[pathKey] : undefined)
  const runtimeRoot = env.ZEROWALL_PYTHON_RUNTIME_ROOT?.trim()
  if (pathKey || runtimeRoot) {
    for (const key of Object.keys(env)) if (key.toUpperCase() === 'PATH') delete env[key]
    const executable = runtimeRoot === undefined ? undefined : join(runtimeRoot, 'python.exe')
    env[pathKey ?? 'PATH'] = [runtimeRoot, runtimeRoot ? join(runtimeRoot, 'Scripts') : undefined, inheritedPath].filter(Boolean).join(delimiter)
    if (runtimeRoot) {
      env.ZEROWALL_PYTHON_EXECUTABLE = executable
      env.ZEROWALL_PYTHON_ROOT = join(runtimeRoot, '.zerowall')
      env.ZEROWALL_PYTHON_MANAGEMENT_ROOT = env.ZEROWALL_PYTHON_ROOT
      env.ZEROWALL_MCP_ENVIRONMENT_ROOT = env.ZEROWALL_PYTHON_ROOT
    }
  }
  // Every scientific runner uses the one managed interpreter.  Never allow a
  // user's global Python site directory or inherited PYTHONPATH to shadow it.
  env.PYTHONNOUSERSITE = '1'
  delete env.PYTHONHOME
  delete env.PYTHONPATH
  delete env.VIRTUAL_ENV
  delete env.CONDA_PREFIX
  delete env.CONDA_DEFAULT_ENV
  const bundled = sitePackages ? join(sitePackages, 'certifi', 'cacert.pem') : undefined
  const trusted = usableCaFile(bundled) ? bundled : undefined
  for (const key of PYTHON_CA_ENV_KEYS) {
    if (trusted !== undefined) { env[key] = trusted; continue }
    const raw = env[key]
    if (!raw?.trim()) { delete env[key]; continue }
    const path = cleanCaPath(raw)
    // Keep a valid value the user or an enterprise profile deliberately set;
    // drop anything that does not resolve to a file.
    if (usableCaFile(path)) env[key] = path
    else delete env[key]
  }
  return env
}
