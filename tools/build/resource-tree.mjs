import { lstat, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { digestFile } from './content-store.mjs'

export async function resourceTreeFiles(root, include = () => true) {
  const files = []
  async function visit(path) {
    if (!include(path)) return
    const info = await lstat(path)
    if (info.isSymbolicLink()) throw new Error(`Resource source contains a link: ${path}`)
    if (info.isDirectory()) for (const name of (await readdir(path)).sort()) await visit(join(path, name))
    else if (info.isFile()) files.push({ path: relative(root, path).replaceAll('\\', '/'), size: info.size, sha256: await digestFile(path) })
    else throw new Error(`Resource source contains a special file: ${path}`)
  }
  await visit(root)
  return files
}
