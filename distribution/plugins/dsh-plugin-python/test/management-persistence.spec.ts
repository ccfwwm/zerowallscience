import { Context } from '@deepseek-ai/cordis'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { PythonManagement, type Config } from '../src/host/management.js'
import { UvRuntime } from '../src/host/uv-runtime.js'

const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'python-settings-')); roots.push(root)
  const config: Config = { basePython: join(root, 'python'), environmentRoot: join(root, 'dependencies'), assetsRoot: join(root, 'assets'), uv: '', indexUrl: 'https://pypi.org/simple', timeoutMs: 20000 }
  const paths = { root: join(root, 'environment'), executable: join(root, 'python'), sitePackages: join(root, 'site-packages'), snapshotRoot: join(root, 'environment') }
  const prepare = vi.spyOn(UvRuntime.prototype, 'prepare').mockResolvedValue(paths)
  return { root, config, prepare }
}

async function mount(config: Config) {
  const ctx = new Context(); contexts.push(ctx)
  const fiber = ctx.plugin({ name: 'python-settings-fixture', apply(ctx: Context) { new PythonManagement(ctx, { ...config }) } })
  await fiber
  const service = ctx.zerowallPythonManagement
  await service.ready()
  return { service, fiber }
}

it('persists a confirmed package index and loads it before the next startup preparation', async () => {
  const f = await fixture(); const first = await mount(f.config)
  await first.service.request({ action: 'configure', requestId: 'configure', mirrorUrl: 'https://packages.example.org/simple', confirm: true })
  const saved = JSON.parse(await readFile(join(f.config.environmentRoot, 'settings.json'), 'utf8'))
  expect(saved).toEqual({ schema: 1, indexUrl: 'https://packages.example.org/simple' })
  await first.fiber.dispose()
  f.prepare.mockImplementation(function(this: UvRuntime) { expect(this.config.indexUrl).toBe(saved.indexUrl); return Promise.resolve({ root: 'active', executable: 'python', sitePackages: 'packages', snapshotRoot: 'active' }) })
  const second = await mount(f.config)
  const status = await second.service.request({ action: 'status', requestId: 'status' })
  expect(status.mirrorUrl).toBe(saved.indexUrl)
})

it('searches the public package catalog independently from a blocked install mirror', async () => {
  const f = await fixture()
  f.config.indexUrl = 'https://pypi.tuna.tsinghua.edu.cn/simple'
  f.config.catalogIndexUrl = 'https://pypi.org/simple/'
  const search = vi.spyOn((await import('../src/host/package-catalog.js')).PythonPackageCatalog.prototype, 'search')
    .mockResolvedValue([{ name: 'xlrd' }])
  const { service } = await mount(f.config)
  const result = await service.request({ action: 'search_package', requestId: 'search', query: 'xld' })
  expect(result.packageMatches).toEqual([{ name: 'xlrd' }])
  expect(search).toHaveBeenCalledWith('https://pypi.org/simple/', 'xld')
})

it.each(['https://user:password@example.org/simple', 'https://example.org/simple?token=secret', 'https://example.org/simple#secret', 'not-a-url-secret'])('rejects unsafe index %s without persisting or reflecting its contents', async mirrorUrl => {
  const f = await fixture(); const { service } = await mount(f.config)
  const failure = await service.request({ action: 'configure', requestId: 'configure', mirrorUrl, confirm: true }).catch(error => error as Error)
  expect(failure).toBeInstanceOf(Error)
  expect(String(failure)).not.toContain(mirrorUrl)
  await expect(readFile(join(f.config.environmentRoot, 'settings.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect((await service.request({ action: 'status', requestId: 'status' })).mirrorUrl).toBe('https://pypi.org/simple')
})

it('rejects index query parameters in deployment configuration before preparation', async () => {
  const f = await fixture(); const ctx = new Context(); contexts.push(ctx)
  expect(() => new PythonManagement(ctx, { ...f.config, indexUrl: 'https://example.org/simple?token=private-value' })).toThrow('without credentials, query parameters or fragments')
  expect(f.prepare).not.toHaveBeenCalled()
})

it('keeps the in-memory index unchanged when the settings commit fails', async () => {
  const f = await fixture(); const { service } = await mount(f.config)
  await mkdir(join(f.config.environmentRoot, 'settings.json'), { recursive: true })
  await expect(service.request({ action: 'configure', requestId: 'configure', mirrorUrl: 'https://packages.example.org/simple', confirm: true })).rejects.toThrow()
  expect((await service.request({ action: 'status', requestId: 'status' })).mirrorUrl).toBe('https://pypi.org/simple')
})

it('reports malformed saved configuration without including its contents and leaves it intact', async () => {
  const f = await fixture(); await mkdir(f.config.environmentRoot)
  const body = '{"indexUrl":"https://user:private-value@example.org/?token=secret"'
  const file = join(f.config.environmentRoot, 'settings.json'); await writeFile(file, body)
  const ctx = new Context(); contexts.push(ctx)
  const fiber = ctx.plugin({ name: 'python-settings-fixture', apply(ctx: Context) { new PythonManagement(ctx, { ...f.config }) } }); await fiber
  await expect(ctx.zerowallPythonManagement.ready()).rejects.toThrow('Python settings are invalid')
  expect(f.prepare).not.toHaveBeenCalled()
  expect(await readFile(file, 'utf8')).toBe(body)
})

it('reports the dependency count from the current packaged manifest', async () => {
  const f = await fixture(); const { service } = await mount(f.config)
  await mkdir(f.config.assetsRoot)
  await writeFile(join(f.config.assetsRoot, 'runtime.json'), JSON.stringify({ revision: 'current-lock', packageCount: 3, files: [] }))
  const result = await service.request({ action: 'check_manifest', requestId: 'manifest' })
  expect(result.manifest).toEqual({ revision: 'current-lock', packageCount: 3 })
})
