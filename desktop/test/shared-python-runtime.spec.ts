import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { copyRuntimeSnapshot, isStablePythonDirectory, migrateStablePython, normalizeRuntimeCandidate, readRuntimeLayout } from '../src/main/shared-python-runtime.js'
import type { McpEnvironmentManifest } from '../src/main/mcp-environment.js'

const directories: string[] = []
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'shared-python-')); directories.push(root)
  const python = join(root, 'bio-tools', 'python')
  await mkdir(join(python, 'site-packages'), { recursive: true })
  await writeFile(join(python, 'python.exe'), 'fixture')
  await writeFile(join(python, 'python312._pth'), 'python312.zip\n.\nsite-packages\n../../user-overlay\nimport site\n')
  await writeFile(join(python, 'site-packages', 'keep.py'), 'value = 1')
  const manifest = { archiveSha256: 'a'.repeat(64), python: { relativeExecutable: 'bio-tools/python/python.exe', relativeSitePackages: 'bio-tools/python/site-packages' } } as McpEnvironmentManifest
  return { root, manifest }
}

describe('shared Python directory migration', () => {
  it('copies snapshot files without following an external directory link', async () => {
    const outer = await mkdtemp(join(tmpdir(), 'python-copy-')); directories.push(outer)
    const source = join(outer, 'source'); const target = join(outer, 'target'); const external = join(outer, 'external')
    await mkdir(source); await mkdir(external)
    await writeFile(join(source, 'package.py'), 'kept')
    await writeFile(join(external, 'private.txt'), 'must not be copied')
    await symlink(external, join(source, 'external'), 'junction')
    await copyRuntimeSnapshot(source, target)
    expect(await readFile(join(target, 'package.py'), 'utf8')).toBe('kept')
    await expect(stat(join(target, 'external', 'private.txt'))).rejects.toThrow()
    expect(await readFile(join(external, 'private.txt'), 'utf8')).toBe('must not be copied')
  })
  it('normalizes an unactivated snapshot without changing its signed provenance', async () => {
    const { root, manifest } = await fixture()
    await mkdir(join(root, 'python')); await writeFile(join(root, 'python', 'requirements.lock'), 'example==1')
    manifest.python.dependencyManifests = ['python/requirements.lock']
    const effective = await normalizeRuntimeCandidate(root, manifest)
    expect(effective.python.relativeExecutable).toBe('Python/python.exe')
    expect(manifest.python.relativeExecutable).toBe('bio-tools/python/python.exe')
    expect(await readFile(join(root, 'Python', 'Lib', 'site-packages', 'keep.py'), 'utf8')).toContain('value = 1')
    const pth = await readFile(join(root, 'Python', 'python312._pth'), 'utf8')
    expect(pth).toContain('Lib/site-packages')
    expect(pth).not.toContain('overlay')
    expect(await readFile(join(root, 'resources', 'python', 'requirements.lock'), 'utf8')).toBe('example==1')
    expect(effective.python.dependencyManifests).toEqual(['resources/python/requirements.lock'])
    expect((await readRuntimeLayout(root, manifest)).python).toEqual(effective.python)
  })

  it('refuses layout metadata that could redirect outside the snapshot', async () => {
    const { root, manifest } = await fixture()
    await writeFile(join(root, 'runtime-layout.json'), JSON.stringify({ schema: 1, archiveSha256: manifest.archiveSha256, relativeExecutable: '../../python.exe', relativeSitePackages: 'Python/Lib/site-packages' }))
    await expect(readRuntimeLayout(root, manifest)).rejects.toThrow('Invalid shared Python layout')
  })

  it('copies the active runtime into the stable Python directory without creating a junction', async () => {
    const { root, manifest } = await fixture()
    const managementRoot = join(root, 'zerowall-python')
    await mkdir(managementRoot)
    const stableRoot = await migrateStablePython(managementRoot, root, manifest)
    const python = join(stableRoot, 'Python')
    expect(stableRoot).toBe(root)
    expect((await stat(join(python, 'python.exe'))).isFile()).toBe(true)
    expect(await readFile(join(python, 'Lib', 'site-packages', 'keep.py'), 'utf8')).toContain('value = 1')
    expect((await (await import('node:fs/promises')).lstat(python)).isSymbolicLink()).toBe(false)
  })

  it('keeps an existing real stable Python directory and never replaces it with a link', async () => {
    const { root, manifest } = await fixture()
    const managementRoot = join(root, 'zerowall-python')
    const python = join(root, 'Python')
    await mkdir(managementRoot)
    await mkdir(python)
    await writeFile(join(python, 'python.exe'), 'existing stable interpreter')
    await migrateStablePython(managementRoot, root, manifest)
    expect(await readFile(join(python, 'python.exe'), 'utf8')).toBe('existing stable interpreter')
    expect((await (await import('node:fs/promises')).lstat(python)).isSymbolicLink()).toBe(false)
  })

  it('migrates an active junction into the stable directory and leaves its source intact', async () => {
    const { root, manifest } = await fixture()
    const managementRoot = join(root, 'zerowall-python')
    const oldTarget = join(root, 'old-python')
    const stablePython = join(root, 'Python')
    await mkdir(managementRoot)
    await mkdir(oldTarget)
    await writeFile(join(oldTarget, 'python.exe'), 'old junction target')
    await symlink(oldTarget, stablePython, 'junction')
    expect(await isStablePythonDirectory(root)).toBe(false)

    await migrateStablePython(managementRoot, root, manifest, undefined, true)

    expect(await isStablePythonDirectory(root)).toBe(true)
    expect(await readFile(join(stablePython, 'python.exe'), 'utf8')).toBe('fixture')
    expect(await readFile(join(oldTarget, 'python.exe'), 'utf8')).toBe('old junction target')
  })
})
