import { describe, expect, it } from 'vitest'
import { createPythonTerminalLaunch, managedPythonTerminalPaths } from '../src/main/python-terminal.js'

describe('createPythonTerminalLaunch', () => {
  it('falls back to the canonical interpreter while core dependencies are not ready', () => {
    const runtimeRoot = 'C:\\Users\\Research User\\AppData\\Local\\ZeroWall Science\\Python'
    const info = { ready: false, runtimeRoot }
    expect(managedPythonTerminalPaths(info, runtimeRoot)).toEqual({
      runtimeRoot,
      executable: `${runtimeRoot}\\python.exe`,
    })
  })

  it('uses the Host-provided interpreter when available', () => {
    const runtimeRoot = 'C:\\Users\\Research User\\AppData\\Local\\ZeroWall Science\\Python'
    const executable = `${runtimeRoot}\\python.exe`
    expect(managedPythonTerminalPaths({ runtimeRoot, executable }, 'C:\\fallback')).toEqual({ runtimeRoot, executable })
  })

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
      '-NoLogo',
      '-NoExit',
      '-Command',
      `$ErrorActionPreference = 'Stop'; Set-Location -LiteralPath '${runtimeRoot}'; & '${executable}'`,
    ])
    expect(launch.env.PYTHONNOUSERSITE).toBe('1')
    expect(launch.env.PATH).toBe(`${runtimeRoot}\\generations\\generation-1;${runtimeRoot}\\generations\\generation-1\\Scripts;C:\\Windows\\System32`)
    expect(launch.env).not.toHaveProperty('PYTHONHOME')
    expect(launch.env).not.toHaveProperty('PYTHONPATH')
  })

  it('quotes apostrophes in managed paths as PowerShell literals', () => {
    const runtimeRoot = "C:\\Users\\O'Neil\\ZeroWall Science\\Python"
    const executable = `${runtimeRoot}\\python.exe`
    const launch = createPythonTerminalLaunch(runtimeRoot, executable, {})

    expect(launch.args[3]).toBe(`$ErrorActionPreference = 'Stop'; Set-Location -LiteralPath 'C:\\Users\\O''Neil\\ZeroWall Science\\Python'; & 'C:\\Users\\O''Neil\\ZeroWall Science\\Python\\python.exe'`)
  })

  it('rejects executables outside the managed runtime', () => {
    expect(() => createPythonTerminalLaunch(
      'C:\\Users\\Research User\\ZeroWall Python',
      'C:\\Python312\\python.exe',
      {},
    )).toThrow('Python executable must be inside the managed runtime.')
  })
})
