/** Desktop ships the interpreter while extension dependencies prepare after launch. */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { preparePrimaryRuntime } from '../scripts/prepare-primary-runtime.ts'

const state = vi.hoisted(() => ({ root: '', target: 'win-x64' as 'win-x64' | 'mac-arm64' | 'mac-x64', prepare: vi.fn(), smoke: vi.fn() }))
vi.mock('../../../scripts/primary-runtime/prepare.ts', () => ({ preparePrimaryRuntime: state.prepare, smokePrimaryRuntime: state.smoke }))
vi.mock('../scripts/desktop-build-paths.mjs', async importOriginal => ({
  ...await importOriginal<typeof import('../scripts/desktop-build-paths.mjs')>(),
  resolveDesktopBuildTarget: () => state.target,
  resolveDesktopTargetBuildPaths: () => ({ runtime: join(state.root, 'runtime'), downloads: join(state.root, 'downloads') }),
}))
beforeEach(() => {
  state.root = mkdtempSync(join(tmpdir(), 'desktop-online-python-'))
  state.prepare.mockImplementation(async () => { mkdirSync(join(state.root, 'runtime', 'primary-runtime'), { recursive: true }) })
})
afterEach(async () => { vi.resetAllMocks(); await rm(state.root, { recursive: true, force: true }) })
it.each(['win-x64', 'mac-arm64', 'mac-x64'] as const)('prepares %s without extension wheel resources', async (target) => {
  state.target = target
  await preparePrimaryRuntime({ deferSmoke: true })
  expect(state.prepare).toHaveBeenCalledOnce()
  expect(existsSync(join(state.root, 'runtime', 'science-python-wheels'))).toBe(false)
  expect(state.smoke).not.toHaveBeenCalled()
})
it('removes a retained build wheelhouse so a new installer cannot accidentally include it', async () => {
  const old = join(state.root, 'runtime', 'science-python-wheels', 'wheels')
  mkdirSync(old, { recursive: true }); writeFileSync(join(old, 'obsolete.whl'), 'old release cache')
  await preparePrimaryRuntime({ deferSmoke: true })
  expect(existsSync(join(state.root, 'runtime', 'science-python-wheels'))).toBe(false)
})
