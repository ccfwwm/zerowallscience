import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { compareVersions } from './resource-catalog.mjs'

/** Inspect the packages that will actually shadow the bundled defaults. */
export async function inspectProfile(home, bundled, target) {
  const directory = join(home, 'profiles/web')
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
  const records = new Map(bundled.map(item => [item.id, item]))
  const plugins = []
  for (const id of [...new Set(manifest.dsh?.profile?.bundles ?? [])]) {
    if (!/^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/u.test(id) || id.split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid profile bundle identity')
    let installed
    try { installed = JSON.parse(await readFile(join(directory, 'node_modules', id, 'package.json'), 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
    const available = records.get(id)
    if (!installed && !available) { plugins.push({ id, source: 'runtime', version: null, compatibility: 'unchecked' }); continue }
    const version = installed?.version ?? available.version
    const desktop = installed?.zerowall?.desktop ?? available?.desktop
    const dsh = installed?.zerowall?.dsh ?? available?.dsh
    const within = (range, actual) => !range || ((!range.min || compareVersions(actual, range.min) >= 0) && (!range.max || compareVersions(actual, range.max) <= 0))
    plugins.push({ id, version, source: installed ? 'profile' : 'bundled', declaredDependency: manifest.dependencies?.[id] ?? null,
      bundledVersion: available?.version ?? null, updateAvailable: Boolean(installed && available && compareVersions(available.version, version) > 0),
      compatibility: within(desktop, target.desktopVersion) && within(dsh, target.dshVersion) ? 'compatible' : 'incompatible' })
  }
  return { desktopVersion: target.desktopVersion, dshVersion: target.dshVersion, plugins, updates: plugins.filter(item => item.updateAvailable).map(item => item.id) }
}
export async function initializeProfile(home, defaults) {
  const directory = join(home, 'profiles/web')
  const file = join(directory, 'package.json')
  await mkdir(directory, { recursive: true })
  let manifest
  try { manifest = JSON.parse(await readFile(file, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  manifest ??= { private: true, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-free-search', 'dsh-file-review'] } } }
  const patchFile = join(directory, 'cordis.patch.yml')
  const patch = await readFile(patchFile, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return undefined })
  if (patch === undefined || !patch.trim()) await writeFile(patchFile, '[]\n', { mode: 0o600 })
  if (manifest.zerowall?.pluginArchitecture === 1) return
  const existing = manifest.dsh?.profile?.bundles ?? []
  manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: [...new Set([...existing, ...defaults])] } }
  manifest.zerowall = { ...manifest.zerowall, pluginArchitecture: 1 }
  const temporary = file + '.' + randomUUID() + '.tmp'
  await writeFile(temporary, JSON.stringify(manifest, null, 2), { mode: 0o600 })
  await rename(temporary, file)
}
