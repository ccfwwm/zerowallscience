import { mkdir, readFile, writeFile, lstat, rename, symlink, cp, realpath, readdir, readlink } from 'node:fs/promises'
import { dirname, join, resolve, relative } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { parse, stringify } from './command-yaml.mjs'

const fields = ['dependencies', 'devDependencies', 'optionalDependencies']
const read = path => readFile(path, 'utf8').then(JSON.parse)
const exists = path => lstat(path).then(() => true, error => { if (error.code !== 'ENOENT') throw error; return false })
const packageName = value => /^(?<id>(?:@[^/\s]+\/)?[^@/\s]+)(?:@.*)?$/u.exec(value)?.groups.id

// Snapshot actual dependency instances, not just the direct package versions.
// Cyclic package graphs are finite because each physical instance is visited once.
async function retainedGraph(retained) {
  const instances = new Map()
  async function visit(directory) {
    const source = await realpath(directory)
    if (instances.has(source)) return source
    const manifest = await read(join(source, 'package.json'))
    const item = { name: manifest.name, version: manifest.version, files: Object.create(null), dependencies: Object.create(null) }
    instances.set(source, item)
    async function files(base, prefix = '') {
      for (const entry of (await readdir(base, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.name === 'node_modules') continue
        const path = join(base, entry.name), local = prefix + entry.name
        if (entry.isDirectory()) await files(path, local + '/')
        else if (entry.isSymbolicLink()) item.files[local] = { link: await readlink(path) }
        else if (entry.isFile()) {
          const digest = createHash('sha256')
          for await (const bytes of createReadStream(path)) digest.update(bytes)
          item.files[local] = digest.digest('hex')
        }
      }
    }
    await files(source)
    for (const id of Object.keys({ ...manifest.peerDependencies, ...manifest.dependencies, ...manifest.optionalDependencies }).sort()) {
      if (!packageName(id) || id.includes('..')) throw new Error('PLUGIN_RETAINED_DEPENDENCY_INVALID')
      let cursor = source
      for (;;) {
        const dependency = join(cursor, 'node_modules', id)
        if (await exists(join(dependency, 'package.json'))) { item.dependencies[id] = await visit(dependency); break }
        const parent = dirname(cursor); if (parent === cursor) break
        cursor = parent
      }
    }
    return source
  }
  for (const item of retained.values()) await visit(item.root)
  return Object.fromEntries([...instances].sort(([a], [b]) => a.localeCompare(b)))
}
async function localIdentity(path) {
  const info = await lstat(path)
  if (info.isDirectory()) return (await read(join(path, 'package.json'))).name
  if (!info.isFile() || info.size > 256 * 1024 ** 2) throw new Error('PLUGIN_LOCAL_SOURCE_INVALID')
  const bytes = gunzipSync(await readFile(path), { maxOutputLength: 512 * 1024 ** 2 })
  for (let offset = 0; offset + 512 <= bytes.length;) {
    const header = bytes.subarray(offset, offset + 512)
    const name = header.subarray(0, 100).toString().replace(/\0.*$/su, '')
    const size = Number.parseInt(header.subarray(124, 136).toString().replace(/\0.*$/su, '').trim(), 8)
    if (!Number.isSafeInteger(size) || size < 0) break
    if (['package/package.json', 'package.json'].includes(name)) {
      if (size > 1024 ** 2 || offset + 512 + size > bytes.length) throw new Error('PLUGIN_LOCAL_MANIFEST_INVALID')
      return JSON.parse(bytes.subarray(offset + 512, offset + 512 + size).toString()).name
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
  throw new Error('PLUGIN_LOCAL_MANIFEST_MISSING')
}

/** Resolve in a fresh namespace. pnpm never owns the retained package graph or
 * its historical hoistedLocations, even when the old lockfile claims ownership. */
export async function preparePnpmResolution({ profile, manifest, args }) {
  const directory = join(profile, '.zerowall/install-sources', 'resolution-' + randomUUID())
  await mkdir(directory, { recursive: true })
  const command = args[0], targets = new Set(), original = structuredClone(manifest)
  const operands = []
  for (let index = 1; index < args.length; index++) {
    const arg = args[index]
    if (arg.startsWith('-')) {
      if (['--filter', '--registry', '--store-dir', '--reporter', '--config-dir'].includes(arg)) index++
      continue
    }
    operands.push(arg)
    const local = /^(?:file:|link:|\.{1,2}[\\/]|[A-Za-z]:[\\/]|\/)/u.test(arg) || /\.(?:tgz|tar\.gz)$/u.test(arg)
    if (local) {
      const id = await localIdentity(resolve(profile, arg.replace(/^(?:file|link):/u, '')))
      if (!packageName(id)) throw new Error('PLUGIN_LOCAL_IDENTITY_INVALID')
      targets.add(id)
      continue
    }
    const id = packageName(arg)
    if (id) targets.add(id)
  }
  if (['update', 'up', 'upgrade'].includes(command) && !operands.length) {
    for (const field of fields) for (const id of Object.keys(manifest[field] ?? {})) targets.add(id)
  }
  // Resource candidates authorize the complete verified signed closure, even
  // though only its requested entry is passed to DSH for bundle activation.
  const extraTargets = await read(join(profile, '.zerowall/resolution-targets.json')).catch(error => { if (error.code !== 'ENOENT') throw error; return {} })
  for (const [id, spec] of Object.entries(extraTargets)) {
    if (packageName(id) !== id || manifest.dependencies?.[id] !== spec || !/^file:/u.test(spec)) throw new Error('PLUGIN_RESOLUTION_TARGET_INVALID')
    targets.add(id)
  }
  const resolvedArgs = [...args]
  for (let index = 1; index < resolvedArgs.length; index++) {
    const value = resolvedArgs[index]
    const prefix = /^(file:|link:)/u.exec(value)?.[0]
    if (prefix || /^(?:\.{1,2}[\\/]|[A-Za-z]:[\\/]|\/)/u.test(value) || /\.(?:tgz|tar\.gz)$/u.test(value)) {
      // An imported plugin is an installed snapshot at its fixed root. pnpm's
      // link: leaves its runtime graph outside the transaction; file: resolves
      // the complete graph into this private namespace before publication.
      resolvedArgs[index] = (prefix === 'link:' ? 'file:' : prefix ?? '') + resolve(profile, prefix ? value.slice(prefix.length) : value)
    }
  }
  const retained = new Map(), damaged = new Map()
  for (const field of fields) for (const [id, spec] of Object.entries(manifest[field] ?? {})) {
    if (targets.has(id)) {
      if (/^(?:file|link):/u.test(spec)) manifest[field][id] = spec.slice(0, 5) + resolve(profile, spec.slice(5))
      continue
    }
    const root = join(profile, 'node_modules', id), installed = await read(join(root, 'package.json')).catch(error => {
      if (!['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) throw error
    })
    if (!installed) { damaged.set(id, { field, spec }); delete manifest[field][id]; continue }
    if (installed.name !== id) throw new Error('PLUGIN_RETAINED_IDENTITY_MISMATCH: ' + id)
    retained.set(id, { field, spec, root, version: installed.version, source: await realpath(root) })
    manifest[field][id] = 'link:' + root
  }
  await writeFile(join(directory, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
  const graph = await retainedGraph(retained)
  const provenance = Object.create(null)
  for (const id of retained.keys()) {
    const file = join(profile, '.zerowall/plugin-imports', encodeURIComponent(id) + '.json')
    if (await exists(file)) provenance[id] = await read(file)
  }
  await writeFile(join(directory, 'retained-packages.json'), JSON.stringify({ schema: 1, targets: [...targets], packages: Object.fromEntries(retained), graph, provenance }, null, 2))
  const workspace = await readFile(join(profile, 'pnpm-workspace.yaml'), 'utf8').then(parse, error => { if (error.code !== 'ENOENT') throw error; return {} }) ?? {}
  // No workspace discovery, stale resolver snapshots, or self-link overrides.
  delete workspace.packages
  workspace.overrides ??= {}
  for (const id of [...retained.keys(), ...targets, ...damaged.keys()]) delete workspace.overrides[id]
  // Signed resource closures supply verified archives for transitive edges as
  // well as direct entries. Keep those edges pinned to their authenticated bytes.
  for (const [id, spec] of Object.entries(extraTargets)) workspace.overrides[id] = spec
  for (const [id, item] of retained) workspace.overrides[id] = 'link:' + item.root
  workspace.autoInstallPeers = false
  workspace.linkWorkspacePackages = false
  await writeFile(join(directory, 'pnpm-workspace.yaml'), stringify(workspace))
  if (await exists(join(profile, '.npmrc'))) await cp(join(profile, '.npmrc'), join(directory, '.npmrc'))
  return { directory, profile, original, retained, damaged, graph, targets, args: resolvedArgs, removed: new Set() }
}

export async function mergePnpmResolution(state) {
  const { profile, directory, original, retained, targets, damaged } = state
  if (JSON.stringify(await retainedGraph(retained)) !== JSON.stringify(state.graph)) throw new Error('PLUGIN_RETAINED_CLOSURE_CHANGED: retained files or dependency instances were modified during resolution')
  const after = await read(join(directory, 'package.json'))
  const remaining = new Set(fields.flatMap(field => Object.keys(after[field] ?? {})))
  for (const field of fields) {
    for (const id of Object.keys(original[field] ?? {})) if (!remaining.has(id)) {
      if (damaged.has(id)) continue
      if (!targets.has(id)) throw new Error('PLUGIN_UNRELATED_REMOVAL: ' + id)
      state.removed.add(id)
      const root = join(profile, 'node_modules', id)
      if (await exists(root)) {
        const archive = join(profile, '.zerowall/root-links', 'removed-' + randomUUID())
        await mkdir(dirname(archive), { recursive: true }); await rename(root, archive)
      }
    }
    if (!after[field]) after[field] = {}
    original[field] = { ...after[field] }
    for (const [id] of Object.entries(after[field])) {
      if (damaged.has(id)) throw new Error('PLUGIN_DAMAGED_DEPENDENCY_REQUIRED: ' + id)
      const kept = after[field][id] === 'link:' + retained.get(id)?.root ? retained.get(id) : undefined
      if (kept) {
        const installed = await read(join(kept.root, 'package.json'))
        if (installed.version !== kept.version || await realpath(kept.root) !== kept.source) throw new Error('PLUGIN_UNRELATED_VERSION_CHANGED: ' + id)
        original[field][id] = kept.spec
        continue
      }
      const root = join(profile, 'node_modules', id), incoming = join(directory, 'node_modules', id)
      if ((await read(join(incoming, 'package.json'))).name !== id) throw new Error('PLUGIN_CANDIDATE_IDENTITY_MISMATCH: ' + id)
      const source = await realpath(incoming)
      const sameInstance = await exists(root) && await realpath(root) === source
      if (!sameInstance) {
        if (await exists(root)) {
          const archive = join(profile, '.zerowall/root-links', 'previous-' + randomUUID())
          await mkdir(dirname(archive), { recursive: true }); await rename(root, archive)
        }
        await mkdir(dirname(root), { recursive: true })
      // Keep the resolver's full instance graph. Publication relocates both
      // this link and that graph together; no transitive versions are guessed.
        await symlink(source, root, process.platform === 'win32' ? 'junction' : 'dir')
      }
      const spec = original[field][id]
      if (/^(?:file|link):/u.test(spec) && resolve(directory, spec.slice(5)).startsWith(profile)) {
        original[field][id] = spec.slice(0, 5) + './' + relative(profile, resolve(directory, spec.slice(5))).replaceAll('\\', '/')
      }
    }
    for (const [id, item] of damaged) if (item.field === field) original[field][id] = item.spec
  }
  await writeFile(join(profile, 'package.json'), JSON.stringify(original, null, 2) + '\n')
  // The resolution's lock is scoped to its own namespace. The legacy root
  // lock/metadata is never fed back into pnpm and stays available as evidence.
}
