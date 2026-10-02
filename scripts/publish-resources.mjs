import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { root, contract, releaseRoot } from '../tools/build/paths.mjs'
import { openQiniuStore } from '../tools/release/qiniu-store.mjs'
import { verifyCatalog, verifySignedDocument, fileDigest } from '../tools/release/resource-catalog.mjs'

const mode = process.argv[2] ?? 'stage'
if (!['stage', 'promote', 'verify'].includes(mode)) throw new Error('Usage: node scripts/publish-resources.mjs stage|promote|verify')
const store = await openQiniuStore(root)
const keys = JSON.parse(await readFile(join(root, 'config/catalogs/trusted-keys.json'), 'utf8'))
const output = join(releaseRoot, 'publication')
await mkdir(output, { recursive: true })
const assets = new Map(), pointers = [], feeds = []
const records = JSON.parse(await readFile(join(releaseRoot, 'plugin-packages.json'), 'utf8'))
for (const kind of ['plugin', 'skill', 'mcp', 'python']) {
  const path = join(releaseRoot, 'catalogs', `${kind}-catalog.json`)
  const document = verifyCatalog(JSON.parse(await readFile(path, 'utf8')), keys, { local: false })
  if (document.localOnly || document.applicationVersion !== contract.version) throw new Error('Wrong release catalog')
  const pointerPath = join(releaseRoot, 'catalogs', `${kind}-latest.json`)
  const pointer = verifySignedDocument(JSON.parse(await readFile(pointerPath, 'utf8')), keys)
  if (pointer.localOnly || pointer.resourceKind !== kind || pointer.catalog.sha256 !== await fileDigest(path) || pointer.catalog.size !== (await stat(path)).size) throw new Error('Catalog pointer mismatch')
  function keyFor(url) {
    if (!url.startsWith(store.base + '/stable/')) throw new Error('Resource URL is outside this release store')
    const key = url.slice(store.base.length + 1)
    if (key.includes('..') || key.includes('?')) throw new Error('Invalid object key')
    return key
  }
  const catalogKey = keyFor(pointer.catalog.downloadUrl)
  assets.set(catalogKey, { key: catalogKey, path })
  for (const entry of document.resources) {
    verifySignedDocument(entry, keys)
    const key = keyFor(entry.downloadUrl)
    let source = records.find(record => record.id === entry.id && record.version === entry.version)?.path
    if (!source) source = entry.kind === 'skill' ? join(releaseRoot, 'skills', entry.id, entry.version, entry.id + '.tgz')
      : entry.id === 'scimaster' ? join(releaseRoot, 'mcp/scimaster', entry.version, 'scimaster.tgz')
      : entry.id === 'science-dependencies' ? join(root, 'resources/python/dependency-manifest.json')
      : resolve(root, JSON.parse(await readFile(join(root, `config/catalogs/${kind}-catalog.json`), 'utf8')).resources.find(resource => resource.id === entry.id)?.path ?? '')
    if ((await stat(source)).size !== entry.size || await fileDigest(source) !== entry.sha256) throw new Error(`Resource artifact mismatch: ${entry.id}`)
    assets.set(key, { key, path: source, id: entry.id, version: entry.version, kind: entry.kind })
  }
  feeds.push({ kind, count: document.resources.length, keyId: document.signature.keyId, catalogKey })
  pointers.push({ key: `stable/catalogs/${kind}-latest.json`, path: pointerPath })
}
const receiptPath = join(output, 'qiniu-resources-stage.json')
const staged = []
if (mode === 'stage') {
  let n = 0
  for (const asset of assets.values()) {
    await store.upload(asset)
    staged.push(await store.verify(asset))
    console.log(`Verified resource ${++n}/${assets.size}: ${asset.key}`)
    await writeFile(receiptPath, JSON.stringify({ applicationVersion: contract.version, complete: n === assets.size, feeds, assets: staged }, null, 2))
  }
} else {
  const saved = JSON.parse(await readFile(receiptPath, 'utf8'))
  if (!saved.complete || saved.assets.length !== assets.size) throw new Error('Resource publication has not passed all public asset checks')
  for (const asset of assets.values()) if (!saved.assets.some(item => item.key === asset.key && item.sha256) || await fileDigest(asset.path) !== saved.assets.find(item => item.key === asset.key).sha256) throw new Error('Staged resource was modified')
  if (mode === 'promote') {
    for (const asset of pointers) await store.upload(asset, true)
    await store.refresh(pointers.map(asset => asset.key))
  }
  const pointerReceipts = []
  for (const asset of pointers) pointerReceipts.push(await store.verify(asset))
  await writeFile(join(output, 'qiniu-resources-public.json'), JSON.stringify({ applicationVersion: contract.version, feeds, immutableAssets: saved.assets, pointers: pointerReceipts, verifiedAt: new Date().toISOString() }, null, 2))
}
console.log(`Resource ${mode} complete: ${assets.size} immutable objects, ${pointers.length} signed pointers`)
