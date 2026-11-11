/** Pack and inspect the exact owned npm archives used by the Desktop distribution. */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const { values } = parseArgs({ options: { output: { type: 'string' }, packages: { type: 'string' } } })
const destination = resolve(values.output ?? join(root, '.artifacts/zerowall-npm'))
const selection = values.packages ? new Set(values.packages.split(',')) : undefined
const manager = process.env.npm_execpath
if (!manager?.includes('pnpm')) throw new Error('Run this script with pnpm run zerowall:pack')
await mkdir(destination, { recursive: true })
const directories = [...(await readdir(join(root, 'distribution/plugins'))).map(name => join(root, 'distribution/plugins', name)), join(root, 'distribution/science')]
const records = []
const sources = new Map()
for (const directory of directories) {
  const source = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
  if (selection && !selection.has(source.name)) continue
  if (source.name?.startsWith('@zerowall/')) sources.set(source.name, source)
  execFileSync(process.execPath, [manager, '--config.ignore-scripts=true', 'pack', '--pack-destination', destination], { cwd: directory, env: { ...process.env, npm_config_ignore_scripts: 'true' }, stdio: 'pipe' })
  const filename = source.name.replace('@', '').replace('/', '-') + '-' + source.version + '.tgz'
  const archive = join(destination, filename)
  const entries = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' }).trim().split(/\r?\n/)
  const manifest = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }))
  if (manifest.name?.startsWith('@zerowall/') && (!/^\d+\.\d+\.\d+$/u.test(manifest.version) || manifest.version !== '0.1.0')) {
    throw new Error(source.name + ' must use the formal ZeroWall release version 0.1.0')
  }
  if (manifest.name?.startsWith('@zerowall/') && manifest.publishConfig?.tag !== 'latest') {
    throw new Error(source.name + ' must publish on the latest tag')
  }
  if (manifest.name?.startsWith('@zerowall/') && manifest.zerowall?.profiles?.includes('preview')) {
    throw new Error(source.name + ' must not declare preview as a release profile')
  }
  const pluginMetadata = entries.find(entry => entry.endsWith('/zerowall.plugin.json'))
  if (manifest.name?.startsWith('@zerowall/') && pluginMetadata !== undefined) {
    const plugin = JSON.parse(execFileSync('tar', ['-xOf', archive, pluginMetadata], { encoding: 'utf8' }))
    if (plugin.profiles?.includes('preview')) throw new Error(source.name + ' plugin metadata must not declare preview as a release profile')
  }
  if (manifest.name === '@zerowall/dsh-pptcreate' && entries.some(entry => entry.endsWith('.onnx'))) throw new Error('PPT npm archives must download OCR models after launch.')
  if (manifest.name === '@zerowall/dsh-plugin-skills' && entries.some(entry => entry.includes('/plugin-help/'))) throw new Error('Plugin instructions must be shipped by their owner, without duplicate plugin-help resources.')
  if (manifest.name === '@zerowall/dsh-plugin-python' && entries.some(entry => /\/wheels\/|\.whl$/u.test(entry))) throw new Error('Python npm archives must not contain offline extension wheels.')
  for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [name, value] of Object.entries(manifest[section] ?? {})) {
      if (/^(workspace:|file:|link:)|[A-Z]:[\\/]/i.test(value)) throw new Error(source.name + ' has an unpublished dependency: ' + name + '@' + value)
      if (name.startsWith('@zerowall/') && value !== '0.1.0') throw new Error(source.name + ' has a non-formal ZeroWall dependency: ' + name + '@' + value)
    }
  }
  const targets = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(targets) : []
  for (const entry of [...targets(manifest.exports), manifest.main, manifest.types, manifest.icon, manifest.dsh?.bundle?.patch].filter(Boolean)) {
    if (!entry.startsWith('./') && !manifest.main?.includes(entry) && !manifest.dsh?.bundle?.patch?.includes(entry)) continue
    const target = 'package/' + entry.replace(/^.\//, '')
    if (target.includes('*') ? !entries.some(file => file.startsWith(target.split('*')[0])) : !entries.includes(target)) throw new Error(source.name + ' is missing exported asset ' + entry)
  }
  for (const required of ['package/README.md', 'package/LICENSE']) if (!entries.includes(required)) throw new Error(source.name + ' is missing ' + required)
  for (const required of manifest.zerowall?.runtimeFiles ?? []) {
    if (typeof required !== 'string' || required.includes('..') || required.startsWith('/') || !entries.includes('package/' + required)) throw new Error(source.name + ' is missing runtime resource ' + required)
  }
  const details = []
  for (const entry of entries.filter(file => /^package\/locale\/[^/]+\.json$/.test(file))) {
    const locale = JSON.parse(execFileSync('tar', ['-xOf', archive, entry], { encoding: 'utf8' }))
    if (locale.meta?.detail === undefined) continue
    const detail = locale.meta.detail
    if (typeof detail !== 'string' || !entries.includes('package/' + detail)) throw new Error(source.name + ' is missing localized detail ' + detail)
    details.push({ locale: entry.slice('package/'.length), document: detail })
  }
  const body = await readFile(archive)
  records.push({ name: manifest.name, version: manifest.version, file: filename, bytes: body.length, integrity: 'sha512-' + createHash('sha512').update(body).digest('base64'), files: entries.length, details })
  console.log('Validated ' + manifest.name + '@' + manifest.version + ' (' + entries.length + ' files)')
}
if (!records.length || selection && records.length !== selection.size) throw new Error('The package selection must name existing ZeroWall packages; no complete archive set was produced.')
const names = new Set(records.map(record => record.name))
if (!selection && !names.has('@zerowall/dsh-bundle-science')) {
  throw new Error('The complete ZeroWall archive set must include @zerowall/dsh-bundle-science')
}
if (!selection) {
  for (const record of records) {
    const source = sources.get(record.name)
    if (source === undefined) throw new Error(`Missing source manifest for ${record.name}`)
    for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const dependency of Object.keys(source[section] ?? {})) {
        if (dependency.startsWith('@zerowall/') && !sources.has(dependency)) throw new Error(`${record.name} depends on an omitted ZeroWall package: ${dependency}`)
      }
    }
  }
}
await writeFile(join(destination, 'manifest.json'), JSON.stringify({ packages: records }, null, 2) + '\n')
