import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, lstat, rename, rm, symlink, readlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { movePackagePath } from '../../tools/commands/profile-package-move.mjs'

const denied = () => Object.assign(new Error('Windows candidate is in use'), { code: 'EPERM' })
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zws-package-move-'))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }))
  const source = join(root, 'candidate'), destination = join(root, 'active'), copyStage = join(root, 'staged')
  await mkdir(source)
  await writeFile(join(source, 'package.json'), '{"name":"dsh-ssh-ops","version":"1.0.0"}')
  return { root, source, destination, copyStage }
}

test('publication retries transient Windows rename failures without copying or losing package identity', async t => {
  const f = await fixture(t), original = await lstat(f.source)
  let calls = 0
  await movePackagePath(f.source, f.destination, { wait: async () => {}, move: async (...args) => {
    if (++calls < 3) throw denied()
    await rename(...args)
  } })
  assert.equal(calls, 3)
  assert.equal((await lstat(f.destination)).ino, original.ino)
  await assert.rejects(lstat(f.source), { code: 'ENOENT' })
})

test('a persistently locked candidate publishes an exact independent copy without following dependency links', async t => {
  const f = await fixture(t), external = join(f.root, 'retained')
  await mkdir(external); await writeFile(join(external, 'data'), 'untouched')
  await mkdir(join(f.source, 'node_modules'))
  await symlink(external, join(f.source, 'node_modules/retained'), process.platform === 'win32' ? 'junction' : 'dir')
  await writeFile(join(f.source, 'native.node'), Buffer.from([0, 255, 23, 42]))
  await movePackagePath(f.source, f.destination, { copyStage: f.copyStage, attempts: 2, wait: async () => {}, move: async (source, destination) => {
    if (source === f.source) throw denied()
    await rename(source, destination)
  } })
  assert.deepEqual(await readFile(join(f.destination, 'native.node')), await readFile(join(f.source, 'native.node')))
  assert.notEqual((await lstat(f.destination)).ino, (await lstat(f.source)).ino)
  assert.equal(await readlink(join(f.destination, 'node_modules/retained')), await readlink(join(f.source, 'node_modules/retained')))
  assert.equal(await readFile(join(external, 'data'), 'utf8'), 'untouched')
  await assert.rejects(lstat(f.copyStage), { code: 'ENOENT' })
})

test('a completed handoff reported as an error is accepted only for the same filesystem entry', async t => {
  const f = await fixture(t)
  await movePackagePath(f.source, f.destination, { move: async (...args) => { await rename(...args); throw denied() } })
  assert.match(await readFile(join(f.destination, 'package.json'), 'utf8'), /dsh-ssh-ops/)
})

test('missing source is detected before rename and never claims that an unrelated destination is installed', async t => {
  const f = await fixture(t)
  await rm(f.source, { recursive: true })
  await mkdir(f.destination); await writeFile(join(f.destination, 'user-data'), 'preserve')
  let called = false
  await assert.rejects(movePackagePath(f.source, f.destination, { move: async () => { called = true } }), { code: 'ENOENT' })
  assert.equal(called, false)
  assert.equal(await readFile(join(f.destination, 'user-data'), 'utf8'), 'preserve')
})

test('a disappearing candidate or occupied destination is never retried, merged or silently accepted', async t => {
  for (const mode of ['missing', 'occupied']) {
    const f = await fixture(t)
    let calls = 0
    await assert.rejects(movePackagePath(f.source, f.destination, { copyStage: f.copyStage, wait: async () => {}, move: async () => {
      calls++
      await rm(f.source, { recursive: true })
      if (mode === 'occupied') { await mkdir(f.destination); await writeFile(join(f.destination, 'data'), 'other') }
      throw denied()
    } }), { code: mode === 'occupied' ? 'EEXIST' : 'EPERM' })
    assert.equal(calls, 1)
    await assert.rejects(lstat(f.copyStage), { code: 'ENOENT' })
    if (mode === 'occupied') assert.equal(await readFile(join(f.destination, 'data'), 'utf8'), 'other')
  }
})

test('old active/rollback roots never use copy fallback and terminal errors remain actionable', async t => {
  const f = await fixture(t)
  let calls = 0
  await assert.rejects(movePackagePath(f.source, f.destination, { attempts: 2, wait: async () => {}, move: async () => { calls++; throw denied() } }), { code: 'EPERM' })
  assert.equal(calls, 2)
  assert.match(await readFile(join(f.source, 'package.json'), 'utf8'), /dsh-ssh-ops/)
  await assert.rejects(lstat(f.destination), { code: 'ENOENT' })
})
