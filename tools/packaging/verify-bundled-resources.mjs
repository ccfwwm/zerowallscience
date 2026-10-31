import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { list } from 'tar'
import { offlineFiles } from '../commands/offline-profile.mjs'
import { compareVersions, verifyCatalog, verifySignedDocument } from '../release/resource-catalog.mjs'
import { publishedResources } from '../release/immutable-resource.mjs'
import { readRetiredResourceIds } from '../plugins/snapshot.mjs'

export function assertLatestResources(packaged, published, { requireAll = false, verifyDigests = true } = {}) {
  const available = new Map(packaged.map(entry => [entry.id, entry]))
  for (const entry of published) {
    const actual = available.get(entry.id)
    if (!actual && !requireAll && !entry.id.startsWith('@zerowallscience/plugin-')) continue
    assert(actual, `Published resource is missing from the installer: ${entry.id}; synchronize sources first`)
    assert(compareVersions(actual.version, entry.version) >= 0,
      `Installer resource is older than the signed public catalog: ${entry.id}@${actual.version} < ${entry.version}; synchronize sources first`)
    if (verifyDigests && actual.version === entry.version) assert.equal(actual.sha256, entry.sha256, `Immutable resource bytes differ: ${entry.id}@${entry.version}`)
  }
}

export async function verifyStableCatalogFreshness({ plugins, skills, keys, cache, publicBase }) {
  if (!publicBase) throw new Error('Stable packaging requires the public stable resource catalog URL')
  const counts = {}
  for (const kind of ['plugin', 'skill']) {
    const published = await publishedResources({ baseUrl: publicBase, kind, keys, cache: join(cache, 'published-resources', kind) })
    assert(published.size > 0, `The public stable ${kind} catalog is unavailable`)
    const retired = await readRetiredResourceIds(kind)
    const entries = [...published.values()].map(value => value.entry).filter(entry => !retired.has(entry.id))
    assertLatestResources(kind === 'plugin' ? plugins : skills, entries, { requireAll: kind === 'skill' })
    counts[kind] = entries.length
  }
  return counts
}

async function archiveFiles(path) {
  const files = new Map()
  await list({ file: path, onReadEntry(entry) {
    if (entry.type === 'Directory') return entry.resume()
    assert.equal(entry.type, 'File', 'Only regular resource files can be bundled')
    const name = entry.path.replace(/^(?:\.\/)+/u, '')
    assert(!name.startsWith('/') && !name.includes('\\') && !name.split('/').includes('..') && !files.has(name), 'Invalid resource archive entry')
    const hash = createHash('sha256')
    entry.on('data', bytes => hash.update(bytes))
    entry.on('end', () => files.set(name, hash.digest('hex')))
  } })
  return files
}

/** Verify shipped Skill bytes, version reporting, and signed public freshness;
 * plugin manifests/carrier bytes are independently bound by verifyStagePluginFeed. */
export async function verifyBundledResources({ root, stage, release, cache, publicBase }) {
  const json = async path => JSON.parse(await readFile(path, 'utf8'))
  const keys = await json(join(root, 'config/catalogs/trusted-keys.json'))
  const versions = await json(join(stage, 'commands/bundled-skill-versions.json'))
  const result = { plugins: [], skills: [] }
  for (const kind of ['plugin', 'skill']) {
    const catalog = verifyCatalog(await json(join(release, 'catalogs', kind + '-catalog.json')), keys)
    assert(!catalog.localOnly, 'Stable packaging requires a signed public resource catalog')
    for (const entry of catalog.resources) verifySignedDocument(entry, keys)
    if (publicBase) {
      const online = await publishedResources({ baseUrl: publicBase, kind, keys, cache: join(cache, 'published-resources', kind) })
      const retired = await readRetiredResourceIds(kind)
      assertLatestResources(catalog.resources, [...online.values()].map(value => value.entry).filter(entry => !retired.has(entry.id)), { requireAll: kind === 'skill' })
    }
    if (kind === 'plugin') { result.plugins = catalog.resources.map(({ id, version, sha256 }) => ({ id, version, sha256 })); continue }
    assert.deepEqual(Object.keys(versions).sort(), catalog.resources.map(entry => entry.id).sort(), 'Bundled Skill version index and signed catalog differ')
    for (const entry of catalog.resources) {
      assert.equal(versions[entry.id], entry.version, 'Bundled Skill reports an outdated version: ' + entry.id)
      const archivePath = join(release, 'skills', entry.id, entry.version, entry.id + '.tgz')
      assert.equal(createHash('sha256').update(await readFile(archivePath)).digest('hex'), entry.sha256, 'Signed Skill archive was modified: ' + entry.id)
      const archive = await archiveFiles(archivePath)
      const actual = await offlineFiles(join(stage, 'resources/extensions/skills', entry.id))
      assert.deepEqual(actual.map(file => file.path).sort(), [...archive.keys()].sort(), 'Bundled Skill file set differs: ' + entry.id)
      for (const file of actual) assert.equal(file.sha256, archive.get(file.path), 'Bundled Skill content differs: ' + entry.id + '/' + file.path)
      result.skills.push({ id: entry.id, version: entry.version, sha256: entry.sha256, files: actual.length })
    }
  }
  const applicationVersion = (await json(join(root, 'package.json'))).version
  const receipt = { schema: 1, applicationVersion, checkedAt: new Date().toISOString(), publicCatalogsChecked: Boolean(publicBase), ...result }
  await writeFile(join(stage, 'bundled-resource-receipt.json'), JSON.stringify(receipt, null, 2) + '\n')
  return receipt
}
