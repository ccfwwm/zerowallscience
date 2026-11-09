/** Carrier Python installation and environment publication using physical, offline payloads. */
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { readPrimaryRuntime, workspaceDependencyPaths, type PrimaryRuntimeManifest } from '@deepseek-ai/dsh-tool-workspace-dependencies'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { configurePythonRuntime } from '../src/python.ts'
import { writePythonWheelhouseFixture } from './fixtures/python-wheelhouse.ts'

const directories: string[] = []
beforeEach(() => {
  vi.stubEnv('DSH_PYTHON_EXECUTABLE', 'previous-interpreter')
  vi.stubEnv('DSH_PYTHON_SITE_PACKAGES', 'previous-packages')
  vi.stubEnv('ZEROWALL_PYTHON_DEPENDENCIES_ROOT', undefined)
  vi.stubEnv('ZEROWALL_PYTHON_WHEELHOUSE', 'previous-wheelhouse')
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(directories.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'desktop-python-'))
  directories.push(directory)
  const source = join(directory, '安装 资源', 'primary-runtime')
  const home = join(directory, '便携版 数据')
  const manifest = {
    desktopVersion: '0.2.2-rc.1.test', platform: process.platform, arch: process.arch,
    payloadDigest: 'a'.repeat(64), python: '3.12.14', pythonPackages: { 'python-pptx': '1.0.2' },
  } satisfies PrimaryRuntimeManifest
  const paths = workspaceDependencyPaths(source, manifest)
  await mkdir(dirname(paths.python), { recursive: true })
  await mkdir(paths.pythonPackages, { recursive: true })
  await writeFile(paths.python, 'bundled Python payload')
  await writeFile(join(paths.pythonPackages, 'bundled.py'), 'bundled dependency')
  await writeFile(join(source, 'runtime.json'), JSON.stringify(manifest))
  const wheelhouse = writePythonWheelhouseFixture(join(dirname(source), 'science-python-wheels'))
  return { directory, source, home, manifest, paths, wheelhouse }
}

