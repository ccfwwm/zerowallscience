import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'

const hash = value => createHash('sha256').update(value).digest('hex')

export function within(root, candidate) {
  const base = resolve(root)
  const path = resolve(candidate)
  const rel = relative(base, path)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`)
}

const hasDependencyDirectory = path => resolve(path).split(/[\\/]/u).some(part => part.toLowerCase() === 'node_modules')

async function inventory(path, files = [], dirs = [], protectedPaths = []) {
  if (hasDependencyDirectory(path)) {
    protectedPaths.push(path)
    return { mostRecentMs: 0, bytes: 0, files, dirs, protectedPaths }
  }
  const info = await lstat(path).catch(error => error.code === 'ENOENT' ? undefined : Promise.reject(error))
  if (!info || info.isSymbolicLink()) return { mostRecentMs: 0, bytes: 0, files, dirs, protectedPaths }
  if (info.isFile()) {
    files.push(path)
    return { mostRecentMs: info.mtimeMs, bytes: info.size, files, dirs, protectedPaths }
  }
  if (!info.isDirectory()) return { mostRecentMs: info.mtimeMs, bytes: 0, files, dirs, protectedPaths }
  dirs.push(path)
  let mostRecentMs = info.mtimeMs, bytes = 0
  for (const child of await readdir(path)) {
    const item = await inventory(join(path, child), files, dirs, protectedPaths)
    mostRecentMs = Math.max(mostRecentMs, item.mostRecentMs)
    bytes += item.bytes
  }
  return { mostRecentMs, bytes, files, dirs, protectedPaths }
}

async function treeDigest(path) {
  const data = await inventory(path)
  if (data.protectedPaths.length) throw new Error(`Refusing to remove a tree containing protected node_modules: ${path}`)
  const digest = createHash('sha256')
  const base = resolve(path)
  for (const file of data.files.sort()) {
    const rel = relative(base, file).replaceAll('\\', '/')
    const fileHash = createHash('sha256')
    for await (const chunk of createReadStream(file)) fileHash.update(chunk)
    digest.update(rel).update('\0').update(fileHash.digest('hex')).update('\0')
  }
  return { sha256: digest.digest('hex'), bytes: data.bytes, mostRecentMs: data.mostRecentMs, files: data.files.length }
}

async function directChildren(path) {
  const info = await lstat(path).catch(() => undefined)
  if (!info) return []
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Managed cleanup root is not a physical directory: ${path}`)
  const result = []
  for (const name of await readdir(path)) {
    const child = join(path, name)
    const item = await lstat(child)
    if (!item.isSymbolicLink() && (item.isDirectory() || item.isFile())) result.push(child)
  }
  return result
}

async function isReferenced(candidate, buildId, referenceFiles) {
  const rel = candidate.replaceAll('\\', '/')
  const normalizedCandidate = rel.toLowerCase()
  const artifactRelative = normalizedCandidate.startsWith('artifacts/') ? normalizedCandidate.slice('artifacts/'.length) : normalizedCandidate
  for (const file of referenceFiles) {
    const text = (await readFile(file, 'utf8').catch(() => '')).replaceAll('\\', '/').toLowerCase()
    if ((buildId && text.includes(buildId.toLowerCase())) || text.includes(normalizedCandidate) || text.includes(artifactRelative)) return true
  }
  return false
}

async function collectJsonFiles(path, files = []) {
  if (hasDependencyDirectory(path)) return files
  const info = await lstat(path).catch(() => undefined)
  if (!info || info.isSymbolicLink()) return files
  if (info.isFile()) {
    if (path.toLowerCase().endsWith('.json') && info.size <= 32 * 1024 * 1024) files.push(path)
    return files
  }
  if (!info.isDirectory()) return files
  for (const entry of await readdir(path, { withFileTypes: true })) {
    // Cleanup plans list candidates for audit; they do not keep those bytes.
    if (entry.name === 'cleanup' && path.split(/[\\/]/u).includes('verification')) continue
    if (entry.isDirectory() || (entry.isFile() && entry.name.toLowerCase().endsWith('.json'))) {
      await collectJsonFiles(join(path, entry.name), files)
    }
  }
  return files
}

