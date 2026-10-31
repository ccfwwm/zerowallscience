import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { cleanupOfflineSupply } from '../../tools/commands/offline-cleanup.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zws-offline-cleanup-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const localAppData = join(root, 'Local'), install = join(localAppData, 'Programs/ZeroWallScience'), resourcesPath = join(install, 'resources')
  const source = join(resourcesPath, 'offline-profile'), profile = join(root, 'Roaming/zerowall-science/harness/profiles/web')
  await mkdir(source, { recursive: true }); await mkdir(profile, { recursive: true })
  await writeFile(join(source, 'receipt.json'), 'installer-owned-supply')
  await writeFile(join(source, 'profile-runtime.asar'), 'physical-carrier-bytes')
  const retained = join(resourcesPath, 'app.asar')
  await writeFile(retained, 'current-runtime')
  const settings = join(profile, 'package.json')
  await writeFile(settings, 'user-profile')
  const options = { packaged: true, platform: 'win32', localAppData, executable: join(install, 'ZeroWall Science.exe'), resourcesPath, profile, ready: true, verifyProfile: async () => ({ ready: true }) }
  return { root, source, profile, retained, settings, options }
}

test('post-readiness cleanup removes only the exact standard per-user installer supply and is repeatable', async t => {
  const f = await fixture(t)
  assert.deepEqual(await cleanupOfflineSupply(f.options), { state: 'removed' })
  await assert.rejects(readFile(join(f.source, 'receipt.json')), { code: 'ENOENT' })
  assert.equal(await readFile(f.retained, 'utf8'), 'current-runtime')
  assert.equal(await readFile(f.settings, 'utf8'), 'user-profile')
  assert.deepEqual(await cleanupOfflineSupply(f.options), { state: 'absent' })
})

for (const override of [{ packaged: false }, { ready: false }, { localAppData: undefined }, { platform: 'darwin' }]) test('cleanup preserves supply before readiness or outside a packaged Windows user install: ' + JSON.stringify(override), async t => {
  const f = await fixture(t)
  assert.equal((await cleanupOfflineSupply({ ...f.options, ...override })).state, 'skipped')
  assert.equal(await readFile(join(f.source, 'receipt.json'), 'utf8'), 'installer-owned-supply')
})

test('shared and custom installs preserve their supply without probing the active profile', async t => {
  const f = await fixture(t)
  const result = await cleanupOfflineSupply({ ...f.options, executable: join(f.root, 'Shared/ZeroWall Science.exe'), verifyProfile: async () => { throw new Error('must not probe') } })
  assert.equal(result.reason, 'shared-or-custom-installation')
  assert.equal(await readFile(join(f.source, 'receipt.json'), 'utf8'), 'installer-owned-supply')
})

test('cleanup requires an independent healthy profile and defers verification failures', async t => {
  const f = await fixture(t)
  assert.equal((await cleanupOfflineSupply({ ...f.options, verifyProfile: async () => ({ ready: false }) })).reason, 'profile-not-independent')
  assert.deepEqual(await cleanupOfflineSupply({ ...f.options, verifyProfile: async () => { throw Object.assign(new Error('busy'), { code: 'EACCES' }) } }), { state: 'deferred', reason: 'EACCES' })
  assert.equal(await readFile(join(f.source, 'receipt.json'), 'utf8'), 'installer-owned-supply')
})

test('cleanup never follows a supply junction into another directory', async t => {
  const f = await fixture(t), other = join(f.root, 'other-application')
  await mkdir(other); await writeFile(join(other, 'keep'), 'protected')
  await rm(f.source, { recursive: true })
  await symlink(other, f.source, process.platform === 'win32' ? 'junction' : 'dir')
  assert.equal((await cleanupOfflineSupply(f.options)).reason, 'linked-supply')
  assert.equal(await readFile(join(other, 'keep'), 'utf8'), 'protected')
})

test('cleanup retains the supply when a profile dependency still points into it', async t => {
  const f = await fixture(t)
  await symlink(f.source, join(f.profile, 'old-plugin'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.equal((await cleanupOfflineSupply(f.options)).reason, 'supply-still-referenced')
  assert.equal(await readFile(join(f.source, 'receipt.json'), 'utf8'), 'installer-owned-supply')
})
