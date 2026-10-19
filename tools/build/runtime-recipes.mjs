import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/** Runtime reuse must include adapter code and configured upstream identities. */
export async function runtimeRecipes(root) {
  const digest = bytes => createHash('sha256').update(bytes).digest('hex')
  const upstream = JSON.parse(await readFile(join(root, 'config/integrations/upstream-sources.json'), 'utf8'))
  delete upstream.version
  const recipes = { 'upstream-sources.json': digest(JSON.stringify(upstream)) }
  for (const file of (await readdir(join(root, 'tools/packaging'))).sort()) {
    if (['prepare-runtime.mjs', 'dedupe-runtime.mjs'].includes(file) || (file.startsWith('adapt-') && !file.endsWith('.test.mjs'))) {
      recipes[file] = digest(await readFile(join(root, 'tools/packaging', file)))
    }
  }
  recipes['stamp-desktop-version.mjs'] = digest(await readFile(join(root, 'tools/build/stamp-desktop-version.mjs')))
  return recipes
}
