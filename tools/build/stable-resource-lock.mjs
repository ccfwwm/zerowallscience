import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { includePackagedSkillPath, resourceTreeFiles } from './resource-tree.mjs'
import { readStableConfig } from './stable-config.mjs'

export const stableResourceLockPath = 'config/build/stable-resource-lock.json'

const productionSourceExclusions = new Set([
  '.git', '.turbo', '.cache', 'coverage', 'dist', 'lib', 'node_modules', 'payload',
  'test', 'tests', '__tests__', 'e2e',
])

function treeDigest(files) {
  const hash = createHash('sha256')
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path).update('\0').update(file.sha256).update('\0')
  }
  return hash.digest('hex')
}

function selectedSet(selected) {
  if (selected == null) return undefined
  const values = Array.isArray(selected) ? selected : [selected]
  if (!values.length) return undefined
  assert(values.every(value => typeof value === 'string' && value.length > 0), 'Resource selection IDs must be non-empty strings')
  return new Set(values)
}

function matchesPluginSelection(id, item, selected) {
  if (!selected) return false
  return selected.has(id)
    || selected.has(id.split('/').at(-1))
    || Boolean(item?.path && selected.has(basename(item.path)))
}

function mergeSelected(previous, current, selected, matches, label) {
  const oldById = new Map(previous.map(item => [item.id, item]))
  const newById = new Map(current.map(item => [item.id, item]))
  const ids = new Set([...oldById.keys(), ...newById.keys()])
  let matched = false
  const result = []
  for (const id of ids) {
    const oldItem = oldById.get(id)
    const newItem = newById.get(id)
    if (matches(id, newItem ?? oldItem, selected)) {
      matched = true
      if (newItem) result.push(newItem)
    } else if (oldItem) result.push(oldItem)
  }
  if (!matched) throw new Error(`Unknown ${label} selection: ${[...selected].join(', ')}`)
  return result.sort((a, b) => a.id.localeCompare(b.id))
}

function includePluginSource(root, candidate) {
  const path = relative(root, candidate).replaceAll('\\', '/')
  if (!path) return true
  if (path.split('/').some(part => productionSourceExclusions.has(part.toLowerCase()))) return false
  return !/\.(?:test|spec)\.[^.]+$/iu.test(path)
}

async function pluginSources(root, packages) {
  const directory = join(root, 'plugins')
  const retired = new Set(JSON.parse(await readFile(join(root, 'config/catalogs/retired-plugins.json'), 'utf8')).plugins.map(item => item.id))
  const feedIds = new Set(packages.map(item => item.id))
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'wechat') continue
    const path = join(directory, entry.name)
    const manifestPath = join(path, 'package.json')
    const manifest = await readFile(manifestPath, 'utf8').then(JSON.parse, error => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    if (!manifest?.name || retired.has(manifest.name)
      || !(feedIds.has(manifest.name) || manifest.dsh?.bundle || manifest.name.startsWith('@zerowallscience/plugin-'))) continue
    const files = await resourceTreeFiles(path, candidate => includePluginSource(path, candidate))
    result.push({ id: manifest.name, version: manifest.version, path: relative(root, path).replaceAll('\\', '/'), files: files.length, sha256: treeDigest(files) })
  }
  result.sort((a, b) => a.id.localeCompare(b.id))
  assert.equal(new Set(result.map(item => item.id)).size, result.length, 'Plugin source package IDs must be unique')
  return result
}

