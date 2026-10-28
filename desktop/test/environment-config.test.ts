import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hydrateOfficialEnvironment, ENVIRONMENT_METADATA_KEY } from '../src/main/environment-config.js'

const variableNames = ['ZW_ENV_OFFICIAL_NEW', 'ZW_ENV_OFFICIAL_OLD', 'ZW_ENV_USER', 'ZW_ENV_SUPPRESSED', 'ZW_ENV_LEGACY', 'ZW_ENV_SYSTEM_OVERRIDE', 'ZW_ENV_SYSTEM_SUPPRESSED']
afterEach(() => { for (const name of variableNames) delete process.env[name] })
beforeEach(() => { for (const name of variableNames) delete process.env[name] })

function signed(document: Record<string, unknown>, privateKey: KeyObject) {
  const { signature: _signature, ...payload } = document
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
  return { ...document, signature: { algorithm: 'ed25519', keyId: 'test', value: sign(null, Buffer.from(JSON.stringify(canonical(payload))), privateKey).toString('base64') } }
}

describe('official environment configuration', () => {
  it('fills missing values, refreshes official values, and preserves local or suppressed values', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const variables = {
      ZW_ENV_OFFICIAL_NEW: 'new default',
      ZW_ENV_OFFICIAL_OLD: 'updated default',
      ZW_ENV_USER: 'remote value must not replace local',
      ZW_ENV_SUPPRESSED: 'must remain cleared',
      ZW_ENV_LEGACY: 'legacy local wins',
      ZW_ENV_SYSTEM_OVERRIDE: 'remote must not replace inherited local value',
      ZW_ENV_SYSTEM_SUPPRESSED: 'explicit startup value remains available',
    }
    const configBytes = Buffer.from(JSON.stringify(signed({ schema: 1, kind: 'environment-defaults', version: '2026.10.28.2', variables }, privateKey)))
    const baseUrl = 'https://resources.example/stable/environment'
    const pointer = signed({ schema: 1, kind: 'environment-pointer', resourceKind: 'environment-config', version: '2026.10.28.2', config: { downloadUrl: `${baseUrl}/2026.10.28.2/config.json`, size: configBytes.length, sha256: createHash('sha256').update(configBytes).digest('hex') } }, privateKey)
    const fetcher: typeof fetch = async input => String(input).endsWith('latest.json')
      ? new Response(JSON.stringify(pointer), { status: 200 })
      : new Response(configBytes, { status: 200 })
    const vault = new Map<string, string>([
      [ENVIRONMENT_METADATA_KEY, JSON.stringify({ version: 1, variables: {
        ZW_ENV_OFFICIAL_OLD: { source: 'official', version: '2026.10.28.1' },
        ZW_ENV_USER: { source: 'user' },
        ZW_ENV_SUPPRESSED: { source: 'official', suppressed: true },
        ZW_ENV_SYSTEM_OVERRIDE: { source: 'official', version: '2026.10.28.1' },
        ZW_ENV_SYSTEM_SUPPRESSED: { source: 'official', suppressed: true },
      } })],
      ['zerowall.environment.var.zw_env_official_old', 'old official value'],
      ['zerowall.environment.var.zw_env_user', 'manually saved value'],
      ['zerowall.environment.var.zw_env_legacy', 'legacy local wins'],
      ['zerowall.environment.var.zw_env_system_override', 'previous official value'],
    ])
    process.env.ZW_ENV_SYSTEM_OVERRIDE = 'inherited machine value'
    process.env.ZW_ENV_SYSTEM_SUPPRESSED = 'inherited machine value'
    const storage = {
      get: async key => vault.get(key),
      set: async (key, value) => { vault.set(key, value) },
      delete: async key => { vault.delete(key) },
    } satisfies import('../src/main/environment-config.js').EnvironmentVault
    const options = { url: `${baseUrl}/latest.json`, publicKeys: { test: String(publicKey.export({ type: 'spki', format: 'pem' })) }, fetcher }
    const result = await hydrateOfficialEnvironment(storage, options)

    expect(result.usedRemote).toBe(true)
    expect(process.env.ZW_ENV_OFFICIAL_NEW).toBe('new default')
    expect(process.env.ZW_ENV_OFFICIAL_OLD).toBe('updated default')
    expect(process.env.ZW_ENV_USER).toBe('manually saved value')
    expect(process.env.ZW_ENV_LEGACY).toBe('legacy local wins')
    expect(process.env.ZW_ENV_SUPPRESSED).toBeUndefined()
    expect(process.env.ZW_ENV_SYSTEM_OVERRIDE).toBe('inherited machine value')
    expect(process.env.ZW_ENV_SYSTEM_SUPPRESSED).toBe('inherited machine value')
    expect(vault.get('zerowall.environment.var.zw_env_official_old')).toBe('updated default')
    expect(JSON.parse(vault.get(ENVIRONMENT_METADATA_KEY)!).variables.ZW_ENV_USER.source).toBe('user')
    expect(JSON.parse(vault.get(ENVIRONMENT_METADATA_KEY)!).variables.ZW_ENV_SYSTEM_OVERRIDE.source).toBe('user')

    // Simulate a running Host editing the shared vault while the main process
    // still contains its original injected defaults, then restarting the Host.
    const metadata = JSON.parse(vault.get(ENVIRONMENT_METADATA_KEY)!)
    metadata.variables.ZW_ENV_OFFICIAL_NEW = { source: 'user' }
    metadata.variables.ZW_ENV_OFFICIAL_OLD = { source: 'official', suppressed: true }
    vault.set('zerowall.environment.var.zw_env_official_new', 'new manual value')
    vault.delete('zerowall.environment.var.zw_env_official_old')
    vault.set(ENVIRONMENT_METADATA_KEY, JSON.stringify(metadata))
    await hydrateOfficialEnvironment(storage, options)
    expect(process.env.ZW_ENV_OFFICIAL_NEW).toBe('new manual value')
    expect(process.env.ZW_ENV_OFFICIAL_OLD).toBeUndefined()
    expect(vault.has('zerowall.environment.var.zw_env_official_old')).toBe(false)
    expect(JSON.parse(vault.get(ENVIRONMENT_METADATA_KEY)!).variables.ZW_ENV_OFFICIAL_OLD.suppressed).toBe(true)
    await hydrateOfficialEnvironment(storage, options)
    expect(process.env.ZW_ENV_OFFICIAL_NEW).toBe('new manual value')
    expect(process.env.ZW_ENV_OFFICIAL_OLD).toBeUndefined()
  })

  it('keeps local values and reports a signature failure', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    process.env.ZW_ENV_OFFICIAL_NEW = 'local value'
    const configBytes = Buffer.from(JSON.stringify({ schema: 1, kind: 'environment-defaults', version: '2026.10.28.1', variables: { ZW_ENV_OFFICIAL_NEW: 'remote value' } }))
    const pointer = signed({ schema: 1, kind: 'environment-pointer', resourceKind: 'environment-config', version: '2026.10.28.1', config: { downloadUrl: 'https://resources.example/stable/environment/config.json', size: configBytes.length, sha256: createHash('sha256').update(configBytes).digest('hex') } }, privateKey)
    const vault = new Map<string, string>()
    const badPointer = { ...pointer, version: 'tampered' }
    const result = await hydrateOfficialEnvironment({ get: async key => vault.get(key), set: async (key, value) => { vault.set(key, value) } }, {
      url: 'https://resources.example/stable/environment/latest.json',
      publicKeys: { test: String(publicKey.export({ type: 'spki', format: 'pem' })) },
      fetcher: async () => new Response(JSON.stringify(badPointer), { status: 200 }),
    })
    expect(result.usedRemote).toBe(false)
    expect(result.error).toContain('签名无效')
    expect(process.env.ZW_ENV_OFFICIAL_NEW).toBe('local value')
  })
})
