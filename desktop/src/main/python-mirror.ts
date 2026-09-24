import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { existsSync, statSync } from 'node:fs'
import { ALIYUN_INDEX_URL, DEFAULT_MIRROR_PRESET, USTC_INDEX_URL, jsonCandidates, presetForIndex, trustedHostForIndex } from './python-mirrors.js'

/**
 * PyPI mirror policy for the managed Python environment.
 *
 * Python -I isolates Python imports, not pip settings. The package runner also
 * isolates pip and disables its configuration files, then passes the selected
 * application mirror as an explicit install/download argument.
 */
export const TUNA_INDEX_URL = 'https://pypi.tuna.tsinghua.edu.cn/simple'
export const TUNA_TRUSTED_HOST = 'pypi.tuna.tsinghua.edu.cn'
export const PYPI_INDEX_URL = 'https://pypi.org/simple'
/**
 * USTC is the user-selected default. Aliyun remains available as an explicit
 * preset with per-package retry and artifact verification.
 */
export const DEFAULT_INDEX_URL = USTC_INDEX_URL
/** Marker written into pip.ini so we only ever rewrite a file we own. */
export const MIRROR_INI_MARKER = '# zerowall-science: managed PyPI mirror'

/**
 * Environment variables commonly used by requests/pip to override their CA
 * bundle.  A stale value inherited from another Python installation can make
 * every managed task fail before it reaches the mirror (for example a path
 * containing literal doubled backslashes).  Keep this helper side-effect free
 * so callers can use it for every child process and diagnostics can test it.
 */
export const PYTHON_CA_ENV_KEYS = ['SSL_CERT_FILE', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE', 'PIP_CERT'] as const

export type PythonTlsEnvironment = NodeJS.ProcessEnv & { __zerowallCaDiagnostic?: string }

function cleanCaPath(value: string): string {
  let path = value.trim().replace(/^['"]|['"]$/gu, '')
  // Values may have crossed JSON/shell boundaries twice.  Only collapse a
  // repeated Windows separator; do not interpret arbitrary escape sequences.
  if (/^[A-Za-z]:\\/u.test(path)) path = path.replaceAll('\\\\', '\\')
  return path
}

function isCaFile(path: string): boolean {
  try { return existsSync(path) && statSync(path).isFile() } catch { return false }
}

/**
 * Remove invalid inherited CA overrides and optionally pin a known-good CA
 * bundle.  This prevents errors such as `certifi\\cacert.pem` from leaking
 * into pip, requests, and scientific runners while preserving valid custom
 * enterprise bundles.
 */
export function sanitizePythonTlsEnvironment(input: NodeJS.ProcessEnv = process.env, trustedCAPath?: string): PythonTlsEnvironment {
  const env: PythonTlsEnvironment = { ...input }
  const invalid: string[] = []
  for (const key of PYTHON_CA_ENV_KEYS) {
    const raw = env[key]
    if (!raw?.trim()) { delete env[key]; continue }
    const path = cleanCaPath(raw)
    if (!isCaFile(path)) { delete env[key]; invalid.push(key); continue }
    env[key] = path
  }
  if (trustedCAPath) {
    const path = cleanCaPath(trustedCAPath)
    if (isCaFile(path)) {
      // Keep all four aliases consistent. This avoids pip selecting a stale
      // alias depending on the installed requests/pip version.
      for (const key of PYTHON_CA_ENV_KEYS) env[key] = path
    } else invalid.push('trustedCAPath')
  }
  if (invalid.length) env.__zerowallCaDiagnostic = `已清理无效 CA 配置: ${invalid.join(', ')}`
  return env
}

export interface MirrorConfig {
  indexUrl: string
  trustedHost?: string
}

function normalizeUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:') return undefined
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
  } catch { return undefined }
}

/**
 * Resolve the effective mirror. Precedence: explicit caller value (the user's
 * saved index, or the signed cloud manifest), then the environment, then USTC.
 */
export function resolveMirror(configured?: MirrorConfig | string | undefined, env: NodeJS.ProcessEnv = process.env): MirrorConfig {
  const fromManifest = typeof configured === 'string' ? configured : configured?.indexUrl
  const indexUrl = normalizeUrl(fromManifest) ?? normalizeUrl(env.ZEROWALL_PYPI_INDEX_URL) ?? DEFAULT_MIRROR_PRESET.indexUrl
  const trustedHost = typeof configured === 'object' ? configured.trustedHost : undefined
  const host = trustedHost ?? trustedHostForIndex(indexUrl)
  // pypi.org is reachable over normal TLS; only mirror hosts need the flag.
  return host === 'pypi.org' ? { indexUrl } : { indexUrl, trustedHost: host }
}

/** pip arguments that pin a resolution to the configured mirror. */
export function mirrorArgs(mirror: MirrorConfig): string[] {
  // --trusted-host disables TLS verification; public HTTPS mirrors must use
  // ordinary certificate validation just like the primary PyPI service.
  return ['--index-url', mirror.indexUrl]
}

/**
 * PEP 503 JSON endpoint for a single project. Every mirror publishes the same
 * simple index, but the JSON API path differs per host (Aliyun uses
 * `/pypi/web/json`, Tsinghua and USTC use `/pypi`, pypi.org uses `/pypi`), so
 * the catalogue supplies the layout rather than one shared URL shape.
 */
export function projectJsonUrl(mirror: MirrorConfig, name: string): string {
  return projectJsonCandidates(mirror, name)[0]!
}

/** Candidate endpoints for a project lookup, in the order they should be tried. */
export function projectJsonCandidates(mirror: MirrorConfig, name: string): string[] {
  return jsonCandidates(mirror.indexUrl, name)
}

/**
 * Install the mirror into the *user-level* pip configuration so plain `pip`
 * invocations outside this app also use it. An existing file that we did not
 * write is left untouched: silently rewriting a user's pip config is worse than
 * not configuring the mirror at all.
 */
export async function ensureGlobalPipConfig(mirror: MirrorConfig, configPath: string): Promise<boolean> {
  const body = `[global]\nindex-url = ${mirror.indexUrl}\n`
  let existing: string | undefined
  try { existing = await readFile(configPath, 'utf8') } catch { /* absent */ }
  if (existing !== undefined && !existing.includes(MIRROR_INI_MARKER)) return false
  const next = `${MIRROR_INI_MARKER}\n${body}`
  if (existing === next) return false
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, next)
  return true
}
