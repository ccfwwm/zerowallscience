/** Build signed, full-software dependency metadata without rebuilding Python. */
import { createHash, createPrivateKey, createPublicKey } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { applySourceDistributions, normalizePackageName, parseLockedPackages, scienceManifestDocument, signDocument } from './python-layer-split.mjs'

const root = resolve(import.meta.dirname, '../..')
const output = resolve(process.env.ZEROWALL_PYTHON_DEPENDENCY_OUTPUT ?? join(root, 'desktop', 'dist', 'python-dependencies'))
const environmentVersion = process.env.ZEROWALL_PYTHON_ENVIRONMENT_VERSION ?? '1.4.1'
const revision = process.env.ZEROWALL_PYTHON_DEPENDENCY_REVISION ?? `${environmentVersion}-r5`
if (!/^[A-Za-z0-9_.-]{1,100}$/u.test(revision)) throw new Error('Invalid manifest revision.')
const publicKey = `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA9DJ9yg3F5f67/cEE54AdIDtQshvLP0SF5gVe3F3X+wA=\n-----END PUBLIC KEY-----`
const keyFile = process.env.ZEROWALL_MCP_ENVIRONMENT_PRIVATE_KEY_FILE ?? join(root, '.secrets', 'mcp', 'stable-3-private.pem')
const privateText = (await readFile(keyFile, 'utf8')).trim()
const privateKey = privateText.startsWith('base64:') ? createPrivateKey({ key: Buffer.from(privateText.slice(7), 'base64'), type: 'pkcs8', format: 'der' }) : createPrivateKey(privateText)
if (createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).trim() !== publicKey.trim()) throw new Error('Signing key does not match pinned stable-3 public key.')
const lockBytes = await readFile(join(root, 'resources', 'python', 'requirements-windows.lock'))
const lockText = lockBytes.toString('utf8')
const packages = parseLockedPackages(lockText)
const lines = lockText.split(/\r?\n/u).filter(line => line.trim() && !line.startsWith('#'))
if (lines.length !== packages.size) throw new Error('Dependency lock has duplicate or unhashed entries.')
const audit = JSON.parse(await readFile(join(root, 'resources', 'python', 'skill-dependencies.json'), 'utf8'))
const capabilities = new Map()
for (const skill of audit.skills ?? []) for (const requirement of skill.requirements ?? []) {
  const name = normalizePackageName(requirement.name)
  if (!packages.has(name)) continue
  if (!capabilities.has(name)) capabilities.set(name, new Set())
  capabilities.get(name).add(skill.name)
}
const sourceLock = await readFile(join(root, 'resources/python/requirements-research.lock'), 'utf8')
const sourceDistributions = JSON.parse(await readFile(join(root, 'resources/python/source-distributions.json'), 'utf8'))
const installPackages = applySourceDistributions(packages, sourceLock, sourceDistributions)
// Tsinghua, not Aliyun: measured across all 521 pins Tsinghua resolves 520 and
// Aliyun 517, whose shortfall is CDN objects served truncated rather than
// versions it lacks. The client still lets the user switch mirror at runtime.
const document = scienceManifestDocument({ environmentVersion, scienceRevision: revision, pythonVersion: '3.12.10', applicationVersion: '7.0.3', index: { indexUrl: 'https://pypi.tuna.tsinghua.edu.cn/simple', trustedHost: 'pypi.tuna.tsinghua.edu.cn' }, packages: [...installPackages.values()], keyId: 'stable-3' })
// Packages without a digest keep none: the client resolves their version from
// the index above rather than verifying bytes the mirror is free to re-publish.
document.packages = document.packages.map(pkg => {
  return { ...pkg, capabilities: [...(capabilities.get(normalizePackageName(pkg.name)) ?? new Set(['shared-runtime']))].sort() }
})
document.source = { lockSha256: createHash('sha256').update(lockBytes).digest('hex'), sourceLockSha256: createHash('sha256').update(sourceLock).digest('hex'), auditGeneratedAt: audit.generatedAt }
signDocument(document, privateKey, publicKey)
const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`)
await mkdir(output, { recursive: true })
await writeFile(join(output, `manifest-${revision}.json`), bytes)
await writeFile(join(output, 'latest.json'), bytes)
// Offline bootstrap metadata: shipped in desktop/resources by the normal
// resource copier; actual scientific wheels are still installed on demand.
await writeFile(join(root, 'resources', 'python', 'dependency-manifest.json'), bytes)
const receipt = { runtimeId: document.runtimeId, revision, environmentVersion, pythonVersion: document.pythonVersion, packageCount: document.packages.length, capabilitiesCount: capabilities.size, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), signatureKey: document.signature.keyId, localOnly: true }
await writeFile(join(output, 'build-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`)
console.log(JSON.stringify(receipt, null, 2))
