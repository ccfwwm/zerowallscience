import { createHash, randomUUID } from 'node:crypto'
import { copyFile, cp, lstat, mkdir, readFile, readdir, rename, symlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { assertCompatible, compareVersions, fileDigest, verifySignedDocument } from './resource-catalog.mjs'

export function pluginIdentity(id) {
  if (typeof id !== 'string' || !/^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/u.test(id) || id.split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid plugin identity')
  return id
}
function inside(root, path) {
  const rel = relative(root, path)
  if (!rel || rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel)) throw new Error('Offline path escapes its signed root')
}
export async function offlineFiles(root, prefix = '') {
  const entries = []
  async function collect(directory, namePrefix) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name), name = namePrefix + entry.name
      if (entry.isSymbolicLink()) throw new Error('Offline closure contains a link')
      if (entry.isDirectory()) {
        if ((await lstat(path)).isSymbolicLink()) throw new Error('Offline closure contains a link')
        await collect(path, name + '/')
      } else if (entry.isFile()) entries.push({ path, name })
      else throw new Error('Offline closure contains a special file')
    }
  }
  await collect(root, prefix)
  const files = new Array(entries.length)
  await concurrentFiles(entries, async ({ path, name }, index) => {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Offline closure contains a link or special file')
    files[index] = { path: name, size: info.size, sha256: await fileDigest(path) }
  })
  return files
}

// Bound disk operations instead of opening thousands of handles or performing
// one Windows filesystem round trip at a time. Wait for every worker on error.
async function concurrentFiles(entries, task) {
  let next = 0
  const results = await Promise.allSettled(Array.from({ length: Math.min(16, entries.length) }, async () => {
    while (next < entries.length) { const index = next++; await task(entries[index], index) }
  }))
  const failure = results.find(result => result.status === 'rejected')
  if (failure) throw failure.reason
}

async function copySignedModules(source, destination, files) {
  const directories = new Map()
  await concurrentFiles(files.filter(entry => entry.path.startsWith('modules/')), async entry => {
    const path = join(destination, entry.path.slice('modules/'.length))
    const parent = dirname(path)
    if (!directories.has(parent)) directories.set(parent, mkdir(parent, { recursive: true }))
    await directories.get(parent)
    await copyFile(join(source, entry.path), path)
    // Only verified complete bytes can become the active immutable cache.
    const info = await lstat(path)
    if (info.size !== entry.size || await fileDigest(path) !== entry.sha256) throw new Error('Copied offline module differs from its signed receipt')
  })
}
export async function verifyOfflineProfile(source, keys, target, { local = false } = {}) {
  const text = await readFile(join(source, 'receipt.json'), 'utf8')
  const receipt = verifySignedDocument(JSON.parse(text), keys)
  if (receipt.schema !== 1 || receipt.kind !== 'offline-profile' || receipt.profileArchitecture !== 7 || !Array.isArray(receipt.files) || !Array.isArray(receipt.plugins) || !Array.isArray(receipt.defaultPatch)) throw new Error('Invalid offline profile receipt')
  if (receipt.localOnly && !local) throw new Error('Development offline profile cannot enter a stable installation')
  if (receipt.applicationVersion !== target.desktopVersion || receipt.dshCommit !== target.dshCommit) throw new Error('Offline profile does not match this Desktop/DSH build')
  assertCompatible(receipt, target)
  for (const entry of receipt.files) {
    if (typeof entry.path !== 'string' || entry.path.includes('\\') || entry.path.split('/').some(part => !part || part === '.' || part === '..') || isAbsolute(entry.path) || !/^[a-f0-9]{64}$/u.test(entry.sha256) || !Number.isSafeInteger(entry.size)) throw new Error('Invalid signed offline file')
    inside(resolve(source), resolve(source, entry.path))
  }
  const actual = (await offlineFiles(source)).filter(entry => entry.path !== 'receipt.json').sort((a, b) => a.path.localeCompare(b.path))
  if (JSON.stringify(actual) !== JSON.stringify(receipt.files)) throw new Error('Offline profile size, SHA-256 or file set mismatch')
  const identities = new Set()
  for (const entry of receipt.plugins) {
    pluginIdentity(entry.id)
    if (identities.has(entry.id) || typeof entry.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/u.test(entry.version)) throw new Error('Invalid or duplicate signed offline plugin')
    identities.add(entry.id)
  }
  for (const row of receipt.defaultPatch) if (!row || typeof row.id !== 'string' || typeof row.config !== 'object') throw new Error('Invalid signed offline default configuration')
  return { receipt, digest: createHash('sha256').update(text).digest('hex') }
}

