/** Native handoff confirms process creation and preserves launch errors for the caller. */
import { afterEach, expect, it, vi } from 'vitest'
import { ChildProcess, spawn } from 'node:child_process'
import { launchWindowsInstaller } from '../src/windows-installer.ts'

vi.mock('node:child_process', async original => ({ ...await original<typeof import('node:child_process')>(), spawn: vi.fn() }))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

it('starts a visible installer in the existing directory with a clean Electron environment', async () => {
  const child = new ChildProcess()
  const unref = vi.spyOn(child, 'unref').mockImplementation(() => {})
  vi.mocked(spawn).mockReturnValue(child)
  vi.stubEnv('ELECTRON_RUN_AS_NODE', '1')
  vi.stubEnv('NODE_OPTIONS', '--inspect')
  vi.stubEnv('NODE_PATH', '/inherited')
  const completion = vi.fn()
  const pending = launchWindowsInstaller('C:\\cache\\setup.exe', 'C:\\Program Files\\ZeroWallScience').then(completion)
  expect(completion).not.toHaveBeenCalled()
  expect(spawn).toHaveBeenCalledWith('C:\\cache\\setup.exe', ['--updated', '--force-run', '/D=C:\\Program Files\\ZeroWallScience'], expect.objectContaining({ detached: true, windowsHide: false, stdio: 'ignore' }))
  const options = vi.mocked(spawn).mock.calls[0]![2]
  expect(options.env).not.toHaveProperty('ELECTRON_RUN_AS_NODE')
  expect(options.env).not.toHaveProperty('NODE_OPTIONS')
  expect(options.env).not.toHaveProperty('NODE_PATH')
  child.emit('spawn')
  await pending
  expect(unref).toHaveBeenCalledOnce()
  expect(completion).toHaveBeenCalledOnce()
})

it('rejects a process launch failure without reporting handoff', async () => {
  const child = new ChildProcess()
  const unref = vi.spyOn(child, 'unref').mockImplementation(() => {})
  vi.mocked(spawn).mockReturnValue(child)
  const pending = launchWindowsInstaller('missing.exe', 'C:\\ZeroWallScience')
  const failed = expect(pending).rejects.toThrow('access denied')
  child.emit('error', new Error('access denied'))
  await failed
  expect(unref).not.toHaveBeenCalled()
})
