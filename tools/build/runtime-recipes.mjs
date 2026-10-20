import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative, resolve, isAbsolute } from 'node:path'

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
  // Uncompiled compatibility packages have no build-task receipt. Bind their
  // published runtime inputs so a same-version source edit cannot reuse stale
  // closure bytes. The immutable plugin feed still rejects changed archives.
  const profile = JSON.parse(await readFile(join(root, 'config/layout/runtime-profile.json'), 'utf8'))
  for (const [id, directory] of Object.entries(profile.offlinePackageDependencies ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(directory)) throw new Error('Invalid offline package source: ' + directory)
    const source = join(root, 'plugins', directory)
    const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
    if (manifest.name !== id || !manifest.files?.length) throw new Error('Invalid offline package manifest: ' + id)
    const files = new Set(['package.json'])
    async function collect(path) {
      const rel = relative(source, path)
      if (!rel || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) throw new Error('Offline package input escapes source: ' + path)
      const info = await stat(path)
      if (info.isDirectory()) {
        for (const entry of await readdir(path)) await collect(join(path, entry))
      } else if (info.isFile()) files.add(rel.replaceAll('\\', '/'))
    }
    for (const file of manifest.files) await collect(resolve(source, file))
    for (const file of [...files].sort()) recipes[`offline/${id}/${file}`] = digest(await readFile(join(source, file)))
  }
  return recipes
}
