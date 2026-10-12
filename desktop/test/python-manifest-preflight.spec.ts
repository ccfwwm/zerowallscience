import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareManifestPackagePlan } from '../src/main/python-packages.js'

const spawned = vi.hoisted(() => vi.fn(() => { throw new Error('Preview must not invoke pip or download packages') }))
vi.mock('node:child_process', async original => ({ ...await original<typeof import('node:child_process')>(), spawn: spawned }))
const roots: string[] = []
afterEach(async () => { spawned.mockClear(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

it('queues only missing names without network preflight, preserving order and zero successful installs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-manifest-preflight-')); roots.push(root)
  const manifest = {
    schema: 3 as const, runtimeId: 'zerowall-science-python' as const, platform: 'win32-x64' as const,
    pythonVersion: '3.12.10', environmentVersion: '3.12.10', revision: 'r18', layer: 'science' as const,
    createdAt: new Date().toISOString(), index: { indexUrl: 'https://mirrors.ustc.edu.cn/pypi/simple' },
    compatibility: { minApplicationVersion: '8.1.3' }, signature: { algorithm: 'ed25519' as const, keyId: 'fixture', value: 'fixture' },
    packages: [
      { name: 'pandas', version: '3.0.5', required: true, capabilities: [] },
      { name: 'scikit-learn', version: '1.7.2', required: true, capabilities: [] },
      { name: 'typing-extensions', version: '4.15.0', required: true, capabilities: [] },
      { name: 'brainglobe', version: '3.0.0', required: true, capabilities: [] },
      { name: 'docopt', version: '0.6.2', source: 'sdist' as const, filename: 'docopt-0.6.2.tar.gz', sha256: 'a'.repeat(64), required: true, capabilities: [] },
      { name: 'numpy', version: '2.3.3', required: true, capabilities: [] },
    ],
  }
  const progress: unknown[] = []
  const plan = await prepareManifestPackagePlan(root, { root, executable: join(root, 'python.exe'), sitePackages: join(root, 'Lib/site-packages'), manifest: {} as never }, manifest,
    { ready: true, packages: [{ name: 'PANDAS', version: '1.0.0' }, { name: 'scikit_learn', version: '99.0' }, { name: 'Typing.Extensions', version: '1.0' }] } as never, value => progress.push(value))
  expect(spawned).not.toHaveBeenCalled()
  expect(plan.wheels).toEqual([
    expect.objectContaining({ name: 'brainglobe', deferredResolution: true }),
    expect.objectContaining({ name: 'docopt', deferredSourceBuild: true, sourceArchiveSha256: 'a'.repeat(64) }),
    expect.objectContaining({ name: 'numpy', deferredResolution: true }),
  ])
  expect(plan.changes.map(change => change.name)).toEqual(['brainglobe', 'docopt', 'numpy'])
  expect(progress.at(-1)).toMatchObject({ completedPackages: 0, totalPackages: 3, progress: 0 })
  expect(JSON.parse(await readFile(join(root, 'plans', plan.planId + '.json'), 'utf8')).wheels).toEqual(plan.wheels)
})
