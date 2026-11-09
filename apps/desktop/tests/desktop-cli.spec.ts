/** The installed CLI uses the shared pnpm distribution with Electron's package-operation environment. */

import { delimiter, join, resolve } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { runCli } from '@deepseek-ai/dsh/lib/bin.js'
import { runDesktopCli } from '../../desktop-host/src/cli.ts'
import { installOfficeEngineResolution } from '../../desktop-host/src/office-engine.ts'
import { configurePythonRuntime } from '../../desktop-host/src/python.ts'
import { configureDesktopRuntime } from '../../desktop-host/src/runtime-environment.ts'

vi.mock('@deepseek-ai/dsh/lib/bin.js', () => ({ runCli: vi.fn() }))
vi.mock('../../desktop-host/src/office-engine.ts', () => ({ installOfficeEngineResolution: vi.fn() }))
vi.mock('../../desktop-host/src/python.ts', () => ({ configurePythonRuntime: vi.fn() }))
vi.mock('../../desktop-host/src/runtime-environment.ts', () => ({ configureDesktopRuntime: vi.fn() }))

const runtime = join('Application 中文 with spaces', 'resources', 'app.asar', 'dsh')
const support = join('Application 中文 with spaces', 'resources', 'runtime')
const home = resolve('便携版 数据')
beforeEach(() => {
  vi.stubEnv('DSH_HOME', home)
  vi.mocked(configurePythonRuntime).mockResolvedValue(join(home, 'runtime'))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

it.each(['system-bin', undefined])('dispatches with bundled pnpm when PATH is %s', async (path) => {
  vi.stubEnv('PATH', path)
  await runDesktopCli(runtime, support)

  expect(configurePythonRuntime).toHaveBeenCalledExactlyOnceWith(join(support, 'primary-runtime'), home)
  expect(configureDesktopRuntime).toHaveBeenCalledExactlyOnceWith(support, join(support, 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs'))
  expect(installOfficeEngineResolution).toHaveBeenCalledExactlyOnceWith(runtime)
  expect(runCli).toHaveBeenCalledExactlyOnceWith({
    manageDesktopProfile: true,
    packageManager: {
      command: process.execPath,
      args: ['--expose-internals', join(support, 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs')],
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        DSH_DESKTOP_NODE_EXECUTABLE: process.execPath,
        PATH: `${join(support, 'bin')}${delimiter}${path ?? ''}`,
      },
    },
  })
})

it('waits for Python preparation before installing runtime hooks or dispatching the command', async () => {
  const preparation = Promise.withResolvers<string>()
  vi.mocked(configurePythonRuntime).mockReturnValueOnce(preparation.promise)
  const starting = runDesktopCli(runtime, support)
  try {
    expect(configurePythonRuntime).toHaveBeenCalledExactlyOnceWith(join(support, 'primary-runtime'), home)
    expect(installOfficeEngineResolution).not.toHaveBeenCalled()
    expect(runCli).not.toHaveBeenCalled()
  } finally {
    preparation.resolve(join(home, 'runtime'))
    await starting
  }
  expect(installOfficeEngineResolution).toHaveBeenCalledExactlyOnceWith(runtime)
  expect(runCli).toHaveBeenCalledOnce()
})

it('stops before CLI dispatch when Python preparation fails', async () => {
  const failure = new Error('fixture Python payload is missing')
  vi.mocked(configurePythonRuntime).mockRejectedValueOnce(failure)
  await expect(runDesktopCli(runtime, support)).rejects.toBe(failure)
  expect(installOfficeEngineResolution).not.toHaveBeenCalled()
  expect(runCli).not.toHaveBeenCalled()
})
