import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { root } from '../build/paths.mjs'

const retiredPluginConfigPath = join(root, 'config/catalogs/retired-plugins.json')
const retiredResourceConfigPath = join(root, 'config/catalogs/retired-resources.json')

export async function readRetiredPluginIds() {
  const config = JSON.parse(await readFile(retiredPluginConfigPath, 'utf8'))
  if (config.schema !== 1 || !Array.isArray(config.plugins)) throw new Error('Invalid retired plugin catalog.')
  const ids = new Set()
  for (const plugin of config.plugins) {
    if (typeof plugin.id !== 'string' || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(plugin.id)
      || typeof plugin.reason !== 'string' || !plugin.reason.trim() || ids.has(plugin.id)) {
      throw new Error('Invalid or duplicate retired plugin entry: ' + plugin.id)
    }
    ids.add(plugin.id)
  }
  return ids
}

export async function readRetiredResourceIds(kind) {
  if (!['plugin', 'skill'].includes(kind)) throw new Error('Invalid retired resource kind: ' + kind)
  const config = JSON.parse(await readFile(retiredResourceConfigPath, 'utf8'))
  if (config.schema !== 1 || !Array.isArray(config[kind])) throw new Error('Invalid retired resource catalog.')
  const ids = new Set()
  for (const id of config[kind]) {
    if (typeof id !== 'string' || !id.trim() || ids.has(id)) throw new Error('Invalid or duplicate retired resource entry: ' + id)
    ids.add(id)
  }
  return ids
}

export function withoutRetiredPlugins(records, retiredIds) {
  return records.filter(record => !retiredIds.has(record.id))
}

export function pluginSnapshotId(records, dshCommit) {
  return createHash('sha256').update(JSON.stringify({ schema: 1, dshCommit,
    plugins: records.map(({ id, version, kind, size, sha256 }) => ({ id, version, kind, size, sha256 }))
      .sort((a, b) => `${a.id}@${a.version}`.localeCompare(`${b.id}@${b.version}`)),
  })).digest('hex')
}

/** Verify the current shared feed; historical desktop releases are not the authority. */
export async function readVerifiedPluginFeed(store) {
  const records = await readFile(join(store, 'plugin-packages.json'), 'utf8').then(JSON.parse, error => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })
  if (records === undefined) return undefined
  if (!Array.isArray(records) || !records.length) throw new Error('The latest plugin feed is empty or invalid.')
  const retiredIds = await readRetiredPluginIds()
  const ids = new Set()
  for (const record of records) {
    if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(record.id ?? '') || ids.has(record.id)
      || !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][a-zA-Z0-9.+-]+)?$/u.test(record.version ?? '')
      || !/^[a-f0-9]{64}$/u.test(record.sha256 ?? '') || !Number.isSafeInteger(record.size) || record.size <= 0
      || typeof record.path !== 'string') throw new Error('Invalid or duplicate plugin artifact record: ' + record.id)
    ids.add(record.id)
    if (retiredIds.has(record.id)) continue
    const expected = resolve(store, record.id.split('/').at(-1), record.version)
    const path = resolve(record.path)
    const physical = await realpath(path)
    const inside = candidate => { const rel = relative(expected, candidate); return rel && !rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel) }
    const info = await lstat(path)
    if (!inside(path) || !inside(physical) || !info.isFile() || info.isSymbolicLink() || info.size !== record.size
      || createHash('sha256').update(await readFile(path)).digest('hex') !== record.sha256) {
      throw new Error(`Latest feed has a missing or changed plugin artifact, or an unsafe path: ${record.id}@${record.version}`)
    }
  }
  return withoutRetiredPlugins(records, retiredIds)
}

/** A valid old build receipt alone cannot prove that new plugin packages were integrated. */
export async function verifyStagePluginFeed(stage, records, dshCommit) {
  if (!records?.length) throw new Error('No verified latest plugin feed; run pnpm build.')
  const snapshot = JSON.parse(await readFile(join(stage, 'plugin-snapshot.json'), 'utf8'))
  const expected = pluginSnapshotId(records, dshCommit)
  if (snapshot.snapshotId !== expected || pluginSnapshotId(snapshot.plugins, dshCommit) !== expected) {
    throw new Error('The component stage does not integrate the latest plugin snapshot; run pnpm build.')
  }
  const offlineReceipt = JSON.parse(await readFile(join(stage, 'offline-profile/receipt.json'), 'utf8'))
  for (const record of records) {
    // Composition declarations are shipped as commands/catalogs, not Host modules.
    if (record.manifest?.composition) continue
    const contents = await Promise.all(['runtime/node_modules', 'offline-profile/modules'].map(folder =>
      readFile(join(stage, folder, record.id, 'package.json'), 'utf8').catch(error => {
        if (error.code === 'ENOENT') return undefined
        throw error
      })))
    const installed = contents.map(text => text === undefined ? undefined : JSON.parse(text))
    if (!installed.some(manifest => manifest?.name === record.id && manifest.version === record.version)
      || installed.some(manifest => manifest && (manifest.name !== record.id || manifest.version !== record.version))) {
      throw new Error(`Latest plugin is missing or stale in the runtime closure: ${record.id}@${record.version}`)
    }
    // Electron ships the carrier, not the staging modules. Its signed logical
    // manifest must bind the same version; a new modules tree beside an old
    // profile-runtime.asar is not a successful integration.
    if (contents[1] !== undefined) {
      const signed = offlineReceipt.files?.find(file => file.path === `modules/${record.id}/package.json`)
      const sha256 = createHash('sha256').update(contents[1]).digest('hex')
      if (signed?.sha256 !== sha256) throw new Error(`Offline carrier does not integrate the latest plugin manifest: ${record.id}@${record.version}`)
    }
  }
  return expected
}

export function assertFeedNotRegressed(before, after) {
  for (const previous of before ?? []) {
    const next = after?.find(record => record.id === previous.id)
    if (!next) throw new Error(`Latest plugin disappeared during assembly: ${previous.id}; synchronize plugin sources first.`)
    if (compareVersions(next.version, previous.version) < 0 || (previous.version === next.version && previous.sha256 !== next.sha256)) {
      throw new Error(`Plugin feed regressed or changed immutable bytes: ${previous.id}; synchronize plugin sources first.`)
    }
  }
}

function compareVersions(left, right) {
  const parse = value => { const [core, ...pre] = value.split('+')[0].split('-'); return { core: core.split('.').map(Number), pre: pre.length ? pre.join('-').split('.') : [] } }
  const a = parse(left), b = parse(right)
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] - b.core[i]
  if (!a.pre.length || !b.pre.length) return a.pre.length ? -1 : b.pre.length ? 1 : 0
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i]
    if (x === y) continue
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1
    const nx = /^\d+$/u.test(x), ny = /^\d+$/u.test(y)
    if (nx && ny) return Number(x) - Number(y)
    if (nx !== ny) return nx ? -1 : 1
    return x < y ? -1 : 1
  }
  return 0
}

export function mergePluginFeed(current, replacements) {
  const ids = new Set(replacements.map(record => record.id))
  const result = [...current.filter(record => !ids.has(record.id)), ...replacements]
  assertFeedNotRegressed(current, result)
  return result
}
