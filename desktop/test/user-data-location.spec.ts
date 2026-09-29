import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveDesktopUserDataPath } from '../src/main/user-data-location.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

describe('desktop user data location', () => {
  it('preserves an existing writable Roaming profile', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-user-data-')); roots.push(root)
    await mkdir(join(root, 'Roaming', 'zerowall-science'), { recursive: true })
    const result = resolveDesktopUserDataPath({ appDataPath: join(root, 'Roaming'), localAppDataPath: join(root, 'Local'), directoryName: 'zerowall-science' })
    expect(result).toEqual({ path: join(root, 'Roaming', 'zerowall-science'), usedLocalFallback: false })
    await writeFile(join(result.path, 'profile.txt'), 'kept')
    expect(await readFile(join(result.path, 'profile.txt'), 'utf8')).toBe('kept')
  })

  it('uses LocalAppData for a new profile without creating a Roaming product directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-user-data-')); roots.push(root)
    await mkdir(join(root, 'Roaming'))
    const result = resolveDesktopUserDataPath({ appDataPath: join(root, 'Roaming'), localAppDataPath: join(root, 'Local'), directoryName: 'zerowall-science' })
    expect(result).toEqual({ path: join(root, 'Local', 'zerowall-science'), usedLocalFallback: true })
    await expect(readFile(join(root, 'Roaming', 'zerowall-science', 'profile.txt'), 'utf8')).rejects.toThrow()
  })

  it('uses LocalAppData when Roaming is missing or blocked', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-user-data-')); roots.push(root)
    await writeFile(join(root, 'Roaming'), 'blocked directory')
    const result = resolveDesktopUserDataPath({ appDataPath: join(root, 'Roaming'), localAppDataPath: join(root, 'Local'), directoryName: 'zerowall-science' })
    expect(result).toEqual({ path: join(root, 'Local', 'zerowall-science'), usedLocalFallback: true })
  })

  it('honors an explicit writable profile path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-user-data-')); roots.push(root)
    const override = join(root, 'custom')
    const result = resolveDesktopUserDataPath({ override, localAppDataPath: join(root, 'Local'), directoryName: 'zerowall-science' })
    expect(result).toEqual({ path: override, usedLocalFallback: false })
  })
})
