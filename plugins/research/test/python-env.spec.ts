import { describe, expect, it } from 'vitest'
import { pythonChildEnvironment } from '../src/host/python-env.js'

describe('research Python child environment', () => {
  it('keeps the managed interpreter first and removes inherited system Python selectors', () => {
    const pathKey = process.platform === 'win32' ? 'Path' : 'PATH'
    const systemPath = process.platform === 'win32'
      ? 'C:\\Program Files\\Python312;C:\\Users\\tester\\AppData\\Local\\Microsoft\\WindowsApps;C:\\work\\.venv\\Scripts;C:\\Windows\\System32;C:\\softworks\\nodejs'
      : '/usr/local/bin'
    const base: NodeJS.ProcessEnv = {
      [pathKey]: systemPath,
      ZEROWALL_PYTHON_RUNTIME_ROOT: 'C:\\ZeroWall\\Python',
      PYTHONHOME: 'C:\\Program Files\\Python312',
      PYTHONPATH: 'C:\\system\\site-packages',
      VIRTUAL_ENV: 'C:\\work\\.venv',
      CONDA_PREFIX: 'C:\\conda',
    }
    const env = pythonChildEnvironment(undefined, undefined, base)
    const path = env[pathKey] ?? ''
    expect(path.split(process.platform === 'win32' ? ';' : ':').slice(0, 2)).toEqual([
      'C:\\ZeroWall\\Python', 'C:\\ZeroWall\\Python\\Scripts',
    ])
    if (process.platform === 'win32') {
      expect(path).toContain('C:\\Windows\\System32')
      expect(path).toContain('C:\\softworks\\nodejs')
      expect(path).not.toMatch(/Python312|WindowsApps|\\.venv\\/iu)
    }
    expect(env.ZEROWALL_PYTHON_EXECUTABLE).toBe('C:\\ZeroWall\\Python\\python.exe')
    expect(env.PYTHONHOME).toBeUndefined()
    expect(env.PYTHONPATH).toBeUndefined()
    expect(env.VIRTUAL_ENV).toBeUndefined()
    expect(env.CONDA_PREFIX).toBeUndefined()
  })
})
