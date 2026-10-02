import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { create } from 'tar'

export async function deterministicArchive(source, destination) {
  const files = []
  async function visit(directory, prefix = '') {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const path = prefix + entry.name
      if (entry.isDirectory()) await visit(join(directory, entry.name), path + '/')
      else if (entry.isFile()) files.push(path)
      else throw new Error('Resource archives require physical regular files: ' + path)
    }
  }
  await visit(source)
  await create({ cwd: source, file: destination, gzip: { mtime: 0 }, portable: true, mtime: new Date(0), noPax: false }, files)
}
