import { afterEach, describe, expect, it, vi } from 'vitest'
import { isEnvironmentVariableConfigured, validateEnvironmentVariableName, ZeroWallEnvironmentService } from '../src/host/index.js'
import { fetchOfficialEnvironment } from '../src/host/official-config.js'

vi.mock('../src/host/official-config.js', () => ({ fetchOfficialEnvironment: vi.fn() }))
const names = ['ZW_ENV_REMOTE', 'ZW_ENV_CUSTOM', 'ZW_ENV_REMOVED_REMOTE', 'ZW_ENV_LEGACY']
afterEach(() => { for (const name of names) delete process.env[name] })

function fixture() {
  const vault = new Map<string, string>()
  const service = Object.create(ZeroWallEnvironmentService.prototype) as ZeroWallEnvironmentService
  Object.assign(service, {
    hydration: Promise.resolve(),
    settings: { variables: [], imageModel: {}, imageQuality: 'max' },
    secrets: { get: async (key: string) => vault.get(key), set: async (key: string, value: string) => { vault.set(key, value) }, delete: async (key: string) => { vault.delete(key) } },
    hostCtx: { settings: { replace: vi.fn().mockResolvedValue(undefined) } },
  })
  return { service, vault }
}

describe('environment configuration', () => {
  it('normalizes valid variable names and rejects unsafe names', () => {
    expect(validateEnvironmentVariableName(' sci_key ')).toBe('SCI_KEY')
    expect(() => validateEnvironmentVariableName('bad-name')).toThrow('环境变量名无效')
    expect(() => validateEnvironmentVariableName('NODE_OPTIONS')).toThrow('环境变量名无效')
    expect(() => validateEnvironmentVariableName('')).toThrow('环境变量名无效')
  })
  it('marks remote vault and inherited values as configured without exposing them', async () => {
    const vault = new Map([['zerowall.environment.var.r_platform_mcp_authorization', 'Bearer test-secret']])
    const environment = { MINERU_API_TOKEN: 'test-token', EMPTY_API_KEY: '  ' }
    const get = async (key: string) => vault.get(key)
    await expect(isEnvironmentVariableConfigured('R_PLATFORM_MCP_AUTHORIZATION', get, {})).resolves.toBe(true)
    await expect(isEnvironmentVariableConfigured('MINERU_API_TOKEN', get, environment)).resolves.toBe(true)
    await expect(isEnvironmentVariableConfigured('EMPTY_API_KEY', get, environment)).resolves.toBe(false)
    await expect(isEnvironmentVariableConfigured('MISSING_API_KEY', get, {})).resolves.toBe(false)
    await expect(isEnvironmentVariableConfigured('BROKEN_API_KEY', async () => { throw new Error('vault unavailable') }, {})).resolves.toBe(false)
  })
  it('deletes names and values, supports editing and overwrites only remote names on manual sync', async () => {
    const { service, vault } = fixture()
    await service.setVariable('ZW_ENV_REMOTE', 'local override')
    await service.setVariable('ZW_ENV_CUSTOM', 'custom value')
    await service.setVariable('ZW_ENV_REMOVED_REMOTE', 'retained former default')
    const metadata = JSON.parse(vault.get('zerowall.environment.meta')!)
    metadata.variables.ZW_ENV_REMOVED_REMOTE = { source: 'official' }
    vault.set('zerowall.environment.meta', JSON.stringify(metadata))
    await service.deleteVariable('ZW_ENV_REMOTE')
    expect(await service.listVariables()).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'ZW_ENV_REMOTE' })]))
    expect(await service.readVariable('ZW_ENV_REMOTE')).toBeUndefined()
    expect(vault.has('zerowall.environment.var.zw_env_remote')).toBe(false)
    expect(process.env.ZW_ENV_REMOTE).toBeUndefined()
    expect(JSON.parse(vault.get('zerowall.environment.meta')!).variables.ZW_ENV_REMOTE).toBeUndefined()
    vi.mocked(fetchOfficialEnvironment).mockResolvedValue({ version: '2026.10.29.1', variables: { ZW_ENV_REMOTE: 'cloud value' } })
    await service.restoreOfficialDefaults()
    expect(await service.readVariable('ZW_ENV_REMOTE')).toBe('cloud value')
    await service.setVariable('ZW_ENV_REMOTE', 'edited value')
    expect(await service.readVariable('ZW_ENV_REMOTE')).toBe('edited value')
    await service.restoreOfficialDefaults()
    expect(await service.readVariable('ZW_ENV_REMOTE')).toBe('cloud value')
    expect(await service.readVariable('ZW_ENV_CUSTOM')).toBe('custom value')
    expect(await service.readVariable('ZW_ENV_REMOVED_REMOTE')).toBe('retained former default')
    expect(JSON.parse(vault.get('zerowall.environment.meta')!).deletedNames).not.toContain('ZW_ENV_REMOTE')
    vi.mocked(fetchOfficialEnvironment).mockRejectedValueOnce(new Error('signature invalid'))
    await expect(service.restoreOfficialDefaults()).rejects.toThrow('signature invalid')
    expect(await service.readVariable('ZW_ENV_CUSTOM')).toBe('custom value')
  })
  it('migrates old disabled rows out of the list and imports them on explicit sync', async () => {
    const { service, vault } = fixture()
    vault.set('zerowall.environment.meta', JSON.stringify({ version: 1, variables: { ZW_ENV_LEGACY: { source: 'official', suppressed: true } } }))
    process.env.ZW_ENV_LEGACY = 'stale injected value'
    await (service as any).hydrate()
    expect((await service.listVariables()).find(row => row.name === 'ZW_ENV_LEGACY')).toBeUndefined()
    expect(process.env.ZW_ENV_LEGACY).toBeUndefined()
    vi.mocked(fetchOfficialEnvironment).mockResolvedValue({ version: '2026.10.29.1', variables: { ZW_ENV_LEGACY: 'cloud value' } })
    expect((await service.restoreOfficialDefaults()).find(row => row.name === 'ZW_ENV_LEGACY')).toEqual({ name: 'ZW_ENV_LEGACY', configured: true, source: 'official' })
  })
})
