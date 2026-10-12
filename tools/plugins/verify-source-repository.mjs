import { readFile, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileDigest, verifyCatalog, verifySignedDocument } from '../release/resource-catalog.mjs'
const root = resolve(import.meta.dirname, '../..')
const keys = JSON.parse(await readFile(join(root, 'catalogs/trusted-keys.json'), 'utf8'))
const provenance = JSON.parse(await readFile(join(root, 'source-provenance.json'), 'utf8'))
let resources = 0, plugins = 0, optionalPlugins = 0
const catalogs = new Map()
for (const kind of ['plugin', 'skill', 'mcp', 'python']) {
  const catalog = verifyCatalog(JSON.parse(await readFile(join(root, 'catalogs', kind + '-catalog.json'), 'utf8')), keys)
  if (catalog.localOnly) throw new Error('Source release contains a development catalog')
  catalogs.set(kind, catalog)
  for (const item of catalog.resources) { verifySignedDocument(item, keys); resources++ }
}
for (const name of await readdir(join(root, 'plugins'))) {
  const manifest = JSON.parse(await readFile(join(root, 'plugins', name, 'package.json'), 'utf8'))
  if (name === 'wechat') continue // Retained historical facade; dsh-wechat is the active package.
  if (!manifest.version || !manifest.dsh?.bundle || !manifest.zerowall?.dsh) throw new Error('Missing independent plugin contract: ' + name)
  const released = provenance.packages.find(item => item.id === manifest.name)
  if (!released || released.version !== manifest.version) throw new Error('Source and published plugin version differ: ' + name)
  plugins++
}
// Independent publications retain their exact signed catalog without replacing
// the source repository's historical desktop-release catalogs.
const independentResources = new Map()
for (const update of provenance.independentResourceUpdates ?? []) {
  const pointer = verifySignedDocument(JSON.parse(await readFile(join(root, update.pointerPath), 'utf8')), keys)
  const path = join(root, update.catalogPath)
  const bytes = await readFile(path)
  if (pointer.localOnly || pointer.resourceKind !== 'plugin' || bytes.length !== pointer.catalog.size || await fileDigest(path) !== pointer.catalog.sha256) throw new Error('Independent publication integrity mismatch: ' + update.id)
  const catalog = verifyCatalog(JSON.parse(bytes), keys)
  if (catalog.localOnly || catalog.kind !== 'plugin') throw new Error('Independent publication is not a stable plugin catalog')
  const entry = catalog.resources.find(item => item.id === update.id && item.version === update.version)
  if (!entry || entry.sha256 !== update.sha256 || entry.size !== update.size || independentResources.has(update.id)) throw new Error('Independent publication resource mismatch: ' + update.id)
  verifySignedDocument(entry, keys)
  independentResources.set(update.id, entry)
}
const integrations = JSON.parse(await readFile(join(root, 'config/integrations/upstream-sources.json'), 'utf8'))
for (const integration of Object.values(integrations)) {
  if (!integration?.catalogOptional) continue
  const manifest = JSON.parse(await readFile(join(root, integration.source, 'package.json'), 'utf8'))
  const released = provenance.packages.find(item => item.id === manifest.name)
  const entry = independentResources.get(manifest.name) ?? catalogs.get('plugin').resources.find(item => item.id === manifest.name)
  if (!manifest.dsh?.bundle || !manifest.zerowall?.rollbackSupported || manifest.name !== integration.package || manifest.version !== integration.resourceVersion || released?.version !== manifest.version || entry?.version !== manifest.version) throw new Error('Optional plugin source and publication differ: ' + integration.source)
  for (const field of ['desktop', 'dsh', 'capabilities', 'permissions', 'restartRequired', 'rollbackSupported']) {
    if (JSON.stringify(entry[field]) !== JSON.stringify(manifest.zerowall[field])) throw new Error('Optional plugin compatibility contract differs: ' + field)
  }
  optionalPlugins++
}
console.log(`Source release verified: ${plugins} ZeroWall plugins, ${optionalPlugins} optional plugins, ${resources} signed baseline resources; DSH ${provenance.dshCommit}`)