function pluginArtifacts(records) {
  assert(Array.isArray(records) && records.length > 0, 'The shared plugin package feed is missing or empty')
  const result = records.map(record => {
    assert(typeof record.id === 'string' && typeof record.version === 'string', 'Invalid plugin lock entry')
    assert(['plugin', 'support'].includes(record.kind), `Invalid plugin package kind: ${record.id}`)
    assert(Number.isSafeInteger(record.size) && record.size > 0 && /^[a-f0-9]{64}$/u.test(record.sha256 ?? ''), `Invalid plugin package digest: ${record.id}`)
    return { id: record.id, version: record.version, kind: record.kind, size: record.size, sha256: record.sha256, sourceFingerprint: record.sourceFingerprint ?? null }
  }).sort((a, b) => a.id.localeCompare(b.id))
  assert.equal(new Set(result.map(item => item.id)).size, result.length, 'Plugin package IDs must be unique')
  return result
}

function assertPluginSourcesMatchFeed(sources, packages) {
  const feed = new Map(packages.map(item => [item.id, item]))
  for (const source of sources) {
    const artifact = feed.get(source.id)
    assert(artifact, `Current plugin source is missing from the shared feed: ${source.id}`)
    assert.equal(artifact.version, source.version, `Shared plugin feed is stale for ${source.id}: ${artifact.version} != ${source.version}`)
  }
}

