import { lstat, readdir, mkdir, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

export async function installerOwnedFiles(root) {
  const files = []
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const local = relative(root, path).replaceAll('\\', '/')
      if (/^Python(?:\/|$)/iu.test(local)) throw new Error('Installer must not own the active Python directory')
      if (entry.isSymbolicLink()) throw new Error('Installer ownership cannot include a linked path')
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) files.push(local)
      else throw new Error('Installer ownership contains a special file')
    }
  }
  await visit(root)
  return [...new Set([...files, 'resources/installer-owned.json'])].sort()
}

export async function writeInstallerOwnership(root) {
  const files = await installerOwnedFiles(root)
  await mkdir(join(root, 'resources'), { recursive: true })
  await writeFile(join(root, 'resources/installer-owned.json'), JSON.stringify({ schema: 1, files }, null, 2) + '\n')
  return files
}
