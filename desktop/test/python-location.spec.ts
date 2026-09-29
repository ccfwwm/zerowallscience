import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assertWritablePythonRuntimePath, normalizePythonRuntimePath, resolvePythonLocation } from '../src/main/python-location.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

describe('shared Python location', () => {
  it('uses LocalAppData on first launch without a Roaming profile', async () => {
    const root = await mkdtemp(join(tmpdir(), 'python-location-')); roots.push(root)
    const result = await resolvePythonLocation({ localAppDataPath: join(root, 'Local') })
    expect(result.runtimeRoot).toBe(join(root, 'Local', 'ZeroWall Science', 'Python'))
    expect(result.managementRoot).toBe(join(root, 'Local', 'ZeroWall Science', 'zerowall-python'))
  })

  it('prefers a writable per-user installation directory on a fresh packaged launch', async () => {
    const root = await mkdtemp(join(tmpdir(), 'python-location-')); roots.push(root)
    const install = join(root, 'install')
    const result = await resolvePythonLocation({
      localAppDataPath: join(root, 'Local'),
      applicationInstallRoot: install,
    })
    expect(result.runtimeRoot).toBe(join(install, 'Python'))
    expect(result.managementRoot).toBe(join(install, 'zerowall-python'))
    await expect(lstat(result.runtimeRoot)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('falls back to LocalAppData when the installation directory is not writable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'python-location-')); roots.push(root)
    const install = join(root, 'install-file')
    await writeFile(install, 'not a directory')
    const result = await resolvePythonLocation({
      localAppDataPath: join(root, 'Local'),
      applicationInstallRoot: install,
    })
    expect(result.runtimeRoot).toBe(join(root, 'Local', 'ZeroWall Science', 'Python'))
  })

  it('does not read or migrate an old Roaming Python pointer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'python-location-')); roots.push(root)
    const userData = join(root, 'Roaming', 'ZeroWall Science')
    const oldPython = join(userData, 'Python')
    const location = join(userData, 'python-location.json')
    await mkdir(userData, { recursive: true })
    await writeFile(location, JSON.stringify({ runtimeRoot: oldPython }))
    const install = join(root, 'install')
    const result = await resolvePythonLocation({ localAppDataPath: join(root, 'Local'), applicationInstallRoot: install })
    expect(result.runtimeRoot).toBe(join(install, 'Python'))
    await expect(readFile(result.locationPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(JSON.parse(await readFile(location, 'utf8'))).toEqual({ runtimeRoot: oldPython })
  })

  it('replaces a stale local pointer to the old Roaming default with the writable install default', async () => {
    const root = await mkdtemp(join(tmpdir(), 'python-location-')); roots.push(root)
    const local = join(root, 'Local'); const oldRoot = join(root, 'Roaming', 'zerowall-science')
    await mkdir(join(local, 'ZeroWall Science'), { recursive: true })
    await writeFile(join(local, 'ZeroWall Science', 'python-location.json'), JSON.stringify({ runtimeRoot: join(oldRoot, 'Python') }))
    const install = join(root, 'install')
    const result = await resolvePythonLocation({ localAppDataPath: local, applicationInstallRoot: install, legacyRoamingRoots: [oldRoot] })
    expect(result.runtimeRoot).toBe(join(install, 'Python'))
  })

  it('accepts a writable application install directory and data directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'python-location-')); roots.push(root)
    await expect(assertWritablePythonRuntimePath(join(root, 'app', 'Python'), join(root, 'app'))).resolves.toBeUndefined()
    await expect(assertWritablePythonRuntimePath(join(root, 'data', 'Python'), join(root, 'app'))).resolves.toBeUndefined()
  })

  it('keeps a user-selected writable install directory instead of silently reverting to Roaming', async () => {
    const root = await mkdtemp(join(tmpdir(), 'python-location-')); roots.push(root)
    const local = join(root, 'Local'); const install = join(root, 'app')
    await mkdir(join(local, 'ZeroWall Science'), { recursive: true })
    await writeFile(join(local, 'ZeroWall Science', 'python-location.json'), JSON.stringify({ runtimeRoot: join(install, 'Python') }))
    const result = await resolvePythonLocation({ localAppDataPath: local, applicationInstallRoot: install })
    expect(result.runtimeRoot).toBe(join(install, 'Python'))
    expect(result.managementRoot).toBe(join(install, 'zerowall-python'))
  })

  it('falls back from a stale saved path and rewrites the LocalAppData pointer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'python-location-')); roots.push(root)
    const local = join(root, 'Local'); const app = join(root, 'app'); const blockedParent = join(root, 'removed-drive')
    await mkdir(join(local, 'ZeroWall Science'), { recursive: true })
    await writeFile(join(local, 'ZeroWall Science', 'python-location.json'), JSON.stringify({ runtimeRoot: join(blockedParent, 'Python') }))
    await writeFile(blockedParent, 'the old drive is unavailable')

    const result = await resolvePythonLocation({
      localAppDataPath: local,
      applicationInstallRoot: app,
    })

    expect(result.runtimeRoot).toBe(join(app, 'Python'))
    expect(JSON.parse(await readFile(join(local, 'ZeroWall Science', 'python-location.json'), 'utf8'))).toEqual({ runtimeRoot: result.runtimeRoot })
  })

  it('normalizes a selected parent and an explicit Python child consistently', () => {
    expect(normalizePythonRuntimePath('C:/ZeroWall Data')).toMatch(/ZeroWall Data[\\/]Python$/u)
    expect(normalizePythonRuntimePath('C:/ZeroWall Data/Python')).toMatch(/ZeroWall Data[\\/]Python$/u)
  })
})
