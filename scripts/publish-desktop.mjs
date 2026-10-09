import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { parse } from 'yaml'
import { root, contract, targetPackageRoot, releaseRoot } from '../tools/build/paths.mjs'
import { fileDigest } from '../tools/release/resource-catalog.mjs'
import { openQiniuStore } from '../tools/release/qiniu-store.mjs'

const mode = process.argv[2] ?? 'stage'
if (!['stage', 'promote', 'verify'].includes(mode)) throw new Error('Usage: node scripts/publish-desktop.mjs stage|promote|verify')
const version = contract.version
const store = await openQiniuStore(root)
const installer = `zerowall-science-${version}-win-x64.exe`
const metadataName = `zerowall-science-${version}-latest.json`
const manifest = JSON.parse(await readFile(join(targetPackageRoot, 'artifact-manifest.json'), 'utf8'))
const expected = manifest.files.find(item => item.path === installer)
if (!expected || expected.sha256 !== await fileDigest(join(targetPackageRoot, installer)) || expected.size !== (await stat(join(targetPackageRoot, installer))).size) throw new Error('Accepted installer no longer matches build receipt')
const metadata = JSON.parse(await readFile(join(targetPackageRoot, metadataName), 'utf8'))
if (metadata.version !== version || metadata.assetSha256 !== expected.sha256 || metadata.sizeBytes !== expected.size || metadata.assetUrl !== `${store.base}/stable/releases/${version}/${installer}`) throw new Error('Desktop JSON metadata mismatch')
const feed = parse(await readFile(join(targetPackageRoot, 'latest.yml'), 'utf8'))
const sha512 = createHash('sha512').update(await readFile(join(targetPackageRoot, installer))).digest('base64')
if (feed.version !== version || feed.path !== `releases/${version}/${installer}` || feed.files[0].sha512 !== sha512 || feed.files[0].size !== expected.size) throw new Error('electron-updater feed mismatch')
const assets = [installer, installer + '.blockmap', metadataName].map(name => ({ key: `stable/releases/${version}/${name}`, path: join(targetPackageRoot, name) }))
const pointers = [['stable/latest.yml', 'latest.yml'], ['stable/releases/latest.json', 'releases-latest.json'], ['stable/releases-zerowallsciencedev/latest.json', 'releases-zerowallsciencedev-latest.json']].map(([key, name]) => ({ key, path: join(targetPackageRoot, name) }))
const output = join(releaseRoot, 'publication')
await mkdir(output, { recursive: true })
const receiptPath = join(output, 'qiniu-desktop-stage.json')
if (mode === 'stage') {
  const receipts = []
  for (const asset of assets) { await store.upload(asset); receipts.push(await store.verify(asset)) }
  await writeFile(receiptPath, JSON.stringify({ version, commit: manifest.commit, assets: receipts }, null, 2))
} else {
  const staged = JSON.parse(await readFile(receiptPath, 'utf8'))
  if (staged.version !== version || staged.assets.length !== assets.length) throw new Error('Desktop stage is incomplete')
  for (const asset of assets) if (await fileDigest(asset.path) !== staged.assets.find(item => item.key === asset.key)?.sha256) throw new Error('Staged desktop asset changed')
  if (mode === 'verify') {
    const current = []
    for (const asset of assets) current.push(await store.verify(asset))
    staged.assets = current
  }
  if (mode === 'promote') { for (const asset of pointers) await store.upload(asset, true); await store.refresh(pointers.map(item => item.key)) }
  const verified = []
  for (const asset of pointers) verified.push(await store.verify(asset))
  await writeFile(join(output, 'qiniu-desktop-public.json'), JSON.stringify({ version, commit: manifest.commit, assets: staged.assets, pointers: verified, verifiedAt: new Date().toISOString() }, null, 2))
}
console.log(`Desktop ${version} ${mode} passed; accepted SHA-256 ${expected.sha256}`)
