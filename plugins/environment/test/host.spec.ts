import { describe, expect, it } from 'vitest'
import { isEnvironmentVariableConfigured, validateEnvironmentVariableName } from '../src/host/index.js'

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
})
