import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const dshRoot = resolve(root, 'dsh/source')
const outputPath = resolve(root, '.build/dsh/runtime-closure.json')
const check = process.argv.includes('--check')

const manifests = new Map()
for (const path of await findPackageManifests(dshRoot)) {
  const manifest = JSON.parse(await readFile(path, 'utf8'))
  if (typeof manifest.name === 'string') manifests.set(manifest.name, manifest)
}

const queue = ['@deepseek-ai/dsh']
const closure = new Set()
for (let index = 0; index < queue.length; index += 1) {
  const name = queue[index]
  if (closure.has(name)) continue
  const manifest = manifests.get(name)
  if (manifest === undefined) throw new Error(`DSH runtime package is missing from the pinned source: ${name}`)
  closure.add(name)

  const dependencies = {
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
  }
  for (const dependency of Object.keys(dependencies).sort()) {
    if (manifests.has(dependency) && !closure.has(dependency)) queue.push(dependency)
  }

  for (const peer of Object.keys(manifest.peerDependencies ?? {}).sort()) {
    if (manifest.peerDependenciesMeta?.[peer]?.optional === true) continue
    if (manifests.has(peer) && !closure.has(peer)) queue.push(peer)
  }
}

const generated = `${JSON.stringify({
  dshVersion: '0.1.1-rc.2',
  packages: [...closure].sort(),
}, null, 2)}\n`

if (check) {
  if (!existsSync(outputPath) || await readFile(outputPath, 'utf8') !== generated) {
    throw new Error('DSH runtime closure is stale. Run: pnpm dsh:runtime:closure')
  }
  console.log(`DSH runtime closure verified (${closure.size} workspace packages).`)
} else {
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, generated)
  console.log(`Generated DSH runtime closure (${closure.size} workspace packages).`)
}

async function findPackageManifests(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'lib' || entry.name === 'dist') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await findPackageManifests(path))
    else if (entry.name === 'package.json') result.push(path)
  }
  return result
}
