import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'
import * as yaml from 'yaml'
import { contract, root } from '../build/paths.mjs'
import { copyProfileTree } from '../commands/profile-copy.mjs'
import { repairProfileLayout } from '../commands/profile-layout.mjs'
import { createResourceManager } from '../commands/resource-manager.mjs'

const original = resolve(process.argv[2])
const output = join(contract.verification, `startup-profile-repair-${Date.now()}`)
assert(relative(original, output).startsWith('..'), 'Replay must be outside the original user profile')
const home = join(output, 'harness'), active = join(home, 'profiles/web')
const json = async file => JSON.parse(await readFile(file, 'utf8'))
const keys = await json(join(root, 'config/catalogs/trusted-keys.json'))
const defaults = await json(join(contract.stage, 'commands/default-plugins.json'))
const bundledPlugins = await json(join(contract.stage, 'commands/bundled-plugins.json'))
const pin = await json(join(root, 'config/deepseek-harness/upstream.json'))
const target = { desktopVersion: contract.version, dshVersion: pin.version, dshCommit: pin.commit, platform: process.platform, architecture: process.arch }
const preserved = new Map()
console.log('copy-original-profile:started')
await copyProfileTree(join(original, 'profiles/web'), active, {
  filter: local => !/^\.plugin-manager(?:\/|$)|^\.zerowall\/(?:retired|inactive)-plugin-history(?:\/|$)|(?:^|\/)package\.json\.lock(?:\/|$)/u.test(local),
})
const layout = await repairProfileLayout(active, { from: join(original, 'profiles/web'), home, diagnoseMissingTargets: true })
assert(!layout.needsRelink, 'Isolated profile links must be rebased before replay')
console.log('copy-original-profile:complete')
for (const local of ['settings.yaml', 'resources/plugins/selection.json']) {
  const bytes = await readFile(join(original, local)).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (!bytes) continue
  const destination = join(home, local)
  await mkdir(resolve(destination, '..'), { recursive: true })
  await copyFile(join(original, local), destination)
  preserved.set(local, createHash('sha256').update(bytes).digest('hex'))
}
const phases = [], manager = createResourceManager({ home, keys, target, defaultPlugins: defaults, bundledPlugins, yaml,
  runtimeModules: join(contract.stage, 'runtime/node_modules'), offlineStaging: true,
  stopHost: async () => {}, startHost: async () => {},
  onOfflinePhase: event => { phases.push(event); console.log(`${event.phase}:${event.state}`) },
})
await manager.recover()
const result = await manager.repairOffline(join(contract.stage, 'offline-profile'))
assert.equal(result.repaired, true, 'The original startup fault must exercise repair')
assert.equal((await manager.repairOffline(join(contract.stage, 'offline-profile'))).repaired, false)
assert.deepEqual(await readdir(join(home, 'profiles')), ['web'])
for (const [local, digest] of preserved) assert.equal(createHash('sha256').update(await readFile(join(home, local))).digest('hex'), digest)
for (const entry of bundledPlugins.filter(entry => entry.core && entry.managed !== false)) {
  await assert.rejects(lstat(join(active, 'node_modules', entry.id)), { code: 'ENOENT' })
}
const evidence = { complete: true, originalPreserved: true, replayOnly: true, buildId: contract.buildId,
  activeProfile: 'web', remainingProfiles: await readdir(join(home, 'profiles')),
  preservedFiles: [...preserved.keys()], changed: result.changed, phases }
await writeFile(join(output, 'verification.json'), JSON.stringify(evidence, null, 2))
console.log(JSON.stringify({ complete: true, output, activeProfile: 'web', changedPackages: result.changed.length }))
