import assert from 'node:assert/strict'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { root, contract } from '../build/paths.mjs'
import { verifyMaterializedProfile } from '../commands/profile-materialization.mjs'
import { verifyHistoricalPluginImports } from '../commands/historical-plugin.mjs'
import { readOfflineReceipt } from '../commands/offline-profile.mjs'
import { createResourceManager } from '../commands/resource-manager.mjs'
import * as yaml from 'yaml'

const profile = resolve(process.argv[2]), stage = resolve(process.argv[3] ?? contract.stage)
const json = async file => JSON.parse(await readFile(file, 'utf8'))
const keys = await json(join(root, 'config/catalogs/trusted-keys.json'))
const pin = await json(join(root, 'config/deepseek-harness/upstream.json'))
const target = { desktopVersion: contract.version, dshVersion: pin.version, dshCommit: pin.commit, platform: process.platform, architecture: process.arch }
const options = { profile, keys, target }
const defaults = await json(join(stage, 'commands/default-plugins.json'))
const marker = await json(join(profile, '.zerowall/materialized-profile.json'))
const source = await readOfflineReceipt(join(stage, 'offline-profile'), keys, target)
const invalid = []
for (const id of defaults) if (!await verifyMaterializedProfile({ ...options, expected: [id] })) invalid.push(id)
let historicalError
try { await verifyHistoricalPluginImports({ ...options, runtimeModules: join(stage, 'runtime/node_modules'), full: false }) }
catch (error) { historicalError = error.message }
const report = { validWithoutExpected: Boolean(await verifyMaterializedProfile(options)), invalid,
  markerDigest: marker.digest, sourceDigest: source.digest, historicalError }
if (process.argv.includes('--assert-reuse')) {
  const manager = createResourceManager({ home: resolve(profile, '../..'), keys, target, yaml,
    defaultPlugins: defaults, bundledPlugins: await json(join(stage, 'commands/bundled-plugins.json')),
    runtimeModules: join(stage, 'runtime/node_modules'), offlineStaging: true,
    stopHost: async () => {}, startHost: async () => {},
  })
  const result = await manager.repairOffline(join(stage, 'offline-profile'))
  assert.equal(result.repaired, false, 'A repaired profile must reuse the current generation')
  assert.deepEqual(await readdir(resolve(profile, '..')), ['web'])
  await writeFile(resolve(profile, '../../../generation-reuse-verification.json'), JSON.stringify({ ...report, reused: true, activeProfile: 'web' }, null, 2))
}
console.log(JSON.stringify(report, null, 2))
