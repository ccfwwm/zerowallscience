import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as yaml from 'yaml'
import { contract, root } from '../../tools/build/paths.mjs'
import { copyProfileTree } from '../../tools/commands/profile-copy.mjs'
import { repairProfileLayout } from '../../tools/commands/profile-layout.mjs'
import { createResourceManager } from '../../tools/commands/resource-manager.mjs'
import { runProfilePnpmTransaction } from '../../tools/commands/profile-pnpm-transaction.mjs'
import { verifyCatalog } from '../../tools/release/resource-catalog.mjs'

// Explicit release verification, never startup maintenance. Use public, signed
// bytes and the real pnpm transaction, in a copy of the 8.4.6 isolated profile.
const directory = join(contract.verification, 'interface-resources-' + Date.now())
const home = join(directory, 'harness'), active = join(home, 'profiles/web')
await mkdir(directory, { recursive: true })
const original = process.env.ZEROWALL_INTERFACE_BASELINE_PROFILE ?? join(contract.verification, 'interface-upgrade/user-data/harness/profiles/web')
const originalAccount = JSON.parse(await readFile(join(original, 'node_modules/@zerowallscience/plugin-account/package.json'))).version
assert.notEqual(originalAccount, '0.1.16', 'Resource verification requires an unmodified pre-update profile')
await copyProfileTree(original, active, { filter: path => !path.startsWith('.plugin-manager') })
await repairProfileLayout(active, { from: original })
const keys = JSON.parse(await readFile(join(root, 'config/catalogs/trusted-keys.json')))
const pointer = JSON.parse(await readFile(join(contract.release, 'catalogs/plugin-latest.json')))
const response = await fetch(pointer.catalog.downloadUrl)
assert(response.ok, `Staged signed catalog is publicly available: HTTP ${response.status}`)
const document = verifyCatalog(await response.json(), keys, { local: false })
const account = '@zerowallscience/plugin-account', base = '@zerowallscience/plugin-base'
assert.equal(document.resources.find(item => item.id === account).dependencies[base], '^0.1.24')
const selectionFile = join(home, 'resources/plugins/selection.json')
await mkdir(join(selectionFile, '..'), { recursive: true })
const selection = { disabled: [], removed: [], pinned: { [base]: '0.1.23' } }
await writeFile(selectionFile, JSON.stringify(selection))
const execute = promisify(execFile), calls = []
let failActivation = false
const manager = createResourceManager({ home, keys, yaml, runtimeModules: join(contract.stage, 'runtime/node_modules'),
  target: { desktopVersion: '8.4.7', dshVersion: '0.2.1-rc.2', platform: 'win32', architecture: 'x64' },
  runPlugin: async (args, generation) => {
    calls.push('pnpm-install')
    await runProfilePnpmTransaction({ profile: join(home, 'profiles', generation), args: [...args, '--offline', '--ignore-scripts'], run: async (args, cwd) => {
      const result = await execute(process.execPath, [join(root, 'deepseek-harness/apps/desktop/node_modules/pnpm/bin/pnpm.cjs'), ...args], { cwd, windowsHide: true, env: { ...process.env, CI: 'false' }, maxBuffer: 8 * 1024 ** 2 })
      return { code: 0, tail: result.stdout.slice(-2000) }
    } })
  }, stopHost: async () => { calls.push('stop') }, startHost: async () => {
    calls.push('activation')
    if (failActivation) { failActivation = false; throw new Error('injected activation failure') }
    for (const id of [account, base]) {
      const client = await readFile(join(active, 'node_modules', id, 'lib/client.js'), 'utf8').catch(error => {
        if (error.code !== 'ENOENT' || id !== base) throw error
        return readFile(join(contract.stage, 'runtime/node_modules', id, 'lib/client.js'), 'utf8')
      })
      assert(client.length > 100)
    }
  },
})
await assert.rejects(manager.updatePlugins([account], pointer.catalog.downloadUrl), /version is pinned/)
assert.deepEqual(JSON.parse(await readFile(selectionFile)), selection)
assert.deepEqual(calls, [])
await writeFile(selectionFile, JSON.stringify({ ...selection, pinned: {} }))
const version = async id => readFile(join(active, 'node_modules', id, 'package.json')).then(data => JSON.parse(data).version, error => { if (error.code !== 'ENOENT') throw error; return undefined })
const previous = { account: await version(account), base: await version(base) }
failActivation = true
await assert.rejects(manager.updatePlugins([account], pointer.catalog.downloadUrl), /injected activation failure/)
assert.equal(await version(account), previous.account)
assert.equal(await version(base), previous.base)
await manager.updatePlugins([account], pointer.catalog.downloadUrl)
assert.equal(await version(account), '0.1.16')
assert.equal(await version(base), '0.1.24')
const activeBeforeRollback = await readFile(join(active, 'package.json'), 'utf8')
await assert.rejects(manager.rollbackPlugin(account), /PLUGIN_ROLLBACK_CONFLICT: @zerowallscience\/plugin-ai-cloud requires @zerowallscience\/plugin-account@workspace:\^/)
assert.equal(await readFile(join(active, 'package.json'), 'utf8'), activeBeforeRollback)
assert.equal(await version(account), '0.1.16')
await manager.rollback()
assert.equal(await version(account), previous.account)
await writeFile(join(directory, 'receipt.json'), JSON.stringify({ complete: true, catalog: pointer.catalog.downloadUrl, previous, linkedDependencyUpdate: true, pinnedConflictPreserved: true, activationFailureRollback: true, incompatibleSinglePluginRollbackRejected: true, wholeProfileRollback: true, calls }, null, 2))
console.log(JSON.stringify({ complete: true, directory, calls }))
