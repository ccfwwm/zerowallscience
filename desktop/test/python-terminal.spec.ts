import { describe, expect, it } from 'vitest'
import { createPythonTerminalLaunch } from '../src/main/python-terminal.js'

describe('createPythonTerminalLaunch', () => {
  it('opens the managed interpreter with a clean Python environment', () => {
    const runtimeRoot = 'C:\\Users\\Research User\\AppData\\Local\\ZeroWall Science\\Python'
    const executable = `${runtimeRoot}\\generations\\generation-1\\python.exe`
    const launch = createPythonTerminalLaunch(runtimeRoot, executable, {
      PATH: 'C:\\Windows\\System32',
      PYTHONHOME: 'C:\\old-python',
      PYTHONPATH: 'C:\\old-site-packages',
    })

    expect(launch.cwd).toBe(`${runtimeRoot}\\generations\\generation-1`)
    expect(launch.args).toEqual([
      '/D',
      '/K',
      'title ZeroWall Science Python && cd /d "%ZEROWALL_PYTHON_ROOT%" && "%ZEROWALL_PYTHON_EXECUTABLE%"',
    ])
    expect(launch.env.ZEROWALL_PYTHON_ROOT).toBe(runtimeRoot)
    expect(launch.env.ZEROWALL_PYTHON_EXECUTABLE).toBe(executable)
    expect(launch.env.PYTHONNOUSERSITE).toBe('1')
    expect(launch.env.PATH).toBe(`${runtimeRoot}\\generations\\generation-1;${runtimeRoot}\\generations\\generation-1\\Scripts;C:\\Windows\\System32`)
    expect(launch.env).not.toHaveProperty('PYTHONHOME')
    expect(launch.env).not.toHaveProperty('PYTHONPATH')
  })

  it('rejects executables outside the managed runtime', () => {
    expect(() => createPythonTerminalLaunch(
      'C:\\Users\\Research User\\ZeroWall Python',
      'C:\\Python312\\python.exe',
      {},
    )).toThrow('Python executable must be inside the managed runtime.')
  })
})