export async function createCleanupPlan({ root, policy, now = Date.now() }) {
  const repositoryRoot = resolve(root)
  const artifacts = join(repositoryRoot, 'artifacts')
  const referenceFiles = [
    ...await collectJsonFiles(artifacts),
  ]
  const durableReferences = [...await collectJsonFiles(join(artifacts, 'release')), ...await collectJsonFiles(join(artifacts, 'verification'))]
  const cacheReferences = [...durableReferences]
  const candidates = []
  const exclusions = []
  const addCandidate = async (managedRoot, path, cutoffDays, reason, buildId, references = durableReferences) => {
    const absoluteRoot = resolve(repositoryRoot, managedRoot)
    const absolute = resolve(path)
    const protectedRoot = (policy.protectedRoots ?? []).some(item => {
      // Policy entries are repository-relative paths. Keep the literal
      // `%SystemDrive%` anomaly directory local to this repository instead of
      // expanding it to `C:\`, which would accidentally protect every artifact.
      const protectedPath = resolve(repositoryRoot, item)
      return absolute.toLowerCase() === protectedPath.toLowerCase() || absolute.toLowerCase().startsWith(`${protectedPath.toLowerCase()}${sep}`)
    })
    if (!within(absoluteRoot, absolute) || !within(artifacts, absolute) || protectedRoot) {
      exclusions.push({ path: absolute, reason: 'outside-managed-root' })
      return
    }
    const info = await lstat(absolute).catch(() => undefined)
    if (!info || info.isSymbolicLink()) {
      exclusions.push({ path: absolute, reason: 'missing-or-link' })
      return
    }
    // A recently touched tree cannot have expired. Avoid scanning or hashing it.
    if (cutoffDays > 0 && (now - info.mtimeMs) / 86_400_000 < cutoffDays) return
    const inventoryData = await inventory(absolute)
    if (inventoryData.protectedPaths.length) {
      exclusions.push({ path: absolute, reason: 'contains-protected-node-modules' })
      return
    }
    const ageDays = (now - inventoryData.mostRecentMs) / 86_400_000
    if (cutoffDays > 0 && ageDays < cutoffDays) return
    if (await isReferenced(absolute.replaceAll('\\', '/'), buildId, references)) {
      exclusions.push({ path: absolute, reason: 'referenced-build' })
      return
    }
    const digest = await treeDigest(absolute)
    candidates.push({ path: absolute, managedRoot: absoluteRoot, repositoryRoot, reason, ageDays: Math.floor(ageDays), ...digest })
  }

  const stageRoot = join(artifacts, 'stage')
  for (const versionPath of await directChildren(stageRoot).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
    const version = versionPath.split(/[\\/]/u).at(-1)
    const active = await readFile(join(versionPath, 'current.json'), 'utf8').then(JSON.parse, () => undefined)
    const builds = []
    for (const buildPath of await directChildren(versionPath)) {
      if (!(await lstat(buildPath)).isDirectory()) continue
      const receipt = await readFile(join(buildPath, 'build-receipt.json'), 'utf8').then(JSON.parse, () => undefined)
        ?? await readFile(join(buildPath, 'runtime/build-receipt.json'), 'utf8').then(JSON.parse, () => undefined)
      const packaged = await readFile(join(buildPath, 'desktop-package-receipt.json'), 'utf8').then(JSON.parse, () => undefined)
      const cloned = await readFile(join(buildPath, 'stage-clone-receipt.json'), 'utf8').then(JSON.parse, () => undefined)
      const failed = receipt?.status === 'failed' || await lstat(join(buildPath, 'FAILED')).then(() => true, () => false) || await lstat(join(buildPath, 'stage-clone-failure.json')).then(() => true, () => false)
      builds.push({ path: buildPath, buildId: buildPath.split(/[\\/]/u).at(-1), failed, success: !failed && (receipt?.status === 'success' || !!packaged || !!cloned), time: Date.parse(receipt?.finishedAt ?? cloned?.createdAt) || (await lstat(buildPath)).mtimeMs })
    }
    const keepCount = policy.defaults.keepStagesPerVersion ?? policy.defaults.keepStableVersions
    const successful = builds.filter(item => item.success).sort((a, b) => b.time - a.time || b.buildId.localeCompare(a.buildId))
    const activeIds = builds.some(item => item.buildId === active?.buildId) ? [active.buildId] : []
    const retained = new Set(keepCount == null ? [] : [...activeIds, ...successful.filter(item => item.buildId !== active?.buildId).slice(0, Math.max(0, keepCount - activeIds.length)).map(item => item.buildId)])
    for (const { path: buildPath, buildId, failed, success } of builds) {
      if (active?.buildId === buildId) { exclusions.push({ path: buildPath, reason: 'active-stage' }); continue }
      if (retained.has(buildId)) { exclusions.push({ path: buildPath, reason: 'retained-successful-stage' }); continue }
      if (failed) await addCandidate('artifacts/stage', buildPath, policy.defaults.failedBuildDays, 'failed-build-expired', buildId)
      else if (success && keepCount != null) await addCandidate('artifacts/stage', buildPath, 0, 'successful-stage-over-retention', buildId)
      else await addCandidate('artifacts/stage', buildPath, policy.defaults.stageDays, 'unreferenced-stage-expired', buildId)
      void version
    }
    if (active?.buildId && /^[A-Za-z0-9._-]+$/u.test(active.buildId)) cacheReferences.push(...await collectJsonFiles(join(versionPath, active.buildId)))
  }

  const retainCache = async (managedRoot, directory, count, receiptName) => {
    const entries = []
    for (const path of await directChildren(directory)) {
      if (!(await lstat(path)).isDirectory()) continue
      const receipt = await readFile(join(path, receiptName), 'utf8').then(JSON.parse, () => undefined)
      if (!receipt || /\.(?:candidate|damaged)-/u.test(path)) { await addCandidate(managedRoot, path, policy.defaults.cacheDays, 'incomplete-cache-expired', path.split(/[\\/]/u).at(-1), cacheReferences); continue }
      entries.push({ path, time: (await lstat(join(path, receiptName))).mtimeMs })
    }
    entries.sort((a, b) => b.time - a.time || b.path.localeCompare(a.path))
    for (const [index, entry] of entries.entries()) {
      if (index < count) exclusions.push({ path: entry.path, reason: 'retained-cache' })
      else await addCandidate(managedRoot, entry.path, 0, 'cache-over-retention', entry.path.split(/[\\/]/u).at(-1), cacheReferences)
    }
  }
  const assemblyRoot = join(artifacts, 'cache/runtime-assemblies')
  for (const kind of await directChildren(assemblyRoot)) if ((await lstat(kind)).isDirectory()) await retainCache('artifacts/cache/runtime-assemblies', kind, policy.defaults.keepRuntimeAssembliesPerKind ?? 2, 'receipt.json')
  await retainCache('artifacts/cache/offline-carriers', join(artifacts, 'cache/offline-carriers'), policy.defaults.keepOfflineCarriers ?? 2, 'payload.json')

  for (const [rootName, days, reason] of [
    ['artifacts/dev', policy.defaults.devDays, 'development-output-expired'],
    ['artifacts/cache/legacy-outputs', policy.defaults.devDays, 'legacy-output-expired'],
    ['artifacts/cache/electron-builder', policy.defaults.cacheDays, 'electron-builder-cache-expired'],
    ['artifacts/logs', policy.defaults.logsDays, 'build-log-expired'],
  ]) {
    const base = join(repositoryRoot, rootName)
    for (const child of await directChildren(base).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
      const leaf = child.split(/[\\/]/u).at(-1)
      await addCandidate(rootName, child, days, reason, leaf)
    }
  }

  const objectRoot = join(artifacts, 'objects', 'sha256')
  for (const prefixPath of await directChildren(objectRoot).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
    const prefix = prefixPath.split(/[\\/]/u).at(-1)
    if (!/^[a-f0-9]{2}$/u.test(prefix)) continue
    for (const objectPath of await directChildren(prefixPath)) {
      const digest = objectPath.split(/[\\/]/u).at(-1)
      if (!/^[a-f0-9]{64}$/u.test(digest) || digest.slice(0, 2) !== prefix) continue
      if (await isReferenced(relative(artifacts, objectPath).replaceAll('\\', '/'), undefined, referenceFiles)) {
        exclusions.push({ path: objectPath, reason: 'referenced-content-object' })
        continue
      }
      await addCandidate('artifacts/objects', objectPath, policy.defaults.objectDays ?? 30, 'unreferenced-content-object-expired')
    }
  }
  return { generatedAt: new Date(now).toISOString(), candidates: candidates.sort((a, b) => a.path.localeCompare(b.path)), exclusions }
}

