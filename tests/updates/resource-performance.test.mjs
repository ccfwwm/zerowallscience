import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { c as archive } from 'tar'
import * as yaml from 'yaml'
import { snapshotPackageClosure } from '../../tools/commands/profile-package-snapshot.mjs'
import { runProfilePnpmTransaction } from '../../tools/commands/profile-pnpm-transaction.mjs'
import { acquireProfileMutation } from '../../tools/commands/profile-mutation-lock.mjs'
import { createResourceManager } from '../../tools/commands/resource-manager.mjs'
import { fileDigest, signCatalog } from '../../tools/release/resource-catalog.mjs'
import { copyProfileTree } from '../../tools/commands/profile-copy.mjs'

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'zws-update-performance-'))
  t.after(() => rm(home, { recursive: true, force: true, maxRetries: 5 }))
  return home
}
async function packageAt(root, name, dependencies = {}) {
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({ name, version: '1.0.0', dependencies }))
  await writeFile(join(root, 'index.js'), name)
}

test('selective snapshots retain resolved dependency instances and omit unrelated file trees', async t => {
  const home = await fixture(t), profile = join(home, 'profiles/web'), backup = join(home, 'resources/history/snapshot')
  const selected = join(profile, 'node_modules/selected'), leaf = join(profile, '.zerowall/install-sources/old/node_modules/leaf')
  await packageAt(selected, 'selected', { leaf: '1.0.0' }); await packageAt(leaf, 'leaf')
  await mkdir(join(selected, 'node_modules'))
  await symlink(leaf, join(selected, 'node_modules/leaf'), process.platform === 'win32' ? 'junction' : 'dir')
  await writeFile(join(profile, 'package.json'), JSON.stringify({ dependencies: { selected: '1.0.0', unrelated: '1.0.0' } }))
  const unrelated = join(profile, 'node_modules/unrelated')
  await packageAt(unrelated, 'unrelated')
  await Promise.all(Array.from({ length: 1000 }, (_, index) => writeFile(join(unrelated, index + '.js'), 'unrelated')))
  await snapshotPackageClosure({ profile, backup, ids: ['selected'] })
  assert.equal(await readFile(join(backup, 'node_modules/selected/node_modules/leaf/index.js'), 'utf8'), 'leaf')
  assert.ok((await realpath(join(backup, 'node_modules/selected/node_modules/leaf'))).startsWith(backup))
  await assert.rejects(readFile(join(backup, 'node_modules/unrelated/package.json')), { code: 'ENOENT' })
  assert.equal(JSON.parse(await readFile(join(backup, 'snapshot.json'))).instances, 2)
  await writeFile(join(leaf, 'index.js'), 'changed')
  assert.equal(await readFile(join(backup, 'node_modules/selected/node_modules/leaf/index.js'), 'utf8'), 'leaf')
})

test('owned desktop candidate resolves directly and rejects a forged lease without touching active bytes', async t => {
  const home = await fixture(t), profile = join(home, 'profiles/web'), candidate = join(home, 'profiles/zerowall')
  await mkdir(join(profile, 'node_modules'), { recursive: true }); await mkdir(join(candidate, '.zerowall'), { recursive: true })
  await mkdir(join(candidate, 'node_modules'))
  const original = JSON.stringify({ dependencies: {}, zerowall: { profileLayout: 3 } })
  await writeFile(join(profile, 'package.json'), original); await writeFile(join(candidate, 'package.json'), original)
  const release = await acquireProfileMutation(profile)
  let released = false
  t.after(async () => { if (!released) await release().catch(() => {}) })
  const id = randomUUID(), file = join(candidate, '.zerowall/resource-transaction.json')
  const receipt = { id, profile, pid: release.ownerPid, token: release.ownerToken }
  await writeFile(file, JSON.stringify({ ...receipt, token: 'forged' }))
  let called = 0
  const run = async (_args, directory) => { called++; assert.ok(directory.startsWith(join(candidate, '.zerowall/install-sources'))); return { code: 0 } }
  await assert.rejects(runProfilePnpmTransaction({ profile: candidate, args: ['install'], resourceCandidateId: id, run }), /RESOURCE_CANDIDATE_INVALID/)
  assert.equal(called, 0)
  await writeFile(file, JSON.stringify(receipt))
  await runProfilePnpmTransaction({ profile: candidate, args: ['install'], resourceCandidateId: id, run })
  assert.equal(called, 1)
  assert.deepEqual((await readdir(join(home, 'profiles'))).sort(), ['.zerowall-plugin-mutation.lock', 'web', 'zerowall'])
  assert.equal(await readFile(join(profile, 'package.json'), 'utf8'), original)
  await release()
  released = true
})

