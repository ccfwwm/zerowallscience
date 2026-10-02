import { readFile, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { verifyCatalog, verifySignedDocument } from '../release/resource-catalog.mjs'
const root = resolve(import.meta.dirname, '../..')
const keys = JSON.parse(await readFile(join(root, 'catalogs/trusted-keys.json'), 'utf8'))
const provenance = JSON.parse(await readFile(join(root, 'source-provenance.json'), 'utf8'))
let resources = 0, plugins = 0
for (const kind of ['plugin', 'skill', 'mcp', 'python']) {
  const catalog = verifyCatalog(JSON.parse(await readFile(join(root, 'catalogs', kind + '-catalog.json'), 'utf8')), keys)
  if (catalog.localOnly) throw new Error('Source release contains a development catalog')
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
console.log(`Source release verified: ${plugins} ZeroWall plugins, ${resources} signed resources; DSH ${provenance.dshCommit}`)
