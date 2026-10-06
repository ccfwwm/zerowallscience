/** Publish immutable signed Python layer manifests, then move their JSON pointers. */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { contract, releaseRoot, root } from '../tools/build/paths.mjs'
import { verifyDocument } from '../tools/release/python-layer-split.mjs'
import { fileDigest } from '../tools/release/resource-catalog.mjs'
import { openQiniuStore } from '../tools/release/qiniu-store.mjs'

const output = join(releaseRoot, 'python-dependencies')
const scienceBytes = await readFile(join(output, 'latest.json'))
const science = JSON.parse(scienceBytes.toString('utf8'))
const coreBytes = await readFile(join(output, 'core.json'))
const core = JSON.parse(coreBytes.toString('utf8'))
const publicKey = JSON.parse(await readFile(new URL('../config/catalogs/trusted-keys.json', import.meta.url), 'utf8'))['stable-3']
const verifyManifest = (document, layer) => document.schema === 3
  && document.runtimeId === 'zerowall-science-python'
  && document.applicationVersion === contract.version
  && document.layer === layer
  && document.signature?.keyId === 'stable-3'
  && verifyDocument(document, publicKey)

if (!verifyManifest(science, 'science') || !/^[A-Za-z0-9_.-]{1,100}$/u.test(science.revision)) throw new Error('Refusing to publish an invalid signed science dependency manifest.')
if (!verifyManifest(core, 'core') || !/^[A-Za-z0-9_.-]{1,100}$/u.test(core.revision)) throw new Error('Refusing to publish an invalid signed core dependency manifest.')
if (core.packages.length !== 42 || core.packages.some(pkg => pkg.required !== true)) throw new Error('The startup core manifest must contain exactly 42 required dependencies.')

const scienceVersionName = `manifest-${science.revision}.json`
const coreVersionName = `core-${science.revision}.json`
const scienceVersionBytes = await readFile(join(output, scienceVersionName))
const coreVersionBytes = await readFile(join(output, coreVersionName))
if (!scienceVersionBytes.equals(scienceBytes) || !coreVersionBytes.equals(coreBytes)) throw new Error('Immutable and latest Python manifests differ.')
const store = await openQiniuStore(root)
const prefix = 'stable/zerowall-science-python/windows-x64'
const immutable = [
  { key: `${prefix}/${scienceVersionName}`, path: join(output, scienceVersionName) },
  { key: `${prefix}/${coreVersionName}`, path: join(output, coreVersionName) },
]
const pointers = [
  { key: `${prefix}/latest.json`, path: join(output, 'latest.json') },
  { key: `${prefix}/core.json`, path: join(output, 'core.json') },
]

for (const asset of immutable) {
  await store.upload(asset)
  await store.verify(asset)
  console.log(`Verified immutable Python manifest: ${asset.key}`)
}
for (const asset of pointers) {
  await store.upload(asset, true)
  await store.verify(asset)
  console.log(`Verified Python update pointer: ${asset.key}`)
}
await store.refresh(pointers.map(asset => asset.key))
const publicPointers = []
for (const asset of pointers) publicPointers.push(await store.verify(asset))
const receipt = {
  applicationVersion: contract.version,
  publishedAt: new Date().toISOString(),
  keyId: 'stable-3',
  corePackageCount: core.packages.length,
  immutableManifests: await Promise.all(immutable.map(async asset => ({ key: asset.key, bytes: (await stat(asset.path)).size, sha256: await fileDigest(asset.path) }))),
  publicPointers,
}
const publicationDirectory = join(releaseRoot, 'publication')
await mkdir(publicationDirectory, { recursive: true })
await writeFile(join(publicationDirectory, 'qiniu-python-dependencies.json'), JSON.stringify(receipt, null, 2))
console.log(`Published and publicly verified the ${core.packages.length}-package Python core manifest and the science dependency manifest.`)