test('copy cancellation stops before remaining files and leaves source bytes intact', async t => {
  const home = await fixture(t), source = join(home, 'source'), destination = join(home, 'candidate')
  await mkdir(source)
  await Promise.all(Array.from({ length: 100 }, (_, i) => writeFile(join(source, i + '.txt'), 'original')))
  const controller = new AbortController()
  await assert.rejects(copyProfileTree(source, destination, { signal: controller.signal, report: value => { if (value.phase === 'copying' && value.completed > 0) controller.abort() } }), { name: 'AbortError' })
  assert.equal((await readdir(source)).length, 100)
  assert.ok((await readdir(destination)).length < 100)
})

test('Skills batch reads one catalog, stamps versions and commits once per Skill', async t => {
  const home = await fixture(t), pair = generateKeyPairSync('ed25519'), resources = []
  const target = { desktopVersion: '8.4.11', dshVersion: '0.2.1-rc.2', platform: process.platform, architecture: process.arch }
  for (let index = 0; index < 5; index++) {
    const id = 'skill-' + index, source = join(home, id), file = source + '.tgz'
    await mkdir(source); await writeFile(join(source, 'SKILL.md'), `---\nname: ${id}\ndescription: Test skill\n---\nContent\n`)
    await archive({ file, cwd: source, gzip: true }, ['SKILL.md'])
    resources.push({ id, kind: 'skill', version: '1.2.0', dshRange: { min: target.dshVersion }, desktopRange: { min: target.desktopVersion }, platform: [target.platform], architecture: [target.architecture], downloadUrl: pathToFileURL(file).href, sha256: await fileDigest(file), size: (await readFile(file)).length, restartRequired: false, rollbackSupported: true })
  }
  const source = join(home, 'catalog.json')
  await writeFile(source, JSON.stringify(signCatalog({ schema: 1, localOnly: true, resources }, pair.privateKey, 'test')))
  const calls = [], progress = []
  const manager = createResourceManager({ home, target, yaml, local: true, keys: { test: pair.publicKey }, callHost: async (operation, [input]) => {
    assert.equal(operation, 'skill.update')
    const text = await readFile(join(input.sourcePath, 'SKILL.md'), 'utf8')
    assert.match(text, /version: 1.2.0/)
    calls.push(input.sourcePath); return {}
  } })
  const result = await manager.updateSkills(resources.map(item => item.id), source, { report: value => progress.push(value) })
  assert.equal(result.updated, 5); assert.equal(calls.length, 5)
  assert.deepEqual(progress.filter(value => value.phase === 'applying').map(value => value.completed), [0, 1, 2, 3, 4])
  assert.ok(progress.filter(value => value.phase === 'applying').every(value => value.canCancel === false))
  const cancelled = new AbortController(); cancelled.abort()
  await assert.rejects(manager.updateSkills(['skill-0'], source, { signal: cancelled.signal }), { name: 'AbortError' })
  assert.equal(calls.length, 5)

  const duringApply = new AbortController(), applied = []
  const completing = createResourceManager({ home: join(home, 'during-apply'), target, yaml, local: true, keys: { test: pair.publicKey }, callHost: async (operation, [input]) => {
    assert.equal(operation, 'skill.update')
    if (applied.length === 0) duringApply.abort()
    applied.push(input.sourcePath)
    return {}
  } })
  const completed = await completing.updateSkills(resources.map(item => item.id), source, { signal: duringApply.signal })
  assert.equal(completed.updated, 5)
  assert.equal(applied.length, 5)
})
