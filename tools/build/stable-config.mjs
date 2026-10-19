import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export async function readStableConfig(root) {
  const config = JSON.parse(await readFile(join(root, 'config/build/stable.json'), 'utf8'))
  if (config.schema !== 1 || config.channel !== 'stable' || config.target !== 'windows-x64' || typeof config.bundlePython !== 'boolean') throw new Error('Invalid stable build configuration')
  for (const name of ['releaseBaseUrl', 'resourceBaseUrl']) if (new URL(config[name]).protocol !== 'https:') throw new Error(`Invalid ${name}`)
  for (const name of ['keepDesktopVersions', 'keepStagesPerVersion', 'keepRuntimeAssembliesPerKind', 'keepOfflineCarriers', 'keepResourceTrees']) {
    if (!Number.isSafeInteger(config.retention?.[name]) || config.retention[name] < 1) throw new Error(`Invalid stable retention: ${name}`)
  }
  if (!Number.isSafeInteger(config.retention.objectDays) || config.retention.objectDays < 1) throw new Error('Invalid stable orphan object grace period')
  if (typeof config.retention.afterPackage !== 'boolean') throw new Error('Invalid stable automatic retention setting')
  if (!/^stable-\d+$/u.test(config.signing?.keyId ?? '')) throw new Error('Stable signing key ID is required')
  if (typeof config.signing.privateKeyFile !== 'string' || !config.signing.privateKeyFile) throw new Error('Stable signing key file reference is required')
  return config
}

export function stableEnvironment(root, config, env = process.env) {
  return { ...env,
    ZEROWALL_RESOURCE_PRIVATE_KEY_FILE: env.ZEROWALL_RESOURCE_PRIVATE_KEY_FILE || resolve(root, config.signing.privateKeyFile),
    ZEROWALL_RESOURCE_KEY_ID: env.ZEROWALL_RESOURCE_KEY_ID || config.signing.keyId,
    ZEROWALL_RESOURCE_BASE_URL: env.ZEROWALL_RESOURCE_BASE_URL || config.resourceBaseUrl,
    ZEROWALL_RELEASE_BASE_URL: env.ZEROWALL_RELEASE_BASE_URL || config.releaseBaseUrl,
    ZEROWALL_TARGET: config.target,
    ZEROWALL_BUNDLE_PYTHON: config.bundlePython ? '1' : '0',
  }
}
