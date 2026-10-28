import { createPublicKey } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { hydrateOfficialEnvironment } from '../desktop/src/main/environment-config.ts'
import { releaseRoot, root } from '../tools/build/paths.mjs'
import { openQiniuStore } from '../tools/release/qiniu-store.mjs'
import { loadResourceSigner } from '../tools/release/resource-signing.mjs'
import { digestBytes, parseEnvironmentInput, signEnvironmentConfig, verifyEnvironmentDocument } from '../tools/release/environment-config.mjs'

const stable = JSON.parse(await readFile(resolve(root, 'config/build/stable.json'), 'utf8'))
process.env.ZEROWALL_RESOURCE_PRIVATE_KEY_FILE ??= resolve(root, stable.signing.privateKeyFile)
process.env.ZEROWALL_RESOURCE_KEY_ID ??= stable.signing.keyId
const signer = await loadResourceSigner({ root, cacheRoot: resolve(root, 'artifacts/cache') })
if (signer.localOnly || signer.keyId !== stable.signing.keyId) throw new Error('Environment probe requires the configured stable resource signer.')

const now = new Date()
const probeId = `${now.toISOString().replace(/[-:.TZ]/gu, '')}-${process.pid}`
const version = `${now.getUTCFullYear()}.${String(now.getUTCMonth() + 1).padStart(2, '0')}.${String(now.getUTCDate()).padStart(2, '0')}.${now.getTime()}`
const variableName = 'ZEROWALL_ENVIRONMENT_PROBE'
const variableValue = `synthetic-probe-${probeId}`
const input = parseEnvironmentInput({ schema: 1, kind: 'environment-defaults', version, variables: { [variableName]: variableValue } })
const signedDocument = signEnvironmentConfig(input, signer.privateKey, signer.keyId)
const configBytes = Buffer.from(`${JSON.stringify(signedDocument, null, 2)}\n`)
const key = `stable/environment/probes/${probeId}/config.json`
const directory = join(releaseRoot, 'environment-probes', probeId)
await mkdir(directory, { recursive: true })
const configPath = join(directory, 'config.json')
await writeFile(configPath, configBytes)

const store = await openQiniuStore(root)
await store.upload({ path: configPath, key }, false)
const receipt = await store.verify({ path: configPath, key })
const response = await fetch(receipt.url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30_000) })
if (!response.ok) throw new Error(`Published probe download failed: HTTP ${response.status}`)
const downloaded = new Uint8Array(await response.arrayBuffer())
if (downloaded.byteLength !== configBytes.byteLength || digestBytes(downloaded) !== receipt.sha256) throw new Error('Published probe failed byte-for-byte verification.')
const downloadedDocument = JSON.parse(Buffer.from(downloaded).toString('utf8'))
const publicKey = createPublicKey(signer.privateKey)
verifyEnvironmentDocument(downloadedDocument, { [signer.keyId]: publicKey })

const pointerUrl = new URL(`/stable/environment/probes/${probeId}/latest.json`, receipt.url).toString()
const pointer = signEnvironmentConfig({
  schema: 1,
  kind: 'environment-pointer',
  resourceKind: 'environment-config',
  version,
  config: { downloadUrl: receipt.url, size: downloaded.byteLength, sha256: receipt.sha256 },
}, signer.privateKey, signer.keyId)
const pointerBytes = Buffer.from(`${JSON.stringify(pointer, null, 2)}\n`)
const pointerPath = join(directory, 'latest.json')
await writeFile(pointerPath, pointerBytes)
const pointerKey = `stable/environment/probes/${probeId}/latest.json`
await store.upload({ path: pointerPath, key: pointerKey }, false)
const pointerReceipt = await store.verify({ path: pointerPath, key: pointerKey })
const vault = new Map()
const testVault = {
  get: async name => vault.get(name),
  set: async (name, value) => { vault.set(name, value) },
  delete: async name => { vault.delete(name) },
}
const previousValue = process.env[variableName]
delete process.env[variableName]
try {
  const hydrated = await hydrateOfficialEnvironment(testVault, {
    url: pointerReceipt.url,
    publicKeys: { [signer.keyId]: publicKey.export({ type: 'spki', format: 'pem' }) },
  })
  if (hydrated.error || !hydrated.usedRemote || process.env[variableName] !== variableValue || vault.get('zerowall.environment.var.zerowall_environment_probe') !== variableValue) {
    throw new Error(`Startup hydration failed: ${hydrated.error ?? 'synthetic value was not installed'}`)
  }
  console.log(JSON.stringify({ ok: true, probeId, version, variables: hydrated.names.length, publishedObject: receipt, publishedPointer: pointerReceipt, startupHydration: true, productionPointerChanged: false }, null, 2))
} finally {
  if (previousValue === undefined) delete process.env[variableName]
  else process.env[variableName] = previousValue
}