export async function removeCandidate(candidate, expected) {
  const { rm, lstat } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const root = resolve(candidate.managedRoot)
  const path = resolve(candidate.path)
  if (!within(root, path)) throw new Error(`Refusing to remove path outside managed root: ${path}`)
  const info = await lstat(path)
  if (info.isSymbolicLink()) throw new Error(`Refusing to remove symbolic link: ${path}`)
  if (candidate.repositoryRoot) {
    const artifacts = join(candidate.repositoryRoot, 'artifacts')
    const references = [...await collectJsonFiles(join(artifacts, 'release')), ...await collectJsonFiles(join(artifacts, 'verification'))]
    const id = path.split(/[\\/]/u).at(-1)
    // A stage can become active or acquire a durable reference after planning.
    for (const version of await directChildren(join(artifacts, 'stage'))) {
      const active = await readFile(join(version, 'current.json'), 'utf8').then(JSON.parse, () => undefined)
      if (!active?.buildId || !/^[A-Za-z0-9._-]+$/u.test(active.buildId)) continue
      if (path === join(version, active.buildId)) throw new Error('Cleanup candidate became the active stage')
      references.push(...await collectJsonFiles(join(version, active.buildId)))
    }
    if (await isReferenced(path, id, references)) throw new Error('Cleanup candidate acquired a protected reference')
  }
  const current = await treeDigest(path)
  if (current.sha256 !== expected.sha256 || current.bytes !== expected.bytes) throw new Error(`Cleanup candidate changed after dry-run: ${path}`)
  await rm(path, { recursive: info.isDirectory(), force: false })
}
