import { createHash, verify } from 'node:crypto'

/**
 * The signed dependency manifest.
 *
 * Enforcement is deliberately by *name and version*, not by artifact digest.
 * A mirror republishes and re-compresses wheels over time, and a single
 * upstream rebuild invalidates every hash we shipped — which turned a working
 * environment into an uninstallable one and blocked the whole layered install.
 * Signing still authenticates the document; `sha256` survives only as optional
 * provenance for anything that already carries one.
 */
export interface PythonDependencyManifest {
  schema: 3
  runtimeId: 'zerowall-science-python'
  platform: 'win32-x64'
  pythonVersion: string
  environmentVersion: string
  revision: string
  createdAt: string
  index: { indexUrl: string; trustedHost?: string }
  packages: Array<{ name: string; version: string; sha256?: string; required: boolean; capabilities: string[]; source?: 'sdist'; filename?: string }>
  compatibility: { minApplicationVersion: string; maxApplicationVersion?: string }
  signature: { algorithm: 'ed25519'; keyId: string; value: string }
}

const normalize = (name: string) => name.toLowerCase().replace(/[-_.]+/gu, '-')
function validSourceFilename(pkg: { name: string; version: string; filename?: string }): boolean {
  if (!pkg.filename || !/^[A-Za-z0-9_.+-]+\.(?:tar\.gz|zip)$/u.test(pkg.filename)) return false
  const stem = pkg.filename.replace(/\.tar\.gz$|\.zip$/u, '')
  return normalize(stem) === normalize(`${pkg.name}-${pkg.version}`)
}

/** Validate the entire signed payload before using names as pip arguments. */
export function parsePythonDependencyManifest(value: unknown, keys: Record<string, string>, applicationVersion?: string): PythonDependencyManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Python 依赖清单格式无效。')
  const doc = value as PythonDependencyManifest
  if (doc.schema !== 3 || doc.runtimeId !== 'zerowall-science-python' || doc.platform !== 'win32-x64') throw new Error('Python 依赖清单平台或版本不兼容。')
  const { signature, ...unsigned } = doc
  if (signature?.algorithm !== 'ed25519' || !keys[signature.keyId] || !signature.value || !verify(null, Buffer.from(JSON.stringify(unsigned)), keys[signature.keyId]!, Buffer.from(signature.value, 'base64'))) throw new Error('Python 依赖清单签名校验失败。')
  if (!/^\d+\.\d+\.\d+$/u.test(doc.pythonVersion) || !/^[A-Za-z0-9_.-]{1,100}$/u.test(doc.revision) || !doc.environmentVersion || !Number.isFinite(Date.parse(doc.createdAt))) throw new Error('Python 依赖清单版本字段无效。')
  const url = new URL(doc.index?.indexUrl)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Python 镜像必须使用 HTTPS。')
  if (!Array.isArray(doc.packages) || !doc.packages.length) throw new Error('Python 依赖清单为空。')
  const names = new Set<string>()
  for (const pkg of doc.packages) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(pkg.name) || !/^[A-Za-z0-9][A-Za-z0-9_.+!-]*$/u.test(pkg.version) || typeof pkg.required !== 'boolean' || !Array.isArray(pkg.capabilities) || pkg.capabilities.some(cap => typeof cap !== 'string')) throw new Error('Python 包锁定字段无效。')
    // A digest is optional provenance. When present it must still be a real
    // one, so a malformed value cannot pass as "no hash supplied".
    if (pkg.sha256 !== undefined && !/^[a-f0-9]{64}$/u.test(pkg.sha256)) throw new Error('Python 包锁定字段无效。')
    if ((pkg.source !== undefined && pkg.source !== 'sdist') || (pkg.source === 'sdist' && !validSourceFilename(pkg)) || (pkg.source === undefined && pkg.filename !== undefined)) throw new Error('Python 源码依赖文件名无效。')
    if (names.has(normalize(pkg.name))) throw new Error('Python 依赖清单包含重复包。')
    names.add(normalize(pkg.name))
  }
  if (!doc.compatibility || !/^\d+\.\d+\.\d+$/u.test(doc.compatibility.minApplicationVersion) || (doc.compatibility.maxApplicationVersion && !/^\d+\.\d+\.\d+$/u.test(doc.compatibility.maxApplicationVersion))) throw new Error('Python 应用兼容范围无效。')
  const compare = (a: string, b: string) => { const aa = a.split('.').map(Number); const bb = b.split('.').map(Number); for (let i = 0; i < 3; i++) { const d = aa[i]! - bb[i]!; if (d) return d } return 0 }
  if (applicationVersion && (compare(applicationVersion, doc.compatibility.minApplicationVersion) < 0 || (doc.compatibility.maxApplicationVersion && compare(applicationVersion, doc.compatibility.maxApplicationVersion) > 0))) throw new Error('请先更新 ZeroWall Science，再安装此依赖清单。')
  return doc
}

