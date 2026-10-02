import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile, realpath } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { root, stageRoot, releaseRoot } from '../build/paths.mjs'
import { preparePublishPackage } from './publish-package.mjs'
import { preserveImmutablePackage } from './immutable-package.mjs'
const pnpm = process.env.npm_execpath
if (!pnpm) throw new Error('Invoke with pnpm plugins:pack')
const records = []
const immutableReceipts = []
const historical = []
for (const version of await readdir(dirname(releaseRoot))) {
  if (version === basename(releaseRoot)) continue
  try { historical.push(...JSON.parse(await readFile(join(dirname(releaseRoot), version, 'plugin-packages.json'), 'utf8'))) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}
const sources = (await readdir(join(root, 'plugins'))).filter(name => name !== 'wechat').map(name => join(root, 'plugins', name))
sources.push(join(root, 'store'), join(root, 'packages/integrity-runtime'), join(root, 'packages/dsh-bundle-science'))
sources.push(...['dsh-wechat', 'dsh-session-notification', 'dsh-auto-review'].map(name => join(root, 'packages', name)))
// Preserve the tested Office adapter Git pin as an independently signed
// support tarball; pnpm 11 correctly rejects Git dependencies nested in bundles.
sources.push(dirname(await realpath(join(root, 'plugins/files/node_modules/dsh-office-tools/package.json'))))
for (const source of sources) {
  const manifest = await readFile(join(source, 'package.json'), 'utf8').then(JSON.parse, () => undefined)
  if (!manifest) continue
  const directory = manifest.name.split('/').at(-1)
  const version = manifest.version
  const staging = join(stageRoot, 'plugin-packages', directory)
  const { publish } = await preparePublishPackage(source, staging)
  const destination = join(releaseRoot, 'plugins', directory, version)
  await mkdir(destination, { recursive: true })
  execFileSync(process.execPath, [pnpm, 'pack', '--pack-destination', destination], { cwd: staging, stdio: 'inherit' })
  const name = (await readdir(destination)).find(file => file.endsWith('.tgz'))
  const archive = join(destination, name)
  const baseline = historical.find(item => item.id === manifest.name && item.version === version)
  if (baseline) immutableReceipts.push({ id: manifest.name, version, ...await preserveImmutablePackage(archive, baseline.path) })
  const packed = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }))
  if (JSON.stringify(packed.dependencies ?? {}).match(/workspace:|github:|git\+|git:/)) throw new Error(`Non-publishable dependency in ${manifest.name}`)
  const contents = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' })
  if (manifest.main && !contents.includes('package/' + manifest.main.replace(/^\.\//, ''))) throw new Error(`Missing Host bundle for ${manifest.name}`)
  if (manifest.zerowall?.capabilities && !manifest.zerowall?.rollbackSupported) throw new Error('Missing plugin rollback contract')
  records.push({ id: manifest.name, version, path: archive, kind: manifest.dsh?.bundle && manifest.name !== 'dsh-office-tools' ? 'plugin' : 'support', manifest: publish.zerowall, dependencies: publish.dependencies })
}
await writeFile(join(releaseRoot, 'plugin-packages.json'), JSON.stringify(records, null, 2))
await writeFile(join(releaseRoot, 'immutable-package-receipt.json'), JSON.stringify(immutableReceipts, null, 2) + '\n')
