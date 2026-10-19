import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { acquireProfileMutation } from '../../tools/commands/profile-mutation-lock.mjs'

test('Windows stale-owner contenders cannot remove a successor lease', { skip: process.platform !== 'win32' }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-mutation-lease-'))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }))
  const profile = join(root, 'web')
  await mkdir(profile)
  await writeFile(join(root, '.zerowall-plugin-mutation.lock'), JSON.stringify({ pid: 2147483647, token: 'dead-owner' }))
  const module = pathToFileURL(resolve('tools/commands/profile-mutation-lock.mjs')).href
  const run = promisify(execFile)
  const contenders = await Promise.all(Array.from({ length: 6 }, () => run(process.execPath, ['--input-type=module', '-e', `
    import { acquireProfileMutation } from ${JSON.stringify(module)};
    try {
      const release = await acquireProfileMutation(process.argv[1]);
      console.log('acquired');
      await new Promise(resolve => setTimeout(resolve, 1500));
      await release();
    } catch (error) {
      if (!error.message.includes('PLUGIN_TRANSACTION_BUSY')) throw error;
      console.log('busy');
    }
  `, profile], { windowsHide: true })))
  assert.equal(contenders.filter(result => result.stdout.trim() === 'acquired').length, 1)
  assert.equal(contenders.filter(result => result.stdout.trim() === 'busy').length, 5)
  const release = await acquireProfileMutation(profile)
  await release()
})
