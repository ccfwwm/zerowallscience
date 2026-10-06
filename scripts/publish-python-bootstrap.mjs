/** Publish the immutable Python + pip bootstrap without changing any latest pointer. */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash, verify } from 'node:crypto'
import { contract, releaseRoot, root } from '../tools/build/paths.mjs'
import { verifyBootstrapManifest } from '../tools/release/python-bootstrap-manifest.mjs'
import { fileDigest } from '../tools/release/resource-catalog.mjs'
import { openQiniuStore } from '../tools/release/qiniu-store.mjs'

const input = JSON.parse(await readFile(join(root, 'config/python/bootstrap-inputs.json'), 'utf8'))
const keys = JSON.parse(await readFile(join(root, 'config/catalogs/trusted-keys.json'), 'utf8'))
const keyId = process.env.ZEROWALL_MCP_ENVIRONMENT_KEY_ID ?? 'stable-4'
const publicKey = keys[keyId]
const environmentVersion = process.env.ZEROWALL_PYTHON_BOOTSTRAP_VERSION ?? input.environmentVersion
const output = resolve(process.env.ZEROWALL_PYTHON_BOOTSTRAP_OUTPUT ?? join(releaseRoot, 'python-bootstrap', environmentVersion))
const archiveName = `zerowall-python-bootstrap-windows-x64-${environmentVersion}.zip`
const archivePath = join(output, archiveName)
const manifestPath = join(output, 'manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const archiveInfo = await stat(archivePath)
const archiveHash = await fileDigest(archivePath)
const expectedArchiveUrl = `https://zerowall.chengxunkeji.cn/stable/zerowall-python-bootstrap/windows-x64/${environmentVersion}/${archiveName}`
const { signature, ...payload } = manifest
if (!publicKey || signature?.keyId !== keyId || signature.algorithm !== 'ed25519'
  || !verify(null, Buffer.from(JSON.stringify(payload)), publicKey, Buffer.from(signature.value ?? '', 'base64'))
  || !verifyBootstrapManifest(manifest, publicKey)) throw new Error('Bootstrap manifest signature or 42-package core contract failed.')
if (manifest.applicationVersion !== contract.version || manifest.environmentVersion !== environmentVersion
  || manifest.archiveUrl !== expectedArchiveUrl || manifest.archiveSize !== archiveInfo.size || manifest.archiveSha256 !== archiveHash) {
  throw new Error('Bootstrap manifest does not match the current desktop version and archive bytes.')
}
const coreBytes = await readFile(join(root, 'resources/python/core-dependency-manifest.json'))
const coreManifest = JSON.parse(coreBytes.toString('utf8'))
const { signature: coreSignature, ...corePayload } = coreManifest
if (coreSignature?.keyId !== keyId || !verify(null, Buffer.from(JSON.stringify(corePayload)), publicKey, Buffer.from(coreSignature.value ?? '', 'base64'))
  || createHash('sha256').update(JSON.stringify(coreManifest)).digest('hex') !== manifest.source.coreManifestSha256) {
  throw new Error('Bootstrap manifest is not bound to the signed core dependency manifest in this source tree.')
}

const store = await openQiniuStore(root)
if (!manifest.archiveUrl.startsWith(`${store.base}/`)) throw new Error('Bootstrap resources must use the configured public Qiniu release domain.')
const prefix = `stable/zerowall-python-bootstrap/windows-x64/${environmentVersion}`
const assets = [
  { key: `${prefix}/${archiveName}`, path: archivePath },
  { key: `${prefix}/manifest.json`, path: manifestPath },
]
const verified = []
for (const asset of assets) {
  await store.upload(asset)
  verified.push(await store.verify(asset))
  console.log(`Verified immutable bootstrap object: ${asset.key}`)
}

const publicationDirectory = join(releaseRoot, 'publication')
await mkdir(publicationDirectory, { recursive: true })
const receipt = { applicationVersion: contract.version, environmentVersion, keyId, corePackageCount: manifest.dependencies.corePackages.length, archiveUrl: manifest.archiveUrl, assets: verified, verifiedAt: new Date().toISOString() }
await writeFile(join(publicationDirectory, `qiniu-python-bootstrap-${environmentVersion}.json`), JSON.stringify(receipt, null, 2))
console.log(`Published and publicly verified Python ${manifest.python.version} + pip bootstrap ${environmentVersion}; no update pointer was changed.`)