it('installs the payload under a portable DSH_HOME with Chinese and spaces before publishing Python paths', async () => {
  const { source, home, manifest } = await fixture()
  vi.stubEnv('DSH_HOME', home)
  const root = await configurePythonRuntime(source, resolveDshHome())
  expect(root).toBe(join(home, 'dsh-runtimes', 'primary', `${manifest.desktopVersion}-${manifest.payloadDigest}`))
  const paths = workspaceDependencyPaths(root, manifest)
  expect(await readPrimaryRuntime(root)).toEqual(manifest)
  expect(await readFile(paths.python, 'utf8')).toBe('bundled Python payload')
  expect(await readFile(join(paths.pythonPackages, 'bundled.py'), 'utf8')).toBe('bundled dependency')
  expect(process.env.DSH_PYTHON_EXECUTABLE).toBe(paths.python)
  expect(process.env.DSH_PYTHON_SITE_PACKAGES).toBe(paths.pythonPackages)
  expect(process.env.ZEROWALL_PYTHON_DEPENDENCIES_ROOT).toBe(join(home, 'zerowall', 'python'))
  expect(process.env.ZEROWALL_PYTHON_WHEELHOUSE).toBe('previous-wheelhouse')
  await expect(readFile(join(root, 'science-python-wheels', 'runtime.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('preserves an explicit dependency home while replacing stale interpreter locations', async () => {
  const { source, home, directory, manifest } = await fixture()
  const dependencies = join(directory, '依赖 缓存')
  vi.stubEnv('ZEROWALL_PYTHON_DEPENDENCIES_ROOT', dependencies)
  const root = await configurePythonRuntime(source, home)
  expect(process.env.DSH_PYTHON_EXECUTABLE).toBe(workspaceDependencyPaths(root, manifest).python)
  expect(process.env.DSH_PYTHON_SITE_PACKAGES).toBe(workspaceDependencyPaths(root, manifest).pythonPackages)
  expect(process.env.ZEROWALL_PYTHON_DEPENDENCIES_ROOT).toBe(dependencies)
})

it('reuses an installed payload without rewriting its interpreter or additional files', async () => {
  const { source, home, manifest, paths: sourcePaths } = await fixture()
  const root = await configurePythonRuntime(source, home)
  const installed = workspaceDependencyPaths(root, manifest)
  await writeFile(join(installed.pythonPackages, 'retained.py'), 'retained local file')
  await writeFile(sourcePaths.python, 'changed source under the same identity')
  expect(await configurePythonRuntime(source, home)).toBe(root)
  expect(await readFile(installed.python, 'utf8')).toBe('bundled Python payload')
  expect(await readFile(join(installed.pythonPackages, 'retained.py'), 'utf8')).toBe('retained local file')
})

it('keeps the previous base intact when a new payload identity is installed', async () => {
  const { source, home, manifest, paths: sourcePaths } = await fixture()
  const first = await configurePythonRuntime(source, home)
  const next = { ...manifest, payloadDigest: 'b'.repeat(64) }
  await writeFile(join(source, 'runtime.json'), JSON.stringify(next))
  await writeFile(sourcePaths.python, 'next Python payload')
  const second = await configurePythonRuntime(source, home)
  expect(second).toBe(join(home, 'dsh-runtimes', 'primary', `${next.desktopVersion}-${next.payloadDigest}`))
  expect(second).not.toBe(first)
  expect(await readFile(workspaceDependencyPaths(first, manifest).python, 'utf8')).toBe('bundled Python payload')
  expect(await readFile(workspaceDependencyPaths(second, next).python, 'utf8')).toBe('next Python payload')
  expect(process.env.DSH_PYTHON_EXECUTABLE).toBe(workspaceDependencyPaths(second, next).python)
})

it('retains the previous base when Desktop changes without a new locked payload', async () => {
  const { source, home, manifest } = await fixture()
  const root = await configurePythonRuntime(source, home)
  const marker = join(workspaceDependencyPaths(root, manifest).pythonPackages, 'retained.py')
  await writeFile(marker, 'existing base')
  await writeFile(join(source, 'runtime.json'), JSON.stringify({ ...manifest, desktopVersion: '0.2.2-rc.1.next' }))
  const next = await configurePythonRuntime(source, home)
  expect(next).not.toBe(root)
  expect(await readFile(marker, 'utf8')).toBe('existing base')
  expect(process.env.DSH_PYTHON_EXECUTABLE).toBe(workspaceDependencyPaths(next, manifest).python)
})

it('publishes the relocated portable home without restoring paths to its previous location', async () => {
  const { source, home, manifest, directory } = await fixture()
  vi.stubEnv('DSH_HOME', home)
  const previous = await configurePythonRuntime(source, resolveDshHome())
  const marker = join(workspaceDependencyPaths(previous, manifest).pythonPackages, 'retained.py')
  await writeFile(marker, 'portable contents')
  const movedHome = join(directory, '移动后 数据')
  await rename(home, movedHome)
  vi.stubEnv('DSH_HOME', movedHome)
  vi.stubEnv('ZEROWALL_PYTHON_DEPENDENCIES_ROOT', undefined)
  const moved = await configurePythonRuntime(source, resolveDshHome())
  const paths = workspaceDependencyPaths(moved, manifest)
  expect(moved).toBe(join(movedHome, 'dsh-runtimes', 'primary', `${manifest.desktopVersion}-${manifest.payloadDigest}`))
  expect(await readFile(join(paths.pythonPackages, 'retained.py'), 'utf8')).toBe('portable contents')
  expect(process.env.DSH_PYTHON_EXECUTABLE).toBe(paths.python)
  expect(process.env.DSH_PYTHON_SITE_PACKAGES).toBe(paths.pythonPackages)
  expect(process.env.ZEROWALL_PYTHON_DEPENDENCIES_ROOT).toBe(join(movedHome, 'zerowall', 'python'))
})

it.each(['metadata', 'interpreter'] as const)('does not publish a partial runtime when its %s is missing', async (missing) => {
  const { source, home, paths } = await fixture()
  await rm(missing === 'metadata' ? join(source, 'runtime.json') : paths.python)
  await expect(configurePythonRuntime(source, home)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(process.env.DSH_PYTHON_EXECUTABLE).toBe('previous-interpreter')
  expect(process.env.DSH_PYTHON_SITE_PACKAGES).toBe('previous-packages')
  expect(process.env.ZEROWALL_PYTHON_DEPENDENCIES_ROOT).toBeUndefined()
  expect(process.env.ZEROWALL_PYTHON_WHEELHOUSE).toBe('previous-wheelhouse')
})

it.each(['missing', 'changed', 'platform'] as const)('starts independently of a retained build wheelhouse that is %s', async (failure) => {
  const { source, home, wheelhouse } = await fixture()
  if (failure === 'missing') await rm(join(wheelhouse.wheels, wheelhouse.filename))
  if (failure === 'changed') await writeFile(join(wheelhouse.wheels, wheelhouse.filename), 'changed wheel')
  if (failure === 'platform') await writeFile(wheelhouse.manifestPath, JSON.stringify({ ...wheelhouse.manifest, arch: 'invalid' }))
  await configurePythonRuntime(source, home)
  expect(process.env.DSH_PYTHON_EXECUTABLE).not.toBe('previous-interpreter')
  expect(process.env.DSH_PYTHON_SITE_PACKAGES).not.toBe('previous-packages')
  expect(process.env.ZEROWALL_PYTHON_WHEELHOUSE).toBe('previous-wheelhouse')
  expect(process.env.ZEROWALL_PYTHON_DEPENDENCIES_ROOT).toBe(join(home, 'zerowall', 'python'))
})
