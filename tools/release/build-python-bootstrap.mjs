import { createHash, createPrivateKey, createPublicKey, verify } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { dirname, join, resolve } from 'node:path'
import { cacheRoot, releaseRoot, root } from '../build/paths.mjs'
import { createBootstrapManifest, verifyBootstrapManifest } from './python-bootstrap-manifest.mjs'

const exec = promisify(execFile)
const input = JSON.parse(await readFile(join(root, 'config/python/bootstrap-inputs.json'), 'utf8'))
const keys = JSON.parse(await readFile(join(root, 'config/catalogs/trusted-keys.json'), 'utf8'))
const keyId = process.env.ZEROWALL_MCP_ENVIRONMENT_KEY_ID ?? 'stable-4'
const publicKey = keys[keyId]
if (!publicKey) throw new Error(`No trusted public key for ${keyId}.`)
const privateKeyPath = resolve(process.env.ZEROWALL_MCP_ENVIRONMENT_PRIVATE_KEY_FILE ?? join(root, 'scripts/env/resource-stable-4-private.pem'))
const privateKey = createPrivateKey(await readFile(privateKeyPath, 'utf8'))
if (createPublicKey(privateKey).export({ format: 'pem', type: 'spki' }).toString().trim() !== publicKey.trim()) throw new Error(`Runtime signing key does not match ${keyId}.`)
const environmentVersion = process.env.ZEROWALL_PYTHON_BOOTSTRAP_VERSION ?? input.environmentVersion
const baseUrl = (process.env.ZEROWALL_PYTHON_BOOTSTRAP_BASE_URL ?? input.manifestBaseUrl).replace(/\/$/u, '')
const output = resolve(process.env.ZEROWALL_PYTHON_BOOTSTRAP_OUTPUT ?? join(releaseRoot, 'python-bootstrap', environmentVersion))
const cache = join(cacheRoot, 'python', 'bootstrap')
const pythonArchive = join(cache, input.pythonArchive.file)
const pipWheel = join(cache, input.pipWheel.file)
await mkdir(cache, { recursive: true })
await mkdir(output, { recursive: true })
const archiveName = `zerowall-python-bootstrap-windows-x64-${environmentVersion}.zip`
const archivePath = join(output, archiveName)
if (await stat(archivePath).then(() => true, () => false)) throw new Error(`Refusing to overwrite Python bootstrap ${environmentVersion}.`)

async function fetchPinned(url, file, expectedSha256) {
  if (!await stat(file).then(info => info.isFile(), () => false)) {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error(`Bootstrap input download failed: HTTP ${response.status}`)
    await writeFile(file, Buffer.from(await response.arrayBuffer()), { flag: 'wx' })
  }
  const bytes = await readFile(file)
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== expectedSha256) throw new Error(`Pinned bootstrap input digest mismatch: ${file}`)
  return { bytes, sha256: actual }
}

const official = await fetchPinned(input.pythonArchive.url, pythonArchive, input.pythonArchive.sha256)
const pip = await fetchPinned(input.pipWheel.url, pipWheel, input.pipWheel.sha256)
const coreBytes = await readFile(join(root, 'resources/python/core-dependency-manifest.json'))
const coreManifest = JSON.parse(coreBytes.toString('utf8'))
const { signature: coreSignature, ...corePayload } = coreManifest
if (coreSignature?.keyId !== keyId || coreSignature.algorithm !== 'ed25519' || !verify(null, Buffer.from(JSON.stringify(corePayload)), publicKey, Buffer.from(coreSignature.value, 'base64'))) throw new Error('Core dependency manifest signature verification failed.')

const helper = join(root, 'tools/release/prepare-python-bootstrap.py')
const pythonCommand = process.env.ZEROWALL_MCP_BUILD_PYTHON ?? (process.platform === 'win32' ? 'py' : 'python3')
const pythonArgs = process.platform === 'win32' && pythonCommand.toLowerCase() === 'py' ? ['-3.12', helper] : [helper]
await exec(pythonCommand, [...pythonArgs, '--python-archive', pythonArchive, '--pip-wheel', pipWheel, '--output', archivePath, '--expected-python', input.pythonVersion, '--expected-pip', input.pipVersion], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
const inventory = JSON.parse(await readFile(archivePath.replace(/\.zip$/u, '.inventory.json'), 'utf8'))
const template = {
  ...input,
  pythonArchiveSha256: official.sha256,
  pipWheelSha256: pip.sha256,
  publicKey,
}
const manifest = createBootstrapManifest({
  applicationVersion: input.applicationVersion,
  environmentVersion,
  baseUrl,
  archiveName,
  archiveSize: inventory.size,
  archiveSha256: inventory.sha256,
  coreManifest,
  template,
  keyId,
  privateKey,
})
if (!verifyBootstrapManifest(manifest, publicKey)) throw new Error('Bootstrap runtime manifest did not pass verification.')
await writeFile(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
const receipt = {
  builtAt: new Date().toISOString(),
  applicationVersion: input.applicationVersion,
  environmentVersion,
  archiveUrl: manifest.archiveUrl,
  manifestUrl: `${baseUrl}/${environmentVersion}/manifest.json`,
  archiveSize: inventory.size,
  archiveSha256: inventory.sha256,
  archiveFileCount: inventory.fileCount,
  pythonVersion: input.pythonVersion,
  pipVersion: input.pipVersion,
  pythonArchiveSha256: official.sha256,
  pipWheelSha256: pip.sha256,
  corePackageCount: coreManifest.packages.length,
  coreManifestSha256: createHash('sha256').update(coreBytes).digest('hex'),
  keyId,
  updatePointerPromoted: false,
}
await writeFile(join(output, 'bootstrap-verification.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' })
console.log(JSON.stringify(receipt, null, 2))
