import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createResourceManager } from '../../tools/commands/resource-manager.mjs'
import { initializeProfile } from '../../tools/commands/profile.mjs'

async function fixture(t, overrides = {}) {
  const home = await mkdtemp(join(tmpdir(), 'zws-recovery-'))
  t.after(async () => {
    assert(resolve(home).startsWith(resolve(tmpdir()) + '\\') || resolve(home).startsWith(resolve(tmpdir()) + '/'))
    await rm(home, { recursive: true, force: true })
  })
  await initializeProfile(home, [])
  const active = join(home, 'profiles/web')
  const backup = join(home, 'resources/history/zerowall-test')
  const candidate = join(home, 'profiles/zerowall-test')
  const journal = join(home, 'resources/transaction.json')
  await mkdir(candidate, { recursive: true })
  const manifest = JSON.parse(await readFile(join(active, 'package.json'), 'utf8'))
  await writeFile(join(active, 'package.json'), JSON.stringify({ ...manifest, marker: 'old' }))
  await writeFile(join(candidate, 'package.json'), JSON.stringify({ ...manifest, marker: 'new' }))
  await mkdir(join(home, 'resources/history'), { recursive: true })
  const pending = { state: 'activating', backup, candidate }
  await writeFile(journal, JSON.stringify(pending))
  const manager = createResourceManager({ home, keys: {}, target: {},
    runPlugin: async () => {}, stopHost: async () => {}, startHost: async () => {}, ...overrides })
  return { home, active, backup, candidate, journal, pending, manager,
    readActive: async () => JSON.parse(await readFile(join(active, 'package.json'), 'utf8')) }
}

test('recovery preserves the complete active profile before the first rename', async t => {
  const f = await fixture(t)
  const before = await readFile(join(f.active, 'package.json'))
  await f.manager.recover()
  assert.deepEqual(await readFile(join(f.active, 'package.json')), before)
  assert.equal(JSON.parse(await readFile(f.journal)).state, 'recovered')
  assert(!(await readdir(join(f.home, 'profiles'))).some(name => name.includes('interrupted')))
})

test('recovery preserves an unreadable or invalid journal and never moves the profile', async t => {
  const f = await fixture(t)
  await writeFile(f.journal, '{invalid')
  await assert.rejects(f.manager.recover(), SyntaxError)
  assert.equal(await readFile(f.journal, 'utf8'), '{invalid')
  assert.equal((await f.readActive()).marker, 'old')
  await rename(f.journal, f.journal + '.invalid')
  await mkdir(f.journal)
  await assert.rejects(f.manager.recover())
  assert.equal((await f.readActive()).marker, 'old')
})

test('recovery restores the old profile after it was backed up but before candidate activation', async t => {
  const f = await fixture(t)
  await rename(f.active, f.backup)
  await f.manager.recover()
  assert.equal((await f.readActive()).marker, 'old')
  assert.equal(JSON.parse(await readFile(join(f.candidate, 'package.json'))).marker, 'new')
})

test('recovery restores the old profile after a candidate became active and retains the candidate', async t => {
  const f = await fixture(t)
  await rename(f.active, f.backup)
  await rename(f.candidate, f.active)
  await f.manager.recover()
  assert.equal((await f.readActive()).marker, 'old')
  const interrupted = (await readdir(join(f.home, 'profiles'))).find(name => name.includes('interrupted'))
  assert.equal(JSON.parse(await readFile(join(f.home, 'profiles', interrupted, 'package.json'))).marker, 'new')
})

test('recovery can repeat after restoring the backup but before completing the journal', async t => {
  const f = await fixture(t)
  await rename(f.active, f.backup)
  await rename(f.backup, f.active)
  await f.manager.recover()
  await f.manager.recover()
  assert.equal((await f.readActive()).marker, 'old')
  assert.equal(JSON.parse(await readFile(f.journal)).state, 'recovered')
})

test('a missing active and backup profile preserves recovery evidence and never promotes an unverified candidate', async t => {
  const f = await fixture(t)
  await rename(f.active, join(f.home, 'profiles/retained-for-review'))
  await assert.rejects(f.manager.recover(), /no complete active or backup/)
  assert.deepEqual(JSON.parse(await readFile(f.journal)), f.pending)
  assert.equal(JSON.parse(await readFile(join(f.candidate, 'package.json'))).marker, 'new')
})

test('recovery refuses a backup outside managed history without moving the active profile', async t => {
  const f = await fixture(t)
  await writeFile(f.journal, JSON.stringify({ ...f.pending, backup: f.candidate }))
  await assert.rejects(f.manager.recover(), /outside managed history/)
  assert.equal((await f.readActive()).marker, 'old')
  assert.equal(JSON.parse(await readFile(join(f.candidate, 'package.json'))).marker, 'new')
})

test('failure to persist a switch journal leaves the running Host and profile untouched', async t => {
  let stops = 0, starts = 0
  const f = await fixture(t, { stopHost: async () => { stops++ }, startHost: async () => { starts++ } })
  await rename(f.journal, f.journal + '.previous')
  await mkdir(f.journal)
  await assert.rejects(f.manager.mutate(['install']))
  assert.equal(stops, 0)
  assert.equal(starts, 0)
  assert.equal((await f.readActive()).marker, 'old')
})

test('a failed Host stop restores availability before any profile is moved', async t => {
  let starts = 0
  const f = await fixture(t, { stopHost: async () => { throw new Error('Host stop failed') }, startHost: async () => { starts++ } })
  await assert.rejects(f.manager.mutate(['install']), /Host stop failed/)
  assert.equal(starts, 1)
  assert.equal((await f.readActive()).marker, 'old')
})

test('a failed first rename cannot quarantine the intact active profile', async t => {
  let f
  f = await fixture(t, { stopHost: async () => {
    const transaction = JSON.parse(await readFile(f.journal))
    await mkdir(transaction.backup, { recursive: true })
    await writeFile(join(transaction.backup, 'package.json'), '{"marker":"obstruction"}')
  } })
  await assert.rejects(f.manager.mutate(['install']))
  assert.equal((await f.readActive()).marker, 'old')
})

test('rollback writes a recoverable transaction before stopping the Host', async t => {
  let observed
  let f
  f = await fixture(t, { stopHost: async () => { observed = JSON.parse(await readFile(f.journal)) } })
  await rename(f.active, f.backup)
  await rename(f.candidate, f.active)
  await writeFile(f.journal, JSON.stringify({ ...f.pending, state: 'complete' }))
  assert.deepEqual(await f.manager.rollback(), { rolledBack: true })
  assert.equal(observed.state, 'activating')
  assert.equal(observed.operation, 'rollback')
  assert.notEqual(observed.backup, f.backup)
  assert.equal((await f.readActive()).marker, 'old')
  assert.equal(JSON.parse(await readFile(join(observed.backup, 'package.json'))).marker, 'new')
  assert.equal(JSON.parse(await readFile(f.journal)).state, 'rolled-back')
})

test('recovery retains the pre-rollback generation if rollback stopped after switching profiles', async t => {
  const f = await fixture(t)
  await rename(f.active, f.backup)
  await rename(f.candidate, f.active)
  const preRollback = join(f.home, 'resources/history/pre-rollback')
  await writeFile(f.journal, JSON.stringify({ state: 'activating', operation: 'rollback', backup: preRollback, candidate: f.backup }))
  await rename(f.active, preRollback)
  await rename(f.backup, f.active)
  await f.manager.recover()
  assert.equal((await f.readActive()).marker, 'new')
})
