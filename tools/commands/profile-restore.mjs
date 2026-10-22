import { randomUUID } from 'node:crypto'
import { cp, mkdir, readFile, realpath, rm, symlink } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pluginIdentity } from './offline-profile.mjs'
import { RETIRED_PLUGIN_IDS } from './retired-plugins.mjs'
import { verifiedInlinedDependencies } from './inlined-dependencies.mjs'
import { archiveHistoricalPluginProvenance, importHistoricalPlugin, restoreHistoricalPluginSnapshot, verifyCurrentRuntimeDependency } from './historical-plugin.mjs'

const inside = (root, path) => { const child = relative(root, path); return child === '' || child !== '..' && !child.startsWith('..' + sep) && !isAbsolute(child) }
const manifestAt = path => readFile(join(path, 'package.json'), 'utf8').then(JSON.parse).catch(error => { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error })

/** Copy package instances and their resolved dependency graph into a private
 * candidate namespace. Sibling pnpm dependencies and peer instances must not
 * be rebound to unrelated versions installed at the profile root. */
export async function restorePackageClosure({ candidate, previousProfile, packageIds, home, keys, target, local, runtimeModules }) {
  if (!inside(join(home, 'resources/history'), resolve(previousProfile))) throw new Error('Plugin rollback profile is outside managed history')
  const namespace = join(candidate, 'node_modules/.zerowall-restores', randomUUID())
  const instances = new Map()
  const result = new Map()
  async function linked(path, targetPath) {
    await mkdir(dirname(path), { recursive: true })
    await rm(path, { recursive: true, force: true })
    await symlink(targetPath, path, process.platform === 'win32' ? 'junction' : 'dir')
  }
  async function carrierPackage(source) {
    // Read only the selected signed plugin and its required non-core closure;
    // the old carrier and its DSH core never become active runtime sources.
    const normalized = source.replaceAll('\\', '/')
    const match = /^(.*\/(?:resources\/offline|node_modules\/\.zerowall-carriers))\/([a-f0-9]{64})\/(.*)$/u.exec(normalized)
    if (!match) return undefined
    const sourceCarrier = resolve(match[1], match[2]), digest = match[2]
    if (!inside(home, sourceCarrier)) throw new Error('Plugin rollback carrier is outside managed storage')
    const manifest = await manifestAt(source)
    const imported = await importHistoricalPlugin({ profile: candidate, source: sourceCarrier, digest, id: manifest.name, keys, target, runtimeModules, local })
    return imported.path
  }
  async function dependency(source, id) {
    pluginIdentity(id)
    let directory = source
    for (;;) {
      const entry = join(directory, 'node_modules', id)
      if (await manifestAt(entry)) return realpath(entry)
      const parent = dirname(directory)
      if (parent === directory) break
      directory = parent
    }
    return undefined
  }
  async function visit(source, fixedRoot) {
    source = await realpath(source)
    if (instances.has(source) && !fixedRoot) return instances.get(source)
    const manifest = await manifestAt(source)
    if (!manifest) throw new Error('Plugin rollback dependency has no package manifest')
    if (RETIRED_PLUGIN_IDS.has(manifest.name)) throw new Error('Plugin has been retired: ' + manifest.name)
    const dependencies = { ...manifest.peerDependencies, ...manifest.dependencies, ...manifest.optionalDependencies }
    if (Object.keys(dependencies).some(id => RETIRED_PLUGIN_IDS.has(id))) throw new Error('Plugin rollback requires a retired dependency')
    const carrier = await carrierPackage(source)
    if (carrier) { instances.set(source, carrier); return carrier }
    const destination = fixedRoot ?? join(namespace, 'packages', String(instances.size))
    instances.set(source, destination)
    await mkdir(dirname(destination), { recursive: true })
    if (fixedRoot) {
      const previous = join(candidate, '.zerowall/restore-history', randomUUID())
      const info = await import('node:fs/promises').then(({ lstat }) => lstat(destination)).catch(error => { if (error.code !== 'ENOENT') throw error })
      if (info) { await mkdir(dirname(previous), { recursive: true }); await import('node:fs/promises').then(({ rename }) => rename(destination, previous)) }
    }
    await cp(source, destination, { recursive: true, dereference: true, filter: path => relative(source, path) !== 'node_modules' })
    const inlined = await verifiedInlinedDependencies(destination, manifest)
    for (const id of Object.keys(dependencies ?? {})) {
      if (inlined.has(id)) continue
      const optional = Boolean(manifest.optionalDependencies?.[id] || manifest.peerDependenciesMeta?.[id]?.optional)
      if (id.startsWith('@deepseek-ai/')) {
        await verifyCurrentRuntimeDependency({ id, range: dependencies[id], runtimeModules, target, optional })
        continue
      }
      const resolved = await dependency(source, id)
      if (!resolved) {
        if (runtimeModules) {
          await verifyCurrentRuntimeDependency({ id, range: dependencies[id], runtimeModules, target, optional })
          continue
        }
        if (optional) continue
        throw new Error('Plugin rollback dependency is missing: ' + id)
      }
      if (runtimeModules && inside(resolve(runtimeModules), resolved)) {
        await verifyCurrentRuntimeDependency({ id, range: dependencies[id], runtimeModules, target, optional })
        continue
      }
      await linked(join(destination, 'node_modules', id), await visit(resolved))
    }
    return destination
  }
  for (const id of packageIds) {
    pluginIdentity(id)
    if (RETIRED_PLUGIN_IDS.has(id)) throw new Error('Plugin has been retired: ' + id)
    const entry = join(previousProfile, 'node_modules', id), destination = join(candidate, 'node_modules', id)
    const imported = await restoreHistoricalPluginSnapshot({ profile: candidate, previousProfile, id, keys, target, runtimeModules, local })
    if (imported) { result.set(id, 'link:./node_modules/' + id); continue }
    await archiveHistoricalPluginProvenance({ profile: candidate, id })
    if (!await manifestAt(entry)) { await rm(destination, { recursive: true, force: true }); result.set(id, undefined); continue }
    const manifest = await manifestAt(entry)
    if (manifest.name !== id) throw new Error('Plugin rollback package identity mismatch: ' + id)
    const restored = await visit(entry, destination)
    if (restored !== destination) throw new Error('Plugin rollback did not produce a fixed physical root')
    result.set(id, 'link:./' + relative(candidate, restored).replaceAll('\\', '/'))
  }
  return result
}
