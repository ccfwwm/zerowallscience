import { cp, mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pluginIdentity } from './offline-profile.mjs'

const inside = (root, path) => { const child = relative(root, path); return child === '' || !isAbsolute(child) && child !== '..' && !child.startsWith('..' + sep) }
const manifestAt = path => readFile(join(path, 'package.json'), 'utf8').then(JSON.parse).catch(error => { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error })

/** Independent rollback bytes for affected packages and their resolved instances.
 * Unrelated profiles and historical install namespaces are never traversed. */
export async function snapshotPackageClosure({ profile, backup, ids, signal, report = () => {} }) {
  profile = resolve(profile); backup = resolve(backup)
  const instances = new Map()
  const roots = new Map()
  for (const id of ids) { pluginIdentity(id); const path = join(profile, 'node_modules', id); if (await manifestAt(path)) roots.set(await realpath(path), join(backup, 'node_modules', id)) }
  await mkdir(backup, { recursive: true })
  for (const name of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'cordis.patch.yml', 'compatibility.json']) {
    const bytes = await readFile(join(profile, name)).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (bytes) await writeFile(join(backup, name), bytes)
  }
  async function dependency(source, id) {
    for (let cursor = source;; cursor = dirname(cursor)) {
      const entry = join(cursor, 'node_modules', id)
      if (await manifestAt(entry)) return realpath(entry)
      if (dirname(cursor) === cursor) return undefined
    }
  }
  async function visit(source, destination) {
    signal?.throwIfAborted()
    source = await realpath(source)
    if (instances.has(source)) return instances.get(source)
    destination ??= roots.get(source) ?? join(backup, 'node_modules/.zerowall-snapshot', String(instances.size))
    instances.set(source, destination)
    const manifest = await manifestAt(source)
    await mkdir(dirname(destination), { recursive: true })
    await cp(source, destination, { recursive: true, dereference: false, verbatimSymlinks: true,
      filter: path => { signal?.throwIfAborted(); return relative(source, path) !== 'node_modules' } })
    for (const id of Object.keys({ ...manifest.peerDependencies, ...manifest.dependencies, ...manifest.optionalDependencies })) {
      pluginIdentity(id)
      const resolved = await dependency(source, id)
      if (!resolved) continue // Preserve an already missing edge for explicit repair.
      const target = inside(profile, resolved) ? await visit(resolved) : resolved
      const link = join(destination, 'node_modules', id)
      await mkdir(dirname(link), { recursive: true })
      await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir')
    }
    return destination
  }
  for (const [index, id] of [...new Set(ids)].entries()) {
    pluginIdentity(id)
    const source = join(profile, 'node_modules', id)
    if (await manifestAt(source)) await visit(source, join(backup, 'node_modules', id))
    const provenance = await readFile(join(profile, '.zerowall/plugin-imports', encodeURIComponent(id) + '.json')).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (provenance) { await mkdir(join(backup, '.zerowall/plugin-imports'), { recursive: true }); await writeFile(join(backup, '.zerowall/plugin-imports', encodeURIComponent(id) + '.json'), provenance) }
    await report({ phase: 'snapshot', completed: index + 1, total: ids.length })
  }
  await writeFile(join(backup, 'snapshot.json'), JSON.stringify({ schema: 1, ids, instances: instances.size }))
}
