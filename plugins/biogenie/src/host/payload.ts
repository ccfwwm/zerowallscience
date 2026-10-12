import { createHash } from 'node:crypto'
import { lstat, readFile, realpath, readdir } from 'node:fs/promises'
import { isAbsolute, relative, resolve, join } from 'node:path'
type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
interface Operation { id: string; summary: string; description: string; parameters: Record<string, Json>; default_backend: string; dependency_profile: string; network: boolean }
/** The package is signature-verified by the resource manager; this receipt also
 * catches incomplete offline payloads and prevents source-directory fallback. */
export async function verifyBioPayload(root: string): Promise<{ operations: Operation[] }> {
  root = resolve(root)
  const manifest = JSON.parse(await readFile(join(root, 'payload-receipt.json'), 'utf8')) as { schema: number; files: Array<{ path: string; size: number; sha256: string }> }
  if (manifest.schema !== 1 || !Array.isArray(manifest.files)) throw new Error('BIOGENIE_RESOURCE_MISSING: invalid payload receipt.')
  const owned = new Set<string>()
  for (const file of manifest.files) {
    const path = resolve(root, file.path); const local = relative(root, path)
    if (!local || local.startsWith('..') || isAbsolute(local) || owned.has(file.path)) throw new Error('BIOGENIE_RESOURCE_INVALID: unsafe payload path.')
    const stat = await lstat(path)
    const physical = relative(await realpath(root), await realpath(path))
    if (!stat.isFile() || stat.isSymbolicLink() || physical.startsWith('..') || isAbsolute(physical)) throw new Error('BIOGENIE_RESOURCE_INVALID: linked payload.')
    const bytes = await readFile(path)
    if (bytes.length !== file.size || createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error('BIOGENIE_RESOURCE_INVALID: payload bytes differ.')
    owned.add(file.path)
  }
  for (const required of ['python/zerowall_bridge.py', 'python/bio_ops.py', 'operations.json', 'UPSTREAM.json', 'LICENSE']) if (!owned.has(required)) throw new Error('BIOGENIE_RESOURCE_MISSING: required resource omitted.')
  const actual = new Set<string>()
  const collect = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await collect(path)
      else if (entry.isFile()) actual.add(relative(root, path).replaceAll('\\', '/'))
      else throw new Error('BIOGENIE_RESOURCE_INVALID: linked payload directory.')
    }
  }
  await collect(root); actual.delete('payload-receipt.json')
  if (actual.size !== owned.size || [...actual].some(path => !owned.has(path))) throw new Error('BIOGENIE_RESOURCE_INVALID: unowned payload files.')
  const catalog = JSON.parse(await readFile(join(root, 'operations.json'), 'utf8')) as { operations: Operation[] }
  return { operations: catalog.operations }
}
