import { createPrivateKey, createPublicKey, randomBytes, sign, verify } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export async function readStableConfig(root) {
  const config = JSON.parse(await readFile(join(root, 'config/build/stable.json'), 'utf8'))
  if (config.schema !== 1 || config.channel !== 'stable' || config.target !== 'windows-x64' || config.bundlePython !== true) throw new Error('Invalid stable build configuration')
  for (const name of ['releaseBaseUrl', 'resourceBaseUrl']) if (new URL(config[name]).protocol !== 'https:') throw new Error(`Invalid ${name}`)
  for (const name of ['keepDesktopVersions', 'keepStagesPerVersion', 'keepRuntimeAssembliesPerKind', 'keepOfflineCarriers', 'keepResourceTrees']) {
    if (!Number.isSafeInteger(config.retention?.[name]) || config.retention[name] < 1) throw new Error(`Invalid stable retention: ${name}`)
  }
  if (config.retention.keepDesktopVersions !== 1) throw new Error('Stable packaging keeps exactly one desktop version')
  if (!Number.isSafeInteger(config.retention.objectDays) || config.retention.objectDays < 1) throw new Error('Invalid stable orphan object grace period')
  if (typeof config.retention.afterPackage !== 'boolean') throw new Error('Invalid stable automatic retention setting')
  if (!/^stable-\d+$/u.test(config.signing?.keyId ?? '')) throw new Error('Stable signing key ID is required')
  if (config.signing.keyId !== 'stable-4') throw new Error('Stable packaging is pinned to the stable-4 signing key')
  if (typeof config.signing.privateKeyFile !== 'string' || !config.signing.privateKeyFile) throw new Error('Stable signing key file reference is required')
  return config
}

export async function verifyStableSigner(root, config) {
  const privateKey = createPrivateKey(await readFile(resolve(root, config.signing.privateKeyFile), 'utf8'))
  const keys = JSON.parse(await readFile(join(root, 'config/catalogs/trusted-keys.json'), 'utf8'))
  const publicKey = createPublicKey(keys[config.signing.keyId])
  const challenge = randomBytes(32)
  const signature = sign(null, challenge, privateKey)
  if (!verify(null, challenge, publicKey, signature)) throw new Error('Stable signing private key does not match the configured stable-4 public key')
}

export function stableEnvironment(root, config, env = process.env) {
  const managed = {
    ZEROWALL_CHANNEL: 'stable',
    ZEROWALL_RESOURCE_PRIVATE_KEY_FILE: resolve(root, config.signing.privateKeyFile),
    ZEROWALL_RESOURCE_KEY_ID: config.signing.keyId,
    ZEROWALL_RESOURCE_BASE_URL: config.resourceBaseUrl,
    ZEROWALL_RELEASE_BASE_URL: config.releaseBaseUrl,
    ZEROWALL_TARGET: config.target,
    ZEROWALL_BUNDLE_PYTHON: config.bundlePython ? '1' : '0',
  }
  for (const [name, value] of Object.entries(managed)) {
    if (Object.prototype.hasOwnProperty.call(env, name) && env[name] !== value) throw new Error(`Stable packaging does not accept an override for ${name}; use config/build/stable.json`)
    if (value.includes('\n') || value.includes('\r')) throw new Error(`Invalid stable setting: ${name}`)
  }
  return { ...env, ...managed }
}