export function dependencyManifestSha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export class PythonManifestUnavailableError extends Error {}

export async function fetchPythonDependencyManifest(url: string, keys: Record<string, string>, options: { fetcher?: typeof fetch; applicationVersion?: string; expectedSha256?: string } = {}): Promise<PythonDependencyManifest> {
  const target = new URL(url)
  if (target.protocol !== 'https:' || target.username || target.password) throw new Error('Python 清单地址必须使用 HTTPS。')
  let response: Response
  try { response = await (options.fetcher ?? fetch)(url, { cache: 'no-store' }) }
  catch { throw new PythonManifestUnavailableError('Python 清单网络连接失败。') }
  if (response.status === 404) throw new PythonManifestUnavailableError('Python 清单尚未发布（HTTP 404）。')
  if (!response.ok) throw new Error(`Python 清单下载失败：HTTP ${response.status}`)
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > 4 * 1024 * 1024) throw new Error('Python 清单超过大小限制。')
  if (options.expectedSha256 && dependencyManifestSha256(new Uint8Array(bytes)) !== options.expectedSha256) throw new Error('Python 清单 SHA-256 校验失败。')
  return parsePythonDependencyManifest(JSON.parse(new TextDecoder().decode(bytes)), keys, options.applicationVersion)
}

/**
 * Bind the resolver's plan to the signed manifest.
 *
 * Package identity is bound to the signed manifest. When the manifest pins an
 * artifact digest, verify that too; otherwise the plan records the exact
 * SHA-256 returned by the selected mirror's index.
 */
export function assertManifestWheels(manifest: PythonDependencyManifest, wheels: Array<{ name: string; version: string; hash?: string; sourceArchiveSha256?: string }>, installed: Array<{ name: string; version: string }> = []): void {
  const locked = new Map(manifest.packages.map(pkg => [normalize(pkg.name), pkg]))
  const present = new Map(installed.map(pkg => [normalize(pkg.name), pkg.version]))
  const seen = new Set<string>()
  for (const wheel of wheels) {
    const name = normalize(wheel.name)
    if (seen.has(name)) throw new Error(`依赖 ${wheel.name} 在安装计划中重复。`)
    seen.add(name)
    const expected = locked.get(name)
    if (!expected || expected.version !== wheel.version) throw new Error(`依赖 ${wheel.name} 与签名清单的版本不一致，已拒绝安装。`)
    if (expected.sha256 && (expected.source === 'sdist' ? wheel.sourceArchiveSha256 !== expected.sha256 : wheel.hash !== expected.sha256)) throw new Error(`依赖 ${wheel.name} 与签名清单的 SHA-256 不一致，已拒绝安装。`)
    present.set(name, wheel.version)
  }
  for (const pkg of manifest.packages) if (pkg.required && present.get(normalize(pkg.name)) !== pkg.version) throw new Error(`依赖 ${pkg.name} 在安装计划和当前环境中均缺少锁定版本。`)
}

/** Stable diff preserves unlisted user packages instead of silently deleting them. */
export function dependencyManifestChanges(manifest: PythonDependencyManifest, installed: Array<{ name: string; version: string }>) {
  const existing = new Map(installed.map(pkg => [normalize(pkg.name), pkg.version]))
  return manifest.packages.filter(pkg => existing.get(normalize(pkg.name)) !== pkg.version).map(pkg => ({ name: pkg.name, from: existing.get(normalize(pkg.name)), to: pkg.version, required: pkg.required, capabilities: pkg.capabilities }))
}
