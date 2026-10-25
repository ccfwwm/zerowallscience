import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { scanProfileLinks } from '../../tools/commands/profile-link-scan.mjs'

test('link scans keep exact dangling and cycle diagnoses and refresh after filesystem changes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-link-scan-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const profile = join(root, 'profile'), actual = join(profile, 'node_modules/actual')
  await mkdir(actual, { recursive: true })
  const link = async (local, target) => { const file = join(profile, local); await mkdir(dirname(file), { recursive: true }); await symlink(target, file, process.platform === 'win32' ? 'junction' : 'dir') }
  await link('node_modules/good', actual)
  await link('node_modules/dangling', join(root, 'missing'))
  await link('node_modules/first', join(profile, 'node_modules/second'))
  await link('node_modules/second', join(profile, 'node_modules/first'))
  await link('.zerowall/retired-plugin-history/old', join(root, 'retired-missing'))
  assert.deepEqual((await scanProfileLinks(profile)).map(({ path, fault }) => ({ path, fault })), [
    { path: 'node_modules/dangling', fault: 'dangling' },
    { path: 'node_modules/first', fault: 'cycle' },
    { path: 'node_modules/second', fault: 'cycle' },
  ])
  await mkdir(join(root, 'missing'))
  await unlink(join(profile, 'node_modules/second'))
  await link('node_modules/second', actual)
  assert.deepEqual(await scanProfileLinks(profile), [])
  await unlink(join(profile, 'node_modules/good'))
  await link('node_modules/good', join(profile, '.zerowall/retired-plugin-history/old'))
  assert.equal((await scanProfileLinks(profile)).find(row => row.path === 'node_modules/good')?.fault, 'dangling')
})
