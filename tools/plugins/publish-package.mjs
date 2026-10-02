import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { historicalPackage } from './package-history.mjs'

/** Dereference build output links into a publishable physical package. */
export async function preparePublishPackage(source, staging) {
  const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
  await mkdir(staging, { recursive: true })
  for (const file of new Set(manifest.files.map(file => file.split('/')[0]))) {
    await cp(join(source, file), join(staging, file), { recursive: true, dereference: true }).catch(error => {
      if (error.code !== 'ENOENT') throw error
    })
  }
  if (manifest.main) await access(join(staging, manifest.main))
  const publish = structuredClone(manifest)
  const baseline = await historicalPackage(manifest.name, manifest.version)
  const previous = baseline ? JSON.parse(execFileSync('tar', ['-xOf', baseline.path, 'package/package.json'], { encoding: 'utf8' })) : undefined
  delete publish.scripts
  delete publish.devDependencies
  delete publish.private
  delete publish.publishConfig?.directory
  for (const section of ['dependencies', 'peerDependencies']) {
    for (const [name, range] of Object.entries(publish[section] ?? {})) {
      if (!/^(?:workspace:|github:|git\+|git:)/.test(range)) continue
      const dependency = JSON.parse(await readFile(join(source, 'node_modules', name, 'package.json'), 'utf8'))
      // An unchanged component keeps its published dependency contract even
      // when a newer compatible workspace dependency is being bundled today.
      publish[section][name] = /^workspace:/.test(range) && previous?.[section]?.[name]
        ? previous[section][name] : dependency.version
    }
  }
  for (const [name, range] of Object.entries(publish.dependencies ?? {})) {
    if (!name.startsWith('@deepseek-ai/')) continue
    publish.peerDependencies ??= {}
    publish.peerDependencies[name] = range
    delete publish.dependencies[name]
  }
  await writeFile(join(staging, 'package.json'), JSON.stringify(publish, null, 2) + '\n')
  return { manifest, publish }
}
