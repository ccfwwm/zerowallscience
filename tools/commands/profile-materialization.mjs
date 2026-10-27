import { createHash, randomUUID } from 'node:crypto'
import { cp, mkdir, readFile, writeFile, lstat, realpath, readdir, readlink, rename, symlink, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import { physicalFs } from './physical-fs.mjs'
import { carrierIndex, carrierName, offlineContentDigest } from './offline-carrier.mjs'
import { assertCompatible } from './resource-catalog.mjs'
import { RETIRED_PLUGIN_IDS } from './retired-plugins.mjs'
import { verifyCurrentRuntimeDependency } from './historical-plugin.mjs'
import { pluginVerificationIssue, pluginVerificationMode, verifyPluginDocument } from './plugin-verification.mjs'
import { pluginRuntimeEntries as entryPaths } from './plugin-entrypoints.mjs'

export const PROFILE_LAYOUT = 3
export const materializationFile = '.zerowall/materialized-profile.json'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const inside = (root, path) => { const child = relative(root, path); return child === '' || child !== '..' && !child.startsWith('..' + sep) && !isAbsolute(child) }
const packageRoot = path => /^modules\/((?:@[^/]+\/)?[^/]+)\/(.+)$/u.exec(path)
const manifestAt = path => readFile(join(path, 'package.json'), 'utf8').then(JSON.parse).catch(error => { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error })
// Profile files are physical. Large per-stream buffers are costly in Electron
// when verifying thousands of small files; keep each reader bounded instead.
async function fileDigest(path, size) {
  if (size <= 64 * 1024) {
    const bytes = await physicalFs.promises.readFile(path)
    if (bytes.length !== size) throw new Error('Materialized file length changed: ' + path)
    return hash(bytes)
  }
  const digest = createHash('sha256')
  for await (const bytes of physicalFs.createReadStream(path, { highWaterMark: 64 * 1024 })) digest.update(bytes)
  return digest.digest('hex')
}

// Reuse reads only within one completed-layout verification. Source archive
// hashes never enter this cache: every installed file is checked after writes,
// and each subsequent repair, activation or launch starts a fresh verifier.
function profileFileVerifier(profile, target) {
  const directories = new Map(), files = new Map(), digests = new Map()
  let readers = 0
  const waiting = []
  async function withReader(read) {
    if (readers < 4) readers++
    else await new Promise(accept => waiting.push(accept))
    try { return await read() }
    finally { if (waiting.length) waiting.shift()(); else readers-- }
  }
  async function checkDirectory(directory) {
    if (!inside(profile, directory)) throw new Error('Materialized dependency directory escapes profile')
    if (!directories.has(directory)) directories.set(directory, (async () => {
      if (resolve(directory) !== resolve(profile)) await checkDirectory(dirname(directory))
      const info = await lstat(directory)
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Materialized dependency root must be physical: ' + directory)
    })())
    await directories.get(directory)
  }
  return async (path, entry, digest = true, required = true) => {
    const key = JSON.stringify([resolve(path), entry?.size, entry?.sha256, required])
    let checked = files.get(key)
    if (!checked) {
      checked = { metadata: (async () => {
        await checkDirectory(dirname(path))
        const info = await lstat(path).catch(error => {
          if (error.code !== 'ENOENT' || required) throw error
          pluginVerificationIssue(target, 'installedContent', 'Non-entry plugin asset is missing: ' + path)
        })
        if (!info) return false
        if (!info.isFile() || info.isSymbolicLink()) throw new Error('Materialized file type mismatch: ' + path)
        if (!entry) pluginVerificationIssue(target, 'installedContent', 'Plugin entry is absent from its receipt: ' + path)
        else if (info.size !== entry.size) pluginVerificationIssue(target, 'installedContent', 'Materialized file size mismatch: ' + path)
        return true
      })() }
      files.set(key, checked)
    }
    if (!await checked.metadata) return
    if (digest && entry) {
      // Required entries and optional asset sweeps share bytes, while their
      // separate metadata checks still enforce the stricter missing-file rule.
      const digestKey = JSON.stringify([resolve(path), entry.size, entry.sha256])
      if (!digests.has(digestKey)) digests.set(digestKey, withReader(async () => {
        const size = (await lstat(path)).size
        if (await fileDigest(path, size) !== entry.sha256) pluginVerificationIssue(target, 'installedContent', 'Materialized file SHA-256 mismatch: ' + path)
      }))
      await digests.get(digestKey)
    }
  }
}
async function dependencyAt(source, id) {
  let directory = source
  for (;;) {
    const path = join(directory, 'node_modules', id)
    if (await manifestAt(path)) return realpath(path)
    const parent = dirname(directory)
    if (parent === directory) return undefined
    directory = parent
  }
}

/** pnpm may link a newly installed package to its virtual store. Keep that
 * dependency graph but expose each managed plugin through a physical root. */
export async function physicalizeProfilePlugins({ profile, ids }) {
  profile = resolve(profile)
  // Resolve the complete nested graph before replacing any of its root links.
  // In particular, a package-local dependency must be copied, not linked to
  // the very node_modules/<dependency> path that we are about to create.
  const plans = new Map(), roots = []
  for (const id of ids) {
    const root = join(profile, 'node_modules', id), info = await lstat(root).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (!info?.isSymbolicLink()) continue
    const source = await realpath(root)
    if (!inside(profile, source) || /\/(?:resources\/offline|\.zerowall-carriers)\//u.test(source.replaceAll('\\', '/'))) throw new Error('Managed plugin requires authenticated fixed-root migration: ' + id)
    const manifest = await manifestAt(source)
    if (manifest?.name !== id) throw new Error('Fixed-root package identity mismatch: ' + id)
    roots.push({ id, root, source })
    plans.set(source, { source, destination: root, manifest })
  }
  async function plan(instance) {
    if (instance.edges) return
    instance.edges = []
    for (const dependency of Object.keys({ ...instance.manifest.peerDependencies, ...instance.manifest.dependencies, ...instance.manifest.optionalDependencies })) {
      if (!/^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/u.test(dependency) || RETIRED_PLUGIN_IDS.has(dependency)) throw new Error('Invalid fixed-root dependency')
      const resolved = await dependencyAt(instance.source, dependency)
      if (!resolved) continue // Shared runtime or compiler-inlined dependency.
      if (!inside(profile, resolved)) throw new Error('Fixed-root dependency is outside candidate profile: ' + dependency)
      let child = plans.get(resolved)
      if (!child && inside(instance.source, resolved)) {
        child = { source: resolved, destination: join(instance.destination, relative(instance.source, resolved)), manifest: await manifestAt(resolved) }
        plans.set(resolved, child)
      }
      instance.edges.push({ dependency, resolved })
      if (child) await plan(child)
    }
  }
  for (const instance of [...plans.values()]) await plan(instance)
  for (const { id, root, source } of roots) {
    const previous = join(profile, '.zerowall/root-links', encodeURIComponent(id) + '-' + Date.now())
    await mkdir(dirname(previous), { recursive: true }); await rename(root, previous)
    // pnpm may emit a relative root link. Its archived location has another
    // parent, so retain the resolved source rather than the old relative text.
    await unlink(previous)
    await symlink(source, previous, process.platform === 'win32' ? 'junction' : 'dir')
  }
  for (const { source, destination } of plans.values()) {
    await mkdir(dirname(destination), { recursive: true })
    await cp(source, destination, { recursive: true, dereference: false, verbatimSymlinks: true, filter: path => relative(source, path) !== 'node_modules' })
  }
  for (const instance of plans.values()) for (const { dependency, resolved } of instance.edges) {
    const link = join(instance.destination, 'node_modules', dependency)
    const destination = plans.get(resolved)?.destination ?? resolved
    if (resolve(link) === resolve(destination)) {
      if (!(await manifestAt(destination))) throw new Error('Fixed-root nested dependency was not materialized: ' + dependency)
      continue
    }
    await mkdir(dirname(link), { recursive: true })
    await symlink(destination, link, process.platform === 'win32' ? 'junction' : 'dir')
  }
}

/** Give pnpm a separate, stable input instead of a self-referential
 * link:./node_modules/<id>. This runs only for explicit package operations. */
export async function preparePhysicalRootsForPnpm({ profile, ids, manifest }) {
  for (const id of ids) {
    const root = join(profile, 'node_modules', id), spec = manifest.dependencies?.[id]
    if (!/^(file|link):/u.test(spec ?? '') || resolve(profile, spec.slice(5)) !== resolve(root)) continue
    const info = await lstat(root).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (!info?.isDirectory() || info.isSymbolicLink()) continue
    const source = join(profile, '.zerowall/install-sources', encodeURIComponent(id) + '-' + Date.now())
    await mkdir(dirname(source), { recursive: true }); await rename(root, source)
    await symlink(source, root, process.platform === 'win32' ? 'junction' : 'dir')
    manifest.dependencies[id] = 'link:./' + relative(profile, source).replaceAll('\\', '/')
  }
}

/** Retained higher/pinned packages keep the exact dependency instances they
 * already used. A new seed must not silently rebind them to newer siblings. */
export async function preserveMaterializedDependencies({ profile, previous, replacedIds, removedIds = [], moveDependencyRoot = true, preserveIds }) {
  const replaced = new Set([...replacedIds, ...removedIds, ...RETIRED_PLUGIN_IDS])
  const preserve = preserveIds === undefined ? undefined : new Set(preserveIds)
  const sources = []
  for (const source of [previous, ...(previous.preserved ?? [])]) {
    if (!source?.receipt || !Array.isArray(source.ids)) continue
    const ids = []
    for (const id of source.ids) {
      if (replaced.has(id)) continue
      if (preserve && !preserve.has(id)) continue
      const manifest = await manifestAt(join(profile, 'node_modules', id))
      if (manifest?.version === source.receipt.plugins.find(entry => entry.id === id)?.version) ids.push(id)
    }
    if (ids.length) sources.push({ ...source, preserved: undefined, materializedIds: source.materializedIds ?? source.ids, ids })
  }
  const current = sources.find(source => source.digest === previous.digest)
  let retainedDependencies = false
  let movedDependencyRoot
  let movedIds = []
  const oldRoot = previous.dependencyRoot
    ? resolve(profile, previous.dependencyRoot, '..')
    : join(profile, 'node_modules/.zerowall-dependencies')
  if (current && await lstat(oldRoot).catch(error => { if (error.code !== 'ENOENT') throw error })) {
    if (moveDependencyRoot) {
      const nextRoot = join(profile, '.zerowall/dependency-history', randomUUID())
      await mkdir(dirname(nextRoot), { recursive: true }); await rename(oldRoot, nextRoot)
      movedDependencyRoot = nextRoot
      movedIds = [...current.ids]
      current.dependencyRoot = relative(profile, join(nextRoot, 'node_modules')).replaceAll('\\', '/')
      retainedDependencies = true
      async function rebase(path) {
        for (const entry of await readdir(path, { withFileTypes: true })) {
          const child = join(path, entry.name)
          if (entry.isSymbolicLink()) {
            const target = resolve(dirname(child), await readlink(child))
            if (inside(oldRoot, target)) {
              await unlink(child); await symlink(join(nextRoot, relative(oldRoot, target)), child, process.platform === 'win32' ? 'junction' : 'dir')
            }
          } else if (entry.isDirectory()) await rebase(child)
        }
      }
      for (const id of current.ids) await rebase(join(profile, 'node_modules', id))
    } else {
      current.dependencyRoot = relative(profile, join(oldRoot, 'node_modules')).replaceAll('\\', '/')
      retainedDependencies = true
    }
  }
  return { sources, retainedDependencies, async restore() {
    if (!movedDependencyRoot || !await lstat(movedDependencyRoot).catch(error => { if (error.code !== 'ENOENT') throw error })) return
    if (await lstat(oldRoot).catch(error => { if (error.code !== 'ENOENT') throw error })) throw new Error('Cannot restore a retained dependency root over an existing path')
    await mkdir(dirname(oldRoot), { recursive: true })
    await rename(movedDependencyRoot, oldRoot)
    async function rebase(path) {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const child = join(path, entry.name)
        if (entry.isSymbolicLink()) {
          const target = resolve(dirname(child), await readlink(child))
          if (inside(oldRoot, target)) {
            await unlink(child)
            await symlink(join(oldRoot, relative(movedDependencyRoot, target)), child, process.platform === 'win32' ? 'junction' : 'dir')
          } else if (inside(movedDependencyRoot, target)) {
            await unlink(child)
            await symlink(join(oldRoot, relative(movedDependencyRoot, target)), child, process.platform === 'win32' ? 'junction' : 'dir')
          }
        } else if (entry.isDirectory()) await rebase(child)
      }
    }
    for (const id of movedIds) await rebase(join(profile, 'node_modules', id))
  } }
}
async function bounded(entries, task, concurrency = 16) {
  let next = 0
  const results = await Promise.allSettled(Array.from({ length: Math.min(concurrency, entries.length) }, async () => { while (next < entries.length) await task(entries[next++]) }))
  const failure = results.find(result => result.status === 'rejected')
  if (failure) throw failure.reason
}
function authenticate(receipt, digest, keys, target, local) {
  verifyPluginDocument(receipt, keys, target)
  if (![1, 2].includes(receipt.schema) || receipt.kind !== 'offline-profile' || receipt.profileArchitecture !== 7 || !Array.isArray(receipt.files) || !Array.isArray(receipt.plugins)) throw new Error('Invalid materialized profile receipt')
  if (receipt.localOnly && !local) throw new Error('Development offline profile cannot enter a stable installation')
  if (receipt.dshCommit !== target.dshCommit) throw new Error('Materialized profile DSH identity mismatch')
  assertCompatible(receipt, target)
  if (receipt.schema === 2 && (digest !== receipt.contentDigest || digest !== offlineContentDigest(receipt))) throw new Error('Materialized profile content identity mismatch')
  const seen = new Set()
  for (const entry of receipt.files) {
    if (!packageRoot(entry.path) || entry.path.includes('\\') || entry.path.split('/').some(part => !part || part === '.' || part === '..') || isAbsolute(entry.path) || seen.has(entry.path) || !Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/u.test(entry.sha256)) throw new Error('Invalid signed materialization file')
    seen.add(entry.path)
  }
}
function plannedPath(profile, entry, ids, dependencyRoot = join(profile, 'node_modules/.zerowall-dependencies/node_modules')) {
  const [, id, local] = packageRoot(entry.path)
  const base = ids.has(id) ? join(profile, 'node_modules', id) : join(dependencyRoot, id)
  const path = join(base, local)
  if (!inside(base, path)) throw new Error('Materialized file escapes its package')
  return path
}

// Follow the signed package graph rather than the mutable directory tree.
// Ordinary startup checks manifests and runtime entries, not every asset in
// the archive, while still detecting missing nested/transitive packages.
function packageGraphVerifier({ profile, receipt, ids, dependencyRoot, full, verifyFile }) {
  const signed = new Map(receipt.files.map(entry => [entry.path, entry]))
  const core = new Set(receipt.plugins.filter(entry => entry.core).map(entry => entry.id))
  const visited = new Set()
  const physical = logical => {
    const [, id, local] = packageRoot(logical)
    return join(ids.has(id) ? join(profile, 'node_modules', id) : join(dependencyRoot, id), local)
  }
  async function checkFile(logical, manifest = false) {
    const entry = signed.get(logical)
    if (!entry) throw new Error('Materialized dependency entry is unsigned: ' + logical)
    await verifyFile(physical(logical), entry, full || manifest)
  }
  function dependency(root, id) {
    let directory = root
    for (;;) {
      const local = directory + '/node_modules/' + id
      if (signed.has(local + '/package.json')) return local
      if (directory === 'modules') break
      directory = posix.dirname(directory)
      if (!directory.startsWith('modules')) break
    }
    return signed.has('modules/' + id + '/package.json') ? 'modules/' + id : undefined
  }
  async function visit(root, expectedName) {
    let level = [{ root, expectedName }]
    while (level.length) {
      const next = []
      await bounded(level, async ({ root, expectedName }) => {
        if (visited.has(root)) return
        visited.add(root)
        const manifestPath = root + '/package.json'
        await checkFile(manifestPath, true)
        const manifest = JSON.parse(await readFile(physical(manifestPath), 'utf8'))
        if (manifest.name !== expectedName) throw new Error('Materialized dependency identity mismatch: ' + root)
        for (const entry of entryPaths(manifest)) {
          const logical = posix.normalize(root + '/' + entry)
          if (logical !== root && !logical.startsWith(root + '/')) throw new Error('Materialized dependency entry escapes package')
          // Legacy CommonJS main fields may omit an extension or name a folder.
          const file = [logical, logical + '.js', logical + '.json', logical + '.node', logical + '/index.js', logical + '/index.json', logical + '/index.node'].find(path => signed.has(path))
          // Some upstream manifests advertise unsupported entry conditions which
          // were absent even from the signed package. Only signed runtime files
          // participate; a deleted file cannot remove itself from this index.
          if (file) await checkFile(file)
        }
        for (const id of Object.keys({ ...manifest.peerDependencies, ...manifest.dependencies, ...manifest.optionalDependencies })) {
          if (id.startsWith('@deepseek-ai/') || core.has(id)) continue
          const logical = dependency(root, id)
          // Bundled/inlined dependencies have no independent signed package.
          if (logical) next.push({ root: logical, expectedName: id })
        }
      })
      level = next
    }
  }
  return visit
}

/** The signed archive supplies bytes only. Active plugin entrypoints are real
 * directories; non-core dependencies share a fixed, profile-owned namespace. */
export async function materializeOfflinePackages({ profile, source, receipt, digest, ids, keys, target, runtimeModules, preserved = [], dependencyRootPath, local = false }) {
  authenticate(receipt, digest, keys, target, local)
  const selected = new Set(ids)
  const core = new Set(receipt.plugins.filter(entry => entry.core).map(entry => entry.id))
  for (const id of selected) if (core.has(id) || RETIRED_PLUGIN_IDS.has(id) || !receipt.plugins.some(entry => entry.id === id)) throw new Error('Cannot materialize a core, retired or unsigned plugin: ' + id)
  const dependencyRoot = dependencyRootPath
    ? resolve(profile, dependencyRootPath)
    : join(profile, 'node_modules/.zerowall-dependencies/node_modules')
  if (!inside(resolve(profile), dependencyRoot)) throw new Error('Materialized dependency root escapes profile')
  const files = receipt.files.filter(entry => { const id = packageRoot(entry.path)[1]; return !core.has(id) && !RETIRED_PLUGIN_IDS.has(id) && !id.startsWith('@deepseek-ai/') })
  let archive, index
  if (receipt.schema === 2) {
    index = await carrierIndex(source)
    const rows = new Map(index.rows.map(row => ['modules/' + row.path.replace(/^node_modules\//u, ''), row]))
    for (const entry of files) {
      const row = rows.get(entry.path)
      if (!row || row.size !== entry.size || row.sha256 !== entry.sha256) throw new Error('Signed archive logical file mismatch')
    }
    index.rowsByPath = rows
    archive = await physicalFs.promises.open(join(source, carrierName), 'r')
  }
  const directories = new Map()
  async function ensureDirectory(path) {
    if (!inside(resolve(profile), resolve(path))) throw new Error('Materialization directory escapes profile')
    if (!directories.has(path)) directories.set(path, (async () => {
      if (resolve(path) !== resolve(profile)) await ensureDirectory(dirname(path))
      const info = await lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
      if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error('Materialization directory must be physical')
      if (!info) await mkdir(path)
    })())
    return directories.get(path)
  }
  try {
    await bounded(files, async entry => {
      let bytes
      if (receipt.schema === 1) bytes = await readFile(join(source, entry.path))
      else {
        const row = index.rowsByPath.get(entry.path)
        if (row.unpacked) bytes = await readFile(join(source, carrierName + '.unpacked', row.path))
        else {
          if (!Number.isSafeInteger(row.offset) || row.offset < 0) throw new Error('Invalid archive offset')
          bytes = Buffer.alloc(row.size)
          if ((await archive.read(bytes, 0, row.size, index.dataOffset + row.offset)).bytesRead !== row.size) throw new Error('Truncated offline archive entry')
        }
      }
      if (bytes.length !== entry.size || hash(bytes) !== entry.sha256) throw new Error('Materialized profile signed size or SHA-256 mismatch')
      const destination = plannedPath(profile, entry, selected, dependencyRoot), parent = dirname(destination)
      await ensureDirectory(parent)
      await writeFile(destination, bytes, { flag: 'wx' })
    })
  } finally { await archive?.close() }
  // Only the top package moved out of the flat signed closure. Its original
  // nested dependencies remain intact; missing root dependencies get standard
  // package-local links into this profile, never into an ASAR/offline source.
  for (const id of selected) {
    const root = join(profile, 'node_modules', id), manifest = await manifestAt(root)
    const record = receipt.plugins.find(entry => entry.id === id)
    if (!manifest || manifest.name !== id || manifest.version !== record.version) throw new Error('Materialized plugin identity mismatch: ' + id)
    for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies })) {
      if (!/^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/u.test(dependency) || RETIRED_PLUGIN_IDS.has(dependency)) throw new Error('Invalid or retired materialized dependency')
      if (await manifestAt(join(root, 'node_modules', dependency))) continue
      const destination = selected.has(dependency) ? join(profile, 'node_modules', dependency) : join(dependencyRoot, dependency)
      if (await manifestAt(destination)) {
        await mkdir(dirname(join(root, 'node_modules', dependency)), { recursive: true })
        await symlink(destination, join(root, 'node_modules', dependency), process.platform === 'win32' ? 'junction' : 'dir')
      } else if (dependency.startsWith('@deepseek-ai/')) {
        await verifyCurrentRuntimeDependency({ id: dependency, range: ({ ...manifest.peerDependencies, ...manifest.dependencies, ...manifest.optionalDependencies })[dependency], runtimeModules, target,
          optional: Boolean(manifest.optionalDependencies?.[dependency] || manifest.peerDependenciesMeta?.[dependency]?.optional) })
      }
    }
  }
  const marker = { schema: 1, layout: PROFILE_LAYOUT, digest, receipt, ids: [...selected].sort(), preserved,
    dependencyRoot: relative(profile, dependencyRoot).replaceAll('\\', '/') }
  await mkdir(dependencyRoot, { recursive: true })
  await writeFile(join(dirname(dependencyRoot), 'package.json'), '{"name":"zerowall-profile-dependencies","private":true}')
  await mkdir(join(profile, '.zerowall'), { recursive: true })
  await writeFile(join(profile, materializationFile), JSON.stringify(marker))
  return marker
}

/** Normal launch checks signed metadata and required entrypoints. It never
 * opens the offline supply directory, downloads, or resolves a package tree. */
export async function verifyMaterializedProfile({ profile, keys, target, expected = [], digest, local = false, full = false }) {
  try {
    const verifyFile = profileFileVerifier(profile, target)
    const marker = JSON.parse(await readFile(join(profile, materializationFile), 'utf8'))
    if (marker.schema !== 1 || marker.layout !== PROFILE_LAYOUT || !Array.isArray(marker.ids) || digest && marker.digest !== digest) return undefined
    authenticate(marker.receipt, marker.digest, keys, target, local)
    const dependencyRoot = marker.dependencyRoot
      ? resolve(profile, marker.dependencyRoot)
      : join(profile, 'node_modules/.zerowall-dependencies/node_modules')
    if (!inside(profile, dependencyRoot)) return undefined
    const dependencies = await lstat(dependencyRoot)
    if (!dependencies.isDirectory() || dependencies.isSymbolicLink()) return undefined
    await readFile(join(dirname(dependencyRoot), 'package.json'))
    const signed = new Map(marker.receipt.files.map(entry => [entry.path, entry]))
    const selected = new Set(marker.ids)
    const preservedIds = new Set()
    for (const source of marker.preserved ?? []) {
      // The original signed source, not a mutable id list alone, authorizes
      // retaining an exact pin. Its complete graph is checked below against
      // that source's actual retained dependency namespace.
      authenticate(source.receipt, source.digest, keys, target, local)
      if (!Array.isArray(source.ids)) return undefined
      for (const id of source.ids) {
        if (selected.has(id) || preservedIds.has(id) || !source.receipt.plugins.some(row => row.id === id && !row.core) || RETIRED_PLUGIN_IDS.has(id)) return undefined
        preservedIds.add(id)
      }
    }
    const verifyGraph = packageGraphVerifier({ profile, receipt: marker.receipt, ids: selected, dependencyRoot, full, verifyFile })
    for (const id of expected) {
      const record = marker.receipt.plugins.find(entry => entry.id === id)
      if (record?.core) continue
      const root = join(profile, 'node_modules', id), info = await lstat(root)
      if (!info.isDirectory() || info.isSymbolicLink() || await realpath(root) !== resolve(root)) return undefined
      const manifest = await manifestAt(root)
      if (!manifest || manifest.name !== id) return undefined
      // Even an equal-version pin may retain its original dependency graph.
      // Do not bind it to the freshly materialized sibling namespace first.
      if (preservedIds.has(id)) continue
      // A newer independent or pinned generation keeps its own provenance.
      if (manifest.version !== record?.version) continue
      await verifyGraph('modules/' + id, id)
      for (const localPath of entryPaths(manifest)) {
        const entry = signed.get('modules/' + id + '/' + localPath)
        if (!entry && pluginVerificationMode(target, 'installedContent') !== 'warn') return undefined
        await verifyFile(join(root, localPath), entry)
      }
      for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies })) {
        const source = signed.get('modules/' + dependency + '/package.json')
        if (!source || dependency.startsWith('@deepseek-ai/')) continue
        const local = join(root, 'node_modules', dependency)
        const nested = signed.has('modules/' + id + '/node_modules/' + dependency + '/package.json')
        if (!nested) {
          const destination = selected.has(dependency) ? join(profile, 'node_modules', dependency) : join(dependencyRoot, dependency)
          if (!(await lstat(local)).isSymbolicLink() || resolve(dirname(local), await readlink(local)) !== resolve(destination)) return undefined
          await verifyFile(join(destination, 'package.json'), source)
        }
      }
    }
    for (const source of marker.preserved ?? []) {
      const previousIds = new Set(source.materializedIds ?? source.ids)
      const oldDependencies = source.dependencyRoot ? resolve(profile, source.dependencyRoot) : dependencyRoot
      if (!inside(profile, oldDependencies) || !(await lstat(oldDependencies)).isDirectory() || (await lstat(oldDependencies)).isSymbolicLink()) return undefined
      const oldSigned = new Map(source.receipt.files.map(file => [file.path, file]))
      const verifyPreviousGraph = packageGraphVerifier({ profile, receipt: source.receipt, ids: previousIds, dependencyRoot: oldDependencies, full, verifyFile })
      for (const id of source.ids) {
        const root = join(profile, 'node_modules', id), info = await lstat(root), manifest = await manifestAt(root)
        if (!info.isDirectory() || info.isSymbolicLink() || manifest?.version !== source.receipt.plugins.find(entry => entry.id === id)?.version) return undefined
        await verifyPreviousGraph('modules/' + id, id)
        for (const local of entryPaths(manifest)) {
          const entry = source.receipt.files.find(file => file.path === 'modules/' + id + '/' + local)
          if (!entry && pluginVerificationMode(target, 'installedContent') !== 'warn') return undefined
          await verifyFile(join(root, local), entry)
        }
        for (const dependency of Object.keys({ ...manifest.peerDependencies, ...manifest.dependencies, ...manifest.optionalDependencies })) {
          const entry = oldSigned.get('modules/' + dependency + '/package.json')
          if (!entry || dependency.startsWith('@deepseek-ai/') || oldSigned.has('modules/' + id + '/node_modules/' + dependency + '/package.json')) continue
          const expectedPath = previousIds.has(dependency) ? join(profile, 'node_modules', dependency) : join(oldDependencies, dependency)
          const path = join(root, 'node_modules', dependency)
          if (!(await lstat(path)).isSymbolicLink() || resolve(dirname(path), await readlink(path)) !== resolve(expectedPath)) return undefined
          await verifyFile(join(expectedPath, 'package.json'), entry)
        }
      }
      if (full) {
        const coreIds = new Set(source.receipt.plugins.filter(record => record.core).map(record => record.id))
        const retainedIds = new Set(source.ids)
        await bounded(source.receipt.files, async entry => {
          const [, id, localPath] = packageRoot(entry.path)
          if (RETIRED_PLUGIN_IDS.has(id) || id.startsWith('@deepseek-ai/') || coreIds.has(id)) return
          if (previousIds.has(id) && !retainedIds.has(id)) return
          const path = previousIds.has(id) ? join(profile, 'node_modules', id, localPath) : join(oldDependencies, id, localPath)
          await verifyFile(path, entry, true, false)
        }, 4)
      }
    }
    if (full) {
      const coreIds = new Set(marker.receipt.plugins.filter(record => record.core).map(record => record.id))
      const signedVersions = new Map(marker.receipt.plugins.map(record => [record.id, record.version]))
      const selectedVersions = new Map()
      for (const id of signedVersions.keys()) if (selected.has(id)) selectedVersions.set(id, (await manifestAt(join(profile, 'node_modules', id)))?.version)
      await bounded(marker.receipt.files, async entry => {
        const id = packageRoot(entry.path)[1]
        if (RETIRED_PLUGIN_IDS.has(id) || id.startsWith('@deepseek-ai/') || coreIds.has(id)) return
        if (selected.has(id) && selectedVersions.get(id) !== signedVersions.get(id)) return
        await verifyFile(plannedPath(profile, entry, selected, dependencyRoot), entry, true, false)
      }, 4)
    }
    return marker
  } catch (error) { console.warn('[PLUGIN_PROFILE_INVALID] ' + error.message); return undefined }
}
