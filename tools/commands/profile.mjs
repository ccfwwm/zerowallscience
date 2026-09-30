import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
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
