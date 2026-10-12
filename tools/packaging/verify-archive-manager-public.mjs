import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { verifyCatalog, verifySignedDocument } from '../release/resource-catalog.mjs'

const installation = resolve(process.argv[2]), output = resolve(process.argv[3]), publication = resolve(process.argv[4]), otherBaseline = resolve(process.argv[5])
const commands = join(installation, 'resources/commands'), json = async path => JSON.parse(await readFile(path, 'utf8'))
const keys = await json(join(commands, 'trusted-keys.json')), base = 'https://zerowall.chengxunkeji.cn'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
async function bytes(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30000) })
  assert(response.ok, `${url}: HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}
await mkdir(output, { recursive: false })
const receipt = { complete: false, checks: [] }
try {
  const pointer = verifySignedDocument(JSON.parse(await bytes(`${base}/stable/catalogs/plugin-latest.json`)), keys)
  const catalogBytes = await bytes(pointer.catalog.downloadUrl)
  assert.equal(catalogBytes.length, pointer.catalog.size)
  assert.equal(digest(catalogBytes), pointer.catalog.sha256)
  const catalog = verifyCatalog(JSON.parse(catalogBytes), keys)
  const baseline = await json(join(publication, 'catalogs/plugin-targeted-baseline.json'))
  const id = '@michengai/dsh-archive-manager'
  assert.equal(catalog.resources.length, baseline.previousCatalog.resources.length + 1)
  for (const entry of baseline.previousCatalog.resources) assert.deepEqual(catalog.resources.find(item => item.id === entry.id), entry)
  const archive = catalog.resources.find(item => item.id === id)
  verifySignedDocument(archive, keys)
  const payload = await bytes(archive.downloadUrl)
  assert.equal(payload.length, 839560)
  assert.equal(payload.length, archive.size)
  assert.equal(digest(payload), 'c2a0ec6b9d418797f44eebe1eec95c6f149359d5776fe4a5dc708e42935cc600')
  assert.equal(digest(payload), archive.sha256)
  receipt.checks.push({ name: 'public signed pointer, catalog and archive match; 38 previous entries preserved exactly', complete: true })
  receipt.archive = archive
  receipt.catalog = pointer.catalog
  for (const [path, expected] of Object.entries((await json(otherBaseline)).other)) {
    const content = await bytes(`${base}/${path}`)
    assert.equal(content.length, expected.size, path)
    assert.equal(digest(content), expected.sha256, path)
  }
  receipt.checks.push({ name: 'desktop latest.yml and Skills, MCP, Python resource pointers unchanged', complete: true })
  const { initializeProfile } = await import(pathToFileURL(join(commands, 'profile.mjs')))
  const { createResourceManager } = await import(pathToFileURL(join(commands, 'resource-manager.mjs')))
  const defaults = await json(join(commands, 'default-plugins.json')), bundled = await json(join(commands, 'bundled-plugins.json'))
  const pin = await json(join(installation, 'resources/licenses/deepseek-harness.version.json')), home = join(output, 'harness')
  await initializeProfile(home, defaults, bundled)
  const manager = createResourceManager({ home, keys, target: { desktopVersion: '8.1.3', dshVersion: pin.version, dshCommit: pin.commit, platform: process.platform, architecture: process.arch }, defaultPlugins: defaults, bundledPlugins: bundled, callHost: async () => { throw Error('Requested plugin service is unavailable') } })
  const listing = await manager.check('plugin')
  assert.equal(listing.catalogStatus, 'checked', listing.error)
  const available = listing.resources.find(item => item.id === id)
  assert(available)
  assert.equal(available.version, '1.0.17-zws.1')
  assert.equal(available.managed, true)
  assert.equal(available.catalogSigned, true)
  assert.equal(available.source, 'catalog')
  assert.equal(available.installState, 'missing')
  receipt.listing = available
  receipt.checks.push({ name: 'unchanged installed 8.1.3 Extension Center backend lists the new plugin as signed and installable', complete: true })
  receipt.complete = true
  console.log('Public catalog: 39 entries; archive size/hash verified; installed 8.1.3 lists signed installable plugin; other pointers unchanged')
} catch (error) { receipt.error = error.stack ?? String(error); throw error }
finally { await writeFile(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n') }
