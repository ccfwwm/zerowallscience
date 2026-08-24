import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const source = resolve(root, 'dsh/source')
const packages = []
for (const path of await manifests(source)) {
  const manifest = JSON.parse(await readFile(path, 'utf8'))
  if (typeof manifest.name === 'string') packages.push({
    name: manifest.name,
    version: manifest.version ?? null,
    path: path.slice(source.length + 1).replaceAll('\\', '/'),
  })
}
packages.sort((left, right) => left.name.localeCompare(right.name))
const output = resolve(root, '.build/dsh/package-inventory.json')
await mkdir(dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify({ dsh: '0.1.1-rc.2', packages }, null, 2)}\n`)
console.log(`Recorded ${packages.length} DSH packages.`)

async function manifests(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'lib', 'dist'].includes(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await manifests(path))
    else if (entry.name === 'package.json') result.push(path)
  }
  return result
}
