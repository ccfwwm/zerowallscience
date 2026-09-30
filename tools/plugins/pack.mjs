import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { root, stageRoot, releaseRoot } from '../build/paths.mjs'
const pnpm = process.env.npm_execpath
if (!pnpm) throw new Error('Invoke with pnpm plugins:pack')
const records = []
const sources = (await readdir(join(root, 'plugins'))).filter(name => name !== 'wechat').map(name => join(root, 'plugins', name))
sources.push(join(root, 'store'), join(root, 'packages/integrity-runtime'), join(root, 'packages/dsh-bundle-science'))
sources.push(...['dsh-wechat', 'dsh-session-notification', 'dsh-auto-review'].map(name => join(root, 'packages', name)))
for (const source of sources) {
  const manifest = await readFile(join(source, 'package.json'), 'utf8').then(JSON.parse, () => undefined)
  if (!manifest) continue
  const directory = manifest.name.split('/').at(-1)
  const version = manifest.version
  const staging = join(stageRoot, 'plugin-packages', directory)
  await mkdir(staging, { recursive: true })
  for (const file of new Set(manifest.files.map(file => file.split('/')[0]))) {
    await cp(join(source, file), join(staging, file), { recursive: true, dereference: true }).catch(error => { if (error.code !== 'ENOENT') throw error })
  }
  const publish = structuredClone(manifest)
  delete publish.scripts
  delete publish.devDependencies
  delete publish.private
  for (const section of ['dependencies', 'peerDependencies']) for (const [name, range] of Object.entries(publish[section] ?? {})) {
    if (!range.startsWith('workspace:')) continue
    const dependency = await readFile(join(source, 'node_modules', name, 'package.json'), 'utf8').then(JSON.parse)
    publish[section][name] = dependency.version
  }
  // DSH is supplied by the Host/profile, never installed as a second runtime.
  for (const [name, range] of Object.entries(publish.dependencies ?? {})) {
    if (!name.startsWith('@deepseek-ai/')) continue
    publish.peerDependencies ??= {}
    publish.peerDependencies[name] = range
    delete publish.dependencies[name]
  }
  await writeFile(join(staging, 'package.json'), JSON.stringify(publish, null, 2))
  const destination = join(releaseRoot, 'plugins', directory, version)
  await mkdir(destination, { recursive: true })
  execFileSync(process.execPath, [pnpm, 'pack', '--pack-destination', destination], { cwd: staging, stdio: 'inherit' })
  const name = (await readdir(destination)).find(file => file.endsWith('.tgz'))
  const archive = join(destination, name)
  const packed = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }))
  if (JSON.stringify(packed).includes('workspace:')) throw new Error(`Non-publishable dependency in ${manifest.name}`)
  const contents = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' })
  if (manifest.main && !contents.includes('package/' + manifest.main.replace(/^\.\//, ''))) throw new Error(`Missing Host bundle for ${manifest.name}`)
  if (manifest.zerowall?.capabilities && !manifest.zerowall?.rollbackSupported) throw new Error('Missing plugin rollback contract')
  records.push({ id: manifest.name, version, path: archive, kind: manifest.dsh?.bundle ? 'plugin' : 'support', manifest: publish.zerowall, dependencies: publish.dependencies })
}
await writeFile(join(releaseRoot, 'plugin-packages.json'), JSON.stringify(records, null, 2))
