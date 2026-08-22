import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const roots = ['desktop/src', 'plugins', 'store/src', 'profiles']
const forbidden = [
  { label: 'legacy ZeroWall host/client package', pattern: /@zerowallscience\/platform-(?:host|client)/u },
  { label: 'superseded DSH rc8 runtime dependency', pattern: /0\.1\.0-rc\.8/u },
]

const violations = []
for (const relative of roots) {
  for (const path of await files(resolve(root, relative))) {
    if (!/\.(?:json|ts|tsx|yml|yaml)$/u.test(path)) continue
    const source = await readFile(path, 'utf8')
    for (const rule of forbidden) {
      if (rule.pattern.test(source)) violations.push(`${rule.label}: ${path.slice(root.length + 1)}`)
    }
  }
}

if (violations.length > 0) throw new Error(`Runtime security audit failed:\n${violations.join('\n')}`)
console.log('ZeroWall runtime source passed credential and legacy dependency audit.')

async function files(directory) {
  const output = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['lib', 'node_modules'].includes(entry.name)) continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) output.push(...await files(path))
    else output.push(path)
  }
  return output
}