/** Materialize a verified immutable generation in user-owned storage. */
export async function prepareOfflineCandidate({ home, source, keys, target, defaults, bundledPlugins, yaml, local = false }) {
  const { receipt, digest } = await verifyOfflineProfile(source, keys, target, { local })
  const cache = join(home, 'resources/offline', digest)
  let cacheReady = false
  try {
    const cached = JSON.parse(await readFile(join(cache, 'receipt.json'), 'utf8'))
    if (JSON.stringify(cached) !== JSON.stringify(receipt)) throw new Error('Offline cache receipt differs')
    const cachedFiles = (await offlineFiles(join(cache, 'node_modules'))).sort((a, b) => a.path.localeCompare(b.path))
    cacheReady = JSON.stringify(cachedFiles.map(entry => ({ ...entry, path: 'modules/' + entry.path }))) === JSON.stringify(receipt.files.filter(entry => entry.path.startsWith('modules/')))
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (!cacheReady) {
    if (await lstat(cache).catch(() => undefined)) throw new Error('Immutable offline generation was changed; repair its cache explicitly')
    const pending = cache + '.candidate-' + randomUUID()
    await mkdir(pending, { recursive: true })
    await copySignedModules(source, join(pending, 'node_modules'), receipt.files)
    await writeFile(join(pending, 'receipt.json'), JSON.stringify(receipt))
    await rename(pending, cache)
  }
  const active = join(home, 'profiles/web')
  const manifest = JSON.parse(await readFile(join(active, 'package.json'), 'utf8'))
  const selection = JSON.parse(await readFile(join(home, 'resources/plugins/selection.json'), 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return '{}' }))
  const disabled = new Set([...(selection.disabled ?? []), ...(manifest.zerowall?.disabledPlugins ?? [])])
  const removed = new Set(selection.removed ?? [])
  const pins = selection.pinned ?? {}
  const candidate = join(home, 'profiles', 'zerowall-offline-' + randomUUID())
  await cp(active, candidate, { recursive: true, dereference: false })
  const packages = new Map(receipt.plugins.map(entry => [entry.id, entry]))
  const changed = [], blocked = []
  const bundles = new Set(manifest.dsh?.profile?.bundles ?? [])
  for (const id of defaults) {
    pluginIdentity(id)
    if (removed.has(id) || disabled.has(id)) continue
    const record = packages.get(id)
    if (!record) throw new Error('Default plugin absent from signed offline closure: ' + id)
    const installed = await readFile(join(candidate, 'node_modules', id, 'package.json'), 'utf8').then(JSON.parse).catch(error => { if (error.code !== 'ENOENT') throw error; return undefined })
    if (pins[id]) {
      if (installed?.version !== pins[id]) {
        if (record.version !== pins[id]) { blocked.push({ id, version: pins[id], reason: 'Pinned package is missing; import this exact version or explicitly unpin' }); continue }
      } else { bundles.add(id); continue }
    }
    bundles.add(id)
    // Independently updated packages may be newer than the installer seed.
    // Repair missing packages without rolling those generations back.
    if (installed?.version && compareVersions(installed.version, record.version) >= 0) continue
    if (record.core && id.startsWith('@deepseek-ai/')) continue
    const replacement = join(cache, 'node_modules', id)
    const physical = JSON.parse(await readFile(join(replacement, 'package.json'), 'utf8'))
    if (physical.version !== record.version || physical.name !== id) throw new Error('Offline plugin identity/version mismatch')
    const path = join(candidate, 'node_modules', id)
    await mkdir(resolve(path, '..'), { recursive: true })
    if (await lstat(path).catch(() => undefined)) await rename(path, path + '.previous-' + randomUUID())
    await symlink(replacement, path, process.platform === 'win32' ? 'junction' : 'dir')
    manifest.dependencies ??= {}
    manifest.dependencies[id] = 'file:' + replacement.replaceAll('\\', '/')
    changed.push({ id, from: installed?.version ?? null, to: record.version })
  }
  // DSH resolves imported bundles directly from profile node_modules.
  // Preserve their dependency declarations: a file reference into this
  // temporary candidate would break when activation renames it to web.
  if (blocked.length) return { candidate, receipt, digest, changed, blocked }
  manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: [...bundles].filter(id => !removed.has(id) && !disabled.has(id) && id !== 'dsh-auto-review') } }
  manifest.zerowall = { ...manifest.zerowall, pluginArchitecture: 7, disabledPlugins: [...disabled].sort(), offlineGeneration: digest }
  const patchPath = join(candidate, 'cordis.patch.yml')
  const existingPatch = yaml.parse(await readFile(patchPath, 'utf8')) ?? []
  if (!Array.isArray(existingPatch)) throw new Error('Profile patch must remain an array')
  // Existing settings always win; only fill the missing product defaults.
  const patches = receipt.defaultPatch.filter(row => !existingPatch.some(existing => existing.id === row.id))
  await writeFile(patchPath, yaml.stringify([...patches, ...existingPatch]))
  await writeFile(join(candidate, 'package.json'), JSON.stringify(manifest, null, 2))
  return { candidate, receipt, digest, changed, blocked }
}
