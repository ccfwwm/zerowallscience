import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as yaml from 'yaml'
import { createResourceManager } from '../../tools/commands/resource-manager.mjs'
import { enqueuePendingPlugin, readPendingPlugin } from '../../tools/commands/profile-pending.mjs'
import { acquireProfileMutation } from '../../tools/commands/profile-mutation-lock.mjs'
import { holdWindowsFile, releaseWindowsFiles } from './plugin-lock-fixture.mjs'

const execute = promisify(execFile)
const executor = resolve('tools/commands/pnpm-executor.mjs'), pnpm = resolve('deepseek-harness/apps/desktop/node_modules/pnpm/bin/pnpm.cjs')

test('a locked uninstall releases its lease, preserves selection, and resumes against the newest manifest', { skip: process.platform !== 'win32' }, async t => {
  const home = await mkdtemp(join(tmpdir(), 'zws-pending-'))
  t.after(async () => { await releaseWindowsFiles(t); await rm(home, { recursive: true, force: true, maxRetries: 5 }) })
  const profile = join(home, 'profiles/web'), selected = join(profile, 'node_modules/selected'), addition = join(home, 'new-plugin')
  await mkdir(selected, { recursive: true }); await mkdir(addition)
  await writeFile(join(selected, 'package.json'), JSON.stringify({ name: 'selected', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } } }))
  await writeFile(join(selected, 'cordis.patch.yml'), '- name: fixture/plugin\n  id: custom-entry\n')
  await writeFile(join(selected, 'native.dll'), 'locked native bytes')
  await writeFile(join(addition, 'package.json'), JSON.stringify({ name: 'new-plugin', version: '1.0.0' }))
  const manifest = { private: true, dependencies: { selected: 'link:./node_modules/selected' }, dsh: { profile: { bundles: ['selected'] } }, zerowall: { profileLayout: 3 }, settings: { reasoningEffort: 'max' } }
  await writeFile(join(profile, 'package.json'), JSON.stringify(manifest))
  await mkdir(join(home, 'resources/plugins'), { recursive: true })
  const selection = { disabled: ['other-disabled'], removed: [], pinned: {} }, selectionPath = join(home, 'resources/plugins/selection.json')
  await writeFile(selectionPath, JSON.stringify(selection))
  let starts = [], calls = 0, hostRunning = true
  const baseline = { ready: false, entries: [{ id: 'unrelated', name: 'other-plugin/service', state: 3 }] }
  const manager = createResourceManager({ home, yaml, target: { desktopVersion: '8.4.3', dshVersion: '0.2.0-rc.2', platform: 'win32', architecture: 'x64' },
    readHealth: async () => { assert.equal(hostRunning, true, 'baseline must be read before stopping the Host'); return baseline },
    stopHost: async () => { await readFile(join(home, 'profiles/.zerowall-plugin-mutation.lock')); hostRunning = false },
    startHost: async options => { starts.push(options); hostRunning = true }, runPlugin: async (args, generation, options = {}) => {
      calls++
      try {
        await execute(process.execPath, [executor, pnpm, ...args], { cwd: join(home, 'profiles', generation), env: { ...process.env, ZEROWALL_RESOURCE_CANDIDATE_ID: options.resourceCandidateId, npm_config_offline: 'true', npm_config_ignore_scripts: 'true' }, windowsHide: true })
      } catch (error) {
        if (/PLUGIN_RESTART_REQUIRED|PLUGIN_TARGET_LOCKED/u.test(error.stderr ?? '')) {
          const locked = new Error('PLUGIN_TARGET_LOCKED: plugin target is in use'); locked.code = 'PLUGIN_TARGET_LOCKED'; throw locked
        }
        throw error
      }
    },
  })
  const release = await holdWindowsFile(t, join(selected, 'native.dll'))
  let pending = await manager.mutate(['remove', 'selected'])
  assert.equal(pending.pendingRestart, true)
  assert.deepEqual(JSON.parse(await readFile(selectionPath)), selection)
  assert.deepEqual(JSON.parse(await readFile(join(profile, 'package.json'))), manifest)
  await assert.rejects(readFile(join(home, 'profiles/.zerowall-plugin-mutation.lock')), { code: 'ENOENT' })
  const repeated = await manager.resumePending(pending.pendingId)
  assert.equal(repeated.pendingId, pending.pendingId)
  const beforeCancelCalls = calls
  await manager.cancelPending(pending.pendingId)
  assert.equal(calls, beforeCancelCalls)
  assert.deepEqual(JSON.parse(await readFile(join(profile, 'package.json'))), manifest)
  await assert.rejects(manager.resumePending(pending.pendingId), /cannot be resumed/)
  pending = await manager.mutate(['remove', 'selected'])
  assert.equal(pending.pendingRestart, true)
  await manager.mutate(['add', 'file:' + addition])
  assert.equal(JSON.parse(await readFile(join(profile, 'node_modules/new-plugin/package.json'))).version, '1.0.0')
  const beforeRecoveryCalls = calls
  await manager.recover()
  assert.equal(calls, beforeRecoveryCalls, 'startup recovery must not replay pending intent')
  await release()
  starts = []
  await manager.resumePending(pending.pendingId)
  const after = JSON.parse(await readFile(join(profile, 'package.json')))
  assert.equal(after.dependencies.selected, undefined)
  assert.ok(after.dependencies['new-plugin'])
  assert.deepEqual(after.settings, manifest.settings)
  assert.ok(starts[0].affectedEntries.some(entry => entry.id === 'custom-entry'))
  assert.deepEqual(starts[0].baseline, baseline, 'explicit restart must retain unrelated failure baseline')
  assert.equal(starts.length, 1, 'successful activation must not restart the Host twice')
  assert.equal((await readPendingPlugin(home, pending.pendingId)).state, 'complete')
  await assert.rejects(manager.resumePending(pending.pendingId), /cannot be resumed/)
  await assert.rejects(manager.mutate(['remove', 'selected', 'new-plugin']), /one plugin identity/)
  await assert.rejects(manager.repairPlugin('../outside'), /Invalid/)
})

