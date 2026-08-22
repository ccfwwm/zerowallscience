import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { DesktopCompatController } from '../src/host/index.js'

function handle() {
  return {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    done: Promise.resolve({ exitCode: 0, signal: null }),
    cancel: vi.fn(),
  }
}

describe('Desktop compatibility public boundary', () => {
  it('uses the active generation profile and runPlugin for package mutations', () => {
    const operation = handle()
    const profiles = {
      current: { name: 'desktop', dir: 'C:/profiles/desktop' },
      list: vi.fn(() => [{ name: 'desktop', dir: 'C:/profiles/desktop' }]),
      select: vi.fn(async () => {}),
    }
    const pnpm = { run: vi.fn(), runPlugin: vi.fn(() => operation) }
    const service = new DesktopCompatController(profiles, pnpm)

    expect(service.environment).toBe('desktop')
    expect(service.currentProfile).toEqual(profiles.current)
    expect(service.listProfiles()).toEqual(profiles.list())
    service.install('@example/plugin', 'C:/work')
    service.update('C:/work')
    service.remove('@example/plugin', 'C:/work')
    service.repair('C:/work')
    expect(pnpm.run).not.toHaveBeenCalled()
    expect(pnpm.runPlugin).toHaveBeenNthCalledWith(1, ['add', '@example/plugin'], 'C:/work', undefined)
    expect(pnpm.runPlugin).toHaveBeenNthCalledWith(2, ['update'], 'C:/work', undefined)
    expect(pnpm.runPlugin).toHaveBeenNthCalledWith(3, ['remove', '@example/plugin'], 'C:/work', undefined)
    expect(pnpm.runPlugin).toHaveBeenNthCalledWith(4, ['install', '--no-frozen-lockfile'], 'C:/work', undefined)
  })

  it('keeps an ordinary DSH fallback headless and rejects desktop-only operations', async () => {
    const service = new DesktopCompatController(undefined, undefined)
    expect(service.environment).toBe('dsh')
    expect(service.listProfiles()).toEqual([])
    await expect(service.selectProfile('desktop')).rejects.toThrow(/only available/i)
    expect(() => service.update('C:/work')).toThrow(/only available/i)
  })

  it('rejects partial providers, unsafe paths, and invalid specifiers', () => {
    expect(() => new DesktopCompatController({ current: { name: 'x', dir: 'C:/x' }, list: () => [], select: async () => {} }, undefined)).toThrow(/together/)
    const pnpm = { runPlugin: vi.fn(() => handle()), run: vi.fn() }
    const service = new DesktopCompatController({ current: { name: 'x', dir: 'C:/x' }, list: () => [], select: async () => {} }, pnpm)
    expect(() => service.install('bad\nname', 'C:/work')).toThrow(/specifier/)
    expect(() => service.install('x', 'relative')).toThrow(/absolute path/)
    expect(pnpm.runPlugin).not.toHaveBeenCalled()
  })

  it('delegates profile selection and preserves the restart boundary', async () => {
    const select = vi.fn(async () => {})
    const service = new DesktopCompatController({
      current: { name: 'desktop', dir: 'C:/profiles/desktop' },
      list: () => [],
      select,
    }, { run: vi.fn(), runPlugin: vi.fn(() => handle()) })
    await service.selectProfile('preview')
    expect(select).toHaveBeenCalledWith('preview')
  })
})
