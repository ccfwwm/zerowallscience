import { describe, expect, it } from 'vitest'
import { validateEnvironmentVariableName } from '../src/host/index.js'

describe('environment configuration', () => {
  it('normalizes valid variable names and rejects unsafe names', () => {
    expect(validateEnvironmentVariableName(' sci_key ')).toBe('SCI_KEY')
    expect(() => validateEnvironmentVariableName('bad-name')).toThrow('环境变量名无效')
    expect(() => validateEnvironmentVariableName('NODE_OPTIONS')).toThrow('环境变量名无效')
    expect(() => validateEnvironmentVariableName('')).toThrow('环境变量名无效')
  })
})
