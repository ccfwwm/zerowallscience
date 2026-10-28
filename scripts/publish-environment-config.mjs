import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { sign } from 'node:crypto'
import { join, resolve } from 'node:path'
import { root, releaseRoot } from '../tools/build/paths.mjs'
import { openQiniuStore } from '../tools/release/qiniu-store.mjs'
import { loadResourceSigner } from '../tools/release/resource-signing.mjs'
import { digestBytes, parseEnvironmentInput, signEnvironmentConfig, signingBytes } from '../tools/release/environment-config.mjs'

const source = process.env.ZEROWALL_ENVIRONMENT_CONFIG_FILE || resolve(root, 'scripts/env/environment-defaults.json')
const stable = JSON.parse(await readFile(resolve(root, 'config/build/stable.json'), 'utf8'))
process.env.ZEROWALL_RESOURCE_PRIVATE_KEY_FILE ??= resolve(root, stable.signing.privateKeyFile)
process.env.ZEROWALL_RESOURCE_KEY_ID ??= stable.signing.keyId
const input = parseEnvironmentInput(JSON.parse(await readFile(source, 'utf8')))
const { privateKey, keyId } = await loadResourceSigner({ root, cacheRoot: resolve(root, 'artifacts/cache') })
if (keyId !== process.env.ZEROWALL_RESOURCE_KEY_ID) throw new Error(`Configured signer key mismatch: ${keyId}`)
const document = signEnvironmentConfig(input, privateKey, keyId)
const configBytes = Buffer.from(JSON.stringify(document, null, 2) + '\n')
const directory = join(releaseRoot, 'environment', input.version)
await mkdir(directory, { recursive: true })
const localConfig = join(directory, 'config.json')
await writeFile(localConfig, configBytes)

try {
  const store = await openQiniuStore(root)
  const key = `stable/environment/${input.version}/config.json`
  const publicUrl = `${store.base}/${key}`
  const configReceipt = await store.upload({ path: localConfig, key }, false)
  const pointerUnsigned = {
    schema: 1,
    kind: 'environment-pointer',
    resourceKind: 'environment-config',
    version: input.version,
    config: { downloadUrl: publicUrl, size: configBytes.length, sha256: digestBytes(configBytes) },
  }
  const pointer = { ...pointerUnsigned, signature: { algorithm: 'ed25519', keyId, value: '' } }
  pointer.signature.value = sign(null, signingBytes(pointer), privateKey).toString('base64')
  const pointerPath = join(directory, 'latest.json')
  const pointerBytes = Buffer.from(JSON.stringify(pointer, null, 2) + '\n')
  await writeFile(pointerPath, pointerBytes)
  const pointerKey = 'stable/environment/latest.json'
  await store.upload({ path: pointerPath, key: pointerKey }, true)
  const pointerReceipt = await store.verify({ path: pointerPath, key: pointerKey })
  await store.refresh([pointerKey])
  console.log(JSON.stringify({ ok: true, version: input.version, variables: Object.keys(input.variables).length, config: configReceipt ?? { key, url: publicUrl, bytes: configBytes.length, sha256: digestBytes(configBytes) }, pointer: pointerReceipt }, null, 2))
} finally {
  // Do not leave a cleartext copy of the remotely published variables in the release tree.
  await rm(localConfig, { force: true })
}
