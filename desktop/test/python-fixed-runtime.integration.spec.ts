import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { scanFixedPython } from '../src/main/python-local-inventory.js'
import { McpEnvironmentController } from '../src/main/mcp-environment.js'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const source = process.env.ZEROWALL_TEST_BOOTSTRAP_ROOT
describe.skipIf(!source)('actual fixed Python interpreter and pip', () => {
  async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'zws-fixed-python-')); roots.push(root)
    const runtime = join(root, '安装 目录', 'Python')
    await cp(source!, runtime, { recursive: true })
    const dist = join(runtime, 'Lib/site-packages/pandas-1.0.0.dist-info')
    await mkdir(dist, { recursive: true })
    await writeFile(join(dist, 'METADATA'), 'Metadata-Version: 2.1\nName: pandas\nVersion: 1.0.0\n')
    return runtime
  }
  it('detects pointerless Python and any installed pandas version with its own pip', async () => {
    const root = await fixture()
    const info = await scanFixedPython(root, ['PANDAS'], ['pandas', 'missing-package'])
    expect(info).toMatchObject({ ready: true, pipReady: true, coreReady: true, inventoryComplete: true, version: '3.12.10', executable: join(root, 'python.exe'), missingCorePackages: [], scienceInstalledPackageCount: 1 })
    expect(info.packages.find(pkg => pkg.name === 'pandas')?.version).toBe('1.0.0')
  })
  it('reads metadata when pip is broken and reports pip separately', async () => {
    const root = await fixture()
    await rename(join(root, 'Lib/site-packages/pip'), join(root, 'Lib/site-packages/pip-disabled'))
    const info = await scanFixedPython(root, ['pandas'])
    expect(info).toMatchObject({ ready: true, pipReady: false, coreReady: true, missingCorePackages: [] })
    expect(info.message).toContain('PIP_UNAVAILABLE')
  })
  it('ignores an old ready slot during read-only detection without rewriting it', async () => {
    const root = await fixture(); const manager = join(root, '.zerowall')
    await mkdir(manager, { recursive: true })
    const stale = JSON.stringify({ root: join(manager, 'slots/a-old'), runtimeRoot: join(manager, 'slots/a-old'), generation: true, health: 'ready' })
    await writeFile(join(manager, 'current.json'), stale)
    const fetcher = vi.fn(() => { throw new Error('Detection must not fetch or install') })
    const controller = new McpEnvironmentController({ root: manager, runtimeRoot: root, manifestUrl: 'https://unused.test', publicKey: '', fetcher, publish() {} })
    expect(await controller.pythonInfo()).toMatchObject({ ready: true, executable: join(root, 'python.exe') })
    expect(await controller.localStatus()).toMatchObject({ phase: 'ready', python: { executable: join(root, 'python.exe') } })
    expect(await readFile(join(manager, 'current.json'), 'utf8')).toBe(stale)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