async function skillSources(root, previous, skillRecords, artifactsRoot, selected) {
  const sourceRoot = join(root, 'resources/extensions/skills')
  const versions = JSON.parse(await readFile(join(root, 'config/catalogs/resource-versions.json'), 'utf8')).skill
  assert(versions && typeof versions === 'object' && !Array.isArray(versions), 'Skill versions must be an object')
  const previousById = new Map((previous?.skills ?? []).map(item => [item.id, item]))
  const recordsById = new Map((skillRecords ?? []).map(item => [item.id, item]))
  const selectedIds = selectedSet(selected)
  const result = []
  const names = []
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const path = join(sourceRoot, entry.name)
    const manifestPath = join(path, 'SKILL.md')
    const info = await lstat(manifestPath).catch(error => error.code === 'ENOENT' ? undefined : Promise.reject(error))
    if (!info) continue
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Invalid Skill manifest: ${manifestPath}`)
    names.push(entry.name)
    const prior = previousById.get(entry.name)
    if (selectedIds && !selectedIds.has(entry.name)) {
      if (!prior) throw new Error(`A complete stable resource lock is required before selectively updating Skills: ${entry.name}`)
      result.push(prior)
      continue
    }
    const version = versions[entry.name]
    assert(typeof version === 'string' && version, `Skill version is missing: ${entry.name}`)
    const files = await resourceTreeFiles(path, candidate => includePackagedSkillPath(path, candidate))
    const currentHash = treeDigest(files)
    if (prior?.version === version && prior.sourceSha256 !== currentHash) {
      throw new Error(`Skill source changed without a version increase: ${entry.name}@${version}; increment resource-versions.json first.`)
    }
    const supplied = recordsById.get(entry.name)
    if (supplied && supplied.version !== version) throw new Error(`Skill catalog version differs from resource lock source: ${entry.name}`)
    if (prior?.version === version && supplied?.sha256 && supplied.sha256 !== prior.sha256) {
      throw new Error(`Same-version Skill archive bytes changed: ${entry.name}@${version}`)
    }
    let sha256 = supplied?.sha256 ?? (prior?.version === version ? prior.sha256 : undefined)
    if (!sha256) sha256 = await findSkillArchiveDigest({ root, artifactsRoot, id: entry.name, version })
    assert(/^[a-f0-9]{64}$/u.test(sha256 ?? ''), `Skill archive digest is unavailable for ${entry.name}@${version}; run catalogs:generate first`)
    result.push({ id: entry.name, version, files: files.length, sourceSha256: currentHash, sha256 })
  }
  names.sort()
  const configured = Object.keys(versions).sort()
  assert.deepEqual(configured, names, 'Skill source directories and resource-versions.json must contain the same IDs')
  if (!selectedIds) {
    for (const prior of previous?.skills ?? []) if (!names.includes(prior.id)) throw new Error(`A Skill source was removed; regenerate the complete stable resource lock: ${prior.id}`)
  }
  if (selectedIds) for (const id of selectedIds) if (!names.includes(id)) throw new Error(`Unknown Skill selection: ${id}`)
  result.sort((a, b) => a.id.localeCompare(b.id))
  assert.equal(new Set(result.map(item => item.id)).size, result.length, 'Skill IDs must be unique')
  return result
}

async function findSkillArchiveDigest({ root, artifactsRoot, id, version }) {
  const applicationVersion = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
  const pointer = await readFile(join(artifactsRoot, 'stage', applicationVersion, 'current.json'), 'utf8').then(JSON.parse, () => undefined)
  const candidates = [
    join(artifactsRoot, 'release', applicationVersion, 'skills', id, version, `${id}.tgz`),
    ...(pointer?.buildId ? [join(artifactsRoot, 'stage', applicationVersion, pointer.buildId, 'resource-packages', 'skill', id, version, `${id}.tgz`)] : []),
  ]
  for (const path of candidates) {
    const bytes = await readFile(path).catch(error => error.code === 'ENOENT' ? undefined : Promise.reject(error))
    if (bytes) return createHash('sha256').update(bytes).digest('hex')
  }
  const catalogPath = join(artifactsRoot, 'release', applicationVersion, 'catalogs/skill-catalog.json')
  const catalog = await readFile(catalogPath, 'utf8').then(JSON.parse, error => error.code === 'ENOENT' ? undefined : Promise.reject(error))
  return catalog?.resources?.find(entry => entry.id === id && entry.version === version)?.sha256
}

function mergeSections(current, previous, section, selected) {
  if (!previous) {
    if (section !== 'all') throw new Error('A complete stable resource lock must be generated before a selective update.')
    return current
  }
  if (section === 'all') return current
  if (current.signingKeyId !== previous.signingKeyId) throw new Error('Stable signing key changed; regenerate all stable resource catalogs and the complete lock.')
  if (section === 'plugins') {
    const ids = selectedSet(selected)
    return {
      ...current,
      plugins: ids ? mergeSelected(previous.plugins, current.plugins, ids, matchesPluginSelection, 'plugin') : current.plugins,
      pluginSources: ids ? mergeSelected(previous.pluginSources, current.pluginSources, ids, matchesPluginSelection, 'plugin') : current.pluginSources,
      skills: previous.skills,
    }
  }
  if (section === 'skills') {
    const ids = selectedSet(selected)
    return {
      ...current,
      plugins: previous.plugins,
      pluginSources: previous.pluginSources,
      skills: ids ? mergeSelected(previous.skills, current.skills, ids, (id, _item, selectedIds) => selectedIds.has(id), 'Skill') : current.skills,
    }
  }
  throw new Error(`Unknown stable resource lock section: ${section}`)
}

export async function buildStableResourceLock({ root, records, previous, skillRecords, artifactsRoot, signingKeyId }) {
  const config = await readStableConfig(root)
  const keyId = signingKeyId ?? config.signing.keyId
  if (keyId !== config.signing.keyId) throw new Error('Stable resource lock signer differs from config/build/stable.json')
  const packages = pluginArtifacts(records)
  const sources = await pluginSources(root, packages)
  assertPluginSourcesMatchFeed(sources, packages)
  return {
    schema: 1,
    signingKeyId: keyId,
    plugins: packages,
    pluginSources: sources,
    skills: await skillSources(root, previous, skillRecords, artifactsRoot ?? join(root, 'artifacts')),
  }
}

export async function writeStableResourceLock({ root, records, section = 'all', selected, skillRecords, artifactsRoot }) {
  const path = join(root, stableResourceLockPath)
  const previous = await readFile(path, 'utf8').then(JSON.parse, error => error.code === 'ENOENT' ? undefined : Promise.reject(error))
  const config = await readStableConfig(root)
  const stableArtifactsRoot = artifactsRoot ?? join(root, 'artifacts')
  if (!previous && section !== 'all') {
    section = 'all'
    selected = undefined
    skillRecords ??= await currentSkillRecords(root, stableArtifactsRoot)
  }
  let current
  if (section === 'all') current = await buildStableResourceLock({ root, records, previous, skillRecords, artifactsRoot: stableArtifactsRoot, signingKeyId: config.signing.keyId })
  else {
    if (previous.signingKeyId !== config.signing.keyId) throw new Error('Stable signing key changed; regenerate all stable resource catalogs and the complete lock.')
    if (section === 'plugins') {
      const packages = pluginArtifacts(records)
      const sources = await pluginSources(root, packages)
      if (selected == null) assertPluginSourcesMatchFeed(sources, packages)
      current = { ...previous, plugins: packages, pluginSources: sources }
    } else if (section === 'skills') {
      current = { ...previous, skills: await skillSources(root, previous, skillRecords, stableArtifactsRoot, selected) }
    } else throw new Error(`Unknown stable resource lock section: ${section}`)
    current.signingKeyId = config.signing.keyId
  }
  const result = mergeSections(current, previous, section, selected)
  await mkdir(join(root, 'config/build'), { recursive: true })
  const next = JSON.stringify(result, null, 2) + '\n'
  const old = previous ? JSON.stringify(previous, null, 2) + '\n' : undefined
  if (old !== next) {
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
    try { await writeFile(temporary, next, { flag: 'wx' }); await rename(temporary, path) }
    finally { await unlink(temporary).catch(() => {}) }
  }
  return result
}

export async function verifyStableResourceLock({ root, records, artifactsRoot }) {
  const path = join(root, stableResourceLockPath)
  const expected = await readFile(path, 'utf8').then(JSON.parse, error => {
    if (error.code === 'ENOENT') throw new Error('Stable resource lock is missing; run pnpm stable:resources:sync before packaging.')
    throw error
  })
  const actual = await buildStableResourceLock({ root, records, previous: expected, artifactsRoot })
  try { assert.deepEqual(actual, expected) }
  catch {
    throw new Error('Stable resource lock does not match current plugin packages, plugin sources, Skill versions, or Skill source bytes; update the affected resource package and regenerate its lock entry.')
  }
  return actual
}

async function currentSkillRecords(root, artifactsRoot) {
  const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
  const path = join(artifactsRoot, 'release', version, 'catalogs/skill-catalog.json')
  const catalog = await readFile(path, 'utf8').then(JSON.parse, error => {
    if (error.code === 'ENOENT') throw new Error('Stable Skill catalog is missing; build and generate resource catalogs before syncing the lock.')
    throw error
  })
  if (catalog.localOnly || catalog.signature?.keyId !== 'stable-4') throw new Error('Stable resource lock requires the public Skill catalog signed with stable-4.')
  return catalog.resources
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, '../..')
  const artifactsRoot = resolve(process.env.ZEROWALL_ARTIFACT_ROOT ?? join(root, 'artifacts'))
  const { readVerifiedPluginFeed } = await import('../plugins/snapshot.mjs')
  const records = await readVerifiedPluginFeed(join(artifactsRoot, 'release/plugins'))
  if (process.argv.includes('--check')) {
    const lock = await verifyStableResourceLock({ root, records, artifactsRoot })
    console.log(`Stable resource lock verified: ${lock.plugins.length} packages, ${lock.skills.length} Skills, signer ${lock.signingKeyId}`)
  } else if (process.argv.includes('--write')) {
    const skillRecords = await currentSkillRecords(root, artifactsRoot)
    const lock = await writeStableResourceLock({ root, records, section: 'all', skillRecords, artifactsRoot })
    console.log(`Stable resource lock updated: ${lock.plugins.length} packages, ${lock.skills.length} Skills, signer ${lock.signingKeyId}`)
  } else throw new Error('Usage: pnpm stable:resources:sync or pnpm stable:resources:check')
}
