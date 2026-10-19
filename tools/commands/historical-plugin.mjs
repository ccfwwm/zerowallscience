import { createHash, randomUUID } from 'node:crypto'
import { readFile, mkdir, rename, symlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import { assertCompatible } from './resource-catalog.mjs'
import { verifyPluginDocument } from './plugin-verification.mjs'
import { carrierIndex, carrierName, offlineContentDigest } from './offline-carrier.mjs'
import { satisfiesPackageRange } from './package-range.mjs'
import { physicalFs } from './physical-fs.mjs'
import { RETIRED_PLUGIN_IDS } from './retired-plugins.mjs'

const { lstat, open, readdir, readlink } = physicalFs.promises
const digestBytes = bytes => createHash('sha256').update(bytes).digest('hex')
const packageId = id => {
  if (typeof id !== 'string' || !/^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/u.test(id) || id.split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid historical plugin identity')
  return id
}
const localPath = path => {
  if (typeof path !== 'string' || !path || path.includes('\\') || isAbsolute(path) || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid historical plugin path')
  return path
}
const inside = (root, path) => { const child = relative(root, path); return child === '' || child !== '..' && !child.startsWith('..' + sep) && !isAbsolute(child) }
const statePath = (profile, id) => join(profile, '.zerowall/plugin-imports', encodeURIComponent(packageId(id)) + '.json')
const blocked = (id, reason) => Object.assign(new Error('HISTORICAL_PLUGIN_IMPORT_BLOCKED: ' + id + ': ' + reason), { code: 'HISTORICAL_PLUGIN_IMPORT_BLOCKED', pluginId: id, reason })

/** Authenticate historical provenance as an independent package source. This
 * does not admit the old carrier, its core, or its DSH commit for activation. */
function authenticate(text, keys, target, digest, local) {
  const receipt = verifyPluginDocument(JSON.parse(text), keys, target)
  if (![1, 2].includes(receipt.schema) || receipt.kind !== 'offline-profile' || receipt.profileArchitecture !== 7 || !Array.isArray(receipt.files) || !Array.isArray(receipt.plugins) || !Array.isArray(receipt.defaultPatch)) throw new Error('Invalid historical plugin receipt')
  if (receipt.localOnly && !local) throw new Error('Development historical plugin cannot enter a stable installation')
  // Always use the actual current versions and the original signed ranges.
  assertCompatible(receipt, target)
  const paths = new Set()
  for (const entry of [...receipt.files, ...(receipt.payloadFiles ?? [])]) {
    localPath(entry.path)
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256) || !Number.isSafeInteger(entry.size) || entry.size < 0 || paths.has(entry.path)) throw new Error('Invalid historical signed file')
    paths.add(entry.path)
  }
  const names = new Set()
  for (const entry of receipt.plugins) {
    packageId(entry.id)
    if (names.has(entry.id) || typeof entry.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/u.test(entry.version)) throw new Error('Invalid historical signed package')
    names.add(entry.id)
  }
  const actual = receipt.schema === 2 ? offlineContentDigest(receipt) : digestBytes(text)
  if (!/^[a-f0-9]{64}$/u.test(digest ?? '') || actual !== digest || receipt.schema === 2 && (!Array.isArray(receipt.payloadFiles) || receipt.contentDigest !== actual || !receipt.payloadFiles.some(entry => entry.path === carrierName))) throw new Error('Historical plugin receipt identity mismatch')
  return receipt
}

async function physicalPath(root, path) {
  if (!inside(root, path)) throw new Error('Historical plugin path escaped its root')
  let current = path
  for (;;) {
    const info = await lstat(current)
    if (info.isSymbolicLink()) throw new Error('Historical plugin contains an unexpected link')
    if (current === root) return info
    current = dirname(current)
  }
}

async function sourceReader(source, receipt) {
  if (!(await lstat(source)).isDirectory() || (await lstat(source)).isSymbolicLink()) throw new Error('Historical plugin source must be a physical directory')
  const expected = new Map(receipt.files.map(row => [row.path, row]))
  if (receipt.schema === 1) return {
    async read(path) {
      const file = join(source, path.replace(/^modules\//u, 'node_modules/'))
      await physicalPath(source, file)
      if ((await lstat(file)).size !== expected.get(path)?.size) throw new Error('Historical plugin signed size or SHA-256 mismatch: ' + path)
      return physicalFs.promises.readFile(file)
    },
    async close() {},
  }
  const index = await carrierIndex(source), rows = new Map(index.rows.map(row => [row.path, row]))
  const archive = join(source, carrierName)
  await physicalPath(source, archive)
  const handle = await open(archive, 'r')
  return {
    async read(path) {
      const logical = path.replace(/^modules\//u, 'node_modules/'), row = rows.get(logical)
      if (!row) throw new Error('Historical plugin archive entry is missing: ' + path)
      if (row.size !== expected.get(path)?.size || row.sha256 !== expected.get(path)?.sha256) throw new Error('Historical plugin archive index differs from signed receipt')
      if (row.unpacked) {
        const file = join(source, carrierName + '.unpacked', logical)
        await physicalPath(source, file)
        if ((await lstat(file)).size !== row.size) throw new Error('Historical plugin signed size or SHA-256 mismatch: ' + path)
        return physicalFs.promises.readFile(file)
      }
      if (!Number.isSafeInteger(row.offset) || row.offset < 0) throw new Error('Invalid historical archive offset')
      const bytes = Buffer.alloc(row.size)
      if ((await handle.read(bytes, 0, row.size, index.dataOffset + row.offset)).bytesRead !== row.size) throw new Error('Truncated historical plugin archive entry')
      return bytes
    },
    async close() { await handle.close() },
  }
}

function entryFiles(manifest) {
  const exports = []
  function visit(value) {
    if (typeof value === 'string') exports.push(value)
    else if (value && typeof value === 'object') for (const [condition, child] of Object.entries(value)) if (condition !== 'types') visit(child)
  }
  visit(manifest.exports)
  return [...new Set(['package.json', manifest.main, manifest.dsh?.bundle?.patch, ...(manifest.zerowall?.runtimeFiles ?? []), ...exports]
    .filter(path => typeof path === 'string' && !path.includes('*') && !path.endsWith('.ts')).map(path => localPath(path.replace(/^\.\//u, ''))))]
}

// Management verification can run in ordinary Node, where Electron's virtual
// ASAR filesystem is unavailable. Read the current runtime without unpacking
// it, using the same immutable archive bytes Electron will load.
const runtimeArchiveHeaders = new Map()
async function runtimeArchiveHeader(path, handle) {
  const info = await handle.stat({ bigint: true })
  if (!info.isFile()) throw new Error('Invalid shared runtime archive')
  const fingerprint = [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs, info.birthtimeNs].join(':')
  const previous = runtimeArchiveHeaders.get(path)
  if (previous?.fingerprint === fingerprint) return previous.header
  const header = (async () => {
    const prefix = Buffer.alloc(16)
    if ((await handle.read(prefix, 0, 16, 0)).bytesRead !== 16) throw new Error('Invalid shared runtime archive')
    const headerSize = prefix.readUInt32LE(4), jsonSize = prefix.readUInt32LE(12)
    if (prefix.readUInt32LE(0) !== 4 || headerSize < 8 || headerSize > 64 * 1024 ** 2 || jsonSize > headerSize - 8 || BigInt(8 + headerSize) > info.size) throw new Error('Invalid shared runtime archive header')
    const bytes = Buffer.alloc(jsonSize)
    if ((await handle.read(bytes, 0, jsonSize, 16)).bytesRead !== jsonSize) throw new Error('Truncated shared runtime archive header')
    const row = JSON.parse(bytes.toString('utf8'))
    if (!row?.files || typeof row.files !== 'object' || Array.isArray(row.files)) throw new Error('Invalid shared runtime archive file tree')
    return { row, dataOffset: 8 + headerSize }
  })()
  const cached = { fingerprint, header }
  runtimeArchiveHeaders.delete(path)
  runtimeArchiveHeaders.set(path, cached)
  if (runtimeArchiveHeaders.size > 4) runtimeArchiveHeaders.delete(runtimeArchiveHeaders.keys().next().value)
  try { return await header }
  catch (error) { if (runtimeArchiveHeaders.get(path) === cached) runtimeArchiveHeaders.delete(path); throw error }
}
async function runtimeFile(path) {
  try { return await readFile(path) }
  catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error
    const match = /^(.*?\.asar)[\\/](.*)$/u.exec(path)
    if (!match) throw error
    const handle = await open(match[1], 'r')
    try {
      const archive = await runtimeArchiveHeader(match[1], handle)
      let row = archive.row
      for (const segment of match[2].split(/[\\/]/u)) {
        row = row?.files?.[segment]
        if (!row) throw error
        if (row.link) throw new Error('Shared runtime archive entry must not be a link')
      }
      if (row.unpacked) return readFile(join(match[1] + '.unpacked', match[2]))
      const offset = Number(row.offset)
      if (!Number.isSafeInteger(row.size) || row.size < 0 || !Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid shared runtime archive entry')
      const bytes = Buffer.alloc(row.size)
      if ((await handle.read(bytes, 0, row.size, archive.dataOffset + offset)).bytesRead !== row.size) throw new Error('Truncated shared runtime archive entry')
      return bytes
    } finally { await handle.close() }
  }
}

/** Check a declared dependency against the current desktop-owned runtime,
 * including ordinary Node callers reading the packaged app.asar. */
export async function verifyCurrentRuntimeDependency({ id, range, runtimeModules, target, optional = false }) {
  packageId(id)
  if (typeof range !== 'string' || !range) throw blocked(id, 'Current shared runtime dependency requirement is invalid')
  if (!runtimeModules) throw blocked(id, 'Current shared runtime is unavailable')
  const root = join(runtimeModules, id)
  let bytes
  try { bytes = await runtimeFile(join(root, 'package.json')) }
  catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error
    if (optional) return undefined
    throw blocked(id, 'Current shared runtime dependency is missing')
  }
  const manifest = JSON.parse(bytes.toString('utf8'))
  // DSH packages share the pinned prerelease. Vendor packages in this scope
  // (Cordis, Schemastery, Cosmokit) retain their independent version contracts.
  const dshPackage = id === '@deepseek-ai/dsh' || id.startsWith('@deepseek-ai/dsh-')
  const requested = range.startsWith('workspace:') ? range.slice('workspace:'.length) : range
  const satisfies = range === 'workspace:*' || satisfiesPackageRange(manifest.version, requested === '^' || requested === '~' ? requested + manifest.version : requested, dshPackage ? { includePrerelease: true } : undefined)
  if (manifest.name !== id || !satisfiesPackageRange(manifest.version, '*', { includePrerelease: true }) || !satisfies
    || dshPackage && manifest.version !== target.dshVersion) throw blocked(id, 'Current shared runtime dependency version is incompatible')
  for (const path of entryFiles(manifest)) await runtimeFile(join(root, path)).catch(() => { throw blocked(id, 'Current shared runtime entry is missing: ' + path) })
  return { id, range, version: manifest.version }
}

/** Build the same deterministic closure from signed package manifests when
 * importing and verifying. Unsigned provenance cannot add paths or packages. */
async function planImport({ receipt, id, logicalRoot, runtimeModules, target, read }) {
  const record = receipt.plugins.find(row => row.id === id)
  if (!record || record.core || id.startsWith('@deepseek-ai/') || RETIRED_PLUGIN_IDS.has(id)) throw blocked(id, 'Only a signed non-core active plugin can be imported')
  localPath(logicalRoot)
  const signed = new Map(receipt.files.map(entry => [entry.path, entry]))
  const instances = new Map(), files = [], links = [], runtime = [], optionalMissing = []
  const coreIds = new Set(receipt.plugins.filter(row => row.core).map(row => row.id))
  const isCore = name => name.startsWith('@deepseek-ai/') || coreIds.has(name)
  async function signedBytes(path, destination) {
    const entry = signed.get(path)
    if (!entry) throw blocked(id, 'Required signed file is missing: ' + path)
    const bytes = await read(path, destination, entry)
    if (bytes.length !== entry.size || digestBytes(bytes) !== entry.sha256) throw new Error('Historical plugin signed size or SHA-256 mismatch: ' + path)
    return bytes
  }
  function resolveDependency(root, dependency) {
    let directory = root
    for (;;) {
      const nested = directory + '/node_modules/' + dependency
      if (signed.has(nested + '/package.json')) return nested
      if (directory === 'modules') break
      directory = posix.dirname(directory)
      if (directory === '.' || !directory.startsWith('modules')) break
    }
    const flat = 'modules/' + dependency
    return signed.has(flat + '/package.json') ? flat : undefined
  }
  async function visit(root, expectedName, expectedRange, isRoot = false) {
    if (instances.has(root)) {
      const instance = instances.get(root), range = expectedRange?.startsWith('workspace:') ? expectedRange.slice('workspace:'.length) : expectedRange
      if (instance.id !== expectedName || range && expectedRange !== 'workspace:*' && !satisfiesPackageRange(instance.version, range)) throw blocked(id, 'Historical shared dependency version is incompatible: ' + expectedName)
      return instance
    }
    const destination = isRoot ? '' : '.zerowall-dependencies/' + instances.size
    const instance = { logicalRoot: root, destination, id: expectedName }
    instances.set(root, instance)
    const manifest = JSON.parse((await signedBytes(root + '/package.json', posix.join(destination, 'package.json'))).toString('utf8'))
    if (manifest.name !== expectedName || isCore(manifest.name) || RETIRED_PLUGIN_IDS.has(manifest.name)) throw blocked(id, 'Historical dependency identity or retirement conflict: ' + expectedName)
    const range = expectedRange?.startsWith('workspace:') ? expectedRange.slice('workspace:'.length) : expectedRange
    if (range && expectedRange !== 'workspace:*' && !satisfiesPackageRange(manifest.version, range) || isRoot && manifest.version !== record.version) throw blocked(id, 'Historical dependency version is incompatible: ' + expectedName)
    instance.version = manifest.version
    instance.entries = entryFiles(manifest)
    for (const entry of receipt.files) {
      if (!entry.path.startsWith(root + '/')) continue
      const child = entry.path.slice(root.length + 1)
      if (child.startsWith('node_modules/')) continue
      if (child === '.zerowall-dependencies' || child.startsWith('.zerowall-dependencies/')) throw blocked(id, 'Historical plugin uses a reserved import directory')
      files.push({ ...entry, destination: posix.join(destination, child) })
    }
    for (const path of instance.entries) if (!signed.has(root + '/' + path)) throw blocked(id, 'Historical package entry is not signed: ' + expectedName + '/' + path)
    const dependencies = { ...manifest.peerDependencies, ...manifest.dependencies, ...manifest.optionalDependencies }
    for (const dependency of Object.keys(dependencies).sort()) {
      packageId(dependency)
      const requested = dependencies[dependency]
      if (typeof requested !== 'string' || RETIRED_PLUGIN_IDS.has(dependency)) throw blocked(id, 'Historical dependency has an invalid or retired requirement: ' + dependency)
      if (isCore(dependency)) {
        const shared = await verifyCurrentRuntimeDependency({ id: dependency, range: requested, runtimeModules, target,
          optional: Boolean(manifest.optionalDependencies?.[dependency] || manifest.peerDependenciesMeta?.[dependency]?.optional) })
        if (shared) runtime.push({ from: destination, ...shared })
        else optionalMissing.push({ from: destination, id: dependency, range: requested })
        continue
      }
      const resolved = resolveDependency(root, dependency)
      if (!resolved) {
        if (manifest.optionalDependencies?.[dependency] || manifest.peerDependenciesMeta?.[dependency]?.optional) { optionalMissing.push({ from: destination, id: dependency, range: requested }); continue }
        throw blocked(id, 'Required signed dependency is missing: ' + dependency)
      }
      const child = await visit(resolved, dependency, requested)
      links.push({ path: posix.join(destination, 'node_modules', dependency), target: child.destination })
    }
    return instance
  }
  await visit(logicalRoot, id, undefined, true)
  return { instances: [...instances.values()], files, links, runtime, optionalMissing, signedBytes }
}

/** Import only authenticated plugin bytes and its non-core dependency graph.
 * The root stays at profile/node_modules/<id>; old shared DSH is never copied. */
export async function importHistoricalPlugin({ profile, source, digest, id, keys, target, runtimeModules, local = false, logicalRoot = 'modules/' + id }) {
  profile = resolve(profile); source = resolve(source); packageId(id)
  await physicalPath(source, join(source, 'receipt.json'))
  const text = await readFile(join(source, 'receipt.json'), 'utf8'), receipt = authenticate(text, keys, target, digest, local)
  const reader = await sourceReader(source, receipt)
  let plan
  try { plan = await planImport({ receipt, id, logicalRoot, runtimeModules, target, read: path => reader.read(path) }) }
  catch (error) { await reader.close(); throw error }
  try { return await materializeImportPlan({ profile, id, digest, logicalRoot, receipt, text, plan }) }
  finally { await reader.close() }
}

async function materializeImportPlan({ profile, id, digest, logicalRoot, receipt, text, plan }) {
  const root = join(profile, 'node_modules', id), evidence = statePath(profile, id)
  const displaced = join(profile, '.zerowall/import-history', randomUUID()), existing = await lstat(root).catch(error => { if (error.code !== 'ENOENT') throw error })
  let displacedRoot = false, createdRoot = false
  try {
    await mkdir(dirname(root), { recursive: true }); await physicalPath(profile, dirname(root))
    await mkdir(dirname(evidence), { recursive: true }); await physicalPath(profile, dirname(evidence))
    if (existing) { await mkdir(dirname(displaced), { recursive: true }); await physicalPath(profile, dirname(displaced)); await rename(root, displaced); displacedRoot = true }
    await mkdir(root, { recursive: true }); createdRoot = true
    for (const file of plan.files) {
      const path = join(root, file.destination), bytes = await plan.signedBytes(file.path, file.destination)
      await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes)
    }
    for (const link of plan.links) {
      const path = join(root, link.path), destination = join(root, link.target)
      await mkdir(dirname(path), { recursive: true })
      await symlink(process.platform === 'win32' ? destination : relative(dirname(path), destination), path, process.platform === 'win32' ? 'junction' : 'dir')
    }
    const provenance = { schema: 1, kind: 'historical-plugin-import', id, version: plan.instances[0].version, digest, logicalRoot, sourceDshCommit: receipt.dshCommit, receiptText: text,
      instances: plan.instances, files: plan.files, links: plan.links, runtime: plan.runtime, optionalMissing: plan.optionalMissing }
    const pending = evidence + '.' + randomUUID() + '.tmp'
    await writeFile(pending, JSON.stringify(provenance, null, 2)); await rename(pending, evidence)
    return { path: root, version: provenance.version, provenance: evidence, sourceDshCommit: receipt.dshCommit }
  } catch (error) {
    if (createdRoot) {
      const failed = join(profile, '.zerowall/import-history', randomUUID())
      await mkdir(dirname(failed), { recursive: true }); await rename(root, failed)
    }
    if (displacedRoot) await rename(displaced, root)
    throw error
  }
}

/** Reconstruct provenance from the original signed receipt, then validate the
 * actual physical package. An old receipt never becomes an active carrier. */
export async function verifyHistoricalPluginImports({ profile, keys, target, runtimeModules, local = false, full = true, ids }) {
  profile = resolve(profile)
  const state = join(profile, '.zerowall/plugin-imports')
  const entries = await readdir(state, { withFileTypes: true }).catch(error => { if (error.code !== 'ENOENT') throw error; return [] })
  const verified = []
  for (const entry of entries) {
    if (ids && !ids.some(id => entry.name === encodeURIComponent(packageId(id)) + '.json')) continue
    if (!entry.isFile() || !entry.name.endsWith('.json')) throw new Error('Invalid historical plugin provenance entry')
    await physicalPath(profile, join(state, entry.name))
    const provenance = JSON.parse(await readFile(join(state, entry.name), 'utf8'))
    packageId(provenance.id)
    if (provenance.schema !== 1 || provenance.kind !== 'historical-plugin-import' || entry.name !== encodeURIComponent(provenance.id) + '.json') throw new Error('Invalid historical plugin provenance')
    const receipt = authenticate(provenance.receiptText, keys, target, provenance.digest, local)
    const root = join(profile, 'node_modules', provenance.id)
    await physicalPath(profile, root)
    const plan = await planImport({ receipt, id: provenance.id, logicalRoot: provenance.logicalRoot, runtimeModules, target,
      read: async (_path, destination, entry) => {
        const path = join(root, destination); await physicalPath(root, path)
        if ((await lstat(path)).size !== entry.size) throw new Error('Historical plugin signed size or SHA-256 mismatch: ' + _path)
        return physicalFs.promises.readFile(path)
      } })
    for (const field of ['instances', 'files', 'links', 'runtime', 'optionalMissing']) if (JSON.stringify(provenance[field]) !== JSON.stringify(plan[field])) throw new Error('Historical plugin provenance differs from its signed dependency graph')
    if (provenance.version !== plan.instances[0].version || provenance.sourceDshCommit !== receipt.dshCommit) throw new Error('Historical plugin provenance identity mismatch')
    const required = new Set(plan.instances.flatMap(instance => instance.entries.map(path => posix.join(instance.destination, path))))
    for (const file of plan.files) if (full || required.has(file.destination)) await plan.signedBytes(file.path, file.destination)
    const expectedLinks = new Map(plan.links.map(link => [link.path, link.target]))
    const expectedFiles = new Set(plan.files.map(file => file.destination))
    for (const link of plan.links) {
      const path = join(root, link.path)
      if (!(await lstat(path)).isSymbolicLink() || resolve(dirname(path), await readlink(path)) !== join(root, link.target)) throw new Error('Historical plugin dependency link mismatch')
    }
    let directories = [root]
    while (directories.length) {
      const next = []
      for (const directory of directories) for (const child of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, child.name), name = relative(root, path).replaceAll('\\', '/')
        if (child.isSymbolicLink()) {
          if (!expectedLinks.has(name) || resolve(dirname(path), await readlink(path)) !== join(root, expectedLinks.get(name))) throw new Error('Historical plugin dependency link mismatch')
        } else if (child.isDirectory()) next.push(path)
        else if (!child.isFile() || !expectedFiles.has(name)) throw new Error('Historical plugin physical file set mismatch')
      }
      directories = next
    }
    verified.push({ id: provenance.id, version: provenance.version, digest: provenance.digest })
  }
  return verified
}

/** Restore an independently imported physical snapshot without reopening its
 * old offline supply. Its original signed graph remains the authority. */
export async function restoreHistoricalPluginSnapshot({ profile, previousProfile, id, keys, target, runtimeModules, local = false }) {
  profile = resolve(profile); previousProfile = resolve(previousProfile); packageId(id)
  const evidence = statePath(previousProfile, id)
  if (!await lstat(evidence).catch(error => { if (error.code !== 'ENOENT') throw error })) return undefined
  await verifyHistoricalPluginImports({ profile: previousProfile, keys, target, runtimeModules, local, full: true, ids: [id] })
  const provenance = JSON.parse(await readFile(evidence, 'utf8'))
  const receipt = authenticate(provenance.receiptText, keys, target, provenance.digest, local)
  const root = join(previousProfile, 'node_modules', id)
  const plan = await planImport({ receipt, id, logicalRoot: provenance.logicalRoot, runtimeModules, target,
    read: async (_path, destination, entry) => {
      const path = join(root, destination); await physicalPath(previousProfile, path)
      if ((await lstat(path)).size !== entry.size) throw new Error('Historical plugin signed size or SHA-256 mismatch: ' + _path)
      return physicalFs.promises.readFile(path)
    } })
  return materializeImportPlan({ profile, id, digest: provenance.digest, logicalRoot: provenance.logicalRoot, receipt, text: provenance.receiptText, plan })
}

/** An explicit replacement/removal owns this one generated provenance index.
 * Retain it as rollback evidence without leaving it attached to new bytes. */
export async function archiveHistoricalPluginProvenance({ profile, id }) {
  profile = resolve(profile)
  const path = statePath(profile, id), info = await lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (!info) return undefined
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Historical plugin provenance must be a physical file')
  await physicalPath(profile, path)
  const destination = join(profile, '.zerowall/import-history', randomUUID() + '-provenance.json')
  await mkdir(dirname(destination), { recursive: true }); await physicalPath(profile, dirname(destination))
  await rename(path, destination)
  return destination
}
