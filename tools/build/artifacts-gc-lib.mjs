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

async function inventory(path, files = [], dirs = []) {
  const info = await lstat(path).catch(() => undefined)
  if (!info || info.isSymbolicLink()) return { mostRecentMs: 0, bytes: 0, files, dirs }
  if (info.isFile()) {
    files.push(path)
    return { mostRecentMs: info.mtimeMs, bytes: info.size, files, dirs }
  }
  if (!info.isDirectory()) return { mostRecentMs: info.mtimeMs, bytes: 0, files, dirs }
  dirs.push(path)
  let mostRecentMs = info.mtimeMs, bytes = 0
  for (const child of await readdir(path)) {
    const item = await inventory(join(path, child), files, dirs)
    mostRecentMs = Math.max(mostRecentMs, item.mostRecentMs)
    bytes += item.bytes
  }
  return { mostRecentMs, bytes, files, dirs }
}

async function treeDigest(path) {
  const data = await inventory(path)
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
  const info = await lstat(path).catch(() => undefined)
  if (!info || info.isSymbolicLink()) return files
  if (info.isFile()) {
    if (path.toLowerCase().endsWith('.json') && info.size <= 2 * 1024 * 1024) files.push(path)
    return files
  }
  if (!info.isDirectory()) return files
  for (const name of await readdir(path)) await collectJsonFiles(join(path, name), files)
  return files
}

export async function createCleanupPlan({ root, policy, now = Date.now() }) {
  const repositoryRoot = resolve(root)
  const artifacts = join(repositoryRoot, 'artifacts')
  const referenceFiles = [
    ...await collectJsonFiles(artifacts),
  ]
  const candidates = []
  const exclusions = []
  const addCandidate = async (managedRoot, path, cutoffDays, reason, buildId) => {
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
    const inventoryData = await treeDigest(absolute)
    const ageDays = (now - inventoryData.mostRecentMs) / 86_400_000
    if (ageDays < cutoffDays) return
    if (buildId && await isReferenced(absolute.replaceAll('\\', '/'), buildId, referenceFiles)) {
      exclusions.push({ path: absolute, reason: 'referenced-build' })
      return
    }
    candidates.push({ path: absolute, managedRoot: absoluteRoot, reason, ageDays: Math.floor(ageDays), ...inventoryData })
  }

  const stageRoot = join(artifacts, 'stage')
  for (const versionPath of await directChildren(stageRoot).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
    const version = versionPath.split(/[\\/]/u).at(-1)
    const active = await readFile(join(versionPath, 'current.json'), 'utf8').then(JSON.parse, () => undefined)
    for (const buildPath of await directChildren(versionPath).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
      if (buildPath.toLowerCase().endsWith('current.json')) continue
      const buildId = buildPath.split(/[\\/]/u).at(-1)
      if (active?.buildId === buildId) { exclusions.push({ path: buildPath, reason: 'active-stage' }); continue }
      const receipt = await readFile(join(buildPath, 'build-receipt.json'), 'utf8').then(JSON.parse, () => undefined)
      const failed = receipt?.status === 'failed' || await lstat(join(buildPath, 'FAILED')).then(() => true, () => false)
      if (failed) await addCandidate('artifacts/stage', buildPath, policy.defaults.failedBuildDays, 'failed-build-expired', buildId)
      else await addCandidate('artifacts/stage', buildPath, policy.defaults.stageDays, 'unreferenced-stage-expired', buildId)
      void version
    }
  }

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
  const current = await treeDigest(path)
  if (current.sha256 !== expected.sha256 || current.bytes !== expected.bytes) throw new Error(`Cleanup candidate changed after dry-run: ${path}`)
  await rm(path, { recursive: info.isDirectory(), force: false })
}
