/** Measure the staged runtime and remove byte-identical, dependency-free Zod duplicates. */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

function files(root: string): { path: string; bytes: number }[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? files(path) : [{ path, bytes: statSync(path).size }]
  })
}
function digest(root: string): string {
  const hash = createHash('sha256')
  for (const entry of files(root).sort((a,
    b) => a.path.localeCompare(b.path))) hash.update(relative(root,
    entry.path).replaceAll('\\',
    '/')).update('\0').update(readFileSync(entry.path))
  return hash.digest('hex')
}

/**
 * Remove a nested Zod only when Node will resolve an identical ancestor package.
 * @param modules - Materialized production node_modules, never a source checkout.
 * @returns Removed package directories and their saved physical bytes.
 */
export function deduplicateRuntimeZod(modules: string): { path: string; bytes: number }[] {
  const packages = files(modules).filter(entry => entry.path.endsWith(join('zod', 'package.json'))).map(entry => dirname(entry.path))
  const removed: { path: string; bytes: number }[] = []
  for (const directory of packages.sort((a, b) => b.length - a.length)) {
    if (!existsSync(directory)) continue
    const manifest = JSON.parse(readFileSync(join(directory,
      'package.json'),
    'utf8')) as { name: string
      version: string
      dependencies?: object
      peerDependencies?: object }
    if (manifest.name !== 'zod' || Object.keys(manifest.dependencies ?? {}).length || Object.keys(manifest.peerDependencies ?? {}).length) continue
    let parent = dirname(directory)
    while (parent.startsWith(dirname(modules))) {
      const candidate = join(parent, 'node_modules', 'zod')
      if (candidate !== directory && existsSync(join(candidate, 'package.json'))) {
        const ancestor = JSON.parse(readFileSync(join(candidate, 'package.json'), 'utf8')) as { version: string }
        if (ancestor.version === manifest.version && digest(candidate) === digest(directory)) {
          const bytes = files(directory).reduce((sum, entry) => sum + entry.bytes, 0)
          rmSync(directory, { recursive: true }); removed.push({ path: relative(modules, directory), bytes })
        }
        break
      }
      const next = dirname(parent); if (next === parent) break; parent = next
    }
  }
  return removed
}

/**
 * Reject accidentally bundled downloads and summarize the physical runtime size.
 * @param root - Fully materialized production runtime.
 * @returns File count, bytes and largest installed package roots, including nested dependencies.
 */
export function runtimeSizeReport(root: string): { files: number; bytes: number; packages: { name: string; bytes: number }[] } {
  const inventory = files(root)
  const sizes = new Map<string, number>()
  for (const entry of inventory) {
    const path = relative(root, entry.path).replaceAll('\\', '/')
    if (path.includes('science-python-wheels/') || /@zerowall\/dsh-plugin-python\/resources\/runtime\/wheels\/|@zerowall\/dsh-pptcreate\/.*\.onnx$/u.test(path)) throw new Error(`Desktop contains a resource that must download after launch: ${path}`)
    const match = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/u.exec(path)
    if (match) sizes.set(match[1]!, (sizes.get(match[1]!) ?? 0) + entry.bytes)
  }
  return { files: inventory.length,
    bytes: inventory.reduce((sum,
      entry) => sum + entry.bytes,
    0),
    packages: [...sizes].map(([name,
      bytes]) => ({ name,
      bytes })).sort((a,
      b) => b.bytes - a.bytes) }
}
