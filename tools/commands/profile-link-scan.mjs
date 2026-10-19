import { lstat, readdir, readlink } from 'node:fs/promises'
import { dirname, join, parse, relative, resolve, sep } from 'node:path'

/** Physical traversal and lexical link expansion never follow a cyclic link
 * through stat/realpath. Package dependency cycles are unrelated to this scan. */
export async function scanProfileLinks(root) {
  root = resolve(root)
  const links = []
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) links.push({ path, target: await readlink(path) })
      else if (entry.isDirectory() && !['.plugin-manager', 'root-links', 'link-recovery'].includes(entry.name)) await walk(path)
    }
  }
  await walk(root)
  async function inspect(path) {
    const seen = new Set(), chain = []
    for (let hops = 0; hops < 256; hops++) {
      const disk = parse(path).root, parts = relative(disk, path).split(sep)
      let cursor = disk, redirected = false
      for (let index = 0; index < parts.length; index++) {
        cursor = join(cursor, parts[index])
        const info = await lstat(cursor).catch(error => { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error })
        if (!info) return { fault: 'dangling', chain, missing: cursor }
        if (!info.isSymbolicLink()) continue
        const key = process.platform === 'win32' ? cursor.toLowerCase() : cursor
        if (seen.has(key)) return { fault: 'cycle', chain }
        seen.add(key)
        const target = resolve(dirname(cursor), await readlink(cursor))
        chain.push({ path: cursor, target })
        path = resolve(target, ...parts.slice(index + 1))
        redirected = true
        break
      }
      if (!redirected) return { chain }
    }
    return { fault: 'too-many-links', chain }
  }
  const results = []
  for (const link of links) {
    const result = await inspect(link.path)
    if (result.fault) results.push({ path: relative(root, link.path).replaceAll('\\', '/'), target: link.target, ...result })
  }
  return results
}
