import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, realpath, symlink, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { copyProfileTree } from '../../tools/commands/profile-copy.mjs'
import { repairProfileLayout } from '../../tools/commands/profile-layout.mjs'

test('profile copies retain active sources and referenced archives without recopying unrelated rollback history', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-copy-history-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'source'), candidate = join(root, 'candidate')
  const files = ['.zerowall/install-sources/active/code.js', '.zerowall/dependency-history/retained/code.js', '.zerowall/plugin-imports/active.json', '.zerowall/import-history/referenced/code.js', '.zerowall/retired-plugin-history/unreferenced/code.js', '.zerowall/restore-history/referenced/code.js', 'node_modules/custom/.zerowall/import-history/asset.txt']
  for (const local of files) { await mkdir(dirname(join(source, local)), { recursive: true }); await writeFile(join(source, local), local) }
  await mkdir(join(source, 'node_modules/custom/node_modules'), { recursive: true })
  await symlink(join(source, '.zerowall/import-history/referenced'), join(source, 'node_modules/custom/node_modules/old'), process.platform === 'win32' ? 'junction' : 'dir')
  await symlink(join(source, '.zerowall/restore-history/referenced'), join(source, '.zerowall/import-history/referenced/next'), process.platform === 'win32' ? 'junction' : 'dir')
  await copyProfileTree(source, candidate)
  for (const local of files) {
    assert.equal(await readFile(join(source, local), 'utf8'), local)
    if (local.includes('unreferenced')) await assert.rejects(readFile(join(candidate, local)), { code: 'ENOENT' })
    else assert.equal(await readFile(join(candidate, local), 'utf8'), local)
  }
})

for (const modulesOnly of [false, true]) test(`profile copy omits exact retired pnpm instances and nested entries (${modulesOnly ? 'modules' : 'profile'} root)`, async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-copy-retired-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const home = join(root, 'home'), source = join(home, 'profiles/web'), candidate = join(home, 'profiles/zerowall-copy')
  const modules = join(source, 'node_modules')
  async function file(local, text = 'preserved') {
    const path = join(modules, local)
    await mkdir(dirname(path), { recursive: true }); await writeFile(path, text)
  }
  async function link(local, target) {
    await mkdir(dirname(join(modules, local)), { recursive: true })
    await symlink(join(modules, target), join(modules, local), process.platform === 'win32' ? 'junction' : 'dir')
  }
  const retired = ['dsh-univer-office', 'dsh-genui', '@changfenhuang/dsh-genui']
  for (const id of retired) {
    const instance = '.pnpm/' + id.replace('/', '+') + '@1.0.0_peer@2.0.0'
    await file(instance + '/node_modules/' + id + '/package.json', JSON.stringify({ name: id }))
    await link(id, instance + '/node_modules/' + id)
    await link('.pnpm/node_modules/' + id, instance + '/node_modules/' + id)
    await link('third-party/node_modules/' + id, instance + '/node_modules/' + id)
  }
  const retained = ['dsh-genui-tools', 'dsh-univer-office-extra', '@changfenhuang/dsh-genui-extra', '@other/dsh-genui']
  for (const id of retained) {
    const instance = '.pnpm/' + id.replace('/', '+') + '@1.0.0'
    await file(instance + '/node_modules/' + id + '/package.json', JSON.stringify({ name: id }))
    await link(id, instance + '/node_modules/' + id)
  }
  await file('.pnpm/shared@1.0.0/node_modules/shared/index.cjs', 'module.exports=42')
  await link('third-party/node_modules/shared', '.pnpm/shared@1.0.0/node_modules/shared')
  await file('.modules.yaml', JSON.stringify({ nodeLinker: 'isolated', virtualStoreDir: '.pnpm' }))
  const shadow = 'previous-package.previous-00000000-0000-4000-8000-000000000000'
  const scopedShadow = '@test/' + shadow
  await file(shadow + '/rollback.txt')
  await file(scopedShadow + '/rollback.txt')
  await link('linked-' + shadow, shadow)
  await file('third-party/notes/dsh-genui.txt')
  const retainedAssets = ['third-party/data/schema.previous-version.json', 'third-party/data/' + shadow + '/asset.json', 'third-party.previous-tools/index.js', '.previous-user-assets/asset.json', 'notes.previous-00000000-0000-4000-8000-000000000000']
  for (const local of retainedAssets) await file(local)
  await file('.zerowall-carriers/signed/profile-runtime.asar.unpacked/node_modules/dsh-genui/package.json', 'signed immutable bytes')
  const signedShadow = '.zerowall-carriers/signed/profile-runtime.asar.unpacked/node_modules/' + shadow + '/node_modules/dsh-genui/asset.previous-version.json'
  await file(signedShadow, 'signed previous asset')
  await mkdir(candidate, { recursive: true })
  await copyProfileTree(modulesOnly ? modules : source, modulesOnly ? join(candidate, 'node_modules') : candidate)
  await repairProfileLayout(candidate, { from: source, home })
  for (const id of retired) {
    const instance = '.pnpm/' + id.replace('/', '+') + '@1.0.0_peer@2.0.0'
    for (const local of [instance + '/node_modules/' + id + '/package.json', id + '/package.json', '.pnpm/node_modules/' + id + '/package.json', 'third-party/node_modules/' + id + '/package.json']) {
      await assert.rejects(readFile(join(candidate, 'node_modules', local)), /ENOENT/u)
      assert.equal((await readFile(join(modules, instance, 'node_modules', id, 'package.json'), 'utf8')).includes(id), true)
    }
  }
  for (const id of retained) assert.equal(JSON.parse(await readFile(join(candidate, 'node_modules', id, 'package.json'))).name, id)
  assert((await realpath(join(candidate, 'node_modules/third-party/node_modules/shared'))).startsWith(candidate))
  assert.equal(await readFile(join(candidate, 'node_modules/third-party/node_modules/shared/index.cjs'), 'utf8'), 'module.exports=42')
  assert.equal(await readFile(join(candidate, 'node_modules/third-party/notes/dsh-genui.txt'), 'utf8'), 'preserved')
  for (const local of retainedAssets) assert.equal(await readFile(join(candidate, 'node_modules', local), 'utf8'), 'preserved')
  assert.equal(await readFile(join(candidate, 'node_modules/.zerowall-carriers/signed/profile-runtime.asar.unpacked/node_modules/dsh-genui/package.json'), 'utf8'), 'signed immutable bytes')
  assert.equal(await readFile(join(candidate, 'node_modules', signedShadow), 'utf8'), 'signed previous asset')
  for (const local of [shadow, scopedShadow, 'linked-' + shadow]) await assert.rejects(readFile(join(candidate, 'node_modules', local, 'rollback.txt')), /ENOENT/u)
})
