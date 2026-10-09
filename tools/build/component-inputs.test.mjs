import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { dependencyLockFingerprint, sharedSourceInputs } from './component-inputs.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zws-component-inputs-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const lock = { lockfileVersion: '9.0', settings: { autoInstallPeers: true }, importers: { '.': { devDependencies: { tsdown: { specifier: '1.0.0', version: '1.0.0' } } }, 'desktop': { dependencies: { electron: { specifier: '43.0.0', version: '43.0.0' } } }, 'plugins/a': { dependencies: { direct: { specifier: '1.0.0', version: '1.0.0' } } }, 'plugins/b': { dependencies: { unrelated: { specifier: '1.0.0', version: '1.0.0' } } } }, snapshots: { 'direct@1.0.0': { dependencies: { transitive: '1.0.0' } }, 'transitive@1.0.0': {}, 'unrelated@1.0.0': {}, 'tsdown@1.0.0': {}, 'electron@43.0.0': {} }, packages: { 'direct@1.0.0': { resolution: { integrity: 'direct' } }, 'transitive@1.0.0': { resolution: { integrity: 'transitive' } }, 'unrelated@1.0.0': { resolution: { integrity: 'unrelated' } }, 'tsdown@1.0.0': { resolution: { integrity: 'compiler' } } } }
  const save = () => writeFile(join(root, 'pnpm-lock.yaml'), stringify(lock))
  await save()
  return { root, lock, save }
}

test('desktop and unrelated lockfile changes keep a plugin dependency fingerprint stable', async t => {
  const f = await fixture(t)
  const before = await dependencyLockFingerprint(f.root, ['plugins/a'], ['tsdown'])
  f.lock.importers.desktop.dependencies.electron.version = '44.0.0'
  f.lock.packages['unrelated@1.0.0'].resolution.integrity = 'new-unrelated-bytes'
  await f.save()
  assert.equal(await dependencyLockFingerprint(f.root, ['plugins/a'], ['tsdown']), before)
})

test('transitive runtime bytes and toolchain bytes invalidate the affected plugin', async t => {
  const f = await fixture(t)
  const before = await dependencyLockFingerprint(f.root, ['plugins/a'], ['tsdown'])
  f.lock.packages['transitive@1.0.0'].resolution.integrity = 'new-transitive-bytes'
  await f.save()
  const dependencyChange = await dependencyLockFingerprint(f.root, ['plugins/a'], ['tsdown'])
  assert.notEqual(dependencyChange, before)
  f.lock.packages['tsdown@1.0.0'].resolution.integrity = 'new-compiler-bytes'
  await f.save()
  assert.notEqual(await dependencyLockFingerprint(f.root, ['plugins/a'], ['tsdown']), dependencyChange)
})

test('shared helper sources are inputs only for their actual importers', async t => {
  const f = await fixture(t)
  for (const id of ['a', 'b']) await mkdir(join(f.root, 'plugins', id, 'src/client'), { recursive: true })
  await mkdir(join(f.root, 'plugins/base/src/shared'), { recursive: true })
  await writeFile(join(f.root, 'plugins/base/src/shared/client-helpers.ts'), 'export const helper = 1')
  await writeFile(join(f.root, 'plugins/a/src/client/index.ts'), 'import {helper} from "@zerowallscience/plugin-base/client-helpers"')
  await writeFile(join(f.root, 'plugins/b/src/client/index.ts'), 'export const independent = 1')
  assert.deepEqual(await sharedSourceInputs(f.root, join(f.root, 'plugins/a')), ['plugins/base/src/shared/client-helpers.ts'])
  assert.deepEqual(await sharedSourceInputs(f.root, join(f.root, 'plugins/b')), [])
})

test('secondary adapter entries trace literal dynamic shared imports', async t => {
  const f = await fixture(t)
  await mkdir(join(f.root, 'packages/adapter/src/workers'), { recursive: true })
  await mkdir(join(f.root, 'packages/shared'), { recursive: true })
  await writeFile(join(f.root, 'packages/adapter/src/workers/parse.ts'), 'export const parse = () => import("../../../shared/parser.js")')
  await writeFile(join(f.root, 'packages/shared/parser.ts'), 'export const result = 1')
  assert.deepEqual(await sharedSourceInputs(f.root, join(f.root, 'packages/adapter')), ['packages/shared/parser.ts'])
})
