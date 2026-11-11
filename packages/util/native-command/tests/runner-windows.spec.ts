/** Desktop launcher selection after dependency tools replace PATH. */
import { afterEach, expect, it, vi } from 'vitest'

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('node:child_process', () => ({ execFile: execute }))
import { runNativeCommand } from '../src/runner.ts'

afterEach(() => { vi.unstubAllGlobals(); execute.mockReset() })

it.each([
  ['win32', { SystemRoot: 'C:\\Windows', Path: 'C:\\python\\Scripts' }, 'explorer.exe', 'C:\\Windows\\explorer.exe'],
  ['win32', { windir: 'D:\\Windows', Path: '' }, 'EXPLORER.EXE', 'D:\\Windows\\explorer.exe'],
  ['win32', { SystemRoot: 'C:\\Windows', Path: '' }, 'C:\\tools\\editor.exe', 'C:\\tools\\editor.exe'],
  ['linux', { Path: '/usr/bin' }, 'explorer.exe', 'explorer.exe'],
] as const)('resolves %s %s %s independently of the managed PATH', async (platform, env, command, expected) => {
  execute.mockImplementation((_command, _args, _options, callback: (error: null, stdout: string, stderr: string) => void) => {
    callback(null, '', '')
  })
  vi.stubGlobal('process', { ...process, platform, env })
  try {
    await runNativeCommand(command, ['file:///C:/work/report.docx'], new AbortController().signal, 'visible')
    expect(execute.mock.calls[0]?.[0]).toBe(expected)
    expect(execute.mock.calls[0]?.[1]).toEqual(['file:///C:/work/report.docx'])
  } finally { vi.unstubAllGlobals() }
})

it.each([{}, { SystemRoot: 'relative' }])('rejects a missing absolute Windows system directory', async (env) => {
  vi.stubGlobal('process', { ...process, platform: 'win32', env })
  try {
    await expect(runNativeCommand('explorer.exe', [], new AbortController().signal, 'visible'))
      .rejects.toThrow('Windows SystemRoot is unavailable')
    expect(execute).not.toHaveBeenCalled()
  } finally { vi.unstubAllGlobals() }
})
