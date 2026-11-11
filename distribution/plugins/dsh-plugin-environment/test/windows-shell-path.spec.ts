import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { win32 } from 'node:path'
import { promisify } from 'node:util'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, onTestFinished } from 'vitest'
import { installWindowsShellPath } from '../src/host/windows-shell-path.js'

describe('Windows native file action environment', () => {
  it('retains tool precedence and Path casing while supplying missing Shell tools', async () => {
    const environment = { SystemRoot: 'C:\\WINDOWS', Path: 'C:\\tools;C:\\WINDOWS\\System32' }
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    ctx.effect(() => installWindowsShellPath(environment, 'win32'))
    expect(environment.Path).toBe('C:\\tools;C:\\WINDOWS\\System32;C:\\WINDOWS;C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0')
    expect(Object.keys(environment)).not.toContain('PATH')
    await ctx.fiber.dispose()
    expect(environment.Path).toBe('C:\\tools;C:\\WINDOWS\\System32')
  })

  it('recognizes quoted, case-insensitive and trailing-separator system directories', () => {
    const environment = { SYSTEMROOT: 'C:\\WINDOWS', PATH: '"c:\\windows\\";c:/windows/System32/;C:\\Windows\\System32\\WindowsPowerShell\\v1.0' }
    const original = { ...environment }
    const dispose = installWindowsShellPath(environment, 'win32')
    expect(environment).toEqual(original)
    dispose()
    expect(environment).toEqual(original)
  })

  it('preserves later PATH changes and makes cleanup idempotent', () => {
    const environment = { SystemRoot: 'D:\\Windows', PATH: 'D:\\tools' }
    const dispose = installWindowsShellPath(environment, 'win32')
    environment.PATH = `D:\\first;${environment.PATH};D:\\last`
    dispose()
    expect(environment.PATH).toBe('D:\\first;D:\\tools;D:\\last')
    dispose()
    expect(environment.PATH).toBe('D:\\first;D:\\tools;D:\\last')
  })

  it('restores an absent PATH and supports the Windows windir fallback', () => {
    const environment: NodeJS.ProcessEnv = { WINDIR: 'D:\\Windows' }
    const dispose = installWindowsShellPath(environment, 'win32')
    expect(environment.Path).toContain('D:\\Windows')
    dispose()
    expect(environment).toEqual({ WINDIR: 'D:\\Windows' })
  })

  it('leaves a replacement or deletion owned by another environment writer intact', () => {
    const environment: NodeJS.ProcessEnv = { SystemRoot: 'C:\\Windows', Path: 'C:\\tools' }
    const dispose = installWindowsShellPath(environment, 'win32')
    environment.Path = 'C:\\replacement'
    dispose()
    expect(environment.Path).toBe('C:\\replacement')
    const disposeAgain = installWindowsShellPath(environment, 'win32')
    delete environment.Path
    disposeAgain()
    expect(environment.Path).toBeUndefined()
  })

  it.each([undefined, '', 'Windows'])('rejects an unavailable system directory before changing PATH: %s', (SystemRoot) => {
    const environment = { SystemRoot, Path: 'C:\\tools' }
    expect(() => installWindowsShellPath(environment, 'win32')).toThrow('Windows SystemRoot is unavailable')
    expect(environment.Path).toBe('C:\\tools')
  })

  it.each(['darwin', 'linux'] as const)('leaves %s environments unchanged', (platform) => {
    const environment = { PATH: '/usr/bin:/bin' }
    installWindowsShellPath(environment, platform)()
    expect(environment).toEqual({ PATH: '/usr/bin:/bin' })
  })

  it.skipIf(process.platform !== 'win32')('discovers Explorer and PowerShell from the Windows tool search with a restricted inherited PATH', async () => {
    const root = process.env.SystemRoot!
    const environment: NodeJS.ProcessEnv = { SystemRoot: root, Path: win32.join(root, 'System32') }
    const run = promisify(execFile)
    const where = win32.join(root, 'System32', 'where.exe')
    await expect(run(where, ['explorer.exe'], { env: environment, cwd: tmpdir(), windowsHide: true })).rejects.toMatchObject({ code: 1 })
    const dispose = installWindowsShellPath(environment, 'win32')
    try {
      for (const command of ['explorer.exe', 'powershell.exe']) {
        const result = await run(where, [command], { env: environment, cwd: tmpdir(), windowsHide: true })
        expect(result.stdout.toLowerCase()).toContain(command)
      }
    } finally { dispose() }
  })
})