test('pending retry owns the lease before stopping Host and restores Host when preparation fails', async t => {
  const home = await mkdtemp(join(tmpdir(), 'zws-pending-lease-'))
  t.after(() => rm(home, { recursive: true, force: true, maxRetries: 5 }))
  const profile = join(home, 'profiles/web')
  await mkdir(profile, { recursive: true })
  const pending = await enqueuePendingPlugin(home, { method: 'mutate', args: [['invalid-action']] })
  const events = []
  const baseline = { ready: false, entries: [{ id: 'unrelated', state: 3 }] }
  const manager = createResourceManager({ home, yaml,
    readHealth: async () => { events.push('health'); return baseline },
    stopHost: async () => { await readFile(join(home, 'profiles/.zerowall-plugin-mutation.lock')); events.push('stop') },
    startHost: async options => { await readFile(join(home, 'profiles/.zerowall-plugin-mutation.lock')); assert.deepEqual(options.baseline, baseline); events.push('start') },
  })
  const release = await acquireProfileMutation(profile)
  try {
    await assert.rejects(manager.resumePending(pending.pendingId), /PLUGIN_TRANSACTION_BUSY/)
    assert.deepEqual(events, [], 'another operation must keep its running Host')
  } finally { await release() }
  await assert.rejects(manager.resumePending(pending.pendingId), /Invalid plugin mutation/)
  assert.deepEqual(events, ['health', 'stop', 'start'])
  assert.equal((await readPendingPlugin(home, pending.pendingId)).state, 'pending-restart')
  await assert.rejects(readFile(join(home, 'profiles/.zerowall-plugin-mutation.lock')), { code: 'ENOENT' })
})
