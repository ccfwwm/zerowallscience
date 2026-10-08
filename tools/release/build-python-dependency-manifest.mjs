import { releaseRoot } from '../build/paths.mjs'
/** Build signed, full-software dependency metadata without rebuilding Python. */
import { createHash, createPrivateKey, createPublicKey } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { applySourceDistributions, coreManifestDocument, normalizePackageName, parseDirectRequirements, parseLockedPackages, partitionLock, scienceManifestDocument, signDocument } from './python-layer-split.mjs'
import { resourceSource } from '../build/layout.mjs'

const root = resolve(import.meta.dirname, '../..')
const pythonRoot = await resourceSource('python')
const output = resolve(process.env.ZEROWALL_PYTHON_DEPENDENCY_OUTPUT ?? join(releaseRoot, 'python-dependencies'))
const pythonVersion = process.env.ZEROWALL_PYTHON_VERSION ?? '3.12.10'
const environmentVersion = process.env.ZEROWALL_PYTHON_ENVIRONMENT_VERSION ?? pythonVersion
const revision = process.env.ZEROWALL_PYTHON_DEPENDENCY_REVISION ?? `${environmentVersion}-r16`
if (!/^[A-Za-z0-9_.-]{1,100}$/u.test(revision)) throw new Error('Invalid manifest revision.')
const keyId = process.env.ZEROWALL_MCP_ENVIRONMENT_KEY_ID ?? 'stable-4'
const trustedKeys = JSON.parse(await readFile(join(root, 'config/catalogs/trusted-keys.json'), 'utf8'))
const publicKey = trustedKeys[keyId]
if (!publicKey) throw new Error(`No trusted public key for ${keyId}.`)
const keyFile = process.env.ZEROWALL_MCP_ENVIRONMENT_PRIVATE_KEY_FILE ?? join(root, 'scripts', 'env', 'resource-stable-4-private.pem')
const privateText = (await readFile(keyFile, 'utf8')).trim()
const privateKey = privateText.startsWith('base64:') ? createPrivateKey({ key: Buffer.from(privateText.slice(7), 'base64'), type: 'pkcs8', format: 'der' }) : createPrivateKey(privateText)
if (createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).trim() !== publicKey.trim()) throw new Error(`Signing key does not match pinned ${keyId} public key.`)
const lockBytes = await readFile(join(pythonRoot, 'requirements-windows.lock'))
const lockText = lockBytes.toString('utf8')
const packages = parseLockedPackages(lockText)
const lines = lockText.split(/\r?\n/u).filter(line => line.trim() && !line.startsWith('#'))
if (lines.length !== packages.size) throw new Error('Dependency lock has duplicate or unhashed entries.')
const requiredIntegrityPackages = new Map([
  ['easyocr', '1.7.2'],
  ['torchvision', '0.29.0'],
  ['imagededup', '0.3.3.post2'],
])
for (const [name, expectedVersion] of requiredIntegrityPackages) {
  const locked = packages.get(name)
  if (!locked || locked.version !== expectedVersion) {
    throw new Error(`Required integrity dependency must be locked as ${name}==${expectedVersion}.`)
  }
}
const audit = JSON.parse(await readFile(join(pythonRoot, 'skill-dependencies.json'), 'utf8'))
const capabilities = new Map()
for (const skill of audit.skills ?? []) for (const requirement of skill.requirements ?? []) {
  const name = normalizePackageName(requirement.name)
  if (!packages.has(name)) continue
  if (!capabilities.has(name)) capabilities.set(name, new Set())
  capabilities.get(name).add(skill.name)
}
const sourceLock = await readFile(join(pythonRoot, 'requirements-research.lock'), 'utf8')
const sourceDistributions = JSON.parse(await readFile(join(pythonRoot, 'source-distributions.json'), 'utf8'))
const installPackages = applySourceDistributions(packages, sourceLock, sourceDistributions)
const applicationVersion = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
const baseRequirements = await readFile(join(pythonRoot, 'requirements-base.txt'), 'utf8')
const layerPolicy = JSON.parse(await readFile(join(pythonRoot, 'science-layer-policy.json'), 'utf8'))
// This standalone builder intentionally does not depend on a staged Python
// interpreter. The checked-in policy names the offline bootstrap roots, so the
// default dependency manifest can never silently grow to the full research lock.
const split = partitionLock({ packages: installPackages, edges: new Map(), roots: [...parseDirectRequirements(baseRequirements), ...(layerPolicy.baseRoots ?? [])] })
if (split.rootsNotInLock.length > 0) throw new Error(`Base requirements are not in the hashed lock: ${split.rootsNotInLock.join(', ')}`)
if (split.base.length === 0) throw new Error('Core Python manifest is empty.')
const wheelLock = parseLockedPackages(lockText)
for (const pkg of split.base) {
  const locked = wheelLock.get(normalizePackageName(pkg.name))
  if (!locked || locked.version !== pkg.version || !/^[a-f0-9]{64}$/u.test(locked.sha256)) {
    throw new Error(`Core wheel lock is missing a verified Windows artifact for ${pkg.name}==${pkg.version}.`)
  }
  pkg.sha256 = locked.sha256
}
// Tsinghua, not Aliyun: measured across all 521 pins Tsinghua resolves 520 and
// Aliyun 517, whose shortfall is CDN objects served truncated rather than
// versions it lacks. The client still lets the user switch mirror at runtime.
const index = { indexUrl: 'https://pypi.tuna.tsinghua.edu.cn/simple', trustedHost: 'pypi.tuna.tsinghua.edu.cn' }
const document = scienceManifestDocument({ environmentVersion, scienceRevision: revision, pythonVersion, applicationVersion, index, packages: split.science, keyId })
// Packages without a digest keep none: the client resolves their version from
// the index above rather than verifying bytes the mirror is free to re-publish.
document.packages = document.packages.map(pkg => {
  const names = capabilities.get(normalizePackageName(pkg.name)) ?? new Set(['shared-runtime'])
  if (['easyocr', 'torchvision', 'imagededup'].includes(normalizePackageName(pkg.name))) names.add('zerowall-image-dup')
  return { ...pkg, capabilities: [...names].sort() }
})
document.source = { lockSha256: createHash('sha256').update(lockBytes).digest('hex'), sourceLockSha256: createHash('sha256').update(sourceLock).digest('hex'), auditGeneratedAt: audit.generatedAt }
signDocument(document, privateKey, publicKey)
const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`)
const core = coreManifestDocument({ environmentVersion, revision: `${revision}-core`, pythonVersion, applicationVersion, index, packages: split.base, keyId })
signDocument(core, privateKey, publicKey)
const coreBytes = Buffer.from(`${JSON.stringify(core, null, 2)}\n`)
const argumentsList = process.argv.slice(2)
const layerIndex = argumentsList.indexOf('--layer')
if (layerIndex !== -1) {
  const layer = argumentsList[layerIndex + 1]
  const outputIndex = argumentsList.indexOf('--output')
  const outputPath = outputIndex === -1 ? undefined : resolve(argumentsList[outputIndex + 1] ?? '')
  const capabilityId = layer === 'capability' ? argumentsList[layerIndex + 2] : undefined
  if (!['core', 'science', 'capability'].includes(layer)) throw new Error('Layer must be core, science, or capability.')
  if (layer === 'capability' && (!capabilityId || !/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(capabilityId))) throw new Error('Capability layer requires a valid capability id.')
  if (!outputPath || outputPath === resolve('')) throw new Error('Independent layer builds require --output <immutable-stage-file>.')

  let selected = layer === 'core' ? core : structuredClone(document)
  if (layer === 'capability') {
    selected.layer = 'capability'
    selected.capabilityId = capabilityId
    selected.revision = `${revision}-${capabilityId}`
    selected.packages = selected.packages.filter(pkg => pkg.capabilities.includes(capabilityId))
    if (selected.packages.length === 0) throw new Error(`No locked Python packages are assigned to capability ${capabilityId}.`)
    signDocument(selected, privateKey, publicKey)
  }
  const selectedBytes = Buffer.from(`${JSON.stringify(selected, null, 2)}\n`)
  const selectedSha256 = createHash('sha256').update(selectedBytes).digest('hex')
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, selectedBytes, { flag: 'wx' })
  const layerReceipt = {
    schema: 1,
    layer,
    ...(capabilityId ? { capabilityId } : {}),
    revision: selected.revision,
    environmentVersion,
    pythonVersion,
    packageCount: selected.packages.length,
    size: selectedBytes.length,
    sha256: selectedSha256,
    signatureKey: selected.signature.keyId,
    sourceLockSha256: createHash('sha256').update(lockBytes).digest('hex'),
  }
  await writeFile(`${outputPath}.receipt.json`, `${JSON.stringify(layerReceipt, null, 2)}\n`, { flag: 'wx' })
  console.log(JSON.stringify(layerReceipt, null, 2))
} else {
await mkdir(output, { recursive: true })
await writeFile(join(output, `manifest-${revision}.json`), bytes)
await writeFile(join(output, 'latest.json'), bytes)
await writeFile(join(pythonRoot, 'dependency-manifest.json'), bytes)
await writeFile(join(output, `core-${revision}.json`), coreBytes)
await writeFile(join(output, 'core.json'), coreBytes)
await writeFile(join(pythonRoot, 'core-dependency-manifest.json'), coreBytes)
const receipt = { runtimeId: document.runtimeId, revision, environmentVersion, pythonVersion: document.pythonVersion, packageCount: document.packages.length, corePackageCount: core.packages.length, capabilitiesCount: capabilities.size, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), coreSha256: createHash('sha256').update(coreBytes).digest('hex'), signatureKey: document.signature.keyId, localOnly: true, layers: ['core', 'science', 'capability'] }
await writeFile(join(output, 'build-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`)
console.log(JSON.stringify(receipt, null, 2))
}
