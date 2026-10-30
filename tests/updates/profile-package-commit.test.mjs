import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, lstat, rename, rm, symlink, readlink, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { commitPackagePaths, restorePackagePaths } from '../../tools/commands/profile-package-commit.mjs'
import { holdWindowsFile, releaseWindowsFiles } from './plugin-lock-fixture.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zws-package-commit-'))
  t.after(async () => { await releaseWindowsFiles(t); await rm(root, { recursive: true, force: true, maxRetries: 5 }) })
  const profile = join(root, 'web'), candidate = join(root, 'candidate'), directory = join(root, 'transaction'), state = {}
  for (const base of [profile, candidate]) {
    await mkdir(join(base, 'node_modules/@scope/selected'), { recursive: true })
    await mkdir(join(base, 'node_modules/@scope/retained'), { recursive: true })
    await writeFile(join(base, 'node_modules/@scope/selected/data'), base === profile ? 'old' : 'new')
    await writeFile(join(base, 'node_modules/@scope/retained/data'), 'retained')
  }
  await mkdir(directory)
  return { root, profile, candidate, directory, state, ids: ['@scope/selected'], files: [] }
}

test('publishing and repeated rollback never move the modules directory, scope or retained roots', async t => {
  const f = await fixture(t)
  const paths = ['node_modules', 'node_modules/@scope', 'node_modules/@scope/retained'].map(name => join(f.profile, name))
  const inodes = await Promise.all(paths.map(path => lstat(path).then(info => info.ino)))
  await commitPackagePaths(f)
  assert.equal(await readFile(join(f.profile, 'node_modules/@scope/selected/data'), 'utf8'), 'new')
  await restorePackagePaths(f.profile, f.directory, f.state)
  await restorePackagePaths(f.profile, f.directory, f.state)
  assert.equal(await readFile(join(f.profile, 'node_modules/@scope/selected/data'), 'utf8'), 'old')
  assert.deepEqual(await Promise.all(paths.map(path => lstat(path).then(info => info.ino))), inodes)
})

test('recovery restores a crash between exact-path renames and is idempotent', async t => {
  const f = await fixture(t)
  const name = 'node_modules/@scope/selected'
  await mkdir(join(f.directory, 'before/node_modules/@scope'), { recursive: true })
  await rename(join(f.profile, name), join(f.directory, 'before', name))
  const state = { schema: 2, state: 'committing', items: [{ name, existed: true }, { name: 'node_modules/new-package', existed: false }] }
  await restorePackagePaths(f.profile, f.directory, state)
  await restorePackagePaths(f.profile, f.directory, state)
  assert.equal(await readFile(join(f.profile, name, 'data'), 'utf8'), 'old')
})

test('publication relocates nested dependency links and never traverses an external Junction', async t => {
  const f = await fixture(t)
  const selected = join(f.candidate, 'node_modules/@scope/selected')
  const dependency = join(f.candidate, '.zerowall/install-sources/resolution-fixture/node_modules/shared')
  const external = join(f.root, 'external')
  await mkdir(dependency, { recursive: true }); await writeFile(join(dependency, 'index.cjs'), 'shared')
  await mkdir(join(selected, 'assets/deep/node_modules'), { recursive: true })
  const dependencyLink = join(selected, 'assets/deep/node_modules/shared')
  const directoryLink = process.platform === 'win32' ? 'junction' : 'dir'
  await symlink(dependency, dependencyLink, directoryLink)
  await mkdir(external)
  const dangling = join(external, 'unrelated-dangling-link'), missing = join(f.root, 'missing')
  await symlink(missing, dangling, directoryLink)
  await symlink(external, join(selected, 'assets/external'), directoryLink)
  await commitPackagePaths(f)
  assert.equal(await readFile(join(f.profile, 'node_modules/@scope/selected/assets/deep/node_modules/shared/index.cjs'), 'utf8'), 'shared')
  assert.equal(await realpath(join(f.profile, 'node_modules/@scope/selected/assets/deep/node_modules/shared')), await realpath(join(f.profile, '.zerowall/install-sources/resolution-fixture/node_modules/shared')))
  assert.equal(await readlink(dangling), missing)
  assert.equal(await realpath(join(f.profile, 'node_modules/@scope/selected/assets/external')), await realpath(external))
  await restorePackagePaths(f.profile, f.directory, f.state)
  assert.equal(await readFile(join(f.profile, 'node_modules/@scope/selected/data'), 'utf8'), 'old')
  assert.equal(await readlink(dangling), missing)
})

test('publication preserves a broken dependency directory link without aborting the package transaction', async t => {
  const f = await fixture(t)
  const selected = join(f.candidate, 'node_modules/@scope/selected')
  const missing = join(f.profile, 'node_modules/lucide-react')
  const dependencyLink = join(selected, 'node_modules/lucide-react')
  await mkdir(join(selected, 'node_modules'), { recursive: true })
  await symlink(missing, dependencyLink, process.platform === 'win32' ? 'junction' : 'dir')

  await commitPackagePaths(f)

  const published = join(f.profile, 'node_modules/@scope/selected/node_modules/lucide-react')
  assert.equal(await readlink(published), missing)
  await assert.rejects(realpath(published), { code: 'ENOENT' })
  await restorePackagePaths(f.profile, f.directory, f.state)
})

test('rollback rejects traversal, duplicate entries and symlinked parent directories', async t => {
  const f = await fixture(t)
  for (const items of [[{ name: '../outside', existed: true }], [{ name: 'node_modules', existed: true }], [{ name: 'node_modules/a', existed: true }, { name: 'node_modules/a', existed: false }]]) {
    await assert.rejects(restorePackagePaths(f.profile, f.directory, { items }), /Invalid package rollback/)
  }
  const outside = join(f.root, 'outside'); await mkdir(outside)
  await mkdir(join(f.directory, 'before/node_modules'), { recursive: true })
  await writeFile(join(f.directory, 'before/node_modules/new'), 'old')
  await symlink(outside, join(f.profile, 'node_modules/@outside'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(commitPackagePaths({ ...f, ids: ['@outside/new'] }), /parent must be physical/)
  assert.deepEqual(await import('node:fs/promises').then(fs => fs.readdir(outside)), [])
})

test('a real Windows retained-file lock cannot block another package, but a selected-file lock rolls back', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t)
  const release = await holdWindowsFile(t, join(f.profile, 'node_modules/@scope/retained/data'))
  await assert.rejects(rename(join(f.profile, 'node_modules'), join(f.root, 'whole-tree')), /EPERM|EACCES|EBUSY/)
  await commitPackagePaths(f)
  await restorePackagePaths(f.profile, f.directory, f.state)
  await release()
  const selectedRelease = await holdWindowsFile(t, join(f.profile, 'node_modules/@scope/selected/data'))
  const second = { ...f, directory: join(f.root, 'second'), state: {} }
  await mkdir(second.directory)
  await assert.rejects(commitPackagePaths(second), { code: 'PLUGIN_TARGET_LOCKED' })
  await restorePackagePaths(f.profile, second.directory, second.state)
  assert.equal(await readFile(join(f.profile, 'node_modules/@scope/selected/data'), 'utf8'), 'old')
  await selectedRelease()
})
