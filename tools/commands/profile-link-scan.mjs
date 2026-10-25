import { lstat, readdir, readlink } from 'node:fs/promises'
import { dirname, join, parse, relative, resolve, sep } from 'node:path'
import { bounded, isProfileArchivePath } from './profile-copy.mjs'

/** Physical traversal and lexical link expansion never follow a cyclic link
 * through stat/realpath. Package dependency cycles are unrelated to this scan. */
export async function scanProfileLinks(root) {
  root = resolve(root)
  const links = []
  // Cache only this read-only scan. A later transaction must inspect rebuilt
  // paths afresh, while thousands of sibling links share the same ancestors.
  const stats = new Map(), targets = new Map()
  const cached = (cache, path, read) => {
    const key = process.platform === 'win32' ? path.toLowerCase() : path
    if (!cache.has(key)) cache.set(key, read(path))
    return cache.get(key)
  }
  const infoAt = path => cached(stats, path, path => lstat(path).catch(error => { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error }))
  const targetAt = path => cached(targets, path, readlink)
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (isProfileArchivePath(relative(root, path).replaceAll('\\', '/'))) continue
      if (entry.isSymbolicLink()) links.push({ path, target: await targetAt(path) })
      else if (entry.isDirectory() && !['.plugin-manager', 'root-links', 'link-recovery'].includes(entry.name)) next.push(path)
    }
  }
  let level = [root], next = []
  while (level.length) { next = []; await bounded(level, walk); level = next }
  async function inspect(path) {
    const seen = new Set(), chain = []
    for (let hops = 0; hops < 256; hops++) {
      const disk = parse(path).root, parts = relative(disk, path).split(sep)
      let cursor = disk, redirected = false
      for (let index = 0; index < parts.length; index++) {
        cursor = join(cursor, parts[index])
        const info = await infoAt(cursor)
        if (!info) return { fault: 'dangling', chain, missing: cursor }
        if (!info.isSymbolicLink()) continue
        const key = process.platform === 'win32' ? cursor.toLowerCase() : cursor
        if (seen.has(key)) return { fault: 'cycle', chain }
        seen.add(key)
        const target = resolve(dirname(cursor), await targetAt(cursor))
        chain.push({ path: cursor, target })
        path = resolve(target, ...parts.slice(index + 1))
        redirected = true
        break
      }
      if (!redirected) return { chain }
    }
    return { fault: 'too-many-links', chain }
  }
  const results = new Array(links.length)
  await bounded(links, async (link, index) => {
    const result = await inspect(link.path)
    if (result.fault) results[index] = { path: relative(root, link.path).replaceAll('\\', '/'), target: link.target, ...result }
  })
  return results.filter(Boolean).sort((left, right) => left.path.localeCompare(right.path))
}
