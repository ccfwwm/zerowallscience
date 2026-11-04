import { lstat, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { create } from 'tar'

export async function deterministicArchive(source, destination, include = () => true) {
  const files = []
  const statCache = new Map()
  async function visit(directory, prefix = '') {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const path = prefix + entry.name
      const fullPath = join(directory, entry.name)
      if (!include(fullPath)) continue
      if (entry.isDirectory()) await visit(fullPath, path + '/')
      else if (entry.isFile()) {
        const info = await lstat(fullPath)
        if (!info.isFile()) throw new Error('Resource archives require physical regular files: ' + path)
        // Content-store deduplication can give distinct logical files the same
        // inode. Resource archives must carry each file's bytes, never tar links.
        info.nlink = 1
        const absolute = resolve(fullPath)
        statCache.set(process.platform === 'win32' ? absolute.replaceAll('\\', '/') : absolute, info)
        files.push(path)
      }
      else throw new Error('Resource archives require physical regular files: ' + path)
    }
  }
  await visit(source)
  await create({ cwd: source, file: destination, gzip: { mtime: 0 }, portable: true, mtime: new Date(0), noPax: false, statCache }, files)
}
